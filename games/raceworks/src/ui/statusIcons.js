// Tired / Stressed / Inspired icons (bible §10.4), drawn by code until the series' shared status icons are in the
// shared art/ library (the art list reuses them; Robot Workshop's copies live in its own folder, which this game
// can't reach). Made once at start as images in the AssetManager, so every screen draws them like any other art.
//   STATUS_ORDER  which icons show first      statusIconsOf(staff) → asset keys for the statuses that are on
//   loadStatusIcons(assets) → Promise
import { THEME } from '../../../../core/Theme.js';

const C = THEME.color;
export const STATUS_ORDER = ['stressed', 'tired', 'inspired'];
export const STATUS_KEY = { tired: 'status_tired', stressed: 'status_stressed', inspired: 'status_inspired' };
export const STATUS_NAME = { tired: 'Tired', stressed: 'Stressed', inspired: 'Inspired' };

export const statusIconsOf = (staff) => STATUS_ORDER.filter((k) => staff.status?.[k]).map((k) => STATUS_KEY[k]);

const S = 128;
const DRAW = {
  // A crescent moon on purple.
  tired(g) {
    disc(g, C.purple);
    g.fillStyle = '#FFF3C4';
    g.beginPath();
    g.arc(S * 0.5, S * 0.5, S * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.purple;
    g.beginPath();
    g.arc(S * 0.62, S * 0.4, S * 0.26, 0, Math.PI * 2);
    g.fill();
  },
  // An exclamation mark on red.
  stressed(g) {
    disc(g, C.bad);
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.roundRect(S * 0.43, S * 0.2, S * 0.14, S * 0.4, S * 0.07);
    g.fill();
    g.beginPath();
    g.arc(S * 0.5, S * 0.75, S * 0.08, 0, Math.PI * 2);
    g.fill();
  },
  // A star on gold.
  inspired(g) {
    disc(g, C.gold);
    g.fillStyle = '#FFF3C4';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? S * 0.15 : S * 0.34;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(S * 0.5 + Math.cos(a) * r, S * 0.52 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  },
};

function disc(g, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = C.outline;
  g.lineWidth = 8;
  g.stroke();
}

export function loadStatusIcons(assets) {
  return Promise.all(
    Object.entries(DRAW).map(([k, draw]) => {
      const c = document.createElement('canvas');
      c.width = S;
      c.height = S;
      draw(c.getContext('2d'));
      return assets.loadImage(STATUS_KEY[k], c.toDataURL('image/png'));
    }),
  );
}
