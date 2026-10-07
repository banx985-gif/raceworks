// Roster (Milestone 3): everyone on the team as core/ui/StaffCard cards — portrait and role badge, name, role and
// level, XP, the five work stats, Energy / Morale bars, traits, status icons and what they are assigned to / doing.
// Opened from the Staff sheet (bottom bar). Tap a card → their details. Drag to scroll. The top bar's ‹ Garage
// (or the phone's Back) returns. Milestone 12: Hire and Train buttons at the top.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawStaffCard, staffCardHeight } from '../../../../core/ui/StaffCard.js'; // (Milestone 29: the card grows with the Text size)
import { text } from '../../../../core/ui/Kit.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { STAT_KEYS, ROLES, TRAITS } from '../../data/staff.js';
import { STATIONS, stationOf } from '../../data/garage.js';
import { statusIconsOf } from '../ui/statusIcons.js';

const C = THEME.color;
const S = THEME.size;
const GAP = 24;
const HEAD = 290; // title, count line and the Hire / Train buttons (Milestone 12)

// The card's content for one worker (also used by tests).
export function rosterView(s, { team, garage }) {
  const station = STATIONS.find((x) => x.id === stationOf(s));
  return {
    title: s.name,
    subtitle: `${ROLES[s.role].name} · Level ${s.level}`,
    portraitKey: s.art,
    badgeKey: ROLES[s.role].badge,
    xp: { value: Math.round(s.xp), max: team.staff.xpNeeded(s.level) },
    stats: STAT_KEYS.map((k) => ({ label: k, value: s.stats[k] })),
    bars: [
      { label: 'Energy', value: s.energy, max: 100, color: s.status.tired ? C.bad : C.good },
      { label: 'Morale', value: s.morale, max: 100, color: s.status.stressed ? C.bad : C.progress },
    ],
    chips: s.traits.map((t) => ({ label: TRAITS[t]?.name ?? t })),
    icons: statusIconsOf(s),
    footer: `${station?.name ?? 'Unassigned'} · ${garage.stateText(s.id)}`,
  };
}

export function createRosterScreen({ layout, assets, team, garage, topBar, goStaff, goRecruit = () => {}, goTrain = () => {} }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  const headButton = (i, w) => ({ x: i * ((w - 24) / 2 + 24), y: 140, w: (w - 24) / 2, h: 120 });
  const cardRect = (i, w) => ({ x: 0, y: HEAD + i * (staffCardHeight() + GAP), w, h: staffCardHeight() });

  const screen = {
    // Screen rect of the Hire (0) / Train (1) button (tests).
    headRect(i) {
      const r = panel.getRect();
      const b = headButton(i, r.w);
      return { x: r.x + b.x, y: r.y + b.y - panel.scrollY, w: b.w, h: b.h };
    },
    // Screen rect of a staff member's card (tests).
    cardRectOf(id) {
      const i = team.roster.findIndex((s) => s.id === id);
      if (i < 0) return null;
      const r = panel.getRect();
      const c = cardRect(i, r.w);
      return { x: r.x + c.x, y: r.y + c.y - panel.scrollY, w: c.w, h: c.h };
    },
    panel,
    // Milestone 29: every tap area (content units; the thumb-size check reads them)
    tapTargets: () => {
      const w = panel.getRect().w;
      return [{ id: 'hire', rect: headButton(0, w) }, { id: 'train', rect: headButton(1, w) }, ...team.roster.map((p, i) => ({ id: `card_${p.id}`, rect: cardRect(i, w) }))];
    },
    enter() {
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
      const q = panel.toContent(p);
      const w = panel.getRect().w;
      if (hitRect(q, headButton(0, w))) return goRecruit();
      if (hitRect(q, headButton(1, w))) return goTrain();
      const i = team.roster.findIndex((_, k) => {
        const c = cardRect(k, w);
        return q.y >= c.y && q.y <= c.y + c.h;
      });
      if (i >= 0) goStaff(team.roster[i].id);
    },
    render(ctx) {
      const w = panel.getRect().w;
      panel.contentHeight = HEAD + team.roster.length * (staffCardHeight() + GAP);
      panel.begin(ctx);
      text(ctx, 'Your team', 8, 12, { size: S.title, bold: true });
      text(ctx, `${team.roster.length} of ${team.recruitment.staffCap()} people · tap someone for their details`, 8, 96, { size: S.small, color: C.textMuted, baseline: 'middle' });
      drawButton(ctx, headButton(0, w), 'Hire', { accent: C.good });
      drawButton(ctx, headButton(1, w), 'Train', { accent: C.progress });
      team.roster.forEach((s, i) => drawStaffCard(ctx, cardRect(i, w), rosterView(s, { team, garage }), assets));
      panel.end(ctx);
      topBar.render(ctx);
    },
  };
  return screen;
}
