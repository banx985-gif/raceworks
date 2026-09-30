// The Auto Strategy planner (Milestone 16, bible §24.1–24.3): one planner for every car — yours on Auto (and as the crew's
// suggestion in Manual), and every rival with its own placeholder strategist. Pure: it reads a car's race state and gives
// back a plan; src/race/raceSim.js calls it each lap (and after a stop or a mode switch) and applies it to cars on Auto.
//   strategyProfile({ str, traits, workPct, autoPct, tyres }) → { str, eff, q 0–1, traits, tyres } — the Strategist's
//     quality (STR, their traits, the Strategy Desk's +8% work and the Strategy Room's Auto Strategy +8%, both passed in
//     from the garage's effect queries)
//   rivalProfile(entry) → the same for a rival car (data/race.js STRATEGY.rivals)
//   forecastOf({ str, workPct, forecastPts, uncertaintyPct }) → { accuracy 0–100, uncertainty } (stored for Milestone 17)
//   planStrategy(ctx) → { stops, pitLap, window { from, to } | null, nextTyre, fuel, repair, reason, cost }
//   stintTime(baseLap, tyre, w0, rate, laps, fuelTime) — the model's time for a stint (tyre pace, wear and the cliff)
//   suggestTyreFor(weather, open, dryChoice) → the tyre the crew calls for this weather (null = no call)
// A weak strategist makes a sound but conservative plan (stops before the tyre cliff, estimates wear roughly); a strong one
// runs the tyres longer (stint extensions), weighs Lean / Normal fuel, and undercuts the car ahead. Every quality's plan is
// sound: no stint may end past STRATEGY.hardWear.
import { STRATEGY, TYRES, TYRE_WEAR, FUEL, PIT_REPAIR, FORECAST, WEATHER_TYRES } from '../../data/race.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const DRY = ['soft', 'medium', 'hard'];
const INFEASIBLE = 1e4;

// Time multiplier for a tyre at this wear (fresh = its compound pace only). (bible §21; Milestone 7's formula)
export function tyreFactor(tyre, wear) {
  const w = TYRE_WEAR;
  const t = TYRES[tyre] ?? TYRES.medium;
  return (1 + t.pace) * (1 + w.wearPace * wear + w.cliffPace * Math.max(0, wear - w.cliff));
}

// The model's time for `laps` laps on one tyre starting at wear w0, wearing `rate` a lap: the tyre factor integrated over
// the wear (closed form, so the planner can cost hundreds of plans a lap).
export function stintTime(baseLap, tyre, w0, rate, laps, fuelTime = 0) {
  if (laps <= 0) return 0;
  const w = TYRE_WEAR;
  const pace = 1 + (TYRES[tyre] ?? TYRES.medium).pace;
  const w1 = w0 + rate * laps;
  let wearTerm = 0;
  if (rate > 0) {
    const lin = (w1 * w1 - w0 * w0) / 2;
    const c0 = Math.max(0, w0 - w.cliff);
    const c1 = Math.max(0, w1 - w.cliff);
    wearTerm = (w.wearPace * lin + (w.cliffPace * (c1 * c1 - c0 * c0)) / 2) / rate;
  } else wearTerm = laps * (w.wearPace * w0 + w.cliffPace * Math.max(0, w0 - w.cliff));
  return baseLap * pace * (laps + wearTerm) * (1 + fuelTime);
}

// The Strategist's planning quality (data/race.js STRATEGY).
export function strategyProfile({ str = STRATEGY.contractorStr, traits = [], workPct = 0, autoPct = 0, tyres = ['soft', 'medium'] } = {}) {
  const S = STRATEGY;
  let eff = str * (1 + workPct / 100) * (1 + autoPct / 100);
  for (const t of traits) eff += S.traitPoints[t] ?? 0;
  const q = clamp((eff - S.strRef) / S.strSpan, 0, 1);
  return { str, eff: Math.round(eff), q: r3(q), traits: [...traits], tyres: DRY.filter((t) => tyres.includes(t)) };
}
export function rivalProfile(entry) {
  const S = STRATEGY.rivals;
  return strategyProfile({ str: (S[entry.teamId] ?? S.privateer) + (entry.strStep ?? 0), tyres: DRY.filter((t) => TYRES[t].unlocked) }); // Milestone 20: + the championship band's strStep
}
export const qualityOf = (profile) => profile?.q ?? 0;

// Forecast quality (bible §19 F11 / F23 / F33): stored with the race; Milestone 17's weather reads it.
export function forecastOf({ str = STRATEGY.contractorStr, workPct = 0, forecastPts = 0, uncertaintyPct = 0 } = {}) {
  const F = FORECAST;
  const accuracy = clamp((F.base + str * F.perStr) * (1 + workPct / 100) + forecastPts, 0, F.max);
  return { accuracy: Math.round(accuracy * 10) / 10, uncertainty: Math.round((100 - accuracy) * (1 + uncertaintyPct / 100) * 10) / 10 };
}

// The crew's tyre call for the weather (bible §24.2): the first open compound on the weather's list. Dry → the planner's
// own choice (dryChoice), so no call is made. → a tyre id, or null for no call.
export function suggestTyreFor(weather = 'dry', open = ['soft', 'medium'], dryChoice = null) {
  if (weather === 'dry' || !WEATHER_TYRES[weather]) return dryChoice ?? null;
  return WEATHER_TYRES[weather].find((t) => open.includes(t)) ?? WEATHER_TYRES[weather].find((t) => TYRES[t].unlocked) ?? null;
}

// The plan (bible §24.1). ctx:
//   profile (strategyProfile), err (−1…1, fixed per car per race: how far off its wear estimate is, scaled by 1 − q)
//   x (race distance done, in laps), total (race laps), entryFrac (where the pit entry is along a lap, 0–1)
//   tyre, wear, fuel (now), rate(tyre, fuel) → true wear a lap at Normal / Neutral, baseLap, pitLoss (seconds)
//   damagePct, faultRunning, gapAhead (s or null), aheadNeedsStop, window (the stint's fixed window, or null)
//   Milestone 17: tyres (the tyres that suit the weather now; null = the strategist's dry list) and weatherX(tyre) (that
//   tyre's lap-time multiplier in the weather now; null = dry)
export function planStrategy(ctx) {
  const S = STRATEGY;
  const p = ctx.profile ?? strategyProfile();
  const q = p.q;
  const traits = new Set(p.traits);
  const exact = traits.has('fuelCounter');
  const errF = exact ? 0 : (ctx.err ?? 0) * (1 - q) * S.estimateErr;
  const safe = clamp(S.safeWear.min + (S.safeWear.max - S.safeWear.min) * q + (traits.has('longGame') ? S.safeWear.longGame : 0) + (traits.has('safeCall') ? S.safeWear.safeCall : 0), 0.4, S.hardWear);
  const tyres = ctx.tyres?.length ? ctx.tyres : p.tyres?.length ? p.tyres : ['soft', 'medium'];
  const wx = ctx.weatherX ?? (() => 1);
  const fuels = q >= S.fuelQ || traits.has('fuelCounter') ? [...new Set([ctx.fuel, 'lean', 'normal'])] : [ctx.fuel];
  const { x, total, entryFrac, baseLap, pitLoss } = ctx;
  const rate = (t, f) => ctx.rate(t, f) * (1 + errF);

  const stint = (t, w0, laps, f) => {
    const r = rate(t, f);
    const w1 = w0 + r * laps;
    let c = stintTime(baseLap, t, w0, r, laps, FUEL[f].time) * wx(t);
    if (w1 > S.hardWear) c += INFEASIBLE;
    else if (w1 > safe) c += (w1 - safe) * S.marginSecs;
    return c;
  };
  // Stop laps: the lap k whose pit entry is still ahead, with at least minLapsLeftToPit to go after it.
  const stopX = (k) => k - 1 + entryFrac;
  const stopLaps = (from) => {
    const out = [];
    for (let k = Math.max(1, Math.floor(from) + 1); k <= total; k++) {
      const xs = stopX(k);
      if (xs > from + 0.02 && total - xs >= S.minLapsLeftToPit) out.push(k);
    }
    return out;
  };
  // Best from a fresh set fitted at xs to the flag (with up to `more` further stops).
  const fromStop = (xs, f, more) => {
    let best = { cost: Infinity, tyre: tyres[0] };
    for (const t of tyres) {
      const c = stint(t, 0, total - xs, f);
      if (c < best.cost) best = { cost: c, tyre: t };
      if (more > 0) {
        for (const k2 of stopLaps(xs + 1)) {
          const x2 = stopX(k2);
          const c2 = stint(t, 0, x2 - xs, f) + pitLoss + fromStop(x2, f, more - 1).cost;
          if (c2 < best.cost) best = { cost: c2, tyre: t };
        }
      }
    }
    return best;
  };
  const firstStop = (k, f, more) => {
    const xs = stopX(k);
    const rest = fromStop(xs, f, more);
    return { cost: stint(ctx.tyre, ctx.wear, xs - x, f) + pitLoss + rest.cost, tyre: rest.tyre };
  };

  const laps = stopLaps(x);
  let best = { cost: Infinity, stops: 0, pitLap: null, nextTyre: null, fuel: ctx.fuel, byLap: null };
  const consider = (more) => {
    for (const f of fuels) {
      const none = stint(ctx.tyre, ctx.wear, total - x, f);
      if (none < best.cost) best = { cost: none, stops: 0, pitLap: null, nextTyre: null, fuel: f, byLap: null };
      const byLap = {};
      for (const k of laps) {
        const o = firstStop(k, f, more);
        byLap[k] = o.cost;
        if (o.cost < best.cost) best = { cost: o.cost, stops: 1 + more, pitLap: k, nextTyre: o.tyre, fuel: f, byLap };
      }
      if (best.fuel === f && best.stops) best.byLap = byLap;
    }
  };
  consider(0);
  if (best.cost >= INFEASIBLE) consider(1); // no sound 0- or 1-stop plan: two stops

  // The window: stop laps within windowSecs of the best (minWidth–maxWidth laps, around the best).
  let window = null;
  if (best.stops) {
    const W = S.window;
    const ok = laps.filter((k) => best.byLap[k] <= best.cost + W.windowSecs).sort((a, b) => Math.abs(a - best.pitLap) - Math.abs(b - best.pitLap) || a - b);
    let pick = ok.slice(0, W.maxWidth);
    for (const k of laps.slice().sort((a, b) => Math.abs(a - best.pitLap) - Math.abs(b - best.pitLap) || b - a)) {
      if (pick.length >= W.minWidth) break;
      if (!pick.includes(k)) pick.push(k);
    }
    window = { from: Math.min(...pick), to: Math.max(...pick) };
  }
  let reason = best.stops ? 'best' : 'none';
  let pitLap = best.pitLap;
  // The stint's window was fixed when it was first planned: Auto keeps its stop inside it (unless it has been missed).
  const win = ctx.window ?? window;
  if (pitLap && ctx.window && laps.length) {
    const first = laps[0];
    if (ctx.window.to >= first) pitLap = clamp(pitLap, Math.max(ctx.window.from, first), ctx.window.to);
    else reason = 'late';
  }
  // Undercut: a strong strategist (or the Undercut trait) stops a lap early when the car ahead is close and still has its
  // stop to make — if that lap costs no more than undercutSecs over the best in the model.
  if (pitLap && best.byLap && (q >= S.undercutQ || traits.has('undercut')) && ctx.gapAhead !== null && ctx.gapAhead !== undefined && ctx.gapAhead < S.undercutGap && ctx.aheadNeedsStop) {
    const k = pitLap - 1;
    if (laps.includes(k) && best.byLap[k] <= best.cost + S.undercutSecs) {
      pitLap = k;
      reason = 'undercut';
    }
  }
  // Repair priority at the stop: what the damage costs over the laps after it against the repair's time. A weak
  // strategist always asks for a Critical repair when anything is broken.
  let repair = 'none';
  if (ctx.damagePct > 0 || ctx.faultRunning) {
    const after = pitLap ? total - stopX(pitLap) : 0;
    const lossPerLap = ((ctx.damagePct ?? 0) / 100) * baseLap;
    let bestGain = 0;
    for (const id of ['critical', 'full']) {
      const r = PIT_REPAIR[id];
      const gain = lossPerLap * after * r.share + (ctx.faultRunning && r.clearsFault ? baseLap * 0.07 : 0) - r.secs;
      if (gain > bestGain) {
        bestGain = gain;
        repair = id;
      }
    }
    if (q < 0.3 && repair === 'none') repair = 'critical';
  }
  return { stops: best.stops, pitLap, window: best.stops ? win : ctx.window ?? null, nextTyre: best.nextTyre ?? (tyres.includes(ctx.tyre) ? ctx.tyre : tyres[0]), fuel: best.fuel, repair, reason, cost: r3(Math.min(best.cost, INFEASIBLE)), safeWear: r3(safe) };
}
