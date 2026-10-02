// Driver Drills: medal history and drill settings (Milestone 14, bible §13.3–13.6; Training → "Drills · Medals").
//   Six drill cards: the Driver Drill picture, how to play, the matching course, best score, medals earned (the Training
//   Medal picture tinted Bronze / Silver / Gold, with counts), Mastered, attempts. Records are the account's: they
//   survive New Game+, slot deletes and reloads.
//   Drill settings (this device, bible §13.6 / §45): steering sensitivity, racing-line help, brake-line help, reduced
//   motion, reduced flashes. None of them sets competitiveSecretInvalidated. Milestone 25b: they moved to the Settings
//   sheet (series common feature §2); here a line shows them and a Settings button opens that sheet (onSettings).
//   ?debug=1: Practice any drill (no course), Reset records, and whether a forced result has invalidated competitive
//   secret checks.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, card } from '../../../../core/ui/Kit.js';
import { DRILLS, MEDALS, MEDAL_NAMES, DRILL_ART, DRILL_SETTINGS } from '../../data/drills.js';
import { COURSES } from '../../data/training.js';
import { drawMedal } from '../ui/medal.js';

const C = THEME.color;
const S = THEME.size;
const PAD = 24;
const courseName = (id) => COURSES.find((c) => c.id === id)?.name ?? id;

export function createMedalsScreen({ layout, assets, topBar, records, settings, onSettings = () => {}, debugEnabled = false, goPractice = () => {}, toast = () => {} }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let hits = [];
  const opt = (k) => settings?.get(k) ?? DRILL_SETTINGS[k];

  function drillCard(ctx, y, w, d) {
    const r = records.of(d.id);
    const lines = para(null, d.how, 0, 0, w - PAD * 2 - 180, { size: S.small });
    const h = PAD * 2 + 60 + lines + 50 + 190 + (debugEnabled ? 134 : 0);
    if (ctx) {
      card(ctx, { x: 0, y, w, h }, r.mastered ? 'secret' : 'normal');
      assets.drawContained(ctx, DRILL_ART.button, { x: w - PAD - 150, y: y + PAD, w: 150, h: 150 });
      text(ctx, `${d.name}${r.mastered ? ' · Mastered' : ''}`, PAD, y + PAD, { size: S.button, bold: true, color: r.mastered ? C.purple : C.text, maxWidth: w - PAD * 2 - 180 });
      para(ctx, d.how, PAD, y + PAD + 60, w - PAD * 2 - 180, { size: S.small, color: C.textMuted });
      text(ctx, `Course: ${courseName(d.course)} · best ${r.best} · ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}`, PAD, y + PAD + 60 + lines + 6, { size: S.small, bold: true, color: C.actionDark, maxWidth: w - PAD * 2 });
      const mw = (w - PAD * 2) / 3;
      MEDALS.forEach((m, i) => {
        const x = PAD + i * mw;
        const my = y + PAD + 60 + lines + 60;
        drawMedal(ctx, assets, r.medals[m] ? m : null, { x: x + 10, y: my, w: 110, h: 110 });
        text(ctx, `${MEDAL_NAMES[m]} ×${r.medals[m]}`, x + 130, my + 30, { size: S.small, bold: true, maxWidth: mw - 140 });
        text(ctx, `${d.thresholds[m]}+`, x + 130, my + 72, { size: S.small, color: C.textMuted });
      });
    }
    if (debugEnabled) {
      const b = { x: PAD, y: y + h - PAD - 120, w: w - PAD * 2, h: 120 };
      if (ctx) drawButton(ctx, b, `Debug: practise ${d.name}`, { accent: C.purple });
      hits.push({ rect: b, id: `practice_${d.id}`, onTap: () => goPractice(d.id) });
    }
    return h;
  }

  function layoutPage(ctx, w) {
    hits = [];
    let y = 0;
    if (ctx) text(ctx, 'Driver Drills', 8, y, { size: S.title, bold: true });
    y += 84;
    const intro = 'Optional arcade drills. A driver starting a matching course can play one for up to +25% on that course. Your first Gold masters a drill: Auto Train then gets +12% for good.';
    const ih = para(null, intro, 0, 0, w - 16, { size: S.body });
    if (ctx) para(ctx, intro, 8, y, w - 16, { size: S.body, color: C.textMuted });
    y += ih + 24;
    for (const d of DRILLS) y += drillCard(ctx, y, w, d) + 20;
    // settings
    y += 10;
    if (ctx) text(ctx, 'Drill settings', 8, y, { size: S.heading, bold: true, color: C.actionDark });
    y += 70;
    const note = 'Aids never affect records, achievements or secrets.';
    if (ctx) text(ctx, note, 8, y, { size: S.small, color: C.textMuted, maxWidth: w - 16 });
    y += 56;
    const on = (k) => (opt(k) ? 'on' : 'off');
    const now = `Steering ${Number(opt('steerSensitivity')).toFixed(2)}× · racing line ${on('lineAid')} · brake line ${on('brakeAid')} · reduced motion ${on('reducedMotion')} · reduced flashes ${on('reducedFlashes')}`;
    const nh = para(null, now, 0, 0, w - 16, { size: S.small });
    if (ctx) para(ctx, now, 8, y, w - 16, { size: S.small, color: C.text });
    y += nh + 20;
    const sb = { x: 0, y, w, h: 120 };
    if (ctx) drawButton(ctx, sb, 'Settings', { accent: C.progress });
    hits.push({ rect: sb, id: 'openSettings', onTap: () => onSettings() });
    y += 140;
    if (debugEnabled) {
      y += 20;
      if (ctx) text(ctx, `Debug · competitive secrets ${records.invalidated ? 'INVALIDATED (a forced result)' : 'valid'}`, 8, y, { size: S.small, bold: true, color: records.invalidated ? C.bad : C.good, maxWidth: w - 16 });
      y += 60;
      const b = { x: 0, y, w, h: 120 };
      if (ctx) drawButton(ctx, b, 'Debug: reset drill records', { accent: C.bad });
      hits.push({ rect: b, id: 'resetRecords', onTap: () => records.reset().then(() => toast('Drill records reset')) });
      y += 140;
    }
    return y + 40;
  }

  return {
    panel,
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
    enter() {
      panel.scrollY = 0;
      assets.ensure?.([DRILL_ART.button, DRILL_ART.medal].filter((k) => assets.isPending?.(k)));
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
