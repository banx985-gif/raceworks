// Save slots (Milestone 4b, spec §7): the four campaign slots. An occupied slot shows the team name, the Team
// Principal, the founder's portrait and name, Year / Month, rank, NG+ level, play time and the ending grade (when
// there is one); an empty slot shows NEW TEAM. Nothing is overwritten or deleted without an "are you sure".
//   createSlotsScreen({ layout, assets, header, slots: () => list, onPlay(n), onNewTeam(n), onDelete(n), onBack })
//   enter({ mode })   'load' (default): Play / Delete, empty → NEW TEAM
//                     'new': every slot is full — pick one to replace (Replace asks first, in main.js)
//                     'ngplus' + parent: (Milestone 28 hook) the parent run is locked and can't be picked; NG+ must
//                     ask for a slot and never write over its parent (spec §8)
// Milestone 27: a finished run's card says "Year 17 · ended Grade A" and has a New Game+ button (onNgPlus: the stub
// screen); the load list starts with the Hall of Runs (onHall).
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text } from '../../../../core/ui/Kit.js';
import { TEAM_COLOURS, PLAYER_TITLE, SLOT_COUNT } from '../../data/setup.js';
import { drawSlotFrame, drawTeamBadge, initialsOf } from '../ui/setupArt.js';

const C = THEME.color;
const S = THEME.size;

export function playTimeText(sec = 0) {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} m` : `${m} min`;
}

export function createSlotsScreen({ layout, assets, header, slots, onPlay, onNewTeam, onReplace, onDelete, onBack, onHall = null, onNgPlus = null }) {
  let mode = 'load';
  let parent = null;
  let hits = [];
  const panel = new ScrollPanel({
    getRect: () => {
      const hr = header.rect();
      const sr = layout.safeRect;
      const y = hr.y + hr.h + 16;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 16 - y };
    },
  });
  const title = () => (mode === 'new' ? 'Choose a slot to replace' : mode === 'ngplus' ? 'New Game+ — choose a slot' : 'Save slots');

  function layoutPage(ctx, w) {
    hits = [];
    let y = 8;
    if (mode === 'new' || mode === 'ngplus') {
      const note = mode === 'new' ? 'All four slots are full. The team in the slot you pick will be deleted.' : 'Your finished run stays as it is.';
      if (ctx) text(ctx, note, 8, y, { size: S.body, bold: true, color: C.actionDark, maxWidth: w - 16 });
      y += 64;
    }
    if (mode === 'load' && onHall) {
      const b = { x: 0, y, w, h: 120 };
      if (ctx) drawButton(ctx, b, 'Hall of Runs', { accent: C.gold });
      hits.push({ rect: b, id: 'hall', onTap: () => onHall() });
      y += 120 + 24;
    }
    const list = slots() ?? [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = list[i] ?? { n: i + 1, empty: true };
      y += slotCard(ctx, s, 0, y, w) + 24;
    }
    return y + 20;
  }

  function slotCard(ctx, s, x, y, w) {
    const pad = 46;
    if (s.empty) {
      const h = 240;
      if (ctx) {
        drawSlotFrame(ctx, { x, y, w, h }, null);
        text(ctx, `Slot ${s.n} · empty`, x + pad, y + 26, { size: S.small, bold: true, color: C.textMuted });
      }
      const b = { x: x + pad, y: y + 84, w: w - 2 * pad, h: 124 };
      if (ctx) drawButton(ctx, b, 'NEW TEAM');
      hits.push({ rect: b, id: `new_${s.n}`, onTap: () => onNewTeam(s.n) });
      return h;
    }
    if (s.error || !s.summary) {
      const h = 250;
      if (ctx) {
        drawSlotFrame(ctx, { x, y, w, h }, null);
        text(ctx, `Slot ${s.n}`, x + pad, y + 26, { size: S.small, bold: true, color: C.textMuted });
        text(ctx, 'This save will not read.', x + pad, y + 70, { size: S.body, bold: true, color: C.bad, maxWidth: w - 2 * pad });
      }
      const b = { x: x + pad, y: y + 124, w: w - 2 * pad, h: 110 };
      if (ctx) drawButton(ctx, b, 'Delete', { accent: C.bad });
      hits.push({ rect: b, id: `delete_${s.n}`, onTap: () => onDelete(s.n, s) });
      return h;
    }
    const d = s.summary;
    const colour = TEAM_COLOURS.find((c) => c.id === d.colour) ?? TEAM_COLOURS[0];
    const ngRow = mode === 'load' && d.ended && onNgPlus; // Milestone 27: a finished run can start New Game+
    const h = ngRow ? 610 : 470;
    const locked = mode === 'ngplus' && parent === s.n;
    const portrait = { x: x + pad, y: y + 30, w: 190, h: 240 };
    const tx = portrait.x + portrait.w + 30;
    const tw = w - (tx - x) - 30;
    if (ctx) {
      drawSlotFrame(ctx, { x, y, w, h }, colour);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(portrait.x, portrait.y, portrait.w, portrait.h, 20);
      ctx.fillStyle = C.panelAlt;
      ctx.fill();
      ctx.clip();
      if (d.founderArt) assets.drawContained(ctx, d.founderArt, { x: portrait.x + 6, y: portrait.y + 6, w: portrait.w - 12, h: portrait.h - 12 });
      ctx.restore();
      drawTeamBadge(ctx, { x: portrait.x + portrait.w - 70, y: portrait.y + portrait.h - 70, w: 86, h: 100 }, colour, initialsOf(d.teamName));
      let ty = y + 26;
      text(ctx, `Slot ${s.n}${locked ? ' · parent run, kept' : ''}`, tx, ty, { size: S.small, bold: true, color: C.textMuted, maxWidth: tw });
      ty += 42;
      text(ctx, d.teamName, tx, ty, { size: S.heading, bold: true, maxWidth: tw });
      ty += 62;
      const lines = [
        `${PLAYER_TITLE} ${d.principal}`,
        `Founder: ${d.founderName}`,
        d.ended ? `Year ${d.year} · ended Grade ${d.grade} · Rank ${d.rank} · NG+ ${d.ngPlus}` : `Year ${d.year} · Month ${d.month} · Rank ${d.rank} · NG+ ${d.ngPlus}`,
        `Played ${playTimeText(d.playSeconds)}${d.worldCrown ? ' · World Champions' : ''}`,
      ];
      for (const l of lines) {
        text(ctx, l, tx, ty, { size: S.small, bold: l.startsWith('Year'), color: C.text, maxWidth: tw });
        ty += 44;
      }
    }
    const by = y + h - 150 - (ngRow ? 140 : 0);
    if (ngRow) {
      const nb = { x: x + pad, y: by + 140, w: w - 2 * pad, h: 120 };
      if (ctx) drawButton(ctx, nb, 'Start New Game+', { accent: C.purple });
      hits.push({ rect: nb, id: `ngplus_${s.n}`, onTap: () => onNgPlus(s.n, s) });
    }
    const del = { x: x + w - pad - 250, y: by, w: 250, h: 120 };
    const main = { x: x + pad, y: by, w: del.x - 24 - (x + pad), h: 120 };
    if (mode === 'load') {
      if (ctx) drawButton(ctx, main, 'Play');
      hits.push({ rect: main, id: `play_${s.n}`, onTap: () => onPlay(s.n) });
    } else {
      if (ctx) drawButton(ctx, main, locked ? 'Kept' : 'Replace', { disabled: locked, accent: C.warn });
      if (!locked) hits.push({ rect: main, id: `replace_${s.n}`, onTap: () => onReplace(s.n, s) });
    }
    if (ctx) drawButton(ctx, del, 'Delete', { accent: C.bad, disabled: locked });
    if (!locked) hits.push({ rect: del, id: `delete_${s.n}`, onTap: () => onDelete(s.n, s) });
    return h;
  }

  return {
    panel,
    get mode() {
      return mode;
    },
    title,
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
      mode = params.mode ?? 'load';
      parent = params.parent ?? null;
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
      if (header.handleTap(p)) return;
      if (!panel.contains(p)) return;
      layoutPage(null, panel.getRect().w);
      const q = panel.toContent(p);
      hits.find((x) => hitRect(q, x.rect))?.onTap();
    },
    render(ctx) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const w = panel.getRect().w;
      panel.contentHeight = layoutPage(null, w);
      panel.begin(ctx);
      layoutPage(ctx, w);
      panel.end(ctx);
      header.render(ctx, title(), onBack);
    },
  };
}
