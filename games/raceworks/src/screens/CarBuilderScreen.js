// New car (Milestones 4 and 9): the builder the Pit Bay's "New car" opens.
//   Class (tap to choose from the 10: open ones by rank, the rest shown locked with why) · the six slots (tap one to
//   choose its part: open parts, locked ones with what they need; secret parts are never listed until unlocked) · what
//   the parts give before development (the 7 stats, RATING) and the project tier (§15.7) · budget focus · the 5-slot
//   team · the class and part cost (paid at Start) and the daily running cost · Start (greyed with the reason when the
//   car or the team cannot start: a locked class / part, a Prestige tier without Rank S, Emergency Credit, Credits).
// With ?debug=1: "Debug: unlock all" opens every class, part and tier (secret parts too) so any legal car can be built,
// and "Random legal car" picks one. Research (Milestone 11) will unlock things properly.
// Tap a person in a team slot to take them off; tap someone under "Available" to put them on.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { Rng } from '../../../../core/Rng.js';
import { text, para, panel as drawPanel, tabRects, drawTabs, listRow, listRowHeight } from '../../../../core/ui/Kit.js';
import { pressedLook } from '../ui/pressable.js';
import { liveryKey, teamColourId } from '../ui/livery.js';
import { structuralCombos } from '../systems/combos.js'; // Milestone 22
import { CLASSES, CLASS_ORDER, PARTS, SLOTS, BUDGETS, BUDGET_ORDER, PHASES, PROJECT, CAR_STATS } from '../../data/cars.js';
import { ROLES } from '../../data/staff.js';
import { partsOf, leadRole, finalCar } from '../systems/carProject.js';
import { unlockContext, classState, partsForSlot, tierFor, tierState, carCost, partsCost, generateCar, checkCar } from '../systems/carCatalog.js';
import { visualFamily } from '../systems/carVisual.js';
import { COSTS } from '../../data/economy.js';

const C = THEME.color;
const S = THEME.size;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const modsText = (mods) =>
  Object.entries(mods)
    .map(([k, v]) => `${k} ${v >= 0 ? '+' : '−'}${Math.abs(v)}`)
    .join(' · ');

export function createCarBuilderScreen({ layout, assets, team, topBar, onStart, debugEnabled = false, refuse = () => {} }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let classId = 'clubHatch';
  let parts = partsOf('clubHatch');
  let budget = 'balanced';
  let teamIds = [];
  let hits = [];
  let openList = null; // 'class' | a slot id | null: which choice list is open
  let debugAll = false;
  const rng = new Rng(`builder:${Date.now()}`);
  const ctxNow = () => unlockContext(team, { debugAll });

  // Game days this team would take at today's pace (the same formula the project uses).
  function estimateDays() {
    const p = team.cars.projects;
    const tier = tierFor(parts);
    const job = { slots: teamIds };
    let days = 0;
    for (const ph of p.phases) {
      let score = 0;
      for (const id of teamIds) score += p.workerScore(job, ph, team.get(id));
      const per = p._progress(score) * (1 + team.facilities.phaseSpeedPct(ph.id) / 100); // Milestone 10: facility phase speed
      days += per > 0 ? Math.ceil(tier.target / per) : Infinity;
    }
    return days;
  }

  const choose = (row, rect, onTap, id) => {
    hits.push({ rect, id, onTap });
    return row;
  };

  function layoutPage(ctx, w) {
    hits = [];
    const uc = ctxNow();
    const cls = CLASSES[classId];
    const tier = tierFor(parts);
    const tierOk = tierState(tier, uc);
    let y = 0;
    const heading = (label) => {
      if (ctx) text(ctx, label, 8, y, { size: S.heading, bold: true, color: C.actionDark, maxWidth: w - 16 });
      y += 62;
    };
    const row = (r, rect, pressable = true) => {
      if (!ctx) return;
      listRow(ctx, assets, rect, r);
      if (pressable && !r.locked) pressedLook(ctx, rect);
    };

    if (ctx) text(ctx, 'New car', 8, y, { size: S.title, bold: true });
    y += 84;

    // --- debug unlock-all ---
    if (debugEnabled) {
      const half = (w - 20) / 2;
      const a = { x: 0, y, w: half, h: 110 };
      const b = { x: half + 20, y, w: half, h: 110 };
      if (ctx) {
        drawButton(ctx, a, debugAll ? 'Debug: all open' : 'Debug: unlock all', { accent: C.purple, selected: debugAll });
        drawButton(ctx, b, 'Random legal car', { accent: C.purple });
      }
      hits.push({ rect: a, id: 'debugAll', onTap: () => (debugAll = !debugAll) });
      hits.push({ rect: b, id: 'debugRandom', onTap: () => randomCar() });
      y += 130;
    }

    // --- Milestone 28: Legacy Car Blueprints (New Game+): the exact car again, once its class and parts are open ---
    const blueprints = team.ngPlus?.blueprints ?? [];
    if (blueprints.length) {
      heading('Legacy blueprints');
      for (const b of blueprints) {
        const legal = checkCar({ classId: b.classId, parts: b.parts }, uc);
        const using = classId === b.classId && parts.join() === b.parts.join();
        const r = { art: b.art, title: `${b.name} · Legacy`, lines: [{ text: `${CLASSES[b.classId]?.name ?? b.classId} · QUALITY ${b.quality} in ${b.from}`, size: S.small, bold: true }, { text: legal.ok ? b.parts.map((id) => PARTS[id]?.name ?? id).join(' · ') : `Not yet: ${legal.reasons[0]}`, size: S.small, color: legal.ok ? C.textMuted : C.bad }], right: using ? 'In use' : legal.ok ? 'Use' : '', rightColor: C.progress, state: using ? 'selected' : undefined, locked: !legal.ok, artSize: 130 };
        const h = listRowHeight(w, r);
        const rect = { x: 0, y, w, h };
        row(r, rect);
        if (legal.ok)
          choose(r, rect, () => {
            classId = b.classId;
            parts = [...b.parts];
            openList = null;
          }, `blueprint_${b.id}`);
        y += h + 12;
      }
      y += 18;
    }

    // --- class ---
    heading('Class');
    const vis = visualFamily({ classId, parts, combos: structuralCombos({ classId, parts }), secrets: new Set(team.unlocks?.secrets ?? []), debugSecrets: !!team.combos?.debugSecrets }); // Milestone 22: the resolver (Milestone 25: + the secret families found)
    const chosen = {
      art: liveryKey(assets, vis.showcase, teamColourId(team), team.sponsors?.decals() ?? []),
      title: cls.name,
      lines: [
        { text: `Weights · ${CAR_STATS.map((k) => `${k} ${cls.weights[k]}`).join(' · ')}`, size: S.small, color: C.textMuted },
        { text: `${cls.baseCost ? `Class cost ${fmt(cls.baseCost)} Credits` : 'No class cost'} · looks like ${vis.id}`, size: S.small, color: C.textMuted },
      ],
      right: openList === 'class' ? 'Close' : 'Change',
      rightColor: C.progress,
      state: 'selected',
      artSize: 150,
    };
    const crh = listRowHeight(w, chosen);
    row(chosen, { x: 0, y, w, h: crh });
    hits.push({ rect: { x: 0, y, w, h: crh }, id: 'class', onTap: () => (openList = openList === 'class' ? null : 'class') });
    y += crh + 12;
    if (openList === 'class') {
      for (const id of CLASS_ORDER) {
        if (id === classId) continue;
        const k = CLASSES[id];
        const st = classState(id, uc);
        const r = { art: k.art, title: k.name, lines: [{ text: st.open ? `${k.baseCost ? `${fmt(k.baseCost)} Credits` : 'No class cost'} · ${k.tag}` : st.reason, size: S.small, color: st.open ? C.textMuted : C.bad }], locked: !st.open, right: st.open ? 'Pick' : '', artSize: 110 };
        const h = listRowHeight(w, r);
        const rect = { x: 24, y, w: w - 24, h };
        row(r, rect);
        if (st.open)
          choose(r, rect, () => {
            classId = id;
            openList = null;
          }, `class_${id}`);
        y += h + 10;
      }
      y += 10;
    }
    y += 18;

    // --- parts ---
    heading(`Parts · complexity ${tier.cx}`);
    SLOTS.forEach((sl, i) => {
      const part = PARTS[parts[i]];
      const r = { art: part.art, title: `${sl.name}: ${part.name}`, lines: [{ text: modsText(part.mods), size: S.small, color: C.progress, bold: true }], right: `${fmt(part.cost)} Cr · Cx ${part.cx}`, artSize: 110, state: openList === sl.id ? 'selected' : undefined };
      const rh = listRowHeight(w, r);
      const rect = { x: 0, y, w, h: rh };
      row(r, rect);
      hits.push({ rect, id: `slot_${sl.id}`, onTap: () => (openList = openList === sl.id ? null : sl.id) });
      y += rh + 12;
      if (openList === sl.id) {
        for (const opt of partsForSlot(sl.id, uc)) {
          if (opt.id === parts[i]) continue;
          const p = PARTS[opt.id];
          const or = { art: p.art, title: `${p.name}${p.secret ? ' · secret found' : ''}`, lines: [{ text: opt.open ? modsText(p.mods) : opt.reason, size: S.small, color: opt.open ? C.progress : C.bad, bold: opt.open }], locked: !opt.open, right: `${fmt(p.cost)} · Cx ${p.cx}`, rightColor: opt.open ? C.progress : C.textFaint, artSize: 96 };
          const oh = listRowHeight(w - 24, or);
          const orect = { x: 24, y, w: w - 24, h: oh };
          row(or, orect);
          if (opt.open)
            choose(or, orect, () => {
              parts = parts.map((x, j) => (j === i ? opt.id : x));
              openList = null;
            }, `part_${opt.id}`);
          y += oh + 10;
        }
        y += 10;
      }
    });
    y += 12;

    // --- what the car starts from (before development) ---
    heading('Before development');
    const bare = finalCar({ classId, parts });
    const cw = (w - 16) / 4;
    CAR_STATS.forEach((k, i) => {
      const x = 8 + (i % 4) * cw;
      const yy = y + Math.floor(i / 4) * 64;
      if (ctx) {
        text(ctx, k, x, yy, { size: S.small, bold: true, color: C.textMuted });
        text(ctx, String(bare.stats[k]), x + 86, yy - 4, { size: S.body, bold: true });
      }
    });
    if (ctx) {
      text(ctx, 'RATING', 8 + 3 * cw, y + 64, { size: S.small, bold: true, color: C.textMuted });
      text(ctx, String(bare.rating), 8 + 3 * cw + 118, y + 60, { size: S.body, bold: true, color: C.progress });
    }
    y += 140;
    y += para(ctx, 'The crew develops every stat on top of this in each phase; QUALITY (0–100) comes from how well the finished car fits its class, the team\'s work and any Innovation, minus open faults.', 8, y, w - 16, { size: S.small, color: C.textMuted }) + 24;

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
        const sr = { art: s.art, title: s.name, lines: [{ text: `${ROLES[s.role].name} · Energy ${Math.round(s.energy)} · tap to take off`, size: S.small, color: C.textMuted }], right: `Slot ${i + 1}`, artSize: 110 };
        row(sr, { ...r, h: slotH });
        hits.push({ rect: r, id: `slot_${s.id}`, onTap: () => (teamIds = teamIds.filter((x) => x !== s.id)) });
      } else if (ctx) {
        drawPanel(ctx, r, { fill: C.panelDim, stroke: C.line, radius: THEME.panel.radius });
        text(ctx, `Slot ${i + 1} · empty`, 32, y + 40, { size: S.body, bold: true, color: C.textFaint });
        text(ctx, 'Hire more staff to fill it (Staff → Hire)', 32, y + 90, { size: S.small, color: C.textFaint });
      }
      y += slotH + 12;
    }
    const free = team.roster.filter((s) => !teamIds.includes(s.id) && !team.training.trainingOf(s.id)); // Milestone 12: not away on a course
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
    const price = team.carPrice({ classId, parts });
    const lines = [
      // Milestone 10: the price after the facilities' material cost bonus (the Parts Rack's −3%).
      { t: `${price.shell ? `Class ${fmt(price.shell)} + parts ${fmt(price.parts)} = ${fmt(price.total)}` : `Parts: ${fmt(price.parts)}`} Credits, paid at Start${price.total !== carCost({ classId, parts }) ? ` (${fmt(carCost({ classId, parts }))} before your facilities' discount)` : ''} (you have ${fmt(team.money.credits)})` },
      { t: `Running cost: ${fmt(Math.round(COSTS.carDaily * (1 + BUDGETS[budget].costPct / 100)))} Credits a day while it is built (${BUDGETS[budget].name})` },
      { t: `${tier.name} project · complexity ${tier.cx} · ${tier.target} work per phase`, color: tierOk.open ? C.text : C.bad },
      { t: teamIds.length ? `About ${days} game days with this team (${(days / 28).toFixed(1)} months)` : 'Nobody on the team: the car would never be built' },
    ];
    for (const l of lines) y += para(ctx, l.t, 8, y, w - 16, { size: S.body, color: l.color ?? C.text }) + 12;
    y += 16;
    const start = { x: 0, y, w, h: 130 };
    const can = team.canStartCar({ classId, parts }, { debugAll });
    if (ctx) drawButton(ctx, start, 'Start', { disabled: !teamIds.length || !can.ok });
    // (Milestone 29: a tap on a greyed Start says why in one line)
    hits.push({ rect: start, id: 'start', onTap: () => (!teamIds.length ? refuse('Pick at least one person for the crew') : !can.ok ? refuse(can.reason) : onStart({ classId, parts: [...parts], budget, staffIds: [...teamIds], debugAll })) });
    y += 130 + 16;
    if (!can.ok) y += para(ctx, can.reason, 8, y, w - 16, { size: S.small, color: C.bad }) + 14;
    y += 14;
    return y;
  }

  function randomCar() {
    const car = generateCar(rng, ctxNow());
    classId = car.classId;
    parts = car.parts;
    openList = null;
    return car;
  }

  return {
    panel,
    get budget() {
      return budget;
    },
    get teamIds() {
      return teamIds;
    },
    get car() {
      return { classId, parts: [...parts] };
    },
    get debugAll() {
      return debugAll;
    },
    // Tests: set the car directly (still only startable when legal).
    setCar(car) {
      classId = car.classId;
      parts = [...(car.parts ?? partsOf(car.classId))];
    },
    setDebugAll(on) {
      debugAll = !!on && debugEnabled;
    },
    randomCar,
    estimateDays,
    // Screen rect of a button by id (after scrolling it into view) — tests.
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
    enter() {
      classId = 'clubHatch';
      parts = partsOf('clubHatch');
      budget = 'balanced';
      openList = null;
      teamIds = team.roster.filter((s) => !team.training.trainingOf(s.id)).map((s) => s.id).slice(0, PROJECT.teamSlots); // everyone here (not on a course), ready to go
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
