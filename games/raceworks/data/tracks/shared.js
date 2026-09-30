// Shared track-data helpers (Milestone 19): the per-kind car-stat demand mixes every circuit starts from, tilted by the
// track's profile (bible §26), and the timing-segment helper. Plain data only. T01 keeps its own copy of the Milestone 6
// mixes (they are the untilted base below).
//   demandFor(tilt) → { straight, braking, corner, exit } — each kind's mix plus the tilt, normalised to sum to 1
//   segOf(DEMAND, REF) → seg(id, from, to, kind, extra) like T01's

// Car-stat demand weights by kind of timing segment (bible §23.4 carFit; sums to 1). PLACEHOLDER mixes (as T01).
export const BASE_DEMAND = {
  straight: { SPD: 0.4, ACC: 0.2, EFF: 0.15, REL: 0.15, TYR: 0.1 },
  braking: { BRK: 0.45, SPD: 0.1, COR: 0.15, REL: 0.1, TYR: 0.2 },
  corner: { COR: 0.45, TYR: 0.2, BRK: 0.1, ACC: 0.15, REL: 0.1 },
  exit: { ACC: 0.45, COR: 0.2, TYR: 0.15, SPD: 0.1, REL: 0.1 },
};
// Reference speed (m/s) of a baseline club car through each kind (corners: from their radius, set per segment).
export const BASE_REF = { straight: 44, braking: 30, corner: 21, exit: 28 };

const r3 = (v) => Math.round(v * 1000) / 1000;

// The profile's tilt (extra weight on some stats, e.g. { SPD: 0.25 }) added to every kind, then normalised.
export function demandFor(tilt = {}) {
  const out = {};
  for (const [kind, mix] of Object.entries(BASE_DEMAND)) {
    const m = { ...mix };
    for (const [k, v] of Object.entries(tilt)) m[k] = (m[k] ?? 0) + v;
    const sum = Object.values(m).reduce((t, v) => t + v, 0);
    const keys = Object.keys(m);
    const norm = Object.fromEntries(keys.map((k) => [k, r3(m[k] / sum)]));
    // make it sum to exactly 1 (the validator checks) by putting the rounding on the largest weight
    const big = keys.reduce((a, b) => (norm[a] >= norm[b] ? a : b));
    norm[big] = r3(norm[big] + 1 - keys.reduce((t, k) => t + norm[k], 0));
    out[kind] = norm;
  }
  return out;
}

export const segOf = (DEMAND, REF = BASE_REF) => (id, from, to, kind, extra = {}) => ({ id, from, to, kind, demand: DEMAND[kind], refSpeed: extra.refSpeed ?? REF[kind], ...extra });
