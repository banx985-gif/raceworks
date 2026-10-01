// The Drive Stint view (Milestone 18, bible §8 Drive Stint, §25.3): what the race screen shows while you drive. The race
// screen owns it; while it's active it takes the update, the drawing and the touches.
//   Follow camera on the real circuit (the controller's course from src/race/lapCourse.js stintCourse), the rival cars where
//   the race has them (Aaron's top-down sprites; yours in the team livery), the racing-line / brake-line aids per the M14
//   settings, rain over the road in the wet. Controls: drag the lower-left zone to steer, Brake above it, Push lower-right,
//   Hand Back and Pause top-right. Auto throttle. The HUD: time left, your place and lap, and how you're doing against the
//   crew (the running delta; the race keeps it within ± the cap).
//   const v = createDriveStintView({ ... });  v.start(sim, race) → null or the reason it can't · v.active · v.update(dt)
//   v.render(ctx) · v.onDown / onUp / onTap · v.handBack(reason) · v.onDone(record) (set by the race screen)
import { THEME } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, card } from '../../../../core/ui/Kit.js';
import { createDriveStint } from '../race/driveStint.js';
import { drawDriveWorld, drawDriveControls } from '../race/driveDraw.js';
import { DRILL_SETTINGS } from '../../data/drills.js';
import { WEATHER_NAMES } from '../../data/race.js';
import { liveryKey, teamColourId } from '../ui/livery.js';

const C = THEME.color;
const S = THEME.size;
const PAD = 28;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createDriveStintView({ renderer, layout, assets, team, bus, settings = null, debug = false, drawWeather = () => {} }) {
  let stint = null;
  let sim = null;
  let race = null;
  let camH = -Math.PI / 2;
  let paused = false;
  let steer = 0;
  let steerId = null;
  let steerX0 = 0;
  const brakeIds = new Set();
  const pushIds = new Set();
  let auto = false; // ?debug=1: the controller's perfect driver drives (a forced stint)
  let hits = [];
  let workMs = 0; // game work (update + drawing) of the last frame, ms
  const opt = (k) => settings?.get(k) ?? DRILL_SETTINGS[k];

  const sr = () => layout.safeRect;
  const steerZone = () => ({ x: sr().x + 24, y: sr().y + sr().h - 300, w: Math.min(560, sr().w * 0.55), h: 276 });
  const brakeRect = () => {
    const z = steerZone();
    return { x: z.x, y: z.y - 230, w: 300, h: 200 };
  };
  const pushRect = () => ({ x: sr().x + sr().w - 324, y: sr().y + sr().h - 324, w: 300, h: 300 });
  const handBackRect = () => ({ x: sr().x + sr().w - 324, y: sr().y + 24, w: 300, h: 116 });
  const pauseRect = () => ({ x: sr().x + sr().w - 324, y: sr().y + 156, w: 300, h: 110 });
  const autoRect = () => ({ x: sr().x + sr().w - 324, y: sr().y + 282, w: 300, h: 110 });

  bus.on('input:move', (p) => {
    if (!stint || p.id !== steerId) return;
    const z = steerZone();
    steer = clamp((p.x - steerX0) / (z.w * 0.35), -1, 1);
  });

  const view = {
    onDone: () => {},
    get active() {
      return !!stint && !stint.done;
    },
    get stint() {
      return stint;
    },
    get paused() {
      return paused;
    },
    get steer() {
      return steer;
    },
    get workMs() {
      return workMs;
    },
    rects: () => ({ steer: steerZone(), brake: brakeRect(), push: pushRect(), handBack: handBackRect(), pause: pauseRect() }),
    buttonRect: (id) => hits.find((h) => h.id === id)?.rect ?? { steer: steerZone(), brake: brakeRect(), push: pushRect() }[id] ?? null,
    // Take the wheel. → null, or why not
    start(s, r, { forced = false } = {}) {
      const why = team.races.stintWhy(s, r);
      if (why) return why;
      sim = s;
      race = r;
      const e = sim.byId.PLAYER;
      const secs = team.races.raceTypeOf(r).stintSecs;
      stint = createDriveStint({ sim, secs, ratings: e.ratings, aids: { line: opt('lineAid'), brake: opt('brakeAid') }, sensitivity: opt('steerSensitivity'), n: (r.stints?.length ?? 0) + 1, forced });
      camH = stint.ctl.state.car.h;
      paused = false;
      auto = forced;
      steer = 0;
      steerId = null;
      brakeIds.clear();
      pushIds.clear();
      return null;
    },
    // Hand Back now (the button, System Back, leaving the race, or the stint ending by itself).
    handBack(reason = 'handBack') {
      if (!stint || stint.done) return null;
      const rec = stint.handBack(reason);
      view.finish(rec);
      return rec;
    },
    finish(rec) {
      const s = stint;
      stint = null;
      if (auto) rec.forced = true;
      team.races.stintDone(rec, race);
      view.onDone(rec, s);
    },
    update(dt) {
      if (!stint) return;
      const t0 = performance.now();
      if (!paused) {
        const input = auto ? stint.autopilotInput() : { steer, brake: brakeIds.size > 0, push: pushIds.size > 0 };
        stint.tick(dt, input);
        if (stint.done) view.finish(stint.record);
      }
      workMs = performance.now() - t0;
    },
    render(ctx) {
      if (!stint) return;
      const t0 = performance.now();
      hits = [];
      const ctl = stint.ctl;
      const me = sim.car('PLAYER');
      const others = sim.cars
        .filter((c) => c !== me && !c.finished)
        .map((c) => {
          const p = sim.carPose(c, sim.alpha(), 1);
          return { x: p.x, y: p.y, h: p.heading, sprite: sim.byId[c.id].sprite, alpha: c.retired ? 0.45 : 1 };
        });
      const sprite = liveryKey(assets, sim.byId.PLAYER.sprite, teamColourId(team), team.races.current?.sponsors ?? []); // (Milestone 22: + the sponsors)
      camH = drawDriveWorld(ctx, { renderer, layout, assets, ctl, camH, reduced: opt('reducedMotion'), playerSprite: sprite, others, wet: sim.weather !== 'dry', finish: false });
      drawWeather(ctx, { x: 0, y: 0, w: renderer.width, h: renderer.height }, sim.weather);
      // the HUD
      const R = sr();
      const live = stint.live;
      const box = { x: R.x + 24, y: R.y + 24, w: R.w - 24 * 3 - 300, h: 250 };
      card(ctx, box, 'info');
      text(ctx, `Drive Stint · ${Math.ceil(live.left)} s left`, box.x + PAD, box.y + 20, { size: S.heading, bold: true, maxWidth: box.w - PAD * 2 });
      const pos = sim.order().indexOf(me) + 1;
      text(ctx, `P${pos} · Lap ${sim.lapOf(me)} / ${sim.laps} · ${WEATHER_NAMES[sim.weather]}`, box.x + PAD, box.y + 96, { size: S.small, bold: true, color: C.actionDark, maxWidth: box.w - PAD * 2 });
      const d = live.delta;
      const shown = clamp(d, -live.cap, live.cap);
      const words = `vs the crew ${shown <= 0 ? '−' : '+'}${Math.abs(shown).toFixed(1)} s (at most ±${live.cap.toFixed(1)})${live.overtakes ? ` · ${live.overtakes} passed` : ''}`;
      text(ctx, words, box.x + PAD, box.y + 160, { size: S.small, bold: true, color: shown <= 0 ? C.good : C.bad, maxWidth: box.w - PAD * 2 });
      const hb = handBackRect();
      drawButton(ctx, hb, 'Hand Back', { accent: C.bad });
      hits.push({ rect: hb, id: 'stintHandBack', onTap: () => view.handBack('handBack') });
      const pr = pauseRect();
      drawButton(ctx, pr, paused ? 'Play' : 'Pause', { accent: C.outline, selected: paused });
      hits.push({ rect: pr, id: 'stintPause', onTap: () => (paused = !paused) });
      if (debug) {
        const ar = autoRect();
        drawButton(ctx, ar, auto ? 'Debug: auto ✓' : 'Debug: autopilot', { accent: C.purple });
        hits.push({ rect: ar, id: 'stintAuto', onTap: () => (auto = !auto) });
      }
      drawDriveControls(ctx, { zone: steerZone(), brake: brakeRect(), steer, steering: steerId !== null, braking: brakeIds.size > 0, push: { rect: pushRect(), active: pushIds.size > 0 || live.push } });
      if (paused) text(ctx, 'Paused', R.x + R.w / 2, R.y + R.h * 0.35, { size: S.title, bold: true, align: 'center', color: '#F4F1EA' });
      workMs += performance.now() - t0;
    },
    onDown(p) {
      if (!stint) return false;
      if ([handBackRect(), pauseRect(), ...(debug ? [autoRect()] : [])].some((r) => hitRect(p, r))) return true;
      if (hitRect(p, pushRect())) pushIds.add(p.id);
      else if (hitRect(p, brakeRect())) brakeIds.add(p.id);
      else if (hitRect(p, steerZone()) && steerId === null) {
        steerId = p.id;
        steerX0 = p.x - steer * steerZone().w * 0.35;
      }
      return true;
    },
    onUp(p) {
      if (!stint) return false;
      brakeIds.delete(p.id);
      pushIds.delete(p.id);
      if (p.id === steerId) {
        steerId = null;
        steer = 0;
      }
      return true;
    },
    onTap(p) {
      if (!stint) return false;
      const h = hits.find((x) => hitRect(p, x.rect));
      h?.onTap();
      return true;
    },
    // (tests) drive with a scripted input for a while: { steer, brake, push }
    setAuto: (on) => (auto = !!on),
  };
  return view;
}
