// RACEWORKS car development content (bible §14–16). Plain data only; the rules are core/ProjectSystem.js plus the
// hooks in src/systems/carProject.js. Milestone 4: the Club Hatch and the six starter parts only.

// The seven car stats (bible §14.4), 0–999.
export const CAR_STATS = ['SPD', 'ACC', 'COR', 'BRK', 'REL', 'EFF', 'TYR'];
export const CAR_STAT_NAMES = { SPD: 'Top Speed', ACC: 'Acceleration', COR: 'Cornering', BRK: 'Braking', REL: 'Reliability', EFF: 'Efficiency', TYR: 'Tyre Management' };
export const CAR_STAT_MAX = 999;

// The six permanent part slots (bible §14.3), in order.
export const SLOTS = [
  { id: 'PU', name: 'Power Unit' },
  { id: 'TR', name: 'Transmission' },
  { id: 'CH', name: 'Chassis' },
  { id: 'AE', name: 'Aerodynamics' },
  { id: 'HB', name: 'Handling' },
  { id: 'EL', name: 'Electronics' },
];

// Parts (bible §15, the six "Start" rows): cost in Credits, complexity 1–10, stat modifiers.
export const PARTS = {
  PU01: { slot: 'PU', name: 'Club Four', cost: 350, cx: 1, mods: { SPD: 8, ACC: 10, REL: 12, EFF: 12 }, art: 'part_pu01' },
  TR01: { slot: 'TR', name: 'Road Manual', cost: 250, cx: 1, mods: { ACC: 8, REL: 10 }, art: 'part_tr01' },
  CH01: { slot: 'CH', name: 'Steel Tub', cost: 300, cx: 1, mods: { COR: 6, BRK: 4, REL: 18, TYR: 4 }, art: 'part_ch01' },
  AE01: { slot: 'AE', name: 'Clean Bodywork', cost: 200, cx: 1, mods: { SPD: 6, COR: 4 }, art: 'part_ae01' },
  HB01: { slot: 'HB', name: 'Road Suspension', cost: 250, cx: 1, mods: { COR: 6, BRK: 4, TYR: 8, REL: 8 }, art: 'part_hb01' },
  EL01: { slot: 'EL', name: 'Basic ECU', cost: 200, cx: 1, mods: { ACC: 5, REL: 4 }, art: 'part_el01' },
};

// Car classes (bible §14.2, §16). weights sum to 100.
//   base: the bare car's stats before parts and development. The bible gives none — PLACEHOLDER, to tune.
export const CLASSES = {
  clubHatch: {
    name: 'Club Hatch',
    weights: { SPD: 15, ACC: 20, COR: 18, BRK: 15, REL: 15, EFF: 10, TYR: 7 },
    base: { SPD: 110, ACC: 100, COR: 100, BRK: 95, REL: 100, EFF: 100, TYR: 90 },
    starterParts: { PU: 'PU01', TR: 'TR01', CH: 'CH01', AE: 'AE01', HB: 'HB01', EL: 'EL01' },
    art: 'car_v01_showcase', // bible §18 V01
    raceArt: 'car_v01_top', // the top-down race sprite (drawn nose DOWN; the race rotates it to the heading)
  },
};

// Project tiers by total part complexity (bible §15.7) and the work each phase needs (bible §14.6).
export const TIERS = [
  { id: 'starter', name: 'Starter', maxCx: 11, target: 220 },
  { id: 'standard', name: 'Standard', maxCx: 18, target: 320 },
  { id: 'advanced', name: 'Advanced', maxCx: 27, target: 450 },
  { id: 'elite', name: 'Elite', maxCx: 39, target: 620 },
  { id: 'prestige', name: 'Prestige', maxCx: Infinity, target: 850 },
];

// The five development phases (bible §14.5). weights = the stat mix the phase uses (sums to 1).
//   develops: which car stats the phase improves (shares of its development points).
//   faults: faults can arise in this phase (bible §14.8: phases 2–4). fixes: this phase can fix faults (Testing).
//   The role whose main stat leads the phase gets the +8% match bonus (bible §10.7).
export const PHASES = [
  { id: 'concept', name: 'Concept & Regulations', weights: { AER: 0.35, ENG: 0.3, STR: 0.2, MEC: 0.1, DRV: 0.05 }, develops: { SPD: 1, ACC: 1, COR: 1, BRK: 1, REL: 1, EFF: 1, TYR: 1 }, stage: 'Blueprint' },
  { id: 'chassisAero', name: 'Chassis & Aero', weights: { AER: 0.5, ENG: 0.25, MEC: 0.15, DRV: 0.1 }, develops: { COR: 3, SPD: 2, BRK: 1 }, faults: true, stage: 'Bare chassis' },
  { id: 'powertrain', name: 'Powertrain', weights: { ENG: 0.45, MEC: 0.35, AER: 0.05, STR: 0.05, DRV: 0.1 }, develops: { SPD: 2, ACC: 3, EFF: 2 }, faults: true, stage: 'Engine going in' },
  { id: 'assembly', name: 'Assembly & Setup', weights: { MEC: 0.45, ENG: 0.25, AER: 0.1, STR: 0.1, DRV: 0.1 }, develops: { REL: 3, BRK: 1, TYR: 2 }, faults: true, stage: 'Body panels on' },
  { id: 'testing', name: 'Testing & Tuning', weights: { DRV: 0.4, ENG: 0.25, STR: 0.2, MEC: 0.1, AER: 0.05 }, develops: { TYR: 2, REL: 1, COR: 1, BRK: 1 }, fixes: true, stage: 'Finished car' },
];

// Budget focus (bible §14.7). Changes only between phases.
export const BUDGETS = {
  lean: { name: 'Lean', text: '−20% daily cost · −8% quality gain · +5% fault chance', costPct: -20, qualityPct: -8, faultPct: 5, energyPct: 0 },
  balanced: { name: 'Balanced', text: 'The baseline', costPct: 0, qualityPct: 0, faultPct: 0, energyPct: 0 },
  push: { name: 'Push Quality', text: '+25% daily cost · +10% quality gain · −5% fault chance · +10% Energy drain', costPct: 25, qualityPct: 10, faultPct: -5, energyPct: 10 },
};
export const BUDGET_ORDER = ['lean', 'balanced', 'push'];

// Project numbers (bible §14.6–14.10). Percent modifiers on a chance are relative (+5% of 2.2%, not +5 points).
export const PROJECT = {
  teamSlots: 5, // bible §10.7
  roleMatchPct: 8, // bible §10.7: a role that matches the phase
  // bible §14.6: progress per day = (base + teamScore / divisor) × scale. scale is the PACING KNOB (not the bible's
  // formula shape). Measured with the 3 starters on Balanced (resting when tired): scale 1 → the first Club Hatch took
  // 113 game days (~4 months); scale 1.95 → 56 days = 2 game months, the Milestone 4 target.
  progress: { base: 8, divisor: 75, scale: 1.95 },
  checkpoint: 0.6, // bible §14.9: the one breakthrough roll per phase
  faults: {
    baseDailyPct: 2.2, // bible §14.8
    complexityPctPerCx: 10, // +10% of the chance per point of average part complexity above 1
    lowScoreBelow: 120, // a phase team score below this counts as "low relevant staff score"…
    lowScorePct: 25, // …and adds 25% to the chance
    statLoss: 10, // an unresolved fault takes this off the phase's first developed stat
    testingFixDailyPct: 12, // each Testing day: chance to fix one open fault
  },
  breakthrough: {
    basePct: 4, // bible §14.9
    innovation: 10, // INNOVATION points per breakthrough
    extraDevelopment: 12, // "extra stat development": points added to the phase's stats
  },
  // Development: each finished phase adds (average team score × pointsPerScore) points, split over its `develops`
  // stats, times the budget's quality gain.
  development: { pointsPerScore: 0.35 },
  // bible §14.10 QUALITY = clamp(0, 100, classFit / 7.2 + developmentScore × 0.28 + innovationBonus − faults × 3)
  //   developmentScore = the team's average phase score as a share of devScoreFull (0–100); innovationBonus per point.
  quality: { classFitDiv: 7.2, devWeight: 0.28, devScoreFull: 400, innovationPerPoint: 0.3, faultPenalty: 3 },
  emergencyFix: { milestone: 5 }, // costs Credits (bible §14.8): enabled once money exists
};

// Pit Bay spots for the project team (one each, in slot order), spread round the bay so nobody hides anyone:
// left front, right side, right front, then the two in between.
export const PROJECT_SPOTS = [
  { col: 6, row: 6 },
  { col: 10, row: 3 },
  { col: 9, row: 6 },
  { col: 10, row: 5 },
  { col: 7, row: 6 },
];

// The visible build in the Pit Bay (style guide §5). art: effects used by the show.
export const BUILD_ART = { smoke: 'race_vfx_10', sparkle: 'race_vfx_09', sparks: 'race_vfx_03' };
