// The 12 championships (Milestone 20, bible §27) and the season rules. Plain data only; src/systems/championships.js runs
// them. Rows are exactly §27 (type, unlock words, classes, rounds, tracks, main reward); the structured unlock, the
// allowed class tags, the rival bands, the field sizes, money and spacing are PLACEHOLDERS (docs/DECISIONS.md, M20).
//
// unlock (all must hold):
//   { rank }                         the team has reached this rank (core/CompanyRank via money.reputation)
//   { seasonTop: { champ, pos } }    finished that championship's season in the top `pos` ("C01 podium")
//   { wins }                         this many race wins (career facts)
//   { classOpen }                    that car class is open (data/cars.js CLASSES[..].rank — "Formula Junior research")
//   { titleAny: [ids] }              won any of these championships
//   { facility }                     that facility stands in the garage
//   { titles }                       this many championship titles
//   { secret }                       a Secret Engine flag (SEC-COMP-01 / 02) — always false until the Secret Engine
// classes: the car class tags (data/cars.js CLASSES[..].tag) a car must have to enter.
// tier: club / national / world — the trophy (race_reward_07 / 08 / 09) and the privateer templates.

export const CHAMP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]; // 1st … 10th (bible §27)
export const FASTEST_LAP = { points: 1, topN: 8 }; // + 1 to the fastest lap if that car finishes in the top 8

export const CHAMPIONSHIPS = [
  { id: 'C01', name: 'Rookie Sprint Cup', type: 'visible', unlockText: 'Rank E', unlock: { rank: 'E' }, classText: 'Club Hatch/Lightweight', classes: ['club', 'lightweight'], rounds: 3, tracks: ['T01', 'T02', 'T03'], reward: 'First trophy; unlock Rank D path', tier: 'club' },
  { id: 'C02', name: 'Club Touring Series', type: 'visible', unlockText: 'C01 podium', unlock: { seasonTop: { champ: 'C01', pos: 3 } }, classText: 'Club/Touring', classes: ['club', 'touring'], rounds: 3, tracks: ['T01', 'T03', 'T04'], reward: 'Agency recruitment; sponsor interest', tier: 'club' },
  { id: 'C03', name: 'Street & Coast Challenge', type: 'visible', unlockText: 'Rank D + 2 wins', unlock: { rank: 'D', wins: 2 }, classText: 'Lightweight/Touring/GT', classes: ['lightweight', 'touring', 'gt'], rounds: 3, tracks: ['T02', 'T05', 'T06'], reward: 'Street setup research', tier: 'club' },
  { id: 'C04', name: 'Regional GT Cup', type: 'visible', unlockText: 'Rank C', unlock: { rank: 'C' }, classText: 'GT/Touring', classes: ['gt', 'touring'], rounds: 4, tracks: ['T03', 'T04', 'T06', 'T07'], reward: 'Rank B progression', tier: 'national' },
  { id: 'C05', name: 'Formula Academy', type: 'visible', unlockText: 'Formula Junior research', unlock: { classOpen: 'formula' }, classText: 'Formula', classes: ['formula'], rounds: 4, tracks: ['T01', 'T02', 'T06', 'T09'], reward: 'Formula class unlocks', tier: 'national' },
  { id: 'C06', name: 'National Touring Championship', type: 'visible', unlockText: 'C04 title or C05 title', unlock: { titleAny: ['C04', 'C05'] }, classText: 'Touring/GT', classes: ['touring', 'gt'], rounds: 5, tracks: ['T03', 'T05', 'T07', 'T08', 'T09'], reward: 'National title; elite applicants', tier: 'national' },
  { id: 'C07', name: 'Prototype Challenge', type: 'visible', unlockText: 'Rank B + Prototype Bay', unlock: { rank: 'B', facility: 'F30' }, classText: 'Prototype/Experimental', classes: ['prototype', 'experimental'], rounds: 4, tracks: ['T04', 'T06', 'T09', 'T10'], reward: 'Prototype tech', tier: 'national' },
  { id: 'C08', name: 'Endurance Masters', type: 'visible', unlockText: 'Rank B + Endurance Ops', unlock: { rank: 'B', facility: 'F32' }, classText: 'GT/Endurance/Prototype', classes: ['gt', 'endurance', 'prototype'], rounds: 4, tracks: ['T07', 'T09', 'T10', 'T11'], reward: 'Endurance systems; prestige clues', tier: 'world' },
  { id: 'C09', name: 'Continental GT Series', type: 'visible', unlockText: 'Rank A + 3 titles', unlock: { rank: 'A', titles: 3 }, classText: 'GT/Endurance', classes: ['gt', 'endurance'], rounds: 5, tracks: ['T02', 'T05', 'T06', 'T08', 'T09'], reward: 'Global sponsors', tier: 'world' },
  { id: 'C10', name: 'World Racing Championship', type: 'finale', unlockText: 'Rank S + C09 title', unlock: { rank: 'S', titleAny: ['C09'] }, classText: 'Formula/GT/Prototype/Hypercar', classes: ['formula', 'gt', 'prototype', 'experimental'], rounds: 6, tracks: ['T02', 'T07', 'T08', 'T09', 'T10', 'T11'], reward: 'Year-16 visible finale / World Crown', tier: 'world' },
  { id: 'C11', name: 'Legends Invitational', type: 'secret', unlockText: 'SEC-COMP-01', unlock: { secret: 'SEC-COMP-01' }, classText: 'Any qualifying high-tier car', classes: ['gt', 'formula', 'endurance', 'prototype', 'electric', 'experimental'], rounds: 5, tracks: ['T01', 'T05', 'T06', 'T09', 'T11'], reward: 'Legend parts; Prestige Tokens', tier: 'world' },
  { id: 'C12', name: 'Apex Zero Championship', type: 'secret', unlockText: 'SEC-COMP-02', unlock: { secret: 'SEC-COMP-02' }, classText: 'Prestige/Experimental', classes: ['prototype', 'experimental'], rounds: 6, tracks: ['T02', 'T05', 'T08', 'T10', 'T11', 'T12'], reward: 'Ultimate title; Project Zero path', tier: 'world' },
];
export const champById = (id) => CHAMPIONSHIPS.find((c) => c.id === id) ?? null;

// The fixed rival progression band per championship (bible §28: "Rivals progress by fixed championship/calendar bands.
// They do not secretly rubber-band to the player's exact car.") PLACEHOLDERS:
//   carLevel   the rival cars' stat level (each team's shape × this; data/rivals.js)
//   crew       rival crew factor 0–400 · strStep: rival strategist STR added per band (on the team's own)
//   driverStep rival drivers' ratings grow this share per band after the team's first appearance (§28.1 is the base)
//   fieldSize  cars in the race (bible §23.2: 10, cap 12)
//   money      × on the round prizes and Reputation (data/race.js PRIZES) · entry: the fee · title: the title bonus
export const CHAMP_BANDS = {
  C01: { carLevel: 165, crew: 95, strStep: 0, driverStep: 0.03, fieldSize: 10, money: 1, entry: 1000, title: 5000, titleRep: 60 },
  C02: { carLevel: 180, crew: 110, strStep: 10, driverStep: 0.03, fieldSize: 10, money: 1.3, entry: 1500, title: 7000, titleRep: 75 },
  C03: { carLevel: 195, crew: 120, strStep: 20, driverStep: 0.03, fieldSize: 10, money: 1.6, entry: 2000, title: 9000, titleRep: 90 },
  C04: { carLevel: 225, crew: 140, strStep: 35, driverStep: 0.03, fieldSize: 10, money: 2.2, entry: 3500, title: 14000, titleRep: 120 },
  C05: { carLevel: 250, crew: 150, strStep: 45, driverStep: 0.03, fieldSize: 10, money: 2.6, entry: 4500, title: 17000, titleRep: 140 },
  C06: { carLevel: 275, crew: 170, strStep: 60, driverStep: 0.03, fieldSize: 12, money: 3.4, entry: 6000, title: 24000, titleRep: 180 },
  C07: { carLevel: 320, crew: 190, strStep: 75, driverStep: 0.03, fieldSize: 12, money: 4.2, entry: 8000, title: 30000, titleRep: 220 },
  C08: { carLevel: 335, crew: 200, strStep: 85, driverStep: 0.03, fieldSize: 12, money: 5, entry: 10000, title: 36000, titleRep: 260 },
  C09: { carLevel: 360, crew: 220, strStep: 100, driverStep: 0.03, fieldSize: 12, money: 6.5, entry: 14000, title: 48000, titleRep: 320 },
  C10: { carLevel: 400, crew: 250, strStep: 120, driverStep: 0.03, fieldSize: 12, money: 9, entry: 20000, title: 80000, titleRep: 450 },
  C11: { carLevel: 420, crew: 260, strStep: 130, driverStep: 0.03, fieldSize: 12, money: 10, entry: 22000, title: 90000, titleRep: 480 },
  C12: { carLevel: 460, crew: 290, strStep: 150, driverStep: 0.03, fieldSize: 12, money: 12, entry: 26000, title: 120000, titleRep: 550 },
};
// The ladder order (a band index: C01 = 0 … C12 = 11).
export const bandIndex = (id) => CHAMPIONSHIPS.findIndex((c) => c.id === id);

// Season rules (PLACEHOLDERS). One championship at a time. Round 1 is on day `firstDay` of the month after you enter,
// and each later round `spacingDays` after the one before — or `minGapDays` after you raced the round before, whichever is
// later — so a 3–6 round series fits a season (a 6-round series takes 6 months).
export const SEASON = { firstDay: 14, spacingDays: 28, minGapDays: 7, oneAtATime: true };

// Trophies by tier (the Compete sheet's cabinet): rewards/race_reward_07 / 08 / 09.
export const TROPHY_ART = { club: 'race_reward_07', national: 'race_reward_08', world: 'race_reward_09' };
export const TIER_NAMES = { club: 'Club', national: 'National', world: 'World' };
