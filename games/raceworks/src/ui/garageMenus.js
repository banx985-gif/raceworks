// Garage sheets. One registry, so every way in — tapping a station or a worker, a bottom-bar button, the Build
// sheet's "Pit Bay" button — opens exactly the same menu. Built again every frame while open, so states stay live.
//   open(kind, target) opens another menu in the same sheet (it replaces the open one; sheets never stack).
//   goRoster() · goStaff(id) open the staff screens (Milestone 3).
//   goBuilder() · goCarGarage() open the car screens (Milestone 4). debug: extra buttons with ?debug=1.
//   goMainMenu() saves and returns to the main menu (Milestone 4b: from the Money sheet, "saving" lives there).
// Milestone 5: the Money sheet (src/ui/moneyMenu.js), the Pit Bay's Emergency Fix and running cost. toast(text) says
//   why something was refused.
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

const C = THEME.color;

// "Driver · Level 1 · Standard · Tired" — shared by the sheet, the roster and the detail screen.
export function staffLine(s) {
  const status = STATUS_ORDER.filter((k) => s.status?.[k]).map((k) => STATUS_NAME[k]);
  return [ROLES[s.role].name, `Level ${s.level}`, TIERS[s.tier].name, ...status].join(' · ');
}

export function createGarageMenus({ garage, team, open, goRoster, goStaff, goBuilder, goCarGarage, goMainMenu = null, debug = null, toast = () => {}, goTestRace = null, goRaceResult = null }) {
  const menus = new MenuRegistry();
  for (const def of STATIONS) {
    if (def.id === 'F02') continue; // the Pit Bay's sheet is the car project's (below)
    menus.register(def.id, () => ({ title: def.name, subtitle: def.purpose, art: def.art ?? 'race_ui_02' }));
  }

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
          { columns: 1, buttons: [{ id: 'newCar', label: 'New car', sub: can.ok ? 'Start a Club Hatch project' : can.reason, icon: CLASSES.clubHatch.art, onTap: goBuilder }] },
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
          buttons: [{ id: 'details', label: 'Details', sub: team.isDriver(s) ? 'Driver ratings, stats and traits' : 'Stats and traits', icon: ROLES[s.role].badge, onTap: () => goStaff(s.id) }],
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
        menu.sections = [
          { columns: 1, buttons: [{ id: 'pitBay', label: pitBay.name, sub: job ? `${job.name}: ${team.cars.phase(job).name}` : 'New car', icon: pitBay.art, onTap: () => open(pitBay.id) }] },
          { columns: 1, buttons: [garageButton()] },
        ];
      }
      if (slot.id === 'staff') {
        menu.subtitle = `${team.roster.length} people · ${slot.line}`;
        menu.sections = [
          { columns: 1, buttons: [{ id: 'roster', label: 'Roster', sub: 'Everyone on the team', icon: slot.icon, onTap: goRoster }] },
          { buttons: team.roster.map((s) => ({ id: `staff_${s.id}`, label: s.name.split(' ')[0], sub: ROLES[s.role].name, icon: s.art, accent: C.progress, onTap: () => goStaff(s.id) })), columns: 3 },
        ];
      }
      if (slot.id === 'money') return moneyMenu({ slot, team, goMainMenu, debug, toast });
      if (slot.id === 'compete' && goTestRace) {
        // Milestone 6: a temporary Test Race (race weekends arrive in Milestone 7, championships in Milestone 20).
        const cur = team.races.current;
        const last = team.races.last();
        const lastMe = last?.result.rows.find((r) => r.isPlayer);
        menu.sections = [
          {
            columns: 1,
            buttons: [
              { id: 'testRace', label: cur ? 'Carry on racing' : 'Test Race', sub: cur ? `Pine Ridge · ${cur.status === 'ready' ? 'on the grid' : 'race under way'}` : team.races.canRace ? 'Pine Ridge Club Circuit · 8 laps · your newest car' : 'Build a car first (Build → Pit Bay)', icon: slot.icon, disabled: !cur && !team.races.canRace, onTap: goTestRace },
              ...(last ? [{ id: 'lastResult', label: 'Last result', sub: `${lastMe?.status === 'retired' ? 'DNF' : `P${lastMe?.pos}`} at Pine Ridge · ${team.races.history.length} race${team.races.history.length === 1 ? '' : 's'} so far`, accent: C.progress, onTap: () => goRaceResult(team.races.history.length - 1) }] : []),
            ],
          },
        ];
      }
      return menu;
    });
  }
  for (const [id, t] of Object.entries(TOP_SHEETS)) {
    menus.register(id, () => ({ title: t.title, subtitle: t.line, accent: C.progress }));
  }
  return menus;
}
