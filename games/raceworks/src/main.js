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
// Milestone 24: the Secret Condition Engine (src/systems/secrets.js). The published game has no rules yet (M25 adds the
// 34); ?debug=1 loads the four synthetic test rules, and the Rumour Archive / Inbox get the why-false inspector.
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
import { Team, describeSave, DEFAULT_SETUP, SAVE_MIGRATIONS } from './app/Team.js';
import { SAVE_VERSION } from '../data/balance.js';
import { SLOT_COUNT, FOUNDERS } from '../data/setup.js';
import { createMainMenuScreen } from './screens/MainMenuScreen.js';
import { createSlotsScreen } from './screens/SlotsScreen.js';
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
import { SYNTHETIC_RULES } from '../data/secrets.js'; // Milestone 24 (?debug=1 only)
import { createRecruitScreen } from './screens/RecruitScreen.js';
import { createTrainScreen } from './screens/TrainScreen.js';
import { checkStaffData } from './systems/staffCheck.js';
import { createDrillScreen } from './screens/DrillScreen.js';
import { createMedalsScreen } from './screens/MedalsScreen.js';
import { createDrillRecords } from './systems/drills.js';
import { createComboRecords } from './systems/combos.js'; // Milestone 22
import { DRILL_SETTINGS } from '../data/drills.js';
const COL = THEME.color;

const W = 1080;
const BASE_H = 1920; // 9:16; taller phones grow the height (see Renderer)
const MAX_H = 2640; // up to 9:22 fills edge to edge; taller still gets thin bars top and bottom
const START_SCREEN = new URLSearchParams(window.location.search).get('screen') === 'test' ? 'test' : 'menu';
const MENU_SCREENS = ['slots', 'setup']; // screens off the main menu: Back returns towards it
const TEST_SCREENS = ['test', 'route']; // the Milestone 0 screens: pause button, full debug box
const GAME_SCREENS = ['garage', 'roster', 'staff', 'carBuilder', 'car', 'cars', 'weekend', 'raceIntro', 'race', 'raceResult', 'research', 'recruit', 'train', 'medals'];
const RACE_SCREENS = ['weekend', 'raceIntro', 'race', 'raceResult']; // Milestone 6: the garage calendar waits while a race is on // the game's screens: P pauses the game clock here
const CALENDAR_WAITS = [...RACE_SCREENS, 'drill']; // Milestone 14: … and while a drill is played (its course must not end mid-drill)
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
const layout = new UiLayout(renderer);
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
  },
});
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
    if (pendingCar && (pendingCar.wait -= dt) <= 0) {
      const { number } = pendingCar;
      pendingCar = null;
      goSub('car', { number, fresh: true });
    }
    router.update(dt);
    sheet.update(dt);
    dialog.update(dt);
    // Milestone 23: one event card at a time (nothing on the race screens; a card waits for a dialog or a car reveal)
    if (teamReady) team.events.frame(dt, { screen: router.currentName, busy: dialog.active || textPrompt.active || !!pendingCar, reduced: !!settings.get('reducedMotion') });
    eventCard.update(dt);
    for (const t of toasts) t.age += dt;
    while (toasts.length && toasts[0].age > TOAST_LIFE) toasts.shift();
    backNav.sync();
  },
  render: (alpha) => {
    const ctx = renderer.begin(COL.bg);
    router.render(ctx, alpha);
    sheet.render(ctx);
    const onGame = GAME_SCREENS.includes(router.currentName);
    const tb = topBarRect(layout);
    // Milestone 23: the minor event strip (research done / a combo keep Milestone 11's gold card), then the game's own
    // short notes under it, then a major event card over everything but a dialog
    const lane = onGame && teamReady ? drawEventToast(ctx, { x: tb.x + 24, y: tb.y + tb.h + 16, w: tb.w - 48 }) : 0;
    if (toasts.length && onGame) drawToasts(ctx, toasts, { x: tb.x + 40, y: tb.y + tb.h + 16 + (lane ? lane + 16 : 0), w: tb.w - 80, life: TOAST_LIFE });
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
const team = new Team({ bus, seed: 'raceworks', secretRules: debug.enabled ? SYNTHETIC_RULES : [] });
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
const settings = new Settings({ key: 'raceworks:settings', defaults: { raceCamera: 'overview', ...DRILL_SETTINGS } });
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
const menus = createGarageMenus({ garage: () => garage, team, assets, open: openMenu, close: () => sheet.close(), goRoster, goStaff, goBuilder, goCarGarage, goMainMenu: () => goMainMenu(), debug: debug.enabled ? carDebug : null, toast: (t, b) => toast(t, b), goWeekend: () => goWeekend(), goTestRace: debug.enabled ? () => goTestRace() : null, goRaceResult: (index) => goSub('raceResult', { index }), goResearch: () => goResearch(), goRecruit: () => goRecruit(), goTrain: (id) => goTrain(id), debugTracks: debug.enabled ? debugTracks : null, goChampRound: () => goChampRound(), enterChamp: (id) => enterChamp(id) });

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
  onHelp: () => openMenu('help'),
  inboxCount: () => (teamReady ? team.events.unread : 0), // Milestone 23
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
  onHelp: () => fromScreen('help'),
  inboxCount: () => (teamReady ? team.events.unread : 0), // Milestone 23
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
  if (dialog.active) dialog.onBack();
  else if (teamReady && eventCard.active) eventCard.onBack(); // Milestone 23: a question must be answered; news closes
  else if (textPrompt.active) textPrompt.close();
  else if (sheet.active) sheet.close();
  else if (router.currentName === 'setup') {
    if (!setupScreen.onBack()) router.go(setupFrom, setupFrom === 'slots' ? { mode: slotsScreen.mode } : {});
  } else if (router.currentName === 'slots') router.go('menu');
  else if (router.currentName === 'garage' && garage.buildMode) garage.setBuildMode(false);
  else if (router.currentName === 'race') {
    if (!raceScreen.onBack()) leaveRace(); // Milestone 18: during a Drive Stint, Back hands back first
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
  else return false;
  return true;
}
const backNav = createBackNav({
  depth: () => (dialog.active || (teamReady && eventCard.active) || MENU_SCREENS.includes(router.currentName) || sheet.active || router.currentName === 'route' || SUB_SCREENS[router.currentName] || (router.currentName === 'garage' && garage.buildMode) ? 1 : 0),
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

const garage = createGarageScreen({ renderer, layout, assets, bus, sheet, openMenu, clock, team, topBar, bottomBar, debug });
const rosterScreen = createRosterScreen({ layout, assets, team, garage, topBar: screenBar, goStaff, goRecruit: () => goRecruit(), goTrain: () => goTrain() });
const staffScreen = createStaffDetailScreen({ layout, assets, team, garage, topBar: screenBar, debugEnabled: debug.enabled, goTrain: (id) => goTrain(id), confirm: (o) => dialog.confirm(o), toast: (a, b) => toast(a, b), afterLetGo: () => back() });
const recruitScreen = createRecruitScreen({ layout, assets, team, topBar: screenBar, toast: (a, b) => toast(a, b), goStaff, debugEnabled: debug.enabled }); // Milestone 12 (Milestone 13: ?debug=1 spawns on the Special tab)
const trainScreen = createTrainScreen({ layout, assets, team, topBar: screenBar, toast: (a, b) => toast(a, b), goDrill: (p) => goSub('drill', p), goMedals: () => goSub('medals') }); // Milestone 12 (14: drills)
// Milestone 14: a drill, and the medal history. A finished drill returns to where it was opened from.
const drillScreen = createDrillScreen({ renderer, layout, assets, team, bus, settings, records: drillRecords, debugEnabled: debug.enabled, toast: (a, b) => toast(a, b), onDone: (p, result) => {
  back();
  // Milestone 15: the Qualifying Drive lap returns to the weekend with the grid set
  if (p.qualiLap && result?.quali) toast(`Qualified P${result.quali.rows.find((r) => r.isPlayer).pos}`, result.drive ? 'With your Drive lap' : 'Simulated after the hand back');
  if (result?.medal) toast(`${result.medal[0].toUpperCase()}${result.medal.slice(1)} medal!`, result.pct ? `+${result.pct}% on this course` : 'Saved in your medal history');
  team.save();
} });
const medalsScreen = createMedalsScreen({ layout, assets, topBar: screenBar, records: drillRecords, settings, debugEnabled: debug.enabled, goPractice: (drillId) => goSub('drill', { drillId, practice: true }), toast: (a, b) => toast(a, b) });
// The car screens (Milestone 4): the builder, one finished car, the Car Garage.
const carBuilderScreen = createCarBuilderScreen({
  layout,
  assets,
  team,
  topBar: screenBar,
  debugEnabled: debug.enabled, // ?debug=1: unlock-all and a random legal car (Milestone 9)
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
const raceScreen = createRaceScreen({ renderer, layout, assets, team, bus, settings, onFinished: raceFinished, onLeave: () => leaveRace(), toast: (a, b) => toast(a, b), debug: debug.enabled }); // Milestone 16: + the debug tyre call
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
  garage.loadTeam();
  teamReady = true;
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
    team.load(data);
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
async function startNewTeam(setup, n) {
  await leaveTeam();
  await slots.remove(n);
  team.useSlot(slots.slot(n));
  await accountChain;
  await team.secrets.loadAccount(); // Milestone 24
  team.newGame(setup);
  debug.log(`new team in slot ${n}: ${team.setup.teamName}, founder ${team.founder.id}`);
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
// Milestone 28 hook (spec §8): New Game+ must ask for a slot and never write over the parent run. Call this from the
// NG+ flow: the slot screen locks the parent slot; a full slot asks before it is replaced.
function chooseNewGamePlusSlot(parentSlot) {
  router.go('slots', { mode: 'ngplus', parent: parentSlot });
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
      setupFrom = 'slots';
      router.go('setup', { slot: n, replacing: name });
    },
  });
}
function showHelp() {
  dialog.show({
    title: 'How to play',
    body: 'Run a racing team from your garage. Tap a station or a person to see what they do, start a car at the Pit Bay and watch it being built, then take it to a race weekend from Compete (your crew runs the race on Auto — take over any time). Money shows every Credit in and out. Your team saves by itself, and there are four save slots, so you can run four teams at once.',
    buttons: [{ id: 'ok', label: 'Got it', accent: COL.progress }],
  });
}
// ?debug=1&slot=N: straight into slot N (a new default team there if it is empty; &founder= picks the founder).
async function debugOpenSlot(n) {
  const founderId = FOUNDERS.some((f) => f.id === PARAMS.get('founder')) ? PARAMS.get('founder') : DEFAULT_SETUP.founderId;
  if (slotAt(n) && !slotAt(n).empty && !slotAt(n).error) await playSlot(n);
  else await startNewTeam({ ...DEFAULT_SETUP, teamName: `Test Team ${n}`, founderId }, n);
}

// Test hook for automated checks (debug builds only).
const header = createMenuHeader({ layout });
const menuScreen = createMainMenuScreen({
  renderer,
  layout,
  assets,
  slots: () => slotList,
  onContinue: (n) => playSlot(n),
  onNew: () => newGame(),
  onLoad: () => router.go('slots', { mode: 'load' }),
  onHelp: showHelp,
});
const slotsScreen = createSlotsScreen({
  layout,
  assets,
  header,
  slots: () => slotList,
  onPlay: (n) => playSlot(n),
  onNewTeam: (n) => {
    setupFrom = 'slots';
    router.go('setup', { slot: n });
  },
  onReplace: confirmReplace,
  onDelete: confirmDelete,
  onBack: () => router.go('menu'),
});
const setupScreen = createTeamSetupScreen({
  layout,
  assets,
  header,
  textPrompt,
  onStart: (setup, n) => startNewTeam(setup, n),
  onBack: () => router.go(setupFrom, setupFrom === 'slots' ? { mode: slotsScreen.mode } : {}),
});

if (debug.enabled) window.__rw = { comboRecords, slots: () => slots, get slotList() { return slotList; }, get activeSlot() { return activeSlot; }, dialog, textPrompt, menuScreen, slotsScreen, setupScreen, playSlot, startNewTeam, goMainMenu, refreshSlots, newGame, chooseNewGamePlusSlot, renderer, layout, input, loop, router, assets, sheet, garage, clock, team, autosave, rosterScreen, staffScreen, carBuilderScreen, carResultScreen, carGarageScreen, carDebug, toasts, raceIntroScreen, raceScreen, raceResultScreen, weekendScreen, goTestRace, goWeekend, leaveRace, settings, screenBar, badges, cycleDebugBadge, researchScreen, get events() { return team.events; }, eventCard, goResearch, recruitScreen, trainScreen, goRecruit, goTrain, checkStaffData, drillScreen, medalsScreen, drillRecords, taps: [] };

router
  .register('boot', bootScreen)
  .register('menu', menuScreen)
  .register('slots', slotsScreen)
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
router.go('boot');
loop.start();
