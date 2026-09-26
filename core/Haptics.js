// Short phone vibrations (bible §7: light on purchase / build / phase finish, medium on unlock / win), for any series
// game. Off in Settings = nothing. Phones without vibration (and desktops) just ignore it.
//   const h = new Haptics({ enabled: () => settings.get('haptics') });   h.light()   h.medium()
export class Haptics {
  constructor({ enabled = () => true, nav = globalThis.navigator } = {}) {
    this.enabled = enabled;
    this.nav = nav;
    this.count = 0; // for checks
  }

  _buzz(ms) {
    if (!this.enabled()) return false;
    this.count++;
    try {
      this.nav?.vibrate?.(ms);
    } catch {
      /* not allowed here */
    }
    return true;
  }

  light() {
    return this._buzz(12);
  }

  medium() {
    return this._buzz(28);
  }
}
