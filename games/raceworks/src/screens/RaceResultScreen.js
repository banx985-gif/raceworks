// A race result (Milestone 6): the finishing order with gaps, best laps, grid → finish, retirements, the fastest
// lap, and what the race did to your car (Condition, repaired in the Car Garage). enter({ index }) shows
// team.races.history[index] (default: the latest).
// Milestone 8: every row shows the car's showcase picture — the same family as its race sprite (data/cars.js
// CAR_FAMILIES), yours in the team colour.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { TRACKS } from '../race/tracks.js';
import { raceClock } from './RaceScreen.js';
import { CLASSES, CAR_FAMILIES } from '../../data/cars.js';
import { RIVAL_TEAMS, PRIVATEERS } from '../../data/rivals.js';
import { liveryKey, teamColourId } from '../ui/livery.js';

const C = THEME.color;
const S = THEME.size;
const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export function createRaceResultScreen({ layout, assets, team, topBar, goGarage, goCar, extraLines = () => [] }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let index = null;
  let hits = [];
  // A row's car picture: the player's class, a rival team's family (by driver), or a privateer's.
  const familyOfRow = (r) => Object.values(RIVAL_TEAMS).find((t) => t.drivers.some((d) => d.id === r.id))?.family ?? PRIVATEERS.find((p) => p.id === r.id)?.family ?? null;
  const carPicture = (r, e) => {
    if (r.isPlayer) return liveryKey(assets, CLASSES[team.cars.cars.get(e.carNumber)?.result.classId]?.art ?? CLASSES.clubHatch.art, teamColourId(team));
    const fam = familyOfRow(r);
    return fam ? CAR_FAMILIES[fam].showcase : null;
  };
  const entry = () => (index === null ? team.races.last() : team.races.history[index]) ?? null;

  function layoutPage(ctx, w) {
    hits = [];
    const e = entry();
    if (!e) return 0;
    const res = e.result;
    const me = res.rows.find((r) => r.isPlayer);
    let y = 0;
    const headH = 250;
    if (ctx) {
      const podium = me && me.pos <= 3 && me.status === 'finished';
      drawPanel(ctx, { x: 0, y, w, h: headH }, { fill: podium ? C.panelGold : C.panel, stroke: podium ? C.gold : C.line, lineWidth: podium ? 5 : 3, radius: THEME.panel.radius });
      text(ctx, 'Race result', 32, y + 24, { size: S.body, bold: true, color: C.textMuted });
      text(ctx, me ? (me.status === 'retired' ? 'Retired' : `${ordinal(me.pos)} of ${res.rows.length}`) : '—', 32, y + 70, { size: 96, bold: true });
      text(ctx, `${TRACKS[e.trackId].name} · ${e.laps} laps`, 32, y + 186, { size: S.small, color: C.textMuted, maxWidth: w - 64 });
    }
    y += headH + 24;
    const fl = res.fastestLap ? res.rows.find((r) => r.id === res.fastestLap.id) : null;
    const lines = [];
    if (me) lines.push({ text: `${me.name}: started P${me.grid}, finished ${me.status === 'retired' ? 'DNF' : `P${me.pos}`}${me.best ? ` · best lap ${raceClock(me.best)}` : ''}`, color: C.actionDark });
    if (fl) lines.push({ text: `Fastest lap: ${fl.name} ${raceClock(res.fastestLap.time)}`, color: C.purple });
    const rec = team.cars.cars.get(e.carNumber);
    lines.push({ text: `Your car ${rec?.name ?? ''}: Condition −${e.wear}${rec ? ` → ${rec.condition}` : ''} (repair it in the Car Garage)`, color: e.wear ? C.bad : C.text });
    lines.push(...extraLines(e));
    for (const l of lines) y += para(ctx, l.text, 8, y, w - 16, { size: S.body, color: l.color ?? C.text }) + 10;
    y += 16;
    for (const r of res.rows) {
      const box = { x: 0, y, w, h: 96 };
      if (ctx) {
        drawPanel(ctx, box, { fill: r.isPlayer ? C.panelGold : r.pos % 2 ? C.panel : C.panelAlt, stroke: r.isPlayer ? C.gold : C.line, lineWidth: 2, radius: 14 });
        text(ctx, r.status === 'retired' ? 'DNF' : `${r.pos}`, 24, y + 26, { size: S.heading, bold: true, color: r.pos <= 3 && r.status === 'finished' ? C.gold : C.text });
        const pic = carPicture(r, e);
        if (pic) assets.drawContained(ctx, pic, { x: 92, y: y + 6, w: 130, h: 84 });
        text(ctx, r.name, 236, y + 12, { size: S.body, bold: r.isPlayer, maxWidth: w - 236 - 190 });
        text(ctx, `${r.team} · grid P${r.grid}${r.best ? ` · best ${raceClock(r.best)}` : ''}${r.fails.length ? ' · trouble' : ''}`, 236, y + 56, { size: S.small, color: C.textMuted, maxWidth: w - 236 - 20 });
        text(ctx, r.pos === 1 && r.time ? raceClock(r.time) : r.gap, w - 20, y + 12, { size: S.body, bold: true, align: 'right' }); // on the name line, clear of the team line
      }
      y += 104;
    }
    y += 20;
    const half = (w - 20) / 2;
    const g = { x: 0, y, w: half, h: 124 };
    const c = { x: half + 20, y, w: half, h: 124 };
    if (ctx) {
      drawButton(ctx, g, 'Garage');
      drawButton(ctx, c, 'Your car', { accent: C.progress });
    }
    hits.push({ rect: g, id: 'garage', onTap: goGarage });
    hits.push({ rect: c, id: 'car', onTap: () => goCar(e.carNumber) });
    return y + 160;
  }

  return {
    panel,
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
      index = params.index ?? null;
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
