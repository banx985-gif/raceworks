// The race weekend (Milestone 7, bible §22): Practice → Setup → Qualifying → Race, one card each, in order.
//   Practice   Run (Setup Knowledge 0–100 from the Engineer, the driver's feedback and the crew) or Skip (less knowledge)
//   Setup      Aero / Gearing / Suspension (Low · Balanced · High style) with the engineer's hints — they narrow as
//              knowledge grows; Auto Setup picks from what the crew knows; the starting tyre (Soft or Medium; Hard,
//              Inter and Wet are locked). The crew's estimate of the setup score; the real one shows after qualifying.
//   Qualifying one simulated session, fixed by the weekend seed (a reload can't reroll it); it sets the grid and locks
//              the setup
//   Race       Start / Continue — Auto Strategy is on, so the race needs no input
// The scenery picture is only a backdrop; the circuit map beside it is drawn from the track data.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { TRACKS, geoOf } from '../race/tracks.js';
import { drawMinimap } from '../race/trackDraw.js';
import { SETUP_AXES, TYRES, TYRE_ORDER, RACE_ICONS } from '../../data/race.js';
import { raceClock } from './RaceScreen.js';

const C = THEME.color;
const S = THEME.size;

export function createWeekendScreen({ layout, assets, team, topBar, onStartRace, toast = () => {} }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let hits = [];
  const R = team.races;

  function layoutPage(ctx, w) {
    hits = [];
    const wk = R.current;
    if (!wk) return 0;
    const track = TRACKS[wk.trackId];
    const geo = geoOf(wk.trackId);
    const me = wk.entries.find((e) => e.isPlayer);
    let y = 0;
    const btn = (id, r, label, opts, onTap) => {
      if (ctx) drawButton(ctx, r, label, opts);
      hits.push({ id, rect: r, onTap, disabled: opts?.disabled });
    };
    const card = (h, state = 'normal') => {
      if (ctx) drawPanel(ctx, { x: 0, y, w, h }, { fill: state === 'done' ? C.panelGood : state === 'now' ? C.panel : C.panelDim, stroke: state === 'now' ? C.action : C.line, lineWidth: state === 'now' ? 4 : 2, radius: THEME.panel.radius });
    };
    const heading = (icon, label, sub, yy) => {
      if (!ctx) return;
      assets.drawContained(ctx, icon, { x: 24, y: yy + 18, w: 80, h: 80 });
      text(ctx, label, 124, yy + 20, { size: S.heading, bold: true });
      if (sub) text(ctx, sub, 124, yy + 72, { size: S.small, color: C.textMuted, maxWidth: w - 150 });
    };

    // --- header ---
    const headH = 380;
    if (ctx) {
      drawPanel(ctx, { x: 0, y, w, h: headH }, { fill: C.panel, stroke: C.line, radius: THEME.panel.radius });
      assets.drawContained(ctx, track.artKey, { x: 16, y: y + 16, w: w * 0.58, h: headH - 32 });
      drawMinimap(ctx, geo, { x: w * 0.6 + 8, y: y + 16, w: w * 0.4 - 24, h: headH - 32 });
    }
    y += headH + 20;
    if (ctx) text(ctx, `Race weekend · ${track.name}`, 8, y, { size: S.title, bold: true, maxWidth: w - 16 });
    y += 76;
    y += para(ctx, `${(geo.length / 1000).toFixed(2)} km · ${track.turns.length} turns · ${wk.laps} laps · ${me.carName} (Condition ${me.condition}) · driver ${me.name}`, 8, y, w - 16, { size: S.body }) + 24;

    // --- practice ---
    const stage = wk.stage;
    const pr = wk.practice;
    {
      const h = pr ? 200 : 300;
      card(h, pr ? 'done' : 'now');
      heading(RACE_ICONS.practice, 'Practice', pr ? (pr.skipped ? 'Skipped: the crew guessed from the Engineer alone' : 'Done') : 'Laps to learn the car on this circuit (you can skip it)', y);
      if (pr) {
        if (ctx) {
          text(ctx, `Setup Knowledge ${pr.knowledge} / 100`, 24, y + 120, { size: S.body, bold: true, color: C.actionDark });
          bar(ctx, 24 + 440, y + 130, w - 48 - 440, 28, pr.knowledge / 100, C.progress);
        }
      } else {
        const bw = (w - 64) / 2;
        btn('practice', { x: 24, y: y + 150, w: bw, h: 120 }, 'Run practice', {}, () => {
          const r = R.runPractice();
          if (r) toast(`Practice done: Setup Knowledge ${r.knowledge}`);
        });
        btn('skipPractice', { x: 40 + bw, y: y + 150, w: bw, h: 120 }, 'Skip practice', { accent: C.progress }, () => R.skipPractice());
      }
      y += h + 20;
    }

    // --- setup ---
    {
      const open = stage === 'setup';
      const locked = !!wk.quali;
      const rowH = 190;
      const h = 130 + SETUP_AXES.length * rowH + 390;
      if (stage === 'practice') {
        card(130, 'later');
        heading(RACE_ICONS.setup, 'Setup', 'After practice', y);
        y += 150;
      } else {
        card(h, locked ? 'done' : 'now');
        heading(RACE_ICONS.setup, 'Setup', locked ? 'Locked for the race (parc fermé)' : 'Three axes and the starting tyre', y);
        const hints = R.hints();
        let yy = y + 130;
        for (const a of SETUP_AXES) {
          if (ctx) {
            text(ctx, a.name, 24, yy, { size: S.body, bold: true });
            text(ctx, hints[a.id] ? `Engineer: ${hints[a.id]}` : 'Engineer: no idea yet (more practice)', w - 24, yy + 2, { size: S.small, color: C.textMuted, align: 'right' });
          }
          const bw = (w - 48 - 24) / 3;
          a.options.forEach((label, i) => {
            const v = i - 1;
            btn(`${a.id}_${v}`, { x: 24 + i * (bw + 12), y: yy + 52, w: bw, h: 110 }, label, { selected: wk.setup[a.id] === v, disabled: locked }, () => R.setAxis(a.id, v));
          });
          yy += rowH;
        }
        // auto setup + tyre
        btn('autoSetup', { x: 24, y: yy, w: w - 48, h: 110 }, wk.setup.auto ? 'Auto Setup ✓ (from what the crew knows)' : 'Auto Setup', { accent: C.progress, disabled: locked }, () => R.autoSetup());
        yy += 130;
        if (ctx) text(ctx, 'Starting tyre', 24, yy, { size: S.body, bold: true });
        yy += 50;
        const tw = (w - 48 - 4 * 12) / 5;
        TYRE_ORDER.forEach((id, i) => {
          const t = TYRES[id];
          const open = team.research.tyreOpen(id); // Milestone 11: research opens Hard / Inter / Wet
          const r = { x: 24 + i * (tw + 12), y: yy, w: tw, h: 110 };
          btn(`tyre_${id}`, r, t.name.slice(0, 6), { selected: wk.setup.tyre === id, locked: !open, disabled: locked && open }, () => (open ? R.setTyre(id) : toast(`${t.name}: unlocks with ${t.unlock}`)));
        });
        yy += 130;
        const k = R.knowledge();
        const est = locked ? `Setup score ${wk.quali.setupScore} / 100` : `Crew estimate: setup score about ${estimateScore()} (± ${Math.round((100 - k) / 4)})`;
        if (ctx) text(ctx, est, 24, yy, { size: S.body, bold: true, color: C.actionDark, maxWidth: w - 48 });
        y += h + 20;
      }
    }

    // --- qualifying ---
    {
      const q = wk.quali;
      if (stage === 'practice') {
        card(130, 'later');
        heading(RACE_ICONS.qualifying, 'Qualifying', 'After setup', y);
        y += 150;
      } else if (!q) {
        card(280, 'now');
        heading(RACE_ICONS.qualifying, 'Qualifying', 'One session sets the grid (the setup then locks)', y);
        btn('qualify', { x: 24, y: y + 140, w: w - 48, h: 120 }, 'Run qualifying', {}, () => {
          const r = R.runQualifying();
          if (r) toast(`Qualified P${r.rows.find((x) => x.isPlayer).pos}`);
        });
        y += 300;
      } else {
        const h = 130 + q.rows.length * 60 + 20;
        card(h, 'done');
        heading(RACE_ICONS.qualifying, 'Qualifying', `You start P${q.rows.find((r) => r.isPlayer).pos} · pole ${raceClock(q.rows[0].time)}`, y);
        let yy = y + 130;
        for (const r of q.rows) {
          if (ctx) {
            if (r.isPlayer) drawPanel(ctx, { x: 16, y: yy - 4, w: w - 32, h: 56 }, { fill: C.panelGold, stroke: C.gold, lineWidth: 2, radius: 12 });
            text(ctx, `P${r.pos}`, 32, yy + 6, { size: S.small, bold: true });
            text(ctx, r.name, 120, yy + 6, { size: S.small, bold: r.isPlayer, maxWidth: w * 0.45 });
            text(ctx, `${TYRES[r.tyre].name[0]} · ${raceClock(r.time)}`, w - 32, yy + 6, { size: S.small, color: C.textMuted, align: 'right' });
          }
          yy += 60;
        }
        y += h + 20;
      }
    }

    // --- race ---
    {
      const ready = stage === 'race';
      card(ready ? 300 : 130, ready ? 'now' : 'later');
      heading(RACE_ICONS.auto, 'Race', ready ? `${wk.laps} laps · Auto Strategy is on: your crew runs pace and pit stops — just watch, or take over` : 'After qualifying', y);
      if (ready) btn('startRace', { x: 24, y: y + 160, w: w - 48, h: 120 }, wk.state ? 'Continue race' : 'Start race', {}, onStartRace);
      y += (ready ? 300 : 130) + 30;
    }
    return y + 40;
  }

  // The crew's belief: the setup scored against their estimate of the ideal (not the truth).
  const estimateScore = () => R.setupScore(R.current.setup, R.knowledge(), R.estimate());

  function bar(ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = C.track;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * Math.min(1, Math.max(0, frac))), h, h / 2);
    ctx.fill();
  }

  return {
    panel,
    buttonRect(bid) {
      layoutPage(null, panel.getRect().w);
      const h = hits.find((x) => x.id === bid);
      if (!h) return null;
      const r = panel.getRect();
      if (h.rect.y < panel.scrollY || h.rect.y + h.rect.h > panel.scrollY + r.h) {
        panel.scrollY = h.rect.y - 40;
        panel.clamp();
      }
      return { x: r.x + h.rect.x, y: r.y + h.rect.y - panel.scrollY, w: h.rect.w, h: h.rect.h };
    },
    enter() {
      panel.scrollY = 0;
    },
    onDragStart: (p) => panel.beginDrag(p),
    onDrag: (p) => panel.drag(p),
    onDragEnd: (p) => panel.endDrag(p),
    onWheel(p) {
      panel.scrollY += p.deltaY;
      panel.clamp();
    },
    onTap(p) {
      if (topBar.handleTap(p) || !panel.contains(p)) return;
      layoutPage(null, panel.getRect().w);
      const h = hits.find((x) => hitRect(panel.toContent(p), x.rect));
      if (h && !h.disabled) h.onTap();
    },
    render(ctx) {
      const w = panel.getRect().w;
      panel.contentHeight = layoutPage(null, w);
      panel.begin(ctx);
      layoutPage(ctx, w);
      panel.end(ctx);
      topBar.render(ctx);
    },
  };
}
