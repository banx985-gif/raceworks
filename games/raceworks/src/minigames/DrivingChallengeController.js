// The shared DrivingChallengeController (Milestone 14, bible §13.5 / §8 Drive Stint): one car under the player's
// steering and brake on a short code-drawn course, for the car drills now and the Qualifying Drive Challenge (M15) and
// race Drive Stints (M25) later. RACEWORKS-only (not core/) until a second series game needs it.
//   const c = new DrivingChallengeController()
//   c.start(config)            config: { seed, kind: 'line' | 'brake' | 'overtake' | 'wet' | 'tyre' | 'free' | 'lap', length,
//                                         ratings (the driver's six, for §25.4 assistance), aids: { line, brake },
//                                         sensitivity (0.5–1.5), rules (data/drills.js DRIVE) }
//                              Milestone 15 (the Qualifying Drive lap): course (a ready course, e.g. a real circuit from
//                              src/race/lapCourse.js, instead of a seeded one), startSpeed (m/s), timeLimitX (the time
//                              limit as a multiple of par). Kind 'lap' is scored like the Racing Line (gates at each
//                              corner's apex + time against par) and its detail also has offTime and walls.
//                              Milestone 18 (the race Drive Stint): carScale { top, accel, brake, grip } (the car's SPD / ACC /
//                              BRK / COR), gripX (the weather's grip), push { speedX, accelX, loadX } (what the Push button
//                              does), noPar (no par ghost: the stint makes its own), startS / startLat (where on the course the car starts).
//                              None of them changes a drill.
//   c.tick(dt, input)          input: { steer: −1…1, brake: bool, push: bool, handBack: bool } — runs whole fixed steps (1/60 s)
//   c.result()                 → { score 0–100, finished, handedBack, detail } (score only counts when finished)
//   c.state                    what the screen draws: car, course, gates, AI cars, aids, timers
//   autopilot(c)               → the input a perfect driver would give now (tests, and the debug "watch" mode)
// Auto throttle always; the car speeds up to its top speed unless braking. Corner speed is limited by grip (dry, or
// the wet course's low grip): asking for more turn than grip allows runs wide. Off the road the car slows; a barrier
// beyond it pushes the car back (a wall hit). Deterministic: the same seed and inputs give the same run.
// Scoring by kind: line / wet — apex gates hit and time against par; brake — how late the brake point was while still
// slow enough at the line (3 attempts); overtake — cars passed and no contact inside the time limit; tyre — lap time
// inside the target band and tyre load kept low. Par times come from the autopilot on the same course, so every course
// can score 100. Reduced motion only changes drawing: the scoring windows are the same.
import { Rng } from '../../../../core/Rng.js';
import { DRIVE } from '../../data/drills.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const SAMPLE = 2; // m between centreline samples

// --- the course -------------------------------------------------------------------------------------------------------
// A short section from the seed: a straight, then bends (arcs) and straights. Sampled every 2 m with heading and
// curvature. bends: [{ from, to, apex, dir, radius }] in metres along the course.
export function buildCourse({ seed, kind, length, rules = DRIVE }) {
  const rng = new Rng(`drill-course:${kind}:${seed}`);
  const pts = [];
  let x = 0;
  let y = 0;
  let h = -Math.PI / 2; // heading "up" the screen
  let s = 0;
  const bends = [];
  const straight = (len) => {
    for (let d = 0; d < len; d += SAMPLE) {
      pts.push({ x, y, h, s, k: 0 });
      x += Math.cos(h) * SAMPLE;
      y += Math.sin(h) * SAMPLE;
      s += SAMPLE;
    }
  };
  const arc = (radius, angle, dir) => {
    const len = radius * angle;
    const from = s;
    for (let d = 0; d < len; d += SAMPLE) {
      pts.push({ x, y, h, s, k: dir / radius });
      h += (dir * SAMPLE) / radius;
      x += Math.cos(h) * SAMPLE;
      y += Math.sin(h) * SAMPLE;
      s += SAMPLE;
    }
    bends.push({ from, to: s, apex: (from + s) / 2, dir, radius });
  };
  if (kind === 'brake') {
    straight(rules.brake.runUp);
    arc(30, Math.PI / 2, rng.chance(0.5) ? 1 : -1);
    straight(40);
  } else {
    const wide = kind === 'overtake';
    straight(wide ? 90 : 60);
    let dir = rng.chance(0.5) ? 1 : -1;
    while (s < length - 60) {
      const radius = wide ? rng.range(60, 95) : rng.range(32, 60);
      const angle = rng.range(0.6, wide ? 1.2 : 1.6);
      arc(radius, angle, dir);
      dir = rng.chance(0.75) ? -dir : dir;
      straight(rng.range(wide ? 60 : 35, wide ? 110 : 70));
    }
    straight(60);
  }
  pts.push({ x, y, h, s, k: 0 });
  const width = kind === 'overtake' ? rules.trackWidth + 6 : rules.trackWidth;
  return { pts, bends, length: s, width, finishAt: s - 20 };
}

// Where a world point is along the course: the nearest sample near `hint` (a sample index). → { i, s, lat } with lat
// the signed distance from the centreline (+ = left of the direction of travel).
function locate(course, px, py, hint) {
  const P = course.pts;
  let best = hint;
  let bd = Infinity;
  for (let i = Math.max(0, hint - 12); i < Math.min(P.length, hint + 30); i++) {
    const d = (P[i].x - px) ** 2 + (P[i].y - py) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const p = P[best];
  const lat = -(px - p.x) * Math.sin(p.h) + (py - p.y) * Math.cos(p.h);
  return { i: best, s: p.s, lat };
}
const at = (course, s) => course.pts[clamp(Math.round(s / SAMPLE), 0, course.pts.length - 1)];
const pointAt = (course, s, lat) => {
  const p = at(course, s);
  return { x: p.x - Math.sin(p.h) * lat, y: p.y + Math.cos(p.h) * lat, h: p.h };
};

// The racing line as a lateral offset along the course: outside before a bend, the inside at the apex, outside after.
// A bend curves towards +lat when dir = +1 (the heading grows towards the left-hand normal), so +dir is its inside.
const LEAD = 30; // m: the line moves out this far before a bend, and back to the middle after it
const smooth = (f) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(f, 0, 1));
// A gentle swing to the inside of each bend, peaking at the apex (the gate), back to the middle on the straights.
function racingOffset(course, s) {
  const m = course.width / 2 - 3;
  let best = null;
  for (const b of course.bends) if (s >= b.from - LEAD && s <= b.to + LEAD && (!best || Math.abs(s - b.apex) < Math.abs(s - best.apex))) best = b;
  if (!best) return 0;
  const half = (best.to - best.from) / 2 + LEAD;
  return best.dir * m * smooth(1 - Math.abs(s - best.apex) / half);
}

// The fastest safe speed at distance s: grip-limited by each curve ahead, allowing for braking before it.
function safeSpeed(course, s, latMax, look = 60, decel = 24) {
  let v = Infinity;
  for (let d = 0; d <= look; d += SAMPLE * 2) {
    const k = Math.abs(at(course, s + d).k);
    if (k > 0) v = Math.min(v, Math.sqrt(latMax / k + 2 * decel * d));
  }
  return v;
}

export class DrivingChallengeController {
  constructor() {
    this.state = null;
    this.acc = 0;
  }

  start(config) {
    const rules = config.rules ?? DRIVE;
    const kind = config.kind ?? 'free';
    const r = config.ratings ?? {};
    const course = config.course ?? buildCourse({ seed: config.seed, kind, length: config.length ?? 900, rules });
    const grip = (kind === 'wet' ? rules.wet.grip * (1 + (r.wet ?? 0) / 3000) : 1) * (config.gripX ?? 1);
    const carX = { top: 1, accel: 1, brake: 1, grip: 1, ...(config.carScale ?? {}) }; // Milestone 18
    // §25.4: better ratings give bounded help — steering-centre assist, a wider brake window, gentler tyre load.
    const assist = clamp(((r.feedback ?? 0) + (r.racecraft ?? 0)) / 2 / 4000, 0, rules.steerAssistMax);
    const gates = kind === 'line' || kind === 'wet' || kind === 'lap' ? course.bends.map((b) => ({ s: b.apex, lat: racingOffset(course, b.apex), w: rules.gate.width, hit: null })) : [];
    const st = {
      kind,
      seed: config.seed,
      rules,
      course,
      grip,
      latMax: 28 * grip * carX.grip,
      carX,
      push: config.push ?? null, // Milestone 18: the Push button's multipliers (null = no Push)
      pushTime: 0,
      startS: config.startS ?? 0,
      startLat: config.startLat ?? 0,
      assist,
      aids: { line: config.aids?.line ?? true, brake: config.aids?.brake ?? true },
      sensitivity: clamp(config.sensitivity ?? 1, 0.5, 1.5),
      t: 0,
      steps: 0,
      car: null,
      gates,
      ai: [],
      offTime: 0,
      walls: 0,
      contacts: 0,
      load: 0,
      finished: false,
      handedBack: false,
      attempts: [],
      brakeWindow: rules.brake.window * (1 + (r.qualifying ?? 0) / 2000),
      tyreGentle: 1 - clamp((r.tyreCare ?? 0) / 3000, 0, 0.2),
      par: config.par ?? null,
      parLoad: config.parLoad ?? null,
      timeLimit: config.timeLimit ?? (kind === 'overtake' ? rules.overtake.timeLimit : rules.timeLimit),
      lastBrake: false,
      events: [], // [{ t, kind }] for the screen (gate hit / miss, contact, attempt)
    };
    this.state = st;
    this.acc = 0;
    this._placeCar(config.startSpeed ?? (kind === 'brake' ? rules.car.topSpeed : kind === 'overtake' ? rules.car.topSpeed * 0.6 : 18));
    if (kind === 'overtake') {
      const o = rules.overtake;
      for (let n = 0; n < o.aiCount; n++) {
        const s = 40 + (n + 1) * o.gapM;
        const lat = n % 2 ? 2.5 : -2.5;
        const p = pointAt(course, s, lat);
        st.ai.push({ id: n, s, lat, x: p.x, y: p.y, h: p.h, v: rules.car.topSpeed * o.aiPace * 0.8, i: Math.round(s / SAMPLE), passed: false, touchCd: 0 });
      }
    }
    if (kind === 'brake') {
      st.brakeLine = rules.brake.runUp;
      st.idealBrake = st.brakeLine - (rules.car.topSpeed ** 2 - rules.brake.cornerSpeed ** 2) / (2 * rules.car.brake);
      st.attempt = { pressAt: null, n: 1 };
    }
    // Par (the autopilot's run on this same course) unless given.
    if (st.par == null && kind !== 'brake' && !config.noPar) {
      const ghost = new DrivingChallengeController();
      ghost.start({ ...config, noPar: true, par: 1, parLoad: 1, timeLimitX: null, ...(config.timeLimitX ? { timeLimit: Infinity } : {}) });
      let guard = 0;
      while (!ghost.state.finished && guard++ < 60 * 200) ghost._step(autopilot(ghost));
      st.par = ghost.state.t / (kind === 'tyre' ? 1.05 : 1); // Tyre Care: a careful lap sits mid-band
      st.parLoad = ghost.state.load;
    }
    if (config.timeLimitX && st.par) st.timeLimit = st.par * config.timeLimitX;
    return this;
  }

  _placeCar(v) {
    const st = this.state;
    const s0 = st.startS ?? 0; // Milestone 18: a stint starts a little way along its course (road behind you too)
    const lat = st.startLat ?? 0;
    const p = pointAt(st.course, s0, lat);
    st.car = { x: p.x, y: p.y, h: p.h, dir: p.h, v, i: Math.round(s0 / SAMPLE), s: s0, lat, steer: 0, braking: false };
  }

  // Run whole fixed steps for dt seconds of real time.
  tick(dt, input = {}) {
    const st = this.state;
    if (!st || st.finished) return;
    if (input.handBack) {
      st.handedBack = true;
      st.finished = true;
      return;
    }
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= st.rules.step && !st.finished) {
      this.acc -= st.rules.step;
      this._step(input);
    }
  }

  _step(input) {
    const st = this.state;
    const R = st.rules;
    const dt = R.step;
    const car = st.car;
    const c = st.course;
    st.t += dt;
    st.steps++;
    // steering: the player's (× sensitivity), plus a little centring help from a better driver
    const toward = wrapAngle(Math.atan2(pointAt(c, car.s + 14, racingOffset(c, car.s + 14)).y - car.y, pointAt(c, car.s + 14, racingOffset(c, car.s + 14)).x - car.x) - car.h);
    const helper = clamp(toward * 2.5, -1, 1);
    const raw = clamp((input.steer ?? 0) * st.sensitivity, -1, 1);
    const steer = input.steer ? clamp(raw + (helper - raw) * st.assist, -1, 1) : raw;
    car.steer = steer;
    const braking = !!input.brake;
    car.braking = braking;
    // Milestone 18: Push asks more of the car (a stint only); the car's stats scale what it can do
    const push = !!(input.push && st.push && !braking);
    car.pushing = push;
    if (push) st.pushTime += dt;
    const top = R.car.topSpeed * st.carX.top * (push ? st.push.speedX : 1);
    const accel = R.car.accel * st.carX.accel * (push ? st.push.accelX : 1);
    // speed: auto throttle unless braking
    if (braking) car.v = Math.max(st.kind === 'brake' ? 6 : 4, car.v - R.car.brake * st.carX.brake * dt);
    else car.v += accel * dt * Math.max(0, 1 - car.v / top);
    // turning, limited by grip (asking for more runs wide)
    const want = steer * R.car.turnRate * Math.min(1, car.v / 12);
    const cap = st.latMax / Math.max(car.v, 1);
    const yaw = clamp(want, -cap, cap);
    car.h = wrapAngle(car.h + yaw * dt);
    // wet: the direction of travel lags the heading (a slide)
    if (st.kind === 'wet') car.dir = car.dir + wrapAngle(car.h - car.dir) * Math.min(1, R.wet.slideRecover * st.grip * 2.2 * dt * 10);
    else car.dir = car.h;
    car.x += Math.cos(car.dir) * car.v * dt;
    car.y += Math.sin(car.dir) * car.v * dt;
    // where on the course
    const L = locate(c, car.x, car.y, car.i);
    const prevS = car.s;
    car.i = L.i;
    car.s = L.s;
    car.lat = L.lat;
    const edge = c.width / 2;
    if (Math.abs(L.lat) > edge) {
      car.v *= Math.pow(R.offTrackSlow, dt);
      st.offTime += dt;
    }
    if (Math.abs(L.lat) > edge + R.barrier) {
      const p = pointAt(c, L.s, Math.sign(L.lat) * (edge + R.barrier - 0.2));
      car.x = p.x;
      car.y = p.y;
      car.h = car.dir = p.h;
      car.v *= 0.5;
      st.walls++;
      st.events.push({ t: st.t, kind: 'wall' });
    }
    // tyre load: steering at speed and braking (Tyre Care)
    st.load += (Math.abs(steer) * (car.v / R.car.topSpeed) * R.tyre.loadPerSteer + (braking ? R.tyre.loadPerBrake : 0)) * dt * st.tyreGentle * (push ? st.push.loadX : 1);
    // gates
    for (const g of st.gates) {
      if (g.hit !== null || prevS > g.s || car.s < g.s) continue;
      g.hit = Math.abs(car.lat - g.lat) <= g.w / 2 + 0.6;
      st.events.push({ t: st.t, kind: g.hit ? 'gate' : 'miss' });
    }
    if (st.kind === 'overtake') this._stepAi(dt);
    if (st.kind === 'brake') return this._stepBrake(braking);
    if (car.s >= c.finishAt) st.finished = true;
    if (st.t >= st.timeLimit) st.finished = true;
  }

  _stepAi(dt) {
    const st = this.state;
    const R = st.rules;
    const c = st.course;
    const car = st.car;
    for (const a of st.ai) {
      const vmax = Math.min(R.car.topSpeed * R.overtake.aiPace, safeSpeed(c, a.s, st.latMax) * R.overtake.aiCorner);
      a.v += clamp(vmax - a.v, -R.car.brake * dt, R.car.accel * dt);
      a.s = Math.min(c.length - 2, a.s + a.v * dt);
      const p = pointAt(c, a.s, a.lat);
      a.x = p.x;
      a.y = p.y;
      a.h = p.h;
      a.touchCd = Math.max(0, a.touchCd - dt);
      if (!a.passed && car.s > a.s + R.car.lengthM + 1) {
        a.passed = true;
        st.events.push({ t: st.t, kind: 'pass' });
      }
      if (a.passed && car.s < a.s - 2) a.passed = false; // they got back past
      const d = Math.hypot(a.x - car.x, a.y - car.y);
      if (d < R.overtake.contactM && a.touchCd <= 0) {
        st.contacts++;
        a.touchCd = 1;
        car.v *= 0.7;
        st.events.push({ t: st.t, kind: 'contact' });
      }
    }
  }

  // Brake Zone: 3 attempts at the line. Scored on how late the brake went on while still slow enough at the line.
  _stepBrake(braking) {
    const st = this.state;
    const R = st.rules;
    const car = st.car;
    const A = st.attempt;
    if (braking && A.pressAt === null) A.pressAt = car.s;
    if (car.s >= st.brakeLine) {
      const ok = car.v <= R.brake.cornerSpeed + 1 && A.pressAt !== null;
      const early = ok ? Math.max(0, st.idealBrake - A.pressAt) : Infinity;
      const score = ok ? Math.round(100 * clamp(1 - early / st.brakeWindow, 0, 1)) : 0;
      st.attempts.push({ pressAt: A.pressAt, speed: Math.round(car.v * 10) / 10, ok, score });
      st.events.push({ t: st.t, kind: ok ? 'attempt' : 'overshoot' });
      if (st.attempts.length >= (st.rules.brake.attempts ?? 3)) st.finished = true;
      else {
        st.attempt = { pressAt: null, n: st.attempts.length + 1 };
        this._placeCar(R.car.topSpeed);
      }
    }
  }

  result() {
    const st = this.state;
    if (!st) return null;
    const detail = {};
    let score = 0;
    const k = st.kind;
    if (k === 'line' || k === 'wet' || k === 'lap') {
      const hit = st.gates.filter((g) => g.hit).length;
      const gates = st.gates.length || 1;
      const timeF = clamp((st.par * 1.25 - st.t) / (st.par * 0.25), 0, 1);
      score = 70 * (hit / gates) + 30 * timeF - st.offTime * 4 - st.walls * 5;
      Object.assign(detail, { gatesHit: hit, gates: st.gates.length, time: +st.t.toFixed(2), par: +st.par.toFixed(2) });
      if (k === 'lap') Object.assign(detail, { offTime: +st.offTime.toFixed(2), walls: st.walls });
    } else if (k === 'brake') {
      score = st.attempts.length ? st.attempts.reduce((t, a) => t + a.score, 0) / (st.rules.brake.attempts ?? 3) : 0;
      detail.attempts = st.attempts;
    } else if (k === 'overtake') {
      const passed = st.ai.filter((a) => a.passed).length;
      score = (75 * passed) / st.ai.length + (st.contacts === 0 ? 25 : 0) - st.contacts * 12 - st.walls * 5;
      Object.assign(detail, { passed, cars: st.ai.length, contacts: st.contacts });
    } else if (k === 'tyre') {
      const [lo, hi] = st.rules.tyre.band;
      const t = st.t / st.par;
      const timeScore = t >= lo && t <= hi ? 50 : 50 * clamp(1 - (t < lo ? lo - t : t - hi) / 0.1, 0, 1);
      const ref = st.parLoad * 1.15;
      const loadScore = 50 * clamp(1 - Math.max(0, st.load - ref) / ref, 0, 1);
      score = timeScore + loadScore - st.walls * 5;
      Object.assign(detail, { time: +st.t.toFixed(2), band: [+(st.par * lo).toFixed(2), +(st.par * hi).toFixed(2)], load: +st.load.toFixed(2), loadLimit: +ref.toFixed(2) });
    }
    const done = st.finished && !st.handedBack && (k === 'brake' || k === 'overtake' || st.car.s >= st.course.finishAt);
    return { score: done ? Math.round(clamp(score, 0, 100)) : 0, finished: done, handedBack: st.handedBack, time: +st.t.toFixed(2), detail };
  }

  // What the screen needs to draw an aid line: points of the racing line (world), and brake markers ({ s, x, y, h }).
  racingLine(from = 0, to = Infinity, step = 6) {
    const c = this.state.course;
    const out = [];
    for (let s = Math.max(0, from); s <= Math.min(c.length, to); s += step) out.push(pointAt(c, s, racingOffset(c, s)));
    return out;
  }
  brakeMarkers() {
    const st = this.state;
    if (st.kind === 'brake') return [{ ...pointAt(st.course, st.idealBrake, 0), s: st.idealBrake, line: false }, { ...pointAt(st.course, st.brakeLine, 0), s: st.brakeLine, line: true }];
    const R = st.rules;
    return st.course.bends.map((b) => {
      const vc = Math.sqrt(st.latMax * b.radius);
      const d = Math.max(0, (R.car.topSpeed ** 2 - vc ** 2) / (2 * R.car.brake)) * 0.7;
      return { ...pointAt(st.course, Math.max(0, b.from - d), 0), s: b.from - d, line: false };
    });
  }
  edgePoint(s, side) {
    const c = this.state.course;
    return pointAt(c, s, (side * c.width) / 2);
  }
}

// A perfect driver's input now: follow the racing line (or dodge the AI cars in Overtake), brake for the grip limit
// ahead, and in Brake Zone press at the last moment. Used by tests (a scripted perfect run) and to compute par.
export function autopilot(ctl) {
  const st = ctl.state;
  const car = st.car;
  const c = st.course;
  const R = st.rules;
  if (st.kind === 'brake') {
    const need = (car.v ** 2 - R.brake.cornerSpeed ** 2) / (2 * R.car.brake);
    const press = st.attempt.pressAt !== null || car.s >= st.brakeLine - need - car.v * R.step * 1.5;
    return { steer: 0, brake: press && car.s < st.brakeLine };
  }
  // Overtake: go by the nearest car ahead on its other side.
  let dodge = null;
  if (st.kind === 'overtake') {
    const near = st.ai.filter((a) => a.s - car.s > -8 && a.s - car.s < 45).sort((a, b) => a.s - b.s)[0];
    if (near) dodge = near.lat > 0 ? -5.5 : 5.5;
  }
  // (a dodge moves across gradually: a sudden swing at speed would run wide)
  const lane = (s) => (dodge !== null ? car.lat + clamp(dodge - car.lat, -2, 2) : racingOffset(c, s) * (st.kind === 'tyre' ? 0.9 : 1));
  // The line's own heading a little ahead (feed-forward) plus a pull back onto it (feedback).
  const s1 = car.s + 3 + car.v * 0.12;
  const p1 = pointAt(c, s1, lane(s1));
  const p2 = pointAt(c, s1 + 4, lane(s1 + 4));
  const lineH = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const toLine = wrapAngle(Math.atan2(p1.y - car.y, p1.x - car.x) - car.h);
  const err = wrapAngle(lineH - car.h) * 0.6 + toLine * 0.9;
  const turn = err * (car.v / 4) + (st.kind === 'wet' ? wrapAngle(car.h - car.dir) * -0.8 : 0);
  const steer = clamp(turn / (R.car.turnRate * Math.min(1, car.v / 12) * st.sensitivity), -1, 1);
  const margin = st.kind === 'tyre' ? 0.7 : st.kind === 'wet' ? 0.6 : st.kind === 'overtake' ? 0.85 : 0.72; // spare grip to reach the apex
  const vSafe = safeSpeed(c, car.s, st.latMax * margin, 70, R.car.brake * st.carX.brake * 0.8);
  return { steer, brake: car.v > vSafe };
}
