// RACEWORKS economy content (Milestone 5; bible §30, §9.3, §3 "Losing / recovery", §29 "Development contracts").
// Plain data only; the rules are core/EconomySystem.js, core/ContractSystem.js, core/ReputationSystem.js and
// src/systems/economy.js. Numbers marked PLACEHOLDER are Claude Code's (listed in docs/DECISIONS.md), to tune later.

// The run currencies (bible §30.1). The first one is the main currency (debt is measured on it).
// Prestige Tokens are account-wide and never bought: they arrive with the ending / NG+ milestones.
export const CURRENCIES = {
  credits: { name: 'Credits', short: 'Cr' },
  rp: { name: 'Research Points', short: 'RP' },
  tokens: { name: 'Racing Tokens', short: 'Tokens' },
};

// Starting state (bible §30.2).
export const START_MONEY = { credits: 25000, rp: 120, tokens: 25 };
export const START_REPUTATION = 0;

// Team ranks (bible §9.3). Reputation never falls below the floor of the highest rank reached.
export const RANKS = [
  { id: 'E', min: 0 },
  { id: 'D', min: 300 },
  { id: 'C', min: 1000 },
  { id: 'B', min: 2800 },
  { id: 'A', min: 6000 },
  { id: 'S', min: 10000 },
];

// Emergency Credit (bible §30.5, §3). PLACEHOLDER numbers.
//   floorByRank: how far below 0 a purchase may take the cash (Rank E −5,000; it scales with rank). Salaries,
//     running project costs and interest are still paid past it — they are never refused.
//   monthlyInterestPct: charged on the negative balance at each month end.
//   blocked: spending kinds refused while the cash is below 0 ('newCar' = a new car project: non-essential building;
//     'facility' = building a facility, Milestone 10 — moving and selling stay open).
//     Essential repairs stay possible. A car may still be started for an active rescue contract (it pays for itself).
//   tokensAutoSpend: Racing Tokens are never spent automatically (bible §30.5) — nothing spends them yet.
//   rescueInvestorMonths: bible §3's Rescue Investor (6 months beyond the floor) arrives in a later milestone; the
//     core closure check is switched off (EconomySystem closureMonths) so a team is never closed.
export const DEBT = {
  floorByRank: { E: -5000, D: -8000, C: -15000, B: -30000, A: -50000, S: -80000 },
  monthlyInterestPct: 2,
  blocked: ['newCar', 'facility'],
  tokensAutoSpend: false,
  rescueInvestorMonths: 6,
};

// Running costs. PLACEHOLDER numbers.
//   carDaily: Credits each game day while a car is being built, on Balanced (the budget focus changes it by its
//     costPct, bible §14.7). The first Club Hatch (56 days) costs 1,550 parts + ~2,240 running ≈ 3,800 all-in.
//   emergencyFix: fix one open fault now (bible §14.8: "costs Credits and reduces Innovation slightly").
//   maintenance: each finished car's monthly upkeep (paid on day 1 with the salaries).
//   repair: Credits per point of Condition restored (a car is 0–100 Condition; races damage it from Milestone 6).
export const COSTS = {
  carDaily: 40,
  emergencyFix: { credits: 450, innovation: 2 },
  maintenance: { perCarMonthly: 120 },
  repair: { perPoint: 25 },
};

// Reputation for things the team does (bible §9.3 thresholds above). PLACEHOLDER numbers.
export const REPUTATION = {
  carFinished: 15, // any finished car
  carQualityBonusPer10: 2, // + this per 10 Quality
  contractDone: 20, // a development contract delivered
};

// Development contracts (bible §29). Milestone 21 completes them (data/contracts.js: eight types, three offers a month, at
// most 2 active); clubBuild below is still the Supplier test's Club Hatch build, and rescue the debt job.
// Milestone 5 had one simple kind — build a Club Hatch that reaches a Quality
// target before the deadline. One offer a month; an offer not taken goes at the next month start; a missed deadline
// just ends it (no penalty beyond the missed payout). PLACEHOLDER numbers (the first Club Hatch is Quality ~36).
//   rescue: while the cash is below 0 the offer is a rescue job instead — an easier target that any car already in the
//   Car Garage can deliver (a supplier test run: the car is only borrowed, so one that delivered before still counts),
//   paid well enough to climb back out. With a rescue job open a car may be started past the debt floor, so a team
//   with no car can never be stuck.
export const CONTRACTS = {
  offersPerMonth: 1,
  maxActive: 1,
  clubBuild: {
    kind: 'clubBuild',
    title: 'Club Hatch development build',
    client: ['Pine Ridge Motor Club', 'Harlow Karting Academy', 'Westfall Club Racing', 'Northgate Track Days', 'Copper Vale Racing School'],
    classId: 'clubHatch',
    qualityMin: 30,
    qualityMax: 36,
    deadlineDays: 84, // 3 game months from accepting
    credits: { base: 1800, perQuality: 30 }, // pay = base + perQuality × target
    rp: { base: 15, perQuality: 0.5 },
    newBuildOnly: true, // a car finished after the contract was accepted
  },
  rescue: {
    kind: 'rescue',
    title: 'Supplier test run (rescue job)',
    client: ['Lowfield Parts Co.', 'Brightwell Tyres', 'Kingsway Components'],
    classId: 'clubHatch',
    qualityMin: 15,
    qualityMax: 20,
    deadlineDays: 56,
    credits: { base: 4500, perQuality: 0 },
    rp: { base: 10, perQuality: 0 },
    newBuildOnly: false, // any Club Hatch in the Car Garage will do
  },
};

// The Money sheet's ledger tab shows this many of the newest lines; the save keeps at most keepLines (older lines
// fold into one "earlier lines" line, core/EconomySystem maxLines).
export const LEDGER = { showLines: 30, keepLines: 600 };

// Ledger categories → the words the Money sheet shows.
export const CATEGORY_NAMES = {
  start: 'Starting funds',
  salary: 'Salaries',
  parts: 'Car parts',
  project: 'Car build running costs',
  fix: 'Emergency Fix',
  maintenance: 'Car upkeep',
  repair: 'Repairs',
  contract: 'Contracts',
  prize: 'Prize money',
  interest: 'Emergency Credit interest',
  facilities: 'Facilities',
  research: 'Research',
  hiring: 'Hiring and recruitment', // Milestone 12
  training: 'Training', // Milestone 12
  championship: 'Championships (entry fees, title bonuses)', // Milestone 20
  sponsor: 'Sponsors (stipends, race bonuses, obligation bonuses)', // Milestone 21
  achievement: 'Achievements', // Milestone 26
  debug: 'Debug',
  carried: 'Earlier lines',
};
