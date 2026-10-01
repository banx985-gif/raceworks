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
// Milestone 25: SECRET_RULES (the real 34, bible §36) below the synthetic set, with SECRET_READINGS (how each vague word is
// read), ACCOUNT_FLAGS (the account switches a reward sets) and the new facts, triggers and reward types above
// (PLACEHOLDERS, DECISIONS.md M25).

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
  // Milestone 25
  { id: 'facilityBuilt', on: 'facility:bought', text: 'a facility is built' },
  { id: 'secretFound', on: 'secret:found', text: 'another secret is found (after the one that found it has paid out)' },
  { id: 'runEnded', on: 'run:ended', text: 'the run reaches its Year-16 ending (Milestone 27 sends it)' },
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
    fields: [
      'day', 'trackId', 'champ', 'pos', 'grid', 'wet', 'retired', 'mechRetired', 'faultsFixed', 'swing', 'family', 'classId', 'carNumber', 'crew', 'autoOnly', 'manual', 'drive', 'setupScore',
      // Milestone 25 (SECRET_READINGS below says how each is read)
      'won', 'finished', 'pole', 'fastestLap', 'wetClass', 'rain', 'night', 'permanent', 'tier', 'champRace', 'season', 'raceType', 'tyreLife', 'spins', 'damageHits', 'damageRepairs', 'mechFails', 'faults', 'stops', 'plannedStops', 'energySave', 'topSpeed', 'speedRecord', 'powerUnit', 'carRating', 'fieldRating', 'belowFieldPct', 'fieldAbovePct', 'ghostIn', 'ghostBeat', 'driver',
    ],
  },
  { id: 'run.cars', scope: 'run', type: 'list', text: 'every finished car this run', fields: ['day', 'number', 'classId', 'quality', 'powerUnit', 'parts', 'family', 'combos', 'crew', 'spd', 'acc', 'cor', 'puTier', 'startPartsOnly', 'researchPrototype'] },
  // Milestone 25: lists derived from the records each time they are read (never saved twice)
  { id: 'run.spans', scope: 'run', type: 'list', text: 'every span of 10 race weekends in a row (oldest first)', fields: ['from', 'poles', 'fastestLaps', 'mechFailures'] },
  { id: 'run.carRecords', scope: 'run', type: 'list', text: 'each finished car with what it won', fields: ['car', 'family', 'classId', 'quality', 'spd', 'acc', 'winTracks', 'titles', 'ghostDefeats', 'ghostNightWins', 'ghostRainWins', 'ghostPermanentWins', 'highcrestTitanDays'] },
  { id: 'run.familyWins', scope: 'run', type: 'list', text: 'each car visual family with the tracks it has won at', fields: ['family', 'tracks'] },
  {
    id: 'run.seasons', scope: 'run', type: 'list', mode: true, text: 'every finished championship season',
    fields: ['champ', 'tier', 'title', 'pos', 'car', 'carClass', 'puGap', 'corOverSpd', 'races', 'rounds', 'complete', 'autoAll', 'manualAll', 'mechRetirements', 'startPartsOnly', 'standardDriver', 'legacyCrew'],
  },
  // Milestone 25: counters and switches
  { id: 'run.poles', scope: 'run', type: 'number', text: 'pole positions (started P1)' },
  { id: 'run.fastestLaps', scope: 'run', type: 'number', text: 'fastest laps of the race set by your car' },
  { id: 'run.researchCount', scope: 'run', type: 'number', text: 'visible research nodes finished (36 in all)' },
  { id: 'run.licences', scope: 'run', type: 'number', text: 'of the 44 non-prestige part licences, how many are open' },
  { id: 'run.secretParts', scope: 'run', type: 'number', text: 'secret parts unlocked this run (PU09, TR08, CH08, AE08, HB08, EL09)' },
  { id: 'run.researchPrototypes', scope: 'run', type: 'number', text: 'Research Prototype projects completed' },
  { id: 'run.legendaryHires', scope: 'run', type: 'number', text: 'Legendary staff hired this run' },
  { id: 'run.prestigeHires', scope: 'run', type: 'number', text: 'Prestige (Secret-tier) staff hired this run' },
  { id: 'run.ghostDefeats', scope: 'run', type: 'number', text: 'race weekends finished ahead of every Ghostline car' },
  { id: 'run.sponsorsActive', scope: 'run', type: 'set', text: 'sponsor ids on the car now' },
  { id: 'run.techDemoAppeared', scope: 'run', type: 'boolean', text: 'the BOTWORKS technology demo event has fired this run' },
  { id: 'run.techDemoDone', scope: 'run', type: 'boolean', text: 'the BOTWORKS technology demo was hosted (its first choice)' },
  { id: 'run.startersKept', scope: 'run', type: 'number', text: 'starting staff employed without a break since day 1' },
  { id: 'run.firstYearMechanicsKept', scope: 'run', type: 'number', text: 'Mechanics hired in Year 1 employed without a break since' },
  { id: 'run.endingReached', scope: 'run', type: 'boolean', text: 'the run has reached its Year-16 ending (Milestone 27)' },
  { id: 'run.legacyTitles', scope: 'run', type: 'number', text: 'World-tier titles (C08–C12) a Legacy Staff member raced in (NG+, Milestone 28)' },
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
  // Milestone 25
  { id: 'account.goldCount', scope: 'account', type: 'number', text: 'manual driver drills with a gold ever earned (6 in all)' },
  { id: 'account.recipeCount', scope: 'account', type: 'number', text: 'engineering synergies (combos) discovered on this device' },
  { id: 'account.secretsFound', scope: 'account', type: 'number', text: 'different secrets (of the 34) ever found on this device' },
  { id: 'account.secretsFoundIds', scope: 'account', type: 'set', text: 'the secret ids ever found on this device' },
  { id: 'account.legacyChain', scope: 'account', type: 'number', text: 'NG+ levels one Legacy Staff member was carried through in a row (0 until NG+, Milestone 28)' },
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
  // Milestone 25
  { id: 'prestige', text: 'Prestige Tokens (account-wide, never bought)', currency: true },
  { id: 'reputation', text: 'Reputation for the team (this run)' },
  { id: 'event', text: 'an M23 event that fires once (data/events.js)' },
  { id: 'flag', text: 'a stored flag for this run (a preset, an offer)' },
  { id: 'accountFlag', text: 'a stored account-wide switch (an accolade, a livery set, the mascot, a record)' },
  { id: 'clue', text: 'one more clue stage for another secret' },
  { id: 'track', text: 'a hidden track opened (Zero Ring)' },
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

// =====================================================================================================================
// Milestone 25: the 34 real secrets (bible §36.1–36.10), ids exactly as the bible. Every requirement is an explicit fact
// predicate; the bible's vague words are read as below (PLACEHOLDERS, DECISIONS.md M25). Stage 1 = the bible's rumour;
// stages 2–3 are stronger wordings; stage 4 shows the recipe.
// =====================================================================================================================

// How the vague words are read (src/systems/secrets.js computes the record fields from these).
export const SECRET_READINGS = {
  arrivalDays: 56, // a Legendary / Prestige arrival stays on the Recruitment Special tab this long
  // "night races": T08 Neon Harbor always; and these championship rounds run under floodlights (bible §26 has one
  // night track, so "5 night races across at least 3 tracks" needs night rounds elsewhere — PLACEHOLDER)
  nightTracks: ['T08'],
  nightRounds: { C09: ['T05'], C10: ['T10'], C11: ['T05'], C12: ['T10', 'T12'] },
  // "a permanent circuit": any circuit without street walls (T05 / T08 are street circuits)
  streetTracks: ['T05', 'T08'],
  // "classified Wet or Storm": the race saw the wet or storm state; "in rain": it saw any rain (damp too)
  wetStates: ['wet', 'storm'],
  // "World or Legends tier": the World-tier championships (C08–C12; C11 is the Legends Invitational)
  worldTier: ['C08', 'C09', 'C10', 'C11', 'C12'],
  // "the series recommendation" for a Power Unit: a technology tier (a part's complexity) per championship
  recommendedPuTier: { C01: 2, C02: 2, C03: 3, C04: 4, C05: 4, C06: 5, C07: 6, C08: 6, C09: 7, C10: 8, C11: 8, C12: 9 },
  // "a Research Prototype project" (no such project type yet): a Prototype or Experimental car finished (those classes
  // open at Rank B, the bible's Research Prototype rank)
  researchPrototype: { classes: ['prototype', 'experimental'] },
  // "car rating": the mean of the seven car stats in the race (combos and sponsor perks included); the field = every
  // other car's mean. "12% below the field" = 1 − yours ÷ field ≥ 12%; "a field rated 12%+ above your car" = field ÷
  // yours − 1 ≥ 12%
  ratingStats: ['SPD', 'ACC', 'COR', 'BRK', 'REL', 'EFF', 'TYR'],
  // "a gearbox failure": the race model doesn't name the failing part, so every mechanical failure counts
  spanRaces: 10,
  yearDays: 336, // "within one in-game year"
  // the 44 non-prestige part licences (§36.2 SEC-STAFF-S3)
  licences: ['PU01', 'PU02', 'PU03', 'PU04', 'PU05', 'PU06', 'PU07', 'PU08', 'TR01', 'TR02', 'TR03', 'TR04', 'TR05', 'TR06', 'TR07', 'CH01', 'CH02', 'CH03', 'CH04', 'CH05', 'CH06', 'CH07', 'AE01', 'AE02', 'AE03', 'AE04', 'AE05', 'AE06', 'AE07', 'HB01', 'HB02', 'HB03', 'HB04', 'HB05', 'HB06', 'HB07', 'EL01', 'EL02', 'EL03', 'EL04', 'EL05', 'EL06', 'EL07', 'EL08'],
  secretParts: ['PU09', 'TR08', 'CH08', 'AE08', 'HB08', 'EL09'],
  ghostTeam: 'R08',
};

// --- small builders (plain data out) ---
const w = (field, op, value) => ({ field, op, value });
const gte = (fact, value, label) => ({ fact, op: 'gte', value, label });
const eq = (fact, value, label) => ({ fact, op: 'eq', value, label });
const has = (fact, value, label) => ({ fact, op: 'has', value, label });
const count = (fact, where, value, label, extra = {}) => ({ fact, op: 'countOf', where, value, label, ...extra });
const streak = (fact, where, value, label) => ({ fact, op: 'consecutive', where, value, label });
const WON = w('won', 'eq', true);
const RANK_A = gte('run.rank', 4, 'Rank A or higher');
const RANK_S = gte('run.rank', 5, 'Rank S');
const clues = (rumour, hint, almost) => shares([rumour, hint, almost]);
const RUN = { scope: 'run', oncePerRun: true };
const ACCOUNT = { scope: 'account', oncePerAccount: true };
const arrival = (id) => [{ type: 'staffArrival', id, days: SECRET_READINGS.arrivalDays }];
const TOP = ['C10', 'C11', 'C12'];

export const SECRET_RULES = [
  // ---------------------------------------------------------------- 36.1 Legendary staff
  {
    id: 'SEC-STAFF-L1', name: 'Legendary Driver — Aria Storm', category: 'staff', ...RUN, triggerEvents: ['raceResult', 'rankUp'],
    requiresAll: [RANK_A, count('run.races', [WON, w('wetClass', 'eq', true)], 3, 'Win 3 races classified Wet or Storm'), count('run.races', [WON, w('grid', 'gte', 8)], 1, 'Win a race after starting P8 or worse')],
    clueStages: clues('Rumours mention a driver who only notices teams that thrive when weather turns ugly.', 'She watches the wet races — and the drivers who win from deep on the grid.', 'Rank A, three wins in the wet or a storm, and one win from P8 or worse.'),
    recipe: 'Rank A or higher; win 3 races classified Wet or Storm; win a race after starting P8 or worse.',
    rewardActions: arrival('DRV09'),
  },
  {
    id: 'SEC-STAFF-L2', name: 'Legendary Mechanic — Celia Torque', category: 'staff', ...RUN, triggerEvents: ['raceResult', 'rankUp'],
    requiresAll: [RANK_A, streak('run.races', [w('mechRetired', 'eq', false)], 15, '15 race starts in a row with no mechanical retirement'), count('run.races', [WON, w('damageRepairs', 'gte', 1)], 1, 'Win a race after repairing race damage in a pit stop')],
    clueStages: clues('A veteran mechanic is said to respect teams that finish what they start.', 'Long runs without a car breaking down — and a win saved in the pit lane.', 'Rank A, 15 starts in a row without a mechanical retirement, and a win after a pit-stop damage repair.'),
    recipe: 'Rank A or higher; 15 race starts in a row with no mechanical retirement; win a race after repairing race damage in a pit stop.',
    rewardActions: arrival('MEC09'),
  },
  {
    id: 'SEC-STAFF-L3', name: 'Legendary Race Engineer — Dr. Mira Volta', category: 'staff', ...RUN, triggerEvents: ['carBuilt', 'rankUp', 'comboFound', 'facilityBuilt'],
    requiresAll: [RANK_A, count('run.cars', [w('quality', 'gte', 90)], 3, 'Build 3 cars at QUALITY 90+ with 3 different Power Units', { by: 'powerUnit' }), has('run.facilities', 'F22', 'Own a Telemetry Room'), gte('account.recipeCount', 10, 'Discover 10 engineering synergies')],
    clueStages: clues('A famous robotics engineer has started reading your telemetry reports.', 'Superb cars from different engines, a room full of data, and synergies on file.', 'Rank A, 3 cars at QUALITY 90+ on 3 Power Units, a Telemetry Room, 10 combos discovered.'),
    recipe: 'Rank A or higher; 3 cars at QUALITY 90+ with 3 different Power Units; a Telemetry Room; 10 engineering synergies discovered.',
    rewardActions: arrival('ENG09'),
  },
  {
    id: 'SEC-STAFF-L4', name: 'Legendary Aero Designer — Aurelia Crest', category: 'staff', ...RUN, triggerEvents: ['raceResult', 'rankUp', 'researchDone'],
    requiresAll: [RANK_A, count('run.familyWins', [w('tracks', 'has', 'T06'), w('tracks', 'has', 'T10'), w('tracks', 'has', 'T05')], 1, 'Win at Highcrest Mountain, Titan Oval and Metro Street Circuit in the same car look'), has('run.research', 'AER6', 'Aero Research 6')],
    clueStages: clues('One designer believes a truly great shape should work everywhere.', 'A mountain, an oval and a street circuit — one look for all three.', 'Rank A, Aero Research 6, and wins at Highcrest, Titan Oval and Metro Street in one visual family.'),
    recipe: 'Rank A or higher; win at Highcrest Mountain, Titan Oval and Metro Street Circuit with the same car visual family; Aero Research 6.',
    rewardActions: arrival('AER09'),
  },
  {
    id: 'SEC-STAFF-L5', name: 'Legendary Strategist — Cass Vega', category: 'staff', ...RUN, triggerEvents: ['raceResult', 'rankUp', 'facilityBuilt'],
    requiresAll: [RANK_A, gte('run.swingWins', 3, 'Record 3 Strategy Swing wins'), gte('run.undercutWins', 1, 'Win once by undercut'), gte('run.extendedWins', 1, 'Win once by extending a stint'), has('run.facilities', 'F23', 'Strategy Room built')],
    clueStages: clues('A strategist is watching teams that win before the chequered flag is even close.', 'Calls that beat the crew’s plan — early stops and long stints alike.', 'Rank A, a Strategy Room, 3 Strategy Swing wins including an undercut win and an extended-stint win.'),
    recipe: 'Rank A or higher; 3 Strategy Swing wins; one win by undercut and one by extending a stint; a Strategy Room.',
    rewardActions: arrival('STR09'),
  },
  // ---------------------------------------------------------------- 36.2 Secret / prestige staff
  {
    id: 'SEC-STAFF-S1', name: 'Prestige Driver — Zero Kane', category: 'staff', ...RUN, ngPlusMin: 2, triggerEvents: ['raceResult', 'drillDone'],
    requiresAll: [gte('account.ngPlus', 2, 'NG+2 or higher'), gte('account.goldCount', 6, 'Gold in all 6 manual driver-training drills'), count('run.races', [WON, w('trackId', 'eq', 'T12')], 1, 'Win at Zero Ring (the Time Trial special event)')],
    clueStages: clues('A nameless test driver is said to care more about perfect laps than trophies.', 'Every drill at gold, and a win on a ring that isn’t on any map.', 'NG+2, gold in all 6 drills, and a win at Zero Ring.'),
    recipe: 'NG+2 or higher; gold in all 6 manual driver-training drills; win at Zero Ring.',
    rewardActions: arrival('DRV10'),
  },
  {
    id: 'SEC-STAFF-S2', name: 'Prestige Mechanic — Otis Black', category: 'staff', ...RUN, ngPlusMin: 1, triggerEvents: ['raceResult', 'seasonEnd', 'runEnded'],
    requiresAll: [gte('account.ngPlus', 1, 'NG+1 or higher'), eq('run.endingReached', true, 'Reach the Year-16 ending'), gte('run.firstYearMechanicsKept', 1, 'Keep an original Year-1 Mechanic employed to the ending'), count('run.seasons', [w('complete', 'eq', true), w('mechRetirements', 'eq', 0)], 1, 'Complete a whole championship with zero mechanical retirements'), has('run.titles', 'C08', 'Win Endurance Masters')],
    clueStages: clues('Old workshop stories say the best mechanic only joins teams that never abandon their first crew.', 'A Year-1 mechanic still on the books at the end, and a season where nothing broke.', 'NG+1, a Year-1 Mechanic kept to the ending, a full championship without a mechanical retirement, the Endurance Masters title.'),
    recipe: 'NG+1 or higher; a Year-1 Mechanic employed to the ending; a full championship with zero mechanical retirements; win Endurance Masters.',
    rewardActions: arrival('MEC10'),
  },
  {
    id: 'SEC-STAFF-S3', name: 'Prestige Race Engineer — Orin Flux', category: 'staff', ...RUN, ngPlusMin: 2, triggerEvents: ['raceResult', 'carBuilt', 'researchDone'],
    requiresAll: [gte('account.ngPlus', 2, 'NG+2 or higher'), gte('run.licences', 44, 'All 44 non-prestige part licences open'), count('run.cars', [w('classId', 'in', ['prototype', 'experimental'])], 5, 'Build 5 Experimental / Prototype cars'), count('run.races', [w('setupScore', 'eq', 100)], 5, 'Setup score 100 in 5 race weekends')],
    clueStages: clues('A private engineer is looking for a garage where every system has been understood.', 'Every licence open, prototypes on the floor, setups without a single error.', 'NG+2, all 44 part licences, 5 Prototype / Experimental cars, setup score 100 five times.'),
    recipe: 'NG+2 or higher; all 44 non-prestige part licences (PU01–PU08, TR01–TR07, CH01–CH07, AE01–AE07, HB01–HB07, EL01–EL08); 5 Experimental / Prototype cars; setup score 100 in 5 race weekends.',
    rewardActions: arrival('ENG10'),
  },
  {
    id: 'SEC-STAFF-S4', name: 'Prestige Aero Designer — Kestrel Venn', category: 'staff', ...RUN, ngPlusMin: 2, triggerEvents: ['raceResult', 'seasonEnd', 'facilityBuilt'],
    requiresAll: [gte('account.ngPlus', 2, 'NG+2 or higher'), count('run.seasons', [w('title', 'eq', true), w('puGap', 'gte', 2), w('corOverSpd', 'eq', true)], 1, 'Win a title with a Power Unit 2+ tiers below the series recommendation, on a car whose Cornering is above its Speed'), has('run.facilities', 'F17', 'Build a CFD Station'), has('run.facilities', 'F16', 'Build a Wind Tunnel')],
    clueStages: clues('Someone claims power is only a crutch for bad airflow.', 'A title won with a small engine and a car that corners better than it pulls.', 'NG+2, a CFD Station and Wind Tunnel, and a title with a Power Unit 2+ tiers under the recommendation and COR above SPD.'),
    recipe: 'NG+2 or higher; a championship won with a Power Unit at least 2 technology tiers below the series recommendation, the title car’s Cornering above its Speed; CFD Station and Wind Tunnel built.',
    rewardActions: arrival('AER10'),
  },
  {
    id: 'SEC-STAFF-S5', name: 'Prestige Strategist — Oracle Rey', category: 'staff', ...RUN, ngPlusMin: 3, triggerEvents: ['raceResult', 'seasonEnd'],
    requiresAll: [gte('account.ngPlus', 3, 'NG+3'), has('run.titles', 'C11', 'Win the Legends Invitational'), count('run.seasons', [w('title', 'eq', true), w('autoAll', 'eq', true)], 1, 'Win a championship on Auto Strategy in every race'), count('run.seasons', [w('title', 'eq', true), w('manualAll', 'eq', true)], 1, 'Win another with a manual strategy call in every race')],
    clueStages: clues('The final strategist wants proof that your team can win both with and without intervention.', 'One title left to the crew, another won with your own calls every race.', 'NG+3, the Legends Invitational, one title all on Auto, another with a manual call in every race.'),
    recipe: 'NG+3; win the Legends Invitational; win a championship with Auto Strategy for every race; win another with at least one manual strategy call in every race.',
    rewardActions: arrival('STR10'),
  },
  // ---------------------------------------------------------------- 36.3 Secret parts
  {
    id: 'SEC-PART-01', name: 'Zero HyperCore Power Unit', category: 'part', ...RUN, triggerEvents: ['raceResult', 'rankUp', 'researchDone'],
    requiresAll: [RANK_S, has('run.research', 'PWR6', 'Powertrain Research 6'), count('run.races', [w('trackId', 'eq', 'T10'), w('speedRecord', 'eq', true), w('powerUnit', 'in', ['PU07', 'PU08'])], 1, 'Set a new account top-speed record at Titan Oval with PU07 or PU08'), count('run.races', [WON, w('trackId', 'eq', 'T10'), w('tier', 'eq', 'world')], 1, 'Win at Titan Oval in a World or Legends tier event')],
    clueStages: clues('Engineers whisper that Titan Oval exposes the ceiling of ordinary power units.', 'The oval, the fastest you’ve ever gone there, and a world-class win on it.', 'Rank S, Powertrain 6, a Titan Oval top-speed record on PU07 / PU08, and a World-tier win at Titan Oval.'),
    recipe: 'Rank S; Powertrain Research 6; a new account top-speed record at Titan Oval with PU07 or PU08; a win at Titan Oval in a World or Legends tier event.',
    rewardActions: [{ type: 'part', id: 'PU09' }],
  },
  {
    id: 'SEC-PART-02', name: 'Seamless Shift Transmission', category: 'part', ...RUN, triggerEvents: ['raceResult', 'researchDone'],
    requiresAll: [has('run.research', 'TRN6', 'Transmission Research 6'), gte('run.poles', 5, 'Record 5 pole positions'), gte('run.fastestLaps', 5, 'Record 5 fastest laps'), count('run.spans', [w('poles', 'gte', 5), w('fastestLaps', 'gte', 5), w('mechFailures', 'eq', 0)], 1, '5 poles and 5 fastest laps inside 10 races in a row with no gearbox failure')],
    clueStages: clues('A perfect gearbox leaves almost no trace between one gear and the next.', 'Poles and fastest laps, over and over, without the drivetrain ever failing.', 'Transmission 6, and within 10 races in a row: 5 poles, 5 fastest laps, no mechanical failure.'),
    recipe: 'Transmission Research 6; within 10 race weekends in a row: 5 pole positions, 5 fastest laps and no gearbox (mechanical) failure.',
    rewardActions: [{ type: 'part', id: 'TR08' }],
  },
  {
    id: 'SEC-PART-03', name: 'Active Flex Chassis', category: 'part', ...RUN, triggerEvents: ['raceResult', 'researchDone'],
    requiresAll: [has('run.research', 'CHA6', 'Chassis Research 6'), streak('run.races', [w('finished', 'eq', true), w('damageHits', 'eq', 0)], 12, 'Finish 12 races in a row without chassis damage'), has('run.titles', 'C08', 'Win Endurance Masters')],
    clueStages: clues('Endurance racing keeps revealing strange ideas about a chassis that moves without giving up stiffness.', 'A dozen clean finishes in a row, and the Endurance Masters title.', 'Chassis 6, 12 finishes in a row with no race damage, and the Endurance Masters title.'),
    recipe: 'Chassis Research 6; finish 12 race weekends in a row without race damage; win Endurance Masters.',
    rewardActions: [{ type: 'part', id: 'CH08' }],
  },
  {
    id: 'SEC-PART-04', name: 'Active Aero', category: 'part', ...RUN, triggerEvents: ['raceResult', 'researchDone'],
    requiresAll: [has('run.research', 'AER6', 'Aero Research 6'), count('run.carRecords', [w('winTracks', 'has', 'T06'), w('winTracks', 'has', 'T10')], 1, 'Win Highcrest Mountain and Titan Oval with the same car'), count('run.carRecords', [w('highcrestTitanDays', 'lte', 336)], 1, 'Both wins within one in-game year (336 days)')],
    clueStages: clues('The impossible aero package must work at both ends of the downforce spectrum.', 'One car, the mountain and the oval, close together.', 'Aero 6, and one car winning at Highcrest Mountain and Titan Oval within 336 days.'),
    recipe: 'Aero Research 6; win Highcrest Mountain and Titan Oval with the same car, the two wins within 336 days.',
    rewardActions: [{ type: 'part', id: 'AE08' }],
  },
  {
    id: 'SEC-PART-05', name: 'Active Handling System', category: 'part', ...RUN, triggerEvents: ['raceResult', 'researchDone'],
    requiresAll: [has('run.research', 'HAN6', 'Handling Research 6'), count('run.races', [WON, w('wetClass', 'eq', true)], 2, 'Win 2 Wet / Storm races'), count('run.races', [WON, w('wetClass', 'eq', true), w('tyreLife', 'gt', 25), w('spins', 'eq', 0)], 2, 'Each of them with tyre life above 25% and no spin')],
    clueStages: clues('Wet races are exposing a suspension idea that seems to react before the driver does.', 'Wet wins on tyres that still have plenty left, and never a spin.', 'Handling 6, and 2 Wet / Storm wins with tyre life above 25% and no spin.'),
    recipe: 'Handling Research 6; 2 Wet / Storm wins, each finished with tyre life above 25% and no spin.',
    rewardActions: [{ type: 'part', id: 'HB08' }],
  },
  {
    id: 'SEC-PART-06', name: 'BOTWORKS RaceCore', category: 'part', ...RUN, triggerEvents: ['raceResult', 'researchDone'],
    requiresAll: [
      has('run.research', 'ELE6', 'Electronics Research 6'),
      gte('run.researchCount', 36, 'Complete all 36 visible research nodes'),
      count('run.races', [WON, w('autoOnly', 'eq', true)], 5, 'Win 5 races on Auto Strategy from lights to flag'),
      { any: [eq('run.techDemoAppeared', false, 'The BOTWORKS technology demo has not appeared'), eq('run.techDemoDone', true, 'The BOTWORKS technology demo was hosted')], label: 'Complete the BOTWORKS technology demo event if it has appeared' },
    ],
    clueStages: clues('A robotics company thinks its control core could make decisions faster than a pit wall.', 'The whole research tree, and races the crew wins alone.', 'Electronics 6, all 36 research nodes, 5 Auto-only wins, and the BOTWORKS demo hosted if it came.'),
    recipe: 'Electronics Research 6; all 36 visible research nodes; 5 wins on Auto Strategy from lights to flag; the BOTWORKS technology demo hosted if it has appeared.',
    rewardActions: [{ type: 'part', id: 'EL09' }],
  },
  // ---------------------------------------------------------------- 36.4 Secret facilities
  {
    id: 'SEC-FAC-01', name: 'Black Lab', category: 'facility', ...RUN, triggerEvents: ['carBuilt', 'rankUp', 'secretFound'],
    requiresAll: [gte('run.secretParts', 3, 'Discover any 3 secret parts'), RANK_S, gte('run.researchPrototypes', 3, 'Complete 3 Research Prototype projects')],
    clueStages: clues('Some technologies need a room that does not appear on the floor plan.', 'Secret parts, prototypes, and a reputation at the very top.', 'Rank S, 3 secret parts, 3 Research Prototype projects.'),
    recipe: 'Rank S; 3 secret parts discovered; 3 Research Prototype projects (a Prototype / Experimental car finished at Rank B+).',
    rewardActions: [{ type: 'facility', id: 'F34' }],
  },
  {
    id: 'SEC-FAC-02', name: 'Ghost Garage', category: 'facility', ...RUN, triggerEvents: ['raceResult', 'seasonEnd', 'secretFound'],
    requiresAll: [gte('run.ghostDefeats', 2, 'Defeat Ghostline Racing twice'), has('run.titles', 'C11', 'Win the Legends Invitational'), gte('account.secretsFound', 20, 'Discover 20 total secrets')],
    clueStages: clues('A sealed annex appears on old plans after Ghostline starts taking your calls.', 'Beat Ghostline more than once, and win where the legends race.', 'Beat Ghostline twice, win the Legends Invitational, and find 20 secrets.'),
    recipe: 'Finish ahead of Ghostline Racing in 2 race weekends; win the Legends Invitational; 20 secrets discovered.',
    rewardActions: [{ type: 'facility', id: 'F35' }],
  },
  // ---------------------------------------------------------------- 36.5 Secret championships
  {
    id: 'SEC-COMP-01', name: 'Legends Invitational', category: 'championship', ...RUN, triggerEvents: ['raceResult', 'seasonEnd', 'hire'],
    requiresAll: [has('run.titles', 'C10', 'Win the World Racing Championship'), count('run.seasons', [w('title', 'eq', true), w('champ', 'in', ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09'])], 3, 'Win 3 other visible titles with 3 different car classes', { by: 'carClass' }), gte('run.legendaryHires', 1, 'Recruit a Legendary staff member')],
    clueStages: clues('World champions sometimes receive an invitation with no sponsor logo on it.', 'The world title, titles in other kinds of car, and a legend on the team.', 'The World title, 3 other visible titles in 3 different classes, and a Legendary hire.'),
    recipe: 'Win the World Racing Championship; win 3 other visible championships with 3 different car classes; recruit a Legendary staff member.',
    rewardActions: [{ type: 'championship', id: 'SEC-COMP-01' }],
  },
  {
    id: 'SEC-COMP-02', name: 'Apex Zero Championship', category: 'championship', ...RUN, ngPlusMin: 2, triggerEvents: ['raceResult', 'seasonEnd', 'secretFound'],
    requiresAll: [gte('account.ngPlus', 2, 'NG+2 or higher'), has('run.titles', 'C11', 'Win the Legends Invitational'), gte('run.ghostDefeats', 1, 'Defeat Ghostline Racing at least once'), gte('account.secretsFound', 24, 'Discover at least 24 secrets')],
    clueStages: clues('The last championship does not appear on any public calendar.', 'The Legends crown, a win over Ghostline, and most of the secrets.', 'NG+2, the Legends Invitational, beat Ghostline once, 24 secrets found.'),
    recipe: 'NG+2 or higher; win the Legends Invitational; finish ahead of Ghostline once; 24 secrets discovered.',
    rewardActions: [{ type: 'championship', id: 'SEC-COMP-02' }, { type: 'track', id: 'T12' }],
  },
  // ---------------------------------------------------------------- 36.6 Secret rival
  {
    id: 'SEC-RIVAL-01', name: 'Ghostline Racing', category: 'rival', ...RUN, triggerEvents: ['raceResult', 'seasonEnd', 'secretFound'],
    requiresAll: [has('run.titles', 'C10', 'Win the World Racing Championship'), gte('account.secretsFound', 10, 'Discover at least 10 secrets'), count('run.races', [WON, w('fieldAbovePct', 'gte', 12)], 1, 'A Giant Killer win against a field rated 12%+ above your car')],
    clueStages: clues('A team with no public workshop seems interested only in impossible wins.', 'World champions who keep beating faster cars, and know a few secrets.', 'The World title, 10 secrets, and a win against a field rated 12%+ above your car.'),
    recipe: 'Win the World Racing Championship; 10 secrets discovered; a win against a field whose car rating is 12%+ above yours.',
    rewardActions: [{ type: 'rival', id: 'R08' }],
  },
  // ---------------------------------------------------------------- 36.7 Secret car families
  {
    id: 'SEC-CAR-01', name: 'Hypercar X visual family', category: 'visual', ...RUN, triggerEvents: ['raceResult', 'seasonEnd', 'carBuilt'],
    requiresAll: [
      count('run.carRecords', [w('classId', 'in', ['prototype', 'experimental']), w('quality', 'gte', 94), w('spd', 'gte', 220), w('acc', 'gte', 220)], 1, 'Build a Prototype or Experimental car with QUALITY 94+, SPD and ACC 220+'),
      count('run.carRecords', [w('classId', 'in', ['prototype', 'experimental']), w('quality', 'gte', 94), w('spd', 'gte', 220), w('acc', 'gte', 220), w('titles', 'has', 'C07')], 1, 'Win the Prototype Challenge with that car'),
    ],
    clueStages: clues('Prototype judges keep asking what happens if nothing is built for cost.', 'A prototype that is brilliant everywhere — and a Prototype Challenge title in it.', 'A Prototype / Experimental car at QUALITY 94+, SPD and ACC 220+, that wins the Prototype Challenge.'),
    recipe: 'A Prototype or Experimental car with QUALITY 94+ and SPD / ACC both 220+, which wins the Prototype Challenge.',
    rewardActions: [{ type: 'visual', id: 'V17' }],
  },
  {
    id: 'SEC-CAR-02', name: 'Electric Phantom visual family', category: 'visual', ...RUN, triggerEvents: ['raceResult'],
    requiresAll: [count('run.races', [WON, w('powerUnit', 'eq', 'PU08'), w('champ', 'eq', 'C08'), w('energySave', 'eq', false), w('mechRetired', 'eq', false)], 1, 'Win an Endurance Masters race on PU08 without emergency energy saving or a mechanical retirement')],
    clueStages: clues('An electric race car has supposedly completed a long race without once asking to be treated gently.', 'The Electric Sprint Unit, an Endurance Masters race, and never a moment of saving.', 'Win an Endurance Masters round on PU08 without the crew ever switching to Conserve.'),
    recipe: 'Win an Endurance Masters race with PU08 Electric Sprint Unit, with no emergency energy save (Conserve pace) and no mechanical retirement.',
    rewardActions: [{ type: 'visual', id: 'V18' }],
  },
  {
    id: 'SEC-CAR-03', name: 'Ghost Spec visual family', category: 'visual', ...RUN, triggerEvents: ['raceResult'],
    requiresAll: [gte('run.ghostDefeats', 3, 'Defeat Ghostline Racing 3 times'), count('run.carRecords', [w('ghostDefeats', 'gte', 3), w('ghostNightWins', 'gte', 1), w('ghostRainWins', 'gte', 1), w('ghostPermanentWins', 'gte', 1)], 1, 'One car beats Ghostline 3 times: a win at night, one in rain, one at a permanent circuit')],
    clueStages: clues('Ghostline only reveals its real engineering when the same rival keeps returning.', 'The same car, beating Ghostline at night, in the rain and on a proper circuit.', 'Beat Ghostline 3 times with one car: a win at night, a win in rain, a win at a permanent circuit.'),
    recipe: 'Finish ahead of Ghostline 3 times with one of your cars, winning at night, in rain and at a permanent (non-street) circuit.',
    rewardActions: [{ type: 'visual', id: 'V19' }],
  },
  {
    id: 'SEC-CAR-04', name: 'Project Zero', category: 'visual', ...RUN, ngPlusMin: 3, triggerEvents: ['raceResult', 'seasonEnd', 'carBuilt', 'hire', 'secretFound'],
    requiresAll: [gte('account.ngPlus', 3, 'NG+3'), has('run.titles', 'C12', 'Win the Apex Zero Championship'), gte('run.secretParts', 6, 'Own all 6 secret parts'), count('run.cars', [w('parts', 'has', 'PU09'), w('parts', 'has', 'TR08'), w('parts', 'has', 'CH08'), w('parts', 'has', 'AE08'), w('parts', 'has', 'HB08'), w('parts', 'has', 'EL09')], 1, 'Build one car using all 6 secret parts'), gte('run.prestigeHires', 1, 'Recruit a Prestige staff member')],
    clueStages: clues('Six impossible systems are said to fit together only once.', 'Every secret part in one car, the hidden championship, and a prestige name on the team.', 'NG+3, the Apex Zero title, all 6 secret parts in one car, and a Prestige hire.'),
    recipe: 'NG+3; win the Apex Zero Championship; own all 6 secret parts and build one car with all six; recruit a Prestige staff member.',
    rewardActions: [{ type: 'visual', id: 'V20' }, { type: 'accountFlag', id: 'hiddenEndingPath' }, { type: 'accountFlag', id: 'ultimateRecord' }],
  },
  // ---------------------------------------------------------------- 36.8 Behaviour secrets
  {
    id: 'SEC-BEH-01', name: 'Founder Loyalty', category: 'behaviour', ...RUN, triggerEvents: ['runEnded'],
    requiresAll: [eq('run.endingReached', true, 'Reach the Year-16 ending'), gte('run.startersKept', 1, 'Keep a Year-1 starting staff member employed without a break')],
    clueStages: clues('People remember who was there before the trophies.', 'Someone from day one, still here at the very end.', 'Keep one of your three starting staff without a break until the Year-16 ending.'),
    recipe: 'Keep any of the starting staff employed without a break until the Year-16 ending.',
    rewardActions: [{ type: 'flag', id: 'founderTraitUpgrade' }, { type: 'prestige', id: 'SEC-BEH-01', amount: 1 }, { type: 'accountFlag', id: 'founderLoyaltyRecord' }],
  },
  {
    id: 'SEC-BEH-02', name: 'Giant Killer', category: 'behaviour', ...RUN, triggerEvents: ['raceResult'],
    requiresAll: [count('run.races', [WON, w('champRace', 'eq', true), w('belowFieldPct', 'gte', 12)], 1, 'Win a championship race with a car rated 12%+ below the field average'), eq('account.competitiveSecretInvalidated', false, 'No debug / forced results used (aids never count)')],
    clueStages: clues('A weak car beating a strong field tends to attract unusual attention.', 'Win a championship race in a car the field should have crushed.', 'Win a championship race with a car rating 12%+ below the field average, with no forced results.'),
    recipe: 'Win a championship race with a car rating at least 12% below the field average; competitiveSecretInvalidated must be false (debug / forced results only — accessibility aids never set it).',
    rewardActions: [{ type: 'event', id: 'EV_UNDERDOG' }, { type: 'reputation', id: 'SEC-BEH-02', amount: 100 }, { type: 'clue', id: 'SEC-RIVAL-01' }],
  },
  {
    id: 'SEC-BEH-03', name: 'No Pit Hero', category: 'behaviour', ...RUN, triggerEvents: ['raceResult'],
    requiresAll: [count('run.races', [WON, w('raceType', 'eq', 'standard'), w('plannedStops', 'gte', 1), w('stops', 'eq', 0), w('tyreLife', 'gt', 5)], 1, 'Win a standard race the crew planned a stop for, with zero stops and tyre life above 5%')],
    clueStages: clues('Someone in the paddock claims the fastest stop is the one you never make.', 'The crew planned a stop. You won without one.', 'Win a standard race with a planned pit window, make no stop, and finish with tyre life above 5%.'),
    recipe: 'Win a standard race the crew planned at least one stop for, with zero pit stops and tyre life above 5% at the flag.',
    rewardActions: [{ type: 'flag', id: 'longTankPreset' }, { type: 'flag', id: 'specialSponsorOffer' }],
  },
  // ---------------------------------------------------------------- 36.9 New Game+ secrets
  {
    id: 'SEC-NGP-01', name: 'Back to Basics', category: 'ngplus', ...ACCOUNT, ngPlusMin: 1, triggerEvents: ['raceResult', 'seasonEnd'],
    requiresAll: [gte('account.ngPlus', 1, 'NG+1 or higher'), count('run.seasons', [w('champ', 'eq', 'C01'), w('title', 'eq', true), w('startPartsOnly', 'eq', true), w('standardDriver', 'eq', true)], 1, 'Win the Rookie Sprint Cup on Tier-1 / Start parts with a driver who began the run at Standard tier')],
    clueStages: clues('The old cars still have something to teach.', 'The Rookie Sprint Cup again, on the simplest parts, with a driver from the start.', 'NG+1: win the Rookie Sprint Cup using only Tier-1 / Start parts and a driver who began the run Standard.'),
    recipe: 'NG+1 or higher; win the Rookie Sprint Cup with only Tier-1 / Start parts, raced by a driver who began the run at Standard tier.',
    rewardActions: [{ type: 'accountFlag', id: 'heritageLivery' }, { type: 'prestige', id: 'SEC-NGP-01', amount: 2 }, { type: 'event', id: 'EV_RETRO_WEEKEND' }],
  },
  {
    id: 'SEC-NGP-02', name: 'Night King', category: 'ngplus', ...ACCOUNT, ngPlusMin: 2, triggerEvents: ['raceResult'],
    requiresAll: [gte('account.ngPlus', 2, 'NG+2 or higher'), count('run.races', [WON, w('night', 'eq', true)], 5, 'Win 5 night races'), count('run.races', [WON, w('night', 'eq', true)], 3, 'Night wins at 3 different tracks', { by: 'trackId' }), count('run.races', [WON, w('night', 'eq', true), w('grid', 'gte', 3)], 2, '2 of them from outside the front row')],
    clueStages: clues('Some trophies only seem to exist after midnight.', 'Floodlit wins, on more than one circuit, some from the second row back.', 'NG+2: 5 night wins on 3 tracks, 2 of them from P3 or worse.'),
    recipe: 'NG+2 or higher; win 5 night races across at least 3 tracks, at least 2 of them from outside the front row (P3 or worse).',
    rewardActions: [{ type: 'event', id: 'EV_NEON_MIDNIGHT' }, { type: 'clue', id: 'SEC-X-02' }],
  },
  {
    id: 'SEC-NGP-03', name: 'Legacy Line', category: 'ngplus', ...ACCOUNT, ngPlusMin: 3, triggerEvents: ['raceResult', 'seasonEnd'],
    requiresAll: [gte('account.ngPlus', 3, 'NG+3'), gte('account.legacyChain', 3, 'The same Legacy Staff member through NG+1, NG+2 and NG+3'), gte('run.legacyTitles', 1, 'That staff member races in a World or Legends title')],
    clueStages: clues('Three careers can become one story.', 'One person, carried through every New Game+, still winning at the top.', 'NG+3, one Legacy Staff member through NG+1–3, part of a World or Legends title.'),
    recipe: 'NG+3; carry the same Legacy Staff member through NG+1, NG+2 and NG+3; they race in a World or Legends title.',
    rewardActions: [{ type: 'accountFlag', id: 'legacyMaster' }, { type: 'prestige', id: 'SEC-NGP-03', amount: 3 }],
  },
  // ---------------------------------------------------------------- 36.10 Cross-universe / ultimate
  {
    id: 'SEC-X-01', name: 'BOTWORKS Technology Demo', category: 'cross', ...ACCOUNT, triggerEvents: ['carBuilt', 'researchDone', 'sponsorSigned', 'rankUp'],
    requiresAll: [RANK_A, has('run.research', 'ELE5', 'Electronics Research 5'), has('run.sponsorsActive', 'SPN08', 'BOTWORKS Systems sponsor active'), count('run.cars', [w('researchPrototype', 'eq', true), w('parts', 'has', 'EL08')], 1, 'Complete a Research Prototype with EL08')],
    clueStages: clues('BOTWORKS wants to test something from another industry.', 'A BOTWORKS deal, Electronics 5, and a prototype carrying predictive control.', 'Rank A, Electronics 5, BOTWORKS on the car, and a Research Prototype with EL08.'),
    recipe: 'Rank A; Electronics Research 5; BOTWORKS Systems sponsor active; a Research Prototype (Prototype / Experimental car at Rank B+) with EL08.',
    rewardActions: [{ type: 'event', id: 'EV_BOTWORKS_DEMO' }, { type: 'accountFlag', id: 'pitRobotCameo' }, { type: 'clue', id: 'SEC-PART-06' }],
  },
  {
    id: 'SEC-X-02', name: 'Ghost Cat Mascot', category: 'cross', ...ACCOUNT, triggerEvents: ['raceResult', 'secretFound'],
    requiresAll: [has('account.secretsFoundIds', 'SEC-NGP-02', 'Complete Night King'), count('run.races', [w('trackId', 'eq', 'T08'), w('ghostBeat', 'eq', true), w('drive', 'eq', false)], 1, 'Defeat Ghostline at Neon Harbor without a Drive Stint')],
    clueStages: clues("A black cat keeps appearing near Ghostline's transporter.", 'Neon Harbor, Ghostline behind you, hands off the wheel.', 'After Night King: beat Ghostline at Neon Harbor without driving a Drive Stint.'),
    recipe: 'Complete Night King; finish ahead of Ghostline at Neon Harbor without a Manual Drive Stint in that race.',
    rewardActions: [{ type: 'accountFlag', id: 'ghostCatMascot' }],
  },
  {
    id: 'SEC-X-03', name: 'Perfect Weekend', category: 'cross', ...ACCOUNT, triggerEvents: ['raceResult'],
    requiresAll: [count('run.races', [w('champ', 'in', TOP), w('pole', 'eq', true), w('fastestLap', 'eq', true), WON, w('setupScore', 'eq', 100), w('mechFails', 'eq', 0), w('faults', 'eq', 0), w('spins', 'eq', 0), w('damageHits', 'eq', 0)], 1, 'In C10 / C11 / C12: pole, fastest lap, win, setup score 100 — no faults, spins or race damage')],
    clueStages: clues('There is one weekend where nothing goes wrong.', 'At the very top: first on the grid, fastest on track, first at the flag — flawless.', 'In C10–C12: pole, fastest lap, the win, setup 100, and no fault, spin or damage all weekend.'),
    recipe: 'In C10, C11 or C12: pole, fastest lap and the win, with setup score 100 and no faults, penalties, spins or race damage.',
    rewardActions: [{ type: 'accountFlag', id: 'perfectWeekend' }, { type: 'prestige', id: 'SEC-X-03', amount: 3 }, { type: 'accountFlag', id: 'finalRumourPage' }],
  },
];
export const SECRET_IDS = SECRET_RULES.map((r) => r.id);
// The account-wide switches a reward can set (src/systems/secrets.js), with the words the Rumour Archive shows.
export const ACCOUNT_FLAGS = {
  founderLoyaltyRecord: 'Founder Loyalty: kept a founding crew member to the end (permanent record)',
  heritageLivery: 'Heritage livery set unlocked',
  legacyMaster: 'Legacy Master trait (permanent)',
  pitRobotCameo: 'BOTWORKS pit-service robot cameo',
  ghostCatMascot: 'Ghost Cat mascot in the garage',
  perfectWeekend: 'Perfect Weekend accolade',
  finalRumourPage: 'The final Rumour Archive page',
  hiddenEndingPath: 'Project Zero: the hidden ending path',
  ultimateRecord: 'Project Zero: the ultimate record category',
};
export const FINAL_RUMOUR_PAGE = 'The last page: “Every secret leaves a trace. The Zero Ring was never on a map, Ghostline never had a workshop, and the cat was always watching. You found them because you kept racing.”';
