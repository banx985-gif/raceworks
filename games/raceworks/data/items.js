// Items / equipment (Milestone 25b, series common feature §4; RACEWORKS_ITEM_ART_LIST.md). Plain data for core/ItemSystem
// (src/systems/items.js). An item given to one person permanently raises the stat its training raises, then is used up:
// Driving → DRV, Mechanical → MEC, Engineering → ENG, Aero → AER, Strategy → STR, Fitness → FIT (Energy: each point is
// +1% resting recovery for good, FITNESS below). Pictures: assets/images/items/item_01–24.png and the Parts Store crate
// item_25.png — not drawn yet, so code placeholders in the group colour (core/ui/ItemArt) until the files land.
//
// Items only ever come from play (ITEM_SOURCES): race results, podiums and titles, a great training effort, sponsors,
// contracts, a well-wisher now and then, achievements (Milestone 26 hook) — fans / community are a hook only. Never a
// shop, never Racing Tokens, never real money.
//
// PLACEHOLDERS (DECISIONS.md, M25b): every number and every like below.

export const ITEM_GROUPS = [
  { id: 'driving', name: 'Driving', stat: 'DRV', color: '#D8352A', shape: 'helmet' },
  { id: 'mechanical', name: 'Mechanical', stat: 'MEC', color: '#4A5360', shape: 'slab' },
  { id: 'engineering', name: 'Engineering', stat: 'ENG', color: '#1597BF', shape: 'book' },
  { id: 'aero', name: 'Aero', stat: 'AER', color: '#7A5CFF', shape: 'wing' },
  { id: 'strategy', name: 'Strategy', stat: 'STR', color: '#2EAA5A', shape: 'disc' },
  { id: 'fitness', name: 'Fitness', stat: 'FIT', color: '#F2B233', shape: 'cup' },
];
export const itemGroupById = (id) => ITEM_GROUPS.find((g) => g.id === id) ?? null;

const NAMES = {
  driving: ['Race Gloves', 'Carbon Helmet', 'Sim Steering Wheel', 'Reaction Trainer'],
  mechanical: ['Torque Wrench', 'Impact Gun', 'Precision Toolkit', 'Pit Jack'],
  engineering: ['Telemetry Tablet', 'Dyno Sensor', 'Engine Scope', 'Setup Notebook'],
  aero: ['Flow Vis Spray', 'Scale Model Car', 'CFD Laptop', 'Wing Gauge'],
  strategy: ['Race Stopwatch', 'Weather Radar Unit', 'Strategy Board', 'Headset'],
  fitness: ['Neck Trainer', 'Hydration Pack', 'Recovery Mat', 'Heart-Rate Watch'],
};
const pad = (n) => String(n).padStart(2, '0');
// { id: 'I01', name, group, stat, art: 'item_01' } … I24
export const ITEM_TYPES = ITEM_GROUPS.flatMap((g, gi) => NAMES[g.id].map((name, i) => {
  const n = gi * 4 + i + 1;
  return { id: `I${pad(n)}`, name, group: g.id, stat: g.stat, art: `item_${pad(n)}` };
}));
export const itemTypeById = (id) => ITEM_TYPES.find((t) => t.id === id) ?? null;
export const ITEM_ART = Object.fromEntries([...ITEM_TYPES.map((t) => [t.art, `assets/images/items/${t.art}.png`]), ['item_25', 'assets/images/items/item_25.png']]);

// Rarity: gain = stat points (Fitness: % recovery), sell = Credits back for a spare, weight = the default odds.
export const ITEM_RARITIES = {
  common: { name: 'Common', gain: 1, sell: 60, weight: 60, color: '#8A9099', frame: 'thin' },
  rare: { name: 'Rare', gain: 2, sell: 150, weight: 28, color: '#1597BF' },
  elite: { name: 'Elite', gain: 4, sell: 400, weight: 10, color: '#7A5CFF', gem: true },
  legendary: { name: 'Legendary', gain: 7, sell: 1000, weight: 2, color: '#F2B233', gem: true },
};

export const ITEM_RULES = {
  inventoryMax: 20, // the Parts Store holds this many
  periodCap: 20, // item points one person can take in a season (a game year)
  loveMult: 1.5,
  dislikeMult: 0.5,
  loveMorale: 4, // a loved item lifts Morale too
  likes: { loves: [1, 2], dislikeChance: 0.5 }, // a generic recruit's roll (named staff: STAFF_LIKES below)
  storeIcon: 'item_25',
  storeName: 'Parts Store',
};
// Fitness items: points of resting recovery (+1% each), capped per person.
export const FITNESS = { cap: 30, recoveryPctPerPoint: 1 };

// Where items come from (src/systems/items.js; each roll uses the items' own seeded generator, saved with the team).
//   weights: rarity odds for that source (else ITEM_RARITIES weights); race: tierWeights by championship tier
export const ITEM_SOURCES = {
  race: {
    text: 'A race result',
    // chance of an item after a race weekend by your finish (P1, P2, P3, P4–P6, P7–P10, below / DNF) …
    byFinish: [0.3, 0.22, 0.18, 0.1, 0.05, 0],
    // … times the championship's tier (the Pine Ridge practice race counts as club)
    tierMult: { club: 1, national: 1.4, world: 1.8 },
    tierWeights: { club: { common: 70, rare: 25, elite: 5, legendary: 0 }, national: { common: 50, rare: 35, elite: 13, legendary: 2 }, world: { common: 30, rare: 40, elite: 24, legendary: 6 } },
  },
  podium: { text: 'A podium in a championship round', chance: 0.25 }, // on top of the race roll
  title: { text: 'A championship title', count: 1, weights: { common: 0, rare: 40, elite: 45, legendary: 15 } },
  training: { text: 'A great training effort', weeklyChance: 0.08, minMorale: 70 }, // a weekly roll while someone is on a course
  sponsor: { text: 'A sponsor gift', onMet: 1, weights: { common: 40, rare: 40, elite: 18, legendary: 2 } }, // a deal's obligation met
  contract: { text: 'A contract completed', chance: 0.35 },
  wellWisher: { text: 'A well-wisher', monthlyChance: 0.06 }, // the EV_WELL_WISHER event (data/events.js)
  achievement: { text: 'An achievement', chance: 0.5 }, // Milestone 26 sends 'achievement:unlocked'
  fans: { text: 'A gift from the fans', chance: 0 }, // hook only (a fans / community system comes later)
};
export const SOURCE_IDS = Object.keys(ITEM_SOURCES);

// Likes (§4): every one of the 50 staff loves 1–2 groups and may dislike one, by role and trait. ROLE_LOVES is the
// role's own kit; TRAIT_LOVES adds the group the trait suggests (unknown trait: none); ROLE_DISLIKES the group the role
// cares least for (dropped when it is also loved). Hired generic recruits (not in the 50) roll theirs and save them.
export const ROLE_LOVES = { driver: 'driving', mechanic: 'mechanical', engineer: 'engineering', aero: 'aero', strategist: 'strategy' };
export const ROLE_DISLIKES = { driver: 'engineering', mechanic: 'aero', engineer: 'fitness', aero: 'mechanical', strategist: 'fitness' };
export const TRAIT_LOVES = {
  // drivers
  lateBraker: 'fitness', smoothHands: 'mechanical', quickLearner: 'engineering', rainSense: 'strategy', qualifier: null,
  comeback: 'fitness', tyreWhisperer: 'engineering', fearless: 'fitness', stormQueen: 'strategy', perfectLine: 'aero',
  // mechanics
  fastHands: 'fitness', carefulBuilder: null, pitReady: 'fitness', fixer: 'engineering', fabricator: 'aero',
  reliabilityFirst: 'engineering', pitCaptain: 'strategy', masterFabricator: 'aero', goldenWrench: null, neverBreak: 'engineering',
  // race engineers
  dataNotes: 'strategy', calmRadio: 'strategy', telemetryEye: null, powertrainMind: 'mechanical', setupSage: 'driving',
  raceReader: 'strategy', dataArchitect: null, perfectBalance: 'aero', systemsGenius: 'mechanical', zeroError: null,
  // aero designers
  cleanShapes: null, lowDrag: 'engineering', downforce: 'driving', streetPackage: 'driving', windTunnelRat: 'engineering',
  balanceArtist: 'driving', flowMaster: null, adaptiveAero: 'engineering', airSculptor: null, invisibleWing: 'engineering',
  // strategists
  safeCall: null, fuelCounter: 'engineering', undercut: 'driving', weatherWatch: 'aero', longGame: 'fitness',
  safetyCarSense: 'driving', splitSecond: 'fitness', threeMovesAhead: null, grandmaster: 'engineering', futureSight: 'aero',
};
export function likesFor(def) {
  const loves = [ROLE_LOVES[def.role]];
  const t = TRAIT_LOVES[Array.isArray(def.traits) ? def.traits[0] : def.trait];
  if (t && !loves.includes(t)) loves.push(t);
  const d = ROLE_DISLIKES[def.role];
  return { loves, dislike: d && !loves.includes(d) ? d : null };
}

export const ITEM_TEXT = {
  give: 'Give to staff',
  storeLine: 'Equipment the team has earned. Give it to someone: it raises one stat for good.',
  empty: 'Nothing here yet. Items come from race results, podiums and titles, great training, sponsors, contracts and the odd well-wisher — never from a shop.',
  full: 'The Parts Store is full: a new item could not be kept. Give some out or sell spares.',
};
