// Recruitment (Milestone 12, bible §12, §10.6, §11 "Initial eligibility"; spec §9 for the founder). Plain data only; the
// rules are core/RecruitmentSystem.js and src/systems/recruitment.js. Numbers marked PLACEHOLDER are Claude Code's
// (listed in docs/DECISIONS.md), to tune later.

// The five channels (bible §12). Each open channel keeps its own board of 3 cards.
//   rank: the rank that opens it. weights: how often each tier is drawn for a card (PLACEHOLDER; a tier the team may
//   not see yet — Elite before Rank B — is never drawn). band: { tier: 'low' } = only the low end of that tier (Local
//   Contacts' "low Rare": named people up to band level, generic ones from GENERIC.low). refreshCost: Credits for a
//   paid refresh (PLACEHOLDER), escalating (RECRUIT.refreshEscalation) within a game month.
//   special: condition-driven — nobody refreshes it; locked until its milestone (lockedUntil).
export const CHANNELS = [
  { id: 'local', name: 'Local Contacts', short: 'Local', rank: null, weights: { standard: 5, rare: 1 }, band: { rare: 'low' }, refreshCost: 200, line: 'Friends of the paddock: Standard crew and the odd low Rare. Free to look.' },
  { id: 'agency', name: 'Agency Search', short: 'Agency', rank: 'D', weights: { standard: 2, rare: 3 }, band: {}, refreshCost: 600, line: 'A motorsport agency finds you better Rare staff.' },
  { id: 'national', name: 'National Scout', short: 'National', rank: 'C', weights: { rare: 3, elite: 1 }, band: {}, refreshCost: 1500, line: 'Scouts across the country: Rare, and Elite from Rank B.' },
  { id: 'global', name: 'Global Head Hunt', short: 'Global', rank: 'A', weights: { rare: 1, elite: 3 }, band: {}, refreshCost: 4000, line: 'The best in the world: mostly Elite.' },
  { id: 'special', name: 'Special Arrival', short: 'Special', rank: null, special: true, lockedUntil: 'Milestone 24', line: 'Someone special turns up when the right thing happens. It can’t be refreshed away.' },
];
export const channelById = (id) => CHANNELS.find((c) => c.id === id) ?? null;
export const ROLE_IDS = ['driver', 'mechanic', 'engineer', 'aero', 'strategist'];

export const RECRUIT = {
  boardSize: 3, // bible §12
  freeRefreshDays: 56, // bible §12: a free board refresh every 56 game days (every open board)
  refreshEscalation: 2, // PLACEHOLDER: each paid Credits refresh in the same game month costs this many times the last
  reappearChance: 0.1, // PLACEHOLDER: someone let go may turn up on a later board (core RecruitmentSystem)
  namedChance: 0.6, // PLACEHOLDER: a card is a named roster person (when one is eligible) this often, else generic
  namedChancePerExtra: 0.05, // PLACEHOLDER (Milestone 13): +5% for each extra named person who could fill the card
  namedChanceMax: 0.9, // PLACEHOLDER (Milestone 13): generic fillers never vanish completely
  missingRoleChance: 0.6, // PLACEHOLDER: a generic card takes a role the team has nobody for this often
  hireFeeMonths: 1, // PLACEHOLDER: the hiring fee is this many months of their salary (paid at once)
  staffCaps: { E: 6, D: 9, C: 12, B: 16, A: 20, S: 24 }, // bible §12 employee cap by rank
  tierRank: { standard: 'E', rare: 'E', elite: 'B' }, // bible §9.3 / §10.6: Elite recruitment opens at Rank B
  neverInPools: ['legendary', 'secret'], // bible §10.6 / §11: special arrival / secret only
};

// Paid refreshes other than Credits (bible §12). Service stubs: the buttons work through a pretend provider — Racing
// Tokens are spent from the ledger (core/StoreStub) and the "ad" is core/FakeStoreProvider's (no real ads or store).
export const REFRESH_SERVICES = {
  tokens: { cost: 5 }, // PLACEHOLDER fixed convenience cost in Racing Tokens
  ad: { placement: 'recruitRefresh', perRealHours: 24, count: 1 }, // one extra refresh per real day
};

// Generic staff: made up on the spot so a board is never empty (the full 50 with traits arrive in Milestone 13).
// PLACEHOLDER ranges, set around the bible §11 rows of each tier. Portraits: the role's own art (bible §11 pictures),
// faces from `faces` (row numbers of that role), never one worn by someone on the team or on a board, nor by a named
// person recruitment can offer now — so no face appears twice at once.
export const GENERIC = {
  tiers: {
    standard: { level: [1, 3], primary: [72, 100], other: [22, 64], salary: [450, 560] },
    rare: { level: [4, 10], primary: [128, 160], other: [45, 88], salary: [950, 1160] },
    elite: { level: [12, 17], primary: [232, 262], other: [85, 116], salary: [2000, 2250] },
  },
  low: { rare: { level: [4, 6], primary: [124, 142], other: [45, 72], salary: [950, 1050] } },
  bandLevel: { low: 6 }, // a named person in a 'low' band is at most this level
  faces: { standard: [1, 2, 3, 4, 5, 6], rare: [1, 2, 3, 4, 5, 6], elite: [7, 8] },
  artPrefix: { driver: 'staff_drv', mechanic: 'staff_mec', engineer: 'staff_eng', aero: 'staff_aer', strategist: 'staff_str' }, // + 01…10
  firstNames: ['Alba', 'Rory', 'Tomas', 'Ines', 'Callum', 'Petra', 'Dev', 'Lina', 'Owen', 'Maya', 'Bruno', 'Skye', 'Hollis', 'Juno', 'Marek', 'Tali', 'Reuben', 'Esme', 'Kofi', 'Ada', 'Nils', 'Rosa', 'Idris', 'Wren', 'Lucan', 'Suki', 'Emil', 'Freda', 'Ravi', 'Coral'],
  lastNames: ['Ashdown', 'Brennan', 'Carrow', 'Dunmore', 'Everly', 'Fairley', 'Garnett', 'Holloway', 'Iverson', 'Jessop', 'Kerrigan', 'Lowther', 'Marchetti', 'Northcott', 'Okafor', 'Penrose', 'Quarry', 'Radcliffe', 'Selwyn', 'Thorne', 'Underhill', 'Varga', 'Whitlock', 'Yardley', 'Zeller'],
};
