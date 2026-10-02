// The Sponsor sheet (Milestone 21, bible §29): the Money sheet's Sponsors tab, and the Sponsor Wall's sheet (Sponsors).
//   the slots (1 / 2 / 3 by rank) and what's on the car · each running deal: stipend, months and days left, the race /
//   result bonus, the perk, and the obligation's live counters ("2 / 3 championship races finished with telemetry on")
//   with a bar each · the offers on the board (Sign, or why not) · the last deals that ended
// Built again every frame while open, so the counters stay live.
import { THEME } from '../../../../core/Theme.js';
import { sponsorById, SPONSOR_SLOTS, DEAL_DAYS, DEAL_MONTH_DAYS } from '../../data/sponsors.js';
import { fmt, signed } from './moneyMenu.js';
import { ITEM_SOURCES, ITEM_RULES } from '../../data/items.js'; // Milestone 25b: a met obligation also brings an item

const ITEM_WORD = ITEM_SOURCES.sponsor.onMet ? ` + ${ITEM_SOURCES.sponsor.onMet === 1 ? 'an item' : `${ITEM_SOURCES.sponsor.onMet} items`} for the ${ITEM_RULES.storeName}` : '';

const C = THEME.color;
const MONTHS = DEAL_DAYS / DEAL_MONTH_DAYS;

export function sponsorSections(team, toast = () => {}) {
  const sp = team.sponsors;
  const today = team.clock.totalDays;
  const secs = [];
  const onCar = sp.deals.map((d) => sponsorById(d.id).name);
  const monthly = sp.deals.reduce((t, d) => t + sp.stipendNow(d), 0);
  secs.push({
    lines: [
      { text: `Sponsor slots: ${sp.deals.length} of ${sp.slots()} used (Rank ${team.money.rank})`, color: C.actionDark },
      `Rank E / D: ${SPONSOR_SLOTS.E} slot · C / B: ${SPONSOR_SLOTS.C} · A / S: ${SPONSOR_SLOTS.A}. Deals last exactly 6 months (${DEAL_DAYS} days).`,
      onCar.length ? `On the car: ${onCar.join(', ')} · stipends ${fmt(monthly)} Credits a month (day 1, with the salaries)` : 'No sponsor on the car yet: sign one from the offers below.',
      `Sponsor reputation ${fmt(sp.reputation)} (development contracts earn it): +${Math.round(sp.reputationPct() * 10) / 10}% on new stipends`,
    ],
  });

  for (const deal of sp.deals) {
    const def = sponsorById(deal.id);
    const monthsLeft = Math.max(0, MONTHS - deal.stipendsPaid);
    const prog = sp.progress(deal);
    const judgedAtEnd = def.obligation.when === 'end';
    const onTrack = sp.isMet(deal);
    const status = deal.met
      ? { text: `Obligation met ✓ · bonus ${fmt(deal.completion)} Credits paid${ITEM_WORD}`, color: C.good }
      : judgedAtEnd
        ? { text: `Judged when the deal ends · ${onTrack ? 'on track ✓' : 'not there yet'} · bonus ${fmt(deal.completion)} Credits${ITEM_WORD} if met`, color: onTrack ? C.good : C.textMuted }
        : { text: `In progress · bonus ${fmt(deal.completion)} Credits${ITEM_WORD} when met`, color: C.textMuted };
    const lines = [
      { text: `${fmt(sp.stipendNow(deal))} Credits a month · ${monthsLeft} stipend${monthsLeft === 1 ? '' : 's'} to come · ${sp.daysLeft(deal)} days left`, color: C.actionDark },
      `Race bonus: ${fmt(deal.bonusCredits)} Credits ${def.bonus.text}${deal.bonusesPaid ? ` (${fmt(deal.bonusesPaid)} so far)` : ''}`,
      `Perk: ${def.perkText}`,
      `Obligation: ${def.goalText}`,
      ...prog.map((p) => p.text),
      status,
    ];
    if (deal.id === 'SPN07' || def.obligation.counters.positive) {
      const m = sp.monthSoFar(deal);
      lines.push(`Deal month ${m.month} so far: net ${signed(m.net)} Credits${deal.monthNets.length ? ` · ended months: ${deal.monthNets.map((n) => signed(n)).join(', ')}` : ''}`);
    }
    const bars = prog.filter((p) => p.of).map((p) => ({ label: 'Progress', value: Math.min(p.value, p.of), max: p.of, text: `${p.value} / ${p.of}`, color: p.value >= p.of ? C.good : C.progress }));
    // the logo card first (under the name), then the terms and the live counters
    secs.push({
      title: `${def.name} · ${def.theme}${deal.renewal ? ' (renewed)' : ''}`,
      columns: 1,
      buttons: [{ id: `deal_${deal.id}`, label: def.name, sub: `On the car · day ${today - deal.startDay + 1} of ${DEAL_DAYS}`, icon: def.logo, accent: deal.met ? C.good : C.progress, onTap: () => toast(def.name, prog[0]?.text ?? '') }],
    });
    secs.push({ lines, bars });
  }

  const offers = [...sp.offers].sort((a, b) => (a.kind === 'monthly') - (b.kind === 'monthly'));
  if (offers.length) {
    const buttons = offers.map((o) => {
      const def = sponsorById(o.id);
      const why = sp.signWhy(o.id);
      const kind = o.kind === 'renewal' ? 'Renewal · ' : o.kind === 'retry' ? 'Again, worse terms · ' : '';
      return {
        id: `sign_${o.id}`,
        label: `${kind}${def.name}`,
        sub: why ?? `${fmt(sp.stipendFor(o.id, o.termsX))} Cr a month · ${def.perkText}`,
        icon: def.logo,
        disabled: !!why,
        accent: C.good,
        onTap: () => {
          const r = sp.sign(o.id);
          toast(r.ok ? `${def.name} signed` : 'Could not sign', r.ok ? `${fmt(sp.stipendNow(r.deal))} Credits a month for 6 months` : r.reason);
        },
      };
    });
    secs.push({
      title: 'Offers',
      lines: [
        ...offers.map((o) => {
          const def = sponsorById(o.id);
          return `${def.name} (${def.theme}): ${def.goalText} Race bonus ${fmt(sp.bonusFor(o.id, o.termsX))} ${def.bonus.text}. Offer ends in ${Math.max(0, o.untilDay - today)} days.`;
        }),
        { text: 'Missing an obligation never blocks anything: the sponsor just offers again on worse terms.', color: C.textMuted },
      ],
      columns: 1,
      buttons,
    });
  } else secs.push({ lines: ['No sponsor offers right now — new ones arrive on day 1 of next month.'] });

  const past = sp.history.slice(-4).reverse();
  if (past.length) {
    secs.push({
      title: 'Past deals',
      lines: past.map((h) => ({ text: `${sponsorById(h.id).name}: ${h.met ? 'obligation met' : 'obligation missed'} · ${fmt(h.stipends)} stipends${h.completion ? ` · bonus ${fmt(h.completion)}` : ''}`, color: h.met ? C.good : C.textMuted })),
    });
  }
  return secs;
}
