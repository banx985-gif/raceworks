// Weather (Milestone 17, bible §21, §23.7): the weekend's weather timeline, the crew's forecast of it, and what each state
// does to each tyre. Pure: the same seed always gives the same timeline and the same forecast.
//   makeWeather(seed, laps, rainChance) → { v, rainChance, start, changes: [{ at, to }] } — fixed when the weekend begins
//     and saved with it (a reload never rerolls it). at = race distance in laps (the leader's).
//   dryWeather() → a timeline that stays dry (the debug Test Race, and a race saved before Milestone 17)
//   stateAt(weather, x) → 'dry' | 'damp' | 'wet' | 'storm' at race distance x
//   forecast(weather, { u, seed, x, laps }) → { now, exact, laps, events: [{ from, to, lo, hi, centre, false? }] } — the
//     true timeline blurred by the uncertainty u (0–100); it sharpens as a change comes closer. u = 0: exact.
//   forecastText(fc) → "Dry → light rain around lap 8?" · forecastError(weather, u, seed, laps) (tests)
//   weatherPace(tyre, state) · weatherWear(tyre, state) · weatherSpin(tyre, state) · suitable(tyre, state) ·
//   bestTyreFor(state, open) → the right open tyre for a wet state (null in the dry, or when none is open)
import { Rng } from '../../../../core/Rng.js';
import { WEATHER, WEATHER_STATES, WEATHER_NAMES, WEATHER_TYRE } from '../../data/race.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
export const stateIndex = (s) => Math.max(0, WEATHER_STATES.indexOf(s));

export const dryWeather = () => ({ v: 1, rainChance: 0, start: 'dry', changes: [] });

// The seeded timeline (data/race.js WEATHER). One step at a time, at most one change a lap, none on the first lap.
export function makeWeather(seed, laps, rainChance = 0) {
  const W = WEATHER;
  const rng = new Rng(`weather:${seed}`);
  const perLap = rainChance > 0 ? 1 - Math.pow(1 - rainChance, 1 / Math.max(1, laps - 1)) : 0;
  const wetStart = rng.next() < rainChance * W.startWet;
  const deeper = rng.next();
  let s = wetStart ? (deeper < 0.6 ? 'damp' : 'wet') : 'dry';
  const start = s;
  const changes = [];
  for (let k = 0; k < laps; k++) {
    const r = rng.next();
    const u = rng.range(0.15, 0.85); // where in the lap it happens (always drawn: the draws never depend on the state)
    if (k === 0 || changes.length >= W.maxChanges) continue;
    const o = W.odds[s];
    let to = null;
    if (s === 'dry') to = r < perLap ? 'damp' : null;
    else if (r < (o.up ?? 0)) to = WEATHER_STATES[stateIndex(s) + 1];
    else if (r < (o.up ?? 0) + (o.down ?? 0)) to = WEATHER_STATES[stateIndex(s) - 1];
    if (to) {
      changes.push({ at: r3(k + u), to });
      s = to;
    }
  }
  return { v: 1, rainChance, start, changes };
}

export function stateAt(weather, x) {
  let s = weather?.start ?? 'dry';
  for (const c of weather?.changes ?? []) if (c.at <= x) s = c.to;
  return s;
}
// Did the race see rain (Damp or worse) at any point up to race distance x?
export const wetBy = (weather, x = Infinity) => stateIndex(weather?.start) > 0 || (weather?.changes ?? []).some((c) => c.at <= x && stateIndex(c.to) > 0);

// The forecast (data/race.js WEATHER.forecast): every draw is per event, so moving along the race only sharpens it.
export function forecast(weather, { u = 100, seed = '', x = 0, laps = 12 } = {}) {
  const F = WEATHER.forecast;
  const scale = clamp(u, 0, 100) / 100;
  const blur = (at) => scale * clamp((at - x) / F.horizonLaps, F.nearShare, 1);
  const events = [];
  let from = weather?.start ?? 'dry';
  (weather?.changes ?? []).forEach((c, i) => {
    const prev = from;
    from = c.to;
    if (c.at <= x) return;
    const r = new Rng(`forecast:${seed}:${i}`);
    const e1 = r.range(-1, 1);
    const e2 = r.next();
    const e3 = r.next();
    const e4 = r.next();
    const b = blur(c.at);
    if (e3 < F.missX * b && c.at - x > F.seeLaps) return; // the crew hasn't seen this one coming yet
    let to = c.to;
    if (e2 < F.stepX * b) {
      // one step off: lighter or heavier, never "no change"
      const opts = [stateIndex(to) - 1, stateIndex(to) + 1].filter((k) => k >= 0 && k < WEATHER_STATES.length && WEATHER_STATES[k] !== prev);
      if (opts.length) to = WEATHER_STATES[opts[e4 < 0.5 ? 0 : opts.length - 1]];
    }
    const centre = clamp(c.at + e1 * F.shiftLaps * b, x, laps);
    const half = F.halfLaps * b;
    events.push({ from: prev, to, lo: r3(Math.max(x, centre - half)), hi: r3(Math.min(laps, Math.max(x, centre + half))), centre: r3(centre), at: c.at });
  });
  // False alarms: light rain that never comes (only while the true timeline is dry there), until a lap before it.
  const fa = new Rng(`falseAlarm:${seed}`);
  for (let j = 0; j < F.falseMax; j++) {
    const p = fa.next();
    const at = fa.range(1.5, Math.max(2, laps - 1.5));
    const e1 = fa.range(-1, 1);
    if (p >= F.falseX * scale || x >= at - 1 || stateAt(weather, at) !== 'dry' || stateAt(weather, x) !== 'dry') continue;
    const b = blur(at);
    const centre = clamp(at + e1 * F.shiftLaps * b, x, laps);
    const half = F.halfLaps * b;
    events.push({ from: 'dry', to: 'damp', lo: r3(Math.max(x, centre - half)), hi: r3(Math.min(laps, centre + half)), centre: r3(centre), false: true });
  }
  events.sort((a, b) => a.lo - b.lo || a.centre - b.centre);
  return { now: stateAt(weather, x), exact: scale === 0, laps, events };
}

const UP = { damp: 'light rain', wet: 'rain', storm: 'a storm' };
const DOWN = { dry: 'drying', damp: 'rain easing', wet: 'storm easing' };
export const changeWord = (from, to) => (stateIndex(to) > stateIndex(from) ? UP[to] : DOWN[to]) ?? WEATHER_NAMES[to];

// "Dry → light rain around lap 8?" (a range when the crew is unsure; no "?" when it's exact).
export function forecastText(fc, { short = false } = {}) {
  const now = WEATHER_NAMES[fc.now] ?? 'Dry';
  if (!fc.events.length) return `${now} to the flag`;
  const lap = (v) => clamp(Math.floor(v) + 1, 1, fc.laps);
  const part = (e) => {
    const a = lap(e.lo);
    const b = lap(e.hi);
    return `${changeWord(e.from, e.to)} ${a === b ? `around lap ${a}` : `around laps ${a}–${b}`}${fc.exact ? '' : '?'}`;
  };
  const [e1, e2] = fc.events;
  return `${now} → ${part(e1)}${e2 && !short ? `, then ${part(e2)}` : ''}`;
}

// How wrong a pre-race forecast is (tests): each real change's lap error + its range width + a wrong state (1) or a miss
// (3), plus 2 for every false alarm. 0 = exact.
export function forecastError(weather, u, seed, laps) {
  const fc = forecast(weather, { u, seed, x: 0, laps });
  let err = 0;
  const shown = fc.events.filter((e) => !e.false);
  for (const c of weather.changes) {
    const e = shown.find((s) => s.at === c.at);
    if (!e) err += 3;
    else err += Math.abs(e.centre - c.at) + (e.hi - e.lo) + (e.to === c.to ? 0 : 1);
  }
  return err + 2 * fc.events.filter((e) => e.false).length;
}

// --- tyre × weather (data/race.js WEATHER_TYRE) ------------------------------------------------------------------------
const cell = (tyre, state) => WEATHER_TYRE[state]?.[tyre] ?? {};
// Lap-time multiplier for this tyre in this state (on top of the tyre's own dry pace).
export const weatherPace = (tyre, state = 'dry') => (1 + (WEATHER_TYRE.track[state] ?? 0)) * (1 + (cell(tyre, state).time ?? 0));
export const weatherWear = (tyre, state = 'dry') => cell(tyre, state).wear ?? 1;
export const weatherSpin = (tyre, state = 'dry') => cell(tyre, state).spin ?? 1;
export const suitable = (tyre, state = 'dry') => (WEATHER_TYRE.suitable[state] ?? []).includes(tyre);
export function bestTyreFor(state, open) {
  if (state === 'dry') return null;
  return WEATHER_TYRE.suitable[state].find((t) => open.includes(t)) ?? null;
}
