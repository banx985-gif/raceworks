// Loads images by key. A missing or broken file never crashes the game:
// it is logged once and drawn as a clearly visible placeholder box instead.
// Drawing goes through a SpriteCache: each image is shrunk once to the size it is shown at,
// then that small copy is drawn every frame (bible §40.1).
import { SpriteCache } from './SpriteCache.js';

export class AssetManager {
  constructor({ basePath = '', bus = null } = {}) {
    this.basePath = basePath;
    this.bus = bus;
    this.images = new Map(); // key → HTMLImageElement (loaded OK)
    this.missing = new Map(); // key → src that failed
    this.sprites = new SpriteCache();
    this.detail = 1; // extra resolution for world drawing under a zoomed camera (see sprite())
  }

  // manifest: { key: 'path/to/file.png', ... }. Always resolves, even if files fail.
  async loadImages(manifest, onProgress) {
    const entries = Object.entries(manifest);
    let done = 0;
    await Promise.all(
      entries.map(([key, src]) =>
        this.loadImage(key, src).then(() => {
          done++;
          onProgress?.(done, entries.length);
        }),
      ),
    );
    return { loaded: this.images.size, missing: [...this.missing.keys()] };
  }

  loadImage(key, src) {
    const url = this.basePath + src;
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.images.set(key, img);
        this.missing.delete(key);
        resolve(img);
      };
      img.onerror = () => {
        this.missing.set(key, url);
        console.warn(`[AssetManager] missing image "${key}" (${url}) — using placeholder`);
        this.bus?.emit('asset:missing', { key, url });
        resolve(null);
      };
      img.src = url;
    });
  }

  has(key) {
    return this.images.has(key);
  }

  get(key) {
    return this.images.get(key) || null;
  }

  // Width ÷ height of an image (1 if it is missing).
  aspect(key) {
    const img = this.images.get(key);
    return img ? img.naturalWidth / img.naturalHeight : 1;
  }

  // Real screen pixels per logical unit; call after every resize (clears the size cache).
  setPixelScale(scale) {
    return this.sprites.setPixelScale(scale);
  }

  // The display-size copy of an image for a logical w×h (null if the image is missing). While `detail` is above 1
  // (a zoomed-in camera draws everything bigger on screen) the copy is made that much larger, so it stays sharp.
  sprite(key, w, h) {
    const img = this.images.get(key);
    return img ? this.sprites.get(key, img, w * this.detail, h * this.detail) : null;
  }

  // Draws the image at x, y, w×h (logical units), or a placeholder of the same size if it is not available.
  // Positions are snapped to whole screen pixels so the cached copy lands 1:1 and stays sharp.
  draw(ctx, key, x, y, w, h) {
    const img = this.images.get(key);
    if (img) {
      const dw = w ?? img.naturalWidth;
      const dh = h ?? img.naturalHeight;
      const ps = this.sprites.pixelScale * this.detail;
      ctx.drawImage(this.sprites.get(key, img, dw * this.detail, dh * this.detail), Math.round(x * ps) / ps, Math.round(y * ps) / ps, dw, dh);
      return true;
    }
    this.drawPlaceholder(ctx, key, x, y, w ?? 128, h ?? 128);
    return false;
  }

  // Fit the image inside box r keeping its shape. align: 'center' | 'bottom'. Returns the drawn size.
  drawContained(ctx, key, r, align = 'center') {
    const img = this.images.get(key);
    if (!img) {
      this.drawPlaceholder(ctx, key, r.x, r.y, r.w, r.h);
      return null;
    }
    const s = Math.min(r.w / img.naturalWidth, r.h / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    const y = align === 'bottom' ? r.y + r.h - h : r.y + (r.h - h) / 2;
    this.draw(ctx, key, r.x + (r.w - w) / 2, y, w, h);
    return { w, h };
  }

  // Draw part of an image: crop = { x, y, w, h } as fractions of the image, into box r (e.g. a face from a full-body picture).
  drawCrop(ctx, key, crop, r) {
    const img = this.images.get(key);
    if (!img) {
      this.drawPlaceholder(ctx, key, r.x, r.y, r.w, r.h);
      return;
    }
    const sprite = this.sprites.get(key, img, (r.w / crop.w) * this.detail, (r.h / crop.h) * this.detail);
    ctx.drawImage(sprite, crop.x * sprite.width, crop.y * sprite.height, crop.w * sprite.width, crop.h * sprite.height, r.x, r.y, r.w, r.h);
  }

  drawPlaceholder(ctx, label, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#3a1d3f';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ff4fd8';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
    const size = Math.max(12, Math.min(28, w / 8));
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`missing: ${label}`, x + w / 2, y + h / 2, w - 12);
    ctx.restore();
  }
}
