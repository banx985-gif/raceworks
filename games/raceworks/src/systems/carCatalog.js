// Which classes and parts a team may build with, and what makes a car legal (Milestone 9, bible §14.2, §15, §15.7).
// Plain rules over data/cars.js; the screens and the project only ask these questions.
//   unlockContext(team, { debugAll })      → { rank, research, events, facilities, secrets, debugAll } — what the team has.
//                                            research / events / facilities / secrets are empty Sets until their
//                                            milestones (M11 research, M10 facilities, M25 secrets) fill them.
//   classState(id, ctx) / partState(id, ctx) → { open, hidden, reason }   hidden = a secret part (never listed normally)
//   partsForSlot(slot, ctx)               → the parts a builder lists for a slot (open first; secret ones only if open)
//   tierFor(partIds)                      → the §15.7 tier { id, name, target, cx } from the six parts' complexity
//   tierState(tier, ctx)                  → Prestige needs Rank S or a qualifying secret flag
//   checkCar({ classId, parts }, ctx)     → { ok, reasons[] } — one open part per slot, in slot order, an open class,
//                                            an allowed tier. ctx null = only the shape (six parts, right slots).
//   carCost({ classId, parts })           → class base cost + parts
//   generateCar(rng, ctx, opts)           → a random legal car { classId, parts } (debug and tests)
import { CLASSES, CLASS_ORDER, PARTS, SLOTS, TIERS, RANK_ORDER, PRESTIGE_SECRET_FLAGS } from '../../data/cars.js';

const rankAt = (r) => RANK_ORDER.indexOf(r);
const hasRank = (ctx, r) => rankAt(ctx.rank) >= rankAt(r);

export function unlockContext(team = null, { debugAll = false } = {}) {
  const u = team?.unlocks ?? {};
  return {
    rank: team?.money?.rank ?? 'E',
    research: new Set(u.research ?? []),
    events: new Set(u.events ?? []),
    facilities: new Set(u.facilities ?? []),
    secrets: new Set(u.secrets ?? []),
    debugAll,
  };
}

export function classState(id, ctx) {
  const c = CLASSES[id];
  if (!c) return { open: false, hidden: true, reason: 'No such class' };
  if (ctx.debugAll || hasRank(ctx, c.rank)) return { open: true, hidden: false, reason: '' };
  return { open: false, hidden: false, reason: `Opens at Rank ${c.rank}` };
}

const RESEARCH_NAME = { PWR: 'Powertrain', TRN: 'Transmission', CHA: 'Chassis', AER: 'Aero', HAN: 'Handling', ELE: 'Electronics' };
const researchName = (node) => `${RESEARCH_NAME[node.slice(0, 3)] ?? node} ${node.slice(3)} research`;
const FACILITY_NAME = { F23: 'Strategy Room' };
const EVENT_NAME = { electricSystems: 'the Electric Systems event' };

export function partState(id, ctx) {
  const p = PARTS[id];
  if (!p) return { open: false, hidden: true, reason: 'No such part' };
  const u = p.unlock;
  if (ctx.debugAll) return { open: true, hidden: false, reason: '' };
  if (p.secret) return ctx.secrets.has(u.secret) ? { open: true, hidden: false, reason: '' } : { open: false, hidden: true, reason: 'Secret' };
  if (u.start) return { open: true, hidden: false, reason: '' };
  const need = [];
  if (u.research && !ctx.research.has(u.research)) need.push(researchName(u.research));
  if (u.event && !ctx.events.has(u.event)) need.push(EVENT_NAME[u.event] ?? u.event);
  if (u.facility && !ctx.facilities.has(u.facility)) need.push(`a ${FACILITY_NAME[u.facility] ?? u.facility}`);
  if (u.rank && !hasRank(ctx, u.rank)) need.push(`Rank ${u.rank}`);
  return need.length ? { open: false, hidden: false, reason: `Needs ${need.join(' + ')}` } : { open: true, hidden: false, reason: '' };
}

export function partsForSlot(slot, ctx) {
  return Object.keys(PARTS)
    .filter((id) => PARTS[id].slot === slot)
    .map((id) => ({ id, ...partState(id, ctx) }))
    .filter((p) => !p.hidden);
}

export const partsCost = (partIds) => partIds.reduce((t, id) => t + PARTS[id].cost, 0);
export const complexityOf = (partIds) => partIds.reduce((t, id) => t + PARTS[id].cx, 0);
export function tierFor(partIds) {
  const cx = complexityOf(partIds);
  return { ...TIERS.find((t) => cx <= t.maxCx), cx };
}
export function tierState(tier, ctx) {
  if (tier.id !== 'prestige' || ctx.debugAll || hasRank(ctx, 'S') || PRESTIGE_SECRET_FLAGS.some((f) => ctx.secrets.has(f))) return { open: true, reason: '' };
  return { open: false, reason: 'Prestige projects need Rank S or a secret breakthrough' };
}

export const carCost = ({ classId, parts }) => (CLASSES[classId]?.baseCost ?? 0) + partsCost(parts);

export function checkCar({ classId, parts }, ctx = null) {
  const reasons = [];
  if (!CLASSES[classId]) reasons.push('Unknown class');
  if (!Array.isArray(parts) || parts.length !== SLOTS.length) reasons.push('A car needs exactly six parts');
  else
    SLOTS.forEach((sl, i) => {
      const p = PARTS[parts[i]];
      if (!p) reasons.push(`${sl.name}: unknown part`);
      else if (p.slot !== sl.id) reasons.push(`${sl.name}: ${p.name} does not fit this slot`);
    });
  if (ctx && !reasons.length) {
    const cs = classState(classId, ctx);
    if (!cs.open) reasons.push(`${CLASSES[classId].name}: ${cs.reason}`);
    parts.forEach((id) => {
      const ps = partState(id, ctx);
      if (!ps.open) reasons.push(`${PARTS[id].name}: ${ps.hidden ? 'not available' : ps.reason}`);
    });
    const ts = tierState(tierFor(parts), ctx);
    if (!ts.open) reasons.push(ts.reason);
  }
  return { ok: !reasons.length, reasons };
}

// A random legal car from what ctx allows (rng: core/Rng — pick(list) / int(lo, hi)). A drawn Prestige set that the
// team may not build is redrawn (the Start parts are always a legal fallback).
export function generateCar(rng, ctx, { classId = null } = {}) {
  const classes = CLASS_ORDER.filter((id) => classState(id, ctx).open);
  const cls = classId ?? rng.pick(classes);
  for (let tries = 0; tries < 20; tries++) {
    const parts = SLOTS.map((sl) => rng.pick(partsForSlot(sl.id, ctx).filter((p) => p.open)).id);
    if (checkCar({ classId: cls, parts }, ctx).ok) return { classId: cls, parts };
  }
  return { classId: cls, parts: SLOTS.map((sl) => CLASSES[cls].starterParts[sl.id]) };
}
