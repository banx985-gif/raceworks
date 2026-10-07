// Milestone 29 (the screen / UX pass): the words of the screens and sheets added or tidied in this milestone — the main
// menu, the Store placeholder, Back (leaving the garage, the race pause sheet), a failed save, Credits, and the empty
// states every list shows. Plain data only.

// The main menu (bible §7: Continue · New Game · New Game+ · Records · Settings · Credits / Legal; plus Load and Help).
export const MAIN_MENU_TEXT = {
  continueNone: 'No saved team yet',
  load: (used, of) => `${used} of ${of} slots used`,
  ngPlus: 'New Game+',
  ngPlusNone: 'After a Year-16 ending',
  ngPlusOne: (team) => `Start from ${team}`,
  ngPlusMany: (n) => `${n} finished runs: pick one`,
  records: 'Records',
  recordsLine: 'Achievements and best runs on this device',
  credits: 'Credits / Legal',
};

// The Store (bible §7): a placeholder sheet until Milestone 31 brings the real one. Never wired to anything.
export const STORE_TEXT = {
  title: 'Store',
  line: 'Optional extras · coming later',
  later: 'coming later',
  never: 'Nothing here will ever buy wins, prestige, secrets or achievements.',
  rows: [
    { id: 'removeAds', label: 'Remove Ads', line: 'Play with no adverts', icon: 'race_ui_13' },
    { id: 'tokens', label: 'Racing Tokens', line: 'Speed-ups and shortcuts', icon: 'race_reward_02' },
    { id: 'vip', label: 'VIP', line: 'A monthly bundle of small extras', icon: 'race_reward_08' },
    { id: 'restore', label: 'Restore Purchases', line: 'Bring back what you bought on another phone', icon: 'race_ui_01' },
  ],
};

// Back (Milestone 29): leaving the garage asks first; the race pause sheet; a refused action's toast title.
export const BACK_TEXT = {
  leaveTitle: 'Leave the garage?',
  leaveBody: 'Your team is saved. Go back to the main menu?',
  leaveYes: 'Main menu',
  leaveNo: 'Stay',
  raceTitle: 'Race paused',
  raceLine: 'The race waits while this is open',
  resume: 'Resume',
  resumeLine: 'Back to the race',
  leave: 'Leave to the garage',
  leaveLine: 'The race waits, saved, exactly where it is',
  refused: 'Not now',
  pauseButton: '‹ Pause',
};

// A failed save: a toast, then the game tries again by itself.
export const SAVE_TEXT = {
  failed: 'Couldn’t save just now',
  retry: 'Trying again in a few seconds',
  retryMs: 4000,
  quietMs: 20000, // at most one toast this often
};

// Credits / Legal (the main menu, Settings): the studio logo, then the roll.
export const CREDITS_TEXT = {
  title: 'Credits',
  legal: 'Privacy & legal',
  blocks: [
    { heading: 'RACEWORKS' },
    { line: 'A Canvas Management Series game' },
    { gap: 40 },
    { heading: 'Made by' },
    { line: 'Aaron — Banx Games' },
    { gap: 30 },
    { heading: 'Art' },
    { line: 'Aaron' },
    { gap: 30 },
    { heading: 'Code' },
    { line: 'Claude Code' },
    { gap: 30 },
    { heading: 'Thank you' },
    { line: 'for playing!' },
    { gap: 120 },
  ],
};

// Empty states (bible §7 / M29): every list says, in plain words, why it is empty and what to do next.
export const EMPTY_TEXT = {
  cars: 'No cars yet — tap the Pit Bay and start a new car.',
  training: 'No one on a course — tap Train to send someone.',
  sponsors: 'No sponsor deals yet — sign an offer below.',
  sponsorOffers: 'No offers right now — new ones arrive each month.',
  contracts: 'No contracts yet — accept an offer below.',
  contractOffers: 'No offers right now — new ones arrive each month.',
  ledger: 'Nothing in or out yet — Credits show here as they move.',
  standings: 'No rounds raced yet — race round 1 from Compete.',
  trophies: 'No titles yet — win a championship and its trophy goes here.',
  races: 'No races yet — race from Compete.',
  hall: 'No finished runs yet — a run that reaches the Year-16 ending is kept here.',
  candidates: 'No one on this board right now — new faces arrive soon, or refresh it.',
  special: 'No special arrivals waiting — they come as cards in the Inbox.',
  trainScreen: 'No one on a course — pick a person and a course below.',
  blueprints: 'No blueprints — finished cars from a New Game+ parent show here.',
  research: 'Nothing being researched — open the tree and start a topic.',
};

// Secret and locked things (Milestone 29): visible content that is locked is greyed with its reason; a secret is not listed
// at all until it has a clue, then shows as ??? with the clue (never its name or how to unlock it), and once found it is
// listed like the rest with this mark. Nothing ever says how many secrets there are (Milestone 26).
export const SECRET_TEXT = { unknown: '???', found: 'Secret found' };
