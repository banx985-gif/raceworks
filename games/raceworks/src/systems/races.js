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
import { Rng } from '../../../../core/Rng.js';
import { createRaceSim, runQualifying } from '../race/raceSim.js';
import { buildField, playerEntry } from '../race/field.js';
import { TRACKS, geoOf } from '../race/tracks.js';
import { TEST_RACE } from '../../data/rivals.js';
import { RACE, WEEKEND, SETUP_AXES, TYRES, PIT, PRIZES } from '../../data/race.js';

const HISTORY_KEEP = 30;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createRaces({ bus, team }) {
  const cur = () => api.current;
  const best = (stat) => Math.max(0, ...team.roster.map((s) => s.stats[stat] ?? 0));
  // A pit crew's service time from the best Mechanic (a rival's from its crew factor).
  const serviceFor = (mec) => {
    const s = PIT.service;
    return Math.round(clamp(s.base + ((mec - s.mechRef) / 10) * s.perMech10, s.min, s.max) * 100) / 100;
  };

  function newRace(kind, rec, config, laps) {
    const n = ++api.count;
    const seed = api.seedFor(n);
    const track = TRACKS[config.trackId];
    const player = { ...playerEntry(team, rec), pitService: serviceFor(best('MEC')), tyre: 'medium', auto: true };
    const { entries, grid } = buildField({ player, rivalPool: config.rivalPool, band: config.band, fieldSize: config.fieldSize, seed });
    for (const e of entries) if (!e.isPlayer) e.pitService = serviceFor(77 + ((e.crew ?? 80) - 80) / 2);
    return { n, kind, seed, trackId: track.id, laps, entries, grid, carNumber: rec.number, createdDay: team.clock.totalDays, state: null, status: 'ready' };
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

    // --- the race weekend (Milestone 7, bible §22) ----------------------------------------------------------------
    createWeekend({ carNumber = null, config = TEST_RACE } = {}) {
      if (api.current) return { ok: true, race: api.current, existing: true };
      const rec = carNumber ? team.cars.cars.get(carNumber) : team.cars.cars.latest();
      if (!rec) return { ok: false, reason: 'Build a car first (Build → Pit Bay → New car)' };
      const w = newRace('weekend', rec, config, WEEKEND.laps);
      w.grid = null; // set by qualifying
      w.stage = 'practice';
      w.practice = null;
      w.setup = { aero: 0, gearing: 0, suspension: 0, tyre: 'medium', auto: true, touched: false };
      w.quali = null;
      api.current = w;
      bus.emit('race:created', { race: w });
      return { ok: true, race: w };
    },
    // Practice (§22.1): Setup Knowledge 0–100 from the Engineer, the driver's feedback and the crew.
    practiceValue() {
      const p = WEEKEND.practice;
      const me = cur().entries.find((e) => e.isPlayer);
      const raw = p.eng * best('ENG') + p.feedback * me.ratings.feedback + p.crew * ((best('MEC') + best('AER')) / 2);
      return (raw / p.full) * 100;
    },
    runPractice() {
      const w = cur();
      if (!w || w.kind !== 'weekend' || w.stage !== 'practice') return null;
      const u = new Rng(`practice:${w.seed}`).range(-1, 1) * WEEKEND.practice.variance;
      w.practice = { knowledge: Math.round(clamp(api.practiceValue() + u, 0, 100)), skipped: false };
      w.stage = 'setup';
      api.autoSetup(true);
      bus.emit('race:progress', {});
      return w.practice;
    },
    skipPractice() {
      const w = cur();
      if (!w || w.kind !== 'weekend' || w.stage !== 'practice') return null;
      w.practice = { knowledge: Math.round(clamp(api.practiceValue() * WEEKEND.practice.skipShare, 0, 100)), skipped: true };
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
    // What the engineer says per axis: nothing below hintFrom knowledge, a range, or one option from exactFrom.
    hints() {
      const k = api.knowledge();
      const est = api.estimate();
      const st = WEEKEND.setup;
      const out = {};
      for (const a of SETUP_AXES) {
        if (k < st.hintFrom) out[a.id] = null;
        else {
          const unc = k >= st.exactFrom ? 0 : (1 - k / 100) * 0.8;
          const lo = Math.round(clamp(est[a.id] - unc, -1, 1));
          const hi = Math.round(clamp(est[a.id] + unc, -1, 1));
          out[a.id] = lo === hi ? a.options[lo + 1] : `${a.options[lo + 1]}–${a.options[hi + 1]}`;
        }
      }
      return out;
    },
    // Auto Setup: the option nearest the crew's estimate on each axis.
    autoSetup(quiet = false) {
      const w = cur();
      if (!w || w.quali) return false;
      const est = api.estimate();
      for (const a of SETUP_AXES) w.setup[a.id] = Math.round(est[a.id]);
      w.setup.auto = true;
      if (!quiet) bus.emit('race:progress', {});
      return true;
    },
    setAxis(axis, value) {
      const w = cur();
      if (!w || w.quali || !SETUP_AXES.some((a) => a.id === axis)) return false;
      w.setup[axis] = clamp(Math.round(value), -1, 1);
      w.setup.auto = false;
      w.setup.touched = true;
      bus.emit('race:progress', {});
      return true;
    },
    setTyre(id) {
      const w = cur();
      if (!w || w.quali || !TYRES[id]?.unlocked) return false;
      w.setup.tyre = id;
      bus.emit('race:progress', {});
      return true;
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
    // Qualifying (§22.3): fixed by the weekend seed; locks the setup and sets the grid.
    runQualifying() {
      const w = cur();
      if (!w || w.kind !== 'weekend' || w.stage !== 'setup' || w.quali) return null;
      const rng = new Rng(`rivals:${w.seed}`);
      const rs = WEEKEND.rivalSetup;
      for (const e of w.entries) {
        if (e.isPlayer) {
          e.setup = api.setupScore() / 100;
          e.tyre = w.setup.tyre;
        } else {
          e.setup = Math.round(clamp(rs.base + ((e.ratings.feedback - rs.feedbackRef) / 100) * rs.feedbackPer100 + rng.range(-1, 1) * rs.spread, 0.2, 0.9) * 100) / 100;
          e.tyre = rng.chance(rs.softShare) ? 'soft' : 'medium';
        }
      }
      const rows = runQualifying({ geo: geoOf(w.trackId), entries: w.entries, seed: w.seed });
      w.quali = { rows, setupScore: api.setupScore() };
      w.grid = rows.map((r) => r.id);
      w.stage = 'race';
      bus.emit('race:progress', {});
      return w.quali;
    },

    sim(race = api.current) {
      if (!race || !race.grid) return null;
      const sim = createRaceSim({ track: TRACKS[race.trackId], geo: geoOf(race.trackId), entries: race.entries, laps: race.laps, seed: race.seed, grid: race.grid });
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
      const wear = Math.round(w.perLap * (me?.laps ?? 0) + w.failure * (me?.fails.filter((f) => f !== 'paceLoss').length ?? 0) + w.contact * (me?.contacts ?? 0));
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
      const entry = { n: race.n, kind: race.kind, trackId: race.trackId, laps: race.laps, day: team.clock.totalDays, carNumber: race.carNumber, seed: race.seed, result, wear, prize, reputation, grid: race.grid, quali: race.quali ?? null, setupScore: race.quali?.setupScore ?? null };
      api.history.push(entry);
      if (api.history.length > HISTORY_KEEP) api.history.shift();
      api.current = null;
      bus.emit('race:finished', { race: entry });
      return entry;
    },
    last: () => api.history[api.history.length - 1] ?? null,
    serialize: () => JSON.parse(JSON.stringify({ current: api.current, history: api.history, count: api.count })),
    load(s) {
      api.current = s?.current ? JSON.parse(JSON.stringify(s.current)) : null;
      api.history = JSON.parse(JSON.stringify(s?.history ?? []));
      api.count = s?.count ?? 0;
    },
  };
  return api;
}
