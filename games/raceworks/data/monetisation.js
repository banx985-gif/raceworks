// RACEWORKS monetisation (Milestone 31, card docs/M31_MONETISATION_DEBUG.md, series money rule 9) — plain data for the
// shared core/AdService, core/CommerceService and core/EntitlementService (src/systems/monetisation.js wires them).
// The whole money model: Remove Ads (one-time), fixed Racing Token packs, optional rewarded ads, and rare interstitials
// at natural stopping points. No VIP, no subscription, no "while active" anything, no paid timers, no random prizes,
// nothing that can only be bought. Every number is a PLACEHOLDER (DECISIONS, 25 Oct 2026).
// Product keys never change (they are what the stores will know the items by). Prices come from the store, never from
// here (the pretend store's own catalogue is DEBUG_STORE_CATALOGUE below, debug builds only).
import { REFRESH_SERVICES } from './recruitment.js';

export const MONETISATION_ART = {
  store: 'race_reward_02',
  removeAds: 'race_ui_13',
  tokens: 'race_reward_02',
  restore: 'race_ui_01',
  ad: 'race_reward_08',
  palette: 'race_brand_02',
  warning: 'race_ui_28',
};

// kind: nonConsumable (bought once, kept for good, comes back on Restore) · consumable (exactly the stated amount; never
// restored). No subscription product exists.
export const PRODUCTS = {
  raceworks_remove_ads: { key: 'raceworks_remove_ads', kind: 'nonConsumable', entitlement: 'removeAds', name: 'Remove Ads', icon: MONETISATION_ART.removeAds, blurb: 'No more full-screen ads between screens — for good. "Watch ad" rewards stay, if you want them.' },
  raceworks_tokens_small: { key: 'raceworks_tokens_small', kind: 'consumable', grant: { currency: 'tokens', amount: 20 }, name: 'Racing Tokens — pouch', icon: MONETISATION_ART.tokens, blurb: 'Exactly 20 Racing Tokens.' },
  raceworks_tokens_medium: { key: 'raceworks_tokens_medium', kind: 'consumable', grant: { currency: 'tokens', amount: 60 }, name: 'Racing Tokens — crate', icon: MONETISATION_ART.tokens, blurb: 'Exactly 60 Racing Tokens.' },
  raceworks_tokens_large: { key: 'raceworks_tokens_large', kind: 'consumable', grant: { currency: 'tokens', amount: 150 }, name: 'Racing Tokens — trophy case', icon: MONETISATION_ART.tokens, blurb: 'Exactly 150 Racing Tokens.' },
};
export const REMOVE_ADS = 'raceworks_remove_ads';
export const TOKEN_PACKS = ['raceworks_tokens_small', 'raceworks_tokens_medium', 'raceworks_tokens_large'];

// The pretend store's catalogue (debug builds only) — stands in for what Google Play will send. PLACEHOLDER prices.
export const DEBUG_STORE_CATALOGUE = {
  raceworks_remove_ads: { price: '$2.99 (test)', title: 'Remove Ads' },
  raceworks_tokens_small: { price: '$0.99 (test)', title: '20 Racing Tokens' },
  raceworks_tokens_medium: { price: '$2.49 (test)', title: '60 Racing Tokens' },
  raceworks_tokens_large: { price: '$4.99 (test)', title: '150 Racing Tokens' },
};
export const DEBUG_STORE_KEY = 'raceworks:debugStore'; // the pretend store's records (this device, debug only)
export const AD_CONSENT_KEY = 'raceworks:adConsent'; // core/AdConsent (the real question is Milestone 37's)

// The four rewarded placements (card: recruitment refresh, +20% on one ordinary contract, one practice Setup Knowledge
// boost, a small Racing Token reward). Each is capped once a real day (limit.per 'realHours', kept with the account).
// None shortens a timer (bible §39's "shorten one training by 20%" is dropped) and none can touch a secret, a god or an
// achievement: a boosted race is left out of the secret / achievement race facts, ad Credits and tokens are kept in the
// 'ad' ledger category the gods' and secrets' Credits checks leave out.
export const REWARDED = [
  { id: 'recruitRefresh', name: 'Fresh candidates', where: 'Hire', effect: { refresh: 'ordinary' }, limit: { per: 'realHours', hours: 24, count: 1 }, blurb: 'Redraw this board (same people who could turn up anyway)' },
  { id: 'contractBonus', name: 'Contract bonus', where: 'Money → Contracts', effect: { creditsPct: 20 }, windowDays: 28, limit: { per: 'realHours', hours: 24, count: 1 }, blurb: '+20% of an ordinary contract’s Credits' },
  { id: 'practiceBoost', name: 'Practice data', where: 'Race weekend → Practice', effect: { knowledge: 10 }, limit: { per: 'realHours', hours: 24, count: 1 }, blurb: '+10 Setup Knowledge this weekend (this race won’t count for achievements)' },
  { id: 'tokenGift', name: 'Racing Tokens', where: 'Store', effect: { tokens: 3 }, limit: { per: 'realHours', hours: 24, count: 1 }, blurb: '+3 Racing Tokens' },
];
export const REWARDED_BY_ID = Object.fromEntries(REWARDED.map((r) => [r.id, r]));

// Interstitials (core/AdService caps; every one enforced in its interstitialBlock): only when leaving a finished race
// result or the Year-16 ceremony; at most one per `resultsBetween` results and not within minGapMin real minutes; never
// before the run's first race result; suppressed by Remove Ads; only with ad consent given.
export const INTERSTITIAL_CAPS = {
  firstInstallQuietMin: 10,
  minGapMin: 10,
  maxPerHour: 3,
  afterResumeQuietSec: 60,
  afterPurchaseQuietMin: 10,
  breakPoints: ['raceResult', 'ceremony'],
  resultsBetween: 3,
};
export const INTERSTITIAL_WORDS = {
  firstResult: 'before the first race result of this run',
  fewResults: 'fewer than 3 results since the last one',
  noConsent: 'no ad consent yet',
};

// What Racing Tokens may buy: convenience and looks only (card). Every token spend in the game goes through one of
// these; anything else is refused (src/systems/monetisation.js spendTokens). Never time (no training / research / build
// speed-up), never power or prestige (no secret, god, part, facility, championship, staff tier, item, Prestige Token or
// stat).
export const TOKEN_SINKS = {
  recruitRefresh: { cost: REFRESH_SERVICES.tokens.cost, name: 'Recruitment refresh' }, // (Milestone 12's)
  sponsorRefresh: { cost: 8, name: 'Extra sponsor offers' },
  palette: { cost: 40, name: 'Livery palette' },
};
export const TOKEN_NEVER = ['training speed-up', 'research speed-up', 'build speed-up', 'secret', 'god', 'part', 'facility', 'championship', 'staff tier', 'item', 'Prestige Token', 'stat'];

// Two extra team colours, bought with Racing Tokens (looks only). Owned for the run they are bought in.
export const TOKEN_PALETTES = [
  { id: 'chrome', name: 'Silver Streak', main: '#9AA6B2', dark: '#56616C', light: '#D8352A', token: true },
  { id: 'pink', name: 'Neon Pink', main: '#E8479A', dark: '#9B2463', light: '#2A241F', token: true },
];

// Played-in, not bought (card: what the old VIP had). Support Crew: a sixth build slot whose worker gives 35% of their
// work (bible §10.7), for everyone from Rank A. The second research queue opens at Rank B. Secrets and gods never assume
// either exists.
export const EARNED_UNLOCKS = {
  supportCrew: { rank: 'A', pct: 35, name: 'Support Crew slot', line: 'A sixth person on every build, at 35% of their work' },
  secondQueue: { rank: 'B', name: 'Second research queue', line: 'Research two topics at once' },
};

// The words (plain).
export const STORE_TEXT = {
  title: 'Store',
  line: 'Optional extras',
  intro: 'Everything here is optional — the whole game can be played without paying.',
  never: 'Nothing here buys wins, prestige, secrets, gods, items or achievements, and nothing here speeds up a timer.',
  pretend: 'Test store: nothing is charged and no real ads play.',
  unavailable: 'The store isn’t on this version yet — it arrives with the phone app.',
  noPrice: 'Price from the store',
  loading: 'Asking the store for prices…',
  buy: 'Buy',
  owned: 'Owned ✓',
  buying: 'Buying…',
  restore: 'Restore Purchases',
  restoreSub: 'Brings back Remove Ads on this account (Racing Tokens are used up, so they never come back)',
  restoring: 'Restoring…',
  noLootBoxes: 'No loot boxes: every pack always gives exactly the amount shown.',
  tokensHeading: 'Racing Tokens',
  tokensUse: 'Racing Tokens buy extra recruitment refreshes, extra sponsor offers and livery palettes — never speed-ups or power.',
  spendHeading: 'Spend Racing Tokens',
  heldTokens: (n) => `${n} Racing Tokens bought before this team was opened were added.`,
  paletteHeading: 'Team colour',
  debug: 'Test store controls',
  debugSub: 'Debug: next ad / purchase outcome, offline, replay, consent',
};
export const STORE_MESSAGES = {
  unavailable: 'The store is not available on this version. Nothing was charged.',
  offline: 'Could not reach the store. Check your connection and try again. Nothing was charged.',
  cancelled: 'Purchase cancelled. Nothing was charged.',
  failed: 'The purchase did not go through. Nothing was charged.',
  busy: 'Please wait — the last purchase is still finishing.',
  purchased: 'Thank you! Your purchase is ready.',
  duplicate: 'That purchase was already added — nothing more to add.',
  restored: 'Purchases restored.',
  nothingToRestore: 'No purchases to restore on this account.',
};
export const AD_TEXT = {
  tag: 'Watch ad',
  unavailable: 'No ad available right now',
  cancelled: 'Ad closed early — no reward this time. Nothing changed.',
  failed: 'The ad did not load — nothing changed. Try again later.',
  offline: 'No ad available right now — nothing changed.',
  busy: 'An ad is already playing',
  playing: 'Test ad playing…',
  playingBody: 'A stand-in for a real ad. Watch it to the end for the reward, or close it early (no reward).',
  watch: 'Watch to the end',
  close: 'Close early',
  interstitialTitle: 'Test advert',
  interstitialBody: 'A stand-in for a full-screen ad between screens. Remove Ads turns these off for good.',
  interstitialClose: 'Close ✕',
};
export const SPLASH_WORDS = {
  checking: 'Checking purchases…',
  done: (removeAds) => (removeAds ? 'Purchases: Remove Ads ✓' : 'Purchases: checked'),
  none: 'Purchases: no store on this version',
};
