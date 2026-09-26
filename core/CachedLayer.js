// A picture of something that rarely changes (e.g. the floor and walls), drawn once into an
// offscreen canvas and copied to the screen each frame (bible §40.1). Call invalidate() when the
// layout changes; a pixel-scale change (resize) also triggers a redraw.
//   draw(g) paints in logical units inside a width×height box.
export class CachedLayer {
  constructor({ width, height, draw }) {
    this.width = width;
    this.height = height;
    this.drawFn = draw;
    this.pixelScale = 1;
    this.canvas = null;
    this.dirty = true;
    this.rebuilds = 0; // how many times it has been redrawn (for checks)
  }

  invalidate() {
    this.dirty = true;
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.dirty = true;
  }

  setPixelScale(scale) {
    if (!(scale > 0) || Math.abs(scale - this.pixelScale) < 1e-4) return;
    this.pixelScale = scale;
    this.dirty = true;
  }

  rebuild() {
    const ps = this.pixelScale;
    const c = this.canvas || document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.width * ps));
    c.height = Math.max(1, Math.round(this.height * ps));
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(c.width / this.width, 0, 0, c.height / this.height, 0, 0);
    this.drawFn(g);
    this.canvas = c;
    this.dirty = false;
    this.rebuilds++;
  }

  render(ctx, x = 0, y = 0) {
    if (this.dirty || !this.canvas) this.rebuild();
    ctx.drawImage(this.canvas, x, y, this.width, this.height);
  }
}
