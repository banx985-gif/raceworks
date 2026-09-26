// The garage (Milestones 1–2): the home screen. A small room on a hidden grid, seen in the 3/4 "dollhouse" view,
// with the Pit Bay, the Strategy Desk and Tessa walking her loop, between the shared top bar and five-button bottom
// bar (core/ui). Drag pans, pinch/wheel zooms (clamped to the room, in the space between the bars), tapping a station
// or Tessa opens her sheet, and a long press on empty floor enters the placeholder Build Mode.
// Tessa's time runs at the top bar's speed (Pause / 1× / 2× / 4×).
//
// Plan space (grid, pathing, Tessa's position) is flat; only drawing and tapping go through the IsoProjection.
import { THEME, font } from '../../../../core/Theme.js';
import { Grid } from '../../../../core/Grid.js';
import { IsoProjection } from '../../../../core/IsoProjection.js';
import { Camera } from '../../../../core/Camera.js';
import { WorldGestures } from '../../../../core/WorldGestures.js';
import { drawIsoRoom, isoPath as diamond } from '../../../../core/IsoRoom.js';
import { CachedLayer } from '../../../../core/CachedLayer.js';
import { Agent } from '../../../../core/Agent.js';
import { Selection } from '../../../../core/Selection.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { GARAGE, GARAGE_LOOK, STATIONS, WORKER } from '../../data/garage.js';

const C = THEME.color;
const S = THEME.size;
const L = GARAGE_LOOK;

export function createGarageScreen({ renderer, layout, assets, bus, sheet, openMenu, clock, topBar, bottomBar, debug }) {
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

  // --- stations and Tessa ------------------------------------------------------
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

  const worker = new Agent({ id: WORKER.id, name: WORKER.name, speed: WORKER.speed });
  worker.kind = 'worker';
  worker.phase = 'idle';
  worker.loops = 0; // completed idle → Pit Bay → idle rounds
  worker.placeAtTile(grid, WORKER.idle.col, WORKER.idle.row);
  const workerRect = () => {
    const f = iso.toWorld(worker.x, worker.y);
    const h = WORKER.height;
    const w = h * assets.aspect(WORKER.art);
    return { x: f.x - w / 2, y: f.y - h + HH * 0.25, w, h };
  };

  // Tessa's loop: idle spot → Pit Bay → work a few seconds → back. Arrivals move her on; timers run on stateTime.
  const phaseLog = []; // recent phase changes (tests / debug)
  let simTime = 0; // game seconds since the garage started (scaled by the speed)
  const setPhase = (phase) => {
    worker.phase = phase;
    phaseLog.push({ phase, t: +simTime.toFixed(2), teleports: worker.teleports });
    if (phaseLog.length > 40) phaseLog.shift();
    debug?.log(`Tessa: ${phase}`);
  };
  function updateWorker(dt) {
    worker.update(dt, grid);
    if (worker.phase === 'idle' && worker.stateTime >= WORKER.idleSec) {
      const spot = stationById(WORKER.workAt).def.spot;
      setPhase('toWork');
      worker.walkTo(grid, spot.col, spot.row, () => {
        setPhase('working');
        worker.setState('working');
      });
    } else if (worker.phase === 'working' && worker.stateTime >= WORKER.workSec) {
      setPhase('back');
      worker.walkTo(grid, WORKER.idle.col, WORKER.idle.row, () => {
        worker.loops++;
        setPhase('idle');
      });
    }
  }

  // Tapping: everything is hit-tested where it is drawn (projected), nearest-to-viewer first.
  const selection = new Selection(bus, {
    boundsOf: (item) => (item.kind === 'worker' ? workerRect() : item.rect),
    depthOf: (item) => (item.kind === 'worker' ? worker.x + worker.y : item.depth),
  });
  stations.forEach((s) => selection.add(s));
  selection.add(worker);
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
    worker,
    selection,
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

    // Screen point at the middle of a station's art / Tessa (tests).
    screenPointOf(id) {
      const r = id === 'worker' ? workerRect() : stationById(id).rect;
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

    // Fixed step: Tessa walks and works at the game speed (stops while the game is paused).
    update(dt) {
      if (clock.paused) return;
      const gdt = dt * clock.speed;
      simTime += gdt;
      updateWorker(gdt);
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
      taps.push({ x: p.x, y: p.y, picked: picked ? (picked.kind === 'worker' ? 'worker' : picked.id) : null });
      if (taps.length > 50) taps.shift();
    },

    // Long press on empty floor → Build Mode. On a station or Tessa it just opens their sheet.
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
      // Stations and Tessa, back to front. Sprites are cached at full-zoom size so they stay sharp when zoomed.
      const items = [...stations, worker].sort((a, b) => depthOf(a) - depthOf(b));
      assets.detail = GARAGE.zoom.max;
      for (const it of items) {
        if (it.kind === 'worker') {
          const r = workerRect();
          assets.draw(ctx, WORKER.art, r.x, r.y, r.w, r.h);
        } else assets.draw(ctx, it.def.art, it.rect.x, it.rect.y, it.rect.w, it.rect.h);
      }
      assets.detail = 1;
      camera.restore(ctx);

      // Build Mode's banner takes the top bar's place; the bottom bar steps aside until Done.
      if (buildMode) drawBuildBanner(ctx);
      else {
        topBar.render(ctx);
        bottomBar.render(ctx);
      }
    },
  };

  const depthOf = (it) => (it.kind === 'worker' ? worker.x + worker.y : it.depth);

  // --- drawing -------------------------------------------------------------------
  // Floor and the two back walls (with the team stripes), drawn once into the cached layer (world units).
  function drawRoom(g) {
    drawIsoRoom(g, iso, {
      cols,
      rows,
      wallH,
      look: { floorA: L.floorA, floorB: L.floorB, grout: L.grout, wallFace: L.wallFace, wallSide: L.wallSide, wallLine: C.line, wallCap: L.wallCap },
      bands: [
        { from: 0.42, to: 0.52, color: L.stripe },
        { from: 0.37, to: 0.4, color: L.stripe2 },
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
    const pts = it.kind === 'worker' ? cellOutline(worker.tile(grid)) : iso.outline(it.def.fp.col, it.def.fp.row, it.def.fp.w, it.def.fp.h);
    if (!pts) return;
    diamond(ctx, pts);
    ctx.fillStyle = C.glow;
    ctx.fill();
    ctx.strokeStyle = C.action;
    ctx.lineWidth = 5 / camera.zoom;
    ctx.stroke();
  }
  const cellOutline = (t) => (t ? iso.outline(t.col, t.row) : null);

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
