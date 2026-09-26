// Garage sheets. One registry, so every way in — tapping a station or a worker, a bottom-bar button, the Build
// sheet's "Pit Bay" button — opens exactly the same menu. Built again every frame while open, so states stay live.
//   open(kind, target) opens another menu in the same sheet (it replaces the open one; sheets never stack).
//   goRoster() · goStaff(id) open the staff screens (Milestone 3).
import { MenuRegistry } from '../../../../core/ui/BottomSheet.js';
import { THEME } from '../../../../core/Theme.js';
import { STATIONS } from '../../data/garage.js';
import { BOTTOM_SLOTS, TOP_SHEETS } from '../../data/home.js';
import { ROLES, TIERS } from '../../data/staff.js';
import { STATUS_ORDER, STATUS_NAME } from './statusIcons.js';

const C = THEME.color;

// "Driver · Level 1 · Standard · Tired" — shared by the sheet, the roster and the detail screen.
export function staffLine(s) {
  const status = STATUS_ORDER.filter((k) => s.status?.[k]).map((k) => STATUS_NAME[k]);
  return [ROLES[s.role].name, `Level ${s.level}`, TIERS[s.tier].name, ...status].join(' · ');
}

export function createGarageMenus({ garage, team, open, goRoster, goStaff }) {
  const menus = new MenuRegistry();
  for (const def of STATIONS) {
    menus.register(def.id, () => ({ title: def.name, subtitle: def.purpose, art: def.art ?? 'race_ui_02' }));
  }

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
          lines: [{ text: `Now: ${garage().stateText(s.id)}`, color: C.actionDark }, `Energy ${Math.round(s.energy)} · Morale ${Math.round(s.morale)}`],
          columns: 1,
          buttons: [{ id: 'details', label: 'Details', sub: team.isDriver(s) ? 'Driver ratings, stats and traits' : 'Stats and traits', icon: ROLES[s.role].badge, onTap: () => goStaff(s.id) }],
        },
      ],
    };
  });

  // Bottom bar: each slot's sheet. Build also leads to the Pit Bay; Staff to the roster and each person.
  const pitBay = STATIONS.find((s) => s.id === 'F02');
  for (const slot of BOTTOM_SLOTS) {
    menus.register(slot.id, () => {
      const menu = { title: slot.label, subtitle: slot.line, art: slot.icon, sections: [] };
      if (slot.id === 'build') menu.sections = [{ columns: 1, buttons: [{ id: 'pitBay', label: pitBay.name, icon: pitBay.art, onTap: () => open(pitBay.id) }] }];
      if (slot.id === 'staff') {
        menu.subtitle = `${team.roster.length} people · ${slot.line}`;
        menu.sections = [
          { columns: 1, buttons: [{ id: 'roster', label: 'Roster', sub: 'Everyone on the team', icon: slot.icon, onTap: goRoster }] },
          { buttons: team.roster.map((s) => ({ id: `staff_${s.id}`, label: s.name.split(' ')[0], sub: ROLES[s.role].name, icon: s.art, accent: C.progress, onTap: () => goStaff(s.id) })), columns: 3 },
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
