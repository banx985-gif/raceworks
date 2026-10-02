// The 30 visible achievements, the Records screen's records and the completion metrics (Milestone 26, bible §34, §7,
// §13.2–13.3). Plain data only: src/systems/achievements.js runs them.
//
// An achievement is a Secret Condition Engine rule (core/SecretEngine, the M24 engine) and passes the same validator
// (src/systems/secretRules.js validateRule(rule, { achievement: true }): every condition machine-exact on the FACTS of
// data/secrets.js, triggers from its TRIGGERS — the very moments the secrets are checked on). It is account-wide (once
// per account: earned in any run, it stays earned in every slot and after New Game+), so its reward is paid once ever.
//   id, name, recipe (the bible's requirement in words, shown on the Records screen), icon (the toast / Records icon: the
//   nearest existing art — race_ui_23 Training Medal for a medal), scope 'account', oncePerAccount, triggerEvents,
//   requiresAll / requiresAny, rewardActions: [{ type: 'credits' | 'rp' | 'tokens', id, amount }]
//
// PLACEHOLDERS (DECISIONS.md, M26): every reward amount, the reading of each vague word (ACHIEVEMENT_READINGS), the
// completion categories and weights, which records count as prestige.

// How the bible's words are read (machine-exact; DECISIONS.md M26).
export const ACHIEVEMENT_READINGS = {
  // "Win an endurance race": a win in a race of the endurance type (none run yet) or in a round of C08 Endurance Masters
  enduranceChamps: ['C08'],
  // "Win at Neon Harbor"
  nightShiftTrack: 'T08',
  // "Complete a race with no pit error": a race weekend finished (not retired) with at least one pit stop and no stop
  // forced by a fault or taken outside the window (the M21 pitErrors count)
  pitPerfectMinStops: 1,
  // "Own 4 prepared cars": cars in the Car Garage at full Condition (100 — repaired, ready to race)
  preparedCondition: 100,
  // "Discover 10 parts": part licences open beyond the six Start parts (the 44 non-prestige licences only)
  // "Employ one Elite in every role": a person of Elite tier or above in each of the five roles at once
  eliteTiers: ['elite', 'legendary', 'secret'],
  // "Unlock all normal expansions": the four wings (Bay Extension, Engineering Wing, Race Operations Wing, World Team
  // Annex) open — never the Ghost Annex (a secret)
  normalExpansions: 4,
  // "Complete 10 sponsor deals successfully": deals that ran their full term with the obligation met
  // "Finish a year with 100,000+ Credits": Credits on hand at the moment the year turns (before the new month's bills)
  yearEndCredits: 100000,
  // "Discover 10 combos": combos (synergies) discovered on this device
  // "Win a race entirely on Auto Strategy": a won race weekend with no manual command and no Drive Stint (M24 autoOnly)
};

const w = (field, op, value) => ({ field, op, value });
const gte = (fact, value, label) => ({ fact, op: 'gte', value, label });
const has = (fact, value, label) => ({ fact, op: 'has', value, label });
const count = (fact, where, value, label, extra = {}) => ({ fact, op: 'countOf', where, value, label, ...extra });
const WON = w('won', 'eq', true);
const A = { scope: 'account', oncePerAccount: true };
const AR = ACHIEVEMENT_READINGS;

// Rewards (§34: "modest Credits / RP / Racing Tokens"), four sizes. PLACEHOLDER amounts.
const pay = (id, credits, rp, tokens = 0) => [
  { type: 'credits', id: `${id}:credits`, amount: credits },
  { type: 'rp', id: `${id}:rp`, amount: rp },
  ...(tokens ? [{ type: 'tokens', id: `${id}:tokens`, amount: tokens }] : []),
];
export const REWARD_SIZES = { small: [500, 10, 0], medium: [1500, 25, 0], large: [5000, 50, 0], top: [10000, 100, 5] };
const size = (id, s) => pay(id, ...REWARD_SIZES[s]);

const RACE = ['raceResult'];
const ach = (id, name, recipe, icon, triggerEvents, conds, reward, extra = {}) => ({ id, name, recipe, icon, ...A, triggerEvents, requiresAll: conds, rewardActions: size(id, reward), ...extra });

export const ACHIEVEMENTS = [
  ach('A01', 'First Build', 'Complete first car', 'race_ui_01', ['carBuilt'], [has('run.timeline', 'firstCar', 'A car finished')], 'small'),
  ach('A02', 'Lights Out', 'Start first race', 'race_ui_04', RACE, [has('run.timeline', 'firstRace', 'A race weekend raced')], 'small'),
  ach('A03', 'Podium', 'Finish top 3', 'race_ui_14', RACE, [has('run.timeline', 'firstPodium', 'A top-3 finish')], 'small'),
  ach('A04', 'Winner', 'Win first race', 'race_ui_04', RACE, [has('run.timeline', 'firstWin', 'A race win')], 'medium'),
  ach('A05', 'Pole Sitter', 'Take first pole', 'race_ui_11', RACE, [gte('run.poles', 1, 'Pole positions')], 'small'),
  ach('A06', 'Fastest', 'Set first fastest lap', 'race_ui_18', RACE, [gte('run.fastestLaps', 1, 'Fastest laps')], 'small'),
  ach('A07', 'Club Champion', 'Win C01', 'race_reward_07', ['seasonEnd'], [has('run.titles', 'C01', 'Rookie Sprint Cup title')], 'medium'),
  ach('A08', 'National Name', 'Win any national-tier title', 'race_reward_08', ['seasonEnd'], [count('run.seasons', [w('title', 'eq', true), w('tier', 'eq', 'national')], 1, 'National-tier titles')], 'large'),
  ach('A09', 'World Class', 'Unlock C10', 'race_ui_04', ['rankUp', 'seasonEnd', 'monthEnd', 'facilityBuilt', 'researchDone'], [has('run.champsOpen', 'C10', 'World Racing Championship open')], 'large'),
  ach('A10', 'World Champion', 'Win C10', 'race_reward_09', ['seasonEnd'], [has('run.titles', 'C10', 'World Racing Championship title')], 'top'),
  ach('A11', 'Five Wins', 'Win 5 races', 'race_ui_04', RACE, [gte('run.wins', 5, 'Race wins')], 'medium'),
  ach('A12', 'Twenty Wins', 'Win 20 races', 'race_ui_04', RACE, [gte('run.wins', 20, 'Race wins')], 'large'),
  ach('A13', 'Fifty Wins', 'Win 50 races', 'race_ui_04', RACE, [gte('run.wins', 50, 'Race wins')], 'top'),
  ach('A14', 'Wet Winner', 'Win in Wet/Storm', 'race_ui_08', RACE, [count('run.races', [WON, w('wetClass', 'eq', true)], 1, 'Wins in a Wet or Storm race')], 'medium'),
  ach('A15', 'Night Shift', 'Win at Neon Harbor', 'race_ui_04', RACE, [count('run.races', [WON, w('trackId', 'eq', AR.nightShiftTrack)], 1, 'Wins at Neon Harbor')], 'medium'),
  ach('A16', 'Long Haul', 'Win an endurance race', 'race_ui_10', RACE, [], 'large', {
    requiresAny: [count('run.races', [WON, w('raceType', 'eq', 'endurance')], 1, 'Wins in an endurance race'), count('run.races', [WON, w('champ', 'in', AR.enduranceChamps)], 1, 'Wins in an Endurance Masters round')],
  }),
  ach('A17', 'Pit Perfect', 'Complete a race with no pit error', 'race_ui_07', RACE, [count('run.races', [w('finished', 'eq', true), w('stops', 'gte', AR.pitPerfectMinStops), w('pitErrors', 'eq', 0)], 1, 'Races finished with every pit stop clean')], 'small'),
  ach('A18', 'Engineer', 'Discover 10 parts', 'race_ui_03', ['researchDone', 'carBuilt', 'monthEnd', 'facilityBuilt'], [gte('run.partsDiscovered', 10, 'Parts discovered beyond the Start parts')], 'medium'),
  ach('A19', 'Technology Team', 'Complete all 36 visible research nodes', 'race_ui_03', ['researchDone'], [gte('run.researchCount', 36, 'Research nodes finished')], 'top'),
  ach('A20', 'Combo Hunter', 'Discover 10 combos', 'race_ui_15', ['comboFound', 'carBuilt'], [gte('account.recipeCount', 10, 'Combos discovered')], 'large'),
  ach('A21', 'Full Garage', 'Own 4 prepared cars', 'race_ui_24', ['carBuilt', 'carRepaired', 'raceResult', 'monthEnd'], [gte('run.preparedCars', 4, 'Cars at full Condition')], 'medium'),
  ach('A22', 'Growing Team', 'Employ 12 staff', 'race_ui_02', ['hire'], [gte('run.staffCount', 12, 'People employed')], 'medium'),
  ach('A23', 'Talent Factory', 'Train one staff to Level 30', 'race_ui_02', ['levelUp'], [gte('run.maxStaffLevel', 30, 'Highest staff level')], 'large'),
  ach('A24', 'Elite Crew', 'Employ one Elite in every role', 'race_ui_02', ['hire', 'levelUp'], [count('run.staff', [w('tier', 'in', AR.eliteTiers)], 5, 'Roles with an Elite (or above) employed', { by: 'role' })], 'top'),
  ach('A25', 'Big Workshop', 'Unlock all normal expansions', 'race_ui_01', ['rankUp', 'monthEnd', 'facilityBuilt'], [gte('run.expansionsOpen', AR.normalExpansions, 'Garage wings open')], 'large'),
  ach('A26', 'Sponsor Magnet', 'Complete 10 sponsor deals successfully', 'race_ui_26', ['sponsorEnded'], [gte('run.sponsorDealsMet', 10, 'Sponsor deals completed with the obligation met')], 'large'),
  ach('A27', 'Money Team', 'Finish a year with 100,000+ Credits', 'race_ui_05', ['monthEnd'], [count('run.yearEnds', [w('credits', 'gte', AR.yearEndCredits)], 1, 'Years ended with 100,000+ Credits')], 'large'),
  ach('A28', 'Manual Medal', 'Earn first Gold Driver Drill medal', 'race_ui_23', ['drillDone', 'drillRecorded'], [gte('account.goldCount', 1, 'Drills with a Gold ever earned (goldEverEarned)')], 'medium'),
  ach('A29', 'Hands Off', 'Win a race entirely on Auto Strategy', 'race_ui_29', RACE, [count('run.races', [WON, w('autoOnly', 'eq', true)], 1, 'Wins on Auto Strategy from start to flag')], 'medium'),
  ach('A30', 'Team Principal', 'Reach Rank S', 'race_reward_10', ['rankUp'], [gte('run.rank', 5, 'Rank S')], 'top'),
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) ?? null;
// Every icon an achievement uses (they load with the game: data/assets.js).
export const ACHIEVEMENT_ICONS = [...new Set(ACHIEVEMENTS.map((a) => a.icon))];

// --- completion (visible content only — the hidden denominator rule) -----------------------------------------------
// Each category: found / total over the account (every run on this device), weighted into one %. No category ever
// counts a secret: C11 / C12, the six prestige parts, F34 / F35, the Ghost Annex, Legendary / Secret tiers and SYN20
// are left out, so the denominators are the same whether 0 or every secret is found. PLACEHOLDER weights.
export const COMPLETION = [
  { id: 'achievements', label: 'Achievements', weight: 25 },
  { id: 'championships', label: 'Championships won', weight: 20 },
  { id: 'research', label: 'Research', weight: 15 },
  { id: 'combos', label: 'Combos found', weight: 15 },
  { id: 'parts', label: 'Parts owned', weight: 10 },
  { id: 'facilities', label: 'Facilities built', weight: 10 },
  { id: 'tiers', label: 'Staff tiers reached', weight: 5 },
];
export const VISIBLE_TIERS = ['standard', 'rare', 'elite'];
export const VISIBLE_COMBOS = Array.from({ length: 19 }, (_, i) => `SYN${String(i + 1).padStart(2, '0')}`); // SYN01–SYN19

// --- records (account bests; this team's own values are read live from the slot) -------------------------------------
// better: max | min · key: kept per track / family · prestige: shown in the Prestige section, empty until earned
export const RECORDS = [
  { id: 'titles', label: 'Titles', better: 'max' },
  { id: 'wins', label: 'Race wins', better: 'max' },
  { id: 'podiums', label: 'Podiums', better: 'max' },
  { id: 'poles', label: 'Pole positions', better: 'max' },
  { id: 'fastestLaps', label: 'Fastest laps', better: 'max' },
  { id: 'peakCredits', label: 'Most Credits at once', better: 'max' },
  { id: 'bestFinish', label: 'Best finish', better: 'min', key: 'track' },
  { id: 'topSpeed', label: 'Top speed', better: 'max', key: 'track' },
  { id: 'lapRecord', label: 'Lap record', better: 'min', key: 'track' },
  { id: 'bestQuality', label: 'Best car QUALITY', better: 'max' },
  { id: 'familyWins', label: 'Wins by car family', better: 'max', key: 'family' },
  { id: 'noRetireStreak', label: 'Longest run of races without a retirement', better: 'max' },
  { id: 'personWins', label: 'Most race wins by one person', better: 'max' },
  // prestige record categories (bible §34 / §36): shown, empty until earned
  { id: 'swingWins', label: 'Strategy Swing wins', better: 'max', prestige: true },
  { id: 'giantKillerWins', label: 'Giant Killer wins', better: 'max', prestige: true },
  { id: 'perfectWeekends', label: 'Perfect Weekends', better: 'max', prestige: true },
  { id: 'stintDelta', label: 'Drive Stint best delta', better: 'min', prestige: true },
];
// How a prestige record is read (the same words as the secrets that share its name; DECISIONS.md M26).
export const PRESTIGE_READINGS = {
  giantKillerBelowPct: 12, // a championship race won with a car rated 12%+ below the field average (SEC-BEH-02)
  perfectWeekendChamps: ['C10', 'C11', 'C12'], // pole, fastest lap, the win, setup 100, no fault / spin / damage (SEC-X-03)
};

export const RECORDS_TEXT = {
  title: 'Records',
  subtitle: 'kept on this device',
  completion: (pct) => `Completion ${pct}%`,
  completionNote: 'Visible content only: achievements, championships, research, combos, parts, facilities and staff tiers.',
  thisTeam: 'This team',
  device: 'Best on this device',
  empty: '—',
  prestigeEmpty: 'Not earned yet',
  toastTitle: (name) => `Achievement: ${name}`,
};
