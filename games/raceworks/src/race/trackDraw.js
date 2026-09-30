// Drawing a circuit from its geometry (Milestone 6, bible §23.1: the track is code data; the circuit is drawn in code).
// Works on any 2D canvas context (the race screen's cached layer, the minimap, the art-guide export).
//   fitView(geo, rect, pad) → view { sc, ox, oy }: metres → screen (x = ox + mx × sc)
//   drawCircuit(g, geo, view) — grass, runoff, road, white edges, kerbs, pit lane and boxes, start/finish, grid slots
//   drawCar(g, assets, key, x, y, heading, lengthPx, { ring }) — a top-down sprite (drawn nose DOWN in the art),
//     turned so its nose follows `heading`
//   drawMinimap(g, geo, rect, cars) — outline + dots (Milestone 7's Follow camera)
//   drawGuide(g, geo, W, H) — the portrait track art guide (bible §23.1 step 3)
// Road widths are drawn display.widthScale times wider than the metres (looks only, so cars read on a phone); the
// validator checks the drawn corridor too. Car motion always uses the real geometry.

const D = (geo) => geo.def.display ?? {};

export function fitView(geo, rect, pad = 30) {
  const b = geo.bounds;
  const extra = ((geo.def.width ?? 13) * (D(geo).widthScale ?? 1)) / 2 + 6; // the drawn road sticks out past the centreline
  const bw = b.maxX - b.minX + extra * 2;
  const bh = b.maxY - b.minY + extra * 2;
  const sc = Math.min((rect.w - pad * 2) / bw, (rect.h - pad * 2) / bh);
  return { sc, ox: rect.x + (rect.w - bw * sc) / 2 - (b.minX - extra) * sc, oy: rect.y + (rect.h - bh * sc) / 2 - (b.minY - extra) * sc };
}

export const toScreen = (view, x, y) => ({ x: view.ox + x * view.sc, y: view.oy + y * view.sc });

// One edge ring of a band along samples: offset (metres, + = right of travel) × widthScale.
function edge(samples, view, side, ws, extra = 0) {
  return samples.map((p) => {
    const o = side * ((p.width * ws) / 2 + extra);
    return { x: view.ox + (p.x + p.nx * o) * view.sc, y: view.oy + (p.y + p.ny * o) * view.sc };
  });
}
function ring(g, pts, close = true) {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  if (close) g.closePath();
}
// A closed band (the lap) filled between its two edge rings.
function fillLoop(g, samples, view, ws, extra, colour) {
  g.beginPath();
  ring(g, edge(samples, view, -1, ws, extra));
  ring(g, edge(samples, view, 1, ws, extra).reverse());
  g.fillStyle = colour;
  g.fill('evenodd');
}
// An open band (the pit lane) as one polygon.
function fillStrip(g, samples, view, ws, extra, colour) {
  const l = edge(samples, view, -1, ws, extra);
  const r = edge(samples, view, 1, ws, extra).reverse();
  g.beginPath();
  ring(g, [...l, ...r]);
  g.fillStyle = colour;
  g.fill();
}

export function drawCircuit(g, geo, view, { grass = true } = {}) {
  const d = D(geo);
  const ws = d.widthScale ?? 1;
  const S = geo.samples;
  const sc = view.sc;
  if (grass) {
    g.fillStyle = d.grass ?? '#6FA85A';
    g.fillRect(-10000, -10000, 20000, 20000);
  }
  // runoff (sand) outside the corners, a light verge everywhere
  fillLoop(g, S, view, ws, 7, d.grassDark ?? '#5E9A4C');
  // pit lane under the track so the merges blend
  if (geo.pit) {
    fillStrip(g, geo.pit.samples, view, ws, 1.2, d.roadEdge ?? '#EEE');
    fillStrip(g, geo.pit.samples, view, ws, 0, d.pitRoad ?? '#6A6B72');
  }
  fillLoop(g, S, view, ws, 1.2, d.roadEdge ?? '#EEE'); // white edge lines
  fillLoop(g, S, view, ws, 0, d.road ?? '#55565C');
  // kerbs on the inside of corners, red / white blocks
  const kc = d.kerbMinCurv ?? 1 / 120;
  const kw = Math.max(3, (d.kerbDepth ?? 2) * ws * sc); // kerb depth on screen
  let block = 0;
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    const q = S[(i + 1) % S.length];
    if (Math.abs(p.curv) < kc) continue;
    const side = Math.sign(p.curv); // right-hand turn: the inside is on the right
    const o = side * ((p.width * ws) / 2 - (d.kerbDepth ?? 2) * ws * 0.5); // just inside the white line
    const a = { x: view.ox + (p.x + p.nx * o) * sc, y: view.oy + (p.y + p.ny * o) * sc };
    const b = { x: view.ox + (q.x + q.nx * o) * sc, y: view.oy + (q.y + q.ny * o) * sc };
    g.strokeStyle = Math.floor(block++ / 2) % 2 ? (d.kerbA ?? '#D8352A') : (d.kerbB ?? '#F4F1EA');
    g.lineWidth = kw;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  // pit boxes: short white ticks along the outer side of the pit lane
  if (geo.pit) {
    const P = geo.pit.samples;
    const box = geo.def.pit.boxes ?? { from: 0.3, to: 0.7 };
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = Math.max(1.5, sc * 0.6);
    for (let i = 0; i < P.length; i += 4) {
      const f = P[i].s / geo.pit.length;
      if (f < box.from || f > box.to) continue;
      const p = P[i];
      const o1 = ((p.width * ws) / 2) * 0.35;
      const o2 = (p.width * ws) / 2;
      g.beginPath();
      g.moveTo(view.ox + (p.x + p.nx * o1) * sc, view.oy + (p.y + p.ny * o1) * sc);
      g.lineTo(view.ox + (p.x + p.nx * o2) * sc, view.oy + (p.y + p.ny * o2) * sc);
      g.stroke();
    }
  }
  drawStartLine(g, geo, view);
  // grid slots
  const gd = geo.def.grid;
  if (gd) {
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = Math.max(1.5, sc * 0.5);
    for (let i = 0; i < 12; i++) {
      const s = -(gd.firstGap + i * gd.rowGap) + 2.4;
      const lat = (i % 2 ? 1 : -1) * gd.lateral * ws;
      const p = geo.pointAt(s, 0);
      const c = geo.at(s);
      const half = 1.4 * ws;
      const x = p.x + c.nx * lat;
      const y = p.y + c.ny * lat;
      g.beginPath();
      g.moveTo(view.ox + (x - c.nx * half) * sc, view.oy + (y - c.ny * half) * sc);
      g.lineTo(view.ox + (x + c.nx * half) * sc, view.oy + (y + c.ny * half) * sc);
      g.stroke();
    }
  }
}

// A chequered strip across the road at the start / finish line (lap distance 0).
export function drawStartLine(g, geo, view) {
  const ws = D(geo).widthScale ?? 1;
  const p = geo.at(0);
  const half = (p.width * ws) / 2;
  const cells = 8;
  const depth = 2.2; // metres along the road, drawn
  const tx = Math.cos(p.heading);
  const ty = Math.sin(p.heading);
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < cells; k++) {
      const o1 = -half + (k * 2 * half) / cells;
      const o2 = -half + ((k + 1) * 2 * half) / cells;
      const a1 = r * depth;
      const a2 = (r + 1) * depth;
      const pts = [
        [o1, a1],
        [o2, a1],
        [o2, a2],
        [o1, a2],
      ].map(([o, a]) => ({ x: view.ox + (p.x + p.nx * o + tx * a * ws * 0.5) * view.sc, y: view.oy + (p.y + p.ny * o + ty * a * ws * 0.5) * view.sc }));
      g.beginPath();
      ring(g, pts);
      g.fillStyle = (k + r) % 2 ? '#1E1E22' : '#FFFFFF';
      g.fill();
    }
  }
}

// A top-down car. The art's nose points DOWN the image (+y), so it is turned by heading − 90°.
export function drawCar(g, assets, key, x, y, heading, lengthPx, { ring: ringColour = null, alpha = 1 } = {}) {
  const img = assets.get?.(key);
  const aspect = img && img.height ? img.width / img.height : 0.7;
  const w = lengthPx * aspect;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.rotate(heading - Math.PI / 2);
  if (ringColour) {
    g.fillStyle = ringColour;
    g.beginPath();
    g.ellipse(0, 0, w * 0.78, lengthPx * 0.62, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.ellipse(2, 3, w * 0.5, lengthPx * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  // Always Aaron's art (a missing picture shows the loader's placeholder box, never a car drawn in code).
  assets.drawContained(g, key, { x: -w / 2, y: -lengthPx / 2, w, h: lengthPx });
  g.restore();
}

// The minimap: the circuit outline and a dot per car (the player's bigger, in the team colour).
export function drawMinimap(g, geo, rect, cars = []) {
  const view = fitView(geo, rect, 10);
  g.save();
  g.lineJoin = 'round';
  g.beginPath();
  ring(g, geo.samples.map((p) => toScreen(view, p.x, p.y)));
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 9;
  g.stroke();
  g.strokeStyle = '#3B332C';
  g.lineWidth = 5;
  g.stroke();
  for (const c of cars) {
    const p = toScreen(view, c.x, c.y);
    g.fillStyle = c.colour;
    g.beginPath();
    g.arc(p.x, p.y, c.player ? 11 : 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#FFFFFF';
    g.lineWidth = 2.5;
    g.stroke();
  }
  g.restore();
  return view;
}

// --- the art guide (bible §23.1 step 3) -------------------------------------------------------------------------
// White page, portrait. Shows the centreline (dashed), the drawn road edges, kerbs, the pit lane, the start line,
// the safe scenery boundary (keep scenery OUTSIDE it), the turn names, the timing segments, the overtake zones and
// the phone crops (9:16 and 9:19.5), with the track, geometry and art-guide versions.
// Where the guide puts the track (Milestone 19: the overlay check maps the data onto painted art the same way).
export const guideView = (geo, W, H) => fitView(geo, { x: 40, y: 190, w: W - 80, h: H - 330 }, 70);
export function drawGuide(g, geo, W, H) {
  const def = geo.def;
  const d = D(geo);
  const ws = d.widthScale ?? 1;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, W, H);
  const view = guideView(geo, W, H);
  const S = geo.samples;
  // safe scenery boundary: the drawn road plus 12 m of runoff each side
  const safeExtra = 12;
  g.save();
  g.beginPath();
  ring(g, edge(S, view, -1, ws, safeExtra));
  ring(g, edge(S, view, 1, ws, safeExtra).reverse());
  g.fillStyle = 'rgba(255,196,0,0.18)';
  g.fill('evenodd');
  if (geo.pit) fillStrip(g, geo.pit.samples, view, ws, safeExtra, 'rgba(255,196,0,0.18)'); // the pit lane is inside it too
  g.setLineDash([14, 10]);
  g.strokeStyle = '#E0A000';
  g.lineWidth = 3;
  g.beginPath();
  ring(g, edge(S, view, -1, ws, safeExtra));
  g.stroke();
  g.beginPath();
  ring(g, edge(S, view, 1, ws, safeExtra));
  g.stroke();
  g.restore();
  // the circuit itself (no grass)
  drawCircuit(g, geo, view, { grass: false });
  // centreline (dashed)
  g.save();
  g.setLineDash([10, 8]);
  g.strokeStyle = '#FFD84A';
  g.lineWidth = 2;
  g.beginPath();
  ring(g, S.map((p) => toScreen(view, p.x, p.y)));
  g.stroke();
  if (geo.pit) {
    g.beginPath();
    ring(g, geo.pit.samples.map((p) => toScreen(view, p.x, p.y)), false);
    g.stroke();
  }
  g.restore();
  // overtake zones: a cyan band along the outside
  for (const z of def.overtakeZones ?? []) {
    g.strokeStyle = 'rgba(21,151,191,0.8)';
    g.lineWidth = 7;
    g.beginPath();
    let started = false;
    for (const p of S) {
      if (!geo.inZone(p.s, z)) {
        started = false;
        continue;
      }
      const o = -((p.width * ws) / 2 + 5);
      const q = toScreen(view, p.x + p.nx * o, p.y + p.ny * o);
      if (!started) g.moveTo(q.x, q.y);
      else g.lineTo(q.x, q.y);
      started = true;
    }
    g.stroke();
  }
  // timing segment ticks and ids
  g.font = 'bold 20px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const sg of geo.segments) {
    const p = geo.at(sg.fromS);
    const o = (p.width * ws) / 2 + 4;
    const a = toScreen(view, p.x - p.nx * o, p.y - p.ny * o);
    const b = toScreen(view, p.x + p.nx * o, p.y + p.ny * o);
    g.strokeStyle = '#7650C4';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    const mid = geo.at(sg.fromS + (sg.toS - sg.fromS) / 2);
    const lo = toScreen(view, mid.x + mid.nx * ((mid.width * ws) / 2 + 26), mid.y + mid.ny * ((mid.width * ws) / 2 + 26));
    g.fillStyle = '#7650C4';
    g.fillText(sg.id, lo.x, lo.y);
  }
  // turn names on the outside of each corner
  g.font = 'bold 26px sans-serif';
  for (const t of def.turns ?? []) {
    const p = geo.at(t.at * geo.length);
    const side = -Math.sign(p.curv || 1); // outside of the turn
    const o = side * ((p.width * ws) / 2 + 40);
    const q = toScreen(view, p.x + p.nx * o, p.y + p.ny * o);
    g.fillStyle = '#C8402F';
    g.fillText(t.id, q.x, q.y);
  }
  // phone crops: 9:16 and 9:19.5 portrait frames centred on the circuit
  const cx = W / 2;
  const cy = area.y + area.h / 2;
  for (const [ratio, colour] of [
    [16 / 9, '#2E8B57'],
    [19.5 / 9, '#1597BF'],
  ]) {
    let h = area.h;
    let w = h / ratio;
    if (w > area.w) {
      w = area.w;
      h = w * ratio;
    }
    g.strokeStyle = colour;
    g.lineWidth = 3;
    g.setLineDash([6, 6]);
    g.strokeRect(cx - w / 2, cy - h / 2, w, h);
    g.setLineDash([]);
  }
  // title and legend
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillStyle = '#2A241F';
  g.font = 'bold 40px sans-serif';
  g.fillText(`${def.id} ${def.name} — TRACK ART GUIDE`, 40, 40);
  g.font = '24px sans-serif';
  g.fillText(`art guide v${def.artGuideVersion} · geometry v${def.geometryVersion} · lap ${Math.round(geo.length)} m · ${def.turns?.length ?? 0} turns · ${geo.segments.length} timing segments`, 40, 96);
  g.fillText(`scale ${view.sc.toFixed(3)} px per metre · road drawn ×${ws} wide · y down · the lap runs from the chequered line`, 40, 130);
  const legend = [
    ['#55565C', 'road (drawn width)'],
    ['#D8352A', 'kerbs'],
    ['#6A6B72', 'pit lane'],
    ['#FFD84A', 'centreline / pit spline'],
    ['#E0A000', 'safe scenery boundary: keep scenery outside'],
    ['#1597BF', 'overtake zones · phone crop 9:19.5'],
    ['#2E8B57', 'phone crop 9:16'],
    ['#7650C4', 'timing segments'],
  ];
  legend.forEach(([c, label], i) => {
    const x = 40 + (i % 2) * ((W - 80) / 2);
    const y = H - 130 + Math.floor(i / 2) * 30;
    g.fillStyle = c;
    g.fillRect(x, y + 4, 22, 18);
    g.fillStyle = '#2A241F';
    g.font = '20px sans-serif';
    g.fillText(label, x + 32, y + 2);
  });
  return view;
}
