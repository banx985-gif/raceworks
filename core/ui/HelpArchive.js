// The Help archive (BOTWORKS Milestone 26; any series game): opened from the top bar's Help button.
//   Topics      short pages (a picture from the game's art + a few paragraphs), one row each with its icon
//   Tips seen   every tutorial card the player has seen, to read again
//   and a switch to turn the guide off / back on.
// createHelpArchive({ renderer, layout, assets, router, guide, topics, text, fill })
//   topics: [{ id, title, icon, art, paras: [..] }] (game data) · text: labels (HELP_TEXT) · fill(step) → the step with
//   its run-specific words filled in (optional) · guide: core/GuideSystem (seenSteps, state.off, turnOn / turnOff)
//   enter({ back, topic }) — topic: open straight on that page
import { THEME, font, lineH } from '../Theme.js';
import { ScrollPanel } from './ScrollPanel.js';
import { drawButton, hitRect } from './Button.js';
import { card, text, para, listRow, listRowHeight, tabRects, drawTabs, tabAt, emptyState, stateHeight } from './Kit.js';

const C = THEME.color;
const S = THEME.size;
const HEAD_H = 150;
const TABS_H = 110;
const FOOT_H = 160;
const GAP = 16;

export function createHelpArchive({ renderer, layout, assets, router, guide, topics, text: T, fill = null }) {
  const W = renderer.width;
  let back = 'workshop';
  let tab = 'topics';
  let page = null; // an open topic
  let rows = [];
  const scroll = new ScrollPanel({ getRect: bodyRect, contentHeight: 0 });
  const TABS = [
    { id: 'topics', label: T.topicsTab },
    { id: 'seen', label: T.seenTab },
  ];

  const sr = () => layout.safeRect;
  const backRect = () => ({ x: sr().x + 24, y: sr().y + 24, w: 200, h: 110 });
  const tabsArea = () => ({ x: sr().x + 24, y: sr().y + HEAD_H, w: sr().w - 48, h: TABS_H });
  function bodyRect() {
    const s = sr();
    const y = s.y + HEAD_H + (page ? 0 : TABS_H + GAP);
    return { x: s.x + 24, y, w: s.w - 48, h: s.y + s.h - FOOT_H - y };
  }
  const toggleRect = () => ({ x: sr().x + 24, y: sr().y + sr().h - FOOT_H + 24, w: sr().w - 48, h: 110 });
  const seen = () => (guide?.seenSteps ?? []).map((s) => (fill ? fill(s) : s));

  const screen = {
    scroll,
    toggleRect,
    get tab() {
      return tab;
    },
    get page() {
      return page;
    },
    topicRect(id) {
      const r = rows.find((x) => x.id === id);
      if (!r) return null;
      const b = bodyRect();
      return { x: b.x + r.r.x, y: b.y + r.r.y - scroll.scrollY, w: r.r.w, h: r.r.h };
    },
    tabRect: (id) => tabRects(tabsArea(), TABS.length)[TABS.findIndex((t) => t.id === id)],
    open(id) {
      page = topics.find((t) => t.id === id) ?? null;
      scroll.scrollY = 0;
    },
    enter(params = {}) {
      back = params.back ?? (router.previous && router.previous !== 'help' ? router.previous : 'workshop');
      tab = params.tab ?? 'topics';
      page = params.topic ? topics.find((t) => t.id === params.topic) ?? null : null;
      scroll.scrollY = 0;
    },
    onBack() {
      if (page) {
        page = null;
        scroll.scrollY = 0;
        return true;
      }
      router.go(back);
      return true;
    },
    onTap(p) {
      if (hitRect(p, backRect())) return screen.onBack();
      if (hitRect(p, toggleRect())) return guide.state.off ? guide.turnOn() : guide.turnOff();
      if (!page) {
        const t = tabAt(p, tabRects(tabsArea(), TABS.length), TABS);
        if (t) {
          tab = t.id;
          scroll.scrollY = 0;
          return;
        }
      }
      if (page || tab !== 'topics' || !scroll.contains(p)) return;
      const q = scroll.toContent(p);
      const r = rows.find((x) => hitRect(q, x.r));
      if (r) screen.open(r.id);
    },
    onDragStart: (p) => scroll.beginDrag(p),
    onDrag: (p) => scroll.drag(p),
    onDragEnd: (p) => scroll.endDrag(p),
    render(ctx) {
      const s = sr();
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, renderer.height);
      drawButton(ctx, backRect(), T.back, { font: font(S.button, true) });
      if (page) {
        assets.drawContained(ctx, page.icon, { x: s.x + 240, y: s.y + 30, w: 96, h: 96 });
        text(ctx, page.title, s.x + 352, s.y + 78, { size: S.heading, bold: true, baseline: 'middle', maxWidth: s.w - 380 });
      } else {
        assets.drawContained(ctx, 'ui_icon_27', { x: s.x + 240, y: s.y + 30, w: 96, h: 96 });
        text(ctx, T.title, s.x + 352, s.y + 78, { size: S.title, bold: true, baseline: 'middle' });
        drawTabs(ctx, tabRects(tabsArea(), TABS.length), TABS, tab);
      }
      const w = bodyRect().w - 12;
      scroll.begin(ctx);
      let y = 0;
      rows = [];
      if (page) y = drawPage(ctx, w);
      else if (tab === 'topics') {
        for (const t of topics) {
          const row = { art: t.icon, title: t.title, lines: [{ text: t.paras[0], size: S.small, color: C.textMuted }], right: '›' };
          const h = listRowHeight(w, row);
          const r = { x: 0, y, w, h };
          listRow(ctx, assets, r, row);
          rows.push({ id: t.id, r });
          y += h + GAP;
        }
      } else {
        const list = seen();
        if (!list.length) {
          const st = { art: 'ui_icon_27', title: T.seenTab, text: T.noneSeen };
          const h = stateHeight(w, st);
          emptyState(ctx, assets, { x: 0, y, w, h }, st);
          y += h;
        }
        for (const st of list) {
          const bodyH = para(null, st.text, 0, 0, w - 56, { size: S.body });
          const h = 30 + lineH(S.button, 1.3) + bodyH + 26;
          card(ctx, { x: 0, y, w, h });
          text(ctx, st.title, 28, y + 26, { size: S.button, bold: true, maxWidth: w - 56 });
          para(ctx, st.text, 28, y + 26 + lineH(S.button, 1.3), w - 56, { size: S.body });
          y += h + GAP;
        }
      }
      scroll.contentHeight = Math.max(1, y);
      scroll.end(ctx);
      drawButton(ctx, toggleRect(), guide.state.off ? T.guideOn : T.guideOff, { accent: C.progress, font: font(S.button, true) });
    },
  };

  // A topic page: its picture, then its paragraphs.
  function drawPage(ctx, w) {
    let y = 0;
    const ph = Math.min(560, Math.round(w * 0.6));
    card(ctx, { x: 0, y, w, h: ph + 40 });
    assets.drawContained(ctx, page.art, { x: 20, y: y + 20, w: w - 40, h: ph });
    y += ph + 40 + 28;
    for (const t of page.paras) {
      y += para(ctx, t, 8, y, w - 16, { size: S.body }) + 26;
    }
    return y;
  }

  return screen;
}
