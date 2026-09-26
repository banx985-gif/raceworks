// RACEWORKS image list: key → path (relative to index.html).
import { STATIONS, WORKER } from './garage.js';

const art = (folder, key) => [key, `assets/images/${folder}/${key}.png`];

export const ASSETS = {
  // Garage (Milestone 1): the two stations and Tessa.
  ...Object.fromEntries(STATIONS.map((s) => art('facilities', s.art))),
  ...Object.fromEntries([art('staff', WORKER.art)]),
  // Milestone 0 loader test (?screen=test): one real file and one deliberately missing one.
  m0Real: 'assets/branding/pwa/icon-512.png',
  m0Missing: 'assets/m0-missing-test.png',
};
