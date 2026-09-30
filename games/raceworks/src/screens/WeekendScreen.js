// The race weekend (Milestone 7, bible §22; completed in Milestone 15): Practice → Setup → Qualifying → Race, one card
// each, in order.
//   Practice   up to 3 runs (Setup Knowledge 0–100 from the Engineer, the driver's Technical Feedback, the crew, the
//              telemetry facilities and time spent — each run adds less), or Skip (less knowledge). The bar fills per run.
//   Setup      Aero / Gearing / Suspension (Low · Balanced · High style), each with the engineer's hint band — the whole
//              range at 0 knowledge, exact at 100 — and Auto Setup (lands inside the bands); the setup score (the crew's
//              estimate) updates live; the starting tyre (every compound research has opened), the fuel / energy target
//              and, when the car's Condition is under 100, the repair priority — each with a one-line "what this costs"
//   Qualifying one simulated session, fixed by the weekend seed (a reload can't reroll it), or the optional Drive lap
//              (one lap of the circuit yourself, a bounded bonus / penalty). Either locks the setup and sets the grid; the
//              grid shows every car's setup score.
//   Race       Start / Continue — Auto Strategy is on, so the race needs no input
// The scenery picture is only a backdrop; the circuit map beside it is drawn from the track data.
import { THEME } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, panel as drawPanel } from '../../../../core/ui/Kit.js';
import { TRACKS, geoOf } from '../race/tracks.js';
import { drawMinimap } from '../race/trackDraw.js';
import { SETUP_AXES, TYRES, FUEL, FUEL_ORDER, REPAIR, REPAIR_ORDER, RACE_ICONS, WEEKEND, DRIVE_LAP } from '../../data/race.js';
import { raceClock } from './RaceScreen.js';

const C = THEME.color;
const S = THEME.size;
const FILL_SECS = 0.7; // the knowledge bar fills over this long after a run
const AXIS_H = 214;
const CHOICE_H = 226; // a label, a row of buttons and its cost line

export function createWeekendScreen({ layout, assets, team, topBar, onStartRace, onDriveLap = () => {}, toast = () => {} }) {
  const panel = new ScrollPanel({
    getRect: () => {
      const t = topBar.rect();
      const sr = layout.safeRect;
      const y = t.y + t.h + 20;
      return { x: sr.x + 24, y, w: sr.w - 48, h: sr.y + sr.h - 24 - y };
    },
  });
  let hits = [];
  let fill = null; // { from, to, t } the knowledge bar filling after a practice run
  const R = team.races;

  function practiceRun(skip) {
    const before = R.knowledge();
    const r = skip ? R.skipPractice() : R.runPractice();
    if (!r) return;
    fill = { from: before, to: r.knowledge, t: 0 };
    if (!skip) toast(`Practice run ${r.runs}: Setup Knowledge ${r.knowledge}`, r.runs < WEEKEND.practice.maxRuns ? 'Another run teaches the crew a little more' : 'That was the last run');
  }

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
    // a small label with its icon, for the tyre / fuel / repair rows
    const label = (icon, words, yy) => {
      if (!ctx) return;
      assets.drawContained(ctx, icon, { x: 24, y: yy - 4, w: 44, h: 44 });
      text(ctx, words, 80, yy, { size: S.body, bold: true, maxWidth: w - 104 });
    };
    const note = (words, yy, color = C.textMuted) => ctx && text(ctx, words, 24, yy, { size: S.small, color, maxWidth: w - 48 });

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

    // --- Milestone 17: the forecast (the weekend's weather, as the crew sees it) ---
    {
      const fc = wk.forecast ?? { accuracy: 0 };
      const h = 250;
      card(h, 'normal');
      heading(RACE_ICONS.weather, 'Forecast', `Crew accuracy ${Math.round(fc.accuracy)}% · Strategist, Strategy Desk / Room, Weather Station`, y);
      if (ctx) text(ctx, R.forecastLine(), 24, y + 140, { size: S.body, bold: true, color: R.weather() === 'dry' ? C.actionDark : C.progress, maxWidth: w - 48 });
      note('Qualifying runs in the start’s weather; the race follows the real weather (the forecast can be wrong)', y + 196);
      y += h + 20;
    }

    // --- practice ---
    const stage = wk.stage;
    const pr = wk.practice;
    const maxRuns = WEEKEND.practice.maxRuns;
    {
      const more = !!pr && !pr.skipped && R.canPractice();
      const h = pr ? 240 + (more ? 140 : 0) : 300;
      card(h, pr ? (more ? 'now' : 'done') : 'now');
      const sub = pr ? (pr.skipped ? 'Skipped: the crew guessed from the Engineer alone' : `${pr.runs} of ${maxRuns} runs · each run teaches the crew a little less than the one before`) : `Up to ${maxRuns} runs to learn the car on this circuit (you can skip it)`;
      heading(RACE_ICONS.practice, 'Practice', sub, y);
      if (pr) {
        const shown = fill ? Math.round(fill.from + (fill.to - fill.from) * Math.min(1, fill.t / FILL_SECS)) : pr.knowledge;
        if (ctx) {
          text(ctx, `Setup Knowledge ${shown} / 100`, 24, y + 120, { size: S.body, bold: true, color: C.actionDark });
          bar(ctx, 24 + 440, y + 130, w - 48 - 440, 28, shown / 100, C.progress);
        }
        const src = R.knowledgeSources();
        const parts = [`Staff ${Math.round(src.staff)}`];
        if (src.facilities) parts.push(`facilities +${src.facilities}`);
        if (src.technical) parts.push(`Wind Tunnel +${src.technical}`);
        if (src.traits) parts.push(`crew traits ${src.traits > 0 ? '+' : ''}${src.traits}`);
        if (pr.log?.length > 1) parts.push(`runs ${pr.log.join(' → ')}`);
        note(parts.join(' · '), y + 180);
        if (more) btn('practice', { x: 24, y: y + 240, w: w - 48, h: 120 }, `Run practice (${pr.runs + 1} of ${maxRuns})`, {}, () => practiceRun(false));
      } else {
        const bw = (w - 64) / 2;
        btn('practice', { x: 24, y: y + 150, w: bw, h: 120 }, `Run practice (1 of ${maxRuns})`, {}, () => practiceRun(false));
        btn('skipPractice', { x: 40 + bw, y: y + 150, w: bw, h: 120 }, 'Skip practice', { accent: C.progress }, () => practiceRun(true));
      }
      y += h + 20;
    }

    // --- setup ---
    {
      const locked = !R.setupOpen;
      const repairRows = R.needsRepair() || (wk.repair && wk.repair.from < 100);
      const h = 130 + SETUP_AXES.length * AXIS_H + 130 + 90 + CHOICE_H * 2 + (repairRows ? CHOICE_H : 80) + 10;
      if (stage === 'practice') {
        card(130, 'later');
        heading(RACE_ICONS.setup, 'Setup', 'After practice', y);
        y += 150;
      } else {
        card(h, locked ? 'done' : 'now');
        heading(RACE_ICONS.setup, 'Setup', locked ? 'Locked for the race (parc fermé)' : 'Three axes, the starting tyre, fuel and repairs', y);
        const hints = R.hints();
        const bands = R.hintBands();
        let yy = y + 130;
        const bw = (w - 48 - 24) / 3;
        for (const a of SETUP_AXES) {
          if (ctx) {
            text(ctx, a.name, 24, yy, { size: S.body, bold: true });
            text(ctx, hints[a.id] ? `Engineer: ${hints[a.id]}` : 'Engineer: no idea yet (more practice)', w - 24, yy + 2, { size: S.small, color: C.textMuted, align: 'right' });
            // the hint band on the −1…+1 scale, drawn from the first option's centre to the last's
            const x0 = 24 + bw / 2;
            const span = 2 * (bw + 12);
            const X = (v) => x0 + ((v + 1) / 2) * span;
            ctx.fillStyle = C.track;
            ctx.beginPath();
            ctx.roundRect(x0 - 12, yy + 56, span + 24, 20, 10);
            ctx.fill();
            const b = bands[a.id];
            const bx = X(b.lo) - 12;
            ctx.fillStyle = C.progress;
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            ctx.roundRect(bx, yy + 52, Math.max(24, X(b.hi) - X(b.lo) + 24), 28, 14);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          a.options.forEach((lab, i) => {
            const v = i - 1;
            btn(`${a.id}_${v}`, { x: 24 + i * (bw + 12), y: yy + 92, w: bw, h: 110 }, lab, { selected: wk.setup[a.id] === v, disabled: locked }, () => R.setAxis(a.id, v));
          });
          yy += AXIS_H;
        }
        btn('autoSetup', { x: 24, y: yy, w: w - 48, h: 110 }, wk.setup.auto ? 'Auto Setup ✓ (inside the engineer’s bands)' : 'Auto Setup', { accent: C.progress, disabled: locked }, () => R.autoSetup());
        yy += 130;
        // the setup score, live (the crew's estimate until qualifying shows the real one)
        {
          const k = R.knowledge();
          const score = wk.quali ? wk.quali.setupScore : estimateScore();
          const words = wk.quali ? `Setup score ${score} / 100` : `Setup score ≈ ${score} / 100 (crew estimate ± ${Math.round((100 - k) / 4)})`;
          if (ctx) {
            text(ctx, words, 24, yy, { size: S.body, bold: true, color: C.actionDark, maxWidth: w * 0.62 });
            bar(ctx, w * 0.66, yy + 10, w * 0.34 - 24, 28, score / 100, C.good);
          }
          yy += 90;
        }
        // starting tyre
        label(RACE_ICONS.tyres, 'Starting tyre', yy);
        const tw = (w - 48 - 4 * 12) / 5;
        R.tyreOptions().forEach(({ id, open }, i) => {
          const t = TYRES[id];
          btn(`tyre_${id}`, { x: 24 + i * (tw + 12), y: yy + 50, w: tw, h: 110 }, t.name.slice(0, 6), { selected: wk.setup.tyre === id, locked: !open, disabled: locked && open }, () => (open ? R.setTyre(id) : toast(`${t.name}: unlocks with ${t.unlock}`)));
        });
        note(R.costLine('tyre'), yy + 176);
        yy += CHOICE_H;
        // fuel / energy target
        label(RACE_ICONS.fuel, `${R.energyWord} target`, yy);
        const fw = (w - 48 - 24) / 3;
        FUEL_ORDER.forEach((id, i) => {
          btn(`fuel_${id}`, { x: 24 + i * (fw + 12), y: yy + 50, w: fw, h: 110 }, FUEL[id].name, { selected: wk.setup.fuel === id, disabled: locked }, () => R.setFuel(id));
        });
        note(R.costLine('fuel'), yy + 176);
        yy += CHOICE_H;
        // repair priority (only when there is damage to repair)
        if (repairRows) {
          label(RACE_ICONS.condition, `Repair priority · Condition ${wk.repair ? wk.repair.from : R.repairQuote().condition}`, yy);
          REPAIR_ORDER.forEach((id, i) => {
            const q = R.repairQuote(id);
            const lab = id === 'skip' ? 'Skip' : `${REPAIR[id].name} ${q.cost.toLocaleString('en-US')}`;
            btn(`repair_${id}`, { x: 24 + i * (fw + 12), y: yy + 50, w: fw, h: 110 }, lab, { selected: wk.setup.repair === id, disabled: locked || !q.affordable }, () => R.setRepair(id));
          });
          const done = wk.repair;
          const words = done ? (done.cost ? `Repaired (${REPAIR[done.choice].name}): Condition ${done.from} → ${done.to} · ${done.cost.toLocaleString('en-US')} Cr` : `Racing at Condition ${done.to}: failure risk ×${REPAIR.skipFailureX}`) : R.costLine('repair');
          note(words, yy + 176, done?.unrepaired ? C.bad : C.textMuted);
          yy += CHOICE_H;
        } else {
          label(RACE_ICONS.condition, 'Condition 100: nothing to repair', yy);
        }
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
        const lap = wk.driveLap;
        const h = lap ? 320 : 420;
        card(h, 'now');
        heading(RACE_ICONS.qualifying, 'Qualifying', 'One session sets the grid (the setup then locks)', y);
        if (lap) {
          note(lap.status === 'running' ? 'Your Drive lap is under way' : 'The Drive lap was left unfinished: qualifying is simulated', y + 140, C.bad);
          btn('qualify', { x: 24, y: y + 190, w: w - 48, h: 120 }, 'Run qualifying', { disabled: lap.status === 'running' }, runQuali);
        } else {
          para(ctx, 'Optional: drive one lap yourself — a good lap gains time, a slow one loses it (a little either way)', 24, y + 130, w - 48 - 140, { size: S.small, color: C.textMuted });
          const bw = (w - 64) / 2;
          btn('qualify', { x: 24, y: y + 270, w: bw, h: 120 }, 'Run qualifying', {}, runQuali);
          btn('driveLap', { x: 40 + bw, y: y + 270, w: bw, h: 120 }, 'Drive lap', { accent: C.purple, disabled: !R.canDriveLap }, () => onDriveLap());
          if (ctx) assets.drawContained(ctx, RACE_ICONS.drive, { x: w - 24 - 110, y: y + 150, w: 110, h: 110 });
        }
        y += h + 20;
      } else {
        const drive = q.drive;
        const h = 130 + (drive || wk.driveLap?.status === 'handedBack' ? 60 : 0) + q.rows.length * 60 + 20;
        card(h, 'done');
        heading(RACE_ICONS.qualifying, 'Qualifying', `You start P${q.rows.find((r) => r.isPlayer).pos} · pole ${raceClock(q.rows[0].time)}`, y);
        let yy = y + 130;
        if (drive) {
          const d = drive.delta;
          note(`Drive lap ${drive.time.toFixed(2)} s (the crew’s lap ${(drive.par * DRIVE_LAP.parSlack).toFixed(2)} s): ${d < 0 ? '−' : d > 0 ? '+' : '±'}${Math.abs(d).toFixed(2)} s (at most ±${drive.cap.toFixed(2)})`, yy, d <= 0 ? C.good : C.bad);
          yy += 60;
        } else if (wk.driveLap?.status === 'handedBack') {
          note('Drive lap handed back: qualifying was simulated', yy);
          yy += 60;
        }
        for (const r of q.rows) {
          if (ctx) {
            if (r.isPlayer) drawPanel(ctx, { x: 16, y: yy - 4, w: w - 32, h: 56 }, { fill: C.panelGold, stroke: C.gold, lineWidth: 2, radius: 12 });
            text(ctx, `P${r.pos}`, 32, yy + 6, { size: S.small, bold: true });
            text(ctx, r.name, 120, yy + 6, { size: S.small, bold: r.isPlayer, maxWidth: w * 0.4 });
            text(ctx, `Setup ${r.setup ?? '–'} · ${TYRES[r.tyre].name[0]} · ${raceClock(r.time)}`, w - 32, yy + 6, { size: S.small, color: C.textMuted, align: 'right' });
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

  function runQuali() {
    const r = R.runQualifying();
    if (r) toast(`Qualified P${r.rows.find((x) => x.isPlayer).pos}`);
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
    get filling() {
      return fill;
    },
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
      fill = null;
    },
    update(dt) {
      if (fill && (fill.t += dt) >= FILL_SECS) fill = null;
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
