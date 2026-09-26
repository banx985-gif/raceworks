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
};

// Stations. fp = footprint on the grid (blocked for walking). spot = where a worker stands to use it.
// draw: art width as a share of the footprint's drawn width; drop = how far below the footprint's
// bottom corner the art's base sits, in cell heights.
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
    draw: { width: 1.12, drop: 0.3 },
  },
];

// The one worker (bible §11.2 MEC01). Loop: idle spot → Pit Bay → work → back.
export const WORKER = {
  id: 'MEC01',
  name: 'Tessa Bolt',
  role: 'Mechanic',
  art: 'staff_mec01',
  blurb: 'Mechanic. Fits parts and keeps the car running.',
  height: 230, // drawn px at zoom 1
  speed: 260, // plan units per second
  idle: { col: 4, row: 9 },
  workAt: 'F02',
  idleSec: 2.5,
  workSec: 4,
};

// What the worker's card says she is doing, per routine phase.
export const WORKER_STATE_TEXT = {
  idle: 'Waiting at her spot',
  toWork: 'Walking to the Pit Bay',
  working: 'Working at the Pit Bay',
  back: 'Walking back to her spot',
};
