// Rivals and privateers (Milestone 6; bible §28, §28.1, §23.2 / §28.2 field builder). Plain data only.
// Every car in a race has a named driver with the six derived ratings (bible §10.3 / §28.1) — no driverless cars.
//   ratings: qualifying, racecraft, wet, tyreCare, consistency, feedback (the same keys as data/staff.js DRIVER_RATINGS)
//   car: the team's car stats for this band (bible §14.4). The bible gives rival DRIVERS, not rival cars: every car
//     number here is a PLACEHOLDER, set so a first-season Club Hatch (~140–200 per stat) is in the mix.
//   crew: the team's crew factor 0–400 (setup / strategy / reliability / aero, bible §23.4) — PLACEHOLDER.
//   family: the car visual family (data/cars.js CAR_FAMILIES): sprite = its top-down race picture (drawn nose DOWN), and
//     the race result shows its showcase picture.

import { CAR_FAMILIES } from './cars.js';

const R = (qualifying, racecraft, wet, tyreCare, consistency, feedback) => ({ qualifying, racecraft, wet, tyreCare, consistency, feedback });
// Milestone 20: every team also has its logo (logos/rival_logo_rNN), its first championship (bible §28) and a car shape —
// its identity as a × on each stat of the championship band's car level (data/championships.js CHAMP_BANDS). PLACEHOLDER
// shapes. The M6 'club' band stays the practice race's field, unchanged.
const ALL = (v) => ({ SPD: v, ACC: v, COR: v, BRK: v, REL: v, EFF: v, TYR: v });

export const RIVAL_TEAMS = {
  R01: {
    name: 'Copperline Motorsport',
    short: 'Copperline',
    identity: 'Balanced development',
    strength: 'Reliable club-to-national pace',
    first: 'C01',
    logo: 'rival_logo_r01',
    shape: { ...ALL(1), REL: 1.12 },
    colour: '#C8742E',
    family: 'V04', sprite: CAR_FAMILIES.V04.top,
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
    strength: 'Strong starts, tyre-heavy cars',
    first: 'C02',
    logo: 'rival_logo_r02',
    shape: { ...ALL(1), SPD: 1.1, ACC: 1.12, TYR: 0.85 },
    colour: '#D8352A',
    family: 'V05', sprite: CAR_FAMILIES.V05.top,
    // Strong starts, tyre-heavy cars (bible §28): more SPD / ACC, less TYR.
    bands: { club: { car: { SPD: 182, ACC: 180, COR: 150, BRK: 146, REL: 178, EFF: 138, TYR: 130 }, crew: 95 } },
    drivers: [
      { id: 'R02D1', name: 'Rex Kade', ratings: R(155, 148, 105, 82, 118, 102), identity: 'launch/attack specialist' },
      { id: 'R02D2', name: 'Lina Volt', ratings: R(143, 152, 112, 88, 121, 106), identity: 'aggressive racecraft' },
    ],
  },
  // Milestone 20: the other six (bible §28 / §28.1 — the drivers' ratings exactly as the bible's base profiles)
  R03: {
    name: 'Ironclad Racing', short: 'Ironclad', identity: 'Reliability/pit work', strength: 'Hard to retire, strong endurance', first: 'C03', logo: 'rival_logo_r03',
    shape: { ...ALL(1), REL: 1.3, TYR: 1.1, SPD: 0.95 }, colour: '#6E7B87', family: 'V07', sprite: CAR_FAMILIES.V07.top, bands: {},
    drivers: [
      { id: 'R03D1', name: 'Bruno Slate', ratings: R(132, 140, 118, 148, 158, 122), identity: 'durable long-run driver' },
      { id: 'R03D2', name: 'Mae Rowan', ratings: R(126, 136, 125, 152, 162, 130), identity: 'tyre/reliability specialist' },
    ],
  },
  R04: {
    name: 'Solar Apex', short: 'Solar Apex', identity: 'Efficiency/strategy', strength: 'Long stints and undercuts', first: 'C04', logo: 'rival_logo_r04',
    shape: { ...ALL(1), EFF: 1.25, TYR: 1.12 }, colour: '#E8A21C', family: 'V09', sprite: CAR_FAMILIES.V09.top, bands: {},
    drivers: [
      { id: 'R04D1', name: 'Nora Sol', ratings: R(162, 168, 148, 170, 166, 174), identity: 'strategy-sensitive long stints' },
      { id: 'R04D2', name: 'Tariq Wynn', ratings: R(170, 160, 155, 164, 158, 180), identity: 'strong technical feedback' },
    ],
  },
  R05: {
    name: 'Vanta Dynamics', short: 'Vanta', identity: 'Aerodynamics', strength: 'Fast technical-circuit pace', first: 'C05', logo: 'rival_logo_r05',
    shape: { ...ALL(1), COR: 1.18, BRK: 1.06, SPD: 0.97 }, colour: '#3D3A4E', family: 'V08', sprite: CAR_FAMILIES.V08.top, bands: {},
    drivers: [
      { id: 'R05D1', name: 'Iris Vane', ratings: R(205, 196, 172, 168, 188, 214), identity: 'technical-circuit ace' },
      { id: 'R05D2', name: 'Mika Crest', ratings: R(198, 202, 180, 174, 194, 208), identity: 'aero/setup specialist' },
    ],
  },
  R06: {
    name: 'Blue Meridian', short: 'Blue Meridian', identity: 'Driver development', strength: 'High driver consistency', first: 'C06', logo: 'rival_logo_r06',
    shape: ALL(1.03), colour: '#2E6FC2', family: 'V13', sprite: CAR_FAMILIES.V13.top, bands: {},
    drivers: [
      { id: 'R06D1', name: 'Tomas Reed', ratings: R(230, 238, 214, 224, 252, 216), identity: 'highly consistent developer' },
      { id: 'R06D2', name: 'Aya North', ratings: R(236, 244, 220, 230, 260, 222), identity: 'balanced high-level ace' },
    ],
  },
  R07: {
    name: 'Crown Vector', short: 'Crown Vector', identity: 'Elite all-rounder', strength: 'World-level benchmark', first: 'C09', logo: 'rival_logo_r07',
    shape: ALL(1.08), colour: '#8A6A1E', family: 'V14', sprite: CAR_FAMILIES.V14.top, bands: {},
    drivers: [
      { id: 'R07D1', name: 'Lucian Hart', ratings: R(318, 326, 304, 296, 334, 310), identity: 'world-class benchmark' },
      { id: 'R07D2', name: 'Rhea Quill', ratings: R(326, 334, 312, 304, 342, 318), identity: 'elite all-rounder' },
    ],
  },
  // The only secret rival (SEC-RIVAL-01): never in a field except under the ?debug=1 override (no activation logic yet).
  R08: {
    name: 'Ghostline Racing', short: 'Ghostline', identity: 'Adaptive prestige', strength: 'Secret rival; learns player tendencies', first: 'SEC-RIVAL-01', secret: 'SEC-RIVAL-01', logo: 'rival_logo_r08',
    shape: ALL(1.15), colour: '#1B1D22', family: 'V20', sprite: CAR_FAMILIES.V20.top, bands: {},
    drivers: [
      { id: 'R08D1', name: 'Nyx Grey', ratings: R(410, 426, 418, 402, 432, 420), identity: 'adaptive prestige ace' },
      { id: 'R08D2', name: 'Noct Arden', ratings: R(422, 438, 406, 414, 440, 412), identity: 'high-risk prestige attacker' },
    ],
  },
};

// Privateers A–F (bible §28.2): fixed data templates that only fill the field. Generic, no portraits or logos.
// Milestone 20: each template also has a second driver (second), so a 10 / 12-car field can always be filled (C01 has only
// Copperline), and they scale with the championship tier (PRIVATEER_TIERS).
export const PRIVATEERS = [
  { id: 'PVA', name: 'Owen Marsh', team: 'Privateer A', family: 'V02', sprite: CAR_FAMILIES.V02.top, ratings: R(92, 95, 88, 96, 102, 85), car: { SPD: 150, ACC: 148, COR: 150, BRK: 140, REL: 190, EFF: 145, TYR: 150 }, crew: 78, second: { name: 'Kit Marsh', ratings: R(90, 93, 86, 94, 100, 84) } },
  { id: 'PVB', name: 'Priya Stroud', team: 'Privateer B', family: 'V03', sprite: CAR_FAMILIES.V03.top, ratings: R(98, 90, 94, 104, 98, 90), car: { SPD: 146, ACC: 142, COR: 158, BRK: 144, REL: 185, EFF: 150, TYR: 160 }, crew: 82, second: { name: 'Dev Stroud', ratings: R(95, 91, 92, 100, 97, 88) } },
  { id: 'PVC', name: 'Hugo Blake', team: 'Privateer C', family: 'V06', sprite: CAR_FAMILIES.V06.top, ratings: R(88, 99, 84, 90, 96, 82), car: { SPD: 158, ACC: 150, COR: 142, BRK: 138, REL: 175, EFF: 140, TYR: 142 }, crew: 72, second: { name: 'Rosa Blake', ratings: R(90, 97, 86, 91, 95, 83) } },
  { id: 'PVD', name: 'Tess Rourke', team: 'Privateer D', family: 'V02', sprite: CAR_FAMILIES.V02.top, ratings: R(95, 93, 100, 99, 105, 92), car: { SPD: 148, ACC: 146, COR: 152, BRK: 146, REL: 195, EFF: 148, TYR: 152 }, crew: 80, second: { name: 'Jonah Rourke', ratings: R(93, 94, 97, 97, 102, 90) } },
  { id: 'PVE', name: 'Callum Reyes', team: 'Privateer E', family: 'V03', sprite: CAR_FAMILIES.V03.top, ratings: R(90, 92, 86, 94, 100, 88), car: { SPD: 152, ACC: 150, COR: 146, BRK: 142, REL: 188, EFF: 144, TYR: 148 }, crew: 76, second: { name: 'Mira Reyes', ratings: R(92, 90, 88, 95, 98, 87) } },
  { id: 'PVF', name: 'Ada Finch', team: 'Privateer F', family: 'V06', sprite: CAR_FAMILIES.V06.top, ratings: R(96, 97, 90, 92, 99, 86), car: { SPD: 154, ACC: 152, COR: 148, BRK: 144, REL: 182, EFF: 142, TYR: 146 }, crew: 78, second: { name: 'Sol Finch', ratings: R(94, 96, 89, 93, 97, 85) } },
];

// The M6 test race (Compete → Test Race; replaced by race weekends in M7 and championships in M20).
//   rivalPool: teams that enter, in order; fieldSize: cars in total (bible §23.2 normal is 10 — 8 for now).
export const TEST_RACE = { trackId: 'T01', rivalPool: ['R01', 'R02'], band: 'club', fieldSize: 8 };
export const FIELD_CAP = 12; // bible §23.2 hard cap
// Milestone 20: privateers by championship tier — × on their ratings, cars and crew (PLACEHOLDER).
export const PRIVATEER_TIERS = { club: { ratings: 1, car: 1.05, crew: 1 }, national: { ratings: 1.45, car: 1.5, crew: 1.6 }, world: { ratings: 2.1, car: 2.1, crew: 2.4 } };
