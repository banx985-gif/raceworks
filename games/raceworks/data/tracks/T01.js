// T01 Pine Ridge Club Circuit (bible §26): balanced, ~2.4 km, 10 turns, mild, forgiving runoff — the learning track.
// THE TRACK IS THIS DATA (bible §23.1). Cars drive on it, the circuit is drawn from it in code, the minimap and the
// art guide come from it. assets/images/tracks/track_t01.png is only a scenery picture for the pre-race card.
// Plain data only; src/race/trackGeometry.js builds it, src/race/trackValidator.js checks it.
//
// Units: metres, y down (like the screen). The lap starts at the start/finish line (the first centre point) and
// runs up the right-hand straight. Everything along the lap is a lap fraction 0–1 (0 = start/finish).
// Changing any geometry here means raising geometryVersion AND artGuideVersion, re-exporting the art guide
// (node tests/raceworks/export-track-guide.mjs) and re-checking the art (bible §23.1 steps 2–5).

// Car-stat demand weights by kind of timing segment (bible §23.4 carFit; sums to 1). PLACEHOLDER mixes.
const DEMAND = {
  straight: { SPD: 0.4, ACC: 0.2, EFF: 0.15, REL: 0.15, TYR: 0.1 },
  braking: { BRK: 0.45, SPD: 0.1, COR: 0.15, REL: 0.1, TYR: 0.2 },
  corner: { COR: 0.45, TYR: 0.2, BRK: 0.1, ACC: 0.15, REL: 0.1 },
  exit: { ACC: 0.45, COR: 0.2, TYR: 0.15, SPD: 0.1, REL: 0.1 },
};
// Reference speed (m/s) of a baseline club car through each kind: base segment time = length / refSpeed.
const REF = { straight: 44, braking: 30, corner: 21, exit: 28 };
const seg = (id, from, to, kind, extra = {}) => ({ id, from, to, kind, demand: DEMAND[kind], refSpeed: extra.refSpeed ?? REF[kind], ...extra });

export const T01 = {
  id: 'T01',
  name: 'Pine Ridge Club Circuit',
  profile: 'Balanced',
  condition: 'Mild',
  identity: 'Club circuit with forgiving runoff; balanced learning track.',
  geometryVersion: 1,
  artGuideVersion: 1, // must match assets/_source/track_guides/T01_guide.json (a test checks it)
  artKey: 'track_t01', // scenery picture for the pre-race card only (never the racing surface)
  laps: 8, // the M6 test race (short race)
  sampleStep: 2, // metres between centreline samples
  width: 13, // default road width (m)
  minWidth: 11, // the validator's minimum anywhere on the lap
  widthBlend: 30, // metres over which a width change ramps
  // Wider at the start/finish (the grid) and through the forgiving T1 entry.
  widthZones: [
    { from: 0.96, to: 0.1, width: 15 },
    { from: 0.19, to: 0.27, width: 14 },
  ],
  // Closed centre spline (centripetal Catmull-Rom through these points), travelling in this order.
  centre: [
    { x: 517, y: 770 }, // start / finish
    { x: 517, y: 495 },
    { x: 517, y: 220 },
    { x: 484, y: 121 }, // T1
    { x: 407, y: 77 },
    { x: 319, y: 88 }, // T2
    { x: 264, y: 154 },
    { x: 264, y: 242 }, // T3
    { x: 319, y: 319 },
    { x: 330, y: 407 }, // T4
    { x: 275, y: 473 },
    { x: 187, y: 484 },
    { x: 110, y: 517 }, // T5
    { x: 77, y: 605 },
    { x: 110, y: 704 }, // T6
    { x: 66, y: 803 },
    { x: 88, y: 891 }, // T7
    { x: 176, y: 924 },
    { x: 275, y: 902 }, // T8
    { x: 352, y: 935 }, // T9
    { x: 429, y: 924 },
    { x: 495, y: 880 }, // T10
  ],
  // The ten named turns (apex lap fractions from the curvature; the validator checks each one really turns).
  turns: [
    { id: 'T1', name: 'Pine Hairpin', at: 0.27 },
    { id: 'T2', name: 'Lodge', at: 0.345 },
    { id: 'T3', name: 'Ridge Kink', at: 0.421 },
    { id: 'T4', name: 'Sawmill', at: 0.534 },
    { id: 'T5', name: 'Fern Bend', at: 0.602 },
    { id: 'T6', name: 'Creek', at: 0.687 },
    { id: 'T7', name: 'Hollow', at: 0.771 },
    { id: 'T8', name: 'Timber Chicane', at: 0.852 },
    { id: 'T9', name: 'Timber Exit', at: 0.886 },
    { id: 'T10', name: 'Home Bend', at: 0.953 },
  ],
  // Pit lane (bible §23.1): an open spline right of the main straight, leaving the track in T10 and rejoining before T1.
  pit: {
    width: 8,
    entry: 0.955, // lap fraction where the pit spline leaves the track
    exit: 0.13, // …and where it rejoins
    points: [
      { x: 499, y: 877 },
      { x: 517, y: 849 },
      { x: 533, y: 815 },
      { x: 545, y: 784 },
      { x: 550, y: 698 },
      { x: 550, y: 620 },
      { x: 548, y: 552 },
      { x: 537, y: 516 },
      { x: 526, y: 485 },
      { x: 520, y: 456 },
    ],
    mergeLength: 110, // metres at each end where the lane splits off / merges (the validator lets it touch the track there)
    boxes: { from: 0.3, to: 0.7 }, // the garage boxes, as a share of the pit lane
  },
  // 16 timing segments covering the whole lap (bible §23.1: 12–24), with stat demand and braking severity.
  segments: [
    seg('S1', 0.0, 0.09, 'straight'),
    seg('S2', 0.09, 0.19, 'straight'),
    seg('S3', 0.19, 0.25, 'braking', { braking: 0.8 }),
    seg('S4', 0.25, 0.32, 'corner'),
    seg('S5', 0.32, 0.4, 'corner', { refSpeed: 23 }),
    seg('S6', 0.4, 0.46, 'corner', { refSpeed: 25 }),
    seg('S7', 0.46, 0.51, 'exit'),
    seg('S8', 0.51, 0.57, 'corner', { braking: 0.5 }),
    seg('S9', 0.57, 0.64, 'corner', { refSpeed: 23 }),
    seg('S10', 0.64, 0.72, 'corner'),
    seg('S11', 0.72, 0.79, 'exit'),
    seg('S12', 0.79, 0.84, 'straight', { refSpeed: 38 }),
    seg('S13', 0.84, 0.87, 'braking', { braking: 0.6 }),
    seg('S14', 0.87, 0.92, 'corner', { refSpeed: 19 }),
    seg('S15', 0.92, 0.97, 'corner', { braking: 0.4, refSpeed: 24 }),
    seg('S16', 0.97, 1.0, 'exit'),
  ],
  // Where a car may try to pass (bible §23.5): the main straight into T1 and the back section into the chicane.
  overtakeZones: [
    { id: 'OZ1', from: 0.975, to: 0.25, difficulty: 0.35 },
    { id: 'OZ2', from: 0.785, to: 0.86, difficulty: 0.55 },
  ],
  brakingMarkers: [
    { turn: 'T1', at: 0.235, severity: 0.8 },
    { turn: 'T4', at: 0.515, severity: 0.5 },
    { turn: 'T8', at: 0.84, severity: 0.6 },
    { turn: 'T10', at: 0.935, severity: 0.4 },
  ],
  surfaceGrip: [{ from: 0, to: 1, grip: 1 }], // one grip zone (weather arrives later)
  weatherTable: { dry: 1 }, // M6: always dry
  // Camera framing hints: overview = the whole circuit; the grid is on the start/finish straight.
  cameraHints: { overview: { pad: 40 }, grid: { at: 0.0 } },
  // How the circuit is drawn (looks only — never the physics): road widths are drawn this many times wider than the
  // metres so cars read on a phone in the overview; the validator checks the drawn corridor never overlaps itself.
  display: { widthScale: 2.2, kerbMinCurv: 1 / 120, kerbDepth: 2.2, grass: '#6FA85A', grassDark: '#5E9A4C', road: '#55565C', roadEdge: '#EDEDED', kerbA: '#D8352A', kerbB: '#F4F1EA', pitRoad: '#6A6B72', runoff: '#CDBB8E' },
  // Grid slots: metres behind the start line, alternating sides (bible §22: the grid is set by qualifying from M7).
  grid: { firstGap: 10, rowGap: 9, lateral: 3.2 },
};
