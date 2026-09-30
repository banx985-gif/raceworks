// The garage (Milestone 1): room size, view, the stations and the staff's loops. Plain data only.
import { FACILITIES, REST_SPOT } from './facilities.js';
// Grid cells are in "plan" space (col → right-down, row → left-down on screen); the back walls run along row 0 and col 0.

// cols / rows: the Starter Garage (Milestone 10: the whole building — expansions too — is data/facilities.js).
export const GARAGE = {
  cols: 12,
  rows: 16,
  cellSize: 100, // plan units per cell (pathing, walking speed)
  view: { halfW: 72, halfH: 36 }, // one cell draws as a 144 × 72 diamond (2:1, the art's angle)
  wallH: 270, // back-wall height, drawn px
  margin: 80, // empty world around the room (the camera stops at the room edges plus this)
  zoom: { min: 0.8, max: 1.3, start: 0.9 }, // bible §8: pinch 0.80×–1.30×
};

// Placeholder floor and wall colours until the garage art exists.
export const GARAGE_LOOK = {
  floorA: '#CDD2D8',
  floorB: '#C3C9D0',
  grout: '#AEB5BD',
  wallFace: '#EEE6D6',
  wallSide: '#E0D5C0',
  wallCap: '#3B332C',
  stripe: '#D8352A', // team red band along the walls
  stripe2: '#F2B233',
  gridLine: 'rgba(21,151,191,0.55)', // Build Mode shows the hidden grid
  // Milestone 10: the door, locked wings (greyed floor), and Build Mode's footprints (green = fits, red = refused).
  door: '#4A5360',
  lockedA: '#A3A8AF',
  lockedB: '#9AA0A7',
  lockedLine: 'rgba(59,51,44,0.45)',
  lockedText: '#5B6068',
  footprint: 'rgba(21,151,191,0.10)',
  footprintLine: 'rgba(21,151,191,0.55)',
  doorway: 'rgba(242,178,51,0.35)',
  okFill: 'rgba(46,170,90,0.35)',
  badFill: 'rgba(216,53,42,0.38)',
};

// Stations (Milestone 10): every facility that can stand in the garage — bible F01–F15 and the rest spot — from
// data/facilities.js. Where they stand is the team's layout (core/FacilitySystem, src/systems/garageFacilities.js),
// not fixed here: the starting garage is data/facilities.js START_LAYOUT. A station's standing places are the free
// cells next to it (core FacilitySystem.accessCells: front edge first, middle first), so moving it moves them too.
export const STATIONS = [...FACILITIES, REST_SPOT];
export const REST_STATION = 'REST';

// Walking and drawing, the same for everyone.
export const WALK = { height: 230, speed: 260 }; // drawn px at zoom 1 · plan units per second

// Idle spots are spread out so nobody stands in front of anyone else (tapping picks whoever is nearest the viewer).
// Each worker's routine: wait at their idle spot, then visit the next stop (in turn), stay there, walk back.
//   stops: [{ at: station id, spot: which of its standing places (0 = the first), sec: how long, activity }]
//   idle: a floor cell; if a facility now stands there, the nearest free cell (Milestone 10).
//   activity 'working' drains Energy each day, 'resting' restores it (core/StaffSystem daily tick).
//   restSpot: which of the rest spot's places they use when Energy runs low (balance.js REST): they stay until it is
//   back up. A station that isn't in the garage (sold) is skipped.
export const ROUTINES = {
  MEC01: { idle: { col: 5, row: 7 }, idleSec: 2.5, restSpot: 1, stops: [{ at: 'F02', sec: 4, activity: 'working' }] }, // Tessa: the Pit Bay loop
  DRV01: {
    idle: { col: 6, row: 11 }, // Milestone 10: the Pit Bay now stands on 8,8
    idleSec: 2,
    restSpot: 0,
    stops: [
      { at: 'F11', spot: 1, sec: 4, activity: 'working' },
      { at: 'REST', sec: 5, activity: 'resting' },
    ],
  }, // Sam: the Strategy Desk or the rest spot
  ENG01: { idle: { col: 2, row: 10 }, idleSec: 2, restSpot: 2, stops: [{ at: 'F11', sec: 7, activity: 'working' }] }, // Mara: the Strategy Desk
  // Milestone 4b: Nia and Ben as founders take Mara's place in the trio (the desk and her rest place), from their own
  // idle spots. When more staff arrive (Milestone 12) they get their own desk places.
  AER01: { idle: { col: 4, row: 11 }, idleSec: 2, restSpot: 2, stops: [{ at: 'F11', sec: 7, activity: 'working' }] }, // Nia: the Strategy Desk (drawing shapes)
  STR01: { idle: { col: 3, row: 13 }, idleSec: 2, restSpot: 2, stops: [{ at: 'F11', sec: 7, activity: 'working' }] }, // Ben: the Strategy Desk
};

// Milestone 12: everyone hired later works by their role (the founders keep their own routines above). A hire's idle
// spot is the first of HIRE_IDLE not taken by anyone else's (a facility standing there → the nearest free cell).
export const ROLE_ROUTINES = {
  driver: { idleSec: 2, restSpot: 0, stops: [{ at: 'F12', sec: 5, activity: 'working' }, { at: 'F11', spot: 1, sec: 4, activity: 'working' }] },
  mechanic: { idleSec: 2.5, restSpot: 1, stops: [{ at: 'F01', sec: 5, activity: 'working' }, { at: 'F02', sec: 4, activity: 'working' }] },
  engineer: { idleSec: 2, restSpot: 2, stops: [{ at: 'F03', sec: 5, activity: 'working' }, { at: 'F11', sec: 5, activity: 'working' }] },
  aero: { idleSec: 2, restSpot: 2, stops: [{ at: 'F10', sec: 7, activity: 'working' }] },
  strategist: { idleSec: 2, restSpot: 2, stops: [{ at: 'F11', sec: 7, activity: 'working' }] },
};
export const HIRE_IDLE = [
  { col: 8, row: 12 }, { col: 3, row: 8 }, { col: 10, row: 12 }, { col: 5, row: 13 }, { col: 9, row: 3 }, { col: 2, row: 12 },
  { col: 7, row: 14 }, { col: 4, row: 9 }, { col: 11, row: 8 }, { col: 3, row: 4 }, { col: 6, row: 3 }, { col: 9, row: 14 },
  { col: 5, row: 5 }, { col: 11, row: 2 }, { col: 2, row: 7 }, { col: 10, row: 10 }, { col: 7, row: 11 }, { col: 4, row: 15 },
  { col: 13, row: 4 }, { col: 13, row: 9 }, { col: 14, row: 13 }, { col: 6, row: 15 },
];
// Everyone's routine: their own (the founders) or their role's with the n-th free hire idle spot.
export function routineFor(s, hireIndex = 0) {
  if (ROUTINES[s.id]) return ROUTINES[s.id];
  const base = ROLE_ROUTINES[s.role] ?? ROLE_ROUTINES.mechanic;
  return { ...base, idle: HIRE_IDLE[hireIndex % HIRE_IDLE.length] };
}
// Short assignment line for cards: a founder's station, else their role's first stop.
export const stationOf = (s) => ASSIGNMENT[s.id] ?? ROLE_ROUTINES[s.role]?.stops[0].at ?? null;

// What a worker's card says they are doing, per routine phase ({place} = the station's name).
export const WORKER_STATE_TEXT = {
  idle: 'Waiting at the idle spot',
  toWork: 'Walking to the {place}',
  working: 'Working at the {place}',
  back: 'Walking back to the idle spot',
  toRest: 'Walking to the rest spot',
  resting: 'Resting at the rest spot',
  // Milestone 12: training ({course} = the course's name), and a new hire's first walk in.
  toTrain: 'Walking to the {place} for {course}',
  training: 'Training: {course} at the {place} ({days} left)',
  arriving: 'Just hired: walking in',
};
// Short assignment line for cards ("Pit Bay", "Strategy Desk").
export const ASSIGNMENT = { MEC01: 'F02', DRV01: 'F11', ENG01: 'F11', AER01: 'F11', STR01: 'F11' };
