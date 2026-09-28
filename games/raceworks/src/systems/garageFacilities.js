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
import { FACILITIES, REST_SPOT, PROPS, SELL_REFUND_PCT, STARTER_AREA, EXPANSIONS, ENTRANCE, START_LAYOUT, PHASE_AREAS, BUILD_TEXT } from '../../data/facilities.js';
import { RANKS } from '../../data/economy.js';

export const FACILITY_DEFS = Object.fromEntries([...FACILITIES, REST_SPOT, ...PROPS].map((d) => [d.id, { ...d, w: d.size.w, h: d.size.h }]));

export function createGarageFacilities({ bus, money, research = () => new Set() }) {
  const system = new FacilitySystem({
    bus,
    defs: FACILITY_DEFS,
    area: { cols: STARTER_AREA.cols, rows: STARTER_AREA.rows },
    zones: EXPANSIONS.map((z) => ({ ...z })),
    entrance: ENTRANCE,
    sellRefundPct: SELL_REFUND_PCT,
    zoneShown: (z) => !z.secret,
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
  // A wing opens by itself when the team reaches its rank (Milestone 10: the Bay Extension only; the higher wings stay
  // locked, greyed floor; the Ghost Annex stays hidden). Returns the zones opened.
  function syncExpansions() {
    const opened = [];
    for (const z of EXPANSIONS) {
      if (z.openInM10 && z.rank && !system.isOwned(z.id) && hasRank(z.rank) && system.openZone(z.id)) opened.push(z);
    }
    return opened;
  }
  bus.on('reputation:rankUp', () => syncExpansions());

  // Every wing and what state it is in: open · locked (greyed) · hidden.
  const expansions = () => [
    { id: STARTER_AREA.id, name: STARTER_AREA.name, state: 'open', col: 0, row: 0, w: STARTER_AREA.cols, h: STARTER_AREA.rows },
    ...EXPANSIONS.map((z) => ({ ...z, state: system.isOwned(z.id) ? 'open' : z.secret ? 'hidden' : 'locked', why: z.openInM10 ? `Opens at Rank ${z.rank}` : `Rank ${z.rank} · opens in a later update` })),
  ];

  // --- the effect queries -------------------------------------------------------------------------------------------
  const bonus = (key) => system.total(key);
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
      for (const d of Object.values(FACILITY_DEFS)) for (const e of d.effects) if (e.key.startsWith('dev.')) out[e.key.slice(4)] = bonus(e.key);
      return out;
    },

    // --- what's here ------------------------------------------------------------------------------------------------
    items: () => system.placed,
    builtIds: () => [...new Set(system.placed.map((p) => p.def))],
    has: (defId) => system.has(defId),
    expansions,
    syncExpansions,

    // Why a facility can't be bought yet (null = it can), from its unlock rule.
    lockReason(defId) {
      const u = FACILITY_DEFS[defId]?.unlock ?? {};
      if (u.rank && !hasRank(u.rank)) return `Needs Rank ${u.rank}`;
      if (u.research && !research().has(u.research)) return `Needs research: ${u.research}`;
      return null;
    },
    status(defId) {
      const def = FACILITY_DEFS[defId];
      if (!def) return null;
      const owned = system.has(defId);
      const why = owned ? BUILD_TEXT.owned : api.lockReason(defId) ?? (money.economy.isBlocked('facility') ? BUILD_TEXT.debt : !money.affordable(def.cost) ? `Needs ${def.cost.toLocaleString('en-US')} Credits` : null);
      return { def, owned, ok: !why, why, locked: !!api.lockReason(defId) };
    },
    // The shop: every bible facility here (F01–F15), ready ones first, then locked, then the ones already built.
    shopList: () =>
      FACILITIES.map((f) => api.status(f.id)).sort((a, b) => a.owned - b.owned || a.locked - b.locked || a.def.cost - b.def.cost || a.def.id.localeCompare(b.def.id)),

    // Buy one: placed on the free spot nearest `near` (a cell), then paid through the ledger. Move it after in Build Mode.
    buy(defId, near = null) {
      const s = api.status(defId);
      if (!s?.ok) return { ok: false, reason: s?.why ?? 'Unknown facility' };
      const spot = system.findSpot(defId, 0, near);
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
