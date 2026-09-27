// The car build you can watch in the Pit Bay (Milestone 4, style guide §5): one stage per phase instead of a bar.
// Only existing art is used — tinted, faded, masked, moved and flashed, never drawn on.
//   1 Concept & Regulations  a cyan blueprint of the car on a grid, flickering in
//   2 Chassis & Aero         the bare chassis (the Steel Tub part) settles on the bay; the bodywork hovers above
//   3 Powertrain             the engine, then the gearbox, drop into the chassis, with sparks
//   4 Assembly & Setup       the real car is revealed bottom-to-top over a dark silhouette, sparks along the edge
//   5 Testing & Tuning       the finished car on the bay
// Finished: a white flash and a gold sparkle over the car (then the result screen).
// Faults puff smoke over the bay, breakthroughs burst into a gold sparkle.
// Milestone 8: while the crew is at work (busy()), small code sparks fly and light smoke drifts up off the bay — welding
// sparks on the chassis and engine stages, along the reveal edge in Assembly, exhaust puffs in Testing. Light and capped:
// at most WORK.maxParticles at once, from a fixed pool (nothing is made while it runs), and never more than
// WORK.maxEffects smoke / sparkle bursts queued.
//   createBuildShow({ assets, pixelScale, busy }) → { draw(ctx, view), event(kind), reveal(), update(dt), stageOf(job) }
//   view: { job (or null), fraction (0–1 through the phase), carKey, partKeys, at: { x, y } (bay floor, world),
//           width (car width, world), lastCar (art key of the last finished car, shown on an empty bay) }
import { BUILD_ART } from '../../data/cars.js';

const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const BLUEPRINT = '#4FC3F7';
const SILHOUETTE = '#2A2A33';
const WORK = { maxParticles: 36, maxEffects: 6, sparksPerSec: 16, smokePerSec: 1.6 };
const SPARK_COLOURS = ['#FFF6C2', '#FFD166', '#FFB74D', '#FFFFFF'];

export function createBuildShow({ assets, pixelScale, busy = () => false }) {
  let time = 0;
  let lastBox = null; // the car's box on the bay (world), from the last draw: where the work effects start
  let lastStage = -1;
  let sparkDebt = 0;
  let smokeDebt = 0;
  const pool = Array.from({ length: WORK.maxParticles }, () => ({ on: false, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, colour: '#FFF' }));
  const live = () => pool.reduce((n, p) => n + (p.on ? 1 : 0), 0);
  const effects = []; // { kind: 'smoke' | 'sparkle' | 'fix' | 'reveal', age, life }
  const tints = new Map(); // key|color|w → canvas

  // The art washed over in one colour (strength 0–1: 1 = a flat silhouette; less keeps the car's lines showing through),
  // made once per size.
  function tinted(key, color, w, h, strength = 1) {
    const img = assets.get(key);
    if (!img) return null;
    const s = pixelScale() * 1.3;
    const id = `${key}|${color}|${strength}|${Math.round(w * s)}`;
    let c = tints.get(id);
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * s));
      c.height = Math.max(1, Math.round(h * s));
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = strength;
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      tints.set(id, c);
    }
    return c;
  }

  const stageOf = (job) => (job ? job.phaseIndex : -1);

  // --- work sparks and smoke (procedural) -------------------------------------------------------------------------
  function spawn(kind, x, y) {
    const p = pool.find((q) => !q.on);
    if (!p) return; // the cap: a busy bay just stops adding
    const r = Math.random;
    p.on = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.age = 0;
    if (kind === 'spark') {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
      const sp = 160 + r() * 220;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = 0.35 + r() * 0.35;
      p.size = 2.5 + r() * 2.5;
      p.colour = SPARK_COLOURS[Math.floor(r() * SPARK_COLOURS.length)];
    } else {
      p.vx = (r() - 0.5) * 18;
      p.vy = -(26 + r() * 22);
      p.life = 1.6 + r() * 0.8;
      p.size = 16 + r() * 12;
    }
  }
  // Where the work is happening on each stage (a point on the car's box).
  function workPoint(stage, b) {
    const r = Math.random;
    if (stage === 1 || stage === 2) return { x: b.x + b.w * (0.3 + r() * 0.4), y: b.y + b.h * (0.55 + r() * 0.2) };
    if (stage === 3) return { x: b.x + b.w * (0.15 + r() * 0.7), y: b.y + b.h * (0.35 + r() * 0.4) };
    return { x: b.x + b.w * 0.86, y: b.y + b.h * 0.62 }; // Testing: the exhaust
  }
  function updateWork(dt) {
    const on = busy() && lastBox && lastStage >= 1;
    if (on) {
      const sparksOn = lastStage >= 1 && lastStage <= 3;
      sparkDebt += dt * (sparksOn ? WORK.sparksPerSec : 0);
      smokeDebt += dt * WORK.smokePerSec * (lastStage === 4 ? 0.8 : 1);
      while (sparkDebt >= 1) {
        sparkDebt -= Math.max(1, 3 * Math.random());
        const q = workPoint(lastStage, lastBox);
        for (let i = 0; i < 3; i++) spawn('spark', q.x, q.y);
      }
      while (smokeDebt >= 1) {
        smokeDebt -= 1;
        const q = workPoint(lastStage, lastBox);
        spawn('smoke', q.x, q.y - 10);
      }
    } else sparkDebt = smokeDebt = 0;
    for (const p of pool) {
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.on = false;
        continue;
      }
      if (p.kind === 'spark') p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  function drawWork(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of pool) {
      if (!p.on) continue;
      const t = p.age / p.life;
      if (p.kind === 'spark') {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = p.colour;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.globalAlpha = 0.32 * (1 - t) * Math.min(1, t * 6);
        ctx.fillStyle = '#EDEFF2';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + t * 1.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function carBox(v) {
    const w = v.width;
    const h = w / assets.aspect(v.carKey);
    return { x: v.at.x - w / 2, y: v.at.y - h, w, h };
  }

  function drawBlueprint(ctx, v, alpha) {
    const b = carBox(v);
    const img = tinted(v.carKey, BLUEPRINT, b.w, b.h, 0.72);
    ctx.save();
    ctx.globalAlpha = alpha * 0.25;
    ctx.strokeStyle = BLUEPRINT;
    ctx.lineWidth = 2;
    for (let x = b.x - 20; x <= b.x + b.w + 20; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, b.y - 10);
      ctx.lineTo(x, b.y + b.h + 6);
      ctx.stroke();
    }
    for (let y = b.y - 10; y <= b.y + b.h + 6; y += 26) {
      ctx.beginPath();
      ctx.moveTo(b.x - 20, y);
      ctx.lineTo(b.x + b.w + 20, y);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    if (img) ctx.drawImage(img, b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  function part(ctx, key, cx, bottom, w, alpha = 1) {
    const h = w / assets.aspect(key);
    ctx.save();
    ctx.globalAlpha = alpha;
    assets.draw(ctx, key, cx - w / 2, bottom - h, w, h);
    ctx.restore();
  }

  function sparks(ctx, x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    assets.drawContained(ctx, BUILD_ART.sparks, { x: x - size / 2, y: y - size / 2, w: size, h: size });
    ctx.restore();
  }

  function drawStage(ctx, v) {
    const k = v.fraction;
    const b = carBox(v);
    const flick = 0.85 + 0.15 * Math.sin(time * 9);
    const [pu, tr, ch, ae] = v.partKeys;
    switch (stageOf(v.job)) {
      case 0: // blueprint, fading in with the phase
        drawBlueprint(ctx, v, (0.35 + 0.55 * ease(k)) * flick);
        break;
      case 1: // bare chassis settles; bodywork hovers in above it
        drawBlueprint(ctx, v, 0.3);
        part(ctx, ch, v.at.x, v.at.y - 4, b.w * (0.55 + 0.1 * ease(k)));
        if (k > 0.35) part(ctx, ae, v.at.x, b.y + b.h * 0.25 - 14 * Math.sin(time * 2), b.w * 0.5, ease((k - 0.35) / 0.65) * 0.9);
        break;
      case 2: {
        // engine, then gearbox, drop into the chassis
        drawBlueprint(ctx, v, 0.2);
        part(ctx, ch, v.at.x, v.at.y - 4, b.w * 0.65);
        const drop = (t) => ease(t) * b.h * 0.9;
        part(ctx, pu, v.at.x - b.w * 0.12, b.y - b.h * 0.5 + drop(k / 0.6), b.w * 0.3);
        if (k > 0.4) part(ctx, tr, v.at.x + b.w * 0.14, b.y - b.h * 0.5 + drop((k - 0.4) / 0.6), b.w * 0.26);
        if (Math.sin(time * 7) > 0.3) sparks(ctx, v.at.x, v.at.y - b.h * 0.35, b.w * 0.3, 0.8);
        break;
      }
      case 3: {
        // the real car appears bottom-to-top over its dark silhouette, sparks along the edge
        const dark = tinted(v.carKey, SILHOUETTE, b.w, b.h, 0.92);
        ctx.save();
        ctx.globalAlpha = 0.55;
        if (dark) ctx.drawImage(dark, b.x, b.y, b.w, b.h);
        ctx.restore();
        const edge = b.y + b.h * (1 - ease(k));
        ctx.save();
        ctx.beginPath();
        ctx.rect(b.x - 10, edge, b.w + 20, b.y + b.h - edge + 10);
        ctx.clip();
        assets.draw(ctx, v.carKey, b.x, b.y, b.w, b.h);
        ctx.restore();
        if (k < 0.98) sparks(ctx, b.x + b.w * (0.5 + 0.4 * Math.sin(time * 3)), edge, b.w * 0.22, 0.9);
        break;
      }
      case 4: // the finished car, on test
        assets.draw(ctx, v.carKey, b.x, b.y, b.w, b.h);
        break;
      default:
        if (v.lastCar) assets.draw(ctx, v.lastCar, b.x, b.y, b.w, b.h);
    }
  }

  function drawEffects(ctx, v) {
    const b = carBox(v);
    for (const e of effects) {
      const t = e.age / e.life;
      ctx.save();
      if (e.kind === 'smoke') {
        ctx.globalAlpha = Math.min(1, (1 - t) * 1.6);
        const s = b.w * (0.45 + 0.35 * t);
        assets.drawContained(ctx, BUILD_ART.smoke, { x: v.at.x - s / 2, y: b.y - s * 0.4 - t * 60, w: s, h: s });
      } else if (e.kind === 'sparkle' || e.kind === 'fix') {
        ctx.globalAlpha = Math.min(1, (1 - t) * 1.5);
        const s = b.w * (e.kind === 'fix' ? 0.4 : 0.7) * (0.6 + 0.6 * ease(t * 2));
        assets.drawContained(ctx, BUILD_ART.sparkle, { x: v.at.x - s / 2, y: b.y + b.h * 0.4 - s / 2, w: s, h: s });
      } else if (e.kind === 'reveal') {
        const s = b.w * (0.8 + 1.0 * ease(t * 1.5));
        ctx.globalAlpha = Math.max(0, 1 - t);
        assets.drawContained(ctx, BUILD_ART.sparkle, { x: v.at.x - s / 2, y: b.y + b.h / 2 - s / 2, w: s, h: s });
        ctx.globalAlpha = Math.max(0, 0.9 - t * 3);
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(v.at.x, b.y + b.h / 2, b.w * 0.9, b.h * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  return {
    stageOf,
    get effects() {
      return effects;
    },
    get particles() {
      return live();
    },
    event(kind) {
      if (effects.length >= WORK.maxEffects) effects.shift(); // capped: the oldest burst gives way
      effects.push({ kind, age: 0, life: kind === 'reveal' ? 2.4 : kind === 'smoke' ? 2.2 : 1.6 });
    },
    update(dt) {
      time += dt;
      for (const e of effects) e.age += dt;
      for (let i = effects.length - 1; i >= 0; i--) if (effects[i].age >= effects[i].life) effects.splice(i, 1);
      updateWork(dt);
    },
    draw(ctx, v) {
      lastBox = carBox(v);
      lastStage = stageOf(v.job);
      drawStage(ctx, v);
      drawWork(ctx);
      drawEffects(ctx, v);
    },
  };
}
