// Garage sheets. One registry, so every way in — tapping a station or a worker, a bottom-bar button, the Build
// sheet's "Pit Bay" button — opens exactly the same menu. Built again every frame while open, so states stay live.
//   open(kind, target) opens another menu in the same sheet (it replaces the open one; sheets never stack).
//   goRoster() · goStaff(id) open the staff screens (Milestone 3).
//   goBuilder() · goCarGarage() open the car screens (Milestone 4). debug: extra buttons with ?debug=1.
//   goMainMenu() saves and returns to the main menu (Milestone 4b: from the Money sheet, "saving" lives there).
// Milestone 5: the Money sheet (src/ui/moneyMenu.js), the Pit Bay's Emergency Fix and running cost. toast(text) says
//   why something was refused.
// Milestone 10: every station's sheet shows its effect (bible §19) and leads to Build Mode; in Build Mode, 'facility'
//   (a tapped station: effect, sell for 50%) and 'shop' (build a facility: F01–F15 with cost, effect or why not). The
//   Build sheet's Facilities / Shop buttons open Build Mode, and it lists the garage's wings.
// Milestone 11: the Research sheet — bottom-bar Research, the Strategy Desk and the research stations (CFD Station,
//   Engine Lab) — RP, the node being researched (progress, days left, Stop), the locked second queue and "Research tree"
//   (goResearch). A research station's sheet also shows its effect and Build Mode.
// Milestone 22: the Research sheet's Parts Archive → Combo Archive (discovered: name, recipe, reward; else ??? and its
//   clue once a near-miss happened) and Rumour Archive (clues and recipes); the Compete sheet's "Your car" card (the
//   resolved visual family in the team colour with its sponsors).
// Milestone 12: the Staff sheet's Hire (goRecruit) and Train (goTrain); the Driver Simulator's Training; the Sponsor Wall
//   (front desk) leads to Recruitment; a worker's sheet has Train (or their course and days left).
// Milestone 23: the Inbox (top bar) — every event newest first (● unread), tap one to see its card again (a choice once
//   made stays locked); Rumour Archive and Mark all read at the top.
// Milestone 21: the Sponsor Wall's sheet also has Sponsors — the 'sponsors' sheet (src/ui/sponsorMenu.js, the same as the
//   Money sheet's Sponsors tab): slots, deals, obligation progress and the offers.
import { MenuRegistry } from '../../../../core/ui/BottomSheet.js';
import { THEME } from '../../../../core/Theme.js';
import { STATIONS } from '../../data/garage.js';
import { BOTTOM_SLOTS, TOP_SHEETS } from '../../data/home.js';
import { ROLES, TIERS } from '../../data/staff.js';
import { STATUS_ORDER, STATUS_NAME } from './statusIcons.js';
import { PHASES, BUDGETS, BUDGET_ORDER, CLASSES, PROJECT } from '../../data/cars.js';
import { leadRole } from '../systems/carProject.js';
import { FOUNDER_FLAG } from '../../data/setup.js';
import { COSTS } from '../../data/economy.js';
import { moneyMenu, fmt } from './moneyMenu.js';
import { sponsorSections } from './sponsorMenu.js'; // Milestone 21
import { carArtKey } from './livery.js'; // Milestone 22
import { familyOfCar } from '../systems/carVisual.js';
import { FAMILY_NAMES, PARTS, SLOTS } from '../../data/cars.js';
import { COMBOS, comboById } from '../../data/combos.js';
import { unlockContext, partState } from '../systems/carCatalog.js';
import { BUILD_TEXT } from '../../data/facilities.js';
import { liveryKey, teamColourId } from './livery.js';
import { RESEARCH_ICONS } from '../../data/research.js';
import { NODE, nodeLabel } from '../systems/research.js';
import { TRACKS, TRACK_IDS, geoOf } from '../race/tracks.js'; // Milestone 19
import { champById, TROPHY_ART } from '../../data/championships.js'; // Milestone 20
import { RIVAL_TEAMS } from '../../data/rivals.js';

const C = THEME.color;

// "Driver · Level 1 · Standard · Tired" — shared by the sheet, the roster and the detail screen.
export function staffLine(s) {
  const status = STATUS_ORDER.filter((k) => s.status?.[k]).map((k) => STATUS_NAME[k]);
  return [ROLES[s.role].name, `Level ${s.level}`, TIERS[s.tier].name, ...status].join(' · ');
}

export function createGarageMenus({ garage, team, assets = null, open, close = () => {}, goRoster, goStaff, goBuilder, goCarGarage, goMainMenu = null, debug = null, toast = () => {}, goTestRace = null, goRaceResult = null, goWeekend = null, goResearch = () => {}, goRecruit = () => {}, goTrain = () => {}, debugTracks = null, goChampRound = () => {}, enterChamp = () => {} }) {
  const menus = new MenuRegistry();
  const fac = team.facilities;
  // What a facility does, for its sheets (bible §19): its effect, its role and what it cost.
  const effectLines = (def) => [
    { text: `Effect: ${def.effectText}`, color: C.actionDark },
    `${def.role} station${def.cost ? ` · built for ${fmt(def.cost)} Credits` : ''}`,
  ];
  const enterBuild = () => garage().setBuildMode(true);
  const buildButton = () => ({ id: 'buildMode', label: 'Build Mode', sub: 'Move, sell or build stations', icon: 'race_ui_01', accent: C.progress, onTap: enterBuild });
  // The Research sheet (Milestone 11): what is being researched, RP, the queues and the way into the tree.
  const research = team.research;
  function researchSections() {
    const act = research.active;
    const q2 = research.secondQueue;
    const lines = [{ text: `${fmt(research.rp)} RP · ${research.system.doneCount} of 36 topics done`, color: C.actionDark }];
    const bars = [];
    const buttons = [{ id: 'researchTree', label: 'Research tree', sub: act ? 'Six branches: parts, facilities, tyres' : 'Pick what to research next', icon: RESEARCH_ICONS.tree, onTap: goResearch }];
    if (act) {
      const days = research.daysLeft();
      lines.push(`Researching: ${NODE[act].name} (${nodeLabel(act)}) · about ${days === Infinity ? '—' : days} day${days === 1 ? '' : 's'} left`);
      bars.push({ label: 'Progress', value: Math.floor(research.fraction(act) * 100), max: 100, text: `${Math.floor(research.fraction(act) * 100)}%` });
      buttons.push({ id: 'researchStop', label: 'Stop', sub: 'Keeps its progress', accent: C.progress, onTap: () => research.stop() });
    } else lines.push({ text: 'Nothing being researched: open the tree and start a topic.', color: C.bad });
    return [
      { lines, bars },
      { columns: 1, buttons },
      { columns: 1, buttons: [{ id: 'queue2', label: 'Second queue', sub: q2.open ? 'Open' : q2.why, icon: RESEARCH_ICONS.tree, locked: !q2.open, onTap: () => {} }] },
      // Milestone 22: the archives
      { columns: 1, buttons: [{ id: 'partsArchive', label: 'Parts Archive', sub: `Parts and combos · ${COMBOS.filter((c) => team.combos.discovered(c.id)).length} of 20 combos found`, icon: 'race_ui_03', accent: C.progress, onTap: () => open('partsArchive') }] },
    ];
  }
  // Milestone 12: the Hire / Train buttons (Staff sheet, Driver Simulator, Sponsor Wall).
  const hireButton = () => {
    const rec = team.recruitment;
    return { id: 'hire', label: 'Hire', sub: `${team.roster.length} of ${rec.staffCap()} · new faces in ${rec.freeInDays()} days`, icon: 'race_ui_02', accent: C.good, onTap: () => goRecruit() };
  };
  const trainButton = (id = null) => {
    const tr = team.training;
    const busy = tr.active.length;
    return { id: 'train', label: 'Train', sub: !tr.open() ? tr.lockedText : busy ? `${busy} on a course now` : 'Seven courses · Credits and days', icon: 'race_ui_02', accent: C.progress, onTap: () => goTrain(id) };
  };
  // Milestone 21: the Sponsor Wall leads to the sponsors too
  const sponsorsButton = () => {
    const sp = team.sponsors;
    return { id: 'sponsors', label: 'Sponsors', sub: `${sp.deals.length} of ${sp.slots()} slots · ${sp.offers.length} offer${sp.offers.length === 1 ? '' : 's'}`, icon: 'race_ui_02', accent: C.progress, onTap: () => open('sponsors') };
  };
  const extraFor = { F12: () => [trainButton()], F15: () => [sponsorsButton(), hireButton()] };
  menus.register('sponsors', () => ({ title: 'Sponsors', subtitle: `${team.sponsors.deals.length} of ${team.sponsors.slots()} slots · Rank ${team.money.rank}`, art: 'race_ui_02', accent: C.progress, sections: sponsorSections(team, toast) }));

  for (const def of STATIONS) {
    if (def.id === 'F02') continue; // the Pit Bay's sheet is the car project's (below)
    if (def.research) {
      menus.register(def.id, () => ({ title: def.name, subtitle: def.purpose, art: def.art, sections: [...researchSections(), { lines: effectLines(def), columns: 1, buttons: [buildButton()] }] }));
      continue;
    }
    menus.register(def.id, () => ({ title: def.name, subtitle: def.purpose, art: def.art ?? 'race_ui_02', sections: [...(extraFor[def.id] ? [{ columns: 1, buttons: extraFor[def.id]() }] : []), { lines: effectLines(def), columns: 1, buttons: [buildButton()] }] }));
  }

  // Build Mode (Milestone 10): a tapped station or prop — what it does, and Sell (half its price back) when it may go.
  menus.register('facility', (st) => {
    if (!st || !fac.system.get(st.uid)) return null;
    garage().setSheetTarget?.(st);
    const def = st.def;
    const why = fac.sellWhy(st.uid);
    const refund = fac.refundOf(st.uid);
    return {
      title: def.name,
      subtitle: def.prop ? 'Garage prop' : def.purpose,
      art: def.art,
      sections: [
        { lines: def.prop ? ['Drag it on the floor to move it.'] : [...effectLines(def), 'Drag it on the floor to move it.'] },
        {
          columns: 1,
          buttons: [
            {
              id: 'sell',
              label: why ? 'Can’t sell' : `Sell for ${fmt(refund)} Credits`,
              sub: why ?? `Half of its ${fmt(def.cost)} Credits back`,
              icon: def.art,
              disabled: !!why,
              accent: C.bad,
              onTap: () => {
                const r = fac.sell(st.uid);
                toast(r.ok ? `Sold: ${def.name}` : r.reason, r.ok ? `+${fmt(r.refund)} Credits` : '');
                if (r.ok) garage().say(`Sold: ${def.name} (+${fmt(r.refund)} Credits)`);
                close();
              },
            },
          ],
        },
      ],
    };
  });
  // The Shop (Milestone 10): every facility of the first fifteen, ready ones first; Build places it on the free spot
  // nearest the middle of the view and pays through the ledger.
  menus.register('shop', () => {
    const debt = team.money.economy.isBlocked('facility');
    return {
      title: 'Build a facility',
      subtitle: debt ? BUILD_TEXT.debt : `You have ${fmt(team.money.credits)} Credits · sell back for half`,
      art: 'race_ui_01',
      accent: C.progress,
      sections: [
        {
          columns: 1,
          buttons: fac.shopList().map((s) => ({
            id: `buy_${s.def.id}`,
            label: s.owned ? `${s.def.name} ✓` : s.def.name,
            sub: s.ok ? `${fmt(s.def.cost)} Credits · ${s.def.effectText}` : `${s.why} · ${s.def.effectText}`,
            icon: s.def.art,
            disabled: !s.ok,
            locked: s.locked,
            onTap: () => {
              const r = fac.buy(s.def.id, garage().viewCell());
              if (!r.ok) return toast(r.reason);
              toast(`Built: ${s.def.name}`, `−${fmt(r.cost)} Credits`);
              close();
              garage().built(r.item, r.cost);
            },
          })),
        },
      ],
    };
  });

  // The Pit Bay (Milestone 4): "New car" when it is free; while a car is being built, the project's numbers
  // (the show itself plays on the bay).
  const pitBay = STATIONS.find((s) => s.id === 'F02');
  const garageButton = () => ({ id: 'carGarage', label: 'Car Garage', sub: `${team.cars.cars.list().length} finished`, icon: 'race_ui_01', accent: C.progress, onTap: goCarGarage });
  menus.register('F02', () => {
    const cars = team.cars;
    const job = cars.active;
    if (!job) {
      const can = team.canStartCar();
      return {
        title: pitBay.name,
        subtitle: pitBay.purpose,
        art: pitBay.art,
        sections: [
          { columns: 1, buttons: [{ id: 'newCar', label: 'New car', sub: can.ok ? 'Choose a class and parts' : can.reason, icon: assets ? liveryKey(assets, CLASSES.clubHatch.art, teamColourId(team)) : CLASSES.clubHatch.art, onTap: goBuilder }] },
          { columns: 1, buttons: [garageButton()] },
        ],
      };
    }
    const phase = cars.phase(job);
    const pct = Math.floor(cars.fraction(job) * 100);
    const days = cars.daysLeft(job);
    const teamList = cars.team(job);
    const lead = teamList.find((s) => s.role === leadRole(phase));
    const open = cars.openFaults(job);
    const budgetButtons = BUDGET_ORDER.map((id) => {
      const now = job.data.budget === id;
      const next = job.data.nextBudget === id;
      return { id: `budget_${id}`, label: BUDGETS[id].name, sub: now ? (job.data.nextBudget ? 'This phase' : 'Now') : next ? 'From next phase' : 'Tap: next phase', accent: now || next ? C.progress : C.action, onTap: () => cars.setNextBudget(job, id) };
    });
    const sections = [
      {
        lines: [
          { text: `Phase ${job.phaseIndex + 1} of ${PHASES.length}: ${phase.name} · ${pct}% · about ${days} day${days === 1 ? '' : 's'} left`, color: C.actionDark },
          `In the bay: ${phase.stage}`,
          { text: `Faults: ${open} open (${job.data.faults.length} so far) · Breakthroughs: ${job.data.breakthroughs.length}`, color: open ? C.bad : C.text },
          `Team (${teamList.length} of ${PROJECT.teamSlots}): ${teamList.map((s) => s.name.split(' ')[0]).join(', ')}${lead ? ` · ${lead.name.split(' ')[0]} leads this phase (+${PROJECT.roleMatchPct}%)` : ''}`,
          `Budget focus (changes between phases): ${BUDGETS[job.data.budget].name}${job.data.nextBudget ? ` → ${BUDGETS[job.data.nextBudget].name} next phase` : ''}`,
          `Running cost: ${fmt(team.money.carDailyCost(job))} Credits a day`,
        ],
      },
      { buttons: budgetButtons, columns: 3 },
      {
        columns: 1,
        buttons: [
          {
            id: 'emergencyFix',
            label: 'Emergency Fix',
            sub: open ? `Fix one fault now: ${fmt(COSTS.emergencyFix.credits)} Credits, −${COSTS.emergencyFix.innovation} Innovation` : 'No open faults',
            disabled: !open || !team.money.affordable(COSTS.emergencyFix.credits),
            accent: C.bad,
            onTap: () => {
              const r = team.money.emergencyFix(job);
              toast(r.ok ? 'Fault fixed' : r.reason);
            },
          },
          garageButton(),
        ],
      },
    ];
    if (debug) {
      sections.push({
        title: 'Debug',
        buttons: [
          { id: 'dbgDays', label: '+5 days', accent: C.purple, onTap: () => debug.days(5) },
          { id: 'dbgPhase', label: 'Finish phase', accent: C.purple, onTap: () => debug.finishPhase() },
          { id: 'dbgFault', label: 'Fault now', accent: C.purple, onTap: () => cars.debugFault(job) },
          { id: 'dbgBreak', label: 'Breakthrough', accent: C.purple, onTap: () => cars.debugBreakthrough(job) },
        ],
      });
    }
    return { title: `${pitBay.name} · ${job.name}`, subtitle: `Building: ${phase.stage.toLowerCase()} (${phase.name})`, art: pitBay.art, sections };
  });

  // A worker's card (style guide §6): who they are, what they are doing now, and the way to their details.
  menus.register('worker', (agent) => {
    const s = team.get(agent.staffId);
    if (!s) return null;
    return {
      title: s.name,
      subtitle: staffLine(s),
      art: s.art,
      accent: C.progress,
      sections: [
        {
          lines: [
            ...(team.isFounder(s.id) ? [{ text: `${FOUNDER_FLAG} · ${team.founderDef()?.perkName ?? ''}`, color: C.gold }] : []),
            { text: `Now: ${garage().stateText(s.id)}`, color: C.actionDark },
            `Energy ${Math.round(s.energy)} · Morale ${Math.round(s.morale)}`,
          ],
          columns: 1,
          buttons: [
            { id: 'details', label: 'Details', sub: team.isDriver(s) ? 'Driver ratings, stats and traits' : 'Stats and traits', icon: ROLES[s.role].badge, onTap: () => goStaff(s.id) },
            team.training.trainingOf(s.id) ? { id: 'train', label: 'On a course', sub: `${team.training.courseOf(s.id).name}: ${team.training.daysLeft(s.id)} days left`, icon: 'race_ui_02', accent: C.progress, onTap: () => goTrain(s.id) } : trainButton(s.id),
          ],
        },
      ],
    };
  });

  // Bottom bar: each slot's sheet. Build also leads to the Pit Bay and the Car Garage; Staff to the roster and each person.
  for (const slot of BOTTOM_SLOTS) {
    menus.register(slot.id, () => {
      const menu = { title: slot.label, subtitle: slot.line, art: slot.icon, sections: [] };
      if (slot.id === 'build') {
        const job = team.cars.active;
        const wings = fac.expansions().filter((z) => z.state !== 'hidden');
        menu.sections = [
          { columns: 1, buttons: [{ id: 'pitBay', label: pitBay.name, sub: job ? `${job.name}: ${team.cars.phase(job).name}` : 'New car', icon: pitBay.art, onTap: () => open(pitBay.id) }] },
          { columns: 1, buttons: [garageButton()] },
          // Milestone 10: Build → Facilities (Build Mode) and the Shop.
          {
            title: 'Facilities',
            lines: [`${fac.items().filter((p) => !fac.defs[p.def].prop).length} stations in the garage · ${wings.map((z) => (z.state === 'open' ? z.name : `${z.name} (${z.why})`)).join(' · ')}`],
            columns: 2,
            buttons: [
              { id: 'facilities', label: 'Facilities', sub: 'Move or sell stations', icon: 'race_ui_01', accent: C.progress, onTap: enterBuild },
              { id: 'shop', label: 'Shop', sub: team.money.economy.isBlocked('facility') ? BUILD_TEXT.debt : 'Build a facility', icon: 'race_ui_01', onTap: () => { enterBuild(); open('shop'); } },
            ],
          },
        ];
      }
      if (slot.id === 'staff') {
        menu.subtitle = `${team.roster.length} of ${team.recruitment.staffCap()} people · ${slot.line}`;
        menu.sections = [
          { columns: 1, buttons: [{ id: 'roster', label: 'Roster', sub: 'Everyone on the team', icon: slot.icon, onTap: goRoster }] },
          { columns: 2, buttons: [hireButton(), trainButton()] }, // Milestone 12
          { buttons: team.roster.map((s) => ({ id: `staff_${s.id}`, label: s.name.split(' ')[0], sub: ROLES[s.role].name, icon: s.art, accent: C.progress, onTap: () => goStaff(s.id) })), columns: 3 },
        ];
      }
      if (slot.id === 'money') return moneyMenu({ slot, team, goMainMenu, debug, toast });
      if (slot.id === 'research') return { ...menu, sections: researchSections() }; // Milestone 11
      if (slot.id === 'compete' && goWeekend) {
        // Milestone 7: race weekends (Practice → Setup → Qualifying → Race). Milestone 20: the championship ladder — the
        // season in progress and its next round, the 12 championships, the Pine Ridge practice race, rivals, trophies.
        const cur = team.races.current;
        const last = team.races.last();
        const lastMe = last?.result.rows.find((r) => r.isPlayer);
        const CH = team.championships;
        const season = CH?.current ?? null;
        const next = CH?.nextRound() ?? null;
        if (next) menu.art = TRACKS[next.trackId]?.artKey; // the next round's scenery as the sheet's backdrop
        const champSections = [];
        // Milestone 22: your car — the one in the race / championship, else the newest — as it looks (resolved family,
        // team colour, sponsors)
        const yourCar = team.cars.cars.get(cur?.carNumber ?? season?.carNumber) ?? team.cars.cars.latest();
        if (yourCar && assets) {
          const fam = familyOfCar(yourCar, team);
          const cbs = (yourCar.result.combos ?? []).map((id) => comboById(id)?.name).filter(Boolean);
          champSections.push({ columns: 1, buttons: [{ id: 'yourCar', label: `Your car: ${yourCar.name}`, sub: `${FAMILY_NAMES[fam.id]} (${fam.id})${cbs.length ? ` · ${cbs.join(', ')}` : ''}`, icon: carArtKey(assets, team, yourCar, 'showcase', cur?.sponsors ?? team.sponsors.decals()), accent: C.progress, onTap: () => goCarGarage() }] });
        }
        if (season) {
          const def = champById(season.id);
          const me = CH.standings().find((r) => r.isPlayer);
          const inRound = cur?.champ?.id === season.id;
          champSections.push({
            title: `${def.name} · round ${Math.min(season.round + 1, def.rounds)} of ${def.rounds}`,
            lines: [
              next ? `Next: ${TRACKS[next.trackId].name} · ${next.ready ? 'ready to race' : `in ${next.daysAway} day${next.daysAway === 1 ? '' : 's'}`}` : '',
              me ? `You: P${me.pos} · ${me.points} pts · ${me.wins} win${me.wins === 1 ? '' : 's'}` : 'No points yet: the first round is to come',
            ].filter(Boolean),
            columns: 2,
            buttons: [
              { id: 'champRound', label: inRound ? 'Carry on: this round' : next?.ready ? `Race round ${next.index + 1}` : `Round ${(next?.index ?? 0) + 1}`, sub: next ? `${TRACKS[next.trackId].name}${next.ready ? '' : ` · in ${next.daysAway} days`}` : '', icon: 'race_ui_04', disabled: !inRound && (!next?.ready || !!cur), accent: C.action, onTap: () => goChampRound() },
              { id: 'champStandings', label: 'Standings', sub: 'Drivers and teams', icon: 'race_ui_14', accent: C.progress, onTap: () => open('champStandings') },
            ],
          });
        }
        champSections.push({
          title: 'Championships',
          columns: 2,
          buttons: CH ? CH.list().filter((x) => x.def.type !== 'secret' || !x.locked || CH.debugSecrets).map((x) => ({
            id: `champ_${x.def.id}`,
            label: `${x.def.id} ${x.def.name}`,
            sub: x.state === 'active' ? 'In progress' : x.state === 'won' ? `Champions · ${x.def.rounds} rounds` : x.why ? x.why : `${x.def.rounds} rounds · entry ${fmt(x.fee)} Cr${x.best < 99 ? ` · best P${x.best}` : ''}`,
            icon: TROPHY_ART[x.def.tier],
            locked: x.locked,
            disabled: !!x.why && x.state !== 'active',
            accent: x.state === 'won' ? C.good : C.action,
            onTap: () => enterChamp(x.def.id),
          })) : [],
        });
        champSections.push({
          columns: 2,
          buttons: [
            { id: 'rivals', label: 'Rivals', sub: 'Teams, drivers, logos', icon: 'race_ui_27', accent: C.progress, onTap: () => open('rivals') },
            { id: 'trophies', label: 'Trophies', sub: `${CH?.trophies.count ?? 0} in the cabinet`, icon: 'race_reward_07', accent: C.progress, onTap: () => open('trophies') },
          ],
        });
        menu.sections = [
          ...champSections,
          {
            columns: 1,
            buttons: [
              { id: 'weekend', label: cur ? 'Carry on: race weekend' : 'Practice race', sub: cur ? `${TRACKS[cur.trackId]?.name ?? 'Pine Ridge'} · ${cur.champ ? `${cur.champ.id} round ${cur.champ.round + 1} · ` : ''}${cur.kind !== 'weekend' ? 'test race' : cur.stage === 'race' ? (cur.state ? 'race under way' : 'on the grid') : cur.stage}` : team.races.canRace ? 'Pine Ridge Club Circuit · not a championship round · 12 laps · prize money' : 'Build a car first (Build → Pit Bay)', icon: slot.icon, disabled: !cur && !team.races.canRace, onTap: goWeekend },
              ...(goTestRace && !cur && team.races.canRace ? [{ id: 'testRace', label: 'Test Race (debug)', sub: 'Straight to an 8-lap race, no prize', accent: C.purple, onTap: goTestRace }] : []),
              ...(last ? [{ id: 'lastResult', label: 'Last result', sub: `${lastMe?.status === 'retired' ? 'DNF' : `P${lastMe?.pos}`} at ${TRACKS[last.trackId]?.name ?? 'Pine Ridge'} · ${team.races.history.length} race${team.races.history.length === 1 ? '' : 's'} so far`, accent: C.progress, onTap: () => goRaceResult(team.races.history.length - 1) }] : []),
            ],
          },
          // Milestone 19 (?debug=1): a race weekend on any of the 12 tracks (T12 Zero Ring too), and the 100-lap check
          ...(debugTracks && !cur && team.races.canRace
            ? [{ title: 'Debug: championships', columns: 2, buttons: [{ id: 'dbgRoundDue', label: 'Skip to the next round', sub: 'The calendar jumps to its day', accent: C.purple, onTap: () => debugTracks.roundDue() }, { id: 'dbgSecrets', label: CH?.debugSecrets ? 'C11 / C12 open ✓' : 'Open C11 / C12', sub: 'And Ghostline races (testing only)', accent: C.purple, onTap: () => debugTracks.secrets() }] }, { title: 'Debug: tracks', columns: 2, buttons: [...TRACK_IDS.map((id) => ({ id: `dbgTrack_${id}`, label: `${id} ${TRACKS[id].name}`, sub: `${(geoOf(id).length / 1000).toFixed(1)} km · ${TRACKS[id].turns.length} turns · ${TRACKS[id].profile}${TRACKS[id].hidden ? ' · locked' : ''}`, accent: C.purple, onTap: () => debugTracks.weekend(id) })), { id: 'dbgTrack100', label: '100-lap test: all 12', sub: 'A full field, 100 laps on every track', accent: C.purple, onTap: () => debugTracks.hundred() }] }]
            : []),
        ];
      }
      return menu;
    });
  }
  // Milestone 22: the Parts Archive (the open parts by slot) → the Combo Archive and the Rumour Archive.
  menus.register('partsArchive', () => {
    const ctx = unlockContext(team);
    const found = COMBOS.filter((c) => team.combos.discovered(c.id)).length;
    return {
      title: 'Parts Archive',
      subtitle: 'Every part you can fit, and the combinations you have found',
      art: 'race_ui_03',
      accent: C.progress,
      sections: [
        {
          columns: 2,
          buttons: [
            { id: 'comboArchive', label: 'Combo Archive', sub: `${found} of 20 found · ${Object.keys(team.combos.records.data.clues).length} clues`, icon: 'race_ui_03', accent: C.action, onTap: () => open('comboArchive') },
            { id: 'rumourArchive', label: 'Rumour Archive', sub: `${team.combos.rumours().length} rumours`, icon: 'race_ui_03', accent: C.progress, onTap: () => open('rumourArchive') },
          ],
        },
        ...SLOTS.map((sl) => {
          const all = Object.keys(PARTS).filter((id) => PARTS[id].slot === sl.id && !PARTS[id].secret);
          const open = all.filter((id) => partState(id, ctx).open);
          return { title: `${sl.name} · ${open.length} of ${all.length}`, lines: [open.map((id) => `${id} ${PARTS[id].name}`).join(' · ') || 'None yet'] };
        }),
      ],
    };
  });
  menus.register('comboArchive', () => {
    const rows = team.combos.archive();
    return {
      title: 'Combo Archive',
      subtitle: `${rows.filter((r) => r.discovered).length} of 20 combos found (for every team on this device)`,
      art: 'race_ui_03',
      accent: C.progress,
      sections: rows.map((r) => ({
        title: `${r.id} · ${r.name}`,
        lines: r.discovered
          ? [{ text: `Recipe: ${r.recipe}`, color: C.actionDark }, `Reward: ${r.reward}`, { text: `${r.tier[0].toUpperCase()}${r.tier.slice(1)} combo · found by ${r.when.team}${r.when.car ? ` (${r.when.car})` : ''}`, color: C.textMuted }]
          : [r.clue ? { text: `Clue: ${r.clue}`, color: C.actionDark } : { text: 'Not found yet', color: C.textMuted }],
      })),
    };
  });
  menus.register('rumourArchive', () => {
    const list = [...team.combos.rumours()].reverse();
    return {
      title: 'Rumour Archive',
      subtitle: 'Near-miss clues and the recipes you have found',
      art: 'race_ui_03',
      accent: C.progress,
      sections: [{ lines: list.length ? list.map((x) => ({ text: `${x.kind === 'recipe' ? 'Recipe' : 'Rumour'}: ${x.text}`, color: x.kind === 'recipe' ? C.good : C.text })) : ['Nothing yet. Build cars: a combination that almost works starts a rumour.'] }],
    };
  });

  // Milestone 23: the Inbox
  const INBOX_SHOWN = 60;
  const dateOf = (day) => `Y${Math.floor(day / 336) + 1} M${Math.floor((day % 336) / 28) + 1} D${(day % 28) + 1}`;
  menus.register('inbox', () => {
    const ev = team.events;
    const list = ev.inbox.slice(0, INBOX_SHOWN);
    const status = (e) => {
      if (e.answer) return e.answer.auto ? `Taken for you: ${e.answer.label}` : `You chose: ${e.answer.label}`;
      if (e.kind === 'choice') return 'Waiting for your answer';
      return e.body;
    };
    return {
      title: 'Inbox',
      subtitle: `${ev.unread} unread · ${ev.inbox.length} message${ev.inbox.length === 1 ? '' : 's'}`,
      art: 'race_ui_13',
      accent: C.progress,
      sections: [
        {
          columns: 2,
          buttons: [
            { id: 'inboxRumours', label: 'Rumour Archive', sub: `${team.combos.rumours().length} rumours`, icon: 'race_ui_28', accent: C.progress, onTap: () => open('rumourArchive') },
            { id: 'inboxReadAll', label: 'Mark all read', sub: ev.unread ? `${ev.unread} unread` : 'All read', icon: 'race_ui_13', accent: C.progress, onTap: () => ev.markAllRead() },
          ],
        },
        list.length
          ? { columns: 1, buttons: list.map((e) => ({ id: `inbox_${e.id}`, label: `${e.read ? '' : '● '}${e.title}`, sub: `${dateOf(e.day)} · ${ev.classOf(e.data?.cls).name} · ${status(e)}`, icon: e.art ?? e.icon, accent: e.read ? C.outline : e.level === 'major' ? C.action : C.progress, onTap: () => ev.reopen(e.id) })) }
          : { lines: ['Nothing yet. News, offers, rumours and big moments will arrive here.'] },
        ...(ev.inbox.length > INBOX_SHOWN ? [{ lines: [{ text: `The newest ${INBOX_SHOWN} are shown.`, color: C.textMuted }] }] : []),
      ],
    };
  });

  // Milestone 20: the championship sub-sheets (they replace the Compete sheet; Back returns to it)
  const CH = team.championships;
  if (CH) {
    menus.register('champStandings', () => {
      const def = champById(CH.current?.id ?? CH.history[CH.history.length - 1]?.id);
      const rows = CH.standings();
      return {
        title: def ? `${def.name}${CH.current ? '' : ' (final)'}` : 'Standings',
        subtitle: def ? `${def.rounds} rounds · ${def.tracks.map((t) => TRACKS[t].name).join(' · ')}` : 'Enter a championship first',
        art: 'race_ui_14',
        accent: C.progress,
        sections: [
          { title: 'Drivers', lines: rows.length ? rows.map((r) => ({ text: `${r.pos}. ${r.name}${r.team ? ` (${r.team})` : ''} — ${r.points} pts${r.wins ? ` · ${r.wins} win${r.wins === 1 ? '' : 's'}` : ''}`, color: r.isPlayer ? C.actionDark : undefined })) : ['No rounds raced yet'] },
          { title: 'Teams', lines: CH.teamTable().map((t) => ({ text: `${t.pos}. ${t.team} — ${t.points} pts`, color: t.isPlayer ? C.actionDark : undefined })) },
          { columns: 1, buttons: [{ id: 'backCompete', label: '‹ Compete', accent: C.progress, onTap: () => open('compete') }] },
        ],
      };
    });
    menus.register('rivals', () => ({
      title: 'Rivals',
      subtitle: 'Eight teams (one is a secret); their cars follow each championship’s band, never yours',
      art: 'race_ui_27',
      accent: C.progress,
      sections: [
        ...Object.entries(RIVAL_TEAMS).filter(([, t]) => !t.secret || CH.debugSecrets).map(([id, t]) => ({
          title: t.name,
          lines: [`${t.identity} · ${t.strength} · from ${champById(t.first)?.name ?? t.first}`],
          columns: 1,
          buttons: [{ id: `rival_${id}`, label: t.drivers.map((d) => d.name).join(' · '), sub: t.drivers.map((d) => `${d.name.split(' ')[0]}: Q${d.ratings.qualifying} R${d.ratings.racecraft} W${d.ratings.wet} T${d.ratings.tyreCare} C${d.ratings.consistency} F${d.ratings.feedback}`).join(' · '), icon: t.logo, accent: C.outline, onTap: () => {} }],
        })),
        { columns: 1, buttons: [{ id: 'backCompete', label: '‹ Compete', accent: C.progress, onTap: () => open('compete') }] },
      ],
    }));
    menus.register('trophies', () => {
      const list = CH.trophyList();
      return {
        title: 'Trophy cabinet',
        subtitle: `${list.length} title${list.length === 1 ? '' : 's'} · ${(team.careers?.facts.wins ?? 0)} race wins · ${(team.careers?.facts.podiums ?? 0)} podiums`,
        art: 'race_reward_08',
        accent: C.progress,
        sections: [
          list.length
            ? { columns: 2, buttons: list.map((t) => ({ id: `trophy_${t.id}`, label: t.name, sub: `${CH.tierName(t.tier)} trophy · day ${t.day ?? '—'}`, icon: t.art, accent: C.good, onTap: () => {} })) }
            : { lines: ['No titles yet: win a championship and its trophy goes here (Club, National or World).'] },
          { lines: CH.history.map((h) => `${champById(h.id).name} (year ${h.year}): P${h.pos} · ${h.points} pts${h.title ? ' · champions' : ''}`) },
          { columns: 1, buttons: [{ id: 'backCompete', label: '‹ Compete', accent: C.progress, onTap: () => open('compete') }] },
        ],
      };
    });
  }
  for (const [id, t] of Object.entries(TOP_SHEETS)) {
    menus.register(id, () => ({ title: t.title, subtitle: t.line, accent: C.progress }));
  }
  return menus;
}
