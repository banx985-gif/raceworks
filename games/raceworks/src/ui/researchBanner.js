// "Research complete" (Milestone 11, style guide §7 medium feedback): a gold card that slides down under the top bar
// for a few seconds when a research node finishes — the node's name and the pictures of what it opened. It doesn't
// pause the game or take taps. One at a time (main.js queues them; more than a few in a row fold into "+N more").
//   researchBannerHeight() · drawResearchBanner(ctx, assets, { x, y, w }, item, life)   item: { node, fired, age, more }
import { THEME } from '../../../../core/Theme.js';
import { text, card } from '../../../../core/ui/Kit.js';
import { PARTS } from '../../data/cars.js';
import { FACILITIES } from '../../data/facilities.js';
import { TYRES } from '../../data/race.js';
import { RESEARCH_ICONS } from '../../data/research.js';
import { nodeLabel, NODE } from '../systems/research.js';

const C = THEME.color;
const S = THEME.size;
const H = 250;
const SLIDE = 0.25;
const FAC = Object.fromEntries(FACILITIES.map((f) => [f.id, f]));

const iconOf = (a) => (a.type === 'part' ? PARTS[a.id]?.art : a.type === 'facility' ? FAC[a.id]?.art : a.type === 'tyre' ? TYRES[a.id]?.icon : null);

export const researchBannerHeight = () => H;

export function drawResearchBanner(ctx, assets, { x, y, w }, item, life) {
  const t = item.age;
  const inF = Math.min(1, t / SLIDE);
  const outF = Math.min(1, Math.max(0, (life - t) / SLIDE));
  const f = Math.min(inF, outF);
  const r = { x, y: y - (1 - f) * (H + 40), w, h: H };
  ctx.save();
  ctx.globalAlpha = f;
  card(ctx, r, 'gold');
  // a quick shine across the card as it lands
  if (t < 0.9) {
    const sx = r.x + (t / 0.9) * (r.w + 200) - 100;
    const g = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, THEME.panel.radius);
    ctx.clip();
    ctx.fillStyle = g;
    ctx.fillRect(sx - 80, r.y, 160, r.h);
    ctx.restore();
  }
  assets.drawContained(ctx, RESEARCH_ICONS.rp, { x: r.x + 24, y: r.y + 24, w: 110, h: 110 });
  const tx = r.x + 156;
  const tw = r.w - 156 - 24;
  text(ctx, 'Research complete!', tx, r.y + 22, { size: S.heading, bold: true, color: C.actionDark, maxWidth: tw });
  text(ctx, `${item.node.name} · ${nodeLabel(item.node.id)}`, tx, r.y + 80, { size: S.body, bold: true, maxWidth: tw });
  const icons = (item.fired ?? []).map(iconOf).filter(Boolean).slice(0, 5);
  icons.forEach((k, i) => assets.drawContained(ctx, k, { x: tx + i * 96, y: r.y + 132, w: 84, h: 84 }));
  // The first bonus or note in words (e.g. "Engine Bench efficiency +5%"), then how many more finished in a row.
  const extra = (NODE[item.node.id]?.extra ?? []).filter((x) => (item.fired ?? []).some((a) => a.type === x.type && a.id === x.id));
  const tail = [extra.length ? `${extra[0].type === 'bonus' ? '+ ' : ''}${extra[0].text}` : '', item.more ? `+${item.more} more done` : ''].filter(Boolean).join(' · ');
  if (tail) text(ctx, tail, tx + icons.length * 96 + (icons.length ? 12 : 0), r.y + 160, { size: S.small, bold: true, color: C.textMuted, maxWidth: tw - icons.length * 96 - 12 });
  ctx.restore();
}
