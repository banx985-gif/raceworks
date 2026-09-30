// A real circuit as a DrivingChallengeController course (Milestone 15: the Qualifying Drive lap). The track geometry
// (src/race/trackGeometry.js) is authoritative (bible §23.1), so the lap is driven on exactly the circuit the race
// uses: one lap from the start line, sampled every 2 m like the drill courses, plus a short run past the line.
//   courseFromTrack(geo) → { pts [{ x, y, h, s, k }], bends [{ from, to, apex, dir, radius }], length, width, finishAt }
// Both use the same conventions: heading h with x += cos h, y += sin h, and curvature k = dh/ds (so a bend's dir is the
// sign of k). The course width is the track's narrowest, so the car is never "on the road" where the circuit isn't.
import { findCorners } from './trackGeometry.js';

const SAMPLE = 2; // must match the controller's sample spacing
const OVERRUN = 60; // m of road past the line

export function courseFromTrack(geo) {
  const L = geo.length;
  const pts = [];
  for (let s = 0; s <= L + OVERRUN; s += SAMPLE) {
    const p = geo.at(s);
    pts.push({ x: p.x, y: p.y, h: p.heading, s, k: p.curv });
  }
  const bends = findCorners(geo).map((c) => {
    const to = c.toS < c.fromS ? c.toS + L : c.toS;
    return { from: c.fromS, to, apex: c.apexS < c.fromS ? c.apexS + L : c.apexS, dir: c.dir, radius: 1 / Math.max(1e-6, c.maxCurv) };
  });
  const width = Math.min(...geo.samples.map((p) => p.width));
  return { pts, bends, length: pts[pts.length - 1].s, width, finishAt: L };
}
