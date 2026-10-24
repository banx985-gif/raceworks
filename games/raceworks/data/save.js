// Saves (Milestone 30, bible §44): where they live, what asks for one, the shape each kind must have, and the words the
// player sees when something is wrong. Plain data only (src/app/saveCheck.js checks the shapes; main.js wires it).

// IndexedDB first (core/StorageAdapter), localStorage only behind it when IndexedDB is missing or a write fails
// (private mode, quota) and for the small device settings (data/settings.js). Every slot keeps its last 3 copies.
export const SAVE_STORAGE = { dbName: 'raceworks', prefix: 'raceworks:', rolling: 3 };

// The run save (a slot) and the account save (shared by every slot) are separate stores with separate versions.
// The run's version is SAVE_VERSION (data/balance.js); the account's is here.
export const RUN_KIND = 'raceworks-run';
export const ACCOUNT_KIND = 'raceworks-account';
export const ACCOUNT_VERSION = 3; // 1 → 2 (Milestone 30): the normalised shape below · 2 → 3 (Milestone 31): + 'store'

// Every block of a run save (Team.serialize). From v23 every key is present — null when the save was made before
// the milestone that added it (that system then starts from its "before" state, as it always has).
export const RUN_BLOCKS = ['clock', 'rng', 'staff', 'cars', 'garage', 'setup', 'founder', 'noCandidates', 'playSeconds', 'money', 'races', 'facilities', 'research', 'recruitment', 'training', 'careers', 'championships', 'sponsors', 'contractRecords', 'events', 'runId', 'secrets', 'items', 'achievements', 'ending', 'ngPlus', 'monetisation'];
// …and of the account save (bible §44 "Account Save"): drill medals and Drive Stint records, combos, secret recipes
// and cross-run facts, achievements and records, the Hall of Runs and Prestige Tokens, the New Game+ lineage and every
// person met. Settings stay on the device (core/Settings). Milestone 31: 'store' — Remove Ads, the processed purchase /
// ad ids, the pending ad request ids, the interstitial timing and the real-day ad limits, tokens bought with no team open.
export const ACCOUNT_BLOCKS = ['drills', 'combos', 'secrets', 'achievements', 'ending', 'ngplus', 'store'];

// The autosave triggers (bible §44), each with the game events that ask for it. A save remembers the one that
// wrote it (the save inspector and the "an older save was loaded" note show it).
export const SAVE_TRIGGERS = [
  { id: 'days', label: 'Every 14 game days', every: 14, events: [] }, // main.js counts the days (clock:day)
  { id: 'phase', label: 'Car project phase done', events: ['project:phase', 'project:start', 'project:complete'] },
  { id: 'staff', label: 'Staff hired or let go', events: ['staff:hired', 'staff:letGo'] },
  { id: 'facility', label: 'Facility change', events: ['facility:layout', 'facility:upgradeStart', 'facility:levelUp'] },
  { id: 'research', label: 'Research started or done', events: ['research:start', 'research:stop', 'research:complete'] },
  { id: 'deal', label: 'Sponsor or contract accepted', events: ['sponsor:signed', 'contract:accepted'] },
  { id: 'weekend', label: 'Race weekend start', events: ['race:created'] },
  { id: 'beforeRace', label: 'Before the race', events: ['race:start'] },
  { id: 'result', label: 'Race result in', events: ['race:finished'] },
  { id: 'ending', label: 'Ending or New Game+', events: ['campaign:ending', 'ending:stage'] }, // (+ main.js: the ceremony closed, a New Game+ run started)
  { id: 'background', label: 'App paused / closed', events: [] }, // main.js: visibilitychange, pagehide, Back out of the app
];
// Everything else that has always asked for a save (Milestones 4–29) keeps doing so: the race every few seconds,
// money and deals moving, training, events. The 30-second rolling timer (core/Autosave) covers the rest.
export const OTHER_SAVE_EVENTS = ['race:progress', 'team:changed', 'car:fault', 'car:fix', 'car:breakthrough', 'contract:success', 'contract:failed', 'contract:progress', 'sponsor:met', 'sponsor:ended', 'sponsor:progress', 'car:repaired', 'economy:debt', 'recruit:refresh', 'training:start', 'training:complete', 'event:fired', 'event:resolved'];
export const AUTOSAVE_MS = 30000;
// The other reasons a save is written (main.js), in words.
export const SAVE_REASONS = {
  ngplus: 'Ending or New Game+',
  newTeam: 'New team started',
  leaveTeam: 'Back to the main menu',
  leaveRace: 'Left the race',
  drill: 'Drill done',
  championship: 'Championship entered',
  interval: 'Every 30 seconds of play',
  retry: 'After a failed save',
  again: 'Another change',
  save: 'Saved',
};

// What the player reads (plain words; never a code).
export const SAVE_WORDS = {
  checking: (n, of) => `Checking your saves… slot ${n} of ${of}`,
  updating: (n, from, to) => `Updating slot ${n} (save v${from} → v${to})`,
  entitlements: 'Checking purchases…', // Milestone 31: the store check (re-delivered purchases, Remove Ads)
  ready: 'Ready',
  fallbackTitle: 'An older save was loaded',
  fallbackBody: (from) => `The newest save of this team couldn’t be read (the phone may have closed the game while it was saving), so the one before it was loaded${from ? ` — from ${from}` : ''}. The damaged copy is kept.`,
  damagedLine: 'Damaged — start a new team or restore',
  damagedSub: 'No copy of this save can be read. Your device records are safe.',
  newerLine: 'Saved by a newer RACEWORKS',
  newerSub: 'Update the game to keep playing this team.',
  newerBody: 'This team was saved by a newer version of RACEWORKS, so this version won’t open it (and won’t touch it). Update the game to keep playing.',
  newTeamTitle: (n) => `New team in slot ${n}?`,
  newTeamBody: 'The damaged save is kept aside, not deleted, in case it can be rescued later.',
  restore: 'Restore',
  restorePrompt: 'Paste a saved team here',
  restored: (n) => `Slot ${n} restored`,
  restoreFailed: (why) => `That isn’t a RACEWORKS save (${why})`,
  accountTitle: 'Your records couldn’t be read',
  accountBody: 'The device records (achievements, medals, Hall of Runs, discoveries) were damaged. A copy is kept aside, and new records start from here. Your teams are not affected.',
  accountNewerBody: 'Your device records were saved by a newer version of RACEWORKS. Update the game — until then new records aren’t kept.',
  away: 'Paused while you were away',
  awayLine: 'Tap a speed to carry on',
};
