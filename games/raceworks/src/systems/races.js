// The team's races (Milestone 6): the race being run (created with a fixed seed and a snapshot of the field, saved
// with the team, so a reload can never reroll it), and the results so far.
//   races.current → { n, seed, trackId, laps, entries, grid, carNumber, createdDay, state, status } or null
//   races.createTestRace({ carNumber }) → { ok, race } | { ok: false, reason }   (Compete → Test Race)
//   races.sim() → the current race's core model (src/race/raceSim.js), carried on from its saved state
//   races.keep(sim) → store the model's state in the race (the next save keeps it)
//   races.finish(sim) → the result: the player's car wears (Condition), the result joins races.history
//   races.history → [{ n, trackId, laps, day, carNumber, result, wear }] newest last (kept to HISTORY_KEEP)
import { createRaceSim } from '../race/raceSim.js';
import { buildField, playerEntry } from '../race/field.js';
import { TRACKS, geoOf } from '../race/tracks.js';
import { TEST_RACE } from '../../data/rivals.js';
import { RACE } from '../../data/race.js';

const HISTORY_KEEP = 30;

export function createRaces({ bus, team }) {
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
      const n = ++api.count;
      const seed = api.seedFor(n);
      const track = TRACKS[config.trackId];
      const { entries, grid } = buildField({ player: playerEntry(team, rec), rivalPool: config.rivalPool, band: config.band, fieldSize: config.fieldSize, seed });
      api.current = { n, kind: 'test', seed, trackId: track.id, laps: track.laps, entries, grid, carNumber: rec.number, createdDay: team.clock.totalDays, state: null, status: 'ready' };
      bus.emit('race:created', { race: api.current });
      return { ok: true, race: api.current };
    },
    sim(race = api.current) {
      if (!race) return null;
      const sim = createRaceSim({ track: TRACKS[race.trackId], geo: geoOf(race.trackId), entries: race.entries, laps: race.laps, seed: race.seed, grid: race.grid });
      if (race.state) sim.load(race.state);
      return sim;
    },
    keep(sim) {
      if (!api.current || !sim) return;
      api.current.state = sim.serialize();
      api.current.status = sim.done ? 'done' : sim.t > 0 ? 'running' : 'ready';
    },
    // The race is over: wear on the player's car, the result into the history.
    finish(sim) {
      const race = api.current;
      if (!race || !sim?.done) return null;
      const result = sim.result();
      const me = result.rows.find((r) => r.isPlayer);
      const w = RACE.wear;
      const wear = Math.round(w.perLap * (me?.laps ?? 0) + w.failure * (me?.fails.filter((f) => f !== 'paceLoss').length ?? 0) + w.contact * (me?.contacts ?? 0));
      const rec = team.cars.cars.get(race.carNumber);
      if (rec) rec.condition = Math.max(0, (rec.condition ?? 100) - wear);
      const entry = { n: race.n, kind: race.kind, trackId: race.trackId, laps: race.laps, day: team.clock.totalDays, carNumber: race.carNumber, seed: race.seed, result, wear };
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
