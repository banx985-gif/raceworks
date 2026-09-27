// The track list (Milestone 6: T01 only) and each track's built geometry, made once and kept.
//   TRACKS[id] → the track data (data/tracks/)   geoOf(id) → its geometry (src/race/trackGeometry.js)
import { T01 } from '../../data/tracks/T01.js';
import { buildTrack } from './trackGeometry.js';

export const TRACKS = { T01 };
const built = new Map();

export function geoOf(id) {
  if (!built.has(id)) built.set(id, buildTrack(TRACKS[id]));
  return built.get(id);
}
