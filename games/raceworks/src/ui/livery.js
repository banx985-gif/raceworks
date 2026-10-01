// Team colour on Aaron's car art (Milestone 8, bible §41.1 livery anchors). The cars are never drawn in code: a
// team-coloured copy of the real picture is made once per picture and colour, then used like any other image (so
// the sprite cache sizes it for the screen as usual).
//   liveryKey(assets, artKey, colourId, sponsors)   the image key to draw: artKey itself when the picture needs no change
//                                         (its family has no anchors, the team colour is the colour it is painted in and no
//                                         sponsor is on the car, or the picture has not loaded yet), else
//                                         '<artKey>~<colourId>' or, with sponsors, '<artKey>~<colourId>~SPN01+SPN06'
//   Milestone 22: every family has anchors; sponsors (ids, slot order) put their symbol logos (logos/sponsor_logo_spnXX,
//   data/sponsors.js) into the family's sponsorSlots for that view, scaled to fit (no new images). A logo that hasn't
//   loaded yet leaves the plain team-colour copy for now (the sponsored copy is made on a later frame).
//   teamColourId(team)                    the open team's colour id (Racing Red when there is none)
// Inside each anchor polygon (CAR_FAMILIES[...].liveryAnchors) only the red body paint changes: its hue becomes the team
// colour and its light and shade stay, so outlines, windows, lights, tyres and the white / yellow stripes are untouched.
import { familyOfArt } from '../../data/cars.js';
import { TEAM_COLOURS } from '../../data/setup.js';
import { sponsorById } from '../../data/sponsors.js';
import { familyOfCar } from '../systems/carVisual.js';

const PAINT_HUE = { red: 4 }; // the paint's hue (degrees) per family `paint`
const HUE_FULL = 14; // within this many degrees of the paint's hue a pixel takes the full team colour…
const HUE_NONE = 26; // …fading out by here (the orange shading next to the red)
const MIN_SAT = 0.34; // greys, whites and near-blacks are never paint

export const teamColourId = (team) => team?.setup?.colour ?? TEAM_COLOURS[0].id;

export function liveryKey(assets, artKey, colourId, sponsors = []) {
  const fam = familyOfArt(artKey);
  const ids = (sponsors ?? []).filter((id) => sponsorById(id));
  if (!fam?.liveryAnchors || !colourId || (colourId === fam.paint && !ids.length)) return artKey;
  const view = artKey === fam.showcase ? 'showcase' : 'race';
  const slots = (fam.liveryAnchors.sponsorSlots ?? []).filter((sl) => sl.view === view);
  const shown = ids.slice(0, slots.length);
  const base = colourId === fam.paint ? artKey : tinted(assets, artKey, fam, view, colourId);
  if (!shown.length || base === null) return base ?? artKey;
  const key = `${artKey}~${colourId}~${shown.join('+')}`;
  if (assets.images.has(key)) return key;
  const logos = shown.map((id) => assets.get(sponsorById(id).logo));
  const img = assets.get(base);
  if (!img || logos.some((l) => !l) || typeof document === 'undefined') return base;
  assets.images.set(key, decals(img, slots, logos));
  return key;
}

// The team-colour copy ('<artKey>~<colourId>'), or null when it can't be made yet.
function tinted(assets, artKey, fam, view, colourId) {
  const key = `${artKey}~${colourId}`;
  if (assets.images.has(key)) return key;
  const img = assets.get(artKey);
  const colour = TEAM_COLOURS.find((c) => c.id === colourId);
  if (!img || !colour || typeof document === 'undefined') return null;
  const canvas = paint(img, fam.liveryAnchors[view] ?? [], colour.main, PAINT_HUE[fam.paint] ?? 4);
  if (!canvas) return null;
  assets.images.set(key, canvas);
  return key;
}

// A copy of img with each logo drawn into its slot (fractions of the picture), contained and centred, turned by the
// slot's rotation (degrees).
function decals(img, slots, logos) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  logos.forEach((logo, i) => {
    const sl = slots[i];
    const lw = logo.naturalWidth || logo.width;
    const lh = logo.naturalHeight || logo.height;
    const k = Math.min((sl.w * w) / lw, (sl.h * h) / lh);
    g.save();
    g.translate((sl.x + sl.w / 2) * w, (sl.y + sl.h / 2) * h);
    if (sl.rotation) g.rotate((sl.rotation * Math.PI) / 180);
    g.drawImage(logo, (-lw * k) / 2, (-lh * k) / 2, lw * k, lh * k);
    g.restore();
  });
  c.naturalWidth = w;
  c.naturalHeight = h;
  return c;
}

// A copy of img with the paint inside the polygons turned to `hex`.
function paint(img, polys, hex, paintHue) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  // The anchor mask: the polygons filled on a second canvas.
  const m = document.createElement('canvas');
  m.width = w;
  m.height = h;
  const mg = m.getContext('2d');
  mg.fillStyle = '#fff';
  for (const p of polys) {
    mg.beginPath();
    p.forEach(([x, y], i) => (i ? mg.lineTo(x * w, y * h) : mg.moveTo(x * w, y * h)));
    mg.closePath();
    mg.fill();
  }
  let data;
  let mask;
  try {
    data = g.getImageData(0, 0, w, h);
    mask = mg.getImageData(0, 0, w, h).data;
  } catch {
    return null; // a picture from another site can't be read: keep it as drawn
  }
  const [th, ts, tl] = hsl(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  const refL = 0.5; // the art's mid red; lighter / darker paint stays lighter / darker than the team colour
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!mask[i] || px[i + 3] < 8) continue;
    const [ph, ps, pl] = hsl(px[i], px[i + 1], px[i + 2]);
    if (ps < MIN_SAT || pl < 0.12 || pl > 0.9) continue;
    let d = Math.abs(ph - paintHue);
    if (d > 180) d = 360 - d;
    if (d >= HUE_NONE) continue;
    const k = (d <= HUE_FULL ? 1 : 1 - (d - HUE_FULL) / (HUE_NONE - HUE_FULL)) * (mask[i] / 255);
    const nl = Math.max(0.04, Math.min(0.94, tl * (pl / refL)));
    const [r, gg, b] = rgb(th, Math.min(1, ts * (0.6 + 0.4 * ps)), nl);
    px[i] += (r - px[i]) * k;
    px[i + 1] += (gg - px[i + 1]) * k;
    px[i + 2] += (b - px[i + 2]) * k;
  }
  g.putImageData(data, 0, 0);
  c.naturalWidth = w; // drawn like a loaded image (AssetManager / SpriteCache read these)
  c.naturalHeight = h;
  return c;
}

function hsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function rgb(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return v * 255;
  };
  return [f(h / 360 + 1 / 3), f(h / 360), f(h / 360 - 1 / 3)];
}

// Milestone 22: your car's picture, ready to draw — its resolved visual family (src/systems/carVisual.js, derived from the
// car, never saved), in the team colour, with the sponsors on the car (default: the ones on it now; a race passes its
// own). view: 'showcase' | 'race'.
export function carArtKey(assets, team, rec, view = 'showcase', sponsors = team?.sponsors?.decals() ?? []) {
  const fam = familyOfCar(rec, team);
  return liveryKey(assets, view === 'race' ? fam.top : fam.showcase, teamColourId(team), sponsors);
}
