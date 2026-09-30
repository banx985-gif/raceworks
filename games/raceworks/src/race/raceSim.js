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
//             tyre (start compound), openFaults, condition, pitService (seconds), tyreWearMult?, failureMult?,
//             fuel? (Milestone 15: 'lean' | 'normal' | 'rich', data/race.js FUEL — race pace, tyre wear, failures) }] — a
//             snapshot taken when the race is created, so nothing can change it later.
import { Rng } from '../../../../core/Rng.js';
import { RACE, TYRES, TYRE_WEAR, PACE_MODES, ORDERS, PIT, AUTO, WEEKEND, FUEL, STRATEGY, PIT_REPAIR, FAILURE_RISK } from '../../data/race.js';
import { tyreFactor, planStrategy, rivalProfile, strategyProfile, suggestTyreFor } from '../systems/raceStrategy.js';

export { tyreFactor };

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
// Milestone 15: the entry's fuel / energy target (Normal when it has none).
export const fuelOf = (entry) => FUEL[entry?.fuel] ?? FUEL.normal;

// Share of a tyre used per lap for this entry at Normal pace.
export function wearPerLap(entry, tyre) {
  const w = TYRE_WEAR;
  const base = (TYRES[tyre] ?? TYRES.medium).wearPerLap;
  const care = 1 - ((entry.ratings.tyreCare - w.tyreCareRef) / 10) * w.tyreCarePer10;
  const stat = 1 - (((entry.car.TYR ?? w.tyreStatRef) - w.tyreStatRef) / 15) * w.tyreStatPer15;
  return base * clamp(care, 0.6, 1.4) * clamp(stat, 0.6, 1.4) * (entry.tyreWearMult ?? 1); // Milestone 10: tyre prep (facilities)
}

// Milestone 15: the weather's effect on a tyre (§22.3 "weather"). Real weather arrives in Milestone 17; until then every
// session is 'dry' and a tyre runs at its own dry pace (data/race.js TYRES), so this is 1.
export function weatherPace(tyre, weather = 'dry') {
  void tyre;
  void weather;
  return 1;
}

// The chance of a mechanical failure on one lap (bible §23.6, mild): the car's REL, open faults, a Condition under
// lowConditionBelow, the pace mode, the race crew's traits and a skipped repair (entry.failureMult), and the fuel target.
export function failureChance(e, paceId = 'normal', rules = RACE) {
  const f = rules.failure;
  let p = f.basePerLap * (1 + Math.max(0, f.relRef - (e.car.REL ?? f.relRef)) / f.relSpan) * (1 + (e.openFaults ?? 0) * f.perOpenFault);
  if ((e.condition ?? 100) < f.lowConditionBelow) p *= f.lowConditionX;
  p *= PACE_MODES[paceId].failure;
  p *= e.failureMult ?? 1; // Milestone 13: the race crew's reliability traits (1 = none); Milestone 15: a skipped repair
  p *= fuelOf(e).failure; // Milestone 15: the fuel / energy target
  return p;
}

// Milestone 16: the one failure risk for a car this lap (bible §23.6): the entry's risk (REL, open faults, Condition,
// traits / facilities, a skipped repair) at the car's own pace and fuel now, × heat (Push usage builds it), × race damage,
// × race length (the share of the race run), never above FAILURE_RISK.maxPerLap. car: { pace, fuel, heat, damagePct }.
export function failureRisk(e, car = {}, share = 0, rules = RACE) {
  const F = FAILURE_RISK;
  let p = failureChance({ ...e, fuel: car.fuel ?? e.fuel }, car.pace ?? 'normal', rules);
  p *= 1 + (car.heat ?? 0) * F.heatX;
  p *= 1 + (car.damagePct ?? 0) * F.damagePer1;
  p *= 1 + clamp(share, 0, 1) * F.lengthX;
  return Math.min(F.maxPerLap, p);
}
// What a failure does (bible §23.6), from its seeded severity roll: stress (heat, damage, open faults) pushes it up; only the
// severe end retires the car. → 'paceLoss' | 'forcedPit' | 'damage' | 'retire'
export function failureOutcome(roll, e, car = {}) {
  const F = FAILURE_RISK;
  const stress = ((car.heat ?? 0) + Math.min(1, (car.damagePct ?? 0) / F.damageFull) + Math.min(1, (e.openFaults ?? 0) / F.faultsFull)) / 3;
  const sev = roll + stress * F.severityShift;
  const t = F.thresholds;
  return sev < t.paceLoss ? 'paceLoss' : sev < t.forcedPit ? 'forcedPit' : sev < t.damage ? 'damage' : 'retire';
}

// Qualifying (§22.3): one flying lap each on the starting tyre: car track-fit + the Qualifying rating + setup score +
// tyre + weather + seeded bounded variance. → rows fastest first (each with its setup score 0–100).
export function runQualifying({ geo, entries, seed, weather = 'dry', rules = RACE }) {
  const rng = new Rng(`quali:${seed}`);
  const v = rules.variance;
  const rows = entries.map((e) => {
    const width = (v.maxPct / 100) * clamp(1 - e.ratings.consistency / v.consistencyFull, v.minShare, 1);
    let time = 0;
    for (const sg of geo.segments) time += ((sg.toS - sg.fromS) / sg.refSpeed) * paceMultiplier(paceScore(e, sg, rules, 'quali'), rules) * (1 + rng.range(-1, 1) * width);
    time *= tyreFactor(e.tyre ?? 'medium', 0) * weatherPace(e.tyre ?? 'medium', weather);
    return { id: e.id, name: e.name, team: e.team, isPlayer: !!e.isPlayer, tyre: e.tyre ?? 'medium', setup: Math.round((e.setup ?? rules.pace.setupDefault) * 100), time: Math.round(time * 1000) / 1000 };
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
  // Milestone 16: each car's strategist (the player's from races.js, fixed when the race was made; rivals' placeholders),
  // its fixed wear-estimate error, and what a stop costs it (the pit lane against the track it skips, the service, the
  // slow-down and pick-up).
  const profile = {};
  const estErr = {};
  const pitLoss = {};
  for (const e of entries) {
    profile[e.id] = e.strategy ?? (e.isPlayer ? strategyProfile({ str: 86 }) : rivalProfile(e));
    estErr[e.id] = new Rng(`strategy:${seed}:${e.id}`).range(-1, 1);
    pitLoss[e.id] = pit ? pit.length / PIT.laneSpeed - pitSpan / (L / baseLap[e.id]) + (e.pitService ?? PIT.service.base) + 3 : 0;
  }
  const entryFrac = pit ? geo.wrap(pit.entryS) / L : 1;

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
        ...m16Car(e),
      };
    });
  }
  // Milestone 16: a car's strategy state (also filled in for a race saved before it).
  //   fuel (the target now) · heat 0–1 · nextTyre / repairReq (your Manual choices for the next stop; null = the plan's) ·
  //   plan (the planner's latest) · win (this stint's pit window, fixed when first planned) · missed (the first lap you
  //   let Auto's planned stop go by) · swings [{ kind, lap, planLap, pos }] · neutralGains (places gained under caution,
  //   Milestone 17) · segU / segKey (this segment's variance, kept if the segment is re-entered after a command) ·
  //   tyreCall (the weather tyre call on the HUD) · outsideSecs (time lost to stops outside the window)
  function m16Car(e) {
    return { fuel: e?.fuel ?? 'normal', heat: 0, nextTyre: null, repairReq: null, plan: null, win: null, missed: null, swings: [], neutralGains: 0, segU: 0, segKey: null, tyreCall: null, outsideSecs: 0 };
  }

  const log = (kind, ids, text) => sim.events.push({ t: Math.round(sim.t * 100) / 100, kind, ids, text });
  const nameOf = (id) => byId[id].name;
  const zoneAt = (s) => zones.find((z) => geo.inZone(s, z)) ?? null;
  const lapsLeft = (c) => laps - Math.max(0, c.s) / L; // race distance still to go, in laps
  const fuelNow = (c) => FUEL[c.fuel] ?? FUEL.normal;
  const wearRate = (c) => wearPerLap(byId[c.id], c.tyre) * PACE_MODES[c.pace].wear * ORDERS[c.order].wear * fuelNow(c).wear;

  // Variance width for this driver (bible §23.4: Consistency narrows it, never to zero).
  const varWidth = (e) => {
    const v = rules.variance;
    return (v.maxPct / 100) * clamp(1 - e.ratings.consistency / v.consistencyFull, v.minShare, 1);
  };

  function enterSegment(c, k) {
    const e = byId[c.id];
    const key = `${k}:${Math.floor(c.s / L)}`;
    const again = c.segKey === key; // the same segment again after a command: keep its variance (no new roll)
    c.seg = k;
    if (!c.plan && !c.pit) replan(c);
    if (c.auto && !again) autoDecide(c);
    if (!again) {
      c.segU = rng.range(-1, 1) * varWidth(e);
      c.segKey = key;
    }
    let time = base[c.id][k] * (1 + c.segU) * (1 + c.damagePct / 100);
    if (c.failLapsLeft > 0) time *= 1 + c.failPct / 100;
    time *= tyreFactor(c.tyre, c.wear) * (1 + PACE_MODES[c.pace].time) * (1 + ORDERS[c.order].time) * (1 + fuelNow(c).time);
    c.segSpeed = (segs[k].toS - segs[k].fromS) / time;
  }

  // --- Milestone 16: the plan (src/systems/raceStrategy.js), for every car whatever its mode ------------------------
  // Race distance done in laps (0 on the grid).
  const xOf = (c) => clamp(Math.max(0, c.s) / L, 0, laps);
  function replan(c) {
    if (c.finished || c.retired || !pit) return;
    const e = byId[c.id];
    // Your stop going by in Manual: the first lap Auto would have stopped on and you didn't (an extended stint).
    const prev = c.plan;
    if (!c.auto && c.missed === null && prev?.pitLap && prev.stopsAt === c.stops && !c.pit && prev.pitLap < nextStopLap(c)) c.missed = prev.pitLap;
    const ord = sim.order();
    const i = ord.indexOf(c);
    const front = i > 0 ? ord[i - 1] : null;
    const plan = planStrategy({
      profile: profile[c.id],
      err: estErr[c.id],
      x: xOf(c),
      total: laps,
      entryFrac,
      tyre: c.tyre,
      wear: c.wear,
      fuel: c.fuel,
      rate: (t, f) => wearPerLap(e, t) * (FUEL[f] ?? FUEL.normal).wear,
      baseLap: baseLap[c.id],
      pitLoss: pitLoss[c.id],
      damagePct: c.damagePct,
      faultRunning: c.failLapsLeft > 0,
      gapAhead: front && !front.retired ? sim.gapAhead(c) : null,
      aheadNeedsStop: !!front && !front.pit && front.stops <= c.stops && (front.plan?.stops ?? 0) > 0,
      window: c.win,
    });
    plan.stopsAt = c.stops;
    c.plan = plan;
    if (plan.stops && !c.win && plan.window) c.win = { ...plan.window };
    if (c.auto) applyPlan(c);
  }
  // Auto takes the plan: fuel, and the stop when its lap comes (the pit entry is taken on that lap).
  function applyPlan(c) {
    const p = c.plan;
    if (!p) return;
    c.fuel = p.fuel;
    if (!c.pit && c.pitReq?.by !== 'forced' && c.pitReq?.by !== 'call') {
      c.pitReq = p.pitLap && p.pitLap === nextStopLap(c) ? { tyre: p.nextTyre, by: 'auto', repair: p.repair } : null;
    }
  }
  // The lap on which this car's next pit entry comes.
  const nextStopLap = (c) => {
    const x = Math.max(0, c.s) / L;
    return Math.floor(x) + 1 + (x - Math.floor(x) > entryFrac ? 1 : 0);
  };

  // The crew's choices for a car on Auto (bible §24.1): pace and order at each segment (the plan: fuel and stops).
  function autoDecide(c) {
    applyPlan(c);
    const left = lapsLeft(c);
    const rate = wearRate(c) / PACE_MODES[c.pace].wear / ORDERS[c.order].wear; // at Normal / Neutral
    const ahead = sim.gapAhead(c);
    const behind = sim.gapBehind(c);
    // pace
    let pace = 'normal';
    if (left <= AUTO.pushLastLaps && ahead !== null && ahead < AUTO.pushGap && c.wear < AUTO.pushMaxWear && c.heat < 0.8) pace = 'push';
    // Conserve only to reach the flag when no stop is planned and the tyres wouldn't last (earlier, the crew stops instead).
    else if (!c.pitReq && !c.plan?.stops && left < AUTO.minLapsLeftToPit + 1 && left > 0.5 && c.wear + rate * left > AUTO.conserveEndWear) pace = 'conserve';
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

  // A lap done: failure roll (bible §23.6; Milestone 16: one failureRisk() — Push / heat, faults, damage, race length,
  // crew traits and facilities — and outcomes by severity: pace loss, forced pit, damage, retirement only when severe).
  function lapFailureRoll(c) {
    const e = byId[c.id];
    const f = rules.failure;
    if (!rng.chance(failureRisk(e, c, xOf(c) / laps, rules))) return;
    let kind = failureOutcome(rng.next(), e, c);
    // a forced stop needs laps to make it; too late, the fault just costs pace
    if (kind === 'forcedPit' && (!pit || c.pit || lapsLeft(c) < STRATEGY.minLapsLeftToPit)) kind = 'paceLoss';
    if (kind === 'paceLoss') {
      c.failLapsLeft = f.paceLossLaps;
      c.failPct = f.paceLossPct;
      c.fails.push('paceLoss');
      log('failure', [c.id], `${nameOf(c.id)}: engine hiccup, losing pace`);
    } else if (kind === 'forcedPit') {
      c.failLapsLeft = laps; // until it's fixed in the pits
      c.failPct = f.paceLossPct;
      c.fails.push('forcedPit');
      c.pitReq = { tyre: c.pitReq?.tyre ?? c.nextTyre ?? c.plan?.nextTyre ?? c.tyre, by: 'forced', repair: 'critical' };
      log('failure', [c.id], `${nameOf(c.id)}: a fault — must pit now`);
    } else if (kind === 'damage') {
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
      if (c.missed !== null && !c.auto) swing(c, 'extended', c.missed); // ran to the flag past Auto's stop
      return;
    }
    // Milestone 16: engine heat for the lap just run (Push builds it, Rich fuel a little; Normal / Conserve cool it)
    const H = FAILURE_RISK.heat;
    c.heat = clamp(c.heat + H[c.pace] + (c.fuel === 'rich' ? H.rich : 0), 0, 1);
    lapFailureRoll(c);
    if (!c.retired) replan(c);
  }

  // Milestone 16: a pit decision of yours that differs from Auto's plan (bible §11 STR08 / §36 SEC-STAFF-L5) — recorded
  // with where you were then; the result decides whether it became a Strategy Swing win.
  function swing(c, kind, planLap) {
    const pos = sim.order().indexOf(c) + 1;
    c.swings.push({ kind, lap: sim.lapOf(c), planLap, pos });
    log('swing', [c.id], kind === 'undercut' ? `${nameOf(c.id)}: undercut — stopping before the crew's lap ${planLap}` : `${nameOf(c.id)}: extending the stint past the crew's lap ${planLap}`);
  }

  function serviceTime(c) {
    return byId[c.id].pitService ?? PIT.service.base;
  }

  // Milestone 16: what this stop is (taken as the car enters the pit lane): who called it, the repair, the time a stop
  // outside the stint's window costs (your Pit Now only — the crew's own stops are inside it, a forced stop is a fault),
  // and a Strategy Swing when your stop differs from Auto's plan.
  function pitCall(c) {
    const req = c.pitReq;
    const lap = sim.lapOf(c);
    const by = req.by ?? 'auto';
    const repair = by === 'player' || by === 'call' ? c.repairReq ?? c.plan?.repair ?? 'none' : req.repair ?? 'none';
    let outside = 0;
    if (by === 'player') {
      const W = STRATEGY.window;
      const w = c.win;
      const away = !w ? 1 : lap < w.from ? w.from - lap : lap > w.to ? lap - w.to : 0;
      if (away) outside = Math.min(W.outsideMax, W.outsideSecs + W.outsidePerLap * (away - 1));
      if (c.missed !== null) swing(c, 'extended', c.missed);
      else if (c.plan?.stops && c.plan.pitLap && lap < c.plan.pitLap) swing(c, 'undercut', c.plan.pitLap);
    }
    return { by, repair: by === 'forced' && repair === 'none' ? 'critical' : repair, outside, lap };
  }
  // The repair done at the box (PIT_REPAIR): only takes time when there is damage or a fault to fix. → extra seconds
  function doRepair(c, id) {
    const r = PIT_REPAIR[id] ?? PIT_REPAIR.none;
    const broken = c.damagePct > 0 || c.failLapsLeft > 0;
    if (!broken || !r.share) return 0;
    c.damagePct = Math.round(c.damagePct * (1 - r.share) * 100) / 100;
    if (r.clearsFault) c.failLapsLeft = 0;
    c.heat *= r.heat;
    log('repair', [c.id], `${nameOf(c.id)}: ${r.name.toLowerCase()} repair`);
    return r.secs;
  }

  // One step for a car in the pit lane: limit speed, stop at the box, new tyres, rejoin at the exit.
  function stepPit(c, dt) {
    const P = c.pit;
    const boxP = pit.length * PIT.boxAt;
    if (!P.served && P.p >= boxP) {
      P.served = true;
      const extra = doRepair(c, P.repair) + (P.outside ?? 0);
      c.outsideSecs += P.outside ?? 0;
      P.stopUntil = sim.t + serviceTime(c) + extra;
      c.v = 0;
      c.tyre = P.next;
      c.wear = 0;
      c.stops++;
      // the next stint plans afresh (a new window); your Manual next-tyre choice is used up
      c.win = null;
      c.missed = null;
      c.plan = null;
      c.nextTyre = null;
      c.repairReq = null;
      if (c.tyreCall?.status === 'accepted') c.tyreCall.status = 'done';
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
            c.pit = { p: to - entry, entryAbs, exitAbs: entryAbs + pitSpan, served: false, stopUntil: 0, next: c.pitReq.tyre, ...pitCall(c) };
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

  // A tyre this car's team may fit (Milestone 11 research: races.js puts the team's open compounds in entry.openTyres).
  const openTyre = (id, t) => !!TYRES[t]?.unlocked || (byId[id].openTyres ?? []).includes(t);

  // --- the player's commands (bible §24.2), recorded with their step so a replay is exact ---------------------------
  sim.command = function command(id, type, value) {
    const c = sim.car(id);
    if (!c || c.finished || c.retired || sim.done) return false;
    if (type === 'auto') {
      if (c.pit) return false; // not during a pit stop (§24.3)
      const on = !!value;
      sim.commands.push({ step: sim.stepCount, id, type, value });
      if (on === c.auto) return true;
      c.auto = on;
      // Auto resumes from the current state (tyre, wear, fuel, gaps, stops, the stint's window): the crew's plan so far
      // applies straight away. Manual keeps the last Auto choices until you change them.
      if (on) {
        c.nextTyre = null;
        c.repairReq = null;
        c.missed = null;
        if (c.pitReq?.by === 'player') c.pitReq = null;
        const fuel = c.fuel;
        applyPlan(c); // pace and order follow at the next segment
        if (c.fuel !== fuel) c.seg = -1;
      }
      return true;
    } else if (type === 'tyre' && TYRES[value]) {
      // Milestone 16: the next tyre (Manual) — also changes a Pit Now already called
      if (c.auto || !openTyre(id, value)) return false;
      c.nextTyre = value;
      if (c.pitReq && !c.pit) c.pitReq = { ...c.pitReq, tyre: value };
    } else if (type === 'fuel' && FUEL[value]) {
      if (c.auto) return false;
      c.fuel = value; // Milestone 16: the fuel / energy target mid-race
    } else if (type === 'repair' && PIT_REPAIR[value]) {
      if (c.auto) return false;
      c.repairReq = value; // Milestone 16: repair priority at the next stop
    } else if (type === 'tyreCall') {
      // Milestone 16: the weather tyre call (bible §24.2): accept → a stop for the suggested tyre (Auto or Manual), ignore
      const call = c.tyreCall;
      if (!call || call.status !== 'open' || c.pit) return false;
      call.status = value === 'accept' ? 'accepted' : 'ignored';
      if (value === 'accept') {
        c.pitReq = { tyre: call.tyre, by: 'call', repair: c.plan?.repair ?? 'none' };
        c.nextTyre = c.auto ? null : call.tyre;
      }
      sim.commands.push({ step: sim.stepCount, id, type, value });
      return true;
    } else if (type === 'weather') {
      // Milestone 16 (?debug=1 only until Milestone 17): the forecast says this weather is coming — the crew's tyre call
      const tyre = suggestTyreFor(value, Object.keys(TYRES).filter((t) => openTyre(id, t)), null);
      if (!tyre || tyre === c.tyre) return false;
      c.tyreCall = { weather: value, tyre, lap: sim.lapOf(c), status: 'open' };
      sim.commands.push({ step: sim.stepCount, id, type, value });
      return true;
    } else if (type === 'pace' && PACE_MODES[value]) {
      if (c.auto) return false;
      c.pace = value;
    } else if (type === 'order' && ORDERS[value]) {
      if (c.auto) return false;
      c.order = value;
    } else if (type === 'pit' && TYRES[value] && openTyre(id, value)) {
      if (c.auto || c.pit) return false;
      c.pitReq = { tyre: value, by: 'player' };
      c.nextTyre = value;
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
          // Milestone 16: the strategy record (swings, caution gains — Milestone 17), fuel at the flag, time lost outside windows
          swings: c.swings.map((x) => ({ ...x })),
          neutralGains: c.neutralGains,
          fuel: c.fuel,
          outsideSecs: Math.round(c.outsideSecs * 100) / 100,
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
    // Milestone 16: a race saved before it — its cars get the strategy state (fuel from the entry, cool, no plan yet)
    for (const c of sim.cars) {
      const add = m16Car(byId[c.id]);
      for (const k of Object.keys(add)) if (c[k] === undefined) c[k] = add[k];
      if (c.segKey === null) c.segKey = `${c.seg}:${Math.floor(c.s / L)}`;
    }
    sim.events = s.events.slice();
    sim.commands = (s.commands ?? []).map((x) => ({ ...x }));
    return sim;
  };
  sim.byId = byId;
  sim.baseLap = baseLap;
  sim.car = (id) => sim.cars.find((c) => c.id === id);
  sim.wearRate = wearRate;
  // Milestone 16 (the HUD and tests): the car's plan and strategist, and the lap its next pit entry comes on.
  sim.planOf = (c) => c.plan;
  sim.profileOf = (id) => profile[id];
  sim.nextStopLap = nextStopLap;
  sim.replan = (c) => replan(c);
  sim.failureRisk = (c) => failureRisk(byId[c.id], c, xOf(c) / laps, rules);
  fresh();
  return sim;
}
