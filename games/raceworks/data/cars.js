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

// Car visual families (bible §18, §41): each family is one showcase picture (3/4 front-side, the garage and results)
// and one top-down race sprite (drawn nose DOWN; the race turns it to the heading), so a car looks like the same car
// in the garage and on track. The pairs were matched by body shape (assets/ART_STATUS.md).
//   paint: the colour family the art is painted in (a team in that colour sees the art exactly as drawn).
//   liveryAnchors (bible §41.1): team-colour patches over the art, as polygons in fractions of the image (0–1).
//     Inside a patch only the red body paint takes the team colour (its shading kept); windows, lights, tyres,
//     the white and yellow stripes and the outlines are never touched. null = shown in its own colours (rivals).
//     sponsorSlots: none yet (sponsors arrive with their milestone).
const fam = (n, paint = 'red', liveryAnchors = null) => ({ showcase: `car_v${n}_showcase`, top: `car_v${n}_top`, paint, liveryAnchors });
export const CAR_FAMILIES = {
  V01: fam('01', 'red', {
    showcase: [
      // roof, roof scoop, the pillar behind the windscreen and the frame over the side windows
      [[0.4, 0.1], [0.75, 0.08], [0.85, 0.15], [0.93, 0.22], [0.92, 0.26], [0.86, 0.22], [0.74, 0.2], [0.72, 0.46], [0.67, 0.48], [0.665, 0.3], [0.68, 0.21], [0.44, 0.21]],
      // bonnet and front bumper (below the windscreen, clear of the front wheel) with the windscreen's left pillar
      [[0.03, 0.42], [0.22, 0.38], [0.33, 0.17], [0.41, 0.1], [0.45, 0.19], [0.37, 0.22], [0.29, 0.39], [0.28, 0.41], [0.62, 0.45], [0.66, 0.55], [0.6, 0.63], [0.57, 0.94], [0.3, 0.995], [0.04, 0.95], [0.01, 0.7]],
      // door and rear quarter (below the side windows, between the wheels)
      [[0.62, 0.47], [0.7, 0.45], [0.9, 0.41], [0.88, 0.3], [0.99, 0.33], [0.98, 0.5], [0.9, 0.56], [0.86, 0.72], [0.8, 0.8], [0.78, 0.62], [0.66, 0.57]],
      // the rear wing's end plate
      [[0.92, 0.12], [1, 0.1], [1, 0.3], [0.93, 0.3]],
    ],
    race: [
      // rear deck, roof and rear wings, and the side panels beside the cockpit (the art's nose points down)
      [[0.04, 0.11], [0.96, 0.11], [0.96, 0.58], [0.7, 0.58], [0.68, 0.36], [0.32, 0.36], [0.3, 0.58], [0.04, 0.58]],
      // bonnet and front wings (in front of the windscreen)
      [[0.14, 0.55], [0.86, 0.55], [0.86, 0.86], [0.14, 0.86]],
      // the front splitter's red tow hooks and fins
      [[0.24, 0.86], [0.76, 0.86], [0.76, 1], [0.24, 1]],
    ],
    sponsorSlots: [],
  }),
  V02: fam('02'), V03: fam('03'), V04: fam('04'), V05: fam('05'), V06: fam('06'), V07: fam('07'), V08: fam('08'), V09: fam('09'), V10: fam('10'),
  V11: fam('11'), V12: fam('12'), V13: fam('13'), V14: fam('14'), V15: fam('15'), V16: fam('16'), V17: fam('17'), V18: fam('18'), V19: fam('19'), V20: fam('20'),
};
// Which family a showcase or race picture belongs to (null for anything else).
export const familyOfArt = (key) => Object.values(CAR_FAMILIES).find((f) => f.showcase === key || f.top === key) ?? null;

// Car classes (bible §14.2, §16). weights sum to 100.
//   base: the bare car's stats before parts and development. The bible gives none — PLACEHOLDER, to tune.
export const CLASSES = {
  clubHatch: {
    name: 'Club Hatch',
    weights: { SPD: 15, ACC: 20, COR: 18, BRK: 15, REL: 15, EFF: 10, TYR: 7 },
    base: { SPD: 110, ACC: 100, COR: 100, BRK: 95, REL: 100, EFF: 100, TYR: 90 },
    starterParts: { PU: 'PU01', TR: 'TR01', CH: 'CH01', AE: 'AE01', HB: 'HB01', EL: 'EL01' },
    family: 'V01', // bible §18 V01: the same car in the garage (art) and on track (raceArt)
    art: CAR_FAMILIES.V01.showcase,
    raceArt: CAR_FAMILIES.V01.top,
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
