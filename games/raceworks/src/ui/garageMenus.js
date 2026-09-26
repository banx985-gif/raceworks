// Garage sheets (Milestones 1–2, placeholders: header plus at most a line or a button). One registry, so every way
// in — tapping a station, a bottom-bar button, the Build sheet's "Pit Bay" button — opens exactly the same menu.
// Built again every frame while open, so Tessa's state stays live.
//   open(kind) opens another menu in the same sheet (it replaces the open one; sheets never stack).
import { MenuRegistry } from '../../../../core/ui/BottomSheet.js';
import { THEME } from '../../../../core/Theme.js';
import { STATIONS, WORKER, WORKER_STATE_TEXT } from '../../data/garage.js';
import { BOTTOM_SLOTS, TOP_SHEETS } from '../../data/home.js';

const C = THEME.color;

export function createGarageMenus({ garage, open }) {
  const menus = new MenuRegistry();
  for (const def of STATIONS) {
    menus.register(def.id, () => ({ title: def.name, subtitle: def.purpose, art: def.art }));
  }
  menus.register('worker', () => ({
    title: WORKER.name,
    subtitle: WORKER.blurb,
    art: WORKER.art,
    accent: C.progress,
    sections: [{ lines: [{ text: `Now: ${WORKER_STATE_TEXT[garage().worker.phase]}`, color: C.actionDark }] }],
  }));

  // Bottom bar: each slot's placeholder. Build also leads to the Pit Bay (the Maker station).
  const pitBay = STATIONS.find((s) => s.id === 'F02');
  for (const slot of BOTTOM_SLOTS) {
    menus.register(slot.id, () => ({
      title: slot.label,
      subtitle: slot.line,
      art: slot.icon,
      sections: slot.id === 'build' ? [{ columns: 1, buttons: [{ id: 'pitBay', label: pitBay.name, icon: pitBay.art, onTap: () => open(pitBay.id) }] }] : [],
    }));
  }
  for (const [id, t] of Object.entries(TOP_SHEETS)) {
    menus.register(id, () => ({ title: t.title, subtitle: t.line, accent: C.progress }));
  }
  return menus;
}
