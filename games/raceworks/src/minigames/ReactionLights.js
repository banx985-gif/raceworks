// Reaction Lights (Milestone 14, bible §13.4 Drill 3): the only drill without a car or track, so it has its own small
// controller. Five starts: the five lights come on one by one, hold for a seeded moment, then go out — tap as soon as
// they do. Tapping while any light is on is a false start: that start scores 0. No tap within `missAfter` = 0.
// About 25 seconds in all. Deterministic: the hold times come from the seed.
//   const r = new ReactionLights().start({ seed, rounds, rules })
//   r.tick(dt, { tap, handBack }) · r.result() → { score 0–100, finished, handedBack, detail: { starts: [...] } }
//   r.state: { round, phase: 'lighting' | 'hold' | 'go' | 'between' | 'done', lit (0–5), t, starts }
import { Rng } from '../../../../core/Rng.js';
import { LIGHTS } from '../../data/drills.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class ReactionLights {
  start({ seed, rounds = LIGHTS.lights, rules = LIGHTS } = {}) {
    const rng = new Rng(`drill-lights:${seed}`);
    this.rules = rules;
    this.holds = Array.from({ length: rounds }, () => rng.range(rules.holdMin, rules.holdMax));
    this.state = { round: 0, rounds, phase: 'between', phaseT: 0, lit: 0, t: 0, starts: [], finished: false, handedBack: false, lastTap: null };
    this._phase('lighting');
    return this;
  }

  _phase(p) {
    this.state.phase = p;
    this.state.phaseT = 0;
  }

  // Input taps count once each (the screen passes tap: true on the frame of a tap).
  tick(dt, input = {}) {
    const st = this.state;
    const R = this.rules;
    if (st.finished) return;
    if (input.handBack) {
      st.handedBack = true;
      st.finished = true;
      this._phase('done');
      return;
    }
    st.t += dt;
    st.phaseT += dt;
    const tap = !!input.tap;
    if (st.phase === 'lighting' || st.phase === 'hold') {
      if (tap) return this._score({ falseStart: true, reaction: null });
      if (st.phase === 'lighting') {
        st.lit = Math.min(R.lights, 1 + Math.floor(st.phaseT / R.onEvery));
        if (st.phaseT >= R.onEvery * R.lights) this._phase('hold');
      } else if (st.phaseT >= this.holds[st.round]) {
        st.lit = 0;
        this._phase('go');
      }
    } else if (st.phase === 'go') {
      if (tap) this._score({ falseStart: false, reaction: st.phaseT });
      else if (st.phaseT >= R.missAfter) this._score({ falseStart: false, reaction: null, missed: true });
    } else if (st.phase === 'between' && st.phaseT >= R.between) {
      if (st.round >= st.rounds) {
        st.finished = true;
        this._phase('done');
      } else {
        st.lit = 0;
        this._phase('lighting');
      }
    }
  }

  _score(s) {
    const st = this.state;
    const R = this.rules;
    const score = s.reaction == null ? 0 : Math.round(100 * clamp((R.worst - s.reaction) / (R.worst - R.best), 0, 1));
    st.starts.push({ ...s, reaction: s.reaction == null ? null : Math.round(s.reaction * 1000) / 1000, score });
    st.lastTap = st.starts[st.starts.length - 1];
    st.lit = 0;
    st.round++;
    this._phase('between');
  }

  result() {
    const st = this.state;
    const done = st.finished && !st.handedBack && st.starts.length === st.rounds;
    const score = done ? Math.round(st.starts.reduce((t, x) => t + x.score, 0) / st.rounds) : 0;
    return { score, finished: done, handedBack: st.handedBack, time: Math.round(st.t * 100) / 100, detail: { starts: st.starts, falseStarts: st.starts.filter((x) => x.falseStart).length } };
  }
}
