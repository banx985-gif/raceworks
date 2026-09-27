// The field builder (Milestone 6, bible §23.2 / §28.2): who races. Every entry has a named driver — no driverless cars.
//   1. the player's entry (their best driver in their chosen finished car, their crew)
//   2. each rival team's primary driver, in rivalPool order
//   3. second rival drivers while the field needs more
//   4. privateer templates A–F for any places left
// Everything is copied into the entry (a snapshot), so the race can never change once it has been created.
// The grid order (before Milestone 7's qualifying) is a seeded shuffle, fixed by the race seed.
import { Rng } from '../../../../core/Rng.js';
import { RIVAL_TEAMS, PRIVATEERS, FIELD_CAP } from '../../data/rivals.js';
import { RACE } from '../../data/race.js';
import { CLASSES, familyOfArt } from '../../data/cars.js';
import { TEAM_COLOURS } from '../../data/setup.js';

const SIX = ['qualifying', 'racecraft', 'wet', 'tyreCare', 'consistency', 'feedback'];
const clampRating = (v) => Math.max(1, Math.min(999, Math.round(v)));

// The team's crew factor 0–400 (bible §23.4): the best Engineer / Strategist / Mechanic / Aero stat in the team.
export function crewFactor(roster, mix = RACE.crewMix) {
  let t = 0;
  for (const [stat, w] of Object.entries(mix)) t += w * Math.max(0, ...roster.map((s) => s.stats[stat] ?? 0));
  return Math.round(t);
}

// The team's race driver: the Driver-role person with the best Racecraft (else anyone with the best).
export function raceDriver(team) {
  const drivers = team.roster.filter((s) => team.isDriver(s));
  const pool = drivers.length ? drivers : team.roster;
  return [...pool].sort((a, b) => team.ratingsOf(b).racecraft - team.ratingsOf(a).racecraft)[0] ?? null;
}

export function playerEntry(team, rec) {
  const d = raceDriver(team);
  const r = team.ratingsOf(d);
  const colour = TEAM_COLOURS.find((c) => c.id === team.setup.colour) ?? TEAM_COLOURS[0];
  return {
    id: 'PLAYER',
    name: d.name,
    driverId: d.id,
    team: team.setup.teamName,
    isPlayer: true,
    // the car's own visual family (Milestone 9: saved with the car; older cars: from their showcase picture)
    sprite: rec.result.raceArt ?? familyOfArt(rec.result.art)?.top ?? CLASSES[rec.result.classId]?.raceArt ?? 'car_v01_top',
    colour: colour.main,
    ratings: Object.fromEntries(SIX.map((k) => [k, clampRating(r[k])])),
    car: { ...rec.result.stats },
    crew: crewFactor(team.roster),
    openFaults: rec.result.faults,
    condition: rec.condition ?? 100,
    carNumber: rec.number,
    carName: rec.name,
  };
}

export function buildField({ player, rivalPool, band, fieldSize, seed }) {
  const size = Math.min(FIELD_CAP, fieldSize);
  const entries = [player];
  const teams = rivalPool.map((id) => ({ id, def: RIVAL_TEAMS[id] })).filter((t) => t.def);
  const rival = (t, d) => ({
    id: d.id,
    name: d.name,
    team: t.def.name,
    teamId: t.id,
    sprite: t.def.sprite,
    colour: t.def.colour,
    ratings: Object.fromEntries(SIX.map((k) => [k, clampRating(d.ratings[k])])),
    car: { ...t.def.bands[band].car },
    crew: t.def.bands[band].crew,
    openFaults: 0,
    condition: 100,
  });
  for (const t of teams) if (entries.length < size) entries.push(rival(t, t.def.drivers[0]));
  for (const t of teams) if (entries.length < size && t.def.drivers[1]) entries.push(rival(t, t.def.drivers[1]));
  for (const p of PRIVATEERS) {
    if (entries.length >= size) break;
    entries.push({ id: p.id, name: p.name, team: p.team, sprite: p.sprite, colour: '#8A8F98', ratings: Object.fromEntries(SIX.map((k) => [k, clampRating(p.ratings[k])])), car: { ...p.car }, crew: p.crew, openFaults: 0, condition: 100 });
  }
  const grid = new Rng(`grid:${seed}`).shuffle(entries.map((e) => e.id));
  return { entries, grid };
}
