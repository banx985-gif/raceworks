// What traits do (Milestone 13, the trait framework). Traits are data (data/staff.js TRAITS); this file says who each
// effect key counts for and turns them into numbers for the systems that use them, and into words for the screens.
//   Driver-rating traits (ratings) → src/systems/driverRatings.js (bible §10.3).
//   Work traits (effects):
//     car project (the car's team): phasePct (that person's own work in a phase), faultPct, breakthroughPct, testFixPct
//     race crew (bible §10.8): pitServicePct, setupKnowledge, crewPct, tyreWearPct, failurePct
//     core/StaffSystem (that person): xpGainPct, energyLossPct, moraleFloor
//   later: the part whose system isn't built yet (shown on the trait card with the milestone it waits for).
// raceCrew(team) — bible §10.8: the Driver (the one who races), and the best Lead Mechanic, Race Engineer, Aero Designer
// and Strategist on the team (by their role's own stat). A role nobody fills is a generic contractor: no traits, no
// career records.
import { TRAITS, ROLES } from '../../data/staff.js';
import { PHASES } from '../../data/cars.js';
import { raceDriver } from '../race/field.js';

const PHASE_NAME = Object.fromEntries(PHASES.map((p) => [p.id, p.name.split(' ')[0]]));
const pct = (v) => `${v > 0 ? '+' : '−'}${Math.abs(v)}%`;
const pts = (v) => `${v > 0 ? '+' : '−'}${Math.abs(v)}`;

// Every effect key: who it counts for, and how the trait card says it.
export const TRAIT_EFFECTS = {
  phasePct: { scope: 'self', words: (m) => Object.entries(m).map(([ph, v]) => `${PHASE_NAME[ph] ?? ph} work ${pct(v)}`) },
  faultPct: { scope: 'carTeam', words: (v) => [`Car faults ${pct(v)}`] },
  breakthroughPct: { scope: 'carTeam', words: (v) => [`Breakthrough chance ${pts(v)}`] },
  testFixPct: { scope: 'carTeam', words: (v) => [`Testing fixes ${pct(v)}`] },
  pitServicePct: { scope: 'raceCrew', words: (v) => [`Pit stop time ${pct(v)}`] },
  setupKnowledge: { scope: 'raceCrew', words: (v) => [`Setup Knowledge ${pts(v)}`] },
  crewPct: { scope: 'raceCrew', words: (v) => [`Race crew ${pct(v)}`] },
  tyreWearPct: { scope: 'raceCrew', words: (v) => [`Tyre wear ${pct(v)}`] },
  failurePct: { scope: 'raceCrew', words: (v) => [`Race failures ${pct(v)}`] },
  xpGainPct: { scope: 'self', words: (v) => [`XP ${pct(v)}`] },
  energyLossPct: { scope: 'self', words: (v) => [`Energy use ${pct(v)}`] },
  moraleFloor: { scope: 'self', words: (v) => [`Morale never below ${v}`] },
};
export const SCOPE_WORDS = { self: '', carTeam: 'on the car’s team', raceCrew: 'in the race crew' };

// Sum of a number effect over people (each person's traits; a trait counts once per person).
export function effectSum(people, key, traits = TRAITS) {
  let t = 0;
  for (const s of people) for (const id of s?.traits ?? []) t += traits[id]?.effects?.[key] ?? 0;
  return t;
}

// A person's own work in a car-project phase: +phasePct % (1 = no change).
export function phaseMult(s, phaseId, traits = TRAITS) {
  let t = 0;
  for (const id of s?.traits ?? []) t += traits[id]?.effects?.phasePct?.[phaseId] ?? 0;
  return 1 + t / 100;
}

// The race crew (bible §10.8). → { driver, mechanic, engineer, aero, strategist } (a person or null = contractor).
export function raceCrew(team) {
  const driver = raceDriver(team);
  const out = { driver };
  for (const role of ['mechanic', 'engineer', 'aero', 'strategist']) {
    const stat = ROLES[role].primaryStat;
    const pool = team.roster.filter((s) => s.role === role && s !== driver);
    out[role] = pool.sort((a, b) => (b.stats[stat] ?? 0) - (a.stats[stat] ?? 0))[0] ?? null;
  }
  return out;
}
export const crewPeople = (crew) => [...new Set(Object.values(crew).filter(Boolean))];
export const crewEffect = (team, key) => effectSum(crewPeople(raceCrew(team)), key);

// The trait card's words: [line…] — ratings, live effects, then what waits for a later milestone.
export function traitLines(id, { ratingNames = {} } = {}) {
  const t = TRAITS[id];
  if (!t) return [];
  const lines = [];
  const r = Object.entries(t.ratings ?? {}).map(([k, v]) => `${ratingNames[k] ?? k} ${pts(v)}`);
  if (r.length) lines.push(`Ratings: ${r.join(' · ')}`);
  const byScope = {};
  for (const [k, v] of Object.entries(t.effects ?? {})) {
    const e = TRAIT_EFFECTS[k];
    if (e) (byScope[e.scope] ??= []).push(...e.words(v));
  }
  for (const [scope, words] of Object.entries(byScope)) lines.push(SCOPE_WORDS[scope] ? `${words.join(' · ')} (${SCOPE_WORDS[scope]})` : words.join(' · '));
  if (t.strategy) lines.push(`Race strategy: ${t.strategy}`); // Milestone 16 (src/systems/raceStrategy.js)
  if (t.later) lines.push(`Later: ${t.later.text} — ${t.later.waits}`);
  return lines;
}
