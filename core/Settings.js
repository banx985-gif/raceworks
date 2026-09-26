// Player settings on this device (Milestone 21, bible §6.3 Settings), for any series game. The game gives the list
// of settings and their defaults as data; values live in browser storage under one key and survive new runs and
// Reset Save of the campaign (they are the device's, not the run's).
//   const s = new Settings({ key: 'robot-workshop:settings', defaults: { textSize: 'normal', … } })
//   s.get(id) · s.set(id, value) · s.all · s.onChange((id, value) => …) · s.reset()
export class Settings {
  constructor({ key, defaults = {}, storage = globalThis.localStorage ?? null }) {
    this.key = key;
    this.defaults = { ...defaults };
    this.storage = storage;
    this.listeners = [];
    this.values = { ...this.defaults };
    try {
      const raw = storage?.getItem(key);
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) if (k in this.defaults) this.values[k] = v;
    } catch {
      /* private mode or a broken value: defaults */
    }
  }

  get all() {
    return { ...this.values };
  }

  get(id) {
    return this.values[id];
  }

  set(id, value) {
    if (!(id in this.defaults) || this.values[id] === value) return;
    this.values[id] = value;
    this._save();
    for (const fn of this.listeners) fn(id, value);
  }

  onChange(fn) {
    this.listeners.push(fn);
    return this;
  }

  reset() {
    for (const [k, v] of Object.entries(this.defaults)) this.set(k, v);
  }

  _save() {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.values));
    } catch {
      /* storage full or blocked: the setting still works until the page closes */
    }
  }
}
