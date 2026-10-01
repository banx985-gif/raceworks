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
// Milestone 17 (bible §21, §23.5–23.7, §24.2): weather — the weekend's seeded timeline (createRaceSim's `weather`, from
//   src/race/weather.js; the state follows the leader's race distance), tyre × weather pace / wear / spin, Wet Skill off the
//   dry, and the crew's tyre call when the state changes (yours as the Accept / Ignore prompt); seeded, bounded spins and
//   contact (damage, rarely a retirement — never from a spin); cautions (the field slows and bunches, no overtaking, a
//   cheap stop, a bounded number of laps); car damage and faults (the car build's, entry.openFaults) that a pit repair
//   clears; and the complete pit service (base + tyres + fuel / energy + repair − the Lead Mechanic, entry.pitParts).
//   Entries may also carry: wetSpinPct / stormPacePct / raceRepairPct (the race crew's weather and repair traits),
//   openTyres (rivals: every compound).
//   sim.weather → the state now · sim.caution → the running caution or null · sim.cautions → every caution this race ·
//   sim.incidents → spins + contacts so far · sim.leaderX() → the leader's race distance in laps
import { Rng } from '../../../../core/Rng.js';
import { RACE, TYRES, TYRE_WEAR, PACE_MODES, ORDERS, PIT, AUTO, WEEKEND, FUEL, STRATEGY, PIT_REPAIR, FAILURE_RISK, WET_SKILL, INCIDENTS, CAUTION, PIT_SERVICE, PIT_FAULT_FIX, WEATHER_NAMES, TRACK_EFFECTS } from '../../data/race.js';
import { tyreFactor, planStrategy, rivalProfile, strategyProfile, suggestTyreFor } from '../systems/raceStrategy.js';
import { dryWeather, stateAt, weatherPace, weatherWear, weatherSpin, suitable, bestTyreFor, stateIndex } from './weather.js';

export { tyreFactor, weatherPace };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const SPIN_SECS = 1.2; // Milestone 17: how long a spin takes to draw

// §23.4 paceScore for one entry through one segment. mode 'quali' uses the Qualifying rating (§22.3).
// Milestone 17: off the dry the driver part uses Wet Skill for WET_SKILL.share of it (bible §10.3, §23.7).
export function paceScore(entry, seg, rules = RACE, mode = 'race', state = 'dry') {
  const p = rules.pace;
  const carFit = Object.entries(seg.demand).reduce((t, [k, w]) => t + w * (entry.car[k] ?? 0), 0) / p.carNorm;
  const r = entry.ratings;
  const q = WEEKEND.quali;
  const dryRating = mode === 'quali' ? r.qualifying * q.driverQualifying + r.consistency * q.driverConsistency : r.racecraft * 0.7 + r.consistency * 0.3;
  const wetShare = WET_SKILL.share[state] ?? 0;
  const driverRating = wetShare ? dryRating * (1 - wetShare) + (r.wet ?? dryRating) * wetShare : dryRating;
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

// Milestone 17: a pit stop's service time (bible §24.2): base (× the pit facilities) + a tyre change + fuel / energy to the
// target − the Lead Mechanic, all × the crew's pit traits; the repair and a stop outside the window come on top. An entry
// from before Milestone 17 has only its total (pitService).
export function pitServiceTime(e, fuel = 'normal') {
  const P = e?.pitParts;
  if (!P) return e?.pitService ?? PIT.service.base;
  const S = PIT_SERVICE;
  const t = (S.base * (1 + (P.basePct ?? 0) / 100) + S.tyres + (S.fuel[fuel] ?? S.fuel.normal) + P.mech) * (1 + (P.traitPct ?? 0) / 100);
  return Math.round(Math.max(S.min, t) * 100) / 100;
}
// The Lead Mechanic's part of a stop: seconds added (+) or saved (−) against the reference Mechanic.
export function mechanicSecs(mec) {
  const S = PIT_SERVICE;
  return Math.round(clamp(-((mec - S.mechRef) / 10) * S.perMech10, -S.mechBest, S.mechWorst) * 100) / 100 || 0; // (never −0: a save would turn it into 0)
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
  let p = failureChance({ ...e, fuel: car.fuel ?? e.fuel, openFaults: car.faults ?? e.openFaults }, car.pace ?? 'normal', rules); // Milestone 17: faults a pit repair fixed no longer count
  p *= 1 + (car.heat ?? 0) * F.heatX;
  p *= 1 + (car.damagePct ?? 0) * F.damagePer1;
  p *= 1 + clamp(share, 0, 1) * F.lengthX;
  return Math.min(F.maxPerLap, p);
}
// What a failure does (bible §23.6), from its seeded severity roll: stress (heat, damage, open faults) pushes it up; only the
// severe end retires the car. → 'paceLoss' | 'forcedPit' | 'damage' | 'retire'
export function failureOutcome(roll, e, car = {}) {
  const F = FAILURE_RISK;
  const stress = ((car.heat ?? 0) + Math.min(1, (car.damagePct ?? 0) / F.damageFull) + Math.min(1, (car.faults ?? e.openFaults ?? 0) / F.faultsFull)) / 3;
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
    for (const sg of geo.segments) time += ((sg.toS - sg.fromS) / sg.refSpeed) * paceMultiplier(paceScore(e, sg, rules, 'quali', weather), rules) * (1 + rng.range(-1, 1) * width);
    time *= tyreFactor(e.tyre ?? 'medium', 0) * weatherPace(e.tyre ?? 'medium', weather) * (weather === 'storm' ? 1 + (e.stormPacePct ?? 0) / 100 : 1);
    return { id: e.id, name: e.name, team: e.team, isPlayer: !!e.isPlayer, tyre: e.tyre ?? 'medium', setup: Math.round((e.setup ?? rules.pace.setupDefault) * 100), time: Math.round(time * 1000) / 1000 };
  });
  rows.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  rows.forEach((r, i) => (r.pos = i + 1));
  return rows;
}

// calm: true = no spins, no contact damage and no cautions (tests of the Milestone 7 / 16 strategy bounds only, where one
// caution's luck would swamp the few seconds a plan is worth).
export function createRaceSim({ track, geo, entries, laps, seed, grid = null, rules = RACE, weather = null, calm = false }) {
  const L = geo.length;
  const segs = geo.segments;
  const zones = (track.overtakeZones ?? []).map((z) => ({ ...z }));
  const order = grid ?? entries.map((e) => e.id);
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  const wx = weather ?? dryWeather(); // Milestone 17: the weekend's timeline (fixed; saved with the race)
  // Base time per entry per segment (without variance): segment length / reference speed × pace curve. Milestone 17: one
  // set per weather state (Wet Skill off the dry), made when first needed.
  const baseBy = {};
  const baseOf = (state) =>
    (baseBy[state] ??= Object.fromEntries(entries.map((e) => [e.id, segs.map((sg) => ((sg.toS - sg.fromS) / sg.refSpeed) * paceMultiplier(paceScore(e, sg, rules, 'race', state), rules))])));
  const base = baseOf('dry');
  // Milestone 19: the track's own surface (bible §23.1 grip zones) at each timing segment's middle, and its other traits —
  // all from the track data (draftX: the slipstream; engineHeat: a hot track's extra heat a lap; walls: close barriers)
  const TE = TRACK_EFFECTS;
  const segGrip = segs.map((sg) => {
    const f = ((sg.fromS + sg.toS) / 2) / L;
    const z = (track.surfaceGrip ?? []).find((q) => (q.from <= q.to ? f >= q.from && f < q.to : f >= q.from || f < q.to));
    return z?.grip ?? 1;
  });
  const gripTime = segGrip.map((g) => 1 + (1 - g) * TE.gripTimePer);
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
    pitLoss[e.id] = pit ? pit.length / PIT.laneSpeed - pitSpan / (L / baseLap[e.id]) + pitServiceTime(e, e.fuel) + 3 : 0;
  }
  const entryFrac = pit ? geo.wrap(pit.entryS) / L : 1;

  let rng;
  const sim = { track, geo, entries, laps, seed, t: 0, done: false, leaderFinished: false, cars: [], events: [], commands: [], stepCount: 0, weatherTimeline: wx };

  function fresh() {
    rng = new Rng(`race:${seed}`);
    sim.t = 0;
    sim.done = false;
    sim.leaderFinished = false;
    sim.events = [];
    sim.commands = [];
    sim.stepCount = 0;
    Object.assign(sim, m17Race());
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
        ...m17Car(e),
        ...m25Car(),
      };
    });
  }
  // Milestone 17: a car's condition and incident state (also filled in for a race saved before it).
  //   faults (the car build's open faults still unfixed; a pit repair fixes them) · faultsFixed (faults a repair fixed,
  //   running ones included) · spins · spinT (when the last spin began — drawing only) · coldTo (race distance until which
  //   the tyres are cold) · weatherChanges (stops that swapped a wrong tyre for a right one) · neutralBenefits (cautions
  //   you gained places in)
  function m17Car(e) {
    return { faults: e?.openFaults ?? 0, faultsFixed: 0, spins: 0, spinT: null, coldTo: INCIDENTS.coldLaps * L, weatherChanges: 0, neutralBenefits: 0 };
  }
  // Milestone 25 (the secrets' race facts; read only, never part of the race itself): damageHits (times the car took race
  // damage: a damaging spin, contact or component failure) · damageRepairs (pit repairs done with race damage on the car) ·
  // vmax (top speed, m/s, racing laps only) · saveUsed (the Conserve pace at any moment) · plannedStops (stops in the
  // crew's first plan: the race's expected pit window)
  function m25Car() {
    return { damageHits: 0, damageRepairs: 0, vmax: 0, saveUsed: false, plannedStops: null };
  }
  // Milestone 17: the race's weather and incident state. weather (the state now) · wetSeen (any rain so far) · weatherInit
  // (the start's tyre calls made) · caution (the running one) · cautions [{ n, fromLap, toLap, laps, reason }] · incidents
  function m17Race() {
    return { weather: stateAt(wx, 0), wetSeen: stateIndex(stateAt(wx, 0)) > 0, weatherInit: false, caution: null, cautions: [], incidents: 0 };
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

  const log = (kind, ids, text, extra = null) => sim.events.push({ t: Math.round(sim.t * 100) / 100, kind, ids, text, ...extra });
  const nameOf = (id) => byId[id].name;
  const zoneAt = (s) => zones.find((z) => geo.inZone(s, z)) ?? null;
  const lapsLeft = (c) => laps - Math.max(0, c.s) / L; // race distance still to go, in laps
  const fuelNow = (c) => FUEL[c.fuel] ?? FUEL.normal;
  const wearRate = (c) => wearPerLap(byId[c.id], c.tyre) * PACE_MODES[c.pace].wear * ORDERS[c.order].wear * fuelNow(c).wear * weatherWear(c.tyre, sim.weather);
  // Milestone 17: the leader's race distance in laps (the weather timeline and cautions follow it).
  const leaderX = () => {
    let s = 0;
    for (const c of sim.cars) if (!c.retired && c.s > s) s = c.s;
    return Math.min(laps, s / L);
  };
  const leaderLaps = () => Math.max(0, ...sim.cars.filter((c) => !c.retired).map((c) => c.lapsDone));
  // The tyres the crew may fit now: the right ones for the weather that the team has, else its dry list.
  const openTyre = (id, t) => !!TYRES[t]?.unlocked || (byId[id].openTyres ?? []).includes(t);
  const tyresFor = (c) => {
    if (sim.weather === 'dry') return null;
    if (c.tyreCall?.status === 'ignored' && c.tyreCall.weather === sim.weather) return null; // you said stay out: no weather tyres until it changes again
    const ok = Object.keys(TYRES).filter((t) => suitable(t, sim.weather) && openTyre(c.id, t));
    return ok.length ? ok : null;
  };

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
      // Milestone 17: one spin roll at every corner (none under caution; the field's incident cap stops them)
      if (segs[k].kind === 'corner' && !sim.caution && c.s > 0 && !calm) {
        const u = rng.next();
        if (sim.incidents < INCIDENTS.maxPerRace && u < spinChance(c)) spin(c);
      }
    }
    const w = sim.weather;
    let time = baseOf(w)[c.id][k] * (1 + c.segU) * (1 + c.damagePct / 100);
    if (c.failLapsLeft > 0) time *= 1 + c.failPct / 100;
    time *= tyreFactor(c.tyre, c.wear) * (1 + PACE_MODES[c.pace].time) * (1 + ORDERS[c.order].time) * (1 + fuelNow(c).time);
    time *= weatherPace(c.tyre, w) * (w === 'storm' ? 1 + (e.stormPacePct ?? 0) / 100 : 1); // Milestone 17
    time *= gripTime[k]; // Milestone 19: a low-grip surface is slower
    c.segSpeed = (segs[k].toS - segs[k].fromS) / time;
  }

  // --- Milestone 17: spins (bible §23.5), bounded and seeded ---------------------------------------------------------
  function spinChance(c) {
    const I = INCIDENTS;
    const e = byId[c.id];
    const w = sim.weather;
    let p = I.basePerCorner * (I.state[w] ?? 1) * weatherSpin(c.tyre, w);
    if (c.s < c.coldTo) p *= I.coldX;
    if (c.pace === 'push') p *= I.pushX;
    if (c.order === 'attack') p *= I.attackX;
    if (w !== 'dry') {
      p *= clamp(I.wetRef / Math.max(1, e.ratings.wet ?? I.wetRef), I.wetMin, I.wetMax);
      p *= Math.max(0, 1 + (e.wetSpinPct ?? 0) / 100);
    }
    p *= clamp(I.consistencyRef / Math.max(1, e.ratings.consistency ?? I.consistencyRef), 0.7, 1.4);
    if (c.seg >= 0 && segGrip[c.seg] !== 1) p *= Math.pow(1 / segGrip[c.seg], TE.gripSpinPow); // Milestone 19: low grip spins more
    p *= 1 + c.damagePct * I.damageX;
    return Math.min(I.maxPerCorner, p);
  }
  // A spin: time lost, sometimes damage — never a retirement. Off the dry, a damaging spin may call a caution.
  function spin(c) {
    const I = INCIDENTS;
    sim.incidents++;
    c.spins++;
    c.spinT = sim.t;
    c.slowUntil = sim.t + I.spinSlowSecs;
    c.slowPct = I.spinSlowPct;
    const damage = rng.next() < I.spinDamageShare * (track.walls ? TE.wallsSpinDamageX : 1); // Milestone 19: walls
    if (damage) {
      c.damagePct += I.spinDamagePct;
      c.damageHits++;
    }
    log('spin', [c.id], `${nameOf(c.id)} spins${damage ? ' — damage' : ''}`, { damage });
    if (damage && sim.weather !== 'dry') maybeCaution('spin', `${nameOf(c.id)} spun off`);
  }

  // --- Milestone 17: weather ------------------------------------------------------------------------------------------
  // The state follows the leader along the timeline. A change re-plans every car, and each car on a wrong tyre gets the
  // crew's tyre call: yours as the Accept / Ignore prompt (on Auto the crew also calls the stop — Ignore cancels it),
  // rivals' straight away.
  function weatherTick() {
    const now = stateAt(wx, leaderX());
    if (now !== sim.weather) {
      const from = sim.weather;
      sim.weather = now;
      if (stateIndex(now) > 0) sim.wetSeen = true;
      log('weather', [], `Weather: ${WEATHER_NAMES[from]} → ${WEATHER_NAMES[now]}`, { from, to: now });
      for (const c of sim.cars) {
        if (c.finished || c.retired) continue;
        c.win = null; // the dry stint's window no longer fits
        c.missed = null;
        c.seg = -1;
        replan(c);
        weatherCall(c);
      }
    }
    if (!sim.weatherInit && sim.t >= rules.startLights) {
      // the start: a car on the wrong tyre for the weather gets its call now
      sim.weatherInit = true;
      if (sim.weather !== 'dry') for (const c of sim.cars) weatherCall(c);
    }
  }
  function weatherCall(c) {
    if (c.finished || c.retired) return;
    const w = sim.weather;
    const e = byId[c.id];
    const openAll = Object.keys(TYRES).filter((t) => openTyre(c.id, t));
    if (suitable(c.tyre, w)) {
      // already right: an open call for another tyre lapses, and a stop only the call wanted is off
      if (c.tyreCall?.status === 'open') c.tyreCall.status = 'lapsed';
      if (c.pitReq?.by === 'call' && !c.pit) c.pitReq = null;
      return;
    }
    let tyre = bestTyreFor(w, openAll);
    if (w === 'dry') {
      const dryOpen = (profile[c.id]?.tyres ?? ['soft', 'medium']).filter((t) => openAll.includes(t));
      tyre = dryOpen.includes(c.plan?.nextTyre) ? c.plan.nextTyre : dryOpen[0] ?? null;
    }
    if (!tyre) return; // nothing better in the truck
    if (e.isPlayer) c.tyreCall = { weather: w, tyre, lap: sim.lapOf(c), status: 'open' };
    if ((c.auto || !e.isPlayer) && !c.pit && c.pitReq?.by !== 'forced' && lapsLeft(c) > 0.5) c.pitReq = { tyre, by: 'call', repair: c.plan?.repair ?? 'none' };
  }

  // --- Milestone 17: cautions (bible §24.2 neutralisation) ------------------------------------------------------------
  function maybeCaution(kind, reason) {
    const K = CAUTION;
    if (calm || sim.caution || sim.cautions.length >= K.maxPerRace || sim.leaderFinished) return;
    const x = leaderX();
    const last = sim.cautions[sim.cautions.length - 1];
    if (last && x < last.endX + K.cooldownLaps) return;
    if (laps - x < K.lastLaps) return;
    if (!rng.chance(K.chance[kind] ?? 0)) return;
    startCaution(reason, K.minLaps + Math.floor(rng.next() * (K.maxLaps - K.minLaps + 1)));
  }
  function startCaution(reason, len) {
    const from = leaderLaps();
    const ord = sim.order();
    sim.caution = { n: sim.cautions.length + 1, fromLap: from, toLap: from + len, len, reason, startPos: Object.fromEntries(ord.map((c, i) => [c.id, i + 1])) };
    log('caution', [], `Caution: ${reason} — no overtaking, pit lane open`, { n: sim.caution.n });
    for (const c of sim.cars) {
      c.ot = null;
      cautionStop(c);
    }
  }
  // Auto takes a cheap stop under caution when its planned stop is close enough (Safety Car Sense: any planned stop).
  function cautionStop(c) {
    if (!c.auto || c.finished || c.retired || c.pit || c.pitReq || lapsLeft(c) < STRATEGY.minLapsLeftToPit) return;
    const p = c.plan;
    if (!p?.stops || !p.pitLap) return;
    const prof = profile[c.id];
    const K = CAUTION.stopAheadLaps;
    const ahead = (prof?.traits ?? []).includes('safetyCarSense') ? Infinity : (prof?.q ?? 0) >= STRATEGY.undercutQ ? K.strong : K.weak;
    if (p.pitLap - nextStopLap(c) <= ahead) c.pitReq = { tyre: p.nextTyre, by: 'caution', repair: p.repair };
  }
  function endCaution() {
    const k = sim.caution;
    if (!k) return;
    const ord = sim.order();
    ord.forEach((c, i) => {
      const gain = (k.startPos[c.id] ?? i + 1) - (i + 1);
      if (gain > 0 && !c.retired) {
        c.neutralGains += gain;
        c.neutralBenefits++;
      }
    });
    sim.cautions.push({ n: k.n, fromLap: k.fromLap, toLap: leaderLaps(), laps: leaderLaps() - k.fromLap, len: k.len, reason: k.reason, endX: leaderX() });
    sim.caution = null;
    log('cautionEnd', [], 'Green flag: racing again', { n: k.n });
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
      rate: (t, f) => wearPerLap(e, t) * (FUEL[f] ?? FUEL.normal).wear * weatherWear(t, sim.weather),
      // Milestone 17: the weather now — the tyres that suit it, and what each tyre's pace is in it
      tyres: tyresFor(c),
      weatherX: sim.weather === 'dry' ? null : (t) => weatherPace(t, sim.weather),
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
    if (c.plannedStops == null) c.plannedStops = plan.stops ?? 0; // Milestone 25: the expected pit window (the first plan)
    if (plan.stops && !c.win && plan.window) c.win = { ...plan.window };
    if (c.auto) applyPlan(c);
  }
  // Auto takes the plan: fuel, and the stop when its lap comes (the pit entry is taken on that lap).
  function applyPlan(c) {
    const p = c.plan;
    if (!p) return;
    c.fuel = p.fuel;
    if (!c.pit && c.pitReq?.by !== 'forced' && c.pitReq?.by !== 'call' && c.pitReq?.by !== 'caution') {
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
    // Milestone 17: contact is likelier off the dry (and cold tyres), can damage a car and, rarely, retire the attacker;
    // the field's incident cap stops it
    const I = INCIDENTS;
    const cx = (I.contactState[sim.weather] ?? 1) * (c.s < c.coldTo ? I.coldX : 1);
    // (on the grid, before the line, a touch only costs time: as in Milestone 7)
    const soft = calm || c.s <= 0 || o.s <= 0;
    if (rng.chance(r.contactChance * ORDERS[c.order].contactX * (soft ? 1 : cx)) && (soft || sim.incidents < I.maxPerRace)) {
      if (soft) {
        for (const x of [c, o]) {
          x.slowUntil = sim.t + r.contactSlowSecs;
          x.slowPct = r.failSlowPct * 2;
          x.contacts++;
        }
        log('contact', [c.id, o.id], `Contact: ${nameOf(c.id)} and ${nameOf(o.id)}`);
        return false;
      }
      contactHit(c, o);
    }
    return false;
  }
  // A contact (bible §23.5, Milestone 17's bounded rules): both slow; it may damage one car or, rarely, retire the attacker c.
  function contactHit(c, o) {
    const r = rules.overtake;
    const I = INCIDENTS;
    {
      sim.incidents++;
      for (const x of [c, o]) {
        x.slowUntil = sim.t + r.contactSlowSecs;
        x.slowPct = r.failSlowPct * 2;
        x.contacts++;
      }
      const roll = rng.next();
      if (roll < I.contactRetireShare) {
        log('contact', [c.id, o.id], `Contact: ${nameOf(c.id)} and ${nameOf(o.id)}`, { damage: true });
        c.retired = true;
        c.retireT = sim.t;
        c.pit = null;
        c.fails.push('crash');
        log('retire', [c.id], `${nameOf(c.id)} retires: crash damage`, { crash: true });
        maybeCaution('retire', `${nameOf(c.id)} stopped on track`);
      } else if (roll < I.contactRetireShare + I.contactDamageShare) {
        const hit = rng.next() < 0.5 ? c : o;
        hit.damagePct += I.contactDamagePct;
        hit.damageHits++;
        log('contact', [c.id, o.id], `Contact: ${nameOf(c.id)} and ${nameOf(o.id)} — ${nameOf(hit.id)} damaged`, { damage: true, hit: hit.id });
        maybeCaution('contact', `contact between ${nameOf(c.id)} and ${nameOf(o.id)}`);
      } else log('contact', [c.id, o.id], `Contact: ${nameOf(c.id)} and ${nameOf(o.id)}`);
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
      log('failure', [c.id], `${nameOf(c.id)}: engine hiccup, losing pace`, { outcome: 'paceLoss' });
    } else if (kind === 'forcedPit') {
      c.failLapsLeft = laps; // until it's fixed in the pits
      c.failPct = f.paceLossPct;
      c.fails.push('forcedPit');
      c.pitReq = { tyre: c.pitReq?.tyre ?? c.nextTyre ?? c.plan?.nextTyre ?? c.tyre, by: 'forced', repair: 'critical' };
      log('failure', [c.id], `${nameOf(c.id)}: a fault — must pit now`, { outcome: 'forcedPit' });
    } else if (kind === 'damage') {
      c.damagePct += f.damagePct;
      c.damageHits++;
      c.fails.push('damage');
      log('failure', [c.id], `${nameOf(c.id)}: component damage`, { outcome: 'damage' });
    } else {
      c.retired = true;
      c.retireT = sim.t;
      c.pit = null;
      c.fails.push('retire');
      log('retire', [c.id], `${nameOf(c.id)} retires: mechanical failure`);
      maybeCaution('retire', `${nameOf(c.id)} stopped on track`); // Milestone 17
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
    // Milestone 17: the caution ends when the leader completes its last lap (or at the flag)
    if (sim.caution && (k >= sim.caution.toLap || k >= laps)) endCaution();
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
    c.heat = clamp(c.heat + H[c.pace] + (c.fuel === 'rich' ? H.rich : 0) + (track.engineHeat ?? 0), 0, 1); // Milestone 19: + a hot track
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

  // Milestone 17: base + tyres + fuel / energy to the car's target − the Lead Mechanic, × pit traits (pitServiceTime).
  const serviceTime = (c) => pitServiceTime(byId[c.id], c.fuel);

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
      if (away && !sim.caution) outside = Math.min(W.outsideMax, W.outsideSecs + W.outsidePerLap * (away - 1)); // Milestone 17: under caution the crew has time to get ready
      if (c.missed !== null) swing(c, 'extended', c.missed);
      else if (c.plan?.stops && c.plan.pitLap && lap < c.plan.pitLap) swing(c, 'undercut', c.plan.pitLap);
    }
    return { by, repair: by === 'forced' && repair === 'none' ? 'critical' : repair, outside, lap, caution: !!sim.caution };
  }
  // The repair done at the box (PIT_REPAIR): only takes time when there is damage or a fault to fix. Milestone 17: it also
  // fixes the car build's faults (Critical one, Full all: PIT_FAULT_FIX, perFault seconds each), and the Fixer trait
  // (raceRepairPct) makes it quicker. → extra seconds
  function doRepair(c, id) {
    const r = PIT_REPAIR[id] ?? PIT_REPAIR.none;
    const broken = c.damagePct > 0 || c.failLapsLeft > 0 || c.faults > 0;
    if (!broken || !r.share) return 0;
    const running = c.failLapsLeft > 0 && r.clearsFault ? 1 : 0;
    const fixed = Math.min(c.faults, PIT_FAULT_FIX[id] ?? 0);
    if (c.damagePct > 0) c.damageRepairs++; // Milestone 25: race damage repaired in a pit stop
    c.damagePct =Math.round(c.damagePct * (1 - r.share) * 100) / 100;
    if (r.clearsFault) c.failLapsLeft = 0;
    c.faults -= fixed;
    c.faultsFixed += fixed + running;
    c.heat *= r.heat;
    log('repair', [c.id], `${nameOf(c.id)}: ${r.name.toLowerCase()} repair${fixed + running ? ` (${fixed + running} fault${fixed + running === 1 ? '' : 's'} fixed)` : ''}`);
    return Math.round((r.secs + fixed * PIT_SERVICE.perFault) * Math.max(0.2, 1 + (byId[c.id].raceRepairPct ?? 0) / 100) * 100) / 100;
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
      P.secs = Math.round((serviceTime(c) + extra) * 100) / 100;
      c.v = 0;
      if (!suitable(c.tyre, sim.weather) && suitable(P.next, sim.weather)) c.weatherChanges++; // Milestone 17: the right tyre for the weather
      c.tyre = P.next;
      c.coldTo = P.exitAbs + INCIDENTS.coldLaps * L; // new tyres start cold
      c.wear = 0;
      c.stops++;
      if (P.by === 'forced' || (P.outside ?? 0) > 0) c.pitErrors = (c.pitErrors ?? 0) + 1; // Milestone 21: a stop with pitError (count only)
      // the next stint plans afresh (a new window); your Manual next-tyre choice is used up
      c.win = null;
      c.missed = null;
      c.plan = null;
      c.nextTyre = null;
      c.repairReq = null;
      if (c.tyreCall?.status === 'accepted' || (c.tyreCall?.status === 'open' && P.by === 'call')) c.tyreCall.status = 'done';
      c.stints.push({ tyre: P.next, fromLap: Math.min(laps, c.lapsDone + 1) });
      log('pit', [c.id], `${nameOf(c.id)} pits: ${TYRES[P.next].name} tyres${P.caution ? ' (under caution)' : ''}`, { secs: P.secs, caution: P.caution });
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
    weatherTick(); // Milestone 17
    const caution = sim.caution;
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
      if (c.manual) {
        // Milestone 18: the player is driving (src/race/driveStint.js sets where the car is): it moves to that point this
        // step, no faster than it drove there; no segment pace, pit entry or wear here (the stint writes those back).
        const m = c.manual;
        before = c.s;
        const move = clamp(m.target - c.s, 0, Math.max(0, m.v) * dt * 1.5 + 0.01);
        c.s += move;
        c.v = move / dt;
        c.segSpeed = c.v;
        c.lat = m.lat;
      } else if (c.pit) {
        before = stepPit(c, dt);
      } else {
        const k = geo.segmentAt(c.s);
        if (k !== c.seg) enterSegment(c, k);
        let desired = c.segSpeed;
        if (c.finished) desired *= 0.6; // slowing-down lap
        if (sim.t < c.slowUntil) desired *= 1 - c.slowPct / 100;
        // Milestone 17: under caution the field runs slowly and bunches up behind the car ahead
        if (caution && !c.finished) {
          const lim = segs[k].refSpeed * CAUTION.cautionPace;
          const a = ahead(c);
          // close up only on a car really ahead in the race (not a backmarker round the lap)
          desired = Math.min(desired, a && a.gap > CAUTION.bunchGap && a.car.s > c.s ? lim * CAUTION.catchUpX : lim);
        }
        // traffic
        let blocker = null; // the car ahead this one may not pass right now
        if (!c.finished) {
          if (c.ot && (sim.cars.find((x) => x.id === c.ot.target)?.s + rules.overtake.passMargin < c.s || sim.t > c.ot.until)) c.ot = null;
          const a = ahead(c, c.ot?.target);
          if (a) {
            const tr = rules.traffic;
            const passing = !caution && c.s - a.car.s > L / 2; // the car ahead is a lap down: it lets us by (not under caution)
            const sg = segs[k];
            if (a.gap >= tr.draftRange[0] && a.gap <= tr.draftRange[1] && sg.kind === 'straight' && !caution) desired *= 1 + (tr.draftPct * (track.draftX ?? 1)) / 100; // Milestone 19: draftX (an oval)
            if (!passing && a.gap < tr.attemptGap + ORDERS[c.order].attemptGapPlus) {
              const zone = caution ? null : zoneAt(c.s); // no overtaking under caution
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
      // Milestone 25: top speed on a racing lap and any Conserve (the secrets' race facts; nothing reads them in the race)
      if (!c.finished && !c.pit && c.lapsDone >= 0 && c.v > c.vmax) c.vmax = c.v;
      if (!c.finished && c.pace === 'conserve') c.saveUsed = true;
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
      } else {
        // Milestone 17: on Auto the crew had called the stop — stay out, and the crew re-plans on these tyres
        if (c.pitReq?.by === 'call') c.pitReq = null;
        if (c.plan) replan(c);
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
    const pose = geo.pointAt(s, lat * latScale);
    // Milestone 17: a spinning car turns once round over SPIN_SECS (drawing only)
    const since = c.spinT === null || c.spinT === undefined ? Infinity : sim.t - c.spinT;
    if (since < SPIN_SECS) pose.heading += Math.PI * 2 * Math.sin((since / SPIN_SECS) * (Math.PI / 2));
    return pose;
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
          pitErrors: c.pitErrors ?? 0, // Milestone 21: stops forced by a fault or taken outside the window (IronPeak)
          stints: c.stints.map((x) => x.tyre),
          wear: Math.round(c.wear * 100),
          // Milestone 16: the strategy record (swings, caution gains — Milestone 17), fuel at the flag, time lost outside windows
          swings: c.swings.map((x) => ({ ...x })),
          neutralGains: c.neutralGains,
          fuel: c.fuel,
          outsideSecs: Math.round(c.outsideSecs * 100) / 100,
          // Milestone 17: condition at the flag and the weather / incident record
          damage: Math.round(c.damagePct * 100) / 100,
          faults: c.faults,
          faultsFixed: c.faultsFixed,
          spins: c.spins,
          weatherChanges: c.weatherChanges,
          neutralBenefits: c.neutralBenefits,
          // Milestone 18: your Drive Stints (each one's record) and the extra fuel / energy Push used
          drive: (c.driveLog ?? []).map((x) => ({ ...x })),
          stintFuel: c.stintFuel ?? 0,
          // Milestone 25: the secrets' race facts (top speed in km/h)
          damageHits: c.damageHits ?? 0,
          damageRepairs: c.damageRepairs ?? 0,
          topSpeed: Math.round((c.vmax ?? 0) * 3.6 * 10) / 10,
          saveUsed: !!c.saveUsed,
          plannedStops: c.plannedStops ?? 0,
        };
      }),
      // Milestone 17: the weather the race saw (start, every state, any rain), its cautions and incidents
      weather: { start: wx.start, states: [...new Set([wx.start, ...sim.events.filter((x) => x.kind === 'weather').map((x) => x.to)])], wet: sim.wetSeen },
      cautions: sim.cautions.map((k) => ({ ...k })),
      incidents: sim.incidents,
    };
  };

  sim.serialize = () => ({
    t: sim.t,
    done: sim.done,
    leaderFinished: sim.leaderFinished,
    rng: rng.getState(),
    stepCount: sim.stepCount,
    carry,
    cars: JSON.parse(JSON.stringify(sim.cars)),
    events: sim.events.slice(),
    commands: sim.commands.map((x) => ({ ...x })),
    // Milestone 17: the weather now, the caution, the incidents
    m17: JSON.parse(JSON.stringify({ weather: sim.weather, wetSeen: sim.wetSeen, weatherInit: sim.weatherInit, caution: sim.caution, cautions: sim.cautions, incidents: sim.incidents })),
  });
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
      // Milestone 17: a race saved before it — the car's faults from its entry, tyres already warm
      const add17 = m17Car(byId[c.id]);
      if (c.faults === undefined) add17.coldTo = 0;
      for (const k of Object.keys(add17)) if (c[k] === undefined) c[k] = add17[k];
      for (const [k, v] of Object.entries(m25Car())) if (c[k] === undefined) c[k] = v; // Milestone 25: a race saved before it
      delete c.manual; // Milestone 18: a stint never survives a reload (it counts as handed back — the save before it stands)
    }
    sim.events = s.events.slice();
    sim.commands = (s.commands ?? []).map((x) => ({ ...x }));
    if (s.m17) Object.assign(sim, JSON.parse(JSON.stringify(s.m17)));
    else sim.weatherInit = sim.t >= rules.startLights; // (its timeline is the dry one races.js gives it)
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
  // Milestone 17 (the HUD and tests)
  sim.leaderX = leaderX;
  sim.spinChance = (c) => spinChance(c);
  sim.serviceTime = (c) => serviceTime(c);
  sim.tyresFor = (c) => tyresFor(c);
  // ?debug=1 (the browser run): a caution now, as a serious incident would call it (no roll). → true if one started
  // Milestone 18 (the Drive Stint, bible §25.5): the Auto model's time for this car to drive x metres on from where it is
  // now, in its present state (tyre and wear, pace, order, fuel, weather, damage, a running fault), without variance or
  // traffic. Snapshotted: → f(x) seconds.
  sim.modelTimeFn = (c) => {
    const e = byId[c.id];
    const w = sim.weather;
    const b = baseOf(w)[c.id];
    const mult = (1 + c.damagePct / 100) * (c.failLapsLeft > 0 ? 1 + c.failPct / 100 : 1) * tyreFactor(c.tyre, c.wear) * (1 + PACE_MODES[c.pace].time) * (1 + ORDERS[c.order].time) * (1 + fuelNow(c).time) * weatherPace(c.tyre, w) * (w === 'storm' ? 1 + (e.stormPacePct ?? 0) / 100 : 1);
    const s0 = c.s;
    return (x) => {
      let t = 0;
      let s = s0;
      const end = s0 + Math.max(0, x);
      while (s < end - 1e-6) {
        const k = geo.segmentAt(s);
        const sg = segs[k];
        const lapBase = Math.floor(s / L) * L;
        const segEnd = Math.min(end, lapBase + sg.toS);
        const d = Math.max(0.01, segEnd - s);
        t += (b[k] / (sg.toS - sg.fromS)) * d;
        s += d;
      }
      return t * mult;
    };
  };
  // Milestone 18: the player's car touched rival o while driving (the M17 bounded contact rules; the incident cap and
  // calm races only slow both). → true if it counted as an incident
  sim.manualContact = (c, o) => {
    if (!c || !o || o.retired || o.pit) return false;
    if (calm || sim.incidents >= INCIDENTS.maxPerRace || sim.caution) {
      for (const x of [c, o]) {
        x.slowUntil = sim.t + rules.overtake.contactSlowSecs;
        x.slowPct = rules.overtake.failSlowPct * 2;
        x.contacts++;
      }
      log('contact', [c.id, o.id], `Contact: ${nameOf(c.id)} and ${nameOf(o.id)}`);
      return false;
    }
    contactHit(c, o);
    return true;
  };
  // Milestone 18: move a car along the road (the Drive Stint's capped delta). Forward, it counts every line it passes now
  // (the lap is timed as it happens); backward, never behind the last line it crossed.
  sim.moveCar = (c, ns) => {
    const before = c.s;
    const lapStart = Math.max(0, c.lapsDone) * L;
    if (ns < before) ns = Math.max(ns, lapStart + 0.5);
    c.s = ns;
    c.prevS = ns;
    const kB = before >= 0 ? Math.floor(before / L) : -1;
    const kN = ns >= 0 ? Math.floor(ns / L) : -1;
    for (let k = kB + 1; k <= kN && !c.finished && !c.retired; k++) crossLine(c, k, sim.t);
    return c.s - before;
  };
  sim.debugCaution = (reason = 'debug caution') => {
    if (sim.caution || sim.done || sim.leaderFinished) return false;
    startCaution(reason, CAUTION.minLaps);
    return true;
  };
  fresh();
  return sim;
}
