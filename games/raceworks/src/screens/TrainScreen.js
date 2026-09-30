// Training (Milestone 12, bible §13.1): Staff → Train, tapping the Driver Simulator, a worker's sheet or their details.
// At the top: capacity — the Driver Simulator seat (one person at a time) and the training places — and who is on a
// course now with the days left. Then the team as portrait chips (pick someone; someone away shows their course), and
// the seven courses for them: days, cost, the gain (clamped to their tier cap: "DRV 89 → 98"), and Start or why not
// (no Driver Simulator, the seat is taken, no free place, on the car's team, at the cap, Credits).
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, drawPadlock, hitRect } from '../../../../core/ui/Button.js';
import { text, para, card } from '../../../../core/ui/Kit.js';
import { ROLES } from '../../data/staff.js';
import { pressedLook } from '../ui/pressable.js';

const C = THEME.color;
const S = THEME.size;
const PAD = 24;
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function createTrainScreen({ layout, assets, team, topBar, toast = () => {} }) {
  const tr = team.training;
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let who = null;
  let hits = [];
  const person = () => team.get(who) ?? team.roster[0] ?? null;

  function start(courseId) {
    const s = person();
    const r = tr.start(courseId, s.id);
    if (!r.ok) return toast(r.reason);
    const c = tr.courses.course(courseId);
    toast(`${s.name.split(' ')[0]} starts ${c.name}`, `−${fmt(c.cost)} Credits · ${r.training.days} days`);
  }

  function capacityCard(ctx, y, w) {
    const caps = tr.capacity();
    const act = tr.active;
    const h = PAD * 2 + 64 + caps.length * 52 + (act.length ? 20 + act.length * 110 : 52);
    if (ctx) {
      card(ctx, { x: 0, y, w, h }, tr.open() ? 'info' : 'locked');
      text(ctx, tr.open() ? 'Training capacity' : 'Training is closed', PAD, y + PAD, { size: S.heading, bold: true, color: C.actionDark });
      let yy = y + PAD + 64;
      for (const c of caps) {
        const line = !tr.open() ? `${c.name}: —` : c.total === 0 ? `${c.name}: none` : `${c.name}: ${c.total - c.used} of ${c.total} free${c.who ? ` · ${c.who}` : ''}`;
        text(ctx, line, PAD, yy, { size: S.small, bold: c.used >= c.total, color: c.used >= c.total ? C.bad : C.text, maxWidth: w - PAD * 2 });
        yy += 52;
      }
      if (!act.length) text(ctx, tr.open() ? 'Nobody is on a course.' : tr.lockedText, PAD, yy, { size: S.small, color: tr.open() ? C.textMuted : C.bad, bold: !tr.open(), maxWidth: w - PAD * 2 });
      else {
        yy += 20;
        for (const a of act) {
          const s = team.get(a.staffId);
          const c = tr.courses.course(a.courseId);
          assets.drawContained(ctx, s?.art, { x: PAD, y: yy, w: 70, h: 96 }, 'bottom');
          text(ctx, `${s?.name ?? '?'} · ${c.name}`, PAD + 90, yy + 6, { size: S.small, bold: true, maxWidth: w - PAD * 2 - 90 });
          const f = a.daysDone / a.days;
          ctx.fillStyle = C.track;
          ctx.beginPath();
          ctx.roundRect(PAD + 90, yy + 56, w - PAD * 2 - 90 - 180, 24, 12);
          ctx.fill();
          ctx.fillStyle = C.progress;
          ctx.beginPath();
          ctx.roundRect(PAD + 90, yy + 56, Math.max(24, (w - PAD * 2 - 90 - 180) * f), 24, 12);
          ctx.fill();
          text(ctx, `${a.days - a.daysDone} day${a.days - a.daysDone === 1 ? '' : 's'} left`, w - PAD, yy + 50, { size: S.small, bold: true, align: 'right' });
          yy += 110;
        }
      }
    }
    return h;
  }

  // The team as portrait chips, 4 to a row.
  function picker(ctx, y, w) {
    const per = 4;
    const gap = 16;
    const cw = (w - gap * (per - 1)) / per;
    const ch = 260;
    const sel = person();
    team.roster.forEach((s, i) => {
      const r = { x: (i % per) * (cw + gap), y: y + Math.floor(i / per) * (ch + gap), w: cw, h: ch };
      if (ctx) {
        card(ctx, r, s.id === sel?.id ? 'selected' : 'normal', { radius: 20 });
        assets.drawContained(ctx, s.art, { x: r.x + 10, y: r.y + 8, w: r.w - 20, h: ch - 100 }, 'bottom');
        assets.drawContained(ctx, ROLES[s.role].badge, { x: r.x + 4, y: r.y + 4, w: 56, h: 56 });
        text(ctx, s.name.split(' ')[0], r.x + r.w / 2, r.y + ch - 88, { size: S.small, bold: true, align: 'center', maxWidth: r.w - 12 });
        const t = tr.trainingOf(s.id);
        text(ctx, t ? `${tr.daysLeft(s.id)}d course` : ROLES[s.role].name, r.x + r.w / 2, r.y + ch - 46, { size: S.small, color: t ? C.progress : C.textMuted, bold: !!t, align: 'center', maxWidth: r.w - 12 });
        pressedLook(ctx, r, { radius: 20 });
      }
      hits.push({ rect: r, id: `pick_${s.id}`, onTap: () => (who = s.id) });
    });
    return Math.ceil(team.roster.length / per) * (ch + gap);
  }

  function courseCard(ctx, y, w, o) {
    const c = o.course;
    const gains = o.preview.length ? o.preview.map((g) => `${g.key} ${g.from} → ${g.from + g.max}${g.max < c.effect.max ? ' (cap)' : ''}`).join(' · ') : c.gainText;
    const h = PAD * 2 + 60 + 50 + 50 + 124;
    if (ctx) {
      card(ctx, { x: 0, y, w, h }, o.ok ? 'normal' : 'locked');
      if (!tr.open()) drawPadlock(ctx, w - PAD - 20, y + PAD + 26, 34, C.textFaint);
      text(ctx, c.name, PAD, y + PAD, { size: S.button, bold: true, maxWidth: w - PAD * 2 - 260 });
      text(ctx, `${c.days} days · ${fmt(c.cost)} Cr`, w - PAD - (tr.open() ? 0 : 60), y + PAD + 4, { size: S.small, bold: true, align: 'right', color: C.actionDark });
      text(ctx, `Gain: ${c.gainText}`, PAD, y + PAD + 60, { size: S.small, color: C.textMuted, maxWidth: w - PAD * 2 });
      text(ctx, gains, PAD, y + PAD + 110, { size: S.small, bold: true, color: C.good, maxWidth: w - PAD * 2 });
    }
    const b = { x: PAD, y: y + h - PAD - 114, w: w - PAD * 2, h: 114 };
    if (ctx) drawButton(ctx, b, o.ok ? `Start · ${fmt(c.cost)} Credits` : o.why, { disabled: !o.ok });
    hits.push({ rect: b, id: `start_${c.id}`, onTap: () => (o.ok ? start(c.id) : toast(o.why)) });
    return h;
  }

  function layoutPage(ctx, w) {
    hits = [];
    let y = 0;
    if (ctx) text(ctx, 'Training', 8, y, { size: S.title, bold: true });
    y += 84;
    y += capacityCard(ctx, y, w) + 24;
    if (ctx) text(ctx, 'Who trains?', 8, y, { size: S.heading, bold: true, color: C.actionDark });
    y += 70;
    y += picker(ctx, y, w) + 16;
    const s = person();
    if (!s) return y;
    const t = tr.trainingOf(s.id);
    const line = t ? `${s.name} is on ${tr.courseOf(s.id).name}: ${tr.daysLeft(s.id)} days left` : `Courses for ${s.name} · ${ROLES[s.role].name}, Level ${s.level} · tier cap ${team.staff.statCap(s)}`;
    const lh = para(null, line, 0, 0, w - 16, { size: S.body });
    if (ctx) para(ctx, line, 8, y, w - 16, { size: S.body, bold: !!t, color: t ? C.progress : C.text });
    y += lh + 20;
    for (const o of tr.options(s.id)) y += courseCard(ctx, y, w, o) + 20;
    return y + 40;
  }

  return {
    panel,
    get who() {
      return person()?.id ?? null;
    },
    pick(id) {
      who = id;
    },
    buttonRect(bid) {
      const r = panel.getRect();
      panel.contentHeight = layoutPage(null, r.w);
      const h = hits.find((x) => x.id === bid);
      if (!h) return null;
      if (h.rect.y < panel.scrollY || h.rect.y + h.rect.h > panel.scrollY + r.h) {
        panel.scrollY = h.rect.y - 40;
        panel.clamp();
      }
      return { x: r.x + h.rect.x, y: r.y + h.rect.y - panel.scrollY, w: h.rect.w, h: h.rect.h };
    },
    enter(params = {}) {
      who = params.id ?? who;
      if (!team.get(who)) who = team.roster[0]?.id ?? null;
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
