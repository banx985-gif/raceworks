// RACEWORKS monetisation (Milestone 31, docs/M31_MONETISATION_DEBUG.md, series money rule 9): the shared core/AdService,
// core/CommerceService and core/EntitlementService set up with data/monetisation.js, and what each rewarded placement,
// purchase and Racing Token spend does here. One per Team (team.monetisation); main.js gives it the account save, the
// provider (?debug=1 only: core/FakeStoreProvider — no real ads or store until Milestones 37 / 38) and AdConsent.
//   m.setAccount({ load, save }) · await m.loadAccount() · m.setProvider(p) · m.consent = core/AdConsent
//   m.removeAds                       owned (the only entitlement; no VIP / subscription exists)
//   m.placement(id, ctx) → { show, ok, label, sub }   await m.watch(id, ctx) → { ok, message }
//     ids: recruitRefresh { channel } · contractBonus { contractId } · practiceBoost · tokenGift
//   m.interstitialBlock(breakPoint) → reason | null   await m.breakPoint(breakPoint) → { shown, reason }
//   m.tokenBlock(sink) / m.spendTokens(sink, reason) / m.addTokens(n, reason, category) — the one Racing Token ledger
//   m.sponsorRefreshBlock() / m.sponsorRefresh() · m.palettes() / m.buyPalette(id) / m.setColour(id)
//   m.supportCrewOpen() (Rank A) · m.secondQueueOpen() (Rank B) — earned in play, never bought
//   await m.startup() (the Splash: re-delivered purchases, then a quiet store check) · m.commit()
//   serialize() / load(s) (the run block 'monetisation') · newGame()
//
// Idempotency (card): a purchase is keyed by its store transaction id, a rewarded ad by a request id made when it starts;
// both are kept with the account (processed) and, while a run is open, in the run too (granted) — so neither a reload,
// a store re-delivery nor a double tap grants twice. A cancelled, failed or offline ad or purchase changes nothing at
// all: the save stays byte-identical. The pending request ids (an ad started, its completion not seen yet) sit on the
// account; one left from a closed app is dropped on load, unrewarded.
// Ledger categories: bought tokens 'purchase', ad tokens / Credits 'ad', token spends 'store' — all in the gods' and
// secrets' paid list (data/secrets.js GOD_READINGS.paidSources), so no paid Credit ever counts for them.
import { EntitlementService } from '../../../../core/EntitlementService.js';
import { AdService } from '../../../../core/AdService.js';
import { CommerceService } from '../../../../core/CommerceService.js';
import { rankIndexOf } from '../../../../core/CompanyRank.js';
import { RANKS } from '../../data/economy.js';
import { TEAM_COLOURS } from '../../data/setup.js';
import { PRODUCTS, REWARDED, REWARDED_BY_ID, INTERSTITIAL_CAPS, INTERSTITIAL_WORDS, TOKEN_SINKS, TOKEN_PALETTES, EARNED_UNLOCKS, STORE_MESSAGES, AD_TEXT } from '../../data/monetisation.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const HOUR = 3600 * 1000;
const KEEP_GRANTED = 300; // ids remembered in a run (the account keeps core's 500)

// The account's processed ids, plus this run's granted ones (a run saved before the account can't grant twice).
class RunAwareEntitlements extends EntitlementService {
  constructor(opts, runGranted) {
    super(opts);
    this.runGranted = runGranted;
  }
  hasProcessed(id) {
    return super.hasProcessed(id) || this.runGranted().includes(String(id));
  }
  markProcessed(id) {
    const fresh = super.markProcessed(id);
    const g = this.runGranted();
    if (!g.includes(String(id))) {
      g.push(String(id));
      if (g.length > KEEP_GRANTED) g.splice(0, g.length - KEEP_GRANTED);
    }
    return fresh;
  }
}

const blankRun = () => ({ granted: [], resultsSinceAd: 0, palettes: [], unlocks: {}, ads: null });
const blankAccount = () => ({ removeAds: false, processed: [], ads: null, heldTokens: 0, pending: [] });

export function createMonetisation({ bus, team, now = () => Date.now() }) {
  let run = blankRun();
  let account = blankAccount();
  let store = null; // { load, save } for the account block
  let busy = false; // a rewarded ad is being watched
  let seq = 0; // request ids in this session (with the time: unique)
  const entitlements = new RunAwareEntitlements({ now, bus }, () => run.granted);
  const ads = new AdService({ caps: INTERSTITIAL_CAPS, placements: REWARDED, now, adFree: () => entitlements.removeAds, bus });
  const commerce = new CommerceService({ products: PRODUCTS, entitlements, grant: (p, tx) => grantProduct(p, tx), commit: () => api.commit(), messages: STORE_MESSAGES, now, bus });
  bus.on('commerce:purchased', () => ads.notePurchase()); // never an interstitial straight after a purchase
  // Interstitials count finished race weekends; the earned unlocks are noted when the rank first allows them.
  bus.on('race:finished', ({ race }) => race?.kind === 'weekend' && (run.resultsSinceAd = (run.resultsSinceAd ?? 0) + 1));
  bus.on('reputation:rankUp', () => noteUnlocks(true));

  const money = () => team.money;
  const economy = () => team.money.economy;
  const rankAt = (id) => (team.money?.reputation?.highestRankIndex ?? 0) >= rankIndexOf(RANKS, id);

  // --- earned unlocks (were VIP's) ---------------------------------------------------------------------------------
  function noteUnlocks(announce = false) {
    for (const [k, u] of Object.entries(EARNED_UNLOCKS)) {
      if (!rankAt(u.rank) || run.unlocks[k] != null) continue;
      run.unlocks[k] = team.clock?.totalDays ?? 0;
      if (announce) bus.emit('unlock:earned', { id: k, unlock: u });
    }
  }

  // --- the Racing Token ledger (one place for every token in or out) ------------------------------------------------
  function addTokens(n, reason, category) {
    n = Math.round(n);
    if (!n) return 0;
    economy().add('tokens', n, reason, category);
    return n;
  }
  function tokenBlock(sink) {
    const s = TOKEN_SINKS[sink];
    if (!s) return 'Racing Tokens can’t buy that';
    if (money().tokens < s.cost) return `Needs ${s.cost} Racing Tokens`;
    return null;
  }
  function spendTokens(sink, reason = null) {
    const why = tokenBlock(sink);
    if (why) return { ok: false, reason: why };
    const s = TOKEN_SINKS[sink];
    economy().add('tokens', -s.cost, reason ?? `Racing Tokens: ${s.name}`, 'store');
    bus.emit('tokens:spent', { sink, cost: s.cost });
    return { ok: true, cost: s.cost };
  }

  // Extra sponsor offers: the board's monthly offers drawn again (renewals and retries stay).
  function sponsorRefreshBlock() {
    const sp = team.sponsors;
    if (!sp) return 'No sponsors yet';
    if (!sp.offerable().length && !sp.offers.some((o) => o.kind === 'monthly')) return 'No other sponsor would offer right now';
    return tokenBlock('sponsorRefresh');
  }
  function sponsorRefresh() {
    const why = sponsorRefreshBlock();
    if (why) return { ok: false, reason: why };
    spendTokens('sponsorRefresh', 'Racing Tokens: extra sponsor offers');
    team.sponsors.refreshOffers(team.clock.totalDays);
    return { ok: true };
  }

  // Livery palettes: the six starting colours, plus the token ones bought this run.
  const palettes = () => [...TEAM_COLOURS.map((c) => ({ ...c, owned: true })), ...TOKEN_PALETTES.map((c) => ({ ...c, owned: run.palettes.includes(c.id) }))];
  function buyPalette(id) {
    const p = TOKEN_PALETTES.find((c) => c.id === id);
    if (!p) return { ok: false, reason: 'No such palette' };
    if (run.palettes.includes(id)) return { ok: false, reason: 'Already yours' };
    const r = spendTokens('palette', `Racing Tokens: ${p.name} livery`);
    if (!r.ok) return r;
    run.palettes.push(id);
    team.setup.colour = id;
    bus.emit('team:changed', { what: 'colour' });
    return { ok: true };
  }
  function setColour(id) {
    const p = palettes().find((c) => c.id === id);
    if (!p?.owned) return { ok: false, reason: 'Buy this palette first' };
    team.setup.colour = id;
    bus.emit('team:changed', { what: 'colour' });
    return { ok: true };
  }

  // --- purchases -------------------------------------------------------------------------------------------------------
  // A consumable's tokens go into the open run, or wait on the account for the next run opened.
  function grantProduct(p, tx) {
    const g = p.grant;
    if (!g || g.currency !== 'tokens') return;
    if (api.runOpen()) addTokens(g.amount, `Store: ${p.name}`, 'purchase');
    else account.heldTokens += g.amount;
  }
  function payHeld() {
    const n = account.heldTokens;
    if (!n || !api.runOpen()) return 0;
    account.heldTokens = 0;
    addTokens(n, 'Racing Tokens bought earlier', 'purchase');
    saveAccount();
    return n;
  }

  // --- rewarded placements -------------------------------------------------------------------------------------------
  // What a placement would be used on now: { show, scope, target, block } (block: why not, or null).
  function target(id, ctx = {}) {
    switch (id) {
      case 'recruitRefresh': {
        const why = team.recruitment?.channelWhy(ctx.channel);
        return why ? { show: true, block: why } : { show: !!ctx.channel, target: ctx.channel };
      }
      case 'contractBonus': {
        const c = bonusContract(ctx.contractId);
        if (!c) return { show: false };
        return c.result?.adBonus ? { show: true, target: c, block: 'Bonus already added' } : { show: true, target: c };
      }
      case 'practiceBoost': {
        const w = team.races?.current;
        if (!w || w.kind !== 'weekend') return { show: false };
        if (w.adBoost) return { show: true, target: w, block: 'Used on this weekend' };
        if (w.quali || w.driveLap) return { show: true, target: w, block: 'Qualifying has started' };
        return { show: true, target: w };
      }
      case 'tokenGift':
        return { show: !!team.runId };
      default:
        return { show: false };
    }
  }
  // An ordinary contract paid lately (never the rescue job or a story contract), once each.
  function bonusContract(contractId) {
    const cs = team.money?.contracts;
    const c = cs?.done.find((x) => x.id === contractId);
    const p = REWARDED_BY_ID.contractBonus;
    if (!c || c.status !== 'success' || c.story || c.kind === 'rescue' || !(c.credits > 0)) return null;
    if ((team.clock.totalDays - (c.resolvedDay ?? 0)) > p.windowDays) return null;
    return c;
  }
  function usedText(p) {
    const at = ads.nextFreeAt(p.id);
    const h = at ? Math.max(1, Math.ceil((at - now()) / HOUR)) : p.limit.hours;
    return `Used today — again in about ${h} hour${h === 1 ? '' : 's'}`;
  }
  // For the screens: { show, ok, label, sub } — show = the button belongs here now; ok = it can be tapped.
  function placement(id, ctx = {}) {
    const p = REWARDED_BY_ID[id];
    const t = target(id, ctx);
    if (!p || !t.show) return { show: false, ok: false, label: '', sub: '' };
    let sub = p.blurb;
    let ok = true;
    if (id === 'contractBonus' && t.target && !t.block) sub = `+${fmt(Math.round(t.target.credits * (p.effect.creditsPct / 100)))} Credits on ${t.target.title}`;
    if (t.block) [ok, sub] = [false, t.block];
    else if (ads.limitBlock(id, null)) [ok, sub] = [false, usedText(p)];
    else if (busy || ads.showing) [ok, sub] = [false, AD_TEXT.busy];
    else if (!ads.available) [ok, sub] = [false, AD_TEXT.unavailable];
    return { show: true, ok, label: `${AD_TEXT.tag}: ${p.name}`, sub, tag: AD_TEXT.tag };
  }
  // Why it can't be watched now (null = it can).
  function placementBlock(id, ctx = {}) {
    const pl = placement(id, ctx);
    if (!pl.show) return 'Not available here right now';
    return pl.ok ? null : pl.sub;
  }

  // The rewards. None finishes, shortens or opens anything: a redraw of the same pool, a little Credits, a little Setup
  // Knowledge on one weekend (that race then stays out of the secret / achievement race facts), 3 tokens.
  // → { message } or false (nothing to give — then nothing is counted).
  function reward(id, ctx) {
    const t = target(id, ctx);
    if (!t.show || t.block) return false;
    const p = REWARDED_BY_ID[id];
    switch (id) {
      case 'recruitRefresh':
        team.recruitment.adRedraw(t.target);
        return { message: 'New candidates!' };
      case 'contractBonus': {
        const c = t.target;
        const amount = Math.round(c.credits * (p.effect.creditsPct / 100));
        economy().add('credits', amount, `Ad bonus: ${c.title}`, 'ad');
        c.result = { ...(c.result ?? {}), adBonus: amount };
        return { message: `+${fmt(amount)} Credits bonus` };
      }
      case 'practiceBoost': {
        team.races.applyAdBoost(p.effect.knowledge);
        return { message: `+${p.effect.knowledge} Setup Knowledge this weekend` };
      }
      case 'tokenGift':
        addTokens(p.effect.tokens, 'Watched an ad', 'ad');
        return { message: `+${p.effect.tokens} Racing Tokens` };
      default:
        return false;
    }
  }

  // Watch a rewarded ad: the reward only on the provider's completion, exactly once (the request id), saved after.
  async function watch(id, ctx = {}) {
    const block = placementBlock(id, ctx);
    if (block) return { ok: false, message: block };
    const p = REWARDED_BY_ID[id];
    const requestId = `ad-${now().toString(36)}-${++seq}`;
    busy = true;
    account.pending.push({ id: requestId, placement: id, at: now() });
    let res;
    try {
      res = await ads.rewarded(id, null, () => {
        if (entitlements.hasProcessed(requestId)) return false; // completion seen twice: granted once
        const r = reward(id, ctx);
        if (r === false) return false;
        entitlements.markProcessed(requestId);
        return r;
      });
    } finally {
      account.pending = account.pending.filter((x) => x.id !== requestId);
      busy = false;
    }
    if (!res.ok) {
      const m = { cancelled: AD_TEXT.cancelled, failed: AD_TEXT.failed, offline: AD_TEXT.offline, 'limit reached': usedText(p), 'no ad available': AD_TEXT.unavailable, 'an ad is already showing': AD_TEXT.busy }[res.reason];
      return { ok: false, status: res.status, message: m ?? res.reason ?? AD_TEXT.failed };
    }
    await api.commit('ad');
    return { ok: true, requestId, message: res.reward?.message ?? `${p.name}: done!`, reward: res.reward };
  }
  // Tests: a provider's completion arriving a second time for the same request must give nothing.
  function grantAgain(requestId, id, ctx = {}) {
    if (entitlements.hasProcessed(requestId)) return false;
    const r = reward(id, ctx);
    if (r !== false) entitlements.markProcessed(requestId);
    return r;
  }

  // --- interstitials --------------------------------------------------------------------------------------------------
  const consentGiven = () => !!api.consent?.answered && !!api.consent.value?.given;
  const firstResultDone = () => (team.races?.history ?? []).some((e) => e.kind === 'weekend');
  function interstitialBlock(breakPoint, context = {}) {
    if (!INTERSTITIAL_CAPS.breakPoints.includes(breakPoint)) return 'not a natural break point';
    if (entitlements.removeAds) return 'ad-free (Remove Ads)';
    if (!firstResultDone()) return INTERSTITIAL_WORDS.firstResult;
    if ((run.resultsSinceAd ?? 0) < INTERSTITIAL_CAPS.resultsBetween) return INTERSTITIAL_WORDS.fewResults;
    if (!consentGiven()) return INTERSTITIAL_WORDS.noConsent;
    return ads.interstitialBlock(breakPoint, context);
  }
  async function breakPoint(bp, context = {}) {
    const why = interstitialBlock(bp, context);
    if (why) return { shown: false, status: null, reason: why };
    const r = await ads.interstitial(bp, context);
    if (r.shown) {
      run.resultsSinceAd = 0;
      saveAccount();
    }
    return r;
  }

  // --- the account block --------------------------------------------------------------------------------------------
  function accountBlock() {
    return { removeAds: entitlements.removeAds, processed: entitlements.serializeProcessed(), ads: ads.serializeAccount(), heldTokens: account.heldTokens, pending: account.pending.map((x) => ({ ...x })) };
  }
  function applyAccount(b) {
    account = { ...blankAccount(), heldTokens: Math.max(0, b?.heldTokens ?? 0), pending: [] }; // (a pending ad from a closed app: dropped, unrewarded)
    entitlements.reset();
    entitlements.load({ removeAds: !!b?.removeAds });
    entitlements.loadProcessed(b?.processed ?? []);
    ads.loadAccount(b?.ads ?? null);
  }
  function saveAccount() {
    return store?.save?.(accountBlock());
  }

  const api = {
    entitlements,
    ads,
    commerce,
    consent: null, // core/AdConsent (main.js); none = no consent yet, so no interstitial
    runOpen: () => !!team.slot, // main.js: a team is open in the garage
    get provider() {
      return ads.provider;
    },
    get providerId() {
      return ads.provider?.id ?? 'none';
    },
    setProvider(p) {
      ads.setProvider(p);
      commerce.setProvider(p);
    },
    get removeAds() {
      return entitlements.removeAds;
    },
    get busy() {
      return busy;
    },
    get pending() {
      return account.pending;
    },
    get heldTokens() {
      return account.heldTokens;
    },
    // the Splash: purchases re-delivered by the store, then a quiet check of what is owned (online only)
    async startup() {
      const pending = await commerce.processPending();
      const check = await commerce.recheck();
      return { pending, check, removeAds: entitlements.removeAds };
    },
    // a finished purchase or reward is saved: the run first (its granted ids), then the account
    async commit(reason = 'purchase') {
      if (api.runOpen()) await team.save(reason);
      await saveAccount();
    },
    placement,
    placementBlock,
    watch,
    grantAgain,
    interstitialBlock,
    breakPoint,
    tokenBlock,
    spendTokens,
    addTokens,
    sponsorRefreshBlock,
    sponsorRefresh,
    palettes,
    buyPalette,
    setColour,
    payHeld,
    supportCrewOpen: () => rankAt(EARNED_UNLOCKS.supportCrew.rank),
    secondQueueOpen: () => rankAt(EARNED_UNLOCKS.secondQueue.rank),
    get unlocks() {
      return { ...run.unlocks };
    },
    get resultsSinceAd() {
      return run.resultsSinceAd ?? 0;
    },
    debugResults(n) {
      run.resultsSinceAd = (run.resultsSinceAd ?? 0) + n; // ?debug=1 only (the Test store controls)
    },

    // --- save ---------------------------------------------------------------------------------------------------------
    setAccount(s) {
      store = s;
    },
    async loadAccount() {
      applyAccount(store ? await store.load() : null);
    },
    saveAccount,
    serializeAccount: accountBlock,
    loadAccountBlock: applyAccount,
    newGame() {
      run = blankRun();
      ads.loadRun(null);
      noteUnlocks(false);
    },
    serialize: () => ({ granted: [...run.granted], resultsSinceAd: run.resultsSinceAd ?? 0, palettes: [...run.palettes], unlocks: { ...run.unlocks }, ads: ads.serializeRun() }),
    // A save from before Milestone 31 (s = null): nothing bought or granted in it; its results so far count toward the
    // first interstitial; an unlock its rank already allows is noted (no toast).
    load(s) {
      run = {
        granted: [...(s?.granted ?? [])].map(String),
        resultsSinceAd: s ? s.resultsSinceAd ?? 0 : (team.races?.history ?? []).filter((e) => e.kind === 'weekend').length,
        palettes: (s?.palettes ?? []).filter((id) => TOKEN_PALETTES.some((p) => p.id === id)),
        unlocks: { ...(s?.unlocks ?? {}) },
        ads: null,
      };
      ads.loadRun(s?.ads ?? null);
      noteUnlocks(false);
    },
  };
  return api;
}
