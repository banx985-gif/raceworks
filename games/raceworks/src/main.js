// RACEWORKS — boot.
// Starts the shared series engine from core/ and opens the garage. Add ?debug=1 for the FPS/state overlay,
// ?screen=test for the Milestone 0 scaling/tap test screen. Debug badge check: ?debug=1 then B cycles a red badge
// through the bottom-bar buttons (or ?debug=1&badge=staff on a phone).
import { THEME, font } from '../../../core/Theme.js';
import { EventBus } from '../../../core/EventBus.js';
import { Rng } from '../../../core/Rng.js';
import { Renderer } from '../../../core/Renderer.js';
import { UiLayout } from '../../../core/UiLayout.js';
import { Input } from '../../../core/Input.js';
import { ScreenRouter } from '../../../core/ScreenRouter.js';
import { AssetManager } from '../../../core/AssetManager.js';
import { FixedStepLoop } from '../../../core/FixedStepLoop.js';
import { DebugOverlay } from '../../../core/DebugOverlay.js';
import { BottomSheet } from '../../../core/ui/BottomSheet.js';
import { createTopBar } from '../../../core/ui/TopBar.js';
import { createBottomBar } from '../../../core/ui/BottomBar.js';
import { Clock } from '../../../core/Clock.js';
import { drawButton, hitRect, setPressPoint, clearPress } from '../../../core/ui/Button.js';
import { ASSETS } from '../data/assets.js';
import { BOTTOM_SLOTS, TOP_BAR } from '../data/home.js';
import { createBackNav } from './app/backNav.js';
import { createGarageScreen } from './screens/GarageScreen.js';
import { createTestScreen } from './screens/TestScreen.js';
import { createRouteTestScreen } from './screens/RouteTestScreen.js';
import { createGarageMenus } from './ui/garageMenus.js';
const COL = THEME.color;

const W = 1080;
const BASE_H = 1920; // 9:16; taller phones grow the height (see Renderer)
const MAX_H = 2640; // up to 9:22 fills edge to edge; taller still gets thin bars top and bottom
const START_SCREEN = new URLSearchParams(window.location.search).get('screen') === 'test' ? 'test' : 'garage';
const TEST_SCREENS = ['test', 'route']; // the Milestone 0 screens: pause button, full debug box
const PARAMS = new URLSearchParams(window.location.search);

const bus = new EventBus();
const rng = new Rng('raceworks-m0');
const renderer = new Renderer(document.getElementById('game'), { width: W, height: BASE_H, maxHeight: MAX_H, maxDpr: 2, bus });
const layout = new UiLayout(renderer);
bus.on('renderer:resize', () => layout.refresh());
const input = new Input(renderer, bus);
const assets = new AssetManager({ bus });
const router = new ScreenRouter(bus);
const sheet = new BottomSheet({ layout, assets, onClose: () => garage.selection.clear() });

// Sprites are cached at the screen's real pixel size: remake them when that changes.
assets.setPixelScale(renderer.pixelScale);
bus.on('renderer:resize', () => {
  assets.setPixelScale(renderer.pixelScale);
  debug.top = debugTop();
  if (router.currentName === 'garage') garage.resize();
});

// Pressed button look: any button under a finger that is down.
bus.on('input:down', (p) => setPressPoint(p, renderer.pixelScale));
bus.on('input:up', () => clearPress());
bus.on('input:dragstart', () => clearPress());

const onTestScreen = () => TEST_SCREENS.includes(router.currentName);
const loop = new FixedStepLoop({
  stepHz: 60,
  bus,
  update: (dt) => {
    router.update(dt);
    sheet.update(dt);
    backNav.sync();
  },
  render: (alpha) => {
    const ctx = renderer.begin(COL.bg);
    router.render(ctx, alpha);
    sheet.render(ctx);
    if (onTestScreen()) drawButton(ctx, pauseButton(), loop.paused ? 'RESUME' : 'PAUSE', { selected: loop.paused });
    if (loop.paused) drawPaused(ctx);
    // One FPS line at the top on the garage or under a sheet, so it hides nothing; the full box on the test screens.
    debug.compact = sheet.active || !onTestScreen();
    debug.render(ctx);
  },
});
// On the test screen the debug box sits between the asset test and the sheet button, whatever the height.
const debugTop = () => layout.safeRect.h - 600;
const debug = new DebugOverlay({ loop, renderer, layout, input, bus, top: debugTop(), maxLines: 3 });
bus.on('loop:pause', () => input.reset());
debug.log(`seeded rng check: ${rng.int(0, 9999)} (same every reload)`);

// ---------------------------------------------------------------------------
// Game speed (Milestone 2): the top bar's Pause / 1× / 2× / 4× drive a core Clock. Only its speed is used for now —
// the calendar is not ticked yet (the date stays Year 1 · Month 1 · Day 1), so nothing here calls clock.update().
const clock = new Clock({ bus, speeds: TOP_BAR.speeds });
bus.on('clock:speed', ({ speed }) => debug.log(speed ? `speed ${speed}×` : 'game paused'));

// ---------------------------------------------------------------------------
// Test-screen pause: the M0 button pauses/resumes the whole fixed-step loop; while paused any tap resumes. Hiding the
// app pauses too (core). P / Space: the game's Pause on the garage, the loop pause on the test screens.
const pauseButton = () => layout.anchor('top-right', 240, THEME.button.minH, 80);
router.modal = {
  get active() {
    return loop.paused;
  },
  onTap: () => loop.resume('tap'),
};
// The pause button is asked first, then the open sheet, then the screen.
router.layers.push(
  {
    get active() {
      return onTestScreen();
    },
    handleInput: (hook, p) => {
      if (hook !== 'onTap' || !hitRect(p, pauseButton())) return false;
      loop.pause('button');
      return true;
    },
  },
  {
    get active() {
      return sheet.active;
    },
    // The top bar stays usable over an open sheet: Inbox / Help / the speeds reach the garage (a new sheet replaces this one).
    handleInput: (hook, p) => (hook === 'onTap' && router.currentName === 'garage' && !garage.buildMode && garage.topBar.contains(p) ? false : sheet.handleInput(hook, p)),
  },
);
window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
    if (router.currentName === 'garage' && !loop.paused) clock.togglePause();
    else loop.togglePause();
  }
  if ((e.key === 'b' || e.key === 'B') && debug.enabled) cycleDebugBadge();
});

function drawPaused(ctx) {
  const H = renderer.height;
  ctx.fillStyle = COL.overlay;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COL.chip;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 300, H / 2 - 90, 600, 220, THEME.panel.radius);
  ctx.fill();
  ctx.fillStyle = COL.textOnDark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(96, true);
  ctx.fillText('PAUSED', W / 2, H / 2);
  ctx.font = font(THEME.size.body);
  ctx.fillText('tap to resume', W / 2, H / 2 + 80);
}

// ---------------------------------------------------------------------------
// Sheets: the stations, Tessa, the five bottom-bar slots, Inbox and Help — one registry, one sheet (a new one
// replaces the open one). Plus the M0 test sheet.
const openMenu = (kind) => {
  const build = menus.for(kind);
  if (build) sheet.open(build);
};
const menus = createGarageMenus({ garage: () => garage, open: openMenu });

// ---------------------------------------------------------------------------
// The shared bars (core/ui), filled with RACEWORKS content.
const badges = Object.fromEntries(BOTTOM_SLOTS.map((s) => [s.id, null])); // slot → badge text (data; nothing sets them yet)
const topBar = createTopBar({
  layout,
  assets,
  clock,
  home: true,
  stats: () => [
    { icon: TOP_BAR.icons.credits, iconSize: 60, text: TOP_BAR.credits.toLocaleString('en-US'), gap: 14 },
    { icon: TOP_BAR.icons.tokens, text: String(TOP_BAR.tokens) },
    { text: `Rank ${TOP_BAR.rank}`, color: COL.actionDark },
  ],
  onStats: () => openMenu('money'),
  onInbox: () => openMenu('inbox'),
  onHelp: () => openMenu('help'),
});
const bottomBar = createBottomBar({
  layout,
  assets,
  items: BOTTOM_SLOTS.map((s) => ({ id: s.id, label: s.label, icon: s.icon, badge: () => badges[s.id] })),
  open: openMenu,
});
// Debug: B moves one red badge along the five buttons, then clears it; ?badge=<slot> starts with one showing.
function cycleDebugBadge() {
  const ids = BOTTOM_SLOTS.map((s) => s.id);
  const i = ids.findIndex((id) => badges[id]);
  ids.forEach((id) => (badges[id] = null));
  if (i < ids.length - 1) badges[ids[i + 1]] = '!';
  debug.log(`debug badge: ${ids.find((id) => badges[id]) ?? 'off'}`);
}
if (debug.enabled && badges[PARAMS.get('badge')] !== undefined) badges[PARAMS.get('badge')] = '!';
const testSheet = () => ({
  title: 'Test sheet',
  subtitle: 'Placeholder bottom sheet for Milestone 0.',
  art: 'm0Real',
  sections: [
    {
      lines: ['Close it with ✕, by tapping above it, with Close, or with the phone Back button.'],
      buttons: [
        { id: 'route', label: 'Second screen', onTap: () => router.go('route') },
        { id: 'close', label: 'Close', accent: COL.progress, onTap: () => sheet.close() },
      ],
    },
  ],
});
bus.on('screen:change', () => sheet.close());

// Back one level: close the sheet, leave Build Mode, or leave the second test screen.
function back() {
  if (sheet.active) sheet.close();
  else if (router.currentName === 'garage' && garage.buildMode) garage.setBuildMode(false);
  else if (router.currentName === 'route') router.go('test');
  else return false;
  return true;
}
const backNav = createBackNav({
  depth: () => (sheet.active || router.currentName === 'route' || (router.currentName === 'garage' && garage.buildMode) ? 1 : 0),
  back,
});

// ---------------------------------------------------------------------------
// Boot screen: shows while the art loads, then hands over to the garage (or the test screen).
const bootScreen = {
  progress: 0,
  enter() {
    this.progress = 0;
    assets
      .loadImages(ASSETS, (done, total) => (this.progress = done / total))
      .then((r) => {
        debug.log(`assets: ${r.loaded} loaded, ${r.missing.length} missing`);
        router.go(START_SCREEN);
      });
  },
  render(ctx) {
    const H = renderer.height;
    ctx.fillStyle = COL.text;
    ctx.font = font(THEME.size.major, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RACEWORKS', W / 2, H / 2 - 60);
    ctx.fillStyle = COL.track;
    ctx.fillRect(W / 2 - 300, H / 2 + 20, 600, 24);
    ctx.fillStyle = COL.progress;
    ctx.fillRect(W / 2 - 300, H / 2 + 20, 600 * this.progress, 24);
  },
};

const garage = createGarageScreen({ renderer, layout, assets, bus, sheet, openMenu, clock, topBar, bottomBar, debug });

// Test hook for automated checks (debug builds only).
if (debug.enabled) window.__rw = { renderer, layout, input, loop, router, assets, sheet, garage, clock, badges, cycleDebugBadge, taps: [] };

router
  .register('boot', bootScreen)
  .register('garage', garage)
  .register('test', createTestScreen({ renderer, layout, assets, openSheet: () => sheet.open(testSheet), onTapLogged: (p) => window.__rw?.taps.push({ x: p.x, y: p.y }) }))
  .register('route', createRouteTestScreen({ renderer, layout, onBack: back }));
router.go('boot');
loop.start();
