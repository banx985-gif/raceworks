// Items for staff (Milestone 25b, series common feature §4): the shared core/ItemSystem with RACEWORKS data
// (data/items.js). The Parts Store holds what the team has earned; an item given to one person raises one stat for good
// (×1.5 and a little Morale for a loved group, ×0.5 for a disliked one), never past their tier cap or the season's item
// points. Fitness items raise FIT: each point is +1% resting recovery (Team's restModifier reads fitnessPct()).
//
// Items only ever come from play — grant(source) refuses anything not in ITEM_SOURCES:
//   race (a race weekend result: chance by finish × the championship tier) · podium (a championship podium) · title ·
//   training (a weekly roll for someone on a course with high Morale) · sponsor (a deal's obligation met) · contract
//   (a contract paid) · wellWisher (a monthly roll fires the EV_WELL_WISHER event, whose 'item' effect sends
//   'event:item') · achievement ('achievement:unlocked', Milestone 26) · fans ('fans:gift' — a hook, nothing sends it yet).
// Never a shop, Racing Tokens or real money: nothing here reads the store or the token balance.
//
//   createItems({ bus, team, seed }) → { system, grant, give, preview, sell, store(), likesOf, receivedBy, pointsLeft,
//     fitnessPct(s), newGame, serialize, load }
//   Events: core's 'item:gained' / 'item:full' / 'item:given' / 'item:sold'; 'items:arrived' { item, source, text }.
import { ItemSystem } from '../../../../core/ItemSystem.js';
import { Rng } from '../../../../core/Rng.js';
import { ITEM_TYPES, ITEM_RARITIES, ITEM_RULES, ITEM_SOURCES, ITEM_GROUPS, FITNESS, likesFor, itemTypeById } from '../../data/items.js';
import { staffDefById } from '../../data/staff.js';
import { champById } from '../../data/championships.js';

const FIT = 'FIT';

export function createItems({ bus, team, seed = 'raceworks' }) {
  let rng = new Rng(`${seed}|items`);
  const staff = () => team.staff;
  const sys = new ItemSystem({
    types: ITEM_TYPES,
    rarities: ITEM_RARITIES,
    rules: ITEM_RULES,
    rng,
    bus,
    person: (id) => team.get(id) ?? null,
    statOf: (p, k) => (k === FIT ? (p.counters?.fitness ?? 0) : (p.stats[k] ?? 0)),
    statCap: (p, k) => (k === FIT ? FITNESS.cap : staff().statCap(p, k)),
    raise: (p, k, n) => {
      if (k === FIT) {
        p.counters ??= {};
        p.counters.fitness = Math.min(FITNESS.cap, (p.counters.fitness ?? 0) + n);
      } else p.stats[k] = Math.min(staff().statCap(p, k), (p.stats[k] ?? 0) + n);
    },
    morale: (p, n) => staff().changeMorale(p, n),
  });
  const S = ITEM_SOURCES;
  const groups = ITEM_GROUPS.map((g) => g.id);
  const season = () => team.clock.year;

  // Likes: the 50 named staff's come from data (role + trait); a generic recruit rolls theirs when they join (saved).
  function ensureLikes(id) {
    if (sys.likes[id]) return sys.likes[id];
    const def = staffDefById(id);
    if (def) sys.setLikes(id, likesFor(def));
    else sys.rollLikes(id, groups);
    return sys.likes[id];
  }
  const ensureAll = () => team.roster.forEach((s) => ensureLikes(s.id));
  bus.on('staff:hired', ({ staff: s }) => s && ensureLikes(s.id));

  // One item from a listed source (a random type, a rarity by that source's weights). Anything else is refused.
  function grant(source, { weights = null, text = null } = {}) {
    const src = S[source];
    if (!src) return null;
    const item = sys.add(sys.rollType(), sys.rollRarity(weights ?? src.weights ?? null), source, team.clock.totalDays);
    if (item) bus.emit('items:arrived', { item, source, text: text ?? src.text });
    return item;
  }
  const roll = (p) => p > 0 && rng.next() < p;

  // --- sources ------------------------------------------------------------------------------------------------------
  const tierOf = (entry) => (entry.champ ? champById(entry.champ.id)?.tier : null) ?? 'club';
  bus.on('race:finished', ({ race: e }) => {
    if (!e || e.kind !== 'weekend') return; // a debug Test Race pays nothing
    const me = e.result?.rows?.find((r) => r.isPlayer);
    if (!me || me.status === 'retired') return;
    const pos = me.pos;
    const bucket = pos === 1 ? 0 : pos === 2 ? 1 : pos === 3 ? 2 : pos <= 6 ? 3 : pos <= 10 ? 4 : 5;
    const tier = tierOf(e);
    if (roll(S.race.byFinish[bucket] * (S.race.tierMult[tier] ?? 1))) grant('race', { weights: S.race.tierWeights[tier], text: `${S.race.text}: P${pos}` });
    if (e.champ && pos <= 3 && roll(S.podium.chance)) grant('podium', { weights: S.race.tierWeights[tier] });
  });
  bus.on('championship:finished', ({ record }) => {
    if (!record?.title) return;
    for (let i = 0; i < S.title.count; i++) grant('title', { text: `${S.title.text}: ${champById(record.id)?.name ?? record.id}` });
  });
  bus.on('clock:day', () => {
    if (team.clock.totalDays % 7 !== 0) return; // weekly
    for (const s of team.roster) if (team.training?.trainingOf(s.id) && s.morale >= S.training.minMorale && roll(S.training.weeklyChance)) grant('training', { text: `${S.training.text}: ${s.name}` });
  });
  bus.on('sponsor:met', ({ def }) => {
    for (let i = 0; i < S.sponsor.onMet; i++) grant('sponsor', { text: `${S.sponsor.text}: ${def?.name ?? 'a sponsor'}` });
  });
  bus.on('contract:success', ({ contract }) => roll(S.contract.chance) && grant('contract', { text: `${S.contract.text}: ${contract?.title ?? ''}` }));
  bus.on('clock:month', () => roll(S.wellWisher.monthlyChance) && team.events?.fireItemEvent?.('EV_WELL_WISHER'));
  bus.on('event:item', ({ source }) => grant(S[source] ? source : 'wellWisher'));
  bus.on('achievement:unlocked', () => roll(S.achievement.chance) && grant('achievement'));
  bus.on('fans:gift', () => grant('fans')); // hook only
  bus.on('clock:year', () => sys.newPeriod(season()));
  // Arrivals go to the Inbox with a strip (never a pop-up over play).
  bus.on('items:arrived', ({ item, text }) => {
    const t = itemTypeById(item.type);
    team.events?.note?.({ icon: ITEM_RULES.storeIcon, title: `New item: ${t.name}`, body: `${ITEM_RARITIES[item.rarity].name} · raises ${t.group === 'fitness' ? 'Energy recovery' : t.stat} by ${ITEM_RARITIES[item.rarity].gain} · ${text}. Give it from the ${ITEM_RULES.storeName}.` });
  });
  // "The store is full" is said once, then again only after there has been room.
  let toldFull = false;
  bus.on('item:given', () => (toldFull = false));
  bus.on('item:sold', () => (toldFull = false));
  bus.on('item:full', () => !toldFull && (toldFull = true) && team.events?.note?.({ icon: ITEM_RULES.storeIcon, title: `The ${ITEM_RULES.storeName} is full`, body: `A new item could not be kept (${ITEM_RULES.inventoryMax} at most): give some out or sell spares.` }));

  const api = {
    system: sys,
    grant, // (tests / debug: by a listed source only)
    store: () => sys.inventory,
    get count() {
      return sys.inventory.length;
    },
    get max() {
      return ITEM_RULES.inventoryMax;
    },
    likesOf: (id) => ensureLikes(id),
    receivedBy: (id) => sys.received[id] ?? [],
    pointsLeft: (id) => sys.pointsLeft(id),
    preview: (uid, id) => (ensureLikes(id), sys.preview(uid, id)),
    give(uid, id) {
      ensureLikes(id);
      const r = sys.give(uid, id);
      if (r.ok) {
        const s = team.get(id);
        staff().refreshStatus?.(s);
        bus.emit('team:changed', { staff: s, what: 'item' });
      }
      return r;
    },
    sell(uid) {
      const it = sys.get(uid);
      const value = sys.sell(uid);
      if (value != null) team.money.economy.add('credits', value, `Sold a spare: ${itemTypeById(it.type)?.name ?? it.type}`, 'items');
      return value;
    },
    // Fitness: +% resting recovery for good (Team's restModifier).
    fitnessPct: (s) => (s?.counters?.fitness ?? 0) * FITNESS.recoveryPctPerPoint,
    newGame() {
      rng = new Rng(`${seed}|items|${team.setup.teamName}|${team.founder?.id}`);
      sys.rng = rng;
      sys.reset();
      sys.newPeriod(season());
      ensureAll();
    },
    serialize: () => ({ ...sys.serialize(), rng: rng.getState() }),
    // A save from before Milestone 25b: an empty store, this season's points, and everyone's likes (rolled for generics).
    load(data) {
      sys.load(data ?? null);
      if (data?.rng != null) rng.setState(data.rng);
      if (sys.period == null) sys.newPeriod(season());
      ensureAll();
    },
  };
  return api;
}
