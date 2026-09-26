// Cheap life for full-body character art (bible §34.2): no animation frames, just
//   - a 2–4 px bob while walking,
//   - a small tilt while working,
//   - a left/right flip for the way they face.
// characterPose() works out the numbers; drawCharacter() draws a cached sprite with them.
export const MOTION = {
  walkBobPx: 3, // height of each step hop (logical px)
  walkStepsPerSec: 3.2,
  workTiltRad: 0.07, // ~4°
  workTiltPerSec: 1.4,
  workBobPx: 1.5,
  idleBreathPx: 0.8,
  idleBreathPerSec: 0.45,
};

// agent: { state: 'walking' | 'working' | 'idle', facing: 1 | -1, stateTime }
// seed: any number that differs per character so they don't move in step.
export function characterPose(agent, time, seed = 0, out = { bob: 0, tilt: 0, flip: 1 }, m = MOTION) {
  const t = time + seed * 0.37;
  out.flip = agent.facing < 0 ? -1 : 1;
  out.tilt = 0;
  if (agent.state === 'walking') {
    out.bob = -Math.abs(Math.sin(t * Math.PI * m.walkStepsPerSec)) * m.walkBobPx;
  } else if (agent.state === 'working') {
    out.tilt = Math.sin(t * Math.PI * 2 * m.workTiltPerSec) * m.workTiltRad;
    out.bob = -Math.abs(Math.sin(t * Math.PI * 2 * m.workTiltPerSec)) * m.workBobPx;
  } else {
    out.bob = -(Math.sin(t * Math.PI * 2 * m.idleBreathPerSec) * 0.5 + 0.5) * m.idleBreathPx;
  }
  return out;
}

// Draw a character standing with their feet at (x, y), w×h logical px, using a pose.
export function drawCharacter(ctx, assets, key, x, y, w, h, pose) {
  const sprite = assets.sprite(key, w, h);
  if (!sprite) {
    assets.drawPlaceholder(ctx, key, x - w / 2, y - h, w, h);
    return;
  }
  const ps = assets.sprites.pixelScale;
  ctx.save();
  ctx.translate(Math.round(x * ps) / ps, Math.round((y + pose.bob) * ps) / ps);
  if (pose.tilt) ctx.rotate(pose.tilt);
  if (pose.flip < 0) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -w / 2, -h, w, h);
  ctx.restore();
}
