// The header on the menu screens (Milestone 4b: save slots, New Game setup): a "‹ Back" button and the page title on
// a cream strip, where the garage has its top bar.
//   const header = createMenuHeader({ layout });  header.rect() · header.render(ctx, title, onBack, backLabel, onHelp)
//   header.handleTap(p) → true if the header took it · header.backRect() · header.helpRect()
// Milestone 29: every menu screen has Help too — onHelp (or the header's own default, createMenuHeader({ onHelp })) puts
// a Help button on the right of the strip; it opens that screen's help page.
import { THEME } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, panel } from '../../../../core/ui/Kit.js';

const C = THEME.color;
const S = THEME.size;

export function createMenuHeader({ layout, onHelp: defaultHelp = null }) {
  let onBack = null;
  let onHelp = null;
  const rect = () => {
    const sr = layout.safeRect;
    return { x: sr.x, y: sr.y, w: sr.w, h: 150 };
  };
  const backRect = () => {
    const r = rect();
    return { x: r.x + 24, y: r.y + 20, w: 220, h: 110 };
  };
  const helpRect = () => {
    if (!onHelp) return null;
    const r = rect();
    return { x: r.x + r.w - 24 - 150, y: r.y + 20, w: 150, h: 110 };
  };
  return {
    rect,
    backRect,
    helpRect,
    handleTap(p) {
      if (onBack && hitRect(p, backRect())) {
        onBack();
        return true;
      }
      if (onHelp && hitRect(p, helpRect())) {
        onHelp();
        return true;
      }
      return hitRect(p, rect());
    },
    render(ctx, title, back = null, backLabel = '‹ Back', help = undefined) {
      onBack = back;
      onHelp = help === undefined ? defaultHelp : help;
      const r = rect();
      panel(ctx, { x: r.x - 40, y: r.y - 200, w: r.w + 80, h: r.h + 200 }, { fill: C.panel, stroke: C.outline, lineWidth: 4, radius: 0 });
      if (back) drawButton(ctx, backRect(), backLabel, { accent: C.progress });
      if (onHelp) drawButton(ctx, helpRect(), 'Help', { accent: C.progress });
      const tx = back ? backRect().x + backRect().w + 30 : r.x + 40;
      const right = onHelp ? helpRect().x - 24 : r.x + r.w - 30;
      text(ctx, title, tx, r.y + r.h / 2, { size: S.heading, bold: true, baseline: 'middle', maxWidth: right - tx });
    },
  };
}
