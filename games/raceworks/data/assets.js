// RACEWORKS image list: key → path (relative to index.html).
import { STATIONS } from './garage.js';
import { STAFF, ROLES } from './staff.js';
import { CLASSES, PARTS, BUILD_ART } from './cars.js';
import { BOTTOM_SLOTS, TOP_BAR } from './home.js';
import { T01 } from './tracks/T01.js';
import { RIVAL_TEAMS, PRIVATEERS } from './rivals.js';

const art = (folder, key) => [key, `assets/images/${folder}/${key}.png`];

export const ASSETS = {
  // Garage: the stations with art (the rest spot is drawn by code).
  ...Object.fromEntries(STATIONS.filter((s) => s.art).map((s) => art('facilities', s.art))),
  // Staff (Milestone 3): the three starters' portraits and the five role badges.
  // (The Tired / Stressed / Inspired icons are drawn by code at start: src/ui/statusIcons.js.)
  ...Object.fromEntries(STAFF.map((s) => art('staff', s.art))),
  ...Object.fromEntries(Object.values(ROLES).map((r) => art('badges', r.badge))),
  // Car projects (Milestone 4): the class's car, the six starter part icons, the build show's effects.
  ...Object.fromEntries(Object.values(CLASSES).map((c) => art('cars', c.art))),
  ...Object.fromEntries(Object.values(PARTS).map((p) => art('parts', p.art))),
  ...Object.fromEntries(Object.values(BUILD_ART).map((k) => art('vfx', k))),
  // Races (Milestone 6): the top-down race sprites (player class + every rival / privateer) and T01's scenery picture
  // (a pre-race backdrop only — the circuit itself is drawn in code from data/tracks/T01.js).
  ...Object.fromEntries([...Object.values(CLASSES).map((c) => c.raceArt), ...Object.values(RIVAL_TEAMS).map((t) => t.sprite), ...PRIVATEERS.map((p) => p.sprite)].map((k) => art('cars', k))),
  ...Object.fromEntries([T01.artKey].map((k) => art('tracks', k))),
  // Home bars (Milestone 2): the five bottom-bar icons, Credits and Racing Tokens.
  ...Object.fromEntries(BOTTOM_SLOTS.map((s) => art('ui', s.icon))),
  ...Object.fromEntries(Object.values(TOP_BAR.icons).map((k) => art('rewards', k))),
  // Milestone 0 loader test (?screen=test): one real file and one deliberately missing one.
  m0Real: 'assets/branding/pwa/icon-512.png',
  m0Missing: 'assets/m0-missing-test.png',
};
