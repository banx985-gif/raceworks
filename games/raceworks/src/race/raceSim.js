// The race model (Milestones 6–7, bible §22.3–22.4, §23.3–23.6, §24, §47 "Race determinism"). Pure simulation
// data — rendering only reads it. Every car drives along the track geometry (src/race/trackGeometry.js): a distance
// s along the lap (metres, counting up over the race; the grid starts behind the line at s < 0) and a sideways
// offset `lat` that always stays inside the legal corridor. Timing segments set each car's target speed from the
// §23.4 pace formula; traffic stops cars driving through each other, and passes happen only in overtake zones.
// Milestone 7: tyres wear (compound, pace, Tyre Care, the car's TYR), Pace (Conserve / Normal / Push) and Order
// (Defend / Neutral / Attack), pit stops on the pit spline (service, new tyres), and Auto Strategy — the crew's
// choices for every car on Auto (rivals always; the player until they switch it off, bible §24.1–24.3).
//
// Determinism: one seeded Rng, fixed steps (RACE.dt), a fixed car order, and the player's commands recorded with the
// step they happened on — so the same seed + entries + commands give the same race whether watched at any speed or
// skipped, and a saved state carries on exactly (serialize() / load()).
//   const sim = createRaceSim({ track, geo, entries, laps, seed, grid })
//   sim.step() · sim.advance(raceSeconds) · sim.run() · sim.done · sim.t · sim.cars · sim.order() · sim.result()
//   sim.command(carId, type, value) — 'pace' conserve|normal|push · 'order' defend|neutral|attack · 'auto' true|false ·
//     'pit' <tyre id> (Pit Now at the next pit entry) · 'pitCancel'   → true if accepted (Auto can't change mid-pit)
//   sim.carPose(car, alpha, latScale) → { x, y, heading } between the last two steps (for drawing)
//   sim.gapAhead(car) / sim.gapBehind(car) → seconds to the car in front / behind in the running order
//   sim.events → [{ t, kind, ids, text }]   sim.commands → [{ step, id, type, value }]
// entries: [{ id, name, team, isPlayer, sprite, colour, ratings{…six}, car{SPD…TYR}, crew 0–400, setup 0–1,
//             tyre (start compound), openFaults, condition, pitService (seconds) }] — a snapshot taken when the race
//             is created, so nothing can change it later.
import { Rng } from '../../../../core/Rng.js';
import { RACE, TYRES, TYRE_WEAR, PACE_MODES, ORDERS, PIT, AUTO, WEEKEND } from '../../data/race.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// §23.4 paceScore for one entry through one segment. mode 'quali' uses the Qualifying rating (§22.3).
export function paceScore(entry, seg, rules = RACE, mode = 'race') {
  const p = rules.pace;
  const carFit = Object.entries(seg.demand).reduce((t, [k, w]) => t + w * (entry.car[k] ?? 0), 0) / p.carNorm;
  const r = entry.ratings;
  const q = WEEKEND.quali;
  const driverRating = mode === 'quali' ? r.qualifying * q.driverQualifying + r.consistency * q.driverConsistency : r.racecraft * 0.7 + r.consistency * 0.3;
  const driver = driverRating / p.driverNorm;
  const crew = (entry.crew ?? 0) / p.crewNorm;
  const setup = entry.setup ?? p.setupDefault;
  return p.car * carFit + p.driver * driver + p.crew * crew + p.setup * setup;
}
export function paceMultiplier(score, rules = RACE) {
  const c = rules.paceCurve;
  return clamp(1 - c.slope * (score - c.ref), c.min, c.max);
}
// Time multiplier for a tyre at this wear (fresh = its compound pace only).
export function tyreFactor(tyre, wear) {
  const w = TYRE_WEAR;
  const t = TYRES[tyre] ?? TYRES.medium;
  return (1 + t.pace) * (1 + w.wearPace * wear + w.cliffPace * Math.max(0, wear - w.cliff));
}
// Share of a tyre used per lap for this entry at Normal pace.
export function wearPerLap(entry, tyre) {
  const w = TYRE_WEAR;
  const base = (TYRES[tyre] ?? TYRES.medium).wearPerLap;
  const care = 1 - ((entry.ratings.tyreCare - w.tyreCareRef) / 10) * w.tyreCarePer10;
  const stat = 1 - (((entry.car.TYR ?? w.tyreStatRef) - w.tyreStatRef) / 15) * w.tyreStatPer15;
  return base * clamp(care, 0.6, 1.4) * clamp(stat, 0.6, 1.4);
}

// Qualifying (§22.3): one flying lap each on the starting tyre, seeded bounded variance. → rows fastest first.
export function runQualifying({ geo, entries, seed, rules = RACE }) {
  const rng = new Rng(`quali:${seed}`);
  const v = rules.variance;
  const rows = entries.map((e) => {
    const width = (v.maxPct / 100) * clamp(1 - e.ratings.consistency / v.consistencyFull, v.minShare, 1);
    let time = 0;
    for (const sg of geo.segments) time += ((sg.toS - sg.fromS) / sg.refSpeed) * paceMultiplier(paceScore(e, sg, rules, 'quali'), rules) * (1 + rng.range(-1, 1) * width);
    time *= tyreFactor(e.tyre ?? 'medium', 0);
    return { id: e.id, name: e.name, team: e.team, isPlayer: !!e.isPlayer, tyre: e.tyre ?? 'medium', time: Math.round(time * 1000) / 1000 };
  });
  rows.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  rows.forEach((r, i) => (r.pos = i + 1));
  return rows;
}

export function createRaceSim({ track, geo, entries, laps, seed, grid = null, rules = RACE }) {
  const L = geo.length;
  const segs = geo.segments;
  const zones = (track.overtakeZones ?? []).map((z) => ({ ...z }));
  const order = grid ?? entries.map((e) => e.id);
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  // Base time per entry per segment (without variance): segment length / reference speed × pace curve.
  const base = {};
  for (const e of entries) base[e.id] = segs.map((sg) => ((sg.toS - sg.fromS) / sg.refSpeed) * paceMultiplier(paceScore(e, sg, rules), rules));
  const baseLap = {};
  for (const e of entries) baseLap[e.id] = base[e.id].reduce((t, x) => t + x, 0);
  const maxLat = (s) => geo.at(s).width / 2 - rules.carHalfWidth - rules.edgeMargin;
  const pit = geo.pit;
  const pitSpan = pit ? geo.wrap(pit.exitS - pit.entryS) : 0; // main-track distance the pit lane replaces

  let rng;
  const sim = { track, geo, entries, laps, seed, t: 0, done: false, leaderFinished: false, cars: [], events: [], commands: [], stepCount: 0 };

  function fresh() {
    rng = new Rng(`race:${seed}`);
    sim.t = 0;
    sim.done = false;
    sim.leaderFinished = false;
    sim.events = [];
    sim.commands = [];
    sim.stepCount = 0;
    const g = track.grid;
    sim.cars = order.map((id, i) => {
      const s = -(g.firstGap + i * g.rowGap);
      const lat = (i % 2 ? 1 : -1) * g.lateral;
      const e = byId[id];
      return {
        id,
        s,
        prevS: s,
        v: 0,
        lat,
        prevLat: lat,
        laneBias: rng.range(-1, 1) * rules.laneBias,
        launchAt: rules.startLights + rules.launchDelay.min + rng.next() * rules.launchDelay.spread,
        seg: -1,
        segSpeed: 0,
        lapsDone: -1, // −1 until the car first crosses the line (the start of lap 1)
        lapStartT: null,
        lapTimes: [],
        best: null,
        finished: false,
        finishT: null,
        retired: false,
        retireT: null,
        slowUntil: 0,
        slowPct: 0,
        damagePct: 0, // lasting pace loss from a failure
        failLapsLeft: 0,
        failPct: 0,
        ot: null, // { target, side, until }
        tried: {}, // target id → zone pass key (one attempt per pair per zone pass)
        fails: [],
        contacts: 0,
        grid: i + 1,
        // Milestone 7
        tyre: e.tyre ?? 'medium',
        wear: 0,
        stints: [{ tyre: e.tyre ?? 'medium', fromLap: 1 }],
        pace: 'normal',
        order: 'neutral',
        auto: e.isPlayer ? e.auto !== false : true,
        pitReq: null, // { tyre, by: 'auto' | 'player' }
        pit: null, // { p, entryAbs, exitAbs, served, stopUntil, next }
        stops: 0,
        pitLat: 0,
      };
    });
  }

  const log = (kind, ids, text) => sim.events.push({ t: Math.round(sim.t * 100) / 100, kind, ids, text });
  const nameOf = (id) => byId[id].name;
  const zoneAt = (s) => zones.find((z) => geo.inZone(s, z)) ?? null;
  const lapsLeft = (c) => laps - Math.max(0, c.s) / L; // race distance still to go, in laps
  const wearRate = (c) => wearPerLap(byId[c.id], c.tyre) * PACE_MODES[c.pace].wear * ORDERS[c.order].wear;

  // Variance width for this driver (bible §23.4: Consistency narrows it, never to zero).
  const varWidth = (e) => {
    const v = rules.variance;
    return (v.maxPct / 100) * clamp(1 - e.ratings.consistency / v.consistencyFull, v.minShare, 1);
  };

  function enterSegment(c, k) {
    const e = byId[c.id];
    c.seg = k;
    if (c.auto) autoDecide(c);
    const u = rng.range(-1, 1) * varWidth(e);
    let time = base[c.id][k] * (1 + u) * (1 + c.damagePct / 100);
    if (c.failLapsLeft > 0) time *= 1 + c.failPct / 100;
    time *= tyreFactor(c.tyre, c.wear) * (1 + PACE_MODES[c.pace].time) * (1 + ORDERS[c.order].time);
    c.segSpeed = (segs[k].toS - segs[k].fromS) / time;
  }

  // The crew's choices for a car on Auto (bible §24.1): pace, order and when to pit — decided at each segment.
  function autoDecide(c) {
    const left = lapsLeft(c);
    const rate = wearRate(c) / PACE_MODES[c.pace].wear / ORDERS[c.order].wear; // at Normal / Neutral
    const ahead = sim.gapAhead(c);
    const behind = sim.gapBehind(c);
    // pit: stop at the next pit entry if the tyres would pass the limit before the one after
    if (pit && !c.pitReq && !c.pit) {
      const toEntry = geo.wrap(pit.entryS - geo.wrap(c.s)) / L;
      const leftAtEntry = left - toEntry;
      if (c.wear + rate * (toEntry + 1) > AUTO.pitWear && leftAtEntry >= AUTO.minLapsLeftToPit) {
        c.pitReq = { tyre: leftAtEntry - 1 > AUTO.shortRunLaps ? AUTO.nextTyreLongRun : 'soft', by: 'auto' };
      }
    }
    // pace
    let pace = 'normal';
    if (left <= AUTO.pushLastLaps && ahead !== null && ahead < AUTO.pushGap && c.wear < AUTO.pushMaxWear) pace = 'push';
    // Conserve only to reach the flag when it is too late for a stop (earlier, the crew stops instead).
    else if (!c.pitReq && left < AUTO.minLapsLeftToPit + 1 && left > 0.5 && c.wear + rate * left > AUTO.conserveEndWear) pace = 'conserve';
    c.pace = pace;
    // order
    let ord = 'neutral';
    if (left <= AUTO.attackLastLaps) {
      if (ahead !== null && ahead < AUTO.attackGap) ord = 'attack';
      else if (behind !== null && behind < AUTO.defendGap) ord = 'defend';
    }
    c.order = ord;
  }

  // The car physically ahead on the road (any lap), ignoring finished / retired / pitting cars.
  // skipId: the car being overtaken right now (it is alongside, so the next car beyond it is the one that counts).
  function ahead(c, skipId = null) {
    let best = null;
    let gap = Infinity;
    for (const o of sim.cars) {
      if (o === c || o.retired || o.finished || o.pit || o.id === skipId) continue;
      const g = geo.wrap(o.s - c.s);
      if (g > 0 && g < gap) {
        gap = g;
        best = o;
      }
    }
    return best ? { car: best, gap } : null;
  }

  function tryOvertake(c, o, zone) {
    const key = `${zone.id}:${Math.floor(c.s / L)}`;
    if (c.tried[o.id] === key) return false;
    c.tried[o.id] = key;
    const r = rules.overtake;
    const me = byId[c.id];
    const them = byId[o.id];
    const paceAdv = (c.segSpeed / Math.max(1, o.segSpeed) - 1) * 100;
    let chance = r.base + paceAdv * r.pacePer1Pct + ((me.ratings.racecraft - them.ratings.racecraft) / 100) * r.racecraftPer100 - zone.difficulty * r.difficulty;
    chance += ORDERS[c.order].chancePlus - ORDERS[o.order].defendMinus;
    if (rng.chance(clamp(chance, r.min, r.max))) {
      c.ot = { target: o.id, side: o.lat >= c.laneBias ? -1 : 1, until: sim.t + 10 };
      log('overtake', [c.id, o.id], `${nameOf(c.id)} passes ${nameOf(o.id)}`);
      return true;
    }
    c.slowUntil = sim.t + r.failSlowSecs;
    c.slowPct = r.failSlowPct;
    if (rng.chance(r.contactChance * ORDERS[c.order].contactX)) {
      for (const x of [c, o]) {
        x.slowUntil = sim.t + r.contactSlowSecs;
        x.slowPct = r.failSlowPct * 2;
        x.contacts++;
      }
      log('contact', [c.id, o.id], `Contact: ${nameOf(c.id)} and ${nameOf(o.id)}`);
    }
    return false;
  }

  // A lap done: failure roll (bible §23.6, mild; Push raises it, Conserve lowers it).
  function lapFailureRoll(c) {
    const e = byId[c.id];
    const f = rules.failure;
    let p = f.basePerLap * (1 + Math.max(0, f.relRef - (e.car.REL ?? f.relRef)) / f.relSpan) * (1 + (e.openFaults ?? 0) * f.perOpenFault);
    if ((e.condition ?? 100) < f.lowConditionBelow) p *= f.lowConditionX;
    p *= PACE_MODES[c.pace].failure;
    if (!rng.chance(p)) return;
    const roll = rng.next();
    if (roll < f.share.paceLoss) {
      c.failLapsLeft = f.paceLossLaps;
      c.failPct = f.paceLossPct;
      c.fails.push('paceLoss');
      log('failure', [c.id], `${nameOf(c.id)}: engine hiccup, losing pace`);
    } else if (roll < f.share.paceLoss + f.share.damage) {
      c.damagePct += f.damagePct;
      c.fails.push('damage');
      log('failure', [c.id], `${nameOf(c.id)}: component damage`);
    } else {
      c.retired = true;
      c.retireT = sim.t;
      c.pit = null;
      c.fails.push('retire');
      log('retire', [c.id], `${nameOf(c.id)} retires: mechanical failure`);
    }
  }

  function crossLine(c, k, crossT) {
    c.lapsDone = k;
    if (k === 0) {
      c.lapStartT = crossT;
      return;
    }
    const lt = crossT - c.lapStartT;
    c.lapTimes.push(Math.round(lt * 1000) / 1000);
    if (c.best === null || lt < c.best) c.best = lt;
    c.lapStartT = crossT;
    if (c.failLapsLeft > 0) c.failLapsLeft--;
    if (k >= laps || sim.leaderFinished) {
      c.finished = true;
      c.finishT = crossT;
      c.pitReq = null;
      if (!sim.leaderFinished) {
        sim.leaderFinished = true;
        log('finish', [c.id], `${nameOf(c.id)} wins`);
      }
      return;
    }
    lapFailureRoll(c);
  }

  function serviceTime(c) {
    return byId[c.id].pitService ?? PIT.service.base;
  }

  // One step for a car in the pit lane: limit speed, stop at the box, new tyres, rejoin at the exit.
  function stepPit(c, dt) {
    const P = c.pit;
    const boxP = pit.length * PIT.boxAt;
    if (!P.served && P.p >= boxP) {
      P.served = true;
      P.stopUntil = sim.t + serviceTime(c);
      c.v = 0;
      c.tyre = P.next;
      c.wear = 0;
      c.stops++;
      c.stints.push({ tyre: P.next, fromLap: Math.min(laps, c.lapsDone + 1) });
      log('pit', [c.id], `${nameOf(c.id)} pits: ${TYRES[P.next].name} tyres`);
    }
    if (sim.t < P.stopUntil) {
      c.v = 0;
    } else {
      const target = PIT.laneSpeed;
      c.v = c.v < target ? Math.min(target, c.v + rules.accel * dt) : target;
      P.p += c.v * dt;
    }
    const before = c.s;
    c.s = P.entryAbs + (Math.min(P.p, pit.length) / pit.length) * (P.exitAbs - P.entryAbs);
    if (P.p >= pit.length) {
      c.s = P.exitAbs + (P.p - pit.length);
      c.pit = null;
      c.pitReq = null;
      c.lat = maxLat(c.s) * 0.8; // rejoin on the pit side, then drift back to the racing line
      c.seg = -1;
    }
    return before;
  }

  sim.step = function step() {
    if (sim.done) return;
    const dt = rules.dt;
    sim.t += dt;
    sim.stepCount++;
    if (sim.t >= rules.startLights && sim.t - dt < rules.startLights) log('start', [], 'Lights out');
    for (const c of sim.cars) {
      c.prevS = c.s;
      c.prevLat = c.lat;
      if (c.retired) {
        c.v = Math.max(0, c.v - rules.accel * 2 * dt);
        c.s += c.v * dt;
        c.lat += (Math.sign(c.lat || 1) * maxLat(c.s) - c.lat) * Math.min(1, dt); // pull over to the edge
        continue;
      }
      if (sim.t < c.launchAt) continue;
      let before;
      if (c.pit) {
        before = stepPit(c, dt);
      } else {
        const k = geo.segmentAt(c.s);
        if (k !== c.seg) enterSegment(c, k);
        let desired = c.segSpeed;
        if (c.finished) desired *= 0.6; // slowing-down lap
        if (sim.t < c.slowUntil) desired *= 1 - c.slowPct / 100;
        // traffic
        let blocker = null; // the car ahead this one may not pass right now
        if (!c.finished) {
          if (c.ot && (sim.cars.find((x) => x.id === c.ot.target)?.s + rules.overtake.passMargin < c.s || sim.t > c.ot.until)) c.ot = null;
          const a = ahead(c, c.ot?.target);
          if (a) {
            const tr = rules.traffic;
            const passing = c.s - a.car.s > L / 2; // the car ahead is a lap down: it lets us by
            const sg = segs[k];
            if (a.gap >= tr.draftRange[0] && a.gap <= tr.draftRange[1] && sg.kind === 'straight') desired *= 1 + tr.draftPct / 100;
            if (!passing && a.gap < tr.attemptGap + ORDERS[c.order].attemptGapPlus) {
              const zone = zoneAt(c.s);
              if (zone && tryOvertake(c, a.car, zone)) {
                // passing now: not blocked by it
              } else {
                blocker = a.car;
                if (a.gap < tr.minGap) desired = Math.min(desired, a.car.v * (a.gap < tr.minGap * 0.6 ? 0.97 : 1));
              }
            } else if (!passing) blocker = a.car;
            if (passing && !c.ot) c.ot = { target: a.car.id, side: a.car.lat >= c.laneBias ? -1 : 1, until: sim.t + 10 };
          }
        }
        c.v = c.v < desired ? Math.min(desired, c.v + rules.accel * dt) : desired;
        before = c.s;
        let move = c.v * dt;
        // Hard spacing: a car that is not passing never closes to less than hardGap behind the car ahead (whatever
        // order the cars moved in this step), so nobody drives through anyone outside an overtake.
        if (blocker) {
          const room = Math.max(0, geo.wrap(blocker.s - c.s) - rules.traffic.hardGap);
          if (move > room) {
            move = room;
            c.v = Math.min(c.v, move / dt);
          }
        }
        // tyre wear (bible §21) for the distance driven
        if (!c.finished) c.wear = Math.min(TYRE_WEAR.max, c.wear + (move / L) * wearRate(c));
        // into the pit lane at the pit entry, if a stop is called
        if (pit && c.pitReq && !c.finished) {
          const from = geo.wrap(c.s);
          const to = from + move;
          const entry = pit.entryS < from ? pit.entryS + L : pit.entryS;
          if (to >= entry && lapsLeft(c) > 0.3) {
            const entryAbs = c.s + (entry - from);
            c.pit = { p: to - entry, entryAbs, exitAbs: entryAbs + pitSpan, served: false, stopUntil: 0, next: c.pitReq.tyre };
            c.ot = null;
            c.v = Math.min(c.v, PIT.laneSpeed * 1.5);
          }
        }
        if (c.pit) {
          c.s = c.pit.entryAbs + (c.pit.p / pit.length) * pitSpan;
        } else {
          c.s += move;
          // sideways: lane bias, plus the passing side while overtaking; always inside the corridor
          const m = maxLat(c.s);
          const want = c.finished ? m * 0.85 : c.laneBias + (c.ot ? c.ot.side * rules.overtake.laneOffset : 0); // finished: off the line
          c.lat += (want - c.lat) * Math.min(1, rules.laneSpeed * dt);
          c.lat = clamp(c.lat, -m, m);
        }
      }
      // the line
      if (!c.finished) {
        const kBefore = before >= 0 ? Math.floor(before / L) : -1;
        const kNow = c.s >= 0 ? Math.floor(c.s / L) : -1;
        if (kNow > kBefore) {
          const lineS = kNow * L;
          const crossT = sim.t - (c.s - lineS) / Math.max(0.01, c.pit ? PIT.laneSpeed * (pitSpan / pit.length) : c.v);
          crossLine(c, kNow, crossT);
        }
      }
    }
    const running = sim.cars.filter((c) => !c.finished && !c.retired);
    if (!running.length || sim.t > laps * 400) {
      sim.done = true;
      for (const c of running) c.timedOut = true;
    }
  };

  // --- the player's commands (bible §24.2), recorded with their step so a replay is exact ---------------------------
  sim.command = function command(id, type, value) {
    const c = sim.car(id);
    if (!c || c.finished || c.retired || sim.done) return false;
    if (type === 'auto') {
      if (c.pit) return false; // not during a pit stop (§24.3)
      c.auto = !!value;
    } else if (type === 'pace' && PACE_MODES[value]) {
      if (c.auto) return false;
      c.pace = value;
    } else if (type === 'order' && ORDERS[value]) {
      if (c.auto) return false;
      c.order = value;
    } else if (type === 'pit' && TYRES[value]?.unlocked) {
      if (c.auto || c.pit) return false;
      c.pitReq = { tyre: value, by: 'player' };
    } else if (type === 'pitCancel') {
      if (c.auto || c.pit) return false;
      c.pitReq = null;
    } else return false;
    c.seg = -1; // the new choice counts from now
    sim.commands.push({ step: sim.stepCount, id, type, value });
    return true;
  };

  // Advance the race clock by raceSeconds (whole steps; the remainder waits for the next call).
  let carry = 0;
  sim.advance = function advance(raceSeconds, { stopAt = null } = {}) {
    carry += raceSeconds;
    let n = 0;
    while (carry >= rules.dt && !sim.done) {
      sim.step();
      carry -= rules.dt;
      n++;
      if (stopAt && stopAt()) {
        carry = 0;
        break;
      }
    }
    if (sim.done) carry = 0;
    return n;
  };
  sim.alpha = () => carry / rules.dt; // how far into the next step the drawing is
  sim.run = function run() {
    while (!sim.done) sim.step();
    return sim.result();
  };
  // Replay: run to the end applying recorded commands at their steps (tests).
  sim.runWith = function runWith(commands = []) {
    const todo = [...commands].sort((a, b) => a.step - b.step);
    let i = 0;
    while (!sim.done) {
      while (i < todo.length && todo[i].step <= sim.stepCount) {
        const k = todo[i++];
        sim.command(k.id, k.type, k.value);
      }
      sim.step();
    }
    return sim.result();
  };

  // Where to draw a car: between its last two steps. latScale widens the sideways offset to match a road drawn wider.
  sim.carPose = function carPose(c, alpha = 1, latScale = 1) {
    if (c.pit && pit) {
      const p = pit.at(Math.min(pit.length, c.pit.p));
      return { x: p.x, y: p.y, heading: p.heading, inPit: true };
    }
    let a = alpha;
    if (c.prevS > c.s + 1) a = 1; // just rejoined from the pit lane
    const s = c.prevS + (c.s - c.prevS) * a;
    const lat = c.prevLat + (c.lat - c.prevLat) * a;
    return geo.pointAt(s, lat * latScale);
  };

  // Running order now: finished cars by laps then finish time, then the rest by distance, retired last.
  sim.order = function orderNow() {
    const key = (c) => (c.retired ? 0 : c.finished ? 2 : 1);
    return [...sim.cars].sort((a, b) => {
      if (key(a) !== key(b)) return key(b) - key(a);
      if (a.finished && b.finished) return b.lapsDone - a.lapsDone || a.finishT - b.finishT;
      return b.s - a.s;
    });
  };
  const secs = (dist, c) => dist / Math.max(15, c.v || c.segSpeed || 40);
  sim.gapAhead = (c) => {
    const ord = sim.order();
    const i = ord.indexOf(c);
    if (i <= 0 || ord[i - 1].retired || c.retired) return null;
    return secs(ord[i - 1].s - c.s, c);
  };
  sim.gapBehind = (c) => {
    const ord = sim.order();
    const i = ord.indexOf(c);
    const b = ord[i + 1];
    if (!b || b.retired || c.retired) return null;
    return secs(c.s - b.s, b);
  };
  sim.lapOf = (c) => Math.max(1, Math.min(laps, c.lapsDone + 1));

  sim.result = function result() {
    const ord = sim.order();
    const winner = ord[0];
    const fastest = sim.cars.filter((c) => c.best !== null).sort((a, b) => a.best - b.best)[0] ?? null;
    return {
      seed,
      laps,
      trackId: track.id,
      done: sim.done,
      fastestLap: fastest ? { id: fastest.id, time: Math.round(fastest.best * 1000) / 1000 } : null,
      rows: ord.map((c, i) => {
        const e = byId[c.id];
        let status = 'finished';
        let gap = '';
        if (c.retired) {
          status = 'retired';
          gap = 'DNF';
        } else if (!c.finished) {
          status = 'running';
        } else if (c.lapsDone < winner.lapsDone) {
          const d = winner.lapsDone - c.lapsDone;
          status = 'lapped';
          gap = `+${d} lap${d === 1 ? '' : 's'}`;
        } else if (i > 0) gap = `+${(c.finishT - winner.finishT).toFixed(3)}`;
        return {
          pos: i + 1,
          id: c.id,
          name: e.name,
          team: e.team,
          isPlayer: !!e.isPlayer,
          grid: c.grid,
          laps: Math.max(0, c.lapsDone),
          time: c.finished ? Math.round((c.finishT - rules.startLights) * 1000) / 1000 : null,
          gap,
          best: c.best === null ? null : Math.round(c.best * 1000) / 1000,
          status,
          fails: [...c.fails],
          contacts: c.contacts,
          stops: c.stops,
          stints: c.stints.map((x) => x.tyre),
          wear: Math.round(c.wear * 100),
        };
      }),
    };
  };

  sim.serialize = () => ({ t: sim.t, done: sim.done, leaderFinished: sim.leaderFinished, rng: rng.getState(), stepCount: sim.stepCount, carry, cars: JSON.parse(JSON.stringify(sim.cars)), events: sim.events.slice(), commands: sim.commands.map((x) => ({ ...x })) });
  sim.load = (s) => {
    fresh();
    if (!s) return sim;
    sim.t = s.t;
    sim.done = s.done;
    sim.leaderFinished = s.leaderFinished;
    rng.setState(s.rng);
    sim.stepCount = s.stepCount;
    carry = s.carry ?? 0;
    sim.cars = JSON.parse(JSON.stringify(s.cars));
    sim.events = s.events.slice();
    sim.commands = (s.commands ?? []).map((x) => ({ ...x }));
    return sim;
  };
  sim.byId = byId;
  sim.baseLap = baseLap;
  sim.car = (id) => sim.cars.find((c) => c.id === id);
  sim.wearRate = wearRate;
  fresh();
  return sim;
}
