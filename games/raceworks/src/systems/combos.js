// Combos (Milestone 22, bible §17): the 20 synergies of data/combos.js, checked when a car finishes its build (and when a
// race weekend's setup goes wet, for SYN06 Rain Runner); first discoveries recorded account-wide; near-miss clues.
//   evaluate(combo, ctx) → { met, failed: [atoms], held: n }      atomHolds(atom, ctx)
//   carCtx(team, { classId, parts, quality, stats, setupWet }) → what the atoms read
//   structuralCombos({ classId, parts }) → the combos a class and parts alone already make (the builder's preview)
//   clueText(combo, atom, ctx) → "Something about Club Hatch cars and its transmission…"
//   createComboRecords({ load, save }) — the ACCOUNT record (beside the drill records: it survives New Game+, slot deletes
//     and reloads): discovered { id → { day, team, car, recipe } }, clues { id → text }, rumours [{ id, text, kind }]
//   createCombos({ bus, team }) → combos
//     .forCar(job, prelim) → { ids, stats, near } — the car project's hook: the combos the finished car makes, their stat
//       bonuses (the project adds them as development points, so the normal stat pipeline and its cap hold) and near-misses
//     .records / .setRecords(r) · .discovered(id) · .clueOf(id) · .rumours() · .archive() (the Combo Archive's rows)
//     .checkSetup(race) — SYN06 on a wet setup · .knowledgePct(rec) · .wetStats(rec) · .raceStats(rec)
//     .debugSecrets — ?debug=1 only: secret atoms hold (SYN20) — never saved
//   A discovery pays the §17 RP (10 / 25 / 100 by tier) once for the account and emits 'combo:discovered' (the medium
//   moment); a new clue emits 'combo:clue'.
import { COMBOS, COMBO_RP, CLUE_WORDS, comboById } from '../../data/combos.js';
import { PARTS, CLASSES } from '../../data/cars.js';
import { champById } from '../../data/championships.js';

export function atomHolds(a, ctx) {
  if (a.class) return a.class.includes(ctx.classId);
  if (a.part) return ctx.parts.includes(a.part);
  if (a.partMin) {
    const want = PARTS[a.partMin];
    return ctx.parts.some((id) => PARTS[id]?.slot === want.slot && PARTS[id].cx >= want.cx);
  }
  if (a.setup) return a.setup === 'wet' && !!ctx.setupWet;
  if (a.crewTrait) return (ctx.crew ?? []).some((s) => s.role === a.crewTrait.role && (s.traits ?? []).includes(a.crewTrait.trait));
  if (a.quality) return (ctx.quality ?? -1) >= a.quality;
  if (a.stat) return (ctx.stats?.[a.stat[0]] ?? -1) >= a.stat[1];
  if (a.titles) return (ctx.titles ?? 0) >= a.titles;
  if (a.secret) return !!(ctx.secrets?.has?.(a.secret) || ctx.debugSecrets);
  return false;
}

export function evaluate(combo, ctx) {
  const failed = combo.requires.filter((a) => !atomHolds(a, ctx));
  return { met: failed.length === 0, failed, held: combo.requires.length - failed.length };
}
// A near-miss (PLACEHOLDER rule): at least 2 atoms, and every one but exactly one holds.
export const isNearMiss = (combo, ev) => combo.requires.length >= 2 && ev.failed.length === 1;

// The combos a class and parts alone make (no setup, crew, quality or title atoms) — the car builder's preview.
export function structuralCombos({ classId, parts = [] }) {
  const ctx = { classId, parts };
  return COMBOS.filter((cb) => cb.requires.every((a) => a.class || a.part || a.partMin) && evaluate(cb, ctx).met).map((cb) => cb.id);
}

export function clueText(combo, atom, ctx) {
  const classAtom = combo.requires.find((a) => a.class);
  const who = classAtom && atomHolds(classAtom, ctx) ? `${CLASSES[ctx.classId]?.name ?? 'these'} cars` : 'a certain kind of car';
  let what;
  if (atom.part || atom.partMin) what = CLUE_WORDS.slot[PARTS[atom.part ?? atom.partMin].slot];
  else what = CLUE_WORDS[Object.keys(atom)[0]] ?? 'one more thing';
  return `Something about ${who} and ${what}…`;
}

export function carCtx(team, { classId, parts, quality = null, stats = null, setupWet = false }) {
  const titles = (team?.championships?.titles() ?? []).filter((id) => champById(id)?.type !== 'secret').length;
  return { classId, parts, quality, stats, setupWet, crew: team?.roster ?? [], titles, secrets: new Set(team?.unlocks?.secrets ?? []) };
}

export const blankComboRecords = () => ({ discovered: {}, clues: {}, rumours: [] });
export function createComboRecords({ load = async () => null, save = async () => {} } = {}) {
  let data = blankComboRecords();
  return {
    get data() {
      return data;
    },
    async load() {
      const d = await load();
      data = { ...blankComboRecords(), ...(d ? JSON.parse(JSON.stringify(d)) : {}) };
      return data;
    },
    save: () => save(JSON.parse(JSON.stringify(data))),
    reset() {
      data = blankComboRecords();
    },
  };
}

export function createCombos({ bus, team }) {
  let records = createComboRecords();
  const api = {
    debugSecrets: false,
    get records() {
      return records;
    },
    setRecords(r) {
      records = r;
    },
    discovered: (id) => !!records.data.discovered[id],
    clueOf: (id) => records.data.clues[id] ?? null,
    rumours: () => records.data.rumours,
    ctx(args) {
      const c = carCtx(team, args);
      c.debugSecrets = api.debugSecrets;
      return c;
    },

    // The car project's hook (src/systems/carProject.js onComplete): prelim = the finished car before any combo bonus.
    forCar(job, prelim) {
      const ctx = api.ctx({ classId: job.data.classId, parts: job.data.parts, quality: prelim.quality, stats: prelim.stats });
      const ids = [];
      const near = [];
      const stats = {};
      for (const cb of COMBOS) {
        const ev = evaluate(cb, ctx);
        if (ev.met) {
          ids.push(cb.id);
          for (const [k, v] of Object.entries(cb.reward.stats ?? {})) stats[k] = (stats[k] ?? 0) + v;
        } else if (isNearMiss(cb, ev)) near.push({ id: cb.id, clue: clueText(cb, ev.failed[0], ctx) });
      }
      return { ids, stats, near };
    },

    // First discovery for the account: the recipe, the RP (once), the moment. Again later: nothing.
    discover(id, { car = null, how = 'build' } = {}) {
      const cb = comboById(id);
      if (!cb || api.discovered(id)) return null;
      const rp = COMBO_RP[cb.tier] ?? 0;
      records.data.discovered[id] = { day: team.clock.totalDays, team: team.setup?.teamName ?? '', car: car?.name ?? null, recipe: cb.requirementText, how };
      records.data.rumours.push({ id, kind: 'recipe', text: `${cb.name}: ${cb.requirementText}` });
      if (cb.reward.clue) records.data.rumours.push({ id, kind: 'clue', text: CLUE_TEXT[cb.reward.clue] ?? cb.reward.clue });
      if (rp) team.research?.addRp(rp, `Combo discovered: ${cb.name}`);
      records.save();
      bus?.emit('combo:discovered', { combo: cb, rp, car, how });
      return { combo: cb, rp };
    },
    // A near-miss's clue (once per combo, until it's discovered): the archive and the Rumour Archive.
    clue(id, text) {
      if (api.discovered(id) || records.data.clues[id]) return false;
      records.data.clues[id] = text;
      records.data.rumours.push({ id, kind: 'nearMiss', text });
      records.save();
      bus?.emit('combo:clue', { id, text });
      return true;
    },

    // SYN06 Rain Runner is checked when a race weekend's setup goes on Intermediate / Wet tyres.
    checkSetup(race) {
      const rec = race ? team.cars.cars.get(race.carNumber) : null;
      if (!rec?.result) return null;
      const setupWet = ['inter', 'wet'].includes(race.setup?.tyre);
      const ctx = api.ctx({ classId: rec.result.classId, parts: rec.result.parts ?? [], quality: rec.result.quality, stats: rec.result.stats, setupWet });
      const cb = comboById('SYN06');
      const ev = evaluate(cb, ctx);
      if (ev.met) {
        rec.result.combos = [...new Set([...(rec.result.combos ?? []), 'SYN06'])];
        const driver = team.roster.find((s) => s.role === 'driver');
        if (driver && !race.rainRunnerXp) {
          race.rainRunnerXp = true; // once per weekend
          driver.counters = { ...(driver.counters ?? {}), wetTraitXp: (driver.counters?.wetTraitXp ?? 0) + cb.reward.wetTraitXp };
        }
        return api.discover('SYN06', { car: rec, how: 'setup' });
      }
      if (isNearMiss(cb, ev)) api.clue('SYN06', clueText(cb, ev.failed[0], ctx));
      return null;
    },
    // Race effects of the combos a car carries.
    combosOf: (rec) => rec?.result?.combos ?? [],
    knowledgePct: (rec) => api.combosOf(rec).reduce((t, id) => t + (comboById(id)?.reward.knowledgePct ?? 0), 0),
    wetStats(rec) {
      const out = {};
      const parts = rec?.result?.parts ?? [];
      // Rain Runner works for any car with its parts once the account knows it (its wet setup is the race's own)
      if (parts.includes('HB07') && parts.includes('EL04') && (api.discovered('SYN06') || api.combosOf(rec).includes('SYN06'))) for (const [k, v] of Object.entries(comboById('SYN06').reward.wetStats)) out[k] = (out[k] ?? 0) + v;
      return out;
    },
    raceStats: (rec) => api.combosOf(rec).reduce((t, id) => t + (comboById(id)?.reward.raceStats ?? 0), 0),

    // The Combo Archive: every combo, discovered (name, recipe, reward) or ??? with its clue if a near-miss happened.
    archive: () =>
      COMBOS.map((cb) => {
        const d = records.data.discovered[cb.id];
        return { id: cb.id, tier: cb.tier, discovered: !!d, name: d ? cb.name : '???', recipe: d ? cb.requirementText : null, reward: d ? cb.rewardText : null, clue: d ? null : records.data.clues[cb.id] ?? null, when: d ?? null };
      }),
  };

  // A finished car: discover what it made, note its near-misses.
  bus?.on('project:complete', ({ record }) => {
    const r = record?.result;
    if (!r) return;
    for (const id of r.combos ?? []) api.discover(id, { car: record });
    for (const n of r.comboNear ?? []) api.clue(n.id, n.clue);
  });
  return api;
}

// The clue flags combos unlock (bible §17 SYN10).
const CLUE_TEXT = { titanOval: 'Titan Oval rewards a car that cuts through the air: low drag and a long gearbox.' };
