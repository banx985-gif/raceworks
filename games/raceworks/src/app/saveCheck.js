// Save checks (Milestone 30, bible §44): the schema a run save and an account save must have to be used. A copy that
// fails is treated like a damaged one (core/SaveStore validate: the load falls back to the copy before it). Built on
// core/DataValidator; the run check ends with a dry load into a throwaway Team, so a save that would break the game on
// load never becomes the current one.
//   validateRun(data) → [] or the problems        validateAccount(data) → [] or the problems
//   ACCOUNT_MIGRATIONS (core/SaveStore migrateSave steps for the account store)    blankAccount() → the v2 shape
import { DataValidator } from '../../../../core/DataValidator.js';
import { RUN_KIND, ACCOUNT_KIND, RUN_BLOCKS, ACCOUNT_BLOCKS } from '../../data/save.js';
import { TRACKS } from '../race/tracks.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const objOrNull = (v) => v === null || isObj(v);

// Plain shape rules first (cheap, and they name the problem); then the dry load.
export function runShapeProblems(data) {
  const v = new DataValidator();
  if (!v.check(isObj(data), 'the save holds no team')) return v.report().errors;
  v.check(data.kind === RUN_KIND, `not a RACEWORKS team save (kind "${data.kind}")`);
  for (const k of RUN_BLOCKS) v.check(k in data, `block "${k}" is missing`);
  const c = data.clock;
  if (v.check(isObj(c), 'the calendar is missing')) {
    v.check(Number.isInteger(c.totalDays) && c.totalDays >= 0, `the calendar's day count "${c.totalDays}" is not a whole number of 0 or more`);
    v.check(Number.isInteger(c.year) && c.year >= 1, `the calendar's year "${c.year}" is wrong`);
    v.check(Number.isInteger(c.month) && c.month >= 1, `the calendar's month "${c.month}" is wrong`);
  }
  v.check(data.rng != null, 'the random number state is missing');
  if (v.check(Array.isArray(data.staff), 'the staff list is missing')) {
    v.uniqueIds('staff', data.staff.filter(isObj));
    for (const s of data.staff) v.check(isObj(s) && isObj(s.stats), `a staff entry (${s?.id ?? '?'}) has no stats`);
  }
  if (v.check(isObj(data.setup), 'the team setup is missing')) v.check(typeof data.setup.teamName === 'string', 'the team has no name');
  v.check(isNum(data.playSeconds) && data.playSeconds >= 0, 'the play time is not a number');
  for (const k of ['cars', 'money', 'facilities', 'research', 'recruitment', 'training', 'careers', 'championships', 'sponsors', 'events', 'secrets', 'items', 'achievements', 'ending', 'ngPlus', 'monetisation']) v.check(objOrNull(data[k]), `block "${k}" is not an object`);
  const r = data.races;
  if (v.check(objOrNull(r), 'block "races" is not an object') && r) {
    v.check(Array.isArray(r.history ?? []), 'the race history is not a list');
    const w = r.current;
    if (w != null && v.check(isObj(w), 'the race in progress is broken')) {
      v.check(!!TRACKS[w.trackId], `the race in progress is on an unknown track "${w.trackId}"`);
      v.check(w.seed != null, 'the race in progress has no seed');
      v.check(Array.isArray(w.entries) && w.entries.some((e) => e?.isPlayer), 'the race in progress has no player car');
      if (w.state != null && v.check(isObj(w.state), 'the race state is broken')) {
        v.check(isNum(w.state.t) && Array.isArray(w.state.cars), 'the race state has no time or cars');
        v.check(w.state.rng != null, 'the race state has no random number state');
      }
    }
  }
  return v.report().errors;
}

// The run check: the shape, then a dry load (makeTeam() → a throwaway Team; main.js and the tests give it).
export function createRunCheck(makeTeam) {
  return function validateRun(data) {
    const problems = runShapeProblems(data);
    if (problems.length) return problems;
    try {
      makeTeam().load(JSON.parse(JSON.stringify(data)));
    } catch (err) {
      return [`it would not load: ${err?.message ?? err}`];
    }
    return [];
  };
}

export const blankAccount = () => ({ kind: ACCOUNT_KIND, ...Object.fromEntries(ACCOUNT_BLOCKS.map((k) => [k, null])) });

export function validateAccount(data) {
  const v = new DataValidator();
  if (!v.check(isObj(data), 'the account holds nothing')) return v.report().errors;
  // (a brand-new account written before its first block may carry no kind yet; anything else must be ours)
  v.check(data.kind == null || data.kind === ACCOUNT_KIND, `not a RACEWORKS account (kind "${data.kind}")`);
  for (const k of ACCOUNT_BLOCKS) v.check(data[k] == null || isObj(data[k]), `account block "${k}" is not an object`);
  return v.report().errors;
}

// The account store's own migrations (core/SaveStore migrateSave; pure: each returns a new record).
//   1 → 2 (Milestone 30): the normalised shape — every block key present (null when never written), the kind; every
//   other key (the last slot played, the pre-4b move marker) carried over untouched.
//   2 → 3 (Milestone 31): the 'store' block (null: nothing bought on this device yet).
export const ACCOUNT_MIGRATIONS = {
  1: (record) => ({ ...record, data: { ...blankAccount(), ...record.data, kind: ACCOUNT_KIND } }),
  2: (record) => ({ ...record, data: { store: null, ...record.data } }),
};
