// The garage's facilities (Milestone 10, bible §19): the shared core/FacilitySystem (layout, footprints, the walkway
// rule, the effect sums) driven by RACEWORKS data (data/facilities.js), plus the game's rules — unlocks, money through
// the Milestone 5 ledger, no building on Emergency Credit, what may be sold, and the expansions opening with rank.
//
// Effect queries — every system asks these, never "is F05 built?":
//   bonus(key)                 the sum of one effect over the garage (core FacilitySystem.total)
//   phaseSpeedPct(phaseId)     +% speed for a car phase (PHASE_AREAS: Chassis & Aero counts chassis + aero)
//   workPct(role)              +% work from one staff role on car phases
//   unlocked(feature)          a feature a facility opens (Auto Training, the sponsor portfolio…) — stored for later
//   materialPrice(credits)     a car's class + parts price after the material cost bonus
// Player actions (each → { ok, reason, … }): buy(defId, near) · move(uid, col, row) · sell(uid)
// Readers: system (the core FacilitySystem) · items() · status(defId) · shopList() · sellWhy(uid) · expansions()
//
// Events (core): 'facility:placed' / 'facility:moved' / 'facility:sold' / 'facility:expansion' / 'facility:layout';
// and here 'facility:bought' { item, cost }.
import { FacilitySystem } from '../../../../core/FacilitySystem.js';
import { rankIndexOf } from '../../../../core/CompanyRank.js';
import { FACILITIES, REST_SPOT, PROPS, SELL_REFUND_PCT, STARTER_AREA, EXPANSIONS, ENTRANCE, START_LAYOUT, PHASE_AREAS, BUILD_TEXT, FACILITY_LEVELS, NO_SCALE, NO_SCALE_PREFIX, LEVEL_BONUS } from '../../data/facilities.js';
import { RANKS } from '../../data/economy.js';
import { nodeLabel } from './research.js';

// Milestone 25b: counts and unlock flags never scale with a level (data NO_SCALE); a facility with only those gets its
// LEVEL_BONUS (nothing at level 1). The Rest Spot and props have no levels (levels: false).
const noScale = (key) => NO_SCALE.includes(key) || NO_SCALE_PREFIX.some((p) => key.startsWith(p));
const leveled = (d) => ({ ...d, effects: [...d.effects.map((e) => (noScale(e.key) ? { ...e, scale: false } : e)), ...(LEVEL_BONUS[d.id] ?? []).map((e) => ({ ...e, levelMult: [0, 1, 2], levelOnly: true }))] });
export const FACILITY_DEFS = Object.fromEntries([...FACILITIES.map(leveled), { ...REST_SPOT, levels: false }, ...PROPS.map((p) => ({ ...p, levels: false }))].map((d) => [d.id, { ...d, w: d.size.w, h: d.size.h }]));

// research() → the finished research nodes (Milestone 11); extraBonus(key) / extraKeys() → effects from elsewhere (research
// bonuses) added into bonus(key), so every system still asks the one query.
// Milestone 25: secrets() → the secret ids found (team.unlocks.secrets): a secret facility (F34 / F35, unlock.secret) is in
// the shop only once its secret is found, and the Ghost Annex (a secret room) opens with SEC-FAC-02.
// Milestone 25b: today() → the game day (upgrades take days; they finish on 'clock:day').
// Milestone 27: progress() → { year, trophies } for an unlock by year and trophies won (F29 Heritage Room).
export function createGarageFacilities({ bus, money, research = () => new Set(), secrets = () => new Set(), extraBonus = () => 0, extraKeys = () => [], today = () => 0, progress = () => ({ year: 1, trophies: 0 }) }) {
  const system = new FacilitySystem({
    bus,
    levels: { max: FACILITY_LEVELS.max, mult: FACILITY_LEVELS.mult }, // Milestone 25b
    defs: FACILITY_DEFS,
    area: { cols: STARTER_AREA.cols, rows: STARTER_AREA.rows },
    zones: EXPANSIONS.map((z) => ({ ...z })),
    entrance: ENTRANCE,
    sellRefundPct: SELL_REFUND_PCT,
    zoneShown: (z) => !z.secret || secrets().has(z.secret), // (Milestone 25: a secret room once its secret is found)
    reasons: {
      outside: 'Outside the garage',
      locked: 'That floor is locked — it opens with a later expansion',
      door: 'Keep the doorway clear',
      blocked: 'That would cut off {name}: every station needs a way in',
    },
  });

  const rankIndex = () => money.reputation.highestRankIndex;
  const hasRank = (id) => rankIndex() >= rankIndexOf(RANKS, id);

  // --- expansions (bible §19.1) ------------------------------------------------------------------------------------
  // A wing opens by itself, free, when the team reaches its rank (Bay Extension D, Engineering Wing C, Race Operations
  // Wing B, World Team Annex A — in that order, each needs the one before; greyed floor until then). The Ghost Annex
  // stays hidden until its secret. Returns the zones opened.
  function syncExpansions() {
    const opened = [];
    for (const z of EXPANSIONS) {
      if (z.rank && !system.isOwned(z.id) && hasRank(z.rank) && system.openZone(z.id)) opened.push(z);
      if (z.secret && !system.isOwned(z.id) && secrets().has(z.secret) && system.openZone(z.id)) opened.push(z); // Milestone 25
    }
    return opened;
  }
  bus.on('reputation:rankUp', () => syncExpansions());

  // Every wing and what state it is in: open · locked (greyed) · hidden.
  const expansions = () => [
    { id: STARTER_AREA.id, name: STARTER_AREA.name, state: 'open', col: 0, row: 0, w: STARTER_AREA.cols, h: STARTER_AREA.rows },
    ...EXPANSIONS.map((z) => ({ ...z, state: system.isOwned(z.id) ? 'open' : z.secret ? 'hidden' : 'locked', why: `Opens at Rank ${z.rank}` })),
  ];

  // --- levels (Milestone 25b, series common feature §3) -------------------------------------------------------------
  const L = FACILITY_LEVELS;
  const rankIds = RANKS.map((r) => r.id);
  // The rank a facility is built at (its unlock rank; Start = E; research / secret ones: data placeholders).
  function buildRank(def) {
    const u = def.unlock ?? {};
    if (u.rank) return u.rank;
    if (u.secret) return L.SECRET_BUILD_RANK;
    if (u.research) return L.RESEARCH_BUILD_RANK;
    return rankIds[0];
  }
  const rankFor = (def, to) => rankIds[Math.min(rankIds.length - 1, rankIndexOf(RANKS, buildRank(def)) + L.rankStep[to - 1])];
  const upgradeCost = (def, to) => Math.round(def.cost * L.costMult[to - 1]);
  // One placed facility's level and its next upgrade: { level, max, mult, pending, next: { to, cost, days, rank, ok, why } }
  function levelStatus(uid) {
    const it = system.get(uid);
    if (!it) return null;
    const def = FACILITY_DEFS[it.def];
    if (def.levels === false) return null;
    const level = system.level(uid);
    const pending = system.upgradePending(uid);
    const out = { uid, defId: it.def, level, max: L.max, mult: L.mult[level - 1], pending, next: null };
    if (level < L.max) {
      const to = level + 1;
      const cost = upgradeCost(def, to);
      const rank = rankFor(def, to);
      const why = pending ? `Upgrading: ready on day ${pending.doneDay + 1}` : !hasRank(rank) ? `Needs Rank ${rank}` : money.economy.isBlocked('facility') ? BUILD_TEXT.debt : !money.affordable(cost) ? `Needs ${cost.toLocaleString('en-US')} Credits` : null;
      out.next = { to, cost, days: L.days[to - 1], rank, mult: L.mult[to - 1], ok: !why, why };
    }
    return out;
  }
  function upgrade(uid) {
    const st = levelStatus(uid);
    if (!st) return { ok: false, reason: 'This can’t be upgraded' };
    if (!st.next) return { ok: false, reason: 'Already at the top level' };
    if (!st.next.ok) return { ok: false, reason: st.next.why };
    const def = FACILITY_DEFS[st.defId];
    const r = system.startUpgrade(uid, { cost: st.next.cost, today: today(), days: st.next.days });
    if (!r.ok) return { ok: false, reason: r.why };
    money.economy.spend('credits', st.next.cost, `Upgrade: ${def.name} to level ${st.next.to}`, 'facilities');
    bus.emit('facility:upgradeBought', { uid, defId: st.defId, to: st.next.to, cost: st.next.cost, doneDay: r.doneDay });
    if (st.next.days <= 0) bus.emit('facility:upgraded', { uid, defId: st.defId, level: system.level(uid) });
    return { ok: true, to: st.next.to, cost: st.next.cost, doneDay: r.doneDay };
  }
  bus.on('clock:day', () => {
    for (const d of system.tickUpgrades(today())) bus.emit('facility:upgraded', { uid: d.uid, defId: system.get(d.uid)?.def, level: d.level });
  });

  // --- the effect queries -------------------------------------------------------------------------------------------
  const bonus = (key) => system.total(key) + extraBonus(key);
  const api = {
    system,
    defs: FACILITY_DEFS,
    bonus,
    phaseSpeedPct: (phaseId) => (PHASE_AREAS[phaseId] ?? []).reduce((t, area) => t + bonus(`phaseSpeedPct.${area}`), 0),
    workPct: (role) => bonus(`workPct.${role}`),
    unlocked: (feature) => bonus(`unlock.${feature}`) > 0,
    materialPrice: (credits) => Math.round(credits * (1 + bonus('materialCostPct') / 100)),
    // The development bonus on each car stat: { SPD: 2.5, … }.
    devBonus() {
      const out = {};
      const keys = [...Object.values(FACILITY_DEFS).flatMap((d) => d.effects.map((e) => e.key)), ...extraKeys()];
      for (const k of keys) if (k.startsWith('dev.')) out[k.slice(4)] = bonus(k);
      return out;
    },

    // --- what's here ------------------------------------------------------------------------------------------------
    items: () => system.placed,
    levelStatus, // Milestone 25b
    upgrade,
    level: (uid) => system.level(uid),
    facilityLevel: (defId) => system.levelOfDef(defId), // 0 when it isn't built (the Secret Engine fact)
    levels: () => system.placed.filter((p) => FACILITY_DEFS[p.def].levels !== false).map((p) => ({ id: p.def, level: system.level(p.uid) })),
    builtIds: () => [...new Set(system.placed.map((p) => p.def))],
    has: (defId) => system.has(defId),
    expansions,
    syncExpansions,

    // Why a facility can't be bought yet (null = it can), from its unlock rule.
    lockReason(defId) {
      const u = FACILITY_DEFS[defId]?.unlock ?? {};
      if (u.secret && !secrets().has(u.secret)) return 'Secret'; // Milestone 25
      if (u.rank && !hasRank(u.rank)) return `Needs Rank ${u.rank}`;
      if (u.research && !research().has(u.research)) return `Needs ${nodeLabel(u.research)} research`;
      if (u.year && progress().year < u.year) return `Needs Year ${u.year}`; // Milestone 27
      if (u.trophies && progress().trophies < u.trophies) return `Needs ${u.trophies} trophies (${progress().trophies} so far)`;
      return null;
    },
    status(defId) {
      const def = FACILITY_DEFS[defId];
      if (!def) return null;
      const owned = system.has(defId);
      const why = owned ? BUILD_TEXT.owned : api.lockReason(defId) ?? (money.economy.isBlocked('facility') ? BUILD_TEXT.debt : !money.affordable(def.cost) ? `Needs ${def.cost.toLocaleString('en-US')} Credits` : null);
      return { def, owned, ok: !why, why, locked: !!api.lockReason(defId) };
    },
    // The shop: every bible facility here (F01–F15, Milestone 11 adds the ones research opens), ready ones first, then
    // locked, then the ones already built.
    shopList: () =>
      FACILITIES.filter((f) => !f.unlock.secret || secrets().has(f.unlock.secret)) // (Milestone 25: a secret one only once found)
        .map((f) => api.status(f.id)).sort((a, b) => a.owned - b.owned || a.locked - b.locked || a.def.cost - b.def.cost || a.def.id.localeCompare(b.def.id)),

    // Buy one: placed on the free spot nearest `near` (a cell), then paid through the ledger. Move it after in Build Mode.
    buy(defId, near = null) {
      const s = api.status(defId);
      if (!s?.ok) return { ok: false, reason: s?.why ?? 'Unknown facility' };
      const room = s.def.secretRoom && system.isOwned(s.def.secretRoom) ? EXPANSIONS.find((z) => z.id === s.def.secretRoom) : null;
      const spot = (room && system.findSpot(defId, 0, { col: room.col + 1, row: room.row + 1 })) || system.findSpot(defId, 0, near); // (Milestone 25: F35 in its annex)
      if (!spot) return { ok: false, reason: BUILD_TEXT.noSpot };
      const r = system.place(defId, spot.col, spot.row);
      if (!r.ok) return { ok: false, reason: r.reason };
      money.economy.spend('credits', s.def.cost, `Built: ${s.def.name}`, 'facilities');
      bus.emit('facility:bought', { item: r.item, cost: s.def.cost });
      return { ok: true, item: r.item, cost: s.def.cost };
    },
    // Can this facility stand here? (Build Mode's red / green footprint.) → { ok, reason }
    check: (defId, col, row, ignoreUid = null) => system.check(defId, col, row, 0, ignoreUid),
    move(uid, col, row) {
      const r = system.move(uid, col, row, 0);
      return r.ok ? { ok: true, item: r.item } : { ok: false, reason: r.reason };
    },
    sellWhy(uid) {
      const it = system.get(uid);
      if (!it) return 'Not in the garage';
      return FACILITY_DEFS[it.def].keep ?? null;
    },
    refundOf: (uid) => (system.get(uid) ? system.sellValue(system.get(uid)) : 0),
    // Sell: 50% of the build price back through the ledger (allowed on Emergency Credit — it brings money in).
    sell(uid) {
      const why = api.sellWhy(uid);
      if (why) return { ok: false, reason: why };
      const r = system.remove(uid);
      if (r.refund) money.economy.add('credits', r.refund, `Sold: ${FACILITY_DEFS[r.item.def].name}`, 'facilities');
      return { ok: true, refund: r.refund, item: r.item };
    },

    // --- a new team, save / load ---------------------------------------------------------------------------------------
    newGame() {
      system.reset();
      for (const p of START_LAYOUT) {
        const r = system.place(p.def, p.col, p.row);
        if (!r.ok) throw new Error(`Starting layout: ${p.def} at ${p.col},${p.row}: ${r.reason}`);
      }
      syncExpansions();
    },
    serialize: () => system.serialize(),
    // A save from before Milestone 10 (no layout) gets the starting garage — its Pit Bay, Strategy Desk and rest spot
    // stand where they always did.
    load(s) {
      if (!s?.placement) api.newGame();
      else {
        system.load(s);
        syncExpansions();
      }
    },
  };
  return api;
}
