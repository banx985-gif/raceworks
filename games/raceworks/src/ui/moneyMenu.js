// The Money sheet (Milestone 5), opened from the bottom bar's Money or the top bar's stats chip. Three tabs:
//   Money      balance (Credits / RP / Racing Tokens), rank and Reputation, this month in / out, the monthly bills,
//              Emergency Credit status, Save & main menu (Milestone 4b), debug money buttons with ?debug=1
//   Ledger     the newest Credits ledger lines (date · amount · reason → balance) with the reconcile check, this
//              month by kind, and the RP / Racing Token lines
//   Contracts  the active contract (Deliver now when a car in the Car Garage fits), the offer (Accept), past ones
// Built again every frame while open, so it stays live.
import { THEME } from '../../../../core/Theme.js';
import { PLAYER_TITLE } from '../../data/setup.js';
import { LEDGER, CATEGORY_NAMES, DEBT, CURRENCIES } from '../../data/economy.js';

const C = THEME.color;
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const signed = (n) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;

export function moneyMenu({ slot, team, goMainMenu = null, debug = null, toast = () => {} }) {
  const m = team.money;
  const clock = team.clock;
  const month = m.monthInOut();
  const repLine = m.nextRank ? `Reputation ${fmt(m.reputation.value)} · next: Rank ${m.nextRank.id} at ${fmt(m.nextRank.min)}` : `Reputation ${fmt(m.reputation.value)} · top rank`;
  const debtLines = m.inDebt
    ? [
        { text: `EMERGENCY CREDIT: ${fmt(m.credits)} Credits`, color: C.bad },
        { text: `${DEBT.monthlyInterestPct}% interest at each month end · no new cars (unless for a rescue job) · repairs still allowed · purchases stop at ${fmt(m.floor)}`, color: C.bad },
        'Get back above 0 to clear it — a rescue job is on the Contracts tab.',
      ]
    : [{ text: `Emergency Credit: off · below 0 you could still buy down to ${fmt(m.floor)} (Rank ${m.rank})`, color: C.textMuted }];

  const overview = [
    {
      lines: [
        { text: `${fmt(m.credits)} Credits · ${fmt(m.rp)} RP · ${fmt(m.tokens)} Racing Tokens`, color: m.inDebt ? C.bad : C.actionDark },
        `Rank ${m.rank} · ${repLine}`,
        `This month: in ${fmt(month.in)} · out ${fmt(month.out)} · net ${signed(month.net)}`,
        `Every month (day 1): salaries ${fmt(m.salaryBill())}${m.upkeepBill() ? ` · car upkeep ${fmt(m.upkeepBill())}` : ''}`,
        ...debtLines,
      ],
    },
  ];
  if (goMainMenu) {
    overview.push({
      lines: [{ text: `${team.setup.teamName} · ${PLAYER_TITLE} ${team.setup.principal}`, color: C.actionDark }, 'Your team saves by itself every day and whenever something changes.'],
      columns: 1,
      buttons: [{ id: 'mainMenu', label: 'Save & main menu', sub: 'Switch teams, start a new one or load a slot', icon: slot.icon, accent: C.progress, onTap: goMainMenu }],
    });
  }
  if (debug?.money) {
    overview.push({
      title: 'Debug',
      buttons: [
        { id: 'dbgBroke', label: '−20,000 Cr', accent: C.purple, onTap: () => debug.money(-20000) },
        { id: 'dbgRich', label: '+20,000 Cr', accent: C.purple, onTap: () => debug.money(20000) },
        { id: 'dbgMonth', label: 'To next month', accent: C.purple, onTap: () => debug.nextMonth() },
        { id: 'dbgRep', label: '+100 Rep', accent: C.purple, onTap: () => m.reputation.add(100, 'Debug') },
      ],
    });
  }

  // The ledger, newest first.
  const lines = m.economy.ledger.filter((l) => l.currency === 'credits').slice(-LEDGER.showLines).reverse();
  const rec = m.reconcile();
  const ledger = [
    {
      lines: [
        { text: `Credits ledger · ${rec.ok ? 'the balance matches the ledger ✓' : 'LEDGER MISMATCH'}`, color: rec.ok ? C.good : C.bad },
        ...lines.map((l) => ({ text: `${clock.shortLabel(l.day)} · ${signed(l.amount)} · ${l.reason} → ${fmt(l.balance)}`, color: l.amount < 0 ? C.text : C.good })),
      ],
    },
    { lines: otherLedger(team) },
  ];

  return {
    title: slot.label,
    subtitle: `${fmt(m.credits)} Credits · Rank ${m.rank}${m.inDebt ? ' · Emergency Credit' : ''}`,
    art: slot.icon,
    accent: m.inDebt ? C.bad : C.progress,
    tabs: [
      { id: 'money', label: 'Money', sections: overview },
      { id: 'ledger', label: 'Ledger', sections: ledger },
      { id: 'contracts', label: 'Contracts', badge: m.contracts.offers.length ? String(m.contracts.offers.length) : null, sections: contractSections(team, toast) },
    ],
  };
}

// This month's Credits by kind, then the RP and Racing Token lines.
function otherLedger(team) {
  const m = team.money;
  const clock = team.clock;
  const from = clock.totalDays - (clock.day - 1);
  const cats = m.economy.totals('credits', from, clock.totalDays);
  const out = [{ text: 'This month by kind', color: C.actionDark }];
  for (const [k, v] of Object.entries(cats)) out.push(`${CATEGORY_NAMES[k] ?? k}: ${signed(v)}`);
  const others = m.economy.ledger.filter((l) => l.currency !== 'credits').slice(-8).reverse();
  if (others.length) out.push({ text: 'Research Points and Racing Tokens', color: C.actionDark });
  for (const l of others) out.push(`${clock.shortLabel(l.day)} · ${signed(l.amount)} ${CURRENCIES[l.currency].short} · ${l.reason} → ${fmt(l.balance)}`);
  return out;
}

function contractSections(team, toast) {
  const m = team.money;
  const cs = m.contracts;
  const today = team.clock.totalDays;
  const secs = [];
  const describe = (c) => `${c.client}: a Club Hatch with Quality ${c.targetQuality}+${c.newBuildOnly ? ', finished after you accept' : ' (a car you already have will do)'}. Pays ${fmt(c.credits)} Credits + ${c.rp} RP.`;
  for (const c of cs.active) {
    const car = m.garageCarFor(c.id);
    secs.push({
      title: `Active: ${c.title}`,
      lines: [describe(c), { text: `${cs.daysLeft(c, today)} days left · paid as soon as a car that fits is finished`, color: C.actionDark }],
      columns: 1,
      buttons: car
        ? [{ id: `deliver_${c.id}`, label: 'Deliver now', sub: `${car.name} · Quality ${car.result.quality}`, accent: C.good, onTap: () => toast(m.deliverFromGarage(c.id).ok ? 'Contract delivered and paid' : 'That car does not fit') }]
        : [],
    });
  }
  for (const c of cs.offers) {
    secs.push({
      title: `Offer: ${c.title}`,
      lines: [describe(c), { text: `Deadline ${c.deadlineDays} days after accepting · the offer ends next month · a missed deadline just ends it`, color: C.textMuted }],
      columns: 1,
      buttons: [{ id: `accept_${c.id}`, label: 'Accept', sub: cs.canAccept ? 'Take this contract' : `Only ${cs.maxActive} at a time`, disabled: !cs.canAccept, accent: C.progress, onTap: () => toast(m.accept(c.id).ok ? 'Contract accepted' : 'Could not accept') }],
    });
  }
  if (!secs.length) secs.push({ lines: ['No offers right now — a new one arrives on day 1 of next month.'] });
  const done = cs.done.slice(-4).reverse();
  if (done.length) {
    secs.push({
      title: 'Past contracts',
      lines: done.map((c) => ({ text: `${c.title} (${c.client}): ${c.status === 'success' ? `paid ${fmt(c.credits)} Credits` : 'deadline missed'}`, color: c.status === 'success' ? C.good : C.textMuted })),
    });
  }
  return secs;
}
