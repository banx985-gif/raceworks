// Car projects (Milestone 4): the shared core/ProjectSystem (phases, daily progress, the 60% checkpoint, history)
// driven by RACEWORKS data (data/cars.js) and these rules, plugged in as its hooks:
//   workerModifier  +8% for the role whose main stat leads the phase (bible §10.7); nobody works while resting
//   onPhaseStart    a budget focus chosen during the last phase takes effect (bible §14.7: only between phases)
//   onDay           fault rolls in phases 2–4 (§14.8); Testing tries to fix open faults
//   onCheckpoint    one breakthrough roll at 60% of each phase (§14.9)
//   onPhaseComplete the phase's development points go into its car stats
//   onComplete      the finished car: 7 stats, QUALITY (§14.10), RATING, FAULTS, INNOVATION, history, and its visual
//                   family (src/systems/carVisual.js: the showcase and race pictures)
// Milestone 9: any legal class + six parts (src/systems/carCatalog.js decides what is open); the tier (and so the work
// per phase) comes from the parts' total complexity (§15.7).
//   statModifier    the founder's perk (Milestone 4b): +6% on their perk stat's share of their work
//   (onDay also takes a live founder perk extra for its phase off the fault chance: Tessa's −5% assembly faults)
// Milestone 10: the garage's facilities through their effect queries (facilities() → src/systems/garageFacilities.js):
//   workerModifier  × (1 + workPct(role)%)       e.g. the Basic Workbench's +6% mechanic work
//   progressModifier × (1 + phaseSpeedPct(phase)%) e.g. the Engine Bench's +8% on the Powertrain phase
//   onComplete      + devBonus() development points on the finished car's stats (the Dyno, Alignment Rig, Brake Station)
// createCarProjects({ bus, rng, staff, isResting, today, stationIds, perkOf, facilities }) → { projects, assignments, cars, … helpers }
//   perkOf(staff) → the founder perk ({ stat, pct, extras }) when that person is the founder, else null.
//   stationIds() → staff with a garage station duty: they count as assigned (working) even when not on a car.
//   busyElsewhere(id) → why this person can't join a car's team now (Milestone 12: away on a course), or null.
// Milestone 13: work traits (src/systems/staffTraits.js) — workerModifier × (1 + that person's phasePct for the phase);
//   the team's testFixPct raises Testing's daily fix chance (faultPct / breakthroughPct were already read).
// Milestone 21: each phase's development gain is kept (job.data.devByPhase: its points and its breakthroughs' extra), and
//   the finished car carries devByPhase and aeroShare — the Chassis & Aero phase's share of the project's development gain
//   (AeroForge's obligation, bible §29). The facilities' flat devBonus at the end is not a phase's gain and isn't counted.
// Milestone 22: combosFor(job, prelim) (src/systems/combos.js forCar) — the combos the finished car makes, checked on the
//   car before any combo bonus; their stat bonuses are added as development points (so the stat pipeline and its cap
//   hold) and the car carries result.combos and result.comboNear (its near-misses, for the clues). The visual family comes
//   from the resolver (src/systems/carVisual.js) with those combos; family / art / raceArt are kept on the record for
//   older code and tests, but the screens derive the family each time (familyOfCar).
import { ProjectSystem } from '../../../../core/ProjectSystem.js';
import { AssignmentSystem } from '../../../../core/AssignmentSystem.js';
import { JobHistory } from '../../../../core/JobHistory.js';
// Milestone 30b: the project types (data/cars.js PROJECT_TYPES) — job.data.projectType 'newCar' | 'upgrade' | 'prototype'
//   (an older save's jobs and cars load as 'newCar'; every finished car's result carries its projectType).
//   startUpgrade({ carNumber, parts, … }) a Major Upgrade: the car's class and its development so far (devFromCar), one
//                   or two slots reworked; the work per phase and each phase's development are perSlot × slots of a new
//                   build's. On finish the car's own record is changed in place (new parts, Quality re-rolled, combos
//                   checked again, an entry in rec.upgrades) — no new car — and 'car:upgraded' { job, record } follows
//                   'project:complete' (which carries no record for an upgrade). inBay(number): that car can't race.
//   prototype       the daily fault chance × faultMult; each breakthrough may finish a research node (finishResearch()).
// Milestone 30c: several builds at once, one per bay (job.data.bay: 'pit1' … 'pit4', 'proto'; Team decides which bays
//   exist and picks a free one). builds · byBay(bay) · jobOf(staffId) — core AssignmentSystem keeps a person on one
//   build. `active` is still the first build (older code and tests); an older save's one build is in 'pit1'.
// Milestone 30d: the Works Gods on a build's team — faultMult (Bolt) and breakthroughMult (Jinx) multiply the daily fault
//   and the checkpoint breakthrough chance; buildSpeedPct (Zip) speeds the phases while he works; chaosBuild (Havoc) rolls
//   once at each phase start: a free breakthrough (how: 'chaos') or one fault ('car:chaos' { job, phase, boost }).
import { CAR_STATS, CAR_STAT_MAX, PARTS, SLOTS, CLASSES, PHASES, BUDGETS, PROJECT, PROJECT_TYPES, projectTypeOf } from '../../data/cars.js';
import { partsCost, tierFor, checkCar, carCost } from './carCatalog.js';
import { resolveFamily } from './carVisual.js';
import { ROLES, TRAITS } from '../../data/staff.js';
import { phaseMult, effectProduct, effectSum } from './staffTraits.js';

// The stat that leads a phase (its biggest weight) → the role that gets the match bonus.
export const leadStat = (phase) => Object.entries(phase.weights).sort((a, b) => b[1] - a[1])[0][0];
export const leadRole = (phase) => Object.keys(ROLES).find((r) => ROLES[r].primaryStat === leadStat(phase));

// A class's default parts (the Start part in each slot). partsCost / tierFor live in carCatalog.js (re-exported here).
export const partsOf = (classId) => SLOTS.map((sl) => CLASSES[classId].starterParts[sl.id]);
export { partsCost, tierFor };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Milestone 21: the Chassis & Aero phase's share (0–1, 4 decimals) of a project's development gain by phase.
export const AERO_PHASE = 'chassisAero';
export function aeroShareOf(devByPhase = {}) {
  const total = Object.values(devByPhase ?? {}).reduce((t, v) => t + v, 0);
  return total > 0 ? Math.round(((devByPhase[AERO_PHASE] ?? 0) / total) * 10000) / 10000 : 0;
}

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

// Milestone 30b: a finished car's development points per stat, worked back from its record (its stats less the class
// base, the parts and its combo bonuses, plus what its open faults took) — where a Major Upgrade starts from.
export function devFromCar(rec) {
  const r = rec.result;
  const cls = CLASSES[r.classId];
  const open = (r.faultList ?? []).filter((f) => !f.fixed);
  const dev = {};
  for (const k of CAR_STATS) {
    let v = (r.stats?.[k] ?? 0) - cls.base[k] - (r.comboStats?.[k] ?? 0);
    for (const id of r.parts) v -= PARTS[id].mods[k] ?? 0;
    v += open.filter((f) => f.stat === k).length * PROJECT.faults.statLoss;
    dev[k] = Math.max(0, v);
  }
  return dev;
}
// The slots a new recipe changes on a car.
export const changedSlots = (oldParts, parts) => SLOTS.filter((sl, i) => oldParts[i] !== parts[i]).map((sl) => sl.id);

export function createCarProjects({ bus, rng, staff, isResting = () => false, today = () => 0, stationIds = () => [], perkOf = () => null, facilities = () => null, busyElsewhere = () => null, combosFor = null, finishResearch = () => null }) {
  let projects = null;
  // busyElsewhere(id) → reason | null (Milestone 12: someone away on a training course can't join the car's team).
  const assignments = new AssignmentSystem({ staff, getJobs: () => projects.jobs, bus, otherBusyIds: stationIds, busyElsewhere });
  const cars = new JobHistory({ bus });
  // Milestone 30b: a finished upgrade changes its car's own record instead of adding a car (core ProjectSystem's history).
  const history = {
    add(record) {
      if (record.type !== 'upgrade') return cars.add(record);
      applyUpgrade(record);
      return null;
    },
  };
  bus.on('project:complete', ({ job }) => {
    if (job?.type === 'upgrade') bus.emit('car:upgraded', { job, record: cars.get(job.data.carNumber) });
  });

  const budgetOf = (job) => BUDGETS[job.data.budget];
  const phaseDef = (phase) => PHASES.find((p) => p.id === phase.id);
  // A live founder perk extra that changes this phase's fault chance (Tessa: −5% in Assembly), when the founder is on
  // the car's team.
  const founderFaultPct = (job, def) =>
    projects.teamOf(job).reduce((t, s) => t + (perkOf(s)?.extras ?? []).filter((e) => e.live && e.phase === def.id && /FaultPct$/.test(e.key)).reduce((u, e) => u + e.value, 0), 0);
  const traitPct = (job, key) => projects.teamOf(job).reduce((t, s) => t + s.traits.reduce((u, id) => u + (TRAITS[id]?.effects?.[key] ?? 0), 0), 0);
  // Milestone 30d: the Works Gods' build blessings — a multiplier over the car's team (Bolt's faults, Jinx's
  // breakthroughs), and Zip's speed / Havoc's chaos from whoever is working on it now (nobody resting).
  const traitMult = (job, key) => effectProduct(projects.teamOf(job), key);
  const working = (job) => projects.teamOf(job).filter((s) => !isResting(s.id));

  const hooks = {
    workerModifier(job, phase, s) {
      if (isResting(s.id)) return 0; // away recovering at the rest spot
      const match = ROLES[s.role]?.primaryStat === leadStat(phase) ? 1 + PROJECT.roleMatchPct / 100 : 1;
      return match * (1 + (facilities()?.workPct(s.role) ?? 0) / 100) * phaseMult(s, phase.id);
    },
    progressModifier(job, phase) {
      return (1 + (facilities()?.phaseSpeedPct(phase.id) ?? 0) / 100) * (1 + effectSum(working(job), 'buildSpeedPct') / 100); // (Milestone 30d: Zip)
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
      // Milestone 30d: Havoc's chaos — at each build phase he works on, one roll: a free breakthrough, else one fault
      const chaos = effectSum(working(job), 'chaosBuild');
      if (chaos > 0) {
        const def = phaseDef(phase);
        const boost = rng.chance(Math.min(100, chaos) / 100);
        if (boost) breakthrough(job, def, 'chaos');
        else addFault(job, def);
        bus.emit('car:chaos', { job, phase, boost });
      }
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
        if (projectTypeOf(job.data) === 'prototype') pct *= PROJECT_TYPES.prototype.faultMult; // Milestone 30b
        pct *= traitMult(job, 'faultMult'); // Milestone 30d: Bolt
        if (rng.chance(pct / 100)) addFault(job, def);
      }
      if (def.fixes) {
        const open = job.data.faults.find((x) => !x.fixed);
        if (open && rng.chance((f.testingFixDailyPct * (1 + traitPct(job, 'testFixPct') / 100)) / 100)) {
          open.fixed = 'testing';
          open.fixedDay = today();
          bus.emit('car:fix', { job, fault: open, how: 'testing' });
        }
      }
    },
    onCheckpoint(job, phase) {
      const b = PROJECT.breakthrough;
      const pct = (b.basePct + traitPct(job, 'breakthroughPct') + (job.data.pastInnovation ?? 0)) * traitMult(job, 'breakthroughMult'); // (Milestone 30d: × Jinx)
      if (rng.chance(pct / 100)) breakthrough(job, phaseDef(phase));
    },
    onPhaseComplete(job, phase, summary) {
      const def = phaseDef(phase);
      const pts = summary.avgScore * PROJECT.development.pointsPerScore * (1 + budgetOf(job).qualityPct / 100) * (job.data.devScale ?? 1); // (Milestone 30b: an upgrade's share)
      addDevelopment(job, def, pts);
    },
    onComplete(job) {
      const sums = job.phaseSummaries;
      const avgScore = sums.length ? sums.reduce((t, p) => t + p.avgScore, 0) / sums.length : 0;
      // (Milestone 30b: an upgraded car already carries its facility bonus in the development it started from)
      if (job.type !== 'upgrade') for (const [k, v] of Object.entries(facilities()?.devBonus() ?? {})) if (v) job.data.dev[k] = (job.data.dev[k] ?? 0) + v;
      let car = finalCar({ classId: job.data.classId, parts: job.data.parts, dev: job.data.dev, faults: job.data.faults, innovation: job.data.innovation, avgScore });
      // Milestone 22: the combos, on the car as it is; their stat bonuses go in as development points
      const cb = combosFor?.(job, car) ?? { ids: [], stats: {}, near: [] };
      if (Object.keys(cb.stats).length) {
        for (const [k, v] of Object.entries(cb.stats)) job.data.dev[k] = (job.data.dev[k] ?? 0) + v;
        car = finalCar({ classId: job.data.classId, parts: job.data.parts, dev: job.data.dev, faults: job.data.faults, innovation: job.data.innovation, avgScore });
      }
      const vis = resolveFamily({ classId: job.data.classId, parts: job.data.parts, combos: cb.ids });
      return {
        classId: job.data.classId,
        className: CLASSES[job.data.classId].name,
        family: vis.id,
        art: vis.showcase,
        raceArt: vis.top,
        parts: job.data.parts,
        ...car,
        innovation: job.data.innovation,
        faultsTotal: job.data.faults.length,
        faultList: job.data.faults,
        breakthroughs: job.data.breakthroughs,
        devByPhase: { ...(job.data.devByPhase ?? {}) }, // Milestone 21
        aeroShare: aeroShareOf(job.data.devByPhase),
        combos: cb.ids, // Milestone 22
        comboStats: cb.stats,
        comboNear: cb.near,
        budgets: job.data.budgets,
        partsCost: partsCost(job.data.parts),
        baseCost: CLASSES[job.data.classId].baseCost,
        startedDay: job.data.startedDay,
        finishedDay: today(),
        projectType: projectTypeOf(job.data), // Milestone 30b
        ...(job.type === 'upgrade' ? { carNumber: job.data.carNumber, upgradeCost: job.data.cost } : {}),
        ...(job.data.researchDone?.length ? { researchDone: [...job.data.researchDone] } : {}),
      };
    },
    now: () => today(),
  };

  // Milestone 30b: a finished Major Upgrade on its car's record — the new parts, stats and Quality; the original build's
  // days, team and phases stay; its breakthroughs are added to the car's; rec.upgrades keeps what each upgrade did.
  function applyUpgrade(record) {
    const rec = cars.get(record.result.carNumber);
    if (!rec) return null;
    const old = rec.result;
    const { carNumber, upgradeCost, ...res } = JSON.parse(JSON.stringify(record.result));
    const slots = changedSlots(old.parts, res.parts);
    (rec.upgrades ??= []).push({
      day: today(), days: record.days, slots, from: slots.map((id) => old.parts[SLOTS.findIndex((s) => s.id === id)]), to: slots.map((id) => res.parts[SLOTS.findIndex((s) => s.id === id)]),
      qualityBefore: old.quality, qualityAfter: res.quality, team: record.team, cost: upgradeCost ?? null,
    });
    rec.result = { ...res, projectType: projectTypeOf(old), startedDay: old.startedDay, finishedDay: old.finishedDay, breakthroughs: [...(old.breakthroughs ?? []), ...res.breakthroughs], upgradedDay: today() };
    return rec;
  }

  function addFault(job, def) {
    const fault = { id: job.data.faults.length + 1, phase: def.id, stat: Object.keys(def.develops)[0], day: today(), fixed: false };
    job.data.faults.push(fault);
    bus.emit('car:fault', { job, fault });
    return fault;
  }

  function addDevelopment(job, def, points) {
    const by = (job.data.devByPhase ??= {});
    by[def.id] = (by[def.id] ?? 0) + points; // Milestone 21
    const shares = Object.entries(def.develops);
    const total = shares.reduce((t, [, w]) => t + w, 0);
    for (const [k, w] of shares) job.data.dev[k] = (job.data.dev[k] ?? 0) + (points * w) / total;
  }

  // A breakthrough: remove an open fault if there is one, otherwise extra development for the phase's stats.
  function breakthrough(job, def, how = null) {
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
    const b = { phase: def.id, day: today(), kind, ...(how ? { how } : {}) }; // (Milestone 30d: how 'chaos' — Havoc's)
    // Milestone 30b: a Research Prototype's breakthrough may finish a research node outright
    if (projectTypeOf(job.data) === 'prototype' && rng.chance(PROJECT_TYPES.prototype.researchPct / 100)) {
      const node = finishResearch(job);
      if (node) {
        b.research = node;
        (job.data.researchDone ??= []).push(node);
      }
    }
    job.data.breakthroughs.push(b);
    bus.emit('car:breakthrough', { job, breakthrough: b });
    return b;
  }

  projects = new ProjectSystem({
    bus,
    staff,
    assignments,
    history, // (Milestone 30b: cars, but an upgrade changes its car)
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
    // Start a car: class, its six parts (default: the Start parts), budget focus, the team (staff ids, up to 5).
    // Only the car's shape is checked here; whether the team may build it is Team.canStartCar (carCatalog).
    // Milestone 30b: projectType 'newCar' or 'prototype' (a Research Prototype: its name says so).
    // Milestone 30c: bay = where it is built ('pit1' … 'pit4', 'proto'; Team picks a free one). Without one: 'pit1'
    // ('proto' for a prototype).
    start({ classId = 'clubHatch', parts = null, budget = 'balanced', staffIds = [], projectType = 'newCar', bay = null }) {
      const where = bay ?? (projectType === 'prototype' ? 'proto' : 'pit1');
      if (api.byBay(where)) return { ok: false, reason: 'A car is already being built' };
      parts = parts ? [...parts] : partsOf(classId);
      const shape = checkCar({ classId, parts });
      if (!shape.ok) return { ok: false, reason: shape.reasons[0] };
      const tier = tierFor(parts);
      const proto = projectType === 'prototype';
      const job = projects.createJob({
        type: 'car',
        // (Milestone 30c: the cars still in the bays count too, so two builds never share a name)
        name: `${CLASSES[classId].name}${proto ? ' Prototype' : ''} #${cars.count + projects.jobs.filter((j) => j.type !== 'upgrade').length + 1}`,
        phaseTarget: tier.target,
        slots: PROJECT.teamSlots,
        data: { bay: where, projectType: proto ? 'prototype' : 'newCar', classId, parts, tier: tier.id, cost: Math.round(carCost({ classId, parts }) * (proto ? PROJECT_TYPES.prototype.costMult : 1)), budget, nextBudget: null, budgets: [], faults: [], dev: {}, innovation: 0, breakthroughs: [], startedDay: today() },
      });
      for (const id of staffIds.slice(0, PROJECT.teamSlots)) assignments.assign(job, id);
      projects.start(job);
      return { ok: true, job };
    },
    // Milestone 30b: the work and development share of a Major Upgrade that reworks n slots.
    upgradeShare: (n) => PROJECT_TYPES.upgrade.perSlot * n,
    // A Major Upgrade (bible §14.1) of finished car `carNumber` to `parts` (the same class; one or two slots changed).
    // Only the shape is checked here (Team.canUpgrade checks the rest).
    startUpgrade({ carNumber, parts, budget = 'balanced', staffIds = [], cost = null, bay = 'pit1' }) {
      if (api.byBay(bay)) return { ok: false, reason: 'A car is already being built' };
      if (api.inBay(carNumber)) return { ok: false, reason: 'This car is already in the bay' };
      const rec = cars.get(carNumber);
      if (!rec?.result) return { ok: false, reason: 'No such car' };
      const classId = rec.result.classId;
      const slots = changedSlots(rec.result.parts, parts ?? []);
      const shape = checkCar({ classId, parts });
      if (!shape.ok) return { ok: false, reason: shape.reasons[0] };
      if (!slots.length || slots.length > PROJECT_TYPES.upgrade.maxSlots) return { ok: false, reason: `Change one or ${PROJECT_TYPES.upgrade.maxSlots} part slots` };
      const tier = tierFor(parts);
      const share = api.upgradeShare(slots.length);
      const r = rec.result;
      const carried = (r.faultList ?? []).filter((f) => !f.fixed).map((f, i) => ({ ...f, id: i + 1, carried: true })); // its open faults come into the bay
      const job = projects.createJob({
        type: 'upgrade',
        name: `Upgrade: ${rec.name}`,
        phaseTarget: Math.round(tier.target * share),
        slots: PROJECT.teamSlots,
        data: { bay, projectType: 'upgrade', carNumber, classId, parts: [...parts], oldParts: [...r.parts], slots, devScale: share, tier: tier.id, cost: cost ?? Math.round(carCost({ classId, parts }) * share), budget, nextBudget: null, budgets: [], faults: carried, dev: devFromCar(rec), innovation: r.innovation ?? 0, breakthroughs: [], startedDay: today() },
      });
      for (const id of staffIds.slice(0, PROJECT.teamSlots)) assignments.assign(job, id);
      projects.start(job);
      return { ok: true, job };
    },
    // Milestone 30b: a car in the bay (being upgraded) can't race.
    inBay: (number) => !!number && projects.jobs.some((j) => j.type === 'upgrade' && j.data.carNumber === number),
    raceable: () => cars.list().filter((r) => !api.inBay(r.number)),
    typeOf: (job) => projectTypeOf(job?.data),
    // Milestone 30c: every build running now (one per bay), the build in a bay, the build someone is on.
    get builds() {
      return projects.jobs;
    },
    byBay: (bay) => projects.jobs.find((j) => j.data.bay === bay) ?? null,
    jobOf: (staffId) => assignments.jobOf(staffId),
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
    onTeam: (staffId) => !!assignments.jobOf(staffId), // (Milestone 30c: on any build)
    // Debug helpers (?debug=1): a fault or a breakthrough now.
    debugFault(job) {
      return addFault(job, PHASES[job.phaseIndex]);
    },
    debugBreakthrough(job) {
      return breakthrough(job, PHASES[job.phaseIndex]);
    },
    serialize: () => ({ projects: projects.serialize(), cars: cars.serialize() }),
    // (Milestone 30b: an older save's jobs and cars are all 'newCar')
    load(s) {
      projects.load(s?.projects);
      cars.load(s?.cars);
      for (const j of projects.jobs) j.data.projectType ??= 'newCar';
      for (const j of projects.jobs) j.data.bay ??= j.data.projectType === 'prototype' ? 'proto' : 'pit1'; // Milestone 30c: an older save's one build
      for (const r of cars.list()) if (r.result) r.result.projectType ??= 'newCar';
    },
  };
  return api;
}
