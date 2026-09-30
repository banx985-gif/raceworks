// The track list (Milestone 6: T01; Milestone 19: all 12 of bible §26) and each track's built geometry, made once and kept.
//   TRACKS[id] → the track data (data/tracks/)   geoOf(id) → its geometry (src/race/trackGeometry.js)
//   TRACK_IDS → T01…T12 in order · isVisibleTrack(id) → false for a normal-locked track (T12 Zero Ring: data and debug
//   only until the Secret Engine) · weekendLapsOf(id) → a race weekend's laps there
import { T01 } from '../../data/tracks/T01.js';
import { T02 } from '../../data/tracks/T02.js';
import { T03 } from '../../data/tracks/T03.js';
import { T04 } from '../../data/tracks/T04.js';
import { T05 } from '../../data/tracks/T05.js';
import { T06 } from '../../data/tracks/T06.js';
import { T07 } from '../../data/tracks/T07.js';
import { T08 } from '../../data/tracks/T08.js';
import { T09 } from '../../data/tracks/T09.js';
import { T10 } from '../../data/tracks/T10.js';
import { T11 } from '../../data/tracks/T11.js';
import { T12 } from '../../data/tracks/T12.js';
import { buildTrack } from './trackGeometry.js';

export const TRACKS = { T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12 };
export const TRACK_IDS = Object.keys(TRACKS);
export const isVisibleTrack = (id) => !!TRACKS[id] && !TRACKS[id].hidden;
const built = new Map();

export function geoOf(id) {
  if (!built.has(id)) built.set(id, buildTrack(TRACKS[id]));
  return built.get(id);
}
