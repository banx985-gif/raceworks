// RACEWORKS — boot (Milestone 0: project shell).
// Starts the shared series engine from core/ and opens the M0 test screen. Add ?debug=1 for the FPS/state overlay.
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
import { drawButton, hitRect, setPressPoint, clearPress } from '../../../core/ui/Button.js';
import { ASSETS } from '../data/assets.js';
import { createBackNav } from './app/backNav.js';
import { createHomeScreen } from './screens/HomeScreen.js';
import { createRouteTestScreen } from './screens/RouteTestScreen.js';
const COL = THEME.color;

const W = 1080;
const BASE_H = 1920; // 9:16; taller phones grow the height (see Renderer)
const MAX_H = 2640; // up to 9:22 fills edge to edge; taller still gets thin bars top and bottom

const bus = new EventBus();
const rng = new Rng('raceworks-m0');
const renderer = new Renderer(document.getElementById('game'), { width: W, height: BASE_H, maxHeight: MAX_H, maxDpr: 2, bus });
const layout = new UiLayout(renderer);
bus.on('renderer:resize', () => layout.refresh());
const input = new Input(renderer, bus);
const assets = new AssetManager({ bus });
const router = new ScreenRouter(bus);
const sheet = new BottomSheet({ layout, assets });

// Sprites are cached at the screen's real pixel size: remake them when that changes.
assets.setPixelScale(renderer.pixelScale);
bus.on('renderer:resize', () => {
  assets.setPixelScale(renderer.pixelScale);
  debug.top = debugTop();
});

// Pressed button look: any button under a finger that is down.
bus.on('input:down', (p) => setPressPoint(p, renderer.pixelScale));
bus.on('input:up', () => clearPress());
bus.on('input:dragstart', () => clearPress());

const loop = new FixedStepLoop({
  stepHz: 60,
  bus,
  update: (dt) => {
    router.update(dt);
    if (router.currentName === 'home') sheet.update(dt);
    backNav.sync();
  },
  render: (alpha) => {
    const ctx = renderer.begin(COL.bg);
    router.render(ctx, alpha);
    if (router.currentName === 'home') sheet.render(ctx);
    if (router.currentName !== 'boot') drawButton(ctx, pauseButton(), loop.paused ? 'RESUME' : 'PAUSE', { selected: loop.paused });
    if (loop.paused) drawPaused(ctx);
    debug.compact = sheet.active; // one FPS line at the top while the sheet is up, so it hides nothing
    debug.render(ctx);
  },
});
// The debug box sits between the asset test and the sheet button, whatever the height.
const debugTop = () => layout.safeRect.h - 600;
const debug = new DebugOverlay({ loop, renderer, layout, input, bus, top: debugTop(), maxLines: 3 });
bus.on('loop:pause', () => input.reset());
debug.log(`seeded rng check: ${rng.int(0, 9999)} (same every reload)`);

// ---------------------------------------------------------------------------
// Pause: the button pauses/resumes the fixed-step loop; while paused any tap resumes. Hiding the app pauses too (core).
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
      return router.currentName !== 'boot';
    },
    handleInput: (hook, p) => {
      if (hook !== 'onTap' || !hitRect(p, pauseButton())) return false;
      loop.pause('button');
      return true;
    },
  },
  { get active() { return sheet.active && router.currentName === 'home'; }, handleInput: (hook, p) => sheet.handleInput(hook, p) },
);
window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === ' ') loop.togglePause();
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
// Placeholder bottom sheet (proves the sheet, routing and back).
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
bus.on('screen:change', ({ to }) => to !== 'home' && sheet.close());

// Back one level: close the sheet first, then leave the second screen.
function back() {
  if (sheet.active) sheet.close();
  else if (router.currentName === 'route') router.go('home');
  else return false;
  return true;
}
const backNav = createBackNav({ depth: () => (sheet.active || router.currentName === 'route' ? 1 : 0), back });

// ---------------------------------------------------------------------------
// Boot screen: shows while the art loads, then hands over to the test screen.
const bootScreen = {
  progress: 0,
  enter() {
    this.progress = 0;
    assets
      .loadImages(ASSETS, (done, total) => (this.progress = done / total))
      .then((r) => {
        debug.log(`assets: ${r.loaded} loaded, ${r.missing.length} missing`);
        router.go('home');
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

// Test hook for automated checks (debug builds only).
if (debug.enabled) window.__m0 = { renderer, layout, input, loop, router, assets, sheet, taps: [] };

router
  .register('boot', bootScreen)
  .register('home', createHomeScreen({ renderer, layout, assets, openSheet: () => sheet.open(testSheet), onTapLogged: (p) => window.__m0?.taps.push({ x: p.x, y: p.y }) }))
  .register('route', createRouteTestScreen({ renderer, layout, onBack: back }));
router.go('boot');
loop.start();
