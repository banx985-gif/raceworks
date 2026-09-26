// Sound hooks. The game calls play('sale') etc.; which file each name uses comes from game data.
// Names with no file yet are silent placeholders: the call is still counted and logged, so the
// hooks can be checked now and real sounds dropped in later without touching game code.
// Caps (bible §40): at most 10 sounds at once; a sound that is already playing is not restarted
// within minGapMs (stops a flood of identical taps).
export class AudioManager {
  constructor({ bus = null, sounds = {}, basePath = '', maxVoices = 10, minGapMs = 60, volume = 1, muted = false } = {}) {
    this.bus = bus;
    this.sounds = sounds; // name → { file: 'path.mp3' | null, volume? }
    this.basePath = basePath;
    this.maxVoices = maxVoices;
    this.minGapMs = minGapMs;
    this.volume = volume;
    this.muted = muted;
    this.counts = {}; // name → times played (placeholders included)
    this.log = []; // last few plays: { name, at, silent }
    this.voices = new Set();
    this._last = {};
    this._elements = {};
  }

  // Returns true if the hook fired (a real sound or a silent placeholder).
  play(name) {
    const def = this.sounds[name];
    if (!def) {
      console.warn(`[AudioManager] unknown sound "${name}"`);
      return false;
    }
    const now = performance.now();
    if (now - (this._last[name] ?? -Infinity) < this.minGapMs) return false;
    this._last[name] = now;
    this.counts[name] = (this.counts[name] ?? 0) + 1;
    const silent = !def.file || this.muted;
    this.log.push({ name, at: now, silent });
    if (this.log.length > 20) this.log.shift();
    this.bus?.emit('audio:play', { name, silent });
    if (silent || this.voices.size >= this.maxVoices) return true;

    const el = (this._elements[name] ||= new Audio(this.basePath + def.file));
    const voice = el.paused ? el : el.cloneNode();
    voice.volume = Math.min(1, (def.volume ?? 1) * this.volume);
    this.voices.add(voice);
    voice.onended = voice.onerror = () => this.voices.delete(voice);
    voice.play().catch(() => this.voices.delete(voice));
    return true;
  }

  setMuted(muted) {
    this.muted = muted;
  }
}
