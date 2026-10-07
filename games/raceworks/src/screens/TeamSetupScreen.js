// New Game setup (Milestone 4b, spec §1–2, §5–6): team name and Team Principal (typed, or Random from built-in
// fictional lists), one of six team colours (or Random) with a badge and the Club Hatch in that colour (Aaron's car_v01_showcase with
// the colour laid on through its livery anchors, src/ui/livery.js — Milestone 8: never a car drawn in code), and 1 of 5
// founders (portrait, role, trait, founder perk). RANDOMISE ALL fills everything; any field can still be changed.
// Next shows the confirmation (spec §6); START TEAM hands the setup to main.js, which creates the save.
//   createTeamSetupScreen({ layout, assets, header, textPrompt, onStart(setup, slot), onBack })
//   enter({ slot, replacing, ngLevel })   slot = the save slot this team will go in; replacing = the team name it replaces;
//                                ngLevel = a New Game+ team's level (Milestone 28: its picks were made on the NG+ screen)
import { THEME, font } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { STAFF, ROLES, TRAITS } from '../../data/staff.js';
import { TEAM_NAMES, PLAYER_NAMES, TEAM_COLOURS, FOUNDERS, PLAYER_TITLE, NAME_MAX } from '../../data/setup.js';
import { drawTeamBadge, drawDice, drawFounderFrame, initialsOf } from '../ui/setupArt.js';
import { liveryKey } from '../ui/livery.js';
import { pressedLook } from '../ui/pressable.js';
import { CLASSES } from '../../data/cars.js';

const C = THEME.color;
const S = THEME.size;
const staffDef = (id) => STAFF.find((s) => s.id === id);
const firstName = (id) => staffDef(id).name.split(' ')[0];
// A random pick that is not the current one (so Random always changes something).
const pick = (list, current, rnd = Math.random) => {
  const pool = list.length > 1 ? list.filter((x) => x !== current) : list;
  return pool[Math.floor(rnd() * pool.length)];
};

export function createTeamSetupScreen({ layout, assets, header, textPrompt, onStart, onBack }) {
  const state = { teamName: '', principal: '', colour: TEAM_COLOURS[0].id, founderId: FOUNDERS[1].id };
  let step = 'form';
  let slot = 1;
  let replacing = null;
  let ngLevel = 0; // Milestone 28: the New Game+ level of the team being set up (0 = a first run)
  let hits = [];
  const panel = new ScrollPanel({
    getRect: () => {
      const hr = header.rect();
      const sr = layout.safeRect;
      const y = hr.y + hr.h + 16;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 16 - y };
    },
  });
  const colourOf = () => TEAM_COLOURS.find((c) => c.id === state.colour) ?? TEAM_COLOURS[0];
  const founderOf = () => FOUNDERS.find((f) => f.id === state.founderId);
  const ready = () => state.teamName.trim() && state.principal.trim();

  const randomTeam = () => (state.teamName = pick(TEAM_NAMES, state.teamName));
  const randomPrincipal = () => (state.principal = pick(PLAYER_NAMES, state.principal));
  const randomColour = () => (state.colour = pick(TEAM_COLOURS.map((c) => c.id), state.colour));
  const randomFounder = () => (state.founderId = pick(FOUNDERS.map((f) => f.id), state.founderId));
  const randomiseAll = () => {
    randomTeam();
    randomPrincipal();
    randomColour();
    randomFounder();
  };

  // Typing a name: a real text box over the field, so phones bring up their keyboard.
  function edit(field, contentRect, placeholder) {
    const r = panel.getRect();
    const rect = { x: r.x + contentRect.x, y: r.y + contentRect.y - panel.scrollY, w: contentRect.w, h: contentRect.h };
    textPrompt.open({ rect, value: state[field], maxLength: NAME_MAX, placeholder, onDone: (v) => (state[field] = v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)) });
  }

  // A button with the dice icon in front of its label.
  function diceButton(ctx, r, label, opts = {}) {
    if (!ctx) return;
    drawButton(ctx, r, '', opts);
    const size = Math.min(56, r.h - 44);
    ctx.font = font(S.button, true);
    const tw = Math.min(ctx.measureText(label).width, r.w - size - 60);
    const x0 = r.x + (r.w - (size + 16 + tw)) / 2;
    drawDice(ctx, x0 + size / 2, r.y + (r.h - 8) / 2, size);
    text(ctx, label, x0 + size + 16, r.y + (r.h - 8) / 2 + 1, { size: S.button, bold: true, color: C.textOnAction, baseline: 'middle', maxWidth: tw });
  }

  function field(ctx, r, value, placeholder) {
    if (!ctx) return;
    drawPanel(ctx, r, { fill: '#FFFFFF', stroke: C.outline, lineWidth: 4, radius: 24 });
    pressedLook(ctx, r, { radius: 24 });
    text(ctx, value || placeholder, r.x + 28, r.y + r.h / 2, { size: S.button, bold: !!value, color: value ? C.text : C.textFaint, baseline: 'middle', maxWidth: r.w - 56 });
  }

  function formPage(ctx, w) {
    let y = 0;
    const heading = (label) => {
      if (ctx) text(ctx, label, 8, y, { size: S.heading, bold: true, color: C.actionDark, maxWidth: w - 16 });
      y += 64;
    };
    if (ctx) text(ctx, `Slot ${slot}${ngLevel ? ` · New Game+ ${ngLevel}` : ''}${replacing ? ` · replaces ${replacing}` : ''}`, 8, y, { size: S.small, bold: true, color: replacing ? C.bad : C.textMuted, maxWidth: w - 16 });
    y += 50;
    const all = { x: 0, y, w, h: 130 };
    diceButton(ctx, all, 'RANDOMISE ALL', { accent: C.purple });
    hits.push({ rect: all, id: 'randomAll', onTap: randomiseAll });
    y += 160;

    // --- names ---
    const nameRow = (label, key, placeholder, onRandom, id) => {
      heading(label);
      const f = { x: 0, y, w: w - 264, h: 116 };
      const b = { x: w - 244, y, w: 244, h: 116 };
      field(ctx, f, state[key], placeholder);
      diceButton(ctx, b, 'Random', { accent: C.progress });
      hits.push({ rect: f, id: `${id}Field`, onTap: () => edit(key, f, placeholder) });
      hits.push({ rect: b, id: `${id}Random`, onTap: onRandom });
      y += 140;
    };
    nameRow('Team name', 'teamName', 'Tap to type a team name', randomTeam, 'team');
    nameRow(PLAYER_TITLE, 'principal', 'Tap to type your name', randomPrincipal, 'principal');
    if (ready()) {
      if (ctx) text(ctx, `${PLAYER_TITLE} ${state.principal} — ${state.teamName}`, 8, y, { size: S.body, bold: true, color: C.progress, maxWidth: w - 16 });
      y += 60;
    }
    y += 20;

    // --- colour ---
    heading('Team colour');
    const colour = colourOf();
    const prevH = 200;
    if (ctx) {
      drawPanel(ctx, { x: 0, y, w, h: prevH + 20 }, { fill: C.panelAlt, stroke: C.line, lineWidth: 3, radius: 24 });
      drawTeamBadge(ctx, { x: 30, y: y + 18, w: 160, h: 185 }, colour, initialsOf(state.teamName || 'RW'));
      assets.drawContained(ctx, liveryKey(assets, CLASSES.clubHatch.art, colour.id), { x: 220, y: y + 8, w: Math.min(w - 240, 420), h: prevH + 4 });
    }
    y += prevH + 44;
    const cw = (w - 2 * 18) / 3;
    TEAM_COLOURS.forEach((c, i) => {
      const r = { x: (i % 3) * (cw + 18), y: y + Math.floor(i / 3) * 150, w: cw, h: 130 };
      if (ctx) {
        const on = c.id === state.colour;
        drawPanel(ctx, r, { fill: c.main, stroke: on ? C.outline : c.dark, lineWidth: on ? 10 : 4, radius: 24 });
        ctx.fillStyle = C.chip;
        ctx.beginPath();
        ctx.roundRect(r.x + 14, r.y + r.h - 58, r.w - 28, 46, 23);
        ctx.fill();
        text(ctx, c.name, r.x + r.w / 2, r.y + r.h - 35, { size: S.small, bold: true, color: C.textOnDark, align: 'center', baseline: 'middle', maxWidth: r.w - 40 });
        pressedLook(ctx, r, { radius: 24 });
      }
      hits.push({ rect: r, id: `colour_${c.id}`, onTap: () => (state.colour = c.id) });
    });
    y += 300;
    const rc = { x: 0, y, w, h: 116 };
    diceButton(ctx, rc, 'Random colour', { accent: C.progress });
    hits.push({ rect: rc, id: 'colourRandom', onTap: randomColour });
    y += 160;

    // --- founder ---
    heading('Choose your Founding Team Member');
    y += para(ctx, 'Their founder perk is small and lasts the whole run, on top of their trait. The other two starters are picked to keep your first car viable.', 8, y, w - 16, { size: S.small, color: C.textMuted }) + 20;
    for (const f of FOUNDERS) {
      const d = staffDef(f.id);
      const on = f.id === state.founderId;
      const tx = 230;
      const tw = w - tx - 80;
      const perkH = para(null, f.perkText, 0, 0, tw, { size: S.small });
      const h = Math.max(270, 30 + 52 + 44 + 44 + perkH + 44 + 30);
      const r = { x: 0, y, w, h };
      if (ctx) {
        drawFounderFrame(ctx, r, on);
        pressedLook(ctx, r);
        assets.drawContained(ctx, d.art, { x: 24, y: y + 20, w: 190, h: h - 40 });
        let ty = y + 28;
        text(ctx, d.name, tx, ty, { size: S.heading, bold: true, maxWidth: tw });
        ty += 56;
        text(ctx, `${ROLES[d.role].name} · ${TRAITS[d.traits[0]].name}`, tx, ty, { size: S.small, bold: true, color: C.textMuted, maxWidth: tw });
        ty += 44;
        text(ctx, f.perkName, tx, ty, { size: S.small, bold: true, color: C.gold, maxWidth: tw });
        ty += 42;
        ty += para(ctx, f.perkText, tx, ty, tw, { size: S.small });
        text(ctx, `Starts with ${f.team.slice(1).map(firstName).join(' and ')}`, tx, ty + 8, { size: S.small, color: C.textMuted, maxWidth: tw });
      }
      hits.push({ rect: r, id: `founder_${f.id}`, onTap: () => (state.founderId = f.id) });
      y += h + 18;
    }
    const rf = { x: 0, y, w, h: 116 };
    diceButton(ctx, rf, 'Random founder', { accent: C.progress });
    hits.push({ rect: rf, id: 'founderRandom', onTap: randomFounder });
    y += 150;

    const next = { x: 0, y, w, h: 140 };
    if (ctx) {
      drawButton(ctx, next, ready() ? 'Next: check and start' : 'Name your team first', { disabled: !ready() });
    }
    hits.push({ rect: next, id: 'next', onTap: () => ready() && ((step = 'confirm'), (panel.scrollY = 0)) });
    y += 180;
    return y;
  }

  function confirmPage(ctx, w) {
    let y = 0;
    const colour = colourOf();
    const f = founderOf();
    const d = staffDef(f.id);
    if (ctx) {
      drawPanel(ctx, { x: 0, y, w, h: 260 }, { fill: C.panelAlt, stroke: C.line, lineWidth: 3, radius: 24 });
      drawTeamBadge(ctx, { x: 30, y: y + 22, w: 190, h: 220 }, colour, initialsOf(state.teamName));
      assets.drawContained(ctx, liveryKey(assets, CLASSES.clubHatch.art, colour.id), { x: 250, y: y + 14, w: Math.min(w - 270, 460), h: 232 });
    }
    y += 290;
    const row = (label, value, extra = null) => {
      if (ctx) text(ctx, label, 8, y, { size: S.small, bold: true, color: C.textMuted });
      y += 40;
      if (ctx) text(ctx, value, 8, y, { size: S.heading, bold: true, maxWidth: w - 16 });
      y += 60;
      if (extra) y += para(ctx, extra, 8, y, w - 16, { size: S.body }) + 10;
      y += 16;
    };
    row('Team', state.teamName);
    row(PLAYER_TITLE, state.principal, `${PLAYER_TITLE} ${state.principal} — ${state.teamName}`);
    // Founder with their portrait.
    const fr = { x: 0, y, w, h: 250 };
    if (ctx) {
      drawFounderFrame(ctx, fr, true);
      assets.drawContained(ctx, d.art, { x: 24, y: y + 16, w: 170, h: 218 });
      text(ctx, 'Founder', 220, y + 30, { size: S.small, bold: true, color: C.textMuted });
      text(ctx, d.name, 220, y + 72, { size: S.heading, bold: true, maxWidth: w - 300 });
      text(ctx, `${ROLES[d.role].name} · ${TRAITS[d.traits[0]].name}`, 220, y + 134, { size: S.body, color: C.text, maxWidth: w - 300 });
      text(ctx, `Starts with ${f.team.slice(1).map(firstName).join(' and ')}`, 220, y + 186, { size: S.small, color: C.textMuted, maxWidth: w - 300 });
    }
    y += 280;
    row('Founder Perk', f.perkName, f.perkText);
    // Colour with a swatch.
    if (ctx) {
      text(ctx, 'Colour', 8, y, { size: S.small, bold: true, color: C.textMuted });
      drawPanel(ctx, { x: 8, y: y + 44, w: 90, h: 56 }, { fill: colour.main, stroke: C.outline, lineWidth: 4, radius: 14 });
      text(ctx, colour.name, 120, y + 72, { size: S.heading, bold: true, baseline: 'middle' });
    }
    y += 130;
    if (replacing) {
      y += para(ctx, `Slot ${slot}: ${replacing} will be deleted.`, 8, y, w - 16, { size: S.body, bold: true, color: C.bad }) + 16;
    } else {
      if (ctx) text(ctx, `Saves in slot ${slot}`, 8, y, { size: S.small, color: C.textMuted });
      y += 50;
    }
    const start = { x: 0, y, w, h: 150 };
    if (ctx) drawButton(ctx, start, 'START TEAM', { accent: C.action });
    hits.push({ rect: start, id: 'start', onTap: () => onStart({ ...state, teamName: state.teamName.trim(), principal: state.principal.trim() }, slot) });
    y += 176;
    const back = { x: 0, y, w, h: 116 };
    if (ctx) drawButton(ctx, back, 'Change something', { accent: C.progress });
    hits.push({ rect: back, id: 'edit', onTap: () => (step = 'form') });
    y += 150;
    return y;
  }

  const layoutPage = (ctx, w) => {
    hits = [];
    return step === 'confirm' ? confirmPage(ctx, w) : formPage(ctx, w);
  };

  const screen = {
    panel,
    state,
    get step() {
      return step;
    },
    get slot() {
      return slot;
    },
    randomiseAll,
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
    enter(params = {}) {
      slot = params.slot ?? 1;
      replacing = params.replacing ?? null;
      ngLevel = params.ngLevel ?? 0;
      step = 'form';
      state.teamName = '';
      state.principal = '';
      state.colour = TEAM_COLOURS[0].id;
      state.founderId = FOUNDERS[1].id; // Tessa, the Milestone 1 lead, until the player picks
      panel.scrollY = 0;
    },
    exit() {
      textPrompt.close();
    },
    // Back: the confirmation returns to the form; the form returns to where it came from.
    onBack() {
      textPrompt.close();
      if (step === 'confirm') {
        step = 'form';
        return true;
      }
      return false;
    },
    onDragStart: (p) => panel.beginDrag(p),
    onDrag: (p) => panel.drag(p),
    onDragEnd: (p) => panel.endDrag(p),
    onWheel(p) {
      panel.scrollY += p.deltaY;
      panel.clamp();
    },
    onTap(p) {
      if (header.handleTap(p)) return;
      if (!panel.contains(p)) return;
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
      header.render(ctx, step === 'confirm' ? 'Ready to race?' : 'New team', () => (screen.onBack() ? null : onBack()));
    },
  };
  return screen;
}
