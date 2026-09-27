// RACEWORKS car development content (bible §14–16). Plain data only; the rules are core/ProjectSystem.js plus the
// hooks in src/systems/carProject.js. Milestone 9: all 10 classes, all 50 parts, the 20 visual families; which ones a
// team may use is src/systems/carCatalog.js.

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

// All 50 parts (bible §15.1–15.6): cost in Credits (per car), complexity Cx 1–10, stat modifiers, unlock rule, icon.
//   unlock: { start: true }                     every team has it
//           { research: 'PWR1' }                the research node (Milestone 11) — the bible's "Powertrain 1" etc.
//           { research, rank: 'A' }             research and a rank
//           { event: 'electricSystems' }        a story event (PU08: the Electric Systems event)
//           { rank: 'A', facility: 'F23' }      a rank and a built facility (EL08: Strategy Room)
//           { secret: 'SEC-PART-01' }           a secret flag. secret: true parts are NEVER offered normally.
const P = (slot, name, cost, cx, mods, unlock, extra = {}) => ({ slot, name, cost, cx, mods, unlock, ...extra });
const START = { start: true };
export const PARTS = {
  // 15.1 Power Unit
  PU01: P('PU', 'Club Four', 350, 1, { SPD: 8, ACC: 10, REL: 12, EFF: 12 }, START),
  PU02: P('PU', 'Tuned Four', 700, 2, { SPD: 16, ACC: 18, REL: 8, EFF: 8 }, { research: 'PWR1' }),
  PU03: P('PU', 'Turbo Four', 1400, 3, { SPD: 24, ACC: 30, REL: 2, EFF: 4 }, { research: 'PWR2' }),
  PU04: P('PU', 'Race Six', 2600, 4, { SPD: 34, ACC: 28, REL: 8, EFF: 0 }, { research: 'PWR3' }),
  PU05: P('PU', 'Turbo Six', 4200, 5, { SPD: 46, ACC: 42, REL: 2, EFF: -4 }, { research: 'PWR4' }),
  PU06: P('PU', 'Torque Eight', 6500, 6, { SPD: 50, ACC: 48, REL: 8, EFF: -10 }, { research: 'PWR5' }),
  PU07: P('PU', 'Hybrid Race Unit', 9000, 7, { SPD: 48, ACC: 50, REL: 16, EFF: 30 }, { research: 'PWR6', rank: 'A' }),
  PU08: P('PU', 'Electric Sprint Unit', 11000, 8, { SPD: 42, ACC: 60, REL: 18, EFF: 38 }, { event: 'electricSystems' }),
  PU09: P('PU', 'Zero HyperCore', 18000, 10, { SPD: 72, ACC: 72, REL: 22, EFF: 28 }, { secret: 'SEC-PART-01' }, { secret: true }),
  // 15.2 Transmission
  TR01: P('TR', 'Road Manual', 250, 1, { ACC: 8, REL: 10 }, START),
  TR02: P('TR', 'Close Ratio', 600, 2, { ACC: 16, SPD: 6, REL: 6 }, { research: 'TRN1' }),
  TR03: P('TR', 'Sequential', 1200, 3, { ACC: 24, SPD: 8, REL: 8 }, { research: 'TRN2' }),
  TR04: P('TR', 'Quickshift Six', 2200, 4, { ACC: 30, SPD: 10, REL: 6 }, { research: 'TRN3' }),
  TR05: P('TR', 'Race Seven-Speed', 3800, 5, { ACC: 36, SPD: 16, REL: 8 }, { research: 'TRN4' }),
  TR06: P('TR', 'Endurance Transaxle', 5400, 6, { ACC: 24, REL: 30, EFF: 12 }, { research: 'TRN5' }),
  TR07: P('TR', 'Adaptive Ratio Box', 8200, 7, { ACC: 42, SPD: 22, EFF: 18, REL: 14 }, { research: 'TRN6', rank: 'A' }),
  TR08: P('TR', 'Seamless Shift', 14500, 10, { ACC: 62, SPD: 32, REL: 22, EFF: 20 }, { secret: 'SEC-PART-02' }, { secret: true }),
  // 15.3 Chassis
  CH01: P('CH', 'Steel Tub', 300, 1, { COR: 6, BRK: 4, REL: 18, TYR: 4 }, START),
  CH02: P('CH', 'Lightened Shell', 750, 2, { ACC: 10, COR: 14, REL: 8, TYR: 6 }, { research: 'CHA1' }),
  CH03: P('CH', 'Reinforced Frame', 1400, 3, { REL: 28, BRK: 8, COR: 4 }, { research: 'CHA2' }),
  CH04: P('CH', 'Aluminium Monocoque', 2600, 4, { ACC: 12, COR: 24, BRK: 10, REL: 16 }, { research: 'CHA3' }),
  CH05: P('CH', 'Carbon Monocoque', 4600, 5, { ACC: 18, COR: 34, BRK: 14, REL: 18 }, { research: 'CHA4' }),
  CH06: P('CH', 'Endurance Frame', 6200, 6, { REL: 42, EFF: 14, TYR: 16 }, { research: 'CHA5' }),
  CH07: P('CH', 'Aero-Integrated Tub', 8500, 7, { COR: 38, SPD: 18, BRK: 14, REL: 20 }, { research: 'CHA6', rank: 'A' }),
  CH08: P('CH', 'Active Flex Chassis', 15000, 10, { COR: 58, BRK: 36, REL: 34, TYR: 24 }, { secret: 'SEC-PART-03' }, { secret: true }),
  // 15.4 Aerodynamics
  AE01: P('AE', 'Clean Bodywork', 200, 1, { SPD: 6, COR: 4 }, START),
  AE02: P('AE', 'Front Splitter', 550, 2, { COR: 12, BRK: 4 }, { research: 'AER1' }),
  AE03: P('AE', 'Rear Wing', 1100, 3, { COR: 20, SPD: -2, TYR: -2 }, { research: 'AER2' }),
  AE04: P('AE', 'Undertray', 2200, 4, { COR: 26, SPD: 8, EFF: 5 }, { research: 'AER3' }),
  AE05: P('AE', 'Race Diffuser', 3600, 5, { COR: 34, SPD: 10, BRK: 8 }, { research: 'AER4' }),
  AE06: P('AE', 'High Downforce Kit', 5200, 6, { COR: 46, BRK: 12, SPD: -6, TYR: -4 }, { research: 'AER5' }),
  AE07: P('AE', 'Low Drag Package', 7600, 7, { SPD: 44, ACC: 12, COR: 14, EFF: 14 }, { research: 'AER6', rank: 'A' }),
  AE08: P('AE', 'Active Aero', 14000, 10, { SPD: 42, COR: 52, BRK: 26, EFF: 18 }, { secret: 'SEC-PART-04' }, { secret: true }),
  // 15.5 Handling
  HB01: P('HB', 'Road Suspension', 250, 1, { COR: 6, BRK: 4, TYR: 8, REL: 8 }, START),
  HB02: P('HB', 'Sport Dampers', 650, 2, { COR: 14, BRK: 8, TYR: 8 }, { research: 'HAN1' }),
  HB03: P('HB', 'Race Coilovers', 1300, 3, { COR: 24, BRK: 14, TYR: 4 }, { research: 'HAN2' }),
  HB04: P('HB', 'Big Brake Kit', 2300, 4, { BRK: 28, COR: 10, REL: 8 }, { research: 'HAN3' }),
  HB05: P('HB', 'Carbon Brake Set', 3900, 5, { BRK: 40, COR: 12, REL: 10 }, { research: 'HAN4' }),
  HB06: P('HB', 'Endurance Suspension', 5400, 6, { COR: 22, BRK: 18, REL: 28, TYR: 28 }, { research: 'HAN5' }),
  HB07: P('HB', 'Adaptive Dampers', 7800, 7, { COR: 40, BRK: 26, TYR: 24, REL: 16 }, { research: 'HAN6', rank: 'A' }),
  HB08: P('HB', 'Active Handling System', 14500, 10, { COR: 56, BRK: 48, TYR: 36, REL: 22 }, { secret: 'SEC-PART-05' }, { secret: true }),
  // 15.6 Electronics
  EL01: P('EL', 'Basic ECU', 200, 1, { ACC: 5, REL: 4 }, START),
  EL02: P('EL', 'Data Logger', 500, 2, { REL: 8, EFF: 6 }, { research: 'ELE1' }),
  EL03: P('EL', 'Performance ECU', 1000, 3, { ACC: 16, SPD: 8, REL: 4 }, { research: 'ELE2' }),
  EL04: P('EL', 'Telemetry Suite', 1900, 4, { COR: 8, BRK: 8, REL: 14 }, { research: 'ELE3' }),
  EL05: P('EL', 'Launch Control', 3200, 5, { ACC: 28, TYR: -4 }, { research: 'ELE4' }),
  EL06: P('EL', 'Energy Recovery', 4800, 6, { EFF: 34, ACC: 10, REL: 12 }, { research: 'ELE5' }),
  EL07: P('EL', 'Active Differential', 6500, 7, { COR: 30, ACC: 16, TYR: 14 }, { research: 'ELE6' }),
  EL08: P('EL', 'Predictive Control', 8600, 8, { COR: 24, BRK: 18, EFF: 18, REL: 20 }, { rank: 'A', facility: 'F23' }),
  EL09: P('EL', 'BOTWORKS RaceCore', 16000, 10, { SPD: 20, ACC: 24, COR: 36, BRK: 24, REL: 28, EFF: 22, TYR: 18 }, { secret: 'SEC-PART-06' }, { secret: true }),
};
for (const [id, p] of Object.entries(PARTS)) p.art = `part_${id.toLowerCase()}`; // parts/part_<id>.png
export const START_PARTS = { PU: 'PU01', TR: 'TR01', CH: 'CH01', AE: 'AE01', HB: 'HB01', EL: 'EL01' };

// All 10 car classes (bible §14.2, §16). weights: the §16 target weights (sum 100).
//   base: the bare car's stats before parts and development. The bible gives none — PLACEHOLDER (DECISIONS.md, M9):
//     the Club Hatch keeps its M4 line; higher classes start higher, shaped by their weights.
//   baseCost: Credits paid at Start on top of the parts (the class licence / bare shell) — PLACEHOLDER. The Club Hatch is
//     0 so the first car still costs what M5 balanced (parts + running cost).
//   tag: competition eligibility (a championship lists the tags it accepts — bible §27, Milestone 20).
//   rank: the rank the class opens at — PLACEHOLDER from the earliest championship that accepts it (bible §27 / §9.3).
//   family: the base visual family (bible §18); the mapper (src/systems/carVisual.js) turns class + parts into a family.
//   starterParts: the default pick in each slot (the "Start" parts).
const K = (name, tag, rank, baseCost, family, weights, base) => ({ name, tag, rank, baseCost, family, weights, base, starterParts: START_PARTS, art: CAR_FAMILIES[family].showcase, raceArt: CAR_FAMILIES[family].top });
const W = (SPD, ACC, COR, BRK, REL, EFF, TYR) => ({ SPD, ACC, COR, BRK, REL, EFF, TYR });
export const CLASSES = {
  clubHatch: K('Club Hatch', 'club', 'E', 0, 'V01', W(15, 20, 18, 15, 15, 10, 7), W(110, 100, 100, 95, 100, 100, 90)),
  lightweight: K('Lightweight', 'lightweight', 'E', 400, 'V02', W(12, 18, 28, 18, 8, 7, 9), W(105, 110, 125, 110, 85, 105, 100)),
  touring: K('Touring', 'touring', 'D', 1200, 'V04', W(14, 16, 20, 18, 18, 6, 8), W(120, 115, 120, 115, 120, 95, 100)),
  gt: K('GT', 'gt', 'D', 2500, 'V06', W(18, 18, 20, 15, 12, 8, 9), W(150, 140, 140, 125, 115, 95, 105)),
  formula: K('Formula', 'formula', 'C', 3500, 'V08', W(20, 22, 26, 14, 6, 5, 7), W(175, 170, 185, 140, 85, 80, 95)),
  stock: K('Stock', 'stock', 'C', 2800, 'V10', W(25, 24, 10, 12, 16, 5, 8), W(185, 175, 105, 115, 130, 80, 100)),
  endurance: K('Endurance', 'endurance', 'B', 5500, 'V11', W(12, 12, 14, 12, 22, 16, 12), W(150, 135, 140, 130, 175, 150, 140)),
  prototype: K('Prototype', 'prototype', 'B', 8000, 'V12', W(20, 22, 22, 14, 8, 8, 6), W(195, 190, 190, 150, 105, 105, 95)),
  electric: K('Electric', 'electric', 'B', 7000, 'V12', W(14, 26, 18, 16, 12, 10, 4), W(150, 200, 150, 140, 125, 160, 85)),
  experimental: K('Experimental', 'experimental', 'B', 10000, 'V12', W(15, 15, 15, 15, 15, 10, 15), W(170, 170, 170, 165, 150, 140, 155)),
};
export const CLASS_ORDER = Object.keys(CLASSES);
// The rank letters low → high (bible §9.3), for "opens at Rank X" checks.
export const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S'];
// Prestige projects (bible §15.7) need Rank S or one of these secret flags ("a qualifying secret event") — PLACEHOLDER:
// the secret-part flags until the secret engine (Milestone 25) names the real ones.
export const PRESTIGE_SECRET_FLAGS = ['SEC-PART-01', 'SEC-PART-02', 'SEC-PART-03', 'SEC-PART-04', 'SEC-PART-05', 'SEC-PART-06'];

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
