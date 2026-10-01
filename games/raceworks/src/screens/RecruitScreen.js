// Recruitment (Milestone 12, bible §12): Staff → Hire, or the Sponsor Wall (front desk). At the top: the team size and
// its cap by rank, and when the boards next refresh for free. Five channel tabs — Local Contacts, Agency Search (Rank
// D), National Scout (Rank C), Global Head Hunt (Rank A), Special Arrival (locked until Milestone 24). An open channel
// shows its refresh buttons (Credits, escalating this month · Racing Tokens · a rewarded ad, one a real day — the last
// two are service stubs on a pretend provider) and its 3 candidates: portrait and role badge, name, role · level ·
// tier, the five work stats (drivers: their Qualifying / Racecraft / Wet ratings too), trait, salary and the hiring
// fee, and Hire — or why not (cap, Credits, rank). A locked channel says what opens it.
// Milestone 13: with ?debug=1 the (still locked) Special tab lists all 50 with a Spawn button each; a spawned person
// shows as a normal candidate card there and can be hired (Legendary / Secret included — testing only).
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, drawPadlock, hitRect } from '../../../../core/ui/Button.js';
import { text, para, card } from '../../../../core/ui/Kit.js';
import { STAT_KEYS, ROLES, TIERS, TRAITS, ALL_STAFF } from '../../data/staff.js';
import { CHANNELS, REFRESH_SERVICES, RECRUIT } from '../../data/recruitment.js';
import { TOP_BAR } from '../../data/home.js';
import { driverRatings } from '../systems/driverRatings.js';
import { hireFee } from '../systems/recruitment.js';

const C = THEME.color;
const S = THEME.size;
const PAD = 24;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const TIER_COLOR = { standard: C.textMuted, rare: C.progress, elite: C.purple, legendary: C.gold, secret: C.bad };

export function createRecruitScreen({ layout, assets, team, topBar, toast = () => {}, goStaff = () => {}, debugEnabled = false }) {
  const rec = team.recruitment;
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let channel = 'local';
  let hits = [];
  let adBusy = false;
  // Portraits load when first needed (data/assets.js STAFF_PORTRAITS are registered, not loaded, at boot).
  const want = (keys) => {
    const list = keys.filter((k) => assets.isPending?.(k));
    if (list.length) assets.ensure(list);
  };

  function hire(cardId) {
    const r = rec.hire(cardId);
    if (!r.ok) return toast(r.reason);
    toast(`${r.staff.name} joins the team!`, `Hiring fee −${fmt(r.fee)} Credits · salary ${fmt(r.staff.salary)} a month`);
  }
  async function adRefresh() {
    if (adBusy) return;
    adBusy = true;
    const r = await rec.refreshWithAd(channel);
    adBusy = false;
    toast(r.ok ? 'New faces (thanks for watching)' : r.reason);
  }

  // The header: team size / cap and the free refresh.
  function header(ctx, y, w) {
    const h = 200;
    if (ctx) {
      card(ctx, { x: 0, y, w, h }, 'info');
      text(ctx, `Team ${team.roster.length} of ${rec.staffCap()}`, PAD, y + PAD, { size: S.title, bold: true });
      const nx = rec.nextCapRank();
      text(ctx, `Rank ${team.money.rank}: up to ${rec.staffCap()} people${nx ? ` · Rank ${nx.id} raises it to ${RECRUIT.staffCaps[nx.id]}` : ''}`, PAD, y + PAD + 70, { size: S.small, color: C.textMuted, maxWidth: w - PAD * 2 });
      const days = rec.freeInDays();
      text(ctx, `Free new faces on every board in ${days} day${days === 1 ? '' : 's'}`, PAD, y + PAD + 118, { size: S.small, bold: true, color: C.actionDark, maxWidth: w - PAD * 2 });
    }
    return h;
  }

  // One candidate. Returns its height.
  function candidate(ctx, y, w, c) {
    const chk = rec.hireCheck(c.id);
    const driver = c.role === 'driver';
    const h = 560 + (driver ? 50 : 0);
    const box = { x: 0, y, w, h };
    if (ctx) {
      card(ctx, box, ['elite', 'legendary', 'secret'].includes(c.tier) ? 'secret' : c.tier === 'rare' ? 'info' : 'normal');
      const pr = { x: PAD, y: y + PAD, w: 250, h: h - PAD * 3 - 120 };
      ctx.fillStyle = C.panelAlt;
      ctx.beginPath();
      ctx.roundRect(pr.x, pr.y, pr.w, pr.h, 20);
      ctx.fill();
      assets.drawContained(ctx, c.art, { x: pr.x + 8, y: pr.y + 8, w: pr.w - 16, h: pr.h - 16 }, 'bottom');
      assets.drawContained(ctx, ROLES[c.role].badge, { x: pr.x - 8, y: pr.y - 8, w: 84, h: 84 });
      const tx = pr.x + pr.w + 28;
      const tw = w - tx - PAD;
      let ty = y + PAD;
      text(ctx, c.name, tx, ty, { size: S.heading, bold: true, maxWidth: tw });
      ty += 64;
      text(ctx, `${ROLES[c.role].name} · Level ${c.level}`, tx, ty, { size: S.small, color: C.textMuted, maxWidth: tw });
      ty += 46;
      text(ctx, `${TIERS[c.tier].name}${c.generic ? '' : ' · from the roster'}${c.returning ? ' · worked here before' : ''}`, tx, ty, { size: S.small, bold: true, color: TIER_COLOR[c.tier] ?? C.text, maxWidth: tw });
      ty += 56;
      // the five work stats
      const cw = tw / 5;
      STAT_KEYS.forEach((k, i) => {
        const main = ROLES[c.role].primaryStat === k;
        text(ctx, k, tx + i * cw + cw / 2, ty, { size: S.small, bold: true, color: C.textMuted, align: 'center' });
        text(ctx, String(c.stats[k]), tx + i * cw + cw / 2, ty + 40, { size: S.button, bold: true, color: main ? C.actionDark : C.text, align: 'center' });
      });
      ty += 100;
      if (driver) {
        const r = driverRatings({ stats: c.stats, traits: c.traits, status: {} });
        text(ctx, `Qualifying ${r.qualifying} · Racecraft ${r.racecraft} · Wet ${r.wet}`, tx, ty, { size: S.small, bold: true, color: C.progress, maxWidth: tw });
        ty += 50;
      }
      const trait = c.traits.map((t) => TRAITS[t]?.name ?? t).join(', ') || 'No trait yet';
      text(ctx, `Trait: ${trait}`, tx, ty, { size: S.small, color: C.purple, bold: true, maxWidth: tw });
      ty += 50;
      text(ctx, `Salary ${fmt(c.salary)} a month · fee ${fmt(hireFee(c))}`, tx, ty, { size: S.small, bold: true, maxWidth: tw });
    }
    const b = { x: PAD, y: y + h - PAD - 120, w: w - PAD * 2, h: 120 };
    if (ctx) drawButton(ctx, b, chk.ok ? `Hire ${c.name.split(' ')[0]} · ${fmt(chk.fee)} Credits` : chk.why, { disabled: !chk.ok, accent: C.good });
    hits.push({ rect: b, id: `hire_${c.id}`, onTap: () => (chk.ok ? hire(c.id) : toast(chk.why)) });
    return h;
  }

  // ?debug=1 (Milestone 13): on the Special tab, any of the 50 can be spawned as a hireable card (Legendary / Secret
  // too) — the spawned cards first, then the list. Never in normal play.
  function debugSpawns(ctx, y, w) {
    for (const c of rec.cardsOf('special')) y += candidate(ctx, y, w, c) + 24;
    if (ctx) text(ctx, 'Debug: spawn anyone', 8, y, { size: S.heading, bold: true, color: C.purple });
    y += 70;
    const rowH = 124;
    const bw = 240;
    for (const d of ALL_STAFF) {
      const busy = team.get(d.id) ? 'On the team' : d.id === team.founder?.id ? 'Founder' : rec.cardsOf('special').some((c) => c.personId === d.id) ? 'Spawned' : rec.cards.some((c) => c.personId === d.id) ? 'On a board' : null;
      const b = { x: w - bw, y: y + 6, w: bw, h: rowH - 12 };
      if (ctx) {
        text(ctx, `${d.id} ${d.name}`, 8, y + 12, { size: S.small, bold: true, maxWidth: w - bw - 24 });
        text(ctx, `${TIERS[d.tier].name} ${ROLES[d.role].name}`, 8, y + 56, { size: S.small, color: TIER_COLOR[d.tier] ?? C.textMuted, maxWidth: w - bw - 24 });
        drawButton(ctx, b, busy ?? 'Spawn', { disabled: !!busy, accent: C.purple });
      }
      hits.push({ rect: b, id: `spawn_${d.id}`, onTap: () => {
        const r = rec.debugSpawn(d.id);
        toast(r.ok ? `${d.name} is on the Special tab` : r.reason);
        if (r.ok) want([r.card.art]);
      } });
      y += rowH;
    }
    return y + 40;
  }

  function layoutPage(ctx, w) {
    hits = [];
    let y = 0;
    if (ctx) text(ctx, 'Recruitment', 8, y, { size: S.title, bold: true });
    y += 84;
    y += header(ctx, y, w) + 24;
    // Channel tabs (locked ones show a padlock).
    const n = CHANNELS.length;
    const gap = 10;
    const tw = (w - gap * (n - 1)) / n;
    CHANNELS.forEach((ch, i) => {
      const r = { x: i * (tw + gap), y, w: tw, h: 110 };
      const locked = !rec.isOpen(ch.id);
      if (ctx) drawButton(ctx, r, ch.short, { active: ch.id === channel, accent: C.progress, locked });
      hits.push({ rect: r, id: `tab_${ch.id}`, onTap: () => (channel = ch.id) });
    });
    y += 134;
    const ch = CHANNELS.find((c) => c.id === channel);
    const why = rec.channelWhy(channel);
    // Channel card.
    const lines = para(null, ch.line, 0, 0, w - PAD * 2, { size: S.body });
    const chH = PAD + 64 + lines + (why ? 60 : 0) + PAD;
    if (ctx) {
      card(ctx, { x: 0, y, w, h: chH }, why ? 'locked' : 'normal');
      if (why) drawPadlock(ctx, w - PAD - 20, y + PAD + 26, 34, C.textFaint);
      text(ctx, ch.name, PAD, y + PAD, { size: S.heading, bold: true, color: why ? C.textMuted : C.actionDark, maxWidth: w - PAD * 2 - 60 });
      para(ctx, ch.line, PAD, y + PAD + 64, w - PAD * 2, { size: S.body, color: why ? C.textMuted : C.text });
      if (why) text(ctx, why, PAD, y + PAD + 64 + lines + 10, { size: S.small, bold: true, color: C.bad, maxWidth: w - PAD * 2 });
    }
    y += chH + 24;
    if (why && channel === 'special' && debugEnabled) return debugSpawns(ctx, y, w);
    // Milestone 24: a secret's special arrival is hireable on the Special tab in normal play
    if (why && channel === 'special') {
      const arrivals = rec.cardsOf('special').filter((c) => c.arrival);
      for (const c of arrivals) y += candidate(ctx, y, w, c) + 24;
      return y + 40;
    }
    if (why) return y + 40;
    // Refresh buttons.
    const bw = (w - 2 * 16) / 3;
    const cost = rec.refreshCost(channel);
    const refreshes = [
      { id: 'refreshCredits', label: `New faces · ${fmt(cost)} Cr`, why: rec.refreshWhy(channel), onTap: () => { const r = rec.refresh(channel); toast(r.ok ? 'New faces' : r.reason, r.ok ? `−${fmt(r.cost)} Credits (the next one this month costs more)` : ''); } },
      { id: 'refreshTokens', label: `Tokens · ${REFRESH_SERVICES.tokens.cost}`, icon: TOP_BAR.icons.tokens, why: rec.tokenWhy(channel), onTap: () => { const r = rec.refreshWithTokens(channel); toast(r.ok ? 'New faces' : r.reason, r.ok ? `−${r.cost} Racing Tokens` : ''); } },
      { id: 'refreshAd', label: adBusy ? 'Ad playing…' : 'Watch an ad', why: adBusy ? 'An ad is playing' : rec.adWhy(channel), onTap: () => adRefresh() },
    ];
    refreshes.forEach((b, i) => {
      const r = { x: i * (bw + 16), y, w: bw, h: 120 };
      if (ctx) drawButton(ctx, r, b.label, { disabled: !!b.why, accent: C.progress });
      hits.push({ rect: r, id: b.id, onTap: () => (b.why ? toast(b.why) : b.onTap()) });
    });
    y += 140;
    if (ctx) text(ctx, 'Paid refreshes only redraw the people you can already find.', 8, y, { size: S.small, color: C.textMuted, maxWidth: w - 16 });
    y += 60;
    for (const c of rec.cardsOf(channel)) y += candidate(ctx, y, w, c) + 24;
    return y + 40;
  }

  return {
    panel,
    get channel() {
      return channel;
    },
    setChannel(id) {
      channel = id;
    },
    // Screen rect of a button by id (after scrolling it into view) — tests.
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
    enter(params = {}) {
      channel = params.channel ?? channel;
      panel.scrollY = 0;
      want(rec.cards.map((c) => c.art));
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
      want(rec.cards.map((c) => c.art)); // new faces after a refresh
      panel.contentHeight = layoutPage(null, w);
      panel.clamp();
      panel.begin(ctx);
      layoutPage(ctx, w);
      panel.end(ctx);
      topBar.render(ctx);
    },
  };
}
