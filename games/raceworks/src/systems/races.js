// The team's races (Milestones 6–7): the race being run (created with a fixed seed and a snapshot of the field, saved
// with the team, so a reload can never reroll it), and the results so far.
//   races.current → the race / weekend in progress, or null:
//     { n, kind: 'test' | 'weekend', seed, trackId, laps, entries, grid, carNumber, createdDay, state, status,
//       weekend only: stage 'practice' | 'setup' | 'race', practice { knowledge, skipped }, setup { aero, gearing,
//       suspension, tyre, auto }, quali { rows } }
//   races.createTestRace({ carNumber }) → { ok, race }   (Milestone 6's temporary Test Race; tests use it)
//   races.createWeekend({ carNumber }) → { ok, race }    (Milestone 7: Compete → Race weekend)
//   Weekend steps (bible §22): runPractice() / skipPractice() → Setup Knowledge 0–100 · hints() · autoSetup() ·
//     setAxis(axis, −1|0|1) · setTyre(id) · setupScore() / estimate() · runQualifying() (fixed grid, setup locked)
//   races.sim() → the current race's model (src/race/raceSim.js), carried on from its saved state
//   races.keep(sim) → store the model's state in the race (the next save keeps it)
//   races.finish(sim) → the result: the player's car wears (Condition); a weekend pays prize Credits and Reputation
//     through the Milestone 5 ledger and rank; the result joins races.history
//   races.history → [{ n, kind, trackId, laps, day, carNumber, result, wear, prize, reputation }] newest last
// Milestone 10: facility effects through the garage's queries — setupKnowledge is added to practice's Setup Knowledge,
//   tyreWearPct is fixed into your car's entry when the race is created (tyre prep, saved with the race).
// Milestone 13: the race crew (bible §10.8, src/systems/staffTraits.js raceCrew) is fixed into the race when it's created
//   (race.crew: ids, for career records) and its work traits into your entry: pitServicePct (pit time), crewPct (crew
//   factor), tyreWearPct (tyre wear), failurePct (mechanical failures, entry.failureMult); setupKnowledge adds to practice.
// Milestone 16: the race Strategist's planning quality (src/systems/raceStrategy.js strategyProfile: STR, traits, the
//   facilities' workPct('strategist') and bonus('autoStrategyPct')) is fixed into every entry as entry.strategy (rivals:
//   their placeholder strategists), the team's open compounds as entry.openTyres, and the forecast quality (STR, the
//   Strategist work %, bonus('forecast'), bonus('forecastUncertaintyPct')) as race.forecast for Milestone 17's weather.
//   races.strategySwing(entry) → the Strategy Swing win a finished race earned ({ kind, lap, planLap, pos } or null).
// Milestone 17: the weekend's weather timeline (src/race/weather.js makeWeather, from the seed and the track's rainChance)
//   is fixed into the race when it's created (race.weather; the debug Test Race stays dry) and goes to the sim; qualifying
//   runs in the start's weather. races.forecastFor(race, x) / forecastLine(race, x) → the crew's forecast (its uncertainty is
//   race.forecast's). Entries carry the pit service in parts (pitParts: the Lead Mechanic, pit traits, pit facilities),
//   the crew's weather / repair traits, and rivals every compound (RIVAL_TYRES).
import { Rng } from '../../../../core/Rng.js';
import { raceCrew, crewPeople, effectSum } from './staffTraits.js';
import { createRaceSim, runQualifying, pitServiceTime, mechanicSecs } from '../race/raceSim.js';
import { makeWeather, dryWeather, stateAt, forecast, forecastText, bestTyreFor, suitable } from '../race/weather.js';
import { buildField, playerEntry } from '../race/field.js';
import { TRACKS, geoOf } from '../race/tracks.js';
import { TEST_RACE } from '../../data/rivals.js';
import { RACE_TYPES, DRIVE_STINT, WEATHER_NAMES, RACE, WEEKEND, SETUP_AXES, TYRES, TYRE_ORDER, PRIZES, AUTO, FUEL, REPAIR, REPAIR_ORDER, DRIVE_LAP, STRATEGY, SWING } from '../../data/race.js';
import { COSTS } from '../../data/economy.js';
import { CLASSES } from '../../data/cars.js';
import { courseFromTrack } from '../race/lapCourse.js';
import { strategyProfile, rivalProfile, forecastOf } from './raceStrategy.js';

const HISTORY_KEEP = 30;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const TYRE_WEAR_LIMIT = AUTO.pitWear; // "laps before a stop": when the crew would pit
const RIVAL_TYRES = ['soft', 'medium', 'inter', 'wet']; // Milestone 17 (PLACEHOLDER): what the rival teams race on

// Milestone 15: what a Qualifying Drive lap does to the simulated qualifying time (bible §25.5). The lap is compared
// with the controller's perfect lap × parSlack; off-road seconds and wall hits cost extra; the change is capped at
// ± clamp(capMin, capMax, simulated time × capShare). A lap that ran out of time counts as the full +cap.
//   drive: { time, finished, detail: { par, offTime, walls } } → { delta, cap, raw, time, par }
export function driveLapDelta(drive, simTime, D = DRIVE_LAP) {
  const cap = r3(clamp(simTime * D.capShare, D.capMin, D.capMax));
  const raw = drive.finished ? simTime * (drive.time / (drive.detail.par * D.parSlack) - 1) + (drive.detail.offTime ?? 0) * D.offTrackSecs + (drive.detail.walls ?? 0) * D.wallSecs : cap;
  return { delta: r3(clamp(raw, -cap, cap)), cap, raw: r3(raw), time: drive.time, par: drive.detail.par };
}

export function createRaces({ bus, team }) {
  const cur = () => api.current;
  const best = (stat) => Math.max(0, ...team.roster.map((s) => s.stats[stat] ?? 0));

  // Setup Knowledge added on top of practice: the facilities' bonus and the race crew's traits (fixed at creation).
  const facilityKnowledge = () => (team.facilities?.bonus('setupKnowledge') ?? 0) + (api.current?.crewKnowledge ?? 0);

  function newRace(kind, rec, config, laps) {
    const n = ++api.count;
    const seed = api.seedFor(n);
    const track = TRACKS[config.trackId];
    const crew = crewPeople(raceCrew(team));
    const trait = (key) => effectSum(crew, key);
    // Milestone 17: the pit service in parts (bible §24.2): the Lead Mechanic's MEC (the race crew's; else the team's best
    // MEC), the crew's pit traits, the pit facilities (pitBasePct) through the garage's effect query
    const mec = raceCrew(team).mechanic?.stats.MEC ?? best('MEC');
    const pitParts = { mech: mechanicSecs(mec), traitPct: trait('pitServicePct'), basePct: team.facilities?.bonus('pitBasePct') ?? 0, mec };
    const player = { ...playerEntry(team, rec), pitParts, tyre: 'medium', auto: true };
    player.pitService = pitServiceTime(player);
    // Milestone 17: the crew's weather and repair traits (Rain Sense, Storm Queen, Fixer)
    for (const key of ['wetSpinPct', 'stormPacePct', 'raceRepairPct']) if (trait(key)) player[key] = trait(key);
    if (trait('crewPct')) player.crew = Math.round(player.crew * (1 + trait('crewPct') / 100));
    const wearPct = (team.facilities?.bonus('tyreWearPct') ?? 0) + trait('tyreWearPct');
    if (wearPct) player.tyreWearMult = 1 + wearPct / 100;
    if (trait('failurePct')) player.failureMult = Math.max(0, 1 + trait('failurePct') / 100);
    // Milestone 16: the race Strategist (bible §10.8 race crew) and the garage's strategy effects, fixed now
    const strategist = raceCrew(team).strategist;
    const str = strategist?.stats.STR ?? STRATEGY.contractorStr;
    const fx = (key) => team.facilities?.bonus(key) ?? 0;
    const workPct = team.facilities?.workPct('strategist') ?? 0;
    player.openTyres = TYRE_ORDER.filter((t) => team.research?.tyreOpen(t) ?? TYRES[t].unlocked);
    player.strategy = strategyProfile({ str, traits: strategist?.traits ?? [], workPct, autoPct: fx('autoStrategyPct'), tyres: player.openTyres });
    player.strategy.strategistId = strategist?.id ?? null;
    const forecast = forecastOf({ str, workPct, forecastPts: fx('forecast') + trait('forecastPts'), uncertaintyPct: fx('forecastUncertaintyPct') }); // Milestone 17: + Weather Watch
    const { entries, grid } = buildField({ player, rivalPool: config.rivalPool, band: config.band, fieldSize: config.fieldSize, seed });
    for (const e of entries) if (!e.isPlayer) {
      const rmec = 77 + ((e.crew ?? 80) - 80) / 2;
      e.pitParts = { mech: mechanicSecs(rmec), traitPct: 0, basePct: 0, mec: rmec };
      e.pitService = pitServiceTime(e);
      e.strategy = rivalProfile(e);
      e.openTyres = [...RIVAL_TYRES]; // Milestone 17: the rival teams carry every compound they race on
    }
    // Milestone 17: the weekend's weather timeline, fixed now from the seed (a reload never rerolls it). The debug Test
    // Race stays dry.
    const weather = kind === 'weekend' ? makeWeather(seed, laps, track.rainChance ?? 0, track.weatherProfile ?? null) : dryWeather(); // Milestone 19: the track's own odds
    // (crewKnowledge, Milestone 19: + Street Package on street circuits, + Balance Artist on technical tracks)
    return { n, kind, seed, trackId: track.id, laps, entries, grid, carNumber: rec.number, createdDay: team.clock.totalDays, state: null, status: 'ready', crew: crew.map((s) => s.id), crewKnowledge: trait('setupKnowledge') + (track.walls ? trait('setupKnowledgeStreet') : 0) + (WEEKEND.technicalProfiles.includes(track.profile) ? trait('setupKnowledgeTechnical') : 0), forecast, weather, raceType: config.raceType ?? 'standard', stints: [] }; // Milestone 18: the race type (stint length and cap) and the stints driven
  }

  // Milestone 15: the setup locks (qualifying): the repair priority is paid through the ledger (Credits, and the Lead
  // Mechanic's Energy for the pit crew's time) and the car's Condition goes into the entry; racing unrepaired (Skip,
  // or a repair you can no longer afford) carries REPAIR.skipFailureX into the race's failure rolls.
  function lockSetup(w) {
    const rec = team.cars.cars.get(w.carNumber);
    const me = w.entries.find((e) => e.isPlayer);
    const q = api.repairQuote(w.setup.repair);
    let paid = 0;
    if (rec && q.points && q.affordable) {
      team.money.economy.add('credits', -q.cost, `Race repair (${REPAIR[q.choice].name}): ${rec.name}`, 'repair');
      rec.condition = q.to;
      paid = q.cost;
      if (q.mechanic) q.mechanic.energy = Math.max(0, q.mechanic.energy - q.energy);
      bus.emit('car:repaired', { record: rec, cost: q.cost });
    }
    me.condition = rec?.condition ?? me.condition;
    const unrepaired = me.condition < 100 && !paid;
    if (unrepaired) me.failureMult = r3((me.failureMult ?? 1) * REPAIR.skipFailureX);
    w.repair = { choice: w.setup.repair, from: q.condition, to: me.condition, cost: paid, energy: paid ? q.energy : 0, mechanicId: paid ? q.mechanic?.id ?? null : null, unrepaired };
  }

  const api = {
    current: null,
    history: [],
    count: 0,
    get canRace() {
      return team.cars.cars.list().length > 0;
    },
    // A seed nobody chooses: the team, the day and the race number. Fixed from here on and saved.
    seedFor(n) {
      return `${team.setup.teamName}|${team.setup.principal}|${team.founder.id}|d${team.clock.totalDays}|r${n}`;
    },
    createTestRace({ carNumber = null, config = TEST_RACE } = {}) {
      if (api.current) return { ok: true, race: api.current, existing: true };
      const rec = carNumber ? team.cars.cars.get(carNumber) : team.cars.cars.latest();
      if (!rec) return { ok: false, reason: 'Build a car first (Build → Pit Bay → New car)' };
      api.current = newRace('test', rec, config, TRACKS[config.trackId].laps);
      bus.emit('race:created', { race: api.current });
      return { ok: true, race: api.current };
    },

    // --- the race weekend (Milestone 7, bible §22; completed in Milestone 15) -------------------------------------
    createWeekend({ carNumber = null, config = TEST_RACE } = {}) {
      if (api.current) return { ok: true, race: api.current, existing: true };
      const rec = carNumber ? team.cars.cars.get(carNumber) : team.cars.cars.latest();
      if (!rec) return { ok: false, reason: 'Build a car first (Build → Pit Bay → New car)' };
      const w = newRace('weekend', rec, config, TRACKS[config.trackId]?.weekendLaps ?? WEEKEND.laps); // Milestone 19: the track's own race distance
      w.grid = null; // set by qualifying
      w.stage = 'practice';
      w.practice = null;
      w.setup = { aero: 0, gearing: 0, suspension: 0, tyre: 'medium', auto: true, touched: false, fuel: 'normal', repair: 'skip' };
      w.quali = null;
      w.repair = null; // Milestone 15: what the repair did when the setup locked
      w.driveLap = null; // Milestone 15: the Qualifying Drive lap, once started
      api.current = w;
      bus.emit('race:created', { race: w });
      return { ok: true, race: w };
    },
    // Practice (§22.1): Setup Knowledge 0–100 from the Engineer, the driver's Technical Feedback (bible §10.3) and the
    // Mechanic / Aero crew — the full value after all maxRuns practice runs.
    practiceValue() {
      const p = WEEKEND.practice;
      const me = cur().entries.find((e) => e.isPlayer);
      const raw = p.eng * best('ENG') + p.feedback * me.ratings.feedback + p.crew * ((best('MEC') + best('AER')) / 2);
      return (raw / p.full) * 100;
    },
    // Where the knowledge comes from (the screen and tests): the staff value, the facilities (Basic Dyno, Telemetry Room
    // and, on a technical track, the Wind Tunnel — all through the garage's effect queries) and the race crew's traits.
    knowledgeSources(w = cur()) {
      const technical = WEEKEND.technicalProfiles.includes(TRACKS[w.trackId]?.profile);
      return {
        staff: api.practiceValue(),
        facilities: team.facilities?.bonus('setupKnowledge') ?? 0,
        technical: technical ? team.facilities?.bonus('setupKnowledge.technical') ?? 0 : 0,
        traits: w.crewKnowledge ?? 0,
      };
    },
    // Setup Knowledge after this many practice runs (0 = skipped). Fixed by the weekend seed: a reload can't reroll it.
    knowledgeAfter(runs) {
      const w = cur();
      const p = WEEKEND.practice;
      const src = api.knowledgeSources(w);
      const extra = src.facilities + src.technical + src.traits;
      const skipped = Math.round(clamp(src.staff * p.skipShare + extra, 0, 100));
      if (!runs) return skipped;
      const u = new Rng(`practice:${w.seed}`).range(-1, 1) * p.variance;
      const share = p.runShares[Math.min(runs, p.maxRuns) - 1];
      return Math.max(skipped, Math.round(clamp(share * (src.staff + u) + extra, 0, 100)));
    },
    practiceRuns: () => cur()?.practice?.runs ?? 0,
    // One practice run (up to maxRuns, until qualifying). The first moves the weekend on to Setup; each run adds
    // knowledge (diminishing returns), and an untouched Auto Setup follows what the crew now knows.
    canPractice() {
      const w = cur();
      return !!w && w.kind === 'weekend' && !w.quali && !w.driveLap && !w.practice?.skipped && api.practiceRuns() < WEEKEND.practice.maxRuns;
    },
    runPractice() {
      const w = cur();
      if (!api.canPractice()) return null;
      const runs = api.practiceRuns() + 1;
      const knowledge = api.knowledgeAfter(runs);
      w.practice = { knowledge, skipped: false, runs, log: [...(w.practice?.log ?? []), knowledge] };
      if (w.stage === 'practice') w.stage = 'setup';
      if (w.setup.auto) api.autoSetup(true);
      bus.emit('race:progress', {});
      return w.practice;
    },
    skipPractice() {
      const w = cur();
      if (!w || w.kind !== 'weekend' || w.stage !== 'practice') return null;
      w.practice = { knowledge: api.knowledgeAfter(0), skipped: true, runs: 0, log: [] };
      w.stage = 'setup';
      api.autoSetup(true);
      bus.emit('race:progress', {});
      return w.practice;
    },
    knowledge: () => cur()?.practice?.knowledge ?? 0,
    // The crew's idea of the ideal setup: the truth plus a fixed error that shrinks with knowledge (§22.2).
    estimate() {
      const w = cur();
      const ideal = TRACKS[w.trackId].setupIdeal;
      const rng = new Rng(`setup:${w.seed}`);
      const k = api.knowledge() / 100;
      const out = {};
      for (const a of SETUP_AXES) out[a.id] = clamp(ideal[a.id] + rng.range(-1, 1) * (1 - k) * WEEKEND.setup.autoNoise, -1, 1);
      return out;
    },
    // Milestone 15: the engineer's hint band per axis on the −1…+1 scale, around the crew's estimate: the whole range
    // at 0 knowledge, exact at 100. → { aero: { lo, hi, centre, half, options: [first, last] (option indexes 0–2) } … }
    hintBands() {
      const k = api.knowledge() / 100;
      const est = api.estimate();
      const half = WEEKEND.setup.hintHalfMax * (1 - k);
      const out = {};
      for (const a of SETUP_AXES) {
        const lo = clamp(est[a.id] - half, -1, 1);
        const hi = clamp(est[a.id] + half, -1, 1);
        // an option is covered when it is within half a step of the band
        out[a.id] = { lo, hi, centre: est[a.id], half, options: [Math.max(-1, Math.ceil(lo - 0.5)) + 1, Math.min(1, Math.floor(hi + 0.5)) + 1] };
      }
      return out;
    },
    // What the engineer says per axis: the options the band covers ("Balanced–High"), one option when it's that sure,
    // or null when it could be anything (the band covers all three).
    hints() {
      const bands = api.hintBands();
      const out = {};
      for (const a of SETUP_AXES) {
        const [f, l] = bands[a.id].options;
        out[a.id] = f === 0 && l === 2 ? null : f === l ? a.options[f] : `${a.options[f]}–${a.options[l]}`;
      }
      return out;
    },
    // Auto Setup: the option nearest the crew's estimate (the band's centre) on each axis.
    autoSetup(quiet = false) {
      const w = cur();
      if (!w || w.quali || w.driveLap) return false;
      const est = api.estimate();
      for (const a of SETUP_AXES) w.setup[a.id] = Math.round(est[a.id]) || 0; // never −0
      w.setup.auto = true;
      if (!quiet) bus.emit('race:progress', {});
      return true;
    },
    // Can the setup still change? (from the start of the weekend until qualifying — or a Drive lap — locks it)
    get setupOpen() {
      const w = cur();
      return !!w && w.kind === 'weekend' && !w.quali && !w.driveLap;
    },
    setAxis(axis, value) {
      const w = cur();
      if (!api.setupOpen || !SETUP_AXES.some((a) => a.id === axis)) return false;
      w.setup[axis] = clamp(Math.round(value), -1, 1) || 0;
      w.setup.auto = false;
      w.setup.touched = true;
      bus.emit('race:progress', {});
      return true;
    },
    // Every compound, and whether this team may start on it (Milestone 11: research opens Hard / Inter / Wet).
    tyreOptions: () => TYRE_ORDER.map((id) => ({ id, open: team.research.tyreOpen(id) })),
    setTyre(id) {
      const w = cur();
      if (!api.setupOpen || !team.research.tyreOpen(id)) return false;
      w.setup.tyre = id;
      bus.emit('race:progress', {});
      return true;
    },
    // Milestone 15: the fuel / energy target (Lean / Normal / Rich). Electric classes call it energy.
    get energyWord() {
      const rec = team.cars.cars.get(cur()?.carNumber);
      return CLASSES[rec?.result?.classId]?.tag === 'electric' ? 'Energy' : 'Fuel';
    },
    setFuel(id) {
      const w = cur();
      if (!api.setupOpen || !FUEL[id]) return false;
      w.setup.fuel = id;
      bus.emit('race:progress', {});
      return true;
    },
    // Milestone 15: repair priority when the car's Condition is under 100. → { choice, condition, to, points, cost,
    // energy, mechanic, affordable } — nothing is paid until the setup locks.
    repairQuote(choice = cur()?.setup?.repair ?? 'skip') {
      const w = cur();
      const rec = team.cars.cars.get(w?.carNumber);
      const condition = rec?.condition ?? 100;
      const r = REPAIR[choice] ?? REPAIR.skip;
      const points = Math.ceil((100 - condition) * r.share);
      const cost = points * COSTS.repair.perPoint;
      const mechanic = crewPeople([raceCrew(team).mechanic]).find(Boolean) ?? null;
      return { choice, condition, to: condition + points, points, cost, energy: points ? r.crewEnergy : 0, mechanic, affordable: !cost || team.money.affordable(cost) };
    },
    needsRepair: () => (team.cars.cars.get(cur()?.carNumber)?.condition ?? 100) < 100,
    setRepair(choice) {
      const w = cur();
      if (!api.setupOpen || !REPAIR_ORDER.includes(choice)) return false;
      if (!api.repairQuote(choice).affordable) return false;
      w.setup.repair = choice;
      bus.emit('race:progress', {});
      return true;
    },
    // The one-line "what this costs" for the setup screen.
    costLine(kind) {
      const w = cur();
      const pct = (v) => `${Math.abs(v * 100).toFixed(1)}%`;
      if (kind === 'tyre') {
        const t = TYRES[w.setup.tyre];
        const laps = Math.round(TYRE_WEAR_LIMIT / (t.wearPerLap * FUEL[w.setup.fuel].wear));
        const line = `${t.name}: ${t.pace < 0 ? `${pct(t.pace)} quicker` : t.pace > 0 ? `${pct(t.pace)} slower` : 'the baseline pace'} in the dry · about ${laps} laps before a stop`;
        // Milestone 17: whether it suits the start's weather
        const start = api.weather();
        if (start === 'dry' && !suitable(w.setup.tyre, 'dry')) return `${line} · wrong for a dry start`;
        return start === 'dry' ? line : `${line} · ${WEATHER_NAMES[start]} at the start: ${suitable(w.setup.tyre, start) ? 'the right tyre' : 'the wrong tyre'}`;
      }
      if (kind === 'fuel') {
        const f = FUEL[w.setup.fuel];
        if (w.setup.fuel === 'normal') return `${api.energyWord} Normal: no change to pace, tyre wear or failure risk`;
        return `${api.energyWord} ${f.name}: ${pct(f.time)} ${f.time < 0 ? 'quicker' : 'slower'} a lap · tyre wear ${f.wear > 1 ? '+' : '−'}${Math.round(Math.abs(f.wear - 1) * 100)}% · failure risk ×${f.failure}`;
      }
      if (kind === 'repair') {
        const q = api.repairQuote();
        if (q.condition >= 100) return 'Condition 100: nothing to repair';
        if (q.choice === 'skip') return `Skip: race at Condition ${q.condition} · failure risk ×${REPAIR.skipFailureX}`;
        return `${REPAIR[q.choice].name}: ${q.cost.toLocaleString('en-US')} Cr · Condition ${q.condition} → ${q.to} · ${q.mechanic?.name ?? 'the pit crew'} −${q.energy} Energy`;
      }
      return '';
    },
    // Setup score 0–100 against the track's hidden ideal (§22.2).
    // ideal: the track's hidden ideal by default; the crew's estimate() gives their own guess at the score.
    setupScore(setup = cur()?.setup, knowledge = api.knowledge(), ideal = TRACKS[cur()?.trackId]?.setupIdeal) {
      const st = WEEKEND.setup;
      let miss = 0;
      for (const a of SETUP_AXES) miss += st.axisWeight[a.id] * Math.abs(setup[a.id] - ideal[a.id]);
      const fit = clamp(1 - miss / st.fitDiv, 0, 1);
      return Math.round(100 * fit * (st.base + st.knowledgeShare * (knowledge / 100)));
    },
    // The weather for qualifying and the start (Milestone 17: the weekend's timeline at race distance 0).
    weather: () => stateAt(cur()?.weather, 0),
    // Milestone 17: the crew's forecast at race distance x (0 = before the race) and its one line for the screens.
    forecastFor: (race = cur(), x = 0) => forecast(race?.weather ?? dryWeather(), { u: race?.forecast?.uncertainty ?? 100, seed: race?.seed ?? '', x, laps: race?.laps ?? WEEKEND.laps }),
    forecastLine: (race = cur(), x = 0) => forecastText(api.forecastFor(race, x)),
    // A rival car's setup score (0–1) from its own crew: the driver's Technical Feedback and the team's crew factor.
    rivalSetup(e, rng) {
      const rs = WEEKEND.rivalSetup;
      const v = rs.base + ((e.ratings.feedback - rs.feedbackRef) / 100) * rs.feedbackPer100 + (((e.crew ?? rs.crewRef) - rs.crewRef) / 100) * rs.crewPer100 + rng.range(-1, 1) * rs.spread;
      return Math.round(clamp(v, 0.2, 0.9) * 100) / 100;
    },
    // Qualifying (§22.3): fixed by the weekend seed; locks the setup (repair paid, fuel set) and sets the grid.
    // drive: a finished Qualifying Drive lap's result (the controller's) — it moves your time within the §25.5 cap.
    runQualifying({ drive = null } = {}) {
      const w = cur();
      if (!w || w.kind !== 'weekend' || w.stage !== 'setup' || w.quali) return null;
      if (w.driveLap?.status === 'running' && !drive) return null; // the lap in progress decides
      lockSetup(w);
      const rng = new Rng(`rivals:${w.seed}`);
      const rs = WEEKEND.rivalSetup;
      for (const e of w.entries) {
        if (e.isPlayer) {
          e.setup = api.setupScore() / 100;
          e.tyre = w.setup.tyre;
          e.fuel = w.setup.fuel;
        } else {
          e.setup = api.rivalSetup(e, rng);
          e.tyre = rng.chance(rs.softShare) ? 'soft' : 'medium';
          e.tyre = bestTyreFor(api.weather(), e.openTyres ?? RIVAL_TYRES) ?? e.tyre; // Milestone 17: a wet start
        }
      }
      const rows = runQualifying({ geo: geoOf(w.trackId), entries: w.entries, seed: w.seed, weather: api.weather() });
      let driveOut = null;
      if (drive) {
        const me = rows.find((r) => r.isPlayer);
        driveOut = driveLapDelta(drive, me.time);
        me.simTime = me.time;
        me.time = Math.round((me.time + driveOut.delta) * 1000) / 1000;
        me.drive = true;
        rows.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
        rows.forEach((r, i) => (r.pos = i + 1));
      }
      w.quali = { rows, setupScore: api.setupScore(), weather: api.weather(), drive: driveOut };
      w.grid = rows.map((r) => r.id);
      w.stage = 'race';
      bus.emit('race:progress', {});
      return w.quali;
    },

    // --- the Qualifying Drive lap (Milestone 15, bible §22.3 / §25): optional, one lap of the real circuit ----------
    get canDriveLap() {
      return api.setupOpen && cur().stage === 'setup';
    },
    // What the DrivingChallengeController needs (the screen starts it). Same weekend = the same lap and the same par.
    driveLapConfig() {
      const w = cur();
      const me = w.entries.find((e) => e.isPlayer);
      const D = DRIVE_LAP;
      return { seed: `qlap:${w.seed}`, kind: 'lap', course: courseFromTrack(geoOf(w.trackId)), startSpeed: D.startSpeed, timeLimitX: D.timeLimitX, ratings: { ...me.ratings } };
    },
    // Starting the lap commits qualifying to it: the setup locks, and a hand back (or leaving, or a reload mid-lap)
    // gives the normal simulated session — never a second lap.
    startDriveLap() {
      const w = cur();
      if (!api.canDriveLap) return null;
      w.driveLap = { status: 'running' };
      bus.emit('race:progress', {});
      return api.driveLapConfig();
    },
    // The lap is over (the controller's result): qualifying runs with it, or simulated after a hand back.
    finishDriveLap(result) {
      const w = cur();
      if (w?.driveLap?.status !== 'running') return null;
      const handedBack = !result || result.handedBack;
      w.driveLap = handedBack ? { status: 'handedBack' } : { status: 'done', time: result.time, finished: result.finished, detail: { ...result.detail } };
      return api.runQualifying({ drive: handedBack ? null : w.driveLap });
    },

    sim(race = api.current) {
      if (!race || !race.grid) return null;
      const sim = createRaceSim({ track: TRACKS[race.trackId], geo: geoOf(race.trackId), entries: race.entries, laps: race.laps, seed: race.seed, grid: race.grid, weather: race.weather ?? dryWeather(), calm: !!race.calm }); // (calm: tests only)
      if (race.state) sim.load(race.state);
      return sim;
    },
    keep(sim) {
      if (!api.current || !sim) return;
      api.current.state = sim.serialize();
      api.current.status = sim.done ? 'done' : sim.t > 0 ? 'running' : 'ready';
    },
    // The race is over: wear on the player's car, prize and Reputation for a weekend, the result into the history.
    finish(sim) {
      const race = api.current;
      if (!race || !sim?.done) return null;
      const result = sim.result();
      const me = result.rows.find((r) => r.isPlayer);
      const w = RACE.wear;
      const wear = Math.round(w.perLap * (me?.laps ?? 0) + w.failure * (me?.fails.filter((f) => f !== 'paceLoss').length ?? 0) + w.contact * (me?.contacts ?? 0) + w.damagePer1 * (me?.damage ?? 0)); // Milestone 17: + race damage left unrepaired
      const rec = team.cars.cars.get(race.carNumber);
      if (rec) rec.condition = Math.max(0, (rec.condition ?? 100) - wear);
      let prize = 0;
      let reputation = 0;
      if (race.kind === 'weekend' && me && me.status !== 'retired') {
        prize = PRIZES.credits[me.pos - 1] ?? 0;
        reputation = PRIZES.reputation[me.pos - 1] ?? 0;
        const where = TRACKS[race.trackId].name;
        if (prize) team.money.economy.add('credits', prize, `Prize money: P${me.pos} at ${where}`, 'prize');
        if (reputation) team.money.reputation.add(reputation, `Race result: P${me.pos} at ${where}`);
      }
      const swingWin = race.kind === 'weekend' ? api.strategySwing(me) : null;
      const entry = { swingWin, wet: !!result.weather?.wet, n: race.n, kind: race.kind, trackId: race.trackId, laps: race.laps, day: team.clock.totalDays, carNumber: race.carNumber, seed: race.seed, result, wear, prize, reputation, grid: race.grid, quali: race.quali ?? null, setupScore: race.quali?.setupScore ?? null, crew: race.crew ?? [] };
      api.history.push(entry);
      if (api.history.length > HISTORY_KEEP) api.history.shift();
      api.current = null;
      bus.emit('race:finished', { race: entry });
      return entry;
    },
    // Milestone 16: a Strategy Swing win (data/race.js SWING): your first pit decision that differed from Auto's plan,
    // in a race you won or finished gainPlaces above where you were when you made it. One per race at most.
    strategySwing(row) {
      const first = row?.swings?.[0];
      if (!first || row.status === 'retired' || row.status === 'running') return null;
      return row.pos === 1 || first.pos - row.pos >= SWING.gainPlaces ? { ...first } : null;
    },
    last: () => api.history[api.history.length - 1] ?? null,
    // Milestone 19 (?debug=1 and tests): a full field for `laps` laps on a track, never saved. → { trackId, laps, done, finished,
    // retired, badPositions (NaN / off the lap), stuck (a car that stopped short of the flag), ms }
    debugLongRace(trackId, laps = 100, seed = `long:${trackId}`) {
      const rec = team.cars.cars.latest();
      if (!rec || !TRACKS[trackId]) return null;
      const count = api.count;
      const race = newRace('test', rec, { ...TEST_RACE, trackId }, laps);
      api.count = count;
      const t0 = Date.now();
      const sim = createRaceSim({ track: TRACKS[trackId], geo: geoOf(trackId), entries: race.entries, laps, seed, grid: race.grid, weather: makeWeather(seed, laps, TRACKS[trackId].rainChance ?? 0, TRACKS[trackId].weatherProfile ?? null) });
      let bad = 0;
      while (!sim.done) {
        sim.step();
        if (sim.stepCount % 200 === 0) for (const c of sim.cars) if (!Number.isFinite(c.s) || !Number.isFinite(c.lat) || Math.abs(c.lat) > geoOf(trackId).at(c.s).width) bad++;
      }
      const r = sim.result();
      return { trackId, laps, done: r.done, finished: r.rows.filter((x) => x.status !== 'retired' && x.status !== 'running').length, retired: r.rows.filter((x) => x.status === 'retired').length, running: r.rows.filter((x) => x.status === 'running').length, badPositions: bad, ms: Date.now() - t0, winner: r.rows[0].name, result: r };
    },

    // --- Milestone 18: the Drive Stint (bible §25.1): how long, how many, and whether one can start now -----------------
    raceTypeOf: (race = cur()) => RACE_TYPES[race?.raceType] ?? RACE_TYPES.standard,
    stintCap: (race = cur()) => api.raceTypeOf(race).stintCap,
    stintsLeft: (race = cur()) => Math.max(0, api.stintCap(race) - (race?.stints?.length ?? 0)),
    // → null (a stint can start) or the reason it can't
    stintWhy(sim, race = cur()) {
      const c = sim?.car('PLAYER');
      if (!race || !c) return 'No race';
      if (!api.stintsLeft(race)) return api.stintCap(race) > 1 ? 'Both stints used' : 'Stint used (1 a race)';
      if (sim.done || c.finished || sim.leaderFinished) return 'The race is over';
      if (c.retired) return 'Your car is out';
      if (sim.t < RACE.startLights + 2) return 'After the start';
      if (c.pit) return 'Not during a pit stop';
      if (sim.caution) return 'Not under caution';
      if (race.laps - Math.max(0, c.s) / sim.geo.length < DRIVE_STINT.minLapsLeft) return 'Too close to the flag';
      return null;
    },
    // A stint is over: its record joins the race (saved) and the team's records.
    stintDone(rec, race = cur()) {
      if (!race || !rec) return;
      race.stints.push({ ...rec });
      bus.emit('stint:done', { record: rec, race });
    },
    serialize: () => JSON.parse(JSON.stringify({ current: api.current, history: api.history, count: api.count })),
    load(s) {
      api.current = s?.current ? JSON.parse(JSON.stringify(s.current)) : null;
      const w = api.current;
      if (w) w.weather ??= dryWeather(); // Milestone 17: a race made before weather stays dry
      if (w) {
        w.raceType ??= 'standard'; // Milestone 18
        w.stints ??= [];
      }
      if (w?.kind === 'weekend') {
        // Milestone 15: a weekend saved before it — Normal fuel, Skip repair; an M7 practice was the full value (3 runs)
        w.setup.fuel ??= 'normal';
        w.setup.repair ??= 'skip';
        w.repair ??= null;
        w.driveLap ??= null;
        if (w.practice && w.practice.runs == null) w.practice.runs = w.practice.skipped ? 0 : WEEKEND.practice.maxRuns;
        if (w.practice) w.practice.log ??= [w.practice.knowledge];
        // a Drive lap that was still running when the game closed can't be driven again: qualifying is simulated
        if (w.driveLap?.status === 'running' && !w.quali) w.driveLap = { status: 'abandoned' };
      }
      api.history = JSON.parse(JSON.stringify(s?.history ?? []));
      api.count = s?.count ?? 0;
    },
  };
  return api;
}
