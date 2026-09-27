// Track geometry (Milestone 6, bible §23.1): the circuit is DATA, not a picture. A track definition (data/tracks/)
// gives a closed centre spline (control points in metres, y down like the screen), width zones, a pit-lane spline,
// timing segments and zones as lap fractions. buildTrack(def) turns it into a dense, evenly spaced centreline that
// everything uses — car motion, the code-drawn circuit, the minimap, the validator and the art guide.
//   const geo = buildTrack(def)
//   geo.length (metres) · geo.samples [{ x, y, s, heading, nx, ny, curv, width }] (every geo.step metres)
//   geo.at(s) → { x, y, heading, nx, ny, width } at any distance (wraps round the lap)
//   geo.pointAt(s, lateral) → { x, y, heading } offset sideways (+ = right of the direction of travel)
//   geo.frac(f) → metres for a lap fraction · geo.segmentAt(s) → the timing segment index
//   geo.pit { samples, length, at(p), entryS, exitS } · geo.bounds { minX, minY, maxX, maxY }
//   geo.nearest(x, y) → { s, dist } (the closest centreline point; tests and the validator)
// The same control points always give the same geometry (no randomness), so a version number can stand for it.

const TAU = Math.PI * 2;

// Centripetal Catmull-Rom point between p1 and p2 (alpha 0.5: no loops or cusps on uneven spacing).
function catmull(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y) ** 0.5);
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a, b, ta, tb) => ({ x: ((tb - u) * a.x + (u - ta) * b.x) / (tb - ta), y: ((tb - u) * a.y + (u - ta) * b.y) / (tb - ta) });
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

// A dense polyline through the control points (closed: back to the first one).
function densePolyline(points, closed, perSpan = 60) {
  const n = points.length;
  const out = [];
  const spans = closed ? n : n - 1;
  const P = (i) => (closed ? points[((i % n) + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  for (let i = 0; i < spans; i++) {
    for (let k = 0; k < perSpan; k++) out.push(catmull(P(i - 1), P(i), P(i + 1), P(i + 2), k / perSpan));
  }
  if (!closed) out.push({ ...points[n - 1] });
  return out;
}

// Resample a polyline every `step` metres (arc length). closed: the last sample wraps to the first.
function resample(poly, step, closed) {
  const pts = closed ? [...poly, poly[0]] : poly;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1];
  const count = closed ? Math.round(total / step) : Math.max(2, Math.round(total / step) + 1);
  const realStep = closed ? total / count : total / (count - 1);
  const out = [];
  let j = 1;
  for (let i = 0; i < count; i++) {
    const s = i * realStep;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const k = (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    out.push({ x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * k, y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * k, s });
  }
  return { samples: out, length: total, step: realStep };
}

// Headings, normals (pointing right of travel) and signed curvature (1/radius; + = turning right on screen).
function orient(samples, closed) {
  const n = samples.length;
  const get = (i) => samples[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n; i++) {
    const a = get(i - 1);
    const b = get(i + 1);
    const h = Math.atan2(b.y - a.y, b.x - a.x);
    samples[i].heading = h;
    samples[i].nx = -Math.sin(h); // right of travel with y down: rotate (cos, sin) by +90°
    samples[i].ny = Math.cos(h);
  }
  // Curvature from the heading change over ±2 samples (steady on an even spacing).
  const step = n > 1 ? Math.hypot(get(1).x - get(0).x, get(1).y - get(0).y) : 1;
  for (let i = 0; i < n; i++) {
    const a = get(i - 2);
    const b = get(i + 2);
    let dh = b.heading - a.heading;
    while (dh > Math.PI) dh -= TAU;
    while (dh < -Math.PI) dh += TAU;
    samples[i].curv = dh / (4 * step);
  }
}

// Width at a lap fraction: the zone that covers it, else the track's default width.
export function widthAtFrac(def, f) {
  for (const z of def.widthZones ?? []) {
    const inside = z.from <= z.to ? f >= z.from && f < z.to : f >= z.from || f < z.to;
    if (inside) return z.width;
  }
  return def.width;
}

export function buildTrack(def) {
  const step = def.sampleStep ?? 2;
  const { samples, length, step: realStep } = resample(densePolyline(def.centre, true), step, true);
  orient(samples, true);
  const n = samples.length;
  for (const p of samples) p.width = widthAtFrac(def, p.s / length);
  // Width changes ramp over ~def.widthBlend metres (a moving average), so the road edge never steps.
  const half = Math.max(1, Math.round((def.widthBlend ?? 30) / 2 / realStep));
  const raw = samples.map((p) => p.width);
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (let k = -half; k <= half; k++) t += raw[(i + k + n) % n];
    samples[i].width = t / (2 * half + 1);
  }

  // The pit lane: an open spline, resampled the same way.
  let pit = null;
  if (def.pit) {
    const r = resample(densePolyline(def.pit.points, false), step, false);
    orient(r.samples, false);
    for (const p of r.samples) p.width = def.pit.width;
    pit = {
      samples: r.samples,
      length: r.length,
      step: r.step,
      width: def.pit.width,
      entryS: def.pit.entry * length,
      exitS: def.pit.exit * length,
      at(p) {
        const f = Math.max(0, Math.min(r.samples.length - 1, p / r.step));
        const i = Math.min(r.samples.length - 2, Math.floor(f));
        return interp(r.samples[i], r.samples[i + 1], f - i);
      },
    };
  }

  const xs = samples.map((p) => p.x);
  const ys = samples.map((p) => p.y);
  if (pit) for (const p of pit.samples) xs.push(p.x), ys.push(p.y);
  const bounds = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };

  const segments = (def.segments ?? []).map((sg, i) => ({ ...sg, index: i, fromS: sg.from * length, toS: (sg.to === 1 ? 1 : sg.to) * length }));

  const geo = {
    def,
    id: def.id,
    length,
    step: realStep,
    samples,
    pit,
    bounds,
    segments,
    frac: (f) => f * length,
    wrap: (s) => ((s % length) + length) % length,
    at(s) {
      const w = geo.wrap(s);
      const f = w / realStep;
      const i = Math.floor(f) % n;
      return interp(samples[i], samples[(i + 1) % n], f - Math.floor(f));
    },
    pointAt(s, lateral = 0) {
      const p = geo.at(s);
      return { x: p.x + p.nx * lateral, y: p.y + p.ny * lateral, heading: p.heading, width: p.width };
    },
    segmentAt(s) {
      const w = geo.wrap(s);
      for (let i = 0; i < segments.length; i++) if (w >= segments[i].fromS && w < segments[i].toS) return i;
      return segments.length - 1;
    },
    // Closest centreline sample (brute force: fine for tests and the validator; never used per frame).
    nearest(x, y) {
      let best = Infinity;
      let bi = 0;
      for (let i = 0; i < n; i++) {
        const d = (samples[i].x - x) ** 2 + (samples[i].y - y) ** 2;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      // refine against the two neighbouring pieces
      let bestD = Math.sqrt(best);
      let bestS = samples[bi].s;
      for (const j of [bi - 1, bi]) {
        const a = samples[(j + n) % n];
        const b = samples[(j + 1) % n];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy)));
        const d = Math.hypot(a.x + vx * t - x, a.y + vy * t - y);
        if (d < bestD) {
          bestD = d;
          bestS = geo.wrap(a.s + t * realStep);
        }
      }
      return { s: bestS, dist: bestD, index: bi };
    },
    // Zones given as lap fractions → [fromS, toS] in metres.
    zone: (z) => ({ ...z, fromS: z.from * length, toS: z.to * length }),
    inZone(s, z) {
      const w = geo.wrap(s) / length;
      return z.from <= z.to ? w >= z.from && w < z.to : w >= z.from || w < z.to;
    },
  };
  return geo;
}

function interp(a, b, k) {
  let dh = b.heading - a.heading;
  while (dh > Math.PI) dh -= TAU;
  while (dh < -Math.PI) dh += TAU;
  const heading = a.heading + dh * k;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, heading, nx: -Math.sin(heading), ny: Math.cos(heading), width: a.width + (b.width - a.width) * k, curv: a.curv + (b.curv - a.curv) * k };
}

// Corners from the curvature: runs of |curv| above a threshold that turn at least minTurnDeg in total.
export function findCorners(geo, { minCurv = 1 / 160, minTurnDeg = 25, mergeGap = 40 } = {}) {
  const n = geo.samples.length;
  // start the scan at a straight-ish sample so a corner never splits over the wrap
  let start = 0;
  while (start < n && Math.abs(geo.samples[start].curv) >= minCurv) start++;
  const corners = [];
  let cur = null;
  for (let k = 0; k <= n; k++) {
    const p = geo.samples[(start + k) % n];
    const on = k < n && Math.abs(p.curv) >= minCurv;
    if (on && (!cur || Math.sign(p.curv) !== cur.dir)) {
      if (cur) corners.push(cur);
      cur = { fromS: p.s, toS: p.s, turn: 0, dir: Math.sign(p.curv), apexS: p.s, maxCurv: 0 };
    }
    if (on) {
      cur.toS = p.s;
      cur.turn += p.curv * geo.step;
      if (Math.abs(p.curv) > cur.maxCurv) {
        cur.maxCurv = Math.abs(p.curv);
        cur.apexS = p.s;
      }
    } else if (cur) {
      corners.push(cur);
      cur = null;
    }
  }
  // Same-direction pieces close together are one corner (a spline wobble can split an arc).
  const merged = [];
  for (const c of corners) {
    const last = merged[merged.length - 1];
    if (last && last.dir === c.dir && c.fromS - last.toS <= mergeGap && c.fromS >= last.toS) {
      last.toS = c.toS;
      last.turn += c.turn;
      if (c.maxCurv > last.maxCurv) {
        last.maxCurv = c.maxCurv;
        last.apexS = c.apexS;
      }
    } else merged.push({ ...c });
  }
  return merged.filter((c) => Math.abs((c.turn * 180) / Math.PI) >= minTurnDeg).map((c) => ({ ...c, turnDeg: Math.round((c.turn * 180) / Math.PI), radius: Math.round(1 / c.maxCurv) }));
}

// A short fingerprint of everything that shapes the driving surface (the art guide records it; a test compares).
export function geometryHash(def) {
  const shape = JSON.stringify({ c: def.centre, w: def.width, z: def.widthZones, b: def.widthBlend, p: def.pit, st: def.sampleStep, ws: def.display?.widthScale });
  let h = 2166136261 >>> 0;
  for (let i = 0; i < shape.length; i++) {
    h ^= shape.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
