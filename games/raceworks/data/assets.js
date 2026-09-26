// RACEWORKS image list: key → path (relative to index.html).
import { STATIONS, WORKER } from './garage.js';
import { BOTTOM_SLOTS, TOP_BAR } from './home.js';

const art = (folder, key) => [key, `assets/images/${folder}/${key}.png`];

export const ASSETS = {
  // Garage (Milestone 1): the two stations and Tessa.
  ...Object.fromEntries(STATIONS.map((s) => art('facilities', s.art))),
  ...Object.fromEntries([art('staff', WORKER.art)]),
  // Home bars (Milestone 2): the five bottom-bar icons, Credits and Racing Tokens.
  ...Object.fromEntries(BOTTOM_SLOTS.map((s) => art('ui', s.icon))),
  ...Object.fromEntries(Object.values(TOP_BAR.icons).map((k) => art('rewards', k))),
  // Milestone 0 loader test (?screen=test): one real file and one deliberately missing one.
  m0Real: 'assets/branding/pwa/icon-512.png',
  m0Missing: 'assets/m0-missing-test.png',
};
