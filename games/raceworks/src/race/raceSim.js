// The race model (Milestone 6, bible §22.4, §23.3–23.6, §47 "Race determinism"). Pure simulation data — rendering
// only reads it. Every car drives along the track geometry (src/race/trackGeometry.js): a distance s along the lap
// (metres, counting up over the race; the grid starts behind the line at s < 0) and a sideways offset `lat` that is
// always kept inside the legal corridor. Timing segments set each car's target speed from the §23.4 pace formula;
// traffic stops cars driving through each other, and passes happen only in overtake zones.
//
// Determinism: one seeded Rng, fixed steps (RACE.dt) and a fixed car order, so the same seed + entries + laps give
// the same race whether it is watched at any speed (advance by small amounts) or skipped (run()), and a saved state
// carries on exactly (serialize() / load()).
//   const sim = createRaceSim({ track, geo, entries, laps, seed, grid })
//   sim.step() · sim.advance(raceSeconds) · sim.run() · sim.done · sim.t · sim.cars · sim.order() · sim.result()
//   sim.carPose(car, alpha) → { x, y, heading } between the last two steps (for drawing)
//   sim.events → [{ t, kind: 'overtake' | 'failure' | 'retire' | 'contact' | 'finish' | 'start', ids, text }]
// entries: [{ id, name, team, isPlayer, sprite, colour, ratings{…six}, car{SPD…TYR}, crew 0–400, setup 0–1,
//             openFaults, condition }]  (a snapshot taken when the race is created, so nothing can change it later)
import { Rng } from '../../../../core/Rng.js';
import { RACE } from '../../data/race.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// §23.4 paceScore for one entry through one segment (setup comes in with Milestone 7).
export function paceScore(entry, seg, rules = RACE) {
  const p = rules.pace;
  const carFit = Object.entries(seg.demand).reduce((t, [k, w]) => t + w * (entry.car[k] ?? 0), 0) / p.carNorm;
  const driver = (entry.ratings.racecraft * 0.7 + entry.ratings.consistency * 0.3) / p.driverNorm;
  const crew = (entry.crew ?? 0) / p.crewNorm;
  const setup = entry.setup ?? p.setupDefault;
  return p.car * carFit + p.driver * driver + p.crew * crew + p.setup * setup;
}
export function paceMultiplier(score, rules = RACE) {
  const c = rules.paceCurve;
  return clamp(1 - c.slope * (score - c.ref), c.min, c.max);
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
  const maxLat = (s) => geo.at(s).width / 2 - rules.carHalfWidth - rules.edgeMargin;

  let rng;
  const sim = {
    track,
    geo,
    entries,
    laps,
    seed,
    t: 0,
    done: false,
    leaderFinished: false,
    cars: [],
    events: [],
    stepCount: 0,
  };

  function fresh() {
    rng = new Rng(`race:${seed}`);
    sim.t = 0;
    sim.done = false;
    sim.leaderFinished = false;
    sim.events = [];
    sim.stepCount = 0;
    const g = track.grid;
    sim.cars = order.map((id, i) => {
      const s = -(g.firstGap + i * g.rowGap);
      const lat = (i % 2 ? 1 : -1) * g.lateral;
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
      };
    });
  }

  const log = (kind, ids, text) => sim.events.push({ t: Math.round(sim.t * 100) / 100, kind, ids, text });
  const nameOf = (id) => byId[id].name;
  const zoneAt = (s) => zones.find((z) => geo.inZone(s, z)) ?? null;

  // Variance width for this driver (bible §23.4: Consistency narrows it, never to zero).
  const varWidth = (e) => {
    const v = rules.variance;
    return (v.maxPct / 100) * clamp(1 - e.ratings.consistency / v.consistencyFull, v.minShare, 1);
  };

  function enterSegment(c, k) {
    const e = byId[c.id];
    c.seg = k;
    const u = rng.range(-1, 1) * varWidth(e);
    let time = base[c.id][k] * (1 + u) * (1 + c.damagePct / 100);
    if (c.failLapsLeft > 0) time *= 1 + c.failPct / 100;
    c.segSpeed = (segs[k].toS - segs[k].fromS) / time;
  }

  // The car physically ahead on the road (any lap) and the gap to it, ignoring finished / retired cars.
  // skipId: the car being overtaken right now (it is alongside, so the next car beyond it is the one that counts).
  function ahead(c, skipId = null) {
    let best = null;
    let gap = Infinity;
    for (const o of sim.cars) {
      if (o === c || o.retired || o.finished || o.id === skipId) continue;
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
    const chance = clamp(r.base + paceAdv * r.pacePer1Pct + ((me.ratings.racecraft - them.ratings.racecraft) / 100) * r.racecraftPer100 - zone.difficulty * r.difficulty, r.min, r.max);
    if (rng.chance(chance)) {
      c.ot = { target: o.id, side: o.lat >= c.laneBias ? -1 : 1, until: sim.t + 10 };
      return true;
    }
    c.slowUntil = sim.t + r.failSlowSecs;
    c.slowPct = r.failSlowPct;
    if (rng.chance(r.contactChance)) {
      for (const x of [c, o]) {
        x.slowUntil = sim.t + r.contactSlowSecs;
        x.slowPct = r.failSlowPct * 2;
        x.contacts++;
      }
      log('contact', [c.id, o.id], `Contact: ${nameOf(c.id)} and ${nameOf(o.id)}`);
    }
    return false;
  }

  // A lap done: failure roll (bible §23.6, mild).
  function lapFailureRoll(c) {
    const e = byId[c.id];
    const f = rules.failure;
    let p = f.basePerLap * (1 + Math.max(0, f.relRef - (e.car.REL ?? f.relRef)) / f.relSpan) * (1 + (e.openFaults ?? 0) * f.perOpenFault);
    if ((e.condition ?? 100) < f.lowConditionBelow) p *= f.lowConditionX;
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
      if (!sim.leaderFinished) {
        sim.leaderFinished = true;
        log('finish', [c.id], `${nameOf(c.id)} wins`);
      }
      return;
    }
    lapFailureRoll(c);
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
        c.lat += ((Math.sign(c.lat || 1) * maxLat(c.s)) - c.lat) * Math.min(1, dt); // pull over to the edge
        continue;
      }
      if (sim.t < c.launchAt) continue;
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
          const lapping = c.s - a.car.s > L / 2; // the car ahead is a lap down: it lets us by
          const passing = lapping;
          const sg = segs[k];
          if (a.gap >= tr.draftRange[0] && a.gap <= tr.draftRange[1] && sg.kind === 'straight') desired *= 1 + tr.draftPct / 100;
          if (!passing && a.gap < tr.attemptGap) {
            const zone = zoneAt(c.s);
            if (zone && tryOvertake(c, a.car, zone)) {
              // passing now: not blocked by it
            } else {
              blocker = a.car;
              if (a.gap < tr.minGap) desired = Math.min(desired, a.car.v * (a.gap < tr.minGap * 0.6 ? 0.97 : 1));
            }
          } else if (!passing) blocker = a.car;
          if (lapping && !c.ot) c.ot = { target: a.car.id, side: a.car.lat >= c.laneBias ? -1 : 1, until: sim.t + 10 };
        }
      }
      c.v = c.v < desired ? Math.min(desired, c.v + rules.accel * dt) : desired;
      const before = c.s;
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
      c.s += move;
      // sideways: lane bias, plus the passing side while overtaking; always inside the corridor
      const m = maxLat(c.s);
      const want = c.finished ? m * 0.85 : c.laneBias + (c.ot ? c.ot.side * rules.overtake.laneOffset : 0); // finished: off the line
      c.lat += (want - c.lat) * Math.min(1, rules.laneSpeed * dt);
      c.lat = clamp(c.lat, -m, m);
      // the line
      if (!c.finished) {
        const kBefore = before >= 0 ? Math.floor(before / L) : -1;
        const kNow = c.s >= 0 ? Math.floor(c.s / L) : -1;
        if (kNow > kBefore) {
          const lineS = kNow * L;
          const crossT = sim.t - (c.s - lineS) / Math.max(0.01, c.v);
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

  // Advance the race clock by raceSeconds (whole steps; the remainder waits for the next call).
  let carry = 0;
  sim.advance = function advance(raceSeconds) {
    carry += raceSeconds;
    let n = 0;
    while (carry >= rules.dt && !sim.done) {
      sim.step();
      carry -= rules.dt;
      n++;
    }
    if (sim.done) carry = 0;
    return n;
  };
  sim.alpha = () => carry / rules.dt; // how far into the next step the drawing is
  sim.run = function run() {
    while (!sim.done) sim.step();
    return sim.result();
  };

  // Where to draw a car: between its last two steps.
  sim.carPose = function carPose(c, alpha = 1) {
    const s = c.prevS + (c.s - c.prevS) * alpha;
    const lat = c.prevLat + (c.lat - c.prevLat) * alpha;
    return geo.pointAt(s, lat);
  };

  // Running order now: finished cars by laps then finish time, then the rest by distance, retired last.
  sim.order = function orderNow() {
    const key = (c) => (c.retired ? 0 : c.finished ? 2 : 1);
    return [...sim.cars].sort((a, b) => {
      if (key(a) !== key(b)) return key(b) - key(a);
      if (a.finished && b.finished) return b.lapsDone - a.lapsDone || a.finishT - b.finishT;
      if (a.retired && b.retired) return b.s - a.s;
      return b.s - a.s;
    });
  };

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
        };
      }),
    };
  };

  sim.serialize = () => ({ t: sim.t, done: sim.done, leaderFinished: sim.leaderFinished, rng: rng.getState(), stepCount: sim.stepCount, carry, cars: JSON.parse(JSON.stringify(sim.cars)), events: sim.events.slice() });
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
    return sim;
  };
  sim.byId = byId;
  sim.car = (id) => sim.cars.find((c) => c.id === id);
  fresh();
  return sim;
}
