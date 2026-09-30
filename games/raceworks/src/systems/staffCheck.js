// Staff data validator (Milestone 13). Pure: checkStaffData(options) → a list of problems ([] = all good).
//   all 50 load (10 per role: 6 Standard / Rare, 2 Elite, 1 Legendary, 1 Secret) · unique ids · stats 1…tier cap ·
//   trait slots per tier (a signature trait only on Legendary / Secret, outside the slots) · every trait resolves and its
//   rating bonuses sit in −40…+80 and its effect keys are known · every portrait is filed (portraitExists, when given) ·
//   eligibility is data the game understands (a known rank, research node, facility or fact, or a waits note) ·
//   Legendary / Secret are special-arrival only · the founder rule: the five founder choices are Standard, level 1,
//   one per role, start-eligible, and the founder data (data/setup.js) points at them.
// Runs in Node (tests/raceworks/m13.test.mjs, with the portrait files) and at boot with ?debug=1 (no file check).
import { ALL_STAFF, TRAITS, TIERS, ROLES, STAT_KEYS, TRAIT_RATING_RANGE, DRIVER_RATINGS, FOUNDER_IDS } from '../../data/staff.js';
import { FOUNDERS, START_CANDIDATES } from '../../data/setup.js';
import { RANKS } from '../../data/economy.js';
import { RESEARCH } from '../../data/research.js';
import { FACILITIES } from '../../data/facilities.js';
import { TRAIT_EFFECTS } from './staffTraits.js';
import { TEAM_FACTS } from './careers.js';
import { TRACKS } from '../race/tracks.js';

export const ROSTER_SHAPE = { perRole: 10, standardOrRare: 6, elite: 2, legendary: 1, secret: 1 };

export function checkStaffData({ roster = ALL_STAFF, traits = TRAITS, portraitExists = null } = {}) {
  const out = [];
  const bad = (id, msg) => out.push(`${id}: ${msg}`);
  if (roster.length !== 50) out.push(`roster: ${roster.length} rows, not 50`);
  const ids = new Set();
  for (const d of roster) {
    if (ids.has(d.id)) bad(d.id, 'duplicate id');
    ids.add(d.id);
  }
  const ratingIds = new Set(DRIVER_RATINGS.map((r) => r.id));
  const ranks = new Set(RANKS.map((r) => r.id));
  const nodes = new Set(RESEARCH.map((n) => n.id));
  // bible §19 ids the shop doesn't sell yet (F25 Pit Training Rig) are allowed with a waits note
  const facilities = new Set(FACILITIES.map((f) => f.id));

  for (const role of Object.keys(ROLES)) {
    const rows = roster.filter((d) => d.role === role);
    const n = (t) => rows.filter((d) => d.tier === t).length;
    if (rows.length !== ROSTER_SHAPE.perRole) bad(role, `${rows.length} rows, not ${ROSTER_SHAPE.perRole}`);
    if (n('standard') + n('rare') !== ROSTER_SHAPE.standardOrRare) bad(role, 'not 6 Standard / Rare');
    for (const t of ['elite', 'legendary', 'secret']) if (n(t) !== ROSTER_SHAPE[t]) bad(role, `not ${ROSTER_SHAPE[t]} ${t}`);
  }

  for (const d of roster) {
    const tier = TIERS[d.tier];
    if (!ROLES[d.role]) bad(d.id, `unknown role ${d.role}`);
    else if (!d.id.startsWith(ROLES[d.role].code)) bad(d.id, `id doesn't match the ${d.role} role`);
    if (!tier) {
      bad(d.id, `unknown tier ${d.tier}`);
      continue;
    }
    if (!d.name) bad(d.id, 'no name');
    if (!(d.startLevel >= 1 && d.startLevel <= 50)) bad(d.id, `level ${d.startLevel} outside 1–50`);
    if (!(d.salary > 0)) bad(d.id, 'no salary');
    for (const k of STAT_KEYS) {
      const v = d.stats?.[k];
      if (!Number.isInteger(v) || v < 1 || v > tier.statCap) bad(d.id, `${k} ${v} outside 1–${tier.statCap} (${tier.name} cap)`);
    }
    const normal = d.traits.filter((t) => !traits[t]?.signature);
    const sig = d.traits.filter((t) => traits[t]?.signature);
    if (!d.traits.length) bad(d.id, 'no trait');
    if (normal.length > tier.traitSlots) bad(d.id, `${normal.length} traits, ${tier.name} has ${tier.traitSlots} slot(s)`);
    if (sig.length && !tier.signature) bad(d.id, `signature trait on a ${tier.name} person`);
    if (sig.length > 1) bad(d.id, 'more than one signature trait');
    for (const t of d.traits) {
      const def = traits[t];
      if (!def) {
        bad(d.id, `trait ${t} doesn't resolve`);
        continue;
      }
      if (!def.name || !def.text) bad(d.id, `trait ${t} has no name / text`);
      for (const [k, v] of Object.entries(def.ratings ?? {})) {
        if (!ratingIds.has(k)) bad(d.id, `trait ${t}: unknown rating ${k}`);
        if (v < TRAIT_RATING_RANGE.min || v > TRAIT_RATING_RANGE.max) bad(d.id, `trait ${t}: ${k} ${v} outside ${TRAIT_RATING_RANGE.min}…${TRAIT_RATING_RANGE.max}`);
      }
      for (const k of Object.keys(def.effects ?? {})) if (!TRAIT_EFFECTS[k]) bad(d.id, `trait ${t}: unknown effect ${k}`);
      if (!def.ratings && !def.effects) bad(d.id, `trait ${t} does nothing`);
    }
    if (d.art !== `staff_${d.id.toLowerCase()}`) bad(d.id, `portrait key ${d.art}`);
    if (portraitExists && !portraitExists(d.art)) bad(d.id, `portrait ${d.art}.png is missing`);

    // eligibility
    const e = d.eligibility;
    if (!e?.text) {
      bad(d.id, 'no eligibility');
      continue;
    }
    if (e.rank && !ranks.has(e.rank)) bad(d.id, `unknown rank ${e.rank}`);
    if (!e.start && !e.rank && !(e.all ?? []).length) bad(d.id, 'eligibility with no condition');
    for (const c of e.all ?? []) {
      if (c.secret || c.waits) {
        if (!c.waits) bad(d.id, 'a special-arrival condition without its milestone');
        continue;
      }
      if (c.research && !nodes.has(c.research)) bad(d.id, `unknown research ${c.research}`);
      else if (c.facility && !facilities.has(c.facility)) bad(d.id, `unknown facility ${c.facility}`);
      else if (c.count && (!TEAM_FACTS[c.count] || !(c.n > 0))) bad(d.id, `unknown fact ${c.count}`);
      else if (c.trackWin && !TRACKS[c.trackWin]) bad(d.id, `unknown track ${c.trackWin}`); // Milestone 19
      else if (!c.research && !c.facility && !c.count && !c.trackWin) bad(d.id, 'a condition the game doesn’t understand');
    }
    const special = (e.all ?? []).some((c) => c.secret);
    if (!!tier.signature !== special) bad(d.id, special ? 'special arrival but not Legendary / Secret' : `${tier.name} must be special-arrival only`);
    if (e.start && d.tier !== 'standard') bad(d.id, 'a start candidate must be Standard');
  }

  // the founder rule (spec §2 / §9)
  const byId = Object.fromEntries(roster.map((d) => [d.id, d]));
  if (FOUNDERS.map((f) => f.id).join() !== FOUNDER_IDS.join()) out.push('founders: data/setup.js and data/staff.js disagree');
  const founderRoles = new Set();
  for (const id of FOUNDER_IDS) {
    const d = byId[id];
    if (!d) {
      bad(id, 'founder choice missing');
      continue;
    }
    founderRoles.add(d.role);
    if (d.tier !== 'standard' || d.startLevel !== 1 || !d.eligibility?.start) bad(id, 'a founder choice must be a Standard level-1 start row');
  }
  if (founderRoles.size !== 5) out.push('founders: not one per role');
  for (const f of FOUNDERS) for (const id of f.team ?? []) if (!byId[id]?.eligibility?.start) bad(f.id, `starting team member ${id} is not a start row`);
  for (const id of START_CANDIDATES) if (!/candidate/i.test(byId[id]?.eligibility?.text ?? '')) bad(id, 'listed as a start candidate but the row says otherwise');
  return out;
}
