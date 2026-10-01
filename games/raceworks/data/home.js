// The home screen's bars (Milestone 2): the five bottom-bar slots, the top bar's placeholder numbers, and what the
// placeholder sheets say. Plain data only; the bars themselves are core/ui/TopBar.js and core/ui/BottomBar.js.

// Bottom bar, in the series order (style guide §2). `line` = what will live in its sheet.
export const BOTTOM_SLOTS = [
  { id: 'build', label: 'Build', icon: 'race_ui_01', line: 'Start a car project and follow the build.' },
  { id: 'staff', label: 'Staff', icon: 'race_ui_02', line: 'Hire, train and look after your drivers and crew.' },
  { id: 'research', label: 'Research', icon: 'race_ui_03', line: 'Unlock new parts, setups and garage upgrades.' },
  { id: 'compete', label: 'Compete', icon: 'race_ui_04', line: 'Championships, rankings and trophies.' },
  { id: 'money', label: 'Money', icon: 'race_ui_05', line: 'Credits, sponsors, contracts and saving.' },
];

// Top bar: the icons and speeds. Its numbers (Credits, Racing Tokens, Rank) come from team.money (Milestone 5).
export const TOP_BAR = {
  icons: { credits: 'race_reward_01', tokens: 'race_reward_02' },
  speeds: [1, 2, 4], // bible §6.1: Pause / 1× / 2× / 4×
};

// The Help placeholder sheet (Milestone 23: the Inbox is a real sheet now — src/ui/garageMenus.js).
export const TOP_SHEETS = {
  help: { title: 'Help', line: 'Tips and how-to guides will live here.' },
};
