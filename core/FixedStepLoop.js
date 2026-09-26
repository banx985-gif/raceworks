// Fixed-step simulation + per-frame render.
// update(dtSeconds) always runs with the same step size; render(alpha) runs once per animation frame.
// Pauses automatically when the tab/app is hidden, and resumes when it comes back.
export class FixedStepLoop {
  constructor({ update, render, stepHz = 60, maxStepsPerFrame = 5, autoPauseOnHide = true, bus = null } = {}) {
    this.update = update || (() => {});
    this.render = render || (() => {});
    this.stepMs = 1000 / stepHz;
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.bus = bus;

    this.running = false;
    this.paused = false;
    this.pausedByHide = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.stepCount = 0;
    this._rafId = 0;

    // Timing stats (smoothed) for the debug overlay.
    this.stats = {
      fps: 0,
      frameMs: 0,
      frameMsMax: 0,
      updateMs: 0,
      renderMs: 0,
      stepsLastFrame: 0,
      droppedSteps: 0,
      history: new Float32Array(120), // recent frame times, ms
      historyIndex: 0,
    };

    this._tick = this._tick.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    if (autoPauseOnHide) {
      document.addEventListener('visibilitychange', this._onVisibility);
      window.addEventListener('pagehide', this._onVisibility);
      window.addEventListener('pageshow', this._onVisibility);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._rafId);
  }

  pause(reason = 'user') {
    if (this.paused) return;
    this.paused = true;
    this.bus?.emit('loop:pause', { reason });
  }

  resume(reason = 'user') {
    if (!this.paused) return;
    this.paused = false;
    this.pausedByHide = false;
    // Throw away time spent paused so the sim does not try to "catch up".
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.bus?.emit('loop:resume', { reason });
  }

  togglePause() {
    this.paused ? this.resume() : this.pause();
  }

  _onVisibility() {
    if (document.hidden) {
      if (!this.paused) {
        this.pausedByHide = true;
        this.pause('hidden');
      }
    } else if (this.pausedByHide) {
      this.resume('visible');
    }
  }

  _tick(now) {
    if (!this.running) return;
    this._rafId = requestAnimationFrame(this._tick);

    let frameMs = now - this.lastTime;
    this.lastTime = now;
    if (frameMs < 0) frameMs = 0;
    this._recordFrame(frameMs);

    let steps = 0;
    const tUpdate = performance.now();
    if (!this.paused) {
      // Clamp huge gaps (debugger breakpoints, slow devices) to avoid a spiral of death.
      this.accumulator += Math.min(frameMs, this.stepMs * this.maxStepsPerFrame);
      while (this.accumulator >= this.stepMs && steps < this.maxStepsPerFrame) {
        this.update(this.stepMs / 1000);
        this.accumulator -= this.stepMs;
        this.stepCount++;
        steps++;
      }
      if (this.accumulator >= this.stepMs) {
        this.stats.droppedSteps += Math.floor(this.accumulator / this.stepMs);
        this.accumulator %= this.stepMs;
      }
    }
    const tRender = performance.now();
    const alpha = this.paused ? 0 : this.accumulator / this.stepMs;
    this.render(alpha);
    const tEnd = performance.now();

    const s = this.stats;
    s.stepsLastFrame = steps;
    s.updateMs = lerp(s.updateMs, tRender - tUpdate, 0.1);
    s.renderMs = lerp(s.renderMs, tEnd - tRender, 0.1);
  }

  _recordFrame(frameMs) {
    const s = this.stats;
    s.history[s.historyIndex] = frameMs;
    s.historyIndex = (s.historyIndex + 1) % s.history.length;
    s.frameMs = s.frameMs ? lerp(s.frameMs, frameMs, 0.1) : frameMs;
    s.fps = s.frameMs > 0 ? 1000 / s.frameMs : 0;
    let max = 0;
    for (let i = 0; i < s.history.length; i++) if (s.history[i] > max) max = s.history[i];
    s.frameMsMax = max;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
