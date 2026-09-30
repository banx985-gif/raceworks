// The art overlay check (Milestone 19, bible §23.1 step 5): when Aaron's painted top-down track arrives, sampled road
// landmarks from the DATA must land on painted road, and points clear of the road must not — within a pixel tolerance —
// before the art may be used. The geometry always wins: art that doesn't line up fails, it never moves the driving surface.
// Until painted tracks exist the check runs against T01's exported art guide (the same road colour, the same view).
//   overlayLandmarks(geo, view, { every }) → [{ x, y, kind: 'road' | 'off', s }] in image pixels
//   overlayCheck(geo, view, pixelAt, { roadColour, tol, colourTol, maxMiss }) → { ok, road: { hit, total },
//     off: { clear, total }, misses: [{ s, kind }] }
//   pixelAt(x, y) → [r, g, b, a] of the art at an image pixel (the caller decodes the picture)
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Road landmarks: every `every` metres, two points a quarter of the drawn width either side of the centreline (clear of the
// centre dashes and the kerbs). Off landmarks: 8 m past the drawn edge, only where no other part of the track is near.
export function overlayLandmarks(geo, view, { every = 20 } = {}) {
  const ws = geo.def.display?.widthScale ?? 1;
  const out = [];
  const px = (x, y) => ({ x: view.ox + x * view.sc, y: view.oy + y * view.sc });
  for (let s = 5; s < geo.length; s += every) {
    const p = geo.at(s);
    const half = (p.width * ws) / 2;
    for (const side of [-1, 1]) {
      out.push({ ...px(p.x + p.nx * side * half * 0.5, p.y + p.ny * side * half * 0.5), kind: 'road', s });
      const o = half + 8;
      const q = { x: p.x + p.nx * side * o, y: p.y + p.ny * side * o };
      const near = geo.nearest(q.x, q.y);
      const nearPit = geo.pit ? Math.min(...geo.pit.samples.map((k) => Math.hypot(k.x - q.x, k.y - q.y))) : Infinity;
      if (near.dist > half + 4 && nearPit > ((geo.pit?.width ?? 0) * ws) / 2 + 6) out.push({ ...px(q.x, q.y), kind: 'off', s });
    }
  }
  return out;
}

export function overlayCheck(geo, view, pixelAt, { roadColour = geo.def.display?.road ?? '#55565C', tol = 3, colourTol = 40, maxMiss = 0.05 } = {}) {
  const want = hex(roadColour);
  const isRoad = (c) => c && c[3] > 200 && Math.hypot(c[0] - want[0], c[1] - want[1], c[2] - want[2]) <= colourTol;
  const road = { hit: 0, total: 0 };
  const off = { clear: 0, total: 0 };
  const misses = [];
  for (const m of overlayLandmarks(geo, view)) {
    const x = Math.round(m.x);
    const y = Math.round(m.y);
    if (m.kind === 'road') {
      road.total++;
      let found = false;
      for (let dy = -tol; dy <= tol && !found; dy++) for (let dx = -tol; dx <= tol && !found; dx++) found = isRoad(pixelAt(x + dx, y + dy));
      if (found) road.hit++;
      else misses.push({ s: Math.round(m.s), kind: 'road' });
    } else {
      off.total++;
      if (!isRoad(pixelAt(x, y))) off.clear++;
      else misses.push({ s: Math.round(m.s), kind: 'off' });
    }
  }
  const ok = road.total > 0 && off.total > 0 && road.hit / road.total >= 1 - maxMiss && off.clear / off.total >= 1 - maxMiss;
  return { ok, road, off, misses };
}
