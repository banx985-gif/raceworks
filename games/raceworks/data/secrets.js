// The Secret Condition Engine's data (Milestone 24, bible §35 / §35.1). The engine is core/SecretEngine (trigger
// indexing, AND / OR / forbids, counts, ordered chains, consecutive runs, NG+, once-only rewards); the RACEWORKS side is
// src/systems/secrets.js (facts, triggers, clue stages 0–4, reward actions, the why-false inspector) and
// src/systems/secretRules.js (the validator).
//
// A rule (core shape + scope / labels / recipe):
//   id, name, scope: 'run' | 'account'   (run → oncePerRun, account → oncePerAccount; the validator checks they match)
//   triggerEvents: [TRIGGERS id]         the only moments it is looked at
//   requiresAll: [cond] · requiresAny: [cond] · forbids: [cond] · ngPlusMin
//   clueStages: [{ text, minMet: { share } } × 3]   stages 1–3 (vague rumour, stronger hint, nearly explicit), reached
//                                        when that share of the rule's conditions is done; stage 4 = discovered
//   recipe: the exact recipe in words (shown from stage 4, permanently)
//   rewardActions: [{ type: REWARD_TYPES id, id, amount? }]
// A condition — every one machine-exact (§35.1): { fact, op, value, label } with fact a FACTS id, value an explicit
//   number / id / list; countOf / consecutive add `where: [{ field, op, value }]` (fields from the fact's `fields`);
//   sequence: value = an ordered list of ids; sameAcross: `field` (a list field) — the most items any one member shares.
//   label: the plain words the inspector and the why-false output use.
//
// PLACEHOLDERS (DECISIONS.md, M24): the fact names, the trigger list, the clue-stage shares.

// --- triggers: the game moments that make the engine look (src/systems/secrets.js wires them to the bus) ------------
export const TRIGGERS = [
  { id: 'raceResult', on: 'race:finished', text: 'a race weekend result is committed' },
  { id: 'carBuilt', on: 'project:complete', text: 'a car is finished' },
  { id: 'monthEnd', on: 'clock:month', text: 'a month ends (day 1 of the next)' },
  { id: 'hire', on: 'staff:hired', text: 'someone is hired' },
  { id: 'researchDone', on: 'research:complete', text: 'a research topic is finished' },
  { id: 'comboFound', on: 'combo:discovered', text: 'a combo is discovered' },
  { id: 'seasonEnd', on: 'championship:finished', text: 'a championship season ends' },
  { id: 'sponsorSigned', on: 'sponsor:signed', text: 'a sponsor deal is signed' },
  { id: 'contractDone', on: 'contract:success', text: 'a development contract is paid' },
  { id: 'drillDone', on: 'drill:finished', text: 'a driver drill is finished' },
  { id: 'rankUp', on: 'reputation:rankUp', text: 'the team moves up a rank' },
];

// --- facts: every one an explicit id, number, boolean, set or ordered list (never free text) ----------------------
// type: number | boolean | set (list of ids) | list (records with `fields`) | ordered (an ordered list of ids)
// scope: run (this save slot) | account (this device, every run) · mode: true = a race-mode usage fact
export const FACTS = [
  // run: the team
  { id: 'run.rank', scope: 'run', type: 'number', text: 'team rank as a number (E 0, D 1, C 2, B 3, A 4, S 5)' },
  { id: 'run.year', scope: 'run', type: 'number', text: 'calendar year' },
  { id: 'run.titles', scope: 'run', type: 'set', text: 'championship ids won this run' },
  { id: 'run.wins', scope: 'run', type: 'number', text: 'race weekend wins' },
  { id: 'run.podiums', scope: 'run', type: 'number', text: 'race weekend podiums' },
  { id: 'run.facilities', scope: 'run', type: 'set', text: 'facility ids standing in the garage' },
  { id: 'run.research', scope: 'run', type: 'set', text: 'research node ids finished' },
  { id: 'run.combos', scope: 'run', type: 'set', text: 'combo ids on this run’s finished cars' },
  { id: 'run.sponsorDeals', scope: 'run', type: 'number', text: 'sponsor deals signed (running + past)' },
  { id: 'run.contracts', scope: 'run', type: 'number', text: 'development contracts paid' },
  { id: 'run.pitRepairs', scope: 'run', type: 'number', text: 'race faults repaired in a pit stop' },
  { id: 'run.swingWins', scope: 'run', type: 'number', text: 'Strategy Swing wins' },
  { id: 'run.undercutWins', scope: 'run', type: 'number', text: 'Strategy Swing wins by undercut' },
  { id: 'run.extendedWins', scope: 'run', type: 'number', text: 'Strategy Swing wins by extending a stint' },
  { id: 'run.flags', scope: 'run', type: 'set', text: 'stored flags (events, contracts): technology_demo, hiddenInvitation …' },
  // run: ordered history and records
  { id: 'run.timeline', scope: 'run', type: 'ordered', text: 'the team’s firsts in the order they happened: firstCar, firstRace, firstWin, firstPodium, firstTitle, firstSponsor, rankD … rankS' },
  {
    id: 'run.races', scope: 'run', type: 'list', mode: true, text: 'every race weekend result this run, oldest first',
    fields: ['day', 'trackId', 'champ', 'pos', 'grid', 'wet', 'retired', 'mechRetired', 'faultsFixed', 'swing', 'family', 'classId', 'carNumber', 'crew', 'autoOnly', 'manual', 'drive', 'setupScore'],
  },
  { id: 'run.cars', scope: 'run', type: 'list', text: 'every finished car this run', fields: ['day', 'number', 'classId', 'quality', 'powerUnit', 'parts', 'family', 'combos', 'crew'] },
  { id: 'run.months', scope: 'run', type: 'list', text: 'each finished month’s cash flow', fields: ['month', 'net', 'positive'] },
  { id: 'run.staff', scope: 'run', type: 'list', text: 'everyone employed now', fields: ['id', 'role', 'tier', 'hiredDay', 'daysEmployed', 'founder'] },
  // run: race-mode usage (counters over run.races)
  { id: 'run.racesAutoOnly', scope: 'run', type: 'number', mode: true, text: 'race weekends run on Auto from start to flag' },
  { id: 'run.racesManual', scope: 'run', type: 'number', mode: true, text: 'race weekends with at least one manual command' },
  { id: 'run.racesDrive', scope: 'run', type: 'number', mode: true, text: 'race weekends with at least one Drive Stint' },
  { id: 'run.drillsPlayed', scope: 'run', type: 'number', mode: true, text: 'driver drills finished this run' },
  // account
  { id: 'account.ngPlus', scope: 'account', type: 'number', text: 'New Game+ level (0 until NG+ exists)' },
  { id: 'account.golds', scope: 'account', type: 'set', text: 'drill ids with a gold ever earned' },
  { id: 'account.mastered', scope: 'account', type: 'set', text: 'drill ids Mastered' },
  { id: 'account.recipes', scope: 'account', type: 'set', text: 'combo ids discovered on this device' },
  { id: 'account.titles', scope: 'account', type: 'set', text: 'championship ids won in any run (this one included)' },
  { id: 'account.runsWithTitle', scope: 'account', type: 'number', text: 'runs that won at least one title' },
  { id: 'account.competitiveSecretInvalidated', scope: 'account', type: 'boolean', text: 'a debug / forced result was used (never an accessibility aid)' },
];
export const FACT_IDS = new Set(FACTS.map((f) => f.id));
export const factDef = (id) => FACTS.find((f) => f.id === id) ?? null;

// --- reward actions (M25 fills them with the real 34): the engine calls one function per type ----------------------
export const REWARD_TYPES = [
  { id: 'staffArrival', text: 'a special arrival card on the Recruitment Special tab (M12)' },
  { id: 'part', text: 'a part licence' },
  { id: 'facility', text: 'a facility in the Build shop' },
  { id: 'championship', text: 'a championship flag (C11 / C12)' },
  { id: 'rival', text: 'a rival flag (Ghostline)' },
  { id: 'visual', text: 'a car visual family flag (V17–V20)' },
  { id: 'tokens', text: 'Racing Tokens', currency: true },
  { id: 'rp', text: 'RP', currency: true },
];

// Clue stages (§35): 0 invisible, 1 vague rumour, 2 stronger hint, 3 nearly explicit, 4 discovered (exact recipe).
export const CLUE = { discovered: 4, postEndingBonus: 1 };
// The default shares of a rule's conditions that reach clue stages 1–3 (a rule can set its own).
export const CLUE_SHARES = [0.25, 0.5, 0.75];

// §35.1 forbidden wording inside executable rules (the validator rejects any string in a condition that matches).
export const FORBIDDEN_WORDING = [/available to that point/i, /good enough/i, /\brecent(ly)?\b/i, /month-equivalent/i, /\b(strong|weak)\b/i, /\brandom\b/i, /\bchance\b/i];

// --- the synthetic test rules (no real secrets: those are Milestone 25). The game loads them only with ?debug=1. ---
const shares = (texts) => texts.map((text, i) => ({ text, minMet: { share: CLUE_SHARES[i] } }));
export const SYNTHETIC_RULES = [
  {
    // AND, OR, counters, thresholds, exact track, forbidden
    id: 'TEST-SEC-01', name: 'Rain Dancer (test)', scope: 'run', oncePerRun: true, triggerEvents: ['raceResult'],
    requiresAll: [
      { fact: 'run.rank', op: 'gte', value: 2, label: 'Rank C or higher' },
      { fact: 'run.races', op: 'countOf', where: [{ field: 'wet', op: 'eq', value: true }, { field: 'pos', op: 'eq', value: 1 }], value: 2, label: 'Win 2 wet races' },
    ],
    requiresAny: [
      { fact: 'run.races', op: 'countOf', where: [{ field: 'trackId', op: 'eq', value: 'T05' }, { field: 'pos', op: 'eq', value: 1 }], value: 1, label: 'Win at Metro Street Circuit' },
      { fact: 'run.races', op: 'countOf', where: [{ field: 'grid', op: 'gte', value: 8 }, { field: 'pos', op: 'eq', value: 1 }], value: 1, label: 'Win from P8 or worse on the grid' },
    ],
    forbids: [{ fact: 'run.races', op: 'countOf', where: [{ field: 'mechRetired', op: 'eq', value: true }], value: 1, label: 'Never retire with a mechanical failure' }],
    clueStages: shares(['Someone likes teams that keep going when it rains.', 'A wet win or two, a car that never breaks…', 'Rank C, two wet wins, a street win or a win from deep on the grid — and no mechanical retirements.']),
    recipe: 'Rank C+, 2 wet wins, a win at Metro Street or from P8+ on the grid, never a mechanical retirement.',
    rewardActions: [{ type: 'rp', id: 'TEST-SEC-01', amount: 40 }, { type: 'visual', id: 'TEST-V' }],
  },
  {
    // ordered chain, staff continuity, exact class / visual family
    id: 'TEST-SEC-02', name: 'Same Crew (test)', scope: 'run', oncePerRun: true, triggerEvents: ['raceResult', 'carBuilt'],
    requiresAll: [
      { fact: 'run.timeline', op: 'sequence', value: ['firstCar', 'firstPodium', 'firstWin'], label: 'A car, then a podium, then a win (in that order)' },
      { fact: 'run.races', op: 'sameAcross', field: 'crew', value: 3, label: 'One person in the race crew for 3 race weekends' },
      { fact: 'run.cars', op: 'countOf', where: [{ field: 'classId', op: 'eq', value: 'clubHatch' }, { field: 'family', op: 'eq', value: 'V01' }], value: 2, label: 'Build 2 Club Hatches in the V01 look' },
    ],
    clueStages: shares(['A crew that stays together…', 'Same faces, the same little hatchback, results in the right order.', 'Two V01 Club Hatches, one crew member for 3 races, and car → podium → win in that order.']),
    recipe: 'Firsts in the order car, podium, win; one crew member in 3 race weekends; 2 Club Hatches in the V01 look.',
    rewardActions: [{ type: 'part', id: 'TEST-PART' }, { type: 'tokens', id: 'TEST-SEC-02', amount: 3 }],
  },
  {
    // cross-run, NG+ level, mode usage, forbidden (no Drive Stints)
    id: 'TEST-SEC-03', name: 'Hands Off (test)', scope: 'account', oncePerAccount: true, triggerEvents: ['raceResult', 'seasonEnd'], ngPlusMin: 0,
    requiresAll: [
      { fact: 'run.racesAutoOnly', op: 'gte', value: 3, label: 'Run 3 race weekends on Auto from start to flag' },
      { fact: 'account.runsWithTitle', op: 'gte', value: 2, label: 'Win a title in 2 different runs' },
      { fact: 'account.ngPlus', op: 'gte', value: 0, label: 'NG+0 or higher' },
    ],
    forbids: [{ fact: 'run.racesDrive', op: 'gte', value: 1, label: 'Never drive a Drive Stint this run' }],
    clueStages: shares(['Some say the best teams never touch the wheel.', 'Auto all the way, and titles in more than one life.', '3 Auto-only weekends, no Drive Stints, and titles in 2 runs.']),
    recipe: '3 race weekends on Auto only and no Drive Stint this run, with titles won in 2 different runs.',
    rewardActions: [{ type: 'championship', id: 'TEST-CHAMP' }, { type: 'rival', id: 'TEST-RIVAL' }],
  },
  {
    // counters, thresholds, consecutive months (the clue the browser run sees early)
    id: 'TEST-SEC-04', name: 'Ledger Keeper (test)', scope: 'run', oncePerRun: true, triggerEvents: ['monthEnd'],
    requiresAll: [
      { fact: 'run.months', op: 'consecutive', where: [{ field: 'positive', op: 'eq', value: true }], value: 3, label: '3 months in a row with positive cash flow' },
      { fact: 'run.sponsorDeals', op: 'gte', value: 1, label: 'Sign a sponsor' },
      { fact: 'run.year', op: 'gte', value: 1, label: 'Year 1 or later' },
      { fact: 'run.contracts', op: 'gte', value: 1, label: 'Complete a development contract' },
    ],
    clueStages: shares(['The accountants are whispering about you.', 'Steady money, a sponsor, a contract…', '3 positive months in a row, a sponsor and a paid contract.']),
    recipe: '3 positive months in a row, a sponsor signed and a development contract paid.',
    rewardActions: [{ type: 'staffArrival', id: 'TEST-STAFF' }, { type: 'facility', id: 'TEST-FAC' }],
  },
];
