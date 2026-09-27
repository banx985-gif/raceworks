// The pressed look for tappable cards that are not core buttons (Milestone 8, style guide §7: every button shows a
// clear pressed state): list rows, founder cards, colour swatches, name fields, save-slot cards. core/ui/Button.js
// already sinks every drawButton() under a finger; this gives a card the same feedback — a darker face and an orange
// edge while the finger is down on it. Uses the same press point, so it also works inside scrolled panels.
//   pressedLook(ctx, r, { radius })   call right after drawing the card; returns true while it is pressed
import { THEME } from '../../../../core/Theme.js';
import { isPressed } from '../../../../core/ui/Button.js';

const C = THEME.color;

export function pressedLook(ctx, r, { radius = THEME.panel.radius } = {}) {
  if (!isPressed(ctx, r)) return false;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = 'rgba(42, 36, 31, 0.14)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.action;
  ctx.stroke();
  ctx.restore();
  return true;
}
