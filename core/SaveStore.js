// Hardened saves (bible §37, Milestone 22), for any series game. A player must never lose progress.
//
//   checksum(text)                      FNV-1a 32-bit, as 8 hex digits
//   migrateSave(raw, { version, migrations })
//                                       §37.6: every load goes through here, one step per version (15→16, 16→17 …).
//                                       Old records are never changed in place (each step returns a new object);
//                                       fields a step does not know are carried along untouched (ignored).
//   new SaveSlot({ adapter, key, version, migrations, rolling = 3, bus })
//     A slot keeps its last `rolling` saves under key#0, key#1, key#2… Each save goes to the next one with a higher
//     sequence number, a checksum and its size, and is read back and checked; the newest copy that checks out is
//     "current". So a write cut off half way (the phone killed the app) is simply never used.
//     save(data) → record                 load() → data (migrated) or null; slot.lastLoad tells what happened:
//       { record, fallback: true when a newer copy was damaged and an older one was used, damaged: [..], error }
//     The old single-key layout (key, before Milestone 22) is read too, as the oldest copy.
//     list() → every copy with its version, size, time and checksum status (the save inspector)
//     damage() (debug) · clear() · importRecord(record) (debug: a save pasted from a bug report)
//   moveLegacySaves({ adapter, keys, localPrefix, marker })
//     One time only: saves kept before Milestone 22 (the old single key in this database, or in localStorage on a
//     phone that fell back to it) are copied into the new layout, read back and compared, and only then is the move
//     marked done. The old copies are left where they were.
export function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function migrateSave(raw, { version, migrations = {} }) {
  if (!raw || typeof raw !== 'object' || typeof raw.data !== 'object' || raw.data === null) throw new Error('Not a save record');
  let record = raw;
  let v = record.saveVersion ?? 0;
  if (v > version) throw new Error(`Save version ${v} is newer than this game (${version})`);
  while (v < version) {
    const step = migrations[v];
    if (!step) throw new Error(`No save migration from version ${v}`);
    record = { ...step(record), saveVersion: v + 1 };
    v++;
  }
  return record;
}

// What a stored copy looks like to the loader: 'ok' (checksum matches), 'legacy' (from before checksums — trusted if
// it has data), 'damaged', or 'empty'.
export function recordStatus(raw) {
  if (raw == null) return 'empty';
  if (typeof raw !== 'object' || typeof raw.data !== 'object' || raw.data === null) return 'damaged';
  if (raw.checksum == null) return 'legacy';
  try {
    return checksum(JSON.stringify(raw.data)) === raw.checksum ? 'ok' : 'damaged';
  } catch {
    return 'damaged';
  }
}

export class SaveSlot {
  constructor({ adapter, key, version = 1, migrations = {}, rolling = 3, bus = null }) {
    this.adapter = adapter;
    this.key = key;
    this.version = version;
    this.migrations = migrations;
    this.rolling = rolling;
    this.bus = bus;
    this.seq = null; // highest sequence number written or seen
    this.lastSavedAt = null;
    this.lastLoad = null;
    this.lastWrite = null; // { ms, bytes, seq }
    this._chain = Promise.resolve(); // saves never overlap
  }

  slotKey(i) {
    return `${this.key}#${i}`;
  }

  async _read(k) {
    try {
      return await this.adapter.get(k);
    } catch (err) {
      return { __unreadable: String(err?.message ?? err) };
    }
  }

  // Every stored copy, newest first (the old single key last).
  async _copies() {
    const out = [];
    for (let i = 0; i < this.rolling; i++) {
      const raw = await this._read(this.slotKey(i));
      if (raw != null) out.push({ k: this.slotKey(i), slot: i, raw, seq: typeof raw.seq === 'number' ? raw.seq : -1 });
    }
    out.sort((a, b) => b.seq - a.seq);
    const legacy = await this._read(this.key);
    if (legacy != null) out.push({ k: this.key, slot: 'legacy', raw: legacy, seq: -2 });
    return out;
  }

  save(data) {
    const run = this._chain.then(() => this._save(data));
    this._chain = run.catch(() => {});
    return run;
  }

  async _save(data) {
    const t0 = globalThis.performance?.now() ?? Date.now();
    const json = JSON.stringify(data); // plain data only: never class instances or functions
    const sum = checksum(json);
    // Nothing changed since the last write: skip it (the account and the archived endings rarely change).
    if (this.lastRecord && this.lastRecord.checksum === sum && this.lastRecord.saveVersion === this.version) {
      this.lastWrite = { ms: 0, bytes: json.length, seq: this.lastRecord.seq, skipped: true };
      return this.lastRecord;
    }
    if (this.seq == null) this.seq = Math.max(-1, ...(await this._copies()).map((c) => c.seq));
    const seq = this.seq + 1;
    const record = { saveVersion: this.version, savedAt: Date.now(), seq, checksum: sum, bytes: json.length, data: JSON.parse(json) };
    const k = this.slotKey(seq % this.rolling);
    await this.adapter.set(k, record);
    // Read it back: only a copy that checks out may become current (a bad one is never picked by load anyway).
    const back = await this._read(k);
    if (recordStatus(back) !== 'ok' || back.seq !== seq) {
      this.bus?.emit('save:failed', { key: this.key, seq });
      throw new Error(`Save ${this.key} did not read back correctly`);
    }
    this.seq = seq;
    this.lastSavedAt = record.savedAt;
    this.lastRecord = { saveVersion: record.saveVersion, seq, checksum: sum };
    const ms = (globalThis.performance?.now() ?? Date.now()) - t0;
    this.lastWrite = { ms, bytes: json.length, seq };
    this.bus?.emit('save:written', { key: this.key, savedAt: record.savedAt, seq, ms, bytes: json.length });
    return record;
  }

  // The newest copy that checks out and migrates. Damaged copies are skipped, never deleted or written over first.
  async load() {
    await this._chain;
    const copies = await this._copies();
    const damaged = [];
    for (const c of copies) {
      const st = recordStatus(c.raw);
      if (st === 'damaged') {
        damaged.push({ key: c.k, seq: c.seq, why: c.raw?.__unreadable ?? 'checksum' });
        continue;
      }
      try {
        const record = migrateSave(c.raw, { version: this.version, migrations: this.migrations });
        this.seq = Math.max(this.seq ?? -1, ...copies.map((x) => x.seq)); // new saves go above every copy, damaged ones too
        this.lastSavedAt = record.savedAt ?? null;
        this.lastLoad = { record, from: c.k, fallback: damaged.length > 0, damaged, error: null };
        this.bus?.emit('save:loaded', { key: this.key, saveVersion: c.raw.saveVersion, from: c.k, fallback: damaged.length > 0 });
        return record.data;
      } catch (err) {
        damaged.push({ key: c.k, seq: c.seq, why: err.message });
      }
    }
    this.lastLoad = { record: null, from: null, fallback: false, damaged, error: damaged.length ? new Error(`Every copy of ${this.key} failed: ${damaged.map((d) => d.why).join('; ')}`) : null };
    if (this.lastLoad.error) throw this.lastLoad.error;
    return null;
  }

  async has() {
    return (await this._copies()).length > 0;
  }

  // The save inspector: every copy, newest first.
  async list() {
    const copies = await this._copies();
    const firstGood = copies.find((c) => ['ok', 'legacy'].includes(recordStatus(c.raw)));
    return copies.map((c) => ({
      key: c.k,
      slot: c.slot,
      seq: c.seq,
      version: c.raw?.saveVersion ?? null,
      savedAt: c.raw?.savedAt ?? null,
      bytes: c.raw?.bytes ?? (c.raw?.data ? JSON.stringify(c.raw.data).length : 0),
      status: recordStatus(c.raw),
      current: c === firstGood,
    }));
  }

  // Debug: spoil the current copy (its data changes, its checksum does not) — the next load must fall back.
  async damage() {
    await this._chain;
    const c = (await this._copies()).find((x) => recordStatus(x.raw) === 'ok');
    if (!c) return false;
    const bad = { ...c.raw, data: { ...c.raw.data, __damaged: Date.now() } };
    this.lastRecord = null;
    await this.adapter.set(c.k, bad);
    return c.k;
  }

  // Debug: a whole save record from a bug report (any older version) becomes the newest copy.
  async importRecord(raw) {
    migrateSave(raw, { version: this.version, migrations: this.migrations }); // must migrate cleanly first
    await this._chain;
    if (this.seq == null) this.seq = Math.max(-1, ...(await this._copies()).map((c) => c.seq));
    const json = JSON.stringify(raw.data);
    const seq = this.seq + 1;
    const record = { ...raw, seq, checksum: checksum(json), bytes: json.length, data: JSON.parse(json) };
    await this.adapter.set(this.slotKey(seq % this.rolling), record);
    this.seq = seq;
    this.lastRecord = null;
    return record;
  }

  async clear() {
    await this._chain;
    for (let i = 0; i < this.rolling; i++) await this.adapter.remove(this.slotKey(i));
    await this.adapter.remove(this.key);
    this.seq = null;
    this.lastRecord = null;
    this.lastSavedAt = null;
  }
}

// The one-time move into the Milestone 22 layout. keys: ['campaign', 'account', …]; localPrefix: the old localStorage
// prefix ('robot-workshop:'); settingsKey: a localStorage settings item to copy too. Returns what was moved.
export async function moveLegacySaves({ adapter, keys, localPrefix, settingsKey = null, marker = 'meta:layout', layout = 2, storage = globalThis.localStorage ?? null }) {
  const done = await adapter.get(marker);
  if (done?.layout >= layout) return { already: true, moved: [] };
  const moved = [];
  const readLocal = (k) => {
    try {
      const raw = storage?.getItem(localPrefix + k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  for (const key of keys) {
    const slot0 = await adapter.get(`${key}#0`);
    if (slot0) continue; // already in the new layout
    // The newest of: the old key in this database, the old key in localStorage.
    const candidates = [
      { from: 'indexeddb', raw: adapter.kind === 'localstorage' ? null : await adapter.get(key) },
      { from: 'localstorage', raw: adapter.kind === 'localstorage' ? await adapter.get(key) : readLocal(key) },
    ].filter((c) => c.raw && typeof c.raw.data === 'object');
    if (!candidates.length) continue;
    candidates.sort((a, b) => (b.raw.savedAt ?? 0) - (a.raw.savedAt ?? 0));
    const src = candidates[0];
    const json = JSON.stringify(src.raw.data);
    const record = { ...src.raw, seq: 0, checksum: checksum(json), bytes: json.length, movedFrom: src.from };
    await adapter.set(`${key}#0`, record);
    const back = await adapter.get(`${key}#0`);
    if (recordStatus(back) !== 'ok' || JSON.stringify(back.data) !== json) throw new Error(`Moving ${key} did not read back — nothing marked, will try again next time`);
    moved.push({ key, from: src.from, bytes: json.length, saveVersion: src.raw.saveVersion });
  }
  if (settingsKey) {
    try {
      const raw = storage?.getItem(settingsKey);
      if (raw && !(await adapter.get('settings'))) {
        await adapter.set('settings', { savedAt: Date.now(), values: JSON.parse(raw) });
        moved.push({ key: 'settings', from: 'localstorage' });
      }
    } catch {
      /* settings are small and also stay in localStorage */
    }
  }
  await adapter.set(marker, { layout, movedAt: Date.now(), moved });
  return { already: false, moved };
}
