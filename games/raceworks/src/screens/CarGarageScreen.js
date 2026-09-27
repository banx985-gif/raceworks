// Car Garage (Milestone 4): every finished car, newest first, with its picture, Quality and Rating.
// Reached from the Build sheet (and the Pit Bay sheet). Tap a car → its result screen.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { text, listRow, listRowHeight } from '../../../../core/ui/Kit.js';

const C = THEME.color;
const S = THEME.size;

export const carRow = (rec) => ({
  art: rec.result.art,
  title: rec.name,
  lines: [
    { text: `Quality ${rec.result.quality} · Rating ${rec.result.rating} · ${rec.result.faults} open fault${rec.result.faults === 1 ? '' : 's'}`, bold: true },
    { text: `${rec.days} game days to build · finished day ${rec.result.finishedDay + 1}`, size: S.small, color: C.textMuted },
  ],
  right: `Q ${rec.result.quality}`,
  rightColor: C.progress,
  artSize: 170,
});

export function createCarGarageScreen({ layout, assets, team, topBar, goCar }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let rows = []; // [{ number, rect }]
  const cars = () => [...team.cars.cars.list()].reverse();

  function layoutPage(ctx, w) {
    rows = [];
    let y = 0;
    if (ctx) {
      text(ctx, 'Car Garage', 8, y, { size: S.title, bold: true });
      text(ctx, `${team.cars.cars.list().length} finished car${team.cars.cars.list().length === 1 ? '' : 's'}`, 8, y + 76, { size: S.small, color: C.textMuted });
    }
    y += 130;
    const list = cars();
    if (!list.length && ctx) text(ctx, 'No cars yet — start one at the Pit Bay (Build → Pit Bay → New car).', 8, y, { size: S.body, color: C.textMuted, maxWidth: w - 16 });
    for (const rec of list) {
      const row = carRow(rec);
      const h = listRowHeight(w, row);
      const r = { x: 0, y, w, h };
      if (ctx) listRow(ctx, assets, r, row);
      rows.push({ number: rec.number, rect: r });
      y += h + 16;
    }
    return y + 30;
  }

  return {
    panel,
    rowRect(number) {
      layoutPage(null, panel.getRect().w);
      const row = rows.find((x) => x.number === number);
      if (!row) return null;
      const r = panel.getRect();
      return { x: r.x + row.rect.x, y: r.y + row.rect.y - panel.scrollY, w: row.rect.w, h: row.rect.h };
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
      const q = panel.toContent(p);
      const row = rows.find((x) => q.y >= x.rect.y && q.y <= x.rect.y + x.rect.h);
      if (row) goCar(row.number);
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
