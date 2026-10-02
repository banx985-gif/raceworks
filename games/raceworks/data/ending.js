// The Year-16 ending (Milestone 27, bible §4.1, §3 "Winning", §7 Ending Ceremony / New Game+ Setup, §30 Prestige Tokens,
// §32). Plain data only: src/systems/ending.js runs it on core/CampaignEnding, core/GradeEngine and core/RunArchive.
//
// PLACEHOLDERS (DECISIONS.md, M27): every weight, "full" value, band, token count and highlight rule below.
//
// The grade: 1,000 points over the seven §3 "Winning" areas. Each area's parts read plain facts about the run (what the
// game already keeps — src/systems/ending.js facts()); a part scores points × value ÷ full (kept to 0…points).
// Secrets never count: no part reads a secret, a secret part, a secret facility, C11 / C12 or a secret family.
const part = (fact, label, full, points, floor = 0) => ({ fact, label, full, points, floor });

export const ENDING = {
  endYear: 16, // the ending fires as Year 16 Month 12's last day closes (bible §4.1)
  warnMonths: [1, 10], // the "Year 16 is ending" card: the start of Year 16 and Month 10
  total: 1000,
  categories: [
    { id: 'racing', name: 'Racing success', max: 250, parts: [
      part('titles', 'Championship titles (C01–C10)', 10, 100),
      part('topTitleTier', 'Highest title tier (club · national · world)', 3, 50),
      part('wins', 'Race wins', 60, 60),
      part('podiums', 'Podiums', 120, 40),
    ] },
    { id: 'engineering', name: 'Car engineering', max: 150, parts: [
      part('bestQuality', 'Best car QUALITY', 100, 60),
      part('families', 'Car families built', 10, 50),
      part('carsBuilt', 'Cars built', 30, 40),
    ] },
    { id: 'staff', name: 'Staff development', max: 125, parts: [
      part('tiersReached', 'Staff tiers reached (Standard · Rare · Elite)', 3, 45),
      part('avgLevel', 'Average staff level', 20, 40, 1),
      part('staffCount', 'People on the team', 20, 25),
      part('founderStayed', 'The founder stayed to the end', 1, 15),
    ] },
    { id: 'research', name: 'Research', max: 125, parts: [
      part('researchDone', 'Research nodes finished (of 36)', 36, 100),
      part('partsDiscovered', 'Parts discovered', 38, 25),
    ] },
    { id: 'finance', name: 'Finances & sponsors', max: 125, parts: [
      part('netWorth', 'Net worth (Credits + the garage)', 400000, 60),
      part('sponsorDeals', 'Sponsor deals met (renewals earned)', 10, 35),
      part('solvent', 'Solvent at the end (no Emergency Credit)', 1, 30),
    ] },
    { id: 'facilities', name: 'Facility growth', max: 100, parts: [
      part('facilityLevels', 'Facilities × levels', 60, 70),
      part('wingsOpen', 'Garage wings open', 4, 30),
    ] },
    { id: 'records', name: 'Records & discovery', max: 125, parts: [
      part('achievements', 'Achievements earned', 30, 75),
      part('combos', 'Combos discovered (visible)', 19, 50),
    ] },
  ],
  // The letter on top (ascending by min; core GradeEngine bands).
  bands: [{ id: 'D', min: 0 }, { id: 'C', min: 450 }, { id: 'B', min: 600 }, { id: 'A', min: 750 }, { id: 'S', min: 900 }],
  // Prestige Tokens by grade (bible §30: earned from endings, never purchasable), once per run, on the account.
  tokens: { D: 1, C: 2, B: 3, A: 4, S: 5 },
  archiveMax: 20, // the Hall of Runs keeps the newest 20 finished runs
  highlights: { min: 6, max: 10, titles: 4 }, // 6–10 cards; at most 4 title cards (the highest tiers first)
  c10: 'C10', // the World Racing Championship: its title opens the ceremony with the World Crown
  art: {
    crown: 'race_event_07', // World Championship Arrival
    trophy: 'race_reward_09', // the World Trophy
    seasonEnd: 'race_event_01', // the garage — the "season's end" opening
    tiers: { club: 'race_reward_07', national: 'race_reward_08', world: 'race_reward_09' },
  },
};

// The ceremony's words (bible §32: short cards, no long cutscenes).
export const ENDING_TEXT = {
  warnTitle: 'Year 16 is ending',
  warn: (months) => `${months} month${months === 1 ? '' : 's'} left. When Year 16 Month 12 ends, the Year-16 ceremony grades your run — then you keep playing the same save.`,
  warnOk: 'Got it',
  crownTitle: 'World Champions',
  crown: (team) => `${team} wears the World Crown. Every team you ever looked up to is watching you lift the World Trophy.`,
  seasonTitle: 'Season’s end',
  season: (team) => `Sixteen years since the shutters first went up. ${team} gathers in the garage for one last look back.`,
  gradeTitle: 'Your grade',
  areasTitle: 'Seven areas',
  shelfTitle: 'The trophy shelf',
  shelfEmpty: 'No trophies yet — the shelf is ready for the next run.',
  carsTitle: 'The cars, by family',
  tokensTitle: 'Prestige Tokens',
  tokens: (n, total) => `+${n} Prestige Token${n === 1 ? '' : 's'} for this run (${total} on this device). Kept for New Game+, never bought.`,
  continue: 'Continue to Year 17',
  ngplus: 'Start New Game+',
  tapNext: 'Tap to continue',
  postgame: 'Postgame',
  hall: 'Hall of Runs',
  hallEmpty: 'Finished runs land here after their Year-16 ceremony.',
  ngTitle: 'New Game+ Setup',
  ngBody: 'New Game+ starts a fresh team that carries some of this run forward — Legacy Staff, blueprint memory and optional challenges. It is coming in the next update. Nothing has been changed or deleted: your finished run carries on in Year 17.',
  ngBack: 'Back',
};
