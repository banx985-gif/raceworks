// RACEWORKS research (Milestone 11, bible §20): the 36 visible nodes in six branches, their RP cost, prerequisites
// and what finishing each one opens. Plain data; the rules are core/ResearchSystem + src/systems/research.js.
//
// Each branch is one line: tier n needs tier n − 1 (the bible gives no cross-links). Cost = the RP paid to start it
// and the same amount of research work to finish it (core ResearchSystem).
//
// What a node opens (its unlock actions, fired once by core/UnlockActions when it finishes):
//   parts       worked out from data/cars.js — every part whose unlock names this node ({ research: 'PWR1' }) becomes
//               pickable in the car builder (a part that also needs a rank still needs it)
//   facilities  worked out from data/facilities.js — every facility whose unlock names this node opens in the shop
//   tyres       worked out from data/race.js — Hard (HAN2), Intermediate and Wet (ELE3) become selectable (bible §21)
//   extra       written here: bonuses ({ type: 'bonus', effects }) summed into the shared effect queries, and flags
//               ({ type: 'flag' }) stored for later milestones — event paths, a sponsor, the secret-part clue
//               eligibility. A clue flag NEVER unlocks the secret part itself (secret parts stay out, Milestone 25).
//   text        the bible's words for the node's unlock, as the tree shows it
//
// PLACEHOLDER (see docs/DECISIONS.md): how bonuses are read, the research speed and every RP income amount below.
export const BRANCHES = [
  { id: 'PWR', name: 'Powertrain', short: 'Power', stat: 'ENG', icon: 'part_pu01' },
  { id: 'TRN', name: 'Transmission', short: 'Gears', stat: 'ENG', icon: 'part_tr01' },
  { id: 'CHA', name: 'Chassis', short: 'Chassis', stat: 'MEC', icon: 'part_ch01' },
  { id: 'AER', name: 'Aerodynamics', short: 'Aero', stat: 'AER', icon: 'part_ae01' },
  { id: 'HAN', name: 'Handling', short: 'Handling', stat: 'MEC', icon: 'part_hb01' },
  { id: 'ELE', name: 'Electronics & Race Ops', short: 'Electr.', stat: 'STR', icon: 'part_el01' },
];

// Pictures: the Research Token (RP) and the Research button's icon (the tree, bonuses and flags).
export const RESEARCH_ICONS = { rp: 'race_reward_03', tree: 'race_ui_03' };

const bonus = (id, text, effects) => ({ type: 'bonus', id, text, effects });
const flag = (id, text) => ({ type: 'flag', id, text });

// [id, name, RP, the bible's unlock words, extra actions]
const TABLE = {
  PWR: [
    ['PWR1', 'Basic Tuning', 120, 'PU02; Engine Bench efficiency +5%', [bonus('engineBenchPlus5', 'Engine Bench efficiency +5%', [{ key: 'phaseSpeedPct.power', value: 5, needs: 'F03' }])]],
    ['PWR2', 'Forced Induction', 220, 'PU03; Turbo reliability training', [flag('turboReliabilityTraining', 'Turbo reliability training (staff training, later)')]],
    ['PWR3', 'Race Architecture', 420, 'PU04; Power development +5', [bonus('powerDev5', 'Power development +5', [{ key: 'dev.SPD', value: 2.5 }, { key: 'dev.ACC', value: 2.5 }])]],
    ['PWR4', 'High Output', 700, 'PU05; Advanced Dyno', []],
    ['PWR5', 'Torque & Durability', 1050, 'PU06; Engine Lab', []],
    ['PWR6', 'Hybrid/Electric Systems', 1500, 'PU07; Hybrid Lab; PU08 event path', [flag('eventPath.electricSystems', 'PU08: the Electric Systems event can happen (later)')]],
  ],
  TRN: [
    ['TRN1', 'Ratio Basics', 100, 'TR02; Gearbox Bench', []],
    ['TRN2', 'Sequential Design', 200, 'TR03', []],
    ['TRN3', 'Shift Control', 380, 'TR04', []],
    ['TRN4', 'Seven-Speed Systems', 650, 'TR05', []],
    ['TRN5', 'Endurance Transaxles', 950, 'TR06', []],
    ['TRN6', 'Adaptive Ratios', 1400, 'TR07; secret TR08 clue eligibility', [flag('clue.TR08', 'Secret clue eligibility: a hidden transmission (???)')]],
  ],
  CHA: [
    ['CHA1', 'Weight Reduction', 120, 'CH02', []],
    ['CHA2', 'Reinforcement', 220, 'CH03', []],
    ['CHA3', 'Monocoque Design', 420, 'CH04', []],
    ['CHA4', 'Carbon Structures', 720, 'CH05; Carbon Fabrication', []],
    ['CHA5', 'Endurance Structures', 1050, 'CH06', []],
    ['CHA6', 'Integrated Chassis', 1500, 'CH07; secret CH08 clue eligibility', [flag('clue.CH08', 'Secret clue eligibility: a hidden chassis (???)')]],
  ],
  AER: [
    ['AER1', 'Airflow Basics', 120, 'AE02', []],
    ['AER2', 'Wing Theory', 220, 'AE03', []],
    ['AER3', 'Ground Effect Basics', 420, 'AE04', []],
    ['AER4', 'Diffuser Development', 720, 'AE05; Wind Tunnel', []],
    ['AER5', 'Downforce Modelling', 1050, 'AE06; CFD Station', []],
    ['AER6', 'Low Drag & Adaptive Theory', 1500, 'AE07; secret AE08 clue eligibility', [flag('clue.AE08', 'Secret clue eligibility: a hidden aero package (???)')]],
  ],
  HAN: [
    ['HAN1', 'Dampers & Springs', 100, 'HB02', []],
    ['HAN2', 'Race Coilovers', 200, 'HB03', []],
    ['HAN3', 'Brake Systems', 380, 'HB04', []],
    ['HAN4', 'Carbon Braking', 650, 'HB05; Tyre Lab', []],
    ['HAN5', 'Long-Run Handling', 950, 'HB06', []],
    ['HAN6', 'Adaptive Dynamics', 1400, 'HB07; secret HB08 clue eligibility', [flag('clue.HB08', 'Secret clue eligibility: a hidden handling set (???)')]],
  ],
  ELE: [
    ['ELE1', 'Data Logging', 120, 'EL02', []],
    ['ELE2', 'ECU Mapping', 240, 'EL03', []],
    ['ELE3', 'Telemetry', 440, 'EL04; Telemetry Room', []],
    ['ELE4', 'Start Control', 700, 'EL05; Weather Station path', [flag('path.weatherStation', 'The Weather Station path (it opens with Electronics 5)')]],
    ['ELE5', 'Energy Recovery', 1050, 'EL06; BOTWORKS sponsor can appear', [flag('sponsor.botworks', 'The BOTWORKS sponsor can appear (sponsors, later)')]],
    ['ELE6', 'Predictive Systems', 1500, 'EL07; EL08 event; secret EL09 clue eligibility', [flag('event.EL08', 'The EL08 Predictive Control event (later)'), flag('clue.EL09', 'Secret clue eligibility: a hidden electronics unit (???)')]],
  ],
};

export const RESEARCH = BRANCHES.flatMap((b) =>
  TABLE[b.id].map(([id, name, rp, text, extra], i) => ({
    id,
    branch: b.id,
    tier: i + 1,
    name,
    rp,
    requires: i ? [TABLE[b.id][i - 1][0]] : [],
    text,
    extra,
  })),
);

// Research speed and RP income. PLACEHOLDER numbers, to be tuned by the balance soak (bible §48 acceptance targets).
export const RP_BALANCE = {
  // Work a day on the one queue: basePerDay + (the team's best stat for the branch ÷ statDivisor), then × (1 + the
  // facilities' researchSpeedPct.<branch> / 100) — the CFD Station and Engine Lab (+15%). Branch stats: BRANCHES.stat.
  // With the starters (best stat 60–83) about 8–9 a day: Basic Tuning (120) takes ~2 weeks, a tier-6 node ~6 months.
  basePerDay: 5,
  statDivisor: 20,
  // RP earned (bible §20: car projects, first-time combos, races, contracts, achievements, breakthroughs).
  car: { base: 15, perQuality: 0.5 }, // a finished car project: base + Quality × perQuality
  breakthrough: 5, // each breakthrough during a build
  race: { finished: 8, byPos: [20, 14, 10, 6, 4, 2] }, // a race weekend: finishing (not retired) + by position
  testRace: 3, // a Test Race (debug) that is finished
  // Contracts: their own RP (data/economy.js CONTRACTS.*.rp), already paid through the ledger since Milestone 5.
  firsts: {
    carClass: 25, // the first car of each class
    combo: 10, // a class + parts set never built before (bible §17.3: a basic combo 10 RP)
    race: 15, // the first race weekend finished
    podium: 25, // the first podium
    win: 40, // the first win
    contract: 15, // the first contract delivered
  },
};

// The queues (bible §20): one to start; the second opens later through facility progression (none gives it yet) or
// the VIP entitlement (the store, later) — never wired to a store now.
export const QUEUES = [
  { id: 'main', name: 'Research' },
  { id: 'second', name: 'Second queue', rule: { any: [{ effect: 'researchQueue' }, { entitlement: 'vip' }] } },
];
