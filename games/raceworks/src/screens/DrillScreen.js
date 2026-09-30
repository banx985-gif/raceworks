// A driver drill (Milestone 14, bible §13.4 / §8 Drive Stint controls). Three steps:
//   intro  — the drill, how to play, the Bronze / Silver / Gold scores (the medal picture tinted), the driver, Start or
//            Skip (the course carries on as Auto Train: base gain). ?debug=1 adds Force Bronze / Silver / Gold / Fail
//            (recorded as forced: that sets competitiveSecretInvalidated).
//   play   — the car drills on the shared DrivingChallengeController: auto throttle, drag the lower-left zone to steer,
//            hold Brake (above it), Hand Back top-right. The course is drawn in code (surface, kerbs, gates, lines — the
//            same rule as track scenery); the cars are Aaron's top-down sprites turned in code. Reaction Lights has its
//            own controller: tap anywhere as the lights go out. Aids and steering sensitivity come from the device
//            settings (data/drills.js DRILL_SETTINGS); reduced motion keeps the camera north-up and skips shakes,
//            reduced flashes skips the flash — the scoring is the same.
//   result — the score, the medal, the training bonus it gives, a new best / first Gold; Done returns.
// The medal goes into the account records (src/systems/drills.js) and, when the drill was played for a course, sets
// that course's bonus (team.training.drillDone). A hand back or quit is a no-medal result: the course still trains.
// enter({ drillId, staffId, courseId, practice }) — practice: played from the medal history (records only, no course).
// Milestone 15: enter({ qualiLap: true }) — the optional Qualifying Drive lap (bible §22.3 / §25): one lap of the race
// weekend's real circuit (src/race/lapCourse.js) in the same controller, with the same controls and aids. Start commits
// qualifying to the lap (team.races.startDriveLap); finishing it runs qualifying with the lap's bounded bonus / penalty,
// and a hand back runs the normal simulated session. The intro's Back leaves without driving (Run qualifying is still
// there). No medals or records. ?debug=1 adds "Debug: autopilot lap" (the controller's own perfect lap, at once).
import { THEME } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text, para, card } from '../../../../core/ui/Kit.js';
import { DrivingChallengeController, autopilot } from '../minigames/DrivingChallengeController.js';
import { DRIVE_LAP } from '../../data/race.js';
import { TRACKS } from '../race/tracks.js';
import { ReactionLights } from '../minigames/ReactionLights.js';
import { drillById, MEDALS, MEDAL_NAMES, DRILL_BONUS, DRILL_SETTINGS, DRIVE } from '../../data/drills.js';
import { CLASSES } from '../../data/cars.js';
import { RIVAL_TEAMS } from '../../data/rivals.js';
import { medalFor, bonusPct } from '../systems/drills.js';
import { drawCar } from '../race/trackDraw.js';
import { drawMedal } from '../ui/medal.js';

const C = THEME.color;
const S = THEME.size;
const PAD = 28;
const PX = 13; // screen px per metre while driving
const GRASS = '#7DB65A';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The Qualifying Drive lap, dressed as a drill for this screen (Milestone 15).
function qualiLapDrill(trackName) {
  return {
    id: 'qualiLap',
    name: 'Qualifying Drive lap',
    kind: 'lap',
    how: `One flying lap of ${trackName}, driven by you. Auto throttle: drag the lower-left zone to steer and hold Brake. Beat the crew’s lap to gain time on the grid; a slow lap, going off or hitting a wall loses time — a little either way. Hand Back at any time and qualifying is simulated as normal.`,
  };
}

export function createDrillScreen({ renderer, layout, assets, team, bus, settings, records, debugEnabled = false, onDone = () => {}, toast = () => {} }) {
  let drill = null;
  let params = {};
  let step = 'intro';
  let ctl = null; // DrivingChallengeController or ReactionLights
  let result = null; // { score, finished, medal, pct, firstGold, newBest, forced }
  let hits = [];
  let camH = -Math.PI / 2;
  // touch: the steering finger (id, start x) and the brake fingers
  let steerId = null;
  let steerX0 = 0;
  let steer = 0;
  const brakeIds = new Set();
  let tapQueued = false;
  let handBack = false;
  let flash = 0;
  const opt = (k) => settings?.get(k) ?? DRILL_SETTINGS[k];

  const sr = () => layout.safeRect;
  const steerZone = () => ({ x: sr().x + 24, y: sr().y + sr().h - 300, w: Math.min(560, sr().w * 0.55), h: 276 });
  const brakeRect = () => {
    const z = steerZone();
    return { x: z.x, y: z.y - 230, w: 300, h: 200 };
  };
  const handBackRect = () => ({ x: sr().x + sr().w - 324, y: sr().y + 24, w: 300, h: 116 });
  const driver = () => team.get(params.staffId) ?? team.roster.find((s) => s.role === 'driver') ?? team.roster[0];
  const playerSprite = () => team.cars.cars.latest()?.result?.raceArt ?? CLASSES.clubHatch.raceArt;
  const aiSprites = Object.values(RIVAL_TEAMS).map((t) => t.sprite);

  function begin() {
    const d = drill;
    if (params.qualiLap) {
      const cfg = team.races.startDriveLap();
      if (!cfg) return onDone(params, null);
      ctl = new DrivingChallengeController().start({ ...cfg, aids: { line: opt('lineAid'), brake: opt('brakeAid') }, sensitivity: opt('steerSensitivity') });
      camH = ctl.state.car.h;
      steer = 0;
      steerId = null;
      brakeIds.clear();
      handBack = false;
      step = 'play';
      return;
    }
    const s = driver();
    const seed = `${d.id}:${team.setup.teamName}:${params.staffId ?? 'practice'}:${team.clock.totalDays}`;
    if (d.kind === 'lights') ctl = new ReactionLights().start({ seed, rounds: d.length });
    else ctl = new DrivingChallengeController().start({ seed, kind: d.kind, length: d.length, ratings: s ? team.ratingsOf(s) : {}, aids: { line: opt('lineAid'), brake: opt('brakeAid') }, sensitivity: opt('steerSensitivity') });
    camH = ctl.state.car?.h ?? -Math.PI / 2;
    steer = 0;
    steerId = null;
    brakeIds.clear();
    handBack = false;
    tapQueued = false;
    step = 'play';
  }

  // The drill ended (finished, handed back, skipped or forced): records, the course bonus, the result panel.
  function finish(r, { forced = false, skipped = false } = {}) {
    if (params.qualiLap) {
      const quali = team.races.finishDriveLap(r);
      result = { ...r, quali, drive: quali?.drive ?? null };
      step = 'result';
      return;
    }
    const medal = r.finished ? medalFor(drill, r.score) : null;
    const rec = skipped ? { medal: null, firstGold: false, newBest: false } : records.record(drill.id, r, { forced });
    if (!params.practice && params.staffId) team.training.drillDone(params.staffId, { medal });
    const pct = params.practice ? null : bonusPct({ mode: 'drill', medal });
    result = { ...r, medal, pct, firstGold: rec.firstGold, newBest: rec.newBest, forced, skipped };
    step = 'result';
    bus.emit('drill:finished', { drillId: drill.id, result });
    if (skipped) done();
  }
  function force(medal) {
    const score = medal ? drill.thresholds[medal] : 0;
    finish({ score, finished: !!medal, handedBack: !medal, detail: { forced: true } }, { forced: true });
  }
  function done() {
    step = 'intro';
    ctl = null;
    onDone(params, result);
  }

  // --- drawing the course ---------------------------------------------------------------------------------------------
  function toScreen(x, y, cx, cy, ox, oy, rot) {
    const dx = x - cx;
    const dy = y - cy;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return { x: ox + (dx * c - dy * s) * PX, y: oy + (dx * s + dy * c) * PX };
  }
  function drawWorld(ctx) {
    const st = ctl.state;
    const car = st.car;
    const R = layout.safeRect;
    const reduced = opt('reducedMotion');
    // the camera follows the car; it turns with it (the car points up the screen) unless reduced motion is on
    if (!reduced) camH += ((((car.h - camH + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * 0.12;
    const rot = reduced ? 0 : -Math.PI / 2 - camH;
    const ox = R.x + R.w / 2;
    const oy = R.y + R.h * 0.62;
    const T = (x, y) => toScreen(x, y, car.x, car.y, ox, oy, rot);
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    const co = st.course;
    const P = co.pts;
    const i0 = Math.max(0, car.i - 70);
    const i1 = Math.min(P.length - 1, car.i + 110);
    const half = co.width / 2;
    const edge = (p, side) => T(p.x - Math.sin(p.h) * side * half, p.y + Math.cos(p.h) * side * half);
    // surface
    ctx.beginPath();
    for (let i = i0; i <= i1; i += 2) {
      const q = edge(P[i], 1);
      i === i0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
    }
    for (let i = i1 - ((i1 - i0) % 2); i >= i0; i -= 2) {
      const q = edge(P[i], -1);
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.fillStyle = st.kind === 'wet' ? '#4E5A66' : '#6B6560';
    ctx.fill();
    // kerbs on the bends (red / white blocks at both edges)
    for (let i = i0; i < i1; i += 2) {
      if (Math.abs(P[i].k) < 1 / 160) continue; // a circuit's centreline is rarely exactly straight
      for (const side of [-1, 1]) {
        const a = edge(P[i], side);
        const b = edge(P[i + 2], side);
        ctx.strokeStyle = Math.floor(i / 2) % 2 ? '#D8352A' : '#F4F1EA';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    // wet: puddle sheen along the middle
    if (st.kind === 'wet') {
      ctx.fillStyle = 'rgba(160,200,235,0.18)';
      for (let i = i0; i < i1; i += 9) {
        const q = T(P[i].x, P[i].y);
        ctx.beginPath();
        ctx.ellipse(q.x + ((i * 37) % 60) - 30, q.y, 70, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // the racing-line aid
    if (st.aids.line && st.kind !== 'brake') {
      const pts = ctl.racingLine(car.s - 20, car.s + 200, 4);
      ctx.setLineDash([26, 20]);
      ctx.strokeStyle = 'rgba(53,194,224,0.85)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      pts.forEach((p, n) => {
        const q = T(p.x, p.y);
        n ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // brake markers (the aid) / the Brake Zone boards and line
    const bar = (m, colour, w) => {
      const a = T(m.x - Math.sin(m.h) * half, m.y + Math.cos(m.h) * half);
      const b = T(m.x + Math.sin(m.h) * half, m.y - Math.cos(m.h) * half);
      ctx.strokeStyle = colour;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    if (st.kind === 'brake') {
      for (const m of ctl.brakeMarkers()) if (m.line || st.aids.brake) bar(m, m.line ? '#F4F1EA' : 'rgba(242,134,43,0.9)', m.line ? 16 : 10);
    } else if (st.aids.brake) {
      for (const m of ctl.brakeMarkers()) if (m.s > car.s - 20 && m.s < car.s + 200) bar(m, 'rgba(242,134,43,0.75)', 8);
    }
    // gates: two posts, green when hit, red when missed
    for (const g of st.gates) {
      if (g.s < car.s - 40 || g.s > car.s + 220) continue;
      const p = co.pts[Math.round(g.s / 2)];
      const colour = g.hit === null ? '#F2B233' : g.hit ? '#2E8B57' : '#C8402F';
      for (const side of [-1, 1]) {
        const lat = g.lat + (side * g.w) / 2;
        const q = T(p.x - Math.sin(p.h) * lat, p.y + Math.cos(p.h) * lat);
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2A241F';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
    // finish line
    if (st.kind !== 'brake') {
      const f = co.pts[Math.min(co.pts.length - 1, Math.round(co.finishAt / 2))];
      if (f.s < car.s + 220) bar(f, '#F4F1EA', 18);
    }
    // cars (Aaron's sprites; nose down in the picture, turned by drawCar)
    const L = DRIVE.car.lengthM * PX;
    for (const a of st.ai ?? []) {
      const q = T(a.x, a.y);
      drawCar(ctx, assets, aiSprites[a.id % aiSprites.length], q.x, q.y, a.h + rot, L);
    }
    const q = T(car.x, car.y);
    drawCar(ctx, assets, playerSprite(), q.x, q.y, car.h + rot, L, { ring: 'rgba(242,178,51,0.55)' });
  }

  function drawHud(ctx) {
    const st = ctl.state;
    const R = sr();
    const box = { x: R.x + 24, y: R.y + 24, w: R.w - 24 * 3 - 300, h: 190 };
    card(ctx, box, 'info');
    text(ctx, drill.name, box.x + PAD, box.y + 20, { size: S.heading, bold: true, maxWidth: box.w - PAD * 2 });
    let line = '';
    if (st.kind === 'lap') line = `Lap ${st.t.toFixed(1)} s · the crew’s lap ${(st.par * DRIVE_LAP.parSlack).toFixed(1)} s · apexes ${st.gates.filter((g) => g.hit).length} / ${st.gates.length}`;
    else if (st.kind === 'line' || st.kind === 'wet') line = `Gates ${st.gates.filter((g) => g.hit).length} / ${st.gates.length} · ${st.t.toFixed(1)} s (par ${st.par.toFixed(1)})`;
    else if (st.kind === 'brake') line = `Attempt ${Math.min(3, st.attempts.length + 1)} of 3 · ${st.attempts.map((a) => (a.ok ? a.score : 'over')).join(' · ') || 'hold Brake late'}`;
    else if (st.kind === 'overtake') line = `Passed ${st.ai.filter((a) => a.passed).length} / ${st.ai.length} · contacts ${st.contacts} · ${Math.max(0, DRIVE.overtake.timeLimit - st.t).toFixed(0)} s`;
    else if (st.kind === 'tyre') line = `${st.t.toFixed(1)} s (target ${st.par.toFixed(1)}–${(st.par * 1.1).toFixed(1)}) · tyre load ${Math.round((100 * st.load) / (st.parLoad * 1.15))}%`;
    text(ctx, line, box.x + PAD, box.y + 98, { size: S.small, bold: true, color: C.actionDark, maxWidth: box.w - PAD * 2 });
    const hb = handBackRect();
    drawButton(ctx, hb, 'Hand Back', { accent: C.bad });
    hits.push({ rect: hb, id: 'handBack', onTap: () => (handBack = true) });
    // controls: the steering zone (lower-left) and Brake above it
    const z = steerZone();
    ctx.fillStyle = 'rgba(42,36,31,0.35)';
    ctx.beginPath();
    ctx.roundRect(z.x, z.y, z.w, z.h, 40);
    ctx.fill();
    ctx.strokeStyle = 'rgba(244,241,234,0.8)';
    ctx.lineWidth = 4;
    ctx.stroke();
    const kx = z.x + z.w / 2 + steer * (z.w / 2 - 70);
    ctx.fillStyle = steerId !== null ? '#F2862B' : '#F4F1EA';
    ctx.beginPath();
    ctx.arc(kx, z.y + z.h / 2, 62, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, '◀  steer  ▶', z.x + z.w / 2, z.y + z.h - 56, { size: S.small, bold: true, color: '#F4F1EA', align: 'center' });
    const b = brakeRect();
    drawButton(ctx, b, 'Brake', { accent: C.bad, active: brakeIds.size > 0 });
  }

  function drawLights(ctx) {
    const st = ctl.state;
    const R = sr();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    if (st.phase === 'go' && !opt('reducedFlashes')) {
      flash = Math.max(flash, 0.35 - st.phaseT);
      if (flash > 0) {
        ctx.fillStyle = `rgba(46,139,87,${clamp(flash, 0, 0.35)})`;
        ctx.fillRect(0, 0, renderer.width, renderer.height);
      }
    } else flash = 0;
    const box = { x: R.x + 24, y: R.y + 24, w: R.w - 24 * 3 - 300, h: 190 };
    card(ctx, box, 'info');
    text(ctx, drill.name, box.x + PAD, box.y + 20, { size: S.heading, bold: true, maxWidth: box.w - PAD * 2 });
    text(ctx, `Start ${Math.min(st.rounds, st.round + 1)} of ${st.rounds}`, box.x + PAD, box.y + 98, { size: S.small, bold: true, color: C.actionDark });
    const hb = handBackRect();
    drawButton(ctx, hb, 'Hand Back', { accent: C.bad });
    hits.push({ rect: hb, id: 'handBack', onTap: () => (handBack = true) });
    // the gantry: five lights
    const gw = Math.min(R.w - 80, 900);
    const g = { x: R.x + (R.w - gw) / 2, y: R.y + R.h * 0.28, w: gw, h: 240 };
    ctx.fillStyle = '#2A241F';
    ctx.beginPath();
    ctx.roundRect(g.x, g.y, g.w, g.h, 30);
    ctx.fill();
    const n = 5;
    for (let i = 0; i < n; i++) {
      const cx = g.x + (g.w / n) * (i + 0.5);
      ctx.fillStyle = i < st.lit ? '#E8352A' : '#4A403A';
      ctx.beginPath();
      ctx.arc(cx, g.y + g.h / 2, Math.min(70, g.w / n / 2 - 12), 0, Math.PI * 2);
      ctx.fill();
    }
    const last = st.lastTap;
    const msg = st.phase === 'go' ? 'GO!' : last ? (last.falseStart ? 'False start: that start is lost' : last.reaction == null ? 'Too slow' : `${Math.round(last.reaction * 1000)} ms`) : 'Tap as soon as the lights go out';
    text(ctx, msg, R.x + R.w / 2, g.y + g.h + 60, { size: 64, bold: true, align: 'center', color: last?.falseStart && st.phase !== 'go' ? C.bad : C.text, maxWidth: R.w - 60 });
    text(ctx, 'Tap anywhere below', R.x + R.w / 2, R.y + R.h - 200, { size: S.body, align: 'center', color: C.textMuted });
  }

  // --- intro and result panels ------------------------------------------------------------------------------------------
  function panel(ctx, h) {
    const R = sr();
    const box = { x: R.x + 24, y: R.y + Math.max(40, (R.h - h) / 2), w: R.w - 48, h };
    ctx.fillStyle = 'rgba(42,36,31,0.45)';
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    card(ctx, box, 'normal');
    return box;
  }
  function drawQualiIntro(ctx) {
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    const box = panel(ctx, 700 + (debugEnabled ? 134 : 0));
    let y = box.y + PAD;
    text(ctx, drill.name, box.x + PAD, y, { size: S.title, bold: true, maxWidth: box.w - PAD * 2 - 180 });
    assets.drawContained(ctx, 'race_ui_30', { x: box.x + box.w - PAD - 150, y: y - 10, w: 150, h: 150 });
    y += 90;
    text(ctx, `${driver()?.name ?? ''} · ${TRACKS[team.races.current?.trackId]?.name ?? ''}`, box.x + PAD, y, { size: S.small, bold: true, color: C.textMuted, maxWidth: box.w - PAD * 2 - 180 });
    y += 70;
    para(ctx, drill.how, box.x + PAD, y, box.w - PAD * 2, { size: S.body });
    const bw = (box.w - PAD * 2 - 20) / 2;
    const go = { x: box.x + PAD, y: box.y + box.h - PAD - 120 - (debugEnabled ? 134 : 0), w: bw, h: 120 };
    const back = { x: box.x + PAD + bw + 20, y: go.y, w: bw, h: 120 };
    drawButton(ctx, go, 'Start lap', { accent: C.good });
    drawButton(ctx, back, 'Back', { accent: C.progress });
    hits.push({ rect: go, id: 'go', onTap: begin });
    hits.push({ rect: back, id: 'skip', onTap: () => onDone(params, null) });
    if (debugEnabled) {
      const r = { x: box.x + PAD, y: go.y + 134, w: box.w - PAD * 2, h: 120 };
      drawButton(ctx, r, 'Debug: autopilot lap', { accent: C.purple });
      hits.push({ rect: r, id: 'force_auto', onTap: autoLap });
    }
  }
  // ?debug=1: start the lap and let the controller's perfect driver finish it at once.
  function autoLap() {
    begin();
    if (step !== 'play') return;
    let guard = 0;
    while (!ctl.state.finished && guard++ < 60 * 400) ctl._step(autopilot(ctl));
    finish(ctl.result());
  }
  function drawQualiResult(ctx) {
    const r = result;
    const q = r.quali;
    const box = panel(ctx, 700);
    let y = box.y + PAD;
    const d = r.drive;
    text(ctx, d ? 'Lap complete' : 'Handed back', box.x + box.w / 2, y, { size: S.title, bold: true, align: 'center', maxWidth: box.w - PAD * 2 });
    y += 110;
    if (d) {
      text(ctx, `Your lap ${d.time.toFixed(2)} s · the crew’s lap ${(d.par * DRIVE_LAP.parSlack).toFixed(2)} s`, box.x + box.w / 2, y, { size: S.body, bold: true, align: 'center', maxWidth: box.w - PAD * 2 });
      y += 70;
      const words = d.delta < 0 ? `−${Math.abs(d.delta).toFixed(2)} s on your qualifying time` : d.delta > 0 ? `+${d.delta.toFixed(2)} s on your qualifying time` : 'No change to your qualifying time';
      text(ctx, words, box.x + box.w / 2, y, { size: S.heading, bold: true, align: 'center', color: d.delta <= 0 ? C.good : C.bad, maxWidth: box.w - PAD * 2 });
      y += 70;
      text(ctx, `(a lap can move it by at most ±${d.cap.toFixed(2)} s)`, box.x + box.w / 2, y, { size: S.small, align: 'center', color: C.textMuted });
    } else text(ctx, 'Qualifying was simulated as normal', box.x + box.w / 2, y, { size: S.body, align: 'center', color: C.textMuted, maxWidth: box.w - PAD * 2 });
    y += 80;
    const me = q?.rows.find((x) => x.isPlayer);
    if (me) text(ctx, `You start P${me.pos}`, box.x + box.w / 2, y, { size: S.title, bold: true, align: 'center' });
    const b = { x: box.x + PAD, y: box.y + box.h - PAD - 120, w: box.w - PAD * 2, h: 120 };
    drawButton(ctx, b, 'Done', { accent: C.good });
    hits.push({ rect: b, id: 'done', onTap: done });
  }
  function drawIntro(ctx) {
    if (params.qualiLap) return drawQualiIntro(ctx);
    const s = driver();
    const R = sr();
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    const forceRows = debugEnabled ? 2 : 0;
    const box = panel(ctx, 900 + forceRows * 134);
    let y = box.y + PAD;
    text(ctx, drill.name, box.x + PAD, y, { size: S.title, bold: true, maxWidth: box.w - PAD * 2 - 180 });
    assets.drawContained(ctx, 'race_ui_22', { x: box.x + box.w - PAD - 150, y: y - 10, w: 150, h: 150 });
    y += 90;
    text(ctx, params.practice ? 'Practice (no training course)' : `${s?.name ?? ''} · ${team.training.courseOf(params.staffId)?.name ?? ''}`, box.x + PAD, y, { size: S.small, bold: true, color: C.textMuted, maxWidth: box.w - PAD * 2 - 180 });
    y += 70;
    y += para(ctx, drill.how, box.x + PAD, y, box.w - PAD * 2, { size: S.body }) + 20;
    const mw = (box.w - PAD * 2) / 3;
    MEDALS.forEach((m, i) => {
      const x = box.x + PAD + i * mw;
      drawMedal(ctx, assets, m, { x: x + mw / 2 - 60, y, w: 120, h: 120 });
      text(ctx, `${MEDAL_NAMES[m]} ${drill.thresholds[m]}+`, x + mw / 2, y + 130, { size: S.small, bold: true, align: 'center' });
      text(ctx, `+${DRILL_BONUS[m]}%`, x + mw / 2, y + 172, { size: S.small, color: C.good, bold: true, align: 'center' });
    });
    y += 230;
    const bw = (box.w - PAD * 2 - 20) / 2;
    const go = { x: box.x + PAD, y, w: bw, h: 120 };
    const skip = { x: box.x + PAD + bw + 20, y, w: bw, h: 120 };
    drawButton(ctx, go, 'Start', { accent: C.good });
    drawButton(ctx, skip, params.practice ? 'Back' : 'Skip: Auto Train', { accent: C.progress });
    hits.push({ rect: go, id: 'go', onTap: begin });
    hits.push({ rect: skip, id: 'skip', onTap: () => (params.practice ? onDone(params, null) : finish({ score: 0, finished: false, handedBack: false }, { skipped: true })) });
    y += 140;
    if (debugEnabled) {
      const fw = (box.w - PAD * 2 - 20) / 2;
      [...MEDALS.slice().reverse(), null].forEach((m, i) => {
        const r = { x: box.x + PAD + (i % 2) * (fw + 20), y: y + Math.floor(i / 2) * 134, w: fw, h: 120 };
        drawButton(ctx, r, `Debug: ${m ? MEDAL_NAMES[m] : 'Fail'}`, { accent: C.purple });
        hits.push({ rect: r, id: `force_${m ?? 'fail'}`, onTap: () => force(m) });
      });
    }
    void R;
  }
  function drawResult(ctx) {
    if (params.qualiLap) return drawQualiResult(ctx);
    const r = result;
    const box = panel(ctx, 820);
    let y = box.y + PAD;
    text(ctx, r.medal ? `${MEDAL_NAMES[r.medal]}!` : r.handedBack ? 'Handed back' : 'No medal this time', box.x + box.w / 2, y, { size: S.title, bold: true, align: 'center', maxWidth: box.w - PAD * 2 });
    y += 100;
    drawMedal(ctx, assets, r.medal, { x: box.x + box.w / 2 - 110, y, w: 220, h: 220 });
    y += 240;
    text(ctx, `Score ${r.score}${r.newBest ? ' · new best!' : ''}`, box.x + box.w / 2, y, { size: S.heading, bold: true, align: 'center' });
    y += 76;
    const bonus = r.pct == null ? 'Practice: medal records only' : r.pct ? `Training bonus +${r.pct}% on this course` : 'The course still trains as normal (base gain)';
    text(ctx, bonus, box.x + box.w / 2, y, { size: S.body, bold: true, align: 'center', color: r.pct ? C.good : C.textMuted, maxWidth: box.w - PAD * 2 });
    y += 64;
    if (r.firstGold) text(ctx, `${drill.name} Mastered: Auto Train now gets +${DRILL_BONUS.masteredAuto}%`, box.x + box.w / 2, y, { size: S.small, bold: true, align: 'center', color: C.purple, maxWidth: box.w - PAD * 2 });
    if (r.forced) text(ctx, 'Debug result (forced)', box.x + box.w / 2, y + 44, { size: S.small, align: 'center', color: C.bad });
    const b = { x: box.x + PAD, y: box.y + box.h - PAD - 120, w: box.w - PAD * 2, h: 120 };
    drawButton(ctx, b, 'Done', { accent: C.good });
    hits.push({ rect: b, id: 'done', onTap: done });
  }

  // --- input ----------------------------------------------------------------------------------------------------------
  bus.on('input:move', (p) => {
    if (step !== 'play' || p.id !== steerId) return;
    const z = steerZone();
    steer = clamp((p.x - steerX0) / (z.w * 0.35), -1, 1);
  });

  const screen = {
    get step() {
      return step;
    },
    get drill() {
      return drill;
    },
    get ctl() {
      return ctl;
    },
    get result() {
      return result;
    },
    get steer() {
      return steer;
    },
    get braking() {
      return brakeIds.size > 0;
    },
    rects: () => ({ steer: steerZone(), brake: brakeRect(), handBack: handBackRect() }),
    // Screen rect of a button by id, as drawn on the last frame (tests).
    buttonRect: (id) => hits.find((h) => h.id === id)?.rect ?? null,
    enter(p = {}) {
      params = { ...p };
      if (p.qualiLap) params.staffId = team.races.current?.entries.find((e) => e.isPlayer)?.driverId ?? null;
      drill = p.qualiLap ? qualiLapDrill(TRACKS[team.races.current?.trackId]?.name ?? 'the circuit') : drillById(p.drillId);
      step = 'intro';
      ctl = null;
      result = null;
      assets.ensure?.(['race_ui_22', 'race_ui_23', playerSprite(), ...aiSprites].filter((k) => assets.isPending?.(k)));
    },
    update(dt) {
      if (step !== 'play' || !ctl) return;
      if (drill.kind === 'lights') {
        ctl.tick(dt, { tap: tapQueued, handBack });
        tapQueued = false;
      } else ctl.tick(dt, { steer, brake: brakeIds.size > 0, handBack });
      if (ctl.state.finished) finish(ctl.result());
    },
    onDown(p) {
      if (step !== 'play') return;
      if (hitRect(p, handBackRect())) return;
      if (drill.kind === 'lights') {
        tapQueued = true;
        return;
      }
      if (hitRect(p, brakeRect())) brakeIds.add(p.id);
      else if (hitRect(p, steerZone()) && steerId === null) {
        steerId = p.id;
        steerX0 = p.x - steer * steerZone().w * 0.35;
      }
    },
    onUp(p) {
      brakeIds.delete(p.id);
      if (p.id === steerId) {
        steerId = null;
        steer = 0;
      }
    },
    onTap(p) {
      const h = hits.find((x) => hitRect(p, x.rect));
      if (step === 'play' && h?.id !== 'handBack') return;
      h?.onTap();
    },
    // System Back: during play it hands back; on the result it is Done; on the intro it leaves (a course carries on as
    // Auto Train — its bonus stays at the base gain).
    onBack() {
      if (step === 'play') handBack = true;
      else if (step === 'result') done();
      else return false;
      return true;
    },
    render(ctx) {
      hits = [];
      if (!drill) return;
      if (step === 'intro') return drawIntro(ctx);
      if (step === 'result') {
        if (ctl?.state?.car) drawWorld(ctx);
        return drawResult(ctx);
      }
      if (drill.kind === 'lights') return drawLights(ctx);
      drawWorld(ctx);
      drawHud(ctx);
    },
  };
  void toast;
  return screen;
}
