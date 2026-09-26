// Things you build on a floor grid (workshop stations, café counters, shipyard cranes…).
// Rectangular footprints on a logical grid; the game decides how they look.
//
//   defs:     { id: { id, name, cost, w, h, effects: [{ key, value, maxCount?, cap? }] } }
//             effects are summed over every owned copy: maxCount = how many copies count (default all),
//             cap = limit on this facility's total for that key (e.g. racks: -3 each, cap -7).
//   area:     { cols, rows } — the usable floor at the start (from 0,0)
//   zones:    [{ id, col, row, w, h, requires: [zoneIds], entrance? }] — expansion areas, locked until opened.
//             A zone with its own entrance is a separate room (e.g. a basement reached by stairs): once opened, what
//             is built there counts as reachable from that entrance. Workers still walk the main room only.
//   zoneShown(zone) → false keeps a zone off the floor entirely until it is opened (a secret room)
//   entrance: { col, row } — where people come in; always kept clear, and everything must be reachable from it
//   keepClear:[{ col, row }] — more cells that may never be built on
//   sellRefundPct: share of the build price paid back on selling (default 50)
//
// Placement rules: inside usable (owned) floor, no overlaps, not on a kept-clear cell, and after the
// change every facility still has at least one free cell next to it that can be walked to from the entrance.
// Money and unlock rules stay with the game: this system only knows the layout.
//
// Effect queries: total(key) is the sum over all owned facilities, so other systems ask
// "what's the bonus to X right now?" instead of knowing about facilities.
//
// Emits: 'facility:placed' { item }, 'facility:moved' { item }, 'facility:sold' { item, refund },
//        'facility:expansion' { zone }, 'facility:layout' { version } (after any change).
const REASONS = {
  outside: 'Outside the workshop',
  locked: 'That area is locked — buy the expansion first',
  overlap: 'Overlaps {name}',
  door: 'Keep the doorway clear',
  blocked: 'That would block the walkway — {name} could not be reached',
  unknown: 'Unknown facility',
};

export class FacilitySystem {
  constructor({ bus = null, defs, area, zones = [], entrance, keepClear = [], sellRefundPct = 50, reasons = {}, zoneShown = () => true }) {
    this.zoneShown = zoneShown;
    this.bus = bus;
    this.defs = defs;
    this.area = area;
    this.zones = zones;
    this.entrance = entrance;
    this.keepClear = [entrance, ...zones.filter((z) => z.entrance).map((z) => z.entrance), ...keepClear];
    this.sellRefundPct = sellRefundPct;
    this.reasons = { ...REASONS, ...reasons };
    // The whole floor that can ever exist (base + every zone).
    this.cols = Math.max(area.cols, ...zones.map((z) => z.col + z.w));
    this.rows = Math.max(area.rows, ...zones.map((z) => z.row + z.h));
    this.reset();
  }

  reset() {
    this.placed = []; // [{ uid, def, col, row, rot }]
    this.nextUid = 1;
    this.owned = new Set(); // opened zone ids
    this._changed(false);
  }

  // --- floor ------------------------------------------------------------------
  zone(id) {
    return this.zones.find((z) => z.id === id) || null;
  }

  isOwned(zoneId) {
    return this.owned.has(zoneId);
  }

  // Every zone this one needs is open and the zone may be shown (so it could be bought, rules permitting).
  zoneReady(zoneId) {
    const z = this.zone(zoneId);
    return !!z && !this.owned.has(zoneId) && (z.requires ?? []).every((r) => this.owned.has(r)) && this.zoneShown(z) !== false;
  }

  // Locked zones that sit next to the open floor (shown as "for sale" areas).
  get nextZones() {
    return this.zones.filter((z) => this.zoneReady(z.id));
  }

  // Size of the floor to draw: base + open zones + the zones that could be opened next.
  viewExtent() {
    let cols = this.area.cols;
    let rows = this.area.rows;
    for (const z of this.zones) {
      if (!this.owned.has(z.id) && !this.zoneReady(z.id)) continue;
      cols = Math.max(cols, z.col + z.w);
      rows = Math.max(rows, z.row + z.h);
    }
    return { cols, rows };
  }

  zoneAt(col, row) {
    return this.zones.find((z) => col >= z.col && row >= z.row && col < z.col + z.w && row < z.row + z.h) || null;
  }

  inBase(col, row) {
    return col >= 0 && row >= 0 && col < this.area.cols && row < this.area.rows;
  }

  isUsable(col, row) {
    if (this.inBase(col, row)) return true;
    const z = this.zoneAt(col, row);
    return !!z && this.owned.has(z.id);
  }

  openZone(zoneId) {
    if (!this.zoneReady(zoneId)) return false;
    this.owned.add(zoneId);
    this._changed();
    this.bus?.emit('facility:expansion', { zone: this.zone(zoneId) });
    return true;
  }

  // --- facilities ---------------------------------------------------------------
  get(uid) {
    return this.placed.find((p) => p.uid === uid) || null;
  }

  count(defId) {
    let n = 0;
    for (const p of this.placed) if (p.def === defId) n++;
    return n;
  }

  has(defId) {
    return this.count(defId) > 0;
  }

  // Owned copies of any of these facilities, oldest first.
  ofType(defIds) {
    return this.placed.filter((p) => defIds.includes(p.def));
  }

  sizeOf(defId, rot = 0) {
    const d = this.defs[defId];
    return rot ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
  }

  footprint(item) {
    const s = this.sizeOf(item.def, item.rot);
    return { col: item.col, row: item.row, w: s.w, h: s.h };
  }

  sellValue(item) {
    return Math.floor((this.defs[item.def].cost * this.sellRefundPct) / 100);
  }

  // Can defId go here? ignoreUid: the facility being moved. Returns { ok, code, reason }.
  check(defId, col, row, rot = 0, ignoreUid = null) {
    if (!this.defs[defId]) return this._no('unknown');
    const { w, h } = this.sizeOf(defId, rot);
    const occ = this._occupancy(ignoreUid);
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return this._no('outside');
        if (!this.isUsable(c, r)) return this._no(this.zoneAt(c, r) ? 'locked' : 'outside');
        const o = occ[r * this.cols + c];
        if (o > 0) return this._no('overlap', this.defs[this.get(o).def].name);
        if (this.keepClear.some((k) => k.col === c && k.row === r)) return this._no('door');
      }
    }
    const cand = { uid: -1, def: defId, col, row, rot };
    this._mark(occ, cand, -2); // -2 = the candidate
    const reached = this._reach(occ, this.entrances);
    const items = this.placed.filter((p) => p.uid !== ignoreUid).concat(cand);
    for (const it of items) {
      if (!this._accessible(it, reached)) return this._no('blocked', this.defs[it.def].name);
    }
    return { ok: true, code: null, reason: null };
  }

  place(defId, col, row, rot = 0) {
    const res = this.check(defId, col, row, rot);
    if (!res.ok) return res;
    const item = { uid: this.nextUid++, def: defId, col, row, rot: rot ? 1 : 0 };
    this.placed.push(item);
    this._changed();
    this.bus?.emit('facility:placed', { item });
    return { ...res, item };
  }

  move(uid, col, row, rot) {
    const item = this.get(uid);
    if (!item) return this._no('unknown');
    const r = rot ?? item.rot;
    const res = this.check(item.def, col, row, r, uid);
    if (!res.ok) return res;
    Object.assign(item, { col, row, rot: r ? 1 : 0 });
    this._changed();
    this.bus?.emit('facility:moved', { item });
    return { ...res, item };
  }

  // Take a facility away. Returns { item, refund } (the game pays the refund).
  remove(uid) {
    const item = this.get(uid);
    if (!item) return null;
    this.placed = this.placed.filter((p) => p !== item);
    const refund = this.sellValue(item);
    this._changed();
    this.bus?.emit('facility:sold', { item, refund });
    return { item, refund };
  }

  // Nearest valid spot to `near` for a new (or moved) facility, or null if none.
  findSpot(defId, rot = 0, near = null, ignoreUid = null) {
    const n = near ?? { col: Math.floor(this.area.cols / 2), row: Math.floor(this.area.rows / 2) };
    const spots = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.isUsable(c, r)) spots.push({ col: c, row: r, d: Math.abs(c - n.col) + Math.abs(r - n.row) });
    spots.sort((a, b) => a.d - b.d || a.row - b.row || a.col - b.col);
    for (const s of spots) if (this.check(defId, s.col, s.row, rot, ignoreUid).ok) return { col: s.col, row: s.row };
    return null;
  }

  // --- effect queries -------------------------------------------------------------
  total(key) {
    if (!this._totals) this._totals = this._sumEffects();
    return this._totals[key] ?? 0;
  }

  // Where a total comes from: [{ defId, name, count, value }].
  breakdown(key) {
    const out = [];
    for (const [defId, n] of this._counts()) {
      const d = this.defs[defId];
      for (const e of d.effects ?? []) if (e.key === key) out.push({ defId, name: d.name, count: n, value: effectValue(e, n) });
    }
    return out;
  }

  _counts() {
    const m = new Map();
    for (const p of this.placed) m.set(p.def, (m.get(p.def) ?? 0) + 1);
    return m;
  }

  _sumEffects() {
    const out = {};
    for (const [defId, n] of this._counts()) {
      for (const e of this.defs[defId].effects ?? []) out[e.key] = (out[e.key] ?? 0) + effectValue(e, n);
    }
    return out;
  }

  // --- walking --------------------------------------------------------------------
  // The current layout: occupancy (0 free, -1 not usable, uid = facility) and which free cells
  // can be walked to from the entrance. Worked out once per change.
  get layout() {
    if (!this._layout) {
      const occ = this._occupancy(null);
      this._layout = { occ, reached: this._reach(occ) };
    }
    return this._layout;
  }

  isOpenCell(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    return this.layout.reached[row * this.cols + col] === 1;
  }

  // Free, reachable cells next to a facility, best first: along its front edge (middle first),
  // then its right side, then the rest.
  accessCells(uid) {
    const it = this.get(uid);
    if (!it) return [];
    const { col, row, w, h } = this.footprint(it);
    const front = [];
    for (let c = col; c < col + w; c++) front.push({ col: c, row: row + h, d: Math.abs(c + 0.5 - (col + w / 2)) });
    front.sort((a, b) => a.d - b.d);
    const right = [];
    for (let r = row; r < row + h; r++) right.push({ col: col + w, row: r, d: Math.abs(r + 0.5 - (row + h / 2)) });
    right.sort((a, b) => a.d - b.d);
    const rest = [];
    for (let r = row; r < row + h; r++) rest.push({ col: col - 1, row: r });
    for (let c = col; c < col + w; c++) rest.push({ col: c, row: row - 1 });
    return [...front, ...right, ...rest].filter((p) => this.isOpenCell(p.col, p.row)).map(({ col: c, row: r }) => ({ col: c, row: r }));
  }

  // Nearest reachable free cell to (col, row), skipping cells in `taken` (a Set of "c,r").
  nearestOpen(col, row, taken = null) {
    let best = null;
    let bestD = Infinity;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.isOpenCell(c, r) || taken?.has(`${c},${r}`)) continue;
        const d = Math.abs(c - col) + Math.abs(r - row);
        if (d < bestD) {
          bestD = d;
          best = { col: c, row: r };
        }
      }
    }
    return best;
  }

  // Mark a pathing Grid (same cols × rows as this system): unusable floor and facilities are blocked.
  buildGrid(grid) {
    const occ = this.layout.occ;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) grid.setBlocked(c, r, occ[r * this.cols + c] !== 0);
  }

  _occupancy(ignoreUid) {
    const occ = new Int32Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (!this.isUsable(c, r)) occ[r * this.cols + c] = -1;
    for (const p of this.placed) if (p.uid !== ignoreUid) this._mark(occ, p, p.uid);
    return occ;
  }

  _mark(occ, item, value) {
    const { w, h } = this.sizeOf(item.def, item.rot);
    for (let r = item.row; r < item.row + h; r++) for (let c = item.col; c < item.col + w; c++) if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) occ[r * this.cols + c] = value;
  }

  // The main entrance plus the entrance of every opened separate room.
  get entrances() {
    return [this.entrance, ...this.zones.filter((z) => z.entrance && this.owned.has(z.id)).map((z) => z.entrance)];
  }

  // Flood fill of free cells from the entrances (default: the main one — where workers walk).
  _reach(occ, starts = [this.entrance]) {
    const seen = new Uint8Array(this.cols * this.rows);
    const stack = [];
    for (const e of starts) {
      const i0 = e.row * this.cols + e.col;
      if (occ[i0] !== 0 || seen[i0]) continue;
      seen[i0] = 1;
      stack.push(i0);
    }
    while (stack.length) {
      const i = stack.pop();
      const c = i % this.cols;
      const r = (i - c) / this.cols;
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (seen[ni] || occ[ni] !== 0) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    return seen;
  }

  _accessible(item, reached) {
    const { w, h } = this.sizeOf(item.def, item.rot);
    const ok = (c, r) => c >= 0 && r >= 0 && c < this.cols && r < this.rows && reached[r * this.cols + c] === 1;
    for (let c = item.col; c < item.col + w; c++) if (ok(c, item.row - 1) || ok(c, item.row + h)) return true;
    for (let r = item.row; r < item.row + h; r++) if (ok(item.col - 1, r) || ok(item.col + w, r)) return true;
    return false;
  }

  _no(code, name = '') {
    return { ok: false, code, reason: (this.reasons[code] ?? code).replace('{name}', name) };
  }

  _changed(emit = true) {
    this._totals = null;
    this._layout = null;
    this.version = (this.version ?? 0) + 1;
    if (emit) this.bus?.emit('facility:layout', { version: this.version });
  }

  // --- save -----------------------------------------------------------------------
  serialize() {
    return { expansions: [...this.owned], placement: this.placed.map((p) => ({ ...p })), nextUid: this.nextUid };
  }

  // Restores exactly what was saved (no rule checks: a saved layout was valid when it was made).
  load(s) {
    this.owned = new Set((s?.expansions ?? []).filter((id) => this.zone(id)));
    this.placed = (s?.placement ?? []).filter((p) => this.defs[p.def]).map((p) => ({ uid: p.uid, def: p.def, col: p.col, row: p.row, rot: p.rot ? 1 : 0 }));
    this.nextUid = s?.nextUid ?? this.placed.reduce((m, p) => Math.max(m, p.uid + 1), 1);
    this._changed();
  }
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function effectValue(e, count) {
  const n = Math.min(count, e.maxCount ?? Infinity);
  let v = e.value * n;
  if (e.cap !== undefined && e.cap !== null) v = e.value < 0 ? Math.max(v, e.cap) : Math.min(v, e.cap);
  return v;
}
