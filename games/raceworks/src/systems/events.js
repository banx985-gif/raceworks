// Events and the Inbox (Milestone 23, bible §31 / §4 / §7). Saved with the team. The templates are data/events.js; the
// engine is core/EventSystem (seeded: an event's numbers, its person and every choice's outcome are rolled when it fires
// and saved, so a reload never rerolls) and the messages are core/NotificationSystem (the Inbox, toasts, the queue).
//
//   team.events = createEvents({ bus, team, seed })
//   .frame(dt, { screen, busy, reduced })  every frame (real seconds): runs the one-card flow below
//   .showing → { entryId, uid } of the major card up now (or null) · .view(entryId) → what a card shows
//   .answer(index) / .ack() close the card up now (one tap) · .reopen(entryId) shows a past card again (Inbox)
//   .toast → the minor strip on screen now ({ entry, age, more }) or null · .unread · .inbox (newest first)
//   .bonus(key) / .bonusKeys() — the running timed modifiers, added into the garage's one effect query
//   .flags → stored flags (technology_demo, hiddenInvitation …) · .milestoneFired(id)
//   .fireSecret(id, params) — Milestone 25: a found secret's event (data/events.js EV_SPECIAL_ARRIVAL, EV_UNDERDOG …);
//     params.art shows a picture of its own (a portrait); never rolled
//
// The flow — exactly one card on screen:
//   • a major event (a milestone or a choice event) waits in the queue; a minor one is a toast (and both go in the Inbox);
//   • nothing shows on a race screen (or a drill): everything waits there until the player is back;
//   • a major card comes up only when no toast is showing and the game is free (no dialog, no car reveal); it pauses the
//     calendar and puts it back at the same speed when it closes; toasts wait while it is up;
//   • past maxQueue waiting cards, the lowest folds into the Inbox and takes its default choice (NotificationSystem).
// Cadence (data EVENT_RULES): core's caps per size, the windows (1 major / 28 days, 3 minors / 7 days, counting every
// event), a gap per class and each template's own cooldown — all checked before a rolled event may fire.
import { Rng } from '../../../../core/Rng.js';
import { EventSystem } from '../../../../core/EventSystem.js';
import { NotificationSystem } from '../../../../core/NotificationSystem.js';
import { EVENTS, MILESTONES, EVENT_CLASSES, EVENT_RULES as R, INVITATION_TITLES, MAJOR_SPONSOR_RANK } from '../../data/events.js';
import { CHAMPIONSHIPS } from '../../data/championships.js';
import { RIVAL_TEAMS } from '../../data/rivals.js';
import { sponsorById } from '../../data/sponsors.js';

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
const classOf = (id) => EVENT_CLASSES.find((c) => c.id === id) ?? EVENT_CLASSES[0];
const KIND = { major: 'choice', minor: 'flavour' }; // core/EventSystem's two capped kinds

export const EVENT_DEFS = [
  ...EVENTS.map((d) => ({ ...d, kind: KIND[d.size], cooldownDays: d.cooldownDays ?? R.cooldownDays })),
  ...MILESTONES.map((m) => ({ ...m, cls: 'milestone', size: 'major', kind: 'milestone', trigger: { type: 'fact', fact: m.on }, effects: [] })),
];
const BY_ID = Object.fromEntries(EVENT_DEFS.map((d) => [d.id, d]));
export const eventDef = (id) => BY_ID[id] ?? null;

export function createEvents({ bus, team, seed = 'raceworks' }) {
  const clock = team.clock;
  const today = () => clock.totalDays;
  let flags = {}; // stored flags (Milestone 24 reads them): { key: times }
  let recent = []; // { day, size } of every event in the last 28 days (the windows)
  let lastRolled = {}; // class → day of the last rolled event of that class
  let latched = {}; // milestone facts that came true at a moment (firstRace)
  let showing = null; // { entryId, uid, speedBefore, reopened }
  const stats = { peakOnScreen: 0, shownOnQueueScreen: 0, peakQueue: 0, cardsShown: 0, toastsShown: 0 };
  const applied = []; // (tests) every effect applied: { uid, id, type, value }

  // --- the facts --------------------------------------------------------------------------------------------------
  const rankAtLeast = (r) => RANKS.indexOf(team.money.rank) >= RANKS.indexOf(r);
  const tierOf = (id) => CHAMPIONSHIPS.find((c) => c.id === id)?.tier;
  const champsEver = () => [team.championships.current?.id, ...team.championships.history.map((h) => h.id)].filter(Boolean);
  const MILESTONE_FACTS = {
    newTeam: () => true,
    firstCar: () => team.cars.cars.count > 0,
    firstRace: () => !!latched.firstRace || team.races.history.some((h) => h.kind === 'weekend'),
    firstWin: () => (team.careers.facts.wins ?? 0) > 0,
    majorSponsor: () => rankAtLeast(MAJOR_SPONSOR_RANK) && team.sponsors.deals.length > 0,
    nationalChamp: () => champsEver().some((id) => tierOf(id) === 'national' || tierOf(id) === 'world'),
    worldChamp: () => champsEver().includes('C10'),
    never: () => false,
  };

  // --- triggers (rolled templates) --------------------------------------------------------------------------------
  const inWindow = (size) => recent.filter((r) => r.size === size && today() - r.day < R.windows[size].days).length;
  const drivers = () => team.roster.filter((s) => s.role === 'driver');
  function conditionMet(trigger, def) {
    if (muted || trigger?.type !== 'roll') return false; // facts and calendar events are fired by the game, never rolled
    if (inWindow(def.size) >= R.windows[def.size].max) return false;
    const gap = R.classGap[def.cls] ?? 0;
    if (lastRolled[def.cls] != null && today() - lastRolled[def.cls] < gap) return false;
    const w = trigger.when ?? {};
    if (w.sponsor && !team.sponsors.deals.length) return false;
    if (w.sponsorId && !team.sponsors.deals.some((d) => d.id === w.sponsorId)) return false;
    if (w.driver && !drivers().length) return false;
    if (w.role && !team.roster.some((s) => s.role === w.role)) return false;
    if (w.building && !team.cars.active) return false;
    if (w.cars && team.cars.cars.count < w.cars) return false;
    if (w.champ && !team.championships.current) return false;
    return true;
  }
  // Who, which sponsor / rival / car (rolled once, saved on the event).
  function setup(inst, def, rng) {
    const out = { team: team.setup.teamName };
    const w = def.trigger?.when ?? {};
    const pickFrom = (list) => (list.length ? list[Math.floor(rng.next() * list.length)] : null);
    const people = w.driver ? drivers() : w.role ? team.roster.filter((s) => s.role === w.role) : team.roster;
    const who = pickFrom([...people].sort((a, b) => (a.id < b.id ? -1 : 1)));
    if (who) Object.assign(out, { who: who.id, whoName: who.name });
    const deal = w.sponsorId ? team.sponsors.deals.find((d) => d.id === w.sponsorId) : pickFrom(team.sponsors.deals);
    if (deal) out.sponsor = sponsorById(deal.id)?.name ?? deal.id;
    if (w.champ || def.cls === 'rival') out.rival = pickFrom(Object.values(RIVAL_TEAMS).filter((t) => !t.secret).map((t) => t.name));
    if (team.cars.active) out.car = team.cars.active.name;
    return out;
  }
  // Numbers rolled when the event fires ({ min, max } → value, rounded to 10).
  function resolve(e, inst, rng) {
    if (e.min == null) return { ...e };
    const value = Math.round((e.min + rng.next() * (e.max - e.min)) / 10) * 10;
    if (e.param) inst.params[e.param] = Math.abs(value);
    return { ...e, value };
  }
  const words = (s, p = {}) =>
    `${s ?? ''}`.replace(/\{(\w+)\}/g, (_, k) => (k === 'who' ? (p.whoName ?? 'Someone') : p[k] != null ? String(p[k]) : k === 'team' ? team.setup.teamName : ''));

  // --- effects ----------------------------------------------------------------------------------------------------
  function apply(e, inst) {
    const def = BY_ID[inst.id];
    const why = `Event: ${words(def.title, inst.params)}`;
    const who = inst.params.who ? team.get(inst.params.who) : null;
    switch (e.type) {
      case 'credits':
        team.money.economy.add('credits', e.value, why, 'events');
        break;
      case 'reputation':
        team.money.reputation.add(e.value, why);
        break;
      case 'rp':
        team.research.addRp(e.value, why);
        break;
      case 'sponsorRep':
        team.sponsors.addReputation(e.value, why);
        break;
      case 'morale':
        if (who) team.staff.changeMorale(who, e.value);
        break;
      case 'teamMorale':
        for (const s of team.roster) team.staff.changeMorale(s, e.value);
        break;
      case 'driversMorale':
        for (const s of drivers()) team.staff.changeMorale(s, e.value);
        break;
      case 'flag':
        flags[e.key] = (flags[e.key] ?? 0) + 1;
        break;
      default:
        return;
    }
    applied.push({ uid: inst.uid, id: inst.id, type: e.type, value: e.value ?? e.key });
  }

  let rng = new Rng(`${seed}|events`);
  const events = new EventSystem({ bus, rng, defs: EVENT_DEFS, caps: R.caps, rules: { startDay: R.startDay, dailyChance: R.dailyChance, maxOpen: R.maxQueue }, hooks: { conditionMet, setup, resolve, apply }, keepLog: R.inboxMax });
  const notes = new NotificationSystem({ bus, maxQueue: R.maxQueue, inboxMax: R.inboxMax, toastSec: R.toastSec, maxToasts: 1, onFold: (entry) => fold(entry) });
  function fold(entry) {
    const uid = entry.data?.uid;
    if (uid != null && events.open.some((i) => i.uid === uid)) events.choose(uid, null, { day: today(), auto: true });
  }

  // --- posting ----------------------------------------------------------------------------------------------------
  let muted = false; // (?debug=1&events=0, the older browser checks) no rolled events; major cards go straight to the Inbox
  bus.on('event:fired', ({ instance: inst, def }) => {
    if (!BY_ID[def.id]) return;
    const p = inst.params;
    recent.push({ day: inst.day, size: def.size });
    if (def.trigger?.type === 'roll') lastRolled[def.cls] = inst.day;
    const data = { uid: inst.uid, id: def.id, cls: def.cls, look: def.look ?? null };
    if (def.look === 'research') Object.assign(data, { nodeId: p.nodeId, fired: p.fired });
    if (def.look === 'combo') Object.assign(data, { comboId: p.comboId, rp: p.rp });
    const msg = { kind: def.kind, day: inst.day, title: words(def.title, p), body: words(def.text, p), icon: classOf(def.cls).icon, art: def.art ?? p.art ?? null, data }; // (Milestone 25: p.art)
    if (def.size === 'major') notes.post({ ...msg, level: 'major', popup: !muted, toast: false });
    else notes.post({ ...msg, level: 'minor', toast: true });
    stats.peakQueue = Math.max(stats.peakQueue, notes.pending);
  });
  bus.on('event:resolved', ({ instance: inst, def, choice, auto }) => {
    const e = notes.inbox.find((x) => x.data?.uid === inst.uid);
    if (!e) return;
    e.read = e.read || !auto;
    const chance = (inst.choices?.[choice] ?? []).find((x) => x.type === 'chance');
    e.answer = { choice, label: words(def.choices?.[choice]?.label, inst.params), auto: !!auto, outcome: chance ? (chance.hit ? 'win' : 'lose') : null };
  });
  // A fact or calendar event: fire it now (it still counts towards the windows; no caps stop it).
  const fireNow = (id, params = {}) => events.fire(id, today(), params);

  // --- milestones: once each, each on its own fact (none waits for another; checked in data order) ----------------
  function checkMilestones() {
    for (const m of MILESTONES) if (!events.seen(m.id) && MILESTONE_FACTS[m.on]?.()) events.milestone(m.id, today());
  }
  bus.on('project:complete', () => checkMilestones());
  bus.on('race:created', ({ race }) => {
    if (race?.kind === 'weekend') latched.firstRace = true;
    checkMilestones();
  });
  bus.on('race:finished', () => checkMilestones());
  bus.on('sponsor:signed', () => checkMilestones());
  bus.on('championship:entered', () => checkMilestones());
  bus.on('reputation:rankUp', () => checkMilestones());

  // --- the game's moments ------------------------------------------------------------------------------------------
  bus.on('research:complete', ({ node, fired }) => fireNow('EV_RESEARCH', { node: node.name, nodeId: node.id, fired: (fired ?? []).map((a) => ({ type: a.type, id: a.id })) }));
  bus.on('combo:discovered', ({ combo, rp }) => fireNow('EV_COMBO', { combo: combo.name, comboId: combo.id, rp }));
  bus.on('combo:clue', ({ text }) => fireNow('EV_CLUE', { clue: text }));
  bus.on('economy:debt', ({ inDebt }) => {
    if (inDebt && team.money.contracts.offers.some((c) => c.kind === 'rescue')) fireNow('EV_RESCUE');
  });
  bus.on('clock:month', () => {
    const d = today();
    const c = team.money.contracts.offers.filter((x) => x.offeredDay === d).length;
    const s = team.sponsors.offers.filter((x) => x.day === d).length;
    if (!c && !s) return;
    const bits = [c ? `${c} contract offer${c === 1 ? '' : 's'}` : '', s ? `${s} sponsor offer${s === 1 ? '' : 's'}` : ''].filter(Boolean);
    fireNow('EV_OFFERS', { offers: `${bits.join(' and ')} on the board (Money).` });
  });
  bus.on('clock:year', ({ year }) => fireNow('EV_SEASON', { year }));
  // Milestone 24: a secret's new clue stage, or a secret found
  bus.on('secret:rumour', ({ found, name, text }) => text && fireNow(found ? 'EV_SECRET_FOUND' : 'EV_SECRET_CLUE', { clue: text, name: name ?? '' }));

  // --- the day ----------------------------------------------------------------------------------------------------
  bus.on('clock:day', () => {
    const d = today();
    recent = recent.filter((r) => d - r.day < 28);
    checkMilestones();
    if (!events.seen('EV_INVITATION') && team.championships.titles().length >= INVITATION_TITLES) fireNow('EV_INVITATION');
    events.dailyTick(d);
  });

  // --- the one-card flow --------------------------------------------------------------------------------------------
  const pause = () => {
    const before = clock.speed;
    clock.pause();
    return before;
  };
  function show(entry, reopened = false) {
    showing = { entryId: entry.id, uid: entry.data?.uid ?? null, speedBefore: pause(), reopened };
    stats.cardsShown++;
  }
  function close() {
    const sb = showing?.speedBefore;
    showing = null;
    if (sb && clock.paused) clock.setSpeed(sb);
  }
  let life = R.toastSec;
  function frame(dt, { screen = 'garage', busy = false, reduced = false } = {}) {
    life = reduced ? R.toastSecReduced : R.toastSec;
    notes.toastSec = life;
    const onQueueScreen = R.queueScreens.includes(screen);
    if (onQueueScreen && notes.toasts.length) {
      // a strip still up when a race screen opened goes back to the front of the line (shown again in full later)
      notes.toastWaiting.unshift(...notes.toasts.map((t) => Object.assign(t.entry, { more: t.more })));
      notes.toasts = [];
    }
    if (onQueueScreen && showing) stats.shownOnQueueScreen++;
    if (!onQueueScreen && !showing) {
      if (notes.toasts.length) {
        for (const t of notes.toasts) t.age += dt;
        notes.toasts = notes.toasts.filter((t) => t.age < life);
      } else if (!busy && notes.pending) {
        for (let e = notes.take(); e; e = notes.take()) {
          if (e.kind === 'choice' && !events.open.some((i) => i.uid === e.data?.uid)) continue; // folded / answered already
          show(e);
          break;
        }
      }
      if (!showing && !notes.toasts.length && notes.toastWaiting.length) {
        notes.update(0);
        stats.toastsShown++;
      }
    }
    stats.peakOnScreen = Math.max(stats.peakOnScreen, (showing ? 1 : 0) + notes.toasts.length);
  }
  // What a card shows (also a past one, from the Inbox).
  function view(entryId) {
    const e = notes.get(entryId);
    if (!e) return null;
    const inst = e.data?.uid != null ? events.instance(e.data.uid) : null;
    const def = BY_ID[e.data?.id] ?? null;
    const open = !!inst && inst.status === 'open';
    const choices = (def?.choices ?? []).map((c, i) => ({ id: c.id, label: words(c.label, inst?.params), line: words(c.line, inst?.params), chosen: inst?.choice === i, locked: !open }));
    const outcome = e.answer?.outcome === 'win' ? 'It paid off.' : e.answer?.outcome === 'lose' ? 'It did not go your way.' : null;
    return { entryId, uid: e.data?.uid ?? null, id: def?.id ?? null, cls: classOf(def?.cls).name, icon: e.icon, art: e.art, size: def?.size ?? e.level, title: e.title, text: e.body, day: e.day, open, choices, answer: e.answer ?? null, auto: !!e.answer?.auto, outcome };
  }
  function answer(index) {
    if (!showing) return null;
    const uid = showing.uid;
    const inst = uid != null && events.open.some((i) => i.uid === uid) ? events.choose(uid, index, { day: today() }) : null;
    close();
    return inst;
  }
  function ack() {
    if (!showing) return false;
    const uid = showing.uid;
    if (uid != null && events.open.some((i) => i.uid === uid)) return false; // a choice must be answered
    close();
    return true;
  }
  function reopen(entryId) {
    const e = notes.get(entryId);
    if (!e || showing) return false;
    e.read = true;
    show(e, true);
    return true;
  }

  const api = {
    system: events,
    notes,
    frame,
    view,
    answer,
    ack,
    reopen,
    checkMilestones,
    stats,
    applied,
    get showing() {
      return showing;
    },
    get muted() {
      return muted;
    },
    set muted(v) {
      muted = !!v;
      if (!muted) return;
      notes.queue = []; // waiting cards stay in the Inbox, unread
      if (showing) close();
    },
    get toast() {
      return notes.toasts[0] ?? null;
    },
    get toastLife() {
      return life;
    },
    get inbox() {
      return notes.inbox;
    },
    get unread() {
      return notes.unread;
    },
    get flags() {
      return flags;
    },
    classOf,
    milestoneFired: (id) => events.seen(id),
    fireSecret: (id, params = {}) => (BY_ID[id] ? fireNow(id, params) : null), // Milestone 25
    markAllRead: () => notes.markAllRead(),
    bonus: (key) => events.total(key),
    bonusKeys: () => [...new Set(events.state.modifiers.map((m) => m.key))],
    newGame() {
      rng = new Rng(`${seed}|events|${team.setup.teamName}|${team.founder?.id}`);
      events.rng = rng;
      events.reset(today());
      notes.reset();
      flags = {};
      recent = [];
      lastRolled = {};
      latched = {};
      showing = null;
      checkMilestones(); // RE01: Opening the First Garage
    },
    serialize: () => JSON.parse(JSON.stringify({ events: events.serialize(), notes: notes.serialize(), flags, recent, lastRolled, latched, showing })),
    // A save from before Milestone 23: an empty Inbox, and the milestones whose facts already came true count as fired
    // (silently), so the first garage / car / race never replay.
    load(data) {
      rng = new Rng(`${seed}|events|${team.setup.teamName}|${team.founder?.id}`);
      events.rng = rng;
      showing = null;
      if (data) {
        events.load(data.events ?? null, today());
        notes.load(data.notes ?? null);
        flags = { ...(data.flags ?? {}) };
        recent = [...(data.recent ?? [])];
        lastRolled = { ...(data.lastRolled ?? {}) };
        latched = { ...(data.latched ?? {}) };
        showing = data.showing ? { ...data.showing } : null;
        if (showing && !notes.get(showing.entryId)) showing = null;
        return true;
      }
      events.reset(today());
      notes.reset();
      flags = {};
      recent = [];
      lastRolled = {};
      latched = {};
      for (const m of MILESTONES) {
        if (!MILESTONE_FACTS[m.on]?.()) continue;
        events.state.count[m.id] = 1; // counted as fired, without a card or an Inbox line
        events.state.lastOf[m.id] = today();
      }
      return false;
    },
  };
  return api;
}
