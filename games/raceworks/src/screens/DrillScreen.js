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
import { familyOfCar } from '../systems/carVisual.js'; // Milestone 22
import { RIVAL_TEAMS } from '../../data/rivals.js';
import { medalFor, bonusPct } from '../systems/drills.js';
import { drawDriveWorld, drawDriveControls, DRIVE_GRASS as GRASS } from '../race/driveDraw.js';
import { drawMedal } from '../ui/medal.js';

const C = THEME.color;
const S = THEME.size;
const PAD = 28;
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

// Milestone 29: Help on every step (onHelp: this screen's help page; while it is open isHeld() is true and the drill
// holds still) — under Hand Back while driving, top-right on the intro and the result.
export function createDrillScreen({ renderer, layout, assets, team, bus, settings, records, debugEnabled = false, onDone = () => {}, toast = () => {}, onHelp = null, isHeld = () => false }) {
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
  const helpRect = () => (step === 'play' ? { x: sr().x + sr().w - 324, y: sr().y + 156, w: 300, h: 110 } : { x: sr().x + sr().w - 24 - 160, y: sr().y + 24, w: 160, h: 110 });
  function drawHelp(ctx) {
    if (!onHelp) return;
    drawButton(ctx, helpRect(), 'Help', { accent: C.progress });
    hits.push({ rect: helpRect(), id: 'help', onTap: () => onHelp() });
  }
  const driver = () => team.get(params.staffId) ?? team.roster.find((s) => s.role === 'driver') ?? team.roster[0];
  const playerSprite = () => (team.cars.cars.latest() ? familyOfCar(team.cars.cars.latest(), team).top : CLASSES.clubHatch.raceArt); // (Milestone 22: the resolver)
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

  // --- drawing the course (Milestone 18: shared with the Drive Stint, src/race/driveDraw.js) ---------------------------
  function drawWorld(ctx) {
    camH = drawDriveWorld(ctx, { renderer, layout, assets, ctl, camH, reduced: opt('reducedMotion'), playerSprite: playerSprite(), aiSprite: (id) => aiSprites[id % aiSprites.length] });
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
    drawDriveControls(ctx, { zone: steerZone(), brake: brakeRect(), steer, steering: steerId !== null, braking: brakeIds.size > 0 });
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
    // Milestone 29: every tap area drawn last frame (the thumb-size check reads them; content units)
    tapTargets: () => hits.map((h) => ({ id: h.id, rect: h.rect })),
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
      if (step !== 'play' || !ctl || isHeld()) return;
      if (drill.kind === 'lights') {
        ctl.tick(dt, { tap: tapQueued, handBack });
        tapQueued = false;
      } else ctl.tick(dt, { steer, brake: brakeIds.size > 0, handBack });
      if (ctl.state.finished) finish(ctl.result());
    },
    onDown(p) {
      if (step !== 'play') return;
      if (hitRect(p, handBackRect()) || (onHelp && hitRect(p, helpRect()))) return;
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
      if (step === 'play' && h?.id !== 'handBack' && h?.id !== 'help') return;
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
      if (step === 'intro') return drawIntro(ctx), drawHelp(ctx);
      if (step === 'result') {
        if (ctl?.state?.car) drawWorld(ctx);
        return drawResult(ctx), drawHelp(ctx);
      }
      if (drill.kind === 'lights') return drawLights(ctx), drawHelp(ctx);
      drawWorld(ctx);
      drawHud(ctx);
      drawHelp(ctx);
    },
  };
  void toast;
  return screen;
}
