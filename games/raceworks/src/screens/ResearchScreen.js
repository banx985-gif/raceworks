// The Research tree (Milestone 11, bible §20): opened from the Research sheet (bottom-bar Research, the Strategy Desk
// and the research stations). At the top: RP (the Research Token), the node being researched with its progress, days
// left and Stop, and the two queues (the second locked until a facility or VIP opens it). Then six branch tabs; each
// branch lists its six nodes in order as cards: the part's picture, name, tier and RP cost, its state (Done / Researching
// / Open / Locked with what it needs), a progress bar, and what it opens — part, facility and tyre pictures with their
// names, bonuses and later-milestone flags as lines — and Start (paid in RP) or why not.
// With ?debug=1: +500 RP, finish the node being researched, finish the branch, finish all 36.
import { THEME, lineH } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, drawPadlock, hitRect } from '../../../../core/ui/Button.js';
import { text, para, card, tabRects, drawTabs, wrapLines } from '../../../../core/ui/Kit.js';
import { BRANCHES, RESEARCH, RESEARCH_ICONS } from '../../data/research.js';
import { PARTS } from '../../data/cars.js';
import { FACILITIES } from '../../data/facilities.js';
import { TYRES } from '../../data/race.js';
import { NODE, BRANCH, nodeLabel } from '../systems/research.js';

const C = THEME.color;
const S = THEME.size;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const FAC = Object.fromEntries(FACILITIES.map((f) => [f.id, f]));
const STATE_WORD = { done: 'Done', active: 'Researching', available: 'Open', locked: 'Locked' };
const TILE_W = 190;
const TILE_H = 196;
const TILE_ICON = 104;
const PAD = 24;

// What a node opens, as pictures (parts, facilities, tyres) and lines (bonuses, flags).
function opensOf(research, id) {
  const tiles = [];
  const lines = [];
  for (const a of research.unlocksOf(id)) {
    if (a.type === 'part') tiles.push({ icon: PARTS[a.id].art, name: PARTS[a.id].name, kind: 'Part', note: PARTS[a.id].unlock.rank ? `+ Rank ${PARTS[a.id].unlock.rank}` : '' });
    else if (a.type === 'facility') tiles.push({ icon: FAC[a.id].art, name: FAC[a.id].name, kind: 'Facility' });
    else if (a.type === 'tyre') tiles.push({ icon: TYRES[a.id].icon, name: `${TYRES[a.id].name} tyres`, kind: 'Tyres' });
  }
  for (const x of NODE[id].extra) lines.push({ text: x.text, bonus: x.type === 'bonus' });
  return { tiles, lines };
}

export function createResearchScreen({ layout, assets, team, topBar, toast = () => {}, debugEnabled = false }) {
  const research = team.research;
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let branch = 'PWR';
  let hits = [];
  const tabs = BRANCHES.map((b) => ({ id: b.id, label: b.short }));

  function start(id) {
    const r = research.start(id);
    if (!r.ok) return toast(research.why(id) ?? r.reason);
    toast(`Researching ${NODE[id].name}`, `−${fmt(research.costOf(id))} RP · about ${research.daysLeft()} days`);
  }

  // A progress bar.
  function bar(ctx, r, frac, color = C.progress) {
    if (!ctx) return;
    ctx.fillStyle = C.track;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, Math.max(r.h, r.w * Math.min(1, frac)), r.h, r.h / 2);
      ctx.fill();
    }
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
    ctx.stroke();
  }

  // The header: RP, the node being researched and the two queues. Returns the height used.
  function header(ctx, y, w) {
    const active = research.active;
    const q2 = research.secondQueue;
    const h = active ? 380 : 320;
    const box = { x: 0, y, w, h };
    if (ctx) {
      card(ctx, box, active ? 'info' : 'normal');
      assets.drawContained(ctx, RESEARCH_ICONS.rp, { x: PAD, y: y + PAD, w: 96, h: 96 });
      text(ctx, `${fmt(research.rp)} RP`, PAD + 116, y + PAD, { size: S.title, bold: true });
      text(ctx, `${research.system.doneCount} of 36 done · earn RP from cars, races and contracts`, PAD + 116, y + PAD + 66, { size: S.small, color: C.textMuted, maxWidth: w - PAD * 2 - 116 });
    }
    let yy = y + PAD + 120;
    if (active) {
      const n = NODE[active];
      const days = research.daysLeft();
      if (ctx) {
        text(ctx, `Researching: ${n.name} (${nodeLabel(active)})`, PAD, yy, { size: S.button, bold: true, color: C.actionDark, maxWidth: w - PAD * 2 });
        text(ctx, `${Math.floor(research.fraction(active) * 100)}% · about ${days === Infinity ? '—' : days} day${days === 1 ? '' : 's'} left · ${research.perDay().toFixed(1)} a day`, PAD, yy + 54, { size: S.small, color: C.textMuted, maxWidth: w - PAD * 2 - 260 });
      }
      bar(ctx, { x: PAD, y: yy + 100, w: w - PAD * 2 - 260, h: 30 }, research.fraction(active));
      const stop = { x: w - PAD - 236, y: yy + 16, w: 236, h: 114 };
      if (ctx) drawButton(ctx, stop, 'Stop', { accent: C.progress });
      hits.push({ rect: stop, id: 'stop', onTap: () => research.stop() && toast(`Stopped: ${n.name}`, 'Its progress is kept — start it again for free') });
      yy += 150;
    } else {
      if (ctx) para(ctx, 'Queue 1 is free: pick an Open topic below and tap Start. It runs on the calendar.', PAD, yy, w - PAD * 2, { size: S.body, color: C.actionDark });
      yy += 90;
    }
    // The second queue: shown, locked.
    if (ctx) {
      drawPadlock(ctx, PAD + 16, yy + 30, 34, q2.open ? C.good : C.textFaint);
      text(ctx, q2.open ? 'Second queue: open' : `Second queue: locked · ${q2.why}`, PAD + 52, yy + 12, { size: S.small, bold: true, color: C.textMuted, maxWidth: w - PAD * 2 - 52 });
    }
    return h;
  }

  // One node's card. Returns its height.
  function nodeCard(ctx, y, w, n) {
    const st = research.status(n.id);
    const { tiles, lines } = opensOf(research, n.id);
    const inner = w - PAD * 2;
    const perRow = Math.max(1, Math.floor((inner + 16) / (TILE_W + 16)));
    const tileRows = Math.ceil(tiles.length / perRow);
    const why = st === 'locked' || st === 'available' ? research.why(n.id) : null;
    const prog = research.fraction(n.id);
    const showBar = st === 'active' || (st !== 'done' && prog > 0);
    let h = PAD + 60 + 46; // name, tier line
    if (st === 'locked') h += 46;
    if (showBar) h += 50;
    h += 46 + tileRows * (TILE_H + 12);
    const lineHs = lines.map((l) => wrapLines(`${l.bonus ? '+ ' : '• '}${l.text}`, inner, S.small).length * lineH(S.small, 1.35));
    h += lineHs.reduce((t, x) => t + x, 0) + (lines.length ? 8 : 0);
    const hasButton = st !== 'done';
    if (hasButton) h += 134;
    h += PAD;
    const box = { x: 0, y, w, h };
    if (ctx) {
      card(ctx, box, st === 'done' ? 'good' : st === 'active' ? 'info' : st === 'locked' ? 'locked' : 'normal');
      // tier medallion
      ctx.fillStyle = st === 'done' ? C.good : st === 'active' ? C.progress : st === 'locked' ? C.textFaint : C.action;
      ctx.beginPath();
      ctx.arc(PAD + 34, y + PAD + 34, 34, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(n.tier), PAD + 34, y + PAD + 34, { size: S.button, bold: true, align: 'center', baseline: 'middle', color: C.textOnAction });
      text(ctx, n.name, PAD + 86, y + PAD + 4, { size: S.button, bold: true, color: st === 'locked' ? C.textMuted : C.text, maxWidth: inner - 86 - 220 });
      const right = st === 'done' ? 'Done ✓' : st === 'active' ? `${Math.floor(prog * 100)}%` : `${fmt(research.costOf(n.id))} RP`;
      text(ctx, right, w - PAD, y + PAD + 4, { size: S.button, bold: true, align: 'right', color: st === 'done' ? C.good : st === 'active' ? C.progress : research.paid(n.id) ? C.good : C.actionDark });
    }
    let yy = y + PAD + 60;
    if (ctx) text(ctx, `${BRANCH[n.branch].name} ${n.tier} · ${STATE_WORD[st]}${research.paid(n.id) && st !== 'done' && st !== 'active' ? ' · paid, restarts free' : ''}`, PAD + 86, yy, { size: S.small, color: C.textMuted, maxWidth: inner - 86 });
    yy += 46;
    if (st === 'locked') {
      if (ctx) text(ctx, why, PAD, yy, { size: S.small, bold: true, color: C.bad, maxWidth: inner });
      yy += 46;
    }
    if (showBar) {
      bar(ctx, { x: PAD, y: yy + 4, w: inner, h: 28 }, prog);
      yy += 50;
    }
    if (ctx) text(ctx, 'Opens:', PAD, yy, { size: S.small, bold: true, color: C.textMuted });
    yy += 46;
    tiles.forEach((t, i) => {
      const r = { x: PAD + (i % perRow) * (TILE_W + 16), y: yy + Math.floor(i / perRow) * (TILE_H + 12), w: TILE_W, h: TILE_H };
      if (!ctx) return;
      card(ctx, r, st === 'done' ? 'good' : 'normal', { radius: 18 });
      ctx.save();
      if (st === 'locked') ctx.globalAlpha = 0.55;
      assets.drawContained(ctx, t.icon, { x: r.x + (r.w - TILE_ICON) / 2, y: r.y + 8, w: TILE_ICON, h: TILE_ICON });
      ctx.restore();
      para(ctx, t.name, r.x + 6, r.y + TILE_ICON + 14, r.w - 12, { size: S.small, bold: true, align: 'center', maxLines: 2, lead: 1.15 });
      if (t.note) text(ctx, t.note, r.x + r.w - 8, r.y + 8, { size: S.small, bold: true, align: 'right', color: C.bad });
    });
    yy += tileRows * (TILE_H + 12);
    lines.forEach((l, i) => {
      if (ctx) para(ctx, `${l.bonus ? '+ ' : '• '}${l.text}`, PAD, yy, inner, { size: S.small, bold: l.bonus, color: l.bonus ? C.good : C.textMuted, lead: 1.35 });
      yy += lineHs[i];
    });
    if (lines.length) yy += 8;
    if (hasButton) {
      const b = { x: PAD, y: yy + 10, w: inner, h: 114 };
      if (st === 'active') {
        if (ctx) drawButton(ctx, b, 'Stop (keeps its progress)', { accent: C.progress });
        hits.push({ rect: b, id: `stop_${n.id}`, onTap: () => research.stop() });
      } else {
        const ok = !why;
        const label = ok ? (research.paid(n.id) ? 'Start again (paid)' : `Start · ${fmt(research.costOf(n.id))} RP`) : st === 'locked' ? 'Locked' : why;
        if (ctx) drawButton(ctx, b, label, { disabled: !ok });
        hits.push({ rect: b, id: `start_${n.id}`, onTap: () => (ok ? start(n.id) : toast(why)) });
      }
    }
    return h;
  }

  function layoutPage(ctx, w) {
    hits = [];
    let y = 0;
    if (ctx) text(ctx, 'Research', 8, y, { size: S.title, bold: true });
    y += 84;
    y += header(ctx, y, w) + 24;
    if (debugEnabled) {
      const bw = (w - 3 * 16) / 4;
      const dbg = [
        { id: 'dbgRp', label: '+500 RP', onTap: () => research.addRp(500) },
        { id: 'dbgFinish', label: 'Finish now', onTap: () => research.active && research.complete(research.active) },
        { id: 'dbgBranch', label: 'Branch', onTap: () => research.complete(`${branch}6`) },
        { id: 'dbgAll', label: 'All 36', onTap: () => research.completeAll() },
      ];
      dbg.forEach((d, i) => {
        const r = { x: i * (bw + 16), y, w: bw, h: 110 };
        if (ctx) drawButton(ctx, r, d.label, { accent: C.purple });
        hits.push({ rect: r, id: d.id, onTap: d.onTap });
      });
      y += 130;
    }
    // Branch tabs (a done count badge on each).
    const tr = tabRects({ x: 0, y: y + 12, w: w - 22 }, tabs.length, 110, 10); // room for the last tab's badge
    const withBadges = tabs.map((t) => {
      const done = RESEARCH.filter((n) => n.branch === t.id && research.has(n.id)).length;
      const on = RESEARCH.some((n) => n.branch === t.id && research.status(n.id) === 'active');
      return { ...t, badge: on ? '•' : done ? String(done) : null };
    });
    if (ctx) drawTabs(ctx, tr, withBadges, branch);
    tabs.forEach((t, i) => hits.push({ rect: tr[i], id: `tab_${t.id}`, onTap: () => (branch = t.id) }));
    y += 142;
    if (ctx) {
      assets.drawContained(ctx, BRANCH[branch].icon, { x: 8, y, w: 72, h: 72 });
      text(ctx, BRANCH[branch].name, 96, y + 12, { size: S.heading, bold: true, color: C.actionDark, maxWidth: w - 104 });
    }
    y += 92;
    for (const n of RESEARCH.filter((x) => x.branch === branch)) {
      y += nodeCard(ctx, y, w, n) + 20;
    }
    return y + 40;
  }

  return {
    panel,
    get branch() {
      return branch;
    },
    setBranch(id) {
      if (BRANCH[id]) branch = id;
    },
    // Screen rect of a button by id (after scrolling it into view) — tests.
    // Milestone 29: every tap area drawn last frame (the thumb-size check reads them; content units)
    tapTargets: () => hits.map((h) => ({ id: h.id, rect: h.rect })),
    buttonRect(bid) {
      layoutPage(null, panel.getRect().w);
      const h = hits.find((x) => x.id === bid);
      if (!h) return null;
      const r = panel.getRect();
      panel.contentHeight = layoutPage(null, r.w);
      if (h.rect.y < panel.scrollY || h.rect.y + h.rect.h > panel.scrollY + r.h) {
        panel.scrollY = h.rect.y - 40;
        panel.clamp();
      }
      return { x: r.x + h.rect.x, y: r.y + h.rect.y - panel.scrollY, w: h.rect.w, h: h.rect.h };
    },
    enter(params = {}) {
      const act = research.active;
      branch = params.branch ?? (act ? NODE[act].branch : branch);
      panel.scrollY = 0;
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
      const q = panel.toContent(p);
      hits.find((x) => hitRect(q, x.rect))?.onTap();
    },
    render(ctx) {
      const w = panel.getRect().w;
      panel.contentHeight = layoutPage(null, w);
      panel.clamp();
      panel.begin(ctx);
      layoutPage(ctx, w);
      panel.end(ctx);
      topBar.render(ctx);
    },
  };
}
