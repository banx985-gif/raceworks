// New Game+ 1–3 (Milestone 28, bible §37, §36.9; save-slot spec §8) on core/NgPlusSystem with data/ngplus.js NGPLUS.
//
// A finished run (its Year-16 ending reached) starts a NEW team in another slot — the parent's save is only read, never
// written. What carries over:
//   • account-wide, automatically (bible §37.2): combos, secret recipes, achievements, records, Prestige Tokens,
//     mascots / cosmetics, discovered staff identities, drill medals — they already live on the account record (the
//     account blocks), so the new run simply reads the same blocks; nothing is copied;
//   • picked by the player: Legacy Staff (1 / 2 / 3 from the parent's roster: stats, level, traits, salary and career
//     story kept, a Legacy tag; picking the parent's founder sets the founder history's legacyStaff), Legacy Car
//     Blueprints (1 / 1 / 2 of the parent's finished cars: that exact class + parts, buildable again once they are open
//     in the new run), from NG+2 one normal facility blueprint (its first build at NGPLUS.facility.pct off);
//   • research memory: 15 / 25 / 35 % of the RP the parent's completed research cost, as a starting RP bonus.
// Everything else resets (NGPLUS.fields.reset): the new team is built by the normal M4b new game (Team.newGame) with the
// carry package applied. The NG+ run itself: rival development +8 / 14 / 20 % in the championship bands, applicant
// boards one tier higher, clue stages one higher for rules with progress, the NG+ level fact for the secrets (Back to
// Basics NG+1, Night King NG+2, Legacy Line / Project Zero NG+3) and the Legacy chain (a person's id, run to run).
// Optional challenge modifiers are flags on the run: they change its numbers and nothing reads them for a reward.
//
//   offerFrom(parent)                → what the New Game+ Setup screen shows (parent = a Team loaded with the finished
//                                      run's save; only read): { level, parentLevel, picks, options, researchPct, rpBonus,
//                                      rivalPct, modifiers, … }
//   problems(offer, choices)         → [text] (empty = fine); choices { legacyStaff: [id], blueprints: [id], facility, modifiers: [id] }
//   snapshotOf(parent)               → every declared field (core NgPlusSystem refuses an undeclared one)
//   buildCarry(parent, choices, { parentSlot, slot }) → the JSON package Team.newGame(setup, carry) builds the run from
//   ngBlockOf(carry) / legacyModel(entry) — used by Team.newGame
//   createNgPlusRecords({ bus, team }) → team.ngplus: the ACCOUNT block 'ngplus' (lineage of every NG+ run started,
//                                      the staff identities met) — .setAccount / .loadAccount / .lineage / .known
import { NgPlusSystem } from '../../../../core/NgPlusSystem.js';
import { NGPLUS } from '../../data/ngplus.js';
import { RESEARCH } from '../../data/research.js';
import { FACILITIES, START_LAYOUT } from '../../data/facilities.js';
import { CLASSES } from '../../data/cars.js';
import { familyOfCar } from './carVisual.js';

export const ngRules = () => new NgPlusSystem({ rules: NGPLUS });
const sys = ngRules();
const copy = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const at = (list, level) => list[Math.max(0, Math.min(level, list.length - 1))] ?? 0;
const RP_OF = Object.fromEntries(RESEARCH.map((n) => [n.id, n.rp]));
const START_IDS = new Set(START_LAYOUT.map((x) => x.def));
const MODS = Object.fromEntries(NGPLUS.modifiers.map((m) => [m.id, m]));

export const levelOf = (team) => team?.ngPlus?.level ?? 0;
export const nextLevel = (parent) => sys.levelAfter(levelOf(parent));
export const researchPct = (level) => at(NGPLUS.researchPctByLevel, level);
export const rivalPctAt = (level) => at(NGPLUS.rivalPctByLevel, level);
export const modifierById = (id) => MODS[id] ?? null;
export const picksAt = (level) => ({ legacy: sys.picks('legacy', level), blueprints: sys.picks('blueprints', level), facility: level >= NGPLUS.facility.fromLevel ? 1 : 0 });
// The RP the finished run's completed research cost × the level's %.
export const researchBonus = (parent, level) => Math.round((parent.research.doneIds().reduce((t, id) => t + (RP_OF[id] ?? 0), 0) * researchPct(level)) / 100);
// Normal facilities (bible §37.2): not secret, not a prop, not already in the starting garage.
export const facilityOptions = () =>
  FACILITIES.filter((f) => !f.unlock?.secret && !f.prop && !START_IDS.has(f.id)).map((f) => ({ id: f.id, name: f.name, cost: f.cost, price: Math.round((f.cost * (100 - NGPLUS.facility.pct)) / 100), art: f.art }));

// A career record summed with the one it carried in (a Legacy person's story across runs).
const addUp = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) if (typeof v === 'number') out[k] = (out[k] ?? 0) + v;
  return out;
};

// Everything that travels with one Legacy Staff member (from the parent run).
function legacyEntry(parent, s) {
  const founder = parent.isFounder(s.id);
  const career = addUp(parent.careers.people[s.id] ?? {}, parent.ngPlus?.careers?.[s.id] ?? {});
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    tier: s.tier,
    level: s.level ?? 1,
    art: s.art,
    staff: copy(s.toJSON ? s.toJSON() : s),
    career,
    founder,
    founderHistory: founder ? copy(parent.founder.history) : null,
    chain: parent.ngPlus?.chains?.[s.id] ?? 0, // NG+ runs in a row this person has already been carried through
  };
}
// One finished car of the parent as a blueprint recipe.
function blueprintEntry(parent, rec) {
  const r = rec.result ?? {};
  return { id: `car${rec.number}`, name: rec.name, classId: r.classId ?? 'clubHatch', className: CLASSES[r.classId]?.name ?? 'Car', parts: [...(r.parts ?? [])], quality: r.quality ?? 0, rating: r.rating ?? 0, family: familyOfCar(rec, parent)?.id ?? null, art: r.art ?? null, from: parent.setup.teamName };
}

export function offerFrom(parent) {
  const parentLevel = levelOf(parent);
  const level = sys.levelAfter(parentLevel);
  return {
    ended: !!parent.ending?.reached,
    level,
    parentLevel,
    parentRunId: parent.runId,
    parentTeam: parent.setup.teamName,
    parentGrade: parent.ending?.result?.grade?.band ?? null,
    picks: picksAt(level),
    options: {
      legacy: parent.roster.map((s) => legacyEntry(parent, s)),
      blueprints: parent.cars.cars.list().filter((rec) => rec.result).map((rec) => blueprintEntry(parent, rec)),
      facilities: level >= NGPLUS.facility.fromLevel ? facilityOptions() : [],
    },
    researchPct: researchPct(level),
    rpBonus: researchBonus(parent, level),
    rivalPct: rivalPctAt(level),
    facilityPct: NGPLUS.facility.pct,
    modifiers: NGPLUS.modifiers.map((m) => ({ ...m })),
  };
}

export function problems(offer, choices = {}) {
  const out = sys.checkChoices({ legacyStaff: choices.legacyStaff ?? [], blueprints: choices.blueprints ?? [] }, { legacy: offer.options.legacy, blueprints: offer.options.blueprints }, offer.level);
  if (!offer.ended) out.push('This run has not reached its Year-16 ending');
  if (choices.facility) {
    if (!offer.picks.facility) out.push(`No facility blueprint at NG+${offer.level}`);
    else if (!offer.options.facilities.some((f) => f.id === choices.facility)) out.push(`Unknown facility ${choices.facility}`);
  }
  for (const id of choices.modifiers ?? []) if (!MODS[id]) out.push(`Unknown challenge ${id}`);
  return out;
}

// Every declared field of the finished run (always / chosen pools / reset). Account-wide fields are references: they
// stay on the account record, which the new run reads as it is.
export function snapshotOf(parent) {
  const offer = offerFrom(parent);
  const account = (block) => ({ account: block });
  return {
    combos: account('combos'),
    secretRecipes: account('secrets'),
    achievements: account('achievements'),
    records: account('achievements.records'),
    prestigeTokens: account('secrets.flags.prestigeTokens + ending.awarded'),
    mascots: account('secrets.flags'),
    staffIdentities: account('ngplus.known'),
    drillMedals: account('drills'),
    legacyStaff: offer.options.legacy,
    blueprints: offer.options.blueprints,
    facilityBlueprint: Object.fromEntries(offer.options.facilities.map((f) => [f.id, { id: f.id, pct: NGPLUS.facility.pct }])),
    credits: parent.money.credits,
    rp: parent.money.rp,
    racingTokens: parent.money.tokens,
    reputation: parent.money.reputation.value,
    championships: parent.championships.titles(),
    sponsors: parent.sponsors.deals.map((d) => d.id),
    contracts: parent.money.contracts.active.map((c) => c.id),
    facilities: parent.facilities.builtIds(),
    staff: parent.roster.map((s) => s.id),
    cars: parent.cars.cars.list().map((c) => c.number),
    research: parent.research.doneIds(),
    calendar: parent.clock.totalDays,
    items: parent.items.serialize?.() ?? null,
    events: parent.events.serialize?.() ?? null,
    runSecrets: parent.secrets.serialize?.() ?? null,
    ending: parent.ending.serialize?.() ?? null,
  };
}

// The package the new team is built from (plain JSON).
export function buildCarry(parent, choices = {}, { parentSlot = null, slot = null } = {}) {
  const offer = offerFrom(parent);
  const bad = problems(offer, choices);
  if (bad.length) throw new Error(bad[0]);
  const t = sys.transition({ snapshot: snapshotOf(parent), choices: { legacyStaff: choices.legacyStaff ?? [], blueprints: choices.blueprints ?? [], facilityBlueprint: choices.facility ?? null }, level: offer.level });
  const legacy = t.chosen.legacyStaff;
  return {
    version: 1,
    level: offer.level,
    parentLevel: offer.parentLevel,
    parentRunId: parent.runId,
    parentSlot,
    slot,
    parentTeam: offer.parentTeam,
    parentGrade: offer.parentGrade,
    legacy,
    blueprints: t.chosen.blueprints,
    facility: t.chosen.facilityBlueprint ?? null,
    modifiers: [...new Set(choices.modifiers ?? [])],
    rpBonus: offer.rpBonus,
    rivalPct: offer.rivalPct,
    chains: Object.fromEntries(legacy.map((e) => [e.id, (e.chain ?? 0) + 1])),
    reset: t.reset,
  };
}

// The new run's ngPlus block (saved with the slot).
export function ngBlockOf(carry) {
  const founder = carry.legacy.find((e) => e.founder);
  return {
    level: carry.level,
    parentRunId: carry.parentRunId,
    parentSlot: carry.parentSlot ?? null,
    parentTeam: carry.parentTeam ?? '',
    parentGrade: carry.parentGrade ?? null,
    legacyStaff: carry.legacy.map((e) => e.id),
    legacyFounder: founder ? { id: founder.id, history: { ...(founder.founderHistory ?? {}), legacyStaff: true } } : null,
    careers: Object.fromEntries(carry.legacy.map((e) => [e.id, copy(e.career ?? {})])),
    blueprints: copy(carry.blueprints ?? []),
    facility: carry.facility ? { id: carry.facility.id, pct: carry.facility.pct, used: false } : null,
    modifiers: [...(carry.modifiers ?? [])],
    rpBonus: carry.rpBonus ?? 0,
    rivalPct: carry.rivalPct ?? 0,
    chains: { ...(carry.chains ?? {}) },
  };
}

// A Legacy Staff member as they join the new team: their stats, level, XP, traits, salary and portrait as they were;
// fresh Energy / Morale and statuses, on the job, hired on day 0, with the Legacy tag.
export function legacyModel(entry, level) {
  const s = copy(entry.staff);
  return {
    ...s,
    energy: 100,
    morale: 70,
    status: {},
    activity: 'idle',
    assigned: true,
    monthsUnassigned: 0,
    counters: { ...(s.counters ?? {}), hiredDay: 0, legacy: level, generic: s.counters?.generic ?? false },
  };
}

// --- the account block: the lineage and the staff identities met ------------------------------------------------------
const ACCOUNT_VERSION = 1;
export function createNgPlusRecords({ bus, team }) {
  let account = { load: async () => null, save: async () => {} };
  let lineage = []; // { runId, parentRunId, level, team, parentTeam, legacy: [{ id, name }], blueprints: [name], modifiers, at }
  let known = []; // person ids ever on a team on this device (bible §37.2 discovered staff identities)
  const data = () => copy({ version: ACCOUNT_VERSION, lineage, known });
  const save = () => account.save(data());
  function meet(ids) {
    const before = known.length;
    known = [...new Set([...known, ...ids.filter(Boolean)])];
    return known.length !== before;
  }
  bus.on('staff:hired', ({ staff }) => staff?.id && meet([staff.id]) && save());
  return {
    setAccount(store) {
      account = store;
    },
    async loadAccount() {
      const d = (await account.load()) ?? null;
      lineage = copy(d?.lineage ?? []);
      known = [...(d?.known ?? [])];
    },
    accountData: data,
    get lineage() {
      return lineage;
    },
    get known() {
      return known;
    },
    // The new run is built: its place in the lineage (once per run id) and its starting people met.
    started(carry) {
      if (carry && team.runId && !lineage.some((l) => l.runId === team.runId)) {
        lineage.push({ runId: team.runId, parentRunId: carry.parentRunId, level: carry.level, team: team.setup.teamName, parentTeam: carry.parentTeam, legacy: carry.legacy.map((e) => ({ id: e.id, name: e.name, chain: carry.chains[e.id] })), blueprints: carry.blueprints.map((b) => b.name), modifiers: [...carry.modifiers], at: team.clock.totalDays });
      }
      meet(team.roster.map((s) => s.id));
      return save();
    },
    // A slot opened: its people count as met (a save from before Milestone 28 too).
    sync() {
      if (meet(team.roster.map((s) => s.id))) save();
    },
  };
}
