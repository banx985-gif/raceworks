// The race (Milestones 6–7): watch — or manage — the field round the code-drawn circuit (bible §22.4, §23, §24).
//   Cameras (§24.4): Overview frames the whole circuit (cached — it never changes); Follow follows your car at a
//     readable zoom with a code-drawn minimap. The last choice is remembered on this device (settings.raceCamera).
//   Top: ‹ Garage (leave; the race waits, saved, exactly where it was), lap, your tyre and wear, gaps, position.
//   Bottom: the running order; Manage (§24.2): AUTO, Pace Conserve / Normal / Push, Order Defend / Neutral / Attack,
//     next tyre + Pit Now; Pause / 1× / 2× / 4× / Skip Result (§24.5).
//   Auto Strategy is ON by default: a hands-off player finishes normally. Tapping any manage control takes over
//     (Auto goes off); AUTO hands back to the crew, who carry on from the current state (§24.3). Not mid-pit.
//   Key Moments (§24.5): fast-forward (2× / 4×) stops for your pit window and a podium battle in the last laps.
// The screen only READS the race model (src/race/raceSim.js) and sends commands; watching at any speed or skipping
// gives the same result for the same commands.
// Milestone 8: your car is Aaron's race sprite in the team colour (src/ui/livery.js); spray, braking sparks, breakdown
// smoke and the pit burst come from src/race/raceFx.js (looks only, capped).
// Milestone 16 (bible §24.2–24.3): the plan line ("Plan: pit window laps 5–7 · next tyre Medium" on Auto, the crew's
//   suggestion in Manual), Fuel / Energy target and Repair priority (None / Critical / Full at the next stop) buttons, the
//   next tyre kept in the race (saved), and the weather tyre-call prompt (Accept / Ignore) in the plan line — it only fires
//   from the ?debug=1 "Test call" button until Milestone 17 brings weather. All inside the bottom panel: nothing covers the
//   track.
// Milestone 17 (bible §21, §23.5–23.7): a third top row — the weather now and the crew's forecast (race_ui_08; it sharpens as
//   the race goes on) and your car's condition (race_ui_20: damage, a running fault, the build's faults left). The tyre call
//   fires for real when the weather changes. A caution shows in the title and as a chip on the track (race_ui_21). Rain,
//   spray, spin smoke, sparks and failure smoke come from raceFx (Reduced motion tones them down). Key Moments add a weather
//   change, a caution starting / ending and a big incident to your car.
//   enter() takes the team's current race; onFinished(sim) when it ends; onLeave() for ‹ Garage.
import { THEME, font } from '../../../../core/Theme.js';
import { CachedLayer } from '../../../../core/CachedLayer.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { fitView, drawCircuit, drawCar, drawMinimap, toScreen } from '../race/trackDraw.js';
import { RACE, TYRES, TYRE_ORDER, PACE_MODES, ORDERS, KEY_MOMENTS, RACE_ICONS, FUEL, FUEL_ORDER, PIT_REPAIR, PIT_REPAIR_ORDER, WEATHER_NAMES } from '../../data/race.js';
import { createRaceFx } from '../race/raceFx.js';
import { liveryKey, teamColourId } from '../ui/livery.js';

const C = THEME.color;
const S = THEME.size;
const TOP_H = 206; // Milestone 17: + the weather / condition row
const ROW_H = 50;
const HUD = S.body; // Milestone 8: the race numbers (order, gaps, wear) at body size so they read on a 360-wide phone
const CTRL_H = 104;
const PLAN_H = 110; // Milestone 16: the plan line / tyre-call prompt (its buttons PLAN_H − 12 = 98, thumb-sized like M8)
const GAP = 12;
const CAR_LEN = 46; // logical px a car is drawn in the Overview (the road is drawn wider to match)
const FOLLOW = { sc: 3.2, carLen: 74 }; // Follow camera: pixels per metre, car length
const PLAYER = 'PLAYER';

export const raceClock = (secs) => {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
const surname = (name) => name.split(' ').slice(-1)[0];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function createRaceScreen({ renderer, layout, assets, team, bus, settings = null, onFinished, onLeave, toast = () => {}, debug = false }) {
  let sim = null;
  let race = null;
  let speed = 1;
  let paused = false;
  let keepT = 0;
  let endT = 0;
  let ended = false;
  let view = null;
  let trackRect = null;
  let buttons = [];
  let banner = null; // { title, body, kind: 'moment' | 'hint' }
  // The Pit Now tyre button steps through the compounds this team has (Soft, Medium, and whatever research opened).
  // Milestone 16: the choice lives in the race (your car's nextTyre, else the crew's plan), so it saves and survives Auto.
  const nextOpenTyre = (id) => {
    const open = TYRE_ORDER.filter((t) => (sim?.byId[PLAYER]?.openTyres ?? TYRE_ORDER.filter((x) => team.research.tyreOpen(x))).includes(t));
    return open[(open.indexOf(id) + 1) % open.length];
  };
  const nextTyreNow = () => {
    const c = me();
    return c?.nextTyre ?? c?.plan?.nextTyre ?? (c?.tyre === 'soft' ? 'medium' : 'soft');
  };
  const cycle = (list, id) => list[(list.indexOf(id) + 1) % list.length];
  // The plan line (bible §24.1–24.2): what the crew plans (Auto) or suggests (Manual).
  function planText(c) {
    if (!c) return '';
    if (c.finished || c.retired) return c.finished ? 'Finished' : 'Retired';
    if (c.pit) return `In the pits: ${TYRES[c.pit.next].name} tyres${c.pit.repair && c.pit.repair !== 'none' ? ` · ${PIT_REPAIR[c.pit.repair].name.toLowerCase()} repair` : ''}`;
    // Milestone 17: the crew's weather / caution stops
    if (c.pitReq?.by === 'caution') return `${c.auto ? 'Plan' : 'Crew suggests'}: a cheap stop under caution · ${TYRES[c.pitReq.tyre].name} tyres`;
    if (c.pitReq?.by === 'call') return `${c.auto ? 'Plan' : 'Your call'}: pitting for ${TYRES[c.pitReq.tyre].name} tyres (${WEATHER_NAMES[sim.weather].toLowerCase()})`;
    const p = c.plan;
    if (!p) return c.auto ? 'Plan: the crew is working it out' : 'Crew suggestion: coming';
    const head = c.auto ? 'Plan' : 'Crew suggests';
    const bits = [];
    if (p.stops && c.win) {
      const missed = c.win.to < sim.nextStopLap(c);
      bits.push(missed ? `pit window laps ${c.win.from}–${c.win.to} missed` : `pit window laps ${c.win.from}–${c.win.to}`);
      bits.push(`next tyre ${TYRES[p.nextTyre].name}`);
      if (p.reason === 'undercut') bits.push('undercut');
    } else bits.push(`no stop: ${TYRES[c.tyre].name} to the flag`);
    if (p.fuel !== c.fuel || !c.auto) bits.push(`${energyWord()} ${FUEL[p.fuel].name}`);
    if (p.repair !== 'none') bits.push(`repair ${PIT_REPAIR[p.repair].name}`);
    if (sim.caution) bits.push('caution: pit lane open');
    return `${head}: ${bits.join(' · ')}`;
  }
  // Milestone 17: the car's condition readout (damage, a running fault, the build's faults still unfixed)
  function conditionText(c) {
    if (!c) return '';
    if (c.retired) return 'Out of the race';
    const bits = [];
    if (c.damagePct > 0) bits.push(`Damage ${Math.round(c.damagePct * 10) / 10}%`);
    if (c.failLapsLeft > 0) bits.push('Fault');
    if (c.faults > 0) bits.push(`${c.faults} build fault${c.faults === 1 ? '' : 's'}`);
    return bits.length ? bits.join(' · ') : 'Car OK';
  }
  const forecastLine = () => (race ? team.races.forecastLine(race, sim.leaderX()) : '');
  const energyWord = () => (team.races?.current ? team.races.energyWord : 'Fuel');
  let camera = settings?.get('raceCamera') ?? 'overview';
  const layer = new CachedLayer({ width: 1, height: 1, draw: (g) => drawTrackLayer(g) });
  const ws = () => sim.geo.def.display?.widthScale ?? 1;
  const fx = createRaceFx({ assets, reduced: () => !!settings?.get('reducedMotion') }); // Milestone 17: Reduced motion (Milestone 14 setting)

  function rects() {
    const sr = layout.safeRect;
    const top = { x: sr.x + 16, y: sr.y + 12, w: sr.w - 32, h: TOP_H };
    const rows = Math.ceil((sim?.cars.length ?? 8) / 2);
    const bh = 16 + rows * ROW_H + 12 + PLAN_H + GAP + 4 * CTRL_H + 3 * GAP + 16;
    const bottom = { x: sr.x + 16, y: sr.y + sr.h - bh - 12, w: sr.w - 32, h: bh };
    const track = { x: sr.x, y: top.y + top.h + 8, w: sr.w, h: bottom.y - (top.y + top.h) - 16 };
    return { top, bottom, track };
  }

  function drawTrackLayer(g) {
    if (!sim || !view) return;
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

  const me = () => sim?.car(PLAYER) ?? null;
  const lapsLeft = (c) => sim.laps - Math.max(0, c.s) / sim.geo.length;

  // Gap to the leader in seconds (from distance and the leader's speed) — only for the running order display.
  function gapText(c, leader, i) {
    if (c.retired) return 'DNF';
    if (c.pit) return 'PIT';
    if (c.finished) return i === 0 ? 'Finished' : c.lapsDone < leader.lapsDone ? `+${leader.lapsDone - c.lapsDone} lap` : `+${(c.finishT - leader.finishT).toFixed(1)}`;
    if (i === 0) return `Lap ${sim.lapOf(c)}`;
    const d = leader.s - c.s;
    if (d > sim.geo.length) return `+${Math.floor(d / sim.geo.length)} lap`;
    return `+${(d / Math.max(20, leader.v || 40)).toFixed(1)}`;
  }

  // --- the player's commands (Auto goes off when they take over) -----------------------------------------------
  function takeOver() {
    const c = me();
    if (!c || !c.auto) return true;
    if (!sim.command(PLAYER, 'auto', false)) return false;
    toast('Auto Strategy off', 'You are in charge: pace, order, fuel, tyres, repairs and pit stops. AUTO hands back to the crew.');
    return true;
  }
  function cmd(type, value) {
    if (!sim || sim.done) return false;
    if (type !== 'auto' && type !== 'tyreCall' && !takeOver()) {
      toast('Not during a pit stop');
      return false;
    }
    const ok = sim.command(PLAYER, type, value);
    if (!ok && type === 'auto') toast('Not during a pit stop');
    if (ok) team.races.keep(sim);
    return ok;
  }

  // --- Key Moments (§24.5): only while fast-forwarding ------------------------------------------------------------
  // Milestone 17: the race's new events that are Key Moments (each time they happen): a weather change, a caution starting /
  // ending, a big incident to your car. race.momentEv = how many events have been looked at (at 1× they just go by).
  function eventMoment() {
    const evs = sim.events;
    race.momentEv ??= evs.length;
    while (race.momentEv < evs.length) {
      const ev = evs[race.momentEv++];
      const mine = ev.ids?.includes(PLAYER);
      if (ev.kind === 'weather') {
        const call = me()?.tyreCall?.status === 'open' ? me().tyreCall : null;
        return { id: `ev${race.momentEv}`, title: `Key moment: ${WEATHER_NAMES[ev.to].toLowerCase()} now`, body: `${ev.text}. ${call ? `The crew calls ${TYRES[call.tyre].name} tyres — Accept or Ignore on the plan line.` : 'Your tyres suit it: no call.'}` };
      }
      if (ev.kind === 'caution') return { id: `ev${race.momentEv}`, title: 'Key moment: caution', body: `${cap(ev.text.replace(/^Caution: /, ''))}. The field slows and bunches up — a stop now is cheap.` };
      if (ev.kind === 'cautionEnd') return { id: `ev${race.momentEv}`, title: 'Key moment: green flag', body: 'The caution is over: racing again.' };
      const big = (ev.kind === 'spin' && ev.damage) || (ev.kind === 'contact' && ev.hit === PLAYER) || ev.kind === 'retire' || (ev.kind === 'failure' && ev.outcome !== 'paceLoss');
      if (mine && big) return { id: `ev${race.momentEv}`, title: 'Key moment: trouble', body: `${ev.text}. ${ev.kind === 'retire' ? 'Your race is over.' : 'Repair priority decides what the next stop fixes.'}` };
    }
    return null;
  }
  function momentNow() {
    const c = me();
    if (!c || !race) return null;
    const em = eventMoment();
    if (em) return em;
    if (c.finished || c.retired) return null;
    const m = (race.moments ??= {});
    if (!m.pit && !c.pit && c.wear >= KEY_MOMENTS.pitWindowWear && lapsLeft(c) >= 2) return { id: 'pit', title: 'Key moment: pit window', body: `Your ${TYRES[c.tyre].name} tyres are ${Math.round(c.wear * 100)}% worn. ${c.auto ? 'The crew will call the stop — or take over and choose.' : 'Pit Now, or push on?'}` };
    if (!m.podium && lapsLeft(c) <= KEY_MOMENTS.podiumLastLaps) {
      const pos = sim.order().indexOf(c) + 1;
      const ahead = sim.gapAhead(c);
      const behind = sim.gapBehind(c);
      if ((pos <= 4 && pos > 1 && ahead !== null && ahead < KEY_MOMENTS.podiumGap) || (pos <= 3 && behind !== null && behind < KEY_MOMENTS.podiumGap)) {
        const n = Math.ceil(lapsLeft(c));
        return { id: 'podium', title: 'Key moment: podium battle', body: `P${pos} with ${n} lap${n === 1 ? '' : 's'} to go. Attack, Defend — or let the crew decide.` };
      }
    }
    return null;
  }
  function fireMoment(mo) {
    (race.moments ??= {})[mo.id] = true;
    paused = true;
    banner = { kind: 'moment', title: mo.title, body: mo.body, id: mo.id };
    team.races.keep(sim);
  }

  // ?debug=1 (until Milestone 17's weather): the forecast says rain — the crew makes its tyre call
  function testCall() {
    if (!sim || sim.done) return;
    const ok = sim.command(PLAYER, 'weather', me()?.tyre === 'inter' ? 'wet' : 'damp') || sim.command(PLAYER, 'weather', 'wet');
    if (ok) team.races.keep(sim);
    else toast('No tyre call', 'The crew has no other tyre for that weather.');
  }

  function skip() {
    if (!sim) return;
    banner = null;
    sim.run();
  }

  function setCamera(c) {
    camera = c;
    settings?.set('raceCamera', c);
  }

  // --- drawing ------------------------------------------------------------------------------------------------------
  function followView() {
    const pose = sim.carPose(me(), sim.alpha(), ws());
    return { sc: FOLLOW.sc, ox: trackRect.x + trackRect.w / 2 - pose.x * FOLLOW.sc, oy: trackRect.y + trackRect.h / 2 - pose.y * FOLLOW.sc };
  }

  function drawCars(ctx, v, len) {
    const alpha = sim.alpha();
    const c0 = me();
    fx.draw(ctx, sim, v, len, ws());
    for (const c of sim.cars) {
      if (c === c0) continue;
      const e = sim.byId[c.id];
      const pose = sim.carPose(c, alpha, ws());
      const q = toScreen(v, pose.x, pose.y);
      drawCar(ctx, assets, e.sprite, q.x, q.y, pose.heading, len, { alpha: c.retired ? 0.45 : c.finished ? 0.7 : 1 });
    }
    if (c0) {
      const pose = sim.carPose(c0, alpha, ws());
      const q = toScreen(v, pose.x, pose.y);
      drawCar(ctx, assets, liveryKey(assets, sim.byId[PLAYER].sprite, teamColourId(team)), q.x, q.y, pose.heading, len + 6, { ring: sim.byId[PLAYER].colour });
      ctx.fillStyle = C.chip;
      ctx.beginPath();
      ctx.roundRect(q.x - 44, q.y - len - 16, 88, 34, 12);
      ctx.fill();
      text(ctx, 'YOU', q.x, q.y - len - 14, { size: S.small, bold: true, color: C.textOnDark, align: 'center' });
    }
    fx.drawOver(ctx, sim, v, len, ws());
  }

  function drawLights(ctx) {
    if (sim.t >= RACE.startLights + 1) return;
    const lit = Math.min(5, Math.floor((sim.t / RACE.startLights) * 5) + 1);
    const go = sim.t >= RACE.startLights;
    const lw = 5 * 70 + 40;
    const lx = trackRect.x + trackRect.w / 2 - lw / 2;
    const ly = trackRect.y + 124;
    drawPanel(ctx, { x: lx, y: ly, w: lw, h: 100 }, { fill: '#2A241F', stroke: '#000', radius: 20 });
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = go ? '#3BD16F' : i < lit ? '#E8392B' : '#4A423B';
      ctx.beginPath();
      ctx.arc(lx + 55 + i * 70, ly + 50, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBanner(ctx) {
    if (!banner) return;
    const w = trackRect.w - 60;
    const x = trackRect.x + 30;
    const bodyH = para(null, banner.body, 0, 0, w - 60, { size: S.small });
    const h = 104 + bodyH + (banner.kind === 'moment' ? 124 : 24);
    const y = trackRect.y + trackRect.h - h - 20;
    drawPanel(ctx, { x, y, w, h }, { fill: banner.kind === 'moment' ? C.panelGold : C.panelInfo, stroke: banner.kind === 'moment' ? C.gold : C.progress, lineWidth: 4, radius: 22 });
    text(ctx, banner.title, x + 30, y + 22, { size: S.body, bold: true, maxWidth: w - 140 });
    para(ctx, banner.body, x + 30, y + 92, w - 60, { size: S.small, color: C.text }); // starts below the ✕
    const close = { x: x + w - 96, y: y + 12, w: 80, h: 70 };
    drawButton(ctx, close, '✕', { accent: C.outline, font: font(S.body, true) });
    buttons.push({ id: 'bannerClose', rect: close, onTap: () => (banner = null) });
    if (banner.kind === 'moment') {
      const r = { x: x + 30, y: y + h - 116, w: w - 60, h: 100 };
      drawButton(ctx, r, 'Carry on', { accent: C.progress, font: font(S.body, true) });
      buttons.push({
        id: 'momentGo',
        rect: r,
        onTap: () => {
          banner = null;
          paused = false;
        },
      });
    }
  }

  function drawTop(ctx, top) {
    drawPanel(ctx, top, { fill: C.panel, stroke: C.line, radius: THEME.panel.radius });
    const back = { x: top.x + 16, y: top.y + 20, w: 210, h: 110 };
    drawButton(ctx, back, '‹ Garage', { accent: C.progress });
    buttons.push({ id: 'leave', rect: back, onTap: () => onLeave() });
    const c = me();
    const lead = sim.order()[0];
    const cx = top.x + top.w / 2 + 2;
    text(ctx, sim.t < RACE.startLights ? 'Grid' : sim.done ? 'Finished' : `${sim.caution ? 'CAUTION · ' : ''}Lap ${sim.lapOf(lead)} / ${sim.laps}`, cx, top.y + 16, { size: S.title, bold: true, align: 'center', color: sim.caution ? C.warn : C.text, maxWidth: top.w - 420 });
    // Milestone 17: the weather and the crew's forecast (left), your car's condition (right)
    {
      const ry = top.y + 146;
      const half = top.w / 2;
      assets.drawContained(ctx, RACE_ICONS.weather, { x: top.x + 16, y: ry - 4, w: 46, h: 46 });
      text(ctx, forecastLine(), top.x + 70, ry, { size: S.small, bold: sim.weather !== 'dry', color: sim.weather === 'dry' ? C.textMuted : C.progress, maxWidth: half + 60 });
      const c = me();
      const cond = conditionText(c);
      const ok = cond === 'Car OK';
      ctx.font = font(S.small, !ok);
      const cw = Math.min(half - 150, ctx.measureText(cond).width);
      assets.drawContained(ctx, RACE_ICONS.damage, { x: top.x + top.w - 16 - cw - 54, y: ry - 4, w: 46, h: 46 });
      text(ctx, cond, top.x + top.w - 16, ry, { size: S.small, bold: !ok, color: ok ? C.textMuted : C.bad, align: 'right', maxWidth: half - 150 });
    }
    if (c) {
      const ahead = sim.gapAhead(c);
      const behind = sim.gapBehind(c);
      const line = `${Math.round(c.wear * 100)}% worn${ahead !== null ? ` · ▲ ${ahead.toFixed(1)}s` : ''}${behind !== null ? ` · ▼ ${behind.toFixed(1)}s` : ''}${c.pit ? ' · IN THE PITS' : c.pitReq ? ' · pitting' : ''}`;
      ctx.font = font(HUD);
      const tw = Math.min(top.w - 480, ctx.measureText(line).width);
      const ix = cx - (tw + 50) / 2;
      assets.drawContained(ctx, TYRES[c.tyre].icon, { x: ix, y: top.y + 84, w: 42, h: 42 });
      text(ctx, line, ix + 50, top.y + 86, { size: HUD, color: c.wear > 0.62 ? C.bad : C.textMuted, maxWidth: top.w - 480 });
    }
    const pos = c ? sim.order().indexOf(c) + 1 : 0;
    const chip = { x: top.x + top.w - 176, y: top.y + 20, w: 160, h: 110 };
    drawPanel(ctx, chip, { fill: C.actionDark, stroke: C.outline, radius: 22 });
    text(ctx, `P${pos}`, chip.x + chip.w / 2, chip.y + 12, { size: S.title, bold: true, color: C.textOnDark, align: 'center' });
    text(ctx, `of ${sim.cars.length}`, chip.x + chip.w / 2, chip.y + 72, { size: S.small, color: C.textOnDark, align: 'center' });
  }

  function drawBottom(ctx, bot) {
    drawPanel(ctx, bot, { fill: C.sheet, stroke: C.line, radius: THEME.panel.radius });
    const ord = sim.order();
    const colW = (bot.w - 48) / 2;
    const rows = Math.ceil(ord.length / 2);
    ord.forEach((c, i) => {
      const e = sim.byId[c.id];
      const x = bot.x + 16 + Math.floor(i / rows) * (colW + 16);
      const y = bot.y + 14 + (i % rows) * ROW_H;
      if (e.isPlayer) drawPanel(ctx, { x: x - 4, y: y - 2, w: colW + 8, h: ROW_H - 2 }, { fill: C.panelGold, stroke: C.gold, lineWidth: 2, radius: 12 });
      ctx.fillStyle = e.colour;
      ctx.fillRect(x + 4, y + 6, 10, ROW_H - 14);
      text(ctx, `${i + 1}`, x + 24, y + 4, { size: HUD, bold: true });
      text(ctx, surname(e.name), x + 66, y + 4, { size: HUD, bold: e.isPlayer, color: c.retired ? C.textFaint : C.text, maxWidth: colW - 240 });
      text(ctx, TYRES[c.tyre].name[0], x + colW - 158, y + 4, { size: HUD, bold: true, color: c.tyre === 'soft' ? C.bad : C.warn });
      text(ctx, gapText(c, ord[0], i), x + colW - 6, y + 4, { size: HUD, color: C.text, align: 'right' });
    });
    const c = me();
    const done = sim.done || !c || c.finished || c.retired;
    const f = font(S.small, true);
    const row = (y, items) => {
      const total = bot.w - 32 - GAP * (items.length - 1);
      const fixed = items.reduce((t, it) => t + (it.w ?? 0), 0);
      const flex = items.filter((it) => !it.w).length;
      let x = bot.x + 16;
      for (const it of items) {
        const w = it.w ?? (total - fixed) / flex;
        const r = { x, y, w, h: CTRL_H };
        x += w + GAP;
        if (it.icon) {
          drawButton(ctx, r, '', { selected: it.selected, disabled: it.disabled, accent: it.accent });
          assets.drawContained(ctx, it.icon, { x: r.x + 10, y: r.y + 14, w: 64, h: 64 });
          text(ctx, it.label, r.x + 84 + (r.w - 94) / 2, r.y + r.h / 2 - 24, { size: HUD, bold: true, color: it.disabled ? C.textFaint : it.selected ? C.textOnDark : C.textOnAction, align: 'center', maxWidth: r.w - 94 });
        } else drawButton(ctx, r, it.label, { selected: it.selected, disabled: it.disabled, accent: it.accent, font: f });
        buttons.push({ id: it.id, rect: r, onTap: it.disabled ? () => {} : it.onTap });
      }
    };
    let y = bot.y + 14 + rows * ROW_H + 12;
    const auto = !!c?.auto;
    // Milestone 16: the plan line, or the weather tyre call (Accept / Ignore); ?debug=1 adds a Test call button
    const strip = { x: bot.x + 16, y, w: bot.w - 32, h: PLAN_H };
    const call = c?.tyreCall?.status === 'open' && !done ? c.tyreCall : null;
    drawPanel(ctx, strip, { fill: call ? C.panelGold : C.panelInfo, stroke: call ? C.gold : C.line, lineWidth: 2, radius: 16 });
    if (call) {
      const bw = 170;
      text(ctx, `Tyre call (${call.weather}): fit ${TYRES[call.tyre].name}?`, strip.x + 16, strip.y + 30, { size: S.small, bold: true, maxWidth: strip.w - 2 * bw - 48 });
      const acc = { x: strip.x + strip.w - 2 * bw - 16, y: strip.y + 6, w: bw, h: PLAN_H - 12 };
      const ign = { x: strip.x + strip.w - bw - 8, y: strip.y + 6, w: bw, h: PLAN_H - 12 };
      drawButton(ctx, acc, 'Accept', { accent: C.good, font: f });
      drawButton(ctx, ign, 'Ignore', { accent: C.outline, font: f });
      buttons.push({ id: 'callAccept', rect: acc, onTap: () => cmd('tyreCall', 'accept') });
      buttons.push({ id: 'callIgnore', rect: ign, onTap: () => cmd('tyreCall', 'ignore') });
    } else {
      const tw = debug && !done ? strip.w - 232 : strip.w - 32;
      assets.drawContained(ctx, RACE_ICONS.pit, { x: strip.x + 12, y: strip.y + 23, w: 64, h: 64 });
      text(ctx, planText(c), strip.x + 88, strip.y + 30, { size: S.small, bold: true, color: C.text, maxWidth: tw - 72 });
      if (debug && !done) {
        const tb = { x: strip.x + strip.w - 206, y: strip.y + 6, w: 196, h: PLAN_H - 12 };
        drawButton(ctx, tb, 'Test call', { accent: C.outline, font: f });
        buttons.push({ id: 'testCall', rect: tb, onTap: () => testCall() });
      }
    }
    y += PLAN_H + GAP;
    row(y, [
      { id: 'auto', label: auto ? 'AUTO on' : 'AUTO off', icon: RACE_ICONS.auto, w: 250, selected: auto, disabled: done || !!c?.pit, accent: C.good, onTap: () => cmd('auto', !auto) },
      ...Object.entries(PACE_MODES).map(([id, m]) => ({ id: `pace_${id}`, label: m.name, selected: c?.pace === id, disabled: done, accent: auto ? C.textFaint : C.action, onTap: () => cmd('pace', id) })),
    ]);
    y += CTRL_H + GAP;
    const pitLabel = c?.pit ? 'In pits' : c?.pitReq ? `Pit ${TYRES[c.pitReq.tyre].name[0]} ✓` : 'Pit Now';
    const nextTyre = nextTyreNow();
    const fuel = c?.fuel ?? 'normal';
    const repair = c?.repairReq ?? c?.plan?.repair ?? 'none';
    row(y, [
      ...Object.entries(ORDERS).map(([id, m]) => ({ id: `order_${id}`, label: m.name, selected: c?.order === id, disabled: done, accent: auto ? C.textFaint : C.action, onTap: () => cmd('order', id) })),
      { id: 'fuel', label: `${energyWord()} ${FUEL[fuel].name}`, w: 250, disabled: done, accent: auto ? C.textFaint : C.action, onTap: () => cmd('fuel', cycle(FUEL_ORDER, fuel)) }, // Milestone 16
    ]);
    y += CTRL_H + GAP;
    row(y, [
      { id: 'nextTyre', label: TYRES[nextTyre].name, icon: TYRES[nextTyre].icon, w: 250, disabled: done || !!c?.pit, accent: C.progress, onTap: () => cmd('tyre', nextOpenTyre(nextTyre)) }, // Milestone 11: every compound research has opened
      { id: 'repair', label: `Repair ${PIT_REPAIR[repair].name}`, disabled: done, accent: auto ? C.textFaint : C.action, onTap: () => cmd('repair', cycle(PIT_REPAIR_ORDER, repair)) }, // Milestone 16
      { id: 'pit', label: pitLabel, icon: RACE_ICONS.pit, w: 250, disabled: done || !!c?.pit, selected: !!c?.pitReq, accent: C.bad, onTap: () => (c?.pitReq?.by === 'player' && !c.auto ? cmd('pitCancel') : cmd('pit', nextTyre)) }, // your own call cancels; the crew's becomes yours
    ]);
    y += CTRL_H + GAP;
    row(y, [
      { id: 'pause', label: paused ? 'Play' : 'Pause', w: 170, selected: paused, disabled: sim.done, onTap: () => (paused = !paused) },
      ...[1, 2, 4].map((v) => ({
        id: `s${v}`,
        label: `${v}×`,
        w: 120,
        selected: speed === v && !paused,
        disabled: sim.done,
        onTap: () => {
          speed = v;
          paused = false;
          if (banner?.kind === 'moment') banner = null;
        },
      })),
      { id: 'skip', label: 'Skip Result', disabled: sim.done, accent: C.progress, onTap: skip },
    ]);
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
    get camera() {
      return camera;
    },
    get banner() {
      return banner;
    },
    get nextTyre() {
      return nextTyreNow();
    },
    hudTextSize: HUD, // (tests)
    get planLine() {
      return planText(me()); // (tests)
    },
    get forecastLine() {
      return sim ? forecastLine() : ''; // Milestone 17 (tests)
    },
    get conditionLine() {
      return conditionText(me()); // Milestone 17 (tests)
    },
    layoutRects: () => rects(), // (tests)
    fx, // (tests)
    buttonRect(id) {
      return buttons.find((b) => b.id === id)?.rect ?? null;
    },
    enter() {
      race = team.races.current;
      sim = team.races.sim();
      if (!sim) return onLeave();
      speed = 1;
      paused = false;
      keepT = 0;
      endT = 0;
      ended = false;
      banner = null;
      fx.reset();
      camera = settings?.get('raceCamera') ?? camera;
      // the first weekend race: the crew runs it (bible §33 "First race weekend")
      if (!team.races.history.some((h) => h.kind === 'weekend') && !race.hinted && race.kind === 'weekend') {
        race.hinted = true;
        banner = { kind: 'hint', title: 'Auto Strategy is on', body: 'Your crew handles pace, overtakes and pit stops — no input needed. Watch, speed up, or try a Pace command to take over.' };
      }
      relayout();
    },
    exit() {
      if (sim && team.races.current) team.races.keep(sim);
    },
    resize() {
      if (sim) relayout();
    },
    // Tests: send a command as if a manage button was tapped.
    command: (type, value) => cmd(type, value),
    update(dt) {
      if (!sim) return;
      const running = !paused && !sim.done;
      if (running) {
        let fired = null;
        sim.advance(dt * RACE.watchTimeScale * speed, speed > 1 ? { stopAt: () => (fired = momentNow()) !== null } : undefined);
        if (fired) fireMoment(fired);
        else if (speed === 1 && race) race.momentEv = sim.events.length; // Milestone 17: at 1× you see it happen
      }
      fx.step(sim, running ? dt * RACE.watchTimeScale * speed : 0, dt);
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
      const b = [...buttons].reverse().find((x) => hitRect(p, x.rect));
      if (b) b.onTap();
    },
    render(ctx) {
      if (!sim) return;
      const r = rects();
      if (r.track.w !== trackRect.w || r.track.h !== trackRect.h || r.track.y !== trackRect.y) relayout();
      layer.setPixelScale(renderer.pixelScale);
      buttons = [];
      ctx.fillStyle = sim.geo.def.display?.grass ?? '#6FA85A';
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      if (camera === 'follow' && me()) {
        const v = followView();
        ctx.save();
        ctx.beginPath();
        ctx.rect(trackRect.x, trackRect.y, trackRect.w, trackRect.h);
        ctx.clip();
        drawCircuit(ctx, sim.geo, v);
        drawCars(ctx, v, FOLLOW.carLen);
        ctx.restore();
        // the minimap (§24.4): the circuit outline and every car's dot
        const mm = { x: trackRect.x + trackRect.w - 300, y: trackRect.y + 14, w: 280, h: 380 };
        drawPanel(ctx, mm, { fill: 'rgba(255,248,236,0.88)', stroke: C.line, radius: 18 });
        drawMinimap(ctx, sim.geo, mm, sim.cars.filter((c) => !c.retired).map((c) => ({ ...sim.carPose(c, 1, 1), colour: sim.byId[c.id].colour, player: c.id === PLAYER })));
      } else {
        layer.render(ctx, trackRect.x, trackRect.y);
        drawCars(ctx, view, CAR_LEN);
      }
      fx.drawWeather(ctx, trackRect, sim.weather); // Milestone 17: rain over the track
      drawLights(ctx);
      // Milestone 17: the caution chip on the track (below the camera button)
      if (sim.caution && !sim.done) {
        const k = sim.caution;
        const chip = { x: trackRect.x + 20, y: trackRect.y + 124, w: Math.min(trackRect.w - 40, 620), h: 84 };
        drawPanel(ctx, chip, { fill: '#FFD23F', stroke: '#2A241F', lineWidth: 3, radius: 18 });
        assets.drawContained(ctx, RACE_ICONS.caution, { x: chip.x + 10, y: chip.y + 8, w: 68, h: 68 });
        const left = Math.max(0, k.toLap - Math.max(0, ...sim.cars.filter((x) => !x.retired).map((x) => x.lapsDone)));
        text(ctx, `Caution · no overtaking · ${left} lap${left === 1 ? '' : 's'} left`, chip.x + 90, chip.y + 20, { size: S.small, bold: true, color: '#2A241F', maxWidth: chip.w - 110 });
      }
      // camera switch (top-left of the track)
      const cam = { x: trackRect.x + 20, y: trackRect.y + 14, w: 250, h: 96 };
      drawButton(ctx, cam, camera === 'follow' ? 'Overview' : 'Follow', { accent: C.outline, font: font(S.small, true) });
      buttons.push({ id: 'camera', rect: cam, onTap: () => setCamera(camera === 'follow' ? 'overview' : 'follow') });
      drawTop(ctx, r.top);
      drawBottom(ctx, r.bottom);
      drawBanner(ctx);
    },
  };
}
