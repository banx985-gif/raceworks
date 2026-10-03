// The field builder (Milestone 6, bible §23.2 / §28.2): who races. Every entry has a named driver — no driverless cars.
//   1. the player's entry (their best driver in their chosen finished car, their crew)
//   2. each rival team's primary driver, in rivalPool order
//   3. second rival drivers while the field needs more
//   4. privateer templates A–F for any places left
// Everything is copied into the entry (a snapshot), so the race can never change once it has been created.
// The grid order (before Milestone 7's qualifying) is a seeded shuffle, fixed by the race seed.
import { Rng } from '../../../../core/Rng.js';
import { RIVAL_TEAMS, PRIVATEERS, FIELD_CAP, PRIVATEER_TIERS } from '../../data/rivals.js';
import { CHAMP_BANDS, bandIndex, champById } from '../../data/championships.js';
import { RACE } from '../../data/race.js';
import { CLASSES } from '../../data/cars.js';
import { familyOfCar } from '../systems/carVisual.js'; // Milestone 22
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
    sprite: familyOfCar(rec, team).top, // Milestone 22: the resolved family (derived from the car, never saved)
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

// Milestone 20: a championship band (data/championships.js CHAMP_BANDS, 'C01'…'C12') — rival cars from the band's car level
// × the team's shape, crew from the band, drivers' §28.1 ratings grown by driverStep a band past the team's first
// championship, privateers scaled by the championship's tier. Never anything from the player's car (no rubber-banding).
// The M6 'club' band (the practice race) is the teams' own data, as before.
// Milestone 28 (bible §37.4): pct = the New Game+ rival development (+8 / 14 / 20 %, plus a challenge's extra) on the
// band's car level — a fixed band for the run, still nothing from the player's car.
export function rivalCarFor(teamId, band, pct = 0) {
  const def = RIVAL_TEAMS[teamId];
  if (def?.bands?.[band]) return { car: { ...def.bands[band].car }, crew: def.bands[band].crew };
  const b = CHAMP_BANDS[band];
  const car = Object.fromEntries(Object.entries(def.shape).map(([k, v]) => [k, Math.round(b.carLevel * (1 + pct / 100) * v)]));
  return { car, crew: b.crew };
}
export function rivalRatingsFor(teamId, driver, band) {
  const def = RIVAL_TEAMS[teamId];
  const steps = CHAMP_BANDS[band] ? Math.max(0, bandIndex(band) - Math.max(0, bandIndex(def.first))) : 0;
  const x = 1 + (CHAMP_BANDS[band]?.driverStep ?? 0) * steps;
  return Object.fromEntries(SIX.map((k) => [k, clampRating(driver.ratings[k] * x)]));
}

export function buildField({ player, rivalPool, band, fieldSize, seed, rivalPct = 0 }) {
  const size = Math.min(FIELD_CAP, fieldSize);
  const entries = [player];
  const champ = !!CHAMP_BANDS[band];
  const teams = rivalPool.map((id) => ({ id, def: RIVAL_TEAMS[id] })).filter((t) => t.def);
  const rival = (t, d) => {
    const c = rivalCarFor(t.id, band, champ ? rivalPct : 0);
    return {
      id: d.id,
      name: d.name,
      team: t.def.name,
      teamId: t.id,
      sprite: t.def.sprite,
      colour: t.def.colour,
      ratings: rivalRatingsFor(t.id, d, band),
      car: c.car,
      crew: c.crew,
      openFaults: 0,
      condition: 100,
      ...(champ ? { band, strStep: CHAMP_BANDS[band].strStep } : {}),
    };
  };
  for (const t of teams) if (entries.length < size) entries.push(rival(t, t.def.drivers[0]));
  for (const t of teams) if (entries.length < size && t.def.drivers[1]) entries.push(rival(t, t.def.drivers[1]));
  const tier = champ ? PRIVATEER_TIERS[champById(band).tier] : null;
  const privateer = (p, d, suffix = '') => ({
    id: p.id + suffix,
    name: d.name,
    team: p.team,
    sprite: p.sprite,
    colour: '#8A8F98',
    ratings: Object.fromEntries(SIX.map((k) => [k, clampRating(d.ratings[k] * (tier?.ratings ?? 1))])),
    car: tier ? Object.fromEntries(Object.entries(p.car).map(([k, v]) => [k, Math.round(v * tier.car)])) : { ...p.car },
    crew: Math.round(p.crew * (tier?.crew ?? 1)),
    openFaults: 0,
    condition: 100,
  });
  for (const p of PRIVATEERS) {
    if (entries.length >= size) break;
    entries.push(privateer(p, p));
  }
  // Milestone 20: a championship field fills with the privateers' second drivers when it needs more cars
  if (champ) for (const p of PRIVATEERS) if (entries.length < size && p.second) entries.push(privateer(p, p.second, '2'));
  const grid = new Rng(`grid:${seed}`).shuffle(entries.map((e) => e.id));
  return { entries, grid };
}
