// The garage (Milestones 1–4): the home screen. A small room on a hidden grid, seen in the 3/4 "dollhouse" view,
// with the Pit Bay, the Strategy Desk and the rest spot, between the shared top bar and five-button bottom
// bar (core/ui). The three starters walk their routines (data/garage.js ROUTINES) with the core Agent pathing, each
// with a name tag and status icons; when their Energy runs low they go and rest until it is back up.
// Drag pans, pinch/wheel zooms (clamped to the room, in the space between the bars), tapping a station or a worker
// opens their sheet, and a long press on empty floor enters the placeholder Build Mode.
// Everyone's time runs at the top bar's speed (Pause / 1× / 2× / 4×); tick() runs every step, whichever screen shows.
// Milestone 4: while a car is being built, its team works at the Pit Bay and the build plays on the bay
// (src/ui/carBuildShow.js): one visible stage per phase, smoke for faults, a gold sparkle for breakthroughs.
// Milestone 8: everything is Aaron's art (the rest spot too); people bob as they walk and tilt as they work
// (core/CharacterMotion), work sparks and smoke rise off the bay while the crew builds, and the car on the bay wears
// the team colour (src/ui/livery.js).
//
// Plan space (grid, pathing, positions) is flat; only drawing and tapping go through the IsoProjection.
import { THEME, font } from '../../../../core/Theme.js';
import { Grid } from '../../../../core/Grid.js';
import { IsoProjection } from '../../../../core/IsoProjection.js';
import { Camera } from '../../../../core/Camera.js';
import { WorldGestures } from '../../../../core/WorldGestures.js';
import { drawIsoRoom, isoPath as diamond } from '../../../../core/IsoRoom.js';
import { CachedLayer } from '../../../../core/CachedLayer.js';
import { characterPose, drawCharacter } from '../../../../core/CharacterMotion.js';
import { Agent } from '../../../../core/Agent.js';
import { Selection } from '../../../../core/Selection.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { GARAGE, GARAGE_LOOK, STATIONS, REST_STATION, WALK, ROUTINES, WORKER_STATE_TEXT } from '../../data/garage.js';
import { REST } from '../../data/balance.js';
import { statusIconsOf } from '../ui/statusIcons.js';
import { createBuildShow } from '../ui/carBuildShow.js';
import { CLASSES, PARTS, PROJECT_SPOTS, PHASES } from '../../data/cars.js';
import { TEAM_COLOURS } from '../../data/setup.js';
import { liveryKey, teamColourId } from '../ui/livery.js';
import { visualFamily } from '../systems/carVisual.js';

const C = THEME.color;
const S = THEME.size;
const L = GARAGE_LOOK;

export function createGarageScreen({ renderer, layout, assets, bus, sheet, openMenu, clock, team, topBar, bottomBar, debug }) {
  const W = renderer.width;
  const { cols, rows, cellSize: CELL, wallH, margin } = GARAGE;
  const { halfW: HW, halfH: HH } = GARAGE.view;

  // --- the room --------------------------------------------------------------
  const grid = new Grid({ cols, rows, tileSize: CELL });
  const iso = new IsoProjection({ tileSize: CELL, halfW: HW, halfH: HH, originX: margin + rows * HW, originY: margin + wallH });
  const worldW = (cols + rows) * HW + margin * 2;
  const worldH = (cols + rows) * HH + wallH + margin * 2;
  const room = new CachedLayer({ width: worldW, height: worldH, draw: drawRoom });

  const camera = new Camera({ viewW: W, viewH: renderer.height, worldW, worldH });
  camera.minZoom = GARAGE.zoom.min;
  camera.maxZoom = GARAGE.zoom.max;

  // --- stations ------------------------------------------------------------------
  const stations = STATIONS.map((def) => {
    grid.blockRect(def.fp.col, def.fp.row, def.fp.w, def.fp.h);
    return { kind: 'station', id: def.id, def, rect: null, depth: (def.fp.col + def.fp.w / 2 + def.fp.row + def.fp.h / 2) * CELL };
  });
  // Where the art is drawn (projected world): centred on the footprint, base just below its front corner.
  const placeStations = () => {
    for (const st of stations) {
      const { fp, draw } = st.def;
      const w = (fp.w + fp.h) * HW * draw.width;
      const h = w / assets.aspect(st.def.art);
      const cx = iso.corner(fp.col + fp.w / 2, fp.row + fp.h / 2).x;
      const base = iso.corner(fp.col + fp.w, fp.row + fp.h).y + HH * draw.drop;
      st.rect = { x: cx - w / 2, y: base - h, w, h };
    }
  };
  const stationById = (id) => stations.find((s) => s.id === id);
  const spotOf = (stationId, name) => {
    const def = stationById(stationId).def;
    return !name || name === 'spot' ? def.spot : def.spots[name];
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
    a.placeAtTile(grid, routine.idle.col, routine.idle.row);
    return a;
  };
  const buildWorkers = () => team.roster.filter((s) => ROUTINES[s.id]).map((s) => makeWorker(s.id, ROUTINES[s.id]));
  let workers = buildWorkers();
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
    const spot = stop.cell ?? spotOf(stop.at, stop.spot);
    a.stop = stop;
    setPhase(a, walkPhase);
    a.walkTo(grid, spot.col, spot.row, () => {
      setPhase(a, atPhase);
      a.setState(atPhase === 'resting' ? 'resting' : 'working');
    });
  };
  const goBack = (a) => {
    setPhase(a, 'back');
    a.walkTo(grid, a.routine.idle.col, a.routine.idle.row, () => {
      a.loops++;
      a.stop = null;
      setPhase(a, 'idle');
    });
  };
  // On the car's team: long stints at their own spot by the Pit Bay (resting still comes first when tired).
  function routineOf(a) {
    const job = team.cars.active;
    const i = job ? job.slots.indexOf(a.staffId) : -1;
    if (i < 0) return a.routine;
    return { ...a.routine, idleSec: 0.6, stops: [{ at: 'F02', cell: PROJECT_SPOTS[i], sec: 25, activity: 'working', project: true }] };
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
    } else if (a.phase === 'working' || a.phase === 'resting') {
      const done = a.stop?.untilRested ? s.energy >= REST.backAtEnergy : a.stateTime >= a.stop.sec;
      if (done) goBack(a);
    }
  }

  team.restingOf = (staffId) => {
    const a = workerById(staffId);
    return !!a && (a.phase === 'resting' || a.phase === 'toRest');
  };

  // --- the visible build in the Pit Bay ---------------------------------------------------
  // busy: the clock is running and someone on the car's team is working at the bay (the work sparks and smoke).
  const show = createBuildShow({ assets, pixelScale: () => renderer.pixelScale, busy: () => !clock.paused && !!team.cars.active && workers.some((a) => a.phase === 'working' && a.stop?.project) });
  bus.on('car:fault', () => show.event('smoke'));
  bus.on('car:breakthrough', () => show.event('sparkle'));
  bus.on('car:fix', () => show.event('fix'));
  const bayFloor = () => iso.corner(8, 4.4); // the middle of the bay's platform
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
    const place = a.stop ? stationById(a.stop.at).def.name : '';
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
      if (!t || grid.isBlocked(t.col, t.row)) a.placeAtTile(grid, a.routine.idle.col, a.routine.idle.row);
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
  const selection = new Selection(bus, {
    boundsOf: (item) => (item.kind === 'worker' ? workerRect(item) : item.rect),
    depthOf: (item) => depthOf(item),
  });
  stations.forEach((s) => selection.add(s));
  workers.forEach((a) => selection.add(a));
  const menuKind = (item) => (item.kind === 'worker' ? 'worker' : item.id);

  // --- Build Mode (placeholder) ------------------------------------------------
  let buildMode = false;
  const bannerRect = () => {
    const sr = layout.safeRect;
    return { x: sr.x + 24, y: sr.y + 24, w: sr.w - 48, h: 190 };
  };
  const doneRect = () => {
    const b = bannerRect();
    return { x: b.x + b.w - 250, y: b.y + (b.h - 120) / 2, w: 226, h: 120 };
  };

  // --- camera helpers ------------------------------------------------------------
  // The camera sees the space between the two bars, so its clamp keeps every room edge reachable.
  function fitView() {
    const top = topBar.rect();
    const bottom = bottomBar.rect();
    camera.viewX = 0;
    camera.viewY = top.y + top.h + 8;
    camera.setView(W, bottom.y - 8 - camera.viewY);
  }
  // Start between the stations (the working corner of the room), at the starting zoom.
  function resetView() {
    fitView();
    camera.zoom = GARAGE.zoom.start;
    const xs = stations.flatMap((s) => [s.rect.x, s.rect.x + s.rect.w]);
    const ys = stations.flatMap((s) => [s.rect.y, s.rect.y + s.rect.h]);
    camera.centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2 + HH * 2);
  }

  // Gestures: one finger pans, two fingers pinch. A gesture that ever had two fingers never becomes a tap or hold.
  let active = false; // only while the garage is the current screen
  const gestures = new WorldGestures({ camera, bus, isActive: () => active });
  const overSheet = (p) => sheet.active && p.y >= sheet.rect().y;
  const onUi = (p) => (buildMode ? hitRect(p, bannerRect()) : topBar.contains(p) || bottomBar.contains(p));

  const taps = []; // recent taps and what they hit (tests / debug)

  const screen = {
    camera,
    grid,
    iso,
    stations,
    get worker() {
      return leadWorker();
    },
    get workers() {
      return workers;
    },
    workerById,
    // A different team was loaded or started (Milestone 4b): new workers from its roster, their saved places, the
    // team colour on the walls, and the starting view.
    loadTeam() {
      for (const a of workers) selection.remove(a);
      selection.clear();
      workers = buildWorkers();
      workers.forEach((a) => selection.add(a));
      phaseLog.length = 0;
      simTime = 0;
      buildMode = false;
      room.invalidate();
      if (stations[0].rect) {
        restore(team.garageState);
        screen.resize();
        resetView();
      }
    },
    selection,
    gestures, // (tests)
    show,
    showView,
    // Bring the Pit Bay into the middle of the view (a car has just been started).
    focusPitBay() {
      const r = stationById('F02').rect;
      if (r) camera.centerOn(r.x + r.w / 2, r.y + r.h * 0.6);
    },
    // The finished car's moment on the bay: a flash and a gold sparkle.
    reveal() {
      show.event('reveal');
    },
    taps,
    phaseLog,
    get buildMode() {
      return buildMode;
    },
    get simTime() {
      return simTime;
    },
    topBar,
    bottomBar,
    doneRect,

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
    // Screen point at the centre of a floor cell (tests).
    screenPointOfCell(col, row) {
      const w = iso.cellCenter(col, row);
      return camera.worldToScreen(w.x, w.y);
    },
    // Floor cell under a screen point, or null if it is off the floor.
    cellAt(sx, sy) {
      const w = camera.screenToWorld(sx, sy);
      const plan = iso.toPlan(w.x, w.y);
      return grid.worldToTile(plan.x, plan.y);
    },

    setBuildMode(on) {
      if (buildMode === on) return;
      buildMode = on;
      if (on) {
        sheet.close();
        selection.clear();
      }
      debug?.log(`Build Mode ${on ? 'on' : 'off'}`);
    },

    enter() {
      active = true;
      if (!stations[0].rect) {
        placeStations(); // needs the art's shapes, so after loading
        restore(team.garageState);
        screen.resize();
        resetView();
      } else screen.resize(); // the window may have changed while another screen was up
    },

    exit() {
      active = false;
      gestures.reset();
      buildMode = false;
    },

    resize() {
      camera.pixelScale = renderer.pixelScale;
      room.setPixelScale(renderer.pixelScale * GARAGE.zoom.max); // sharp up to full zoom
      // Keep looking at the same spot in the new view.
      const cx = camera.x + camera.visibleW / 2;
      const cy = camera.y + camera.visibleH / 2;
      fitView();
      camera.centerOn(cx, cy);
    },

    // Real time (runs while paused too): the build show's effects.
    update(dt) {
      show.update(dt);
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
      gestures.down(p);
    },

    onUp(p) {
      gestures.up(p);
    },

    onDragStart(p) {
      gestures.dragStart(p);
    },

    onDrag(p) {
      gestures.drag(p);
    },

    onDragEnd(p) {
      gestures.dragEnd(p);
    },

    onWheel(p) {
      gestures.wheel(p);
    },

    onTap(p) {
      if (gestures.multiTouch) return;
      if (buildMode) {
        if (hitRect(p, doneRect())) screen.setBuildMode(false);
        taps.push({ x: p.x, y: p.y, picked: null, build: true });
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
      if (gestures.multiTouch || gestures.fingers > 1 || buildMode || onUi(p)) return;
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
      if (buildMode) drawGridLines(ctx);
      drawSelectionMark(ctx);
      // Stations and workers, back to front. Sprites are cached at full-zoom size so they stay sharp when zoomed.
      const items = [...stations, ...workers].sort((a, b) => depthOf(a) - depthOf(b));
      assets.detail = GARAGE.zoom.max;
      for (const it of items) {
        if (it.kind === 'worker') {
          // style guide §5: a bob while walking, a small tilt while working, a breath while waiting (the art keeps
          // the way it was drawn: no flip). Everyone moves out of step (seeded by their place in the list).
          const r = workerRect(it);
          const pose = characterPose(it, simTime, workers.indexOf(it) * 1.7, POSE);
          pose.flip = 1;
          drawCharacter(ctx, assets, staffOf(it)?.art, r.x + r.w / 2, r.y + r.h, r.w, r.h, pose);
        } else {
          assets.draw(ctx, it.def.art, it.rect.x, it.rect.y, it.rect.w, it.rect.h);
          if (it.id === 'F02') show.draw(ctx, showView());
        }
      }
      assets.detail = 1;
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

  const depthOf = (it) => (it.kind === 'worker' ? it.x + it.y : it.depth);
  const POSE = { bob: 0, tilt: 0, flip: 1 }; // reused every frame

  // --- drawing -------------------------------------------------------------------
  // Floor and the two back walls (with the team stripes), drawn once into the cached layer (world units).
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
  }

  function line(g, a, b) {
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }

  function drawGridLines(ctx) {
    ctx.strokeStyle = L.gridLine;
    ctx.lineWidth = 3 / camera.zoom;
    for (let c = 0; c <= cols; c++) line(ctx, iso.corner(c, 0), iso.corner(c, rows));
    for (let r = 0; r <= rows; r++) line(ctx, iso.corner(0, r), iso.corner(cols, r));
  }

  // The selected station's footprint (or Tessa's cell) glows on the floor while its sheet is open.
  function drawSelectionMark(ctx) {
    const it = selection.selected;
    if (!it || !sheet.active) return;
    const pts = it.kind === 'worker' ? cellOutline(it.tile(grid)) : iso.outline(it.def.fp.col, it.def.fp.row, it.def.fp.w, it.def.fp.h);
    if (!pts) return;
    diamond(ctx, pts);
    ctx.fillStyle = C.glow;
    ctx.fill();
    ctx.strokeStyle = C.action;
    ctx.lineWidth = 5 / camera.zoom;
    ctx.stroke();
  }
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
      const foot = camera.worldToScreen(st.rect.x + st.rect.w / 2, st.rect.y + st.rect.h);
      const tw = ctx.measureText(st.def.name).width + 28;
      chip(st.def.name, foot.x - tw / 2, foot.y + 8, tw);
    }
    const job = team.cars.active;
    if (job) {
      const bay = stationById('F02').rect;
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

  function drawBuildBanner(ctx) {
    const b = bannerRect();
    ctx.fillStyle = C.panel;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = THEME.panel.line;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, THEME.panel.radius);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.text;
    ctx.font = font(S.title, true);
    ctx.fillText('Build Mode', b.x + 36, b.y + 34, b.w - 320);
    ctx.fillStyle = C.textMuted;
    ctx.font = font(S.body);
    ctx.fillText('Nothing to build yet.', b.x + 36, b.y + 112, b.w - 320);
    drawButton(ctx, doneRect(), 'Done', { accent: C.progress });
  }

  return screen;
}
