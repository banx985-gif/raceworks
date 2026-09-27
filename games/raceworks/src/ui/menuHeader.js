// The header on the menu screens (Milestone 4b: save slots, New Game setup): a "‹ Back" button and the page title on
// a cream strip, where the garage has its top bar.
//   const header = createMenuHeader({ layout });  header.rect() · header.render(ctx, title, onBack, backLabel)
//   header.handleTap(p) → true if the back button took it · header.backRect()
import { THEME } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, panel } from '../../../../core/ui/Kit.js';

const C = THEME.color;
const S = THEME.size;

export function createMenuHeader({ layout }) {
  let onBack = null;
  const rect = () => {
    const sr = layout.safeRect;
    return { x: sr.x, y: sr.y, w: sr.w, h: 150 };
  };
  const backRect = () => {
    const r = rect();
    return { x: r.x + 24, y: r.y + 20, w: 220, h: 110 };
  };
  return {
    rect,
    backRect,
    handleTap(p) {
      if (onBack && hitRect(p, backRect())) {
        onBack();
        return true;
      }
      return hitRect(p, rect());
    },
    render(ctx, title, back = null, backLabel = '‹ Back') {
      onBack = back;
      const r = rect();
      panel(ctx, { x: r.x - 40, y: r.y - 200, w: r.w + 80, h: r.h + 200 }, { fill: C.panel, stroke: C.outline, lineWidth: 4, radius: 0 });
      if (back) drawButton(ctx, backRect(), backLabel, { accent: C.progress });
      const tx = back ? backRect().x + backRect().w + 30 : r.x + 40;
      text(ctx, title, tx, r.y + r.h / 2, { size: S.heading, bold: true, baseline: 'middle', maxWidth: r.x + r.w - 30 - tx });
    },
  };
}
