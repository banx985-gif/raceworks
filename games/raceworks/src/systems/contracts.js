// Development contracts, complete (Milestone 21, bible §29): the eight types (data/contracts.js), a generator that only
// offers what the team can actually meet now, and their progress. The contracts themselves live on core/ContractSystem
// inside team.money (src/systems/economy.js), which calls contractTerms() from its monthly generator.
//   typeCheck(team, def)       → { ok, why, parts, tyres } — the team's classes, facilities and research allow it now
//   feasibleTypes(team)        → the types the team can be offered now
//   contractTerms(team, rng, taken) → the terms of one offer (a type not offered yet this month when possible)
//   goalText(c) · progressText(c) → the words the Money sheet shows
//   attachContractProgress({ bus, team }) — race weekends and driver drills count towards their contracts; a goal that is
//   reached is delivered (paid once: core/ContractSystem closes it)
import { CONTRACT_TYPES, CONTRACT_RANK_X, contractType } from '../../data/contracts.js';
import { PARTS, CLASSES, SLOTS, START_PARTS, CLASS_ORDER } from '../../data/cars.js';
import { TYRES, TYRE_ORDER } from '../../data/race.js';
import { unlockContext, classState, partState, checkCar } from './carCatalog.js';
import { raceFacts, matchWhere } from './sponsorFacts.js';

// The parts of one slot the team could fit now beyond the Start part: open, and legal on at least one open class with
// that class's Start parts round it. → [{ partId, classId }]
export function openParts(team, slot) {
  const ctx = unlockContext(team);
  const classes = CLASS_ORDER.filter((id) => classState(id, ctx).open);
  const out = [];
  for (const [id, p] of Object.entries(PARTS)) {
    if (p.slot !== slot || id === START_PARTS[slot] || p.secret || !partState(id, ctx).open) continue;
    for (const classId of classes) {
      const parts = SLOTS.map((sl) => (sl.id === slot ? id : CLASSES[classId].starterParts[sl.id]));
      if (checkCar({ classId, parts }, ctx).ok) {
        out.push({ partId: id, classId });
        break;
      }
    }
  }
  return out;
}

// Compounds the team has beyond Medium (Soft is open from the start; Hard / Intermediate / Wet come with research).
export const openTyres = (team) => TYRE_ORDER.filter((t) => t !== 'medium' && (team.research?.tyreOpen(t) ?? TYRES[t].unlocked));

export function typeCheck(team, def) {
  const n = def.needs ?? {};
  if (n.pitBay && (team.facilities?.bonus('carBays') ?? 0) < 1) return { ok: false, why: 'needs a Pit Bay' };
  if (n.car && !team.cars.cars.list().length) return { ok: false, why: 'needs a finished car' };
  if (n.sponsor && !(team.sponsors?.deals.length > 0)) return { ok: false, why: 'needs a sponsor on the car' };
  if (n.training && !team.training?.open()) return { ok: false, why: 'needs the Driver Simulator (training)' };
  let parts = null;
  if (n.part) {
    parts = openParts(team, n.part);
    if (!parts.length) return { ok: false, why: `needs a researched ${n.part} part` };
  }
  let tyres = null;
  if (n.tyre) {
    tyres = openTyres(team);
    if (!tyres.length) return { ok: false, why: 'needs a second tyre compound' };
  }
  return { ok: true, why: null, parts, tyres };
}

export const feasibleTypes = (team) => CONTRACT_TYPES.filter((d) => typeCheck(team, d).ok);

// One offer. taken = the types already on the board this month: a type not offered yet is drawn first (by weight); when
// every type the team can take is on the board, any of them again. null when nothing can be offered.
export function contractTerms(team, rng, taken = []) {
  const feasible = feasibleTypes(team);
  if (!feasible.length) return null;
  const fresh = feasible.filter((d) => !taken.includes(d.type));
  const pool = fresh.length ? fresh : feasible;
  const total = pool.reduce((t, d) => t + d.weight, 0);
  let u = rng.next() * total;
  const def = pool.find((d) => (u -= d.weight) < 0) ?? pool[pool.length - 1];
  const check = typeCheck(team, def);
  const x = CONTRACT_RANK_X[team.money.rank] ?? 1;
  const g = def.goal;
  const terms = {
    kind: def.type === 'supplier_test' ? 'clubBuild' : def.type, // (Milestone 5's kind for the Club Hatch build)
    type: def.type,
    title: def.title,
    client: rng.pick(def.client),
    deadlineDays: def.deadlineDays,
    goal: g.kind,
    need: g.count ?? 1,
    progress: 0,
    seen: [],
    sponsorRep: def.sponsorRep ?? 0,
    partEvent: def.partEvent ?? 0,
    fact: def.fact ?? null,
    requires: {},
  };
  let q = 0;
  let tier = 0;
  if (g.kind === 'build') {
    terms.newBuildOnly = true;
    if (g.classId) {
      q = rng.int(g.qualityMin, g.qualityMax);
      terms.classId = g.classId;
      terms.targetQuality = q;
      terms.requires = { classId: g.classId, carBays: true };
    } else {
      const pick = rng.pick(check.parts);
      terms.partId = pick.partId;
      terms.classId = null;
      tier = PARTS[pick.partId].cx;
      terms.requires = { partId: pick.partId, classId: pick.classId, research: PARTS[pick.partId].unlock?.research ?? null, carBays: true };
    }
  }
  if (g.kind === 'races') {
    terms.where = { ...g.where };
    if (g.tyreStart) {
      terms.tyre = rng.pick(check.tyres);
      terms.requires = { tyre: terms.tyre };
    }
  }
  if (g.kind === 'drills') terms.requires = { training: true };
  terms.credits = Math.round((def.credits.base + (def.credits.perQuality ?? 0) * q + (def.credits.perTier ?? 0) * tier) * x);
  terms.rp = Math.round((def.rp.base + (def.rp.perQuality ?? 0) * q + (def.rp.perTier ?? 0) * tier) * x);
  return terms;
}

const typeOf = (c) => c.type ?? (c.kind === 'clubBuild' || c.kind === 'rescue' ? 'supplier_test' : c.kind);

export function goalText(c) {
  const def = contractType(typeOf(c));
  if (c.kind === 'clubBuild' || c.kind === 'rescue') return `a Club Hatch with Quality ${c.targetQuality}+${c.newBuildOnly ? ', finished after you accept' : ' (a car you already have will do)'}`;
  if (c.goal === 'build') return `a car fitted with the ${PARTS[c.partId]?.name ?? c.partId}, finished after you accept`;
  if (c.goal === 'races' && c.tyre) return `${c.need} ${def.goal.text} ${TYRES[c.tyre].name} tyres`;
  return `${c.need} ${def?.goal.text ?? 'goals'}`;
}
export const progressText = (c) => (c.goal === 'races' || c.goal === 'drills' ? `${c.progress ?? 0} / ${c.need}` : null);

// Race weekends (raced to the end, not the debug Test Race) and drills count for the open contracts. Each race counts
// once for a contract (its number is kept on the contract), so a reload or a second look never counts it again.
export function attachContractProgress({ bus, team }) {
  const cs = () => team.money.contracts;
  const reach = (c) => {
    if ((c.progress ?? 0) >= c.need) cs().deliver(c.id, { type: 'progress' }, team.clock.totalDays);
  };
  bus.on('race:finished', ({ race }) => {
    if (race?.kind !== 'weekend') return;
    const f = raceFacts(race);
    for (const c of [...cs().active]) {
      if (c.goal !== 'races' || c.seen?.includes(race.n)) continue;
      if (!matchWhere(f, c.where) || (c.tyre && f.startTyre !== c.tyre)) continue;
      (c.seen ??= []).push(race.n);
      c.progress = (c.progress ?? 0) + 1;
      bus.emit('contract:progress', { contract: c });
      reach(c);
    }
  });
  bus.on('drill:recorded', ({ medal }) => {
    if (!medal) return;
    for (const c of [...cs().active]) {
      if (c.goal !== 'drills') continue;
      c.progress = (c.progress ?? 0) + 1;
      bus.emit('contract:progress', { contract: c });
      reach(c);
    }
  });
}
