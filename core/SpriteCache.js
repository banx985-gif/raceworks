// Display-size copies of source images (bible §40.1: never resize big images every frame).
// The first time an image is asked for at a size, a copy is made at exactly the screen's real
// pixel size, shrinking in halves for a clean result (one big jump looks jagged or muddy).
// After that the copy is drawn 1:1, which is fast and sharp. When the screen's pixel scale
// changes (window resize, rotate) every copy is thrown away and remade on demand.
export class SpriteCache {
  constructor({ maxSizesPerImage = 16 } = {}) {
    this.pixelScale = 1; // real screen pixels per logical unit
    this.maxSizesPerImage = maxSizesPerImage;
    this.byKey = new Map(); // key → Map(sizeCode → canvas)
    this.stats = { made: 0, hits: 0, cleared: 0 };
  }

  setPixelScale(scale) {
    if (!(scale > 0) || Math.abs(scale - this.pixelScale) < 1e-4) return false;
    this.pixelScale = scale;
    this.clear();
    return true;
  }

  clear() {
    this.byKey.clear();
    this.stats.cleared++;
  }

  // Size in real pixels for a logical size.
  pixels(w, h) {
    return { pw: Math.max(1, Math.round(w * this.pixelScale)), ph: Math.max(1, Math.round(h * this.pixelScale)) };
  }

  // The copy of `img` for a logical w×h, made once and reused. key names the image.
  get(key, img, w, h) {
    const pw = Math.max(1, Math.round(w * this.pixelScale));
    const ph = Math.max(1, Math.round(h * this.pixelScale));
    const code = pw * 65536 + ph; // number key: no string built per frame
    let sizes = this.byKey.get(key);
    if (!sizes) {
      sizes = new Map();
      this.byKey.set(key, sizes);
    }
    const hit = sizes.get(code);
    if (hit) {
      this.stats.hits++;
      return hit;
    }
    const copy = SpriteCache.resample(img, pw, ph);
    if (sizes.size >= this.maxSizesPerImage) sizes.delete(sizes.keys().next().value); // oldest size goes
    sizes.set(code, copy);
    this.stats.made++;
    return copy;
  }

  get count() {
    let n = 0;
    for (const s of this.byKey.values()) n += s.size;
    return n;
  }

  // Shrink an image to pw×ph real pixels, halving step by step until the last step is under 2×.
  static resample(img, pw, ph) {
    let src = img;
    let sw = img.naturalWidth || img.width;
    let sh = img.naturalHeight || img.height;
    while (sw >= pw * 2 && sh >= ph * 2) {
      const nw = Math.max(pw, Math.floor(sw / 2));
      const nh = Math.max(ph, Math.floor(sh / 2));
      src = SpriteCache.draw(src, nw, nh);
      sw = nw;
      sh = nh;
    }
    return SpriteCache.draw(src, pw, ph);
  }

  static draw(src, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    return c;
  }
}
