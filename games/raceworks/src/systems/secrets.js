// The Secret Condition Engine (Milestone 24, bible §35 / §35.1) and the 34 secrets (Milestone 25, §36). The engine is
// core/SecretEngine (trigger indexing, AND / OR / forbids, countOf / consecutive / sequence / sameAcross, NG+ level, once
// per run / account, the unlock runner); this is the RACEWORKS side:
//   • fact providers — run facts (this slot) and account facts (this device), every one an explicit id, number,
//     boolean, set or list (data/secrets.js FACTS); the run records it keeps itself (races, cars, months, the
//     timeline of firsts, drills, hires, who left) are written at the moment the game commits a result, and the lists
//     the 34 read (10-race spans, each car's record, each family's wins, each finished season) are derived from them
//     each time they are read (data/secrets.js SECRET_READINGS says how the bible's words are read);
//   • triggers — the bus moments of data/secrets.js TRIGGERS; a rule is looked at only on its own triggers;
//   • clue stages 0–4 (core gives 0–3 from progress and 4 when found); after the ending, +1 stage (a stored hook); a
//     reward can add a stage to another secret (a clue); a new stage goes to the Rumour Archive and, through the M23
//     Inbox, as a minor event;
//   • reward actions — one function per type (data REWARD_TYPES), each (type, id) at most once per run, a rule once
//     per scope (reload- and NG+-safe: run state in the slot save, account state in the account save); currency
//     (Racing Tokens, RP, Prestige Tokens) once per device;
//   • the why-false inspector (whyFalse(id): every condition with its live value, the first failing one in words) and
//     the ?debug=1 force (debugForce(id): the secret as if its facts held — it sets the competitive-invalid flag).
//
//   team.secrets = createSecrets({ bus, team, rules })   (main.js passes data SECRET_RULES; SYNTHETIC_RULES with
//                                                          ?debug=1&synthetic=1)
//   .rules · .stage(id) · .whyFalse(id) · .rumours() · .accolades() · .finalPage · .prestigeTokens · .flags
//   .accountFlag(id) · .unlockedIds() · .facts (core FactRegistry) · .setAccount({ load, save }) · .loadAccount()
//   .notify(trigger, payload) (tests) · .debugForce(id) · .postEnding (hook)
import { SecretEngine, FactRegistry } from '../../../../core/SecretEngine.js';
import { UnlockRunner } from '../../../../core/UnlockActions.js';
import { TRIGGERS, REWARD_TYPES, CLUE, SECRET_READINGS as SR, SECRET_IDS, ACCOUNT_FLAGS, FINAL_RUMOUR_PAGE } from '../../data/secrets.js';
import { PARTS } from '../../data/cars.js';
import { ALL_STAFF, ROLES, STARTERS } from '../../data/staff.js';
import { RIVAL_TEAMS } from '../../data/rivals.js';
import { CHAMPIONSHIPS } from '../../data/championships.js';
import { familyOfCar } from './carVisual.js';
import { unlockContext, partState } from './carCatalog.js';

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
const STAFF_ALL_BY_ID = Object.fromEntries(ALL_STAFF.map((d) => [d.id, d]));
const CURRENCY = REWARD_TYPES.filter((r) => r.currency).map((r) => r.id);
const GHOST_IDS = new Set((RIVAL_TEAMS[SR.ghostTeam]?.drivers ?? []).map((d) => d.id));
const CHAMP = Object.fromEntries(CHAMPIONSHIPS.map((c) => [c.id, c]));
const REAL = new Set(SECRET_IDS);
const r1 = (v) => Math.round(v * 10) / 10;
const blankLog = () => ({ races: [], cars: [], months: [], timeline: [], drills: 0, monthStartCredits: null, hires: [], starters: [], standardDrivers: [], left: [], techDemoSeen: false, techDemoDone: false, ending: false });

// A race record made before Milestone 25: the new fields from what it has (nothing else can be known now).
// Milestone 26: a record from before it has no best lap or pit errors (unknown: no lap record, no error counted).
function upgradeRace(r) {
  if (r.won !== undefined) return { bestLap: null, pitErrors: 0, ...r };
  const finished = !r.retired;
  const champ = r.champ ?? null;
  return { ...r, won: r.pos === 1 && finished, finished, pole: r.grid === 1, fastestLap: false, wetClass: false, rain: !!r.wet, night: SR.nightTracks.includes(r.trackId), permanent: !SR.streetTracks.includes(r.trackId), tier: champ ? CHAMP[champ]?.tier ?? null : null, champRace: !!champ, season: null, raceType: 'standard', tyreLife: 0, spins: 0, damageHits: 0, damageRepairs: 0, mechFails: r.mechRetired ? 1 : 0, faults: 0, stops: 0, plannedStops: 0, energySave: false, topSpeed: 0, speedRecord: false, powerUnit: null, carRating: 0, fieldRating: 0, belowFieldPct: 0, fieldAbovePct: 0, ghostIn: false, ghostBeat: false, driver: null, bestLap: null, pitErrors: 0 };
}

export function createSecrets({ bus, team, rules = [] }) {
  let log = blankLog(); // the run records the facts read (saved with the slot)
  let flags = []; // reward flags kept for this run: 'part:PU09', 'visual:V17', 'flag:longTankPreset' …
  let rumourLog = []; // { id, stage, day } — each clue stage reached, in order
  let runClues = {}; // Milestone 25: extra clue stages a reward gave a run secret (id → stages)
  let postEnding = false; // the ending (later) raises clue availability by one stage
  let account = { load: async () => null, save: async () => {} };
  const now = () => ({ day: team.clock.totalDays, year: team.clock.year, runId: team.runId });
  const byId = Object.fromEntries(rules.map((r) => [r.id, r]));

  // --- facts --------------------------------------------------------------------------------------------------------
  const drillData = () => team.training?.drillRecords?.data ?? null;
  const races = () => log.races;
  const rankIndex = () => RANKS.indexOf(team.money.rank);
  const accountFlags = () => engine.account.flags;
  const records = () => (engine.account.records ??= { topSpeed: {} });

  // Each 10-race span in a row (SR.spanRaces): poles, fastest laps, mechanical ("gearbox") failures.
  function spans() {
    const out = [];
    const n = SR.spanRaces;
    for (let i = 0; i + n <= log.races.length; i++) {
      const s = log.races.slice(i, i + n);
      out.push({ from: i, poles: s.filter((r) => r.pole).length, fastestLaps: s.filter((r) => r.fastestLap).length, mechFailures: s.reduce((t, r) => t + (r.mechFails ?? 0), 0) });
    }
    return out;
  }
  // The seasons finished this run, with what their races did (championships.history + the race records).
  function seasons() {
    return (team.championships?.history ?? []).map((h) => {
      const rs = log.races.filter((r) => r.champ === h.id && (h.entered != null && r.season != null ? r.season === h.entered : r.day <= h.day && r.day > h.day - SR.yearDays));
      const carNo = h.carNumber ?? rs[rs.length - 1]?.carNumber ?? null;
      const car = [...log.cars].reverse().find((c) => c.number === carNo) ?? null;
      const def = CHAMP[h.id];
      const rec = SR.recommendedPuTier[h.id] ?? 0;
      return {
        champ: h.id,
        tier: def?.tier ?? null,
        title: !!h.title,
        pos: h.pos ?? 99,
        car: carNo,
        carClass: car?.classId ?? rs[0]?.classId ?? null,
        puGap: car?.puTier ? rec - car.puTier : -99,
        corOverSpd: !!car && car.cor > car.spd,
        races: rs.length,
        rounds: def?.rounds ?? 0,
        complete: rs.length >= (def?.rounds ?? Infinity),
        autoAll: rs.length > 0 && rs.every((r) => r.autoOnly),
        manualAll: rs.length > 0 && rs.every((r) => r.manual),
        mechRetirements: rs.filter((r) => r.mechRetired).length,
        startPartsOnly: !!car?.startPartsOnly,
        standardDriver: rs.length > 0 && rs.every((r) => r.driver && log.standardDrivers.includes(r.driver)),
        legacyCrew: rs.some((r) => (r.crew ?? []).some((id) => legacyIds().includes(id))),
      };
    });
  }
  // Each finished car with what it won (wins by track, titles, the Ghostline record).
  function carRecords() {
    const titles = seasons().filter((s) => s.title);
    const nums = [...new Set([...log.cars.map((c) => c.number), ...log.races.map((r) => r.carNumber)])].filter((n) => n != null);
    return nums.map((n) => {
      const car = [...log.cars].reverse().find((c) => c.number === n) ?? null;
      const rs = log.races.filter((r) => r.carNumber === n);
      const wins = rs.filter((r) => r.won);
      const ghost = rs.filter((r) => r.ghostBeat);
      const ghostWins = ghost.filter((r) => r.won);
      const daysAt = (id) => wins.filter((r) => r.trackId === id).map((r) => r.day);
      let gap = 99999;
      for (const a of daysAt('T06')) for (const b of daysAt('T10')) gap = Math.min(gap, Math.abs(a - b));
      return {
        car: n,
        family: car?.family ?? rs[rs.length - 1]?.family ?? null,
        classId: car?.classId ?? rs[0]?.classId ?? null,
        quality: car?.quality ?? 0,
        spd: car?.spd ?? 0,
        acc: car?.acc ?? 0,
        winTracks: [...new Set(wins.map((r) => r.trackId))],
        titles: [...new Set(titles.filter((s) => s.car === n).map((s) => s.champ))],
        ghostDefeats: ghost.length,
        ghostNightWins: ghostWins.filter((r) => r.night).length,
        ghostRainWins: ghostWins.filter((r) => r.rain).length,
        ghostPermanentWins: ghostWins.filter((r) => r.permanent).length,
        highcrestTitanDays: gap,
      };
    });
  }
  function familyWins() {
    const by = {};
    for (const r of log.races) if (r.won && r.family) (by[r.family] ??= new Set()).add(r.trackId);
    return Object.entries(by).map(([family, t]) => ({ family, tracks: [...t] }));
  }
  const legacyIds = () => [...(team.legacyStaff ?? [])]; // NG+ (Milestone 28): none yet
  const employed = (id) => !!team.get(id);
  const continuous = (id) => employed(id) && !log.left.includes(id);
  const secretFoundIds = () => SECRET_IDS.filter((id) => engine.everUnlocked(id));

  const facts = new FactRegistry()
    .define('run.rank', () => rankIndex())
    .define('run.year', () => team.clock.year)
    .define('run.titles', () => team.championships.titles())
    .define('run.wins', () => team.careers.facts.wins ?? 0)
    .define('run.podiums', () => team.careers.facts.podiums ?? 0)
    .define('run.facilities', () => team.facilities.builtIds())
    .define('run.facilityLevels', () => team.facilities.levels()) // Milestone 25b: facilityLevel(id) for rules
    .define('run.maxFacilityLevel', () => Math.max(0, ...team.facilities.levels().map((x) => x.level)))
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
    .define('run.races', () => races())
    .define('run.cars', () => log.cars)
    .define('run.months', () => log.months)
    .define('run.staff', () => team.roster.map((s) => ({ id: s.id, role: s.role, tier: s.tier, hiredDay: s.counters?.hiredDay ?? 0, daysEmployed: team.careers.of?.(s.id)?.daysEmployed ?? 0, founder: team.isFounder(s.id), level: s.level ?? 1 })))
    .define('run.racesAutoOnly', () => log.races.filter((r) => r.autoOnly).length)
    .define('run.racesManual', () => log.races.filter((r) => r.manual).length)
    .define('run.racesDrive', () => log.races.filter((r) => r.drive).length)
    .define('run.drillsPlayed', () => log.drills)
    // Milestone 25
    .define('run.spans', () => spans())
    .define('run.carRecords', () => carRecords())
    .define('run.familyWins', () => familyWins())
    .define('run.seasons', () => seasons())
    .define('run.poles', () => log.races.filter((r) => r.pole).length)
    .define('run.fastestLaps', () => log.races.filter((r) => r.fastestLap).length)
    .define('run.researchCount', () => team.research.doneIds().length)
    .define('run.licences', () => {
      const ctx = unlockContext(team);
      return SR.licences.filter((id) => partState(id, ctx).open).length;
    })
    .define('run.secretParts', () => SR.secretParts.filter((id) => engine.unlockedInRun(PARTS[id]?.unlock?.secret)).length)
    .define('run.researchPrototypes', () => log.cars.filter((c) => c.researchPrototype).length)
    .define('run.legendaryHires', () => log.hires.filter((h) => h.tier === 'legendary').length)
    .define('run.prestigeHires', () => log.hires.filter((h) => h.tier === 'secret').length)
    .define('run.ghostDefeats', () => log.races.filter((r) => r.ghostBeat).length)
    .define('run.sponsorsActive', () => team.sponsors.deals.map((d) => d.id))
    .define('run.techDemoAppeared', () => !!log.techDemoSeen || !!team.events?.system?.seen?.('EV_TECH_DEMO'))
    .define('run.techDemoDone', () => !!log.techDemoDone)
    .define('run.startersKept', () => log.starters.filter(continuous).length)
    .define('run.firstYearMechanicsKept', () => team.roster.filter((s) => s.role === 'mechanic' && (s.counters?.hiredDay ?? 0) < SR.yearDays && continuous(s.id)).length)
    .define('run.endingReached', () => !!log.ending)
    .define('run.legacyTitles', () => seasons().filter((s) => s.title && s.tier === 'world' && s.legacyCrew).length)
    .define('account.ngPlus', () => 0) // NG+ is Milestone 28: level 0 for now
    .define('account.golds', () => Object.entries(drillData()?.drills ?? {}).filter(([, d]) => d.goldEverEarned).map(([id]) => id))
    .define('account.mastered', () => Object.entries(drillData()?.drills ?? {}).filter(([, d]) => d.mastered).map(([id]) => id))
    .define('account.recipes', () => Object.keys(team.combos?.records?.data?.discovered ?? {}))
    .define('account.titles', () => engine.accountFact('titles') ?? [])
    .define('account.runsWithTitle', () => Object.values(engine.account.facts.titles ?? {}).filter((t) => Array.isArray(t) && t.length).length)
    // (Milestone 25: a ?debug=1 forced secret sets it too — never an accessibility aid)
    .define('account.competitiveSecretInvalidated', () => !!drillData()?.competitiveSecretInvalidated || !!accountFlags().debugForced)
    .define('account.goldCount', () => facts.get('account.golds').length)
    .define('account.recipeCount', () => facts.get('account.recipes').length)
    .define('account.secretsFound', () => secretFoundIds().length)
    .define('account.secretsFoundIds', () => secretFoundIds())
    .define('account.legacyChain', () => accountFlags().legacyChain ?? 0);

  // --- rewards: one function per type; the runner fires each (type, id) once per run ----------------------------
  const ruleName = (a) => byId[a.secret]?.name ?? a.secret;
  const handlers = {
    staffArrival: (a) => {
      const d = STAFF_ALL_BY_ID[a.id];
      if (!d || !team.recruitment.specialArrival) return flags.push(`staffArrival:${a.id}`);
      const r = team.recruitment.specialArrival(a.id, a.days);
      // Milestone 25: the Special Arrival event (M23) with their portrait
      if (r?.ok) team.events?.fireSecret?.('EV_SPECIAL_ARRIVAL', { name: d.name, role: ROLES[d.role]?.name ?? d.role, days: a.days ?? SR.arrivalDays, art: d.art });
      return r;
    },
    part: (a) => flags.push(`part:${a.id}`), // the car builder reads the found secret (data/cars.js unlock.secret)
    facility: (a) => {
      flags.push(`facility:${a.id}`); // the Build shop lists it now (data/facilities.js unlock.secret)
      team.facilities?.syncExpansions?.(); // F35: the Ghost Annex opens
    },
    championship: (a) => {
      if (a.id in team.championships.secretFlags) team.championships.secretFlags[a.id] = true;
      flags.push(`championship:${a.id}`);
    },
    rival: (a) => flags.push(`rival:${a.id}`), // the championships read the found secret (Ghostline in World-tier fields)
    visual: (a) => flags.push(`visual:${a.id}`), // the visual-family resolver reads the found secret
    tokens: (a) => team.money.economy.add('tokens', a.amount ?? 0, `Secret: ${ruleName(a)}`, 'secret'),
    rp: (a) => team.research.addRp(a.amount ?? 0, `Secret: ${ruleName(a)}`),
    // Milestone 25
    prestige: (a) => {
      accountFlags().prestigeTokens = (accountFlags().prestigeTokens ?? 0) + (a.amount ?? 0);
      saveAccount();
    },
    reputation: (a) => team.money.reputation.add(a.amount ?? 0, `Secret: ${ruleName(a)}`),
    event: (a) => team.events?.fireSecret?.(a.id, {}),
    flag: (a) => flags.push(`flag:${a.id}`),
    accountFlag: (a) => {
      accountFlags()[a.id] ??= team.clock.totalDays;
      saveAccount();
    },
    clue: (a) => {
      if (!byId[a.id]) return;
      if (byId[a.secret]?.scope === 'account') accountFlags()[`clue:${a.id}`] = (accountFlags()[`clue:${a.id}`] ?? 0) + 1;
      else runClues[a.id] = (runClues[a.id] ?? 0) + 1;
      if (byId[a.secret]?.scope === 'account') saveAccount();
      const st = stage(a.id);
      if (st > lastLogged(a.id) && st < CLUE.discovered) {
        logUpTo(byId[a.id], st);
        bus.emit('secret:rumour', { id: a.id, stage: st, text: textOf(byId[a.id], st) });
      }
    },
    track: (a) => flags.push(`track:${a.id}`),
  };
  const runner = new UnlockRunner({ bus, handlers });
  // Repeats are never eased in RACEWORKS (the bible has no easing): the same rule, every run.
  const engine = new SecretEngine({ bus, rules, facts, runner, ngPlus: () => facts.get('account.ngPlus'), currencyTypes: CURRENCY, easing: { countFactor: 1, thresholdPct: 0 }, now, discoveredStage: CLUE.discovered });

  // --- clue stages ----------------------------------------------------------------------------------------------------
  const rawStage = (id) => engine.clueStage(id);
  // What the player sees: found → 4 for good; otherwise one more after the ending, plus any clue a reward gave (never
  // past 3 without finding it).
  // Milestone 27: + one more after the ending with a Heritage Room (F29, the garage's clueAfterEnding effect).
  const afterEnding = () => (postEnding ? CLUE.postEndingBonus + (team.facilities?.bonus('clueAfterEnding') > 0 ? CLUE.heritageBonus : 0) : 0);
  const bonusOf = (id) => afterEnding() + (runClues[id] ?? 0) + (accountFlags()[`clue:${id}`] ?? 0);
  const stage = (id) => {
    const s = rawStage(id);
    return s >= CLUE.discovered ? s : Math.min(CLUE.discovered - 1, s + bonusOf(id));
  };
  const textOf = (rule, st) => (st >= CLUE.discovered ? rule.recipe : rule.clueStages?.[st - 1]?.text ?? '');
  // Stages are recorded one by one, in order: a jump from 0 to 3 logs 1, 2 and 3 (each a Rumour Archive line).
  const lastLogged = (id) => Math.max(0, ...rumourLog.filter((r) => r.id === id).map((r) => r.stage));
  function logUpTo(rule, st) {
    for (let s = lastLogged(rule.id) + 1; s <= st; s++) rumourLog.push({ id: rule.id, stage: s, day: team.clock.totalDays });
  }
  bus.on('secret:clue', ({ rule }) => {
    if (!byId[rule.id]) return;
    const st = stage(rule.id);
    if (st <= lastLogged(rule.id)) return;
    logUpTo(rule, st);
    bus.emit('secret:rumour', { id: rule.id, stage: st, text: textOf(rule, st) });
  });
  let pendingFound = 0;
  bus.on('secret:unlocked', ({ rule }) => {
    if (!byId[rule.id]) return;
    logUpTo(rule, CLUE.discovered);
    saveAccount();
    pendingFound++;
    bus.emit('secret:rumour', { id: rule.id, stage: CLUE.discovered, text: rule.recipe, found: true, name: rule.name });
  });

  // --- the run records (written when the game commits the result) ------------------------------------------------
  const first = (key) => {
    if (!log.timeline.includes(key)) log.timeline.push(key);
  };
  const carRecord = (n) => team.cars.cars.get?.(n) ?? team.cars.cars.list().find((c) => c.number === n) ?? null;
  const puOf = (parts) => (parts ?? []).find((id) => PARTS[id]?.slot === 'PU') ?? null;
  function onRace(entry, { rebuilding = false } = {}) {
    if (!entry || entry.kind !== 'weekend') return;
    const rows = entry.result?.rows ?? [];
    const me = rows.find((r) => r.isPlayer);
    if (!me) return;
    const car = carRecord(entry.carNumber);
    const modes = entry.modes ?? {};
    const finished = me.status !== 'retired' && me.status !== 'running';
    const champ = entry.champ?.id ?? null;
    const trackId = entry.trackId;
    const states = entry.result?.weather?.states ?? [];
    const ghosts = rows.filter((r) => GHOST_IDS.has(r.id));
    const pu = puOf(car?.result?.parts);
    // a new account top-speed record at this track (Milestone 25; a rebuilt record never claims one)
    const top = me.topSpeed ?? 0;
    const best = records().topSpeed[trackId] ?? 0;
    const speedRecord = !rebuilding && top > 0 && top > best;
    if (speedRecord) {
      records().topSpeed[trackId] = top;
      saveAccount();
    }
    const rt = entry.ratings ?? { car: 0, field: 0 };
    log.races.push({
      day: entry.day ?? team.clock.totalDays,
      trackId,
      champ,
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
      // Milestone 25 (data/secrets.js SECRET_READINGS)
      won: me.pos === 1 && finished,
      finished,
      pole: me.grid === 1,
      fastestLap: entry.result?.fastestLap?.id === me.id,
      wetClass: states.some((s) => SR.wetStates.includes(s)),
      rain: !!entry.wet,
      night: SR.nightTracks.includes(trackId) || (!!champ && (SR.nightRounds[champ] ?? []).includes(trackId)),
      permanent: !SR.streetTracks.includes(trackId),
      tier: champ ? CHAMP[champ]?.tier ?? null : null,
      champRace: !!champ,
      season: entry.champ?.season ?? null,
      raceType: entry.raceType ?? 'standard',
      tyreLife: Math.max(0, 100 - (me.wear ?? 0)),
      spins: me.spins ?? 0,
      damageHits: me.damageHits ?? 0,
      damageRepairs: me.damageRepairs ?? 0,
      mechFails: (me.fails ?? []).filter((f) => f !== 'crash').length,
      faults: (me.faults ?? 0) + (me.faultsFixed ?? 0),
      stops: me.stops ?? 0,
      plannedStops: me.plannedStops ?? 0,
      energySave: !!me.saveUsed,
      topSpeed: top,
      speedRecord,
      powerUnit: pu,
      carRating: rt.car,
      fieldRating: rt.field,
      belowFieldPct: rt.field > 0 ? r1((1 - rt.car / rt.field) * 100) : 0,
      fieldAbovePct: rt.car > 0 ? r1((rt.field / rt.car - 1) * 100) : 0,
      ghostIn: ghosts.length > 0,
      ghostBeat: ghosts.length > 0 && finished && ghosts.every((g) => g.pos > me.pos),
      driver: entry.driver ?? null,
      // Milestone 26 (the Records screen's lap records; Pit Perfect)
      bestLap: me.best ?? null,
      pitErrors: me.pitErrors ?? 0,
    });
    first('firstRace');
    if (me.pos <= 3 && me.status !== 'retired') first('firstPodium');
    if (me.pos === 1 && me.status !== 'retired') first('firstWin');
  }
  function onCar(rec) {
    if (!rec) return;
    const r = rec.result ?? {};
    const parts = r.parts ?? [];
    const pu = puOf(parts);
    const st = r.stats ?? {};
    log.cars.push({
      day: team.clock.totalDays, number: rec.number, classId: r.classId ?? null, quality: r.quality ?? 0, powerUnit: pu, parts: [...parts], family: familyOfCar(rec, team)?.id ?? null, combos: [...(r.combos ?? [])], crew: (rec.team ?? []).map((m) => m.id ?? m),
      // Milestone 25
      spd: st.SPD ?? 0, acc: st.ACC ?? 0, cor: st.COR ?? 0, puTier: PARTS[pu]?.cx ?? 0,
      startPartsOnly: parts.length > 0 && parts.every((id) => PARTS[id]?.unlock?.start || (PARTS[id]?.cx ?? 99) <= 1),
      researchPrototype: SR.researchPrototype.classes.includes(r.classId),
    });
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
  // The starting staff (spec §3: the founder plus two) and the drivers among them still at Standard tier.
  function setStarters(ids) {
    log.starters = [...ids];
    log.standardDrivers = ids.filter((id) => {
      const d = STAFF_ALL_BY_ID[id];
      return d?.role === 'driver' && d.tier === 'standard';
    });
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
    hire: ({ staff }) => staff && log.hires.push({ id: staff.id, tier: staff.tier ?? STAFF_ALL_BY_ID[staff.id]?.tier ?? null, day: team.clock.totalDays }),
    runEnded: () => (log.ending = true),
  };
  bus.on('staff:letGo', ({ id }) => id && !log.left.includes(id) && log.left.push(id));
  bus.on('event:fired', ({ def }) => def?.id === 'EV_TECH_DEMO' && (log.techDemoSeen = true));
  bus.on('event:resolved', ({ def, choice }) => def?.id === 'EV_TECH_DEMO' && def.choices?.[choice]?.id === 'host' && (log.techDemoDone = true));
  // This run's part of the cross-run facts (set, never added: a reload can't count it twice); saved to the account
  // whenever it changes. A secret found while the rules are being looked at sends 'secret:found' once they are done.
  let depth = 0;
  function notify(trigger, payload = {}) {
    const titles = team.championships.titles();
    const was = engine.account.facts.titles?.[team.runId];
    if (team.runId && JSON.stringify(was ?? []) !== JSON.stringify([...new Set(titles)])) {
      engine.setRunFact('titles', titles);
      saveAccount();
    }
    depth++;
    let out;
    try {
      out = engine.notify(trigger, payload);
    } finally {
      depth--;
    }
    drainFound();
    return out;
  }
  function drainFound() {
    if (depth || !pendingFound) return;
    pendingFound = 0;
    bus.emit('secret:found', {});
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
    const text = (p, kind) => {
      const label = p.cond.label ?? p.cond.fact ?? (p.group ? `${p.group} of these` : '');
      if (p.group) return `${label}: ${p.parts.map((x) => `${x.ok ? '✓' : '✗'} ${x.cond.label ?? x.cond.fact} (now ${show(x.value)})`).join(' / ')}`;
      return kind === 'forbid' ? `${label} — now ${show(p.value)} (must never reach ${show(p.need)})` : `${label} — now ${show(p.value)}, needs ${show(p.need)}`;
    };
    const row = (p, kind) => ({ kind, label: p.cond.label ?? p.cond.fact, fact: p.cond.fact ?? null, op: p.cond.op ?? p.group, value: p.value, need: p.need, ok: kind === 'forbid' ? !p.ok : p.ok, text: text(p, kind) });
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
    return { id, name: rule.name, scope: rule.scope, stage: stage(id), found: engine.everUnlocked(id), foundHere: engine.unlockedInRun(id) || (rule.oncePerAccount && !!engine.account.history[id]), ok: res.ok, rows, firstFail, triggers: rule.triggerEvents };
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
    // Milestone 25: account-wide rewards — switches (accolades, the mascot, the Heritage livery …), Prestige Tokens and
    // the final Rumour Archive page.
    accountFlag: (id) => accountFlags()[id] ?? null,
    accolades: () => Object.keys(ACCOUNT_FLAGS).filter((k) => accountFlags()[k] != null).map((k) => ({ id: k, text: ACCOUNT_FLAGS[k], day: accountFlags()[k] })),
    get prestigeTokens() {
      return accountFlags().prestigeTokens ?? 0;
    },
    get finalPage() {
      return accountFlags().finalRumourPage != null ? FINAL_RUMOUR_PAGE : null;
    },
    runFlag: (id) => flags.includes(`flag:${id}`),
    // How many of the 34 are found on this device (any run) / in this run.
    foundCount: () => secretFoundIds().length,
    // Secret ids found in this run, plus account-scope ones found in any run (what team.unlocks.secrets lists).
    unlockedIds: () => rules.filter((r) => engine.unlockedInRun(r.id) || (r.oncePerAccount && engine.account.history[r.id])).map((r) => r.id),
    // ?debug=1 only: the secret as if its facts held (it fires its rewards through the normal runner, once). Sets the
    // competitive-invalid flag (a forced result), which Giant Killer reads.
    debugForce(id) {
      const rule = byId[id];
      if (!rule) return null;
      accountFlags().debugForced = true;
      saveAccount();
      depth++;
      let out;
      try {
        out = engine.unlock(rule);
      } finally {
        depth--;
      }
      drainFound();
      return out;
    },
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
      setStarters(team.roster.map((s) => s.id));
      flags = [];
      rumourLog = [];
      runClues = {};
      postEnding = false;
    },
    serialize: () => JSON.parse(JSON.stringify({ run: engine.serializeRun(), runner: { unlocked: runner.unlocked, log: runner.log }, log, flags, rumourLog, runClues, postEnding })),
    // A save from before Milestone 24: no rule state; the records are rebuilt from what the save has (its cars and the
    // races still in its history), so facts start from the team's real past. Before Milestone 25: the new record
    // fields are filled from what each record has, and the starting staff from the founder's team.
    load(data) {
      engine.loadRun(data?.run ?? null);
      runner.reset();
      if (data?.runner) {
        runner.unlocked = JSON.parse(JSON.stringify(data.runner.unlocked ?? {}));
        runner.log = JSON.parse(JSON.stringify(data.runner.log ?? []));
      }
      flags = [...(data?.flags ?? [])];
      rumourLog = JSON.parse(JSON.stringify(data?.rumourLog ?? []));
      runClues = { ...(data?.runClues ?? {}) };
      postEnding = !!data?.postEnding;
      const starters = () => team.founderDef?.()?.team ?? STARTERS;
      if (data?.log) {
        log = { ...blankLog(), ...JSON.parse(JSON.stringify(data.log)) };
        log.races = log.races.map(upgradeRace);
        if (!data.log.starters) setStarters(starters());
        return true;
      }
      log = blankLog();
      for (const rec of team.cars.cars.list()) onCar(rec);
      for (const e of team.races.history) onRace(e, { rebuilding: true });
      if (team.championships.titles().length) first('firstTitle');
      log.monthStartCredits = team.money.credits;
      setStarters(starters());
      return false;
    },
  };
  return api;
}
