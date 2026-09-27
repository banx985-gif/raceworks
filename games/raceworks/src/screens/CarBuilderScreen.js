// New car (Milestone 4): the simple builder the Pit Bay's "New car" opens.
//   Class (Club Hatch only for now) · the six slots with their starter parts · budget focus · the 5-slot team ·
//   the total part cost (paid at Start, Milestone 5) and the daily running cost · Start (greyed with the reason when the
//   team cannot start a car: Emergency Credit, not enough Credits).
// Tap a person in a team slot to take them off; tap someone under "Available" to put them on.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel, tabRects, drawTabs, listRow, listRowHeight } from '../../../../core/ui/Kit.js';
import { pressedLook } from '../ui/pressable.js';
import { liveryKey, teamColourId } from '../ui/livery.js';
import { CLASSES, PARTS, SLOTS, BUDGETS, BUDGET_ORDER, PHASES, PROJECT, CAR_STATS } from '../../data/cars.js';
import { ROLES } from '../../data/staff.js';
import { partsOf, partsCost, tierFor, leadRole } from '../systems/carProject.js';
import { COSTS } from '../../data/economy.js';

const C = THEME.color;
const S = THEME.size;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const modsText = (mods) =>
  Object.entries(mods)
    .map(([k, v]) => `${k} ${v >= 0 ? '+' : '−'}${Math.abs(v)}`)
    .join(' · ');

export function createCarBuilderScreen({ layout, assets, team, topBar, onStart }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let classId = 'clubHatch';
  let budget = 'balanced';
  let teamIds = [];
  let hits = [];

  // Game days this team would take at today's pace (the same formula the project uses).
  function estimateDays() {
    const p = team.cars.projects;
    const tier = tierFor(partsOf(classId));
    const job = { slots: teamIds };
    let days = 0;
    for (const ph of p.phases) {
      let score = 0;
      for (const id of teamIds) score += p.workerScore(job, ph, team.get(id));
      const per = p._progress(score);
      days += per > 0 ? Math.ceil(tier.target / per) : Infinity;
    }
    return days;
  }

  function layoutPage(ctx, w) {
    hits = [];
    const cls = CLASSES[classId];
    const parts = partsOf(classId);
    const tier = tierFor(parts);
    let y = 0;
    const heading = (label) => {
      if (ctx) text(ctx, label, 8, y, { size: S.heading, bold: true, color: C.actionDark });
      y += 62;
    };

    if (ctx) text(ctx, 'New car', 8, y, { size: S.title, bold: true });
    y += 84;

    // --- class ---
    heading('Class');
    const classRow = { art: liveryKey(assets, cls.art, teamColourId(team)), title: cls.name, lines: [{ text: `Weights · ${CAR_STATS.map((k) => `${k} ${cls.weights[k]}`).join(' · ')}`, size: S.small, color: C.textMuted }, { text: 'The only class for now — more arrive with research.', size: S.small, color: C.textMuted }], right: 'Chosen', rightColor: C.good, state: 'selected', artSize: 150 };
    const crh = listRowHeight(w, classRow);
    if (ctx) listRow(ctx, assets, { x: 0, y, w, h: crh }, classRow);
    y += crh + 30;

    // --- parts ---
    heading('Parts (starter set)');
    SLOTS.forEach((sl, i) => {
      const part = PARTS[parts[i]];
      const row = { art: part.art, title: `${sl.name}: ${part.name}`, lines: [{ text: modsText(part.mods), size: S.small, color: C.progress, bold: true }], right: `${fmt(part.cost)} Cr · Cx ${part.cx}`, artSize: 110 };
      const rh = listRowHeight(w, row);
      if (ctx) listRow(ctx, assets, { x: 0, y, w, h: rh }, row);
      y += rh + 12;
    });
    y += 18;

    // --- budget focus ---
    heading('Budget focus');
    const rects = tabRects({ x: 0, y, w, h: 110 }, BUDGET_ORDER.length);
    const tabs = BUDGET_ORDER.map((id) => ({ id, label: BUDGETS[id].name }));
    if (ctx) drawTabs(ctx, rects, tabs, budget, { accent: C.action });
    rects.forEach((r, i) => hits.push({ rect: r, id: `budget_${tabs[i].id}`, onTap: () => (budget = tabs[i].id) }));
    y += 122;
    y += para(ctx, BUDGETS[budget].text + '. Changes only between phases once the car is started.', 8, y, w - 16, { size: S.small, color: C.textMuted }) + 24;

    // --- team ---
    heading(`Team · ${teamIds.length} of ${PROJECT.teamSlots} slots filled`);
    const note = `Any role can fill any slot. The role that leads a phase works ${PROJECT.roleMatchPct}% faster in it: ${PHASES.map((p) => `${p.name} → ${ROLES[leadRole(p)]?.name ?? '—'}`).join(' · ')}.`;
    y += para(ctx, note, 8, y, w - 16, { size: S.small, color: C.textMuted }) + 14; // (ctx null: measures only)
    const slotH = 150;
    for (let i = 0; i < PROJECT.teamSlots; i++) {
      const r = { x: 0, y, w, h: slotH };
      const id = teamIds[i];
      const s = id ? team.get(id) : null;
      if (s) {
        const row = { art: s.art, title: s.name, lines: [{ text: `${ROLES[s.role].name} · Energy ${Math.round(s.energy)} · tap to take off`, size: S.small, color: C.textMuted }], right: `Slot ${i + 1}`, artSize: 110 };
        if (ctx) {
          listRow(ctx, assets, { ...r, h: slotH }, row);
          pressedLook(ctx, r);
        }
        hits.push({ rect: r, id: `slot_${s.id}`, onTap: () => (teamIds = teamIds.filter((x) => x !== s.id)) });
      } else if (ctx) {
        drawPanel(ctx, r, { fill: C.panelDim, stroke: C.line, radius: THEME.panel.radius });
        text(ctx, `Slot ${i + 1} · empty`, 32, y + 40, { size: S.body, bold: true, color: C.textFaint });
        text(ctx, 'Hire more staff to fill it (later milestones)', 32, y + 90, { size: S.small, color: C.textFaint });
      }
      y += slotH + 12;
    }
    const free = team.roster.filter((s) => !teamIds.includes(s.id));
    if (free.length) {
      if (ctx) text(ctx, 'Available', 8, y + 6, { size: S.body, bold: true, color: C.textMuted });
      y += 56;
      const bw = (w - 24) / 2;
      free.forEach((s, i) => {
        const r = { x: (i % 2) * (bw + 24), y: y + Math.floor(i / 2) * 134, w: bw, h: 120 };
        if (ctx) drawButton(ctx, r, `+ ${s.name.split(' ')[0]}`, { accent: C.progress });
        hits.push({ rect: r, id: `add_${s.id}`, onTap: () => teamIds.length < PROJECT.teamSlots && teamIds.push(s.id) });
      });
      y += Math.ceil(free.length / 2) * 134;
    }
    y += 18;

    // --- totals and start ---
    heading('Total');
    const days = teamIds.length ? estimateDays() : Infinity;
    const lines = [
      `Parts: ${fmt(partsCost(parts))} Credits, paid at Start (you have ${fmt(team.money.credits)})`,
      `Running cost: ${fmt(Math.round(COSTS.carDaily * (1 + BUDGETS[budget].costPct / 100)))} Credits a day while it is built (${BUDGETS[budget].name})`,
      `${tier.name} project · complexity ${tier.cx} · ${tier.target} work per phase`,
      teamIds.length ? `About ${days} game days with this team (${(days / 28).toFixed(1)} months)` : 'Nobody on the team: the car would never be built',
    ];
    for (const l of lines) {
      if (ctx) text(ctx, l, 8, y, { size: S.body, color: C.text, maxWidth: w - 16 });
      y += 52;
    }
    y += 16;
    const start = { x: 0, y, w, h: 130 };
    const can = team.canStartCar(classId);
    if (ctx) drawButton(ctx, start, 'Start', { disabled: !teamIds.length || !can.ok });
    hits.push({ rect: start, id: 'start', onTap: () => teamIds.length && can.ok && onStart({ classId, budget, staffIds: [...teamIds] }) });
    y += 130 + 16;
    if (!can.ok) y += para(ctx, can.reason, 8, y, w - 16, { size: S.small, color: C.bad }) + 14;
    y += 14;
    return y;
  }

  return {
    panel,
    get budget() {
      return budget;
    },
    get teamIds() {
      return teamIds;
    },
    estimateDays,
    // Screen rect of a button by id (after scrolling it into view) — tests.
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
    enter() {
      classId = 'clubHatch';
      budget = 'balanced';
      teamIds = team.roster.map((s) => s.id).slice(0, PROJECT.teamSlots); // the three starters, ready to go
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
      panel.begin(ctx);
      layoutPage(ctx, w);
      panel.end(ctx);
      topBar.render(ctx);
    },
  };
}
