// RACEWORKS — boot.
// Starts the shared series engine from core/ and opens the main menu (Milestone 4b): Continue / New Game / Load / Help,
// four save slots (core/CampaignSlots) and the New Game setup; a slot's team then plays in the garage. Add ?debug=1 for the FPS/state overlay,
// ?screen=test for the Milestone 0 scaling/tap test screen. ?debug=1&slot=N opens slot N straight away (a new team
// there if it is empty; &founder=AER01 picks its founder). Debug badge check: ?debug=1 then B cycles a red badge
// through the bottom-bar buttons (or ?debug=1&badge=staff on a phone). ?debug=1&reset=1 empties every save slot;
// with ?debug=1 the staff detail screen has stat / Energy / Morale nudge buttons, and the Pit Bay sheet has
// +5 days / Finish phase / Fault now / Breakthrough buttons while a car is being built. Milestone 5: the Money sheet has
// −20,000 / +20,000 Credits (a forced-negative test), To next month and +100 Rep; a car screen has Damage −30.
// Milestone 11: the Research screen has +500 RP, Finish now, Branch and All 36.
// Milestone 12: Recruitment (Staff → Hire, the Sponsor Wall) and Training (Staff → Train, the Driver Simulator).
// Milestone 14: optional driver drills (Training → Play Drill / Drills · Medals); with ?debug=1 the drill intro has
// Force Bronze / Silver / Gold / Fail and the medal history has Practise and Reset records.
// Milestone 15: the complete race weekend — up to 3 practice runs, the hint bands, fuel / energy and repair priority, and
// the optional Qualifying Drive lap (the drill screen in its qualiLap mode; ?debug=1 adds an autopilot lap).
// Milestone 23: events and the Inbox (src/systems/events.js): a major event is a card (src/ui/eventCard.js) that pauses
// the calendar, a minor one a strip under the top bar; never on a race screen; the top bar's Inbox has the unread badge.
// ?debug=1&events=0 mutes them for the older browser checks (no rolled events; major cards go straight to the Inbox).
// Milestone 24: the Secret Condition Engine (src/systems/secrets.js); ?debug=1 gives the Rumour Archive / Inbox the why-false
// inspector. Milestone 25: the game runs the 34 real secrets (data/secrets.js SECRET_RULES); ?debug=1&synthetic=1 loads the
// four M24 synthetic test rules instead (the M24 browser check), and the inspector can force any one secret (it sets the
// competitive-invalid flag). A Legendary / Prestige arrival's portrait loads when it arrives.
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
import { createTopBar, topBarRect } from '../../../core/ui/TopBar.js';
import { drawToasts } from '../../../core/ui/Toast.js';
import { createBottomBar } from '../../../core/ui/BottomBar.js';
import { createStorageAdapter } from '../../../core/StorageAdapter.js';
import { Autosave } from '../../../core/Autosave.js';
import { CampaignSlots } from '../../../core/CampaignSlots.js';
import { Dialog } from '../../../core/ui/Modal.js';
import { TextPrompt } from '../../../core/ui/TextPrompt.js';
import { drawButton, hitRect, setPressPoint, clearPress } from '../../../core/ui/Button.js';
import { ASSETS, LATER_ASSETS, STAFF_PORTRAITS } from '../data/assets.js';
import { BOTTOM_SLOTS, TOP_BAR } from '../data/home.js';
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
import { Team, describeSave, DEFAULT_SETUP, SAVE_MIGRATIONS } from './app/Team.js';
import { SAVE_VERSION } from '../data/balance.js';
import { SLOT_COUNT, FOUNDERS } from '../data/setup.js';
import { createMainMenuScreen } from './screens/MainMenuScreen.js';
import { createSlotsScreen } from './screens/SlotsScreen.js';
import { createCeremonyScreen } from './screens/CeremonyScreen.js'; // Milestone 27
import { createHallOfRunsScreen } from './screens/HallOfRunsScreen.js';
import { createNgPlusScreen } from './screens/NgPlusScreen.js';
import { offerFrom, buildCarry } from './systems/ngplus.js'; // Milestone 28
import { ENDING_TEXT } from '../data/ending.js';
import { createTeamSetupScreen } from './screens/TeamSetupScreen.js';
import { createMenuHeader } from './ui/menuHeader.js';
import { createRaceScreen } from './screens/RaceScreen.js';
import { createRaceIntroScreen } from './screens/RaceIntroScreen.js';
import { createRaceResultScreen } from './screens/RaceResultScreen.js';
import { createWeekendScreen } from './screens/WeekendScreen.js';
import { Settings } from '../../../core/Settings.js';
import { TRACKS, TRACK_IDS } from './race/tracks.js';
import { TEST_RACE } from '../data/rivals.js'; // Milestone 19 (the debug track picker)
import { CHAMPIONSHIPS } from '../data/championships.js'; // Milestone 20
import { WEATHER_NAMES } from '../data/race.js'; // Milestone 17 (the result's weather line)
import { createResearchScreen } from './screens/ResearchScreen.js';
import { drawResearchBanner, researchBannerHeight } from './ui/researchBanner.js';
import { createEventCard } from './ui/eventCard.js'; // Milestone 23
import { NODE } from './systems/research.js';
import { comboById } from '../data/combos.js';
import { SYNTHETIC_RULES, SECRET_RULES } from '../data/secrets.js'; // Milestone 24 (synthetic: ?debug=1&synthetic=1 only) · Milestone 25
import { createRecruitScreen } from './screens/RecruitScreen.js';
import { createTrainScreen } from './screens/TrainScreen.js';
import { checkStaffData } from './systems/staffCheck.js';
import { createDrillScreen } from './screens/DrillScreen.js';
import { createMedalsScreen } from './screens/MedalsScreen.js';
import { createDrillRecords } from './systems/drills.js';
import { createComboRecords } from './systems/combos.js'; // Milestone 22
// Milestone 25b: the series common features — the Menu (core/ui/MenuSheet), the next-step hint line (core/ui/HintLine),
// Settings (core/Settings, data/settings.js), sound (core/AudioManager), haptics, the frame governor, item art.
import { menuSheet } from '../../../core/ui/MenuSheet.js';
import { HintLine } from '../../../core/ui/HintLine.js';
import { AudioManager } from '../../../core/AudioManager.js';
import { Haptics } from '../../../core/Haptics.js';
import { FrameGovernor } from '../../../core/FrameGovernor.js';
import { setTextScale } from '../../../core/Theme.js';
import { registerItemArt } from '../../../core/ui/ItemArt.js';
import { MENU_GROUPS, MENU_TEXT, NEXT_HINTS } from '../data/menu.js';
import { SETTINGS, SETTINGS_DEFAULTS, SETTINGS_KEY, SHAKE_LEVELS, TEXT_SCALE, SETTINGS_TEXT } from '../data/settings.js';
import { SOUNDS, MUSIC, AUDIO_RULES } from '../data/audio.js';
import { ITEM_TYPES, ITEM_GROUPS, ITEM_RARITIES, ITEM_RULES, ITEM_ART } from '../data/items.js';
// Milestone 29: the screen / UX pass — the phone's Back on core/SystemBack, long words cut with "…" (core/TextFit), the
// Help archive (core/ui/HelpArchive, data/help.js) behind every Help button, the studio splash, Credits, the Store
// placeholder and the race pause sheet.
import { SystemBack } from '../../../core/SystemBack.js';
import { installTextFit } from '../../../core/TextFit.js';
import { createHelpArchive } from '../../../core/ui/HelpArchive.js';
import { createStudioSplash } from '../../../core/ui/StudioSplash.js';
import { HELP_TOPICS, HELP_FOR, HELP_TEXT } from '../data/help.js';
import { STATIONS } from '../data/garage.js';
import { createCreditsScreen } from './screens/CreditsScreen.js';
import { STORE_TEXT, MAIN_MENU_TEXT, BACK_TEXT, SAVE_TEXT, EMPTY_TEXT } from '../data/screens.js';
const COL = THEME.color;

const W = 1080;
const BASE_H = 1920; // 9:16; taller phones grow the height (see Renderer)
const MAX_H = 2640; // up to 9:22 fills edge to edge; taller still gets thin bars top and bottom
const START_SCREEN = new URLSearchParams(window.location.search).get('screen') === 'test' ? 'test' : 'menu';
const TEST_SCREENS = ['test', 'route']; // the Milestone 0 screens: pause button, full debug box
const GAME_SCREENS = ['garage', 'roster', 'staff', 'carBuilder', 'car', 'cars', 'weekend', 'raceIntro', 'race', 'raceResult', 'research', 'recruit', 'train', 'medals'];
const RACE_SCREENS = ['weekend', 'raceIntro', 'race', 'raceResult']; // Milestone 6: the garage calendar waits while a race is on // the game's screens: P pauses the game clock here
const CALENDAR_WAITS = [...RACE_SCREENS, 'drill', 'ceremony', 'ngplus']; // Milestone 14: … and while a drill is played (its course must not end mid-drill); Milestone 27: the ceremony
// Screens opened from the garage (or from each other). A back stack remembers the way in (with each screen's
// params: which person, which car), so the back button and the phone's Back retrace it one step at a time.
const SUB_SCREENS = { roster: 'Roster', staff: 'Details', carBuilder: 'New car', car: 'Car', cars: 'Car Garage', weekend: 'Weekend', raceIntro: 'Race', race: 'Race', raceResult: 'Result', research: 'Research', recruit: 'Hire', train: 'Training', medals: 'Drills', drill: 'Drill' };
const BACK_LABEL = { garage: 'Garage', ...SUB_SCREENS };
const trail = []; // [{ name, params }] — the screens under the current one, oldest first
let hereParams = {}; // the current sub-screen's params (so it can be returned to exactly)
const PARAMS = new URLSearchParams(window.location.search);

const bus = new EventBus();
const rng = new Rng('raceworks-m0');
const renderer = new Renderer(document.getElementById('game'), { width: W, height: BASE_H, maxHeight: MAX_H, maxDpr: 2, bus });
installTextFit(renderer.ctx); // Milestone 29: a text too long for its place ends in "…" instead of being squashed
// Milestone 29 (?debug=1&insets=top,right,bottom,left in CSS px): a stand-in notch / home bar, to check the safe areas
const FORCE_INSETS = (() => {
  const q = new URLSearchParams(window.location.search);
  if (q.get('debug') !== '1' || !q.get('insets')) return null;
  const [top = 0, right = 0, bottom = 0, left = 0] = q.get('insets').split(',').map(Number);
  return { top, right, bottom, left };
})();
const layout = new UiLayout(renderer, { forceInsets: FORCE_INSETS });
bus.on('renderer:resize', () => layout.refresh());
const input = new Input(renderer, bus);
const assets = new AssetManager({ bus });
const router = new ScreenRouter(bus);
const sheet = new BottomSheet({
  layout,
  assets,
  onClose: () => {
    garage.selection.clear();
    garage.setSheetTarget(null); // Milestone 10: Build Mode's facility sheet
    if (raceHeld && router.currentName === 'race') raceScreen.setPaused?.(false); // Milestone 29: ✕ / a tap above the pause sheet (or a sheet opened from it) = Resume
    raceHeld = false;
    sheetNow = null;
  },
});
sheet.onLocked = (b) => b?.sub && refuse(b.sub); // Milestone 29: a tap on a greyed button repeats why, in one line
const dialog = new Dialog({ layout, assets }); // "are you sure" boxes and Help (Milestone 4b)
const textPrompt = new TextPrompt({ renderer }); // typing the team and player names

// Sprites are cached at the screen's real pixel size: remake them when that changes.
assets.setPixelScale(renderer.pixelScale);
bus.on('renderer:resize', () => {
  assets.setPixelScale(renderer.pixelScale);
  debug.top = debugTop();
  if (router.currentName === 'garage') garage.resize();
  if (router.currentName === 'race') raceScreen.resize();
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
      team.playSeconds += dt; // play time on the save-slot card (real seconds with a team open)
    }
    // Milestone 27: the Year-16 ceremony comes up in the garage as soon as nothing else is on screen
    if (teamReady && team.ending.pending && router.currentName === 'garage' && !sheet.active && !dialog.active && !eventCard.active && !pendingCar && !garage.buildMode) router.go('ceremony');
    if (pendingCar && (pendingCar.wait -= dt) <= 0) {
      const { number } = pendingCar;
      pendingCar = null;
      goSub('car', { number, fresh: true });
    }
    router.update(dt);
    sheet.update(dt);
    dialog.update(dt);
    // Milestone 23: one event card at a time (nothing on the race screens; a card waits for a dialog or a car reveal)
    if (teamReady) team.events.frame(dt, { screen: router.currentName, busy: dialog.active || textPrompt.active || !!pendingCar || helpOpen || creditsOpen, reduced: !!settings.get('reducedMotion') });
    eventCard.update(dt);
    hintLine.update(dt); // Milestone 25b
    if (creditsOpen) creditsScreen.update(dt); // Milestone 29
    for (const t of toasts) t.age += dt;
    while (toasts.length && toasts[0].age > TOAST_LIFE) toasts.shift();
  },
  render: (alpha) => {
    const ctx = renderer.begin(COL.bg);
    router.render(ctx, alpha);
    if (router.currentName === 'garage') hintLine.render(ctx); // Milestone 25b (under any sheet)
    sheet.render(ctx);
    const onGame = GAME_SCREENS.includes(router.currentName);
    const tb = topBarRect(layout);
    // Milestone 23: the minor event strip (research done / a combo keep Milestone 11's gold card), then the game's own
    // short notes under it, then a major event card over everything but a dialog
    // (Milestone 29: on the race screen the notes go below the camera switch and the caution chip, never over a control)
    const laneY = (router.currentName === 'race' ? raceScreen.toastTop?.() : null) ?? tb.y + tb.h + 16;
    const lane = onGame && teamReady ? drawEventToast(ctx, { x: tb.x + 24, y: laneY, w: tb.w - 48 }) : 0;
    if (toasts.length && onGame) drawToasts(ctx, toasts, { x: tb.x + 40, y: laneY + (lane ? lane + 16 : 0), w: tb.w - 80, life: TOAST_LIFE });
    if (helpOpen) helpScreen.render(ctx); // Milestone 29: Help over the screen
    if (creditsOpen) creditsScreen.render(ctx); // … and Credits
    if (teamReady) eventCard.render(ctx);
    dialog.render(ctx);
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
// Milestone 25: a Legendary / Prestige arrival's portrait loads as it arrives (its event card shows it).
bus.on('recruit:arrival', ({ card }) => card?.art && assets.isPending?.(card.art) && assets.ensure([card.art]));
const team = new Team({ bus, seed: 'raceworks', secretRules: debug.enabled && new URLSearchParams(window.location.search).get('synthetic') === '1' ? SYNTHETIC_RULES : SECRET_RULES });
const clock = team.clock;
let teamReady = false;
bus.on('clock:speed', ({ speed }) => debug.log(speed ? `speed ${speed}×` : 'game paused'));
// Autosave (core/Autosave): every game day and after any change, plus when the app goes to the background.
const autosave = new Autosave({
  bus,
  triggers: ['race:created', 'race:progress', 'race:finished', 'clock:day', 'team:changed', 'project:start', 'project:phase', 'project:complete', 'car:fault', 'car:fix', 'car:breakthrough', 'contract:accepted', 'contract:success', 'contract:failed', 'contract:progress', 'sponsor:signed', 'sponsor:met', 'sponsor:ended', 'sponsor:progress', 'car:repaired', 'economy:debt', 'facility:layout', 'research:start', 'research:stop', 'research:complete', 'staff:hired', 'staff:letGo', 'recruit:refresh', 'training:start', 'training:complete', 'event:fired', 'event:resolved'],
  save: () => {
    if (router.currentName === 'race') raceScreen.exit(); // the race's exact state goes in the save too
    return team.save();
  },
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
// A dialog takes every tap while it is open (and never under the pause screen).
// Milestone 23: an event card takes every tap too (under a dialog).
router.modal = {
  get active() {
    return loop.paused || dialog.active || (teamReady && eventCard.active);
  },
  onTap: (p) => (loop.paused ? loop.resume('tap') : dialog.active ? dialog.onTap(p) : eventCard.onTap(p)),
  onDown: (p) => !loop.paused && dialog.active && dialog.onDown(p),
  onUp: (p) => !loop.paused && dialog.active && dialog.onUp(p),
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
  if ((e.key === 'p' || e.key === 'P' || e.key === ' ') && (GAME_SCREENS.includes(router.currentName) || onTestScreen())) {
    if (GAME_SCREENS.includes(router.currentName) && !loop.paused) {
      if (!eventCard.active) clock.togglePause(); // (Milestone 23: an event card holds the calendar until it closes)
    }
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
// Milestone 29: a sheet opened from another sheet remembers the way in, so Back (and the sheet's own "‹" button) returns to
// it; ✕ or a tap above the sheet closes them all. Every sheet gets the Help button (its own page, data/help.js).
let sheetWay = []; // [{ kind, target, title }] — the sheets under the open one, oldest first
let sheetNow = null; // { kind, target } — the open sheet
const openMenu = (kind, target = null) => {
  const build = menus.for(kind, target);
  if (!build) return;
  const prev = sheet.active && sheetNow ? sheetNow : null;
  if (prev && (prev.kind !== kind || prev.target !== target)) {
    const at = sheetWay.findIndex((s) => s.kind === kind && s.target === target);
    if (at >= 0) sheetWay = sheetWay.slice(0, at); // going back to one already under it: no loops
    else sheetWay.push({ ...prev, title: sheet.menu?.title ?? '' });
  } else if (!prev) sheetWay = [];
  sheetNow = { kind, target };
  const topic = helpTopicFor(kind, target);
  sheet.open(() => {
    const m = build();
    if (m && !m.help) m.help = () => openHelp(topic);
    return m;
  });
  if (reducedMotion()) sheet.instant = true;
};
// The sheet under this one (for its "‹" button), and stepping back to it.
const sheetBackLabel = () => (sheetWay.length ? `‹ ${sheetWay[sheetWay.length - 1].title}` : null);
function sheetBack() {
  const prev = sheetWay.pop();
  if (!prev) {
    const p = sheet.menu?.parent; // a sheet's own parent (its ‹ button names it) when nothing is under it
    if (!p) return sheet.close();
    openMenu(p.kind ?? p, p.target ?? null);
    sheetWay = [];
    return;
  }
  const way = [...sheetWay];
  openMenu(prev.kind, prev.target);
  sheetWay = way;
}
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
// Milestone 11: the Research tree (from the Research sheet).
const goResearch = (params = {}) => {
  sheet.close();
  goSub('research', params);
};
// Milestone 12: Recruitment and Training.
const goRecruit = (params = {}) => {
  sheet.close();
  goSub('recruit', params);
};
const goTrain = (id = null) => {
  sheet.close();
  goSub('train', id ? { id } : {});
};
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
// ---------------------------------------------------------------------------
// Race weekends (Milestone 7): Compete → Race weekend → Practice → Setup → Qualifying → Race → Result. The M6 Test
// Race (straight to the grid) stays for ?debug=1 only.
// This device's settings (core/Settings): the race camera the player chose last (bible §24.4).
// Milestone 14: the drill settings (steering sensitivity, aids, reduced motion / flashes) live here too.
// Milestone 25b: the series Settings list (data/settings.js; the old ids kept, so earlier choices load as they were).
const settings = new Settings({ key: SETTINGS_KEY, defaults: SETTINGS_DEFAULTS });
const reducedMotion = () => !!settings.get('reducedMotion'); // (Milestone 29: sheets snap open too)
// Graphics Auto / High / Low (core/FrameGovernor: Low = a steady 30 FPS); Low also means fewer race effects and simpler
// figures in the garage. Text size → every font (core/Theme setTextScale).
const govMode = () => ({ low: 'low', high: 'high' })[settings.get('fpsMode')] ?? 'auto';
const governor = new FrameGovernor({ mode: govMode(), bus, capFps: true });
loop.governor = governor;
const lowFx = () => governor.state === 'half' && settings.get('fpsMode') !== 'high';
function applySettings() {
  setTextScale(TEXT_SCALE[settings.get('textSize')] ?? 1);
  if (governor.mode !== govMode()) governor.setMode(govMode());
}
applySettings();
// Sound: the garage music and a few effects, all code-made (data/audio.js); nothing before the first tap.
const audio = new AudioManager({ bus, sounds: SOUNDS, music: MUSIC, caps: { crossfadeSec: AUDIO_RULES.crossfadeSec } });
audio.installUnlock();
function applyVolumes() {
  const m = settings.get('muted') ? 0 : 1;
  audio.setVolumes({ sfx: settings.get('sfxMuted') ? 0 : m * ((settings.get('sfx') ?? 100) / 100), music: settings.get('musicMuted') ? 0 : m * 0.6 * ((settings.get('music') ?? 75) / 100) });
  audio.setMuted(!!settings.get('muted'));
}
applyVolumes();
const sfx = (id) => audio.play(id);
const haptics = new Haptics({ enabled: () => settings.get('haptics') !== false });
const haptic = (level) => haptics[level]?.();
settings.onChange((k) => {
  applySettings();
  applyVolumes();
  if (k === 'showMenu') syncMenuSlot();
});
// Milestone 14: the driver drill records — the account's (they survive New Game+, slot deletes and reloads).
// Milestone 22: account blocks are written one at a time (the drill and combo records share the account save).
let accountChain = Promise.resolve();
const saveAccountBlock = (name, block) =>
  (accountChain = accountChain.then(async () => {
    if (!slots) return;
    const acc = await slots.loadAccount();
    await slots.saveAccount({ ...acc, [name]: block });
  }).catch((e) => debug.log(`account save failed: ${e?.message ?? e}`)));
const drillRecords = createDrillRecords({
  bus,
  load: async () => (slots ? ((await slots.loadAccount()).drills ?? null) : null),
  save: (block) => saveAccountBlock('drills', block),
});
// Milestone 22: the combo discoveries, clues and rumours — account-wide like the drill records.
const comboRecords = createComboRecords({
  load: async () => (slots ? ((await slots.loadAccount()).combos ?? null) : null),
  save: (block) => saveAccountBlock('combos', block),
});
team.combos.setRecords(comboRecords);
// Milestone 24: the secret engine's account half (found secrets, cross-run facts) lives in the account save too
team.secrets.setAccount({ load: async () => (slots ? ((await slots.loadAccount()).secrets ?? null) : null), save: (block) => saveAccountBlock('secrets', block) });
// Milestone 26: achievements, records and completion — account-wide too (they survive slot deletes and New Game+)
team.achievements.setAccount({ load: async () => (slots ? ((await slots.loadAccount()).achievements ?? null) : null), save: (block) => saveAccountBlock('achievements', block) });
// Milestone 27: the Hall of Runs and the endings' Prestige Tokens — account-wide too
team.ending.setAccount({ load: async () => (slots ? ((await slots.loadAccount()).ending ?? null) : null), save: (block) => saveAccountBlock('ending', block) });
// Milestone 28: the New Game+ lineage and the staff identities met — account-wide too
team.ngplus.setAccount({ load: async () => (slots ? ((await slots.loadAccount()).ngplus ?? null) : null), save: (block) => saveAccountBlock('ngplus', block) });
team.training.setDrillRecords(drillRecords);
bus.on('stint:done', ({ record }) => drillRecords.recordStint(record)); // Milestone 18: Drive Stints on the account records
// Milestone 20: the championship ladder — enter one (the fee on the ledger), race its next round (its race weekend).
function enterChamp(id) {
  const r = team.championships.enter(id);
  if (!r.ok) return toast('Not yet', r.reason);
  const c = team.championships.list().find((x) => x.def.id === id).def;
  const n = team.championships.nextRound();
  toast(`Entered: ${c.name}`, `${c.rounds} rounds · round 1 at ${TRACKS[n.trackId].name} in ${n.daysAway} days`);
  team.save();
  openMenu('compete');
}
function goChampRound() {
  const r = team.championships.startRound();
  if (!r.ok) return toast('Not yet', r.reason);
  // the field's car pictures (teams beyond the practice race load behind the game; make sure these are on their way)
  assets.ensure?.([...new Set(r.race.entries.map((e) => e.sprite))].filter((k) => assets.isPending?.(k)));
  sheet.close();
  goSub('weekend');
}
bus.on('championship:due', ({ round, trackId }) => toast(`Round ${round + 1} is due`, `${TRACKS[trackId].name}: race it from Compete`));
bus.on('championship:finished', ({ record, trophies }) => {
  const c = CHAMPIONSHIPS.find((x) => x.id === record.id);
  toast(record.title ? `Champions: ${c.name}!` : `${c.name} over: P${record.pos}`, trophies.length ? `${trophies[0].name}: the trophy is in the cabinet` : `${record.points} points`);
});
// Milestone 19: trackId (?debug=1's track picker) — the normal game's weekend is still Pine Ridge (championships: M20).
// Milestone 19 (?debug=1): the track picker and the 100-lap check on all 12 tracks (one track a frame, results as toasts).
const debugTracks = {
  weekend: (id) => goWeekend(id),
  // Milestone 20 (?debug=1): jump the calendar to the next round's day; open C11 / C12 (and let Ghostline race)
  roundDue() {
    const n = team.championships.nextRound();
    if (!n) return toast('No round to wait for');
    while (clock.totalDays < n.due) clock.advanceDay();
    openMenu('compete');
  },
  secrets() {
    team.championships.debugSecrets = !team.championships.debugSecrets;
    team.combos.debugSecrets = team.championships.debugSecrets; // Milestone 22: SYN20 and the secret families V17–V20 too
    openMenu('compete');
  },
  hundred() {
    sheet.close();
    const out = [];
    const next = (i) => {
      if (i >= TRACK_IDS.length) {
        debug.log(`100-lap test: ${out.map((r) => `${r.trackId} ${r.running ? 'STUCK' : 'ok'}`).join(' ')}`);
        window.__rw && (window.__rw.hundred = out);
        return toast('100-lap test done', out.every((r) => r.done && !r.running && !r.badPositions) ? 'All 12 tracks finished: no bad positions, nobody stuck' : 'A track had a problem: see the debug log');
      }
      const r = team.races.debugLongRace(TRACK_IDS[i], 100);
      if (r) {
        delete r.result;
        out.push(r);
        toast(`${r.trackId}: 100 laps`, `${r.finished} finished · ${r.retired} out · ${r.badPositions} bad positions · ${(r.ms / 1000).toFixed(1)} s`);
      }
      setTimeout(() => next(i + 1), 30);
    };
    toast('100-lap test', 'Running every track (a few seconds each)');
    setTimeout(() => next(0), 50);
  },
};
function goWeekend(trackId = null) {
  const r = team.races.createWeekend(trackId ? { config: { ...TEST_RACE, trackId } } : {});
  if (!r.ok) return toast(r.reason);
  if (r.race.kind !== 'weekend') {
    // an unfinished Test Race from before Milestone 7: carry it on first
    sheet.close();
    return goSub('raceIntro');
  }
  debug.log(r.existing ? 'weekend: carrying on' : `weekend created: seed ${r.race.seed}`);
  sheet.close();
  goSub('weekend');
}
// Races (Milestone 6): Compete → Test Race → the pre-race card → the race → the result. The seed and the field are
// fixed when the race is created and saved with the team; leaving mid-race keeps it exactly where it was.
function goTestRace() {
  const r = team.races.createTestRace();
  if (!r.ok) return toast(r.reason);
  debug.log(r.existing ? 'race: carrying on' : `race created: seed ${r.race.seed}`);
  sheet.close();
  goSub('raceIntro');
}
function startRace() {
  router.go('race');
}
function leaveRace() {
  raceScreen.exit();
  team.save();
  router.go('garage');
}
function raceFinished(sim) {
  const entry = team.races.finish(sim);
  debug.log(entry ? `race finished: P${entry.result.rows.find((r) => r.isPlayer)?.pos}` : 'race finish failed');
  team.save();
  router.go('raceResult');
}
// The garage calendar pauses while a race screen is open and carries on at its old speed afterwards.
let speedBeforeRace = null;
bus.on('screen:change', ({ from, to }) => {
  const inRace = CALENDAR_WAITS.includes(to);
  const wasRace = CALENDAR_WAITS.includes(from);
  if (inRace && !wasRace) {
    speedBeforeRace = clock.speed;
    clock.pause();
  } else if (!inRace && wasRace && speedBeforeRace) {
    clock.setSpeed(speedBeforeRace);
    speedBeforeRace = null;
  }
});

// ?debug=1 money buttons (Money sheet): force Credits up or down (a forced-negative test), jump to next month's day 1.
carDebug.money = (n) => team.money.economy.add('credits', n, n < 0 ? 'Debug: money taken' : 'Debug: money added', 'debug');
carDebug.nextMonth = () => {
  const m = clock.month;
  while (clock.month === m) clock.advanceDay();
};
const menus = createGarageMenus({ garage: () => garage, team, assets, open: openMenu, close: () => sheet.close(), goRoster, goStaff, goBuilder, goCarGarage, goMainMenu: () => goMainMenu(), debug: debug.enabled ? carDebug : null, toast: (t, b) => toast(t, b), goWeekend: () => goWeekend(), goTestRace: debug.enabled ? () => goTestRace() : null, goRaceResult: (index) => goSub('raceResult', { index }), goResearch: () => goResearch(), goRecruit: () => goRecruit(), goTrain: (id) => goTrain(id), debugTracks: debug.enabled ? debugTracks : null, goChampRound: () => goChampRound(), enterChamp: (id) => enterChamp(id), menuRow: (id) => openMenuRow(id), menuState: (id) => menuState(id), openSettings: () => openSettings(), showHelp: () => openHelp(null), sfx, haptic, sheetBack: () => sheetBack(), sheetBackLabel: () => sheetBackLabel(), openHelp: (t) => openHelp(t), refuse: (r) => refuse(r) });

// ---------------------------------------------------------------------------
// Milestone 25b: the Menu (core/ui/MenuSheet, rows in data/menu.js). A row runs the very code the art and the bars run.
const toGarage = () => router.currentName !== 'garage' && router.go('garage');
const MENU_OPEN = {
  pitBay: () => openMenu('F02'),
  carBuilder: () => (sheet.close(), goBuilder()),
  carGarage: () => (sheet.close(), goCarGarage()),
  roster: () => (sheet.close(), goRoster()),
  hire: () => goRecruit(),
  train: () => goTrain(),
  drills: () => (sheet.close(), goSub('medals')),
  store: () => openMenu('store'),
  research: () => openMenu('research'),
  build: () => {
    sheet.close();
    toGarage();
    garage.setBuildMode(true);
  },
  shop: () => {
    toGarage();
    garage.setBuildMode(true);
    openMenu('shop');
  },
  championships: () => openMenu('compete'),
  raceWeekend: () => (team.races.current ? goWeekend() : openMenu('compete')),
  ledger: () => (openMenu('money'), sheet.setTab('ledger')),
  contracts: () => (openMenu('money'), sheet.setTab('contracts')),
  sponsors: () => openMenu('sponsors'),
  records: () => openMenu('records'), // Milestone 26: the Records screen (its Trophy cabinet button opens the cabinet)
  inbox: () => openMenu('inbox'),
  partsArchive: () => openMenu('partsArchive'),
  comboArchive: () => openMenu('comboArchive'),
  rumourArchive: () => openMenu('rumourArchive'),
  settings: () => openSettings(),
  mainMenu: () => goMainMenu(),
  // Milestone 29: the rest of bible §7, each by the code its own button runs
  researchTree: () => goResearch(),
  buildSheet: () => (toGarage(), openMenu('build')),
  lastResult: () => team.races.history.length && (sheet.close(), goSub('raceResult', { index: team.races.history.length - 1 })),
  ceremony: () => team.ending.reached && (sheet.close(), toGarage(), router.go('ceremony', { replay: true })),
  ngPlus: () => team.ending.reached && startNgPlus(activeSlot),
  shopStore: () => openMenu('shopStore'),
  help: () => openHelp(null),
  credits: () => goCredits(),
};
function openMenuRow(id) {
  sheet.close();
  MENU_OPEN[id]?.();
}
// Locked rows say why (the same rules the sheets use); badges for what is waiting.
function menuState(id) {
  if (!teamReady) return {};
  if (id === 'carBuilder' && team.cars.active) return { locked: 'A car is already being built (Pit Bay)' };
  if (id === 'train' && !team.training.open()) return { locked: team.training.lockedText };
  if (id === 'raceWeekend' && !team.races.current && !team.races.canRace) return { locked: 'Build a car first (Pit Bay)' };
  if (id === 'store') return { badge: team.items.count || null, sub: `${team.items.count} of ${team.items.max} · kit that raises a stat for good` };
  if (id === 'inbox' && team.events.unread) return { badge: team.events.unread };
  if (id === 'sponsors' && team.sponsors.offers.length && team.sponsors.freeSlots()) return { badge: team.sponsors.offers.length };
  // Milestone 29
  if (id === 'lastResult' && !team.races.history.length) return { locked: EMPTY_TEXT.races };
  if ((id === 'ceremony' || id === 'ngPlus') && !team.ending.reached) return { locked: MAIN_MENU_TEXT.ngPlusNone };
  if (id === 'shopStore') return { sub: STORE_TEXT.line };
  return {};
}
menus.register('menu', () => menuSheet({ title: MENU_TEXT.title, subtitle: MENU_TEXT.subtitle, art: MENU_TEXT.icon, groups: MENU_GROUPS, open: openMenuRow, state: menuState }));

// ---------------------------------------------------------------------------
// Milestone 29: Help (core/ui/HelpArchive, data/help.js). Every screen's Help button — the top bar's, a sheet's "?", the
// menu screens' header, the race pause sheet — opens that screen's one page over it; Settings → Help and the main menu's
// Help open the list of every page. Help sits over the screen (nothing under it is reset), the calendar waits while it
// is open, and Back closes it.
let helpOpen = false;
let helpSpeed = null; // the calendar speed to go back to
const helpScreen = createHelpArchive({
  renderer,
  layout,
  assets,
  router,
  guide: null, // (the first-time guide is Milestone 33)
  topics: HELP_TOPICS,
  text: HELP_TEXT,
  icon: 'race_ui_13',
  footer: { label: HELP_TEXT.settings, onTap: () => (closeHelp(), openSettings()) },
  onLeave: () => closeHelp(),
});
const helpTopicFor = (kind = null, target = null) => {
  if (kind == null) return HELP_FOR[router.currentName === 'race' && raceScreen.stintView?.active ? 'stint' : router.currentName] ?? 'garage';
  if (HELP_FOR[`sheet_${kind}`]) return HELP_FOR[`sheet_${kind}`];
  if (kind === 'facility' && target?.def) return HELP_FOR[`role_${target.def.role}`] ?? 'facilities';
  const st = STATIONS.find((s) => s.id === kind);
  return st ? HELP_FOR[`role_${st.role}`] ?? 'facilities' : 'garage';
};
// topic: a page id, null = the list of every page, undefined = the page for what is on screen now
function openHelp(topic) {
  if (topic === undefined) topic = sheet.active && sheetNow ? helpTopicFor(sheetNow.kind, sheetNow.target) : helpTopicFor();
  helpScreen.enter({ topic: topic ?? undefined, back: router.currentName, direct: !!topic });
  if (!helpOpen && teamReady && !clock.paused) {
    helpSpeed = clock.speed;
    clock.pause();
  }
  helpOpen = true;
}
function closeHelp() {
  if (!helpOpen) return;
  helpOpen = false;
  if (helpSpeed) clock.setSpeed(helpSpeed);
  helpSpeed = null;
}
router.layers.unshift({
  get active() {
    return helpOpen && !dialog.active;
  },
  handleInput: (hook, p) => {
    helpScreen[hook]?.(p);
    return true; // Help takes every touch while it is open
  },
});
// A refused action says why in one line (no money, rank, Emergency Credit, in a race…).
function refuse(reason) {
  toast(BACK_TEXT.refused, reason);
  haptic('light');
}

// Milestone 29: the race pause sheet (Back mid-race, or the race's "‹ Pause"): Resume, Leave (the race waits, saved),
// Settings and Help. While it is open the race is paused.
menus.register('racePause', () => {
  const r = team.races.current;
  const sim = raceScreen.sim;
  return {
    title: BACK_TEXT.raceTitle,
    subtitle: sim ? `${TRACKS[r?.trackId]?.name ?? ''} · lap ${Math.min(sim.laps, sim.lapOf?.(sim.car?.('PLAYER')) ?? 0)} of ${sim.laps}` : BACK_TEXT.raceLine,
    art: 'race_ui_04',
    accent: COL.progress,
    sections: [
      { columns: 1, buttons: [{ id: 'raceResume', label: BACK_TEXT.resume, sub: BACK_TEXT.resumeLine, icon: 'race_ui_04', accent: COL.good, onTap: () => resumeRace() }] },
      { columns: 2, buttons: [
        { id: 'raceSettings', label: 'Settings', sub: 'Sound, camera, text', icon: 'race_ui_menu', accent: COL.progress, onTap: () => openSettings() },
        { id: 'raceHelp', label: 'Help', sub: 'How the race works', icon: 'race_ui_13', accent: COL.progress, onTap: () => openHelp('race') },
      ] },
      { columns: 1, buttons: [{ id: 'raceLeave', label: BACK_TEXT.leave, sub: BACK_TEXT.leaveLine, icon: 'race_ui_01', accent: COL.action, onTap: () => (sheet.close(), leaveRace()) }] },
    ],
  };
});
// Settings (series §2): one sheet, the series list in Robot Workshop's order, then Help / Privacy / Credits, then the
// RACEWORKS extras. Reachable from the main menu, the Menu sheet, Help (top bar) and Drills · Medals.
function openSettings() {
  openMenu('settings');
}
function settingsMenu() {
  const sections = [];
  let group = null;
  const optionRow = (d) => ({
    title: d.label,
    lines: d.line ? [{ text: d.line, color: COL.textMuted }] : [],
    columns: Math.min(d.options.length, 5),
    buttons: d.options.map((o) => {
      const on = settings.get(d.id) === o.id;
      return { id: `set_${d.id}_${o.id}`, label: `${on ? '✓ ' : ''}${o.label}`, accent: on ? COL.good : COL.progress, onTap: () => settings.set(d.id, o.id) };
    }),
  });
  const heading = (g) => g !== group && sections.push({ title: (group = g).toUpperCase(), lines: [] }); // a group heading, then its rows
  for (const d of SETTINGS.filter((x) => !x.extra)) {
    heading(d.group);
    sections.push(optionRow(d));
  }
  heading('Help and about');
  sections.push({ columns: 1, buttons: [
    { id: 'setHelp', label: SETTINGS_TEXT.help, sub: SETTINGS_TEXT.helpLine, icon: 'race_ui_13', accent: COL.progress, onTap: () => openHelp(null) },
    { id: 'setLegal', label: SETTINGS_TEXT.legal, sub: 'How your teams are kept', icon: 'race_ui_13', accent: COL.progress, onTap: () => dialog.show({ title: SETTINGS_TEXT.legal, body: SETTINGS_TEXT.legalBody, buttons: [{ id: 'ok', label: 'OK', accent: COL.progress }] }) },
    { id: 'setCredits', label: SETTINGS_TEXT.credits, sub: 'The people behind RACEWORKS', icon: 'race_brand_02', accent: COL.progress, onTap: () => goCredits() }, // (Milestone 29: the Credits screen)
  ] });
  for (const d of SETTINGS.filter((x) => x.extra)) {
    heading(d.group);
    sections.push(optionRow(d));
  }
  return { title: SETTINGS_TEXT.title, subtitle: SETTINGS_TEXT.subtitle, art: 'race_ui_menu', accent: COL.progress, sections };
}
menus.register('settings', () => settingsMenu());

// ---------------------------------------------------------------------------
// Toasts (core/ui/Toast): short money news under the top bar — salary day, a contract paid, Emergency Credit on / off,
// a new rank — and why a button was refused.
const toasts = [];
const TOAST_LIFE = 3.2;
function toast(title, body = '') {
  toasts.push({ entry: { title, body }, age: 0 });
  if (toasts.length > 3) toasts.shift();
}
const fmtCr = (n) => Math.round(n).toLocaleString('en-US');
// (Milestone 21: with today's sponsor stipends — paid just before, on the same day 1)
const stipendsToday = () => team.money.economy.ledger.filter((l) => l.day === clock.totalDays && l.category === 'sponsor' && l.reason.startsWith('Sponsor stipend')).reduce((t, l) => t + l.amount, 0);
bus.on('clock:month', () => teamReady && toast(`Month ${clock.month}: salaries paid`, `−${fmtCr(team.money.salaryBill())} Credits${team.money.upkeepBill() ? ` · car upkeep −${fmtCr(team.money.upkeepBill())}` : ''}${stipendsToday() ? ` · sponsors +${fmtCr(stipendsToday())}` : ''}`));
bus.on('economy:debt', ({ inDebt }) => teamReady && (inDebt ? toast('Emergency Credit is on', 'Cash is below 0: no new cars, interest monthly. See Money.') : toast('Out of Emergency Credit', 'Cash is back above 0.')));
bus.on('contract:success', ({ contract }) => teamReady && toast('Contract paid', `+${fmtCr(contract.credits)} Credits · +${contract.rp} RP`));
bus.on('contract:failed', ({ contract, reason }) => teamReady && toast('Contract ended', `${contract.title}: ${reason === 'cancelled' ? 'given up' : 'the deadline passed'}`));
// Milestone 21: sponsors — an obligation met, a deal ended (with its renewal / retry offer), a race bonus arrives in the ledger
bus.on('sponsor:met', ({ deal, def }) => teamReady && toast(`${def.name}: obligation met!`, `+${fmtCr(deal.completion)} Credits bonus`));
bus.on('sponsor:ended', ({ record, def }) => teamReady && toast(`${def.name}: the 6-month deal ended`, record.met ? 'They offer to renew on better terms (Money → Sponsors)' : 'Obligation missed: they offer again on worse terms'));
bus.on('contract:progress', ({ contract }) => teamReady && contract.progress < contract.need && toast(`${contract.title}: ${contract.progress} / ${contract.need}`, 'Contract progress'));
bus.on('reputation:rankUp', ({ rank }) => teamReady && toast(`Rank ${rank.id}!`, 'Your team has moved up a rank.'));
bus.on('facility:expansion', ({ zone }) => teamReady && toast(`${zone.name} open!`, 'The garage is bigger: more floor to build on.')); // Milestone 10
// Milestone 12: a course finished.
bus.on('training:complete', ({ staff: s, course, gains }) => {
  debug.log(`training done: ${s.name}, ${course.name}`);
  if (!teamReady) return;
  const g = Object.entries(gains).map(([k, v]) => `${k} +${v}`).join(' · ');
  toast(`${s.name.split(' ')[0]} finished ${course.name}`, g || (course.id === 'endurance' ? 'Energy full · better recovery' : 'Already at the tier cap'));
});
bus.on('staff:hired', ({ staff: s }) => debug.log(`hired: ${s.id} ${s.name} (${s.tier} ${s.role})`));
bus.on('staff:letGo', ({ id, name }) => debug.log(`let go: ${id} ${name}`));
// Milestone 11 / 22: a finished research node and a combo discovered get the gold medium moment, a clue a strip — since
// Milestone 23 these are minor events (src/systems/events.js): one strip at a time, each also in the Inbox.
bus.on('combo:discovered', ({ combo }) => debug.log(`combo discovered: ${combo.id} ${combo.name}`));
bus.on('research:complete', ({ node, fired }) => debug.log(`research done: ${node.id} ${node.name} (${fired.map((a) => a.id).join(' ')})`));
// Milestone 23: the event card, and the minor event strip (returns the height it used).
const eventCard = createEventCard({ layout, assets, events: team.events, reduced: () => !!settings.get('reducedMotion') });
bus.on('event:fired', ({ instance, def }) => debug.log(`event: ${def.id} (${def.cls ?? def.kind}) day ${instance.day}`));
function drawEventToast(ctx, rect) {
  const t = team.events.toast;
  if (!t) return 0;
  const life = team.events.toastLife;
  const reduced = !!settings.get('reducedMotion');
  // reduced motion (Milestone 14 setting): no slide, a short fade
  const age = reduced ? Math.max(t.age, 0.25) : t.age;
  const d = t.entry.data ?? {};
  if (d.look === 'research' && NODE[d.nodeId]) {
    drawResearchBanner(ctx, assets, rect, { node: NODE[d.nodeId], fired: d.fired ?? [], age, more: t.more }, life);
    return researchBannerHeight();
  }
  if (d.look === 'combo' && comboById(d.comboId)) {
    drawResearchBanner(ctx, assets, rect, { combo: comboById(d.comboId), rp: d.rp, age, more: t.more }, life);
    return researchBannerHeight();
  }
  return drawToasts(ctx, [{ ...t, age }], { x: rect.x + 16, y: rect.y, w: rect.w - 32, life, drawIcon: (c, e, r) => e.icon && assets.drawContained(c, e.icon, r) });
}

// ---------------------------------------------------------------------------
// The shared bars (core/ui), filled with RACEWORKS content.
const topBarStats = () => [
  { icon: TOP_BAR.icons.credits, iconSize: 60, text: team.money.credits.toLocaleString('en-US'), gap: 14 },
  { icon: TOP_BAR.icons.tokens, text: String(team.money.tokens) },
  { text: `Rank ${team.money.rank}`, color: COL.actionDark },
];
const statsBad = () => teamReady && team.money.inDebt; // Emergency Credit: the chip turns red
const badges = Object.fromEntries(BOTTOM_SLOTS.map((s) => [s.id, null])); // slot → badge text (data; nothing sets them yet)
const topBar = createTopBar({
  layout,
  assets,
  clock,
  home: true,
  stats: () => topBarStats(),
  statsBad,
  onStats: () => openMenu('money'),
  onInbox: () => openMenu('inbox'),
  onHelp: () => openHelp(), // Milestone 29: this place's Help page
  inboxCount: () => (teamReady ? team.events.unread : 0), // Milestone 23
  dateTag: () => (teamReady && team.ending.postgame ? ENDING_TEXT.postgame : null), // Milestone 27
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
  statsBad,
  // From a staff screen these return to the garage and open their sheet there.
  onStats: () => fromScreen('money'),
  onInbox: () => fromScreen('inbox'),
  onHelp: () => openHelp(), // Milestone 29: this screen's Help page (the Help archive)
  inboxCount: () => (teamReady ? team.events.unread : 0), // Milestone 23
});
function fromScreen(kind) {
  router.go('garage');
  openMenu(kind);
}
const bottomItems = BOTTOM_SLOTS.map((s) => ({ id: s.id, label: s.label, icon: s.icon, badge: () => badges[s.id] }));
const MENU_SLOT = { id: 'menu', label: MENU_TEXT.button, icon: MENU_TEXT.icon, badge: () => null }; // Milestone 25b
const bottomBar = createBottomBar({
  layout,
  assets,
  items: bottomItems,
  open: openMenu,
});
// Milestone 25b: the Menu button sits at the end of the bottom row (as in DEVWORKS); Settings → "Show Menu button" Off
// takes it away (Settings stays on the main menu and in Help).
function syncMenuSlot() {
  const on = settings.get('showMenu') !== false;
  const i = bottomItems.indexOf(MENU_SLOT);
  if (on && i < 0) bottomItems.push(MENU_SLOT);
  if (!on && i >= 0) bottomItems.splice(i, 1);
}
syncMenuSlot();
// The Menu icon, drawn by code (three bars on a cream tile; no file).
assets.setFallback(MENU_TEXT.icon, (ctx, x, y, w, h) => {
  const sz = Math.min(w, h);
  const ox = x + (w - sz) / 2;
  const oy = y + (h - sz) / 2;
  ctx.fillStyle = '#FFF6E5';
  ctx.strokeStyle = COL.outline;
  ctx.lineWidth = Math.max(2, sz * 0.05);
  ctx.beginPath();
  ctx.roundRect(ox + sz * 0.08, oy + sz * 0.08, sz * 0.84, sz * 0.84, sz * 0.18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COL.action;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.roundRect(ox + sz * 0.24, oy + sz * (0.28 + i * 0.18), sz * 0.52, sz * 0.09, sz * 0.045);
    ctx.fill();
  }
});
// Items (Milestone 25b): code placeholders in the group colour until assets/images/items/item_01–25.png exist.
registerItemArt(assets, { types: ITEM_TYPES, groups: ITEM_GROUPS, rarities: ITEM_RARITIES, storeIcon: ITEM_RULES.storeIcon });
for (const [k, src] of Object.entries(ITEM_ART)) assets.loadOptional(k, src);
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

// Back one level (Milestone 29, the one rule for the phone's Back, Esc and every on-screen "‹"): a dialog, an event
// card or the name prompt first; then the top sheet (back to the sheet it was opened from, else closed — in a race the
// pause sheet closes and the race carries on); then Help; then the screen (to where it was opened from); in a race Back
// opens the pause sheet (a Drive Stint hands back first) and never leaves by itself; on the garage with nothing open it
// asks before leaving for the main menu. On the main menu nothing is open: the press goes to the phone (the app closes).
function back() {
  if (loop.paused && onTestScreen()) loop.resume('back');
  else if (dialog.active) dialog.onBack();
  else if (teamReady && eventCard.active) eventCard.onBack(); // Milestone 23: a question must be answered; news closes
  else if (textPrompt.active) textPrompt.close();
  else if (helpOpen) helpScreen.onBack();
  else if (sheet.active) {
    if (sheetNow?.kind === 'racePause') resumeRace();
    else sheetBack();
  }
  else if (creditsOpen) closeCredits();
  else if (router.currentName === 'setup') {
    if (!setupScreen.onBack()) router.go(setupFrom, setupFrom === 'slots' ? { mode: slotsScreen.mode } : {});
  } else if (router.currentName === 'slots') router.go('menu');
  else if (router.currentName === 'hall') router.go('slots', { mode: 'load' }); // Milestone 27
  else if (router.currentName === 'ngplus') leaveNgPlus();
  else if (router.currentName === 'ceremony') ceremonyScreen.next(); // Back moves the ceremony on (its last card waits for a choice)
  else if (router.currentName === 'garage' && garage.buildMode) garage.setBuildMode(false);
  else if (router.currentName === 'race') {
    if (!raceScreen.onBack()) pauseRace(); // Milestone 18: during a Drive Stint, Back hands back first; Milestone 29: then the pause sheet
  }
  else if (router.currentName === 'raceResult') router.go('garage');
  else if (router.currentName === 'drill' && drillScreen.onBack()) {
    /* the drill handles it (hand back / done) */
  }
  else if (SUB_SCREENS[router.currentName]) {
    const prev = trail.pop() ?? { name: 'garage', params: {} };
    hereParams = prev.params;
    router.go(prev.name, prev.params);
  }
  else if (router.currentName === 'route') router.go('test');
  else if (router.currentName === 'garage' && teamReady) confirmLeaveGarage();
  else if (router.currentName === 'boot' || router.currentName === 'splash') {
    /* starting up: nothing to go back to yet */
  }
  else return false;
  return true;
}
function confirmLeaveGarage() {
  dialog.confirm({ title: BACK_TEXT.leaveTitle, body: BACK_TEXT.leaveBody, yes: BACK_TEXT.leaveYes, no: BACK_TEXT.leaveNo, onYes: () => goMainMenu() });
}
// The phone's Back / the browser's Back / Esc (core/SystemBack): one press = one back(). After a press that went to the
// phone (the main menu), the next tap in the game catches Back again.
const systemBack = new SystemBack({ onBack: () => back() });
bus.on('input:down', () => systemBack.rearm());
bus.on('screen:change', () => systemBack.rearm());

// Milestone 29: the race pause sheet — Back (or the race's "‹ Pause") pauses the race and opens it; the race only ever
// leaves from here, on purpose, and waits (saved) exactly where it was.
let raceHeld = false; // the pause sheet (or a sheet opened from it) holds the race
function pauseRace() {
  raceScreen.setPaused?.(true);
  raceHeld = true;
  openMenu('racePause');
}
function resumeRace() {
  sheet.close();
  raceScreen.setPaused?.(false);
  raceHeld = false;
}

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
        // Milestone 9: the rest of the car and part art, behind the game.
        assets.register(LATER_ASSETS);
        assets.register(STAFF_PORTRAITS); // Milestone 12: loaded when a board or a hire needs one
        if (debug.enabled) {
          // Milestone 13: the staff data validator (the portrait files are checked by tests/raceworks/m13.test.mjs)
          const bad = checkStaffData();
          debug.log(bad.length ? `staff data: ${bad.length} problem(s), first: ${bad[0]}` : 'staff data: all 50 ok');
          if (bad.length) console.warn('[staff data]', bad);
        }
        assets.loadInBackground(Object.keys(LATER_ASSETS));
        return loadStatusIcons(assets);
      })
      .then(startSlots)
      .then(() => (START_SCREEN === 'menu' && debug.enabled && PARAMS.get('slot') ? debugOpenSlot(Number(PARAMS.get('slot'))) : router.go(START_SCREEN)))
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

const garage = createGarageScreen({ renderer, layout, assets, bus, sheet, openMenu, clock, team, topBar, bottomBar, debug, simpleFigures: () => lowFx() || settings.get('fpsMode') === 'low', sponsorLogos: () => team.sponsors.deals.map((d) => d.id) });
// Milestone 25b: the next-step hint line under the date (core/ui/HintLine): what to do next, tap to go there. Quiet with
// Settings → hints off, off the garage, in Build Mode, under a sheet, a dialog, an event card or a strip / toast.
const firstFinishedCar = () => team.cars.cars.latest();
const hintLine = new HintLine({
  rect: () => {
    const tb = topBarRect(layout);
    return { x: tb.x + 24, y: tb.y + tb.h + 10, w: tb.w - 48, h: 96 }; // (Milestone 29: a thumb-sized tap, 96)
  },
  quiet: () => !teamReady || helpOpen || creditsOpen || settings.get('showHints') === false || router.currentName !== 'garage' || garage.buildMode || sheet.active || dialog.active || eventCard.active || !!team.events.toast || toasts.length > 0 || loop.paused,
  rules: [
    { id: 'raceDay', text: NEXT_HINTS.raceDay, when: () => !team.races.current && !!team.championships.nextRound()?.ready, open: () => openMenu('compete') },
    { id: 'firstCar', text: NEXT_HINTS.firstCar, when: () => team.cars.cars.count === 0 && !team.cars.active, open: () => openMenu('F02') },
    { id: 'hireMechanic', text: NEXT_HINTS.hireMechanic, when: () => !team.roster.some((p) => p.role === 'mechanic'), open: () => goRecruit() },
    { id: 'carReady', text: () => NEXT_HINTS.carReady(firstFinishedCar()?.name ?? 'car'), when: () => team.cars.cars.count > 0 && team.races.history.length === 0 && !team.races.current && !team.championships.current, open: () => openMenu('compete') },
    { id: 'item', text: () => NEXT_HINTS.item(team.items.count), when: () => team.items.count > 0 && team.items.store().some((x) => team.roster.some((p) => team.items.preview(x.uid, p.id).ok)), open: () => openMenu('store') },
    { id: 'research', text: NEXT_HINTS.research, when: () => !team.research.active, open: () => openMenu('research') },
    { id: 'sponsor', text: NEXT_HINTS.sponsor, when: () => team.sponsors.freeSlots() > 0 && team.sponsors.offers.some((o) => !team.sponsors.signWhy(o.id)), open: () => openMenu('sponsors') },
    { id: 'upgrade', text: NEXT_HINTS.upgrade, when: () => team.facilities.items().some((p) => team.facilities.levelStatus(p.uid)?.next?.ok), open: () => garage.setBuildMode(true) },
  ],
});
router.layers.push({
  get active() {
    return !!hintLine.current && router.currentName === 'garage' && !sheet.active && !garage.buildMode;
  },
  handleInput: (hook, p) => hook === 'onTap' && hintLine.handleTap(p),
});
// Milestone 25b: sound and buzz on the big moments (Settings: Sound, Vibration).
bus.on('facility:bought', () => sfx('sfx_build'));
bus.on('facility:upgraded', ({ defId, level }) => {
  sfx('sfx_upgrade');
  haptic('light');
  if (teamReady) toast(`${team.facilities.defs[defId]?.name ?? 'A station'}: level ${level}!`, 'Its effect is stronger now.');
});
bus.on('items:arrived', () => sfx('sfx_item'));
bus.on('project:complete', () => (sfx('sfx_car_done'), haptic('medium')));
bus.on('contract:success', () => sfx('sfx_cash'));
bus.on('race:finished', ({ race: e }) => {
  if (e?.kind === 'weekend' && e.result?.rows?.find((r) => r.isPlayer)?.pos === 1) (sfx('sfx_win'), haptic('strong'));
});
const rosterScreen = createRosterScreen({ layout, assets, team, garage, topBar: screenBar, goStaff, goRecruit: () => goRecruit(), goTrain: () => goTrain() });
const staffScreen = createStaffDetailScreen({ layout, assets, team, garage, topBar: screenBar, debugEnabled: debug.enabled, goTrain: (id) => goTrain(id), giveItem: (id) => openMenu('giveTo', id), confirm: (o) => dialog.confirm(o), toast: (a, b) => toast(a, b), afterLetGo: () => back() });
const recruitScreen = createRecruitScreen({ layout, assets, team, topBar: screenBar, toast: (a, b) => toast(a, b), goStaff, debugEnabled: debug.enabled }); // Milestone 12 (Milestone 13: ?debug=1 spawns on the Special tab)
const trainScreen = createTrainScreen({ layout, assets, team, topBar: screenBar, toast: (a, b) => toast(a, b), goDrill: (p) => goSub('drill', p), goMedals: () => goSub('medals') }); // Milestone 12 (14: drills)
// Milestone 14: a drill, and the medal history. A finished drill returns to where it was opened from.
const drillScreen = createDrillScreen({ renderer, layout, assets, team, bus, settings, records: drillRecords, debugEnabled: debug.enabled, toast: (a, b) => toast(a, b), onHelp: () => openHelp(), isHeld: () => helpOpen, onDone: (p, result) => {
  back();
  // Milestone 15: the Qualifying Drive lap returns to the weekend with the grid set
  if (p.qualiLap && result?.quali) toast(`Qualified P${result.quali.rows.find((r) => r.isPlayer).pos}`, result.drive ? 'With your Drive lap' : 'Simulated after the hand back');
  if (result?.medal) toast(`${result.medal[0].toUpperCase()}${result.medal.slice(1)} medal!`, result.pct ? `+${result.pct}% on this course` : 'Saved in your medal history');
  team.save();
} });
const medalsScreen = createMedalsScreen({ layout, assets, topBar: screenBar, records: drillRecords, settings, onSettings: () => openSettings(), debugEnabled: debug.enabled, goPractice: (drillId) => goSub('drill', { drillId, practice: true }), toast: (a, b) => toast(a, b) });
// The car screens (Milestone 4): the builder, one finished car, the Car Garage.
const carBuilderScreen = createCarBuilderScreen({
  layout,
  assets,
  team,
  topBar: screenBar,
  debugEnabled: debug.enabled, // ?debug=1: unlock-all and a random legal car (Milestone 9)
  refuse: (r) => refuse(r), // Milestone 29
  onStart: (opts) => {
    const r = team.startCar(opts); // pays for the parts (Milestone 5)
    debug.log(r.ok ? `car started: ${r.job.name} (${opts.budget}, ${r.job.data.tier}, parts ${r.job.data.parts.join(' ')}, team ${opts.staffIds.join(', ')})` : `car not started: ${r.reason}`);
    if (!r.ok) return toast(r.reason);
    router.go('garage');
    garage.focusPitBay?.();
  },
});
const carResultScreen = createCarResultScreen({ layout, assets, team, topBar: screenBar, goCarGarage, debugEnabled: debug.enabled, toast: (x) => toast(x) });
const carGarageScreen = createCarGarageScreen({ layout, assets, team, topBar: screenBar, goCar });
const researchScreen = createResearchScreen({ layout, assets, team, topBar: screenBar, toast: (a, b) => toast(a, b), debugEnabled: debug.enabled }); // Milestone 11
const raceIntroScreen = createRaceIntroScreen({ layout, assets, team, topBar: screenBar, onStart: startRace });
const raceScreen = createRaceScreen({ renderer, layout, assets, team, bus, settings, onFinished: raceFinished, onLeave: () => leaveRace(), onPause: () => back(), onHelp: () => openHelp('stint'), toast: (a, b) => toast(a, b), debug: debug.enabled, lowFx, shakeScale: () => SHAKE_LEVELS[settings.get('screenShake')] ?? 1 }); // Milestone 16: + the debug tyre call
const weekendScreen = createWeekendScreen({ layout, assets, team, topBar: screenBar, onStartRace: startRace, onDriveLap: () => goSub('drill', { qualiLap: true }), toast: (a, b) => toast(a, b) }); // Milestone 15: + the Drive lap
// The result: prize Credits and Reputation (through the Milestone 5 ledger and rank), setup and qualifying.
const resultLines = (e) => {
  const out = [];
  if (e.kind === 'weekend') {
    const me = e.result.rows.find((r) => r.isPlayer);
    out.push({ text: me?.status === 'retired' ? 'No prize money for a retirement' : `Prize money +${e.prize.toLocaleString('en-US')} Credits · Reputation +${e.reputation}`, color: C_GOOD });
    if (e.swingWin) out.push({ text: `Strategy Swing win: ${e.swingWin.kind === 'undercut' ? 'the undercut' : 'the extended stint'} on lap ${e.swingWin.lap} (the crew planned lap ${e.swingWin.planLap})`, color: C_GOOD }); // Milestone 16
    if (e.quali) out.push({ text: `Qualified P${e.quali.rows.find((r) => r.isPlayer)?.pos} · setup score ${e.setupScore} / 100 · tyres ${me?.stints?.join(' → ') ?? ''}${me?.stops ? ` (${me.stops} stop${me.stops === 1 ? '' : 's'})` : ''}` });
    // Milestone 17: the weather, cautions and your car's incidents
    const wx = e.result.weather;
    if (wx) {
      const bits = [`Weather: ${wx.states.map((s) => WEATHER_NAMES[s]).join(' → ')}`];
      const k = e.result.cautions?.length ?? 0;
      if (k) bits.push(`${k} caution${k === 1 ? '' : 's'}${me?.neutralGains ? ` (you gained ${me.neutralGains} place${me.neutralGains === 1 ? '' : 's'})` : ''}`);
      if (me?.spins) bits.push(`${me.spins} spin${me.spins === 1 ? '' : 's'}`);
      if (me?.faultsFixed) bits.push(`${me.faultsFixed} fault${me.faultsFixed === 1 ? '' : 's'} fixed in the pits`);
      if (me?.damage) bits.push(`damage ${me.damage}% at the flag`);
      out.push({ text: bits.join(' · '), color: wx.wet ? COL.progress : COL.textMuted });
    }
  } else out.push({ text: `Test race at ${TRACKS[e.trackId].name}: no prize money`, color: COL.textMuted });
  // Milestone 20: the championship after this round
  if (e.champ) {
    const c = CHAMPIONSHIPS.find((x) => x.id === e.champ.id);
    const me = team.championships.standings().find((r) => r.isPlayer);
    if (c && me) out.push({ text: `${c.name}, round ${e.champ.round + 1} of ${c.rounds}: you are P${me.pos} on ${me.points} pts`, color: COL.progress });
  }
  if (e.rp) out.push({ text: `Research +${e.rp} RP (${e.rpLines.map((l) => `${l.reason} +${l.amount}`).join(' · ')})`, color: COL.progress }); // Milestone 11
  return out;
};
const C_GOOD = COL.good;
const raceResultScreen = createRaceResultScreen({ layout, assets, team, topBar: screenBar, goGarage: () => router.go('garage'), goCar: (n) => goSub('car', { number: n }), extraLines: resultLines });
// The garage tells the daily tick what each person is doing, and its workers' places travel in the save.
team.activityOf = (s) => garage.activityOf(s.id);
team.garageSnapshot = () => garage.snapshot();

// ---------------------------------------------------------------------------
// Save slots (Milestone 4b): four campaign slots + the account store (core/CampaignSlots) in IndexedDB (or
// localStorage / memory where that is missing). A team from before 4b (the single 'team' save) moves into slot 1.
let slots = null;
let slotList = []; // the last slot listing, for the menu and slot screens
let activeSlot = null; // the slot whose team is open (null on the menus)
let setupFrom = 'menu'; // where the setup screen's Back returns to
async function startSlots() {
  const adapter = await createStorageAdapter({ dbName: 'raceworks', prefix: 'raceworks:' });
  slots = new CampaignSlots({ adapter, count: SLOT_COUNT, version: SAVE_VERSION, migrations: SAVE_MIGRATIONS, describe: describeSave, bus });
  if (debug.enabled && PARAMS.get('reset') === '1') for (const n of slots.numbers()) await slots.remove(n);
  const moved = await slots.adoptLegacy({ key: 'team', into: 1 });
  debug.log(`slots ready (${adapter.kind})${moved.adopted ? ', the old team moved into slot 1' : ''}`);
  await refreshSlots();
  await drillRecords.load(); // Milestone 14
  await comboRecords.load(); // Milestone 22
}
async function refreshSlots() {
  slotList = await slots.list();
  return slotList;
}
const slotAt = (n) => slotList.find((s) => s.n === n);

// Close the open team (saving it first): the menus run with no team ticking.
async function leaveTeam() {
  if (!teamReady) return;
  teamReady = false;
  pendingCar = null; // a finished car's screen belongs to this team: it is in its Car Garage for next time
  sheet.close();
  await autosave.saving;
  await team.save();
  activeSlot = null;
}
// Open a team in the garage (after team.load / team.newGame): the garage rebuilds its workers from the roster.
async function openTeam(n) {
  activeSlot = n;
  team.events.muted = debug.enabled && PARAMS.get('events') === '0'; // Milestone 23 (older browser checks)
  assets.ensure(team.roster.map((s) => s.art).filter((k) => assets.isPending(k))); // Milestone 12: hires' portraits
  // Milestone 25: a waiting special arrival's portrait (its Inbox card and the Special tab show it)
  assets.ensure(team.recruitment.cardsOf('special').map((c) => c.art).filter((k) => k && assets.isPending(k)));
  garage.loadTeam();
  teamReady = true;
  audio.playMusic('music_garage'); // Milestone 25b
  const acc = await slots.loadAccount();
  await slots.saveAccount({ ...acc, lastSlot: n });
  router.go('garage');
}
async function playSlot(n) {
  await leaveTeam();
  try {
    const data = await slots.load(n);
    if (!data) throw new Error('This slot is empty.');
    team.useSlot(slots.slot(n));
    await accountChain; // (Milestone 24: any account write still on its way lands first)
    await team.secrets.loadAccount();
    await team.achievements.loadAccount(); // Milestone 26
    await team.ending.loadAccount(); // Milestone 27
    await team.ngplus.loadAccount(); // Milestone 28
    team.load(data);
    team.ngplus.sync();
  } catch (err) {
    debug.log(`slot ${n} would not load: ${err.message}`);
    dialog.show({ title: 'That save would not load', body: err.message, buttons: [{ id: 'ok', label: 'OK', accent: COL.progress }] });
    return false;
  }
  debug.log(`slot ${n} loaded: ${team.setup.teamName}, day ${clock.totalDays}`);
  await openTeam(n);
  return true;
}
// START TEAM: a fresh team in slot n (anything there was confirmed away already, so it is emptied first — never mixed).
// Milestone 28: carry = a New Game+ package (its parent's slot is never the one written).
async function startNewTeam(setup, n, carry = null) {
  if (carry && carry.parentSlot === n) throw new Error('New Game+ never writes over its parent run');
  await leaveTeam();
  await slots.remove(n);
  team.useSlot(slots.slot(n));
  await accountChain;
  await team.secrets.loadAccount(); // Milestone 24
  await team.achievements.loadAccount(); // Milestone 26
  await team.ending.loadAccount(); // Milestone 27
  await team.ngplus.loadAccount(); // Milestone 28
  team.newGame(setup, carry);
  await team.ngplus.started(carry);
  debug.log(`new team in slot ${n}: ${team.setup.teamName}, founder ${team.founder.id}${carry ? `, New Game+ ${carry.level} from slot ${carry.parentSlot}` : ''}`);
  await team.save();
  await refreshSlots();
  await openTeam(n);
}
async function goMainMenu() {
  await leaveTeam();
  await refreshSlots();
  router.go('menu');
}
async function newGame() {
  await refreshSlots();
  const n = await slots.firstEmpty();
  if (n) {
    setupFrom = 'menu';
    router.go('setup', { slot: n });
  } else router.go('slots', { mode: 'new' });
}
// Milestone 28 (spec §8): New Game+ asks for a slot and never writes over the parent run — the slot screen locks the
// parent slot; a full slot asks before it is replaced. Then the New Game+ Setup screen (the picks), then the normal
// new-team setup; START TEAM builds the run from the carry package. ngFlow holds the flow until then.
let ngFlow = null; // { parentSlot, parent (a Team read from the parent's save), slot, replacing, offer, choices }
async function startNgPlus(parentSlot) {
  await leaveTeam();
  await refreshSlots();
  ngFlow = { parentSlot, parent: null, slot: null, replacing: null, offer: null, choices: null };
  chooseNewGamePlusSlot(parentSlot);
}
function chooseNewGamePlusSlot(parentSlot) {
  router.go('slots', { mode: 'ngplus', parent: parentSlot });
}
// The new run's slot is chosen: read the parent's save (only read: a separate Team, never the one that saves) and show
// the New Game+ Setup screen.
async function openNgSetup(n, replacing = null) {
  if (!ngFlow || n === ngFlow.parentSlot) return false;
  try {
    const data = await slots.load(ngFlow.parentSlot);
    if (!data) throw new Error('The finished run would not load.');
    const parent = new Team({ bus: { on() {}, emit() {} }, seed: 'ngplus-parent' });
    parent.load(data);
    if (!parent.ending.reached) throw new Error('New Game+ starts after the Year-16 ending.');
    const offer = { ...offerFrom(parent), parentSlot: ngFlow.parentSlot };
    await accountChain;
    await team.secrets.loadAccount();
    await team.ending.loadAccount();
    Object.assign(ngFlow, { parent, slot: n, replacing, offer, choices: null });
    router.go('ngplus', { offer, slot: n, replacing, tokens: team.prestigeTokens });
    return true;
  } catch (err) {
    debug.log(`New Game+ setup failed: ${err.message}`);
    dialog.show({ title: 'New Game+ can’t start', body: err.message, buttons: [{ id: 'ok', label: 'OK', accent: COL.progress }] });
    return false;
  }
}
function confirmDelete(n, s) {
  const name = s.summary?.teamName ?? `Slot ${n}`;
  dialog.confirm({
    title: `Delete ${name}?`,
    body: `Slot ${n} and all of this team's progress will be gone for good.`,
    yes: 'Delete',
    danger: true,
    onYes: async () => {
      if (activeSlot === n) activeSlot = null;
      await slots.remove(n);
      await refreshSlots();
      debug.log(`slot ${n} deleted`);
    },
  });
}
function confirmReplace(n, s) {
  const name = s.summary?.teamName ?? `Slot ${n}`;
  dialog.confirm({
    title: `Replace ${name}?`,
    body: `Your new team will go in slot ${n}. ${name} and all its progress will be deleted when you start.`,
    yes: 'Replace',
    danger: true,
    onYes: () => {
      if (slotsScreen.mode === 'ngplus') return openNgSetup(n, name); // Milestone 28
      setupFrom = 'slots';
      router.go('setup', { slot: n, replacing: name });
    },
  });
}
// (Milestone 29: the old "How to play" box is the Help archive's list now — every page, "Starting out" first.)
const showHelp = () => openHelp(null);
// Milestone 29: the main menu's New Game+ — one finished run starts straight away; several: pick one on the slot screen.
function menuNgPlus() {
  const ended = slotList.filter((s) => !s.empty && !s.error && s.summary?.ended);
  if (ended.length === 1) return startNgPlus(ended[0].n);
  router.go('slots', { mode: 'load' });
}
// Milestone 29: the main menu's Records — what this device has earned (the account: achievements, the best on this
// device, the Hall of Runs), with no team open.
async function menuRecords() {
  await accountChain;
  await team.achievements.loadAccount();
  openMenu('mainRecords');
}
menus.register('mainRecords', () => {
  const A = team.achievements;
  const got = A.rules.filter((r) => A.engine.account.history[r.id]);
  const bests = A.records().filter((d) => !d.key && !d.prestige).map((d) => ({ d, v: A.deviceRecords.get(d.id)?.value ?? null })).filter((x) => x.v != null && x.v !== 0);
  return {
    title: MAIN_MENU_TEXT.records,
    subtitle: MAIN_MENU_TEXT.recordsLine,
    art: 'race_reward_08',
    accent: COL.progress,
    sections: [
      { columns: 1, buttons: [{ id: 'mainHall', label: 'Hall of Runs', sub: 'Every finished run on this device', icon: 'race_reward_08', accent: COL.progress, onTap: () => (sheet.close(), goHall()) }] },
      { title: `Achievements · ${got.length} of ${A.rules.length}`, columns: 2, buttons: A.rules.map((r) => {
        const h = A.engine.account.history[r.id]?.first;
        return { id: `mach_${r.id}`, label: `${h ? '✓ ' : ''}${r.name}`, sub: r.recipe, icon: r.icon, accent: h ? COL.good : COL.outline, onTap: () => {} };
      }) },
      { title: 'Best on this device', lines: bests.length ? bests.map((x) => ({ text: x.d.label, right: typeof x.v === 'number' ? x.v.toLocaleString('en-US') : String(x.v) })) : [{ text: EMPTY_TEXT.races, color: COL.textMuted }] },
    ],
  };
});
// Credits sit over the screen like Help (nothing under them is reset); Back closes them.
let creditsOpen = false;
function goCredits() {
  sheet.close();
  closeHelp();
  creditsScreen.enter({ from: router.currentName });
  creditsOpen = true;
}
const closeCredits = () => (creditsOpen = false);
router.layers.unshift({
  get active() {
    return creditsOpen && !dialog.active;
  },
  handleInput: (hook, p) => {
    creditsScreen[hook]?.(p);
    return true;
  },
});
function showLegal() {
  dialog.show({ title: SETTINGS_TEXT.legal, body: SETTINGS_TEXT.legalBody, buttons: [{ id: 'ok', label: 'OK', accent: COL.progress }] });
}
// Milestone 29: a failed save says so and tries again by itself (core/Autosave; the toast at most every 20 s).
let saveRetry = null;
let saveToastAt = -1e9;
bus.on('autosave:failed', () => {
  if (!teamReady) return;
  const now = performance.now();
  if (now - saveToastAt > SAVE_TEXT.quietMs) {
    saveToastAt = now;
    toast(SAVE_TEXT.failed, SAVE_TEXT.retry);
  }
  if (!saveRetry) saveRetry = setTimeout(() => {
    saveRetry = null;
    autosave.request('retry');
  }, SAVE_TEXT.retryMs);
});
// ?debug=1&slot=N: straight into slot N (a new default team there if it is empty; &founder= picks the founder).
async function debugOpenSlot(n) {
  const founderId = FOUNDERS.some((f) => f.id === PARAMS.get('founder')) ? PARAMS.get('founder') : DEFAULT_SETUP.founderId;
  if (slotAt(n) && !slotAt(n).empty && !slotAt(n).error) await playSlot(n);
  else await startNewTeam({ ...DEFAULT_SETUP, teamName: `Test Team ${n}`, founderId }, n);
}

// Test hook for automated checks (debug builds only).
const header = createMenuHeader({ layout, onHelp: () => openHelp() }); // Milestone 29: + Help on every menu screen
const menuScreen = createMainMenuScreen({
  renderer,
  layout,
  assets,
  slots: () => slotList,
  onContinue: (n) => playSlot(n),
  onNew: () => newGame(),
  onLoad: () => router.go('slots', { mode: 'load' }),
  onHelp: showHelp,
  onSettings: () => openSettings(), // Milestone 25b
  onNgPlus: () => menuNgPlus(), // Milestone 29: the rest of bible §7's main menu
  onRecords: () => menuRecords(),
  onCredits: () => goCredits(),
});
const creditsScreen = createCreditsScreen({ layout, assets, header: createMenuHeader({ layout }), onBack: () => back(), onLegal: () => showLegal() });
// The studio splash (style guide §7b): the Banx Gamex logo on every launch, then the loading screen (bible §7 Splash:
// load, save migration — the slots migrate as they are read — and the entitlement check, none until Milestone 31).
const splashScreen = createStudioSplash({
  renderer,
  assets,
  key: 'studio_logo_dark',
  prepare: () => assets.loadImage('studio_logo_dark', '../../art/brand/studio_logo_banx_gamex_dark.png'),
  onDone: () => router.go('boot'),
});
assets.register?.({ studio_logo_cutout: '../../art/brand/studio_logo_banx_gamex.png' });
const slotsScreen = createSlotsScreen({
  layout,
  assets,
  header,
  slots: () => slotList,
  onPlay: (n) => playSlot(n),
  onNewTeam: (n) => {
    if (slotsScreen.mode === 'ngplus') return openNgSetup(n); // Milestone 28
    setupFrom = 'slots';
    router.go('setup', { slot: n });
  },
  onReplace: confirmReplace,
  onDelete: confirmDelete,
  onBack: () => back(), // (Milestone 29: the on-screen ‹ is the phone's Back)
  onHall: () => goHall(), // Milestone 27
  onNgPlus: (n) => startNgPlus(n), // Milestone 28
});
// Milestone 27: the Year-16 ceremony, the Hall of Runs and the New Game+ stub.
function endCeremony(then) {
  team.ending.finishCeremony();
  team.save();
  then();
}
const ceremonyScreen = createCeremonyScreen({
  layout,
  assets,
  team,
  onContinue: () => endCeremony(() => router.go('garage')),
  onNgPlus: () => endCeremony(() => startNgPlus(activeSlot)), // Milestone 28
  onHelp: () => openHelp('ending'), // Milestone 29
  sfx,
  haptic,
  reduced: () => !!settings.get('reducedMotion'),
});
let hallList = [];
async function goHall() {
  await accountChain;
  hallList = slots ? ((await slots.loadAccount()).ending?.archive ?? []) : [];
  router.go('hall');
}
const hallScreen = createHallOfRunsScreen({ layout, header, archive: () => hallList, onBack: () => back() });
// Milestone 28: the New Game+ Setup screen goes back to the slot choice; Next goes on to the new-team setup.
function leaveNgPlus() {
  chooseNewGamePlusSlot(ngFlow?.parentSlot ?? null);
}
const ngPlusScreen = createNgPlusScreen({
  layout,
  assets,
  header,
  onNext: (choices) => {
    if (!ngFlow) return;
    ngFlow.choices = choices;
    setupFrom = 'ngplus';
    router.go('setup', { slot: ngFlow.slot, replacing: ngFlow.replacing, ngLevel: ngFlow.offer.level });
  },
  onBack: () => back(),
});
const setupScreen = createTeamSetupScreen({
  layout,
  assets,
  header,
  textPrompt,
  onStart: (setup, n) => {
    // Milestone 28: a New Game+ team is built from the carry package (the parent's save is only read)
    if (setupFrom === 'ngplus' && ngFlow?.parent && ngFlow.slot === n) {
      const carry = buildCarry(ngFlow.parent, ngFlow.choices ?? {}, { parentSlot: ngFlow.parentSlot, slot: n });
      ngFlow = null;
      setupFrom = 'menu';
      return startNewTeam(setup, n, carry);
    }
    return startNewTeam(setup, n);
  },
  onBack: () => router.go(setupFrom, setupFrom === 'slots' ? { mode: slotsScreen.mode } : {}),
});

if (debug.enabled) window.__rw = { menuHeader: header, helpScreen, openHelp, closeHelp, get helpOpen() { return helpOpen; }, get creditsOpen() { return creditsOpen; }, closeCredits, helpTopicFor, back, systemBack, get sheetNow() { return sheetNow; }, get sheetWay() { return sheetWay; }, sheetBack, pauseRace, resumeRace, creditsScreen, splashScreen, goCredits, menuRecords, menuNgPlus, refuse, get trail() { return trail; }, goSub, goStaff, goRoster, goBuilder, goCarGarage, goCar, goChampRound, enterChamp, ceremonyScreen, hallScreen, ngPlusScreen, startNgPlus, openNgSetup, get ngFlow() { return ngFlow; }, goHall, get hallList() { return hallList; }, hintLine, MENU_OPEN, openMenuRow, menuState, openSettings, syncMenuSlot, bottomItems, governor, lowFx, audio, haptics, openMenu, menus, comboRecords, slots: () => slots, get slotList() { return slotList; }, get activeSlot() { return activeSlot; }, dialog, textPrompt, menuScreen, slotsScreen, setupScreen, playSlot, startNewTeam, goMainMenu, refreshSlots, newGame, chooseNewGamePlusSlot, renderer, layout, input, loop, router, assets, sheet, garage, clock, team, autosave, rosterScreen, staffScreen, carBuilderScreen, carResultScreen, carGarageScreen, carDebug, toasts, raceIntroScreen, raceScreen, raceResultScreen, weekendScreen, goTestRace, goWeekend, leaveRace, settings, screenBar, badges, cycleDebugBadge, researchScreen, get events() { return team.events; }, eventCard, goResearch, recruitScreen, trainScreen, goRecruit, goTrain, checkStaffData, drillScreen, medalsScreen, drillRecords, taps: [] };

router
  .register('splash', splashScreen) // Milestone 29
  .register('boot', bootScreen)
  .register('menu', menuScreen)
  .register('slots', slotsScreen)
  .register('ceremony', ceremonyScreen) // Milestone 27
  .register('hall', hallScreen)
  .register('ngplus', ngPlusScreen)
  .register('setup', setupScreen)
  .register('garage', garage)
  .register('roster', rosterScreen)
  .register('staff', staffScreen)
  .register('carBuilder', carBuilderScreen)
  .register('car', carResultScreen)
  .register('cars', carGarageScreen)
  .register('weekend', weekendScreen)
  .register('raceIntro', raceIntroScreen)
  .register('race', raceScreen)
  .register('raceResult', raceResultScreen)
  .register('research', researchScreen)
  .register('recruit', recruitScreen)
  .register('train', trainScreen)
  .register('drill', drillScreen)
  .register('medals', medalsScreen)
  .register('test', createTestScreen({ renderer, layout, assets, openSheet: () => sheet.open(testSheet), onTapLogged: (p) => window.__rw?.taps.push({ x: p.x, y: p.y }) }))
  .register('route', createRouteTestScreen({ renderer, layout, onBack: back }));
router.go('splash');
loop.start();
