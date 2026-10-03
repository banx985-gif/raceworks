// The Year-16 ending (Milestone 27, bible §4.1, §3 "Winning", §7 Ending Ceremony, §30, §32, §35). core/CampaignEnding
// fires it once, as Year 16 Month 12's last day closes (the first moment of Year 17, after that month-end), whatever the
// state of the team: Emergency Credit still reaches it (the grade's Finances area suffers). An open race weekend
// finishes first (the ending waits for it). Then the same save simply carries on as postgame — Year 17+, the calendar,
// championships, events and secrets all keep running; nothing is reset or deleted.
//
//   team.ending = createEnding({ bus, team })             (last in Team: every system's month-end runs before it)
//   .facts()            the run's plain numbers the grade reads (data/ending.js ENDING.categories) — never a secret
//   .grade(facts?)      core GradeEngine → { total, max, band, categories[…parts] }
//   .highlights()       6–10 history cards from the run (first car, first win, titles, best driver, comeback …)
//   .result             worked out once when the ending fired (kept in the save): { grade, facts, worldCrown,
//                       highlights, shelf, cars, tokens, day, year, archiveId }
//   .reached · .pending (the ceremony not seen yet) · .postgame · .ceremonySeen
//   .finishCeremony()   the player closed the last card (Continue or New Game+): postgame from now on
//   .setAccount({ load, save }) · .loadAccount() · .archive (core RunArchive) · .tokensTotal   the ACCOUNT half: the
//                       Hall of Runs and the Prestige Tokens earned from endings (survive slot deletes and NG+)
//   .debugReach()       ?debug=1: the ending now, whatever the year
// Events: core 'campaign:ending' { day }, 'ending:stage' { stage }; and here 'run:ended' (the secrets' runEnded trigger,
// sent before the archive so a secret found by the ending is counted in it) and 'ending:archived' { entry, tokens }.
//
// After the ending: the Rumour Archive gets one more clue stage on every secret (team.secrets.postEnding — the M24
// hook), plus one more again with a Heritage Room (F29, effect clueAfterEnding); the Records screen may show the secrets.
import { CampaignEnding } from '../../../../core/CampaignEnding.js';
import { gradeRun } from '../../../../core/GradeEngine.js';
import { RunArchive } from '../../../../core/RunArchive.js';
import { ENDING } from '../../data/ending.js';
import { CHAMPIONSHIPS } from '../../data/championships.js';
import { FACILITIES, EXPANSIONS } from '../../data/facilities.js';
import { CAR_FAMILIES, FAMILY_NAMES, CLASSES } from '../../data/cars.js';
import { VISIBLE_TIERS, VISIBLE_COMBOS } from '../../data/achievements.js';
import { ALL_STAFF } from '../../data/staff.js';
import { CLOCK } from '../../data/balance.js';
import { familyOfCar } from './carVisual.js';
import { TRACKS } from '../race/tracks.js';

const ACCOUNT_VERSION = 1;
const DPM = CLOCK.daysPerMonth;
const DPY = DPM * CLOCK.monthsPerYear;
const VISIBLE_CHAMPS = new Set(CHAMPIONSHIPS.filter((c) => c.type !== 'secret').map((c) => c.id)); // C01–C10
const TIER_RANK = { club: 1, national: 2, world: 3 };
const GRADED_FACILITIES = new Set(FACILITIES.filter((f) => !f.unlock?.secret).map((f) => f.id)); // never F34 / F35
const NORMAL_WINGS = EXPANSIONS.filter((z) => !z.secret).map((z) => z.id);
const VISIBLE_FAMILIES = new Set(Array.from({ length: 16 }, (_, i) => `V${String(i + 1).padStart(2, '0')}`)); // V17–V20 are secret
const STAFF_BY_ID = Object.fromEntries(ALL_STAFF.map((d) => [d.id, d]));
const champ = (id) => CHAMPIONSHIPS.find((c) => c.id === id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
// A game day (totalDays) → "Year Y, Month M".
export const dateOf = (day = 0) => ({ year: Math.floor(day / DPY) + 1, month: Math.floor((day % DPY) / DPM) + 1 });
const when = (day) => {
  const d = dateOf(day);
  return `Year ${d.year}, Month ${d.month}`;
};

// Pure: the grade for these facts (the tests' synthetic runs use this directly).
export function gradeFacts(facts) {
  return gradeRun({ categories: ENDING.categories, bands: ENDING.bands, facts });
}
export const tokensFor = (band) => ENDING.tokens[band] ?? 0;

export function createEnding({ bus, team }) {
  let ceremonySeen = false;
  let result = null;
  let warned = []; // the Year-16 notice months already shown
  let account = { load: async () => null, save: async () => {} };
  let attached = false;
  const archive = new RunArchive({ max: ENDING.archiveMax });
  let awarded = {}; // runId → Prestige Tokens paid for that run's ending (once ever)

  const campaign = new CampaignEnding({
    bus,
    clock: team.clock,
    endYear: ENDING.endYear,
    canReach: () => !team.races.current, // an open race weekend finishes first
    onReach: () => onReach(),
  });
  // The weekend that held it back has finished: the ending comes now (after the round is scored — registered last).
  bus.on('race:finished', () => campaign.check());

  // --- the facts ------------------------------------------------------------------------------------------------------
  const titleIds = () => [...new Set(team.championships.titles())].filter((id) => VISIBLE_CHAMPS.has(id));
  // Milestone 28: the combos found on cars built in THIS run (not the device's discoveries), so a New Game+ run grades
  // on its own.
  const visibleCombos = () => (team.secrets.facts.get('run.combos') ?? []).filter((id) => VISIBLE_COMBOS.includes(id));
  const familyIds = () => team.cars.cars.list().map((rec) => familyOfCar(rec, team).id).filter((f) => VISIBLE_FAMILIES.has(f));
  function facts() {
    const roster = team.roster;
    const cars = team.cars.cars.list();
    const titles = titleIds();
    const f = team.secrets.facts;
    const placed = team.facilities.items().filter((p) => GRADED_FACILITIES.has(p.def));
    const founder = team.founder;
    return {
      titles: titles.length,
      topTitleTier: Math.max(0, ...titles.map((id) => TIER_RANK[champ(id)?.tier] ?? 0)),
      wins: team.careers.facts.wins ?? 0,
      podiums: team.careers.facts.podiums ?? 0,
      bestQuality: Math.max(0, ...cars.map((c) => c.result?.quality ?? 0)),
      families: new Set(familyIds()).size,
      carsBuilt: cars.length,
      tiersReached: VISIBLE_TIERS.filter((t) => (team.achievements.log.tiers ?? []).includes(t) || roster.some((s) => s.tier === t)).length,
      avgLevel: roster.length ? +(roster.reduce((t, s) => t + (s.level ?? 1), 0) / roster.length).toFixed(2) : 0,
      staffCount: roster.length,
      founderStayed: founder && founder.history?.continuous !== false && team.get(founder.id) ? 1 : 0,
      researchDone: team.research.doneIds().length,
      partsDiscovered: f.get('run.partsDiscovered') ?? 0,
      netWorth: Math.max(0, team.money.credits + placed.reduce((t, p) => t + team.facilities.refundOf(p.uid), 0)),
      sponsorDeals: team.achievements.log.sponsorMet ?? 0,
      solvent: team.money.credits >= 0 ? 1 : 0,
      facilityLevels: placed.reduce((t, p) => t + team.facilities.level(p.uid), 0),
      wingsOpen: team.facilities.expansions().filter((z) => NORMAL_WINGS.includes(z.id) && z.state === 'open').length,
      achievements: team.achievements.attached ? team.achievements.runEarned().length : 0, // Milestone 28: earned or met in THIS run
      combos: visibleCombos().length,
      c10: titles.includes(ENDING.c10) ? 1 : 0,
    };
  }
  const grade = (fx = facts()) => gradeFacts(fx);

  // --- the ceremony's history cards -----------------------------------------------------------------------------------
  const staffName = (id) => team.get(id)?.name ?? STAFF_BY_ID[id]?.name ?? 'Someone';
  const staffArt = (id) => team.get(id)?.art ?? STAFF_BY_ID[id]?.art ?? null;
  function highlights() {
    const H = ENDING.highlights;
    const out = [];
    const cars = team.cars.cars.list();
    const firstCar = cars[0];
    if (firstCar) {
      const fam = familyOfCar(firstCar, team).id;
      out.push({ id: 'firstCar', title: 'The first car', line: `${firstCar.name} — ${CLASSES[firstCar.result?.classId]?.name ?? 'a car'}, QUALITY ${firstCar.result?.quality ?? 0}`, when: firstCar.result?.finishedDay != null ? when(firstCar.result.finishedDay) : null, art: CAR_FAMILIES[fam]?.showcase ?? null });
    }
    const races = team.secrets.log.races ?? [];
    const firstWin = races.find((r) => r.pos === 1);
    if (firstWin) out.push({ id: 'firstWin', title: 'The first win', line: `Top step at ${TRACKS[firstWin.trackId]?.name ?? 'the track'}`, when: when(firstWin.day), art: 'race_event_04' });
    // Each title (newest season of it): the highest tiers first, at most H.titles cards
    const seasons = team.championships.history.filter((h) => h.title && VISIBLE_CHAMPS.has(h.id));
    const byId = {};
    for (const s of seasons) byId[s.id] = s;
    const titles = Object.values(byId).sort((a, b) => (TIER_RANK[champ(b.id).tier] ?? 0) - (TIER_RANK[champ(a.id).tier] ?? 0) || b.id.localeCompare(a.id)).slice(0, H.titles);
    for (const s of titles) {
      const c = champ(s.id);
      const times = seasons.filter((x) => x.id === s.id).length;
      out.push({ id: `title_${s.id}`, title: `${c.name} champions`, line: `${s.points} points${times > 1 ? ` · won ${times} times` : ''}`, when: s.day != null ? when(s.day) : `Year ${s.year}`, art: ENDING.art.tiers[c.tier] });
    }
    // The best driver: the most race wins on their career record (then podiums)
    const drivers = Object.entries(team.careers.people).filter(([id]) => (team.get(id)?.role ?? STAFF_BY_ID[id]?.role) === 'driver');
    const best = drivers.sort((a, b) => b[1].wins - a[1].wins || b[1].podiums - a[1].podiums || a[0].localeCompare(b[0]))[0];
    if (best && best[1].races > 0) out.push({ id: 'bestDriver', title: 'Best driver', line: `${staffName(best[0])}: ${best[1].wins} win${best[1].wins === 1 ? '' : 's'}, ${best[1].podiums} podium${best[1].podiums === 1 ? '' : 's'} in ${best[1].races} races`, art: staffArt(best[0]), portrait: true });
    // The biggest comeback: the most places gained from the grid to the flag in a finished race
    const comeback = races.filter((r) => !r.retired && r.grid != null && r.grid - r.pos > 0).sort((a, b) => b.grid - b.pos - (a.grid - a.pos) || a.day - b.day)[0];
    if (comeback) out.push({ id: 'comeback', title: 'The biggest comeback', line: `From P${comeback.grid} to P${comeback.pos} at ${TRACKS[comeback.trackId]?.name ?? 'the track'}`, when: when(comeback.day), art: 'race_event_03' });
    // The richest month: the best month's net Credits (the run log's month ends)
    const months = team.secrets.log.months ?? [];
    const rich = months.reduce((b, m) => (!b || m.net > b.net ? m : b), null);
    if (rich && rich.net > 0) {
      const y = Math.floor((rich.month - 1) / CLOCK.monthsPerYear) + 1;
      out.push({ id: 'richestMonth', title: 'The richest month', line: `+${fmt(rich.net)} Credits in one month`, when: `Year ${y}, Month ${((rich.month - 1) % CLOCK.monthsPerYear) + 1}`, icon: 'race_ui_05' });
    }
    // The founder's story (Milestones 4b / 13)
    const fh = team.founder?.history ?? {};
    if (team.founder?.id) {
      const stayed = fh.continuous !== false && team.get(team.founder.id);
      out.push({ id: 'founder', title: 'The founder’s story', line: `${staffName(team.founder.id)}: ${fh.racesEntered ?? 0} race${fh.racesEntered === 1 ? '' : 's'}, ${fh.wins ?? 0} win${fh.wins === 1 ? '' : 's'}, ${fh.carsDeveloped ?? 0} car${fh.carsDeveloped === 1 ? '' : 's'} developed${stayed ? ' — here from day one to the end' : ''}`, art: staffArt(team.founder.id), portrait: true });
    }
    // Fillers so a quiet run still has at least H.min cards (always true facts about the run)
    const fill = [
      { id: 'garage', title: 'The garage', line: `${team.facilities.items().filter((p) => GRADED_FACILITIES.has(p.def)).length} stations · ${team.facilities.expansions().filter((z) => z.state === 'open').length} rooms open`, icon: 'race_ui_01' },
      { id: 'crew', title: 'The crew', line: `${team.roster.length} people on the team at the end`, icon: 'race_ui_02' },
      { id: 'research', title: 'The research', line: `${team.research.doneIds().length} of 36 research nodes finished`, icon: 'race_ui_03' },
      { id: 'cars', title: 'The cars', line: `${cars.length} car${cars.length === 1 ? '' : 's'} built in sixteen years`, icon: 'race_ui_01' },
      { id: 'races', title: 'The races', line: `${team.careers.facts.raceStarts ?? 0} race weekends · ${team.careers.facts.podiums ?? 0} podiums`, icon: 'race_ui_04' },
      { id: 'year16', title: 'Year 16', line: 'The garage is still standing, and the next season is already on the calendar.', icon: 'race_ui_13' },
    ];
    for (const x of fill) if (out.length < H.min) out.push(x);
    return out.slice(0, H.max);
  }
  // The trophy shelf (core TrophyCase, visible championships only) and the cars grouped by family.
  const shelf = () => team.championships.trophyList().filter((t) => VISIBLE_CHAMPS.has(t.id.replace('TR-', ''))).map((t) => ({ id: t.id, name: t.name, art: t.art, tier: t.tier }));
  function carsByFamily() {
    const groups = {};
    for (const rec of team.cars.cars.list()) {
      const fam = familyOfCar(rec, team).id;
      if (!VISIBLE_FAMILIES.has(fam)) continue;
      (groups[fam] ||= { family: fam, name: FAMILY_NAMES[fam] ?? fam, art: CAR_FAMILIES[fam]?.showcase ?? null, count: 0 }).count++;
    }
    return Object.values(groups).sort((a, b) => a.family.localeCompare(b.family));
  }

  // --- the ending ---------------------------------------------------------------------------------------------------
  function onReach() {
    team.secrets.postEnding = true; // the Rumour Archive bump (M24 hook) and the Records screen's prestige line
    bus.emit('run:ended', { day: team.clock.totalDays }); // the secrets' runEnded trigger (Founder Loyalty …) first
    const fx = facts();
    const g = grade(fx);
    const tokens = tokensFor(g.band);
    result = {
      day: team.clock.totalDays,
      year: dateOf(team.clock.totalDays).year,
      facts: fx,
      grade: { total: g.total, max: g.max, band: g.band, categories: g.categories.map((c) => ({ id: c.id, name: c.name, max: c.max, score: c.score })) },
      worldCrown: fx.c10 === 1,
      highlights: highlights(),
      shelf: shelf(),
      cars: carsByFamily(),
      tokens,
      archiveId: team.runId,
    };
    ceremonySeen = false;
    writeArchive();
  }
  function archiveEntry() {
    const r = result;
    const titles = titleIds();
    const top = [...team.roster].sort((a, b) => (b.level ?? 1) - (a.level ?? 1) || a.id.localeCompare(b.id)).slice(0, 6);
    return {
      runId: team.runId,
      team: team.setup.teamName,
      principal: team.setup.principal,
      colour: team.setup.colour,
      founderId: team.founder?.id ?? null,
      founderName: STAFF_BY_ID[team.founder?.id]?.name ?? '',
      endedDay: r.day,
      endedYear: ENDING.endYear,
      grade: { total: r.grade.total, band: r.grade.band },
      areas: r.grade.categories.map((c) => ({ id: c.id, name: c.name, score: c.score, max: c.max })),
      titles: titles.map((id) => ({ id, name: champ(id).name })),
      worldCrown: r.worldCrown,
      highlights: r.highlights.map((h) => ({ title: h.title, line: h.line })),
      staff: top.map((s) => ({ id: s.id, name: s.name, role: s.role, tier: s.tier, level: s.level ?? 1 })),
      families: r.cars.map((c) => c.family),
      secretsFound: team.secrets.foundCount(), // archive only — never shown before an ending
      playSeconds: Math.round(team.playSeconds),
      tokens: r.tokens,
    };
  }
  // The account half: the Hall of Runs entry and the run's Prestige Tokens, written once per run (a reload of an older
  // autosave that reaches the ending again replaces the same entry and pays nothing more).
  function writeArchive() {
    if (!attached || !result) return null;
    const entry = archive.add(archiveEntry());
    const first = awarded[team.runId] == null;
    if (first) awarded[team.runId] = result.tokens;
    saveAccount();
    bus.emit('ending:archived', { entry, tokens: first ? result.tokens : 0 });
    return entry;
  }
  const tokensTotal = () => Object.values(awarded).reduce((t, n) => t + n, 0);

  // --- the "Year 16 is ending" card (M23 event): the start of Year 16 and Month 10 ------------------------------------
  bus.on('clock:month', () => {
    const c = team.clock;
    if (campaign.reached || c.year !== ENDING.endYear || !ENDING.warnMonths.includes(c.month) || warned.includes(c.month)) return;
    warned.push(c.month);
    team.events.fire('EV_FINAL_YEAR', { months: CLOCK.monthsPerYear - c.month + 1 });
  });

  // --- account save ---------------------------------------------------------------------------------------------------
  const accountData = () => JSON.parse(JSON.stringify({ version: ACCOUNT_VERSION, archive: archive.serialize(), awarded }));
  function saveAccount() {
    return attached ? account.save(accountData()) : Promise.resolve();
  }

  const api = {
    campaign,
    facts,
    grade,
    highlights,
    gradeFacts,
    archive,
    get result() {
      return result;
    },
    get reached() {
      return campaign.reached;
    },
    get postgame() {
      return campaign.reached && ceremonySeen;
    },
    get ceremonySeen() {
      return ceremonySeen;
    },
    // The ceremony is waiting for the player.
    get pending() {
      return campaign.reached && !ceremonySeen;
    },
    get warned() {
      return warned;
    },
    get tokensTotal() {
      return tokensTotal();
    },
    tokensFor: (runId) => awarded[runId] ?? null,
    finishCeremony() {
      if (!campaign.reached) return false;
      ceremonySeen = true;
      campaign.continuePostgame();
      bus.emit('team:changed', { what: 'ending' });
      return true;
    },
    debugReach: () => campaign.reach(),
    get attached() {
      return attached;
    },
    setAccount(store) {
      account = store;
      attached = true;
    },
    async loadAccount() {
      const d = (await account.load()) ?? null;
      archive.load(d?.archive ?? []);
      awarded = { ...(d?.awarded ?? {}) };
    },
    accountData,
    newGame() {
      campaign.reset();
      result = null;
      ceremonySeen = false;
      warned = [];
    },
    serialize: () => JSON.parse(JSON.stringify({ campaign: campaign.serialize(), result, ceremonySeen, warned })),
    // A save from before Milestone 27: no ending yet — one already past Year 16 (debug) gets it on its next day tick.
    load(data) {
      campaign.load(data?.campaign ?? null);
      result = data?.result ? JSON.parse(JSON.stringify(data.result)) : null;
      ceremonySeen = !!data?.ceremonySeen;
      warned = [...(data?.warned ?? [])];
      // A finished run that was saved before its archive entry reached the account (it is written again, once).
      if (campaign.reached && result && attached && !archive.list.some((e) => e.runId === team.runId)) writeArchive();
    },
  };
  return api;
}
