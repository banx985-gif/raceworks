// New Game+ 1–3 (Milestone 28, bible §37, §36.9, §36.7 SEC-CAR-04; save-slot spec §8). Plain data only: the rules run on
// core/NgPlusSystem through src/systems/ngplus.js.
//
// PLACEHOLDERS (DECISIONS.md, M28): the applicant tier bump, the challenge modifier set and its numbers, the facility
// discount, the clue bump, what Prestige Tokens do.

export const NGPLUS = {
  maxLevel: 3, // NG+3 is the last content level: a run started from an NG+3 run is NG+3 again
  // Every field of a finished run, named on purpose (core NgPlusSystem refuses a snapshot with an unnamed one).
  fields: {
    // Account-wide (bible §37.2): already on the account record — the new run reads the same blocks; nothing is copied.
    always: [
      { id: 'combos', label: 'Discovered combos' },
      { id: 'secretRecipes', label: 'Secret recipes' },
      { id: 'achievements', label: 'Achievements' },
      { id: 'records', label: 'Records' },
      { id: 'prestigeTokens', label: 'Prestige Tokens' },
      { id: 'mascots', label: 'Cosmetics and mascots' },
      { id: 'staffIdentities', label: 'Discovered staff identities' },
      { id: 'drillMedals', label: 'Manual training medals' },
    ],
    // The player picks (bible §37.2 by level).
    chosen: [
      { id: 'legacyStaff', label: 'Legacy Staff' },
      { id: 'blueprints', label: 'Legacy Car Blueprints' },
      { id: 'facilityBlueprint', label: 'Discounted facility blueprint' },
    ],
    // Reset (bible §37.3, and everything else a run owns): the new team is built again from the M4b new-game flow.
    reset: [
      { id: 'credits', label: 'Credits' },
      { id: 'rp', label: 'Research Points (the conversion bonus comes on top)' },
      { id: 'racingTokens', label: 'Racing Tokens (back to the starting 25)' },
      { id: 'reputation', label: 'Reputation and rank' },
      { id: 'championships', label: 'Championship progression and trophies' },
      { id: 'sponsors', label: 'Active sponsors' },
      { id: 'contracts', label: 'Development contracts' },
      { id: 'facilities', label: 'Facility layout' },
      { id: 'staff', label: 'Ordinary staff contracts' },
      { id: 'cars', label: 'Cars' },
      { id: 'research', label: 'Visible research completion' },
      { id: 'calendar', label: 'The calendar (Year 1, Month 1)' },
      { id: 'items', label: 'Items and the Parts Store' },
      { id: 'events', label: 'Events and the Inbox' },
      { id: 'runSecrets', label: 'This run’s secret progress (run-scope secrets can be found again)' },
      { id: 'ending', label: 'The Year-16 ending (a new one to reach)' },
    ],
  },
  legacy: { picksByLevel: [0, 1, 2, 3] }, // bible §37.2: 1 / 2 / 3 Legacy Staff
  blueprints: { byLevel: [0, 1, 1, 2] }, // bible §37.2: 1 / 1 / 2 Legacy Car Blueprint recipes
  researchPctByLevel: [0, 15, 25, 35], // bible §37.2: of the RP the finished run's completed visible research cost
  rivalPctByLevel: [0, 8, 14, 20], // bible §37.4: rival development (the M20 championship bands' car stats)
  // bible §37.2 NG+2 "one normal facility blueprint starts discounted": from NG+2 (NG+3 keeps it), PLACEHOLDER 50 %, its
  // first purchase only. Normal = not secret and not already in the starting garage.
  facility: { fromLevel: 2, pct: 50 },
  // bible §37.4 "stronger starting applicant variety" — PLACEHOLDER: on an NG+ run each recruitment board also draws one
  // tier higher (a channel's Standard weight is added to Rare, its Rare weight to Elite), still behind the rank gates
  // (Elite from Rank B).
  applicants: { tierUp: { standard: 'rare', rare: 'elite' } },
  // bible §37.4 "stronger secret clues" — the M24 clue stage of a rule that already has progress (stage 1+) shows one
  // higher on an NG+ run (never past 3 without finding it).
  clueBonus: 1,
  // bible §37.4 "optional challenge modifiers" — PLACEHOLDER set. Flags on the run: any number, all optional; they change
  // the run's numbers only. No secret, achievement, grade part or reward reads them (bible: never gate exclusive rewards).
  modifiers: [
    { id: 'halfCredits', name: 'Half starting Credits', text: 'Start with 12,500 Credits instead of 25,000.', creditsPct: 50 },
    { id: 'noAutoYear1', name: 'No Auto Strategy in Year 1', text: 'Your race car can’t be left on AUTO until Year 2 — every call is yours.', untilYear: 2 },
    { id: 'rivalsPlus', name: 'Rivals +10 % extra', text: 'Rival cars in championships are 10 % stronger on top of the New Game+ level.', rivalPct: 10 },
    { id: 'noEmergency', name: 'No Emergency Credit', text: 'You can’t spend below 0 Credits (bills can still take you under).' },
  ],
};

// What the New Game+ Setup screen says (bible §7: carry-overs, Legacy Staff, blueprint memory, optional challenges).
export const NGPLUS_TEXT = {
  title: 'New Game+ Setup',
  level: (n) => `New Game+ ${n}`,
  from: (team, grade, slot) => `From ${team} · Grade ${grade ?? '—'} · slot ${slot}`,
  into: (n, replacing) => `The new team goes in slot ${n}${replacing ? ` — ${replacing} will be deleted` : ''}.`,
  carriedTitle: 'Kept automatically (on this device)',
  carried: ['Discovered combos', 'Secret recipes', 'Achievements', 'Records', 'Prestige Tokens', 'Mascots and cosmetics', 'Staff you have met', 'Training medals'],
  tokens: (n) => `Prestige Tokens: ${n} — earned from endings and hard secrets, never bought. Nothing spends them yet.`,
  legacyTitle: (k) => `Legacy Staff · pick up to ${k}`,
  legacyLine: 'They keep their stats, level, traits and career story and wear a Legacy tag.',
  blueprintTitle: (k) => `Legacy Car Blueprints · pick up to ${k}`,
  blueprintLine: 'The exact car can be built again once its class and parts are open in the new run.',
  noCars: 'This run finished no cars — there is nothing to remember.',
  facilityTitle: (pct) => `One facility blueprint · ${pct}% off its first build`,
  research: (pct, rp) => `Research memory: ${pct}% of the research you finished comes back as +${rp.toLocaleString('en-US')} RP at the start.`,
  modifiersTitle: 'Optional challenges',
  modifiersLine: 'Only for the challenge: they never lock a reward, secret or achievement.',
  resetTitle: 'Starts again',
  reset: 'Credits, rank, championships, sponsors, the garage layout, ordinary staff, cars and research. Rivals develop faster:',
  rivals: (pct) => `rival cars +${pct}%`,
  next: 'Next: your new team',
  back: 'Back',
  legacyTag: 'Legacy',
  stub: 'Finish a run first: New Game+ starts after the Year-16 ending.',
};
