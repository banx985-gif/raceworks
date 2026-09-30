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
// Milestone 14 (bible §13.2–13.3): a driver starting a course that has a matching drill (data/drills.js) chooses Auto
// Train (the default) or Play Drill: start(courseId, staffId, { mode: 'auto' | 'drill', drillId }). Each running course
// carries its bonus (drills[staffId] = { courseId, mode, drillId, pct, medal, pending }): Auto Train → +0%, or +12% when
// the course's drill is Mastered (account records, setDrillRecords); Play Drill → the medal's +8 / +16 / +25%, set by
// drillDone() when the drill ends (a fail, quit or hand back leaves +0%; a drill still pending at the end counts +0%).
// On finishing, the bonus adds that % of each gain: whole points to the stat now (never past the tier cap), the fraction
// kept on the person (counters.trainFrac) so the % is exact over time; Endurance Camp's trait XP gets it too. A drill
// medal also stores its trait XP (counters.drillXp, for the trait framework — no effect yet).
// Events: core's 'training:start' / 'training:complete' / 'training:cancel'; 'training:bonus' { staff, course, pct,
// extra } when a bonus is applied.
import { TrainingSystem } from '../../../../core/TrainingSystem.js';
import { Rng } from '../../../../core/Rng.js';
import { STAT_KEYS, ROLES } from '../../data/staff.js';
import { COURSES, TRAINING_SLOTS, TRAINING, ENDURANCE } from '../../data/training.js';
import { drillById, drillsForCourse } from '../../data/drills.js';
import { bonusPct } from './drills.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function createTraining({ bus, team, seed = 'raceworks' }) {
  const staff = team.staff;
  let drills = {}; // staffId → the running course's drill choice and bonus (saved)
  let records = null; // the account's drill records (src/systems/drills.js), set by the game
  // The drill bonus on a finished course: that % of each gain (fractions carried on the person).
  function applyBonus(s, c, gains) {
    const b = drills[s.id];
    delete drills[s.id];
    if (!b || b.courseId !== c.id || !b.pct) return;
    const extra = {};
    const frac = (s.counters.trainFrac ??= {});
    for (const [k, g] of Object.entries(gains)) {
      const exact = (g * b.pct) / 100 + (frac[k] ?? 0);
      const whole = Math.floor(exact + 1e-9);
      const cap = staff.statCap(s, k);
      const add = Math.max(0, Math.min(whole, cap - s.stats[k]));
      s.stats[k] += add;
      frac[k] = add === whole ? Math.round((exact - whole) * 1000) / 1000 : 0; // at the cap nothing is carried
      extra[k] = add;
    }
    if (c.id === 'endurance') {
      const xp = Math.round((ENDURANCE.traitXp * b.pct) / 100);
      s.counters.traitXp = (s.counters.traitXp ?? 0) + xp;
      extra.traitXp = xp;
    }
    bus.emit('training:bonus', { staff: s, course: c, pct: b.pct, mode: b.mode, medal: b.medal, extra });
  }
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
      onComplete: (s, c, gains) => {
        if (c.id === 'endurance') {
          s.energy = 100;
          s.counters.enduranceCamps = Math.min(ENDURANCE.maxCamps, (s.counters.enduranceCamps ?? 0) + 1);
          s.counters.traitXp = (s.counters.traitXp ?? 0) + ENDURANCE.traitXp;
        }
        applyBonus(s, c, gains); // Milestone 14
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
  // mode 'auto' (Auto Train, the default) or 'drill' (Play Drill: drillDone() sets the bonus when it ends).
  function start(courseId, staffId, { mode = 'auto', drillId = null } = {}) {
    if (mode === 'drill' && !drillChoices(courseId, staffId).some((d) => d.id === drillId)) return { ok: false, reason: 'That drill doesn’t match this course' };
    const r = courses.start(courseId, staffId);
    if (!r.ok) {
      const o = options(staffId).find((x) => x.course.id === courseId);
      return { ok: false, reason: o?.why ?? r.reason };
    }
    const mastered = !!records?.courseMastered(courseId);
    drills[staffId] = { courseId, mode, drillId: mode === 'drill' ? drillId : null, medal: null, pending: mode === 'drill', pct: mode === 'drill' ? 0 : bonusPct({ mode: 'auto', mastered }) };
    return { ...r, bonus: drills[staffId] };
  }
  // The drills a person may play for this course: drivers only (bible §13.2), the course's matching drills.
  const drillChoices = (courseId, staffId) => (staff.get(staffId)?.role === 'driver' ? drillsForCourse(courseId) : []);
  // A played drill ended: its medal (or null: fail / quit / hand back / skip) sets the course's bonus. Trait XP from a
  // medal is stored on the driver.
  function drillDone(staffId, { medal = null } = {}) {
    const b = drills[staffId];
    if (!b || b.mode !== 'drill' || !b.pending) return null;
    b.pending = false;
    b.medal = medal;
    b.pct = bonusPct({ mode: 'drill', medal });
    const s = staff.get(staffId);
    const d = drillById(b.drillId);
    if (s && medal && d) {
      const xp = (s.counters.drillXp ??= {});
      const mult = { bronze: 0.5, silver: 0.75, gold: 1 }[medal];
      for (const [k, v] of Object.entries(d.traitXp)) xp[k] = (xp[k] ?? 0) + Math.round(v * mult);
    }
    return b;
  }
  // Capacity for the screen: [{ id, name, used, total, who }].
  const capacity = () => TRAINING_SLOTS.map((sl) => ({ id: sl.id, name: sl.name, used: courses.used(sl.id), total: courses.slotCount(sl), who: usedBy(sl.id) }));
  // Where someone on a course stands: the course's station, or the Driver Simulator, or the rest spot.
  const stationFor = (courseId, has) => {
    const c = courses.course(courseId);
    return [c?.station, TRAINING.noStation, 'REST'].find((id) => id && has(id)) ?? null;
  };

  // Someone left: their course ends (no refund).
  bus.on('staff:removed', ({ staff: s }) => {
    courses.cancel(s.id);
    delete drills[s.id];
  });

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
    // Milestone 14: drills
    drillChoices,
    drillDone,
    bonusOf: (staffId) => drills[staffId] ?? null,
    setDrillRecords: (r) => (records = r),
    get drillRecords() {
      return records;
    },
    newGame: () => {
      courses.reset();
      drills = {};
    },
    serialize: () => ({ ...courses.serialize(), drills: JSON.parse(JSON.stringify(drills)) }),
    load: (data) => {
      courses.load(data ?? null);
      drills = JSON.parse(JSON.stringify(data?.drills ?? {})); // none before Milestone 14
    },
  };
}
