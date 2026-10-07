// The pre-race card (Milestone 6): the track's scenery picture (only a backdrop — never the racing surface, bible
// §23.1), the circuit facts, your car and driver, the grid (every car has a named driver), and Start race.
// Milestone 6 has no qualifying: the grid is a seeded draw, fixed with the race.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { TRACKS, geoOf } from '../race/tracks.js';
import { drawMinimap } from '../race/trackDraw.js';

const C = THEME.color;
const S = THEME.size;

export function createRaceIntroScreen({ layout, assets, team, topBar, onStart }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let hits = [];

  function layoutPage(ctx, w) {
    hits = [];
    const race = team.races.current;
    if (!race) return 0;
    const track = TRACKS[race.trackId];
    const geo = geoOf(race.trackId);
    let y = 0;
    // header: the scenery picture with the circuit map beside it
    const headH = 420;
    if (ctx) {
      drawPanel(ctx, { x: 0, y, w, h: headH }, { fill: C.panel, stroke: C.line, radius: THEME.panel.radius });
      assets.drawContained(ctx, track.artKey, { x: 16, y: y + 16, w: w * 0.58, h: headH - 32 });
      drawMinimap(ctx, geo, { x: w * 0.6 + 8, y: y + 16, w: w * 0.4 - 24, h: headH - 32 });
    }
    y += headH + 24;
    if (ctx) text(ctx, track.name, 8, y, { size: S.title, bold: true, maxWidth: w - 16 });
    y += 76;
    const player = race.entries.find((e) => e.isPlayer);
    const lines = [
      `${track.profile} · ${(geo.length / 1000).toFixed(2)} km · ${track.turns.length} turns · ${race.laps} laps · ${track.condition}`,
      track.identity,
      `Your car: ${player.carName} · driver ${player.name} (Racecraft ${player.ratings.racecraft}) · Condition ${player.condition}`,
      'Test race: no prize money yet — weekends with practice, qualifying and prizes come next.',
    ];
    for (const l of lines) y += para(ctx, l, 8, y, w - 16, { size: S.body, color: C.text }) + 10;
    y += 16;
    if (ctx) text(ctx, 'Starting grid', 8, y, { size: S.heading, bold: true, color: C.actionDark });
    y += 62;
    const byId = Object.fromEntries(race.entries.map((e) => [e.id, e]));
    race.grid.forEach((id, i) => {
      const e = byId[id];
      const r = { x: 0, y, w, h: 72 };
      if (ctx) {
        drawPanel(ctx, r, { fill: e.isPlayer ? C.panelGold : i % 2 ? C.panelAlt : C.panel, stroke: e.isPlayer ? C.gold : C.line, lineWidth: 2, radius: 14 });
        ctx.fillStyle = e.colour;
        ctx.fillRect(r.x + 12, r.y + 14, 12, r.h - 28);
        text(ctx, `P${i + 1}`, 40, y + 18, { size: S.body, bold: true });
        text(ctx, e.name, 130, y + 18, { size: S.body, bold: e.isPlayer, maxWidth: w * 0.42 });
        text(ctx, e.team, w - 16, y + 22, { size: S.small, color: C.textMuted, align: 'right', maxWidth: w * 0.4 });
      }
      y += 80;
    });
    y += 20;
    const b = { x: 0, y, w, h: 130 };
    if (ctx) drawButton(ctx, b, race.state ? 'Continue race' : 'Start race');
    hits.push({ rect: b, id: 'start', onTap: onStart });
    return y + 160;
  }

  return {
    panel,
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
