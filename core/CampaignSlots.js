// Campaign save slots + an account-wide store, for any series game (RACEWORKS Milestone 4b; Robot Workshop and later
// games can adopt it unchanged). Each campaign slot is its own core/SaveStore SaveSlot (rolling, checksummed copies),
// so a damaged or half-written save in one slot never touches another.
//
//   const slots = new CampaignSlots({ adapter, count = 4, prefix = 'slot', version, migrations, describe, bus })
//     describe(data) → a small summary for the slot screen (team name, date, play time …) — the game decides
//   slots.slot(n)                  the SaveSlot for slot n (1 … count)
//   await slots.list()             [{ n, empty, summary, savedAt, error }] — every slot, in order (a slot that will not
//                                   read gives error, never throws: the player can still delete it)
//   await slots.save(n, data)      write slot n (only the game's own autosave should call this for an occupied slot;
//                                   screens ask "are you sure" before starting a new team over an occupied one)
//   await slots.load(n)            the slot's data (migrated), or null
//   await slots.remove(n)          empty slot n
//   await slots.latest()           the slot saved most recently (Continue), or null
//   await slots.firstEmpty(except) the lowest empty slot number (not in except), or null when all are full
//   Account-wide store (tokens, achievements, NG+ meta, the last slot played …), shared by every slot:
//   await slots.loadAccount() → object ({} when new)      await slots.saveAccount(obj)
//   await slots.adoptLegacy({ key, into = 1, convert, marker })
//     One time only: a save kept under an older single-slot key (e.g. 'team') is copied into slot `into` if that slot
//     is empty, through convert(data) (fill in what the old save never had). The old copies are left where they were;
//     the account store remembers it was done, so a later delete never brings it back.
//
// New Game+ rule (for the game's NG+ milestone): starting NG+ must ask for a slot and never write over the parent run
// — pass the parent's slot number in `except` to firstEmpty(), and let the slot screen lock it.
import { SaveSlot } from './SaveStore.js';

export class CampaignSlots {
  constructor({ adapter, count = 4, prefix = 'slot', version = 1, migrations = {}, describe = () => ({}), bus = null }) {
    this.adapter = adapter;
    this.count = count;
    this.prefix = prefix;
    this.version = version;
    this.migrations = migrations;
    this.describe = describe;
    this.bus = bus;
    this.slots = new Map();
    this.account = new SaveSlot({ adapter, key: 'account', version: 1, bus });
  }

  numbers() {
    return Array.from({ length: this.count }, (_, i) => i + 1);
  }

  _check(n) {
    if (!Number.isInteger(n) || n < 1 || n > this.count) throw new Error(`No save slot ${n}`);
  }

  slot(n) {
    this._check(n);
    if (!this.slots.has(n)) this.slots.set(n, new SaveSlot({ adapter: this.adapter, key: `${this.prefix}${n}`, version: this.version, migrations: this.migrations, bus: this.bus }));
    return this.slots.get(n);
  }

  async list() {
    const out = [];
    for (const n of this.numbers()) {
      const s = this.slot(n);
      try {
        const data = await s.load();
        out.push(data ? { n, empty: false, summary: this.describe(data), savedAt: s.lastSavedAt, error: null } : { n, empty: true, summary: null, savedAt: null, error: null });
      } catch (err) {
        out.push({ n, empty: false, summary: null, savedAt: null, error: err.message });
      }
    }
    return out;
  }

  save(n, data) {
    return this.slot(n).save(data);
  }

  load(n) {
    return this.slot(n).load();
  }

  async remove(n) {
    await this.slot(n).clear();
    this.bus?.emit('slots:removed', { n });
  }

  async latest() {
    const good = (await this.list()).filter((s) => !s.empty && !s.error);
    if (!good.length) return null;
    return good.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0].n;
  }

  async firstEmpty(except = []) {
    for (const n of this.numbers()) {
      if (except.includes(n)) continue;
      if (!(await this.slot(n).has())) return n;
    }
    return null;
  }

  async loadAccount() {
    try {
      return (await this.account.load()) ?? {};
    } catch {
      return {}; // every copy damaged: start the account again rather than block the game
    }
  }

  saveAccount(data) {
    return this.account.save(data);
  }

  async adoptLegacy({ key, into = 1, convert = (d) => d, marker = `adopted:${key}` }) {
    const acc = await this.loadAccount();
    if (acc[marker]) return { adopted: false, why: 'done before' };
    const old = new SaveSlot({ adapter: this.adapter, key, version: this.version, migrations: this.migrations });
    let data = null;
    try {
      data = await old.load();
    } catch (err) {
      return { adopted: false, why: err.message }; // try again next time
    }
    let adopted = false;
    if (data && !(await this.slot(into).has())) {
      await this.save(into, convert(data));
      adopted = true;
    }
    await this.saveAccount({ ...acc, [marker]: { at: Date.now(), into: adopted ? into : null } });
    return { adopted, why: data ? (adopted ? null : 'slot not empty') : 'no old save' };
  }
}
