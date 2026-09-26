// First-time guide: short steps from game data, shown one at a time when they make sense.
//
// A step (plain data):
//   { id, title, text,                              one or two short sentences
//     target: 'name' | null,                        what to point at (the game resolves names to screen rects)
//     art: 'imageKey' | null,                       optional picture in the speech box
//     trigger: { after: 'stepId', event: 'bus:event', screen: ['name', …] },   all optional, all must hold
//     advance: { tap: true } | { next: true } | { event: 'bus:event' },
//       tap   – the player taps the highlighted thing (the tap still reaches the game)
//       next  – a "Got it" button
//       event – something happens in the game (e.g. a project starts)
//     block: true|false,                            true: only the target (and the box) can be tapped
//     restartAt: 'stepId',                           after a reload, go back to this step instead
//     skipAlso: ['stepId', …],                       skipping this step also skips these (they can't show without it)
//     skipIf: 'bus:event' }                           the player already did it on their own: the step counts as done
//
// The game supplies:
//   targetRect(name) → { x, y, w, h } in screen units, or null when it is not on screen
//   screen() → current screen name;  canShow() → false while something bigger is on screen
//   pause() → true if it paused the game (so it knows to resume);  resume()
// Progress (done / seen / events seen / off) is plain data for the game's save: serialize() / load().
// Emits 'guide:show' ({ step }), 'guide:done' ({ step, skipped }), 'guide:change'.
export class GuideSystem {
  constructor({ steps, bus, targetRect, screen, canShow = () => true, pause = () => false, resume = () => {} }) {
    this.steps = steps;
    this.bus = bus;
    this.targetRect = targetRect;
    this.screen = screen;
    this.canShow = canShow;
    this.pause = pause;
    this.resume = resume;
    this.byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    this.current = null; // step being shown (or waiting to be shown again, e.g. after a screen change)
    this.shownAt = 0;
    this._paused = false;
    this.reset();
    // Listen for every event any step needs (triggers and advances).
    const events = new Set();
    for (const s of steps) {
      if (s.trigger?.event) events.add(s.trigger.event);
      if (s.advance?.event) events.add(s.advance.event);
      if (s.skipIf) events.add(s.skipIf);
    }
    for (const e of events) bus.on(e, () => this._event(e));
    bus.on('screen:change', () => this.update());
  }

  reset() {
    this._finishPause();
    this.state = { done: [], seen: [], events: [], off: false };
    this.current = null;
  }

  get active() {
    return !this.state.off && !!this.current && this.visible;
  }

  // Seen steps in order, for the Help list.
  get seenSteps() {
    return this.state.seen.map((id) => this.byId[id]).filter(Boolean);
  }

  _event(name) {
    if (!this.state.events.includes(name)) this.state.events.push(name);
    const s = this.current;
    // Only counts once the step has actually been shown (an earlier tap can fire the same event). It still counts if
    // the thing it pointed at has just gone (e.g. the hired candidate's card disappears as the hire happens).
    if (s && this.shownId === s.id && s.advance?.event === name) this.complete(false);
    else this.update();
    this._changed();
  }

  _ready(s) {
    const st = this.state;
    if (st.done.includes(s.id)) return false;
    if (s.skipIf && st.events.includes(s.skipIf)) {
      st.done.push(s.id); // already done without being told
      return false;
    }
    const t = s.trigger ?? {};
    if (t.after && !st.done.includes(t.after)) return false;
    if (t.event && !st.events.includes(t.event)) return false;
    return true;
  }

  _placeOk(s) {
    const t = s.trigger ?? {};
    if (t.screen && !t.screen.includes(this.screen())) return false;
    if (s.target && !this.targetRect(s.target)) return false;
    return true;
  }

  // Is the current step showing right now?
  get visible() {
    const s = this.current;
    return !!s && this.canShow() && this._placeOk(s);
  }

  // Pick the next step if none is waiting; pause the game while one shows.
  update() {
    if (this.state.off) return;
    const c = this.current;
    if (c?.skipIf && this.shownId !== c.id && this.state.events.includes(c.skipIf)) {
      this.state.done.push(c.id); // waiting to show, but the player has just done it anyway
      this.current = null;
    }
    if (!this.current) {
      const next = this.steps.find((s) => this._ready(s));
      if (!next) return;
      this.current = next;
    }
    if (this.visible) {
      if (!this.state.seen.includes(this.current.id)) {
        this.state.seen.push(this.current.id);
        this._changed();
      }
      if (!this._paused && this.shownId !== this.current.id) {
        this._paused = this.pause();
        this.shownId = this.current.id;
        this.shownAt = performance.now();
        this.bus.emit('guide:show', { step: this.current });
      }
    }
  }

  complete(skipped = false) {
    const s = this.current;
    if (!s) return;
    if (!this.state.done.includes(s.id)) this.state.done.push(s.id);
    this.current = null;
    this.shownId = null;
    this._finishPause();
    this.bus.emit('guide:done', { step: s, skipped });
    this._changed();
    this.update();
  }

  skip() {
    const also = this.current?.skipAlso ?? [];
    for (const id of also) if (!this.state.done.includes(id)) this.state.done.push(id);
    this.complete(true);
  }

  // Turn the whole guide off (Help can turn it back on).
  turnOff() {
    this.state.off = true;
    this.current = null;
    this.shownId = null;
    this._finishPause();
    this._changed();
  }

  turnOn() {
    this.state.off = false;
    this._changed();
    this.update();
  }

  _finishPause() {
    if (this._paused) this.resume();
    this._paused = false;
  }

  _changed() {
    this.bus.emit('guide:change', {});
  }

  // --- input (the ScreenRouter asks this layer first) ---------------------------------
  // tapHit(p) is called by the coach mark: 'next' | 'skip' | 'off' | 'target' | 'box' | null
  handleInput(hook, p, where) {
    if (!this.active) return false;
    const s = this.current;
    if (hook === 'onTap') {
      if (performance.now() - this.shownAt < 300) return true; // ignore a stray tap as it appears
      if (where === 'next') return this.complete(false), true;
      if (where === 'skip') return this.skip(), true;
      if (where === 'off') return this.turnOff(), true;
      if (where === 'box') return true;
      if (where === 'target') {
        if (s.advance?.tap) this.complete(false);
        return false; // the tap also reaches the game
      }
      return !!s.block;
    }
    if (hook === 'onDragStart' || hook === 'onDrag' || hook === 'onDragEnd' || hook === 'onHold') return !!s.block;
    return false;
  }

  serialize() {
    return JSON.parse(JSON.stringify({ ...this.state, current: this.current?.id ?? null }));
  }

  // After a reload: resume on the saved step (or the step it says to restart at).
  load(data) {
    this.reset();
    if (!data) return;
    this.state = { done: [...(data.done ?? [])], seen: [...(data.seen ?? [])], events: [...(data.events ?? [])], off: !!data.off };
    let cur = data.current ? this.byId[data.current] : null;
    if (cur?.restartAt) {
      const back = this.byId[cur.restartAt];
      // undo the steps from the restart point onwards so they run again in order
      const from = this.steps.indexOf(back);
      const to = this.steps.indexOf(cur);
      for (let i = from; i < to; i++) this.state.done = this.state.done.filter((id) => id !== this.steps[i].id);
      cur = back;
    }
    this.current = cur && !this.state.done.includes(cur.id) ? cur : null;
  }
}
