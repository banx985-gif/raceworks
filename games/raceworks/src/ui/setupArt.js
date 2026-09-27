// New Game setup and save-slot pictures drawn in code (Milestone 4b). The spec's optional frames
// (setup_team_badge_frame, setup_founder_select_frame, ui_random_dice, ui_save_slot_frame) don't exist as art yet, so
// these stand in for them — no image files. All words are drawn by the game.
//   drawTeamBadge(ctx, r, colour, initials)   a shield in the team colour with livery stripes and the initials
//   drawLiveryCar(ctx, r, colour)             a small side-on race car in the team livery
//   drawDice(ctx, cx, cy, size)               the Random icon
//   drawFounderFrame(ctx, r, selected)        the founder card frame (gold edge + tick when chosen)
//   drawSlotFrame(ctx, r, colour)             a save-slot card with a team-colour band down its left edge
//   initialsOf(name)                          "Banks Racing" → "BR"
import { THEME, font } from '../../../../core/Theme.js';
import { panel } from '../../../../core/ui/Kit.js';

const C = THEME.color;

export function initialsOf(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

function shieldPath(ctx, r) {
  const { x, y, w, h } = r;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, y);
  ctx.quadraticCurveTo(x + w * 0.78, y + h * 0.08, x + w, y + h * 0.08);
  ctx.lineTo(x + w, y + h * 0.5);
  ctx.quadraticCurveTo(x + w, y + h * 0.82, x + w * 0.5, y + h);
  ctx.quadraticCurveTo(x, y + h * 0.82, x, y + h * 0.5);
  ctx.lineTo(x, y + h * 0.08);
  ctx.quadraticCurveTo(x + w * 0.22, y + h * 0.08, x + w * 0.5, y);
  ctx.closePath();
}

export function drawTeamBadge(ctx, r, colour, initials = '') {
  ctx.save();
  shieldPath(ctx, r);
  ctx.fillStyle = colour.main;
  ctx.fill();
  ctx.clip();
  // Two diagonal livery stripes and a chequered corner.
  ctx.fillStyle = colour.light;
  ctx.beginPath();
  ctx.moveTo(r.x + r.w * 0.55, r.y);
  ctx.lineTo(r.x + r.w * 0.72, r.y);
  ctx.lineTo(r.x + r.w * 0.25, r.y + r.h);
  ctx.lineTo(r.x + r.w * 0.08, r.y + r.h);
  ctx.fill();
  ctx.fillStyle = colour.dark;
  ctx.beginPath();
  ctx.moveTo(r.x + r.w * 0.76, r.y);
  ctx.lineTo(r.x + r.w * 0.84, r.y);
  ctx.lineTo(r.x + r.w * 0.37, r.y + r.h);
  ctx.lineTo(r.x + r.w * 0.29, r.y + r.h);
  ctx.fill();
  const sq = r.w / 10;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    ctx.fillStyle = (i + j) % 2 ? '#FFFFFF' : C.outline;
    ctx.fillRect(r.x + r.w - (i + 1) * sq, r.y + r.h * 0.08 + j * sq, sq, sq);
  }
  ctx.restore();
  ctx.save();
  shieldPath(ctx, r);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(4, r.w / 28);
  ctx.stroke();
  if (initials) {
    ctx.font = font(Math.max(THEME.size.small, r.w * 0.34), true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, r.w / 22);
    ctx.strokeStyle = C.outline;
    ctx.lineJoin = 'round';
    ctx.strokeText(initials, r.x + r.w / 2, r.y + r.h * 0.56, r.w * 0.8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(initials, r.x + r.w / 2, r.y + r.h * 0.56, r.w * 0.8);
  }
  ctx.restore();
}

export function drawLiveryCar(ctx, r, colour) {
  const { x, y, w, h } = r;
  const base = y + h * 0.78;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, w / 90);
  ctx.strokeStyle = C.outline;
  // Shadow
  ctx.fillStyle = C.shade;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, base + h * 0.12, w * 0.46, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body
  ctx.beginPath();
  ctx.moveTo(x + w * 0.04, base);
  ctx.lineTo(x + w * 0.04, base - h * 0.22);
  ctx.quadraticCurveTo(x + w * 0.08, base - h * 0.34, x + w * 0.26, base - h * 0.36);
  ctx.lineTo(x + w * 0.38, base - h * 0.62);
  ctx.quadraticCurveTo(x + w * 0.5, base - h * 0.7, x + w * 0.66, base - h * 0.6);
  ctx.lineTo(x + w * 0.8, base - h * 0.38);
  ctx.quadraticCurveTo(x + w * 0.96, base - h * 0.34, x + w * 0.97, base - h * 0.16);
  ctx.lineTo(x + w * 0.97, base);
  ctx.closePath();
  ctx.fillStyle = colour.main;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = colour.light;
  ctx.fillRect(x, base - h * 0.27, w, h * 0.08);
  ctx.fillStyle = colour.dark;
  ctx.fillRect(x, base - h * 0.08, w, h * 0.08);
  ctx.restore();
  ctx.stroke();
  // Windows
  ctx.fillStyle = '#BFE6F2';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.41, base - h * 0.38);
  ctx.lineTo(x + w * 0.46, base - h * 0.56);
  ctx.quadraticCurveTo(x + w * 0.52, base - h * 0.6, x + w * 0.62, base - h * 0.55);
  ctx.lineTo(x + w * 0.72, base - h * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Wheels
  for (const cx of [x + w * 0.24, x + w * 0.78]) {
    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.arc(cx, base, h * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#C9CED4';
    ctx.beginPath();
    ctx.arc(cx, base, h * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawDice(ctx, cx, cy, size) {
  const s = size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18);
  panel(ctx, { x: -s / 2, y: -s / 2, w: s, h: s }, { fill: '#FFFFFF', stroke: C.outline, lineWidth: Math.max(3, s / 14), radius: s * 0.22 });
  ctx.fillStyle = C.outline;
  const d = s * 0.26;
  for (const [px, py] of [[-d, -d], [d, -d], [0, 0], [-d, d], [d, d]]) {
    ctx.beginPath();
    ctx.arc(px, py, s * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawFounderFrame(ctx, r, selected) {
  panel(ctx, r, selected ? { fill: C.panelGold, stroke: C.gold, lineWidth: 7, radius: THEME.panel.radius } : { fill: C.panel, stroke: C.line, lineWidth: 3, radius: THEME.panel.radius });
  if (!selected) return;
  // A tick in a gold circle, top right.
  const cx = r.x + r.w - 40;
  const cy = r.y + 40;
  ctx.save();
  ctx.fillStyle = C.gold;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy);
  ctx.lineTo(cx - 3, cy + 10);
  ctx.lineTo(cx + 13, cy - 9);
  ctx.stroke();
  ctx.restore();
}

export function drawSlotFrame(ctx, r, colour = null) {
  panel(ctx, r, { fill: colour ? C.panel : C.panelAlt, stroke: colour ? C.outline : C.line, lineWidth: colour ? 4 : 3, radius: THEME.panel.radius });
  if (!colour) return;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, THEME.panel.radius);
  ctx.clip();
  ctx.fillStyle = colour.main;
  ctx.fillRect(r.x, r.y, 22, r.h);
  ctx.fillStyle = colour.light;
  ctx.fillRect(r.x + 22, r.y, 8, r.h);
  ctx.restore();
}
