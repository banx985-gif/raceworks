// The garage (Milestones 1–4): the home screen. A room on a hidden grid, seen in the 3/4 "dollhouse" view, with the
// team's stations, between the shared top bar and five-button bottom bar (core/ui). The starters walk their routines
// (data/garage.js ROUTINES) with the core Agent pathing, each with a name tag and status icons; when their Energy runs
// low they go and rest until it is back up.
// Drag pans, pinch/wheel zooms (clamped to the room, in the space between the bars), tapping a station or a worker
// opens their sheet, and a long press on empty floor enters Build Mode.
// Everyone's time runs at the top bar's speed (Pause / 1× / 2× / 4×); tick() runs every step, whichever screen shows.
// Milestone 4: while a car is being built, its team works on it and the build plays on the Pit Bay
// (src/ui/carBuildShow.js): one visible stage per phase, smoke for faults, a gold sparkle for breakthroughs.
// Milestone 8: everything is Aaron's art (the rest spot too); people bob as they walk and tilt as they work
// (core/CharacterMotion), work sparks and smoke rise off the bay while the crew builds, and the car on the bay wears
// the team colour (src/ui/livery.js).
// Milestone 10: the facilities (team.facilities → core/FacilitySystem). The stations are whatever the team's layout
// holds (the starting garage: ~8 stations plus props); their standing places are the free cells beside them, so they
// move with them. The car's team walks to the right station for each phase (data/facilities.js PHASE_STATIONS).
// Build Mode: drag a station or prop to move it (its footprint shows green, or red with the reason), tap one to sell
// it (its sheet), Shop to build a new one; every move keeps a way in to every station (core walkway rule). The floor
// and walls are one cached picture (core/CachedLayer), redrawn only when a wing opens: the Starter Garage, the Bay
// Extension (Rank D), and the higher wings as greyed floor.
//
// Plan space (grid, pathing, positions) is flat; only drawing and tapping go through the IsoProjection.
import { THEME, font } from '../../../../core/Theme.js';
import { Grid } from '../../../../core/Grid.js';
import { IsoProjection } from '../../../../core/IsoProjection.js';
import { Camera } from '../../../../core/Camera.js';
import { WorldGestures } from '../../../../core/WorldGestures.js';
import { drawIsoRoom, isoPath as diamond, wallPatch } from '../../../../core/IsoRoom.js';
import { CachedLayer } from '../../../../core/CachedLayer.js';
import { characterPose, drawCharacter } from '../../../../core/CharacterMotion.js';
import { Agent } from '../../../../core/Agent.js';
import { Selection } from '../../../../core/Selection.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { GARAGE, GARAGE_LOOK, REST_STATION, WALK, ROUTINES, WORKER_STATE_TEXT } from '../../data/garage.js';
import { STARTER_AREA, EXPANSIONS, ENTRANCE, PHASE_STATIONS, BUILD_TEXT } from '../../data/facilities.js';
import { REST } from '../../data/balance.js';
import { statusIconsOf } from '../ui/statusIcons.js';
import { createBuildShow } from '../ui/carBuildShow.js';
import { PARTS, PROJECT_SPOTS, PHASES } from '../../data/cars.js';
import { TEAM_COLOURS } from '../../data/setup.js';
import { liveryKey, teamColourId } from '../ui/livery.js';
import { visualFamily } from '../systems/carVisual.js';

const C = THEME.color;
const S = THEME.size;
const L = GARAGE_LOOK;
// The cached floor picture's size limit (real pixels). Measured M10 on a tablet: an 8 MP floor cost ~21 ms a frame to
// copy to the screen, 4–6 MP under 1 ms. The floor is flat colour, so a slightly softer picture at full zoom costs nothing.
const MAX_ROOM_PIXELS = 5e6;
const REFUSED_SEC = 2.6; // how long a refused move's reason stays in the banner
const FLASH_SEC = 2.2; // a just-built facility's footprint glows this long
// Sprite detail steps (Milestone 10, as CAREWORKS M2): sprites are cached at the smallest step at or above the camera zoom,
// so they are drawn about 1:1 — caching them at full zoom and shrinking every frame cost ~13 ms a frame on a tablet once
// the garage had 15+ stations. A few cached sizes per picture, remade once when a pinch crosses a step.
const DETAIL_STEPS = [0.8, 0.9, 1.0, 1.15, 1.3];
const detailFor = (zoom) => DETAIL_STEPS.find((d) => d >= zoom - 1e-3) ?? DETAIL_STEPS[DETAIL_STEPS.length - 1];

export function createGarageScreen({ renderer, layout, assets, bus, sheet, openMenu, clock, team, topBar, bottomBar, debug }) {
  const W = renderer.width;
  const { cellSize: CELL, wallH, margin } = GARAGE;
  const { halfW: HW, halfH: HH } = GARAGE.view;
  const fac = team.facilities; // Milestone 10 (the same object for every team the slots load)
  const fs = fac.system;

  // --- the room --------------------------------------------------------------
  // The building: the Starter Garage plus every wing that can be shown (open or greyed; the secret annex never).
  const shown = [{ col: 0, row: 0, w: STARTER_AREA.cols, h: STARTER_AREA.rows }, ...EXPANSIONS.filter((z) => !z.secret)];
  const cols = Math.max(...shown.map((z) => z.col + z.w));
  const rows = Math.max(...shown.map((z) => z.row + z.h));
  const grid = new Grid({ cols: fs.cols, rows: fs.rows, tileSize: CELL }); // pathing: the whole floor there can ever be
  const iso = new IsoProjection({ tileSize: CELL, halfW: HW, halfH: HH, originX: margin + rows * HW, originY: margin + wallH });
  const worldW = (cols + rows) * HW + margin * 2;
  const worldH = (cols + rows) * HH + wallH + margin * 2;
  const room = new CachedLayer({ width: worldW, height: worldH, draw: drawRoom });

  const camera = new Camera({ viewW: W, viewH: renderer.height, worldW, worldH });
  camera.minZoom = GARAGE.zoom.min;
  camera.maxZoom = GARAGE.zoom.max;

  // --- stations (the team's layout) ------------------------------------------------------
  // One object per placed facility or prop, kept by uid so a selection survives a move. fp = its footprint now.
  let stations = [];
  const stationRect = (st, fp = st.fp) => {
    const { draw } = st.def;
    const w = (fp.w + fp.h) * HW * draw.width;
    const h = w / assets.aspect(st.def.art);
    const cx = iso.corner(fp.col + fp.w / 2, fp.row + fp.h / 2).x;
    const base = iso.corner(fp.col + fp.w, fp.row + fp.h).y + HH * draw.drop;
    return { x: cx - w / 2, y: base - h, w, h };
  };
  const fpDepth = (fp) => (fp.col + fp.w / 2 + fp.row + fp.h / 2) * CELL;
  function makeStation(item) {
    return {
      kind: 'station',
      uid: item.uid,
      id: item.def,
      def: fac.defs[item.def],
      fp: fs.footprint(item),
      get rect() {
        return stationRect(this);
      },
      get depth() {
        return fpDepth(this.fp);
      },
    };
  }
  const stationById = (id) => stations.find((s) => s.id === id) ?? null;
  const stationByUid = (uid) => stations.find((s) => s.uid === uid) ?? null;

  // The layout changed (a move, a sale, a purchase, a load, a wing): stations, the pathing grid, the tap lists, walkers.
  function syncStations() {
    const old = new Map(stations.map((s) => [s.uid, s]));
    stations = fs.placed.map((p) => {
      const st = old.get(p.uid) ?? makeStation(p);
      st.fp = fs.footprint(p);
      return st;
    });
    fs.buildGrid(grid);
    for (const s of old.values()) {
      selection.remove(s);
      picker.remove(s);
    }
    for (const s of stations) {
      if (!s.def.prop) selection.add(s); // props are dressing: tapped only in Build Mode
      picker.add(s);
    }
    repathWorkers();
  }
  let roomOwned = '';
  function syncRoom() {
    const now = [...fs.owned].sort().join();
    if (now !== roomOwned) {
      roomOwned = now;
      room.invalidate();
    }
  }
  bus.on('facility:layout', () => {
    syncStations();
    syncRoom();
  });

  // A station's standing places (free cells beside it, front first). The Pit Bay's project team keeps its own spread-out
  // places (PROJECT_SPOTS, from the bay's corner) while they are free.
  const placesOf = (st) => fs.accessCells(st.uid);
  function cellFor(stop) {
    if (stop.cell) {
      if (fs.isOpenCell(stop.cell.col, stop.cell.row)) return stop.cell; // a save from before Milestone 10
      stop = { ...stop, cell: null, spot: stop.slot ?? 0 };
    }
    const st = stationById(stop.at);
    if (!st) return null;
    if (stop.project && stop.at === 'F02' && PROJECT_SPOTS[stop.slot]) {
      const d = PROJECT_SPOTS[stop.slot];
      const c = { col: st.fp.col + d.dc, row: st.fp.row + d.dr };
      if (fs.isOpenCell(c.col, c.row)) return c;
    }
    const cells = placesOf(st);
    const k = Number.isInteger(stop.spot) ? stop.spot : 0; // (a save from before Milestone 10 named its spots)
    return cells.length ? cells[k % cells.length] : null;
  }
  const idleCell = (a) => {
    const c = a.routine.idle;
    return fs.isOpenCell(c.col, c.row) ? c : (fs.nearestOpen(c.col, c.row) ?? c);
  };

  // --- the workers -------------------------------------------------------------------
  // One Agent per staff member on the team with a routine (Milestone 4b: the trio depends on the founder). Phases: idle → toWork → working → back → idle, or (a rest stop, or
  // Energy below REST.goBelowEnergy) idle → toRest → resting → back. Arrivals move them on; timers run on stateTime.
  const makeWorker = (staffId, routine) => {
    const a = new Agent({ id: staffId, speed: WALK.speed });
    a.kind = 'worker';
    a.staffId = staffId;
    a.routine = routine;
    a.phase = 'idle';
    a.stop = null; // the stop being walked to / used: { at, spot, sec, activity }
    a.nextStop = 0; // index of the next routine stop
    a.loops = 0; // completed trips (back at the idle spot)
    const c = idleCell(a);
    a.placeAtTile(grid, c.col, c.row);
    return a;
  };
  const buildWorkers = () => team.roster.filter((s) => ROUTINES[s.id]).map((s) => makeWorker(s.id, ROUTINES[s.id]));
  let workers = [];
  const workerById = (id) => workers.find((a) => a.staffId === id);
  const LEAD = 'MEC01'; // Tessa: the Milestone 1 loop (the M1 checks follow her; she is on every starting team)
  const leadWorker = () => workerById(LEAD) ?? workers[0];
  const staffOf = (a) => team.get(a.staffId);
  const workerRect = (a) => {
    const f = iso.toWorld(a.x, a.y);
    const h = WALK.height;
    const w = h * assets.aspect(staffOf(a)?.art ?? 'staff_mec01');
    return { x: f.x - w / 2, y: f.y - h + HH * 0.25, w, h };
  };

  const phaseLog = []; // Tessa's recent phase changes (tests / debug)
  const visits = []; // where the car's team worked, per phase (tests / debug): { staffId, at, phase }
  let simTime = 0; // game seconds since the garage started (scaled by the speed)
  const setPhase = (a, phase) => {
    a.phase = phase;
    if (a.staffId === LEAD) {
      phaseLog.push({ phase, t: +simTime.toFixed(2), teleports: a.teleports });
      if (phaseLog.length > 40) phaseLog.shift();
    }
    debug?.log(`${staffOf(a)?.name.split(' ')[0] ?? a.staffId}: ${phase}`);
  };
  const goTo = (a, stop, walkPhase, atPhase) => {
    const spot = cellFor(stop);
    if (!spot) return goBack(a); // its station isn't in the garage (sold): back to waiting
    a.stop = stop;
    setPhase(a, walkPhase);
    a.walkTo(grid, spot.col, spot.row, () => {
      setPhase(a, atPhase);
      a.setState(atPhase === 'resting' ? 'resting' : 'working');
      if (stop.project) {
        visits.push({ staffId: a.staffId, at: stop.at, phase: stop.phase });
        if (visits.length > 60) visits.shift();
      }
    });
  };
  const goBack = (a) => {
    setPhase(a, 'back');
    const c = idleCell(a);
    a.walkTo(grid, c.col, c.row, () => {
      a.loops++;
      a.stop = null;
      setPhase(a, 'idle');
    });
  };
  // On the car's team (Milestone 10, style guide §5): long stints at the station for this phase — the phase's stations
  // (PHASE_STATIONS) in turn, in slot order, skipping any not built; the Pit Bay when none are. Resting comes first.
  function routineOf(a) {
    const job = team.cars.active;
    const i = job ? job.slots.indexOf(a.staffId) : -1;
    if (i < 0) return a.routine;
    const phase = PHASES[job.phaseIndex].id;
    const ids = (PHASE_STATIONS[phase] ?? []).filter((id) => stationById(id));
    if (!ids.length) ids.push('F02');
    const at = ids[i % ids.length];
    return { ...a.routine, idleSec: 0.6, stops: [{ at, spot: Math.floor(i / ids.length), slot: i, phase, sec: 25, activity: 'working', project: true }] };
  }
  function updateWorker(a, dt) {
    a.update(dt, grid);
    const s = staffOf(a);
    if (!s) return;
    const r = routineOf(a);
    if (a.phase === 'idle' && a.stateTime >= r.idleSec) {
      if (s.energy < REST.goBelowEnergy) {
        goTo(a, { at: REST_STATION, spot: r.restSpot, activity: 'resting', untilRested: true }, 'toRest', 'resting');
      } else {
        const stop = r.stops[a.nextStop % r.stops.length];
        a.nextStop = (a.nextStop + 1) % r.stops.length;
        if (stop.activity === 'resting') goTo(a, stop, 'toRest', 'resting');
        else goTo(a, stop, 'toWork', 'working');
      }
    } else if ((a.phase === 'working' || a.phase === 'toWork') && a.stop?.project && a.stop.phase !== r.stops[0]?.phase) {
      // The car moved on to its next phase (or was finished): the team leaves at once for the new phase's stations
      // (a stint is longer than some phases, so waiting it out would keep them a phase behind).
      if (r.stops[0]?.project) goTo(a, r.stops[0], 'toWork', 'working');
      else goBack(a);
    } else if (a.phase === 'working' || a.phase === 'resting') {
      const done = a.stop?.untilRested ? s.energy >= REST.backAtEnergy : a.stateTime >= a.stop.sec;
      if (done) goBack(a);
    }
  }

  // After a layout change: anyone now standing inside a facility steps to the nearest free cell; anyone walking sets
  // off again round the new layout; anyone at a station that moved (or went) walks to its new place (or back).
  function repathWorkers() {
    for (const a of workers) {
      const t = a.tile(grid);
      if (t && grid.isBlocked(t.col, t.row)) {
        const n = fs.nearestOpen(t.col, t.row);
        if (n) a.placeAtTile(grid, n.col, n.row);
      }
      if ((a.phase === 'toWork' || a.phase === 'toRest') && a.stop) goTo(a, a.stop, a.phase, a.phase === 'toRest' ? 'resting' : 'working');
      else if (a.phase === 'back') goBack(a);
      else if ((a.phase === 'working' || a.phase === 'resting') && a.stop) {
        const c = cellFor(a.stop);
        const here = a.tile(grid);
        if (!c) goBack(a);
        else if (!here || c.col !== here.col || c.row !== here.row) goTo(a, a.stop, a.phase === 'resting' ? 'toRest' : 'toWork', a.phase);
      }
    }
  }

  team.restingOf = (staffId) => {
    const a = workerById(staffId);
    return !!a && (a.phase === 'resting' || a.phase === 'toRest');
  };

  // --- the visible build in the Pit Bay ---------------------------------------------------
  // busy: the clock is running and someone on the car's team is working (the work sparks and smoke).
  const show = createBuildShow({ assets, pixelScale: () => renderer.pixelScale, busy: () => !clock.paused && !!team.cars.active && workers.some((a) => a.phase === 'working' && a.stop?.project) });
  bus.on('car:fault', () => show.event('smoke'));
  bus.on('car:breakthrough', () => show.event('sparkle'));
  bus.on('car:fix', () => show.event('fix'));
  const bayFloor = () => {
    const fp = stationById('F02')?.fp ?? { col: 6, row: 2 };
    return iso.corner(fp.col + 2, fp.row + 2.4); // the middle of the bay's platform
  };
  const showView = () => {
    const job = team.cars.active;
    const vis = visualFamily({ classId: job?.data.classId ?? 'clubHatch', parts: job?.data.parts }); // the car this build becomes
    const last = team.cars.cars.latest();
    return {
      job,
      fraction: job ? team.cars.fraction(job) : 0,
      carKey: liveryKey(assets, vis.showcase, teamColourId(team)),
      partKeys: (job?.data.parts ?? []).map((id) => PARTS[id].art),
      at: bayFloor(),
      width: 300,
      lastCar: last?.result?.art ? liveryKey(assets, last.result.art, teamColourId(team)) : null,
    };
  };

  // What the daily tick counts them as doing (core/StaffSystem planActivity).
  const activityOf = (staffId) => {
    const a = workerById(staffId);
    return a?.phase === 'working' ? 'working' : a?.phase === 'resting' ? 'resting' : 'idle';
  };
  const stateText = (staffId) => {
    const a = workerById(staffId);
    if (!a) return '';
    const place = a.stop ? (fac.defs[a.stop.at]?.name ?? '') : '';
    return WORKER_STATE_TEXT[a.phase].replace('{place}', place);
  };

  // Save / load: where everyone is and what they are doing. Someone who was walking sets off again from there.
  function snapshot() {
    return Object.fromEntries(
      workers.map((a) => [a.staffId, { x: +a.x.toFixed(1), y: +a.y.toFixed(1), phase: a.phase, stop: a.stop, nextStop: a.nextStop, stateTime: +a.stateTime.toFixed(2), loops: a.loops }]),
    );
  }
  function restore(snap) {
    for (const a of workers) {
      const w = snap?.[a.staffId];
      if (!w) continue;
      a.x = w.x;
      a.y = w.y;
      a.path = [];
      a.nextStop = w.nextStop ?? 0;
      a.loops = w.loops ?? 0;
      a.stop = w.stop ?? null;
      a.phase = w.phase;
      const t = a.tile(grid);
      if (!t || grid.isBlocked(t.col, t.row)) {
        const c = idleCell(a);
        a.placeAtTile(grid, c.col, c.row);
      }
      if ((w.phase === 'toWork' || w.phase === 'toRest') && a.stop) goTo(a, a.stop, w.phase, w.phase === 'toRest' ? 'resting' : 'working');
      else if (w.phase === 'back') goBack(a);
      else if ((w.phase === 'working' || w.phase === 'resting') && a.stop) {
        a.setState(w.phase);
        a.stateTime = w.stateTime ?? 0;
      } else {
        a.phase = 'idle';
        a.stop = null;
        a.setState('idle');
        a.stateTime = w.stateTime ?? 0;
      }
    }
  }

  // Tapping: everything is hit-tested where it is drawn (projected), nearest-to-viewer first.
  const depthOf = (it) => (it.kind === 'worker' ? it.x + it.y : moving?.st === it ? fpDepth(movingFp()) : it.depth);
  const selection = new Selection(bus, {
    boundsOf: (item) => (item.kind === 'worker' ? workerRect(item) : item.rect),
    depthOf: (item) => depthOf(item),
  });
  const picker = new Selection(null, { boundsOf: (it) => it.rect, depthOf: (it) => depthOf(it) }); // Build Mode: stations and props
  const menuKind = (item) => (item.kind === 'worker' ? 'worker' : item.id);

  // --- Build Mode (Milestone 10) ------------------------------------------------
  let buildMode = false;
  let press = null; // { id, st } — a finger down on a station in Build Mode
  let moving = null; // { id, st, grab: { dc, dr }, col, row, res: { ok, reason } }
  let note = null; // { text, bad, t } — the banner's message for a moment (a refused move, a purchase)
  let flash = null; // { uid, t } — a just-built facility glows
  const moves = []; // placed / refused moves (tests / debug)
  const movingFp = () => ({ ...moving.st.fp, col: moving.col, row: moving.row });
  const bannerRect = () => {
    const sr = layout.safeRect;
    return { x: sr.x + 24, y: sr.y + 24, w: sr.w - 48, h: 190 };
  };
  const doneRect = () => {
    const b = bannerRect();
    return { x: b.x + b.w - 250, y: b.y + (b.h - 120) / 2, w: 226, h: 120 };
  };
  const shopRect = () => {
    const d = doneRect();
    return { x: d.x - 246, y: d.y, w: 226, h: d.h };
  };
  // Floor cell under a screen point, without clamping to the room (a dragged station can hang off the edge).
  const rawCell = (sx, sy) => {
    const w = camera.screenToWorld(sx, sy);
    const plan = iso.toPlan(w.x, w.y);
    return { col: Math.floor(plan.x / CELL), row: Math.floor(plan.y / CELL) };
  };
  // Build Mode picks: the station standing on the floor cell under the finger, else whichever art is under it.
  function buildPick(sx, sy) {
    const c = rawCell(sx, sy);
    if (c.col >= 0 && c.row >= 0 && c.col < fs.cols && c.row < fs.rows) {
      const uid = fs.layout.occ[c.row * fs.cols + c.col];
      if (uid > 0) return stationByUid(uid);
    }
    const w = camera.screenToWorld(sx, sy);
    return picker.pick(w.x, w.y);
  }
  function updateMove(p) {
    const cell = rawCell(p.x, p.y);
    moving.col = cell.col - moving.grab.dc;
    moving.row = cell.row - moving.grab.dr;
    moving.res = fac.check(moving.st.id, moving.col, moving.row, moving.st.uid);
  }
  function drop() {
    const m = moving;
    moving = null;
    press = null;
    if (m.col === m.st.fp.col && m.row === m.st.fp.row) return;
    const r = fac.move(m.st.uid, m.col, m.row);
    moves.push({ uid: m.st.uid, id: m.st.id, col: m.col, row: m.row, placed: r.ok, reason: r.reason ?? null });
    if (moves.length > 40) moves.shift();
    note = r.ok ? null : { text: r.reason, bad: true, t: 0 };
    debug?.log(r.ok ? `${m.st.def.name} moved to ${m.col},${m.row}` : `${m.st.def.name} refused at ${m.col},${m.row}: ${r.reason}`);
  }

  // --- camera helpers ------------------------------------------------------------
  // The camera sees the space between the two bars, so its clamp keeps every room edge reachable.
  function fitView() {
    const top = topBar.rect();
    const bottom = bottomBar.rect();
    camera.viewX = 0;
    camera.viewY = top.y + top.h + 8;
    camera.setView(W, bottom.y - 8 - camera.viewY);
  }
  // Start looking at the working stations (the Starter Garage's middle), at the starting zoom.
  function resetView() {
    fitView();
    camera.zoom = GARAGE.zoom.start;
    const own = stations.filter((s) => !s.def.prop && s.fp.col < STARTER_AREA.cols && s.fp.row < STARTER_AREA.rows).map((s) => s.rect);
    const xs = own.flatMap((r) => [r.x, r.x + r.w]);
    const ys = own.flatMap((r) => [r.y, r.y + r.h]);
    camera.centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2 + HH * 2);
  }
  const viewCell = () => {
    const c = rawCell(camera.viewX + camera.viewW / 2, camera.viewY + camera.viewH / 2);
    return { col: Math.max(0, Math.min(fs.cols - 1, c.col)), row: Math.max(0, Math.min(fs.rows - 1, c.row)) };
  };

  // Gestures: one finger pans, two fingers pinch. A gesture that ever had two fingers never becomes a tap or hold.
  let active = false; // only while the garage is the current screen
  const gestures = new WorldGestures({ camera, bus, isActive: () => active });
  const overSheet = (p) => sheet.active && p.y >= sheet.rect().y;
  const onUi = (p) => (buildMode ? hitRect(p, bannerRect()) : topBar.contains(p) || bottomBar.contains(p));

  const taps = []; // recent taps and what they hit (tests / debug)
  let started = false;

  const screen = {
    camera,
    grid,
    iso,
    get stations() {
      return stations;
    },
    get worker() {
      return leadWorker();
    },
    get workers() {
      return workers;
    },
    workerById,
    stationById,
    stationByUid,
    // A different team was loaded or started (Milestone 4b): new workers from its roster, their saved places, its
    // garage layout (Milestone 10), the team colour on the walls, and the starting view.
    loadTeam() {
      for (const a of workers) selection.remove(a);
      selection.clear();
      workers = buildWorkers();
      workers.forEach((a) => selection.add(a));
      phaseLog.length = 0;
      visits.length = 0;
      simTime = 0;
      buildMode = false;
      moving = null;
      press = null;
      syncStations();
      roomOwned = null;
      syncRoom();
      room.invalidate();
      if (started) {
        restore(team.garageState);
        screen.resize();
        resetView();
      }
    },
    selection,
    picker,
    gestures, // (tests)
    show,
    showView,
    // Bring the Pit Bay into the middle of the view (a car has just been started).
    focusPitBay() {
      const r = stationById('F02')?.rect;
      if (r) camera.centerOn(r.x + r.w / 2, r.y + r.h * 0.6);
    },
    // Bring a station into the middle of the view (a facility just built).
    focus(uid) {
      const r = stationByUid(uid)?.rect;
      if (r) camera.centerOn(r.x + r.w / 2, r.y + r.h * 0.6);
    },
    // The finished car's moment on the bay: a flash and a gold sparkle.
    reveal() {
      show.event('reveal');
    },
    taps,
    moves,
    visits,
    phaseLog,
    room, // (tests: the cached floor's rebuild count)
    get buildMode() {
      return buildMode;
    },
    get moving() {
      return moving;
    },
    get simTime() {
      return simTime;
    },
    topBar,
    bottomBar,
    doneRect,
    shopRect,
    bannerRect,
    viewCell,

    activityOf,
    stateText,
    snapshot,
    restore,

    // Screen point at the middle of a station's art or a worker ('worker' = Tessa, or a staff id) (tests).
    screenPointOf(id) {
      const a = id === 'worker' ? leadWorker() : workerById(id);
      const r = a ? workerRect(a) : stationById(id).rect;
      return camera.worldToScreen(r.x + r.w / 2, r.y + r.h * 0.6);
    },
    // A screen point where a tap reaches this station (nothing in front of it there), or null (tests).
    tapPointOf(id) {
      const st = typeof id === 'number' ? stationByUid(id) : stationById(id);
      if (!st) return null;
      const r = st.rect;
      for (let fy = 0.15; fy < 1; fy += 0.1)
        for (let fx = 0.2; fx < 0.85; fx += 0.1) {
          const x = r.x + r.w * fx;
          const y = r.y + r.h * fy;
          if ((buildMode ? picker : selection).pick(x, y) === st) return camera.worldToScreen(x, y);
        }
      return null;
    },
    // Screen point at the centre of a floor cell (tests).
    screenPointOfCell(col, row) {
      const w = iso.cellCenter(col, row);
      return camera.worldToScreen(w.x, w.y);
    },
    // Floor cell under a screen point, or null if it is off the floor.
    cellAt(sx, sy) {
      const c = rawCell(sx, sy);
      return c.col >= 0 && c.row >= 0 && c.col < cols && c.row < rows ? c : null;
    },

    setBuildMode(on) {
      if (buildMode === on) return;
      buildMode = on;
      moving = null;
      press = null;
      note = null;
      if (on) {
        sheet.close();
        selection.clear();
      }
      debug?.log(`Build Mode ${on ? 'on' : 'off'}`);
    },
    // A facility was just built: it glows, the view goes to it, the banner says so.
    built(item, cost) {
      flash = { uid: item.uid, t: 0 };
      note = { text: `Built: ${fac.defs[item.def].name} (−${cost.toLocaleString('en-US')} Credits). Drag it where you want it.`, bad: false, t: 0 };
      screen.focus(item.uid);
    },
    say(text, bad = false) {
      note = { text, bad, t: 0 };
    },

    enter() {
      active = true;
      if (!started) {
        started = true;
        syncStations();
        restore(team.garageState);
        screen.resize();
        resetView();
      } else screen.resize(); // the window may have changed while another screen was up
    },

    exit() {
      active = false;
      gestures.reset();
      buildMode = false;
      moving = null;
      press = null;
    },

    resize() {
      camera.pixelScale = renderer.pixelScale;
      // Sharp up to full zoom, but never bigger than MAX_ROOM_PIXELS (the whole building is a big picture).
      room.setPixelScale(Math.min(renderer.pixelScale * GARAGE.zoom.max, Math.sqrt(MAX_ROOM_PIXELS / (worldW * worldH))));
      // Keep looking at the same spot in the new view.
      const cx = camera.x + camera.visibleW / 2;
      const cy = camera.y + camera.visibleH / 2;
      fitView();
      camera.centerOn(cx, cy);
    },

    // Real time (runs while paused too): the build show's effects, the banner message, the new-facility glow.
    update(dt) {
      show.update(dt);
      if (note && (note.t += dt) > REFUSED_SEC * (note.bad ? 1 : 1.6)) note = null;
      if (flash && (flash.t += dt) > FLASH_SEC) flash = null;
    },

    // Fixed step, every step whichever screen shows: everyone walks, works and rests at the game speed
    // (stops while the game is paused).
    tick(dt) {
      if (clock.paused) return;
      const gdt = dt * clock.speed;
      simTime += gdt;
      for (const a of workers) updateWorker(a, gdt);
    },

    onDown(p) {
      if (overSheet(p) || onUi(p)) return; // the bars and the sheet never pan or pinch the garage
      if (buildMode && gestures.fingers === 0) {
        const st = buildPick(p.x, p.y);
        if (st) {
          press = { id: p.id, st }; // this finger moves the station
          return;
        }
      }
      gestures.down(p);
    },

    onUp(p) {
      if (press && p.id === press.id) {
        if (moving) drop();
        press = null;
        return;
      }
      gestures.up(p);
    },

    onDragStart(p) {
      if (press && p.id === press.id) {
        const st = press.st;
        const grabbed = rawCell(p.startX, p.startY);
        moving = { id: p.id, st, grab: { dc: grabbed.col - st.fp.col, dr: grabbed.row - st.fp.row }, col: st.fp.col, row: st.fp.row, res: { ok: true } };
        updateMove(p);
        return;
      }
      gestures.dragStart(p);
    },

    onDrag(p) {
      if (moving && p.id === moving.id) {
        updateMove(p);
        return;
      }
      gestures.drag(p);
    },

    onDragEnd(p) {
      if (moving && p.id === moving.id) {
        if (p.cancelled) {
          moving = null; // cancelled (e.g. paused): the station stays where it was
          press = null;
        }
        return;
      }
      gestures.dragEnd(p);
    },

    onWheel(p) {
      if (!moving) gestures.wheel(p);
    },

    onTap(p) {
      if (gestures.multiTouch && !press) return;
      if (buildMode) {
        let picked = null;
        if (hitRect(p, doneRect())) screen.setBuildMode(false);
        else if (hitRect(p, shopRect())) openMenu('shop');
        else if (!hitRect(p, bannerRect())) {
          // Tapping a station in Build Mode opens its facility sheet (sell it there).
          picked = buildPick(p.x, p.y);
          if (picked) openMenu('facility', picked);
        }
        taps.push({ x: p.x, y: p.y, picked: picked?.id ?? null, build: true });
        press = null;
        return;
      }
      if (topBar.handleTap(p) || bottomBar.handleTap(p)) {
        taps.push({ x: p.x, y: p.y, picked: 'bar' });
        return;
      }
      const w = camera.screenToWorld(p.x, p.y);
      const picked = selection.handleTap(w.x, w.y);
      if (picked) openMenu(menuKind(picked), picked);
      taps.push({ x: p.x, y: p.y, picked: picked ? (picked.kind === 'worker' ? picked.staffId : picked.id) : null });
      if (taps.length > 50) taps.shift();
    },

    // Long press on empty floor → Build Mode. On a station or a worker it just opens their sheet.
    onHold(p) {
      if (gestures.multiTouch || gestures.fingers > 1 || buildMode || onUi(p) || overSheet(p)) return;
      const w = camera.screenToWorld(p.x, p.y);
      const picked = selection.pick(w.x, w.y);
      if (picked) {
        selection.select(picked);
        openMenu(menuKind(picked), picked);
      } else if (screen.cellAt(p.x, p.y)) screen.setBuildMode(true);
    },

    render(ctx) {
      camera.apply(ctx);
      room.render(ctx, 0, 0);
      if (buildMode) drawBuildFloor(ctx);
      drawSelectionMark(ctx);
      // Stations, props and workers, back to front.
      // Anything wholly off screen is skipped, and sprites are cached near the size they are drawn (a full garage stays cheap).
      const items = [...stations, ...workers].sort((a, b) => depthOf(a) - depthOf(b));
      assets.detail = detailFor(camera.zoom);
      for (const it of items) {
        if (it.kind === 'worker') {
          // style guide §5: a bob while walking, a small tilt while working, a breath while waiting (the art keeps
          // the way it was drawn: no flip). Everyone moves out of step (seeded by their place in the list).
          const r = workerRect(it);
          if (!camera.isVisible(r)) continue;
          const pose = characterPose(it, simTime, workers.indexOf(it) * 1.7, POSE);
          pose.flip = 1;
          drawCharacter(ctx, assets, staffOf(it)?.art, r.x + r.w / 2, r.y + r.h, r.w, r.h, pose);
        } else {
          const lifted = moving?.st === it;
          const r = lifted ? stationRect(it, movingFp()) : it.rect;
          if (!camera.isVisible(r)) continue;
          if (lifted) ctx.globalAlpha = 0.78;
          assets.draw(ctx, it.def.art, r.x, r.y, r.w, r.h);
          ctx.globalAlpha = 1;
          if (it.id === 'F02' && !lifted) show.draw(ctx, showView());
        }
      }
      assets.detail = 1;
      if (moving) drawMovingFootprint(ctx);
      camera.restore(ctx);
      if (!buildMode) drawTags(ctx);

      // Build Mode's banner takes the top bar's place; the bottom bar steps aside until Done.
      if (buildMode) drawBuildBanner(ctx);
      else {
        topBar.render(ctx);
        bottomBar.render(ctx);
      }
    },
  };

  const POSE = { bob: 0, tilt: 0, flip: 1 }; // reused every frame

  // --- drawing -------------------------------------------------------------------
  // Floor and the two back walls (with the team stripes) over the whole building, the door, and the wings not open yet
  // as greyed floor with their name — drawn once into the cached layer (world units), again only when a wing opens.
  function drawRoom(g) {
    const colour = TEAM_COLOURS.find((c) => c.id === team.setup?.colour);
    drawIsoRoom(g, iso, {
      cols,
      rows,
      wallH,
      look: { floorA: L.floorA, floorB: L.floorB, grout: L.grout, wallFace: L.wallFace, wallSide: L.wallSide, wallLine: C.line, wallCap: L.wallCap },
      bands: [
        { from: 0.42, to: 0.52, color: colour?.main ?? L.stripe }, // the team colour (Milestone 4b)
        { from: 0.37, to: 0.4, color: colour?.light ?? L.stripe2 },
      ],
    });
    // The door in the left wall (where people come in: always kept clear).
    diamond(g, wallPatch(iso, 'left', ENTRANCE.row + 0.08, ENTRANCE.row + 0.92, 0, wallH * 0.72));
    g.fillStyle = L.door;
    g.fill();
    g.strokeStyle = L.wallCap;
    g.lineWidth = 4;
    g.stroke();
    // Locked wings: greyed tiles, a dashed edge and their name.
    for (const z of fac.expansions()) {
      if (z.state !== 'locked') continue;
      for (let r = z.row; r < z.row + z.h; r++)
        for (let c = z.col; c < z.col + z.w; c++) {
          diamond(g, iso.outline(c, r));
          g.fillStyle = (c + r) % 2 ? L.lockedA : L.lockedB;
          g.fill();
        }
      diamond(g, iso.outline(z.col, z.row, z.w, z.h));
      g.setLineDash([18, 12]);
      g.strokeStyle = L.lockedLine;
      g.lineWidth = 4;
      g.stroke();
      g.setLineDash([]);
      const mid = iso.cellCenter(z.col + z.w / 2 - 0.5, z.row + z.h / 2 - 0.5);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = L.lockedText;
      g.font = font(44, true);
      g.fillText(z.name, mid.x, mid.y - 26);
      g.font = font(32);
      g.fillText(z.why, mid.x, mid.y + 22);
    }
  }

  function line(g, a, b) {
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }

  // Build Mode floor: the hidden grid over the open floor, every footprint outlined, the dragged one green (fits) or
  // red (refused), and a just-built one glowing.
  function drawBuildFloor(ctx) {
    ctx.strokeStyle = L.gridLine;
    ctx.lineWidth = 3 / camera.zoom;
    for (const z of fac.expansions()) {
      if (z.state !== 'open') continue;
      for (let c = z.col; c <= z.col + z.w; c++) line(ctx, iso.corner(c, z.row), iso.corner(c, z.row + z.h));
      for (let r = z.row; r <= z.row + z.h; r++) line(ctx, iso.corner(z.col, r), iso.corner(z.col + z.w, r));
    }
    for (const st of stations) {
      if (moving?.st === st) continue;
      diamond(ctx, iso.outline(st.fp.col, st.fp.row, st.fp.w, st.fp.h));
      ctx.fillStyle = flash?.uid === st.uid ? C.glow : L.footprint;
      ctx.fill();
      ctx.strokeStyle = flash?.uid === st.uid ? C.action : L.footprintLine;
      ctx.lineWidth = 4 / camera.zoom;
      ctx.stroke();
    }
    // The doorway stays clear.
    diamond(ctx, iso.outline(ENTRANCE.col, ENTRANCE.row));
    ctx.fillStyle = L.doorway;
    ctx.fill();
  }
  // The dragged station's footprint, over everything (so it shows even on top of another station): green or red.
  function drawMovingFootprint(ctx) {
    const fp = movingFp();
    diamond(ctx, iso.outline(fp.col, fp.row, fp.w, fp.h));
    ctx.fillStyle = moving.res.ok ? L.okFill : L.badFill;
    ctx.fill();
    ctx.strokeStyle = moving.res.ok ? C.good : C.bad;
    ctx.lineWidth = 6 / camera.zoom;
    ctx.stroke();
  }

  // The selected station's footprint (or Tessa's cell) glows on the floor while its sheet is open.
  function drawSelectionMark(ctx) {
    const it = sheet.active ? (buildMode ? facilitySheetTarget() : selection.selected) : null;
    if (!it) return;
    const pts = it.kind === 'worker' ? cellOutline(it.tile(grid)) : iso.outline(it.fp.col, it.fp.row, it.fp.w, it.fp.h);
    if (!pts) return;
    diamond(ctx, pts);
    ctx.fillStyle = C.glow;
    ctx.fill();
    ctx.strokeStyle = C.action;
    ctx.lineWidth = 5 / camera.zoom;
    ctx.stroke();
  }
  let sheetTarget = null; // the station whose facility sheet is open in Build Mode
  const facilitySheetTarget = () => (sheetTarget && stations.includes(sheetTarget) ? sheetTarget : null);
  screen.setSheetTarget = (st) => (sheetTarget = st);
  const cellOutline = (t) => (t ? iso.outline(t.col, t.row) : null);

  // Name tags and status icons over each worker, in screen space (so they stay readable at any zoom), kept inside
  // the garage's view between the bars. Tags that would overlap (people standing together) stack upwards.
  // A station marked tag (the rest spot) gets its name under it, so it's clear what it is.
  function drawTags(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(camera.viewX, camera.viewY, camera.viewW, camera.viewH);
    ctx.clip();
    const tagH = 44;
    const chip = (label, x, y, w) => {
      ctx.fillStyle = C.chip;
      ctx.beginPath();
      ctx.roundRect(x, y, w, tagH, tagH / 2);
      ctx.fill();
      ctx.fillStyle = C.textOnDark;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + tagH / 2 + 1);
    };
    ctx.font = font(S.small, true);
    for (const st of stations.filter((x) => x.def.tag)) {
      const r = st.rect;
      const foot = camera.worldToScreen(r.x + r.w / 2, r.y + r.h);
      const tw = ctx.measureText(st.def.name).width + 28;
      chip(st.def.name, foot.x - tw / 2, foot.y + 8, tw);
    }
    const job = team.cars.active;
    const bayStation = stationById('F02');
    if (job && bayStation) {
      const bay = bayStation.rect;
      const top = camera.worldToScreen(bay.x + bay.w / 2, bay.y);
      const label = PHASES[job.phaseIndex].stage;
      const faults = team.cars.openFaults(job);
      const faultLabel = faults ? `${faults} fault${faults > 1 ? 's' : ''}` : '';
      ctx.font = font(S.small, true);
      const tw = ctx.measureText(label).width + 28;
      const fw = faultLabel ? ctx.measureText(faultLabel).width + 28 : 0;
      const x0 = top.x - (tw + (fw ? fw + 8 : 0)) / 2;
      chip(label, x0, top.y + 6, tw);
      if (fw) {
        ctx.fillStyle = C.bad;
        ctx.beginPath();
        ctx.roundRect(x0 + tw + 8, top.y + 6, fw, tagH, tagH / 2);
        ctx.fill();
        ctx.fillStyle = C.textOnDark;
        ctx.fillText(faultLabel, x0 + tw + 8 + fw / 2, top.y + 6 + tagH / 2 + 1);
      }
    }
    const placed = [];
    // Nearest the viewer first, so they keep their tag right above their head.
    for (const a of [...workers].sort((p, q) => depthOf(q) - depthOf(p))) {
      const s = staffOf(a);
      if (!s) continue;
      const r = workerRect(a);
      const head = camera.worldToScreen(r.x + r.w / 2, r.y);
      const label = s.name.split(' ')[0];
      ctx.font = font(S.small, true);
      const tw = ctx.measureText(label).width + 28;
      const icons = statusIconsOf(s);
      const iconS = 46;
      const total = tw + icons.length * (iconS + 6);
      const box = { x: head.x - total / 2, y: head.y - tagH - 8, w: total, h: tagH };
      while (placed.some((p) => box.x < p.x + p.w + 6 && p.x < box.x + box.w + 6 && box.y < p.y + p.h + 4 && p.y < box.y + box.h + 4)) box.y -= tagH + 6;
      placed.push(box);
      chip(label, box.x, box.y, tw);
      let x = box.x + tw + 6;
      for (const key of icons) {
        assets.drawContained(ctx, key, { x, y: box.y + (tagH - iconS) / 2, w: iconS, h: iconS });
        x += iconS + 6;
      }
    }
    ctx.restore();
  }

  // The banner: what Build Mode is for (or the dragged station's reason / the latest news), Credits, Shop and Done.
  function drawBuildBanner(ctx) {
    const b = bannerRect();
    ctx.fillStyle = C.panel;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = THEME.panel.line;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, THEME.panel.radius);
    ctx.fill();
    ctx.stroke();
    const textW = shopRect().x - b.x - 56;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.text;
    ctx.font = font(S.title, true);
    ctx.fillText('Build Mode', b.x + 36, b.y + 26, textW);
    let msg = { text: `${BUILD_TEXT.hint} · ${team.money.credits.toLocaleString('en-US')} Cr`, color: C.textMuted };
    if (moving && moving.res.ok) msg = { text: `${moving.st.def.name}: let go to place it here`, color: C.good };
    else if (moving) msg = { text: moving.res.reason, color: C.bad };
    else if (note) msg = { text: note.text, color: note.bad ? C.bad : C.actionDark };
    else if (team.money.economy.isBlocked('facility')) msg = { text: `${BUILD_TEXT.debt} · moving and selling still work`, color: C.bad };
    ctx.fillStyle = msg.color;
    ctx.font = font(S.small, true);
    wrap(ctx, msg.text, b.x + 36, b.y + 100, textW, 36, 2);
    drawButton(ctx, shopRect(), 'Shop', { accent: C.action });
    drawButton(ctx, doneRect(), 'Done', { accent: C.progress });
  }
  // Up to `maxLines` lines of wrapped text (the last one squeezed to fit).
  function wrap(ctx, text, x, y, w, lh, maxLines) {
    const lines = [''];
    for (const word of String(text).split(' ')) {
      const cur = lines[lines.length - 1];
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > w && lines.length < maxLines) lines.push(word);
      else lines[lines.length - 1] = next;
    }
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh, w));
  }

  return screen;
}
