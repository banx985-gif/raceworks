// Career records (Milestone 13): every person the team has employed keeps races, wins, podiums, cars built and days
// employed (years = days ÷ a game year), kept by id, so they survive someone leaving and coming back. The founder's
// history (spec §4, Milestone 4b) is written from the same records (racesEntered / wins / podiums / carsDeveloped /
// daysEmployed), plus its own continuous-employment flag.
// The team's own facts (TEAM_FACTS) are what staff eligibility reads (bible §11 "Initial eligibility": 3 pole
// positions, 10 race wins, Build 8 cars…). Counted from race weekends (not the debug Test Race).
// Who races: the race crew (src/systems/staffTraits.js raceCrew, bible §10.8), fixed into the race when it's created
// (race.crew). A generic contractor (an empty crew role) earns no records.
//   careers.of(id) → { races, wins, podiums, carsBuilt, daysEmployed } · careers.years(id) · careers.fact(key)
//   careers.unlocked — staff ids whose eligibility has held once (they stay findable) · serialize() / load(data)
import { CLOCK } from '../../data/balance.js';
import { CLASSES } from '../../data/cars.js';
import { WEEKEND } from '../../data/race.js';
import { TRACKS } from '../race/tracks.js';

export const CAREER_KEYS = ['races', 'wins', 'podiums', 'carsBuilt', 'daysEmployed'];
const FOUNDER_KEY = { races: 'racesEntered', wins: 'wins', podiums: 'podiums', carsBuilt: 'carsDeveloped', daysEmployed: 'daysEmployed' };
const DAYS_PER_YEAR = CLOCK.daysPerMonth * CLOCK.monthsPerYear;

// The team facts, with the words the Recruitment screen uses for progress.
export const TEAM_FACTS = {
  raceStarts: 'race starts',
  wins: 'race wins',
  podiums: 'podiums',
  poles: 'pole positions',
  setup80: 'setup scores of 80+',
  gained5: 'races finished 5+ places above the grid',
  cleanFinishes: 'races finished without a mechanical retirement',
  carsBuilt: 'cars built',
  classWins: 'different classes with a win',
  // Milestone 16 (bible §11 STR06 / STR08, §36 SEC-STAFF-L5): race strategy records
  strategySwingWins: 'Strategy Swing wins',
  undercutWins: 'Strategy Swing wins by undercut',
  extendedStintWins: 'Strategy Swing wins by extending a stint',
  neutralisationBenefits: 'places gained under caution',
  // Milestone 17 (bible §11 DRV04 / MEC04 / STR04 / STR06): weather, repairs and cautions
  wetWins: 'wins in a wet race',
  weatherTyreChanges: 'weather tyre changes made right',
  raceFaultRepairs: 'race faults repaired',
  cautionBenefits: 'cautions you gained places in',
  // Milestone 18 (bible §25): Drive Stints, for later secrets (counters only)
  stintsDriven: 'Drive Stints driven',
  stintOvertakes: 'overtakes made in Drive Stints',
  stintGains: 'Drive Stints that gained time',
  technicalPodiums: 'podiums on technical tracks', // Milestone 19 (Freya Nash)
};

const blank = () => Object.fromEntries(CAREER_KEYS.map((k) => [k, 0]));
const blankFacts = () => ({ raceStarts: 0, wins: 0, podiums: 0, poles: 0, setup80: 0, gained5: 0, cleanFinishes: 0, carsBuilt: 0, classWins: [], trackWins: {}, strategySwingWins: 0, undercutWins: 0, extendedStintWins: 0, neutralisationBenefits: 0, wetWins: 0, weatherTyreChanges: 0, raceFaultRepairs: 0, cautionBenefits: 0, stintsDriven: 0, stintOvertakes: 0, stintGains: 0, bestStintDelta: null, technicalPodiums: 0 });

export function createCareers({ bus, team }) {
  const api = {
    people: {},
    facts: blankFacts(),
    unlocked: [],
    of(id) {
      return (api.people[id] ??= blank());
    },
    years: (id) => (api.people[id]?.daysEmployed ?? 0) / DAYS_PER_YEAR,
    fact(key) {
      const v = api.facts[key];
      return Array.isArray(v) ? v.length : typeof v === 'number' ? v : 0;
    },
    trackWins: (trackId) => api.facts.trackWins[trackId] ?? 0,
    // Add to a person's record (and the founder's history when it's them).
    credit(id, key, n = 1) {
      if (!id) return;
      api.of(id)[key] += n;
      if (team.founder?.id === id && team.founder.history && FOUNDER_KEY[key]) team.founder.history[FOUNDER_KEY[key]] += n;
    },
    // A finished race weekend: the team's facts and the crew's records.
    raceFinished(entry) {
      if (entry.kind !== 'weekend') return;
      const me = entry.result?.rows?.find((r) => r.isPlayer);
      if (!me) return;
      const f = api.facts;
      const finished = me.status !== 'retired';
      const win = finished && me.pos === 1;
      const podium = finished && me.pos <= 3;
      f.raceStarts++;
      if (win) f.wins++;
      if (podium) f.podiums++;
      if (entry.quali?.rows?.[0]?.id === 'PLAYER') f.poles++;
      if ((entry.setupScore ?? 0) >= 80) f.setup80++;
      if (finished && me.grid - me.pos >= 5) f.gained5++;
      if (finished) f.cleanFinishes++; // (Milestone 17: a crash retirement isn't a finish either)
      // Milestone 16: a Strategy Swing win (src/systems/races.js strategySwing) and places gained under caution (M17)
      if (entry.swingWin) {
        f.strategySwingWins++;
        if (entry.swingWin.kind === 'undercut') f.undercutWins++;
        else f.extendedStintWins++;
      }
      f.neutralisationBenefits += me.neutralGains ?? 0;
      // Milestone 17: a win in a race that saw rain, weather tyre changes made right, faults a pit repair fixed, cautions gained in
      if (win && entry.wet) f.wetWins++;
      if (podium && WEEKEND.technicalProfiles.includes(TRACKS[entry.trackId]?.profile)) f.technicalPodiums++; // Milestone 19
      f.weatherTyreChanges += me.weatherChanges ?? 0;
      f.raceFaultRepairs += me.faultsFixed ?? 0;
      f.cautionBenefits += me.neutralBenefits ?? 0;
      if (win) {
        const classId = team.cars.cars.get(entry.carNumber)?.result?.classId;
        if (classId && CLASSES[classId] && !f.classWins.includes(classId)) f.classWins.push(classId);
        f.trackWins[entry.trackId] = (f.trackWins[entry.trackId] ?? 0) + 1;
      }
      for (const id of entry.crew ?? []) {
        api.credit(id, 'races');
        if (win) api.credit(id, 'wins');
        if (podium) api.credit(id, 'podiums');
      }
    },
    serialize: () => JSON.parse(JSON.stringify({ people: api.people, facts: api.facts, unlocked: api.unlocked })),
    load(data) {
      api.people = JSON.parse(JSON.stringify(data?.people ?? {}));
      api.facts = { ...blankFacts(), ...JSON.parse(JSON.stringify(data?.facts ?? {})) };
      api.unlocked = [...(data?.unlocked ?? [])];
      if (!data) api.rebuild();
    },
    // A save from before Milestone 13: records from what the save still has — the founder's history, the Car Garage's
    // teams, the race history (the last 30 races) and the current staff (days employed since they were hired).
    rebuild() {
      for (const rec of team.cars.cars.list()) {
        api.facts.carsBuilt++;
        for (const m of rec.team ?? []) api.of(m.id).carsBuilt++;
      }
      for (const entry of team.races.history) api.raceFinished(entry); // no crew list before M13: team facts only
      for (const s of team.roster) api.of(s.id).daysEmployed = Math.max(0, team.clock.totalDays - (s.counters?.hiredDay ?? 0));
      const h = team.founder?.history;
      if (h) {
        const r = api.of(team.founder.id);
        r.races = Math.max(r.races, h.racesEntered ?? 0);
        r.wins = Math.max(r.wins, h.wins ?? 0);
        r.podiums = Math.max(r.podiums, h.podiums ?? 0);
        r.carsBuilt = Math.max(r.carsBuilt, h.carsDeveloped ?? 0);
        r.daysEmployed = Math.max(r.daysEmployed, h.daysEmployed ?? 0);
      }
    },
    newGame() {
      api.people = {};
      api.facts = blankFacts();
      api.unlocked = [];
    },
  };

  bus.on('clock:day', () => {
    for (const s of team.roster) api.credit(s.id, 'daysEmployed');
  });
  bus.on('project:complete', ({ record }) => {
    if (!record) return;
    api.facts.carsBuilt++;
    for (const m of record.team ?? []) api.credit(m.id, 'carsBuilt');
  });
  bus.on('race:finished', ({ race }) => api.raceFinished(race));
  // Milestone 18: a Drive Stint handed back (weekends and the Test Race alike): driven, overtakes, the best delta (lowest)
  bus.on('stint:done', ({ record }) => {
    const f = api.facts;
    f.stintsDriven++;
    f.stintOvertakes += record.overtakes ?? 0;
    if (record.delta < 0) f.stintGains++;
    if (f.bestStintDelta === null || record.delta < f.bestStintDelta) f.bestStintDelta = record.delta;
  });
  return api;
}
