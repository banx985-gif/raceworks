// Events (Milestone 23, bible §31 / §4 / §7): every event is a data template. The engine is core/EventSystem (seeded:
// an event's numbers, its picked person and the outcome of every choice are rolled when it fires and saved) with the
// RACEWORKS flow in src/systems/events.js (cadence, the one-card queue, the Inbox).
//
// A template:
//   id, cls (one of EVENT_CLASSES), size: 'major' (a full card that pauses the calendar, usually with choices) or
//   'minor' (a toast strip that also lands in the Inbox), title / text ({who} {rival} {sponsor} {amount} {node} …
//   filled from the event's params), art (a picture; else the class icon), trigger, effects (applied when it fires),
//   choices [{ id, label, line, effects, default }], cooldownDays (the same template never twice within this many days)
//   trigger:
//     { type: 'roll', when: { … } }   a seeded daily roll (EVENT_RULES.dailyChance) among the templates whose `when`
//                                     holds today: sponsor (a deal on the car), sponsorId, driver / role (someone on the
//                                     team), building (a car being built), cars (finished cars ≥ n), champ (a season on)
//     { type: 'fact', fact }          fired by the game the first time (or each time) that fact becomes true
//     { type: 'calendar', on }        fired by the game on a calendar tick ('month' / 'year')
//   Effects (data; applied once — src/systems/events.js apply): credits (value, or min / max rolled when it fires),
//   reputation, rp, sponsorRep, morale (the event's {who}), teamMorale, driversMorale, flag (a stored flag only), item
//   (Milestone 25b: { source } — one item for the Parts Store), and
//   core's timed { type: 'modifier', key, value, days } (added into the garage's one effect query) and
//   { type: 'chance', p, then, else } (decided when the event fires, so a reload never rerolls it).
//
// PLACEHOLDERS (DECISIONS.md, M23): every number below — the cadence caps, the daily odds, the choice effects.

export const EVENT_CLASSES = [
  { id: 'milestone', name: 'Milestone', icon: 'race_ui_13' },
  { id: 'staff', name: 'Staff', icon: 'race_ui_02' },
  { id: 'car', name: 'Car project', icon: 'race_ui_01' },
  { id: 'sponsor', name: 'Sponsor', icon: 'race_ui_26' },
  { id: 'rival', name: 'Rival', icon: 'race_ui_27' },
  { id: 'race', name: 'Race', icon: 'race_ui_04' },
  { id: 'weather', name: 'Weather', icon: 'race_ui_08' },
  { id: 'financial', name: 'Financial', icon: 'race_ui_05' },
  { id: 'secret', name: 'Rumour', icon: 'race_ui_28' },
  { id: 'item', name: 'Equipment', icon: 'race_ui_02' }, // Milestone 25b: items (the Parts Store; a note shows the store crate)
  { id: 'achievement', name: 'Achievement', icon: 'race_ui_23' }, // Milestone 26: the Training Medal (each achievement shows its own icon)
];

// Cadence (bible §31 "no pop-up stacking"; card M23 placeholders). Rolled events only — a fact or calendar event (a
// milestone, research done, a combo, the month's offers) happens when the game says so, but it still counts towards the
// windows below and still waits its turn in the one-card queue.
export const EVENT_RULES = {
  startDay: 7, // no rolled events in a new team's first week
  // core/EventSystem caps: the minimum days between two rolled events of a size (major = 'choice', minor = 'flavour')
  caps: { choice: 28, flavour: 1 },
  dailyChance: { choice: 0.08, flavour: 0.3 }, // the day's seeded roll for each size, when its cap allows one
  // At most `max` events of a size (rolled or not) within any `days` window — a rolled event waits while it is full.
  windows: { major: { days: 28, max: 1 }, minor: { days: 7, max: 3 } },
  // The minimum days between two rolled events of the same class.
  classGap: { staff: 14, car: 14, sponsor: 28, rival: 28, race: 28, weather: 21, financial: 56 },
  cooldownDays: 56, // a template's own default gap (the "no two of the same template within N days" rule)
  maxQueue: 12, // major cards waiting; past this the lowest folds into the Inbox (its default choice is taken)
  inboxMax: 150,
  toastSec: 3.6,
  toastSecReduced: 3.0, // reduced motion: a shorter strip that fades in place (no slide)
  queueScreens: ['weekend', 'raceIntro', 'race', 'raceResult', 'drill', 'ceremony', 'ngplus'], // nothing shows here; everything waits (Milestone 27: + the ceremony)
};

// The milestone moments (Art List §events). Each fires once, when its own fact comes true (none waits for another).
//   on: the fact (src/systems/events.js MILESTONE_FACTS) · art: the picture on its card
export const MILESTONES = [
  { id: 'RE01', on: 'newTeam', art: 'race_event_01', title: 'Opening the First Garage', text: 'The shutters go up on {team}. One bay, three people and a lot of ambition.' },
  { id: 'RE02', on: 'firstCar', art: 'race_event_02', title: 'First Car Reveal', text: 'The cover comes off your first car. The whole crew stops to look.' },
  { id: 'RE03', on: 'firstRace', art: 'race_event_03', title: 'First Race Start', text: 'Five red lights, then go: {team} is racing for the first time.' },
  { id: 'RE04', on: 'firstWin', art: 'race_event_04', title: 'First Win', text: 'Chequered flag, top step. The garage will never forget this one.' },
  { id: 'RE05', on: 'majorSponsor', art: 'race_event_05', title: 'Major Sponsor Signing', text: 'A big name puts its logo on your car. The paddock is paying attention now.' },
  { id: 'RE06', on: 'nationalChamp', art: 'race_event_06', title: 'National Championship', text: 'Your team enters the national stage. Bigger grids, bigger crowds.' },
  { id: 'RE07', on: 'worldChamp', art: 'race_event_07', title: 'World Championship Arrival', text: 'The World Racing Championship. Every team you ever looked up to is here.' },
  // In the data for Milestone 24+; nothing fires it (its fact never comes true in this build).
  { id: 'RE08', on: 'never', art: 'race_event_08', title: 'Secret Zero Series Reveal', text: 'An invitation with no sender. A series nobody talks about.', secret: true },
];

const roll = (when = {}) => ({ type: 'roll', when });

export const EVENTS = [
  // --- bible §31 examples -----------------------------------------------------------------------------------------
  {
    id: 'EV_PHOTO_DAY', cls: 'sponsor', size: 'minor', trigger: roll({ sponsor: true }), cooldownDays: 84, weight: 3,
    title: 'Sponsor photo day', text: '{sponsor} brought a photographer: the car and the crew look great. Sponsor reputation +3, Reputation +2.',
    effects: [{ type: 'sponsorRep', value: 3 }, { type: 'reputation', value: 2 }],
  },
  {
    id: 'EV_SLUMP', cls: 'staff', size: 'major', trigger: roll({ driver: true }), cooldownDays: 112, weight: 2,
    title: 'Driver confidence slump', text: '{who} has lost confidence after a run of scrappy laps (Morale −8). How do you help?',
    effects: [{ type: 'morale', value: -8 }],
    choices: [
      { id: 'talk', label: 'Pep talk', line: 'Morale +6', effects: [{ type: 'morale', value: 6 }], default: true },
      { id: 'sim', label: 'Extra simulator time', line: '−300 Credits · Morale +14', effects: [{ type: 'credits', value: -300 }, { type: 'morale', value: 14 }] },
      { id: 'space', label: 'Give them space', line: 'Nothing now', effects: [] },
    ],
  },
  {
    id: 'EV_SUPPLIER', cls: 'car', size: 'major', trigger: roll({ building: true }), cooldownDays: 112, weight: 2,
    title: 'Part supplier delay', text: 'A parts delivery for {car} is stuck at the supplier. Pay to rush it, or work around the gap?',
    choices: [
      { id: 'rush', label: 'Pay for express shipping', line: '−{amount} Credits', effects: [{ type: 'credits', min: -600, max: -300, param: 'amount' }] },
      { id: 'wait', label: 'Wait it out', line: 'Mechanics work 20% slower for 7 days', effects: [{ type: 'modifier', key: 'workPct.mechanic', value: -20, days: 7 }], default: true },
    ],
  },
  {
    id: 'EV_RAIN_TEST', cls: 'weather', size: 'minor', trigger: roll({ cars: 1 }), cooldownDays: 112, weight: 2,
    title: 'Surprise rain test', text: 'A shower soaked the test track and your crew kept running: +15 RP of wet-weather data.',
    effects: [{ type: 'rp', value: 15 }],
  },
  {
    id: 'EV_RIVAL', cls: 'rival', size: 'major', trigger: roll({ champ: true }), cooldownDays: 112, weight: 2,
    title: 'Rival challenge', text: '{rival} called you out in the paddock press: "We will finish ahead of them." Answer it?',
    choices: [
      { id: 'accept', label: 'Accept the challenge', line: 'A gamble: Reputation +8 and Morale, or −4', effects: [{ type: 'chance', p: 0.55, then: [{ type: 'reputation', value: 8 }, { type: 'teamMorale', value: 5 }], else: [{ type: 'reputation', value: -4 }] }] },
      { id: 'ignore', label: 'Keep your heads down', line: 'Team Morale −2', effects: [{ type: 'teamMorale', value: -2 }], default: true },
    ],
  },
  {
    id: 'EV_BREAKTHROUGH', cls: 'staff', size: 'minor', trigger: roll({ role: 'mechanic' }), cooldownDays: 84, weight: 2,
    title: 'Mechanic breakthrough', text: '{who} found a quicker way to strip and rebuild a gearbox: mechanics +15% work for 10 days.',
    effects: [{ type: 'modifier', key: 'workPct.mechanic', value: 15, days: 10 }, { type: 'morale', value: 5 }],
  },
  {
    // The BOTWORKS demo hook (bible §29 SPN08, §31): only while BOTWORKS Systems is on the car. It stores its flag when
    // it fires (what SPN08's obligation and later milestones read); nothing reaches the other game.
    id: 'EV_TECH_DEMO', cls: 'sponsor', size: 'major', trigger: roll({ sponsorId: 'SPN08' }), cooldownDays: 168, weight: 4, botworks: true,
    title: 'BOTWORKS technology demonstration', text: 'BOTWORKS Systems want to show their robot pit crew at your garage, with the press watching.',
    effects: [{ type: 'flag', key: 'technology_demo' }],
    choices: [
      { id: 'host', label: 'Host the demo', line: 'Sponsor reputation +6 · Reputation +5', effects: [{ type: 'sponsorRep', value: 6 }, { type: 'reputation', value: 5 }], default: true },
      { id: 'decline', label: 'Not this time', line: 'Nothing changes', effects: [] },
    ],
  },
  {
    // Hidden invitation: a stored flag only (Milestone 24 reads it). A fact, never a roll: no pure-random prestige unlock.
    id: 'EV_INVITATION', cls: 'secret', size: 'minor', trigger: { type: 'fact', fact: 'invitation' }, once: true,
    title: 'An envelope with no name', text: 'Someone left a plain black envelope at the Timing Stand. Inside: a track map you have never seen.',
    effects: [{ type: 'flag', key: 'hiddenInvitation' }],
  },
  // --- more of each class -----------------------------------------------------------------------------------------
  {
    id: 'EV_TRACK_DAY', cls: 'race', size: 'major', trigger: roll({ cars: 1 }), cooldownDays: 140, weight: 2,
    title: 'Track day invitation', text: 'A circuit offers your drivers a private track day. It costs, but they would learn a lot.',
    choices: [
      { id: 'go', label: 'Go (−400 Credits)', line: 'Drivers Morale +8 · +20 RP', effects: [{ type: 'credits', value: -400 }, { type: 'driversMorale', value: 8 }, { type: 'rp', value: 20 }] },
      { id: 'skip', label: 'Skip it', line: 'Nothing changes', effects: [], default: true },
    ],
  },
  {
    id: 'EV_TAX', cls: 'financial', size: 'minor', trigger: roll(), cooldownDays: 224, weight: 1,
    title: 'Tax rebate', text: 'The racing federation refunded part of last year’s fees: +{amount} Credits.',
    effects: [{ type: 'credits', min: 150, max: 400, param: 'amount' }],
  },
  {
    id: 'EV_SPARES', cls: 'car', size: 'minor', trigger: roll({ building: true }), cooldownDays: 112, weight: 1,
    title: 'Spare parts bargain', text: 'A retiring team sold you their spares cheap: +{amount} Credits back on the build.',
    effects: [{ type: 'credits', min: 100, max: 250, param: 'amount' }],
  },
  {
    id: 'EV_DINNER', cls: 'staff', size: 'minor', trigger: roll(), cooldownDays: 84, weight: 2,
    title: 'Team dinner', text: 'Pizza in the garage after a long week. Everyone’s Morale +3.',
    effects: [{ type: 'teamMorale', value: 3 }],
  },
  {
    id: 'EV_GOSSIP', cls: 'rival', size: 'minor', trigger: roll({ champ: true }), cooldownDays: 84, weight: 1,
    title: 'Paddock gossip', text: 'Word is {rival} spent a fortune on their new car. Your crew is not worried.',
    effects: [],
  },
  {
    id: 'EV_FORECAST', cls: 'weather', size: 'minor', trigger: roll({ champ: true }), cooldownDays: 112, weight: 1,
    title: 'Storm season', text: 'Forecasters expect a wet month. A good time to have wet tyres ready.',
    effects: [],
  },
  // --- the game's own moments, folded into the same system (minor: a toast and an Inbox line) ----------------------
  { id: 'EV_RESEARCH', cls: 'car', size: 'minor', trigger: { type: 'fact', fact: 'research' }, cooldownDays: 0, look: 'research', title: 'Research complete!', text: '{node} is done: its parts and upgrades are open now (Research).', effects: [] },
  { id: 'EV_COMBO', cls: 'secret', size: 'minor', trigger: { type: 'fact', fact: 'combo' }, cooldownDays: 0, look: 'combo', title: 'Combo discovered!', text: '{combo}: the recipe is in the Combo Archive (+{rp} RP).', effects: [] },
  { id: 'EV_CLUE', cls: 'secret', size: 'minor', trigger: { type: 'fact', fact: 'clue' }, cooldownDays: 0, title: 'A rumour in the paddock', text: '{clue}', effects: [] },
  { id: 'EV_OFFERS', cls: 'financial', size: 'minor', trigger: { type: 'calendar', on: 'month' }, cooldownDays: 0, title: 'New offers', text: '{offers}', effects: [] },
  { id: 'EV_RESCUE', cls: 'financial', size: 'minor', trigger: { type: 'fact', fact: 'debt' }, cooldownDays: 0, title: 'Rescue job offered', text: 'Cash is below 0. A rescue job is on the contract board (Money → Contracts): it lets you build one car.', effects: [] },
  // Milestone 24: the secret engine's clue stages (a rumour) and a secret found (its exact recipe)
  { id: 'EV_SECRET_CLUE', cls: 'secret', size: 'minor', trigger: { type: 'fact', fact: 'secretClue' }, cooldownDays: 0, title: 'A rumour in the paddock', text: '{clue}', effects: [] },
  // Milestone 25b: a well-wisher's gift — fired by a monthly roll in src/systems/items.js (ITEM_SOURCES.wellWisher), its
  // 'item' effect puts one item in the Parts Store.
  { id: 'EV_WELL_WISHER', cls: 'item', size: 'minor', trigger: { type: 'fact', fact: 'wellWisher' }, cooldownDays: 0, title: 'A gift from a well-wisher', text: 'A long-time fan of {team} dropped off some kit for the crew. It is in the Parts Store.', effects: [{ type: 'item', source: 'wellWisher' }] },
  // Milestone 26: an achievement earned (src/systems/achievements.js → events.announce; the icon is the achievement's own)
  { id: 'EV_ACHIEVEMENT', cls: 'achievement', size: 'minor', trigger: { type: 'fact', fact: 'achievement' }, cooldownDays: 0, title: 'Achievement: {name}', text: '{recipe} · {reward} · Records has every achievement.', effects: [] },
  { id: 'EV_SECRET_FOUND', cls: 'secret', size: 'minor', trigger: { type: 'fact', fact: 'secretFound' }, cooldownDays: 0, title: 'Secret discovered: {name}', text: '{clue}', effects: [] },
  // Milestone 25: the secrets' events (fired by a found secret through events.fireSecret — never rolled; each once a run,
  // or once ever for an account secret). PLACEHOLDER effects (DECISIONS.md, M25).
  {
    id: 'EV_SPECIAL_ARRIVAL', cls: 'staff', size: 'major', trigger: { type: 'fact', fact: 'secretArrival' }, cooldownDays: 0,
    title: 'A special arrival: {name}', text: '{name} ({role}) has heard about {team}. They are on the Recruitment Special tab for {days} days — hire them before they go.',
    effects: [], choices: [{ id: 'look', label: 'Brilliant', line: 'Recruit → Special', effects: [], default: true }, { id: 'later', label: 'Later', line: 'They wait on the Special tab', effects: [] }],
  },
  {
    id: 'EV_UNDERDOG', cls: 'sponsor', size: 'major', trigger: { type: 'fact', fact: 'secretUnderdog' }, cooldownDays: 0,
    title: 'The underdog story', text: 'Everyone saw the slower car win. A sponsor wants the photos: "the team that beat the odds".',
    effects: [], choices: [
      { id: 'shoot', label: 'Do the shoot', line: 'Sponsor reputation +10 · Reputation +10', effects: [{ type: 'sponsorRep', value: 10 }, { type: 'reputation', value: 10 }], default: true },
      { id: 'focus', label: 'Stay focused', line: 'Team Morale +4', effects: [{ type: 'teamMorale', value: 4 }] },
    ],
  },
  {
    id: 'EV_RETRO_WEEKEND', cls: 'race', size: 'major', trigger: { type: 'fact', fact: 'secretRetro' }, cooldownDays: 0,
    title: 'Retro Weekend', text: 'The old cars are back on track for one weekend. Crowds love the Heritage livery — the crew loves the stories.',
    effects: [{ type: 'teamMorale', value: 6 }, { type: 'reputation', value: 20 }, { type: 'flag', key: 'retroWeekend' }], choices: [{ id: 'enjoy', label: 'Enjoy it', line: 'Team Morale +6 · Reputation +20', effects: [], default: true }, { id: 'photos', label: 'Sell the photos', line: '+600 Credits', effects: [{ type: 'credits', value: 600 }] }],
  },
  {
    id: 'EV_NEON_MIDNIGHT', cls: 'race', size: 'major', trigger: { type: 'fact', fact: 'secretNeon' }, cooldownDays: 0,
    title: 'Neon Midnight', text: 'An invitation-only race after midnight at Neon Harbor. Somewhere near the Ghostline transporter, a black cat watches.',
    effects: [{ type: 'reputation', value: 25 }, { type: 'flag', key: 'neonMidnight' }], choices: [{ id: 'race', label: 'Race under the lights', line: 'Reputation +25', effects: [], default: true }, { id: 'watch', label: 'Watch the cat', line: 'Team Morale +3', effects: [{ type: 'teamMorale', value: 3 }] }],
  },
  {
    id: 'EV_BOTWORKS_DEMO', cls: 'sponsor', size: 'major', trigger: { type: 'fact', fact: 'secretBotworks' }, cooldownDays: 0,
    title: 'BOTWORKS: a robot in the pit lane', text: 'BOTWORKS Systems bring a pit-service robot to your garage for a demonstration. It changes a wheel faster than anyone expected.',
    effects: [{ type: 'sponsorRep', value: 10 }, { type: 'flag', key: 'pitRobotCameo' }], choices: [{ id: 'host', label: 'Host the demo', line: 'Sponsor reputation +10', effects: [], default: true }, { id: 'study', label: 'Study the robot', line: '+30 RP', effects: [{ type: 'rp', value: 30 }] }],
  },
  // Milestone 27: the Year-16 ending is coming (src/systems/ending.js fires it at the start of Year 16 and at Month 10).
  {
    id: 'EV_FINAL_YEAR', cls: 'milestone', size: 'major', trigger: { type: 'calendar', on: 'month' }, cooldownDays: 0, art: 'race_event_07',
    title: 'Year 16 is ending', text: '{months} months left. When Year 16 Month 12 ends, the Year-16 ceremony grades your run — then you keep playing the same save.',
    effects: [], choices: [{ id: 'ok', label: 'Got it', line: 'Records shows how the run is going', effects: [], default: true }, { id: 'push', label: 'One last push', line: 'Team Morale +4', effects: [{ type: 'teamMorale', value: 4 }] }],
  },
  { id: 'EV_SEASON', cls: 'race', size: 'minor', trigger: { type: 'calendar', on: 'year' }, cooldownDays: 0, title: 'Year {year} begins', text: 'A new racing year. The calendar, the sponsors and the rivals start again.', effects: [] },
];

// The hidden invitation's fact (a stored flag only — Milestone 24 decides what it opens): 3 championship titles.
export const INVITATION_TITLES = 3;
// RE05 "Major Sponsor Signing": a sponsor on the car while the team is at least this rank.
export const MAJOR_SPONSOR_RANK = 'C';
