// Ordinary Auto Training (Milestone 12, bible §13.1). Plain data only; the rules are core/TrainingSystem.js and
// src/systems/training.js. Manual driver drills are Milestone 14.

// The seven courses — days, cost and gain exactly as bible §13.1 (min = max: the bible gives one number). effect is
// core TrainingSystem's shape; 'none' = no stat gain (Endurance Camp: its gain is ENDURANCE below). Every course needs
// Auto Training (the Driver Simulator, F12). station: where they go to train (a sold station → the Driver Simulator,
// else the rest spot). slot: the Driver Simulator course takes the simulator seat (one person at a time).
export const COURSES = [
  { id: 'workshop', name: 'Workshop Fundamentals', days: 10, cost: 500, gainText: 'MEC +8', effect: { kind: 'stat', stat: 'MEC', min: 8, max: 8 }, station: 'F01' },
  { id: 'engineering', name: 'Engineering Analysis', days: 12, cost: 700, gainText: 'ENG +9', effect: { kind: 'stat', stat: 'ENG', min: 9, max: 9 }, station: 'F03' },
  { id: 'aero', name: 'Aero Study', days: 12, cost: 700, gainText: 'AER +9', effect: { kind: 'stat', stat: 'AER', min: 9, max: 9 }, station: 'F10' },
  { id: 'strategy', name: 'Strategy Review', days: 10, cost: 650, gainText: 'STR +8', effect: { kind: 'stat', stat: 'STR', min: 8, max: 8 }, station: 'F11' },
  { id: 'driverSim', name: 'Driver Simulator', days: 10, cost: 700, gainText: 'DRV +9', effect: { kind: 'stat', stat: 'DRV', min: 9, max: 9 }, station: 'F12', slot: 'simulator' },
  { id: 'endurance', name: 'Endurance Camp', days: 14, cost: 900, gainText: 'Energy recovery + trait XP', effect: { kind: 'none', min: 0, max: 0 }, station: 'REST' },
  { id: 'crossDiscipline', name: 'Cross-Discipline Seminar', days: 16, cost: 1200, gainText: '+4 to the two lowest stats', effect: { kind: 'lowest', count: 2, min: 4, max: 4 }, station: 'F11' },
].map((c) => ({ ...c, currency: 'credits', requires: { feature: 'autoTraining' } }));

// Training capacity. slots (core TrainingSystem): the simulator seat (only the Driver Simulator course; one per
// facility effect trainingSeats.simulator — the Driver Simulator gives 1) and the training places for the other six
// courses (studyPlaces, PLACEHOLDER, plus any facility's trainingSeats.study). No Driver Simulator in the garage → no
// Auto Training at all (its unlock.autoTraining effect).
export const TRAINING_SLOTS = [
  { id: 'simulator', name: 'Driver Simulator seat', roles: null, courseOnly: true },
  { id: 'study', name: 'Training place', roles: null },
];
export const TRAINING = {
  studyPlaces: 2, // PLACEHOLDER
  xpOnComplete: 40, // PLACEHOLDER: bible §10.5 "XP from … training"
  successMorale: 2, // Morale on finishing (bible §10.4: training can raise morale) — core's default
  noStation: 'F12', // a course whose station was sold is taken at the Driver Simulator instead
};

// Endurance Camp (bible §13.1 "Energy max recovery efficiency + trait XP"). PLACEHOLDER numbers: Energy back to full
// at the end, +recoveryPct resting recovery for good (up to maxCamps camps), and traitXp towards traits (stored for the
// trait framework, Milestone 13).
export const ENDURANCE = { recoveryPct: 10, maxCamps: 3, traitXp: 100 };
