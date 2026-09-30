// Recruitment (Milestone 12, bible §12): five channels, a 3-card board for each open one, refreshes, hiring and letting
// go, on the shared core/RecruitmentSystem (one per channel) driven by data/recruitment.js. Saved with the team.
//
// Channels: Local Contacts (always), Agency Search (Rank D), National Scout (Rank C), Global Head Hunt (Rank A); Special
// Arrival is shown and locked until Milestone 24 (condition-driven, never refreshed). A channel's board is made when
// it opens (new game, rank up, or an old save).
// Cards: a named person from data/staff.js ROSTER who is eligible now (a Start candidate, or their rank reached), else a
// generic person made up from data/recruitment.js GENERIC (role art from the 50 portraits, never a face in use), so a
// board is never empty. Eligibility is checked for every card, every time — a paid refresh only draws again from the
// same eligible pool:
//   Legendary / Secret never appear (special arrival only) · Elite only from Rank B · a named row only when its
//   eligibility holds · Local Contacts' Rare only up to level 6 ("low Rare") · nobody already on the team or on another
//   board · the founder never (spec §9: they start employed; if they ever leave they do not come back as a candidate).
// Refreshes: every open board is redrawn for free every 56 game days; a Credits refresh costs the channel's price ×2 for
// each paid refresh already bought this game month; Racing Tokens (core/StoreStub, from the ledger) and a rewarded ad
// (core/AdService on core/FakeStoreProvider — a pretend provider, no real ads; one a real day) are service stubs.
// Hiring: a fee (PLACEHOLDER: one month's salary) through the ledger; their salary is paid with everyone's on day 1;
// the staff cap by rank (bible §12: E 6, D 9, C 12, B 16, A 20, S 24). The hire walks into the garage and joins the
// staff loops, the roster and car-team picks. Letting go frees the slot (not while on the car's team or on a course);
// they may turn up again later (core former pool) — never the founder.
//
// Events: core's 'recruit:refresh' / 'recruit:taken'; 'staff:hired' { staff, channel }; core StaffSystem's
// 'staff:removed' { staff }; 'staff:letGo' { id, name }.
// Milestone 13: all 50 rows. A named person's eligibility is their row's data (src/systems/staffEligibility.js: rank,
// research, facilities, the team's race / car records; dormant rows wait for their milestone; Legendary / Secret never).
// Once a row's conditions have held, the team remembers it (team.careers.unlocked). Generic fillers get rarer as more
// named people can be found (RECRUIT.namedChance…). ?debug=1: debugSpawn(id) puts any of the 50 (Legendary / Secret
// too, never the founder or someone employed) on the Special tab as a hireable card — for testing only.
import { RecruitmentSystem } from '../../../../core/RecruitmentSystem.js';
import { AdService } from '../../../../core/AdService.js';
import { FakeStoreProvider } from '../../../../core/FakeStoreProvider.js';
import { StoreStub } from '../../../../core/StoreStub.js';
import { Rng } from '../../../../core/Rng.js';
import { rankIndexOf } from '../../../../core/CompanyRank.js';
import { RANKS } from '../../data/economy.js';
import { ROSTER, staffDefById, ROLES, TIERS, STAT_KEYS } from '../../data/staff.js';
import { CHANNELS, channelById, RECRUIT, REFRESH_SERVICES, GENERIC, ROLE_IDS } from '../../data/recruitment.js';
import { eligibilityWhy, eligibilityContext } from './staffEligibility.js';

const BOARD_CHANNELS = CHANNELS.filter((c) => !c.special);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// A person as a card carries: personId, name, role, tier, level, stats, salary, traits, art, generic.
export const cardOfDef = (d) => ({ personId: d.id, name: d.name, role: d.role, tier: d.tier, level: d.startLevel ?? 1, stats: { ...d.stats }, salary: d.salary, traits: [...(d.traits ?? [])], art: d.art, generic: false });
export const hireFee = (card) => Math.round(card.salary * RECRUIT.hireFeeMonths);

export function createRecruitment({ bus, team, seed = 'raceworks', now = () => Date.now() }) {
  const clock = team.clock;
  const money = team.money;
  const today = () => clock.totalDays;
  const rankIndex = () => money.reputation.highestRankIndex;
  const hasRank = (id) => !id || rankIndex() >= rankIndexOf(RANKS, id);
  const employed = (id) => !!team.staff.get(id);
  const state = { lastFreeDay: 0, paid: { month: -1, count: 0 }, nextGeneric: 1, debugCards: [] };

  // --- eligibility ---------------------------------------------------------------------------------------------------
  const chOpen = (ch) => !!ch && !ch.special && hasRank(ch.rank);
  const channelWhy = (id) => {
    const ch = channelById(id);
    if (!ch) return 'Unknown channel';
    if (ch.special) return `Special arrivals come later (${ch.lockedUntil})`;
    return hasRank(ch.rank) ? null : `Opens at Rank ${ch.rank}`;
  };
  // Why this person can't be a card on this channel now (null = they can). p: a card / candidate-shaped person.
  // A named row's own eligibility (Milestone 13); remembered once it has held.
  function namedWhy(def) {
    const why = eligibilityWhy(def, eligibilityContext(team));
    if (!why && def && !def.eligibility?.start && !team.careers.unlocked.includes(def.id)) team.careers.unlocked.push(def.id);
    return why;
  }
  function whyNot(p, ch = null) {
    if (RECRUIT.neverInPools.includes(p.tier) && !p.debug) return 'Arrives only as a special arrival';
    if (p.personId === team.founder?.id) return 'The founder is already part of the team story';
    if (employed(p.personId)) return 'Already on the team';
    if (p.debug) return null; // a ?debug=1 spawn: any of the 50, for testing
    const tr = RECRUIT.tierRank[p.tier];
    if (tr === undefined) return 'Not an ordinary candidate';
    if (!hasRank(tr)) return `${TIERS[p.tier].name} staff need Rank ${tr}`;
    if (ch) {
      if (!ch.weights?.[p.tier]) return `${ch.name} doesn’t find ${TIERS[p.tier].name} staff`;
      if (ch.band?.[p.tier] === 'low' && p.level > GENERIC.bandLevel.low) return `${ch.name} only finds low ${TIERS[p.tier].name} staff`;
    }
    if (!p.generic) return namedWhy(staffDefById(p.personId));
    return null;
  }
  const missingRoles = () => ROLE_IDS.filter((r) => !team.roster.some((s) => s.role === r));

  // --- boards ---------------------------------------------------------------------------------------------------------
  const boards = {};
  const allCards = () => [...Object.values(boards).flatMap((b) => b.cards), ...state.debugCards];
  const onBoards = () => new Set(allCards().map((c) => c.personId));
  // Faces already in use (on the team or a board) and the faces of named people who could be offered now.
  function faceFor(role, tier, rng) {
    const pad = (n) => String(n).padStart(2, '0');
    const all = GENERIC.faces[tier].map((n) => `${GENERIC.artPrefix[role]}${pad(n)}`);
    const inUse = new Set([...team.roster.map((s) => s.art), ...allCards().map((c) => c.art)]);
    const namedNow = new Set(ROSTER.filter((d) => !whyNot(cardOfDef(d))).map((d) => d.art));
    const free = all.filter((k) => !inUse.has(k) && !namedNow.has(k));
    const loose = all.filter((k) => !inUse.has(k));
    return rng.pick(free.length ? free : loose.length ? loose : all);
  }
  function genericName(rng) {
    const taken = new Set([...team.roster.map((s) => s.name), ...allCards().map((c) => c.name), ...ROSTER.map((d) => d.name)]);
    for (let i = 0; i < 20; i++) {
      const n = `${rng.pick(GENERIC.firstNames)} ${rng.pick(GENERIC.lastNames)}`;
      if (!taken.has(n)) return n;
    }
    return `${rng.pick(GENERIC.firstNames)} ${rng.pick(GENERIC.lastNames)}`;
  }
  function generic(ch, tier, rng) {
    const band = (ch.band?.[tier] === 'low' && GENERIC.low[tier]) || GENERIC.tiers[tier];
    const miss = missingRoles();
    const role = miss.length && rng.chance(RECRUIT.missingRoleChance) ? rng.pick(miss) : rng.pick(ROLE_IDS);
    const main = ROLES[role].primaryStat;
    const cap = TIERS[tier].statCap;
    const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, Math.min(cap, k === main ? rng.int(...band.primary) : rng.int(...band.other))]));
    const level = rng.int(...band.level);
    const salary = Math.round(rng.int(...band.salary) / 10) * 10;
    const name = genericName(rng);
    const art = faceFor(role, tier, rng);
    return { personId: `GEN${state.nextGeneric++}`, name, role, tier, level, stats, salary, traits: [], art, generic: true };
  }
  // A card for this channel and tier: a named eligible person (roles the team lacks first), else a generic one. The more
  // named people can be found, the rarer the generic fillers (Milestone 13).
  const namedChance = (n) => Math.min(RECRUIT.namedChanceMax, RECRUIT.namedChance + RECRUIT.namedChancePerExtra * Math.max(0, n - 1));
  function makeCandidate(ch, tier, rng) {
    const taken = onBoards();
    const named = ROSTER.filter((d) => d.tier === tier && !taken.has(d.id) && !whyNot(cardOfDef(d), ch));
    if (named.length && rng.chance(namedChance(named.length))) {
      const miss = missingRoles();
      const first = named.filter((d) => miss.includes(d.role));
      return cardOfDef(rng.pick(first.length && rng.chance(RECRUIT.missingRoleChance) ? first : named));
    }
    return generic(ch, tier, rng);
  }
  // Tiers this channel may draw now (Elite only from Rank B).
  const tierWeights = (ch) => Object.fromEntries(Object.entries(ch.weights).map(([t, w]) => [t, hasRank(RECRUIT.tierRank[t]) && !RECRUIT.neverInPools.includes(t) ? w : 0]));
  for (const ch of BOARD_CHANNELS) {
    boards[ch.id] = new RecruitmentSystem({
      rng: new Rng(`${seed}-recruit-${ch.id}`),
      bus,
      channels: [{ ...ch, roles: ROLE_IDS }],
      boardSize: RECRUIT.boardSize,
      reappearChance: RECRUIT.reappearChance,
      freeManualPerYear: 0,
      autoRefresh: () => false, // RACEWORKS refreshes by day (every 56), not by month
      hooks: { tierWeights, makeCandidate },
    });
  }
  // After a draw: drop any card that is not eligible (a returning former worker, someone on another board) and top the
  // board up with fresh cards, so it always shows three.
  function tidy(id) {
    const ch = channelById(id);
    const b = boards[id];
    const elsewhere = new Set(Object.entries(boards).filter(([k]) => k !== id).flatMap(([, x]) => x.cards.map((c) => c.personId)));
    const seen = new Set();
    b.board = b.board.filter((c) => {
      const ok = !whyNot(c, ch) && !elsewhere.has(c.personId) && !seen.has(c.personId);
      seen.add(c.personId);
      return ok;
    });
    const weights = tierWeights(ch);
    for (let i = 0; b.board.length < b.boardSize && i < 10; i++) {
      const tier = b._pickTier(weights);
      if (!tier) break;
      b.board.push({ ...makeCandidate(ch, tier, b.rng), id: `C${b.nextId++}`, channel: ch.id });
    }
    // Card ids are unique across the boards (each core board counts from C1): 'agency:C4'.
    for (const c of b.board) if (!c.id.startsWith(`${id}:`)) c.id = `${id}:${c.id}`;
  }
  function draw(id, reason) {
    boards[id].refresh(id, reason);
    tidy(id);
  }
  // Every open channel has a board (new game, a rank up, an old save).
  function openBoards(reason = 'open') {
    for (const ch of BOARD_CHANNELS) if (chOpen(ch) && !boards[ch.id].board.length) draw(ch.id, reason);
  }
  bus.on('reputation:rankUp', () => openBoards('open'));

  // --- refreshes ------------------------------------------------------------------------------------------------------
  const monthKey = () => clock.year * 100 + clock.month;
  const paidThisMonth = () => (state.paid.month === monthKey() ? state.paid.count : 0);
  const refreshCost = (id) => Math.round((channelById(id)?.refreshCost ?? 0) * RECRUIT.refreshEscalation ** paidThisMonth());
  const freeInDays = () => Math.max(0, state.lastFreeDay + RECRUIT.freeRefreshDays - today());
  // A Credits refresh now. → { ok, reason, cost }
  function refreshWhy(id) {
    const block = channelWhy(id);
    if (block) return block;
    const cost = refreshCost(id);
    return money.affordable(cost) ? null : `Needs ${fmt(cost)} Credits`;
  }
  function refresh(id) {
    const why = refreshWhy(id);
    if (why) return { ok: false, reason: why };
    const cost = refreshCost(id);
    money.economy.add('credits', -cost, `Recruitment: ${channelById(id).name} refresh`, 'hiring');
    state.paid = { month: monthKey(), count: paidThisMonth() + 1 };
    draw(id, 'paid');
    return { ok: true, cost };
  }
  // Service stubs (bible §12): Racing Tokens through a store stand-in on the ledger; a rewarded "ad" from the pretend
  // provider, one per real day. Neither can make anyone eligible: they only redraw the same pools.
  const store = new StoreStub({ economy: money.economy, bus, items: { recruitRefresh: { currency: 'tokens', cost: REFRESH_SERVICES.tokens.cost, name: 'Recruitment refresh' } } });
  const provider = new FakeStoreProvider({ products: {}, now });
  const ads = new AdService({ provider, now, bus, placements: [{ id: REFRESH_SERVICES.ad.placement, limit: { per: 'realHours', hours: REFRESH_SERVICES.ad.perRealHours, count: REFRESH_SERVICES.ad.count } }] });
  const tokenWhy = (id) => channelWhy(id) ?? store.block('recruitRefresh');
  function refreshWithTokens(id) {
    const why = tokenWhy(id);
    if (why) return { ok: false, reason: why };
    store.purchase('recruitRefresh', `Recruitment: ${channelById(id).name} refresh (Racing Tokens)`);
    draw(id, 'tokens');
    return { ok: true, cost: REFRESH_SERVICES.tokens.cost };
  }
  const adWhy = (id) => {
    const block = channelWhy(id);
    if (block) return block;
    const r = ads.rewardBlock(REFRESH_SERVICES.ad.placement, null);
    return r === 'limit reached' ? 'One ad refresh a day: used' : r;
  };
  async function refreshWithAd(id) {
    const why = adWhy(id);
    if (why) return { ok: false, reason: why };
    const r = await ads.rewarded(REFRESH_SERVICES.ad.placement, null, () => draw(id, 'ad'));
    return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? `The ad ${r.status ?? 'failed'}: no refresh` };
  }

  // --- hiring and letting go ------------------------------------------------------------------------------------------
  const staffCap = () => RECRUIT.staffCaps[RANKS[rankIndex()].id];
  const nextCapRank = () => RANKS.slice(rankIndex() + 1).find((r) => RECRUIT.staffCaps[r.id] > staffCap()) ?? null;
  const findCard = (cardId) => {
    for (const [ch, b] of Object.entries(boards)) {
      const c = b.get(cardId);
      if (c) return { card: c, ch };
    }
    const d = state.debugCards.find((c) => c.id === cardId);
    return d ? { card: d, ch: 'special' } : null;
  };
  // ?debug=1 (Milestone 13): put any of the 50 on the Special tab as a hireable card — Legendary / Secret too. Never the
  // founder, someone employed, or someone already on a board. → { ok, card } or { ok: false, reason }
  function debugSpawn(personId) {
    const d = staffDefById(personId);
    if (!d) return { ok: false, reason: `No one called ${personId}` };
    if (d.id === team.founder?.id) return { ok: false, reason: 'The founder is already part of the team story' };
    if (employed(d.id)) return { ok: false, reason: 'Already on the team' };
    if (allCards().some((c) => c.personId === d.id)) return { ok: false, reason: 'Already on a board' };
    const card = { ...cardOfDef(d), id: `debug:${d.id}`, channel: 'special', debug: true };
    state.debugCards.push(card);
    bus.emit('recruit:refresh', { channel: 'special', reason: 'debug' });
    return { ok: true, card };
  }
  // Can this card be hired now? → { ok, why, fee, card }
  function hireCheck(cardId) {
    const f = findCard(cardId);
    if (!f) return { ok: false, why: 'That candidate has gone' };
    const { card, ch } = f;
    const fee = hireFee(card);
    const why = whyNot(card, channelById(ch));
    if (why) return { ok: false, why, fee, card };
    if (team.roster.length >= staffCap()) {
      const nx = nextCapRank();
      return { ok: false, why: `The team is full (${team.roster.length} of ${staffCap()})${nx ? `: Rank ${nx.id} makes room for ${RECRUIT.staffCaps[nx.id]}` : ''}`, fee, card };
    }
    if (!money.affordable(fee)) return { ok: false, why: `Needs ${fmt(fee)} Credits for the hiring fee`, fee, card };
    return { ok: true, why: null, fee, card };
  }
  function hire(cardId) {
    const chk = hireCheck(cardId);
    if (!chk.ok) return { ok: false, reason: chk.why };
    const { ch } = findCard(cardId);
    const c = ch === 'special' ? state.debugCards.splice(state.debugCards.findIndex((x) => x.id === cardId), 1)[0] : boards[ch].take(cardId);
    money.economy.add('credits', -chk.fee, `Hiring fee: ${c.name}`, 'hiring');
    const s = team.staff.addFromDefinition({ id: c.personId, name: c.name, role: c.role, tier: c.tier, startLevel: c.level, stats: c.stats, salary: c.salary, traits: c.traits, art: c.art });
    s.assigned = true; // they have a garage routine from day one (no idle-morale loss)
    s.counters.hiredDay = today();
    if (c.generic) s.counters.generic = 1;
    for (const b of Object.values(boards)) b.former = b.former.filter((x) => x.personId !== c.personId);
    bus.emit('staff:hired', { staff: s, channel: ch });
    bus.emit('team:changed', { staff: s, what: 'hired' });
    return { ok: true, staff: s, fee: chk.fee };
  }
  // Why this person can't be let go now (null = they can). extraBusy(id) → a reason from training etc.
  let extraBusy = () => null;
  function letGoWhy(id) {
    const s = team.get(id);
    if (!s) return 'Not on the team';
    if (team.roster.length <= 1) return 'The team needs someone';
    const job = team.cars.active;
    if (job && job.slots.includes(id)) return `On the ${job.name} team: finish the car first`;
    return extraBusy(id);
  }
  function letGo(id) {
    const why = letGoWhy(id);
    if (why) return { ok: false, reason: why };
    const founder = team.isFounder(id);
    const s = team.staff.remove(id); // core emits 'staff:removed'
    // They may turn up again later on a board that finds their tier (never the founder).
    if (!founder) {
      const person = { personId: s.id, name: s.name, role: s.role, tier: s.tier, level: s.level, stats: { ...s.stats }, salary: s.salary, traits: [...s.traits], art: s.art, generic: !!s.counters?.generic };
      for (const ch of BOARD_CHANNELS) if (ch.weights[s.tier]) boards[ch.id].release(person);
    }
    bus.emit('staff:letGo', { id: s.id, name: s.name, founder });
    bus.emit('team:changed', { staff: s, what: 'letGo' });
    return { ok: true, staff: s };
  }

  // --- the day --------------------------------------------------------------------------------------------------------
  bus.on('clock:day', () => {
    if (freeInDays() > 0) return;
    state.lastFreeDay = today();
    for (const ch of BOARD_CHANNELS) if (chOpen(ch)) draw(ch.id, 'free');
  });

  const api = {
    boards,
    channels: CHANNELS,
    state,
    ads,
    provider, // the pretend ad provider (tests / debug: provider.setNext('ad', 'cancel'))
    store,
    channelWhy,
    isOpen: (id) => chOpen(channelById(id)),
    cardsOf: (id) => (id === 'special' ? state.debugCards : (boards[id]?.cards ?? [])),
    debugSpawn,
    get cards() {
      return allCards();
    },
    whyNot,
    eligibleNamed: (chId = null) => ROSTER.filter((d) => !whyNot(cardOfDef(d), chId ? channelById(chId) : null)),
    missingRoles,
    staffCap,
    nextCapRank,
    refreshCost,
    refreshWhy,
    refresh,
    tokenWhy,
    refreshWithTokens,
    adWhy,
    refreshWithAd,
    freeInDays,
    hireCheck,
    hire,
    letGoWhy,
    letGo,
    set extraBusy(fn) {
      extraBusy = fn;
    },
    newGame() {
      for (const b of Object.values(boards)) b.reset();
      Object.assign(state, { lastFreeDay: today(), paid: { month: -1, count: 0 }, nextGeneric: 1, debugCards: [] });
      openBoards('start');
    },
    serialize: () => JSON.parse(JSON.stringify({ boards: Object.fromEntries(Object.entries(boards).map(([k, b]) => [k, b.serialize()])), state, ads: ads.serializeAccount() })),
    // A save from before Milestone 12: fresh boards for the open channels, the free-refresh clock from today.
    load(data) {
      for (const [k, b] of Object.entries(boards)) b.load(data?.boards?.[k] ?? null);
      Object.assign(state, { lastFreeDay: today(), paid: { month: -1, count: 0 }, nextGeneric: 1, debugCards: [] }, data?.state ?? {});
      ads.loadAccount(data?.ads ?? null);
      openBoards(data ? 'open' : 'start');
    },
  };
  return api;
}
