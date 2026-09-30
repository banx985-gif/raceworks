// The championship ladder (Milestone 20, bible §27–§28, §9.3): the 12 championships, one entered at a time, their rounds on
// the calendar, the season standings, titles and trophies. Each round is the existing race weekend (src/systems/races.js)
// on that round's track with the championship's rival band (src/race/field.js) — never tuned to the player's car.
// The points are core/Rankings (25-18-15-12-10-8-6-4-2-1) plus the fastest-lap point; trophies are core/TrophyCase.
//   ch.list() → [{ def, state: 'active' | 'won' | 'open' | 'locked', why, fee }] · ch.why(id) → null or why it's shut
//   ch.enter(id) → { ok, reason } (the entry fee through the ledger) · ch.current → the season in progress or null
//   ch.nextRound() → { index, total, trackId, due, daysAway, ready } · ch.startRound() → the round's weekend
//   ch.standings() → [{ id, name, team, points, wins, podiums, pos, isPlayer }] · ch.teamTable() → teams by points
//   ch.history → finished seasons [{ id, year, pos, points, title, day }] · ch.trophies (core/TrophyCase) · ch.titles()
//   ch.debugSecrets — ?debug=1 only: opens C11 / C12 and lets R08 Ghostline race (never saved)
import { Rankings } from '../../../../core/Rankings.js';
import { TrophyCase } from '../../../../core/TrophyCase.js';
import { rankIndexOf } from '../../../../core/CompanyRank.js';
import { RANKS } from '../../data/economy.js';
import { CLASSES } from '../../data/cars.js';
import { RIVAL_TEAMS } from '../../data/rivals.js';
import { FACILITIES } from '../../data/facilities.js';
import { CHAMPIONSHIPS, CHAMP_POINTS, FASTEST_LAP, CHAMP_BANDS, SEASON, TROPHY_ART, TIER_NAMES, champById, bandIndex } from '../../data/championships.js';
import { TRACKS } from '../race/tracks.js';

const DPM = 28; // days a month (bible §4.1)
const fmt = (n) => n.toLocaleString('en-US');

// The tie-broken table (bible §27 + the card): points, then wins, then podiums, then the latest round's result.
export function sortStandings(rows) {
  return [...rows].sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || (a.last ?? 99) - (b.last ?? 99) || a.id.localeCompare(b.id)).map((r, i) => ({ ...r, pos: i + 1 }));
}

export function createChampionships({ bus, team }) {
  const trophies = new TrophyCase({ bus, trophies: CHAMPIONSHIPS.map((c) => ({ id: `TR-${c.id}`, name: `${c.name} champions`, art: TROPHY_ART[c.tier], tier: c.tier, rule: { title: c.id } })) });
  const newTable = () => new Rankings({ points: CHAMP_POINTS, focusId: 'PLAYER' });
  let table = newTable();
  const rankIndex = () => team.money.reputation.highestRankIndex;
  const facts = () => team.careers?.facts ?? {};

  const api = {
    current: null, // { id, entered, round (next to race), schedule [due days], results [], drivers { id → { name, team, isPlayer } }, carNumber }
    history: [],
    secretFlags: { 'SEC-COMP-01': false, 'SEC-COMP-02': false }, // the Secret Engine sets these (not yet)
    debugSecrets: false,
    trophies,
    titles: () => api.history.filter((h) => h.title).map((h) => h.id),
    best: (id) => Math.min(99, ...api.history.filter((h) => h.id === id).map((h) => h.pos)),

    // Why a championship is shut (null = its unlock holds).
    unlockWhy(id) {
      const c = champById(id);
      if (!c) return 'Unknown championship';
      const u = c.unlock;
      if (u.secret && !(api.secretFlags[u.secret] || api.debugSecrets)) return `Secret (${u.secret})`;
      if (u.rank && rankIndex() < rankIndexOf(RANKS, u.rank)) return `Needs Rank ${u.rank}`;
      if (u.classOpen && rankIndex() < rankIndexOf(RANKS, CLASSES[u.classOpen].rank)) return `Needs the ${CLASSES[u.classOpen].name} class (Rank ${CLASSES[u.classOpen].rank})`;
      if (u.seasonTop && api.best(u.seasonTop.champ) > u.seasonTop.pos) return `Needs a podium in the ${champById(u.seasonTop.champ).name} (${u.seasonTop.champ})`;
      if (u.wins && (facts().wins ?? 0) < u.wins) return `Needs ${u.wins} race wins (${facts().wins ?? 0} so far)`;
      if (u.titleAny && !u.titleAny.some((t) => api.titles().includes(t))) return `Needs the ${u.titleAny.map((t) => champById(t).name).join(' or ')} title`;
      if (u.facility && !(team.facilities?.builtIds() ?? []).includes(u.facility)) return `Needs the ${FACILITIES.find((f) => f.id === u.facility)?.name ?? u.facility}`;
      if (u.titles && api.titles().length < u.titles) return `Needs ${u.titles} titles (${api.titles().length} so far)`;
      return null;
    },
    // A finished car of a class the championship takes (the newest one), or null.
    eligibleCar(id) {
      const c = champById(id);
      const cars = team.cars.cars.list().filter((r) => c.classes.includes(CLASSES[r.result?.classId]?.tag));
      return cars[cars.length - 1] ?? null;
    },
    // Why you can't enter it now (null = you can): unlock, one at a time, a car of its classes, a race going, the fee.
    why(id) {
      const c = champById(id);
      const locked = api.unlockWhy(id);
      if (locked) return locked;
      if (api.current) return api.current.id === id ? 'Your championship now' : `One at a time: finish the ${champById(api.current.id).name} first`;
      if (!api.eligibleCar(id)) return `Needs a ${c.classText} car`;
      if (team.races.current) return 'Finish the race weekend in progress first';
      if (!team.money.affordable(CHAMP_BANDS[id].entry)) return `Entry ${fmt(CHAMP_BANDS[id].entry)} Credits`;
      return null;
    },
    list: () =>
      CHAMPIONSHIPS.map((def) => {
        const locked = api.unlockWhy(def.id);
        const state = api.current?.id === def.id ? 'active' : api.titles().includes(def.id) ? 'won' : locked ? 'locked' : 'open';
        return { def, state, why: state === 'active' ? null : api.why(def.id), locked: !!locked, fee: CHAMP_BANDS[def.id].entry, best: api.best(def.id) };
      }),

    enter(id) {
      const why = api.why(id);
      if (why) return { ok: false, reason: why };
      const c = champById(id);
      const car = api.eligibleCar(id);
      const band = CHAMP_BANDS[id];
      team.money.economy.add('credits', -band.entry, `Entry fee: ${c.name}`, 'championship');
      const today = team.clock.totalDays;
      const first = (Math.floor(today / DPM) + 1) * DPM + (SEASON.firstDay - 1);
      api.current = { id, entered: today, year: team.clock.year, round: 0, schedule: Array.from({ length: c.rounds }, (_, k) => first + k * SEASON.spacingDays), results: [], drivers: {}, carNumber: car.number };
      table = newTable();
      bus?.emit('championship:entered', { id });
      return { ok: true };
    },
    nextRound() {
      const k = api.current;
      if (!k) return null;
      const c = champById(k.id);
      if (k.round >= c.rounds) return null;
      const due = k.schedule[k.round];
      const today = team.clock.totalDays;
      return { index: k.round, total: c.rounds, trackId: c.tracks[k.round], due, daysAway: Math.max(0, due - today), ready: today >= due };
    },
    // The teams in this championship's field (bible §28: from their first championship on; R08 only under the override).
    rivalPool(id) {
      const i = bandIndex(id);
      return Object.entries(RIVAL_TEAMS)
        .filter(([, t]) => (t.secret ? api.debugSecrets : bandIndex(t.first) <= i || (i >= bandIndex('C11') && bandIndex(t.first) >= 0)))
        .map(([tid]) => tid);
    },
    raceConfig() {
      const k = api.current;
      const c = champById(k.id);
      return { trackId: c.tracks[k.round], rivalPool: api.rivalPool(k.id), band: k.id, fieldSize: CHAMP_BANDS[k.id].fieldSize, champ: { id: k.id, round: k.round } };
    },
    // Race the next round: its weekend (practice → setup → qualifying → race) on its track.
    startRound() {
      const n = api.nextRound();
      if (!n) return { ok: false, reason: 'No round to race' };
      if (!n.ready) return { ok: false, reason: `Round ${n.index + 1} is in ${n.daysAway} day${n.daysAway === 1 ? '' : 's'}` };
      const cur = team.races.current;
      if (cur) return cur.champ?.id === api.current.id && cur.champ.round === n.index ? { ok: true, race: cur, existing: true } : { ok: false, reason: 'Finish the race weekend in progress first' };
      const carNumber = team.cars.cars.get(api.current.carNumber) ? api.current.carNumber : api.eligibleCar(api.current.id)?.number;
      return team.races.createWeekend({ carNumber, config: api.raceConfig() });
    },
    // A round is over (bus race:finished): points (and the fastest lap's), the standings, the next round's day; the title
    // after the last one.
    roundFinished(entry) {
      const k = api.current;
      if (!k || entry?.champ?.id !== k.id || entry.champ.round !== k.round) return null;
      const rows = entry.result.rows;
      for (const r of rows) k.drivers[r.id] = { name: r.name, team: r.team, isPlayer: !!r.isPlayer };
      table.record(rows.map((r) => ({ id: r.id, place: r.pos, dnf: r.status === 'retired' })));
      const fl = entry.result.fastestLap;
      const flRow = fl && rows.find((r) => r.id === fl.id);
      if (flRow && flRow.status !== 'retired' && flRow.pos <= FASTEST_LAP.topN) table.row(fl.id).points += FASTEST_LAP.points;
      for (const r of rows) table.row(r.id).last = r.status === 'retired' ? 99 : r.pos;
      k.results.push({ round: k.round, trackId: entry.trackId, day: team.clock.totalDays, rows: rows.map((r) => ({ id: r.id, pos: r.pos, status: r.status })), fastest: flRow?.id ?? null });
      k.round++;
      const c = champById(k.id);
      if (k.round < c.rounds) k.schedule[k.round] = Math.max(k.schedule[k.round], team.clock.totalDays + SEASON.minGapDays);
      bus?.emit('championship:round', { id: k.id, round: k.round - 1 });
      return k.round >= c.rounds ? api.finishSeason() : { round: k.round - 1 };
    },
    finishSeason() {
      const k = api.current;
      const c = champById(k.id);
      const me = api.standings().find((r) => r.isPlayer);
      const title = me?.pos === 1;
      const band = CHAMP_BANDS[k.id];
      if (title) {
        team.money.economy.add('credits', band.title, `Title bonus: ${c.name}`, 'championship');
        team.money.reputation.add(band.titleRep, `Champions: ${c.name}`);
      }
      const rec = { id: k.id, year: k.year, pos: me?.pos ?? null, points: me?.points ?? 0, title, day: team.clock.totalDays, standings: api.standings().map((r) => ({ id: r.id, name: r.name, team: r.team, points: r.points, wins: r.wins, podiums: r.podiums, pos: r.pos, isPlayer: r.isPlayer })) };
      api.history.push(rec);
      api.current = null;
      const fresh = trophies.check((rule) => api.titles().includes(rule.title), { day: rec.day });
      bus?.emit('championship:finished', { record: rec, trophies: fresh });
      return { finished: rec, trophies: fresh };
    },
    // The season table: every driver who has raced a round, tie-broken.
    standings() {
      const k = api.current;
      if (!k) return api.history[api.history.length - 1]?.standings ?? []; // between seasons: the last one's final table
      const drivers = k?.drivers ?? {};
      const rows = Object.keys(table.rows).map((id) => ({ id, ...table.row(id), name: drivers[id]?.name ?? id, team: drivers[id]?.team ?? '', isPlayer: !!drivers[id]?.isPlayer }));
      return sortStandings(rows);
    },
    // All teams in the current championship by points (a team's drivers added together).
    teamTable() {
      const byTeam = {};
      for (const r of api.standings()) {
        const t = (byTeam[r.team] ??= { team: r.team, points: 0, wins: 0, podiums: 0, isPlayer: false });
        t.points += r.points;
        t.wins += r.wins;
        t.podiums += r.podiums;
        t.isPlayer ||= r.isPlayer;
      }
      return Object.values(byTeam).sort((a, b) => b.points - a.points || b.wins - a.wins || a.team.localeCompare(b.team)).map((t, i) => ({ ...t, pos: i + 1 }));
    },
    trophyList: () => Object.entries(trophies.awarded).map(([id, info]) => ({ ...trophies.trophies.find((t) => t.id === id), ...info })),
    tierName: (tier) => TIER_NAMES[tier],
    trackName: (id) => TRACKS[id]?.name ?? id,

    serialize: () => JSON.parse(JSON.stringify({ current: api.current, table: table.serialize(), history: api.history, trophies: trophies.serialize(), secretFlags: api.secretFlags })),
    load(s) {
      api.current = s?.current ? JSON.parse(JSON.stringify(s.current)) : null;
      table = newTable();
      if (s?.table) table.load(s.table);
      api.history = JSON.parse(JSON.stringify(s?.history ?? []));
      trophies.load(s?.trophies ?? null);
      api.secretFlags = { 'SEC-COMP-01': false, 'SEC-COMP-02': false, ...(s?.secretFlags ?? {}) };
    },
    newGame() {
      api.load(null);
    },
  };

  bus?.on('race:finished', ({ race }) => api.roundFinished(race));
  // the day a round comes due: say so (the garage shows it as a toast)
  bus?.on('clock:day', () => {
    const n = api.nextRound();
    if (n && n.daysAway === 0 && team.clock.totalDays === n.due) bus.emit('championship:due', { id: api.current.id, round: n.index, trackId: n.trackId });
  });
  return api;
}
