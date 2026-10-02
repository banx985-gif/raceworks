// The Hall of Runs (Milestone 27): every finished run on this device (core/RunArchive in the account save, newest first),
// reached from the save-slot screen. Each card: the team, its grade and the seven areas, the titles, a few highlights,
// the secrets it found (a count only — the archive is after an ending), play time and the Prestige Tokens it earned.
//   createHallOfRunsScreen({ layout, header, assets, archive: () => entries, onBack })
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { text, para } from '../../../../core/ui/Kit.js';
import { TEAM_COLOURS } from '../../data/setup.js';
import { ENDING_TEXT as T } from '../../data/ending.js';
import { drawSlotFrame, drawTeamBadge, initialsOf } from '../ui/setupArt.js';
import { playTimeText } from './SlotsScreen.js';

const C = THEME.color;
const S = THEME.size;

export function createHallOfRunsScreen({ layout, header, archive, onBack }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const hr = header.rect();
      const sr = layout.safeRect;
      const y = hr.y + hr.h + 16;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 16 - y };
    },
  });

  function runCard(ctx, e, x, y, w) {
    const pad = 40;
    const colour = TEAM_COLOURS.find((c) => c.id === e.colour) ?? TEAM_COLOURS[0];
    const lines = [
      { t: `Grade ${e.grade.band} · ${e.grade.total} / 1000${e.worldCrown ? ' · World Champions' : ''}`, bold: true, color: e.worldCrown ? C.gold : C.text },
      { t: `Founder ${e.founderName || '—'} · ended Year ${e.endedYear} · played ${playTimeText(e.playSeconds)}` },
      { t: e.titles.length ? `Titles: ${e.titles.map((x) => x.name).join(', ')}` : 'No titles this run' },
      { t: e.areas.map((a) => `${a.name} ${a.score}/${a.max}`).join(' · '), color: C.textMuted },
      ...e.highlights.slice(0, 3).map((h) => ({ t: `${h.title}: ${h.line}`, color: C.textMuted })),
      { t: `${e.secretsFound} secret${e.secretsFound === 1 ? '' : 's'} found · +${e.tokens} Prestige Token${e.tokens === 1 ? '' : 's'}`, color: C.purple, bold: true },
    ];
    const tw = w - 2 * pad - 140;
    let h = 130;
    for (const l of lines) h += para(null, l.t, 0, 0, tw, { size: S.small, bold: !!l.bold }) + 10;
    h = Math.max(h + 30, 300);
    if (ctx) {
      drawSlotFrame(ctx, { x, y, w, h }, colour);
      drawTeamBadge(ctx, { x: x + w - pad - 110, y: y + 30, w: 100, h: 116 }, colour, initialsOf(e.team));
      text(ctx, e.team, x + pad, y + 30, { size: S.heading, bold: true, maxWidth: tw });
      let ty = y + 110;
      for (const l of lines) ty += para(ctx, l.t, x + pad, ty, tw, { size: S.small, bold: !!l.bold, color: l.color ?? C.text }) + 10;
    }
    return h;
  }

  function layoutPage(ctx, w) {
    const list = archive() ?? [];
    let y = 8;
    if (!list.length) {
      y += para(ctx, T.hallEmpty, 8, y, w - 16, { size: S.body, color: C.textMuted }) + 20;
      return y;
    }
    for (const e of list) y += runCard(ctx, e, 0, y, w) + 24;
    return y + 20;
  }

  return {
    panel,
    title: () => T.hall,
    enter() {
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
      header.handleTap(p);
    },
    render(ctx) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const w = panel.getRect().w;
      panel.contentHeight = layoutPage(null, w);
      panel.begin(ctx);
      layoutPage(ctx, w);
      panel.end(ctx);
      header.render(ctx, T.hall, onBack);
    },
  };
}
