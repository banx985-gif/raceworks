// Car projects (Milestone 4): the shared core/ProjectSystem (phases, daily progress, the 60% checkpoint, history)
// driven by RACEWORKS data (data/cars.js) and these rules, plugged in as its hooks:
//   workerModifier  +8% for the role whose main stat leads the phase (bible §10.7); nobody works while resting
//   onPhaseStart    a budget focus chosen during the last phase takes effect (bible §14.7: only between phases)
//   onDay           fault rolls in phases 2–4 (§14.8); Testing tries to fix open faults
//   onCheckpoint    one breakthrough roll at 60% of each phase (§14.9)
//   onPhaseComplete the phase's development points go into its car stats
//   onComplete      the finished car: 7 stats, QUALITY (§14.10), RATING, FAULTS, INNOVATION, history
//   statModifier    the founder's perk (Milestone 4b): +6% on their perk stat's share of their work
//   (onDay also takes a live founder perk extra for its phase off the fault chance: Tessa's −5% assembly faults)
// createCarProjects({ bus, rng, staff, isResting, today, stationIds, perkOf }) → { projects, assignments, cars, … helpers }
//   perkOf(staff) → the founder perk ({ stat, pct, extras }) when that person is the founder, else null.
//   stationIds() → staff with a garage station duty: they count as assigned (working) even when not on a car.
import { ProjectSystem } from '../../../../core/ProjectSystem.js';
import { AssignmentSystem } from '../../../../core/AssignmentSystem.js';
import { JobHistory } from '../../../../core/JobHistory.js';
import { CAR_STATS, CAR_STAT_MAX, PARTS, SLOTS, CLASSES, TIERS, PHASES, BUDGETS, PROJECT } from '../../data/cars.js';
import { ROLES, TRAITS } from '../../data/staff.js';

// The stat that leads a phase (its biggest weight) → the role that gets the match bonus.
export const leadStat = (phase) => Object.entries(phase.weights).sort((a, b) => b[1] - a[1])[0][0];
export const leadRole = (phase) => Object.keys(ROLES).find((r) => ROLES[r].primaryStat === leadStat(phase));

export const partsOf = (classId) => SLOTS.map((sl) => CLASSES[classId].starterParts[sl.id]);
export const partsCost = (partIds) => partIds.reduce((t, id) => t + PARTS[id].cost, 0);
export const tierFor = (partIds) => {
  const cx = partIds.reduce((t, id) => t + PARTS[id].cx, 0);
  return { ...TIERS.find((t) => cx <= t.maxCx), cx };
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The finished car's numbers from its class, parts and project record (also used by tests).
export function finalCar({ classId, parts, dev = {}, faults = [], innovation = 0, avgScore = 0 }) {
  const cls = CLASSES[classId];
  const stats = {};
  for (const k of CAR_STATS) {
    let v = cls.base[k] + (dev[k] ?? 0);
    for (const id of parts) v += PARTS[id].mods[k] ?? 0;
    stats[k] = v;
  }
  const open = faults.filter((f) => !f.fixed);
  for (const f of open) stats[f.stat] -= PROJECT.faults.statLoss; // an unresolved fault costs a relevant stat
  for (const k of CAR_STATS) stats[k] = Math.round(clamp(stats[k], 0, CAR_STAT_MAX));
  const classFit = CAR_STATS.reduce((t, k) => t + stats[k] * cls.weights[k], 0) / 100;
  const q = PROJECT.quality;
  const developmentScore = clamp((avgScore / q.devScoreFull) * 100, 0, 100);
  const quality = Math.round(clamp(classFit / q.classFitDiv + developmentScore * q.devWeight + innovation * q.innovationPerPoint - open.length * q.faultPenalty, 0, 100));
  return { stats, classFit, rating: Math.round(clamp(classFit, 0, 999)), developmentScore, quality, faults: open.length };
}

export function createCarProjects({ bus, rng, staff, isResting = () => false, today = () => 0, stationIds = () => [], perkOf = () => null }) {
  let projects = null;
  const assignments = new AssignmentSystem({ staff, getJobs: () => projects.jobs, bus, otherBusyIds: stationIds });
  const cars = new JobHistory({ bus });

  const budgetOf = (job) => BUDGETS[job.data.budget];
  const phaseDef = (phase) => PHASES.find((p) => p.id === phase.id);
  // A live founder perk extra that changes this phase's fault chance (Tessa: −5% in Assembly), when the founder is on
  // the car's team.
  const founderFaultPct = (job, def) =>
    projects.teamOf(job).reduce((t, s) => t + (perkOf(s)?.extras ?? []).filter((e) => e.live && e.phase === def.id && /FaultPct$/.test(e.key)).reduce((u, e) => u + e.value, 0), 0);
  const traitPct = (job, key) => projects.teamOf(job).reduce((t, s) => t + s.traits.reduce((u, id) => u + (TRAITS[id]?.effects?.[key] ?? 0), 0), 0);

  const hooks = {
    workerModifier(job, phase, s) {
      if (isResting(s.id)) return 0; // away recovering at the rest spot
      return ROLES[s.role]?.primaryStat === leadStat(phase) ? 1 + PROJECT.roleMatchPct / 100 : 1;
    },
    // Founder perk: "+6% <stat> contribution" — their perk stat counts 6% more in their share of the work.
    statModifier(job, phase, s, statKey) {
      const perk = perkOf(s);
      return perk && perk.stat === statKey ? 1 + perk.pct / 100 : 1;
    },
    onPhaseStart(job, phase) {
      if (job.data.nextBudget) {
        job.data.budget = job.data.nextBudget;
        job.data.nextBudget = null;
      }
      job.data.budgets.push(job.data.budget);
      bus.emit('car:phase', { job, phase });
    },
    onDay(job, phase, { score }) {
      const def = phaseDef(phase);
      const f = PROJECT.faults;
      if (def.faults) {
        const avgCx = job.data.parts.reduce((t, id) => t + PARTS[id].cx, 0) / job.data.parts.length;
        let pct = f.baseDailyPct * (1 + ((avgCx - 1) * f.complexityPctPerCx) / 100);
        if (score < f.lowScoreBelow) pct *= 1 + f.lowScorePct / 100;
        pct *= 1 + budgetOf(job).faultPct / 100;
        pct *= 1 + traitPct(job, 'faultPct') / 100;
        pct *= 1 + founderFaultPct(job, def) / 100;
        if (rng.chance(pct / 100)) addFault(job, def);
      }
      if (def.fixes) {
        const open = job.data.faults.find((x) => !x.fixed);
        if (open && rng.chance(f.testingFixDailyPct / 100)) {
          open.fixed = 'testing';
          open.fixedDay = today();
          bus.emit('car:fix', { job, fault: open, how: 'testing' });
        }
      }
    },
    onCheckpoint(job, phase) {
      const b = PROJECT.breakthrough;
      const pct = b.basePct + traitPct(job, 'breakthroughPct') + (job.data.pastInnovation ?? 0);
      if (rng.chance(pct / 100)) breakthrough(job, phaseDef(phase));
    },
    onPhaseComplete(job, phase, summary) {
      const def = phaseDef(phase);
      const pts = summary.avgScore * PROJECT.development.pointsPerScore * (1 + budgetOf(job).qualityPct / 100);
      addDevelopment(job, def, pts);
    },
    onComplete(job) {
      const sums = job.phaseSummaries;
      const avgScore = sums.length ? sums.reduce((t, p) => t + p.avgScore, 0) / sums.length : 0;
      const car = finalCar({ classId: job.data.classId, parts: job.data.parts, dev: job.data.dev, faults: job.data.faults, innovation: job.data.innovation, avgScore });
      return {
        classId: job.data.classId,
        className: CLASSES[job.data.classId].name,
        art: CLASSES[job.data.classId].art,
        parts: job.data.parts,
        ...car,
        innovation: job.data.innovation,
        faultsTotal: job.data.faults.length,
        faultList: job.data.faults,
        breakthroughs: job.data.breakthroughs,
        budgets: job.data.budgets,
        partsCost: partsCost(job.data.parts),
        startedDay: job.data.startedDay,
        finishedDay: today(),
      };
    },
    now: () => today(),
  };

  function addFault(job, def) {
    const fault = { id: job.data.faults.length + 1, phase: def.id, stat: Object.keys(def.develops)[0], day: today(), fixed: false };
    job.data.faults.push(fault);
    bus.emit('car:fault', { job, fault });
    return fault;
  }

  function addDevelopment(job, def, points) {
    const shares = Object.entries(def.develops);
    const total = shares.reduce((t, [, w]) => t + w, 0);
    for (const [k, w] of shares) job.data.dev[k] = (job.data.dev[k] ?? 0) + (points * w) / total;
  }

  // A breakthrough: remove an open fault if there is one, otherwise extra development for the phase's stats.
  function breakthrough(job, def) {
    const open = job.data.faults.find((x) => !x.fixed);
    let kind;
    if (open) {
      open.fixed = 'breakthrough';
      open.fixedDay = today();
      kind = 'fault fixed';
    } else {
      addDevelopment(job, def, PROJECT.breakthrough.extraDevelopment * Object.keys(def.develops).length);
      kind = 'extra development';
    }
    job.data.innovation += PROJECT.breakthrough.innovation;
    const b = { phase: def.id, day: today(), kind };
    job.data.breakthroughs.push(b);
    bus.emit('car:breakthrough', { job, breakthrough: b });
    return b;
  }

  projects = new ProjectSystem({
    bus,
    staff,
    assignments,
    history: cars,
    phases: PHASES.map((p) => ({ id: p.id, name: p.name, weights: p.weights })),
    rules: { progressBase: PROJECT.progress.base, progressDivisor: PROJECT.progress.divisor, progressScale: PROJECT.progress.scale, checkpoints: [PROJECT.checkpoint] },
    hooks,
  });

  const api = {
    projects,
    assignments,
    cars,
    get active() {
      return projects.jobs[0] ?? null;
    },
    // Start a car: class, budget focus, the team (staff ids, up to 5).
    start({ classId = 'clubHatch', budget = 'balanced', staffIds = [] }) {
      if (api.active) return { ok: false, reason: 'A car is already being built' };
      const parts = partsOf(classId);
      const tier = tierFor(parts);
      const job = projects.createJob({
        type: 'car',
        name: `${CLASSES[classId].name} #${cars.count + 1}`,
        phaseTarget: tier.target,
        slots: PROJECT.teamSlots,
        data: { classId, parts, tier: tier.id, budget, nextBudget: null, budgets: [], faults: [], dev: {}, innovation: 0, breakthroughs: [], startedDay: today() },
      });
      for (const id of staffIds.slice(0, PROJECT.teamSlots)) assignments.assign(job, id);
      projects.start(job);
      return { ok: true, job };
    },
    // Budget focus for the next phase (bible §14.7: it only changes between phases).
    setNextBudget(job, budget) {
      job.data.nextBudget = budget === job.data.budget ? null : budget;
    },
    phase: (job) => PHASES[job.phaseIndex],
    fraction: (job) => Math.min(1, job.phaseProgress / job.phaseTarget),
    progressPerDay: (job) => projects.progressPerDay(job),
    // Game days left at today's pace (the rest of this phase plus the later ones).
    daysLeft(job) {
      const per = projects.progressPerDay(job);
      if (!per) return Infinity;
      return Math.ceil((job.phaseTarget - job.phaseProgress) / per + ((PHASES.length - 1 - job.phaseIndex) * job.phaseTarget) / per);
    },
    openFaults: (job) => job.data.faults.filter((f) => !f.fixed).length,
    team: (job) => projects.teamOf(job),
    onTeam: (staffId) => !!api.active?.slots.includes(staffId),
    // Debug helpers (?debug=1): a fault or a breakthrough now.
    debugFault(job) {
      return addFault(job, PHASES[job.phaseIndex]);
    },
    debugBreakthrough(job) {
      return breakthrough(job, PHASES[job.phaseIndex]);
    },
    serialize: () => ({ projects: projects.serialize(), cars: cars.serialize() }),
    load(s) {
      projects.load(s?.projects);
      cars.load(s?.cars);
    },
  };
  return api;
}
