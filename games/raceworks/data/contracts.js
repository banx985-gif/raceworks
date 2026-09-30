// RACEWORKS development contracts (Milestone 21, bible §29 "Development contracts"): the eight types. Plain data only;
// src/systems/contracts.js generates them and src/systems/economy.js runs them on core/ContractSystem. Three offers
// refresh on day 1 of each month (an offer not taken goes at the next month start); at most 2 active.
// Every number here is a PLACEHOLDER (docs/DECISIONS.md, M21).
//
// Each type:
//   needs      what the team must have before it is offered (the generator checks it — never an impossible contract):
//                pitBay (a Pit Bay to build in) · car (a finished car in the Car Garage) · sponsor (a sponsor deal running)
//                · facility (built) · part (an open part of this slot beyond the Start one, legal on an open class)
//                · tyre (an open compound other than Medium) · training (the Driver Simulator's training is open)
//   goal       what completes it:
//                build   a car finished after accepting (Quality ≥ target, or fitted with the chosen part)
//                races   race weekends raced to the flag that match `where` (race facts, data/sponsors.js), `count` of them
//                drills  driver drills recorded with a medal, `count` of them
//   deadlineDays  days from accepting
//   credits / rp  pay (× the rank's money factor below) · sponsorRep  sponsor reputation (data/sponsors.js)
//   partEvent  + part-event progress for the chosen part (stored for the part events) · fact  a secret fact flag (stored)
//   weight     how often it is drawn among the types the team can take now
export const CONTRACT_TYPES = [
  {
    type: 'supplier_test', name: 'Supplier test', title: 'Supplier test build', weight: 3,
    client: ['Pine Ridge Motor Club', 'Harlow Karting Academy', 'Westfall Club Racing', 'Northgate Track Days', 'Copper Vale Racing School'],
    needs: { pitBay: true },
    // Milestone 5's Club Hatch build, unchanged: a Club Hatch of Quality 30–36, finished after accepting.
    goal: { kind: 'build', classId: 'clubHatch', qualityMin: 30, qualityMax: 36 },
    deadlineDays: 84,
    credits: { base: 1800, perQuality: 30 }, rp: { base: 15, perQuality: 0.5 }, sponsorRep: 5,
  },
  {
    type: 'reliability_run', name: 'Reliability run', title: 'Reliability run', weight: 2,
    client: ['Kingsway Components', 'Lowfield Parts Co.', 'Harrow Bearings'],
    needs: { car: true },
    goal: { kind: 'races', count: 2, where: { finished: true, mechanical: false }, text: 'race weekends finished with no mechanical failure' },
    deadlineDays: 84,
    credits: { base: 2600 }, rp: { base: 20 }, sponsorRep: 8,
  },
  {
    type: 'aero_validation', name: 'Aero validation', title: 'Aero validation build', weight: 2,
    client: ['Windline Labs', 'Carver Aero Works', 'Slipstream Composites'],
    needs: { pitBay: true, part: 'AE' },
    goal: { kind: 'build', part: 'AE' },
    deadlineDays: 84,
    credits: { base: 2400, perTier: 400 }, rp: { base: 25, perTier: 5 }, sponsorRep: 10, partEvent: 1,
  },
  {
    type: 'tyre_evaluation', name: 'Tyre evaluation', title: 'Tyre evaluation', weight: 2,
    client: ['Brightwell Tyres', 'Gripline Rubber', 'Marlow Compounds'],
    needs: { car: true, tyre: true },
    goal: { kind: 'races', count: 2, tyreStart: true, where: { finished: true }, text: 'race weekends finished, starting on' },
    deadlineDays: 84,
    credits: { base: 2200 }, rp: { base: 15 }, sponsorRep: 8,
  },
  {
    type: 'efficiency_target', name: 'Fuel / energy efficiency target', title: 'Efficiency target run', weight: 2,
    client: ['Greenmile Fuels', 'Ampere Grid', 'Northgate Energy'],
    needs: { car: true },
    goal: { kind: 'races', count: 1, where: { finished: true, fuelStart: 'lean', fuelEnd: 'lean' }, text: 'race weekend finished on the Lean fuel / energy target, start to flag' },
    deadlineDays: 56,
    credits: { base: 1800 }, rp: { base: 20 }, sponsorRep: 6,
  },
  {
    type: 'driver_academy_test', name: 'Driver academy test', title: 'Driver academy test', weight: 1,
    client: ['Harlow Karting Academy', 'Apex Driver School', 'Copper Vale Racing School'],
    needs: { training: true },
    goal: { kind: 'drills', count: 2, text: 'driver drills with a medal' },
    deadlineDays: 56,
    credits: { base: 1500 }, rp: { base: 15 }, sponsorRep: 5,
  },
  {
    type: 'sponsor_demo', name: 'Sponsor demo', title: 'Sponsor demo race', weight: 1,
    client: ['Sponsor hospitality', 'Partner showcase', 'Fan day promoters'],
    needs: { car: true, sponsor: true },
    goal: { kind: 'races', count: 1, where: { finished: true, sponsored: true, pos: { lt: 9 } }, text: 'race weekend finished in the top 8 with a sponsor on the car' },
    deadlineDays: 56,
    credits: { base: 2000 }, rp: { base: 10 }, sponsorRep: 15,
  },
  {
    // bible §29 "technology prototype" — the generated `technology_demo` contract BOTWORKS Systems (SPN08) asks for.
    type: 'technology_demo', name: 'Technology prototype', title: 'Technology demo build', weight: 2,
    client: ['BOTWORKS Systems', 'Circuit Logic', 'Vector Microsystems'],
    needs: { pitBay: true, part: 'EL' },
    goal: { kind: 'build', part: 'EL' },
    deadlineDays: 84,
    credits: { base: 2800, perTier: 450 }, rp: { base: 35, perTier: 6 }, sponsorRep: 12, partEvent: 1, fact: 'technologyDemos',
  },
];
export const contractType = (type) => CONTRACT_TYPES.find((t) => t.type === type) ?? null;

// The contract pay grows with the team's rank (× this on Credits and RP). PLACEHOLDER.
export const CONTRACT_RANK_X = { E: 1, D: 1.2, C: 1.5, B: 1.9, A: 2.4, S: 3 };

// A failed contract (deadline missed or given up) costs this much Reputation — never below the rank's floor.
export const CONTRACT_FAIL_REPUTATION = 10;

// How many offers and how many at once (bible §29).
export const CONTRACT_RULES = { offersPerMonth: 3, maxActive: 2 };
