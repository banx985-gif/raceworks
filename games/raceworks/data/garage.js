// The garage (Milestone 1): room size, view, the two starting stations and Tessa's loop. Plain data only.
// Grid cells are in "plan" space (col → right-down, row → left-down on screen); the back walls run along row 0 and col 0.

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
  benchTop: '#3FA7D6', // the placeholder rest spot: a padded blue bench
  benchFront: '#2C7FA8',
  benchSide: '#236A8E',
};

// Stations. fp = footprint on the grid (blocked for walking). spot = where the station's worker stands;
// spots = other named places to stand there (a second person at the desk…).
// draw: art width as a share of the footprint's drawn width; drop = how far below the footprint's
// bottom corner the art's base sits, in cell heights. art: null = drawn by code (a placeholder).
export const STATIONS = [
  {
    id: 'F02',
    name: 'Pit Bay',
    role: 'Maker',
    art: 'facility_f02',
    purpose: 'Start a car project and work on the active build.',
    fp: { col: 6, row: 2, w: 4, h: 4 },
    spot: { col: 7, row: 6 },
    draw: { width: 1.08, drop: 0.35 },
  },
  {
    id: 'F11',
    name: 'Strategy Desk',
    role: 'Thinker',
    art: 'facility_f11',
    purpose: 'Research, race forecasts and strategy.',
    fp: { col: 0, row: 5, w: 2, h: 3 },
    spot: { col: 2, row: 6 },
    spots: { visitor: { col: 2, row: 8 } },
    draw: { width: 1.12, drop: 0.3 },
  },
  {
    // Milestone 3 placeholder until the Driver Simulator / Driver Gym (the rest & training stations) arrive.
    id: 'REST',
    name: 'Rest Spot',
    role: 'Rest',
    art: null,
    purpose: 'A bench and a drink: tired staff come here to get their Energy back.',
    fp: { col: 9, row: 11, w: 2, h: 1 },
    spot: { col: 9, row: 12 },
    spots: { b: { col: 10, row: 12 }, c: { col: 11, row: 11 } },
    draw: { height: 70 }, // bench height, drawn px
  },
];
export const REST_STATION = 'REST';

// Walking and drawing, the same for everyone.
export const WALK = { height: 230, speed: 260 }; // drawn px at zoom 1 · plan units per second

// Idle spots are spread out so nobody stands in front of anyone else (tapping picks whoever is nearest the viewer).
// Each worker's routine: wait at their idle spot, then visit the next stop (in turn), stay there, walk back.
//   stops: [{ at: station id, spot: named spot (default: the station's spot), sec: how long, activity }]
//   activity 'working' drains Energy each day, 'resting' restores it (core/StaffSystem daily tick).
//   restSpot: where they go when Energy runs low (balance.js REST): they stay until it is back up.
export const ROUTINES = {
  MEC01: { idle: { col: 5, row: 7 }, idleSec: 2.5, restSpot: 'b', stops: [{ at: 'F02', sec: 4, activity: 'working' }] }, // Tessa: the Pit Bay loop
  DRV01: {
    idle: { col: 8, row: 8 },
    idleSec: 2,
    restSpot: 'spot',
    stops: [
      { at: 'F11', spot: 'visitor', sec: 4, activity: 'working' },
      { at: 'REST', sec: 5, activity: 'resting' },
    ],
  }, // Sam: the Strategy Desk or the rest spot
  ENG01: { idle: { col: 2, row: 10 }, idleSec: 2, restSpot: 'c', stops: [{ at: 'F11', sec: 7, activity: 'working' }] }, // Mara: the Strategy Desk
};

// What a worker's card says they are doing, per routine phase ({place} = the station's name).
export const WORKER_STATE_TEXT = {
  idle: 'Waiting at the idle spot',
  toWork: 'Walking to the {place}',
  working: 'Working at the {place}',
  back: 'Walking back to the idle spot',
  toRest: 'Walking to the rest spot',
  resting: 'Resting at the rest spot',
};
// Short assignment line for cards ("Pit Bay", "Strategy Desk").
export const ASSIGNMENT = { MEC01: 'F02', DRV01: 'F11', ENG01: 'F11' };
