// Settings (Milestone 25b, series common feature §2): device settings on core/Settings (localStorage under SETTINGS_KEY),
// never part of a save slot — the same for every team on this device. The series list in Robot Workshop's order and
// names (its M21–M27 Settings screen; DEVWORKS M40e follows it too), then Help / tutorial replay, Privacy & legal and
// Credits (main.js), then RACEWORKS's own extras at the bottom — the Milestone 14 drill settings, moved here from the
// Drills · Medals screen (which keeps a Settings shortcut), the race camera and Key Moment prompts.
// Every id the game saved before (raceCamera, steerSensitivity, lineAid, brakeAid, reducedMotion, reducedFlashes) is kept,
// so old settings load as they were. Accessibility never touches secrets or rewards (no secret rule reads a setting).
//   Each entry: { id, label, group, options: [{ id, label }], line? }  · extra: true = a RACEWORKS extra
import { DRILL_SETTINGS, SENSITIVITY_RANGE } from './drills.js';

const onOff = [{ id: false, label: 'Off' }, { id: true, label: 'On' }];
const lvl = (ids) => ids.map((id) => ({ id, label: id === 0 ? 'Off' : `${id}%` }));
const sens = [];
for (let v = SENSITIVITY_RANGE.min; v <= SENSITIVITY_RANGE.max + 1e-9; v += SENSITIVITY_RANGE.step) sens.push({ id: Math.round(v * 100) / 100, label: `${Math.round(v * 100) / 100}×` });

export const SETTINGS = [
  { id: 'muted', label: 'Sound', group: 'Sound and music', options: [{ id: true, label: 'Off' }, { id: false, label: 'On' }], line: 'All music and sound effects on or off. Sound starts after your first tap.' },
  { id: 'music', label: 'Music volume', group: 'Sound and music', options: lvl([0, 25, 50, 75, 100]) },
  { id: 'musicMuted', label: 'Music mute', group: 'Sound and music', options: [{ id: false, label: 'Playing' }, { id: true, label: 'Muted' }] },
  { id: 'sfx', label: 'Sound effects volume', group: 'Sound and music', options: lvl([0, 25, 50, 75, 100]) },
  { id: 'sfxMuted', label: 'Sound effects mute', group: 'Sound and music', options: [{ id: false, label: 'Playing' }, { id: true, label: 'Muted' }] },
  { id: 'fpsMode', label: 'Graphics', group: 'Graphics and performance', options: [{ id: 'auto', label: 'Auto' }, { id: 'high', label: 'High' }, { id: 'low', label: 'Low' }], line: 'Auto: 60 FPS, a steady 30 if the phone struggles. High: always 60 with every effect. Low: 30 FPS, fewer effects, simpler figures.' },
  { id: 'reducedFlashes', label: 'Reduced flashes', group: 'Graphics and performance', options: onOff, line: 'No bright flashes (the reveal, the lights going out).' },
  { id: 'screenShake', label: 'Screen shake', group: 'Graphics and performance', options: [{ id: 'off', label: 'Off' }, { id: 'low', label: 'Low' }, { id: 'normal', label: 'Normal' }], line: 'The little shakes on big hits — never needed to follow the game.' },
  { id: 'reducedMotion', label: 'Reduced motion', group: 'Graphics and performance', options: onOff, line: 'The race and drill cameras stay north-up, no shake; strips fade instead of sliding.' },
  { id: 'haptics', label: 'Vibration', group: 'Comfort and text', options: onOff, line: 'A buzz on the big moments. Phones only.' },
  { id: 'textSize', label: 'Text size', group: 'Comfort and text', options: [{ id: 'normal', label: 'Normal' }, { id: 'large', label: 'Large' }, { id: 'larger', label: 'Larger' }], line: 'Large: every text 15% bigger; Larger: 30%.' },
  { id: 'showMenu', label: 'Show Menu button', group: 'Menu and hints', options: onOff, line: 'Off: tap the art to get around (Settings stays on the main menu).' },
  { id: 'showHints', label: 'Show next-step hints', group: 'Menu and hints', options: onOff, line: 'A line under the date saying what to do next; tap it to go there.' },
  // RACEWORKS extras (after the series list).
  { id: 'steerSensitivity', label: 'Steering sensitivity', group: 'Driving and racing', extra: true, options: sens, line: 'How far the car turns for a swipe (drills and Drive Stints).' },
  { id: 'lineAid', label: 'Racing-line help', group: 'Driving and racing', extra: true, options: onOff, line: 'A coloured line on the drill and Drive tracks.' },
  { id: 'brakeAid', label: 'Brake-line help', group: 'Driving and racing', extra: true, options: onOff, line: 'Brake markers before each corner.' },
  { id: 'raceCamera', label: 'Race camera', group: 'Driving and racing', extra: true, options: [{ id: 'overview', label: 'Overview' }, { id: 'follow', label: 'Follow' }], line: 'Where a race starts; switch any time on the race screen.' },
  { id: 'keyMoments', label: 'Key Moment prompts', group: 'Driving and racing', extra: true, options: onOff, line: 'Fast-forward stops for your pit window, a podium battle, weather and trouble.' },
];
export const SETTINGS_DEFAULTS = {
  muted: false, music: 75, musicMuted: false, sfx: 100, sfxMuted: false, fpsMode: 'auto', screenShake: 'normal', haptics: true, textSize: 'normal',
  showMenu: true, showHints: true, raceCamera: 'overview', keyMoments: true, ...DRILL_SETTINGS,
};
export const SETTINGS_KEY = 'raceworks:settings';
export const SHAKE_LEVELS = { off: 0, low: 0.5, normal: 1 };
export const TEXT_SCALE = { normal: 1, large: 1.15, larger: 1.3 };
export const SETTINGS_TEXT = {
  title: 'Settings',
  subtitle: 'This device · every team',
  help: 'Help / tutorial replay',
  helpLine: 'How to play. The first-time guide comes in a later update.',
  legal: 'Privacy & legal',
  legalBody: 'RACEWORKS keeps your teams on this device. It has no account and collects no personal data of its own.',
  credits: 'Credits',
  creditsBody: 'RACEWORKS — a Canvas Management Series game by Aaron (Banx Games). Art by Aaron; code by Claude Code. Thanks for playing!',
};
