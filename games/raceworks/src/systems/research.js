// The research tree (Milestone 11, bible §20) on the shared core/ResearchSystem + core/UnlockActions, driven by
// data/research.js. RP lives on the Milestone 5 ledger (team.money: Credits / RP / Racing Tokens on one ledger), so
// every RP in or out is a ledger line; the core tree's own rp is synced from it before each start.
//
// What finishing a node opens (its unlock actions, fired once by the UnlockRunner — never again, not after a reload):
//   part       the car builder's parts (src/systems/carCatalog reads the done nodes through team.unlocks.research)
//   facility   the Build Mode shop (src/systems/garageFacilities reads them the same way)
//   tyre       Hard / Intermediate / Wet in race weekend setups and pit calls (tyreOpen)
//   bonus      effects summed into the shared effect queries (bonus(key), read by team.facilities.bonus)
//   flag       stored for later milestones (event paths, a sponsor, secret clue eligibility — never a secret itself)
//
// The queue: core research needs a worker on a queue. Until hiring brings researchers, the crew researches together:
// the queue's worker is the built-in 'crew' researcher whose stat for a node is the team's best stat for that branch
// (data/research.js BRANCHES.stat). The second queue exists but stays closed until a facility or the VIP entitlement
// opens it (none does yet; no store wiring).
//
// RP income (RP_BALANCE, PLACEHOLDER): finished car projects (+ firsts: a new class, a new class + parts combo),
// breakthroughs, race weekends (+ first race / podium / win), the first contract (contracts pay their own RP, M5).
// What a car or race earned is kept on its record (rp, rpLines) for the result screens.
//
// api: rp · active · status(id) · why(id) · start(id) · stop() · perDay() · daysLeft() · fraction(id) · doneIds() ·
//      has(id) · bonus(key) · bonusKeys() · flag(id) · tyreOpen(id) · unlocksOf(id) · secondQueue · complete(id) ·
//      completeAll() · addRp(n, reason) · newGame() · serialize() · load(data)
// Events (core): 'research:start' / 'research:stop' / 'research:complete' { node, fired } / 'unlock:fired'.
import { ResearchSystem } from '../../../../core/ResearchSystem.js';
import { UnlockRunner } from '../../../../core/UnlockActions.js';
import { RESEARCH, BRANCHES, RP_BALANCE, QUEUES } from '../../data/research.js';
import { PARTS } from '../../data/cars.js';
import { FACILITIES } from '../../data/facilities.js';
import { TYRES, TYRE_ORDER } from '../../data/race.js';

export const CREW_RESEARCHER = 'crew';
export const BRANCH = Object.fromEntries(BRANCHES.map((b) => [b.id, b]));
export const NODE = Object.fromEntries(RESEARCH.map((n) => [n.id, n]));
// "Aerodynamics 4" — how the game names a node when something waits on it.
export const nodeLabel = (id) => (NODE[id] ? `${BRANCH[NODE[id].branch].name} ${NODE[id].tier}` : id);

// What finishing a node opens: the parts, facilities and tyres that name it, then its own bonuses and flags.
// Secret parts are never listed (they don't name a node anyway; the check keeps it so).
export function unlocksOf(id) {
  const node = NODE[id];
  return [
    ...Object.entries(PARTS)
      .filter(([, p]) => !p.secret && p.unlock?.research === id)
      .map(([pid]) => ({ type: 'part', id: pid })),
    ...FACILITIES.filter((f) => f.unlock?.research === id).map((f) => ({ type: 'facility', id: f.id })),
    ...TYRE_ORDER.filter((t) => TYRES[t].research === id).map((t) => ({ type: 'tyre', id: t })),
    ...(node?.extra ?? []).map((a) => ({ type: a.type, id: a.id })),
  ];
}
const BONUS = Object.fromEntries(RESEARCH.flatMap((n) => n.extra.filter((a) => a.type === 'bonus').map((a) => [a.id, a])));

// Every node after its prerequisites (debug complete-all and the tests). Throws on a loop.
export function topoOrder(nodes = RESEARCH) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const out = [];
  const seen = new Set();
  const visit = (n, path = new Set()) => {
    if (seen.has(n.id)) return;
    if (path.has(n.id)) throw new Error(`research loop at ${n.id}`);
    path.add(n.id);
    for (const r of n.requires) visit(byId[r], path);
    path.delete(n.id);
    seen.add(n.id);
    out.push(n.id);
  };
  for (const n of nodes) visit(n);
  return out;
}

export function createResearch({ bus, team, R = RP_BALANCE }) {
  const runner = new UnlockRunner({ bus });
  const crew = { id: CREW_RESEARCHER, name: 'The crew', stats: {} };
  // The crew's stat for a branch: the best on the team.
  const bestStat = (branch) => Math.max(0, ...team.roster.map((s) => s.stats?.[BRANCH[branch].stat] ?? 0));
  const conditionMet = (rule) => {
    if (!rule) return true;
    if (rule.any) return rule.any.some(conditionMet);
    if (rule.effect) return (team.facilities?.bonus(rule.effect) ?? 0) > 0;
    return false; // an entitlement (VIP): the store isn't wired yet
  };
  const system = new ResearchSystem({
    bus,
    nodes: RESEARCH.map((n) => ({ id: n.id, name: n.name, cost: n.rp, requires: [...n.requires], actions: unlocksOf(n.id), branch: n.branch, tier: n.tier })),
    queues: QUEUES,
    runner,
    staff: { get: (id) => (id === CREW_RESEARCHER ? crew : team.staff.get(id)) },
    rules: { basePerDay: R.basePerDay, statDivisor: R.statDivisor },
    hooks: {
      conditionMet,
      workerStat: (s, n) => (s === crew ? bestStat(n.branch) : (s.stats?.[BRANCH[n.branch].stat] ?? 0)),
      speedPct: (n) => (n ? (team.facilities?.bonus(`researchSpeedPct.${n.branch}`) ?? 0) : 0),
    },
  });
  const economy = () => team.money.economy;
  const today = () => team.clock.totalDays;

  // RP in through the ledger (and onto a record's lines, when given).
  function addRp(amount, reason, lines = null) {
    amount = Math.round(amount);
    if (!amount) return 0;
    economy().add('rp', amount, reason, 'research');
    lines?.push({ amount, reason });
    return amount;
  }
  const first = (kind, id, amount, reason, lines) => (system.firstTime(kind, id) ? addRp(amount, reason, lines) : 0);

  // --- RP income (bible §20) ------------------------------------------------------------------------------------------
  bus.on('project:complete', ({ record }) => {
    const r = record?.result;
    if (!r) return;
    const lines = [];
    addRp(R.car.base + r.quality * R.car.perQuality, `Car finished: ${record.name}`, lines);
    first('carClass', r.classId, R.firsts.carClass, 'First car of this class', lines);
    if (r.parts) first('combo', `${r.classId}:${r.parts.join('+')}`, R.firsts.combo, 'New class and parts combination', lines);
    record.rp = lines.reduce((t, l) => t + l.amount, 0);
    record.rpLines = lines;
  });
  bus.on('car:breakthrough', ({ job }) => addRp(R.breakthrough, `Breakthrough: ${job?.name ?? 'car build'}`));
  bus.on('race:finished', ({ race }) => {
    const me = race.result?.rows?.find((x) => x.isPlayer);
    const lines = [];
    if (me && me.status !== 'retired') {
      if (race.kind === 'weekend') {
        addRp(R.race.finished + (R.race.byPos[me.pos - 1] ?? 0), `Race: P${me.pos}`, lines);
        first('race', 'weekend', R.firsts.race, 'First race weekend', lines);
        if (me.pos <= 3) first('race', 'podium', R.firsts.podium, 'First podium', lines);
        if (me.pos === 1) first('race', 'win', R.firsts.win, 'First win', lines);
      } else addRp(R.testRace, 'Test race finished', lines);
    }
    race.rp = lines.reduce((t, l) => t + l.amount, 0);
    race.rpLines = lines;
  });
  bus.on('contract:success', () => first('contract', 'first', R.firsts.contract, 'First contract delivered'));
  bus.on('clock:day', () => system.dailyTick());

  const api = {
    system,
    runner,
    get rp() {
      return team.money.rp;
    },
    get active() {
      return system.queues[0].nodeId;
    },
    // The second queue: open only when a facility or entitlement allows it (never yet).
    get secondQueue() {
      return { open: system.queueOpen(1), why: 'Opens with a later facility or VIP' };
    },
    status: (id) => system.status(id),
    fraction: (id) => system.fraction(id),
    progress: (id) => system.progress[id] ?? (system.isDone(id) ? NODE[id].rp : 0),
    perDay: () => system.perDay(0),
    daysLeft: () => system.daysLeft(0),
    doneIds: () => [...system.done],
    has: (id) => system.isDone(id),
    costOf: (id) => system.costOf(id),
    paid: (id) => !!system.paid[id],
    unlocksOf,
    // Why a node can't start now (null = it can).
    why(id) {
      const st = system.status(id);
      if (st === 'done') return 'Done';
      if (st === 'active') return 'Researching now';
      if (st === 'locked') return `Needs ${system.missing(id).nodes.map((x) => `${NODE[x].name} (${nodeLabel(x)})`).join(' and ')}`;
      system.rp = team.money.rp;
      const c = system.canStart(0, id);
      if (c.ok) return null;
      if (c.reason === 'This queue is busy') return `Researching ${NODE[system.queues[0].nodeId].name} — stop it first`;
      if (c.reason === 'Not enough RP') return `Needs ${system.costOf(id)} RP (you have ${team.money.rp})`;
      return c.reason;
    },
    // Start a node on the one queue: pays its RP through the ledger the first time (a stopped node restarts free).
    start(id) {
      system.rp = team.money.rp;
      const wasPaid = !!system.paid[id];
      const r = system.start(0, id, CREW_RESEARCHER);
      if (r.ok && !wasPaid) economy().add('rp', -system.paid[id], `Research: ${NODE[id].name}`, 'research');
      return r;
    },
    stop: () => system.stop(0),

    // --- what research has opened ----------------------------------------------------------------------------------
    // A research bonus's sum for an effect key (a bonus may need a facility standing, e.g. the Engine Bench's +5%).
    bonus(key) {
      let t = 0;
      for (const id of runner.list('bonus')) for (const e of BONUS[id]?.effects ?? []) if (e.key === key && (!e.needs || team.facilities?.has(e.needs))) t += e.value;
      return t;
    },
    bonusKeys: () => [...new Set(runner.list('bonus').flatMap((id) => (BONUS[id]?.effects ?? []).map((e) => e.key)))],
    flag: (id) => runner.has('flag', id),
    tyreOpen: (id) => !!TYRES[id] && (TYRES[id].unlocked || runner.has('tyre', id)),

    // --- debug / tests ---------------------------------------------------------------------------------------------
    addRp: (n, reason = 'Debug RP') => addRp(n, reason),
    // Finish a node now, its prerequisites first (?debug=1 and the tests). Its actions fire as in play.
    complete(id) {
      for (const x of topoOrder()) {
        if (x === id || isBefore(x, id)) system.complete(x);
      }
      return system.isDone(id);
    },
    completeAll() {
      for (const x of topoOrder()) system.complete(x);
    },

    // --- a new team, save / load -------------------------------------------------------------------------------------
    newGame() {
      system.reset();
      runner.reset();
    },
    serialize: () => ({ tree: system.serialize(), unlocked: runner.serialize() }),
    // A save from before Milestone 11: nothing researched (its RP is already on the ledger). A done node's actions are
    // made sure of (the runner skips any that already fired, so nothing is granted twice).
    load(data) {
      system.load(data?.tree ?? null);
      runner.load(data?.unlocked ?? null);
      system.queues.forEach((q, i) => {
        if (q.nodeId && (!NODE[q.nodeId] || system.isDone(q.nodeId))) system.queues[i] = { nodeId: null, staffId: null };
      });
      for (const id of system.done) runner.run(system.node(id).actions, id);
    },
  };
  // Is x a (transitive) prerequisite of id?
  function isBefore(x, id) {
    return NODE[id].requires.some((r) => r === x || isBefore(x, r));
  }
  return api;
}
