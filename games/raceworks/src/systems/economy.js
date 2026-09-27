// The team's money, reputation and development contracts (Milestone 5), on the shared engine:
//   core/EconomySystem   the ledger (every change is one line: day, amount, reason, balance) and Emergency Credit
//   core/ReputationSystem + CompanyRank   Reputation and the rank letter (bible §9.3), never below the rank floor
//   core/ContractSystem  the monthly development-contract offer
// driven by data/economy.js. The team (src/app/Team.js) calls the hooks from its calendar and car events:
//   newGame()            the §30.2 starting state as ledger lines, this month's salaries, the first offer
//   daily(job)           the running cost of the car being built (budget focus changes it); contract deadlines
//   monthStart()         interest on a negative balance, salaries, car upkeep, a new contract offer
//   carFinished(record)  Reputation, the car's Condition, and delivery to an open contract
// Player actions (each returns { ok, reason }): canStartCar(parts) / chargeParts(…) · emergencyFix(job) ·
//   repairCar(number) · accept(id) · deliverFromGarage(id)
// Readers: credits · inDebt · floor · rank · monthInOut() · contracts · reconcile()
import { EconomySystem } from '../../../../core/EconomySystem.js';
import { ReputationSystem } from '../../../../core/ReputationSystem.js';
import { ContractSystem } from '../../../../core/ContractSystem.js';
import { valueForRank } from '../../../../core/CompanyRank.js';
import { Rng } from '../../../../core/Rng.js';
import { CURRENCIES, START_MONEY, START_REPUTATION, RANKS, DEBT, COSTS, REPUTATION, CONTRACTS, LEDGER } from '../../data/economy.js';
import { BUDGETS, CLASSES } from '../../data/cars.js';

export function createTeamMoney({ bus, seed, clock, staff, cars, staffName = (s) => s.name }) {
  const today = () => clock.totalDays;
  const economy = new EconomySystem({
    bus,
    currencies: CURRENCIES,
    // closureMonths: never — bible §3's Rescue Investor restructures debt instead (a later milestone).
    debt: { warnBelow: 0, limit: DEBT.floorByRank.E, monthlyInterestPct: DEBT.monthlyInterestPct, closureMonths: Number.MAX_SAFE_INTEGER, blockedWhileNegative: DEBT.blocked },
    now: today,
    maxLines: LEDGER.keepLines,
  });
  const reputation = new ReputationSystem({ bus, ranks: RANKS });
  const clientName = (def, rng) => rng.pick(def.client);

  // One contract's terms from its data (bible §29): a Quality target, a deadline, Credits and RP.
  function terms(def, rng) {
    const target = rng.int(def.qualityMin, def.qualityMax);
    return {
      kind: def.kind,
      title: def.title,
      client: clientName(def, rng),
      classId: def.classId,
      targetQuality: target,
      deadlineDays: def.deadlineDays,
      credits: Math.round(def.credits.base + def.credits.perQuality * target),
      rp: Math.round(def.rp.base + def.rp.perQuality * target),
      newBuildOnly: def.newBuildOnly,
    };
  }
  // Can this finished car deliver this contract?
  function carFits(c, rec) {
    const fails = [];
    if (!rec?.result) return { ok: false, failures: ['no car'] };
    if (rec.result.classId !== c.classId) fails.push(`needs a ${CLASSES[c.classId].name}`);
    if (rec.result.quality < c.targetQuality) fails.push(`Quality ${rec.result.quality} is under the target ${c.targetQuality}`);
    if (c.newBuildOnly && rec.number <= (c.carsAtAccept ?? 0)) fails.push('needs a car finished after accepting');
    // A build contract keeps its car; a rescue job only borrows one for a test run, so any car will do again.
    if (rec.contractId && c.kind !== 'rescue') fails.push('that car has already delivered a contract');
    return { ok: !fails.length, failures: fails };
  }

  const contracts = new ContractSystem({
    rng: new Rng(`${seed}-contracts`),
    bus,
    maxActive: CONTRACTS.maxActive,
    offersPerMonth: CONTRACTS.offersPerMonth,
    hooks: {
      generate: (ctx, rng) => terms(ctx.inDebt ? CONTRACTS.rescue : CONTRACTS.clubBuild, rng),
      check: (c, rec) => carFits(c, rec),
      onSuccess(c, rec) {
        rec.contractId = c.id;
        economy.add('credits', c.credits, `Contract paid: ${c.title} (${c.client})`, 'contract');
        economy.add('rp', c.rp, `Contract RP: ${c.title}`, 'contract');
        reputation.add(REPUTATION.contractDone, `Contract delivered: ${c.title}`);
      },
    },
  });

  // The Emergency Credit floor follows the highest rank reached (bible §30.5: the floor scales with rank).
  const syncFloor = () => (economy.debt.limit = valueForRank(RANKS, DEBT.floorByRank, reputation.highestRankIndex));
  bus.on('reputation:rankUp', syncFloor);

  // While in debt, a rescue job is offered at once (bible §3: rescue contracts become more likely).
  function offerRescue() {
    const all = [...contracts.offers, ...contracts.active];
    if (all.some((c) => c.kind === 'rescue')) return null;
    const c = contracts._make(terms(CONTRACTS.rescue, contracts.rng), null, today());
    contracts.offers.push(c);
    return c;
  }
  bus.on('economy:debt', ({ inDebt }) => inDebt && offerRescue());

  const salaryBill = () => staff.staff.reduce((t, s) => t + (s.salary ?? 0), 0);
  const upkeepBill = () => cars.cars.list().length * COSTS.maintenance.perCarMonthly;
  const carDailyCost = (job) => Math.round(COSTS.carDaily * (1 + BUDGETS[job.data.budget].costPct / 100));
  const credits = () => economy.balance('credits');

  // A purchase: refused if it would take the cash below the Emergency Credit floor.
  function affordable(amount) {
    return credits() - amount >= economy.debt.limit;
  }

  function paySalaries() {
    for (const s of staff.staff) if (s.salary) economy.add('credits', -s.salary, `Salary: ${staffName(s)}`, 'salary');
  }

  const api = {
    economy,
    reputation,
    contracts,
    get credits() {
      return credits();
    },
    get rp() {
      return economy.balance('rp');
    },
    get tokens() {
      return economy.balance('tokens');
    },
    get inDebt() {
      return economy.inDebt;
    },
    get floor() {
      return economy.debt.limit;
    },
    get rank() {
      return reputation.rank.id;
    },
    get nextRank() {
      return reputation.nextRank;
    },
    salaryBill,
    upkeepBill,
    carDailyCost,
    affordable,
    offerRescue,
    reconcile: () => economy.reconcile(),

    // --- the calendar -------------------------------------------------------------------------------------------
    newGame() {
      economy.reset();
      economy.debt.limit = DEBT.floorByRank.E;
      reputation.load({ value: START_REPUTATION, highestRankIndex: 0 });
      contracts.reset();
      for (const [cur, amount] of Object.entries(START_MONEY)) economy.add(cur, amount, `Starting ${CURRENCIES[cur].name}`, 'start');
      paySalaries(); // day 1 of month 1 is a salary day too
      contracts.monthStart({ inDebt: false }, today());
    },
    daily(job) {
      if (job) economy.add('credits', -carDailyCost(job), `Build running cost: ${job.name}`, 'project');
    },
    dailyAfter() {
      contracts.dailyTick(today());
    },
    monthStart() {
      economy.monthEnd(); // interest on last month's negative balance
      paySalaries();
      const n = cars.cars.list().length;
      if (n) economy.add('credits', -upkeepBill(), `Car upkeep (${n} car${n === 1 ? '' : 's'})`, 'maintenance');
      contracts.monthStart({ inDebt: economy.inDebt }, today());
    },
    carFinished(rec) {
      rec.condition = 100;
      const rep = REPUTATION.carFinished + Math.floor(rec.result.quality / 10) * REPUTATION.carQualityBonusPer10;
      reputation.add(rep, `Car finished: ${rec.name}`);
      for (const c of [...contracts.active]) if (carFits(c, rec).ok) contracts.deliver(c.id, rec, today());
    },

    // --- player actions -----------------------------------------------------------------------------------------
    // A new car: blocked while in debt (non-essential building) unless a rescue contract is open; the parts must be
    // affordable down to the floor.
    // With a rescue job open the car is essential (it is the way out), so its parts may pass the floor — a team deep
    // in debt with no car can never be stuck.
    canStartCar(cost) {
      const rescue = contracts.active.some((c) => c.kind === 'rescue');
      if (economy.isBlocked('newCar') && !rescue) return { ok: false, reason: 'No new cars while on Emergency Credit (a rescue job allows one)' };
      if (!rescue && !affordable(cost)) return { ok: false, reason: `Not enough Credits (the Emergency Credit floor is ${economy.debt.limit.toLocaleString('en-US')})` };
      return { ok: true };
    },
    chargeParts(name, cost) {
      economy.add('credits', -cost, `Car parts: ${name}`, 'parts');
    },
    // Emergency Fix (bible §14.8): one open fault fixed now, for Credits and a little Innovation.
    emergencyFix(job) {
      const open = job?.data.faults.find((f) => !f.fixed);
      if (!open) return { ok: false, reason: 'No open faults' };
      const cost = COSTS.emergencyFix.credits;
      if (!affordable(cost)) return { ok: false, reason: 'Not enough Credits' };
      economy.add('credits', -cost, `Emergency Fix: ${job.name}`, 'fix');
      open.fixed = 'emergency';
      open.fixedDay = today();
      job.data.innovation = Math.max(0, job.data.innovation - COSTS.emergencyFix.innovation);
      bus.emit('car:fix', { job, fault: open, how: 'emergency' });
      return { ok: true, fault: open };
    },
    repairCost(rec) {
      return Math.max(0, Math.round((100 - (rec?.condition ?? 100)) * COSTS.repair.perPoint));
    },
    // Repairs are essential (bible §30.5): allowed in debt, down to the floor.
    repairCar(number) {
      const rec = cars.cars.get(number);
      const cost = api.repairCost(rec);
      if (!rec || !cost) return { ok: false, reason: 'Nothing to repair' };
      if (!affordable(cost)) return { ok: false, reason: 'Not enough Credits' };
      economy.add('credits', -cost, `Repair: ${rec.name}`, 'repair');
      rec.condition = 100;
      bus.emit('car:repaired', { record: rec, cost });
      return { ok: true, cost };
    },
    // A new-build contract counts only cars finished from now on (carsAtAccept = the Car Garage count today).
    accept(id) {
      const r = contracts.accept(id, today());
      if (r.ok) r.contract.carsAtAccept = cars.cars.count;      return r;
    },
    // The best car in the Car Garage that fits (for a contract any existing car can deliver).
    garageCarFor(id) {
      const c = contracts.active.find((x) => x.id === id);
      if (!c) return null;
      const fits = cars.cars.list().filter((r) => carFits(c, r).ok);
      return fits.sort((a, b) => a.result.quality - b.result.quality)[0] ?? null; // the lowest that still fits
    },
    deliverFromGarage(id) {
      const rec = api.garageCarFor(id);
      if (!rec) return { ok: false, reason: 'No car in the Car Garage fits' };
      const r = contracts.deliver(id, rec, today());
      return r.ok ? { ok: true, record: rec } : { ok: false, reason: r.failures.join('; ') };
    },
    carFits,

    // This month's Credits in and out (from the ledger, day 1 of this month to today).
    monthInOut() {
      const from = today() - (clock.day - 1);
      let inn = 0;
      let out = 0;
      for (const l of economy.ledger) {
        if (l.currency !== 'credits' || l.day < from || l.category === 'carried') continue;
        if (l.amount > 0) inn += l.amount;
        else out -= l.amount;
      }
      return { in: inn, out, net: inn - out };
    },

    serialize: () => ({ economy: economy.serialize(), reputation: reputation.serialize(), contracts: contracts.serialize() }),
    load(s) {
      economy.load(s.economy);
      reputation.load(s.reputation);
      contracts.load(s.contracts);
      syncFloor();
    },
  };
  return api;
}
