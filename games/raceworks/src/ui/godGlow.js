// Milestone 30d: the Works Gods on screen — a small gold glow behind their picture (never drawn on the art itself), and
// their data row (title, foot padding) for a person.
//   drawGodGlow(ctx, cx, cy, rx, ry, strength = 1)   a soft gold ellipse centred at (cx, cy)
//   godOf(person or id) → the data/staff.js GODS row, or null
//   footShift(person, drawnH) → how far down to draw their picture so they stand on the same feet line as everyone else
import { GODS } from '../../data/staff.js';

const BY_ID = Object.fromEntries(GODS.map((g) => [g.id, g]));
export const godOf = (p) => BY_ID[typeof p === 'string' ? p : p?.id] ?? null;
export const GOD_GOLD = '#f2c14e';

export function drawGodGlow(ctx, cx, cy, rx, ry, strength = 1) {
  if (!ctx || !(rx > 0) || !(ry > 0)) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
  g.addColorStop(0, `rgba(255, 214, 102, ${0.55 * strength})`);
  g.addColorStop(0.6, `rgba(242, 193, 78, ${0.22 * strength})`);
  g.addColorStop(1, 'rgba(242, 193, 78, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The art is 615 px tall with footPad empty rows under the feet (Kaching: under his cushion).
export const footShift = (p, drawnH) => {
  const g = godOf(p);
  return g?.footPad ? (drawnH * g.footPad) / 615 : 0;
};
