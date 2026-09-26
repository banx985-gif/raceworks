// Garage sheets (Milestone 1: header only). One registry, so a station tapped in the garage and its bottom-bar
// shortcut open exactly the same menu. Built again every frame while open, so Tessa's state stays live.
import { MenuRegistry } from '../../../../core/ui/BottomSheet.js';
import { THEME } from '../../../../core/Theme.js';
import { STATIONS, WORKER, WORKER_STATE_TEXT } from '../../data/garage.js';

export function createGarageMenus({ garage }) {
  const menus = new MenuRegistry();
  for (const def of STATIONS) {
    menus.register(def.id, () => ({ title: def.name, subtitle: def.purpose, art: def.art }));
  }
  menus.register('worker', () => ({
    title: WORKER.name,
    subtitle: WORKER.blurb,
    art: WORKER.art,
    accent: THEME.color.progress,
    sections: [{ lines: [{ text: `Now: ${WORKER_STATE_TEXT[garage().worker.phase]}`, color: THEME.color.actionDark }] }],
  }));
  return menus;
}
