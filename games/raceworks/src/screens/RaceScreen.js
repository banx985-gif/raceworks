// The race (Milestone 6): watch the field race round the code-drawn circuit (bible §22.4, §23, §24.1 Watch).
//   Overview camera: the whole circuit (src/race/trackDraw.js, cached — it never changes during a race).
//   Top: ‹ Garage (leave; the race waits, saved, exactly where it was), the lap, the race clock, your position.
//   Bottom: the running order, Pause / 1× / 2× / 4× and Skip Result (bible §24.5).
// The screen only READS the race model (src/race/raceSim.js): watching at any speed or skipping gives the same result.
//   enter() takes the team's current race; onFinished(sim) when it ends; onLeave() for ‹ Garage.
import { THEME, font } from '../../../../core/Theme.js';
import { CachedLayer } from '../../../../core/CachedLayer.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { fitView, drawCircuit, drawCar, toScreen } from '../race/trackDraw.js';
import { RACE } from '../../data/race.js';

const C = THEME.color;
const S = THEME.size;
const TOP_H = 150;
const ROW_H = 54;
const CTRL_H = 116;
const CAR_LEN = 46; // logical px a car is drawn in the overview (the road is drawn wider to match)

export const raceClock = (secs) => {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
const surname = (name) => name.split(' ').slice(-1)[0];

export function createRaceScreen({ renderer, layout, assets, team, bus, onFinished, onLeave }) {
  let sim = null;
  let speed = 1;
  let paused = false;
  let keepT = 0;
  let endT = 0;
  let ended = false;
  let view = null;
  let trackRect = null;
  let buttons = [];
  const layer = new CachedLayer({ width: 1, height: 1, draw: (g) => drawTrackLayer(g) });

  function rects() {
    const sr = layout.safeRect;
    const top = { x: sr.x + 16, y: sr.y + 12, w: sr.w - 32, h: TOP_H };
    const rows = Math.ceil((sim?.cars.length ?? 8) / 2);
    const bh = CTRL_H + rows * ROW_H + 60;
    const bottom = { x: sr.x + 16, y: sr.y + sr.h - bh - 12, w: sr.w - 32, h: bh };
    const track = { x: sr.x, y: top.y + top.h + 8, w: sr.w, h: bottom.y - (top.y + top.h) - 16 };
    return { top, bottom, track };
  }

  function drawTrackLayer(g) {
    if (!sim || !view) return;
    // the layer covers the track area; the view is in screen coordinates, so shift it into the layer
    g.save();
    g.translate(-trackRect.x, -trackRect.y);
    drawCircuit(g, sim.geo, view);
    g.restore();
  }

  function relayout() {
    const r = rects();
    trackRect = r.track;
    view = fitView(sim.geo, trackRect, 24);
    layer.resize(trackRect.w, trackRect.h);
    layer.setPixelScale(renderer.pixelScale);
    layer.invalidate();
  }

  const player = () => sim?.cars.find((c) => sim.byId[c.id].isPlayer);
  const lapOf = (c) => Math.max(1, Math.min(sim.laps, c.lapsDone + 1));

  // Gap to the leader in seconds (from distance and the leader's speed) — only for the running order display.
  function gapText(c, leader, i) {
    if (c.retired) return 'DNF';
    if (c.finished) return i === 0 ? 'Finished' : c.lapsDone < leader.lapsDone ? `+${leader.lapsDone - c.lapsDone} lap` : `+${(c.finishT - leader.finishT).toFixed(1)}`;
    if (i === 0) return `Lap ${lapOf(c)}`;
    const d = leader.s - c.s;
    if (d > sim.geo.length) return `+${Math.floor(d / sim.geo.length)} lap`;
    return `+${(d / Math.max(20, leader.v || 40)).toFixed(1)}`;
  }

  function skip() {
    if (!sim) return;
    sim.run();
  }

  return {
    get sim() {
      return sim;
    },
    get speed() {
      return speed;
    },
    get paused() {
      return paused;
    },
    buttonRect(id) {
      return buttons.find((b) => b.id === id)?.rect ?? null;
    },
    enter() {
      sim = team.races.sim();
      if (!sim) return onLeave();
      speed = 1;
      paused = false;
      keepT = 0;
      endT = 0;
      ended = false;
      relayout();
    },
    exit() {
      if (sim && team.races.current) team.races.keep(sim);
    },
    resize() {
      if (sim) relayout();
    },
    update(dt) {
      if (!sim) return;
      if (!paused && !sim.done) sim.advance(dt * RACE.watchTimeScale * speed);
      keepT += dt;
      if (keepT > 3 && !sim.done) {
        keepT = 0;
        team.races.keep(sim);
        bus.emit('race:progress', {});
      }
      if (sim.done && !ended) {
        endT += dt;
        if (endT > 1.2) {
          ended = true;
          onFinished(sim);
        }
      }
    },
    onTap(p) {
      const b = buttons.find((x) => hitRect(p, x.rect));
      if (b) b.onTap();
    },
    render(ctx) {
      if (!sim) return;
      const r = rects();
      if (r.track.w !== trackRect.w || r.track.h !== trackRect.h || r.track.y !== trackRect.y) relayout();
      layer.setPixelScale(renderer.pixelScale);
      // grass behind everything, then the cached circuit
      ctx.fillStyle = sim.geo.def.display?.grass ?? '#6FA85A';
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      layer.render(ctx, trackRect.x, trackRect.y);
      // cars: others first, the player's on top with a team-colour ring
      const alpha = sim.alpha();
      const me = player();
      for (const c of sim.cars) {
        if (c === me) continue;
        const e = sim.byId[c.id];
        const pose = sim.carPose(c, alpha);
        const q = toScreen(view, pose.x, pose.y);
        drawCar(ctx, assets, e.sprite, q.x, q.y, pose.heading, CAR_LEN, { alpha: c.retired ? 0.45 : c.finished ? 0.7 : 1 });
      }
      if (me) {
        const pose = sim.carPose(me, alpha);
        const q = toScreen(view, pose.x, pose.y);
        drawCar(ctx, assets, sim.byId[me.id].sprite, q.x, q.y, pose.heading, CAR_LEN + 6, { ring: sim.byId[me.id].colour });
        ctx.fillStyle = C.chip;
        ctx.beginPath();
        ctx.roundRect(q.x - 44, q.y - 62, 88, 34, 12);
        ctx.fill();
        text(ctx, 'YOU', q.x, q.y - 60, { size: S.small, bold: true, color: C.textOnDark, align: 'center' });
      }
      // start lights
      if (sim.t < RACE.startLights + 1) {
        const lit = Math.min(5, Math.floor((sim.t / RACE.startLights) * 5) + 1);
        const go = sim.t >= RACE.startLights;
        const lw = 5 * 70 + 40;
        const lx = trackRect.x + trackRect.w / 2 - lw / 2;
        const ly = trackRect.y + 16;
        drawPanel(ctx, { x: lx, y: ly, w: lw, h: 100 }, { fill: '#2A241F', stroke: '#000', radius: 20 });
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = go ? '#3BD16F' : i < lit ? '#E8392B' : '#4A423B';
          ctx.beginPath();
          ctx.arc(lx + 55 + i * 70, ly + 50, 26, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // --- top HUD ---
      buttons = [];
      const top = r.top;
      drawPanel(ctx, top, { fill: C.panel, stroke: C.line, radius: THEME.panel.radius });
      const back = { x: top.x + 16, y: top.y + 20, w: 230, h: 110 };
      drawButton(ctx, back, '‹ Garage', { accent: C.progress });
      buttons.push({ id: 'leave', rect: back, onTap: () => onLeave() });
      const lead = sim.order()[0];
      const lapNow = sim.t < RACE.startLights ? 0 : lapOf(lead);
      text(ctx, sim.t < RACE.startLights ? 'Grid' : sim.done ? 'Finished' : `Lap ${lapNow} / ${sim.laps}`, top.x + top.w / 2 + 10, top.y + 26, { size: S.title, bold: true, align: 'center' });
      text(ctx, `${sim.track.name} · ${raceClock(sim.t - RACE.startLights)}`, top.x + top.w / 2 + 10, top.y + 96, { size: S.small, color: C.textMuted, align: 'center' });
      const pos = me ? sim.order().indexOf(me) + 1 : 0;
      const chip = { x: top.x + top.w - 196, y: top.y + 20, w: 180, h: 110 };
      drawPanel(ctx, chip, { fill: C.actionDark, stroke: C.outline, radius: 22 });
      text(ctx, `P${pos}`, chip.x + chip.w / 2, chip.y + 12, { size: S.title, bold: true, color: C.textOnDark, align: 'center' });
      text(ctx, `of ${sim.cars.length}`, chip.x + chip.w / 2, chip.y + 72, { size: S.small, color: C.textOnDark, align: 'center' });

      // --- bottom: running order + speed controls ---
      const bot = r.bottom;
      drawPanel(ctx, bot, { fill: C.sheet, stroke: C.line, radius: THEME.panel.radius });
      const ord = sim.order();
      const colW = (bot.w - 48) / 2;
      const rows = Math.ceil(ord.length / 2);
      ord.forEach((c, i) => {
        const e = sim.byId[c.id];
        const x = bot.x + 16 + Math.floor(i / rows) * (colW + 16);
        const y = bot.y + 16 + (i % rows) * ROW_H;
        if (e.isPlayer) drawPanel(ctx, { x: x - 4, y: y - 2, w: colW + 8, h: ROW_H - 4 }, { fill: C.panelGold, stroke: C.gold, lineWidth: 2, radius: 12 });
        ctx.fillStyle = e.colour;
        ctx.fillRect(x + 4, y + 8, 10, ROW_H - 20);
        text(ctx, `${i + 1}`, x + 24, y + 8, { size: S.small, bold: true });
        text(ctx, surname(e.name), x + 64, y + 8, { size: S.small, bold: e.isPlayer, color: c.retired ? C.textFaint : C.text, maxWidth: colW - 200 });
        text(ctx, gapText(c, ord[0], i), x + colW - 6, y + 8, { size: S.small, color: C.textMuted, align: 'right' });
      });
      const cy = bot.y + bot.h - CTRL_H - 12;
      const ids = ['pause', 's1', 's2', 's4', 'skip'];
      const widths = [170, 130, 130, 130, 0];
      const gap = 14;
      widths[4] = bot.w - 32 - widths.slice(0, 4).reduce((t, w) => t + w + gap, 0);
      let x = bot.x + 16;
      ids.forEach((id, i) => {
        const rr = { x, y: cy, w: widths[i], h: CTRL_H - 8 };
        x += widths[i] + gap;
        if (id === 'pause') {
          drawButton(ctx, rr, paused ? 'Play' : 'Pause', { selected: paused, disabled: sim.done });
          buttons.push({ id, rect: rr, onTap: () => (paused = !paused) });
        } else if (id === 'skip') {
          drawButton(ctx, rr, 'Skip Result', { accent: C.progress, disabled: sim.done });
          buttons.push({ id, rect: rr, onTap: skip });
        } else {
          const v = Number(id.slice(1));
          drawButton(ctx, rr, `${v}×`, { selected: speed === v && !paused, accent: C.action, disabled: sim.done });
          buttons.push({
            id,
            rect: rr,
            onTap: () => {
              speed = v;
              paused = false;
            },
          });
        }
      });
      ctx.font = font(S.small);
    },
  };
}
