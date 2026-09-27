// The first-launch ads & privacy answer (bible §32.1, Robot Workshop M29a), for any series game with real ads.
// No ad is ever requested before the player has answered; the answer is remembered on this device and can be changed
// from Settings → Privacy. The game draws the message itself (its own dialog); this only keeps the answer.
//
//   const consent = new AdConsent({ key: 'robot-workshop:adConsent' })
//   consent.answered          has the player answered yet?
//   consent.value             → { given, personalised, at } (given = ads allowed at all)
//   consent.set({ personalised })   the player chose (always "given": the game shows ads either way; personalised or not)
export class AdConsent {
  constructor({ key, storage = globalThis.localStorage, now = () => Date.now() } = {}) {
    this.key = key;
    this.storage = storage;
    this.now = now;
    this._value = null;
    try {
      this._value = JSON.parse(storage?.getItem(key) ?? 'null');
    } catch {
      this._value = null;
    }
  }

  get answered() {
    return !!this._value?.at;
  }

  get value() {
    return { given: !!this._value?.given, personalised: !!this._value?.personalised, at: this._value?.at ?? null };
  }

  set({ personalised = false } = {}) {
    this._value = { given: true, personalised: !!personalised, at: this.now() };
    try {
      this.storage?.setItem(this.key, JSON.stringify(this._value));
    } catch {
      /* asked again next launch */
    }
    return this.value;
  }
}
