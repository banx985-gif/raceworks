// Race effects (Milestone 8, bible §43): light and capped, looks only — nothing here touches the race model.
//   - track spray: soft puffs of dust thrown up behind every moving car (a Push / Attack car throws a little more)
//   - underbody sparks: code sparks under a car braking hard, and now and then the Underbody Sparks art (race_vfx_03)
//   - breakdown smoke: the Breakdown Smoke art (race_vfx_10) drifting over a retired car
//   - pit burst: the Pit-Service Burst art (race_vfx_05) over a car while its crew works on it
// Particles live in track metres, so they stay on the road when the Follow camera moves. A fixed pool: never more
// than FX.maxParticles at once (the rest are simply not made), whatever the speed or field size.
//   const fx = createRaceFx({ assets });
//   fx.step(sim, dtSim, dtReal)   after the race advanced (dtSim = race seconds this frame, 0 when paused)
//   fx.draw(ctx, sim, view, carLen, latScale)   under the cars (spray, sparks) — then fx.drawOver(...) above them
//   fx.reset()   a new race
const FX = {
  maxParticles: 90,
  sprayPerSec: 5, // puffs per second per moving car (real time)
  minSpeed: 18, // m/s: slower than this throws no spray
  brakeDecel: 9, // m/s² of slowing that counts as hard braking (sparks)
  sparkArtEvery: 1.4, // seconds between Underbody Sparks pictures on one car
};
const ART = { sparks: 'race_vfx_03', smoke: 'race_vfx_10', pit: 'race_vfx_05' };
const SPARK_COLOURS = ['#FFF6C2', '#FFD166', '#FFB74D', '#FFFFFF'];

export function createRaceFx({ assets, random = Math.random }) {
  const pool = Array.from({ length: FX.maxParticles }, () => ({ on: false, kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, colour: '#fff' }));
  const lastV = new Map(); // car id → speed at the last step
  const sparkArt = new Map(); // car id → { age } of its current sparks picture
  const debt = new Map(); // car id → spray owed
  const lastSpark = new Map(); // car id → when its last sparks picture showed
  let time = 0;

  function spawn(kind, x, y, vx, vy, life, size, colour = '#fff') {
    const p = pool.find((q) => !q.on);
    if (!p) return false;
    Object.assign(p, { on: true, kind, x, y, vx, vy, age: 0, life, size, colour });
    return true;
  }

  const live = () => pool.reduce((n, p) => n + (p.on ? 1 : 0), 0);

  return {
    get particles() {
      return live();
    },
    reset() {
      for (const p of pool) p.on = false;
      lastV.clear();
      sparkArt.clear();
      debt.clear();
      lastSpark.clear();
    },
    step(sim, dtSim, dtReal) {
      time += dtReal;
      for (const p of pool) {
        if (!p.on) continue;
        p.age += dtReal;
        if (p.age >= p.life) {
          p.on = false;
          continue;
        }
        p.x += p.vx * dtReal;
        p.y += p.vy * dtReal;
        p.vx *= 1 - Math.min(1, dtReal * 2.5);
        p.vy *= 1 - Math.min(1, dtReal * 2.5);
      }
      for (const [id, s] of sparkArt) if ((s.age += dtReal) > 0.5) sparkArt.delete(id);
      if (!(dtSim > 0)) return;
      for (const c of sim.cars) {
        const v = c.v ?? 0;
        const before = lastV.get(c.id) ?? v;
        lastV.set(c.id, v);
        if (c.retired || c.pit || c.finished || v < FX.minSpeed) continue;
        const pose = sim.carPose(c, 1, 1);
        const hx = Math.cos(pose.heading);
        const hy = Math.sin(pose.heading);
        const rear = { x: pose.x - hx * 2.2, y: pose.y - hy * 2.2 };
        // spray: a steady trickle behind a moving car (a pushing car a bit more)
        const d = (debt.get(c.id) ?? 0) + dtReal * FX.sprayPerSec * (c.pace === 'push' ? 1.5 : 1);
        let owed = d;
        while (owed >= 1) {
          owed -= 1;
          const side = random() < 0.5 ? -1 : 1;
          spawn('dust', rear.x - hy * side * 0.8, rear.y + hx * side * 0.8, -hx * v * 0.12 + (random() - 0.5) * 2, -hy * v * 0.12 + (random() - 0.5) * 2, 0.55 + random() * 0.35, 0.9 + random() * 0.6);
        }
        debt.set(c.id, owed);
        // sparks: hard braking
        const decel = (before - v) / dtSim;
        if (decel > FX.brakeDecel) {
          for (let i = 0; i < 2; i++) spawn('spark', rear.x, rear.y, -hx * 14 + (random() - 0.5) * 10, -hy * 14 + (random() - 0.5) * 10, 0.22 + random() * 0.2, 0.35 + random() * 0.25, SPARK_COLOURS[Math.floor(random() * SPARK_COLOURS.length)]);
          if (time - (lastSpark.get(c.id) ?? -99) > FX.sparkArtEvery && !sparkArt.has(c.id)) {
            lastSpark.set(c.id, time);
            sparkArt.set(c.id, { age: 0 });
          }
        }
      }
    },
    // Under the cars: spray puffs, spark streaks, the sparks picture.
    draw(ctx, sim, view, carLen, latScale) {
      const px = view.sc; // screen px per metre
      ctx.save();
      ctx.lineCap = 'round';
      for (const p of pool) {
        if (!p.on) continue;
        const t = p.age / p.life;
        const x = view.ox + p.x * px;
        const y = view.oy + p.y * px;
        if (p.kind === 'dust') {
          ctx.globalAlpha = 0.34 * (1 - t);
          ctx.fillStyle = '#E9E4DA';
          ctx.beginPath();
          ctx.arc(x, y, Math.max(2, p.size * px * (0.6 + t * 1.4)), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = p.colour;
          ctx.lineWidth = Math.max(2, p.size * px * 0.5);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - p.vx * px * 0.035, y - p.vy * px * 0.035);
          ctx.stroke();
        }
      }
      ctx.restore();
      for (const [id, s] of sparkArt) {
        const c = sim.car(id);
        if (!c) continue;
        const pose = sim.carPose(c, sim.alpha(), latScale);
        const size = carLen * 0.9;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - s.age / 0.5) * 0.9;
        ctx.translate(view.ox + (pose.x - Math.cos(pose.heading) * 2.4) * px, view.oy + (pose.y - Math.sin(pose.heading) * 2.4) * px);
        ctx.rotate(pose.heading + Math.PI / 2);
        assets.drawContained(ctx, ART.sparks, { x: -size / 2, y: -size / 2, w: size, h: size });
        ctx.restore();
      }
    },
    // Over the cars: breakdown smoke on retired cars, the pit burst on a car being serviced.
    drawOver(ctx, sim, view, carLen, latScale) {
      for (const c of sim.cars) {
        if (!c.retired && !c.pit) continue;
        const pose = sim.carPose(c, sim.alpha(), latScale);
        const x = view.ox + pose.x * view.sc;
        const y = view.oy + pose.y * view.sc;
        ctx.save();
        if (c.retired) {
          const k = (time * 0.6 + (c.id.length % 5) * 0.2) % 1;
          const size = carLen * (1.1 + k * 0.6);
          ctx.globalAlpha = 0.75 * (1 - k);
          assets.drawContained(ctx, ART.smoke, { x: x - size / 2, y: y - size * 0.8 - k * carLen * 0.6, w: size, h: size });
        } else if (c.pit && pose.inPit && (c.v ?? 0) < 1) {
          const size = carLen * (1.2 + 0.12 * Math.sin(time * 8));
          ctx.globalAlpha = 0.8;
          assets.drawContained(ctx, ART.pit, { x: x - size / 2, y: y - size / 2, w: size, h: size });
        }
        ctx.restore();
      }
    },
  };
}
