// New Game+ Setup (Milestone 27 stub, bible §7): reached from the ceremony's last card and from a finished run's slot
// card. It only explains what is coming (Milestone 28: carry-overs, Legacy Staff, blueprint memory, challenge modifiers)
// and goes back — it never starts, changes or deletes anything.
//   createNgPlusScreen({ layout, header, team, onBack })   enter({ from: 'ceremony' | 'slots', slot })
import { THEME } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { ENDING_TEXT as T } from '../../data/ending.js';

const C = THEME.color;
const S = THEME.size;

export function createNgPlusScreen({ layout, header, onBack }) {
  let from = 'ceremony';
  let summary = null; // the finished run's slot card (from the slot screen) or null
  const box = () => {
    const hr = header.rect();
    const sr = layout.safeRect;
    const y = hr.y + hr.h + 24;
    return { x: sr.x + 32, y, w: sr.w - 64, h: Math.min(1100, sr.y + sr.h - 40 - y) };
  };
  const backRect = () => {
    const b = box();
    return { x: b.x + 50, y: b.y + b.h - 170, w: b.w - 100, h: 130 };
  };
  const back = () => onBack(from);
  return {
    get from() {
      return from;
    },
    enter(params = {}) {
      from = params.from ?? 'ceremony';
      summary = params.summary ?? null;
    },
    buttonRect: (id) => (id === 'back' ? backRect() : null),
    onTap(p) {
      if (header.handleTap(p)) return;
      if (hitRect(p, backRect())) back();
    },
    render(ctx) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const b = box();
      drawPanel(ctx, b, { fill: C.panel, radius: 32 });
      let y = b.y + 40;
      text(ctx, 'Coming next', b.x + 50, y, { size: S.heading, bold: true, color: C.purple });
      y += 80;
      if (summary) {
        y += para(ctx, `${summary.teamName} · Grade ${summary.grade ?? '—'} · Year ${summary.year}`, b.x + 50, y, b.w - 100, { size: S.body, bold: true }) + 24;
      }
      para(ctx, T.ngBody, b.x + 50, y, b.w - 100, { size: S.body });
      drawButton(ctx, backRect(), T.ngBack, { accent: C.progress });
      header.render(ctx, T.ngTitle, back);
    },
  };
}
