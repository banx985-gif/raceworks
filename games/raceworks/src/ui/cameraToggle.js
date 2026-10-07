// The race camera switch (Milestone 29, bible §8 "Tap whole-track/follow toggle"): one control, the same look, words and
// place (top-left of the track) in the race view and the Drive Stint, and one choice remembered on this device
// (Settings raceCamera: 'overview' = Whole track · 'follow'). The button says what a tap switches to.
//   Race view:   Whole track frames the circuit · Follow follows your car (with a small map).
//   Drive Stint: the road always follows your car (you are driving); Whole track adds the big whole-track map with every
//                car on it, Follow keeps the screen clear.
//   cameraMode(settings) · setCameraMode(settings, mode) · nextCamera(mode) · cameraToggleRect(area) · drawCameraToggle(ctx, r, mode)
import { THEME, font } from '../../../../core/Theme.js';
import { drawButton } from '../../../../core/ui/Button.js';

export const CAMERA_TEXT = { overview: 'Whole track', follow: 'Follow', key: 'raceCamera' };
export const CAMERA_MODES = ['overview', 'follow'];

export const cameraMode = (settings, fallback = 'overview') => {
  const m = settings?.get(CAMERA_TEXT.key);
  return CAMERA_MODES.includes(m) ? m : fallback;
};
export const setCameraMode = (settings, mode) => settings?.set(CAMERA_TEXT.key, mode);
export const nextCamera = (mode) => (mode === 'follow' ? 'overview' : 'follow');
// Top-left of the area it controls, thumb-sized.
export const cameraToggleRect = (area) => ({ x: area.x + 20, y: area.y + 14, w: 290, h: 104 });
export function drawCameraToggle(ctx, r, mode) {
  drawButton(ctx, r, CAMERA_TEXT[nextCamera(mode)], { accent: THEME.color.outline, font: font(THEME.size.small, true) });
}
