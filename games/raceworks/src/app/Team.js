// The racing team (Milestones 3–4b): the calendar, the staff, the car projects and the save. Built from the shared
// engine — core/Clock, core/StaffSystem (daily Energy/Morale, statuses, XP/levels), core/ProjectSystem (through
// src/systems/carProject.js), core/SaveStore (rolling checked saves) — with RACEWORKS content from data/.
//   new Team({ bus, seed })          then  team.useSlot(slot)  and  team.newGame(setup)  or  team.load(data)
//   team.clock · team.staff (StaffSystem) · team.get(id) · team.ratingsOf(staff) · team.isDriver(staff)
//   team.activityOf(staff) — set by the garage: 'working' | 'resting' | 'idle' (the daily tick reads it)
//   team.garageSnapshot() / team.garageState — the garage's workers (positions, routine phase) travel in the save
//   team.nudge(id, what, amount) — debug: change a stat / Energy / Morale now
//   team.cars — car projects: .active, .start({ classId, budget, staffIds }), .cars (the Car Garage history) …
//   team.restingOf(staffId) — set by the garage: true while someone recovers at the rest spot (they don't build then)
// Milestone 4b: team.newGame(setup) builds the team from the chosen founder (data/setup.js FOUNDERS, spec §3);
//   team.setup { teamName, principal, colour, founderId } · team.founder { id, flag, history } · team.isFounder(id)
//   team.founderPerk(staff) → the perk when that person is the founder · team.noCandidates (never hiring candidates)
//   team.playSeconds (real seconds played) · team.summary() → the save-slot card · team.useSlot(saveSlot)
// Milestone 5: team.money (src/systems/economy.js) — Credits / RP / Racing Tokens on one ledger, Reputation and rank,
//   Emergency Credit, salaries on day 1, the car build's costs, car upkeep and repairs, the development contract.
//   team.startCar(opts) charges the parts and starts the build (or says why not: debt, not enough Credits).
// Milestone 6: team.races (src/systems/races.js) — the race being run, with its fixed seed, and past results.
// Milestone 10: team.facilities (src/systems/garageFacilities.js) — the garage layout (core/FacilitySystem), building
//   through the ledger, and the effect queries every system asks (bonus(key), phaseSpeedPct, workPct…).
// Milestone 11: team.research (src/systems/research.js) — the 36-node tree on core/ResearchSystem, RP on the ledger, one
//   queue; finished nodes open parts (team.unlocks.research → the car builder), facilities (the shop), tyres and
//   bonuses (added into team.facilities.bonus(key)).
// Milestone 12: team.recruitment (src/systems/recruitment.js) — five channels, a 3-card board for each open one, refreshes,
//   hire (fee + salary, staff cap by rank) and let go; team.training (src/systems/training.js) — the seven Auto Training
//   courses, capacity, the ledger. Everyone on the team has a garage routine (data/garage.js routineFor), so every hire
//   counts as on duty; someone on a course can't join the car's team.
// Milestone 13: team.careers (src/systems/careers.js) — every person's career record (races, wins, podiums, cars built,
//   days employed) and the team facts staff eligibility reads; the founder's history is written from the same records.
import { Clock } from '../../../../core/Clock.js';
import { Rng } from '../../../../core/Rng.js';
import { StaffSystem } from '../../../../core/StaffSystem.js';
import { SaveSlot } from '../../../../core/SaveStore.js';
import { STAFF, STARTERS, STAT_KEYS, ROLES, TIERS, TRAITS } from '../../data/staff.js';
import { STAFF_RULES, CLOCK, SAVE_VERSION } from '../../data/balance.js';
import { FOUNDERS, FOUNDER_FLAG, FOUNDER_HISTORY, START_CANDIDATES, TEAM_COLOURS, SLOT_PLACEHOLDERS } from '../../data/setup.js';
import { TOP_BAR } from '../../data/home.js';
import { createRatingsCache } from '../systems/driverRatings.js';
import { createCarProjects } from '../systems/carProject.js';
import { BUDGETS } from '../../data/cars.js';
import { createTeamMoney } from '../systems/economy.js';
import { createRaces } from '../systems/races.js';
import { partsOf, partsCost } from '../systems/carProject.js';
import { unlockContext, checkCar } from '../systems/carCatalog.js';
import { CLASSES } from '../../data/cars.js';
import { createGarageFacilities } from '../systems/garageFacilities.js';
import { createResearch } from '../systems/research.js';
import { createRecruitment } from '../systems/recruitment.js';
import { createTraining } from '../systems/training.js';
import { createCareers } from '../systems/careers.js';
import { ENDURANCE } from '../../data/training.js';

// A new game's setup when none is given (tests, and saves from before Milestone 4b).
export const DEFAULT_SETUP = { teamName: 'RACEWORKS', principal: 'Principal', colour: 'red', founderId: 'MEC01' };
const newFounder = (id) => ({ id, flag: FOUNDER_FLAG, history: { ...FOUNDER_HISTORY } });

// Save format changes go here: { 1: (record) => record at version 2, … } (core/SaveStore migrateSave).
//   1 → 2 (Milestone 4b): the team setup, the founder and play time. An older team (Sam, Tessa and Mara) gets Tessa —
//   the Milestone 1 lead — as its founder and the default names; the player can start a fresh team in another slot.
export const SAVE_MIGRATIONS = {
  1: (record) => {
    const d = record.data;
    const founder = newFounder(DEFAULT_SETUP.founderId);
    founder.history.daysEmployed = d.clock?.totalDays ?? 0;
    founder.history.carsDeveloped = (d.cars?.cars?.records ?? []).filter((r) => r.team?.some((m) => m.id === founder.id)).length;
    return { ...record, data: { ...d, setup: { ...DEFAULT_SETUP, legacy: true }, founder, noCandidates: ['DRV01'], playSeconds: 0 } };
  },
  //   2 → 3 (Milestone 5): money. Nothing to change here — Team.load() gives a save without it the §30.2 starting state.
  2: (record) => record,
  //   3 → 4 (Milestone 10): the garage layout. Nothing to change here — Team.load() gives a save without one the
  //   starting garage (its Pit Bay, Strategy Desk and rest spot where they always stood).
  3: (record) => record,
  //   4 → 5 (Milestone 11): research. Nothing to change here — Team.load() gives a save without it an empty tree (its
  //   RP is already on the ledger).
  4: (record) => record,
  //   5 → 6 (Milestone 12): recruitment and training. Nothing to change here — Team.load() gives a save without them a
  //   fresh board for each open channel and nobody on a course.
  5: (record) => record,
  //   6 → 7 (Milestone 13): career records. Nothing to change here — Team.load() rebuilds them for a save without them
  //   (the founder's history, the Car Garage's teams, the race history, days since each person was hired).
  6: (record) => record,
  //   7 → 8 (Milestone 14): each running course's drill choice and bonus (training.drills). Nothing to change here —
  //   a save without it has none (every course carries on as Auto Train).
  7: (record) => record,
  //   8 → 9 (Milestone 15): the complete race weekend (practice runs, fuel / energy target, repair priority, the Drive
  //   lap). Nothing to change here — races.load() gives a weekend saved without them Normal fuel, Skip repair and its
  //   practice as the full 3 runs (what Milestone 7's single practice was worth).
  8: (record) => record,
  //   9 → 10 (Milestone 16): race strategy (each car's plan, pit window, fuel, heat, repair priority, swings; the race's
  //   forecast; the career strategy records). Nothing to change here — a race saved mid-way gets each car's strategy
  //   state when it loads (src/race/raceSim.js), its player a starter strategist, and careers.load() zero records.
  9: (record) => record,
  //   10 → 11 (Milestone 17): weather, incidents and the pit model (the weekend's weather timeline, each car's damage /
  //   faults / spins, the caution, the new career facts). Nothing to change here — races.load() gives a race made before it
  //   a dry timeline, a race saved mid-way gets each car's condition state when it loads (src/race/raceSim.js), and
  //   careers.load() zero records for the new facts.
  10: (record) => record,
};

export class Team {
  constructor({ bus, seed = 'raceworks' }) {
    this.bus = bus;
    this.rng = new Rng(seed);
    this.clock = new Clock({ bus, speeds: TOP_BAR.speeds, ...CLOCK });
    this.activityOf = () => 'idle';
    this.restingOf = () => false;
    this.staff = new StaffSystem({
      rng: this.rng,
      bus,
      statKeys: STAT_KEYS,
      roles: ROLES,
      tiers: TIERS,
      traits: TRAITS,
      rules: STAFF_RULES,
      planActivity: (s) => this.activityOf(s),
      // Endurance Camp (Milestone 12): each camp done adds to resting recovery for good (data/training.js ENDURANCE).
      restModifier: (s) => ({ energyMult: 1 + (ENDURANCE.recoveryPct * Math.min(ENDURANCE.maxCamps, s.counters?.enduranceCamps ?? 0)) / 100 }),
      // Push Quality (bible §14.7): +10% Energy drain for the car's team.
      energyLossMultiplier: (s) => {
        const job = this.cars?.active;
        return job && job.slots.includes(s.id) ? 1 + BUDGETS[job.data.budget].energyPct / 100 : 1;
      },
    });
    this.cars = createCarProjects({
      bus,
      rng: this.rng,
      staff: this.staff,
      isResting: (id) => this.restingOf(id),
      today: () => this.clock.totalDays,
      perkOf: (s) => this.founderPerk(s),
      stationIds: () => this.staff.staff.map((s) => s.id), // Milestone 12: everyone has a garage routine (hires too)
      facilities: () => this.facilities,
      busyElsewhere: (id) => (this.training?.trainingOf(id) ? 'Away on a training course' : null),
    });
    this.money = createTeamMoney({ bus, seed, clock: this.clock, staff: this.staff, cars: this.cars, revealBonus: () => this.facilities.bonus('revealReputation') });
    this.facilities = createGarageFacilities({ bus, money: this.money, research: () => new Set(this.unlocks.research), extraBonus: (key) => this.research.bonus(key), extraKeys: () => this.research.bonusKeys() }); // Milestone 10
    this.research = createResearch({ bus, team: this }); // Milestone 11
    this.races = createRaces({ bus, team: this }); // Milestone 6: the race being run (fixed seed) and the results
    this.recruitment = createRecruitment({ bus, team: this, seed }); // Milestone 12
    this.training = createTraining({ bus, team: this, seed }); // Milestone 12
    this.careers = createCareers({ bus, team: this }); // Milestone 13
    this.recruitment.extraBusy = (id) => {
      const t = this.training.trainingOf(id);
      return t ? `Away on a course (${t.days - t.daysDone} day${t.days - t.daysDone === 1 ? '' : 's'} left)` : null;
    };
    this.ratings = createRatingsCache();
    this.garageSnapshot = () => null; // the garage replaces this
    this.garageState = null; // positions from the last load, for the garage to put people back
    this.slot = null;
    this.setup = { ...DEFAULT_SETUP };
    this.founder = newFounder(DEFAULT_SETUP.founderId);
    this.noCandidates = [];
    this.playSeconds = 0;
    bus.on('clock:day', () => {
      this.staff.dailyTick();
      this.training.dailyTick(); // Milestone 12: after the staff day (a finished course's Energy stays)
      this.money.daily(this.cars.active); // the build's running cost for today (before it can finish)
      this.cars.projects.dailyTick(); // after the staff day, so today's Energy counts
      this.money.dailyAfter(); // contract deadlines
      this.trackFounderDay();
    });
    // Day 1 of a month: the staff month, then interest / salaries / upkeep / the contract offer.
    bus.on('clock:month', () => {
      this.staff.monthlyTick();
      this.money.monthStart();
    });
    bus.on('project:complete', ({ record }) => {
      if (record) this.money.carFinished(record); // (cars built: src/systems/careers.js, the founder's too)
    });
  }

  // A new team (Milestone 4b): the founder plus two (data/setup.js FOUNDERS, spec §3), fresh Energy / Morale, on the
  // job (so no idle-morale loss). A fresh calendar, so every slot starts on day 1.
  newGame(setup = DEFAULT_SETUP) {
    const f = FOUNDERS.find((x) => x.id === setup.founderId) ?? FOUNDERS.find((x) => x.id === DEFAULT_SETUP.founderId);
    const colour = TEAM_COLOURS.some((c) => c.id === setup.colour) ? setup.colour : DEFAULT_SETUP.colour;
    this.setup = { teamName: setup.teamName || DEFAULT_SETUP.teamName, principal: setup.principal || DEFAULT_SETUP.principal, colour, founderId: f.id };
    this.clock.load({ year: 1, month: 1, day: 1, totalDays: 0, dayProgress: 0, speed: this.clock.speeds[0], lastSpeed: this.clock.speeds[0] });
    this.staff.staff = [];
    for (const id of f.team ?? STARTERS) {
      const s = this.staff.addFromDefinition(STAFF.find((d) => d.id === id));
      s.assigned = true;
    }
    this.founder = newFounder(f.id);
    this.noCandidates = (f.team ?? STARTERS).filter((id) => START_CANDIDATES.includes(id));
    this.playSeconds = 0;
    this.cars.load(null);
    this.cars.assignments.refresh();
    this.ratings = createRatingsCache();
    this.garageState = null;
    this.money.newGame(); // §30.2 starting state, month 1 salaries, the first contract offer
    this.facilities.newGame(); // Milestone 10: the starting garage (bible §19)
    this.research.newGame(); // Milestone 11: nothing researched; 120 RP came with the money (§30.2)
    this.races.load(null);
    this.training.newGame(); // Milestone 12
    this.careers.newGame(); // Milestone 13
    this.recruitment.newGame(); // Milestone 12: a board for Local Contacts (after the team and rank are set)
  }

  // Start a car project, paying for its class and parts (Milestones 5 and 9). car = { classId, parts } (parts default:
  // the class's Start parts; a bare class id still works). The car must be legal for this team (src/systems/carCatalog:
  // an open class, open parts, an allowed tier) — debugAll (?debug=1 unlock-all) opens every class and part.
  // → { ok, job } or { ok: false, reason }.
  canStartCar(car = {}, { debugAll = false } = {}) {
    if (typeof car === 'string') car = { classId: car };
    const classId = car.classId ?? 'clubHatch';
    const parts = car.parts ?? partsOf(classId);
    if (this.cars.active) return { ok: false, reason: 'A car is already being built' };
    if (this.facilities.bonus('carBays') < 1) return { ok: false, reason: 'Build a Pit Bay first' };
    const legal = checkCar({ classId, parts }, unlockContext(this, { debugAll }));
    if (!legal.ok) return { ok: false, reason: legal.reasons[0] };
    return this.money.canStartCar(this.carPrice({ classId, parts }).total);
  }

  // What a car costs at Start (Milestone 10: after the facilities' material cost bonus, e.g. the Parts Rack −3%).
  carPrice({ classId = 'clubHatch', parts = partsOf(classId) } = {}) {
    const shell = this.facilities.materialPrice(CLASSES[classId].baseCost);
    const partsPrice = this.facilities.materialPrice(partsCost(parts));
    return { shell, parts: partsPrice, total: shell + partsPrice };
  }

  startCar(opts) {
    const classId = opts.classId ?? 'clubHatch';
    const parts = opts.parts ?? partsOf(classId);
    const can = this.canStartCar({ classId, parts }, { debugAll: !!opts.debugAll });
    if (!can.ok) return can;
    const away = (opts.staffIds ?? []).find((id) => this.training.trainingOf(id)); // Milestone 12
    if (away) return { ok: false, reason: `${this.get(away)?.name ?? 'Someone'} is away on a training course` };
    const r = this.cars.start({ ...opts, classId, parts });
    if (r.ok) {
      const price = this.carPrice({ classId, parts: r.job.data.parts });
      if (price.shell) this.money.chargeParts(`${r.job.name} (${CLASSES[classId].name} shell)`, price.shell);
      this.money.chargeParts(r.job.name, price.parts);
    }
    return r;
  }

  // What this team has unlocked beyond its rank (Milestone 9: events and secrets later fill these lists; carCatalog
  // reads them). Milestone 10: facilities = the facilities standing in the garage now. Milestone 11: research = the
  // finished research nodes.
  get unlocks() {
    const u = this._unlocks ?? (this._unlocks = { research: [], events: [], secrets: [] });
    u.facilities = this.facilities?.builtIds() ?? [];
    u.research = this.research?.doneIds() ?? [];
    return u;
  }

  get(id) {
    return this.staff.get(id);
  }

  get roster() {
    return this.staff.staff;
  }

  isDriver(s) {
    return s.role === 'driver';
  }

  // The six derived ratings (bible §10.3), recalculated only when something they depend on has changed.
  ratingsOf(s) {
    return this.ratings.get(s);
  }

  // --- the founder (spec §2, §4) ------------------------------------------------------------------------------
  isFounder(id) {
    return this.founder?.id === id;
  }

  founderDef() {
    return FOUNDERS.find((x) => x.id === this.founder?.id) ?? null;
  }

  // The founder's perk (on top of their trait, for the whole run) — for the founder only.
  founderPerk(s) {
    return s && this.isFounder(s.id) ? (this.founderDef()?.perk ?? null) : null;
  }

  // Every game day: whether the founder has been here without a break (days employed: src/systems/careers.js).
  trackFounderDay() {
    const h = this.founder?.history;
    if (h && !this.get(this.founder.id)) h.continuous = false;
  }

  // What the save-slot card shows (spec §7).
  summary() {
    const f = this.founderDef();
    const def = STAFF.find((d) => d.id === this.founder?.id);
    return {
      teamName: this.setup.teamName,
      principal: this.setup.principal,
      colour: this.setup.colour,
      founderId: this.founder?.id ?? null,
      founderName: def?.name ?? '',
      founderArt: def?.art ?? null,
      founderPerk: f?.perkName ?? '',
      year: this.clock.year,
      month: this.clock.month,
      rank: this.money.rank,
      ngPlus: SLOT_PLACEHOLDERS.ngPlus,
      grade: SLOT_PLACEHOLDERS.grade,
      playSeconds: Math.round(this.playSeconds),
      cars: this.cars.cars.count,
    };
  }

  // Debug stat nudge: what = a stat key, 'energy' or 'morale'. Statuses follow at once.
  nudge(id, what, amount) {
    const s = this.get(id);
    if (!s) return null;
    if (what === 'energy') this.staff.changeEnergy(s, amount);
    else if (what === 'morale') this.staff.changeMorale(s, amount);
    else {
      const cap = this.staff.statCap(s, what);
      s.stats[what] = Math.max(1, Math.min(cap, (s.stats[what] ?? 0) + amount));
    }
    this.staff.refreshStatus(s);
    this.bus.emit('team:changed', { staff: s, what });
    return s;
  }

  // --- save / load ---------------------------------------------------------------------------------------------
  serialize() {
    return {
      clock: this.clock.serialize(),
      rng: this.rng.getState(),
      staff: this.staff.serialize(),
      cars: this.cars.serialize(),
      garage: this.garageSnapshot(),
      setup: { ...this.setup },
      founder: JSON.parse(JSON.stringify(this.founder)),
      noCandidates: [...this.noCandidates],
      playSeconds: Math.round(this.playSeconds * 10) / 10,
      money: this.money.serialize(),
      races: this.races.serialize(),
      facilities: this.facilities.serialize(), // Milestone 10
      research: this.research.serialize(), // Milestone 11
      recruitment: this.recruitment.serialize(), // Milestone 12
      training: this.training.serialize(), // Milestone 12
      careers: this.careers.serialize(), // Milestone 13
    };
  }

  load(data) {
    this.clock.load(data.clock);
    this.rng.setState(data.rng);
    this.staff.load(data.staff);
    this.cars.load(data.cars); // a Milestone 3 save has none yet: no project, an empty Car Garage
    this.cars.assignments.refresh();
    this.garageState = data.garage ?? null;
    this.setup = { ...DEFAULT_SETUP, ...(data.setup ?? {}) };
    this.founder = data.founder ? JSON.parse(JSON.stringify(data.founder)) : newFounder(DEFAULT_SETUP.founderId);
    this.founder.history = { ...FOUNDER_HISTORY, ...this.founder.history };
    this.noCandidates = [...(data.noCandidates ?? [])];
    this.playSeconds = data.playSeconds ?? 0;
    this.ratings = createRatingsCache();
    if (data.money) this.money.load(data.money);
    else this.adoptMoney(); // a save from before Milestone 5
    this.facilities.load(data.facilities); // Milestone 10 (after the money: the rank opens the Bay Extension)
    this.races.load(data.races); // none before Milestone 6
    this.research.load(data.research); // none before Milestone 11
    this.training.load(data.training); // none before Milestone 12
    this.careers.load(data.careers ?? null); // none before Milestone 13: rebuilt from the save (before recruitment)
    this.recruitment.load(data.recruitment); // none before Milestone 12: fresh boards for the open channels
  }

  // A team saved before Milestone 5 had no money: it gets the §30.2 starting state today, and each car it already
  // finished counts for Reputation (and gets a full Condition).
  adoptMoney() {
    this.money.newGame();
    for (const rec of this.cars.cars.list()) this.money.carFinished(rec);
  }

  // The single pre-4b save key (the tests use it; the game saves through core/CampaignSlots and useSlot()).
  async attachSave(adapter) {
    this.slot = new SaveSlot({ adapter, key: 'team', version: SAVE_VERSION, migrations: SAVE_MIGRATIONS, bus: this.bus });
  }

  // Save into this campaign slot from now on (a core/SaveStore SaveSlot, from core/CampaignSlots).
  useSlot(slot) {
    this.slot = slot;
  }

  // Loads the save if there is one (true), else starts a new team (false).
  async loadOrNew(setup = DEFAULT_SETUP) {
    const data = this.slot ? await this.slot.load() : null;
    if (data) {
      this.load(data);
      return true;
    }
    this.newGame(setup);
    return false;
  }

  save() {
    return this.slot ? this.slot.save(this.serialize()) : Promise.resolve(null);
  }

  async clearSave() {
    await this.slot?.clear();
  }
}

// The save-slot card straight from saved data (core/CampaignSlots describe), without building a team.
export function describeSave(data) {
  const t = new Team({ bus: { on() {}, emit() {} }, seed: 'describe' });
  t.load(data);
  return t.summary();
}
