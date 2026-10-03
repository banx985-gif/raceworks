// New Game+ Setup (Milestone 28, bible §7 / §37; Milestone 27 had a stub here). Reached after the slot for the new run
// is chosen (the slot screen in 'ngplus' mode: the parent run is locked). It shows what carries over automatically (the
// account-wide things) and the Prestige Tokens, then the player's picks: Legacy Staff (1 / 2 / 3 by level, from the
// finished run's roster), Legacy Car Blueprints (1 / 1 / 2, from its finished cars), from NG+2 one discounted facility
// blueprint, the research memory, and the optional challenge modifiers. Next goes on to the normal new-team setup
// (team name, colour, founder); nothing is written until START TEAM there.
//   createNgPlusScreen({ layout, assets, header, onNext(choices), onBack })
//   enter({ offer, slot, replacing, tokens, choices? })     offer = src/systems/ngplus.js offerFrom(parent)
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, listRow, listRowHeight } from '../../../../core/ui/Kit.js';
import { pressedLook } from '../ui/pressable.js';
import { NGPLUS_TEXT as T } from '../../data/ngplus.js';
import { ROLES, TIERS } from '../../data/staff.js';

const C = THEME.color;
const S = THEME.size;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const n = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
const blankChoices = () => ({ legacyStaff: [], blueprints: [], facility: null, modifiers: [] });

export function createNgPlusScreen({ layout, assets, header, onNext, onBack }) {
  let offer = null;
  let slot = null;
  let replacing = null;
  let tokens = 0;
  let choices = blankChoices();
  let note = null; // a short line after a refused pick
  let hits = [];
  const panel = new ScrollPanel({
    getRect: () => {
      const hr = header.rect();
      const sr = layout.safeRect;
      const y = hr.y + hr.h + 16;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 16 - y };
    },
  });

  // Tap a pick: on / off; a full list says so (the player takes one off first).
  function toggle(list, id, max, label) {
    note = null;
    if (list.includes(id)) return list.splice(list.indexOf(id), 1);
    if (list.length >= max) {
      note = { key: label, text: `Only ${max} ${label} at New Game+ ${offer.level} — take one off first.` };
      return null;
    }
    list.push(id);
    return id;
  }

  function layoutPage(ctx, w) {
    hits = [];
    let y = 8;
    if (!offer) {
      y += para(ctx, T.stub, 8, y, w - 16, { size: S.body });
      return y + 20;
    }
    const heading = (label) => {
      y += 18;
      if (ctx) text(ctx, label, 8, y, { size: S.heading, bold: true, color: C.actionDark, maxWidth: w - 16 });
      y += 66;
    };
    const line = (t, opts = {}) => (y += para(ctx, t, 8, y, w - 16, { size: S.small, color: C.textMuted, ...opts }) + 12);
    const pickRow = (r, id, onTap, picked) => {
      const row = { ...r, state: picked ? 'selected' : undefined, right: picked ? 'Picked' : 'Pick', rightColor: picked ? C.good : C.progress };
      const h = listRowHeight(w, row);
      const rect = { x: 0, y, w, h };
      if (ctx) {
        listRow(ctx, assets, rect, row);
        pressedLook(ctx, rect);
      }
      hits.push({ rect, id, onTap });
      y += h + 12;
    };
    const noteHere = (key) => note?.key === key && line(note.text, { color: C.bad, bold: true });

    if (ctx) text(ctx, T.level(offer.level), 8, y, { size: S.title, bold: true, color: C.purple });
    y += 84;
    line(T.from(offer.parentTeam, offer.parentGrade, offer.parentSlot ?? '—'), { color: C.text, bold: true });
    line(T.into(slot, replacing), { color: replacing ? C.bad : C.textMuted, bold: !!replacing });

    heading(T.carriedTitle);
    line(T.carried.join(' · '), { color: C.text });
    line(T.tokens(tokens), { color: C.purple, bold: true });

    // --- Legacy Staff ---
    heading(T.legacyTitle(offer.picks.legacy));
    line(T.legacyLine);
    for (const e of offer.options.legacy) {
      const picked = choices.legacyStaff.includes(e.id);
      const bits = [`${ROLES[e.role]?.name ?? e.role} · ${TIERS[e.tier]?.name ?? e.tier} · level ${e.level}`];
      if (e.founder) bits.push('Founder');
      if (e.chain) bits.push(`Legacy ${e.chain}× already`);
      pickRow({ art: e.art, title: e.name, lines: [{ text: bits.join(' · '), size: S.small, color: C.textMuted }, { text: `Career: ${n(e.career?.races ?? 0, 'race')} · ${n(e.career?.wins ?? 0, 'win')} · ${n(e.career?.carsBuilt ?? 0, 'car')} built`, size: S.small, color: C.textMuted }], artSize: 120 }, `legacy_${e.id}`, () => toggle(choices.legacyStaff, e.id, offer.picks.legacy, 'Legacy Staff'), picked);
    }
    noteHere('Legacy Staff');

    // --- blueprints ---
    heading(T.blueprintTitle(offer.picks.blueprints));
    line(T.blueprintLine);
    if (!offer.options.blueprints.length) line(T.noCars, { color: C.text });
    for (const b of offer.options.blueprints) {
      const picked = choices.blueprints.includes(b.id);
      pickRow({ art: b.art, title: b.name, lines: [{ text: `${b.className} · QUALITY ${b.quality} · Rating ${b.rating}`, size: S.small, bold: true }, { text: b.parts.join(' · '), size: S.small, color: C.textMuted }], artSize: 150 }, `bp_${b.id}`, () => toggle(choices.blueprints, b.id, offer.picks.blueprints, 'blueprints'), picked);
    }
    noteHere('blueprints');

    // --- the facility blueprint (NG+2 on) ---
    if (offer.picks.facility) {
      heading(T.facilityTitle(offer.facilityPct));
      for (const f of offer.options.facilities) {
        const picked = choices.facility === f.id;
        pickRow({ art: f.art, title: f.name, lines: [{ text: `${fmt(f.price)} Credits instead of ${fmt(f.cost)} (its first build)`, size: S.small, color: C.textMuted }], artSize: 110 }, `fac_${f.id}`, () => (choices.facility = picked ? null : f.id), picked);
      }
    }

    // --- research memory, what resets, rivals ---
    heading(T.resetTitle);
    line(T.research(offer.researchPct, offer.rpBonus), { color: C.progress, bold: true });
    line(`${T.reset} ${T.rivals(offer.rivalPct)}.`, { color: C.text });

    // --- optional challenges ---
    heading(T.modifiersTitle);
    line(T.modifiersLine);
    for (const m of offer.modifiers) {
      const picked = choices.modifiers.includes(m.id);
      pickRow({ title: m.name, lines: [{ text: m.text, size: S.small, color: C.textMuted }] }, `mod_${m.id}`, () => toggle(choices.modifiers, m.id, offer.modifiers.length, 'challenges'), picked);
    }

    y += 16;
    const next = { x: 0, y, w, h: 130 };
    if (ctx) drawButton(ctx, next, T.next, { accent: C.purple });
    hits.push({ rect: next, id: 'next', onTap: () => onNext(JSON.parse(JSON.stringify(choices))) });
    y += 130 + 20;
    const back = { x: 0, y, w, h: 110 };
    if (ctx) drawButton(ctx, back, T.back, { accent: C.progress });
    hits.push({ rect: back, id: 'back', onTap: () => onBack() });
    return y + 110 + 30;
  }

  return {
    panel,
    get offer() {
      return offer;
    },
    get choices() {
      return choices;
    },
    get slot() {
      return slot;
    },
    enter(params = {}) {
      if (params.offer) {
        offer = params.offer;
        slot = params.slot ?? null;
        replacing = params.replacing ?? null;
        tokens = params.tokens ?? 0;
        choices = params.choices ? JSON.parse(JSON.stringify(params.choices)) : blankChoices();
        panel.scrollY = 0;
      }
      note = null;
    },
    // Screen rect of a button by id (after scrolling it into view) — tests.
    buttonRect(bid) {
      panel.contentHeight = layoutPage(null, panel.getRect().w);
      const h = hits.find((x) => x.id === bid);
      if (!h) return null;
      const r = panel.getRect();
      if (h.rect.y < panel.scrollY || h.rect.y + h.rect.h > panel.scrollY + r.h) {
        panel.scrollY = h.rect.y - 40;
        panel.clamp();
      }
      return { x: r.x + h.rect.x, y: r.y + h.rect.y - panel.scrollY, w: h.rect.w, h: h.rect.h };
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
      panel.clamp();
      panel.begin(ctx);
      layoutPage(ctx, w);
      panel.end(ctx);
      header.render(ctx, T.title, () => onBack());
    },
  };
}
