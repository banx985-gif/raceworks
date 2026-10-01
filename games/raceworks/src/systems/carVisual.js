// Which of the 20 visual families a finished car shows (bible §18) — Milestone 22: the real resolver.
//   resolveFamily({ classId, parts, combos, secrets, debugSecrets }) → { id: 'V01'…'V20', showcase, top, rule, eligible }
//   visualFamily(...) — the same (the name Milestone 9's callers use)
//   familyOfCar(rec, team) → the family of a car in the Car Garage, derived from its class, parts and combos (never saved)
//   familyRules() → every rule in priority order (tests, the archive)
// Every family that applies is listed; a priority resolver picks one, so a car never flickers between families:
//   1. secret / prestige   V17 Hypercar X (SEC-CAR-01), V18 Electric Phantom (SEC-CAR-02 + SYN14), V19 Ghost Spec
//                          (SEC-CAR-03), V20 Project Zero (SEC-CAR-04 or SYN20) — secret flags are always false until the
//                          Secret Engine (Milestone 25); ?debug=1's override opens them for testing
//   2. combo-unlocked      V05 Hot Hatch (SYN03), V13 Super Touring (SYN15), V14 GT Pro (SYN16), V15 Formula Pro (SYN17),
//                          V16 Endurance Prototype (SYN18) — only on their own class
//   3. tier                V03 Roadster (Lightweight on balanced early parts), V07 GT Sprint (GT mid), V09 Formula Regional
//                          (Formula mid) — FAMILY_TIERS below (PLACEHOLDER thresholds)
//   4. base                the class's own family (data/cars.js CLASSES[..].family)
// Within a level the first rule listed wins. Whatever the input, exactly one valid family comes back (V01 last resort).
import { CLASSES, CAR_FAMILIES, PARTS } from '../../data/cars.js';

const FALLBACK = 'V01';
// PLACEHOLDERS (docs/DECISIONS.md, M22): part levels are the parts' complexity (Cx 1–10).
//   early (balanced): every part Cx 2–3 and the six within 1 of each other · mid: the parts' average Cx ≥ 4
export const FAMILY_TIERS = { earlyMin: 2, earlyMax: 3, earlySpread: 1, midAvg: 4 };

const cxs = (parts) => parts.map((id) => PARTS[id]?.cx ?? 1);
const avg = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0);
const early = (parts) => {
  const c = cxs(parts);
  return c.length === 6 && Math.min(...c) >= FAMILY_TIERS.earlyMin && Math.max(...c) <= FAMILY_TIERS.earlyMax && Math.max(...c) - Math.min(...c) <= FAMILY_TIERS.earlySpread;
};
const mid = (parts) => parts.length === 6 && avg(cxs(parts)) >= FAMILY_TIERS.midAvg;

// [level, family, rule words, test(car)] in priority order.
const RULES = [
  ['secret', 'V20', 'SEC-CAR-04 / SYN20', (c) => c.secret('SEC-CAR-04') || c.combos.includes('SYN20')],
  ['secret', 'V17', 'SEC-CAR-01', (c) => c.secret('SEC-CAR-01')],
  ['secret', 'V18', 'SEC-CAR-02 + SYN14', (c) => c.secret('SEC-CAR-02') && c.combos.includes('SYN14')],
  ['secret', 'V19', 'SEC-CAR-03', (c) => c.secret('SEC-CAR-03')],
  ['combo', 'V16', 'SYN18', (c) => c.combos.includes('SYN18') && c.classId === 'prototype'],
  ['combo', 'V15', 'SYN17', (c) => c.combos.includes('SYN17') && c.classId === 'formula'],
  ['combo', 'V14', 'SYN16', (c) => c.combos.includes('SYN16') && c.classId === 'gt'],
  ['combo', 'V13', 'SYN15', (c) => c.combos.includes('SYN15') && c.classId === 'touring'],
  ['combo', 'V05', 'SYN03', (c) => c.combos.includes('SYN03') && ['clubHatch', 'touring'].includes(c.classId)],
  ['tier', 'V09', 'Formula mid', (c) => c.classId === 'formula' && mid(c.parts)],
  ['tier', 'V07', 'GT mid', (c) => c.classId === 'gt' && mid(c.parts)],
  ['tier', 'V03', 'Lightweight + balanced early parts', (c) => c.classId === 'lightweight' && early(c.parts)],
  ['base', null, 'class base', (c) => !!CLASSES[c.classId]],
];
export const familyRules = () => RULES.map(([level, id, words]) => ({ level, id, words }));

export function resolveFamily({ classId, parts = [], combos = [], secrets = null, debugSecrets = false } = {}) {
  const car = { classId, parts, combos, secret: (f) => debugSecrets || !!secrets?.has?.(f) };
  const eligible = [];
  for (const [level, fam, words, ok] of RULES) {
    const id = fam ?? CLASSES[classId]?.family;
    if (CAR_FAMILIES[id] && ok(car)) eligible.push({ level, id, rule: words });
  }
  const pick = eligible[0] ?? { level: 'fallback', id: FALLBACK, rule: 'fallback' };
  const f = CAR_FAMILIES[pick.id];
  return { id: pick.id, showcase: f.showcase, top: f.top, rule: pick.rule, level: pick.level, eligible: eligible.map((e) => e.id) };
}
export const visualFamily = resolveFamily;

// A car in the Car Garage (or being raced): derived each time from what it is — never read back from the save.
export function familyOfCar(rec, team = null) {
  const r = rec?.result ?? {};
  return resolveFamily({ classId: r.classId, parts: r.parts ?? [], combos: r.combos ?? [], secrets: new Set(team?.unlocks?.secrets ?? []), debugSecrets: !!team?.combos?.debugSecrets });
}
