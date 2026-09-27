// Main menu (Milestone 4b, bible §7): Continue (the latest slot), New Game, Load, Help. The RACEWORKS title is drawn in
// code text for now (the title logo is due a redraw). New Game+, Records, Settings and Credits arrive with their
// milestones. Milestone 8: the picture is Aaron's art, never a car drawn in code — the key art (race_brand_02) in a
// frame, and in front of it the latest team's Club Hatch (car_v01_showcase) in its team colour (src/ui/livery.js).
//   createMainMenuScreen({ renderer, layout, assets, slots: () => slot list, onContinue, onNew, onLoad, onHelp })
import { THEME } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text } from '../../../../core/ui/Kit.js';
import { TEAM_COLOURS } from '../../data/setup.js';
import { drawTeamBadge, initialsOf } from '../ui/setupArt.js';
import { liveryKey } from '../ui/livery.js';
import { CLASSES } from '../../data/cars.js';

const KEY_ART = 'race_brand_02';
const MENU_CAR = CLASSES.clubHatch.art;

const C = THEME.color;
const S = THEME.size;

export function createMainMenuScreen({ renderer, layout, assets, slots, onContinue, onNew, onLoad, onHelp }) {
  let t = 0;
  const latest = () => {
    const list = slots() ?? [];
    return list.filter((s) => !s.empty && !s.error).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0] ?? null;
  };

  function buttons() {
    const sr = layout.safeRect;
    const w = Math.min(sr.w - 120, 760);
    const x = sr.x + (sr.w - w) / 2;
    const h = 150;
    const gap = 30;
    const total = 4 * h + 3 * gap;
    const y0 = sr.y + sr.h - total - Math.max(80, sr.h * 0.07);
    const last = latest();
    return [
      { id: 'continue', label: 'Continue', sub: last ? `${last.summary.teamName} · Year ${last.summary.year} · Month ${last.summary.month}` : 'No saved team yet', disabled: !last, onTap: () => last && onContinue(last.n) },
      { id: 'new', label: 'New Game', onTap: onNew },
      { id: 'load', label: 'Load', sub: `${(slots() ?? []).filter((s) => !s.empty).length} of ${(slots() ?? []).length || 4} slots used`, accent: C.progress, onTap: onLoad },
      { id: 'help', label: 'Help', accent: C.progress, onTap: onHelp },
    ].map((b, i) => ({ ...b, r: { x, y: y0 + i * (h + gap), w, h } }));
  }

  return {
    buttonRect: (id) => buttons().find((b) => b.id === id)?.r ?? null,
    enter() {
      t = 0;
    },
    update(dt) {
      t += dt;
    },
    onTap(p) {
      const b = buttons().find((x) => hitRect(p, x.r));
      if (b && !b.disabled) b.onTap();
    },
    render(ctx) {
      const W = renderer.width;
      const H = renderer.height;
      const sr = layout.safeRect;
      // Background: a warm floor with a chequered racing band.
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      const bandY = sr.y + sr.h * 0.1;
      const sq = 36;
      for (let i = 0; i * sq < W; i++) for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#FFFFFF' : C.outline;
        ctx.fillRect(i * sq, bandY + j * sq, sq, sq);
      }
      // Title in code text.
      const cx = W / 2;
      const titleY = bandY + 2 * sq + 70;
      ctx.save();
      ctx.font = `bold ${Math.round(Math.min(150, sr.w * 0.14))}px ${THEME.family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 18;
      ctx.strokeStyle = C.outline;
      ctx.strokeText('RACEWORKS', cx, titleY, sr.w - 80);
      ctx.fillStyle = C.action;
      ctx.fillText('RACEWORKS', cx, titleY, sr.w - 80);
      ctx.restore();
      text(ctx, 'Build the cars. Run the team. Win the title.', cx, titleY + 170, { size: S.body, bold: true, color: C.textMuted, align: 'center', maxWidth: sr.w - 80 });
      // Aaron's key art in a frame, and the latest team's car (Racing Red with no team yet) gently bobbing in front.
      const last = latest();
      const colour = TEAM_COLOURS.find((c) => c.id === last?.summary.colour) ?? TEAM_COLOURS[0];
      const top = titleY + 230;
      const room = buttons()[0].r.y - 30 - top;
      if (room > 220) {
        const carW = Math.min(sr.w - 140, 700, room * 1.25);
        const carH = carW / assets.aspect(MENU_CAR);
        const artH = Math.min(760, room - carH * 0.55);
        const artW = Math.min(sr.w - 160, artH * assets.aspect(KEY_ART));
        const frame = { x: cx - artW / 2, y: top, w: artW, h: artW / assets.aspect(KEY_ART) };
        if (frame.h > 120) {
          ctx.save();
          ctx.fillStyle = C.shade;
          ctx.beginPath();
          ctx.roundRect(frame.x + 10, frame.y + 14, frame.w, frame.h, 36);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(frame.x, frame.y, frame.w, frame.h, 36);
          ctx.clip();
          assets.draw(ctx, KEY_ART, frame.x, frame.y, frame.w, frame.h);
          ctx.restore();
          ctx.save();
          ctx.lineWidth = 8;
          ctx.strokeStyle = C.outline;
          ctx.beginPath();
          ctx.roundRect(frame.x, frame.y, frame.w, frame.h, 36);
          ctx.stroke();
          ctx.restore();
        }
        const carY = Math.min(frame.y + frame.h - carH * 0.45, top + room - carH) + Math.sin(t * 2) * 6;
        assets.draw(ctx, liveryKey(assets, MENU_CAR, colour.id), cx - carW / 2, carY, carW, carH);
        if (last) drawTeamBadge(ctx, { x: cx + carW / 2 - 90, y: carY - 30, w: 110, h: 130 }, colour, initialsOf(last.summary.teamName));
      }
      for (const b of buttons()) {
        drawButton(ctx, b.r, b.sub ? '' : b.label, { accent: b.accent, disabled: b.disabled });
        if (b.sub) {
          const col = b.disabled ? C.textFaint : C.textOnAction;
          text(ctx, b.label, b.r.x + b.r.w / 2, b.r.y + 22, { size: S.button, bold: true, color: col, align: 'center', maxWidth: b.r.w - 40 });
          text(ctx, b.sub, b.r.x + b.r.w / 2, b.r.y + 78, { size: S.small, bold: true, color: col, align: 'center', maxWidth: b.r.w - 40 });
        }
      }
    },
  };
}
