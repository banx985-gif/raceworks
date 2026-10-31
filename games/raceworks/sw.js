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
const VERSION = '20261031-174005';
const CACHE = 'raceworks-' + VERSION;

// The page itself + manifest + icons, so the app opens offline straight away.
const CORE = ['./', './index.html', './manifest.webmanifest', './styles/app.css',
  './assets/branding/pwa/icon-192.png', './assets/branding/pwa/icon-512.png'];
// Every code file (game + shared engine) â€” filled in by publish.ps1 so the whole
// game's code is saved on the very first visit. Art is cached the first time the
// game loads it. (Empty when run locally.)
const PRECACHE = ['./app.js', './styles/app.css', './assets/img_opt/studio/studio_logo_dark.webp', './assets/img_opt/facilities/facility_f01.webp', './assets/img_opt/facilities/facility_f02.webp', './assets/img_opt/facilities/facility_f03.webp', './assets/img_opt/facilities/facility_f05.webp', './assets/img_opt/facilities/facility_f10.webp', './assets/img_opt/facilities/facility_f11.webp', './assets/img_opt/facilities/facility_f12.webp', './assets/img_opt/facilities/facility_f13.webp', './assets/img_opt/facilities/facility_f26.webp', './assets/img_opt/props/race_prop_01.webp', './assets/img_opt/props/race_prop_04.webp', './assets/img_opt/props/race_prop_06.webp', './assets/img_opt/props/race_prop_08.webp', './assets/img_opt/props/race_prop_09.webp', './assets/img_opt/props/race_prop_11.webp', './assets/img_opt/staff/staff_drv01.webp', './assets/img_opt/staff/staff_mec01.webp', './assets/img_opt/staff/staff_eng01.webp', './assets/img_opt/staff/staff_aer01.webp', './assets/img_opt/staff/staff_str01.webp', './assets/img_opt/badges/badge_role_01.webp', './assets/img_opt/badges/badge_role_02.webp', './assets/img_opt/badges/badge_role_03.webp', './assets/img_opt/badges/badge_role_04.webp', './assets/img_opt/badges/badge_role_05.webp', './assets/img_opt/cars/car_v01_showcase.webp', './assets/img_opt/parts/part_pu01.webp', './assets/img_opt/parts/part_tr01.webp', './assets/img_opt/parts/part_ch01.webp', './assets/img_opt/parts/part_ae01.webp', './assets/img_opt/parts/part_hb01.webp', './assets/img_opt/parts/part_el01.webp', './assets/img_opt/vfx/race_vfx_10.webp', './assets/img_opt/vfx/race_vfx_09.webp', './assets/img_opt/vfx/race_vfx_03.webp', './assets/img_opt/cars/car_v01_top.webp', './assets/img_opt/cars/car_v04_top.webp', './assets/img_opt/cars/car_v05_top.webp', './assets/img_opt/cars/car_v02_top.webp', './assets/img_opt/cars/car_v03_top.webp', './assets/img_opt/cars/car_v06_top.webp', './assets/img_opt/tracks/track_t01.webp', './assets/img_opt/cars/car_v04_showcase.webp', './assets/img_opt/cars/car_v05_showcase.webp', './assets/img_opt/cars/car_v02_showcase.webp', './assets/img_opt/cars/car_v03_showcase.webp', './assets/img_opt/cars/car_v06_showcase.webp', './assets/img_opt/vfx/race_vfx_05.webp', './assets/img_opt/vfx/race_vfx_01.webp', './assets/img_opt/vfx/race_vfx_02.webp', './assets/img_opt/vfx/race_vfx_06.webp', './assets/img_opt/vfx/race_vfx_04.webp', './assets/img_opt/vfx/race_vfx_07.webp', './assets/img_opt/vfx/race_vfx_11.webp', './assets/img_opt/vfx/race_vfx_08.webp', './assets/img_opt/vfx/race_vfx_12.webp', './assets/img_opt/cast/race_cast_gus.webp', './assets/img_opt/brand/race_brand_02.webp', './assets/img_opt/brand/race_brand_03.webp', './assets/img_opt/tyres/tyre_soft.webp', './assets/img_opt/tyres/tyre_medium.webp', './assets/img_opt/tyres/tyre_hard.webp', './assets/img_opt/tyres/tyre_inter.webp', './assets/img_opt/tyres/tyre_wet.webp', './assets/img_opt/ui/race_ui_06.webp', './assets/img_opt/ui/race_ui_07.webp', './assets/img_opt/ui/race_ui_08.webp', './assets/img_opt/ui/race_ui_09.webp', './assets/img_opt/ui/race_ui_10.webp', './assets/img_opt/ui/race_ui_11.webp', './assets/img_opt/ui/race_ui_12.webp', './assets/img_opt/ui/race_ui_16.webp', './assets/img_opt/ui/race_ui_17.webp', './assets/img_opt/ui/race_ui_18.webp', './assets/img_opt/ui/race_ui_20.webp', './assets/img_opt/ui/race_ui_21.webp', './assets/img_opt/ui/race_ui_24.webp', './assets/img_opt/ui/race_ui_29.webp', './assets/img_opt/ui/race_ui_30.webp', './assets/img_opt/ui/race_ui_01.webp', './assets/img_opt/ui/race_ui_02.webp', './assets/img_opt/ui/race_ui_03.webp', './assets/img_opt/ui/race_ui_04.webp', './assets/img_opt/ui/race_ui_05.webp', './assets/img_opt/rewards/race_reward_01.webp', './assets/img_opt/rewards/race_reward_02.webp', './assets/img_opt/rewards/race_reward_03.webp', './assets/img_opt/ui/race_ui_22.webp', './assets/img_opt/ui/race_ui_23.webp', './assets/img_opt/ui/race_ui_13.webp', './assets/img_opt/rewards/race_reward_04.webp', './assets/img_opt/ui/race_ui_27.webp', './assets/img_opt/ui/race_ui_28.webp', './assets/img_opt/rewards/race_reward_05.webp', './assets/img_opt/events/race_event_01.webp', './assets/img_opt/events/race_event_02.webp', './assets/img_opt/events/race_event_03.webp', './assets/img_opt/events/race_event_04.webp', './assets/img_opt/events/race_event_05.webp', './assets/img_opt/events/race_event_06.webp', './assets/img_opt/events/race_event_07.webp'];

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
