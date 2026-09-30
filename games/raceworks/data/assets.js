// RACEWORKS image list: key → path (relative to index.html).
import { STATIONS } from './garage.js';
import { PROPS, START_LAYOUT } from './facilities.js';

const START_IDS = new Set(START_LAYOUT.map((p) => p.def));
import { STAFF, ROLES } from './staff.js';
import { CLASSES, PARTS, START_PARTS, BUILD_ART, CAR_FAMILIES } from './cars.js';
import { BOTTOM_SLOTS, TOP_BAR } from './home.js';
import { T01 } from './tracks/T01.js';
import { RIVAL_TEAMS, PRIVATEERS } from './rivals.js';
import { TYRES, RACE_ICONS } from './race.js';
import { RESEARCH_ICONS } from './research.js';

const art = (folder, key) => [key, `assets/images/${folder}/${key}.png`];

export const ASSETS = {
  // Garage: the starting garage's stations (Milestone 10: data/facilities.js START_LAYOUT) and the garage props. The
  // other facilities' pictures (bought later) load behind the game: LATER_ASSETS.
  ...Object.fromEntries(STATIONS.filter((s) => s.art && START_IDS.has(s.id)).map((s) => art('facilities', s.art))),
  ...Object.fromEntries(PROPS.map((p) => art('props', p.art))),
  // Staff (Milestone 3): the three starters' portraits and the five role badges.
  // (The Tired / Stressed / Inspired icons are drawn by code at start: src/ui/statusIcons.js.)
  ...Object.fromEntries(STAFF.map((s) => art('staff', s.art))),
  ...Object.fromEntries(Object.values(ROLES).map((r) => art('badges', r.badge))),
  // Car projects (Milestone 4): the class's car, the six starter part icons, the build show's effects.
  // (Milestone 9: at boot only the first car — the Club Hatch — and the six Start parts; the rest is LATER_ASSETS.)
  ...Object.fromEntries([CLASSES.clubHatch.art].map((k) => art('cars', k))),
  ...Object.fromEntries(Object.values(START_PARTS).map((id) => art('parts', PARTS[id].art))),
  ...Object.fromEntries(Object.values(BUILD_ART).map((k) => art('vfx', k))),
  // Races (Milestone 6): the top-down race sprites (player class + every rival / privateer) and T01's scenery picture
  // (a pre-race backdrop only — the circuit itself is drawn in code from data/tracks/T01.js).
  ...Object.fromEntries([CLASSES.clubHatch.raceArt, ...Object.values(RIVAL_TEAMS).map((t) => t.sprite), ...PRIVATEERS.map((p) => p.sprite)].map((k) => art('cars', k))),
  ...Object.fromEntries([T01.artKey].map((k) => art('tracks', k))),
  // Milestone 8: the showcase picture of every car family in the field (race result rows), the race effects (spray and
  // sparks are code; the Underbody Sparks, Breakdown Smoke and Pit-Service Burst art) and the main menu's key art.
  ...Object.fromEntries([...Object.values(RIVAL_TEAMS), ...PRIVATEERS].map((t) => art('cars', CAR_FAMILIES[t.family].showcase))),
  ...Object.fromEntries(['race_vfx_03', 'race_vfx_05', 'race_vfx_10'].map((k) => art('vfx', k))),
  race_brand_02: 'assets/images/brand/race_brand_02.png',
  // Race weekends (Milestone 7): the tyre icons and the race HUD icons.
  ...Object.fromEntries(Object.values(TYRES).map((t) => art('tyres', t.icon))),
  ...Object.fromEntries(Object.values(RACE_ICONS).map((k) => art('ui', k))),
  // Home bars (Milestone 2): the five bottom-bar icons, Credits and Racing Tokens.
  ...Object.fromEntries(BOTTOM_SLOTS.map((s) => art('ui', s.icon))),
  ...Object.fromEntries(Object.values(TOP_BAR.icons).map((k) => art('rewards', k))),
  // Research (Milestone 11): the Research Token (RP).
  ...Object.fromEntries([RESEARCH_ICONS.rp].map((k) => art('rewards', k))),
  // Milestone 0 loader test (?screen=test): one real file and one deliberately missing one.
  m0Real: 'assets/branding/pwa/icon-512.png',
  m0Missing: 'assets/m0-missing-test.png',
};

// Milestone 12: the portraits recruitment can show (each role's rows 01–08: named candidates and the faces generic staff
// wear). Registered at boot, loaded only when a board or a hire needs one (the Legendary / Secret 09–10 never are yet).
const STARTER_ART = new Set(STAFF.map((s) => s.art));
export const STAFF_PORTRAITS = Object.fromEntries(
  ['drv', 'mec', 'eng', 'aer', 'str'].flatMap((r) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `staff_${r}${String(n).padStart(2, '0')}`)).filter((k) => !STARTER_ART.has(k)).map((k) => art('staff', k)),
);

// Milestone 9: every car family's two pictures and every part icon (about 17 MB in all). Registered at boot and loaded
// a few at a time behind the game (main.js), so the first screen never waits for them; a picture still on its way
// draws nothing for a moment and pops in.
export const LATER_ASSETS = {
  ...Object.fromEntries(STATIONS.filter((s) => s.art && !START_IDS.has(s.id)).map((s) => art('facilities', s.art))), // Milestone 10
  ...Object.fromEntries(Object.values(CAR_FAMILIES).flatMap((f) => [art('cars', f.showcase), art('cars', f.top)])),
  ...Object.fromEntries(Object.values(PARTS).map((p) => art('parts', p.art))),
};
