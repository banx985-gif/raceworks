// Achievements, records and completion (Milestone 26, bible §34, §7 Rankings / Records / Achievements, §13.2–13.3).
//
//   team.achievements = createAchievements({ bus, team })        (after team.secrets: it shares the secrets' facts)
//   .rules · .earned(id) · .earnedList() · .engine · .facts
//   .setAccount({ load, save }) · .loadAccount() · .attached      the ACCOUNT block (survives slot deletes and NG+); with
//                                                                no account attached nothing is earned, paid or recorded
//   .sync()            after a slot loads: records rebuilt from the save, completion sets, every achievement checked once
//   .record(id, key?) → { team, device }                           one record: this team's value and the device's best
//   .records()         every record for the Records screen        .completion() → { pct, rows, prestige }
//   .serialize() / .load(data) / .newGame()                       the run half (this slot)
//
// • The 30 achievements (data/achievements.js) are rules on a second core/SecretEngine — the M24 engine, the same facts
//   (team.secrets.facts, plus the Milestone 26 facts below) and the same trigger moments (data/secrets.js TRIGGERS).
//   Every one is account-wide and once only: the engine's account history says it was earned, so a reload, another
//   slot or New Game+ can never earn (or pay) it again. Its reward (Credits / RP / Racing Tokens) goes to the team that
//   earned it; 'achievement:unlocked' is sent (Milestone 25b: an item may follow) and a minor event goes to the Inbox
//   (data/events.js EV_ACHIEVEMENT, the strip only when no other is waiting).
// • Records: core/AccountRecords keeps the device's bests (per track, per car family …) in the account block; this
//   team's own values are read live from the slot (careers, the secret engine's race / car records, the run log here).
// • Completion: visible content only (data COMPLETION) — every category's found set is a union over every run on the
//   device, kept in the account block; no category counts a secret, so the denominators never move and nothing about
//   the secrets (how many exist, how many are left) is ever in what the screen is given before the ending. After the
//   ending (Milestone 27: team.secrets.postEnding) a separate prestige line may show the secrets found.
import { SecretEngine } from '../../../../core/SecretEngine.js';
import { AccountRecords } from '../../../../core/AccountRecords.js';
import { TRIGGERS, SECRET_READINGS as SR, SECRET_IDS } from '../../data/secrets.js';
import { ACHIEVEMENTS, ACHIEVEMENT_READINGS as AR, COMPLETION, VISIBLE_TIERS, VISIBLE_COMBOS, RECORDS, PRESTIGE_READINGS as PR, RECORDS_TEXT } from '../../data/achievements.js';
import { CHAMPIONSHIPS } from '../../data/championships.js';
import { FACILITIES, EXPANSIONS } from '../../data/facilities.js';
import { PARTS } from '../../data/cars.js';
import { ALL_STAFF } from '../../data/staff.js';
import { unlockContext, partState } from './carCatalog.js';

const ACCOUNT_VERSION = 1; // the account block's shape (raise with a step in loadAccount)
const VISIBLE_CHAMPS = CHAMPIONSHIPS.filter((c) => c.type !== 'secret').map((c) => c.id); // C01–C10
const VISIBLE_FACILITIES = FACILITIES.filter((f) => !f.prop && !f.unlock?.secret).map((f) => f.id);
const NORMAL_WINGS = EXPANSIONS.filter((z) => !z.secret).map((z) => z.id);
const DISCOVERABLE_PARTS = SR.licences.filter((id) => !PARTS[id]?.unlock?.start);
const NAME = Object.fromEntries(ALL_STAFF.map((d) => [d.id, d.name]));
const blankLog = () => ({ yearEnds: [], peakCredits: 0, sponsorMet: 0, tiers: [] });
const blankSets = () => ({ championships: [], research: [], parts: [], facilities: [], tiers: [] });

export function createAchievements({ bus, team, rules = ACHIEVEMENTS }) {
  const facts = team.secrets.facts;
  let log = blankLog(); // this run (the slot)
  let account = { load: async () => null, save: async () => {} };
  let attached = false;
  let sets = blankSets(); // completion: what this device has ever reached (every run)
  const now = () => ({ day: team.clock.totalDays, year: team.clock.year, runId: team.runId });
  const recs = new AccountRecords({ defs: RECORDS, now });
  const byId = Object.fromEntries(rules.map((r) => [r.id, r]));

  // --- the Milestone 26 facts (data/secrets.js FACTS lists them for the validator) --------------------------------
  const races = () => team.secrets.log.races;
  facts
    .define('run.champsOpen', () => {
      const CH = team.championships;
      return VISIBLE_CHAMPS.filter((id) => !CH.unlockWhy(id) || CH.titles().includes(id) || CH.current?.id === id);
    })
    .define('run.partsDiscovered', () => {
      const ctx = unlockContext(team);
      return DISCOVERABLE_PARTS.filter((id) => partState(id, ctx).open).length;
    })
    .define('run.preparedCars', () => team.cars.cars.list().filter((c) => (c.condition ?? 100) >= AR.preparedCondition).length)
    .define('run.staffCount', () => team.roster.length)
    .define('run.maxStaffLevel', () => Math.max(0, ...team.roster.map((s) => s.level ?? 1)))
    .define('run.expansionsOpen', () => team.facilities.expansions().filter((z) => NORMAL_WINGS.includes(z.id) && z.state === 'open').length)
    .define('run.sponsorDealsMet', () => log.sponsorMet)
    .define('run.yearEnds', () => log.yearEnds);

  const engine = new SecretEngine({ bus: null, rules, facts, runner: null, ngPlus: () => 0, currencyTypes: [], easing: { countFactor: 1, thresholdPct: 0 }, now, discoveredStage: 1 });

  // --- earning ----------------------------------------------------------------------------------------------------
  const earned = (id) => !!engine.account.history[id];
  function pay(rule) {
    const reason = `Achievement: ${rule.name}`;
    for (const a of rule.rewardActions ?? []) {
      if (a.type === 'credits') team.money.economy.add('credits', a.amount, reason, 'achievement');
      else if (a.type === 'tokens') team.money.economy.add('tokens', a.amount, reason, 'achievement');
      else if (a.type === 'rp') team.research.addRp(a.amount, reason);
    }
  }
  const rewardText = (rule) => {
    const a = Object.fromEntries((rule.rewardActions ?? []).map((x) => [x.type, x.amount]));
    return [a.credits ? `+${a.credits.toLocaleString('en-US')} Credits` : '', a.rp ? `+${a.rp} RP` : '', a.tokens ? `+${a.tokens} Racing Tokens` : ''].filter(Boolean).join(' · ');
  };
  // The engine has already written it into the account history (once ever); pay, announce, save.
  function granted(got) {
    for (const { rule } of got) {
      pay(rule);
      bus.emit('achievement:unlocked', { def: rule, when: engine.account.history[rule.id]?.first ?? now() });
      team.events?.announce?.('EV_ACHIEVEMENT', { name: rule.name, recipe: rule.recipe, reward: rewardText(rule), icon: rule.icon });
    }
    if (got.length) saveAccount();
    return got.map((g) => g.rule.id);
  }
  // They live on the account record: with no account attached (a slot card being described, an older test) nothing is
  // earned or paid.
  function check(trigger, payload = {}) {
    if (!attached) return [];
    return granted(engine.notify(trigger, payload));
  }
  // Every achievement not yet earned, looked at once (a save that loads may already meet some).
  function checkAll() {
    if (!attached) return [];
    const got = [];
    for (const rule of rules) if (engine.open(rule) && engine.evaluate(rule, { event: 'sync', payload: {} }).ok) got.push(engine.unlock(rule));
    return granted(got.filter(Boolean));
  }

  // --- this team's records (read live from the slot) ----------------------------------------------------------------
  function longestFinishedRun() {
    let best = 0;
    let cur = 0;
    for (const r of races()) {
      cur = r.retired ? 0 : cur + 1;
      best = Math.max(best, cur);
    }
    return best;
  }
  const perTrack = (pick, better) => {
    const out = {};
    for (const r of races()) {
      const v = pick(r);
      if (v == null || !(v > 0)) continue;
      if (out[r.trackId] == null || (better === 'min' ? v < out[r.trackId] : v > out[r.trackId])) out[r.trackId] = v;
    }
    return out;
  };
  // id → value, or { key: value } for a keyed record (only what this team has done; nothing yet → null / {}). The
  // Records sheet is built every frame: the values are kept until something they read changes.
  let memo = null;
  function runValues() {
    const k = `${team.clock.totalDays}|${races().length}|${team.cars.cars.list().length}|${team.money.credits}|${team.careers.facts.wins}|${team.careers.facts.bestStintDelta}`;
    if (memo?.k !== k) memo = { k, v: computeValues() };
    return memo.v;
  }
  function computeValues() {
    const cf = team.careers.facts;
    const cars = team.cars.cars.list();
    const bestCar = cars.reduce((b, c) => ((c.result?.quality ?? 0) > (b?.result?.quality ?? -1) ? c : b), null);
    const family = {};
    for (const r of races()) if (r.won && r.family) family[r.family] = (family[r.family] ?? 0) + 1;
    const person = Object.entries(team.careers.people).reduce((b, [id, p]) => ((p.wins ?? 0) > (b?.wins ?? 0) ? { id, wins: p.wins } : b), null);
    const won = races().filter((r) => r.won);
    return {
      titles: cf.titles ?? 0,
      wins: cf.wins ?? 0,
      podiums: cf.podiums ?? 0,
      poles: races().filter((r) => r.pole).length,
      fastestLaps: races().filter((r) => r.fastestLap).length,
      peakCredits: Math.max(log.peakCredits, team.money.credits),
      bestFinish: perTrack((r) => (r.retired ? null : r.pos), 'min'),
      topSpeed: perTrack((r) => r.topSpeed, 'max'),
      lapRecord: perTrack((r) => r.bestLap, 'min'),
      bestQuality: bestCar ? { value: bestCar.result?.quality ?? 0, info: { car: bestCar.name } } : null,
      familyWins: family,
      noRetireStreak: longestFinishedRun(),
      personWins: person ? { value: person.wins, info: { name: NAME[person.id] ?? person.id } } : null,
      swingWins: cf.strategySwingWins ?? 0,
      giantKillerWins: won.filter((r) => r.champRace && (r.belowFieldPct ?? 0) >= PR.giantKillerBelowPct).length,
      perfectWeekends: won.filter((r) => PR.perfectWeekendChamps.includes(r.champ) && r.pole && r.fastestLap && r.setupScore === 100 && !r.mechFails && !r.faults && !r.spins && !r.damageHits).length,
      stintDelta: cf.bestStintDelta ?? null,
    };
  }
  // This team's values into the device's bests. → true when any record is new.
  function submitRecords() {
    const vals = runValues();
    let changed = false;
    for (const d of RECORDS) {
      const v = vals[d.id];
      const sub = (x, key = null) => {
        const value = typeof x === 'object' && x ? x.value : x;
        const info = typeof x === 'object' && x ? x.info : {};
        if (typeof value !== 'number' || !Number.isFinite(value)) return;
        if (d.better === 'max' && value <= 0) return; // nothing done yet is no record
        if (recs.submit(d.id, value, info ?? {}, key)) changed = true;
      };
      if (d.key) for (const [k, x] of Object.entries(v ?? {})) sub(x, k);
      else sub(v);
    }
    return changed;
  }

  // --- completion (visible content only) ------------------------------------------------------------------------------
  const union = (key, ids) => {
    const before = sets[key].length;
    sets[key] = [...new Set([...sets[key], ...ids])];
    return sets[key].length !== before;
  };
  function updateSets() {
    const ctx = unlockContext(team);
    let changed = false;
    changed = union('championships', team.championships.titles().filter((id) => VISIBLE_CHAMPS.includes(id))) || changed;
    changed = union('research', team.research.doneIds()) || changed;
    changed = union('parts', SR.licences.filter((id) => partState(id, ctx).open)) || changed;
    changed = union('facilities', team.facilities.builtIds().filter((id) => VISIBLE_FACILITIES.includes(id))) || changed;
    changed = union('tiers', [...log.tiers, ...team.roster.map((s) => s.tier)].filter((t) => VISIBLE_TIERS.includes(t))) || changed;
    return changed;
  }
  const visibleCombos = () => (team.combos?.records?.data ? Object.keys(team.combos.records.data.discovered ?? {}) : []).filter((id) => VISIBLE_COMBOS.includes(id));
  function completion() {
    const counts = {
      achievements: [rules.filter((r) => earned(r.id)).length, rules.length],
      championships: [sets.championships.length, VISIBLE_CHAMPS.length],
      research: [sets.research.length, 36],
      combos: [visibleCombos().length, VISIBLE_COMBOS.length],
      parts: [sets.parts.length, SR.licences.length],
      facilities: [sets.facilities.length, VISIBLE_FACILITIES.length],
      tiers: [sets.tiers.length, VISIBLE_TIERS.length],
    };
    const rows = COMPLETION.map((c) => ({ id: c.id, label: c.label, weight: c.weight, found: Math.min(counts[c.id][0], counts[c.id][1]), total: counts[c.id][1] }));
    const weights = rows.reduce((t, r) => t + r.weight, 0);
    const pct = Math.floor(rows.reduce((t, r) => t + (r.total ? (r.weight * r.found) / r.total : 0), 0) * (100 / weights));
    const out = { pct, rows, text: RECORDS_TEXT.completion(pct) };
    // Milestone 27 hook: after the ending a separate prestige line may show the secrets (never before).
    if (team.secrets?.postEnding) out.prestige = { found: team.secrets.foundCount(), total: SECRET_IDS.length };
    return out;
  }

  // --- account save -------------------------------------------------------------------------------------------------
  const accountData = () => JSON.parse(JSON.stringify({ version: ACCOUNT_VERSION, engine: engine.serializeAccount(), records: recs.records, sets }));
  function saveAccount() {
    return attached ? account.save(accountData()) : Promise.resolve();
  }
  // Records and completion after something happened; saved only when something changed.
  function refresh() {
    if (!attached) return;
    const a = submitRecords();
    const b = updateSets();
    if (a || b) saveAccount();
  }

  // --- triggers: the secrets' moments (their facts are written first: team.secrets listens before this) ------------
  const before = {
    sponsorEnded: ({ record }) => record?.met && (log.sponsorMet += 1),
    hire: ({ staff }) => staff?.tier && !log.tiers.includes(staff.tier) && log.tiers.push(staff.tier),
  };
  const refreshOn = new Set(['raceResult', 'carBuilt', 'monthEnd', 'seasonEnd', 'researchDone', 'facilityBuilt', 'hire', 'drillRecorded', 'drillDone', 'comboFound', 'rankUp']);
  for (const t of TRIGGERS) {
    bus.on(t.on, (payload) => {
      before[t.id]?.(payload ?? {});
      check(t.id, payload ?? {});
      if (refreshOn.has(t.id)) refresh();
    });
  }
  // The year's last moment: the Credits as the year turns (day 1 of month 1, before that month's bills), and the
  // peak Credits every day.
  bus.on('clock:day', () => {
    const c = team.clock;
    log.peakCredits = Math.max(log.peakCredits, team.money.credits);
    if (c.month === 1 && c.day === 1 && c.totalDays > 0 && !log.yearEnds.some((y) => y.year === c.year - 1)) log.yearEnds.push({ year: c.year - 1, credits: team.money.credits });
  });

  // --- the Records screen's reading ---------------------------------------------------------------------------------
  function record(id, key = null) {
    const v = runValues()[id];
    const teamV = key ? v?.[key] ?? null : v;
    const dev = recs.get(id, key);
    return { team: typeof teamV === 'object' && teamV ? teamV.value : teamV, teamInfo: typeof teamV === 'object' && teamV ? teamV.info : null, device: dev?.value ?? null, deviceInfo: dev?.info ?? null };
  }

  const api = {
    rules,
    engine,
    facts,
    earned,
    earnedList: () => rules.filter((r) => earned(r.id)).map((r) => ({ ...r, when: engine.account.history[r.id].first })),
    check,
    checkAll,
    completion,
    record,
    records: () => RECORDS.map((d) => ({ ...d, keys: d.key ? [...new Set([...Object.keys(runValues()[d.id] ?? {}), ...Object.keys(recs.all(d.id))])] : null })),
    deviceRecords: recs,
    get log() {
      return log;
    },
    get attached() {
      return attached;
    },
    setAccount(store) {
      account = store;
      attached = true;
    },
    async loadAccount() {
      const d = (await account.load()) ?? null;
      engine.loadAccount(d?.engine ?? null);
      recs.records = JSON.parse(JSON.stringify(d?.records ?? {}));
      sets = { ...blankSets(), ...JSON.parse(JSON.stringify(d?.sets ?? {})) };
    },
    accountData,
    // After a slot loads (main.js / tests, once the account is in): records rebuilt from what the save holds, the
    // completion sets, and every achievement looked at once.
    sync() {
      refresh();
      return checkAll();
    },
    newGame() {
      engine.resetRun();
      log = blankLog();
      log.peakCredits = team.money.credits;
      log.tiers = [...new Set(team.roster.map((s) => s.tier))];
    },
    serialize: () => JSON.parse(JSON.stringify({ run: engine.serializeRun(), log })),
    // A save from before Milestone 26: the run log rebuilt from what it holds (its Credits as the peak so far, its
    // finished sponsor deals, the tiers on the roster; the years already ended are unknown — none).
    load(data) {
      engine.loadRun(data?.run ?? null);
      if (data?.log) {
        log = { ...blankLog(), ...JSON.parse(JSON.stringify(data.log)) };
        return true;
      }
      log = blankLog();
      log.peakCredits = team.money.credits;
      log.sponsorMet = (team.sponsors?.history ?? []).filter((h) => h.met).length;
      log.tiers = [...new Set(team.roster.map((s) => s.tier))];
      return false;
    },
  };
  return api;
}
