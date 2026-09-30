// Ordinary Auto Training (Milestone 12, bible §13.1) on the shared core/TrainingSystem, driven by data/training.js.
// Saved with the team.
//
// Seven courses with the bible's days, costs and gains. Any role may take any course. A course needs Auto Training —
// the Driver Simulator (F12, unlock.autoTraining) standing in the garage — costs Credits through the ledger ("Training")
// and takes the person off their routine: they walk to the course's station (data/training.js) and stay there until it
// ends, then go back to work. Gains never pass the tier's stat cap (core); a course with nothing left to gain can't be
// started. Capacity: the Driver Simulator course uses the simulator seat — one person at a time (facility effect
// trainingSeats.simulator); the other six share the training places (TRAINING.studyPlaces + trainingSeats.study).
// Someone on the car's team can't start a course, and someone on a course can't join the car's team or be let go.
// On finishing: the stat gains, Morale, XP (bible §10.5), and for Endurance Camp full Energy, a lasting resting-recovery
// bonus (StaffSystem restModifier, see Team) and trait XP stored for Milestone 13.
//
// Events: core's 'training:start' / 'training:complete' / 'training:cancel'.
import { TrainingSystem } from '../../../../core/TrainingSystem.js';
import { Rng } from '../../../../core/Rng.js';
import { STAT_KEYS, ROLES } from '../../data/staff.js';
import { COURSES, TRAINING_SLOTS, TRAINING, ENDURANCE } from '../../data/training.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function createTraining({ bus, team, seed = 'raceworks' }) {
  const staff = team.staff;
  const fac = () => team.facilities;
  const onCar = (id) => {
    const job = team.cars.active;
    return job && job.slots.includes(id) ? job : null;
  };
  const courses = new TrainingSystem({
    rng: new Rng(`${seed}-training`),
    bus,
    staff: { get: (id) => staff.get(id) },
    statKeys: STAT_KEYS,
    courses: COURSES,
    slots: TRAINING_SLOTS,
    rules: { successMorale: TRAINING.successMorale },
    hooks: {
      statCap: (s, k) => staff.statCap(s, k),
      primaryStat: (s) => ROLES[s.role]?.primaryStat,
      slotCount: (slot) => (!fac().unlocked('autoTraining') ? 0 : slot.id === 'simulator' ? fac().bonus('trainingSeats.simulator') : TRAINING.studyPlaces + fac().bonus('trainingSeats.study')),
      conditionMet: (rule) => (rule.feature ? fac().unlocked(rule.feature) : true),
      busyElsewhere: (id) => {
        const job = onCar(id);
        return job ? `On the ${job.name} team` : null;
      },
      canPay: (c) => (team.money.affordable(c.cost) ? null : `Needs ${fmt(c.cost)} Credits`),
      pay: (c, s) => team.money.economy.add('credits', -c.cost, `Training: ${c.name} (${s.name})`, 'training'),
      now: () => ({ day: team.clock.totalDays, year: team.clock.year }),
      onComplete: (s, c) => {
        if (c.id === 'endurance') {
          s.energy = 100;
          s.counters.enduranceCamps = Math.min(ENDURANCE.maxCamps, (s.counters.enduranceCamps ?? 0) + 1);
          s.counters.traitXp = (s.counters.traitXp ?? 0) + ENDURANCE.traitXp;
        }
        s.counters.trainings = (s.counters.trainings ?? 0) + 1;
        staff.addXp(s, TRAINING.xpOnComplete);
        staff.refreshStatus(s);
        bus.emit('team:changed', { staff: s, what: 'training' });
      },
    },
  });

  // Why a course is shut for everyone, in words.
  const lockedText = 'Build a Driver Simulator: it opens staff training';
  // Every course for one person: { course, ok, why, preview: [{ key, from, min, max, cap }] }.
  function options(staffId) {
    return COURSES.map((c) => {
      let why = courses.courseBlock(c.id);
      if (why === 'Locked') why = lockedText;
      why ??= courses.workerBlock(c.id, staffId);
      if (why === 'No free training slot') why = c.slot === 'simulator' ? `The simulator is in use (${usedBy('simulator')})` : 'Every training place is in use';
      return { course: c, ok: !why, why, preview: courses.preview(c.id, staffId) };
    });
  }
  const usedBy = (slotId) =>
    courses.active
      .filter((a) => a.slotId === slotId)
      .map((a) => `${staff.get(a.staffId)?.name.split(' ')[0] ?? '?'}, ${a.days - a.daysDone} day${a.days - a.daysDone === 1 ? '' : 's'} left`)
      .join('; ');
  function start(courseId, staffId) {
    const r = courses.start(courseId, staffId);
    if (!r.ok) {
      const o = options(staffId).find((x) => x.course.id === courseId);
      return { ok: false, reason: o?.why ?? r.reason };
    }
    return r;
  }
  // Capacity for the screen: [{ id, name, used, total, who }].
  const capacity = () => TRAINING_SLOTS.map((sl) => ({ id: sl.id, name: sl.name, used: courses.used(sl.id), total: courses.slotCount(sl), who: usedBy(sl.id) }));
  // Where someone on a course stands: the course's station, or the Driver Simulator, or the rest spot.
  const stationFor = (courseId, has) => {
    const c = courses.course(courseId);
    return [c?.station, TRAINING.noStation, 'REST'].find((id) => id && has(id)) ?? null;
  };

  // Someone left: their course ends (no refund).
  bus.on('staff:removed', ({ staff: s }) => courses.cancel(s.id));

  return {
    // The Team calls this each game day after the staff day (so a course's last day and its Energy effects come last).
    dailyTick: () => courses.dailyTick(),
    courses,
    options,
    start,
    capacity,
    stationFor,
    get active() {
      return courses.active;
    },
    trainingOf: (id) => courses.trainingOf(id),
    courseOf: (id) => courses.course(courses.trainingOf(id)?.courseId),
    daysLeft: (id) => {
      const t = courses.trainingOf(id);
      return t ? t.days - t.daysDone : 0;
    },
    open: () => fac().unlocked('autoTraining'),
    lockedText,
    newGame: () => courses.reset(),
    serialize: () => courses.serialize(),
    load: (data) => courses.load(data ?? null),
  };
}
