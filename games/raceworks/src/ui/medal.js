// The Training Medal picture (ui/race_ui_23, Aaron's art) tinted Bronze / Silver / Gold (Milestone 14). The art is
// never redrawn: a tinted copy is made once per medal (multiply over the picture, kept to its own shape) and cached.
//   drawMedal(ctx, assets, medal, rect) — medal null draws the plain picture faded (not earned yet)
import { DRILL_ART, MEDAL_TINT } from '../../data/drills.js';

const cache = new Map(); // medal → canvas

function tinted(img, colour) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; // back to the picture's own outline
  g.drawImage(img, 0, 0);
  return c;
}

export function drawMedal(ctx, assets, medal, rect) {
  const img = assets.get?.(DRILL_ART.medal);
  if (!medal || !img || !img.width || typeof document === 'undefined') {
    ctx.save();
    if (!medal) ctx.globalAlpha = 0.3;
    assets.drawContained(ctx, DRILL_ART.medal, rect);
    ctx.restore();
    return;
  }
  let c = cache.get(medal);
  if (!c || c.src !== img) {
    c = tinted(img, MEDAL_TINT[medal]);
    c.src = img;
    cache.set(medal, c);
  }
  const s = Math.min(rect.w / c.width, rect.h / c.height);
  const w = c.width * s;
  const h = c.height * s;
  ctx.drawImage(c, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
}
