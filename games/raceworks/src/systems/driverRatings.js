// The six derived driver ratings (bible §10.3). Pure: the same staff numbers always give the same ratings.
//   driverRatings(staff, { ratings, traits, condition, range }) → { qualifying, racecraft, wet, tyreCare, consistency, feedback }
//     staff: { stats, traits, status } (a core StaffModel or plain object)
//   createRatingsCache(options) → { get(staff) }  recalculates only when the stats, Energy/Morale, status or traits change
import { DRIVER_RATINGS, TRAITS, RATING_CONDITION, RATING_RANGE } from '../../data/staff.js';

const DEFAULTS = { ratings: DRIVER_RATINGS, traits: TRAITS, condition: RATING_CONDITION, range: RATING_RANGE };

export function driverRatings(staff, opts = {}) {
  const { ratings, traits, condition, range } = { ...DEFAULTS, ...opts };
  let mult = 1;
  for (const [status, m] of Object.entries(condition)) if (staff.status?.[status]) mult *= m;
  const out = {};
  for (const r of ratings) {
    let v = 0;
    for (const [stat, w] of Object.entries(r.weights)) v += w * (staff.stats?.[stat] ?? 0);
    for (const t of staff.traits ?? []) v += traits[t]?.ratings?.[r.id] ?? 0;
    out[r.id] = Math.min(range.max, Math.max(range.min, Math.round(v * mult)));
  }
  return out;
}

// Everything the ratings depend on, as one string.
export function ratingsKey(staff) {
  return JSON.stringify([staff.stats, staff.energy, staff.morale, staff.status, staff.traits]);
}

export function createRatingsCache(opts = {}) {
  const cache = new Map(); // staff id → { key, ratings }
  const cacheObj = {
    recalcs: 0, // how many times anything was recalculated (tests)
    get(staff) {
      const key = ratingsKey(staff);
      const hit = cache.get(staff.id);
      if (hit && hit.key === key) return hit.ratings;
      const ratings = driverRatings(staff, opts);
      cache.set(staff.id, { key, ratings });
      cacheObj.recalcs++;
      return ratings;
    },
  };
  return cacheObj;
}
