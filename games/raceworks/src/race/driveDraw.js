// Drawing a DrivingChallengeController run (Milestone 14's drill view, shared by the Milestone 18 Drive Stint): the course
// in code (surface, kerbs, gates, the racing-line and brake-line aids, the finish line — scenery, like the track art rule)
// and the cars as Aaron's top-down sprites turned in code, seen from a camera that follows the car (north-up with Reduced
// motion). Plus the touch controls: the steering zone lower-left, Brake above it, and (a stint) Push lower-right.
//   drawDriveWorld(ctx, opts) → the camera heading to keep for the next frame
//     opts: { renderer, layout, assets, ctl, camH, reduced, playerSprite, aiSprite(id), others: [{ x, y, h, sprite, alpha }],
//             wet (a wet surface), finish (draw the finish line; default true) }
//   drawDriveControls(ctx, { zone, brake, steer, steering, braking, push: { rect, active } | null })
import { THEME } from '../../../../core/Theme.js';
import { drawButton } from '../../../../core/ui/Button.js';
import { text } from '../../../../core/ui/Kit.js';
import { drawCar } from './trackDraw.js';
import { DRIVE } from '../../data/drills.js';

const C = THEME.color;
const S = THEME.size;
export const DRIVE_PX = 13; // screen px per metre while driving
export const DRIVE_GRASS = '#7DB65A';

function toScreen(x, y, cx, cy, ox, oy, rot) {
  const dx = x - cx;
  const dy = y - cy;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: ox + (dx * c - dy * s) * DRIVE_PX, y: oy + (dx * s + dy * c) * DRIVE_PX };
}

export function drawDriveWorld(ctx, { renderer, layout, assets, ctl, camH, reduced = false, playerSprite, aiSprite = () => null, others = [], wet = null, finish = true }) {
  const PX = DRIVE_PX;
  const st = ctl.state;
  const car = st.car;
  const R = layout.safeRect;
  const isWet = wet ?? st.kind === 'wet';
  // the camera follows the car; it turns with it (the car points up the screen) unless reduced motion is on
  if (!reduced) camH += ((((car.h - camH + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * 0.12;
  const rot = reduced ? 0 : -Math.PI / 2 - camH;
  const ox = R.x + R.w / 2;
  const oy = R.y + R.h * 0.62;
  const T = (x, y) => toScreen(x, y, car.x, car.y, ox, oy, rot);
  ctx.fillStyle = DRIVE_GRASS;
  ctx.fillRect(0, 0, renderer.width, renderer.height);
  const co = st.course;
  const P = co.pts;
  const i0 = Math.max(0, car.i - 70);
  const i1 = Math.min(P.length - 1, car.i + 110);
  const half = co.width / 2;
  const edge = (p, side) => T(p.x - Math.sin(p.h) * side * half, p.y + Math.cos(p.h) * side * half);
  // surface
  ctx.beginPath();
  for (let i = i0; i <= i1; i += 2) {
    const q = edge(P[i], 1);
    i === i0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
  }
  for (let i = i1 - ((i1 - i0) % 2); i >= i0; i -= 2) {
    const q = edge(P[i], -1);
    ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();
  ctx.fillStyle = isWet ? '#4E5A66' : '#6B6560';
  ctx.fill();
  // kerbs on the bends (red / white blocks at both edges)
  for (let i = i0; i < i1; i += 2) {
    if (Math.abs(P[i].k) < 1 / 160) continue; // a circuit's centreline is rarely exactly straight
    for (const side of [-1, 1]) {
      const a = edge(P[i], side);
      const b = edge(P[i + 2], side);
      ctx.strokeStyle = Math.floor(i / 2) % 2 ? '#D8352A' : '#F4F1EA';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  // wet: puddle sheen along the middle
  if (isWet) {
    ctx.fillStyle = 'rgba(160,200,235,0.18)';
    for (let i = i0; i < i1; i += 9) {
      const q = T(P[i].x, P[i].y);
      ctx.beginPath();
      ctx.ellipse(q.x + ((i * 37) % 60) - 30, q.y, 70, 26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the racing-line aid
  if (st.aids.line && st.kind !== 'brake') {
    const pts = ctl.racingLine(car.s - 20, car.s + 200, 4);
    ctx.setLineDash([26, 20]);
    ctx.strokeStyle = 'rgba(53,194,224,0.85)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    pts.forEach((p, n) => {
      const q = T(p.x, p.y);
      n ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // brake markers (the aid) / the Brake Zone boards and line
  const bar = (m, colour, w) => {
    const a = T(m.x - Math.sin(m.h) * half, m.y + Math.cos(m.h) * half);
    const b = T(m.x + Math.sin(m.h) * half, m.y - Math.cos(m.h) * half);
    ctx.strokeStyle = colour;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  if (st.kind === 'brake') {
    for (const m of ctl.brakeMarkers()) if (m.line || st.aids.brake) bar(m, m.line ? '#F4F1EA' : 'rgba(242,134,43,0.9)', m.line ? 16 : 10);
  } else if (st.aids.brake) {
    for (const m of ctl.brakeMarkers()) if (m.s > car.s - 20 && m.s < car.s + 200) bar(m, 'rgba(242,134,43,0.75)', 8);
  }
  // gates: two posts, green when hit, red when missed
  for (const g of st.gates) {
    if (g.s < car.s - 40 || g.s > car.s + 220) continue;
    const p = co.pts[Math.round(g.s / 2)];
    const colour = g.hit === null ? '#F2B233' : g.hit ? '#2E8B57' : '#C8402F';
    for (const side of [-1, 1]) {
      const lat = g.lat + (side * g.w) / 2;
      const q = T(p.x - Math.sin(p.h) * lat, p.y + Math.cos(p.h) * lat);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2A241F';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }
  // finish line
  if (st.kind !== 'brake' && finish) {
    const f = co.pts[Math.min(co.pts.length - 1, Math.round(co.finishAt / 2))];
    if (f.s < car.s + 220) bar(f, '#F4F1EA', 18);
  }
  // cars (Aaron's sprites; nose down in the picture, turned by drawCar)
  const Lc = DRIVE.car.lengthM * PX;
  for (const a of st.ai ?? []) {
    const q = T(a.x, a.y);
    drawCar(ctx, assets, aiSprite(a.id), q.x, q.y, a.h + rot, Lc);
  }
  for (const o of others) {
    const q = T(o.x, o.y);
    if (q.x < -200 || q.y < -200 || q.x > renderer.width + 200 || q.y > renderer.height + 200) continue;
    drawCar(ctx, assets, o.sprite, q.x, q.y, o.h + rot, Lc, { alpha: o.alpha ?? 1 });
  }
  const q = T(car.x, car.y);
  drawCar(ctx, assets, playerSprite, q.x, q.y, car.h + rot, Lc, { ring: 'rgba(242,178,51,0.55)' });
  return camH;
}

export function drawDriveControls(ctx, { zone: z, brake: b, steer = 0, steering = false, braking = false, push = null }) {
  ctx.fillStyle = 'rgba(42,36,31,0.35)';
  ctx.beginPath();
  ctx.roundRect(z.x, z.y, z.w, z.h, 40);
  ctx.fill();
  ctx.strokeStyle = 'rgba(244,241,234,0.8)';
  ctx.lineWidth = 4;
  ctx.stroke();
  const kx = z.x + z.w / 2 + steer * (z.w / 2 - 70);
  ctx.fillStyle = steering ? '#F2862B' : '#F4F1EA';
  ctx.beginPath();
  ctx.arc(kx, z.y + z.h / 2, 62, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, '◀  steer  ▶', z.x + z.w / 2, z.y + z.h - 56, { size: S.small, bold: true, color: '#F4F1EA', align: 'center' });
  drawButton(ctx, b, 'Brake', { accent: C.bad, active: braking });
  if (push) drawButton(ctx, push.rect, 'Push', { accent: C.action, active: push.active, selected: push.active });
}
