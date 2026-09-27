// RACEWORKS — boot.
// Starts the shared series engine from core/ and opens the garage. Add ?debug=1 for the FPS/state overlay,
// ?screen=test for the Milestone 0 scaling/tap test screen. Debug badge check: ?debug=1 then B cycles a red badge
// through the bottom-bar buttons (or ?debug=1&badge=staff on a phone). ?debug=1&reset=1 starts a new team (clears the save);
// with ?debug=1 the staff detail screen has stat / Energy / Morale nudge buttons, and the Pit Bay sheet has
// +5 days / Finish phase / Fault now / Breakthrough buttons while a car is being built.
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
import { createStorageAdapter } from '../../../core/StorageAdapter.js';
import { Autosave } from '../../../core/Autosave.js';
import { drawButton, hitRect, setPressPoint, clearPress } from '../../../core/ui/Button.js';
import { ASSETS } from '../data/assets.js';
import { BOTTOM_SLOTS, TOP_BAR } from '../data/home.js';
import { createBackNav } from './app/backNav.js';
import { createGarageScreen } from './screens/GarageScreen.js';
import { createTestScreen } from './screens/TestScreen.js';
import { createRouteTestScreen } from './screens/RouteTestScreen.js';
import { createGarageMenus } from './ui/garageMenus.js';
import { createRosterScreen } from './screens/RosterScreen.js';
import { createStaffDetailScreen } from './screens/StaffDetailScreen.js';
import { createCarBuilderScreen } from './screens/CarBuilderScreen.js';
import { createCarResultScreen } from './screens/CarResultScreen.js';
import { createCarGarageScreen } from './screens/CarGarageScreen.js';
import { loadStatusIcons } from './ui/statusIcons.js';
import { Team } from './app/Team.js';
const COL = THEME.color;

const W = 1080;
const BASE_H = 1920; // 9:16; taller phones grow the height (see Renderer)
const MAX_H = 2640; // up to 9:22 fills edge to edge; taller still gets thin bars top and bottom
const START_SCREEN = new URLSearchParams(window.location.search).get('screen') === 'test' ? 'test' : 'garage';
const TEST_SCREENS = ['test', 'route']; // the Milestone 0 screens: pause button, full debug box
const GAME_SCREENS = ['garage', 'roster', 'staff', 'carBuilder', 'car', 'cars']; // the game's screens: P pauses the game clock here
// Screens opened from the garage (or from each other). A back stack remembers the way in (with each screen's
// params: which person, which car), so the back button and the phone's Back retrace it one step at a time.
const SUB_SCREENS = { roster: 'Roster', staff: 'Details', carBuilder: 'New car', car: 'Car', cars: 'Car Garage' };
const BACK_LABEL = { garage: 'Garage', ...SUB_SCREENS };
const trail = []; // [{ name, params }] — the screens under the current one, oldest first
let hereParams = {}; // the current sub-screen's params (so it can be returned to exactly)
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
    if (teamReady) {
      clock.update(dt); // days tick at the game speed (core/Clock) → the staff's daily Energy / Morale and the car project
      garage.tick(dt); // everyone walks, works and rests
      autosave.tick(dt);
    }
    if (pendingCar && (pendingCar.wait -= dt) <= 0) {
      const { number } = pendingCar;
      pendingCar = null;
      goSub('car', { number, fresh: true });
    }
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
// The team (Milestone 3): the calendar, the three starters and the save (src/app/Team.js). The top bar's
// Pause / 1× / 2× / 4× drive its core Clock, which now ticks days.
const team = new Team({ bus, seed: 'raceworks' });
const clock = team.clock;
let teamReady = false;
bus.on('clock:speed', ({ speed }) => debug.log(speed ? `speed ${speed}×` : 'game paused'));
// Autosave (core/Autosave): every game day and after any change, plus when the app goes to the background.
const autosave = new Autosave({
  bus,
  triggers: ['clock:day', 'team:changed', 'project:start', 'project:phase', 'project:complete', 'car:fault', 'car:fix', 'car:breakthrough'],
  save: () => team.save(),
  stamp: () => JSON.stringify(team.serialize()),
  running: () => !clock.paused,
  enabled: () => teamReady,
});
autosave.installBackground();
bus.on('autosave:failed', ({ error }) => debug.log(`save failed: ${error?.message ?? error}`));

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
    if (GAME_SCREENS.includes(router.currentName) && !loop.paused) clock.togglePause();
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
const openMenu = (kind, target = null) => {
  const build = menus.for(kind, target);
  if (build) sheet.open(build);
};
// The staff screens (Milestone 3): the roster, and one person's details (from = where Back returns to).
// Open a sub-screen: one step deeper (Back returns here).
function goSub(name, params = {}) {
  const here = router.currentName;
  if (here !== name) trail.push({ name: SUB_SCREENS[here] || here === 'garage' ? here : 'garage', params: hereParams });
  if (trail.length > 12) trail.shift();
  hereParams = params;
  router.go(name, params);
}
bus.on('screen:change', ({ to }) => {
  if (to === 'garage') {
    trail.length = 0; // home again: the way back starts over
    hereParams = {};
  }
});
const goRoster = () => goSub('roster');
const goStaff = (id) => goSub('staff', { id });
const goBuilder = () => goSub('carBuilder');
// From a car that was opened from the Car Garage, its Car Garage button is simply Back (no pile of screens).
const goCarGarage = () => (trail[trail.length - 1]?.name === 'cars' && router.currentName === 'car' ? back() : goSub('cars'));
const goCar = (number) => goSub('car', { number });
// A finished car: set when the project completes, opened after the reveal has played on the bay.
let pendingCar = null;
bus.on('project:complete', ({ record }) => {
  debug.log(`car finished: ${record.name}, Quality ${record.result.quality}, ${record.days} days`);
  const onGarage = router.currentName === 'garage';
  if (onGarage) garage.reveal();
  pendingCar = { number: record.number, wait: onGarage ? 2.6 : 0 };
});
bus.on('car:fault', ({ fault }) => debug.log(`fault in ${fault.phase} (${fault.stat})`));
bus.on('car:breakthrough', ({ breakthrough }) => debug.log(`breakthrough in ${breakthrough.phase}: ${breakthrough.kind}`));
bus.on('project:phase', ({ phase, summary }) => debug.log(`${phase.name} done in ${summary.days} days`));
// ?debug=1: skip days / finish the phase from the Pit Bay sheet.
const carDebug = {
  days(n) {
    for (let i = 0; i < n && team.cars.active; i++) clock.advanceDay();
  },
  finishPhase() {
    const job = team.cars.active;
    if (!job) return;
    const i = job.phaseIndex;
    while (team.cars.active === job && job.phaseIndex === i) clock.advanceDay();
  },
};
const menus = createGarageMenus({ garage: () => garage, team, open: openMenu, goRoster, goStaff, goBuilder, goCarGarage, debug: debug.enabled ? carDebug : null });

// ---------------------------------------------------------------------------
// The shared bars (core/ui), filled with RACEWORKS content.
const topBarStats = () => [
  { icon: TOP_BAR.icons.credits, iconSize: 60, text: TOP_BAR.credits.toLocaleString('en-US'), gap: 14 },
  { icon: TOP_BAR.icons.tokens, text: String(TOP_BAR.tokens) },
  { text: `Rank ${TOP_BAR.rank}`, color: COL.actionDark },
];
const badges = Object.fromEntries(BOTTOM_SLOTS.map((s) => [s.id, null])); // slot → badge text (data; nothing sets them yet)
const topBar = createTopBar({
  layout,
  assets,
  clock,
  home: true,
  stats: () => topBarStats(),
  onStats: () => openMenu('money'),
  onInbox: () => openMenu('inbox'),
  onHelp: () => openMenu('help'),
});
// The staff screens show the same bar with a back button (‹ Garage / ‹ Roster) instead of the long date.
const screenBar = createTopBar({
  layout,
  assets,
  clock,
  home: false,
  back: {
    get label() {
      return `‹ ${BACK_LABEL[trail[trail.length - 1]?.name] ?? 'Garage'}`;
    },
    onTap: () => back(),
  },
  stats: () => topBarStats(),
  // From a staff screen these return to the garage and open their sheet there.
  onStats: () => fromScreen('money'),
  onInbox: () => fromScreen('inbox'),
  onHelp: () => fromScreen('help'),
});
function fromScreen(kind) {
  router.go('garage');
  openMenu(kind);
}
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

// Back one level: close the sheet, leave Build Mode, leave a sub-screen (to where it was opened from), or leave the
// second test screen.
function back() {
  if (sheet.active) sheet.close();
  else if (router.currentName === 'garage' && garage.buildMode) garage.setBuildMode(false);
  else if (SUB_SCREENS[router.currentName]) {
    const prev = trail.pop() ?? { name: 'garage', params: {} };
    hereParams = prev.params;
    router.go(prev.name, prev.params);
  }
  else if (router.currentName === 'route') router.go('test');
  else return false;
  return true;
}
const backNav = createBackNav({
  depth: () => (sheet.active || router.currentName === 'route' || SUB_SCREENS[router.currentName] || (router.currentName === 'garage' && garage.buildMode) ? 1 : 0),
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
        return loadStatusIcons(assets);
      })
      .then(startTeam)
      .then(() => router.go(START_SCREEN))
      .catch((err) => {
        console.error('[boot] failed', err);
        debug.log(`boot failed: ${err.message}`);
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

const garage = createGarageScreen({ renderer, layout, assets, bus, sheet, openMenu, clock, team, topBar, bottomBar, debug });
const rosterScreen = createRosterScreen({ layout, assets, team, garage, topBar: screenBar, goStaff });
const staffScreen = createStaffDetailScreen({ layout, assets, team, garage, topBar: screenBar, debugEnabled: debug.enabled });
// The car screens (Milestone 4): the builder, one finished car, the Car Garage.
const carBuilderScreen = createCarBuilderScreen({
  layout,
  assets,
  team,
  topBar: screenBar,
  onStart: (opts) => {
    const r = team.cars.start(opts);
    debug.log(r.ok ? `car started: ${r.job.name} (${opts.budget}, team ${opts.staffIds.join(', ')})` : `car not started: ${r.reason}`);
    router.go('garage');
    if (r.ok) garage.focusPitBay?.();
  },
});
const carResultScreen = createCarResultScreen({ layout, assets, team, topBar: screenBar, goCarGarage });
const carGarageScreen = createCarGarageScreen({ layout, assets, team, topBar: screenBar, goCar });
// The garage tells the daily tick what each person is doing, and its workers' places travel in the save.
team.activityOf = (s) => garage.activityOf(s.id);
team.garageSnapshot = () => garage.snapshot();

// The save: IndexedDB (or localStorage / memory where that is missing). ?debug=1&reset=1 starts again.
async function startTeam() {
  const adapter = await createStorageAdapter({ dbName: 'raceworks', prefix: 'raceworks:' });
  await team.attachSave(adapter);
  if (debug.enabled && PARAMS.get('reset') === '1') await team.clearSave();
  const loaded = await team.loadOrNew();
  debug.log(`team ${loaded ? 'loaded' : 'new'} (${adapter.kind}), day ${clock.totalDays}`);
  teamReady = true;
  if (!loaded) await team.save();
}

// Test hook for automated checks (debug builds only).
if (debug.enabled) window.__rw = { renderer, layout, input, loop, router, assets, sheet, garage, clock, team, autosave, rosterScreen, staffScreen, carBuilderScreen, carResultScreen, carGarageScreen, carDebug, screenBar, badges, cycleDebugBadge, taps: [] };

router
  .register('boot', bootScreen)
  .register('garage', garage)
  .register('roster', rosterScreen)
  .register('staff', staffScreen)
  .register('carBuilder', carBuilderScreen)
  .register('car', carResultScreen)
  .register('cars', carGarageScreen)
  .register('test', createTestScreen({ renderer, layout, assets, openSheet: () => sheet.open(testSheet), onTapLogged: (p) => window.__rw?.taps.push({ x: p.x, y: p.y }) }))
  .register('route', createRouteTestScreen({ renderer, layout, onBack: back }));
router.go('boot');
loop.start();
