// Which of the 20 visual families a finished car shows (bible §18) — Milestone 9 stub: base rules only.
//   visualFamily({ classId, parts }) → { id: 'V01'…'V20', showcase, top, rule }
// Base rule: the class's base family (Club Hatch V01, Lightweight V02, Touring V04, GT V06, Formula V08, Stock V10,
// Endurance V11, Prototype V12; Electric and Experimental use V12 until their own families are reached).
// Still to come: combo-driven families (V05, V13–V16) with combos in Milestone 22, secret families (V17–V20) in
// Milestone 25, and the early / mid variants (V03, V07, V09). Whatever the input, a valid family always comes back
// (V01 as the last resort).
import { CLASSES, CAR_FAMILIES } from '../../data/cars.js';

const FALLBACK = 'V01';

export function visualFamily({ classId, parts = [] } = {}) {
  let id = CLASSES[classId]?.family;
  let rule = 'class base';
  if (!CAR_FAMILIES[id]) {
    id = FALLBACK;
    rule = 'fallback';
  }
  const f = CAR_FAMILIES[id];
  return { id, showcase: f.showcase, top: f.top, rule };
}
