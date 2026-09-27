// Rivals and privateers (Milestone 6; bible §28, §28.1, §23.2 / §28.2 field builder). Plain data only.
// Every car in a race has a named driver with the six derived ratings (bible §10.3 / §28.1) — no driverless cars.
//   ratings: qualifying, racecraft, wet, tyreCare, consistency, feedback (the same keys as data/staff.js DRIVER_RATINGS)
//   car: the team's car stats for this band (bible §14.4). The bible gives rival DRIVERS, not rival cars: every car
//     number here is a PLACEHOLDER, set so a first-season Club Hatch (~140–200 per stat) is in the mix.
//   crew: the team's crew factor 0–400 (setup / strategy / reliability / aero, bible §23.4) — PLACEHOLDER.
//   sprite: the top-down race sprite (assets/images/cars/car_vNN_top.png, drawn nose DOWN).

const R = (qualifying, racecraft, wet, tyreCare, consistency, feedback) => ({ qualifying, racecraft, wet, tyreCare, consistency, feedback });

export const RIVAL_TEAMS = {
  R01: {
    name: 'Copperline Motorsport',
    short: 'Copperline',
    identity: 'Balanced development',
    colour: '#C8742E',
    sprite: 'car_v04_top',
    bands: { club: { car: { SPD: 168, ACC: 160, COR: 166, BRK: 150, REL: 205, EFF: 150, TYR: 158 }, crew: 100 } },
    drivers: [
      { id: 'R01D1', name: 'Eli Mercer', ratings: R(105, 112, 92, 110, 120, 104), identity: 'dependable all-rounder' },
      { id: 'R01D2', name: 'June Vale', ratings: R(118, 106, 104, 98, 112, 116), identity: 'stronger qualifier/feedback' },
    ],
  },
  R02: {
    name: 'Redshift Works',
    short: 'Redshift',
    identity: 'Power/acceleration',
    colour: '#D8352A',
    sprite: 'car_v05_top',
    // Strong starts, tyre-heavy cars (bible §28): more SPD / ACC, less TYR.
    bands: { club: { car: { SPD: 182, ACC: 180, COR: 150, BRK: 146, REL: 178, EFF: 138, TYR: 130 }, crew: 95 } },
    drivers: [
      { id: 'R02D1', name: 'Rex Kade', ratings: R(155, 148, 105, 82, 118, 102), identity: 'launch/attack specialist' },
      { id: 'R02D2', name: 'Lina Volt', ratings: R(143, 152, 112, 88, 121, 106), identity: 'aggressive racecraft' },
    ],
  },
};

// Privateers A–F (bible §28.2): fixed data templates that only fill the field. Generic, no portraits or logos.
export const PRIVATEERS = [
  { id: 'PVA', name: 'Owen Marsh', team: 'Privateer A', sprite: 'car_v02_top', ratings: R(92, 95, 88, 96, 102, 85), car: { SPD: 150, ACC: 148, COR: 150, BRK: 140, REL: 190, EFF: 145, TYR: 150 }, crew: 78 },
  { id: 'PVB', name: 'Priya Stroud', team: 'Privateer B', sprite: 'car_v03_top', ratings: R(98, 90, 94, 104, 98, 90), car: { SPD: 146, ACC: 142, COR: 158, BRK: 144, REL: 185, EFF: 150, TYR: 160 }, crew: 82 },
  { id: 'PVC', name: 'Hugo Blake', team: 'Privateer C', sprite: 'car_v06_top', ratings: R(88, 99, 84, 90, 96, 82), car: { SPD: 158, ACC: 150, COR: 142, BRK: 138, REL: 175, EFF: 140, TYR: 142 }, crew: 72 },
  { id: 'PVD', name: 'Tess Rourke', team: 'Privateer D', sprite: 'car_v02_top', ratings: R(95, 93, 100, 99, 105, 92), car: { SPD: 148, ACC: 146, COR: 152, BRK: 146, REL: 195, EFF: 148, TYR: 152 }, crew: 80 },
  { id: 'PVE', name: 'Callum Reyes', team: 'Privateer E', sprite: 'car_v03_top', ratings: R(90, 92, 86, 94, 100, 88), car: { SPD: 152, ACC: 150, COR: 146, BRK: 142, REL: 188, EFF: 144, TYR: 148 }, crew: 76 },
  { id: 'PVF', name: 'Ada Finch', team: 'Privateer F', sprite: 'car_v06_top', ratings: R(96, 97, 90, 92, 99, 86), car: { SPD: 154, ACC: 152, COR: 148, BRK: 144, REL: 182, EFF: 142, TYR: 146 }, crew: 78 },
];

// The M6 test race (Compete → Test Race; replaced by race weekends in M7 and championships in M20).
//   rivalPool: teams that enter, in order; fieldSize: cars in total (bible §23.2 normal is 10 — 8 for now).
export const TEST_RACE = { trackId: 'T01', rivalPool: ['R01', 'R02'], band: 'club', fieldSize: 8 };
export const FIELD_CAP = 12; // bible §23.2 hard cap
