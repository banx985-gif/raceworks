// Help (Milestone 29, bible §7: "a Help button on every screen opens that screen's one-page help"): plain data for the
// shared Help archive (core/ui/HelpArchive). One page per screen in bible §7 (plus the Menu, Inbox, items, slots and
// Hall of Runs), each with its list icon, a picture where one exists (existing art — never text baked into it) and a few
// short paragraphs in plain words. All the pages are also listed from Settings → Help and the main menu's Help.
//   HELP_TOPICS   [{ id, title, icon, art, paras }]
//   HELP_FOR      router screen name or sheet kind → its page (main.js helpTopicFor reads it; a facility id → its role)
//   HELP_TEXT     the archive's own words

const page = (id, title, icon, art, paras) => ({ id, title, icon, art, paras });

export const HELP_TOPICS = [
  page('start', 'Starting out', 'race_brand_02', 'race_brand_02', [
    'Continue opens the team you played last. New Game starts a new team in an empty save slot; Load shows all four slots.',
    'New Game+ starts a fresh run from a team that has reached the Year-16 ending, carrying some people and cars over.',
    'Records shows what this device has earned. Settings, Help and Credits / Legal are here too, before any team is open.',
  ]),
  page('slots', 'Save slots', 'race_ui_13', null, [
    'You can run four teams at once, one in each slot. Each card shows the team, its year and rank, and how long you have played.',
    'Play opens a team. Delete asks first, then removes that team for good. A full slot is only replaced after you say yes.',
    'Your team saves by itself every game day and whenever something changes.',
  ]),
  page('setup', 'Team setup', 'race_ui_02', 'race_brand_02', [
    'Name your team and your Team Principal (or tap Random), pick one of six team colours and one of five founders.',
    'Colours and names never change how good your team is. The founder brings their own small perk and starts at the garage with you.',
    'Tap START TEAM when you are happy. You can always start another team in a different slot.',
  ]),
  page('garage', 'Your garage', 'race_ui_01', 'facility_f02', [
    'The garage is your home. Drag to look around, pinch to zoom, and double-tap a station to centre it.',
    'Tap a station or a person to open their sheet. Long-press empty floor for Build Mode.',
    'The bottom bar opens the same sheets: Build, Staff, Research, Compete, Money and the Menu. The top bar shows the date, Credits, Racing Tokens and your rank, the speed (Pause, 1×, 2×, 4×), the Inbox and Help.',
    'A line under the date says what to do next. Tap it to go there.',
  ]),
  page('menu', 'The Menu', 'race_ui_menu', null, [
    'The Menu button lists every screen in plain words. A row opens the very same sheet or screen as tapping the art.',
    'Greyed rows say why they are locked. You can hide the Menu button in Settings and get around by tapping the art only.',
  ]),
  page('build', 'Build', 'race_ui_01', 'facility_f02', [
    'Build is where cars and the garage grow: the Pit Bay (a new car, or the car being built), the Car Garage and Build Mode.',
    'Only one car is built at a time. Upgrade projects and Research Prototypes are coming in a later update.',
  ]),
  page('builder', 'New car', 'race_ui_01', 'car_v01_showcase', [
    'Pick a class, then one part for each of the six slots, a five-person crew and a budget focus, then confirm.',
    'Better parts make a faster car but take longer and fault more often. The forecast shows what the car should be like.',
    'Parts and classes open with research and rank. A locked one says what it needs.',
  ]),
  page('project', 'The car being built', 'facility_f02', 'facility_f02', [
    'A car goes through five stages on the Pit Bay. Watch the crew work on it in the garage.',
    'Smoke means a fault: the testing stage tries to fix it, or pay for an Emergency Fix. A gold sparkle is a breakthrough.',
    'You can change the budget focus for the next stage. The finished car goes to the Car Garage.',
  ]),
  page('cars', 'Car Garage', 'race_ui_01', 'car_v01_showcase', [
    'Every car you have finished: its class, parts, quality, condition and race history.',
    'Race cars wear down. Repair them between races, or retire one you no longer need.',
  ]),
  page('roster', 'Your team', 'race_ui_02', null, [
    'Everyone on the team, with their role, level, five work stats, Energy, Morale, salary and what they are doing now.',
    'Tired people work slower and rest by themselves. Tap anyone to see their details.',
  ]),
  page('staff', 'A team member', 'race_ui_02', null, [
    'Their stats and traits, their career so far, and for a driver the racing ratings their stats give.',
    'Train sends them on a course. You can also give them an item from the Parts Store, or let them go.',
    'A Legacy mark means they came with you from a finished run (New Game+).',
  ]),
  page('hire', 'Hiring', 'race_ui_02', 'facility_f15', [
    'Each channel has its own candidates. New faces arrive every few weeks; a refresh brings some sooner for a fee.',
    'Your rank sets how many people you can have and which channels open. Special arrivals come as cards in the Inbox.',
  ]),
  page('train', 'Training', 'race_ui_02', 'facility_f12', [
    'A course costs Credits and takes some days. It raises one stat. People on a course are away from their station.',
    'A driver can also play an optional Driver Drill for a medal that adds a bonus to their course. It is never needed.',
  ]),
  page('drills', 'Driver drills', 'race_ui_23', null, [
    'Six short arcade drills. Steer by dragging in the lower-left zone, brake with the button above it.',
    'Bronze, Silver and Gold medals add to a driver’s course. Your best times and medals are kept on this device.',
    'Steering sensitivity and the line and brake helpers are in Settings.',
  ]),
  page('research', 'Research', 'race_ui_03', 'facility_f11', [
    'Races and contracts earn Research Points (RP). Spend them on topics in six branches: new parts, facilities and tyres.',
    'One topic is researched at a time. A topic needs the ones before it. Some hidden topics only show once you have a clue.',
  ]),
  page('archive', 'Parts and combos', 'race_ui_03', null, [
    'The Parts Archive lists every part you can fit, slot by slot.',
    'Some parts work well together: the Combo Archive keeps every combination you have found, with its recipe.',
    'A combination you have not found shows ??? — build cars and a near miss may give you a clue.',
  ]),
  page('facilities', 'Build Mode and stations', 'race_ui_01', 'facility_f04', [
    'Long-press empty floor (or Build → Facilities) for Build Mode. Drag a station to move it; red means it can’t go there.',
    'Build a facility from the shop. Selling gives half its price back, upgrades included.',
    'Every station has a level from 1 to 3. An upgrade costs Credits, takes a few days and makes its effect stronger.',
    'Bigger wings of the garage open as your rank rises.',
  ]),
  page('items', 'Parts Store (items)', 'item_25', null, [
    'Items are kit your team earns from races, sponsors, fans and good training. They are never bought.',
    'Give one to a person to raise a stat for good. People who love that kind of kit get more from it.',
  ]),
  page('compete', 'Compete', 'race_ui_04', 'track_t01', [
    'The championship ladder: enter one, then race its rounds as they come due. The practice race at Pine Ridge pays a little and is not a championship.',
    'Your car, the rivals, your trophies and your records are all here.',
  ]),
  page('champ', 'A championship', 'race_ui_14', 'race_reward_07', [
    'Its rounds and tracks, the entry fee, what your car needs, the prizes, and the standings while it runs.',
    'A locked championship says what it needs. Win it and its trophy goes in your cabinet.',
  ]),
  page('weekend', 'Race weekend', 'race_ui_04', 'track_t01', [
    'Up to three practice runs find the setup. Then qualifying sets the grid, then the race.',
    'You can drive the qualifying lap yourself, or let it be simulated. Neither is needed to do well.',
  ]),
  page('race', 'The race', 'race_ui_04', 'track_t01', [
    'Auto Strategy is on: your crew handles pace, overtakes and pit stops. You can just watch.',
    'Tap a Pace or Order button, a tyre or Pit Now to take over; AUTO hands back to the crew.',
    'Whole track / Follow switches the camera. Speed it up with 2× or 4×. Back pauses the race; it waits, saved, if you leave.',
  ]),
  page('stint', 'Drive Stint', 'race_ui_30', null, [
    'Take the wheel for a short stint. The car keeps the throttle down by itself.',
    'Drag the lower-left zone to steer, hold Brake above it, hold Push (lower right) for more speed — with more tyre wear and risk.',
    'Hand Back gives the car to the crew again. Back also hands back. You never have to drive.',
  ]),
  page('result', 'Race result', 'race_ui_14', null, [
    'The finishing order, the fastest lap, what happened, your prize money and the championship after this round.',
    'Your car comes back to the Car Garage; check its condition before the next race.',
  ]),
  page('sponsors', 'Sponsors and contracts', 'race_ui_26', 'facility_f15', [
    'Sponsors pay a monthly amount for six months and ask for something in return. Meet it for a bonus.',
    'Your rank sets how many logo slots you have. New offers arrive every month.',
    'Contracts are development jobs that pay Credits and RP when done in time.',
  ]),
  page('ledger', 'Money', 'race_ui_05', null, [
    'The Ledger shows every Credit in and out: salaries, build costs, prize money, sponsors and repairs.',
    'Below zero, Emergency Credit is on: no new cars and interest each month until you are back above zero.',
    'Save & main menu is on the Money sheet and in the Menu.',
  ]),
  page('records', 'Records and achievements', 'race_reward_08', 'race_reward_08', [
    'The 30 achievements, your team records, staff careers, cars, lap records and medals, each with the best on this device.',
    'Completion counts everything you can see. Achievements stay earned in every slot.',
  ]),
  page('rumours', 'Rumour Archive', 'race_ui_28', null, [
    'Near misses leave rumours: clues to combinations and to secrets. They grow clearer the closer you get.',
    'A found secret shows its exact recipe here. Nothing says how many secrets there are.',
  ]),
  page('inbox', 'Inbox and news', 'race_ui_13', null, [
    'News, offers, rumours and big moments arrive here. A dot marks the unread ones.',
    'A message with a question waits for your answer. Tap any message to see it again.',
  ]),
  page('store', 'Store', 'race_reward_02', null, [
    'The Store will offer Remove Ads, Racing Tokens and VIP, and a way to restore what you bought. It is coming later.',
    'Nothing in the Store will ever buy wins, prestige, secrets or achievements.',
  ]),
  page('ending', 'The Year-16 ending', 'race_reward_07', 'race_event_07', [
    'At the end of Year 16 your run is graded from S to D over seven areas, with a ceremony and your history.',
    'Then carry on playing (postgame), or start New Game+ from the last card or from the save slots.',
  ]),
  page('hall', 'Hall of Runs', 'race_reward_08', null, [
    'Every finished run on this device: its grade, titles, people and cars. The newest comes first.',
  ]),
  page('ngplus', 'New Game+', 'race_reward_02', null, [
    'Start a new run from a finished one. Pick Legacy Staff to bring along, car blueprints to build again, and optional challenges.',
    'Your finished run stays exactly as it is. Rivals are tougher at each New Game+ level.',
  ]),
  page('settings', 'Settings', 'race_ui_menu', null, [
    'Sound, music and effects, vibration, graphics (Low runs at 30 FPS), text size, reduced flashes and motion, screen shake.',
    'Show or hide the Menu button and the next-step hints. The driving settings are at the bottom.',
    'Settings belong to this device and every team on it.',
  ]),
];

// Router screen names and sheet kinds → their page. A facility sheet (F01…) uses its station role (main.js).
export const HELP_FOR = {
  // screens
  boot: 'start', splash: 'start', menu: 'start', credits: 'start', slots: 'slots', setup: 'setup', hall: 'hall', ngplus: 'ngplus', ceremony: 'ending',
  garage: 'garage', roster: 'roster', staff: 'staff', carBuilder: 'builder', car: 'cars', cars: 'cars', weekend: 'weekend', raceIntro: 'weekend',
  race: 'race', stint: 'stint', raceResult: 'result', research: 'research', recruit: 'hire', train: 'train', medals: 'drills', drill: 'drills',
  // sheets
  sheet_menu: 'menu', sheet_settings: 'settings', sheet_build: 'build', sheet_staff: 'roster', sheet_research: 'research', sheet_compete: 'compete',
  sheet_money: 'ledger', sheet_F02: 'project', sheet_worker: 'staff', sheet_facility: 'facilities', sheet_shop: 'facilities', sheet_store: 'items',
  sheet_item: 'items', sheet_giveItem: 'items', sheet_giveConfirm: 'items', sheet_giveTo: 'items', sheet_sponsors: 'sponsors', sheet_records: 'records',
  sheet_partsArchive: 'archive', sheet_comboArchive: 'archive', sheet_rumourArchive: 'rumours', sheet_secretInspector: 'rumours', sheet_inbox: 'inbox',
  sheet_champStandings: 'champ', sheet_champ: 'champ', sheet_rivals: 'compete', sheet_trophies: 'compete', sheet_shopStore: 'store', sheet_racePause: 'race',
  sheet_mainRecords: 'records', sheet_help: 'garage',
  // a station's page by its role (data/facilities.js def.role)
  role_Maker: 'project', role_Specialist: 'facilities', role_Thinker: 'research', 'role_Front desk': 'hire', role_Rest: 'train', 'role_Rest/Training': 'train', role_Showcase: 'cars', role_Support: 'facilities', role_Secret: 'facilities', role_Prop: 'facilities',
};

export const HELP_TEXT = {
  title: 'Help',
  topicsTab: 'Topics',
  back: '‹ Back',
  settings: 'Settings',
};

// The pictures the pages use, so they load with the rest of the art (data/assets.js).
export const HELP_ART_FOLDERS = { race_ui: 'ui', race_brand: 'brand', race_reward: 'rewards', race_event: 'events', facility: 'facilities', car: 'cars', track: 'tracks' };
