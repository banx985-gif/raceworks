// New Game setup and save slots (Milestone 4b, RACEWORKS_START_SCREEN_AND_SAVE_SLOTS_SPEC v1.0.1). Plain data only.

export const SLOT_COUNT = 4; // spec §7
export const PLAYER_TITLE = 'Team Principal'; // spec §1
export const NAME_MAX = 22; // letters in a team or player name

// Built-in fictional names for Random (spec §1). None are real teams or people.
export const TEAM_NAMES = [
  'Banks Racing', 'Harbour Lane Motorsport', 'Copperfield GP', 'Redline Works', 'Blue Kestrel Racing', 'Northgate Motorsport',
  'Ironbridge Racing', 'Sable Point GP', 'Lantern Street Racing', 'Quarry Hill Motorsport', 'Foxglove Racing', 'Tidewater GP',
  'Brightwell Racing', 'Stonemoor Motorsport', 'Velocity Yard', 'Marlow Road Racing', 'Emberline GP', 'Kingsway Garage Racing',
  'Silver Finch Motorsport', 'Oakhurst Racing', 'Pennant Racing Club', 'Cinder Track Works', 'Westfall Motorsport', 'Hollow Oak GP',
];
export const PLAYER_NAMES = [
  'Aaron', 'Alex Morgan', 'Jamie Reed', 'Sasha Kerr', 'Robin Hale', 'Casey Holt', 'Morgan Ashby', 'Riley Stone', 'Jordan Pryce',
  'Taylor Wren', 'Quinn Barlow', 'Avery Lang', 'Rowan Price', 'Harper Vance', 'Drew Fallon', 'Kai Mercer', 'Elliot Shaw',
  'Remy Clarke', 'Frankie Dale', 'Sidney Moss',
];

// The six RACEWORKS team colours (bible §7 Team Setup: "one of six accent palettes"; no stat advantage).
//   main = the livery, dark = its shadow / outline, light = the second stripe.
export const TEAM_COLOURS = [
  { id: 'red', name: 'Racing Red', main: '#D8352A', dark: '#8E1F18', light: '#F2B233' },
  { id: 'orange', name: 'Papaya', main: '#F2862B', dark: '#A8520F', light: '#2A241F' },
  { id: 'yellow', name: 'Speed Yellow', main: '#F2C230', dark: '#9C7A0C', light: '#2A241F' },
  { id: 'green', name: 'Pit Green', main: '#2E8B57', dark: '#1A5634', light: '#F2EFE6' },
  { id: 'blue', name: 'Circuit Blue', main: '#1F6FD1', dark: '#123F7A', light: '#F2B233' },
  { id: 'purple', name: 'Night Purple', main: '#7650C4', dark: '#43287E', light: '#35C2E0' },
];

// The five founder choices (spec §2), one from each role, and the starting team each one brings (spec §3).
//   perk.stat: the work stat their "+6% contribution" boosts in car projects (core/ProjectSystem statModifier).
//   perk.extras: the rest of the perk. live: false = its system is not built yet; it switches on in that milestone.
//   suppressCandidate: normally an early hiring candidate (bible §11 "Start candidate"): as a founder they start
//   employed and must never appear again as a candidate (Milestone 12 recruitment: nobody employed is ever a card, and
//   the founder never is — even after leaving; team.noCandidates stays in the save as the record of who started).
export const FOUNDERS = [
  {
    id: 'DRV01',
    perkName: 'Founder Driver',
    perkText: '+6% Driving/Testing contribution and +3% race consistency',
    perk: { stat: 'DRV', pct: 6, extras: [{ key: 'raceConsistencyPct', value: 3, live: false, waits: 'Racing (race simulation)' }] },
    team: ['DRV01', 'MEC01', 'ENG01'],
    suppressCandidate: true,
  },
  {
    id: 'MEC01',
    perkName: 'Founder Mechanic',
    perkText: '+6% Mechanical contribution and −5% assembly/pit fault chance',
    perk: {
      stat: 'MEC',
      pct: 6,
      extras: [
        { key: 'assemblyFaultPct', value: -5, live: true, phase: 'assembly' },
        { key: 'pitFaultPct', value: -5, live: false, waits: 'Racing (pit stops)' },
      ],
    },
    team: ['MEC01', 'ENG01', 'DRV01'],
  },
  {
    id: 'ENG01',
    perkName: 'Founder Engineer',
    perkText: '+6% Engineering contribution and +5 Setup Knowledge on completed test sessions',
    perk: { stat: 'ENG', pct: 6, extras: [{ key: 'setupKnowledgeOnTest', value: 5, live: false, waits: 'Test sessions / Setup Knowledge' }] },
    team: ['ENG01', 'MEC01', 'DRV01'],
  },
  {
    id: 'AER01',
    perkName: 'Founder Aero',
    perkText: '+6% Aero contribution and +3% aerodynamic development efficiency',
    perk: { stat: 'AER', pct: 6, extras: [{ key: 'aeroDevelopmentPct', value: 3, live: false, waits: 'Aero research' }] },
    team: ['AER01', 'MEC01', 'DRV01'],
    suppressCandidate: true,
  },
  {
    id: 'STR01',
    perkName: 'Founder Strategist',
    perkText: '+6% Strategy contribution and +3% strategy consistency',
    perk: { stat: 'STR', pct: 6, extras: [{ key: 'strategyConsistencyPct', value: 3, live: false, waits: 'Racing (race strategy)' }] },
    team: ['STR01', 'MEC01', 'DRV01'],
    suppressCandidate: true,
  },
];
export const FOUNDER_FLAG = 'Founding Team Member';

// Early hiring candidates (bible §11 "Start candidate") among the founder choices: whoever of them starts employed is
// kept off the candidate list (so Sam never appears twice either).
export const START_CANDIDATES = ['DRV01', 'AER01', 'STR01'];

// Founder history (spec §4): the counters a new team starts with. Most stay 0 until their milestones arrive.
export const FOUNDER_HISTORY = {
  continuous: true, // employed without a break since day 1
  daysEmployed: 0, // years employed = daysEmployed / days in a year
  carsDeveloped: 0,
  racesEntered: 0,
  wins: 0,
  podiums: 0,
  championships: 0,
  ending: false, // took part in the ending
  legacyStaff: false, // chosen as Legacy Staff in NG+
};

// Placeholder slot-card values until those systems exist.
export const SLOT_PLACEHOLDERS = { rank: 'E', ngPlus: 0, grade: null };
