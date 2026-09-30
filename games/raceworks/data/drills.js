// Optional driver training drills (Milestone 14, bible §13.2–13.6). Plain data only; the rules are
// src/minigames/DrivingChallengeController.js (the five car drills), src/minigames/ReactionLights.js and
// src/systems/drills.js (medals, Mastery, bonuses, account records). Numbers marked PLACEHOLDER are Claude Code's
// (listed in docs/DECISIONS.md), to tune later.

// The training bonus a drill result adds to its course's gain (bible §13.2 / §13.3, exact).
export const DRILL_BONUS = { bronze: 8, silver: 16, gold: 25, masteredAuto: 12 };
export const MEDALS = ['bronze', 'silver', 'gold'];
export const MEDAL_NAMES = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
// Medal tints over the Training Medal picture (ui/race_ui_23) — the art is tinted, never redrawn.
export const MEDAL_TINT = { bronze: '#C0773A', silver: '#A9B4C2', gold: '#E8B425' };
export const DRILL_ART = { button: 'race_ui_22', medal: 'race_ui_23' };

// The six drills. course: the M12 course it matches (a driver starting that course may play it instead of Auto Train).
// thresholds: score 0–100 for Bronze / Silver / Gold (PLACEHOLDER). traitXp: what a finished attempt stores towards
// traits (§13.4; the M13 trait framework receives it — no effect yet), PLACEHOLDER amounts by medal (none on a fail).
// kind: which controller and scoring runs it. length: PLACEHOLDER (seconds for Reaction Lights, metres of course for
// the car drills).
export const DRILLS = [
  {
    id: 'racingLine',
    name: 'Racing Line',
    course: 'driverSim',
    kind: 'line',
    how: 'Steer through the apex gates. Missed gates cost points.',
    thresholds: { bronze: 45, silver: 68, gold: 86 },
    traitXp: { racecraft: 30, feedback: 20 },
    length: 900,
  },
  {
    id: 'brakeZone',
    name: 'Brake Zone',
    course: 'driverSim',
    kind: 'brake',
    how: 'Hold Brake as late as you dare. Slow enough before the line, or it doesn’t count.',
    thresholds: { bronze: 45, silver: 68, gold: 86 },
    traitXp: { qualifying: 30, lateBraker: 20 },
    length: 3, // attempts
  },
  {
    id: 'reactionLights',
    name: 'Reaction Lights',
    course: 'endurance',
    kind: 'lights',
    how: 'Tap as soon as the lights go out. Tap early and that start is lost.',
    thresholds: { bronze: 40, silver: 62, gold: 82 },
    traitXp: { reaction: 40 },
    length: 5, // starts (20–30 seconds in all)
  },
  {
    id: 'overtake',
    name: 'Overtake',
    course: 'driverSim',
    kind: 'overtake',
    how: 'Pass all three cars before the flag without touching them.',
    thresholds: { bronze: 45, silver: 68, gold: 86 },
    traitXp: { racecraft: 40 },
    length: 1400,
  },
  {
    id: 'wetControl',
    name: 'Wet Control',
    course: 'driverSim',
    kind: 'wet',
    how: 'Low grip: small steering moves, brake early, keep it on the road.',
    thresholds: { bronze: 45, silver: 68, gold: 86 },
    traitXp: { wet: 30, rainSense: 20 },
    length: 900,
  },
  {
    id: 'tyreCare',
    name: 'Tyre Care',
    course: 'strategy',
    kind: 'tyre',
    how: 'Lap inside the target time while keeping the tyre load low: smooth steering, gentle braking.',
    thresholds: { bronze: 45, silver: 68, gold: 86 },
    traitXp: { tyreCare: 30, smoothHands: 20 },
    length: 1000,
  },
];
export const drillById = (id) => DRILLS.find((d) => d.id === id) ?? null;
export const drillsForCourse = (courseId) => DRILLS.filter((d) => d.course === courseId);

// The car and the courses (PLACEHOLDER physics, world units = metres, seconds).
export const DRIVE = {
  step: 1 / 60, // fixed step
  car: { topSpeed: 52, accel: 14, brake: 30, turnRate: 1.9, lengthM: 4.6 },
  trackWidth: 14, // m
  offTrackSlow: 0.55, // off the road: speed × this each second (grass)
  barrier: 6, // m beyond the edge: the car is pushed back
  gate: { width: 5.5 }, // an apex gate (m wide), on the inside of each bend
  steerAssistMax: 0.25, // bible §25.4: a better driver steadies the steering (never replaces it)
  wet: { grip: 0.35, slideRecover: 1.6 },
  tyre: { loadPerSteer: 0.9, loadPerBrake: 0.6, band: [1.0, 1.1] }, // band × par time
  overtake: { aiCount: 3, aiPace: 0.66, aiCorner: 0.8, gapM: 40, contactM: 3.8, timeLimit: 45 }, // AI cars at 66% of your top speed, 80% of the grip limit in bends
  brake: { runUp: 170, cornerSpeed: 16, window: 26 }, // m of straight, speed at the line, m of good braking window
  timeLimit: 70, // s: a drill that takes longer ends (whatever it scored)
};
// Reaction Lights (PLACEHOLDER).
export const LIGHTS = { lights: 5, onEvery: 0.5, holdMin: 0.6, holdMax: 2.2, best: 0.2, worst: 0.6, missAfter: 1.2, between: 1.2 };

// Accessibility (bible §13.6 / §45): device settings (core/Settings), never secret-invalidating.
export const DRILL_SETTINGS = {
  steerSensitivity: 1, // 0.5 … 1.5
  lineAid: true,
  brakeAid: true,
  reducedMotion: false,
  reducedFlashes: false,
};
export const SENSITIVITY_RANGE = { min: 0.5, max: 1.5, step: 0.25 };
