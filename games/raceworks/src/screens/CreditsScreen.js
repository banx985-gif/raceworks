// Credits / Legal (Milestone 29, bible §7 Main Menu; style guide §7b): the Banx Gamex studio logo (cut-out) at the top,
// then the names rolling up (core/CreditsRoll, data/screens.js CREDITS_TEXT), and Privacy & legal. Holding a finger on the
// roll speeds it up; it starts again from the top when it ends. "‹ Back" (and the phone's Back) return to where it was
// opened from.
//   createCreditsScreen({ layout, assets, header, onBack, onLegal, onHelp })   enter({ from }) · buttonRect(id)
import { THEME } from '../../../../core/Theme.js';
import { CreditsRoll } from '../../../../core/ui/CreditsRoll.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { CREDITS_TEXT as T } from '../../data/screens.js';

const C = THEME.color;
export const STUDIO_LOGO = 'studio_logo_cutout';

export function createCreditsScreen({ layout, assets, header, onBack, onLegal, onHelp = null }) {
  const roll = new CreditsRoll({ blocks: T.blocks, speed: 110 });
  let holding = false;
  let from = 'menu';
  const sr = () => layout.safeRect;
  const logoRect = () => ({ x: sr().x + 80, y: sr().y + 180, w: sr().w - 160, h: Math.min(320, sr().h * 0.17) });
  const legalRect = () => ({ x: sr().x + 60, y: sr().y + sr().h - 150, w: sr().w - 120, h: 116 });
  const rollRect = () => {
    const top = logoRect().y + logoRect().h + 30;
    return { x: sr().x + 40, y: top, w: sr().w - 80, h: legalRect().y - 30 - top };
  };
  return {
    get from() {
      return from;
    },
    roll,
    buttonRect: (id) => (id === 'legal' ? legalRect() : id === 'back' ? header.backRect() : id === 'help' ? header.helpRect?.() : null),
    enter(params = {}) {
      from = params.from ?? 'menu';
      roll.restart();
      assets.ensure?.([STUDIO_LOGO]);
    },
    update(dt) {
      roll.update(dt, { fast: holding, viewHeight: rollRect().h });
      if (roll.done) roll.restart();
    },
    onDown(p) {
      holding = hitRect(p, rollRect());
    },
    onUp() {
      holding = false;
    },
    onTap(p) {
      if (header.handleTap(p)) return;
      if (hitRect(p, legalRect())) onLegal();
    },
    render(ctx) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, layout.renderer?.width ?? 1080, layout.renderer?.height ?? 2640);
      header.render(ctx, T.title, () => onBack(), '‹ Back', onHelp);
      assets.drawContained(ctx, STUDIO_LOGO, logoRect());
      roll.render(ctx, assets, rollRect());
      drawButton(ctx, legalRect(), T.legal, { accent: C.progress });
    },
  };
}
