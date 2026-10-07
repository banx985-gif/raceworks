// A finished car (Milestone 4): shown when a build finishes, and again from the Car Garage.
//   The car, its QUALITY (0–100, bible §14.10) big, RATING / FAULTS / INNOVATION, the 7 stats (bible §14.4),
//   and a short history: phases (days, budget), faults, breakthroughs, the team and the parts.
// Milestone 5: its Condition (0–100), the monthly upkeep and Repair (Credits per point; races damage cars from M6).
// enter({ number, fresh, from }) — number = the Car Garage record; fresh = it has just been built (a gold sparkle).
import { THEME, textScale } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { CAR_STATS, CAR_STAT_NAMES, PARTS, PHASES, BUDGETS, BUILD_ART } from '../../data/cars.js';
import { ROLES } from '../../data/staff.js';
import { COSTS } from '../../data/economy.js';
import { carArtKey } from '../ui/livery.js';

const C = THEME.color;
const S = THEME.size;
const PHASE_NAME = Object.fromEntries(PHASES.map((p) => [p.id, p.name]));
const STAT_BAR_FULL = 400; // bars fill at this value (a first-season car is ~150–250)

export function createCarResultScreen({ layout, assets, team, topBar, goCarGarage, debugEnabled = false, toast = () => {} }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let number = null;
  let fresh = false;
  let t = 0;
  let hits = [];
  const record = () => team.cars.cars.get(number);

  function layoutPage(ctx, w) {
    hits = [];
    const rec = record();
    if (!rec) return 0;
    const r = rec.result;
    let y = 0;

    // --- the car and its headline numbers ---
    const headH = 520;
    if (ctx) {
      drawPanel(ctx, { x: 0, y, w, h: headH }, { fill: fresh ? C.panelGold : C.panel, stroke: fresh ? C.gold : C.line, lineWidth: fresh ? 5 : 3, radius: THEME.panel.radius });
      text(ctx, rec.name, 32, y + 26, { size: S.title, bold: true, maxWidth: w - 64 });
      text(ctx, `${r.className} · finished on day ${r.finishedDay + 1} · ${rec.days} game days to build`, 32, y + 96, { size: S.small, color: C.textMuted, maxWidth: w - 64 });
      const art = { x: 24, y: y + 140, w: w * 0.55, h: 300 };
      assets.drawContained(ctx, carArtKey(assets, team, rec), art); // Milestone 8: in the team colour (22: resolved family + sponsors)
      if (fresh && t < 2.5) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 2.5);
        const s = 340 + t * 120;
        assets.drawContained(ctx, BUILD_ART.sparkle, { x: art.x + art.w / 2 - s / 2, y: art.y + art.h / 2 - s / 2, w: s, h: s });
        ctx.restore();
      }
      const qx = art.x + art.w + 20;
      text(ctx, 'QUALITY', qx, y + 150, { size: S.body, bold: true, color: C.textMuted });
      text(ctx, String(r.quality), qx, y + 190, { size: 120, bold: true, color: C.text });
      text(ctx, '/ 100', qx + 8, y + Math.max(330, 190 + 120 * textScale() + 6), { size: S.small, color: C.textMuted }); // (Milestone 29: clear of the number at any Text size)
      const small = [
        ['RATING', r.rating],
        ['FAULTS', r.faults],
        ['INNOVATION', r.innovation],
      ];
      if (rec.rp) small.push(['RESEARCH', `+${rec.rp} RP`]); // Milestone 11
      small.forEach(([k, v], i) => {
        const x = 32 + i * ((w - 64) / small.length);
        text(ctx, k, x, y + headH - 76, { size: S.small, bold: true, color: C.textMuted });
        text(ctx, String(v), x, y + headH - 46, { size: S.heading, bold: true, color: k === 'FAULTS' && v ? C.bad : k === 'RESEARCH' ? C.progress : C.text, maxWidth: (w - 64) / small.length - 12 });
      });
    }
    y += headH + 28;

    // --- the seven stats ---
    if (ctx) text(ctx, 'Car stats', 8, y, { size: S.heading, bold: true, color: C.actionDark });
    y += 64;
    for (const k of CAR_STATS) {
      if (ctx) {
        text(ctx, `${CAR_STAT_NAMES[k]} (${k})`, 8, y + 8, { size: S.body, bold: true, maxWidth: 420 });
        bar(ctx, 440, y + 16, w - 440 - 130, 28, r.stats[k] / STAT_BAR_FULL, C.progress);
        text(ctx, String(r.stats[k]), w - 8, y + 4, { size: S.heading, bold: true, align: 'right' });
      }
      y += 84;
    }
    y += 12;

    // --- condition and repair (Milestone 5) ---
    const cond = rec.condition ?? 100;
    const cost = team.money.repairCost(rec);
    if (ctx) {
      text(ctx, 'Condition', 8, y, { size: S.heading, bold: true, color: C.actionDark });
      bar(ctx, 440, y + 16, w - 440 - 130, 28, cond / 100, cond < 50 ? C.bad : C.good);
      text(ctx, String(cond), w - 8, y + 4, { size: S.heading, bold: true, align: 'right' });
    }
    y += 64;
    y += para(ctx, `Upkeep ${COSTS.maintenance.perCarMonthly} Credits a month (paid on day 1). Races wear the car; a repair costs ${COSTS.repair.perPoint} Credits per point.`, 8, y, w - 16, { size: S.small, color: C.textMuted }) + 16;
    const rb = { x: 0, y, w: debugEnabled ? w * 0.62 : w, h: 124 };
    if (ctx) drawButton(ctx, rb, cost ? `Repair · ${cost.toLocaleString('en-US')} Cr` : 'Repair · in full condition', { disabled: !cost || !team.money.affordable(cost), accent: C.progress });
    hits.push({ rect: rb, id: 'repair', onTap: () => cost && toast(team.money.repairCar(rec.number).ok ? 'Car repaired' : 'Not enough Credits') });
    if (debugEnabled) {
      const db = { x: w * 0.62 + 16, y, w: w * 0.38 - 16, h: 124 };
      if (ctx) drawButton(ctx, db, 'Damage −30', { accent: C.purple });
      hits.push({ rect: db, id: 'dbgDamage', onTap: () => (rec.condition = Math.max(0, cond - 30)) });
    }
    y += 124 + 40;

    // --- history ---
    if (ctx) text(ctx, 'History', 8, y, { size: S.heading, bold: true, color: C.actionDark });
    y += 64;
    const lines = [];
    rec.phases.forEach((p, i) => lines.push({ text: `${i + 1}. ${PHASE_NAME[p.phaseId]} — ${p.days} days · ${BUDGETS[r.budgets[i] ?? 'balanced'].name}` }));
    if (!r.faultList.length) lines.push({ text: 'No faults.', color: C.good });
    for (const f of r.faultList) lines.push({ text: `Fault in ${PHASE_NAME[f.phase]} (day ${f.day + 1}, ${f.stat}) — ${f.fixed ? `fixed by ${{ testing: 'testing', emergency: 'an Emergency Fix' }[f.fixed] ?? 'a breakthrough'}` : `left open: ${f.stat} −10, Quality −3`}`, color: f.fixed ? C.textMuted : C.bad });
    if (!r.breakthroughs.length) lines.push({ text: 'No breakthroughs this time (4% chance at 60% of each phase).', color: C.textMuted });
    for (const b of r.breakthroughs) lines.push({ text: `Breakthrough in ${PHASE_NAME[b.phase]} (day ${b.day + 1}): ${b.kind}, +10 Innovation`, color: C.gold });
    lines.push({ text: `Team: ${rec.team.map((m) => `${m.name} (${ROLES[m.role]?.name ?? m.role})`).join(', ')}` });
    lines.push({ text: `Parts: ${r.parts.map((id) => PARTS[id].name).join(', ')} · ${r.partsCost.toLocaleString('en-US')} Credits` });
    // Milestone 11: the RP this car earned for research (older cars have none).
    if (rec.rp) lines.push({ text: `Research: +${rec.rp} RP (${rec.rpLines.map((l) => `${l.reason} +${l.amount}`).join(' · ')})`, color: C.progress });
    for (const l of lines) y += para(ctx, l.text, 8, y, w - 16, { size: S.body, color: l.color ?? C.text }) + 10;
    y += 24;

    const b = { x: 0, y, w, h: 124 };
    if (ctx) drawButton(ctx, b, 'Car Garage', { accent: C.progress });
    hits.push({ rect: b, id: 'carGarage', onTap: goCarGarage });
    return y + 124 + 30;
  }

  function bar(ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = C.track;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * Math.min(1, Math.max(0, frac))), h, h / 2);
    ctx.fill();
  }

  return {
    panel,
    get number() {
      return number;
    },
    enter(params = {}) {
      number = params.number ?? team.cars.cars.latest()?.number ?? null;
      fresh = !!params.fresh;
      t = 0;
      panel.scrollY = 0;
    },
    update(dt) {
      t += dt;
    },
    // Milestone 29: every tap area drawn last frame (the thumb-size check reads them; content units)
    tapTargets: () => hits.map((h) => ({ id: h.id, rect: h.rect })),
    buttonRect(bid) {
      layoutPage(null, panel.getRect().w);
      const h = hits.find((x) => x.id === bid);
      if (!h) return null;
      const r = panel.getRect();
      if (h.rect.y < panel.scrollY || h.rect.y + h.rect.h > panel.scrollY + r.h) {
        panel.scrollY = h.rect.y - 40;
        panel.clamp();
      }
      return { x: r.x + h.rect.x, y: r.y + h.rect.y - panel.scrollY, w: h.rect.w, h: h.rect.h };
    },
    onDragStart: (p) => panel.beginDrag(p),
    onDrag: (p) => panel.drag(p),
    onDragEnd: (p) => panel.endDrag(p),
    onWheel(p) {
      panel.scrollY += p.deltaY;
      panel.clamp();
    },
    onTap(p) {
      if (topBar.handleTap(p) || !panel.contains(p)) return;
      layoutPage(null, panel.getRect().w);
      hits.find((x) => hitRect(panel.toContent(p), x.rect))?.onTap();
    },
    render(ctx) {
      const w = panel.getRect().w;
      panel.contentHeight = layoutPage(null, w);
      panel.begin(ctx);
      layoutPage(ctx, w);
      panel.end(ctx);
      topBar.render(ctx);
    },
  };
}
