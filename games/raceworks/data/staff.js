// RACEWORKS staff content (bible §10–11). Plain data only; the rules live in core/StaffSystem.js,
// src/systems/driverRatings.js, src/systems/staffTraits.js (what traits do), src/systems/staffEligibility.js (who can be
// found) and src/systems/careers.js (career records). Milestone 3: the three starters. Milestone 12: the rows
// recruitment could offer then. Milestone 13: all 50 rows of bible §11, every trait with its effect, eligibility as data.

// The five work stats (bible §10.2). Visible range 1–999.
export const STAT_KEYS = ['MEC', 'ENG', 'AER', 'STR', 'DRV'];
export const STAT_NAMES = { MEC: 'Mechanical', ENG: 'Engineering', AER: 'Aerodynamics', STR: 'Strategy', DRV: 'Driving' };

// Five roles (bible §10.1). primaryStat = the role's bias (level-ups favour it). code = the id / portrait prefix.
export const ROLES = {
  driver: { name: 'Driver', primaryStat: 'DRV', badge: 'badge_role_01', code: 'DRV' },
  mechanic: { name: 'Mechanic', primaryStat: 'MEC', badge: 'badge_role_02', code: 'MEC' },
  engineer: { name: 'Race Engineer', primaryStat: 'ENG', badge: 'badge_role_03', code: 'ENG' },
  aero: { name: 'Aero Designer', primaryStat: 'AER', badge: 'badge_role_04', code: 'AER' },
  strategist: { name: 'Strategist', primaryStat: 'STR', badge: 'badge_role_05', code: 'STR' },
};

// Tiers (bible §10.6). traitSlots = normal traits; Legendary / Secret also carry one signature trait (core StaffModel
// signatureTrait: a trait with signature: true doesn't fill a slot).
export const TIERS = {
  standard: { name: 'Standard', statCap: 220, traitSlots: 1 },
  rare: { name: 'Rare', statCap: 300, traitSlots: 1 },
  elite: { name: 'Elite', statCap: 400, traitSlots: 2 },
  legendary: { name: 'Legendary', statCap: 520, traitSlots: 2, signature: true },
  secret: { name: 'Secret', statCap: 650, traitSlots: 3, signature: true },
};

// --- traits (Milestone 13: the trait framework) ----------------------------------------------------------------------
// Every trait of bible §11 is one entry. The bible names them but gives no numbers: every value here is a PLACEHOLDER
// (listed in docs/DECISIONS.md), to tune in the balance pass.
//   ratings  permanent bonuses to that person's six driver ratings (bible §10.3: normally −40 … +80)
//   effects  work effects (src/systems/staffTraits.js TRAIT_EFFECTS says who they count for and where):
//     phasePct { phaseId: % }  their own work in that car-project phase
//     faultPct                 the car team's fault chance (%, negative = fewer)
//     breakthroughPct          the car team's breakthrough chance (points)
//     testFixPct               the car team's chance to fix a fault in Testing (%)
//     pitServicePct            the race crew's pit service time (%, negative = quicker)
//     setupKnowledge           the race crew's practice Setup Knowledge (points)
//     crewPct                  the race crew factor (%)
//     tyreWearPct              your car's tyre wear in a race (%)
//     failurePct               your car's mechanical failure chance in a race (%)
//     xpGainPct / energyLossPct / moraleFloor   core/StaffSystem's own keys (that person)
//   later    { text, waits }: the part of the trait whose system isn't built yet (it switches on in that milestone)
//   signature: true — the Legendary / Secret one-of-a-kind trait (it doesn't take a trait slot)
export const TRAITS = {
  // Drivers
  lateBraker: { name: 'Late Braker', text: 'Brakes later than anyone: quick over one lap, a little ragged over a race.', ratings: { qualifying: 40, racecraft: 15, consistency: -10 } },
  smoothHands: { name: 'Smooth Hands', text: 'Gentle on the car: kind to tyres, steady lap after lap.', ratings: { tyreCare: 30, consistency: 10 } },
  quickLearner: { name: 'Quick Learner', text: 'Picks things up fast: more XP from everything.', ratings: { feedback: 10 }, effects: { xpGainPct: 20 } },
  rainSense: { name: 'Rain Sense', text: 'Reads a wet track better than anyone.', ratings: { wet: 60, consistency: 5 }, effects: { wetSpinPct: -40 } },
  qualifier: { name: 'Qualifier', text: 'Finds the perfect lap when it counts: Saturday specialist.', ratings: { qualifying: 60 } },
  comeback: { name: 'Comeback', text: 'Never gives up: carves through the field from a bad grid slot.', ratings: { racecraft: 50, consistency: -5 } },
  tyreWhisperer: { name: 'Tyre Whisperer', text: 'Makes a set of tyres last and last.', ratings: { tyreCare: 70 }, effects: { tyreWearPct: -5 } },
  fearless: { name: 'Fearless', text: 'Goes for gaps others don’t see, rain or shine.', ratings: { racecraft: 60, wet: 30, consistency: -15 } },
  stormQueen: { name: 'Storm Queen', signature: true, text: 'The worse the weather, the faster she goes.', ratings: { wet: 80, racecraft: 40, consistency: 20 }, effects: { stormPacePct: -1.5, wetSpinPct: -30 } },
  perfectLine: { name: 'Perfect Line', signature: true, text: 'The same perfect lap, every lap.', ratings: { consistency: 80, qualifying: 50, tyreCare: 40 } },
  // Mechanics
  fastHands: { name: 'Fast Hands', text: 'Quick with the tools: faster fitting and pit work.', effects: { phasePct: { assembly: 5 }, pitServicePct: -5 } },
  carefulBuilder: { name: 'Careful Builder', text: 'Checks every bolt twice: fewer faults in the build.', effects: { faultPct: -8 } },
  pitReady: { name: 'Pit Ready', text: 'Always ready for the stop: quicker pit service.', effects: { pitServicePct: -8 } },
  fixer: { name: 'Fixer', text: 'Finds and fixes faults in testing.', effects: { testFixPct: 25, raceRepairPct: -25 } },
  fabricator: { name: 'Fabricator', text: 'Makes parts fit first time: faster chassis work.', effects: { phasePct: { chassisAero: 8 } } },
  reliabilityFirst: { name: 'Reliability First', text: 'Builds cars that finish: fewer faults and failures.', effects: { faultPct: -4, failurePct: -15 } },
  pitCaptain: { name: 'Pit Captain', text: 'Runs the pit crew like a clock.', effects: { pitServicePct: -12, crewPct: 3 } },
  masterFabricator: { name: 'Master Fabricator', text: 'Shapes metal and carbon like nobody else.', effects: { phasePct: { chassisAero: 10, assembly: 6 }, breakthroughPct: 2 } },
  goldenWrench: { name: 'Golden Wrench', signature: true, text: 'Nothing leaves the garage unless it’s right.', effects: { faultPct: -20, pitServicePct: -12 } },
  neverBreak: { name: 'Never Break', signature: true, text: 'Their cars simply don’t break.', effects: { faultPct: -25, failurePct: -50 } },
  // Race Engineers
  dataNotes: { name: 'Data Notes', text: 'Keeps careful notes: better setup feedback and fewer surprises.', ratings: { feedback: 30, consistency: 10 }, effects: { setupKnowledge: 3 } },
  calmRadio: { name: 'Calm Radio', text: 'A calm voice on the radio: a steadier crew.', effects: { setupKnowledge: 2, crewPct: 2 } },
  telemetryEye: { name: 'Telemetry Eye', text: 'Spots the problem in the data: better practice.', effects: { setupKnowledge: 6 } },
  powertrainMind: { name: 'Powertrain Mind', text: 'Lives for engines: faster powertrain work.', effects: { phasePct: { powertrain: 8 } } },
  setupSage: { name: 'Setup Sage', text: 'Finds the setup other teams miss.', effects: { setupKnowledge: 8 } },
  raceReader: { name: 'Race Reader', text: 'Reads the race as it happens: a sharper crew.', effects: { crewPct: 4 } },
  dataArchitect: { name: 'Data Architect', text: 'Builds the data systems the whole team runs on.', effects: { setupKnowledge: 10, testFixPct: 15 } },
  perfectBalance: { name: 'Perfect Balance', text: 'Finds a balance that works on any car.', effects: { setupKnowledge: 8, phasePct: { testing: 8 } } },
  systemsGenius: { name: 'Systems Genius', signature: true, text: 'Understands every system on the car at once.', effects: { setupKnowledge: 15, faultPct: -10, breakthroughPct: 3 } },
  zeroError: { name: 'Zero Error', signature: true, text: 'Never gets a number wrong.', effects: { faultPct: -30, setupKnowledge: 10 } },
  // Aero Designers
  cleanShapes: { name: 'Clean Shapes', text: 'Draws tidy, low-drag bodywork: faster chassis and aero work.', effects: { phasePct: { chassisAero: 5 } } },
  lowDrag: { name: 'Low Drag', text: 'Slippery shapes: better aero concepts.', effects: { phasePct: { concept: 6, chassisAero: 3 } } },
  downforce: { name: 'Downforce', text: 'Loves grip in the corners: stronger aero work.', effects: { phasePct: { chassisAero: 6 } } },
  streetPackage: { name: 'Street Package', text: 'Knows how to set a car up for tight corners.', effects: { setupKnowledge: 4, setupKnowledgeStreet: 6 } },
  windTunnelRat: { name: 'Wind Tunnel Rat', text: 'Never happier than in the tunnel: aero breakthroughs.', effects: { phasePct: { chassisAero: 6 }, breakthroughPct: 1 } },
  balanceArtist: { name: 'Balance Artist', text: 'A car that is kind to its driver.', effects: { setupKnowledge: 5, phasePct: { testing: 4 }, setupKnowledgeTechnical: 6 } },
  flowMaster: { name: 'Flow Master', text: 'Sees the air flow over a car.', effects: { phasePct: { chassisAero: 12 } } },
  adaptiveAero: { name: 'Adaptive Aero', text: 'Aero that works on every kind of track.', effects: { phasePct: { chassisAero: 8 }, setupKnowledge: 5 } },
  airSculptor: { name: 'Air Sculptor', signature: true, text: 'Shapes air like clay.', effects: { phasePct: { chassisAero: 20, concept: 8 }, breakthroughPct: 4 } },
  invisibleWing: { name: 'Invisible Wing', signature: true, text: 'Downforce from nowhere.', effects: { phasePct: { chassisAero: 25 }, crewPct: 3 } },
  // Strategists
  safeCall: { name: 'Safe Call', text: 'Picks the safe strategy: steadier races, fewer failures.', ratings: { consistency: 10 }, effects: { failurePct: -6 }, strategy: 'Plans with a bigger tyre margin (stops earlier)' },
  fuelCounter: { name: 'Fuel Counter', text: 'Knows every drop in the tank and every lap on the tyres.', effects: { tyreWearPct: -4 }, strategy: 'Reads tyre wear exactly and weighs fuel targets' },
  undercut: { name: 'Undercut', text: 'Pits a lap early to jump rivals.', effects: { crewPct: 3 }, strategy: 'Undercuts the car ahead at any planning quality' },
  weatherWatch: { name: 'Weather Watch', text: 'Knows when the rain is coming.', effects: { crewPct: 2, forecastPts: 8 } },
  longGame: { name: 'Long Game', text: 'Plans the whole season, not just the race.', effects: { crewPct: 3, tyreWearPct: -2 }, strategy: 'Runs the tyres a little longer before a stop' },
  safetyCarSense: { name: 'Safety Car Sense', text: 'Always pits at the right moment under caution.', effects: { crewPct: 2 }, strategy: 'Pits under caution whenever a stop is planned (a cheap stop)' },
  splitSecond: { name: 'Split Second', text: 'Makes the call in a split second: faster stops.', effects: { pitServicePct: -6, crewPct: 4 }, strategy: 'Race planning +10 STR' },
  threeMovesAhead: { name: 'Three Moves Ahead', text: 'Always three moves ahead of the other pit walls.', effects: { crewPct: 6 }, strategy: 'Race planning +40 STR' },
  grandmaster: { name: 'Grandmaster', signature: true, text: 'Plays a race like chess.', effects: { crewPct: 10, tyreWearPct: -6 }, strategy: 'Race planning +60 STR' },
  futureSight: { name: 'Future Sight', signature: true, text: 'Seems to know what happens next.', effects: { crewPct: 12, failurePct: -10 }, strategy: 'Race planning +80 STR' },
};

// --- eligibility (bible §11 "Initial eligibility") -------------------------------------------------------------------
// Each row's eligibility is data (src/systems/staffEligibility.js reads it):
//   text          the bible's words
//   start: true   a "Start candidate" / "Start staff" (spec §3: the founder choices not on the team can be hired)
//   rank: 'D'     the rank that opens them (with any conditions below)
//   all: [...]    conditions, all needed:
//     { research: 'AER1' }                    that research node is finished
//     { facility: 'F16' }                     that facility stands in the garage
//     { count: 'wins', n: 10 }                a team record reaches n (src/systems/careers.js TEAM_FACTS)
//     { waits: 'Milestone 17 (weather)' }     a fact the game doesn't track yet: dormant until that milestone
//     { secret: 'SEC-STAFF-L1', waits }       Legendary / Secret: special arrival only (never an ordinary pool)
// Once all of a row's conditions have held, the person stays findable (the team remembers it).
const E = {
  start: (text) => ({ text, start: true }),
  rank: (rank) => ({ text: `Rank ${rank}`, rank }),
  when: (text, all, rank = null) => ({ text, ...(rank ? { rank } : {}), all }),
  secret: (id) => ({ text: `Secret ${id}`, all: [{ secret: id, waits: 'Milestone 24 (special arrivals)' }] }),
};

const row = (id, name, tier, startLevel, [MEC, ENG, AER, STR, DRV], salary, trait, eligibility) => ({
  id,
  name,
  role: ROLE_OF[id.slice(0, 3)],
  tier,
  startLevel,
  stats: { MEC, ENG, AER, STR, DRV },
  salary,
  traits: [trait],
  art: `staff_${id.toLowerCase()}`, // every one of the 50 has their own portrait (assets/images/staff/)
  eligibility,
});
const ROLE_OF = { DRV: 'driver', MEC: 'mechanic', ENG: 'engineer', AER: 'aero', STR: 'strategist' };

// All 50 (bible §11, exact stats, levels, salaries per month in Credits, traits). 10 per role: 6 Standard / Rare,
// 2 Elite, 1 Legendary, 1 Secret.
export const ALL_STAFF = [
  // 11.1 Drivers
  row('DRV01', 'Sam Calder', 'standard', 1, [35, 47, 49, 37, 89], 500, 'lateBraker', E.start('Start candidate')),
  row('DRV02', 'Mina Vale', 'standard', 2, [46, 58, 29, 48, 96], 550, 'smoothHands', E.start('Start candidate')),
  row('DRV03', 'Jax Rowan', 'rare', 4, [50, 62, 64, 83, 147], 1000, 'quickLearner', E.rank('D')),
  row('DRV04', 'Leila Cruz', 'rare', 6, [61, 73, 75, 63, 154], 1050, 'rainSense', E.when('Win any wet race', [{ count: 'wetWins', n: 1 }])),
  row('DRV05', 'Theo Flint', 'rare', 8, [72, 53, 55, 74, 161], 1100, 'qualifier', E.when('3 pole positions', [{ count: 'poles', n: 3 }])),
  row('DRV06', 'Niko Arden', 'rare', 10, [52, 64, 66, 85, 147], 1150, 'comeback', E.when('Finish 3 races 5+ places above grid', [{ count: 'gained5', n: 3 }])),
  row('DRV07', 'Eva Rook', 'elite', 14, [95, 107, 109, 97, 254], 2150, 'tyreWhisperer', E.when('Rank B + Tyre Research 4', [{ research: 'HAN4' }], 'B')),
  row('DRV08', 'Cassian Voss', 'elite', 17, [106, 87, 89, 108, 261], 2200, 'fearless', E.when('Rank A + 10 race wins', [{ count: 'wins', n: 10 }], 'A')),
  row('DRV09', 'Aria Storm', 'legendary', 21, [121, 133, 135, 154, 352], 4050, 'stormQueen', E.secret('SEC-STAFF-L1')),
  row('DRV10', 'Zero Kane', 'secret', 24, [167, 179, 150, 169, 449], 5700, 'perfectLine', E.secret('SEC-STAFF-S1')),
  // 11.2 Mechanics
  row('MEC01', 'Tessa Bolt', 'standard', 1, [77, 52, 49, 25, 32], 500, 'fastHands', E.start('Start staff')),
  row('MEC02', 'Arun Pike', 'standard', 2, [84, 63, 29, 36, 43], 550, 'carefulBuilder', E.start('Start candidate')),
  row('MEC03', 'Milo Trent', 'rare', 4, [135, 67, 64, 71, 78], 1000, 'pitReady', E.rank('D')),
  row('MEC04', 'Hana Forge', 'rare', 6, [142, 78, 75, 51, 58], 1050, 'fixer', E.when('Repair 5 race faults', [{ count: 'raceFaultRepairs', n: 5 }])),
  row('MEC05', 'Leo Knox', 'rare', 8, [149, 58, 55, 62, 69], 1100, 'fabricator', E.when('Build 8 cars', [{ count: 'carsBuilt', n: 8 }])),
  row('MEC06', 'Priya Gear', 'rare', 10, [135, 69, 66, 73, 49], 1150, 'reliabilityFirst', E.when('Finish 10 races without mechanical retirement', [{ count: 'cleanFinishes', n: 10 }])),
  row('MEC07', 'Rafi Stone', 'elite', 14, [242, 112, 109, 85, 92], 2150, 'pitCaptain', E.when('Rank B + Pit Training Rig', [{ facility: 'F25', waits: 'the Pit Training Rig (F25) joins the Build shop' }], 'B')),
  row('MEC08', 'Nia Mercer', 'elite', 17, [249, 92, 89, 96, 103], 2200, 'masterFabricator', E.when('Rank A + Carbon Fabrication', [{ facility: 'F18' }], 'A')),
  row('MEC09', 'Celia Torque', 'legendary', 21, [340, 138, 135, 142, 118], 4050, 'goldenWrench', E.secret('SEC-STAFF-L2')),
  row('MEC10', 'Otis Black', 'secret', 24, [437, 184, 150, 157, 164], 5700, 'neverBreak', E.secret('SEC-STAFF-S2')),
  // 11.3 Race Engineers
  row('ENG01', 'Mara Quill', 'standard', 1, [50, 80, 49, 35, 32], 500, 'dataNotes', E.start('Start staff')),
  row('ENG02', 'Finn Mercer', 'standard', 2, [61, 87, 29, 46, 43], 550, 'calmRadio', E.start('Start candidate')),
  row('ENG03', 'Kira Tane', 'rare', 4, [65, 138, 64, 81, 78], 1000, 'telemetryEye', E.rank('D')),
  row('ENG04', 'Joel Hart', 'rare', 6, [76, 145, 75, 61, 58], 1050, 'powertrainMind', E.when('Powertrain Research 2', [{ research: 'PWR2' }])),
  row('ENG05', 'Soren Vale', 'rare', 8, [87, 152, 55, 72, 69], 1100, 'setupSage', E.when('Achieve 5 setup scores 80+', [{ count: 'setup80', n: 5 }])),
  row('ENG06', 'Amaya Cross', 'rare', 10, [67, 138, 66, 83, 49], 1150, 'raceReader', E.when('Rank C + 10 race starts', [{ count: 'raceStarts', n: 10 }], 'C')),
  row('ENG07', 'Dax Monroe', 'elite', 14, [110, 245, 109, 95, 92], 2150, 'dataArchitect', E.when('Rank B + Telemetry Room', [{ facility: 'F22' }], 'B')),
  row('ENG08', 'Keiko Ward', 'elite', 17, [121, 252, 89, 106, 103], 2200, 'perfectBalance', E.when('Rank A + 3 different class wins', [{ count: 'classWins', n: 3 }], 'A')),
  row('ENG09', 'Dr. Mira Volta', 'legendary', 21, [136, 343, 135, 152, 118], 4050, 'systemsGenius', E.secret('SEC-STAFF-L3')),
  row('ENG10', 'Orin Flux', 'secret', 24, [182, 440, 150, 167, 164], 5700, 'zeroError', E.secret('SEC-STAFF-S3')),
  // 11.4 Aero Designers
  row('AER01', 'Nia Bell', 'standard', 1, [35, 60, 83, 25, 32], 500, 'cleanShapes', E.start('Start candidate')),
  row('AER02', 'Hugo Crest', 'standard', 2, [46, 71, 90, 36, 43], 550, 'lowDrag', E.when('Aero Research 1', [{ research: 'AER1' }])),
  row('AER03', 'Zoe Park', 'rare', 4, [50, 75, 141, 71, 78], 1000, 'downforce', E.rank('D')),
  row('AER04', 'Imani West', 'rare', 6, [61, 86, 148, 51, 58], 1050, 'streetPackage', E.when('Win Metro Street Circuit', [{ trackWin: 'T05' }])),
  row('AER05', 'Luca Mori', 'rare', 8, [72, 66, 155, 62, 69], 1100, 'windTunnelRat', E.when('Build Wind Tunnel', [{ facility: 'F16' }])),
  row('AER06', 'Freya Nash', 'rare', 10, [52, 77, 141, 73, 49], 1150, 'balanceArtist', E.when('3 podiums on technical tracks', [{ count: 'technicalPodiums', n: 3 }])),
  row('AER07', 'Ren Ito', 'elite', 14, [95, 120, 248, 85, 92], 2150, 'flowMaster', E.when('Rank B + CFD Station', [{ facility: 'F17' }], 'B')),
  row('AER08', 'Selene Fox', 'elite', 17, [106, 100, 255, 96, 103], 2200, 'adaptiveAero', E.when('Rank A + Aero Research 6', [{ research: 'AER6' }], 'A')),
  row('AER09', 'Aurelia Crest', 'legendary', 21, [121, 146, 346, 142, 118], 4050, 'airSculptor', E.secret('SEC-STAFF-L4')),
  row('AER10', 'Kestrel Venn', 'secret', 24, [167, 192, 443, 157, 164], 5700, 'invisibleWing', E.secret('SEC-STAFF-S4')),
  // 11.5 Strategists
  row('STR01', 'Ben Hale', 'standard', 1, [35, 50, 49, 86, 32], 500, 'safeCall', E.start('Start candidate')),
  row('STR02', 'Noor Quinn', 'standard', 2, [46, 61, 29, 93, 43], 550, 'fuelCounter', E.start('Start candidate')),
  row('STR03', 'Mei Tan', 'rare', 4, [50, 65, 64, 144, 78], 1000, 'undercut', E.rank('D')),
  row('STR04', 'Oscar Reed', 'rare', 6, [61, 76, 75, 151, 58], 1050, 'weatherWatch', E.when('Use 3 weather tyre changes correctly', [{ count: 'weatherTyreChanges', n: 3 }])),
  row('STR05', 'Zara Wynn', 'rare', 8, [72, 56, 55, 158, 69], 1100, 'longGame', E.rank('C')),
  row('STR06', 'Eli Moss', 'rare', 10, [52, 67, 66, 144, 49], 1150, 'safetyCarSense', E.when('Benefit from 3 neutralisations', [{ count: 'cautionBenefits', n: 3 }])),
  row('STR07', 'Talia Frost', 'elite', 14, [95, 110, 109, 251, 92], 2150, 'splitSecond', E.when('Rank B + Strategy Room', [{ facility: 'F23' }], 'B')),
  row('STR08', 'Dorian Pike', 'elite', 17, [106, 90, 89, 258, 103], 2200, 'threeMovesAhead', E.when('Rank A + 5 strategy swing wins', [{ count: 'strategySwingWins', n: 5 }], 'A')),
  row('STR09', 'Cass Vega', 'legendary', 21, [121, 136, 135, 349, 118], 4050, 'grandmaster', E.secret('SEC-STAFF-L5')),
  row('STR10', 'Oracle Rey', 'secret', 24, [167, 182, 150, 446, 164], 5700, 'futureSight', E.secret('SEC-STAFF-S5')),
];

// The five founder choices (spec §2; Milestone 3's starters Sam, Tessa and Mara plus Nia and Ben from Milestone 4b).
export const FOUNDER_IDS = ['DRV01', 'MEC01', 'ENG01', 'AER01', 'STR01'];
export const STAFF = FOUNDER_IDS.map((id) => ALL_STAFF.find((d) => d.id === id));
// Everyone else (the other 45).
export const CANDIDATE_ROWS = ALL_STAFF.filter((d) => !FOUNDER_IDS.includes(d.id));
// Everyone recruitment reads (the founder choices are candidates too when not on the team — spec §2; the founder never).
export const ROSTER = ALL_STAFF;
export const staffDefById = (id) => ALL_STAFF.find((d) => d.id === id) ?? null;

// The default starting team (Sam, Tessa and Mara) — a new game now builds its team from the founder (data/setup.js).
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
// Trait rating bonuses stay in this range (bible §10.3); the validator checks it.
export const TRAIT_RATING_RANGE = { min: -40, max: 80 };

// How Energy / Morale reach the ratings (bible §10.3 says they count, but gives no numbers — PLACEHOLDER):
// each status that is on multiplies every rating.
export const RATING_CONDITION = { tired: 0.92, stressed: 0.92, inspired: 1.05 };
