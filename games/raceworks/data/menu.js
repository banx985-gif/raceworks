// The Menu (Milestone 25b, series common feature §1; core/ui/MenuSheet): every RACEWORKS screen in plain words, with
// its icon and a one-line "what this is for". A row opens the very same sheet / screen the art and the bars open
// (src/main.js MENU_OPEN: one code path). Locked rows are greyed with their reason (main.js menuState). Plain data only.
const row = (id, label, line, icon) => ({ id, label, line, icon });
export const MENU_GROUPS = [
  { title: 'Garage', rows: [
    row('pitBay', 'Pit Bay', 'Start a car and watch it being built', 'race_ui_01'),
    row('carBuilder', 'Car builder', 'Choose a class, parts and crew for a new car', 'race_ui_01'),
    row('carGarage', 'Car Garage', 'Every car you have finished', 'race_ui_01'),
  ] },
  { title: 'Staff', rows: [
    row('roster', 'Roster', 'Everyone on the team: stats, Energy, Morale, traits', 'race_ui_02'),
    row('hire', 'Hire', 'Recruitment: the channels and their candidates', 'race_ui_02'),
    row('train', 'Train', 'Courses that raise a stat (Credits and days)', 'race_ui_02'),
    row('drills', 'Drills', 'Driver drills, medals and your best times', 'race_ui_02'),
    row('store', 'Parts Store (items)', 'Kit the team has earned: give it to raise a stat for good', 'item_25'),
  ] },
  { title: 'Research', rows: [row('research', 'Research', 'Spend RP on new parts, facilities and tyres', 'race_ui_03')] },
  { title: 'Build / Facilities', rows: [
    row('build', 'Build Mode', 'Move, sell or upgrade the garage stations', 'race_ui_01'),
    row('shop', 'Build a facility', 'Every station you can build, and what each does', 'race_ui_01'),
  ] },
  { title: 'Compete', rows: [
    row('championships', 'Championships', 'The 12-championship ladder, rivals and trophies', 'race_ui_04'),
    row('raceWeekend', 'Race weekend', 'Practice, setup, qualifying and the race', 'race_ui_04'),
  ] },
  { title: 'Money', rows: [
    row('ledger', 'Ledger', 'Every Credit in and out', 'race_ui_05'),
    row('contracts', 'Contracts', 'Development jobs that pay Credits and RP', 'race_ui_05'),
    row('sponsors', 'Sponsors', 'Six-month deals: stipends, perks, obligations', 'race_ui_26'),
  ] },
  { title: 'Records', rows: [
    row('records', 'Trophy cabinet', 'Your titles, wins and podiums', 'race_reward_08'),
    row('inbox', 'Inbox', 'News, offers, rumours and big moments', 'race_ui_13'),
  ] },
  { title: 'Archives', rows: [
    row('partsArchive', 'Parts Archive', 'Every part you can fit', 'race_ui_03'),
    row('comboArchive', 'Combo Archive', 'The combinations you have found', 'race_ui_03'),
    row('rumourArchive', 'Rumour Archive', 'Clues to combos and secrets', 'race_ui_28'),
  ] },
  { title: 'More', rows: [
    row('settings', 'Settings', 'Sound, graphics, text size, the Menu button and hints', 'race_ui_menu'),
    row('mainMenu', 'Save & main menu', 'Saves your team, then back to the title screen', 'race_brand_02'),
  ] },
];
export const MENU_TEXT = { title: 'Menu', subtitle: 'Every screen in the garage. Tapping the art works too.', button: 'Menu', icon: 'race_ui_menu' }; // race_ui_menu: drawn by code

// Every facility's main action (series §1): the first button on its sheet, as a Menu row id, with the button's words.
// The sheet's subtitle already says what the facility does.
const TRAIN = { row: 'train', label: 'Train' };
const RESEARCH = { row: 'research', label: 'Research' };
const CAR = { row: 'pitBay', label: 'Start a car' };
export const FACILITY_ACTIONS = {
  F01: CAR, F02: CAR, F03: CAR, F04: CAR, F05: CAR, F06: CAR, F07: { row: 'raceWeekend', label: 'Race weekend' }, F08: CAR, F09: CAR, F10: CAR,
  F11: RESEARCH, F12: TRAIN, F13: { row: 'store', label: 'Parts Store' }, F14: { row: 'carGarage', label: 'Car Garage' }, F15: { row: 'sponsors', label: 'Sponsors' },
  F16: RESEARCH, F17: RESEARCH, F18: CAR, F19: CAR, F20: RESEARCH, F21: CAR, F22: { row: 'raceWeekend', label: 'Race weekend' }, F23: { row: 'raceWeekend', label: 'Race weekend' },
  F24: RESEARCH, F30: CAR, F32: { row: 'championships', label: 'Championships' }, F33: { row: 'raceWeekend', label: 'Race weekend' }, F34: RESEARCH, F35: CAR,
  REST: { row: 'roster', label: 'Roster' },
};

// The next-step hint line under the date (core/ui/HintLine; main.js says when each holds, first match wins).
export const NEXT_HINTS = {
  eventWaiting: 'A message needs your answer: tap to open the Inbox',
  firstCar: 'Tap the Pit Bay to start your first car',
  hireMechanic: 'Hire a mechanic: tap to open Recruitment',
  raceDay: 'Race day! Tap to go',
  carReady: (name) => `Your ${name} is ready — tap Compete to enter a race`,
  research: 'Research is idle: tap to pick a topic',
  item: (n) => `${n} item${n === 1 ? '' : 's'} waiting in the Parts Store: tap to give one`,
  sponsor: 'A sponsor offer is waiting: tap to see it',
  upgrade: 'A station can be upgraded: tap for Build Mode',
};
