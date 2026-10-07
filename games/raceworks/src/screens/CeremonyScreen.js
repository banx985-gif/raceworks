// The Year-16 Ending Ceremony (Milestone 27, bible §7 Ending Ceremony, §32: short cards, no long cutscenes). Full-screen
// cards from team.ending.result, one at a time — a tap anywhere moves on:
//   1. the opening: the World Crown (C10 champions: World Championship Arrival + the World Trophy) or "Season's end"
//      (the same ceremony, never a "fail" screen)
//   2. the grade reveal (the total counts up, the letter) · 3. the seven area bars
//   4… 6–10 history cards (first car, first win, titles, best driver, comeback, richest month, the founder …)
//   then the trophy shelf, the cars by family, and the last card: Prestige Tokens + Continue to Year 17 / Start New Game+.
// Reduced motion: no count-up, no bar fill, no slide — each card appears complete.
//   createCeremonyScreen({ layout, assets, team, onContinue, onNgPlus, sfx, haptic, reduced })
//   .cards() (tests) · .index · .next() · .skip() · .buttonRect(id): 'continue' | 'ngplus' | 'skip' | 'next'
import { THEME } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { ENDING, ENDING_TEXT as T } from '../../data/ending.js';
import { TEAM_COLOURS } from '../../data/setup.js';

const C = THEME.color;
const S = THEME.size;
const BAND_COLOUR = { S: C.purple, A: C.gold, B: C.good, C: C.progress, D: C.textMuted };
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

// Milestone 29: Help (onHelp) left of Skip, on every card.
export function createCeremonyScreen({ layout, assets, team, onContinue, onNgPlus, sfx = () => {}, haptic = () => {}, reduced = () => false, onHelp = null }) {
  let index = 0;
  let t = 0; // seconds on this card
  let hits = [];

  const result = () => team.ending.result;
  function cards() {
    const r = result();
    if (!r) return [];
    return [
      { id: 'opening' },
      { id: 'grade' },
      { id: 'areas' },
      ...r.highlights.map((h) => ({ id: `hl_${h.id}`, highlight: h })),
      { id: 'shelf' },
      { id: 'cars' },
      { id: 'final' },
    ];
  }
  const card = () => cards()[index] ?? null;
  const isLast = () => index >= cards().length - 1;
  const area = () => {
    const sr = layout.safeRect;
    return { x: sr.x + 32, y: sr.y + 150, w: sr.w - 64, h: sr.h - 150 - 190 };
  };
  const skipRect = () => {
    const sr = layout.safeRect;
    return { x: sr.x + sr.w - 32 - 240, y: sr.y + 24, w: 240, h: 104 };
  };

  const helpRect = () => {
    const s = skipRect();
    return { x: s.x - 16 - 160, y: s.y, w: 160, h: s.h };
  };

  function next() {
    if (isLast()) return false;
    index++;
    t = 0;
    const id = card()?.id;
    sfx(id === 'grade' ? 'sfx_win' : 'sfx_ui');
    if (id === 'grade' || id === 'final') haptic('medium');
    return true;
  }
  function skip() {
    index = cards().length - 1;
    t = 0;
    sfx('sfx_ui');
  }

  // --- drawing --------------------------------------------------------------------------------------------------------
  function header(ctx, r) {
    const sr = layout.safeRect;
    const colour = TEAM_COLOURS.find((c) => c.id === team.setup.colour) ?? TEAM_COLOURS[0];
    text(ctx, 'YEAR-16 CEREMONY', sr.x + 40, sr.y + 30, { size: S.small, bold: true, color: C.textMuted });
    text(ctx, team.setup.teamName, sr.x + 40, sr.y + 70, { size: S.heading, bold: true, color: colour.dark ?? C.text, maxWidth: (onHelp ? helpRect().x : skipRect().x) - 24 - sr.x - 40 });
    if (!isLast()) drawButton(ctx, skipRect(), 'Skip ›', { accent: C.progress });
    if (onHelp) drawButton(ctx, helpRect(), 'Help', { accent: C.progress });
    void r;
  }
  function footer(ctx) {
    const sr = layout.safeRect;
    const n = cards().length;
    const y = sr.y + sr.h - 160;
    // the dots: where this card is in the ceremony
    const dot = 22;
    const gap = 14;
    const total = n * dot + (n - 1) * gap;
    let x = sr.x + (sr.w - total) / 2;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i === index ? C.action : i < index ? C.actionDark : C.track;
      ctx.beginPath();
      ctx.arc(x + dot / 2, y + dot / 2, dot / 2, 0, Math.PI * 2);
      ctx.fill();
      x += dot + gap;
    }
    if (!isLast()) text(ctx, `${T.tapNext} · ${index + 1} of ${n}`, sr.x + sr.w / 2, y + 50, { size: S.small, bold: true, color: C.textMuted, align: 'center' });
  }

  function drawOpening(ctx, a, r) {
    const crown = r.worldCrown;
    drawPanel(ctx, a, { fill: crown ? C.panelGold : C.panel, stroke: crown ? C.gold : C.line, lineWidth: crown ? 6 : 3, radius: 32 });
    const artH = a.h * 0.46;
    assets.drawContained(ctx, crown ? ENDING.art.crown : ENDING.art.seasonEnd, { x: a.x + 30, y: a.y + 30, w: a.w - 60, h: artH });
    let y = a.y + artH + 60;
    if (crown) {
      const k = reduced() ? 1 : ease(t / 0.9);
      const s = 260 * (0.6 + 0.4 * k);
      ctx.save();
      ctx.globalAlpha = k;
      assets.drawContained(ctx, ENDING.art.trophy, { x: a.x + a.w / 2 - s / 2, y, w: s, h: s });
      ctx.restore();
      y += 280;
    }
    text(ctx, crown ? T.crownTitle : T.seasonTitle, a.x + a.w / 2, y, { size: S.title, bold: true, color: crown ? C.gold : C.actionDark, align: 'center', maxWidth: a.w - 60 });
    y += 100;
    para(ctx, crown ? T.crown(team.setup.teamName) : T.season(team.setup.teamName), a.x + 50, y, a.w - 100, { size: S.body, align: 'center' });
  }

  function drawGrade(ctx, a, r) {
    const g = r.grade;
    drawPanel(ctx, a, { fill: C.panel, radius: 32 });
    text(ctx, T.gradeTitle, a.x + a.w / 2, a.y + 50, { size: S.heading, bold: true, color: C.actionDark, align: 'center' });
    const k = reduced() ? 1 : ease(t / 1.4);
    const shown = Math.round(g.total * k);
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h * 0.42;
    const rad = Math.min(a.w, a.h) * 0.24;
    const col = BAND_COLOUR[g.band] ?? C.text;
    ctx.fillStyle = C.panelAlt;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.track;
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (shown / g.max));
    ctx.stroke();
    if (k >= 1) text(ctx, g.band, cx, cy - rad * 0.55, { size: Math.round(rad * 1.05), bold: true, color: col, align: 'center' });
    else text(ctx, '…', cx, cy - rad * 0.4, { size: Math.round(rad * 0.7), bold: true, color: C.textFaint, align: 'center' });
    text(ctx, `${shown} / ${g.max}`, cx, cy + rad + 50, { size: S.title, bold: true, align: 'center' });
    text(ctx, `Grade ${k >= 1 ? g.band : '…'} · ${ENDING.bands.slice().reverse().map((b) => `${b.id} ${b.min}+`).join(' · ')}`, cx, cy + rad + 150, { size: S.small, color: C.textMuted, align: 'center', maxWidth: a.w - 60 });
  }

  function drawAreas(ctx, a, r) {
    drawPanel(ctx, a, { fill: C.panel, radius: 32 });
    text(ctx, T.areasTitle, a.x + 40, a.y + 40, { size: S.heading, bold: true, color: C.actionDark });
    const rows = r.grade.categories;
    const top = a.y + 140;
    const rowH = Math.min(200, (a.h - 180) / rows.length);
    rows.forEach((c, i) => {
      const y = top + i * rowH;
      const k = reduced() ? 1 : ease((t - i * 0.12) / 0.8);
      text(ctx, c.name, a.x + 40, y, { size: S.body, bold: true, maxWidth: a.w - 300 });
      text(ctx, `${Math.round(c.score * k)} / ${c.max}`, a.x + a.w - 40, y, { size: S.body, bold: true, align: 'right' });
      const bw = a.w - 80;
      ctx.fillStyle = C.track;
      ctx.beginPath();
      ctx.roundRect(a.x + 40, y + 62, bw, 30, 15);
      ctx.fill();
      if (c.score <= 0) return; // nothing scored: an empty bar
      ctx.fillStyle = c.score / c.max >= 0.75 ? C.good : c.score / c.max >= 0.4 ? C.progress : C.warn;
      ctx.beginPath();
      ctx.roundRect(a.x + 40, y + 62, Math.max(30, bw * (c.score / c.max) * k), 30, 15);
      ctx.fill();
    });
  }

  function drawHighlight(ctx, a, h) {
    drawPanel(ctx, a, { fill: C.panel, radius: 32 });
    text(ctx, h.title, a.x + a.w / 2, a.y + 50, { size: S.title, bold: true, color: C.actionDark, align: 'center', maxWidth: a.w - 60 });
    const box = { x: a.x + 60, y: a.y + 170, w: a.w - 120, h: a.h * 0.48 };
    const k = reduced() ? 1 : ease(t / 0.5);
    ctx.save();
    ctx.globalAlpha = k;
    if (h.art && h.portrait) {
      ctx.fillStyle = C.panelAlt;
      ctx.beginPath();
      ctx.roundRect(box.x + box.w * 0.2, box.y, box.w * 0.6, box.h, 28);
      ctx.fill();
      assets.drawContained(ctx, h.art, { x: box.x + box.w * 0.2 + 12, y: box.y + 12, w: box.w * 0.6 - 24, h: box.h - 24 });
    } else assets.drawContained(ctx, h.art ?? h.icon ?? 'race_ui_13', h.art ? box : { x: box.x + box.w / 2 - box.h * 0.35, y: box.y + box.h * 0.15, w: box.h * 0.7, h: box.h * 0.7 });
    ctx.restore();
    let y = box.y + box.h + 50;
    y += para(ctx, h.line, a.x + 60, y, a.w - 120, { size: S.heading, bold: true, align: 'center' }) + 24;
    if (h.when) text(ctx, h.when, a.x + a.w / 2, y, { size: S.body, color: C.textMuted, align: 'center' });
  }

  function drawShelf(ctx, a, r) {
    drawPanel(ctx, a, { fill: C.panel, radius: 32 });
    text(ctx, T.shelfTitle, a.x + 40, a.y + 40, { size: S.heading, bold: true, color: C.actionDark });
    const list = r.shelf;
    if (!list.length) {
      para(ctx, T.shelfEmpty, a.x + 40, a.y + 160, a.w - 80, { size: S.body, color: C.textMuted });
      return;
    }
    const cols = 3;
    const cw = (a.w - 80) / cols;
    const ch = Math.min(380, (a.h - 200) / Math.ceil(list.length / cols));
    list.forEach((tr, i) => {
      const x = a.x + 40 + (i % cols) * cw;
      const y = a.y + 140 + Math.floor(i / cols) * ch;
      // the shelf board under each row
      if (i % cols === 0) {
        ctx.fillStyle = C.line;
        ctx.fillRect(a.x + 30, y + ch - 96, a.w - 60, 14);
      }
      assets.drawContained(ctx, tr.art, { x: x + 20, y, w: cw - 40, h: ch - 110 });
      text(ctx, tr.name.replace(' champions', ''), x + cw / 2, y + ch - 74, { size: S.small, bold: true, align: 'center', maxWidth: cw - 12 });
    });
  }

  function drawCars(ctx, a, r) {
    drawPanel(ctx, a, { fill: C.panel, radius: 32 });
    text(ctx, T.carsTitle, a.x + 40, a.y + 40, { size: S.heading, bold: true, color: C.actionDark });
    const list = r.cars;
    if (!list.length) {
      para(ctx, 'No cars finished in this run.', a.x + 40, a.y + 160, a.w - 80, { size: S.body, color: C.textMuted });
      return;
    }
    const cols = 2;
    const cw = (a.w - 80) / cols;
    const ch = Math.min(420, (a.h - 180) / Math.ceil(list.length / cols));
    list.forEach((f, i) => {
      const x = a.x + 40 + (i % cols) * cw;
      const y = a.y + 130 + Math.floor(i / cols) * ch;
      if (f.art) assets.drawContained(ctx, f.art, { x: x + 10, y, w: cw - 20, h: ch - 70 });
      text(ctx, `${f.name} × ${f.count}`, x + cw / 2, y + ch - 62, { size: S.small, bold: true, align: 'center', maxWidth: cw - 12 });
    });
  }

  function drawFinal(ctx, a, r) {
    drawPanel(ctx, a, { fill: C.panelGold, stroke: C.gold, lineWidth: 5, radius: 32 });
    text(ctx, T.tokensTitle, a.x + a.w / 2, a.y + 50, { size: S.title, bold: true, color: C.gold, align: 'center' });
    text(ctx, `+${r.tokens}`, a.x + a.w / 2, a.y + 170, { size: 200, bold: true, color: C.gold, align: 'center' });
    let y = a.y + 420;
    y += para(ctx, T.tokens(r.tokens, team.prestigeTokens), a.x + 60, y, a.w - 120, { size: S.body, align: 'center' }) + 30;
    text(ctx, `Grade ${r.grade.band} · ${r.grade.total} / ${r.grade.max}${r.worldCrown ? ' · World Champions' : ''}`, a.x + a.w / 2, y, { size: S.body, bold: true, color: C.textMuted, align: 'center', maxWidth: a.w - 60 });
    const { cont, ng } = finalButtons(a);
    drawButton(ctx, cont, T.continue, { accent: C.good });
    drawButton(ctx, ng, T.ngplus, { accent: C.purple });
  }
  const finalButtons = (a) => ({ cont: { x: a.x + 60, y: a.y + a.h - 320, w: a.w - 120, h: 130 }, ng: { x: a.x + 60, y: a.y + a.h - 170, w: a.w - 120, h: 130 } });
  // The tap areas (no drawing): the last card's two buttons, Skip, and the card itself (moves on).
  function layoutHits() {
    hits = [];
    if (!result() || !card()) return hits;
    const a = area();
    if (onHelp) hits.push({ rect: helpRect(), id: 'help', onTap: () => onHelp() });
    if (isLast()) {
      const { cont, ng } = finalButtons(a);
      hits.push({ rect: cont, id: 'continue', onTap: () => onContinue() });
      hits.push({ rect: ng, id: 'ngplus', onTap: () => onNgPlus() });
    } else {
      hits.push({ rect: skipRect(), id: 'skip', onTap: () => skip() });
      hits.push({ rect: a, id: 'next', onTap: () => next() });
    }
    return hits;
  }

  function draw(ctx) {
    const r = result();
    if (!r) return;
    const a = area();
    const c = card();
    if (!c) return;
    header(ctx, r);
    const slide = reduced() ? 0 : (1 - ease(t / 0.3)) * 80;
    ctx.save();
    ctx.translate(slide, 0);
    if (c.id === 'opening') drawOpening(ctx, a, r);
    else if (c.id === 'grade') drawGrade(ctx, a, r);
    else if (c.id === 'areas') drawAreas(ctx, a, r);
    else if (c.highlight) drawHighlight(ctx, a, c.highlight);
    else if (c.id === 'shelf') drawShelf(ctx, a, r);
    else if (c.id === 'cars') drawCars(ctx, a, r);
    else if (c.id === 'final') drawFinal(ctx, a, r);
    ctx.restore();
    footer(ctx);
  }

  return {
    cards,
    next,
    skip,
    get index() {
      return index;
    },
    get card() {
      return card();
    },
    enter() {
      index = 0;
      t = 0;
      sfx(result()?.worldCrown ? 'sfx_win' : 'sfx_car_done');
      if (result()?.worldCrown) haptic('heavy');
    },
    update(dt) {
      t += dt;
    },
    // Milestone 29: every tap area drawn last frame (the thumb-size check reads them; content units)
    tapTargets: () => hits.map((h) => ({ id: h.id, rect: h.rect })),
    buttonRect(id) {
      return layoutHits().find((h) => h.id === id)?.rect ?? null;
    },
    onTap(p) {
      layoutHits();
      // buttons first (the last card's two, Skip), then anywhere on the card moves on
      const h = hits.find((x) => x.id !== 'next' && hitRect(p, x.rect)) ?? hits.find((x) => x.id === 'next' && hitRect(p, x.rect));
      h?.onTap();
    },
    render(ctx) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      draw(ctx);
    },
  };
}

