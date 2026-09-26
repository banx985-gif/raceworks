// Milestone 0 routing check: a second screen reached from the test sheet. Its Back button (or the phone's Back,
// or Esc) returns to the home screen.
import { THEME, font } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';

const C = THEME.color;
const S = THEME.size;

export function createRouteTestScreen({ renderer, layout, onBack }) {
  const W = renderer.width;
  return {
    backButton() {
      return layout.anchor('bottom', 640, THEME.button.minH + 20, 60);
    },

    onTap(p) {
      if (hitRect(p, this.backButton())) onBack();
    },

    render(ctx) {
      const sr = layout.safeRect;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text;
      ctx.font = font(S.major, true);
      ctx.fillText('Second screen', W / 2, sr.y + sr.h * 0.4);
      ctx.fillStyle = C.textMuted;
      ctx.font = font(S.body);
      ctx.fillText('Routing works. Back returns to the test screen.', W / 2, sr.y + sr.h * 0.4 + 90, W - 80);
      drawButton(ctx, this.backButton(), 'Back', { accent: C.progress });
    },
  };
}
