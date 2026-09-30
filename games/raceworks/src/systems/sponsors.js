// Sponsors (Milestone 21, bible §29): the eight sponsors of data/sponsors.js in 1–3 slots by rank, 6-month deals, their
// stipends, race / result bonuses, perks and machine-exact obligations. Saved with the team.
//
// Why not core/SponsorSystem: it holds one deal at a time with count / avoid obligations. RACEWORKS has 1–3 slots and
// obligations that are predicates over several counters (a finish rate, deal months) — the same shape (plain data,
// signals from play, perks through one effect query) for several deals at once.
//
//   sp.deals → the running deals (slot order = the car's decal order) · sp.offers → the Sponsor board
//   sp.slots() · sp.freeSlots() · sp.signWhy(id) → null or why not · sp.sign(id) → { ok, reason, deal }
//   sp.bonus(key) → the perks' total for an effect key (team.facilities.bonus adds it: every system asks one query)
//   sp.progress(deal) → the live obligation lines · sp.isMet(deal) · sp.stipendNow(deal) · sp.daysLeft(deal)
//   sp.decals() → the sponsor ids on the car now (stored for Milestone 22's decal overlay; nothing is drawn yet)
//   sp.reputation / sp.addReputation(n, why) — sponsor reputation (development contracts pay it): + stipends
//   sp.flags — stored flags (SPN08's special event access; the event itself is a later milestone)
// The calendar (clock:day): on day 1 of a month every running deal pays its stipend (with the salaries) — a deal pays on
// each day 1 after the day it was signed up to and including its last day: exactly 6 stipends; then each deal month
// (28 days from signing) that has ended is judged (its net Credits from the ledger); then a deal that has run its 168
// days ends: met → the completion bonus (if not paid yet) and a renewal offer (+ renewBumpPct on the terms); not met →
// it is offered again at − retryCutPct. Failure never blocks anything. Then the monthly offers refresh.
// Everything that pays is idempotent: each race, round, car, contract and deal month is counted once per deal (kept on
// the deal), the completion bonus is paid once (deal.completionPaid), a stipend once a month (deal.lastStipendDay).
import { Rng } from '../../../../core/Rng.js';
import { SPONSORS, sponsorById, SPONSOR_SLOTS, DEAL_DAYS, DEAL_MONTH_DAYS, SPONSOR_BALANCE as B } from '../../data/sponsors.js';
import { raceFacts, carFacts, matchWhere, testPredicate } from './sponsorFacts.js';
import { typeCheck } from './contracts.js';
import { contractType } from '../../data/contracts.js';

const round10 = (n) => Math.round(n / 10) * 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The deal's counters that aren't in its sponsor's data are never read; every deal keeps the same seen-lists.
const blankSeen = () => ({ race: [], roundDue: [], car: [], contract: [], bonus: [] });

export function createSponsors({ bus, team, seed = 'raceworks' }) {
  const today = () => team.clock.totalDays;
  const rng = new Rng(`${seed}-sponsors`);
  const rankId = () => team.money.rank;

  const api = {
    deals: [], // { id, startDay, endDay, stipend, bonusCredits, completion, counts, seen, monthsChecked, monthNets, stipendsPaid, lastStipendDay, met, completionPaid, bonusesPaid, renewal }
    offers: [], // { id, day, untilDay, kind: 'monthly' | 'renewal' | 'retry', termsX }
    history: [], // { id, startDay, endDay, met, stipends, bonuses, completion }
    terms: {}, // sponsor id → the terms multiplier (renewals up, misses down)
    reputation: 0,
    flags: {},
    rng,

    slots: () => SPONSOR_SLOTS[rankId()] ?? 1,
    freeSlots: () => Math.max(0, api.slots() - api.deals.length),
    termsOf: (id) => api.terms[id] ?? 1,
    reputationPct: () => Math.min(B.reputationPctMax, api.reputation * B.reputationPctPerPoint),

    // What a deal with this sponsor would pay a month now (the terms are fixed when it is signed).
    stipendFor(id, termsX = api.termsOf(id)) {
      const d = sponsorById(id);
      return round10(d.stipend * (B.rankX[rankId()] ?? 1) * termsX * (1 + api.reputationPct() / 100));
    },
    bonusFor: (id, termsX = api.termsOf(id)) => round10(sponsorById(id).bonus.credits * (B.rankX[rankId()] ?? 1) * termsX),
    // This month's stipend for a running deal: its fixed stipend + the perks' sponsorStipendPct (Bolt Cola +8%).
    stipendNow: (deal) => round10(deal.stipend * (1 + api.bonus('sponsorStipendPct') / 100)),
    daysLeft: (deal) => Math.max(0, deal.endDay - today()),

    // Why this sponsor won't offer now (null = it can): the sponsor's own needs (data/sponsors.js needs).
    needsWhy(def) {
      const n = def.needs ?? {};
      if (n.research && !team.research?.doneIds().includes(n.research)) return `Needs ${n.research} research`;
      if (n.champTags) {
        const open = team.championships?.list().some((c) => !c.locked && c.def.classes.some((t) => n.champTags.includes(t)));
        if (!open) return 'Needs a GT / Endurance / Prototype championship open';
      }
      if (n.contractType && !typeCheck(team, contractType(n.contractType)).ok) return 'Needs a technology demo contract to be possible';
      return null;
    },
    // Sponsors who could make a new offer today: not on the car, not on the board, their needs met.
    offerable: () => SPONSORS.filter((d) => !api.deals.some((x) => x.id === d.id) && !api.offers.some((o) => o.id === d.id) && !api.needsWhy(d)),

    signWhy(id) {
      const o = api.offers.find((x) => x.id === id);
      if (!o) return 'No offer from this sponsor';
      if (api.deals.some((x) => x.id === id)) return 'Already on the car';
      if (!api.freeSlots()) return `All ${api.slots()} sponsor slot${api.slots() === 1 ? ' is' : 's are'} full (Rank ${rankId()})`;
      return null;
    },
    sign(id) {
      const why = api.signWhy(id);
      if (why) return { ok: false, reason: why };
      const o = api.offers.find((x) => x.id === id);
      api.offers = api.offers.filter((x) => x !== o);
      const def = sponsorById(id);
      const day = today();
      const stipend = api.stipendFor(id, o.termsX);
      const deal = {
        id,
        startDay: day,
        endDay: day + DEAL_DAYS,
        termsX: o.termsX,
        stipend,
        bonusCredits: api.bonusFor(id, o.termsX),
        completion: stipend * B.completionMonths,
        counts: Object.fromEntries(Object.keys(def.obligation.counters).map((k) => [k, 0])),
        seen: blankSeen(),
        monthsChecked: 0,
        monthNets: [],
        stipendsPaid: 0,
        lastStipendDay: null,
        met: false,
        completionPaid: false,
        bonusesPaid: 0,
        renewal: o.kind === 'renewal',
      };
      api.deals.push(deal);
      if (def.specialEvent) api.flags[def.specialEvent] ??= day; // SPN08: special event access, stored for later
      bus?.emit('sponsor:signed', { deal, def });
      return { ok: true, deal };
    },

    // The perks' total for an effect key (running deals only).
    bonus(key) {
      let t = 0;
      for (const deal of api.deals) for (const p of sponsorById(deal.id).perks) if (p.key === key) t += p.value;
      return t;
    },
    bonusKeys: () => [...new Set(SPONSORS.flatMap((d) => d.perks.map((p) => p.key)))],
    decals: () => api.deals.map((d) => d.id),
    addReputation(n, why = '') {
      if (!n) return;
      api.reputation += n;
      bus?.emit('sponsor:reputation', { value: api.reputation, change: n, why });
    },

    isMet: (deal) => testPredicate(sponsorById(deal.id).obligation.test, deal.counts),
    // The Sponsor sheet's lines: "2 / 3 championship races finished with telemetry on".
    progress(deal) {
      const ob = sponsorById(deal.id).obligation;
      return ob.progress.map((p) => {
        const v = deal.counts[p.counter] ?? 0;
        const of = p.ofCounter ? deal.counts[p.ofCounter] ?? 0 : p.of;
        return { text: of !== undefined ? `${v} / ${of} ${p.text}` : `${p.text}: ${v}`, value: v, of: of ?? null };
      });
    },

    // --- signals from play --------------------------------------------------------------------------------------
    // One thing happened (on: 'race' | 'roundDue' | 'car' | 'dealMonth' | 'contract'); key = its identity (counted once
    // per deal); facts = what the counters' filters read. deals = which deals hear it (default: all running).
    signal(on, key, facts, deals = api.deals) {
      for (const deal of deals) {
        const def = sponsorById(deal.id);
        const seen = (deal.seen[on] ??= []);
        if (key !== null && seen.includes(key)) continue;
        if (key !== null) seen.push(key);
        let changed = false;
        for (const [name, c] of Object.entries(def.obligation.counters)) {
          if (c.on !== on || !matchWhere(facts, c.where)) continue;
          deal.counts[name] = (deal.counts[name] ?? 0) + (c.sum ? facts[c.sum] ?? 0 : 1);
          changed = true;
        }
        if (changed) bus?.emit('sponsor:progress', { deal, def });
        if (def.obligation.when === 'any' && !deal.met && api.isMet(deal)) api.meet(deal);
      }
    },
    // The obligation is met: the completion bonus, once.
    meet(deal) {
      deal.met = true;
      if (!deal.completionPaid) {
        deal.completionPaid = true;
        team.money.economy.add('credits', deal.completion, `Sponsor bonus: ${sponsorById(deal.id).name} (obligation met)`, 'sponsor');
      }
      bus?.emit('sponsor:met', { deal, def: sponsorById(deal.id) });
    },
    // A race weekend raced to the end: the race / result bonus (once per race) and the counters.
    raceFinished(entry) {
      if (entry?.kind !== 'weekend') return;
      const f = raceFacts(entry);
      const live = api.deals.filter((d) => entry.day >= d.startDay && entry.day <= d.endDay);
      for (const deal of live) {
        const def = sponsorById(deal.id);
        if (deal.seen.bonus.includes(entry.n) || !matchWhere(f, def.bonus.when)) continue;
        deal.seen.bonus.push(entry.n);
        deal.bonusesPaid += deal.bonusCredits;
        team.money.economy.add('credits', deal.bonusCredits, `Sponsor race bonus: ${def.name} (${def.bonus.text})`, 'sponsor');
      }
      // a championship round raced is a round that existed during the deal, even if it came due before it
      if (entry.champ) api.signal('roundDue', roundKey(entry.champ), {}, live);
      api.signal('race', entry.n, f, live);
    },

    // --- the calendar ---------------------------------------------------------------------------------------------
    dailyTick() {
      const day = today();
      const monthStart = team.clock.day === 1;
      if (monthStart) api.payStipends(day);
      for (const deal of api.deals) api.judgeMonths(deal, day);
      for (const deal of [...api.deals]) if (day >= deal.endDay) api.endDeal(deal, day);
      if (monthStart) api.refreshOffers(day);
    },
    payStipends(day) {
      for (const deal of api.deals) {
        if (!(deal.startDay < day && day <= deal.endDay) || deal.lastStipendDay === day || deal.stipendsPaid >= DEAL_DAYS / DEAL_MONTH_DAYS) continue;
        deal.lastStipendDay = day;
        deal.stipendsPaid++;
        team.money.economy.add('credits', api.stipendNow(deal), `Sponsor stipend: ${sponsorById(deal.id).name} (${deal.stipendsPaid} of 6)`, 'sponsor');
      }
    },
    // Each deal month that has ended: its net Credits (in − out, every ledger line of those 28 days).
    judgeMonths(deal, day) {
      while (deal.monthsChecked < DEAL_DAYS / DEAL_MONTH_DAYS && day >= deal.startDay + DEAL_MONTH_DAYS * (deal.monthsChecked + 1)) {
        const from = deal.startDay + DEAL_MONTH_DAYS * deal.monthsChecked;
        const net = api.netBetween(from, from + DEAL_MONTH_DAYS);
        deal.monthNets.push(net);
        const k = deal.monthsChecked++;
        api.signal('dealMonth', k, { net, netPositive: net > 0 }, [deal]);
      }
    },
    netBetween(from, to) {
      let net = 0;
      for (const l of team.money.economy.ledger) if (l.currency === 'credits' && l.category !== 'carried' && l.day >= from && l.day < to) net += l.amount;
      return net;
    },
    // This deal month so far (the Sponsor sheet, Crown Finance).
    monthSoFar(deal) {
      const k = Math.min(deal.monthsChecked, DEAL_DAYS / DEAL_MONTH_DAYS - 1);
      const from = deal.startDay + DEAL_MONTH_DAYS * k;
      return { month: k + 1, net: api.netBetween(from, today() + 1) };
    },
    endDeal(deal, day) {
      const def = sponsorById(deal.id);
      if (!deal.met && api.isMet(deal)) api.meet(deal); // 'end' obligations (Bolt Cola's finish rate) are judged now
      const met = deal.met;
      api.deals = api.deals.filter((d) => d !== deal);
      const rec = { id: deal.id, startDay: deal.startDay, endDay: day, met, stipends: deal.stipendsPaid, bonuses: deal.bonusesPaid, completion: deal.completionPaid ? deal.completion : 0, counts: { ...deal.counts } };
      api.history.push(rec);
      if (api.history.length > 40) api.history.shift();
      api.terms[deal.id] = clamp(api.termsOf(deal.id) * (met ? 1 + B.renewBumpPct / 100 : 1 - B.retryCutPct / 100), B.termsMin, B.termsMax);
      api.offers = api.offers.filter((o) => o.id !== deal.id);
      const offer = { id: deal.id, day, untilDay: day + B.offerDays, kind: met ? 'renewal' : 'retry', termsX: api.termsOf(deal.id) };
      api.offers.push(offer);
      bus?.emit('sponsor:ended', { record: rec, def, offer });
      return rec;
    },
    // Day 1 of a month: last month's offers go (a renewal / retry waits its offerDays), new ones come from the generator.
    refreshOffers(day = today()) {
      api.offers = api.offers.filter((o) => o.kind !== 'monthly' && o.untilDay > day);
      const n = B.offersPerMonth + (team.facilities?.unlocked('sponsorPortfolio') ? B.portfolioOffers : 0);
      const pool = api.offerable();
      for (let i = 0; i < n && pool.length; i++) {
        const [def] = pool.splice(Math.floor(rng.next() * pool.length), 1);
        const o = { id: def.id, day, untilDay: day + B.offerDays, kind: 'monthly', termsX: api.termsOf(def.id) };
        api.offers.push(o);
        bus?.emit('sponsor:offered', { offer: o, def });
      }
    },

    serialize: () => JSON.parse(JSON.stringify({ deals: api.deals, offers: api.offers, history: api.history, terms: api.terms, reputation: api.reputation, flags: api.flags, rng: rng.getState() })),
    // A save from before Milestone 21 (s = null): empty slots and a fresh board.
    load(s) {
      api.deals = (s?.deals ?? []).filter((d) => sponsorById(d.id)).map((d) => ({ ...d, seen: { ...blankSeen(), ...d.seen } }));
      api.offers = (s?.offers ?? []).filter((o) => sponsorById(o.id));
      api.history = s?.history ?? [];
      api.terms = { ...(s?.terms ?? {}) };
      api.reputation = s?.reputation ?? 0;
      api.flags = { ...(s?.flags ?? {}) };
      if (s?.rng !== undefined) rng.setState(s.rng);
      if (!s) api.refreshOffers();
    },
    newGame() {
      api.load(null);
    },
  };

  const roundKey = (c) => `${c.id}:${c.season ?? ''}:${c.round}`;
  bus?.on('clock:day', () => api.dailyTick());
  bus?.on('race:finished', ({ race }) => api.raceFinished(race));
  bus?.on('championship:due', (e) => api.signal('roundDue', roundKey(e), {}, api.deals));
  bus?.on('project:complete', ({ record }) => record && api.signal('car', record.number, carFacts(record)));
  bus?.on('contract:success', ({ contract }) => contract?.id && api.signal('contract', contract.id, { type: contract.type ?? null }));
  return api;
}
