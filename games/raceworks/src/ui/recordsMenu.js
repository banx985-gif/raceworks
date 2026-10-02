// The Records screen (Milestone 26, bible §7 "Rankings / Records / Achievements"): one bottom sheet with six tabs, built
// again every frame while open (so it stays live). Opened from Staff → Records, Compete → Records and the Menu.
//   Awards   completion % (visible content only, each category found / total) and the 30 achievements (earned ✓ with
//            the day and reward; the others with their requirement)
//   Team     titles, wins, podiums, poles, fastest laps, money peak; best finish and top speed per track
//   Staff    every person's career (Milestone 13): races, wins, podiums, cars built, years
//   Cars     best QUALITY, wins by car family
//   Races    lap records per track, the longest run without a retirement, the prestige records (empty until earned)
//   Medals   the training medals per drill (Milestone 14, account-wide) and the Drive Stint records
// Each record shows this team's value and the best on this device. Nothing here tells how many secrets exist or are
// left (the hidden denominator rule): before the ending there is no secret line at all.
import { THEME } from '../../../../core/Theme.js';
import { RECORDS_TEXT as T } from '../../data/achievements.js';
import { TRACKS, TRACK_IDS, isVisibleTrack } from '../race/tracks.js';
import { FAMILY_NAMES } from '../../data/cars.js';
import { ALL_STAFF, ROLES } from '../../data/staff.js';
import { DRILLS } from '../../data/drills.js';
import { fmt } from './moneyMenu.js';

const C = THEME.color;
const NAME = Object.fromEntries(ALL_STAFF.map((d) => [d.id, d]));
const dateOf = (day) => `Y${Math.floor(day / 336) + 1} M${Math.floor((day % 336) / 28) + 1} D${(day % 28) + 1}`;
const lap = (s) => (s == null ? T.empty : `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`);
const num = (v) => (v == null || v === 0 ? T.empty : fmt(v));

export function recordsMenu({ team, open = () => {}, menuRow = () => {} }) {
  const A = team.achievements;
  // "This team: X · Best on this device: Y"
  const pair = (r, show = num) => `${T.thisTeam}: ${show(r.team)} · ${T.device}: ${show(r.device)}`;
  const line = (label, r, show = num) => ({ text: `${label} — ${pair(r, show)}`, color: r.team != null && r.team !== 0 && r.team === r.device ? C.good : undefined });
  const keyed = (id) => A.records().find((d) => d.id === id)?.keys ?? [];
  // Only the tracks with a record (here or on the device); the rest of the visible ones as one muted line.
  const trackRows = (id, show) => {
    const have = new Set(keyed(id));
    const rows = TRACK_IDS.filter((t) => have.has(t)).map((t) => line(TRACKS[t].name, A.record(id, t), show));
    const rest = TRACK_IDS.filter((t) => isVisibleTrack(t) && !have.has(t)).length;
    return [...rows, ...(rest ? [{ text: rows.length ? `${rest} more track${rest === 1 ? '' : 's'} to race` : 'No races yet.', color: C.textMuted }] : [])];
  };

  // --- Awards: completion and the 30 achievements ---
  const c = A.completion();
  const awards = [
    {
      title: c.text,
      lines: [
        ...c.rows.map((r) => ({ text: `${r.label}: ${r.found} / ${r.total}`, color: r.found >= r.total ? C.good : undefined })),
        { text: T.completionNote, color: C.textMuted },
        // Milestone 27 hook: only after the ending
        ...(c.prestige ? [{ text: `Prestige: ${c.prestige.found} of ${c.prestige.total} secrets found`, color: C.actionDark }] : []),
      ],
    },
    {
      title: `Achievements · ${A.earnedList().length} of ${A.rules.length}`,
      columns: 2,
      buttons: A.rules.map((r) => {
        const got = A.earned(r.id) ? A.engine.account.history[r.id].first : null;
        return { id: `ach_${r.id}`, label: `${got ? '✓ ' : ''}${r.name}`, sub: got ? `${dateOf(got.day ?? 0)} · ${r.recipe}` : r.recipe, icon: r.icon, accent: got ? C.good : C.outline, onTap: () => {} };
      }),
    },
  ];

  // --- Team ---
  const peak = A.record('peakCredits');
  const teamTab = [
    {
      lines: [
        line('Titles', A.record('titles')),
        line('Race wins', A.record('wins')),
        line('Podiums', A.record('podiums')),
        line('Pole positions', A.record('poles')),
        line('Fastest laps', A.record('fastestLaps')),
        line('Most Credits at once', peak),
      ],
      columns: 1,
      buttons: [{ id: 'recordsTrophies', label: 'Trophy cabinet', sub: `${team.championships.trophies?.count ?? 0} trophies · every title`, icon: 'race_reward_08', accent: C.progress, onTap: () => open('trophies') }],
    },
    { title: 'Best finish per track', lines: trackRows('bestFinish', (v) => (v == null ? T.empty : `P${v}`)) },
    { title: 'Top speed per track', lines: trackRows('topSpeed', (v) => (v == null ? T.empty : `${Math.round(v)} km/h`)) },
  ];

  // --- Staff (careers: everyone ever employed; the team now first) ---
  const people = Object.entries(team.careers.people).filter(([, p]) => p.races || p.wins || p.carsBuilt || p.daysEmployed);
  const here = (id) => !!team.get(id);
  people.sort((a, b) => Number(here(b[0])) - Number(here(a[0])) || (b[1].wins ?? 0) - (a[1].wins ?? 0));
  const staffTab = [
    { lines: [line('Most race wins by one person', A.record('personWins'), (v) => (v == null ? T.empty : fmt(v)))] },
    {
      title: 'Careers',
      lines: people.length
        ? people.map(([id, p]) => ({ text: `${NAME[id]?.name ?? team.get(id)?.name ?? id}${NAME[id] ? ` (${ROLES[NAME[id].role]?.name})` : ''}${here(id) ? '' : ' · left'} — ${p.races} races · ${p.wins} wins · ${p.podiums} podiums · ${p.carsBuilt} cars · ${team.careers.years(id).toFixed(1)} years`, color: here(id) ? undefined : C.textMuted }))
        : ['Nobody has a record yet: build a car and race it.'],
    },
  ];

  // --- Cars ---
  const q = A.record('bestQuality');
  const famKeys = keyed('familyWins');
  const carsTab = [
    { lines: [{ text: `Best car QUALITY — ${T.thisTeam}: ${q.team == null ? T.empty : `${q.team}${q.teamInfo?.car ? ` (${q.teamInfo.car})` : ''}`} · ${T.device}: ${q.device == null ? T.empty : `${q.device}${q.deviceInfo?.car ? ` (${q.deviceInfo.car})` : ''}`}`, color: q.team != null && q.team === q.device ? C.good : undefined }] },
    { title: 'Wins by car family', lines: famKeys.length ? famKeys.map((f) => line(FAMILY_NAMES[f] ?? f, A.record('familyWins', f))) : ['No wins yet.'] },
  ];

  // --- Races (+ the prestige records) ---
  const prestige = A.records().filter((d) => d.prestige);
  const racesTab = [
    { lines: [line('Longest run of races without a retirement', A.record('noRetireStreak'))] },
    { title: 'Lap records', lines: trackRows('lapRecord', lap) },
    {
      title: 'Prestige records',
      lines: prestige.map((d) => {
        const r = A.record(d.id);
        const show = d.id === 'stintDelta' ? (v) => (v == null ? T.prestigeEmpty : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)} s`) : (v) => (v ? fmt(v) : T.prestigeEmpty);
        return { text: `${d.label} — ${pair(r, show)}`, color: r.team || r.device ? C.actionDark : C.textMuted };
      }),
    },
  ];

  // --- Medals (account-wide: the drill records) ---
  const dr = team.training.drillRecords?.data ?? null;
  const medalsTab = [
    {
      title: 'Training medals',
      lines: DRILLS.map((d) => {
        const r = dr?.drills?.[d.id];
        if (!r || !r.attempts) return { text: `${d.name} — not played yet`, color: C.textMuted };
        return { text: `${d.name} — best ${r.best} · Gold ${r.medals.gold} · Silver ${r.medals.silver} · Bronze ${r.medals.bronze}${r.mastered ? ' · Mastered' : ''}`, color: r.goldEverEarned ? C.good : undefined };
      }),
      columns: 1,
      buttons: [{ id: 'recordsDrills', label: 'Drills · Medals', sub: 'Play a drill, see every attempt', icon: 'race_ui_23', accent: C.progress, onTap: () => menuRow('drills') }],
    },
    { title: 'Drive Stints', lines: [`Driven ${dr?.stints?.driven ?? 0} · overtakes ${dr?.stints?.overtakes ?? 0} · best delta ${dr?.stints?.bestDelta == null ? T.empty : `${dr.stints.bestDelta > 0 ? '+' : ''}${dr.stints.bestDelta.toFixed(2)} s`}`] },
  ];

  return {
    title: T.title,
    subtitle: `${c.text} · ${T.subtitle}`,
    art: 'race_reward_08',
    accent: C.progress,
    tabs: [
      { id: 'awards', label: 'Awards', badge: null, sections: awards },
      { id: 'team', label: 'Team', sections: teamTab },
      { id: 'staff', label: 'Staff', sections: staffTab },
      { id: 'cars', label: 'Cars', sections: carsTab },
      { id: 'races', label: 'Races', sections: racesTab },
      { id: 'medals', label: 'Medals', sections: medalsTab },
    ],
  };
}
