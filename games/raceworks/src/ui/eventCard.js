// The event card (Milestone 23, bible §31 "major event pauses", style guide §7 major feedback): one centred card over
// everything — the event's picture (a milestone's own art, else its class icon), its class, title and words, then its
// choices as big buttons (one tap answers and closes), or Continue (any tap closes). A past card reopened from the
// Inbox shows the choice made (✓, the others locked) and Close. It takes every tap while it is up (main.js puts it in
// the router's modal); the calendar pause is src/systems/events.js's.
//   const card = createEventCard({ layout, assets, events, reduced })
//   card.active · card.update(dt) · card.render(ctx) · card.onTap(p) · card.buttonRect(id) ('choice0'…, 'continue', 'close')
import { THEME, lineH } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { card as drawCard, text, wrapLines } from '../../../../core/ui/Kit.js';

const C = THEME.color;
const S = THEME.size;
const PAD = 40;
const GAP = 20;
const BTN_H = 120;
const BTN_SUB_H = 150;
const GUARD = 0.25; // seconds before a tap counts (the tap that was going on as it appeared)

export function createEventCard({ layout, assets, events, reduced = () => false }) {
  let t = 0;
  let shownId = null;

  const current = () => (events.showing ? events.view(events.showing.entryId) : null);

  function buttons(v) {
    if (v.choices.length && v.open) return v.choices.map((c, i) => ({ id: `choice${i}`, label: c.label, sub: c.line, index: i }));
    if (v.choices.length)
      return [
        ...v.choices.map((c, i) => ({ id: `choice${i}`, label: `${c.chosen ? '✓ ' : ''}${c.label}`, sub: c.chosen ? (v.auto ? 'Taken for you' : 'Your choice') : c.line, disabled: !c.chosen, chosen: c.chosen })),
        { id: 'close', label: 'Close', accent: C.progress },
      ];
    return [{ id: 'continue', label: 'Continue', accent: C.progress }];
  }

  function layoutOf(v) {
    const sr = layout.safeRect;
    const w = Math.min(sr.w - 60, 960);
    const inner = w - 2 * PAD;
    const bs = buttons(v);
    const titleLines = wrapLines(v.title, inner, S.title, true);
    const bodyLines = v.text ? wrapLines(v.text, inner, S.body) : [];
    const outcome = v.outcome ? 1 : 0;
    const fixed = PAD + 54 + titleLines.length * lineH(S.title, 1.15) + 12 + bodyLines.length * lineH(S.body) + 24 + outcome * lineH(S.body) + bs.reduce((h, b) => h + (b.sub ? BTN_SUB_H : BTN_H) + GAP, 0) + PAD - GAP;
    // the picture: a milestone's art large (as much as fits), any other card its class icon
    const big = !!v.art;
    const room = sr.h - 40 - fixed - 16;
    const pic = big ? Math.max(200, Math.min(520, room, inner * 0.9)) : Math.min(160, Math.max(100, room));
    let h = PAD;
    const picR = { x: (w - (big ? pic * 1.1 : pic)) / 2, y: h, w: big ? pic * 1.1 : pic, h: pic };
    h += pic + 16;
    const chipY = h;
    h += 54;
    const titleY = h;
    h += titleLines.length * lineH(S.title, 1.15) + 12;
    const bodyY = h;
    h += bodyLines.length * lineH(S.body) + 24;
    const outcomeY = h;
    h += outcome * lineH(S.body);
    const btns = bs.map((b) => {
      const bh = b.sub ? BTN_SUB_H : BTN_H;
      const r = { x: PAD, y: h, w: inner, h: bh };
      h += bh + GAP;
      return { b, r };
    });
    h += PAD - GAP;
    const box = { x: sr.x + (sr.w - w) / 2, y: sr.y + Math.max(20, (sr.h - h) / 2), w, h };
    return { box, picR, chipY, titleLines, titleY, bodyLines, bodyY, outcomeY, btns };
  }

  const abs = (L, r) => ({ x: L.box.x + r.x, y: L.box.y + r.y, w: r.w, h: r.h });

  const api = {
    get active() {
      return !!events.showing;
    },
    update(dt) {
      const id = events.showing?.entryId ?? null;
      if (id !== shownId) {
        shownId = id;
        t = 0;
      }
      if (id != null) t += dt;
    },
    buttonRect(id) {
      const v = current();
      if (!v) return null;
      const L = layoutOf(v);
      const hit = L.btns.find((x) => x.b.id === id);
      return hit ? abs(L, hit.r) : null;
    },
    get ready() {
      return t >= GUARD;
    },
    onTap(p) {
      const v = current();
      if (!v || t < GUARD) return;
      const L = layoutOf(v);
      for (const { b, r } of L.btns) {
        if (!hitRect(p, abs(L, r))) continue;
        if (b.disabled) return;
        if (b.index != null) events.answer(b.index);
        else if (b.id === 'continue' || b.id === 'close' || b.chosen) events.ack();
        return;
      }
      // a card without a question closes with a tap anywhere
      if (!v.open) events.ack();
    },
    onBack() {
      const v = current();
      if (v && !v.open) events.ack();
    },
    render(ctx) {
      const v = current();
      if (!v) return;
      const L = layoutOf(v);
      const k = reduced() ? 1 : Math.min(1, t / 0.2);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = C.overlay;
      ctx.fillRect(0, 0, layout.renderer.width, layout.renderer.height);
      const b = L.box;
      const lift = (1 - k) * 60;
      ctx.translate(0, lift);
      drawCard(ctx, b, v.art ? 'gold' : v.open ? 'info' : 'normal', { radius: 36 });
      const pr = abs(L, L.picR);
      assets.drawContained(ctx, v.art ?? v.icon, pr);
      // the class chip
      const chip = `${v.cls}${v.size === 'major' ? '' : ' news'} · Year ${Math.floor(v.day / 336) + 1}, Month ${Math.floor((v.day % 336) / 28) + 1}`;
      text(ctx, chip, b.x + b.w / 2, b.y + L.chipY, { size: S.small, bold: true, align: 'center', color: C.textMuted, maxWidth: b.w - 2 * PAD });
      L.titleLines.forEach((l, i) => text(ctx, l, b.x + b.w / 2, b.y + L.titleY + i * lineH(S.title, 1.15), { size: S.title, bold: true, align: 'center', color: v.art ? C.actionDark : C.text, maxWidth: b.w - 2 * PAD }));
      L.bodyLines.forEach((l, i) => text(ctx, l, b.x + b.w / 2, b.y + L.bodyY + i * lineH(S.body), { size: S.body, align: 'center', color: C.text, maxWidth: b.w - 2 * PAD }));
      if (v.outcome) text(ctx, v.outcome, b.x + b.w / 2, b.y + L.outcomeY, { size: S.body, bold: true, align: 'center', color: v.answer?.outcome === 'win' ? C.good : C.bad, maxWidth: b.w - 2 * PAD });
      for (const { b: bt, r } of L.btns) {
        const rr = abs(L, r);
        drawButton(ctx, rr, bt.sub ? '' : bt.label, { accent: bt.accent, disabled: bt.disabled, selected: bt.chosen });
        if (bt.sub) {
          const col = bt.disabled ? C.textFaint : bt.chosen ? C.textOnDark : C.textOnAction;
          text(ctx, bt.label, rr.x + rr.w / 2, rr.y + 26, { size: S.button, bold: true, align: 'center', color: col, maxWidth: rr.w - 30 });
          text(ctx, bt.sub, rr.x + rr.w / 2, rr.y + 26 + lineH(S.button, 1.2), { size: S.small, bold: true, align: 'center', color: col, maxWidth: rr.w - 30 });
        }
      }
      if (!v.open && t >= GUARD && !v.choices.length) {
        ctx.globalAlpha = reduced() ? 1 : 0.55 + 0.45 * Math.sin(t * 4) ** 2;
        text(ctx, 'Tap to continue', b.x + b.w / 2, b.y + b.h + 18, { size: S.small, bold: true, align: 'center', color: C.textOnDark });
      }
      ctx.restore();
    },
  };
  return api;
}
