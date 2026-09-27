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
//
// Summary records (CAREWORKS Milestone 0; optional — a game that never writes one works exactly as before):
//   await slots.create(n, { data, summary })  write a new campaign into slot n: its save, its summary record, last used
//   await slots.writeSummary(n, summary)       refresh slot n's summary (e.g. on each autosave)
//   await slots.summaries()                    [{ n, empty, summary, savedAt, error }] from the small summary records
//                                               only (the slot screen never loads a whole campaign); a slot with a save
//                                               but no record falls back to describe(load)
//   await slots.lastUsed() → n or null         await slots.setLastUsed(n)   (its own small key, not in any slot)
//   remove(n) also drops slot n's summary record and forgets it as last used.
// accountKey (default 'account') names the account store; prefix 'campaign_' gives the keys campaign_1 … campaign_4.
import { SaveSlot } from './SaveStore.js';

export class CampaignSlots {
  constructor({ adapter, count = 4, prefix = 'slot', version = 1, migrations = {}, describe = () => ({}), bus = null, accountKey = 'account' }) {
    this.adapter = adapter;
    this.count = count;
    this.prefix = prefix;
    this.version = version;
    this.migrations = migrations;
    this.describe = describe;
    this.bus = bus;
    this.slots = new Map();
    this.account = new SaveSlot({ adapter, key: accountKey, version: 1, bus });
    this.lastKey = `${prefix}last`;
  }

  summaryKey(n) {
    this._check(n);
    return `${this.prefix}${n}:summary`;
  }

  async create(n, { data, summary }) {
    await this.save(n, data);
    await this.writeSummary(n, summary);
    await this.setLastUsed(n);
    this.bus?.emit('slots:created', { n });
  }

  writeSummary(n, summary) {
    return this.adapter.set(this.summaryKey(n), { summary, savedAt: Date.now() });
  }

  async summaries() {
    const out = [];
    for (const n of this.numbers()) {
      try {
        const rec = await this.adapter.get(this.summaryKey(n));
        if (rec?.summary) {
          out.push({ n, empty: false, summary: rec.summary, savedAt: rec.savedAt ?? null, error: null });
          continue;
        }
        const s = this.slot(n);
        if (!(await s.has())) {
          out.push({ n, empty: true, summary: null, savedAt: null, error: null });
          continue;
        }
        const data = await s.load(); // a save written without a record (older build): describe it the long way
        out.push(data ? { n, empty: false, summary: this.describe(data), savedAt: s.lastSavedAt, error: null } : { n, empty: true, summary: null, savedAt: null, error: null });
      } catch (err) {
        out.push({ n, empty: false, summary: null, savedAt: null, error: err.message ?? String(err) });
      }
    }
    return out;
  }

  async lastUsed() {
    try {
      const m = await this.adapter.get(this.lastKey);
      return Number.isInteger(m?.n) && m.n >= 1 && m.n <= this.count ? m.n : null;
    } catch {
      return null;
    }
  }

  setLastUsed(n) {
    this._check(n);
    return this.adapter.set(this.lastKey, { n, at: Date.now() });
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
    await this.adapter.remove(this.summaryKey(n));
    if ((await this.lastUsed()) === n) await this.adapter.remove(this.lastKey);
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
