// Race effects (Milestone 8, bible §43): light and capped, looks only — nothing here touches the race model.
//   - track spray: soft puffs of dust thrown up behind every moving car (a Push / Attack car throws a little more)
//   - underbody sparks: code sparks under a car braking hard, and now and then the Underbody Sparks art (race_vfx_03)
//   - breakdown smoke: the Breakdown Smoke art (race_vfx_10) drifting over a retired car
//   - pit burst: the Pit-Service Burst art (race_vfx_05) over a car while its crew works on it
// Particles live in track metres, so they stay on the road when the Follow camera moves. A fixed pool: never more
// than FX.maxParticles at once (the rest are simply not made), whatever the speed or field size.
//   const fx = createRaceFx({ assets, reduced: () => settings.get('reducedMotion') });
//   fx.step(sim, dtSim, dtReal)   after the race advanced (dtSim = race seconds this frame, 0 when paused)
//   fx.draw(ctx, sim, view, carLen, latScale)   under the cars (spray, sparks) — then fx.drawOver(...) above them
//   fx.drawWeather(ctx, rect, weather)   rain over the track (Milestone 17)
//   fx.reset()   a new race
// Milestone 17 (bible §23.5–23.7; the art list says rain particles are code): rain spray — heavier code spray and the Rain
// Spray art (race_vfx_06) behind cars off the dry — and code rain streaks over the track; Tyre Smoke (race_vfx_01) on a spin
// (with Track Dust, race_vfx_02, in the dry); code sparks and the Underbody Sparks art on contact; Breakdown Smoke
// (race_vfx_10) on a failure. They follow the race's events (sim.events). Reduced motion (the Milestone 14 setting) tones
// them down: fewer, fainter, slower. Never cars or new art in code.
const FX = {
  maxParticles: 90,
  sprayPerSec: 5, // puffs per second per moving car (real time)
  minSpeed: 18, // m/s: slower than this throws no spray
  brakeDecel: 9, // m/s² of slowing that counts as hard braking (sparks)
  sparkArtEvery: 1.4, // seconds between Underbody Sparks pictures on one car
  // Milestone 17
  wetSprayX: 1.8, // puffs off the dry
  sprayArtEvery: 0.9, // seconds between Rain Spray pictures behind one car (twice that when damp)
  maxBursts: 10, // effect pictures over cars at once (smoke, dust, spray)
  rain: { damp: 14, wet: 40, storm: 70 }, // rain streaks over the track
  reducedShare: 0.35, // Reduced motion: this share of the particles, streaks and pictures
};
const ART = { sparks: 'race_vfx_03', smoke: 'race_vfx_10', pit: 'race_vfx_05', tyreSmoke: 'race_vfx_01', dust: 'race_vfx_02', spray: 'race_vfx_06' };
const SPARK_COLOURS = ['#FFF6C2', '#FFD166', '#FFB74D', '#FFFFFF'];

export function createRaceFx({ assets, random = Math.random, reduced = () => false }) {
  const pool = Array.from({ length: FX.maxParticles }, () => ({ on: false, kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, colour: '#fff' }));
  const lastV = new Map(); // car id → speed at the last step
  const sparkArt = new Map(); // car id → { age } of its current sparks picture
  const debt = new Map(); // car id → spray owed
  const lastSpark = new Map(); // car id → when its last sparks picture showed
  const lastSpray = new Map(); // car id → when its last Rain Spray picture showed (Milestone 17)
  const bursts = []; // Milestone 17: effect pictures over a car { id, art, age, life, size, drift }
  let evSeen = null; // how many race events have become effects (a reload doesn't replay the old ones)
  let time = 0;
  const streaks = Array.from({ length: FX.rain.storm }, () => ({ x: random(), y: random(), len: 0.6 + random() * 0.8 }));

  function spawn(kind, x, y, vx, vy, life, size, colour = '#fff') {
    const p = pool.find((q) => !q.on);
    if (!p) return false;
    Object.assign(p, { on: true, kind, x, y, vx, vy, age: 0, life, size, colour });
    return true;
  }
  const keep = () => !reduced() || random() < FX.reducedShare; // Reduced motion: most effects are simply not made
  function burst(id, art, life, size, drift = 0) {
    if (bursts.length >= FX.maxBursts || !keep()) return;
    bursts.push({ id, art, age: 0, life, size, drift });
  }

  const live = () => pool.reduce((n, p) => n + (p.on ? 1 : 0), 0);

  return {
    get particles() {
      return live();
    },
    get bursts() {
      return bursts.length;
    },
    reset() {
      for (const p of pool) p.on = false;
      lastV.clear();
      sparkArt.clear();
      debt.clear();
      lastSpark.clear();
      lastSpray.clear();
      bursts.length = 0;
      evSeen = null;
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
      for (let i = bursts.length - 1; i >= 0; i--) if ((bursts[i].age += dtReal) >= bursts[i].life) bursts.splice(i, 1);
      // Milestone 17: the race's new events → spin smoke (and dust in the dry), contact sparks, breakdown smoke
      const evs = sim.events ?? [];
      if (evSeen === null || evSeen > evs.length) evSeen = evs.length;
      for (; evSeen < evs.length; evSeen++) {
        const ev = evs[evSeen];
        if (ev.kind === 'spin') {
          burst(ev.ids[0], ART.tyreSmoke, 1.4, 1.6, 0.5);
          if (sim.weather === 'dry') burst(ev.ids[0], ART.dust, 1.1, 1.3, 0.3);
        } else if (ev.kind === 'contact') {
          for (const id of ev.ids) {
            const c = sim.car(id);
            if (!c) continue;
            if (keep()) sparkArt.set(id, { age: 0 });
            const pose = sim.carPose(c, 1, 1);
            for (let i = 0; i < 4; i++) if (keep()) spawn('spark', pose.x, pose.y, (random() - 0.5) * 24, (random() - 0.5) * 24, 0.3 + random() * 0.2, 0.4 + random() * 0.3, SPARK_COLOURS[Math.floor(random() * SPARK_COLOURS.length)]);
          }
        } else if (ev.kind === 'failure') burst(ev.ids[0], ART.smoke, 1.6, 1.2, 0.8);
      }
      if (!(dtSim > 0)) return;
      const wet = !!sim.weather && sim.weather !== 'dry';
      for (const c of sim.cars) {
        const v = c.v ?? 0;
        const before = lastV.get(c.id) ?? v;
        lastV.set(c.id, v);
        if (c.retired || c.pit || c.finished || v < FX.minSpeed) continue;
        const pose = sim.carPose(c, 1, 1);
        const hx = Math.cos(pose.heading);
        const hy = Math.sin(pose.heading);
        const rear = { x: pose.x - hx * 2.2, y: pose.y - hy * 2.2 };
        // spray: a steady trickle behind a moving car (a pushing car a bit more; far more off the dry — Milestone 17)
        const d = (debt.get(c.id) ?? 0) + dtReal * FX.sprayPerSec * (c.pace === 'push' ? 1.5 : 1) * (wet ? FX.wetSprayX : 1) * (reduced() ? FX.reducedShare : 1);
        let owed = d;
        while (owed >= 1) {
          owed -= 1;
          const side = random() < 0.5 ? -1 : 1;
          spawn(wet ? 'spray' : 'dust', rear.x - hy * side * 0.8, rear.y + hx * side * 0.8, -hx * v * 0.12 + (random() - 0.5) * 2, -hy * v * 0.12 + (random() - 0.5) * 2, 0.55 + random() * 0.35, (wet ? 1.3 : 0.9) + random() * 0.6);
        }
        debt.set(c.id, owed);
        // Milestone 17: the Rain Spray picture behind a car now and then (more in the wet and a storm)
        if (wet && time - (lastSpray.get(c.id) ?? -99) > FX.sprayArtEvery * (sim.weather === 'damp' ? 2 : 1)) {
          lastSpray.set(c.id, time + random() * 0.3);
          burst(c.id, ART.spray, 0.6, 1.1, 0.6);
        }
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
        if (p.kind === 'dust' || p.kind === 'spray') {
          ctx.globalAlpha = (p.kind === 'spray' ? 0.42 : 0.34) * (1 - t);
          ctx.fillStyle = p.kind === 'spray' ? '#DCE8F2' : '#E9E4DA';
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
    // Over the cars: breakdown smoke on retired cars, the pit burst on a car being serviced, and (Milestone 17) the event
    // pictures — spin smoke, dust, rain spray, failure smoke — drifting back from the car.
    drawOver(ctx, sim, view, carLen, latScale) {
      for (const b of bursts) {
        const c = sim.car(b.id);
        if (!c) continue;
        const pose = sim.carPose(c, sim.alpha(), latScale);
        const k = b.age / b.life;
        const size = carLen * b.size * (0.8 + k * 0.6);
        const back = b.drift * carLen * k;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k) * (reduced() ? 0.55 : 0.85);
        const x = view.ox + pose.x * view.sc - Math.cos(pose.heading) * back;
        const y = view.oy + pose.y * view.sc - Math.sin(pose.heading) * back;
        assets.drawContained(ctx, b.art, { x: x - size / 2, y: y - size / 2, w: size, h: size });
        ctx.restore();
      }
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
    // Milestone 17: rain over the track (code streaks, as the art list asks) and a faint wet sheen. Reduced motion: fewer,
    // slower, fainter streaks.
    drawWeather(ctx, rect, weather) {
      if (!weather || weather === 'dry') return;
      const red = reduced();
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      ctx.fillStyle = weather === 'storm' ? 'rgba(40,52,70,0.22)' : weather === 'wet' ? 'rgba(60,80,100,0.14)' : 'rgba(80,100,120,0.07)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      const n = Math.round(FX.rain[weather] * (red ? FX.reducedShare : 1));
      const speed = red ? 0.12 : 0.55;
      ctx.strokeStyle = `rgba(225,238,250,${red ? 0.35 : 0.6})`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      const len = Math.min(90, rect.h * 0.08);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const st = streaks[i];
        const yy = ((st.y + time * speed * (0.8 + st.len * 0.4)) % 1) * (rect.h + len) - len;
        const xx = (((st.x - (yy / rect.h) * 0.08) % 1) + 1) % 1;
        ctx.moveTo(rect.x + xx * rect.w, rect.y + yy);
        ctx.lineTo(rect.x + xx * rect.w - len * 0.18 * st.len, rect.y + yy + len * st.len);
      }
      ctx.stroke();
      ctx.restore();
    },
    get rainStreaks() {
      return (w) => (!w || w === 'dry' ? 0 : Math.round(FX.rain[w] * (reduced() ? FX.reducedShare : 1))); // (tests)
    },
  };
}
