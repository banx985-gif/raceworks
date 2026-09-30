// Staff eligibility (Milestone 13, bible §11 "Initial eligibility"): whether a named person can be found by ordinary
// recruitment now, from the row's eligibility data (data/staff.js). Recruitment adds its own rules on top (tier by rank,
// channel bands, nobody twice, the founder never).
//   Wired now: rank, finished research, facilities standing in the garage, and the team's race / car records
//   (src/systems/careers.js TEAM_FACTS: race starts, wins, poles, setup scores, places gained, clean finishes, cars
//   built, class wins).
//   Dormant (a condition with `waits`): facts the game doesn't track yet — weather, race repairs, neutralisations,
//   strategy swings, the Pit Training Rig / Strategy Room, the other 11 tracks. They say which milestone they wait for.
//   Legendary / Secret (a `secret` condition): special arrival only — never an ordinary pool (Milestones 24–25).
// Once every condition of a row has held, the team remembers it (careers.unlocked) and the person stays findable, even
// if a facility is later sold.
import { rankIndexOf } from '../../../../core/CompanyRank.js';
import { RANKS } from '../../data/economy.js';
import { TEAM_FACTS } from './careers.js';
import { RESEARCH } from '../../data/research.js';
import { FACILITIES } from '../../data/facilities.js';

const nodeName = (id) => RESEARCH.find((n) => n.id === id)?.name ?? id;
const facilityName = (id) => FACILITIES.find((f) => f.id === id)?.name ?? id;

// One condition → { met, text, waits?, progress? }.
export function conditionState(c, ctx) {
  if (c.secret) return { met: false, secret: true, waits: c.waits, text: 'Special arrival' };
  if (c.waits) return { met: false, waits: c.waits, text: c.facility ? facilityName(c.facility) : 'Not tracked yet' };
  if (c.research) return { met: ctx.researchDone(c.research), text: `Research ${nodeName(c.research)}` };
  if (c.facility) return { met: ctx.facilityBuilt(c.facility), text: `Build the ${facilityName(c.facility)}` };
  if (c.count) {
    const have = ctx.fact(c.count);
    return { met: have >= c.n, text: `${c.n} ${TEAM_FACTS[c.count] ?? c.count}`, progress: `${Math.min(have, c.n)} of ${c.n}` };
  }
  return { met: false, text: 'Unknown condition' };
}

// ctx: { rankIndex(), researchDone(id), facilityBuilt(id), fact(key), unlocked: Set } → null (eligible) or the reason.
export function eligibilityWhy(def, ctx) {
  const e = def?.eligibility;
  if (!e) return 'Not an ordinary candidate';
  if (e.start) return null;
  if (ctx.unlocked?.has(def.id)) return null;
  const states = (e.all ?? []).map((c) => conditionState(c, ctx));
  const secret = states.find((s) => s.secret);
  if (secret) return `Arrives only as a special arrival (${secret.waits})`;
  if (e.rank && ctx.rankIndex() < rankIndexOf(RANKS, e.rank)) return `Needs Rank ${e.rank}${states.length ? ` + ${e.text.replace(/^Rank \w\+? ?\+ ?/, '')}` : ''}`;
  const dormant = states.find((s) => s.waits);
  if (dormant) return `Arrives later: ${e.text} (waits for ${dormant.waits})`;
  const open = states.find((s) => !s.met);
  if (open) return `Needs: ${open.text}${open.progress ? ` (${open.progress})` : ''}`;
  return null;
}

// The team's context for eligibilityWhy.
export function eligibilityContext(team) {
  return {
    rankIndex: () => team.money.reputation.highestRankIndex,
    researchDone: (id) => (team.research?.doneIds() ?? []).includes(id),
    facilityBuilt: (id) => (team.facilities?.builtIds() ?? []).includes(id),
    fact: (key) => team.careers?.fact(key) ?? 0,
    unlocked: new Set(team.careers?.unlocked ?? []),
  };
}

// Is this row dormant (a condition waiting for a later milestone) or special-arrival only?
export const isDormant = (def) => (def?.eligibility?.all ?? []).some((c) => c.waits);
export const isSpecial = (def) => (def?.eligibility?.all ?? []).some((c) => c.secret);
