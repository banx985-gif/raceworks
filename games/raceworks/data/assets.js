// RACEWORKS image list: key → path (relative to index.html).
import { STATIONS } from './garage.js';
import { STAFF, ROLES } from './staff.js';
import { BOTTOM_SLOTS, TOP_BAR } from './home.js';

const art = (folder, key) => [key, `assets/images/${folder}/${key}.png`];

export const ASSETS = {
  // Garage: the stations with art (the rest spot is drawn by code).
  ...Object.fromEntries(STATIONS.filter((s) => s.art).map((s) => art('facilities', s.art))),
  // Staff (Milestone 3): the three starters' portraits and the five role badges.
  // (The Tired / Stressed / Inspired icons are drawn by code at start: src/ui/statusIcons.js.)
  ...Object.fromEntries(STAFF.map((s) => art('staff', s.art))),
  ...Object.fromEntries(Object.values(ROLES).map((r) => art('badges', r.badge))),
  // Home bars (Milestone 2): the five bottom-bar icons, Credits and Racing Tokens.
  ...Object.fromEntries(BOTTOM_SLOTS.map((s) => art('ui', s.icon))),
  ...Object.fromEntries(Object.values(TOP_BAR.icons).map((k) => art('rewards', k))),
  // Milestone 0 loader test (?screen=test): one real file and one deliberately missing one.
  m0Real: 'assets/branding/pwa/icon-512.png',
  m0Missing: 'assets/m0-missing-test.png',
};
