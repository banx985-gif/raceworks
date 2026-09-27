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
import { ASSIGNMENT } from '../../data/garage.js';
import { createTeamMoney } from '../systems/economy.js';
import { createRaces } from '../systems/races.js';
import { partsOf, partsCost } from '../systems/carProject.js';

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
      stationIds: () => Object.keys(ASSIGNMENT).filter((id) => this.staff.get(id)),
    });
    this.money = createTeamMoney({ bus, seed, clock: this.clock, staff: this.staff, cars: this.cars });
    this.races = createRaces({ bus, team: this }); // Milestone 6: the race being run (fixed seed) and the results
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
      if (record?.team?.some((m) => m.id === this.founder.id)) this.founder.history.carsDeveloped++;
      if (record) this.money.carFinished(record);
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
    this.races.load(null);
  }

  // Start a car project, paying for its parts (Milestone 5). → { ok, job } or { ok: false, reason }.
  canStartCar(classId = 'clubHatch') {
    if (this.cars.active) return { ok: false, reason: 'A car is already being built' };
    return this.money.canStartCar(partsCost(partsOf(classId)));
  }

  startCar(opts) {
    const classId = opts.classId ?? 'clubHatch';
    const can = this.canStartCar(classId);
    if (!can.ok) return can;
    const r = this.cars.start({ ...opts, classId });
    if (r.ok) this.money.chargeParts(r.job.name, partsCost(r.job.data.parts));
    return r;
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

  // Every game day: days employed, and whether the founder has been here without a break.
  trackFounderDay() {
    const h = this.founder?.history;
    if (!h) return;
    if (this.get(this.founder.id)) h.daysEmployed++;
    else h.continuous = false;
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
    this.races.load(data.races); // none before Milestone 6
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
