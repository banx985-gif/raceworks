// The optional Drive Stint (Milestone 18, bible §8 Drive Stint, §25): a short spell of the player driving their car by hand
// inside a normal race, on the M14 DrivingChallengeController and the race's own circuit geometry.
//   const st = createDriveStint({ sim, secs, ratings, aids, sensitivity, n, forced })   (the race keeps running around you)
//   st.tick(dtReal, { steer, brake, push })   — the controller steps in real time; the race advances k race seconds a real
//                                               second (k: the Auto model's pace ÷ the controller's good-driver pace), so
//                                               you and the field move at the same speed; the race car follows yours
//   st.handBack(reason)  → the stint record (also when the time is up, at the flag, a caution, a retirement)
//   st.live → { secs, left, delta (so far, uncapped), cap, overtakes } for the HUD · st.ctl (drawing) · st.done
// §25.5: at the start the Auto model's time for the stretch you drive is snapshotted (sim.modelTimeFn). On Hand Back
//   manualDelta = clamp(±cap, actual − expected) with cap = clamp(0.75, 2.25, expected × 0.02) (data/race.js DRIVE_STINT);
//   actual = the race time you took + track-limit penalties. If you gained or lost more than the cap, the car is moved
//   along the road by the difference (at the model's speed), so the race keeps exactly the capped delta.
//   State written back: tyre wear (the model's wear for the distance × your tyre load against the perfect driver's), heat
//   and fuel / energy for the time Push was held, minor damage from barrier hits, contact with rivals (M17 rules), the
//   penalties, and the overtakes you completed (they stay unless the capped time can't support them).
//   (A big loss moves the car forward along the road, counting any line it passes; a gain never takes it back over a line.)
// §25.6 no snap-back: the race car was where you drove it all along; Auto (or your manual orders) carry on from there.
import { DrivingChallengeController, autopilot } from '../minigames/DrivingChallengeController.js';
import { stintCourse } from './lapCourse.js';
import { DRIVE_STINT, FAILURE_RISK } from '../../data/race.js';
import { suitable } from './weather.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = (v) => Math.round(v * 100) / 100;

// §25.5 cap and delta.
export const stintCap = (expected, D = DRIVE_STINT) => r2(clamp(expected * D.capShare, D.capMin, D.capMax));
export const manualDelta = (actual, expected, D = DRIVE_STINT) => {
  const cap = stintCap(expected, D);
  return r2(clamp(actual - expected, -cap, cap));
};
// The car's stats → what the controller car can do (§25.4: COR / BRK / ACC / SPD).
export function carScaleOf(stats = {}, D = DRIVE_STINT) {
  const f = (v) => clamp(1 + ((v ?? D.car.ref) - D.car.ref) / 1000 * D.car.per1000, D.car.min, D.car.max);
  return { top: f(stats.SPD), accel: f(stats.ACC), brake: f(stats.BRK), grip: f(stats.COR) };
}
// The road's grip for the stint: the weather, a tyre that doesn't suit it, Wet Skill off the dry (§25.4 wet assist).
export function stintGrip(weather, tyre, wetSkill = 0, D = DRIVE_STINT) {
  const g = (D.grip[weather] ?? 1) * (suitable(tyre, weather) ? 1 : D.wrongTyre);
  return weather === 'dry' ? g : g * (1 + (wetSkill * D.wetPer1000) / 1000);
}

export function createDriveStint({ sim, carId = 'PLAYER', secs = 60, ratings = null, aids = { line: true, brake: true }, sensitivity = 1, n = 1, forced = false, D = DRIVE_STINT }) {
  const c = sim.car(carId);
  const e = sim.byId[carId];
  const geo = sim.geo;
  const L = geo.length;
  const rt = ratings ?? e.ratings;
  const s0 = c.s;
  const t0 = sim.t;
  const BACK = 120; // m of road behind you on the course (so it doesn't end at your back)
  const course = stintCourse(geo, s0 - BACK, Math.max(800, secs * 62 + 200) + BACK);
  const cfg = {
    seed: `stint:${sim.seed}:${n}`,
    kind: 'free',
    course,
    startSpeed: clamp((c.v || 20) * 1.3, 12, 45),
    ratings: rt,
    aids,
    sensitivity,
    carScale: carScaleOf(e.car),
    gripX: stintGrip(sim.weather, c.tyre, rt.wet ?? 0),
    push: D.push,
    noPar: true,
    par: 1,
    timeLimit: secs,
    startS: BACK,
    startLat: clamp(c.lat, -4, 4),
  };
  // The perfect driver on the same stretch (the controller's autopilot): its distance and tyre load against time.
  const EVERY = 6; // steps (0.1 s)
  const runGhost = () => {
    const ghost = new DrivingChallengeController().start({ ...cfg, timeLimit: secs * 1.4 });
    const gS = [0];
    const gLoad = [0];
    while (!ghost.state.finished) {
      ghost._step(autopilot(ghost));
      if (ghost.state.steps % EVERY === 0) {
        gS.push(ghost.state.car.s - BACK);
        gLoad.push(ghost.state.load);
      }
    }
    return { gS, gLoad, dtS: ghost.state.rules.step * EVERY };
  };
  const expectedFn = sim.modelTimeFn(c);
  // race seconds per real second while you drive: the model's time for what a good driver (the perfect one × parSlack)
  // covers in the stint. Twice: the second time the car starts at the race car's speed in the controller's terms.
  const kOf = (g) => expectedFn(g.gS[Math.min(g.gS.length - 1, Math.round(secs / g.dtS))]) / (secs * D.parSlack);
  cfg.startSpeed = clamp((c.v || 20) * kOf(runGhost()), 12, 50);
  const { gS, gLoad, dtS } = runGhost();
  const ghostAt = (arr, x) => {
    // the value of arr where the ghost had driven x metres
    let i = gS.findIndex((s) => s >= x);
    if (i < 0) return arr[arr.length - 1] * (x / Math.max(1, gS[gS.length - 1]));
    if (i === 0) return arr[0];
    const f = (x - gS[i - 1]) / Math.max(1e-6, gS[i] - gS[i - 1]);
    return arr[i - 1] + (arr[i] - arr[i - 1]) * f;
  };
  const ghostDist = gS[Math.min(gS.length - 1, Math.round(secs / dtS))];
  const expectedGood = expectedFn(ghostDist); // the model's time for what a good driver covers in the stint
  const k = expectedGood / (secs * D.parSlack);
  const cap = stintCap(expectedGood, D);

  const ctl = new DrivingChallengeController().start(cfg);
  // who was ahead of you in the race when you took the wheel (for the overtakes you complete)
  const aheadAtStart = sim.order().slice(0, sim.order().indexOf(c)).filter((o) => !o.retired).map((o) => o.id);
  const contactCd = {};
  let contacts = 0;
  let done = false;
  let record = null;
  c.manual = { target: s0, v: c.v, lat: c.lat };
  c.ot = null;
  sim.events.push({ t: Math.round(sim.t * 100) / 100, kind: 'stintStart', ids: [carId], text: `${e.name}: you take the wheel`, n });

  const api = {
    ctl,
    k,
    cap,
    s0,
    secs,
    get done() {
      return done;
    },
    get record() {
      return record;
    },
    // The HUD: time left, the running delta against the crew (before the cap), overtakes so far.
    get live() {
      const x = c.s - s0;
      const now = sim.t - t0 + Math.floor(ctl.state.offTime / D.offTrack.every) * D.offTrack.secs;
      const pos = sim.order().indexOf(c);
      return { secs: ctl.state.t, left: Math.max(0, secs - ctl.state.t), delta: r2(now - expectedFn(x)), cap, overtakes: aheadAtStart.filter((id) => sim.order().findIndex((o) => o.id === id) > pos).length, push: !!ctl.state.car.pushing };
    },
    tick(dtReal, input = {}) {
      if (done) return;
      ctl.tick(dtReal, { steer: input.steer ?? 0, brake: !!input.brake, push: !!input.push });
      const car = ctl.state.car;
      const raceDt = dtReal * k;
      const target = s0 + car.s - BACK;
      c.manual.target = target;
      c.manual.lat = car.lat;
      c.manual.v = Math.max(0, target - c.s) / Math.max(1e-3, raceDt);
      sim.advance(raceDt);
      // contact with a rival you drive into (the M17 bounded rules decide what it does)
      for (const o of sim.cars) {
        if (o === c || o.retired || o.pit || o.finished) continue;
        let d = (((o.s - c.s) % L) + L) % L;
        if (d > L / 2) d -= L;
        if (d <= -1 || d >= D.contactM || Math.abs(o.lat - car.lat) >= D.contactLat) continue;
        // closing fast on it is a hit (the M17 rules); a gentle touch just holds you up behind it
        const closing = car.v / k - o.v;
        if (closing > D.hitClosing && (contactCd[o.id] ?? -1) <= ctl.state.t) {
          contactCd[o.id] = ctl.state.t + 1.5;
          car.v *= 0.7;
          contacts++;
          sim.manualContact(c, o);
        } else if (d > 0) car.v = Math.min(car.v, o.v * k);
      }
      if (ctl.state.finished || c.finished || c.retired || sim.caution || sim.done || sim.leaderFinished) api.handBack(c.retired ? 'retired' : sim.caution ? 'caution' : c.finished || sim.leaderFinished ? 'flag' : 'time');
    },
    // Hand Back (or the stint ends by itself): the capped delta, the state written back, the record.
    handBack(reason = 'handBack') {
      if (done) return record;
      done = true;
      const st = ctl.state;
      const x = Math.max(0, c.s - s0);
      const elapsed = sim.t - t0;
      const expected = expectedFn(x);
      const penalty = Math.floor(st.offTime / D.offTrack.every) * D.offTrack.secs;
      const actual = elapsed + penalty;
      const raw = actual - expected;
      const delta = r2(clamp(raw, -cap, cap));
      c.manual = null;
      const ord0 = sim.order();
      const passedByYou = aheadAtStart.filter((id) => ord0.findIndex((o) => o.id === id) > ord0.indexOf(c));
      // keep exactly the capped delta: move the car along the road by what went past the cap (never over a line)
      const corr = raw - delta;
      let moved = 0;
      if (Math.abs(corr) > 1e-6 && x > 1 && !c.retired && !c.finished) {
        // where the Auto model would be after (actual − delta) race seconds: the distance whose model time is that
        const budget = actual - delta;
        let lo = 0;
        let hi = Math.max(x, 1) * 4 + 4000;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (expectedFn(mid) < budget) lo = mid;
          else hi = mid;
        }
        moved = sim.moveCar(c, s0 + lo);
      }
      // state back onto the car: tyre wear by your tyre load, Push heat and fuel, barrier damage
      const gl = ghostAt(gLoad, st.car.s - BACK);
      const abuse = gl > 1e-6 ? clamp(st.load / gl, D.abuseMin, D.abuseMax) : 1;
      const laps = x / L;
      const wearAdd = r2(sim.wearRate(c) * laps * abuse * 100) / 100;
      c.wear = Math.min(1, c.wear + wearAdd);
      const pushShare = st.t > 0 ? clamp(st.pushTime / st.t, 0, 1) : 0;
      const H = FAILURE_RISK.heat;
      const heatAdd = r2(laps * pushShare * (H.push - (H[c.pace] ?? 0)));
      c.heat = clamp(c.heat + heatAdd, 0, 1);
      const fuelAdd = r2(laps * pushShare * (D.push.fuelX - 1));
      c.stintFuel = r2((c.stintFuel ?? 0) + fuelAdd);
      const dmg = Math.min(D.damageMax, st.walls * D.wallDamagePct);
      c.damagePct += dmg;
      c.seg = -1;
      c.ot = null;
      c.segKey = null;
      // the overtakes that stand (the race order now, after the cap)
      const ord = sim.order();
      const me = ord.indexOf(c);
      const passed = passedByYou.filter((id) => ord.findIndex((o) => o.id === id) > me); // your passes that the capped time supports
      for (const id of passed) sim.events.push({ t: Math.round(sim.t * 100) / 100, kind: 'overtake', ids: [carId, id], text: `${e.name} passes ${sim.byId[id].name}`, manual: true });
      record = { n, reason, secs: r2(st.t), x: Math.round(x), elapsed: r2(elapsed), expected: r2(expected), penalty, raw: r2(raw), delta, cap, moved: r2(moved), overtakes: passed.length, contacts, offTime: r2(st.offTime), walls: st.walls, pushSecs: r2(st.pushTime), wearAdd, heatAdd, fuelAdd, damageAdd: dmg, forced: !!forced };
      (c.driveLog ??= []).push(record);
      sim.events.push({ t: Math.round(sim.t * 100) / 100, kind: 'stint', ids: [carId], text: `${e.name} hands back: ${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(2)} s against the crew`, delta });
      if (!c.retired && !c.finished) sim.replan(c);
      return record;
    },
    // ?debug=1 / tests: the controller's perfect driver's input now.
    autopilotInput: () => autopilot(ctl),
  };
  return api;
}
