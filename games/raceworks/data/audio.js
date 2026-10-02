// RACEWORKS sound (Milestone 25b) — plain data for core/AudioManager.js and core/SoundSynth.js, so the series Settings'
// Sound / Music / Sound effects rows have something to control. No audio files exist yet, so everything is a code-made
// recipe: a garage music loop and a handful of effects. A real file wins with no code change: drop
// assets/audio/<id>.mp3 with the same id. Sound starts only after the first tap (the browser rule).
// PLACEHOLDERS (DECISIONS.md, M25b): every recipe and which moment plays which sound (main.js).
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const tone = (m, t, d, wave = 'triangle', v = 1, extra = {}) => ({ wave, f: hz(m), t, d, v, ...extra });
const sweep = (f, f2, t, d, wave = 'sine', v = 1, extra = {}) => ({ wave, f, f2, t, d, v, ...extra });
const hiss = (t, d, lp, v = 1, extra = {}) => ({ wave: 'noise', t, d, lp, v, a: 0.002, ...extra });
const arp = (notes, step, len, wave = 'triangle', v = 1, from = 0, extra = {}) => notes.map((m, i) => tone(m, from + i * step, len, wave, v, extra));
const S = (group, layers, extra = {}) => ({ group, recipe: { layers, gain: extra.gain ?? 0.5, echo: extra.echo }, volume: extra.volume ?? 1 });
const ECHO = { delay: 0.09, feedback: 0.35, mix: 0.3 };

export const SOUNDS = {
  sfx_ui: S('ui', [sweep(900, 1300, 0, 0.045, 'sine')], { gain: 0.26 }),
  sfx_build: S('workshop', [hiss(0, 0.05, 3000, 0.7), tone(55, 0.03, 0.1, 'square', 0.6, { lp: 1500 }), tone(62, 0.12, 0.12, 'square', 0.6, { lp: 1800 })], { gain: 0.36 }),
  sfx_upgrade: S('progression', [...arp([67, 71, 74, 79], 0.07, 0.14, 'square', 0.6, 0, { duty: 0.3, lp: 3200 })], { gain: 0.4, echo: ECHO }),
  sfx_item: S('progression', [sweep(700, 1400, 0, 0.12, 'sine', 0.8), tone(88, 0.1, 0.25, 'triangle', 0.7)], { gain: 0.4, echo: ECHO }),
  sfx_cash: S('economy', [tone(83, 0, 0.06, 'square', 0.8, { duty: 0.25, lp: 4000 }), tone(88, 0.06, 0.2, 'square', 0.8, { duty: 0.25, lp: 4000 })], { gain: 0.32 }),
  sfx_car_done: S('progression', [sweep(120, 400, 0, 0.4, 'saw', 0.6, { lp: 1200 }), ...arp([72, 76, 79, 84], 0.09, 0.2, 'triangle', 0.7, 0.3)], { gain: 0.44, echo: ECHO }),
  sfx_win: S('competition', [...arp([67, 72, 76, 79], 0.1, 0.18, 'square', 0.6, 0, { duty: 0.3, lp: 3500 }), ...arp([60, 64, 67, 72], 0, 0.9, 'triangle', 0.5, 0.4), tone(84, 0.4, 0.6, 'triangle', 0.6)], { gain: 0.5 }),
};

const I = [0, 4, 7];
const IV = [5, 9, 12];
const V = [7, 11, 14];
const vi = [9, 12, 16];
export const MUSIC = {
  music_garage: { bpm: 112, root: 64, chords: [I, V, vi, IV], gain: 0.34, pad: { wave: 'triangle', v: 0.09, lp: 1500 }, bass: { v: 0.26, steps: [0, 6, 8, 14] }, arp: { wave: 'square', v: 0.05, every: 2, octave: 1, lp: 2400 }, drums: { v: 0.22, kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14] } },
};
export const AUDIO_RULES = { crossfadeSec: 1.5 };
