// Several campaign save slots side by side (DEVWORKS Milestone 5b; any series game). Each slot is its own
// core/SaveStore.js SaveSlot under its own key — its own rolling copies, checksums and migrations — so saving or
// deleting one slot never touches another. A small meta record remembers which slot was played last (Continue).
//
//   const slots = new SaveSlots({ adapter, keys: ['game:campaign', 'game:campaign:2', …], metaKey, version,
//                                 migrations, rolling, bus })
//   slots.count · slots.slot(i) → SaveSlot (i from 0)
//   await slots.peek(i)   → the slot's data (migrated), or null when empty; { error } when every copy is damaged
//   await slots.peekAll() → [data | null | { error }] for every slot
//   await slots.lastUsed() / setLastUsed(i)
//   await slots.firstEmpty() → index or -1
//   await slots.remove(i) → clears that slot's copies (and forgets it as last used)
// Keys are passed in, so a game's old single-slot key can simply be its Slot 1.
import { SaveSlot } from './SaveStore.js';

export class SaveSlots {
  constructor({ adapter, keys, metaKey, version = 1, migrations = {}, rolling = 3, bus = null }) {
    this.adapter = adapter;
    this.keys = keys;
    this.metaKey = metaKey;
    this.slots = keys.map((key) => new SaveSlot({ adapter, key, version, migrations, rolling, bus }));
  }

  get count() {
    return this.slots.length;
  }

  slot(i) {
    return this.slots[i] ?? null;
  }

  async peek(i) {
    // A separate reader, so looking at a slot never changes the live slot's sequence numbers.
    const s = this.slots[i];
    const reader = new SaveSlot({ adapter: this.adapter, key: s.key, version: s.version, migrations: s.migrations, rolling: s.rolling });
    try {
      return await reader.load();
    } catch (err) {
      return { error: err.message ?? String(err) };
    }
  }

  async peekAll() {
    const out = [];
    for (let i = 0; i < this.slots.length; i++) out.push(await this.peek(i));
    return out;
  }

  async lastUsed() {
    try {
      const m = await this.adapter.get(this.metaKey);
      return typeof m?.lastSlot === 'number' ? m.lastSlot : null;
    } catch {
      return null;
    }
  }

  async setLastUsed(i) {
    await this.adapter.set(this.metaKey, { lastSlot: i, at: Date.now() });
  }

  async firstEmpty() {
    for (let i = 0; i < this.slots.length; i++) if (!(await this.slots[i].has())) return i;
    return -1;
  }

  async remove(i) {
    await this.slots[i].clear();
    if ((await this.lastUsed()) === i) await this.adapter.remove(this.metaKey);
  }
}
