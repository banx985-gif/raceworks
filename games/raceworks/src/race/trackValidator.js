// Track geometry validator (Milestone 6, bible §23.1 step 2). Every track must pass before its art may load:
//   closed        the centre spline is a closed loop (the end meets the start, heading continuous)
//   corridor      the legal driving corridor never crosses or touches itself — also at the drawn width
//                 (display.widthScale), and no corner is tighter than half the road (the inner edge would fold)
//   pit           the pit lane leaves and rejoins inside the corridor at its entry / exit, heading the same way,
//                 and in between stays clear of the track
//   widths        every width is at least minWidth (pit lane at least 6 m)
//   segments      12–24 timing segments cover the whole lap end to end with no gaps or overlaps, each with demand
//                 weights that sum to 1 and a reference speed
//   turns         each named turn really turns at its apex
//   zones         overtake zones and braking markers lie on the lap
// validateTrack(def) → { ok, geo, checks: [{ id, ok, detail }] }
import { buildTrack } from './trackGeometry.js';

const MARGIN = 2; // metres of clear space kept between two parts of the corridor
const deg = (r) => (r * 180) / Math.PI;
const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

export function validateTrack(def) {
  const checks = [];
  const add = (id, ok, detail = '') => checks.push({ id, ok: !!ok, detail });
  let geo;
  try {
    geo = buildTrack(def);
  } catch (err) {
    add('build', false, err.message);
    return { ok: false, geo: null, checks };
  }
  const S = geo.samples;
  const n = S.length;
  const L = geo.length;

  // --- closed loop ---
  const first = S[0];
  const last = S[n - 1];
  const gap = Math.hypot(first.x - last.x, first.y - last.y);
  const turnAtJoin = deg(angleDiff(first.heading, last.heading));
  add('closed', def.centre?.length >= 4 && gap <= geo.step * 1.5 && turnAtJoin < 10, `end-to-start gap ${gap.toFixed(2)} m, heading change ${turnAtJoin.toFixed(1)}°`);

  // --- corridor never crosses itself (real width and drawn width) ---
  const scale = def.display?.widthScale ?? 1;
  const corridor = (k) => {
    let worst = Infinity;
    let where = null;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const along = Math.min(S[j].s - S[i].s, L - (S[j].s - S[i].s));
        const need = ((S[i].width + S[j].width) / 2) * k + MARGIN;
        if (along <= need * 1.6) continue; // neighbours along the road are meant to be close
        const d = Math.hypot(S[i].x - S[j].x, S[i].y - S[j].y);
        const spare = d - need;
        if (spare < worst) {
          worst = spare;
          where = [Math.round(S[i].s), Math.round(S[j].s)];
        }
      }
    }
    return { worst, where };
  };
  const real = corridor(1);
  add('corridor', real.worst >= 0, `closest approach leaves ${real.worst.toFixed(1)} m spare (at ${real.where?.join(' / ')} m)`);
  const drawn = corridor(scale);
  add('corridorDrawn', drawn.worst >= 0, `drawn at ×${scale}: ${drawn.worst.toFixed(1)} m spare (at ${drawn.where?.join(' / ')} m)`);
  let tight = Infinity;
  for (const p of S) tight = Math.min(tight, 1 / Math.max(1e-9, Math.abs(p.curv)) - (p.width * scale) / 2);
  add('noFold', tight > 0, `tightest corner leaves ${tight.toFixed(1)} m inside the drawn inner edge`);

  // --- pit lane ---
  if (!geo.pit) add('pit', false, 'no pit lane');
  else {
    const P = geo.pit.samples;
    const mergeOk = (p, s, name) => {
      const near = geo.nearest(p.x, p.y);
      const at = geo.at(s);
      const along = Math.min(Math.abs(near.s - s), L - Math.abs(near.s - s));
      const inside = near.dist <= at.width / 2;
      const heading = deg(angleDiff(p.heading, geo.at(near.s).heading));
      return { ok: inside && along <= 20 && heading <= 35, text: `${name}: ${near.dist.toFixed(1)} m from the centreline, ${along.toFixed(1)} m from its lap point, ${heading.toFixed(0)}° off` };
    };
    const a = mergeOk(P[0], geo.pit.entryS, 'entry');
    const b = mergeOk(P[P.length - 1], geo.pit.exitS, 'exit');
    let clear = Infinity;
    let clearDrawn = Infinity;
    const keepOff = def.pit.mergeLength ?? 60; // metres at each end where the lane is still splitting off / merging
    for (const p of P) {
      if (p.s < keepOff || p.s > geo.pit.length - keepOff) continue;
      const near = geo.nearest(p.x, p.y);
      const w = geo.at(near.s).width;
      clear = Math.min(clear, near.dist - (w + geo.pit.width) / 2);
      clearDrawn = Math.min(clearDrawn, near.dist - ((w + geo.pit.width) / 2) * scale);
    }
    add('pitMerge', a.ok && b.ok, `${a.text}; ${b.text}`);
    add('pitClear', clear >= 0 && clearDrawn >= 0, `between the merges the pit lane keeps ${clear.toFixed(1)} m (drawn ${clearDrawn.toFixed(1)} m) off the track`);
  }

  // --- widths ---
  const minW = Math.min(...S.map((p) => p.width));
  add('widths', minW >= (def.minWidth ?? 10) && (!geo.pit || geo.pit.width >= 6), `narrowest ${minW} m (minimum ${def.minWidth}), pit lane ${geo.pit?.width ?? '—'} m`);

  // --- timing segments ---
  const sg = def.segments ?? [];
  let cover = sg.length >= 12 && sg.length <= 24 && sg[0]?.from === 0 && sg[sg.length - 1]?.to === 1;
  const bad = [];
  sg.forEach((x, i) => {
    if (!(x.to > x.from)) bad.push(`${x.id} is empty or backwards`);
    if (i && Math.abs(x.from - sg[i - 1].to) > 1e-9) bad.push(`gap/overlap before ${x.id}`);
    const sum = Object.values(x.demand ?? {}).reduce((t, v) => t + v, 0);
    if (Math.abs(sum - 1) > 1e-6) bad.push(`${x.id} demand sums to ${sum}`);
    if (!(x.refSpeed > 0)) bad.push(`${x.id} has no reference speed`);
  });
  cover = cover && !bad.length;
  add('segments', cover, `${sg.length} segments${bad.length ? ': ' + bad.join('; ') : ', covering 0 → 1'}`);

  // --- turns ---
  const flat = [];
  for (const t of def.turns ?? []) {
    const s0 = t.at * L;
    let peak = 0;
    for (let d = -30; d <= 30; d += geo.step) peak = Math.max(peak, Math.abs(geo.at(s0 + d).curv));
    if (peak < 1 / 250) flat.push(`${t.id} (radius ${Math.round(1 / peak)} m)`);
  }
  add('turns', (def.turns ?? []).length > 0 && !flat.length, `${(def.turns ?? []).length} named turns${flat.length ? '; not turning: ' + flat.join(', ') : ''}`);

  // --- zones and markers ---
  const inLap = (f) => f >= 0 && f <= 1;
  const zonesOk = (def.overtakeZones ?? []).every((z) => inLap(z.from) && inLap(z.to)) && (def.brakingMarkers ?? []).every((m) => inLap(m.at));
  add('zones', zonesOk && (def.overtakeZones ?? []).length > 0, `${(def.overtakeZones ?? []).length} overtake zones, ${(def.brakingMarkers ?? []).length} braking markers`);

  add('versions', Number.isInteger(def.geometryVersion) && Number.isInteger(def.artGuideVersion), `geometry v${def.geometryVersion}, art guide v${def.artGuideVersion}`);
  return { ok: checks.every((c) => c.ok), geo, checks, length: L };
}
