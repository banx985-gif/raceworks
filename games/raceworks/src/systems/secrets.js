// The Secret Condition Engine (Milestone 24, bible §35 / §35.1). The engine is core/SecretEngine (trigger indexing,
// AND / OR / forbids, countOf / consecutive / sequence / sameAcross, NG+ level, once per run / account, the unlock
// runner); this is the RACEWORKS side:
//   • fact providers — run facts (this slot) and account facts (this device), every one an explicit id, number,
//     boolean, set or list (data/secrets.js FACTS); the run records it keeps itself (races, cars, months, the
//     timeline of firsts, drills) are written at the moment the game commits a result;
//   • triggers — the bus moments of data/secrets.js TRIGGERS; a rule is looked at only on its own triggers;
//   • clue stages 0–4 (core gives 0–3 from progress and 4 when found); after the ending, +1 stage (a stored hook);
//     a new stage goes to the Rumour Archive and, through the M23 Inbox, as a minor event;
//   • reward actions — one function per type (data REWARD_TYPES), each (type, id) at most once per run, a rule once
//     per scope (reload- and NG+-safe: run state in the slot save, account state in the account save);
//   • the why-false inspector (whyFalse(id): every condition with its live value, the first failing one in words).
//
//   team.secrets = createSecrets({ bus, team, rules })   (main.js passes data SYNTHETIC_RULES only with ?debug=1)
//   .rules · .stage(id) · .whyFalse(id) · .rumours() · .flags · .unlockedIds() · .facts (core FactRegistry)
//   .setAccount({ load, save }) · .loadAccount() · .notify(trigger, payload) (tests) · .postEnding (hook)
import { SecretEngine, FactRegistry } from '../../../../core/SecretEngine.js';
import { UnlockRunner } from '../../../../core/UnlockActions.js';
import { TRIGGERS, REWARD_TYPES, CLUE } from '../../data/secrets.js';
import { PARTS } from '../../data/cars.js';
import { ALL_STAFF } from '../../data/staff.js';
import { familyOfCar } from './carVisual.js';

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
const STAFF_ALL_BY_ID = Object.fromEntries(ALL_STAFF.map((d) => [d.id, d]));
const CURRENCY = REWARD_TYPES.filter((r) => r.currency).map((r) => r.id);
const blankLog = () => ({ races: [], cars: [], months: [], timeline: [], drills: 0, monthStartCredits: null });

export function createSecrets({ bus, team, rules = [] }) {
  let log = blankLog(); // the run records the facts read (saved with the slot)
  let flags = []; // reward flags stored for M25: 'part:SEC-PART-01', 'visual:V17' …
  let rumourLog = []; // { id, stage, day } — each clue stage reached, in order
  let postEnding = false; // the ending (later) raises clue availability by one stage
  let account = { load: async () => null, save: async () => {} };
  const now = () => ({ day: team.clock.totalDays, year: team.clock.year, runId: team.runId });

  // --- facts --------------------------------------------------------------------------------------------------------
  const drillData = () => team.training?.drillRecords?.data ?? null;
  const facts = new FactRegistry()
    .define('run.rank', () => RANKS.indexOf(team.money.rank))
    .define('run.year', () => team.clock.year)
    .define('run.titles', () => team.championships.titles())
    .define('run.wins', () => team.careers.facts.wins ?? 0)
    .define('run.podiums', () => team.careers.facts.podiums ?? 0)
    .define('run.facilities', () => team.facilities.builtIds())
    .define('run.research', () => team.research.doneIds())
    .define('run.combos', () => [...new Set(log.cars.flatMap((c) => c.combos))])
    .define('run.sponsorDeals', () => team.sponsors.deals.length + team.sponsors.history.length)
    .define('run.contracts', () => team.money.contracts.stats.succeeded ?? 0)
    .define('run.pitRepairs', () => team.careers.facts.raceFaultRepairs ?? 0)
    .define('run.swingWins', () => team.careers.facts.strategySwingWins ?? 0)
    .define('run.undercutWins', () => team.careers.facts.undercutWins ?? 0)
    .define('run.extendedWins', () => team.careers.facts.extendedStintWins ?? 0)
    .define('run.flags', () => [...Object.keys(team.events?.flags ?? {}), ...Object.keys(team.contractRecords?.facts ?? {})])
    .define('run.timeline', () => [...log.timeline])
    .define('run.races', () => log.races)
    .define('run.cars', () => log.cars)
    .define('run.months', () => log.months)
    .define('run.staff', () => team.roster.map((s) => ({ id: s.id, role: s.role, tier: s.tier, hiredDay: s.hiredDay ?? 0, daysEmployed: team.careers.of?.(s.id)?.daysEmployed ?? 0, founder: team.isFounder(s.id) })))
    .define('run.racesAutoOnly', () => log.races.filter((r) => r.autoOnly).length)
    .define('run.racesManual', () => log.races.filter((r) => r.manual).length)
    .define('run.racesDrive', () => log.races.filter((r) => r.drive).length)
    .define('run.drillsPlayed', () => log.drills)
    .define('account.ngPlus', () => 0) // NG+ is a later milestone: level 0 for now
    .define('account.golds', () => Object.entries(drillData()?.drills ?? {}).filter(([, d]) => d.goldEverEarned).map(([id]) => id))
    .define('account.mastered', () => Object.entries(drillData()?.drills ?? {}).filter(([, d]) => d.mastered).map(([id]) => id))
    .define('account.recipes', () => Object.keys(team.combos?.records?.data?.discovered ?? {}))
    .define('account.titles', () => engine.accountFact('titles') ?? [])
    .define('account.runsWithTitle', () => Object.values(engine.account.facts.titles ?? {}).filter((t) => Array.isArray(t) && t.length).length)
    .define('account.competitiveSecretInvalidated', () => !!drillData()?.competitiveSecretInvalidated);

  // --- rewards: one function per type; the runner fires each (type, id) once per run ----------------------------
  const handlers = {
    staffArrival: (a) => {
      if (STAFF_ALL_BY_ID[a.id] && team.recruitment.specialArrival) team.recruitment.specialArrival(a.id, a.days);
      else flags.push(`staffArrival:${a.id}`);
    },
    part: (a) => flags.push(`part:${a.id}`),
    facility: (a) => flags.push(`facility:${a.id}`),
    championship: (a) => {
      if (a.id in team.championships.secretFlags) team.championships.secretFlags[a.id] = true;
      flags.push(`championship:${a.id}`);
    },
    rival: (a) => flags.push(`rival:${a.id}`),
    visual: (a) => flags.push(`visual:${a.id}`),
    tokens: (a) => team.money.economy.add('tokens', a.amount ?? 0, `Secret: ${a.secret}`, 'secret'),
    rp: (a) => team.research.addRp(a.amount ?? 0, `Secret: ${a.secret}`),
  };
  const runner = new UnlockRunner({ bus, handlers });
  // Repeats are never eased in RACEWORKS (the bible has no easing): the same rule, every run.
  const engine = new SecretEngine({ bus, rules, facts, runner, ngPlus: () => facts.get('account.ngPlus'), currencyTypes: CURRENCY, easing: { countFactor: 1, thresholdPct: 0 }, now, discoveredStage: CLUE.discovered });
  const byId = Object.fromEntries(rules.map((r) => [r.id, r]));

  // --- clue stages ----------------------------------------------------------------------------------------------------
  const rawStage = (id) => engine.clueStage(id);
  // What the player sees: found → 4 for good; otherwise one more after the ending (never past 3 without finding it).
  const stage = (id) => {
    const s = rawStage(id);
    return s >= CLUE.discovered ? s : Math.min(CLUE.discovered - 1, s + (postEnding && s >= 0 ? CLUE.postEndingBonus : 0));
  };
  const textOf = (rule, st) => (st >= CLUE.discovered ? rule.recipe : rule.clueStages?.[st - 1]?.text ?? '');
  // Stages are recorded one by one, in order: a jump from 0 to 3 logs 1, 2 and 3 (each a Rumour Archive line).
  const lastLogged = (id) => Math.max(0, ...rumourLog.filter((r) => r.id === id).map((r) => r.stage));
  function logUpTo(rule, st) {
    for (let s = lastLogged(rule.id) + 1; s <= st; s++) rumourLog.push({ id: rule.id, stage: s, day: team.clock.totalDays });
  }
  bus.on('secret:clue', ({ rule, stage: st }) => {
    if (!byId[rule.id] || st <= lastLogged(rule.id)) return;
    logUpTo(rule, st);
    bus.emit('secret:rumour', { id: rule.id, stage: st, text: textOf(rule, stage(rule.id)) });
  });
  bus.on('secret:unlocked', ({ rule }) => {
    if (!byId[rule.id]) return;
    logUpTo(rule, CLUE.discovered);
    saveAccount();
    bus.emit('secret:rumour', { id: rule.id, stage: CLUE.discovered, text: rule.recipe, found: true, name: rule.name });
  });

  // --- the run records (written when the game commits the result) ------------------------------------------------
  const first = (key) => {
    if (!log.timeline.includes(key)) log.timeline.push(key);
  };
  const carRecord = (n) => team.cars.cars.get?.(n) ?? team.cars.cars.list().find((c) => c.number === n) ?? null;
  function onRace(entry) {
    if (!entry || entry.kind !== 'weekend') return;
    const me = entry.result?.rows?.find((r) => r.isPlayer);
    if (!me) return;
    const car = carRecord(entry.carNumber);
    const modes = entry.modes ?? {};
    log.races.push({
      day: entry.day ?? team.clock.totalDays,
      trackId: entry.trackId,
      champ: entry.champ?.id ?? null,
      pos: me.pos,
      grid: me.grid ?? null,
      wet: !!entry.wet,
      retired: me.status === 'retired',
      mechRetired: me.status === 'retired' && (me.fails ?? []).includes('retire'),
      faultsFixed: me.faultsFixed ?? 0,
      swing: entry.swingWin?.kind ?? null,
      family: car ? familyOfCar(car, team)?.id ?? null : null,
      classId: car?.result?.classId ?? null,
      carNumber: entry.carNumber ?? null,
      crew: [...(entry.crew ?? [])],
      autoOnly: !modes.manual && !modes.drive,
      manual: !!modes.manual,
      drive: !!modes.drive || (entry.stints?.length ?? 0) > 0,
      setupScore: entry.setupScore ?? null,
    });
    first('firstRace');
    if (me.pos <= 3 && me.status !== 'retired') first('firstPodium');
    if (me.pos === 1 && me.status !== 'retired') first('firstWin');
  }
  function onCar(rec) {
    if (!rec) return;
    const parts = rec.result?.parts ?? [];
    log.cars.push({ day: team.clock.totalDays, number: rec.number, classId: rec.result?.classId ?? null, quality: rec.result?.quality ?? 0, powerUnit: parts.find((id) => PARTS[id]?.slot === 'PU') ?? null, parts: [...parts], family: familyOfCar(rec, team)?.id ?? null, combos: [...(rec.result?.combos ?? [])], crew: (rec.team ?? []).map((m) => m.id ?? m) });
    first('firstCar');
  }
  function onMonth() {
    const cr = team.money.credits;
    if (log.monthStartCredits != null) {
      const net = cr - log.monthStartCredits;
      log.months.push({ month: log.months.length + 1, net, positive: net > 0 });
    }
    log.monthStartCredits = cr;
  }

  // --- triggers: the bus moments, wired once; facts first, then the rules indexed under it ---------------------------
  const before = {
    raceResult: ({ race }) => onRace(race),
    carBuilt: ({ record }) => onCar(record),
    monthEnd: () => onMonth(),
    drillDone: () => (log.drills += 1),
    seasonEnd: ({ record }) => record?.title && first('firstTitle'),
    sponsorSigned: () => first('firstSponsor'),
    rankUp: ({ rank }) => rank?.id && first(`rank${rank.id}`),
  };
  // This run's part of the cross-run facts (set, never added: a reload can't count it twice); saved to the account
  // whenever it changes.
  function notify(trigger, payload = {}) {
    const titles = team.championships.titles();
    const was = engine.account.facts.titles?.[team.runId];
    if (team.runId && JSON.stringify(was ?? []) !== JSON.stringify([...new Set(titles)])) {
      engine.setRunFact('titles', titles);
      saveAccount();
    }
    return engine.notify(trigger, payload);
  }
  for (const t of TRIGGERS) {
    bus.on(t.on, (payload) => {
      before[t.id]?.(payload ?? {});
      notify(t.id, payload ?? {});
    });
  }

  // --- the why-false inspector -----------------------------------------------------------------------------------
  const show = (v) => (Array.isArray(v) ? `[${v.slice(0, 6).join(', ')}${v.length > 6 ? ' …' : ''}]` : v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v));
  function whyFalse(id) {
    const rule = byId[id];
    if (!rule) return null;
    const res = engine.evaluate(rule, { event: 'inspect', payload: {} });
    const row = (p, kind) => ({ kind, label: p.cond.label ?? p.cond.fact, fact: p.cond.fact, op: p.cond.op, value: p.value, need: p.need, ok: kind === 'forbid' ? !p.ok : p.ok, text: kind === 'forbid' ? `${p.cond.label ?? p.cond.fact} — now ${show(p.value)} (must never reach ${show(p.need)})` : `${p.cond.label ?? p.cond.fact} — now ${show(p.value)}, needs ${show(p.need)}` });
    const rows = [...res.all.map((p) => row(p, 'all')), ...res.any.map((p) => row(p, 'any')), ...res.forbids.map((p) => row(p, 'forbid'))];
    let firstFail = null;
    if (!res.ng.ok) firstFail = `Needs NG+${res.ng.need} (now NG+${res.ng.value})`;
    else {
      const a = rows.find((r) => r.kind === 'all' && !r.ok);
      const f = rows.find((r) => r.kind === 'forbid' && !r.ok);
      if (a) firstFail = a.text;
      else if (!res.anyOk) firstFail = `One of: ${rows.filter((r) => r.kind === 'any').map((r) => r.label).join(' / ')}`;
      else if (f) firstFail = `${f.label} — it happened`;
    }
    return { id, name: rule.name, scope: rule.scope, stage: stage(id), found: engine.everUnlocked(id), ok: res.ok, rows, firstFail, triggers: rule.triggerEvents };
  }

  // --- account save ----------------------------------------------------------------------------------------------
  function saveAccount() {
    return account.save(engine.serializeAccount());
  }

  const api = {
    engine,
    facts,
    runner,
    rules,
    notify,
    stage,
    whyFalse,
    get flags() {
      return flags;
    },
    get log() {
      return log;
    },
    get postEnding() {
      return postEnding;
    },
    set postEnding(v) {
      postEnding = !!v;
    },
    // Rumour Archive lines: each rule's newest stage (found ones show their exact recipe for good).
    rumours() {
      return rules
        .map((r) => ({ id: r.id, name: r.name, stage: stage(r.id) }))
        .filter((x) => x.stage > 0)
        .map((x) => ({ ...x, text: textOf(byId[x.id], x.stage), found: x.stage >= CLUE.discovered }));
    },
    get rumourLog() {
      return rumourLog;
    },
    // Secret ids found in this run, plus account-scope ones found in any run (what team.unlocks.secrets lists).
    unlockedIds: () => rules.filter((r) => engine.unlockedInRun(r.id) || (r.oncePerAccount && engine.account.history[r.id])).map((r) => r.id),
    setAccount(store) {
      account = store;
    },
    async loadAccount() {
      engine.loadAccount(await account.load());
    },
    accountData: () => engine.serializeAccount(),
    newGame() {
      engine.resetRun();
      runner.reset();
      log = blankLog();
      log.monthStartCredits = team.money.credits;
      flags = [];
      rumourLog = [];
      postEnding = false;
    },
    serialize: () => JSON.parse(JSON.stringify({ run: engine.serializeRun(), runner: { unlocked: runner.unlocked, log: runner.log }, log, flags, rumourLog, postEnding })),
    // A save from before Milestone 24: no rule state; the records are rebuilt from what the save has (its cars and
    // the races still in its history), so facts start from the team's real past.
    load(data) {
      engine.loadRun(data?.run ?? null);
      runner.reset();
      if (data?.runner) {
        runner.unlocked = JSON.parse(JSON.stringify(data.runner.unlocked ?? {}));
        runner.log = JSON.parse(JSON.stringify(data.runner.log ?? []));
      }
      flags = [...(data?.flags ?? [])];
      rumourLog = JSON.parse(JSON.stringify(data?.rumourLog ?? []));
      postEnding = !!data?.postEnding;
      if (data?.log) {
        log = { ...blankLog(), ...JSON.parse(JSON.stringify(data.log)) };
        return true;
      }
      log = blankLog();
      for (const rec of team.cars.cars.list()) onCar(rec);
      for (const e of team.races.history) onRace(e);
      if (team.championships.titles().length) first('firstTitle');
      log.monthStartCredits = team.money.credits;
      return false;
    },
  };
  return api;
}
