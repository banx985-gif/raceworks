// Race simulation rules (Milestone 6; bible §23.3–23.6). Plain data only; src/race/raceSim.js runs them.
// Numbers marked PLACEHOLDER are Claude Code's (docs/DECISIONS.md).

export const RACE = {
  dt: 0.05, // simulation step in race seconds (fixed: watching and skipping step the same model)
  // Watch speeds (bible §24.5): race seconds per real second at 1× (then ×2, ×4). PLACEHOLDER: an 8-lap race takes
  // about 4 minutes at 1×, 1 minute at 4×.
  watchTimeScale: 3,
  speeds: [1, 2, 4],
  startLights: 3, // race seconds of red lights before the start
  launchDelay: { min: 0.15, spread: 0.3 }, // each car's seeded reaction at the lights
  accel: 7, // m/s² a car can gain speed at (braking is instant: the segment target already includes it)
  // paceScore (bible §23.4) = 0.56 carFit + 0.24 driverFactor + 0.10 crewFactor + 0.10 setupScore, each ~0–1:
  pace: { car: 0.56, driver: 0.24, crew: 0.1, setup: 0.1, carNorm: 400, driverNorm: 400, crewNorm: 400, setupDefault: 0.5 },
  // Player crew factor (0–400) from the best staff member's stat in each role (bible §23.4 crewFactor mix).
  crewMix: { ENG: 0.4, STR: 0.2, MEC: 0.25, AER: 0.15 },
  // paceCurve: time multiplier = 1 − slope × (paceScore − ref), clamped. PLACEHOLDER.
  paceCurve: { ref: 0.4, slope: 0.5, min: 0.8, max: 1.3 },
  // Bounded seeded variance per segment (bible §23.4): ± maxPct, narrowed by Consistency but never below minShare.
  variance: { maxPct: 2.2, consistencyFull: 400, minShare: 0.25 },
  // Traffic (bible §23.3, §23.5): a car cannot drive through the one ahead; it passes only in an overtake zone.
  traffic: { minGap: 7, hardGap: 4.5, attemptGap: 11, draftRange: [6, 32], draftPct: 2.5 },
  overtake: { base: 0.3, pacePer1Pct: 0.08, racecraftPer100: 0.25, difficulty: 0.35, min: 0.05, max: 0.85, failSlowPct: 4, failSlowSecs: 1.5, contactChance: 0.02, contactSlowSecs: 2.5, laneOffset: 3.4, passMargin: 7 },
  // Lanes: each car keeps a small seeded lane bias so a train of cars never draws as one sprite.
  laneBias: 0.9,
  laneSpeed: 1.6, // how fast a car moves sideways (share of the gap per second)
  carHalfWidth: 1.0, // metres (a club car is ~2 m wide): lateral offsets keep the whole car inside the corridor
  edgeMargin: 0.6,
  // Mechanical failure (bible §23.6), kept mild: a roll each lap.
  failure: { basePerLap: 0.004, relRef: 200, relSpan: 150, perOpenFault: 0.6, lowConditionBelow: 50, lowConditionX: 1.5, share: { paceLoss: 0.6, damage: 0.32, retire: 0.08 }, paceLossPct: 7, paceLossLaps: 1, damagePct: 2.5 },
  // What the race does to the player's car (Condition 0–100; repaired in the Car Garage, Milestone 5).
  wear: { perLap: 1, failure: 10, contact: 5, damagePer1: 1 }, // Milestone 17: + 1 Condition a 1% of race damage left at the flag
  tieBreak: 'finishTime',
};

// ---------------------------------------------------------------------------------------------------------------
// Milestone 7: race management (bible §21 tyres, §22 weekend, §24 watch / manage). PLACEHOLDER numbers.

// Tyres (bible §21). pace: time change (−1.2% = faster). wearPerLap: share of the tyre used per lap at Normal pace.
// Worn tyres slow the car: + wearPace × wear, and past the cliff + cliffPace × (wear − cliff) more.
// Hard / Inter / Wet start locked; research opens them (Milestone 11: research = the node, HAN2 / ELE3). unlocked = open
// from the start. Whether a team may pick one: team.research.tyreOpen(id).
export const TYRES = {
  soft: { name: 'Soft', icon: 'tyre_soft', pace: -0.012, wearPerLap: 0.1, unlocked: true },
  medium: { name: 'Medium', icon: 'tyre_medium', pace: 0, wearPerLap: 0.062, unlocked: true },
  hard: { name: 'Hard', icon: 'tyre_hard', pace: 0.008, wearPerLap: 0.04, unlocked: false, research: 'HAN2', unlock: 'Handling research 2' },
  inter: { name: 'Intermediate', icon: 'tyre_inter', pace: 0.03, wearPerLap: 0.06, unlocked: false, research: 'ELE3', unlock: 'Electronics & Race Ops 3 research' },
  wet: { name: 'Wet', icon: 'tyre_wet', pace: 0.05, wearPerLap: 0.06, unlocked: false, research: 'ELE3', unlock: 'Electronics & Race Ops 3 research' },
};
export const TYRE_ORDER = ['soft', 'medium', 'hard', 'inter', 'wet'];
export const TYRE_WEAR = {
  wearPace: 0.02, // +2% lap time at fully worn, on top of the cliff
  cliff: 0.62,
  cliffPace: 0.35, // +3.5% for every 10% worn past the cliff
  max: 1,
  tyreCareRef: 100, // tyre care above this makes tyres last longer: −1% wear per 10 points
  tyreCarePer10: 0.01,
  tyreStatRef: 150, // the car's TYR stat does the same: −1% per 15 points
  tyreStatPer15: 0.01,
};

// Pace (bible §24.2): no free speed — Push is faster but wears tyres and risks failures; Conserve the reverse.
export const PACE_MODES = {
  conserve: { name: 'Conserve', time: 0.012, wear: 0.75, failure: 0.6 },
  normal: { name: 'Normal', time: 0, wear: 1, failure: 1 },
  push: { name: 'Push', time: -0.012, wear: 1.5, failure: 2.5 },
};
// Race order: Attack tries more passes (and wears tyres, risks contact); Defend makes passing harder but costs pace.
export const ORDERS = {
  defend: { name: 'Defend', time: 0.004, wear: 1, attemptGapPlus: 0, chancePlus: 0, defendMinus: 0.15, contactX: 1 },
  neutral: { name: 'Neutral', time: 0, wear: 1, attemptGapPlus: 0, chancePlus: 0, defendMinus: 0, contactX: 1 },
  attack: { name: 'Attack', time: 0, wear: 1.1, attemptGapPlus: 4, chancePlus: 0.12, defendMinus: 0, contactX: 2 },
};

// Pit stops (bible §24.2 Pit Now). The car leaves on the pit spline at the pit entry, drives the pit lane at the speed
// limit, stops at its box for the service, and rejoins at the pit exit.
export const PIT = {
  laneSpeed: 17, // m/s speed limit
  service: { base: 8, mechRef: 77, perMech10: -0.4, min: 6, max: 10.5 }, // seconds: a better Mechanic is quicker
  boxAt: 0.5, // where the box is along the pit lane (share)
};

// Auto Strategy (bible §24.1): what the crew does for every car that is on Auto (rivals always; the player by default).
export const AUTO = {
  pitWear: 0.7, // plan a stop when the tyres would pass this before the next pit entry
  minLapsLeftToPit: 2, // never stop with fewer laps than this left
  nextTyreLongRun: 'medium', // more than shortRunLaps left → mediums, else softs
  shortRunLaps: 5,
  pushLastLaps: 2, // Push in the last laps when close to the car ahead and the tyres allow
  pushGap: 1.5, // seconds
  pushMaxWear: 0.7,
  conserveEndWear: 0.92, // Conserve if the tyres would pass this by the flag (and no stop is planned)
  attackGap: 1.0, // Attack when this close to the car ahead in the last attackLastLaps
  attackLastLaps: 3,
  defendGap: 0.8,
};

// The race weekend (bible §22). PLACEHOLDER numbers.
export const WEEKEND = {
  laps: 12, // a weekend race (the Test Race was 8)
  // Practice → Setup Knowledge 0–100 (§22.1): Engineer ENG, the driver's Technical Feedback, Mechanic / Aero help.
  // Milestone 15: time spent — up to maxRuns practice runs; after run n the crew has runShares[n − 1] of the full value
  // (diminishing returns). Skip = skipShare. Facilities and crew traits add on top whatever the runs.
  practice: { eng: 0.45, feedback: 0.35, crew: 0.2, full: 130, variance: 6, skipShare: 0.35, runShares: [0.62, 0.86, 1], maxRuns: 3 },
  // Setup (§22.2): three axes, each −1 / 0 / +1. Score = 100 × fit × (base + knowledgeShare × knowledge).
  // Milestone 15: the engineer's hint is a band around the crew's estimate, half-width hintHalfMax × (1 − knowledge):
  // all three options at 0 (1.5 covers them from any estimate), exact at 100. hintHalfMax ≥ autoNoise, so the band
  // always holds the track's real ideal.
  setup: { axisWeight: { aero: 0.4, gearing: 0.3, suspension: 0.3 }, fitDiv: 2, base: 0.75, knowledgeShare: 0.25, autoNoise: 1.2, hintHalfMax: 1.5 },
  // Rivals' setup scores (0–1) from their own crew: the driver's Technical Feedback and the team's crew factor.
  rivalSetup: { base: 0.45, feedbackRef: 100, feedbackPer100: 0.25, crewRef: 80, crewPer100: 0.3, spread: 0.05, softShare: 0.55 },
  // Qualifying (§22.3): one flying lap each on the starting tyre with the Qualifying rating (§10.3, traits included);
  // Consistency only narrows the bounded variance.
  quali: { driverQualifying: 1, driverConsistency: 0 },
  // Wind Tunnel's +5 Setup Knowledge (and Balance Artist, Freya Nash's podiums) count on tracks with these profiles (bible
  // §26; Milestone 19 PLACEHOLDER: the technical tracks are T05 Metro Street, T08 Neon Harbor and T06 Highcrest).
  technicalProfiles: ['Technical', 'Street/Night', 'Cornering'],
};

// Milestone 15: the fuel / energy target (bible §22.2; Electric classes call it energy). The race only (qualifying runs
// light): time = lap-time change (+ = slower), wear = tyre wear ×, failure = mechanical failure chance ×.
export const FUEL = {
  lean: { name: 'Lean', time: 0.01, wear: 0.95, failure: 0.85 },
  normal: { name: 'Normal', time: 0, wear: 1, failure: 1 },
  rich: { name: 'Rich', time: -0.005, wear: 1.15, failure: 1.8 },
};
export const FUEL_ORDER = ['lean', 'normal', 'rich'];
// Milestone 15: repair priority before the race when the car's Condition is under 100 (bible §22.2). Credits at the
// garage's rate a point (data/economy.js COSTS.repair) through the ledger when the setup locks; share = how much of the
// missing Condition comes back; crewEnergy = the Lead Mechanic's Energy (the pit crew's time). Skip: the race's
// failure chance × skipFailureX on top of the usual low-Condition rule.
export const REPAIR = {
  skip: { name: 'Skip', share: 0, crewEnergy: 0 },
  quick: { name: 'Quick', share: 0.5, crewEnergy: 6 },
  full: { name: 'Full', share: 1, crewEnergy: 14 },
  skipFailureX: 1.3,
};
export const REPAIR_ORDER = ['skip', 'quick', 'full'];
// Milestone 15: the optional Qualifying Drive lap (bible §22.3 / §25.5). One lap of the track in the M14
// DrivingChallengeController. It's compared with the controller's own perfect lap × parSlack (a good driver's lap);
// the difference, as a share of the simulated qualifying time, plus offTrackSecs a second off the road and wallSecs a
// wall hit, moves your qualifying time — capped at ± clamp(capMin, capMax, simulated time × capShare) (§25.5).
export const DRIVE_LAP = { parSlack: 1.03, capShare: 0.02, capMin: 0.75, capMax: 2.25, offTrackSecs: 0.5, wallSecs: 0.5, startSpeed: 30, timeLimitX: 2.2 };
export const SETUP_AXES = [
  { id: 'aero', name: 'Aero', icon: 'race_ui_06', options: ['Low', 'Balanced', 'High'] },
  { id: 'gearing', name: 'Gearing', icon: 'race_ui_06', options: ['Short', 'Balanced', 'Long'] },
  { id: 'suspension', name: 'Suspension', icon: 'race_ui_06', options: ['Soft', 'Balanced', 'Stiff'] },
];

// Prize money and Reputation for a weekend result, by finishing position (index 0 = 1st). DNF gets nothing.
export const PRIZES = {
  credits: [3000, 2000, 1500, 1100, 800, 600, 450, 350, 250, 150],
  reputation: [40, 30, 24, 18, 14, 10, 8, 6, 4, 2],
};

// Key Moments (bible §24.5): fast-forward stops for these (once each per race). Milestone 17 adds a weather change, a caution
// starting / ending and a big incident to your car (damage or worse) — each time they happen.
export const KEY_MOMENTS = { pitWindowWear: 0.55, podiumLastLaps: 2, podiumGap: 1.2 };

// Race HUD icons (assets/images/ui).
export const RACE_ICONS = { setup: 'race_ui_06', pit: 'race_ui_07', weather: 'race_ui_08', tyres: 'race_ui_09', fuel: 'race_ui_10', qualifying: 'race_ui_11', practice: 'race_ui_12', overtake: 'race_ui_16', defend: 'race_ui_17', pace: 'race_ui_18', damage: 'race_ui_20', caution: 'race_ui_21', condition: 'race_ui_24', auto: 'race_ui_29', drive: 'race_ui_30' }; // Milestone 15: + fuel, condition, drive (Take the Wheel); Milestone 17: + weather, damage, caution

// ---------------------------------------------------------------------------------------------------------------
// Milestone 16: race strategy, complete (bible §23.6, §24.2–24.3; src/systems/raceStrategy.js plans it). PLACEHOLDERS.

// The planner's quality 0–1 (q) from the race Strategist (bible §11.5): effective STR = STR × (1 + Strategist work % from
// facilities, Strategy Desk +8) × (1 + Auto Strategy % from facilities, Strategy Room +8) + trait points; q = (effective −
// strRef) ÷ strSpan, kept 0–1. No Strategist (a contractor) plans with contractorStr. A starting team's Ben Hale (86) → ~0.1;
// Dorian Pike (258) → ~0.6; Oracle Rey (446) → 1.
// Planning (each lap, and after a stop / a mode switch): every 0-, 1- and (if needed) 2-stop plan over the laps left, each
// open dry compound and the fuel targets it may use, costed with the stint-time model (tyre pace + wear + the cliff) plus a
// pit loss. A weak strategist is conservative: any stint that ends past safeWear (q 0 → safeWear.min, q 1 → .max) costs
// marginSecs per 1.0 of wear over it, so it stops before the cliff; its wear estimate is off by up to ± estimateErr × (1 − q)
// (fixed per car per race). A strong one runs the tyre longer (stint extensions) and, from undercutQ, undercuts (stops a lap early for) a car
// within undercutGap seconds that still has its stop to make.
// Fuel: from fuelQ the planner also weighs a Lean or Normal target mid-race (never Rich — too risky for the crew).
export const STRATEGY = {
  strRef: 60,
  strSpan: 360,
  contractorStr: 40,
  traitPoints: { threeMovesAhead: 40, grandmaster: 60, futureSight: 80, splitSecond: 10 },
  safeWear: { min: 0.6, max: 0.8, longGame: 0.05, safeCall: -0.05 },
  hardWear: 0.95, // no plan lets a stint end past this (sound plan, any quality)
  marginSecs: 60,
  estimateErr: 0.15,
  undercutQ: 0.5, // the Undercut trait undercuts at any quality
  undercutGap: 2.0,
  undercutSecs: 8, // the lap-early stop may cost the model up to this much (the fresh tyres win it back in the fight)
  fuelQ: 0.55, // the Fuel Counter trait weighs fuel at any quality (and reads wear exactly)
  minLapsLeftToPit: 2, // no planned stop with fewer laps than this to go
  // The pit window: the stop laps whose modelled race time is within windowSecs of the best, at least minWidth laps wide
  // and at most maxWidth. It's fixed for the stint when first planned (the HUD shows it) and Auto stops inside it.
  // A stop the crew didn't plan for (Pit Now before or after the window, or with no stop planned) costs outsideSecs of
  // extra service, + outsidePerLap for each further lap away, up to outsideMax: the tyres aren't ready.
  window: { windowSecs: 2.5, minWidth: 2, maxWidth: 3, outsideSecs: 2.5, outsidePerLap: 1, outsideMax: 6 },
  // The rivals' strategists (placeholder STR by team; privateers use the privateer number).
  rivals: { R01: 150, R02: 115, privateer: 70, R03: 130, R04: 220, R05: 170, R06: 190, R07: 300, R08: 380 }, // Milestone 20: + R03–R08; a championship band adds its strStep
};

// Milestone 16: repair priority at the next pit stop (bible §24.2 "Repair priority: None / Critical / Full") — mid-race,
// unlike the Milestone 15 garage repair before the race. Only costs time when there is something to fix: race damage
// (damagePct from failures) or a pace-loss fault still running. share = how much of the damage is fixed; secs = extra
// service time; heat = what happens to the engine heat (Full lets it cool).
export const PIT_REPAIR = {
  none: { name: 'None', share: 0, secs: 0, clearsFault: false, heat: 1 },
  critical: { name: 'Critical', share: 0.5, secs: 2.5, clearsFault: true, heat: 1 },
  full: { name: 'Full', share: 1, secs: 6, clearsFault: true, heat: 0.3 },
};
export const PIT_REPAIR_ORDER = ['none', 'critical', 'full'];

// Milestone 16: failure risk (bible §23.6) — one failureRisk() for the per-lap roll. Base per lap × REL × open faults × low
// Condition (Milestone 6) × pace mode (Push 2.5 / Conserve 0.6) × fuel (Milestone 15) × crew traits / skipped repair
// (entry.failureMult) × heat (1 + heat × heatX) × damage (1 + damagePct × damagePer1) × race length (1 + share of the race
// run × lengthX). Never above maxPerLap.
// Heat 0–1 builds each lap on Push (+push) and on Rich fuel (+rich), cools on Normal / Conserve.
// A failure's severity = a seeded roll + stress × severityShift, stress = the average of heat, damage ÷ damageFull and open
// faults ÷ faultsFull. Severity below paceLoss → pace loss; below forcedPit → a forced pit stop (a Critical repair, if
// there are laps enough to stop, else a pace loss); below damage → component damage; at or above it (the severe
// threshold) → retirement.
export const FAILURE_RISK = {
  heat: { push: 0.3, normal: -0.15, conserve: -0.3, rich: 0.05 },
  heatX: 1.2,
  damagePer1: 0.08,
  lengthX: 0.4,
  maxPerLap: 0.06,
  severityShift: 0.12,
  damageFull: 10,
  faultsFull: 3,
  thresholds: { paceLoss: 0.5, forcedPit: 0.65, damage: 0.92 },
};

// Milestone 16: the Strategy Swing record (bible §11 STR08, §36 SEC-STAFF-L5). A pit decision of yours that differs from
// the one Auto had planned — an undercut (stopping before Auto's lap) or an extended stint (after it, or never) — is a
// Strategy Swing win when you win the race, or finish at least gainPlaces above where you were when you made it.
// One per race at most (the first swing counts).
export const SWING = { gainPlaces: 3 };

// Milestone 16: forecast quality (bible §19 F11 / F23 / F33, §23.7) — stored with each race for Milestone 17's weather.
// accuracy 0–100 = base + STR × perStr, × (1 + Strategist work %), + the facilities' forecast points (Strategy Desk +3,
// Weather Station +20); uncertainty = (100 − accuracy) × (1 + forecastUncertaintyPct, Strategy Room −15%).
export const FORECAST = { base: 25, perStr: 0.18, max: 98 };

// Milestone 16: the crew's tyre call for the weather (bible §24.2 "Weather: accept suggested tyre call or ignore"): the first
// open compound on the weather's list. Milestone 17 fires it for real when the state changes. dry → the planner's own choice.
export const WEATHER_TYRES = { dry: ['soft', 'medium', 'hard'], damp: ['inter', 'medium', 'hard'], wet: ['wet', 'inter'], storm: ['wet', 'inter'] };

// ---------------------------------------------------------------------------------------------------------------
// Milestone 17: weather, incidents and the complete pit model (bible §21, §23.5–23.7, §24.2). PLACEHOLDERS
// (docs/DECISIONS.md). src/race/weather.js reads the weather rules, src/race/raceSim.js the rest.

// Weather states (bible §23.7), in order: a change only ever moves one step (Dry → Damp → Wet → Storm and back).
export const WEATHER_STATES = ['dry', 'damp', 'wet', 'storm'];
export const WEATHER_NAMES = { dry: 'Dry', damp: 'Damp', wet: 'Wet', storm: 'Storm' };
// The weekend's timeline, fixed when the weekend begins (seeded; saved; a reload never rerolls it). startWet: the share of
// rain weekends that are already damp / wet at the start. At each lap line (at a seeded point inside the lap) the state may
// step: from Dry it starts raining with the per-lap chance that makes the track's rainChance the chance of any rain over
// the race; from the other states by these odds (the rest = no change). maxChanges caps a race's changes.
export const WEATHER = {
  startWet: 0.3,
  odds: { damp: { up: 0.25, down: 0.2 }, wet: { up: 0.12, down: 0.22 }, storm: { down: 0.4 } },
  maxChanges: 4,
  // The forecast (bible §23.7): the true timeline blurred by the crew's uncertainty u (0–100: 100 − accuracy, less with the
  // Strategy Room). An event's blur b = u/100 × (how far ahead it is ÷ horizonLaps, at least nearShare, at most 1), so it
  // sharpens as it comes closer. Its lap is off by up to shiftLaps × b, shown as a range ± halfLaps × b; the state is one
  // step off with chance stepX × b; a real change is missed (until it is seeLaps away) with chance missX × b; a false
  // alarm (light rain that never comes) shows with chance falseX × u/100, up to falseMax. u = 0: exact.
  forecast: { horizonLaps: 6, nearShare: 0.25, shiftLaps: 3, halfLaps: 2.5, stepX: 0.5, missX: 0.3, falseX: 0.45, falseMax: 1, seeLaps: 2 },
};

// Tyre × weather (bible §21: wrong tyres are never instant failure — pace, wear and spin-risk penalties). A tyre's lap time
// = its own dry pace (TYRES.pace) × (1 + track[state]) × (1 + time), its wear × wear, its spin chance × spin. Inter is good in
// Damp and light Wet, Wet is best in Storm, slicks are very poor in the wet; Inter / Wet overheat on a dry track.
//   suitable: the tyres the crew counts as right for the state (a tyre call fires when yours isn't); best first.
export const WEATHER_TYRE = {
  track: { dry: 0, damp: 0.03, wet: 0.07, storm: 0.12 },
  dry: { soft: {}, medium: {}, hard: {}, inter: { wear: 1.8 }, wet: { wear: 2.5 } },
  damp: { soft: { time: 0.06, wear: 0.9, spin: 2.5 }, medium: { time: 0.06, wear: 0.9, spin: 2.5 }, hard: { time: 0.07, wear: 0.9, spin: 2.8 }, inter: { time: -0.03 }, wet: { time: -0.02, wear: 1.5, spin: 1.1 } },
  wet: { soft: { time: 0.16, wear: 0.8, spin: 5 }, medium: { time: 0.16, wear: 0.8, spin: 5 }, hard: { time: 0.18, wear: 0.8, spin: 5.5 }, inter: { time: -0.02, wear: 1.2, spin: 1.4 }, wet: { time: -0.035 } },
  storm: { soft: { time: 0.28, wear: 0.8, spin: 8 }, medium: { time: 0.28, wear: 0.8, spin: 8 }, hard: { time: 0.3, wear: 0.8, spin: 8.5 }, inter: { time: 0.04, wear: 1.3, spin: 2.5 }, wet: { time: -0.05, spin: 1.3 } },
  suitable: { dry: ['soft', 'medium', 'hard'], damp: ['inter', 'wet'], wet: ['inter', 'wet'], storm: ['wet'] },
};
// Wet Skill (bible §10.3): off the dry, the driver part of the pace score uses the Wet Skill rating for this share (the
// rest is the dry mix: Racecraft / Consistency). Dry: none, so Wet Skill can't matter there. Storm Queen's storm pace
// (stormPacePct, race crew) comes on top in a Storm.
export const WET_SKILL = { share: { dry: 0, damp: 0.5, wet: 1, storm: 1 } };

// Spins and contact (bible §23.5), seeded and bounded. A car rolls once at every corner segment it enters (never under
// caution): chance = basePerCorner × state × its tyre's spin × cold tyres (the first coldLaps after the start or a stop) ×
// Push / Attack × Wet Skill (off the dry: wetRef ÷ Wet Skill, kept to wetMin–wetMax) × Consistency (consistencyRef ÷ it,
// kept 0.7–1.4) × damage (1 + damage % × damageX) × the Rain Sense / Storm Queen traits (wetSpinPct, off the dry), never
// above maxPerCorner. A spin costs spinSlowSecs at spinSlowPct, and with spinDamageShare also damage (spinDamagePct) — a
// spin never retires a car by itself.
// A failed pass's contact (Milestone 6: contactChance × Attack) is × contactState off the dry; it now also damages: with
// contactDamageShare one car takes contactDamagePct, and with contactRetireShare (rare) the attacker retires.
// The whole field has at most maxPerRace incidents (spins + contacts) a race: after that none roll.
export const INCIDENTS = {
  basePerCorner: 0.00025,
  state: { dry: 1, damp: 3, wet: 6, storm: 10 },
  coldLaps: 0.6,
  coldX: 1.8,
  pushX: 1.4,
  attackX: 1.5,
  wetRef: 150,
  wetMin: 0.5,
  wetMax: 2,
  consistencyRef: 150,
  damageX: 0.05,
  maxPerCorner: 0.03,
  spinSlowSecs: 4,
  spinSlowPct: 55,
  spinDamageShare: 0.25,
  spinDamagePct: 2,
  contactState: { dry: 1, damp: 1.5, wet: 2.5, storm: 3.5 },
  contactDamageShare: 0.45,
  contactDamagePct: 3,
  contactRetireShare: 0.06,
  maxPerRace: 8,
};

// Caution (bible §24.2 neutralisation): a serious incident (a car retired on track, a contact with damage, a spin with
// damage off the dry) calls one with these chances. Under caution the field runs at cautionPace × each segment's reference
// speed, a car more than bunchGap metres behind the next closes up at catchUpX, nobody overtakes or spins, and the pit
// lane is open (a cheap stop: Auto takes a planned stop due within stopAheadLaps — any planned stop with Safety Car
// Sense). It lasts minLaps–maxLaps of the leader's laps, then the race goes green. At most maxPerRace a race, none within
// cooldownLaps of the last one's end or in the last lastLaps: a caution never calls itself again, and the race always
// reaches the flag. Places you gain between a caution's start and its end count as neutralisation gains (Eli Moss).
export const CAUTION = {
  chance: { retire: 0.6, contact: 0.3, spin: 0.2 },
  minLaps: 2,
  maxLaps: 3,
  maxPerRace: 2,
  cooldownLaps: 2,
  lastLaps: 1.5,
  cautionPace: 0.62,
  bunchGap: 28,
  catchUpX: 1.3,
  stopAheadLaps: { weak: 1, strong: 3 },
};

// The pit service, complete (bible §24.2): base (jacks up, car down) + a tyre change + fuel / energy to the target + the
// repair − the Lead Mechanic's effect (mechRef MEC is none; perMech10 seconds a 10 MEC, kept to −mechBest … +mechWorst).
// The race crew's pit traits (pitServicePct) scale the whole stop; the pit facilities (pitBasePct: F25 Pit Training Rig
// −12% when it joins the shop) scale the base. A repair: PIT_REPAIR secs + perFault for each car-build fault it fixes
// (PIT_FAULT_FIX: Critical one, Full all), × the Fixer trait (raceRepairPct). Never under min.
export const PIT_SERVICE = { base: 3, tyres: 4, fuel: { lean: 0.8, normal: 1, rich: 1.3 }, mechRef: 77, perMech10: 0.4, mechBest: 2, mechWorst: 2.5, min: 4.5, perFault: 1.5 };
export const PIT_FAULT_FIX = { none: 0, critical: 1, full: 99 };

// ---------------------------------------------------------------------------------------------------------------
// Milestone 18: the optional Drive Stint (bible §8, §25). PLACEHOLDERS (docs/DECISIONS.md). src/race/driveStint.js runs it.

// Race types (bible §25.1–25.2): how long a stint lasts (seconds of real time) and how many a race allows. Every race so
// far is standard (the 12-lap Pine Ridge weekend, and the debug Test Race); sprint / endurance arrive with later race types.
export const RACE_TYPES = {
  sprint: { name: 'Sprint', stintSecs: 45, stintCap: 1 },
  standard: { name: 'Standard', stintSecs: 60, stintCap: 1 },
  endurance: { name: 'Endurance', stintSecs: 90, stintCap: 2 },
};
// The stint (§25.3–25.5):
//   parSlack: the crew's (Auto model's) pace equals the controller's perfect driver × parSlack (a good driver), as the
//     M15 Drive lap; race time runs at (model time ÷ that pace) race seconds a real second while you drive.
//   cap: influenceCap = clamp(capMin, capMax, expected × capShare); manualDelta = clamp(±cap, actual − expected).
//   offTrack: every `every` seconds with a wheel past the corridor edge is a `secs` penalty (inside the delta); the car
//     slows off the road and a barrier nudges it back (never a teleport). wallDamagePct: damage a barrier hit adds (at most
//     damageMax a stint).
//   push: the Push button — top speed × speedX, acceleration × accelX, tyre load × loadX; heat as the Push pace for the
//     share of the stint it was held; fuel / energy × fuelX for that share.
//   abuse: tyre wear for the section = the model's wear × your tyre load ÷ the perfect driver's (kept abuseMin–abuseMax;
//     Tyre Care already lowers your load in the controller).
//   grip: the road's grip by weather (× wrongTyre on a tyre that doesn't suit it); Wet Skill adds wetPer1000 a point.
//   car: COR / BRK / ACC / SPD set the controller car: 1 + (stat − ref) / 1000 × per1000, kept min–max.
//   contactM / contactLat: closer than this to a rival (along / across the road) is a touch; closing faster than hitClosing
//     it is contact under the M17 rules, slower it just holds you up behind the car.
export const DRIVE_STINT = {
  parSlack: 1.03,
  capShare: 0.02,
  capMin: 0.75,
  capMax: 2.25,
  offTrack: { every: 3, secs: 1 },
  wallDamagePct: 1,
  damageMax: 4,
  push: { speedX: 1.04, accelX: 1.12, loadX: 1.5, fuelX: 1.12 },
  abuseMin: 0.7,
  abuseMax: 1.6,
  grip: { dry: 1, damp: 0.85, wet: 0.72, storm: 0.58 },
  wrongTyre: 0.8,
  wetPer1000: 0.3,
  car: { ref: 100, per1000: 1, min: 0.85, max: 1.3 },
  contactM: 3.6,
  contactLat: 2.2,
  hitClosing: 3, // m/s (race speed): closing faster than this on the car ahead is a hit; slower, it holds you up
  minLapsLeft: 0.6, // no stint this close to the flag
};

// ---------------------------------------------------------------------------------------------------------------
// Milestone 19: what a track's own data does in the race (src/race/raceSim.js reads the track, never its id). PLACEHOLDERS.
//   surfaceGrip zones: a segment at grip g is × (1 + (1 − g) × gripTimePer) slower, and spins × (1 / g)^gripSpinPow.
//   walls: true (street circuits) → a spin damages the car wallsSpinDamageX times as often.
//   draftX (the oval's slipstream) and engineHeat (a hot track's extra engine heat a lap) are per track.
export const TRACK_EFFECTS = { gripTimePer: 0.5, gripSpinPow: 2, wallsSpinDamageX: 1.8 };
