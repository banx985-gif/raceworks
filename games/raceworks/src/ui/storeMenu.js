// The Store (Milestone 31, replacing Milestone 29's placeholder; card docs/M31_MONETISATION_DEBUG.md): Remove Ads (one
// time), the three fixed Racing Token packs, Restore Purchases, what Racing Tokens may buy (extra sponsor offers, the two
// livery palettes; recruitment refreshes are on the Hire screen), an optional "watch an ad" for a few tokens, and the two
// things the old plan sold that are now earned in play (the Support Crew slot at Rank A, the second research queue at
// Rank B). Prices come from the store (core/CommerceService); with no store — a normal web build until Milestone 37 —
// the sheet says so and nothing can be bought. Everything here is optional.
// ?debug=1 adds the Test store controls sheet ('storeDebug'): the pretend provider's next ad / purchase outcome
// (succeed / cancel / fail / offline), offline, replay the last purchase, reset; the ad consent; the interstitial check.
//   const store = createStoreMenu({ team, dialog, toast, open, debug, consent, provider: () => fakeStore })
//   menus.register('shopStore', store.menu) · menus.register('storeDebug', store.debugMenu)
import { THEME } from '../../../../core/Theme.js';
import { PRODUCTS, REMOVE_ADS, TOKEN_PACKS, TOKEN_SINKS, TOKEN_PALETTES, EARNED_UNLOCKS, MONETISATION_ART as ART, STORE_TEXT, AD_TEXT, INTERSTITIAL_CAPS } from '../../data/monetisation.js';
import { fmt } from './moneyMenu.js';

const C = THEME.color;
const RELOAD_MS = 60000; // prices asked again at most this often while the sheet is open

export function createStoreMenu({ team, dialog, toast = () => {}, open = () => {}, debug = false, consent = null, provider = () => null, onBreakPoint = null }) {
  const M = team.monetisation;
  let st = { loading: false, ok: false, message: null, at: -Infinity };
  let working = null; // the product being bought / 'restore' / 'ad'

  async function load() {
    st = { ...st, loading: true };
    const r = await M.commerce.loadProducts();
    st = { loading: false, ok: r.ok, message: r.message, at: Date.now() };
    return r;
  }
  const ensureLoaded = () => !st.loading && Date.now() - st.at > RELOAD_MS && load();
  const ok = (title, body, art) => dialog.show({ title, body, art, buttons: [{ id: 'ok', label: 'OK', accent: C.progress }] });

  async function buy(key) {
    if (working) return null;
    const p = PRODUCTS[key];
    if (p.entitlement === 'removeAds' && M.removeAds) return null; // owned for good: never sold twice
    working = key;
    const before = team.money.tokens;
    const r = await M.commerce.buy(key);
    working = null;
    let body = r.message;
    if (r.ok && r.granted && p.grant) body = `${r.message} +${p.grant.amount} Racing Tokens${M.runOpen() ? ` (you now have ${fmt(team.money.tokens)})` : ' — they arrive when you next open a team'}.`;
    else if (r.ok && r.granted && p.entitlement === 'removeAds') body = `${r.message} No more full-screen ads, for good.`;
    ok(r.ok ? (r.granted ? 'Purchase complete' : 'Already added') : 'No purchase made', body, r.ok ? p.icon : ART.warning);
    return { ...r, tokensBefore: before };
  }

  async function restore() {
    if (working) return null;
    working = 'restore';
    const r = await M.commerce.restore();
    working = null;
    ok(r.ok ? STORE_TEXT.restore : 'Could not restore', r.message, r.ok ? ART.restore : ART.warning);
    return r;
  }

  async function watchTokens() {
    if (working) return null;
    working = 'ad';
    const r = await M.watch('tokenGift');
    working = null;
    toast(r.message);
    return r;
  }

  const priceOf = (key) => M.commerce.price(key) ?? (st.loading ? '…' : STORE_TEXT.noPrice);
  const canBuy = () => st.ok && !working;

  function menu() {
    ensureLoaded();
    const secs = [];
    const head = [{ text: STORE_TEXT.intro, color: C.text }];
    if (M.providerId === 'debug') head.push({ text: STORE_TEXT.pretend, color: C.purple });
    if (st.loading) head.push({ text: STORE_TEXT.loading, color: C.textMuted });
    else if (!st.ok) head.push({ text: M.providerId === 'none' ? STORE_TEXT.unavailable : st.message ?? STORE_TEXT.unavailable, color: C.bad });
    secs.push({ lines: head, ...(!st.ok && !st.loading && M.providerId !== 'none' ? { columns: 1, buttons: [{ id: 'storeRetry', label: 'Try again', sub: 'Ask the store again', icon: ART.restore, accent: C.progress, onTap: () => load() }] } : {}) });

    // Remove Ads
    const ra = PRODUCTS[REMOVE_ADS];
    const owned = M.removeAds;
    secs.push({ title: 'REMOVE ADS', columns: 1, buttons: [{ id: 'buy_removeAds', label: owned ? `${ra.name} · ${STORE_TEXT.owned}` : `${ra.name} · ${priceOf(REMOVE_ADS)}`, sub: working === REMOVE_ADS ? STORE_TEXT.buying : ra.blurb, icon: ra.icon, accent: owned ? C.good : C.action, disabled: owned || !canBuy(), onTap: () => buy(REMOVE_ADS) }] });

    // Racing Token packs
    secs.push({
      title: STORE_TEXT.tokensHeading.toUpperCase(),
      lines: [{ text: `You have ${fmt(team.money.tokens)} Racing Tokens.`, color: C.actionDark }, { text: STORE_TEXT.noLootBoxes, color: C.textMuted }, { text: STORE_TEXT.tokensUse, color: C.textMuted }],
      columns: 1,
      buttons: TOKEN_PACKS.map((key) => {
        const p = PRODUCTS[key];
        return { id: `buy_${key}`, label: `${p.name} · ${priceOf(key)}`, sub: working === key ? STORE_TEXT.buying : p.blurb, icon: p.icon, accent: C.action, disabled: !canBuy(), onTap: () => buy(key) };
      }),
    });
    // an optional ad for a few tokens (only with an ad provider)
    if (M.providerId !== 'none') {
      const pl = M.placement('tokenGift');
      if (pl.show) secs.push({ columns: 1, buttons: [{ id: 'adTokens', label: working === 'ad' ? AD_TEXT.playing : pl.label, sub: pl.sub, icon: ART.ad, accent: C.gold, disabled: !pl.ok || !!working, onTap: () => watchTokens() }] });
    }

    // What tokens buy
    const spWhy = M.sponsorRefreshBlock();
    secs.push({
      title: STORE_TEXT.spendHeading.toUpperCase(),
      lines: [{ text: `Recruitment refresh · ${TOKEN_SINKS.recruitRefresh.cost} tokens: on the Hire screen.`, color: C.textMuted }],
      columns: 1,
      buttons: [{ id: 'storeSponsorTokens', label: `New sponsor offers · ${TOKEN_SINKS.sponsorRefresh.cost} tokens`, sub: spWhy ?? 'Draw this month’s offers again (renewals stay)', icon: 'race_ui_02', accent: C.progress, disabled: !!spWhy, onTap: () => { const r = M.sponsorRefresh(); toast(r.ok ? 'New sponsor offers' : r.reason, r.ok ? `−${TOKEN_SINKS.sponsorRefresh.cost} Racing Tokens · Money → Sponsors` : ''); } }],
    });
    // Team colour: the six, and the two token palettes
    const cur = team.setup.colour;
    secs.push({
      title: STORE_TEXT.paletteHeading.toUpperCase(),
      lines: [{ text: 'Looks only: your cars, badge and garage take the colour.', color: C.textMuted }],
      columns: 2,
      buttons: M.palettes().map((c) => {
        const on = c.id === cur;
        if (!c.owned) {
          const why = M.tokenBlock('palette');
          return { id: `palette_${c.id}`, label: `${c.name} · ${TOKEN_SINKS.palette.cost} tokens`, sub: why ?? 'Buy for this team', icon: ART.palette, accent: c.main, disabled: !!why, onTap: () => { const r = M.buyPalette(c.id); toast(r.ok ? `${c.name}!` : r.reason, r.ok ? `−${TOKEN_SINKS.palette.cost} Racing Tokens` : ''); } };
        }
        return { id: `palette_${c.id}`, label: `${on ? '✓ ' : ''}${c.name}`, sub: on ? 'Your colour now' : c.token ? 'Yours · tap to use' : 'Tap to use', icon: ART.palette, accent: c.main, onTap: () => M.setColour(c.id) };
      }),
    });

    // Earned in play (were the old plan's paid extras)
    const earned = (k) => {
      const u = EARNED_UNLOCKS[k];
      const open = k === 'supportCrew' ? M.supportCrewOpen() : M.secondQueueOpen();
      return { text: `${open ? '✓' : '🔒'} ${u.name}: ${u.line} — ${open ? 'open' : `opens at Rank ${u.rank}`} (played for, never bought)`, color: open ? C.good : C.textMuted };
    };
    secs.push({ title: 'EARNED IN PLAY', lines: [earned('supportCrew'), earned('secondQueue')] });

    secs.push({
      columns: 1,
      buttons: [
        { id: 'storeRestore', label: working === 'restore' ? STORE_TEXT.restoring : STORE_TEXT.restore, sub: STORE_TEXT.restoreSub, icon: ART.restore, accent: C.progress, disabled: !!working, onTap: () => restore() },
        ...(debug ? [{ id: 'storeDebug', label: STORE_TEXT.debug, sub: STORE_TEXT.debugSub, icon: ART.ad, accent: C.purple, onTap: () => open('storeDebug') }] : []),
      ],
    });
    secs.push({ lines: [{ text: STORE_TEXT.never, color: C.textMuted }] });
    return { title: STORE_TEXT.title, subtitle: `${fmt(team.money.tokens)} Racing Tokens${M.removeAds ? ' · Remove Ads ✓' : ''}`, art: ART.store, accent: C.progress, sections: secs };
  }

  // --- ?debug=1: the pretend provider's switches --------------------------------------------------------------------
  const OUTCOMES = ['succeed', 'cancel', 'fail', 'offline'];
  function debugMenu() {
    const P = provider();
    const secs = [];
    if (!P) return { title: STORE_TEXT.debug, subtitle: 'No test store (open with ?debug=1)', art: ART.ad, accent: C.purple, sections: [{ lines: ['The pretend provider is only installed with ?debug=1.'] }] };
    const pick = (kind) => ({
      title: kind === 'ad' ? 'NEXT AD' : 'NEXT PURCHASE',
      columns: 4,
      buttons: OUTCOMES.map((o) => ({ id: `dbg_${kind}_${o}`, label: `${P.next[kind] === o ? '✓ ' : ''}${o}`, accent: P.next[kind] === o ? C.good : C.purple, onTap: () => P.setNext(kind, o) })),
    });
    secs.push(pick('ad'), pick('purchase'));
    const ib = M.interstitialBlock('raceResult');
    const cv = consent?.answered ? (consent.value.given ? 'given' : 'refused') : 'not asked';
    secs.push({
      title: 'STATE',
      lines: [
        `Store ${P.offline ? 'OFFLINE' : 'online'} · Remove Ads ${M.removeAds ? 'owned' : 'no'} · ad consent ${cv}`,
        `Interstitial now (race result): ${ib ?? 'would show'} · results since the last: ${M.resultsSinceAd} of ${INTERSTITIAL_CAPS.resultsBetween}`,
        ...P.log.slice(-5).reverse().map((l) => ({ text: l.text, color: C.textMuted })),
      ],
    });
    secs.push({
      title: 'SWITCHES',
      columns: 2,
      buttons: [
        { id: 'dbg_offline', label: P.offline ? 'Go online' : 'Go offline', sub: 'The whole test store', accent: C.purple, onTap: () => (P.offline = !P.offline) },
        { id: 'dbg_replay', label: 'Replay last purchase', sub: 'Must grant nothing again', accent: C.purple, onTap: async () => { const tx = P.replayLast(); const r = await M.commerce.processPending(); toast(tx ? `Replayed ${tx.productKey}` : 'Nothing bought yet', `${r.delivered} granted · ${r.duplicates} already added`); } },
        { id: 'dbg_reset', label: 'Reset test store', sub: 'It forgets every purchase', accent: C.purple, onTap: () => P.resetPurchases() },
        { id: 'dbg_limits', label: 'Clear ad limits', sub: 'Real-day caps, quiet times', accent: C.purple, onTap: () => { M.ads.loadAccount({ firstSeenAt: 0 }); M.saveAccount(); toast('Ad limits cleared'); } },
        { id: 'dbg_consentYes', label: 'Consent: yes', sub: 'Ads allowed (non-personalised)', accent: C.purple, onTap: () => consent?.set({ personalised: false, given: true }) },
        { id: 'dbg_consentNo', label: 'Consent: no', sub: 'No interstitials', accent: C.purple, onTap: () => consent?.set({ given: false }) },
        { id: 'dbg_interstitial', label: 'Try an interstitial', sub: 'As if leaving a race result', accent: C.purple, onTap: async () => { const r = await (onBreakPoint ? onBreakPoint('raceResult') : M.breakPoint('raceResult')); toast(r.shown ? 'Interstitial shown' : 'No interstitial', r.reason ?? r.status ?? ''); } },
        { id: 'dbg_results', label: '+3 results', sub: 'Count toward the cap', accent: C.purple, onTap: () => M.debugResults(INTERSTITIAL_CAPS.resultsBetween) },
      ],
    });
    return { title: STORE_TEXT.debug, subtitle: 'Pretend ads and purchases (no money, no real ads)', art: ART.ad, accent: C.purple, parent: 'shopStore', sections: secs };
  }

  return { menu, debugMenu, load, buy, restore, watchTokens, get state() { return st; }, get working() { return working; } };
}
