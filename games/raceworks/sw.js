// RACEWORKS â€” service worker (offline cache for the installed web app).
//
// NETWORK FIRST: when the phone is online it always fetches the newest files
// (so a new build shows up on the next open) and keeps a copy; when offline
// it plays from that copy.
//
// VERSION is stamped automatically by publish.ps1 on every publish. A new
// version makes the phone install this worker fresh and throw away old copies.
//
// This game imports the shared series engine from ../../core/, which sits
// outside this folder. Requests from the game page still pass through this
// worker, so the engine files are cached too.
const VERSION = '20260926-194815';
const CACHE = 'raceworks-' + VERSION;

// The page itself + manifest + icons, so the app opens offline straight away.
const CORE = ['./', './index.html', './manifest.webmanifest', './styles/app.css',
  './assets/branding/pwa/icon-192.png', './assets/branding/pwa/icon-512.png'];
// Every code file (game + shared engine) â€” filled in by publish.ps1 so the whole
// game's code is saved on the very first visit. Art is cached the first time the
// game loads it. (Empty when run locally.)
const PRECACHE = ['./src/app/backNav.js', './src/screens/HomeScreen.js', './src/screens/RouteTestScreen.js', './src/main.js', './data/assets.js', './styles/app.css', '../../core/ui/BottomSheet.js', '../../core/ui/Button.js', '../../core/ui/CoachMark.js', '../../core/ui/ContextCard.js', '../../core/ui/CreditsRoll.js', '../../core/ui/ScrollList.js', '../../core/ui/ScrollPanel.js', '../../core/ui/StaffCard.js', '../../core/ui/Toast.js', '../../core/AccountRecords.js', '../../core/AchievementSystem.js', '../../core/Agent.js', '../../core/AssetManager.js', '../../core/AssignmentSystem.js', '../../core/AudioManager.js', '../../core/CachedLayer.js', '../../core/Camera.js', '../../core/CampaignEnding.js', '../../core/CareerRecords.js', '../../core/CharacterMotion.js', '../../core/Clock.js', '../../core/CompanyRank.js', '../../core/CompetitionPrereqs.js', '../../core/CompetitionSystem.js', '../../core/Completion.js', '../../core/ContractSystem.js', '../../core/DataValidator.js', '../../core/DebugOverlay.js', '../../core/DiscoveryArchive.js', '../../core/EconomySystem.js', '../../core/EventBus.js', '../../core/EventSystem.js', '../../core/FacilitySystem.js', '../../core/FixedStepLoop.js', '../../core/FloatFeed.js', '../../core/GradeEngine.js', '../../core/Grid.js', '../../core/GuideSystem.js', '../../core/Input.js', '../../core/IsoProjection.js', '../../core/JobHistory.js', '../../core/MajorFeedback.js', '../../core/MarketSystem.js', '../../core/NgPlusSystem.js', '../../core/NotificationSystem.js', '../../core/Pathing.js', '../../core/PinchZoom.js', '../../core/ProductSystem.js', '../../core/ProjectSystem.js', '../../core/Rankings.js', '../../core/RecruitmentSystem.js', '../../core/Renderer.js', '../../core/ReputationSystem.js', '../../core/ResearchSystem.js', '../../core/ReviewText.js', '../../core/RivalSystem.js', '../../core/Rng.js', '../../core/RunArchive.js', '../../core/SaveManager.js', '../../core/ScreenRouter.js', '../../core/SecretEngine.js', '../../core/Selection.js', '../../core/SponsorSystem.js', '../../core/SpriteCache.js', '../../core/StaffModel.js', '../../core/StaffSystem.js', '../../core/StorageAdapter.js', '../../core/StoreStub.js', '../../core/SynergyEvaluator.js', '../../core/Theme.js', '../../core/TrainingSystem.js', '../../core/TrophyCase.js', '../../core/UiLayout.js', '../../core/UnlockActions.js', '../../core/VfxSystem.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // One file failing must not block the rest.
      .then((c) => Promise.allSettled(CORE.concat(PRECACHE).map((u) =>
        c.add(new Request(u, { cache: 'reload' })))))
      .catch(() => { /* offline during install: runtime caching will fill in */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('raceworks-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
