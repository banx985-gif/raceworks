// The facts sponsor obligations and development contracts count (Milestone 21), and the tiny predicate language their
// data is written in (data/sponsors.js explains both). Pure functions: the tests call them with made-up counters.
//   raceFacts(entry)         a finished race (races.history entry) → the race facts
//   carFacts(record)         a finished car (Car Garage record) → the car facts
//   matchWhere(facts, where) → do these facts match a data filter
//   testPredicate(test, counters) → does this obligation test hold for these counters
//   effTarget(champId)       a championship's efficiency target (VoltCell)
import { champById, CHAMP_BANDS } from '../../data/championships.js';
import { CLASSES } from '../../data/cars.js';
import { TYRE_FAILS, EFF_TARGET_SHARE } from '../../data/sponsors.js';

// A failure roll's outcomes (src/race/raceSim.js lapFailureRoll) — 'crash' (contact) is not mechanical.
export const MECHANICAL_FAILS = ['retire', 'forcedPit', 'paceLoss', 'damage'];

export const effTarget = (champId) => (CHAMP_BANDS[champId] ? Math.round((CHAMP_BANDS[champId].carLevel * EFF_TARGET_SHARE) / 5) * 5 : null);

// Pit stops with pitError = false: every stop that wasn't forced by a fault or taken outside the window. A race from
// before Milestone 21 has no pitErrors count: its forced stops and any time lost outside a window count as errors.
export function cleanStopsOf(row) {
  if (!row) return 0;
  const errors = row.pitErrors ?? (row.fails ?? []).filter((f) => f === 'forcedPit').length + ((row.outsideSecs ?? 0) > 0 ? 1 : 0);
  return Math.max(0, (row.stops ?? 0) - errors);
}

export function raceFacts(entry) {
  const row = entry?.result?.rows?.find((r) => r.isPlayer) ?? null;
  const champ = entry?.champ ? champById(entry.champ.id) : null;
  const finished = !!row && row.status !== 'retired' && row.status !== 'running';
  const fails = row?.fails ?? [];
  const target = champ ? effTarget(champ.id) : null;
  const eff = entry?.eff ?? null;
  return {
    n: entry?.n ?? null,
    weekend: entry?.kind === 'weekend',
    champ: !!champ,
    champId: champ?.id ?? null,
    champClasses: champ?.classes ?? [],
    finished,
    pos: row?.pos ?? 99,
    tyreLife: row ? 100 - (row.wear ?? 0) : 0,
    tyreRetire: row?.status === 'retired' && fails.some((f) => TYRE_FAILS.includes(f)),
    mechanical: fails.some((f) => MECHANICAL_FAILS.includes(f)),
    telemetry: !!entry?.telemetry,
    eff,
    effTarget: target,
    effAtTarget: target !== null && eff !== null && eff >= target,
    cleanStops: cleanStopsOf(row),
    sponsored: (entry?.sponsors ?? []).length > 0,
    startTyre: row?.stints?.[0] ?? null,
    fuelStart: entry?.fuelStart ?? null,
    fuelEnd: row?.fuel ?? null,
  };
}

export function carFacts(rec) {
  const r = rec?.result ?? {};
  return { aeroShare: r.aeroShare ?? 0, classTag: CLASSES[r.classId]?.tag ?? null, quality: r.quality ?? 0, parts: r.parts ?? [] };
}

// One filter value against one fact.
function matchOne(fact, want) {
  if (want && typeof want === 'object' && !Array.isArray(want)) {
    if ('gte' in want && !(typeof fact === 'number' && fact >= want.gte)) return false;
    if ('lt' in want && !(typeof fact === 'number' && fact < want.lt)) return false;
    if ('in' in want && !want.in.includes(fact)) return false;
    if ('any' in want && !(Array.isArray(fact) && fact.some((x) => want.any.includes(x)))) return false;
    return true;
  }
  return fact === want;
}

export function matchWhere(facts, where = null) {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => matchOne(facts[k], v));
}

export function testPredicate(t, c) {
  const v = (k) => c[k] ?? 0;
  if (t.all) return t.all.every((x) => testPredicate(x, c));
  if (t.any) return t.any.some((x) => testPredicate(x, c));
  if (t.gte) return v(t.gte[0]) >= t.gte[1];
  if (t.lt) return v(t.lt[0]) < t.lt[1];
  if (t.eq) return v(t.eq[0]) === v(t.eq[1]);
  if (t.ratioGte) return v(t.ratioGte[0]) / Math.max(1, v(t.ratioGte[1])) >= t.ratioGte[2];
  throw new Error(`unknown predicate ${JSON.stringify(t)}`);
}
