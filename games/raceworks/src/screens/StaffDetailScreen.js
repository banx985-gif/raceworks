// Staff detail (Milestone 3): one person, opened from a roster card or a worker's sheet in the garage.
//   Header: portrait and role badge, name, role · level · tier · statuses, XP, Energy and Morale, what they're doing.
//   Driver: two tabs — the six derived driver ratings shown big (bible §10.3), and the five work stats.
//   Everyone else: the five work stats.
//   Then traits (with any rating bonuses) and salary. With ?debug=1: nudge buttons (a stat, Energy, Morale) —
//   the ratings recalculate straight away.
// Milestone 12: Train (the Training screen with them picked) and Let go (asks first; not while on the car's team or a
// course; the founder can be let go but never comes back).
// Milestone 13: each trait card lists what it does (ratings, work effects, what waits for a later milestone), and a
// Career panel shows races, wins, podiums, cars built and years here (the founder's flag under it).
// enter({ id, from }) — from: 'roster' | 'garage' (where ‹ Back goes). Drag to scroll.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel, tabRects, drawTabs } from '../../../../core/ui/Kit.js';
import { STAT_KEYS, STAT_NAMES, ROLES, TRAITS, DRIVER_RATINGS } from '../../data/staff.js';
import { statusIconsOf } from '../ui/statusIcons.js';
import { staffLine } from '../ui/garageMenus.js';
import { traitLines } from '../systems/staffTraits.js';
import { ITEM_RULES, itemTypeById, itemGroupById } from '../../data/items.js'; // Milestone 25b

const C = THEME.color;
const S = THEME.size;
const TABS = [
  { id: 'ratings', label: 'Driver ratings' },
  { id: 'stats', label: 'Work stats' },
];
const RATING_NAME = Object.fromEntries(DRIVER_RATINGS.map((r) => [r.id, r.name]));

// Milestone 25b: giveItem(id) opens the Parts Store picker for this person (the 'giveTo' sheet).
export function createStaffDetailScreen({ layout, assets, team, garage, topBar, debugEnabled = false, goTrain = () => {}, confirm = null, toast = () => {}, afterLetGo = () => {}, giveItem = () => {} }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let id = null;
  let tab = 'ratings';
  let hits = []; // [{ rect (content), onTap }] from the last layout

  const person = () => team.get(id);

  // Lays the page out (content coordinates). With ctx it also draws; without, it only measures and records taps.
  function layoutPage(ctx, w) {
    const s = person();
    hits = [];
    if (!s) return 0;
    const driver = team.isDriver(s);
    let y = 0;

    // --- header ---
    const headH = 470;
    if (ctx) drawPanel(ctx, { x: 0, y, w, h: headH }, { radius: THEME.panel.radius });
    const pr = { x: 24, y: y + 24, w: 300, h: headH - 48 };
    if (ctx) {
      ctx.fillStyle = C.panelAlt;
      ctx.beginPath();
      ctx.roundRect(pr.x, pr.y, pr.w, pr.h, 22);
      ctx.fill();
      assets.drawContained(ctx, s.art, { x: pr.x + 10, y: pr.y + 10, w: pr.w - 20, h: pr.h - 20 }, 'bottom');
      assets.drawContained(ctx, ROLES[s.role].badge, { x: pr.x - 8, y: pr.y - 8, w: 96, h: 96 });
    }
    const tx = pr.x + pr.w + 32;
    const tw = w - tx - 24;
    let ty = y + 30;
    if (ctx) {
      text(ctx, s.name, tx, ty, { size: S.title, bold: true, maxWidth: tw });
      text(ctx, staffLine(s), tx, ty + 70, { size: S.body, color: C.textMuted, maxWidth: tw });
    }
    ty += 130;
    const xpMax = team.staff.xpNeeded(s.level);
    const barRow = (label, value, max, color, right) => {
      if (ctx) {
        text(ctx, label, tx, ty, { size: S.small, bold: true, color: C.textMuted });
        bar(ctx, tx + 130, ty + 4, tw - 130 - 110, 26, value / max, color);
        text(ctx, right, tx + tw, ty, { size: S.small, bold: true, align: 'right' });
      }
      ty += 50;
    };
    barRow('XP', s.xp, xpMax, C.purple, `${Math.round(s.xp)} / ${xpMax}`);
    barRow('Energy', s.energy, 100, s.status.tired ? C.bad : C.good, String(Math.round(s.energy)));
    barRow('Morale', s.morale, 100, s.status.stressed ? C.bad : C.progress, String(Math.round(s.morale)));
    if (ctx) {
      let ix = tx;
      for (const key of statusIconsOf(s)) {
        assets.drawContained(ctx, key, { x: ix, y: ty, w: 52, h: 52 });
        ix += 60;
      }
      para(ctx, `Now: ${garage.stateText(s.id)}`, ix, ty + 8, tx + tw - ix, { size: S.body, color: C.actionDark, maxLines: 2 });
    }
    y += headH + 28;

    // --- ratings / stats ---
    if (driver) {
      const rects = tabRects({ x: 0, y, w, h: 110 }, TABS.length);
      if (ctx) drawTabs(ctx, rects, TABS, tab);
      rects.forEach((r, i) => hits.push({ rect: r, id: `tab_${TABS[i].id}`, onTap: () => (tab = TABS[i].id) }));
      y += 110 + 24;
    }
    if (driver && tab === 'ratings') {
      const ratings = team.ratingsOf(s);
      const colW = (w - 24) / 2;
      const tileH = 200;
      DRIVER_RATINGS.forEach((r, i) => {
        const x = (i % 2) * (colW + 24);
        const ry = y + Math.floor(i / 2) * (tileH + 24);
        if (ctx) {
          drawPanel(ctx, { x, y: ry, w: colW, h: tileH }, { fill: C.panelInfo, stroke: C.progress, lineWidth: 4, radius: THEME.panel.radius });
          text(ctx, r.name, x + 28, ry + 22, { size: S.body, bold: true, color: C.textMuted, maxWidth: colW - 56 });
          text(ctx, String(ratings[r.id]), x + 28, ry + 70, { size: 96, bold: true, color: C.text });
          text(ctx, Object.keys(r.weights).join(' · '), x + colW - 28, ry + tileH - 26, { size: S.small, color: C.textFaint, align: 'right', baseline: 'bottom' });
        }
      });
      y += 3 * (tileH + 24) + 4;
    } else {
      const rowH = 92;
      for (const k of STAT_KEYS) {
        if (ctx) {
          text(ctx, `${STAT_NAMES[k]} (${k})`, 8, y + 10, { size: S.body, bold: true, maxWidth: 380 });
          bar(ctx, 410, y + 16, w - 410 - 140, 30, s.stats[k] / team.staff.statCap(s, k), C.progress);
          text(ctx, String(s.stats[k]), w - 8, y + 6, { size: S.heading, bold: true, align: 'right' });
        }
        y += rowH;
      }
      if (ctx) text(ctx, `Top of the range for a ${ROLES[s.role].name.toLowerCase()} of this tier: ${team.staff.statCap(s)}`, 8, y, { size: S.small, color: C.textMuted });
      y += 60;
    }

    // --- traits and salary ---
    if (ctx) text(ctx, 'Traits', 8, y, { size: S.heading, bold: true, color: C.actionDark });
    y += 64;
    // Milestone 13: what each trait does (src/systems/staffTraits.js traitLines) — ratings (drivers), work effects and
    // anything still waiting for a later milestone.
    if (!s.traits.length && ctx) text(ctx, 'No trait', 8, y, { size: S.body, color: C.textMuted });
    if (!s.traits.length) y += 60;
    for (const t of s.traits) {
      const def = TRAITS[t];
      const effects = traitLines(t, { ratingNames: RATING_NAME }).filter((l) => driver || !l.startsWith('Ratings'));
      const lines = [def?.text ?? '', ...effects].filter(Boolean);
      const body = lines.reduce((h, l) => h + para(null, l, 0, 0, w - 56, { size: S.body }), 0);
      const cardH = 80 + body + 20;
      if (ctx) {
        drawPanel(ctx, { x: 0, y, w, h: cardH }, { radius: THEME.panel.radius });
        text(ctx, `${def?.name ?? t}${def?.signature ? ' · signature' : ''}`, 28, y + 22, { size: S.body, bold: true, color: C.purple });
        let ly = y + 74;
        for (const l of lines) ly += para(ctx, l, 28, ly, w - 56, { size: S.body, color: l.startsWith('Later') ? C.textMuted : l === def?.text ? C.text : C.actionDark });
      }
      y += cardH + 16;
    }
    y += 12;

    // --- Milestone 13: career record (src/systems/careers.js) ---
    {
      const r = team.careers.of(s.id);
      const years = team.careers.years(s.id);
      const cells = [
        ['Races', r.races],
        ['Wins', r.wins],
        ['Podiums', r.podiums],
        ['Cars built', r.carsBuilt],
        ['Years here', years < 1 ? years.toFixed(1) : years.toFixed(1).replace(/\.0$/, '')],
      ];
      if (ctx) text(ctx, 'Career', 8, y, { size: S.heading, bold: true, color: C.actionDark });
      y += 64;
      const cw = (w - 16 * 2) / 3;
      const ch = 150;
      cells.forEach(([label, v], i) => {
        const r2 = { x: (i % 3) * (cw + 16), y: y + Math.floor(i / 3) * (ch + 16), w: cw, h: ch };
        if (ctx) {
          drawPanel(ctx, r2, { radius: THEME.panel.radius });
          text(ctx, label, r2.x + r2.w / 2, r2.y + 18, { size: S.small, bold: true, color: C.textMuted, align: 'center', maxWidth: r2.w - 20 });
          text(ctx, String(v), r2.x + r2.w / 2, r2.y + 62, { size: S.title, bold: true, align: 'center' });
        }
      });
      y += 2 * (ch + 16) + 8;
      if (team.isFounder(s.id)) {
        if (ctx) para(ctx, `${team.founder.flag ?? 'Founding Team Member'}${team.founder.history?.continuous ? ' · here since day 1' : ''}`, 8, y, w - 16, { size: S.small, bold: true, color: C.purple });
        y += 60;
      }
    }
    y += 12;

    // --- Milestone 25b: items (series common feature §4) — what they love, what they were given, Give an item ---
    if (team.items) {
      const lk = team.items.likesOf(s.id);
      const got = team.items.receivedBy(s.id);
      const gname = (g) => itemGroupById(g)?.name ?? g;
      const lines = [
        `Loves: ${lk.loves.map(gname).join(' and ') || '—'} kit${lk.dislike ? ` · not keen on ${gname(lk.dislike)}` : ''}`,
        got.length ? `Items received: ${got.length} — ${got.slice(-3).map((g) => `${itemTypeById(g.type)?.name ?? g.type} (+${g.gain} ${g.stat})`).join(', ')}` : 'Items received: none yet',
        `Item points left this season: ${team.items.pointsLeft(s.id)} of ${ITEM_RULES.periodCap}`,
      ];
      if (ctx) text(ctx, 'Equipment', 8, y, { size: S.heading, bold: true, color: C.actionDark });
      y += 64;
      lines.forEach((l, i) => {
        const h = para(null, l, 0, 0, w - 16, { size: S.body });
        if (ctx) para(ctx, l, 8, y, w - 16, { size: S.body, color: i === 0 ? C.good : C.text });
        y += h + 8;
      });
      const gb = { x: 0, y: y + 8, w, h: 120 };
      if (ctx) drawButton(ctx, gb, `Give an item (${team.items.count} in the ${ITEM_RULES.storeName})`, { accent: C.good, disabled: !team.items.count });
      hits.push({ rect: gb, id: 'giveItem', onTap: () => (team.items.count ? giveItem(s.id) : toast(`The ${ITEM_RULES.storeName} is empty`, 'Items come from races, sponsors, contracts and great training')) });
      y += 148;
    }
    if (ctx) {
      text(ctx, 'Salary', 8, y, { size: S.heading, bold: true, color: C.actionDark });
      text(ctx, `${s.salary.toLocaleString('en-US')} Credits a month`, w - 8, y + 4, { size: S.body, bold: true, align: 'right' });
    }
    y += 80;

    // --- Milestone 12: train / let go ---
    {
      const bw = (w - 24) / 2;
      const tr = { x: 0, y, w: bw, h: 120 };
      const lg = { x: bw + 24, y, w: bw, h: 120 };
      const course = team.training.courseOf(s.id);
      const why = team.recruitment.letGoWhy(s.id);
      if (ctx) {
        drawButton(ctx, tr, course ? `On ${course.name} (${team.training.daysLeft(s.id)}d)` : 'Train', { accent: C.progress });
        drawButton(ctx, lg, 'Let go', { accent: C.bad, disabled: !!why });
      }
      hits.push({ rect: tr, id: 'train', onTap: () => goTrain(s.id) });
      hits.push({ rect: lg, id: 'letGo', onTap: () => (why ? toast(why) : askLetGo(s)) });
      y += 140;
      if (why && ctx) para(ctx, `Let go: ${why}`, 8, y, w - 16, { size: S.small, color: C.textMuted });
      if (why) y += 60;
    }

    // --- debug nudges (?debug=1) ---
    if (debugEnabled) {
      const main = ROLES[s.role].primaryStat;
      const nudges = [
        [`${main} +10`, main, 10],
        [`${main} −10`, main, -10],
        ['Energy −30', 'energy', -30],
        ['Energy +30', 'energy', 30],
        ['Morale −30', 'morale', -30],
        ['Morale +30', 'morale', 30],
      ];
      if (ctx) text(ctx, 'Debug: nudge', 8, y, { size: S.body, bold: true, color: C.textMuted });
      y += 56;
      const bw = (w - 24) / 2;
      nudges.forEach(([label, what, amount], i) => {
        const r = { x: (i % 2) * (bw + 24), y: y + Math.floor(i / 2) * 134, w: bw, h: 120 };
        if (ctx) drawButton(ctx, r, label, { accent: C.purple });
        hits.push({ rect: r, id: `nudge_${what}_${amount}`, onTap: () => team.nudge(s.id, what, amount) });
      });
      y += 3 * 134;
    }
    return y + 24;
  }

  function letGo(s) {
    const r = team.recruitment.letGo(s.id);
    if (!r.ok) return toast(r.reason);
    toast(`${s.name} has left the team`, 'Their salary stops from next month');
    afterLetGo();
  }
  function askLetGo(s) {
    const founder = team.isFounder(s.id);
    const body = founder
      ? `${s.name} founded this team with you. If they go, they will never come back.`
      : `${s.name} leaves the garage today. They may turn up again later on a recruitment board.`;
    if (confirm) confirm({ title: `Let ${s.name.split(' ')[0]} go?`, body, yes: 'Let go', danger: true, onYes: () => letGo(s) });
    else letGo(s);
  }

  function bar(ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = C.track;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * Math.min(1, Math.max(0, frac))), h, h / 2);
    ctx.fill();
  }

  const screen = {
    panel,
    get id() {
      return id;
    },
    get tab() {
      return tab;
    },
    // Screen rect of a tab or debug button by id ('tab_stats', 'nudge_DRV_10'…), after scrolling it into view (tests).
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
      id = params.id ?? team.roster[0]?.id;
      const s = person();
      tab = s && team.isDriver(s) ? 'ratings' : 'stats';
      panel.scrollY = 0;
    },
    onDragStart(p) {
      panel.beginDrag(p);
    },
    onDrag(p) {
      panel.drag(p);
    },
    onDragEnd(p) {
      panel.endDrag(p);
    },
    onWheel(p) {
      panel.scrollY += p.deltaY;
      panel.clamp();
    },
    onTap(p) {
      if (topBar.handleTap(p)) return;
      if (!panel.contains(p)) return;
      layoutPage(null, panel.getRect().w);
      const q = panel.toContent(p);
      const h = hits.find((x) => hitRect(q, x.rect));
      h?.onTap();
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
  return screen;
}
