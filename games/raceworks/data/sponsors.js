// RACEWORKS sponsors (Milestone 21, bible §29). Plain data only; src/systems/sponsors.js runs them.
// The eight rows are exactly §29 (id, name, theme, perk words, obligation words — tests/raceworks/m21.test.mjs reads the
// bible's table and compares). Everything else here is a PLACEHOLDER (docs/DECISIONS.md, M21): stipends, race / result
// bonuses, the completion bonus, renewal terms and the offer rules.
//
// Each sponsor's obligation is a machine-exact DATA predicate over counters the deal keeps — never free text:
//   counters: { name: { on, where?, sum? } }
//     on     the signal that counts:  'race'      a race weekend you raced to the end (race facts below)
//                                     'roundDue'  a round of your championship came due during the deal
//                                     'car'       a car project finished (car facts below)
//                                     'dealMonth' one of the deal's six 28-day months ended (month facts below)
//                                     'contract'  a development contract completed (contract facts below)
//     where  the facts it must match (all of them):  key: value (equal) · key: { gte: n } · key: { lt: n }
//            · key: { in: [..] } (a value in the list) · key: { any: [..] } (a list fact sharing one)
//     sum    add this fact instead of 1 (e.g. clean pit stops in a race)
//   test: the predicate over the counters:
//     { gte: [counter, n] } · { lt: [counter, n] } · { eq: [counter, counter] } · { ratioGte: [num, den, x] }
//     (num / max(1, den) >= x) · { all: [..] } · { any: [..] }
//   when: 'any'  met as soon as the test holds (it can only grow) · 'end'  judged when the deal ends (a ratio can fall)
//   goalText: the obligation in plain words for the Sponsor sheet (obligationText is the bible’s exact cell)
//   progress: the Sponsor sheet's live lines: { counter, of, text } → "2 / 3 races finished with telemetry on"
//
// Race facts (src/systems/sponsors.js raceFacts): champ (a championship round) · champId · champClasses (the class tags
// it takes) · finished (you took the flag: not retired) · pos · tyreLife (100 − tyre wear % at the flag) · tyreRetire
// (retired for a tyre cause: fails in TYRE_FAILS) · telemetry (the race had telemetry: the car carries the EL04
// Telemetry Suite or the garage has the F22 Telemetry Room, fixed when the race was made) · eff (your car's EFF in the
// race, perks included) · effAtTarget (eff >= EFF_TARGETS[champId]) · cleanStops (pit stops with pitError = false: not
// forced by a fault and not outside the window) · sponsored (a sponsor was on the car) · setupTyre · fuelStart / fuelEnd.
// Car facts: aeroShare (the Chassis & Aero phase's share of the project's development gain, 0–1) · classTag · quality.
// Month facts: net (Credits in − out over that deal month, from the ledger) · netPositive.
// Contract facts: type (the §29 contract type).

// Slots by rank (bible §29).
export const SPONSOR_SLOTS = { E: 1, D: 1, C: 2, B: 2, A: 3, S: 3 };

// Deals last exactly 6 game months (bible §29): 6 × 28 days.
export const DEAL_DAYS = 168;
export const DEAL_MONTH_DAYS = 28;

// A retirement for a tyre cause. The race sim has none yet (spins never retire; retirements are mechanical or crash
// damage), so NovaTyre's "no tyre-caused retirement" can't fail today — the fact is kept for when one exists.
export const TYRE_FAILS = ['tyre', 'puncture'];

// The efficiency target of a championship's events (VoltCell): your car's EFF must reach it. PLACEHOLDER: 90% of the
// championship's rival car level (data/championships.js CHAMP_BANDS), rounded to 5.
export const EFF_TARGET_SHARE = 0.9;

// The championships whose events VoltCell's obligation needs (bible §29: "GT/Endurance/Prototype championship") — any
// championship that takes one of these class tags.
export const VOLTCELL_TAGS = ['gt', 'endurance', 'prototype'];

// Money (PLACEHOLDERS).
//   stipend        Credits a month at Rank E, paid on day 1 of each month with the salaries (× rankX below)
//   bonus          the race / result bonus: paid once per race that matches `when` (race facts), × rankX
//   completion     paid once when the obligation is met: this many months of the deal's stipend
//   renewBumpPct   a renewal after a met deal: + this % on the terms
//   retryCutPct    after a missed obligation the sponsor offers again at − this % on the terms
//   termsMin / termsMax  the terms multiplier stays inside these
export const SPONSOR_BALANCE = {
  rankX: { E: 1, D: 1.25, C: 1.6, B: 2.1, A: 2.8, S: 3.6 },
  completionMonths: 2,
  renewBumpPct: 5,
  retryCutPct: 15,
  termsMin: 0.5,
  termsMax: 2,
  // Sponsor reputation (development contracts pay it, bible §29): + this % on every stipend per point, capped
  reputationPctPerPoint: 0.1,
  reputationPctMax: 25,
  // The monthly generator: offers on day 1 of each month; one not taken goes at the next month start. The Sponsor Wall
  // (F15, unlock.sponsorPortfolio) adds offers to the board. A renewal / retry offer made when a deal ends waits
  // offerDays before it goes.
  offersPerMonth: 2,
  portfolioOffers: 1,
  offerDays: 28,
};

// Perk effect keys (all through the one effect query, team.facilities.bonus(key)):
//   sponsorStipendPct  +% on every sponsor stipend        tyreWearPct   ±% race tyre wear (tyre prep)
//   wetTyreCostPct     ±% on wet tyre costs (STORED: tyres cost nothing yet)
//   setupKnowledge     + Setup Knowledge after practice   raceEFF      + EFF for your car in race weekends
//   researchSpeedPct.<branch>  +% research speed         pitServicePct ±% pit service time
//   prizePct           +% race prize money                 eventAccess.botworks  SPN08's special event (STORED flag)
export const SPONSORS = [
  {
    id: 'SPN01', name: 'Bolt Cola', theme: 'Cash', logo: 'sponsor_logo_spn01',
    perkText: 'Monthly stipend +8%',
    obligationText: '`finishedEnteredRaces / max(1,enteredRaces) >= 0.70` AND at least 3 races entered during deal; if fewer than 3 eligible rounds existed, finish all eligible entered rounds',
    goalText: 'Finish 70% of the championship races you enter, with 3+ entered (under 3 rounds in the deal: finish every one you enter).',
    perks: [{ key: 'sponsorStipendPct', value: 8 }],
    stipend: 1000,
    bonus: { text: 'per championship race finished', when: { champ: true, finished: true }, credits: 200 },
    obligation: {
      counters: {
        entered: { on: 'race', where: { champ: true } },
        finished: { on: 'race', where: { champ: true, finished: true } },
        roundsDue: { on: 'roundDue' },
      },
      test: {
        any: [
          { all: [{ gte: ['roundsDue', 3] }, { gte: ['entered', 3] }, { ratioGte: ['finished', 'entered', 0.7] }] },
          { all: [{ lt: ['roundsDue', 3] }, { gte: ['entered', 1] }, { eq: ['finished', 'entered'] }] },
        ],
      },
      when: 'end',
      progress: [
        { counter: 'entered', of: 3, text: 'championship races entered' },
        { counter: 'finished', ofCounter: 'entered', text: 'of them finished (70% needed)' },
        { counter: 'roundsDue', text: 'Championship rounds in the deal so far (under 3: finish every one you enter)' },
      ],
    },
  },
  {
    id: 'SPN02', name: 'NovaTyre', theme: 'Tyres', logo: 'sponsor_logo_spn02',
    perkText: 'Tyre prep +5%; wet tyre cost -10%',
    obligationText: 'Finish 2 championship races during deal with tyre life >=10% and no tyre-caused retirement',
    goalText: 'Finish 2 championship races with 10%+ tyre life left and no tyre-caused retirement.',
    perks: [{ key: 'tyreWearPct', value: -5 }, { key: 'wetTyreCostPct', value: -10 }],
    stipend: 800,
    bonus: { text: 'per race finished with tyre life 10%+', when: { finished: true, tyreLife: { gte: 10 } }, credits: 150 },
    obligation: {
      counters: { good: { on: 'race', where: { champ: true, finished: true, tyreLife: { gte: 10 }, tyreRetire: false } } },
      test: { gte: ['good', 2] },
      when: 'any',
      progress: [{ counter: 'good', of: 2, text: 'championship races finished with tyre life 10%+' }],
    },
  },
  {
    id: 'SPN03', name: 'HexaCom', theme: 'Telemetry', logo: 'sponsor_logo_spn03',
    perkText: 'Practice Setup Knowledge +8',
    obligationText: 'Start and finish 3 championship races with `telemetryActive=true`',
    goalText: 'Start and finish 3 championship races with telemetry on (the Telemetry Suite fitted or a Telemetry Room).',
    perks: [{ key: 'setupKnowledge', value: 8 }],
    stipend: 850,
    bonus: { text: 'per top-5 finish', when: { finished: true, pos: { lt: 6 } }, credits: 300 },
    // Telemetry needs Electronics 3 research (the Telemetry Suite part / the Telemetry Room): offered once it's done.
    needs: { research: 'ELE3' },
    obligation: {
      counters: { tel: { on: 'race', where: { champ: true, finished: true, telemetry: true } } },
      test: { gte: ['tel', 3] },
      when: 'any',
      progress: [{ counter: 'tel', of: 3, text: 'championship races finished with telemetry on' }],
    },
  },
  {
    id: 'SPN04', name: 'VoltCell', theme: 'Efficiency', logo: 'sponsor_logo_spn04',
    perkText: 'EFF +6 during sponsored races',
    obligationText: 'Complete 1 GT/Endurance/Prototype championship race with `car.EFF >= eventEfficiencyTarget`; sponsor cannot offer before such events are unlocked',
    goalText: 'Finish 1 GT / Endurance / Prototype championship race with your car at the event’s EFF target.',
    perks: [{ key: 'raceEFF', value: 6 }],
    stipend: 1200,
    bonus: { text: 'per championship race finished', when: { champ: true, finished: true }, credits: 300 },
    needs: { champTags: VOLTCELL_TAGS }, // a championship taking GT / Endurance / Prototype cars is open
    obligation: {
      counters: { eff: { on: 'race', where: { champ: true, finished: true, champClasses: { any: VOLTCELL_TAGS }, effAtTarget: true } } },
      test: { gte: ['eff', 1] },
      when: 'any',
      progress: [{ counter: 'eff', of: 1, text: 'GT / Endurance / Prototype championship races finished at the EFF target' }],
    },
  },
  {
    id: 'SPN05', name: 'AeroForge', theme: 'Aero', logo: 'sponsor_logo_spn05',
    perkText: 'Aero research +8%',
    obligationText: 'Complete 1 car project during deal with Aero phase contribution >=25% of total project development gain',
    goalText: 'Finish 1 car project with 25%+ of its development from the Chassis & Aero phase.',
    perks: [{ key: 'researchSpeedPct.AER', value: 8 }],
    stipend: 900,
    bonus: { text: 'per podium', when: { finished: true, pos: { lt: 4 } }, credits: 500 },
    obligation: {
      counters: { aero: { on: 'car', where: { aeroShare: { gte: 0.25 } } } },
      test: { gte: ['aero', 1] },
      when: 'any',
      progress: [{ counter: 'aero', of: 1, text: 'cars finished with 25%+ of their development from Chassis & Aero' }],
    },
  },
  {
    id: 'SPN06', name: 'IronPeak Tools', theme: 'Pit', logo: 'sponsor_logo_spn06',
    perkText: 'Pit service time -5%',
    obligationText: 'Complete 3 pit stops during deal with `pitError=false`',
    goalText: 'Make 3 pit stops without an error (not forced by a fault, not outside the window).',
    perks: [{ key: 'pitServicePct', value: -5 }],
    stipend: 750,
    bonus: { text: 'per race finished with a clean stop', when: { finished: true, cleanStops: { gte: 1 } }, credits: 200 },
    obligation: {
      counters: { clean: { on: 'race', sum: 'cleanStops' } },
      test: { gte: ['clean', 3] },
      when: 'any',
      progress: [{ counter: 'clean', of: 3, text: 'pit stops without an error' }],
    },
  },
  {
    id: 'SPN07', name: 'Crown Finance', theme: 'Prize', logo: 'sponsor_logo_spn07',
    perkText: 'Prize money +12%',
    obligationText: '`monthlyNetCashflow > 0` in at least 4 of the 6 deal months',
    goalText: 'A positive net cashflow in 4 of the deal’s 6 months.',
    perks: [{ key: 'prizePct', value: 12 }],
    stipend: 950,
    bonus: { text: 'per win', when: { finished: true, pos: 1 }, credits: 1000 },
    obligation: {
      counters: { positive: { on: 'dealMonth', where: { netPositive: true } }, months: { on: 'dealMonth' } },
      test: { gte: ['positive', 4] },
      when: 'any',
      progress: [
        { counter: 'positive', of: 4, text: 'deal months with a positive net cashflow' },
        { counter: 'months', of: 6, text: 'deal months ended' },
      ],
    },
  },
  {
    id: 'SPN08', name: 'BOTWORKS Systems', theme: 'Tech', logo: 'sponsor_logo_spn08',
    perkText: 'Electronics research +10%; special event access',
    obligationText: 'Complete 1 generated `technology_demo` contract before deal expiry',
    goalText: 'Complete 1 technology demo contract.',
    perks: [{ key: 'researchSpeedPct.ELE', value: 10 }, { key: 'eventAccess.botworks', value: 1 }],
    stipend: 1100,
    bonus: { text: 'per podium', when: { finished: true, pos: { lt: 4 } }, credits: 600 },
    needs: { contractType: 'technology_demo' }, // offered only while a technology_demo contract can be generated
    specialEvent: 'botworksSpecialEvent', // stored as a flag when signed; the event itself is a later milestone
    obligation: {
      counters: { demo: { on: 'contract', where: { type: 'technology_demo' } } },
      test: { gte: ['demo', 1] },
      when: 'any',
      progress: [{ counter: 'demo', of: 1, text: 'technology_demo contracts completed' }],
    },
  },
];
export const sponsorById = (id) => SPONSORS.find((s) => s.id === id) ?? null;
