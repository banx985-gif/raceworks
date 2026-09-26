// Station → menu framework (any game, Milestone 17b): tap something in the world and a big, bright sheet slides up
// over the lower part of the screen, the world still visible above it.
//
// A menu is plain data the game builds when it opens (and again every frame while open, so numbers stay live):
//   { title, subtitle, art (image key), accent,
//     sections: [ { title?, lines?: [text], buttons?: [{ id, label, sub?, icon?, disabled?, badge?, accent?, onTap }],
//                   columns? (buttons per row, default 2) } ] }
// A MenuRegistry maps what was tapped (a station type, 'worker', 'floor'…) to the function that builds its menu.
//   sheet.open(builder) — builder() → menu        sheet.close()        sheet.active
//   sheet.handleInput(hook, p) → true when the sheet used it (tap a button, tap above it to close, drag to scroll)
//   sheet.update(dt)  sheet.render(ctx)           sheet.buttonRect(id) → screen rect (tests, the guide)
import { THEME, font } from '../Theme.js';
import { drawButton, hitRect } from './Button.js';

export class MenuRegistry {
  constructor() {
    this.builders = new Map();
  }

  register(kind, build) {
    this.builders.set(kind, build);
    return this;
  }

  has(kind) {
    return this.builders.has(kind);
  }

  // A function that builds the menu for this target (for sheet.open), or null.
  for(kind, target) {
    const b = this.builders.get(kind);
    return b ? () => b(target) : null;
  }
}

const PAD = 36;
const HEAD_H = 230;
const BTN_H = 124;
const BTN_SUB_H = 150;
const GAP = 18;

export class BottomSheet {
  constructor({ layout, assets, maxFrac = 0.66, onClose = null }) {
    this.layout = layout;
    this.assets = assets;
    this.maxFrac = maxFrac; // at most this share of the screen height
    this.onClose = onClose;
    this.builder = null;
    this.menu = null;
    this.t = 0;
    this.scrollY = 0;
    this.drag = null;
    this.rects = []; // { id, rect (content coordinates), button }
    this.contentH = 0;
  }

  get active() {
    return !!this.builder;
  }

  open(builder) {
    this.builder = builder;
    this.menu = builder();
    this.t = 0;
    this.scrollY = 0;
  }

  close() {
    if (!this.builder) return;
    this.builder = null;
    this.menu = null;
    this.onClose?.();
  }

  // Refresh the menu's words (called each frame while open).
  refresh() {
    if (this.builder) this.menu = this.builder() ?? this.menu;
  }

  // The sheet's rect on screen.
  rect() {
    const sr = this.layout.safeRect;
    const h = Math.min(sr.h * this.maxFrac, HEAD_H + this.contentH + PAD * 2);
    const slide = 1 - Math.min(1, this.t / 0.22);
    return { x: sr.x, y: sr.y + sr.h - h + slide * slide * h * 0.6, w: sr.w, h: h + 40 };
  }

  bodyRect() {
    const r = this.rect();
    return { x: r.x + PAD, y: r.y + HEAD_H, w: r.w - PAD * 2, h: r.h - HEAD_H - 40 - PAD };
  }

  get maxScroll() {
    return Math.max(0, this.contentH - this.bodyRect().h);
  }

  // Scroll so a button is fully in view (the guide points at it).
  scrollTo(id) {
    const hit = this.rects.find((x) => x.id === id);
    if (!hit) return false;
    const b = this.bodyRect();
    if (hit.rect.y < this.scrollY) this.scrollY = hit.rect.y;
    else if (hit.rect.y + hit.rect.h > this.scrollY + b.h) this.scrollY = Math.min(this.maxScroll, hit.rect.y + hit.rect.h - b.h);
    return true;
  }

  // Where a button is on screen right now (null if not showing or scrolled away).
  buttonRect(id) {
    const hit = this.rects.find((x) => x.id === id);
    if (!hit) return null;
    const b = this.bodyRect();
    const y = b.y + hit.rect.y - this.scrollY;
    if (y < b.y - 1 || y + hit.rect.h > b.y + b.h + 1) return null;
    return { x: b.x + hit.rect.x, y, w: hit.rect.w, h: hit.rect.h };
  }

  update(dt) {
    if (!this.builder) return;
    this.t += dt;
    this.refresh();
  }

  handleInput(hook, p) {
    if (!this.builder) return false;
    const r = this.rect();
    if (hook === 'onTap') {
      if (p.y < r.y) {
        this.close(); // tap the world above: close
        return true;
      }
      const b = this.bodyRect();
      for (const x of this.rects) {
        const sr = { x: b.x + x.rect.x, y: b.y + x.rect.y - this.scrollY, w: x.rect.w, h: x.rect.h };
        if (sr.y < b.y - 1 || sr.y > b.y + b.h) continue;
        if (hitRect(p, sr)) {
          if (!x.button.disabled) x.button.onTap?.();
          return true;
        }
      }
      if (hitRect(p, this.closeRect())) this.close();
      return true;
    }
    if (hook === 'onDragStart') {
      if (p.startY < r.y) return false; // a drag on the world above still pans it
      this.drag = { id: p.id, y: p.y, start: this.scrollY };
      return true;
    }
    if (hook === 'onDrag') {
      if (!this.drag || p.id !== this.drag.id) return false;
      this.scrollY = Math.min(this.maxScroll, Math.max(0, this.drag.start - (p.y - this.drag.y)));
      return true;
    }
    if (hook === 'onDragEnd') {
      if (!this.drag || p.id !== this.drag.id) return false;
      this.drag = null;
      return true;
    }
    if (hook === 'onHold' || hook === 'onWheel') return p.y >= r.y;
    return false;
  }

  closeRect() {
    const r = this.rect();
    return { x: r.x + r.w - PAD - 130, y: r.y + 30, w: 130, h: 110 };
  }

  // Lay the sections out (content coordinates). Also measures the text for wrapping.
  _layout(ctx, w) {
    const C = THEME.color;
    const S = THEME.size;
    const items = [];
    this.rects = [];
    let y = 0;
    for (const sec of this.menu?.sections ?? []) {
      if (sec.title) {
        items.push({ kind: 'title', text: sec.title, y });
        y += 58;
      }
      for (const line of sec.lines ?? []) {
        const lines = wrap(ctx, typeof line === 'string' ? line : line.text, w, font(S.body));
        for (const l of lines) {
          items.push({ kind: 'line', text: l, y, color: line.color ?? C.text });
          y += 46;
        }
      }
      if (sec.lines?.length) y += 10;
      const cols = sec.columns ?? 2;
      const btns = sec.buttons ?? [];
      const bw = (w - GAP * (cols - 1)) / cols;
      for (let i = 0; i < btns.length; i += cols) {
        const row = btns.slice(i, i + cols);
        const h = row.some((b) => b.sub) ? BTN_SUB_H : BTN_H;
        row.forEach((b, j) => {
          const rect = { x: j * (bw + GAP), y, w: bw, h };
          this.rects.push({ id: b.id, rect, button: b });
          items.push({ kind: 'button', button: b, rect });
        });
        y += h + GAP;
      }
      y += 16;
    }
    this.contentH = y;
    return items;
  }

  render(ctx) {
    if (!this.builder || !this.menu) return;
    const C = THEME.color;
    const S = THEME.size;
    const m = this.menu;
    const sr = this.layout.safeRect;
    ctx.save();
    // Soft veil over the world (it stays visible).
    ctx.fillStyle = C.overlay;
    ctx.globalAlpha = Math.min(1, this.t / 0.2) * 0.6;
    ctx.fillRect(0, 0, sr.x * 2 + sr.w, this.rect().y + 40);
    ctx.globalAlpha = 1;
    const items = this._layout(ctx, this.bodyRect().w);
    const r = this.rect();
    // Sheet
    ctx.fillStyle = C.sheet;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, [44, 44, 0, 0]);
    else ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = m.accent ?? C.action;
    ctx.fillRect(r.x + r.w / 2 - 70, r.y + 14, 140, 10); // grab handle
    // Header: picture, title, subtitle, close
    const art = { x: r.x + PAD, y: r.y + 36, w: 180, h: 180 };
    if (m.art) {
      ctx.fillStyle = C.panelAlt;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(art.x, art.y, art.w, art.h, 28);
      else ctx.rect(art.x, art.y, art.w, art.h);
      ctx.fill();
      this.assets.drawContained(ctx, m.art, { x: art.x + 8, y: art.y + 8, w: art.w - 16, h: art.h - 16 });
    }
    const tx = m.art ? art.x + art.w + 28 : r.x + PAD;
    const tw = this.closeRect().x - 20 - tx;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.text;
    ctx.font = font(S.title, true);
    ctx.fillText(m.title ?? '', tx, r.y + 48, tw);
    if (m.subtitle) {
      ctx.fillStyle = C.textMuted;
      ctx.font = font(S.body);
      wrap(ctx, m.subtitle, tw, font(S.body))
        .slice(0, 2)
        .forEach((l, i) => ctx.fillText(l, tx, r.y + 124 + i * 44, tw));
    }
    drawButton(ctx, this.closeRect(), '✕', { accent: C.outline });
    // Body (scrolls)
    const b = this.bodyRect();
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x - 12, b.y, b.w + 24, b.h + 20);
    ctx.clip();
    ctx.translate(b.x, b.y - this.scrollY);
    for (const it of items) {
      if (it.kind === 'title') {
        ctx.fillStyle = C.actionDark;
        ctx.font = font(S.heading, true);
        ctx.textBaseline = 'top';
        ctx.fillText(it.text, 0, it.y + 4, b.w);
      } else if (it.kind === 'line') {
        ctx.fillStyle = it.color;
        ctx.font = font(S.body);
        ctx.textBaseline = 'top';
        ctx.fillText(it.text, 0, it.y, b.w);
      } else this._button(ctx, it.button, it.rect);
    }
    ctx.restore();
    if (this.maxScroll > 0) {
      const barH = Math.max(80, (b.h * b.h) / this.contentH);
      const barY = b.y + (this.scrollY / this.maxScroll) * (b.h - barH);
      ctx.fillStyle = C.line;
      ctx.fillRect(r.x + r.w - 16, barY, 8, barH);
    }
    ctx.restore();
  }

  _button(ctx, bt, rect) {
    const C = THEME.color;
    const S = THEME.size;
    drawButton(ctx, rect, '', { accent: bt.accent, disabled: bt.disabled, badge: bt.badge ?? null });
    const iconS = Math.min(rect.h - 36, 96);
    let x = rect.x + 20;
    if (bt.icon) {
      this.assets.drawContained(ctx, bt.icon, { x, y: rect.y + (rect.h - 8 - iconS) / 2, w: iconS, h: iconS });
      x += iconS + 16;
    }
    const w = rect.x + rect.w - 16 - x;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = bt.disabled ? C.textFaint : C.textOnAction;
    ctx.font = font(S.button, true);
    const cy = rect.y + (rect.h - 8) / 2;
    ctx.fillText(bt.label, x, bt.sub ? cy - 22 : cy, w);
    if (bt.sub) {
      ctx.font = font(S.small, true);
      ctx.fillStyle = bt.disabled ? C.textFaint : C.textOnAction;
      ctx.fillText(bt.sub, x, cy + 24, w);
    }
  }
}

function wrap(ctx, str, w, f) {
  ctx.font = f;
  const out = [];
  let line = '';
  for (const word of String(str ?? '').split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w && line) {
      out.push(line);
      line = word;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}
