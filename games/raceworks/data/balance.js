// RACEWORKS tuning numbers. Plain data only.

export const SAVE_VERSION = 2; // raise with a migration in src/app/Team.js when the save shape changes

// Staff rules for core/StaffSystem (anything not listed uses its defaults: working −0.7…−1.5 Energy a day,
// resting +4 a day, Tired < 25 Energy, Stressed < 25 Morale, Inspired chance 5% a day above 85 Morale / 65 Energy).
export const STAFF_RULES = {
  startEnergy: 100,
  startMorale: 75, // the same as Robot Workshop
  levelCap: 50, // bible §10.5
};

// Calendar (core/Clock). One day takes this many real seconds at 1×.
export const CLOCK = { secondsPerDay: 2.5, daysPerMonth: 28, monthsPerYear: 12 };

// When a worker leaves their routine to recover at the rest spot, and when they go back to it.
export const REST = { goBelowEnergy: 30, backAtEnergy: 90 };
