// The racing team (Milestone 3): the calendar, the staff and the save. Built from the shared engine —
// core/Clock, core/StaffSystem (daily Energy/Morale, statuses, XP/levels), core/SaveStore (rolling checked saves) —
// with RACEWORKS content from data/.
//   new Team({ bus, seed })          then  await team.attachSave(adapter)  and  await team.loadOrNew()
//   team.clock · team.staff (StaffSystem) · team.get(id) · team.ratingsOf(staff) · team.isDriver(staff)
//   team.activityOf(staff) — set by the garage: 'working' | 'resting' | 'idle' (the daily tick reads it)
//   team.garageSnapshot() / team.garageState — the garage's workers (positions, routine phase) travel in the save
//   team.nudge(id, what, amount) — debug: change a stat / Energy / Morale now
import { Clock } from '../../../../core/Clock.js';
import { Rng } from '../../../../core/Rng.js';
import { StaffSystem } from '../../../../core/StaffSystem.js';
import { SaveSlot } from '../../../../core/SaveStore.js';
import { STAFF, STARTERS, STAT_KEYS, ROLES, TIERS, TRAITS } from '../../data/staff.js';
import { STAFF_RULES, CLOCK, SAVE_VERSION } from '../../data/balance.js';
import { TOP_BAR } from '../../data/home.js';
import { createRatingsCache } from '../systems/driverRatings.js';

// Save format changes go here: { 1: (record) => record at version 2, … } (core/SaveStore migrateSave).
export const SAVE_MIGRATIONS = {};

export class Team {
  constructor({ bus, seed = 'raceworks' }) {
    this.bus = bus;
    this.rng = new Rng(seed);
    this.clock = new Clock({ bus, speeds: TOP_BAR.speeds, ...CLOCK });
    this.activityOf = () => 'idle';
    this.staff = new StaffSystem({
      rng: this.rng,
      bus,
      statKeys: STAT_KEYS,
      roles: ROLES,
      tiers: TIERS,
      traits: TRAITS,
      rules: STAFF_RULES,
      planActivity: (s) => this.activityOf(s),
    });
    this.ratings = createRatingsCache();
    this.garageSnapshot = () => null; // the garage replaces this
    this.garageState = null; // positions from the last load, for the garage to put people back
    this.slot = null;
    bus.on('clock:day', () => this.staff.dailyTick());
    bus.on('clock:month', () => this.staff.monthlyTick());
  }

  // A new team: the three starters (bible §11), fresh Energy / Morale, on the job (so no idle-morale loss).
  newGame() {
    this.staff.staff = [];
    for (const id of STARTERS) {
      const s = this.staff.addFromDefinition(STAFF.find((d) => d.id === id));
      s.assigned = true;
    }
    this.garageState = null;
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
    return { clock: this.clock.serialize(), rng: this.rng.getState(), staff: this.staff.serialize(), garage: this.garageSnapshot() };
  }

  load(data) {
    this.clock.load(data.clock);
    this.rng.setState(data.rng);
    this.staff.load(data.staff);
    this.garageState = data.garage ?? null;
  }

  async attachSave(adapter) {
    this.slot = new SaveSlot({ adapter, key: 'team', version: SAVE_VERSION, migrations: SAVE_MIGRATIONS, bus: this.bus });
  }

  // Loads the save if there is one (true), else starts a new team (false).
  async loadOrNew() {
    const data = this.slot ? await this.slot.load() : null;
    if (data) {
      this.load(data);
      return true;
    }
    this.newGame();
    return false;
  }

  save() {
    return this.slot ? this.slot.save(this.serialize()) : Promise.resolve(null);
  }

  async clearSave() {
    await this.slot?.clear();
  }
}
