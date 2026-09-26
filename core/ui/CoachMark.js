// Coach mark for the guide: dims the screen except a glowing ring round the thing to tap, and shows a
// speech box (face, title, one or two sentences, optional picture, buttons) next to it — below if there is
// room, else above — so the box never covers what it points at. Works at any screen height.
//   const cm = new CoachMark({ layout, assets, face: { key, crop: { x, y, w, h } } });
//   cm.render(ctx, step, targetRect, { block, next })   targetRect in screen units or null (centred box)
//   cm.hit(p) → 'next' | 'skip' | 'off' | 'box' | 'target' | null     (uses the last rendered layout)
import { drawButton } from './Button.js';
import { THEME } from '../Theme.js';
const COL = THEME.color;
const PAD = 26;
const FACE = 112;
const BTN_H = THEME.button.minH; // Milestone 17b: big, bright and readable (bible §33.2)
const TITLE = THEME.size.heading;
const BODY = THEME.size.body;
const LINE = 44;
const ART_H = 250;

export class CoachMark {
  constructor({ layout, assets, face = null, font = THEME.family, labels = { next: 'Got it', skip: 'Skip', off: 'Guide off' } }) {
    this.layout = layout;
    this.assets = assets;
    this.face = face;
    this.font = font;
    this.labels = labels;
    this.last = null; // { box, target, buttons: { id: rect } }
    this._wrap = new Map();
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
  }

  hit(p) {
    const L = this.last;
    if (!L) return null;
    for (const [id, r] of Object.entries(L.buttons)) if (inside(p, r)) return id;
    if (inside(p, L.box)) return 'box';
    if (L.target && inside(p, L.target)) return 'target';
    return null;
  }

  // Word-wrap text to a width (cached by text + width).
  lines(ctx, text, width) {
    const key = `${width}|${text}`;
    let out = this._wrap.get(key);
    if (out) return out;
    ctx.font = `${BODY}px ${this.font}`;
    out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > width && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    if (line) out.push(line);
    this._wrap.set(key, out);
    return out;
  }

  // opts: { block, next } — next: show the "Got it" button.
  render(ctx, step, target, { block = true, next = false } = {}) {
    const sr = this.layout.safeRect;
    const W = this.layout.renderer.width;
    const H = this.layout.renderer.height;
    const pad = 14;
    const hole = target ? { x: target.x - pad, y: target.y - pad, w: target.w + pad * 2, h: target.h + pad * 2 } : null;

    // Dim everything except the hole.
    ctx.save();
    ctx.fillStyle = block ? COL.overlay : COL.overlay;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    if (hole) roundRect(ctx, hole.x, hole.y, hole.w, hole.h, 22, true);
    ctx.fill('evenodd');

    // Glowing ring round the target.
    if (hole) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      ctx.strokeStyle = `rgba(255,183,77,${0.35 + 0.35 * pulse})`;
      ctx.lineWidth = 14 + pulse * 10;
      roundRect(ctx, hole.x, hole.y, hole.w, hole.h, 22);
      ctx.stroke();
      ctx.strokeStyle = COL.action;
      ctx.lineWidth = 6;
      roundRect(ctx, hole.x, hole.y, hole.w, hole.h, 22);
      ctx.stroke();
    }

    // Speech box size.
    const boxW = Math.min(sr.w - 48, 900);
    const textX = PAD + FACE + 22;
    const textW = boxW - textX - PAD;
    const lines = this.lines(ctx, step.text, textW);
    const artH = step.art ? ART_H + 16 : 0;
    const bodyH = Math.max(FACE, TITLE + 14 + lines.length * LINE);
    const boxH = PAD + artH + bodyH + 20 + BTN_H + PAD;

    // Place it: below the target, else above, else wherever there is more room (never on the target).
    const x = sr.x + (sr.w - boxW) / 2;
    let y;
    let arrow = null;
    if (!hole) y = sr.y + (sr.h - boxH) / 2;
    else {
      const below = sr.y + sr.h - (hole.y + hole.h) - 34;
      const above = hole.y - sr.y - 34;
      if (below >= boxH) {
        y = hole.y + hole.h + 30;
        arrow = 'up';
      } else if (above >= boxH) {
        y = hole.y - 30 - boxH;
        arrow = 'down';
      } else if (below >= above) {
        y = hole.y + hole.h + 30;
        arrow = 'up';
      } else {
        y = Math.max(sr.y, hole.y - 30 - boxH);
        arrow = 'down';
      }
    }
    const box = { x, y, w: boxW, h: boxH };

    ctx.shadowColor = COL.overlay;
    ctx.shadowBlur = 24;
    ctx.fillStyle = COL.sheet; // warm cream (bible §33.1)
    roundRect(ctx, box.x, box.y, box.w, box.h, 28);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = COL.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    if (arrow && hole) {
      const ax = Math.min(box.x + box.w - 60, Math.max(box.x + 60, hole.x + hole.w / 2));
      ctx.fillStyle = COL.sheet;
      ctx.beginPath();
      if (arrow === 'up') {
        ctx.moveTo(ax - 22, box.y + 2);
        ctx.lineTo(ax, box.y - 24);
        ctx.lineTo(ax + 22, box.y + 2);
      } else {
        ctx.moveTo(ax - 22, box.y + box.h - 2);
        ctx.lineTo(ax, box.y + box.h + 24);
        ctx.lineTo(ax + 22, box.y + box.h - 2);
      }
      ctx.fill();
    }

    let cy = box.y + PAD;
    if (step.art) {
      this.assets.drawContained(ctx, step.art, { x: box.x + PAD, y: cy, w: box.w - PAD * 2, h: ART_H });
      cy += ART_H + 16;
    }
    // Friendly face (cropped from a full-body picture).
    if (this.face) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(box.x + PAD + FACE / 2, cy + FACE / 2, FACE / 2, 0, Math.PI * 2);
      ctx.fillStyle = COL.panelGold;
      ctx.fill();
      ctx.clip();
      this.assets.drawCrop(ctx, this.face.key, this.face.crop, { x: box.x + PAD, y: cy, w: FACE, h: FACE });
      ctx.restore();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COL.text;
    ctx.font = `bold ${TITLE}px ${this.font}`;
    ctx.fillText(step.title, box.x + textX, cy, textW);
    ctx.font = `${BODY}px ${this.font}`;
    ctx.fillStyle = COL.text;
    lines.forEach((l, i) => ctx.fillText(l, box.x + textX, cy + TITLE + 14 + i * LINE));

    // Buttons: [Guide off] [Skip] ........ [Got it]
    const by = box.y + box.h - PAD - BTN_H;
    const buttons = {};
    buttons.off = { x: box.x + PAD, y: by, w: 230, h: BTN_H };
    buttons.skip = { x: box.x + PAD + 244, y: by, w: 180, h: BTN_H };
    if (next) buttons.next = { x: box.x + box.w - PAD - 250, y: by, w: 250, h: BTN_H };
    drawPill(ctx, buttons.off, this.labels.off, false, this.font);
    drawPill(ctx, buttons.skip, this.labels.skip, false, this.font);
    if (next) drawPill(ctx, buttons.next, this.labels.next, true, this.font);
    else {
      ctx.fillStyle = COL.gold;
      ctx.font = `bold 28px ${this.font}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(hole ? (step.hint ?? 'Tap the glowing spot') : '', box.x + box.w - PAD, by + BTN_H / 2, box.w - PAD * 2 - 440);
    }
    ctx.restore();
    this.last = { box, target: hole, buttons };
  }
}

function inside(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Rounded rect path. hole: add counter-clockwise (for even-odd cut-outs it does not matter, but keeps intent clear).
function roundRect(ctx, x, y, w, h, r, sub = false) {
  if (!sub) ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// The guide's buttons are the shared themed buttons (Milestone 17b): orange for Got it, quieter for the others.
function drawPill(ctx, r, label, primary) {
  drawButton(ctx, r, label, { accent: primary ? COL.action : COL.textMuted });
}
