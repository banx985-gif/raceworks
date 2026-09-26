// RACEWORKS staff content (bible §10–11). Plain data only; the rules live in core/StaffSystem.js and
// src/systems/driverRatings.js. Milestone 3: the three starters only.

// The five work stats (bible §10.2). Visible range 1–999.
export const STAT_KEYS = ['MEC', 'ENG', 'AER', 'STR', 'DRV'];
export const STAT_NAMES = { MEC: 'Mechanical', ENG: 'Engineering', AER: 'Aerodynamics', STR: 'Strategy', DRV: 'Driving' };

// Five roles (bible §10.1). primaryStat = the role's bias (level-ups favour it).
export const ROLES = {
  driver: { name: 'Driver', primaryStat: 'DRV', badge: 'badge_role_01' },
  mechanic: { name: 'Mechanic', primaryStat: 'MEC', badge: 'badge_role_02' },
  engineer: { name: 'Race Engineer', primaryStat: 'ENG', badge: 'badge_role_03' },
  aero: { name: 'Aero Designer', primaryStat: 'AER', badge: 'badge_role_04' },
  strategist: { name: 'Strategist', primaryStat: 'STR', badge: 'badge_role_05' },
};

// Tiers (bible §10.6).
export const TIERS = {
  standard: { name: 'Standard', statCap: 220, traitSlots: 1 },
  rare: { name: 'Rare', statCap: 300, traitSlots: 1 },
  elite: { name: 'Elite', statCap: 400, traitSlots: 2 },
  legendary: { name: 'Legendary', statCap: 520, traitSlots: 2 },
  secret: { name: 'Secret', statCap: 650, traitSlots: 3 },
};

// Traits. ratings = permanent bonuses to the six driver ratings (bible §10.3: normally −40 … +80).
// The bible names the traits but gives no numbers: these are PLACEHOLDER values, to tune later.
// effects = keys core/StaffSystem understands (none needed yet).
export const TRAITS = {
  lateBraker: {
    name: 'Late Braker',
    text: 'Brakes later than anyone: quick over one lap, a little ragged over a race.',
    ratings: { qualifying: 40, racecraft: 15, consistency: -10 },
  },
  fastHands: {
    name: 'Fast Hands',
    text: 'Quick with the tools: faster fitting and pit work (from car projects on).',
    ratings: {},
  },
  dataNotes: {
    name: 'Data Notes',
    text: 'Keeps careful notes: better setup feedback and fewer surprises.',
    ratings: { feedback: 30, consistency: 10 },
  },
};

// The three starters (bible §11 rows, exact stats). startLevel / salary per month in Credits.
export const STAFF = [
  { id: 'DRV01', name: 'Sam Calder', role: 'driver', tier: 'standard', startLevel: 1, stats: { MEC: 35, ENG: 47, AER: 49, STR: 37, DRV: 89 }, salary: 500, traits: ['lateBraker'], art: 'staff_drv01' },
  { id: 'MEC01', name: 'Tessa Bolt', role: 'mechanic', tier: 'standard', startLevel: 1, stats: { MEC: 77, ENG: 52, AER: 49, STR: 25, DRV: 32 }, salary: 500, traits: ['fastHands'], art: 'staff_mec01' },
  { id: 'ENG01', name: 'Mara Quill', role: 'engineer', tier: 'standard', startLevel: 1, stats: { MEC: 50, ENG: 80, AER: 49, STR: 35, DRV: 32 }, salary: 500, traits: ['dataNotes'], art: 'staff_eng01' },
];
export const STARTERS = ['DRV01', 'MEC01', 'ENG01'];

// The six derived driver ratings (bible §10.3, exact formulas):
//   rating = Σ weight × stat + trait bonus, then the condition multiplier, rounded, clamped to 1–999.
export const DRIVER_RATINGS = [
  { id: 'qualifying', name: 'Qualifying', weights: { DRV: 0.72, ENG: 0.16, STR: 0.12 } },
  { id: 'racecraft', name: 'Racecraft', weights: { DRV: 0.6, STR: 0.2, ENG: 0.12, MEC: 0.08 } },
  { id: 'wet', name: 'Wet Skill', weights: { DRV: 0.55, STR: 0.2, ENG: 0.15, MEC: 0.1 } },
  { id: 'tyreCare', name: 'Tyre Care', weights: { DRV: 0.45, STR: 0.25, ENG: 0.15, MEC: 0.15 } },
  { id: 'consistency', name: 'Consistency', weights: { DRV: 0.45, ENG: 0.2, STR: 0.2, MEC: 0.15 } },
  { id: 'feedback', name: 'Technical Feedback', weights: { ENG: 0.4, DRV: 0.3, STR: 0.2, MEC: 0.1 } },
];
export const RATING_RANGE = { min: 1, max: 999 };

// How Energy / Morale reach the ratings (bible §10.3 says they count, but gives no numbers — PLACEHOLDER):
// each status that is on multiplies every rating.
export const RATING_CONDITION = { tired: 0.92, stressed: 0.92, inspired: 1.05 };
