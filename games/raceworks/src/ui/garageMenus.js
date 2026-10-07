// Garage sheets. One registry, so every way in — tapping a station or a worker, a bottom-bar button, the Build
// sheet's "Pit Bay" button — opens exactly the same menu. Built again every frame while open, so states stay live.
//   open(kind, target) opens another menu in the same sheet (it replaces the open one; sheets never stack).
//   goRoster() · goStaff(id) open the staff screens (Milestone 3).
//   goBuilder() · goCarGarage() open the car screens (Milestone 4). debug: extra buttons with ?debug=1.
//   goMainMenu() saves and returns to the main menu (Milestone 4b: from the Money sheet, "saving" lives there).
// Milestone 5: the Money sheet (src/ui/moneyMenu.js), the Pit Bay's Emergency Fix and running cost. toast(text) says
//   why something was refused.
// Milestone 10: every station's sheet shows its effect (bible §19) and leads to Build Mode; in Build Mode, 'facility'
//   (a tapped station: effect, sell for 50%) and 'shop' (build a facility: F01–F15 with cost, effect or why not). The
//   Build sheet's Facilities / Shop buttons open Build Mode, and it lists the garage's wings.
// Milestone 11: the Research sheet — bottom-bar Research, the Strategy Desk and the research stations (CFD Station,
//   Engine Lab) — RP, the node being researched (progress, days left, Stop), the locked second queue and "Research tree"
//   (goResearch). A research station's sheet also shows its effect and Build Mode.
// Milestone 22: the Research sheet's Parts Archive → Combo Archive (discovered: name, recipe, reward; else ??? and its
//   clue once a near-miss happened) and Rumour Archive (clues and recipes); the Compete sheet's "Your car" card (the
//   resolved visual family in the team colour with its sponsors).
// Milestone 12: the Staff sheet's Hire (goRecruit) and Train (goTrain); the Driver Simulator's Training; the Sponsor Wall
//   (front desk) leads to Recruitment; a worker's sheet has Train (or their course and days left).
// Milestone 23: the Inbox (top bar) — every event newest first (● unread), tap one to see its card again (a choice once
//   made stays locked); Rumour Archive and Mark all read at the top.
// Milestone 25b (series common features): every station's sheet starts with its main action (data/menu.js
//   FACILITY_ACTIONS → menuRow(row), the Menu's own code path) and ends with its level (1–3) and Upgrade; Build Mode's
//   sheet has Upgrade too and its Sell pays half of the build price and the upgrades. The Parts Store ('store' → 'item' →
//   'giveItem' → 'giveConfirm', and 'giveTo' from a person) gives items to staff; the Sponsor Wall shows its logo slots;
//   Help (top bar) leads to Settings (openSettings) so Settings is reachable with the Menu button off.
// Milestone 26: the Records screen ('records', src/ui/recordsMenu.js: achievements, records, medals, completion), from the
//   Staff sheet, the Compete sheet and the Menu. The Rumour Archive never says how many secrets exist before the ending.
// Milestone 21: the Sponsor Wall's sheet also has Sponsors — the 'sponsors' sheet (src/ui/sponsorMenu.js, the same as the
//   Money sheet's Sponsors tab): slots, deals, obligation progress and the offers.
// Milestone 29 (the screen / UX pass): every station, facility and worker sheet comes from the one shared builder
//   (core/ui/StationSheet: picture · name · one line · Now · main action · more · Upgrade, and Help in the header); a
//   sheet opened from another has a "‹" button that does what the phone's Back does (sheetBack, main.js); a
//   championship's own sheet ('champ': rounds, tracks, what it needs, prizes, standings, Enter); every list says why it
//   is empty and what to do next; the Build sheet lists the project types still to come.
import { MenuRegistry } from '../../../../core/ui/BottomSheet.js';
import { THEME } from '../../../../core/Theme.js';
import { STATIONS } from '../../data/garage.js';
import { BOTTOM_SLOTS } from '../../data/home.js';
import { ROLES, TIERS } from '../../data/staff.js';
import { STATUS_ORDER, STATUS_NAME } from './statusIcons.js';
import { PHASES, BUDGETS, BUDGET_ORDER, CLASSES, PROJECT } from '../../data/cars.js';
import { leadRole } from '../systems/carProject.js';
import { FOUNDER_FLAG } from '../../data/setup.js';
import { COSTS } from '../../data/economy.js';
import { moneyMenu, fmt } from './moneyMenu.js';
import { sponsorSections } from './sponsorMenu.js'; // Milestone 21
import { carArtKey } from './livery.js'; // Milestone 22
import { familyOfCar } from '../systems/carVisual.js';
import { FAMILY_NAMES, PARTS, SLOTS } from '../../data/cars.js';
import { COMBOS, comboById } from '../../data/combos.js';
import { unlockContext, partState } from '../systems/carCatalog.js';
import { BUILD_TEXT } from '../../data/facilities.js';
import { liveryKey, teamColourId } from './livery.js';
import { RESEARCH_ICONS } from '../../data/research.js';
import { NODE, nodeLabel } from '../systems/research.js';
import { TRACKS, TRACK_IDS, geoOf } from '../race/tracks.js'; // Milestone 19
import { champById, TROPHY_ART } from '../../data/championships.js'; // Milestone 20
import { RIVAL_TEAMS } from '../../data/rivals.js';
import { FACILITY_ACTIONS, MENU_GROUPS } from '../../data/menu.js'; // Milestone 25b
import { ITEM_RARITIES, ITEM_RULES, ITEM_TEXT, ITEM_SOURCES, itemTypeById, itemGroupById } from '../../data/items.js';
import { STAT_NAMES } from '../../data/staff.js';
import { itemIcon } from '../../../../core/ui/ItemArt.js';
import { sponsorById } from '../../data/sponsors.js';
import { recordsMenu } from './recordsMenu.js'; // Milestone 26
import { stationSheet } from '../../../../core/ui/StationSheet.js'; // Milestone 29
import { CHAMP_BANDS } from '../../data/championships.js';
import { EMPTY_TEXT, SECRET_TEXT as SECRET_WORD, STORE_TEXT } from '../../data/screens.js';
import { BUILD_SHEET } from '../../data/menu.js';

const C = THEME.color;

// "Driver · Level 1 · Standard · Tired" — shared by the sheet, the roster and the detail screen.
export function staffLine(s) {
  const status = STATUS_ORDER.filter((k) => s.status?.[k]).map((k) => STATUS_NAME[k]);
  return [ROLES[s.role].name, `Level ${s.level}`, TIERS[s.tier].name, ...status].join(' · ');
}

export function createGarageMenus({ garage, team, assets = null, open, close = () => {}, goRoster, goStaff, goBuilder, goCarGarage, goMainMenu = null, debug = null, toast = () => {}, goTestRace = null, goRaceResult = null, goWeekend = null, goResearch = () => {}, goRecruit = () => {}, goTrain = () => {}, debugTracks = null, goChampRound = () => {}, enterChamp = () => {}, menuRow = () => {}, menuState = () => ({}), openSettings = () => {}, showHelp = () => {}, sfx = () => {}, haptic = () => {}, sheetBack = null, sheetBackLabel = () => null, refuse = null }) {
  const menus = new MenuRegistry();
  const fac = team.facilities;
  // What a facility does, for its sheets (bible §19): its effect, its role and what it cost.
  const effectLines = (def) => [
    { text: `Effect: ${def.effectText}`, color: C.actionDark },
    `${def.role} station${def.cost ? ` · built for ${fmt(def.cost)} Credits` : ''}`,
  ];
  const enterBuild = () => garage().setBuildMode(true);
  // --- Milestone 25b: the main action and the level ---------------------------------------------------------------
  const rowOf = (id) => MENU_GROUPS.flatMap((g) => g.rows).find((r) => r.id === id) ?? null;
  const uidOf = (defId, st = null) => st?.uid ?? fac.items().find((p) => p.def === defId)?.uid ?? null;
  function mainActionSection(defId) {
    const act = FACILITY_ACTIONS[defId];
    if (!act) return [];
    const row = rowOf(act.row);
    const st = menuState(act.row) ?? {};
    return [{ columns: 1, buttons: [{ id: 'mainAction', label: act.label, sub: st.locked ?? row?.line ?? '', icon: row?.icon ?? 'race_ui_01', locked: !!st.locked, accent: C.action, onTap: () => !st.locked && menuRow(act.row) }] }];
  }
  const multText = (m) => `×${Number.isInteger(m) ? m : m.toFixed(1)}`;
  const say = refuse ?? ((r) => toast(r));
  // Milestone 29: the station sheet's Upgrade part (core/ui/StationSheet upgrade): what it does now, its level, the next
  // level's cost and effect, and the rule that keeps it shut (a greyed Upgrade button with the reason).
  function upgradeOf(uid, def, reopen) {
    const lines = def && !def.prop ? [{ text: `Effect: ${def.effectText}`, color: C.actionDark }, `${def.role} station${def.cost ? ` · built for ${fmt(def.cost)} Credits` : ''}`] : [];
    const ls = uid != null ? fac.levelStatus(uid) : null;
    const buttons = [];
    if (ls) {
      lines.push({ text: `Level ${ls.level} of ${ls.max}${ls.level > 1 ? ` — its effect ${multText(ls.mult)}` : ''}`, color: C.actionDark });
      if (ls.pending) lines.push({ text: `Upgrading to level ${ls.pending.to}: ready on day ${ls.pending.doneDay + 1} (it works at level ${ls.level} until then)`, color: C.progress });
      else if (!ls.next) lines.push({ text: 'Top level: it can’t go higher', color: C.good });
      if (ls.next && !ls.pending) {
        const bonus = fac.defs[ls.defId].effects.some((e) => e.levelOnly) ? ' and an upgrade bonus' : '';
        buttons.push({ id: 'upgrade', label: `Upgrade to level ${ls.next.to}`, sub: ls.next.why ?? `its effect ${multText(ls.next.mult)}${bonus} · ${ls.next.days} days`, cost: ls.next.ok ? `${fmt(ls.next.cost)} Cr` : null, icon: 'race_ui_01', disabled: !ls.next.ok, accent: C.purple, onTap: () => {
          const r = fac.upgrade(uid);
          if (!r.ok) return say(r.reason);
          sfx('sfx_upgrade');
          toast(`${fac.defs[ls.defId].name}: upgrading to level ${r.to}`, `−${fmt(r.cost)} Credits · ready in ${ls.next.days} days`);
          reopen();
        } });
      }
    }
    return { lines, buttons };
  }
  // Who is at a station right now (the garage's workers), in plain words.
  const atStation = (defId) => {
    const names = garage().peopleAt?.(defId) ?? [];
    return names.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''} ${names.length === 1 ? 'is' : 'are'} here now` : 'Nobody here right now';
  };
  // A sheet opened from another: its "‹" button is the phone's Back (main.js sheetBack); with no sheet under it, it goes
  // to its parent sheet (menu.parent). The label names the sheet it returns to.
  const backButton = (id, parentLabel) => ({ id, label: sheetBackLabel() ?? `‹ ${parentLabel}`, accent: C.progress, onTap: () => sheetBack?.() });

  // --- Milestone 25b: the Sponsor Wall's logo slots ------------------------------------------------------------------
  function logoSlotSections() {
    const sp = team.sponsors;
    const n = sp.slots();
    const buttons = [];
    for (let i = 0; i < n; i++) {
      const d = sp.deals[i];
      const def = d ? sponsorById(d.id) : null;
      buttons.push(def ? { id: `logo_${i}`, label: def.name, sub: `On the car · ${sp.daysLeft(d)} days left`, icon: def.logo, accent: C.good, onTap: () => open('sponsors') } : { id: `logo_${i}`, label: 'Empty slot', sub: sp.offers.length ? 'Sign an offer to fill it' : 'Offers come each month', icon: 'race_ui_26', accent: C.outline, onTap: () => open('sponsors') });
    }
    return [{ title: `Logo slots · ${sp.deals.length} of ${n}`, columns: Math.min(3, Math.max(1, n)), buttons }];
  }

  // --- Milestone 25b: the Parts Store (items) -------------------------------------------------------------------------
  const items = team.items;
  const statWord = (k) => (k === 'FIT' ? 'Energy recovery' : STAT_NAMES[k] ?? k);
  const itemName = (x) => itemTypeById(x.type)?.name ?? x.type;
  const itemLine = (x) => {
    const t = itemTypeById(x.type);
    const r = ITEM_RARITIES[x.rarity];
    return `${r.name} · ${itemGroupById(t.group).name} · ${statWord(t.stat)} +${r.gain}${t.stat === 'FIT' ? '%' : ''}`;
  };
  const likeWord = (pv) => (pv.like === 'love' ? `loves it ×${ITEM_RULES.loveMult} and Morale +${ITEM_RULES.loveMorale}` : pv.like === 'dislike' ? `not their thing ×${ITEM_RULES.dislikeMult}` : 'no strong feelings');
  const capWord = (pv) => (pv.capped === 'tier' ? ' · capped by their tier' : pv.capped === 'period' ? ' · capped by this season’s item points' : '');
  const gainText = (pv) => (pv.ok ? `+${pv.gain} ${statWord(pv.stat)}${pv.stat === 'FIT' ? '%' : ''} (${likeWord(pv)})${capWord(pv)}` : pv.why);
  const storeButton = () => ({ id: 'partsStore', label: ITEM_RULES.storeName, sub: `${items.count} of ${items.max} items · give them to staff`, icon: ITEM_RULES.storeIcon, accent: C.progress, onTap: () => open('store') });
  menus.register('store', () => ({
    title: ITEM_RULES.storeName,
    subtitle: `${items.count} of ${items.max} items · earned, never bought`,
    art: ITEM_RULES.storeIcon,
    accent: C.progress,
    sections: items.count
      ? [{ lines: [ITEM_TEXT.storeLine] }, { columns: 1, buttons: items.store().map((x) => ({ id: `item_${x.uid}`, label: itemName(x), sub: `${itemLine(x)} · ${ITEM_SOURCES[x.source]?.text ?? ''}`, icon: itemIcon(x.type, x.rarity), accent: C.progress, onTap: () => open('item', x.uid) })) }]
      : [{ lines: [ITEM_TEXT.empty] }],
  }));
  menus.register('item', (uid) => {
    const x = items.system.get(uid);
    if (!x) return null;
    const value = items.system.sellValue(uid);
    return {
      title: itemName(x),
      subtitle: itemLine(x),
      art: itemIcon(x.type, x.rarity),
      accent: C.progress,
      parent: 'store', // (Milestone 29: Back returns here when the sheet was not opened from another)
      sections: [
        { lines: [`Given to one person, it raises their ${statWord(itemTypeById(x.type).stat)} for good, then it is used up. People who love ${itemGroupById(itemTypeById(x.type).group).name} kit get ×${ITEM_RULES.loveMult}.`] },
        { columns: 1, buttons: [
          { id: 'giveItem', label: ITEM_TEXT.give, sub: 'Pick who gets it: see the exact gain first', icon: 'race_ui_02', accent: C.good, onTap: () => open('giveItem', uid) },
          { id: 'sellItem', label: `Sell the spare for ${fmt(value)} Credits`, sub: 'It goes for good', icon: 'race_ui_05', accent: C.bad, onTap: () => {
            const v = items.sell(uid);
            if (v != null) toast(`Sold: ${itemName(x)}`, `+${fmt(v)} Credits`);
            open('store');
          } },
          backButton('backStore', ITEM_RULES.storeName),
        ] },
      ],
    };
  });
  menus.register('giveItem', (uid) => {
    const x = items.system.get(uid);
    if (!x) return null;
    return {
      parent: { kind: 'item', target: uid },
      title: `Give: ${itemName(x)}`,
      subtitle: `${itemLine(x)} · tap someone to see the exact gain`,
      art: itemIcon(x.type, x.rarity),
      accent: C.progress,
      sections: [
        { columns: 1, buttons: team.roster.map((p) => {
          const pv = items.preview(uid, p.id);
          return { id: `give_${p.id}`, label: p.name, sub: gainText(pv), icon: p.art, disabled: !pv.ok, accent: pv.like === 'love' ? C.good : C.progress, onTap: () => open('giveConfirm', { uid, id: p.id }) };
        }) },
        { columns: 1, buttons: [backButton('backItem', itemName(x))] },
      ],
    };
  });
  menus.register('giveConfirm', (t) => {
    const x = t && items.system.get(t.uid);
    const p = t && team.get(t.id);
    if (!x || !p) return null;
    const pv = items.preview(t.uid, t.id);
    const lk = items.likesOf(t.id);
    return {
      parent: { kind: 'giveItem', target: t.uid },
      title: `${itemName(x)} → ${p.name}`,
      subtitle: 'Used up when given · the gain is for good',
      art: p.art,
      accent: C.good,
      sections: [
        { lines: [
          { text: pv.ok ? `${statWord(pv.stat)}: ${pv.now} → ${pv.now + pv.gain} (+${pv.gain})` : pv.why, color: pv.ok ? C.good : C.bad },
          `Base ${pv.base ?? '—'} · ${likeWord(pv)}${capWord(pv)}`,
          `Loves: ${lk.loves.map((g) => itemGroupById(g)?.name ?? g).join(', ') || '—'}${lk.dislike ? ` · not keen on ${itemGroupById(lk.dislike)?.name}` : ''} · item points left this season: ${items.pointsLeft(t.id)} of ${ITEM_RULES.periodCap}`,
        ] },
        { columns: 2, buttons: [
          { id: 'giveYes', label: `Give (+${pv.gain ?? 0})`, sub: `To ${p.name.split(' ')[0]}`, icon: itemIcon(x.type, x.rarity), disabled: !pv.ok, accent: C.good, onTap: () => {
            const r = items.give(t.uid, t.id);
            if (!r.ok) return toast(r.why ?? 'It can’t be given');
            sfx('sfx_item');
            haptic('light');
            toast(`${p.name.split(' ')[0]}: +${r.gain} ${statWord(r.stat)}`, r.like === 'love' ? 'They love it!' : itemName(x));
            open('store');
          } },
          { ...backButton('giveNo', 'Back'), label: sheetBackLabel() ?? '‹ Back' },
        ] },
      ],
    };
  });
  // From a person (their details): pick an item for them.
  menus.register('giveTo', (id) => {
    const p = team.get(id);
    if (!p) return null;
    return {
      title: `An item for ${p.name}`,
      subtitle: `${items.count} in the ${ITEM_RULES.storeName} · tap one to see the exact gain`,
      art: p.art,
      accent: C.progress,
      sections: items.count
        ? [{ columns: 1, buttons: items.store().map((x) => {
            const pv = items.preview(x.uid, id);
            return { id: `giveTo_${x.uid}`, label: itemName(x), sub: gainText(pv), icon: itemIcon(x.type, x.rarity), disabled: !pv.ok, accent: pv.like === 'love' ? C.good : C.progress, onTap: () => open('giveConfirm', { uid: x.uid, id }) };
          }) }]
        : [{ lines: [ITEM_TEXT.empty] }],
    };
  });
  const buildButton = () => ({ id: 'buildMode', label: 'Build Mode', sub: 'Move, sell or build stations', icon: 'race_ui_01', accent: C.progress, onTap: enterBuild });
  // The Research sheet (Milestone 11): what is being researched, RP, the queues and the way into the tree.
  const research = team.research;
  function researchSections() {
    const act = research.active;
    const q2 = research.secondQueue;
    const lines = [{ text: `${fmt(research.rp)} RP · ${research.system.doneCount} of 36 topics done`, color: C.actionDark }];
    const bars = [];
    const buttons = [{ id: 'researchTree', label: 'Research tree', sub: act ? 'Six branches: parts, facilities, tyres' : 'Pick what to research next', icon: RESEARCH_ICONS.tree, onTap: goResearch }];
    if (act) {
      const days = research.daysLeft();
      lines.push(`Researching: ${NODE[act].name} (${nodeLabel(act)}) · about ${days === Infinity ? '—' : days} day${days === 1 ? '' : 's'} left`);
      bars.push({ label: 'Progress', value: Math.floor(research.fraction(act) * 100), max: 100, text: `${Math.floor(research.fraction(act) * 100)}%` });
      buttons.push({ id: 'researchStop', label: 'Stop', sub: 'Keeps its progress', accent: C.progress, onTap: () => research.stop() });
    } else lines.push({ text: 'Nothing being researched: open the tree and start a topic.', color: C.bad });
    return [
      { lines, bars },
      { columns: 1, buttons },
      { columns: 1, buttons: [{ id: 'queue2', label: 'Second queue', sub: q2.open ? 'Open' : q2.why, icon: RESEARCH_ICONS.tree, locked: !q2.open, onTap: () => {} }] },
      // Milestone 22: the archives
      { columns: 1, buttons: [{ id: 'partsArchive', label: 'Parts Archive', sub: `Parts and combos · ${COMBOS.filter((c) => team.combos.discovered(c.id)).length} of 20 combos found`, icon: 'race_ui_03', accent: C.progress, onTap: () => open('partsArchive') }] },
    ];
  }
  // Milestone 12: the Hire / Train buttons (Staff sheet, Driver Simulator, Sponsor Wall).
  const hireButton = () => {
    const rec = team.recruitment;
    return { id: 'hire', label: 'Hire', sub: `${team.roster.length} of ${rec.staffCap()} · new faces in ${rec.freeInDays()} days`, icon: 'race_ui_02', accent: C.good, onTap: () => goRecruit() };
  };
  const trainButton = (id = null) => {
    const tr = team.training;
    const busy = tr.active.length;
    return { id: 'train', label: 'Train', sub: !tr.open() ? tr.lockedText : busy ? `${busy} on a course now` : 'Seven courses · Credits and days', icon: 'race_ui_02', accent: C.progress, onTap: () => goTrain(id) };
  };
  // Milestone 21: the Sponsor Wall leads to the sponsors too
  const sponsorsButton = () => {
    const sp = team.sponsors;
    return { id: 'sponsors', label: 'Sponsors', sub: `${sp.deals.length} of ${sp.slots()} slots · ${sp.offers.length} offer${sp.offers.length === 1 ? '' : 's'}`, icon: 'race_ui_02', accent: C.progress, onTap: () => open('sponsors') };
  };
  const extraFor = { F12: () => [trainButton()], F13: () => [storeButton()], F15: () => [sponsorsButton(), hireButton()] };
  // Milestone 29: the Store (bible §7) — a placeholder sheet only: the four rows, each "coming later". No billing (M31).
  menus.register('shopStore', () => ({
    title: STORE_TEXT.title,
    subtitle: STORE_TEXT.line,
    art: 'race_reward_02',
    accent: C.progress,
    sections: [
      { columns: 1, buttons: STORE_TEXT.rows.map((r) => ({ id: `store_${r.id}`, label: r.label, sub: `${r.line} · ${STORE_TEXT.later}`, icon: r.icon, locked: true, onTap: () => {} })) },
      { lines: [{ text: STORE_TEXT.never, color: C.textMuted }] },
    ],
  }));
  menus.register('sponsors', () => ({ title: 'Sponsors', subtitle: `${team.sponsors.deals.length} of ${team.sponsors.slots()} slots · Rank ${team.money.rank}`, art: 'race_ui_02', accent: C.progress, sections: sponsorSections(team, toast) }));

  // Milestone 29: a station's live "Now" — what is happening there, in plain words.
  function nowFor(def) {
    const out = [];
    if (def.research) {
      const act = research.active;
      out.push(act ? `Researching ${NODE[act].name} · ${Math.floor(research.fraction(act) * 100)}%` : { text: EMPTY_TEXT.research, color: C.bad });
    } else if (def.id === 'F12') {
      const n = team.training.active.length;
      out.push(n ? `${n} on a course now` : { text: EMPTY_TEXT.training, color: C.textMuted });
    } else if (def.id === 'F13') out.push(items.count ? `${items.count} item${items.count === 1 ? '' : 's'} waiting to be given` : { text: ITEM_TEXT.empty, color: C.textMuted });
    else if (def.id === 'F14') out.push(team.cars.cars.count ? `${team.cars.cars.count} car${team.cars.cars.count === 1 ? '' : 's'} · newest: ${team.cars.cars.latest()?.name ?? ''}` : { text: EMPTY_TEXT.cars, color: C.textMuted });
    else if (def.id === 'F15') out.push(`${team.sponsors.deals.length} of ${team.sponsors.slots()} logo slots filled · ${team.sponsors.offers.length} offer${team.sponsors.offers.length === 1 ? '' : 's'}`);
    else if (FACILITY_ACTIONS[def.id]?.row === 'raceWeekend' || FACILITY_ACTIONS[def.id]?.row === 'championships') {
      const n = CH?.nextRound?.();
      out.push(team.races.current ? 'A race weekend is under way' : n ? `Next round: ${TRACKS[n.trackId].name} · ${n.ready ? 'ready to race' : `in ${n.daysAway} days`}` : 'No championship round to race: enter one from Compete');
    }
    out.push({ text: atStation(def.id), color: C.textMuted });
    return out;
  }
  for (const def of STATIONS) {
    if (def.id === 'F02') continue; // the Pit Bay's sheet is the car project's (below)
    menus.register(def.id, (st) => stationSheet({
      title: def.name,
      line: def.purpose,
      art: def.art ?? 'race_ui_02',
      now: nowFor(def),
      main: mainActionSection(def.id)[0]?.buttons ?? [],
      more: [...(extraFor[def.id]?.() ?? []), ...(def.research ? [{ id: 'researchTree', label: 'Research tree', sub: 'Six branches', icon: RESEARCH_ICONS.tree, onTap: goResearch }, { id: 'partsArchive', label: 'Parts Archive', sub: 'Parts and combos', icon: 'race_ui_03', onTap: () => open('partsArchive') }] : []), buildButton()],
      body: def.id === 'F15' ? logoSlotSections() : [],
      upgrade: upgradeOf(uidOf(def.id, st), def, () => open(def.id, st)),
    }));
  }

  // Build Mode (Milestone 10): a tapped station or prop — what it does, and Sell (half its price back) when it may go.
  menus.register('facility', (st) => {
    if (!st || !fac.system.get(st.uid)) return null;
    garage().setSheetTarget?.(st);
    const def = st.def;
    const why = fac.sellWhy(st.uid);
    const refund = fac.refundOf(st.uid);
    return stationSheet({
      title: def.name,
      line: def.prop ? 'Garage prop' : def.purpose,
      art: def.art,
      now: ['In Build Mode: drag it on the floor to move it', ...(def.prop ? [] : [{ text: atStation(def.id), color: C.textMuted }])],
      main: [
        {
          id: 'sell',
          label: why ? 'Can’t sell' : `Sell for ${fmt(refund)} Credits`,
          sub: why ?? (fac.system.invested(st.uid) ? `Half of its ${fmt(def.cost)} Credits and of its ${fmt(fac.system.invested(st.uid))} in upgrades back` : `Half of its ${fmt(def.cost)} Credits back`),
          icon: def.art,
          disabled: !!why,
          accent: C.bad,
          onTap: () => {
            const r = fac.sell(st.uid);
            if (!r.ok) return say(r.reason);
            toast(`Sold: ${def.name}`, `+${fmt(r.refund)} Credits`);
            garage().say(`Sold: ${def.name} (+${fmt(r.refund)} Credits)`);
            close();
          },
        },
      ],
      upgrade: upgradeOf(st.uid, def, () => open('facility', st)), // (Milestone 25b: the level)
    });
  });
  // The Shop (Milestone 10): every facility of the first fifteen, ready ones first; Build places it on the free spot
  // nearest the middle of the view and pays through the ledger.
  menus.register('shop', () => {
    const debt = team.money.economy.isBlocked('facility');
    return {
      title: 'Build a facility',
      subtitle: debt ? BUILD_TEXT.debt : `You have ${fmt(team.money.credits)} Credits · sell back for half`,
      art: 'race_ui_01',
      accent: C.progress,
      sections: [
        {
          columns: 1,
          buttons: fac.shopList().map((s) => ({
            id: `buy_${s.def.id}`,
            label: s.owned ? `${s.def.name} ✓` : s.def.name,
            sub: (s.def.unlock?.secret ? `${SECRET_WORD.found} · ` : '') + (s.ok ? `${fmt(s.cost ?? s.def.cost)} Credits${s.discountPct ? ` (−${s.discountPct}% blueprint)` : ''} · ${s.def.effectText}` : `${s.why} · ${s.def.effectText}`),
            icon: s.def.art,
            disabled: !s.ok,
            locked: s.locked,
            onTap: () => {
              const r = fac.buy(s.def.id, garage().viewCell());
              if (!r.ok) return toast(r.reason);
              toast(`Built: ${s.def.name}`, `−${fmt(r.cost)} Credits`);
              close();
              garage().built(r.item, r.cost);
            },
          })),
        },
      ],
    };
  });

  // The Pit Bay (Milestone 4): "New car" when it is free; while a car is being built, the project's numbers
  // (the show itself plays on the bay).
  const pitBay = STATIONS.find((s) => s.id === 'F02');
  const garageButton = () => ({ id: 'carGarage', label: 'Car Garage', sub: `${team.cars.cars.list().length} finished`, icon: 'race_ui_01', accent: C.progress, onTap: goCarGarage });
  menus.register('F02', () => {
    const cars = team.cars;
    const job = cars.active;
    const upgrade = upgradeOf(uidOf('F02'), pitBay, () => open('F02'));
    if (!job) {
      const can = team.canStartCar();
      return stationSheet({
        title: pitBay.name,
        line: pitBay.purpose,
        art: pitBay.art,
        now: [can.ok ? 'Free: ready for a new car' : { text: `Free · ${can.reason}`, color: C.bad }, { text: atStation('F02'), color: C.textMuted }],
        main: [{ id: 'newCar', label: 'New car', sub: can.ok ? 'Choose a class and parts' : can.reason, icon: assets ? liveryKey(assets, CLASSES.clubHatch.art, teamColourId(team)) : CLASSES.clubHatch.art, disabled: !can.ok, onTap: goBuilder }],
        more: [garageButton()],
        upgrade,
      });
    }
    const phase = cars.phase(job);
    const pct = Math.floor(cars.fraction(job) * 100);
    const days = cars.daysLeft(job);
    const teamList = cars.team(job);
    const lead = teamList.find((s) => s.role === leadRole(phase));
    const open = cars.openFaults(job);
    const budgetButtons = BUDGET_ORDER.map((id) => {
      const now = job.data.budget === id;
      const next = job.data.nextBudget === id;
      return { id: `budget_${id}`, label: BUDGETS[id].name, sub: now ? (job.data.nextBudget ? 'This phase' : 'Now') : next ? 'From next phase' : 'Tap: next phase', accent: now || next ? C.progress : C.action, onTap: () => cars.setNextBudget(job, id) };
    });
    const body = [
      {
        lines: [
          `In the bay: ${phase.stage}`,
          { text: `Faults: ${open} open (${job.data.faults.length} so far) · Breakthroughs: ${job.data.breakthroughs.length}`, color: open ? C.bad : C.text },
          `Team (${teamList.length} of ${PROJECT.teamSlots}): ${teamList.map((s) => s.name.split(' ')[0]).join(', ')}${lead ? ` · ${lead.name.split(' ')[0]} leads this phase (+${PROJECT.roleMatchPct}%)` : ''}`,
          `Budget focus (changes between phases): ${BUDGETS[job.data.budget].name}${job.data.nextBudget ? ` → ${BUDGETS[job.data.nextBudget].name} next phase` : ''}`,
          { text: `Running cost: ${fmt(team.money.carDailyCost(job))} Credits a day`, right: `−${fmt(team.money.carDailyCost(job))}` },
        ],
      },
      { buttons: budgetButtons, columns: 3 },
    ];
    if (debug) {
      body.push({
        title: 'Debug',
        buttons: [
          { id: 'dbgDays', label: '+5 days', accent: C.purple, onTap: () => debug.days(5) },
          { id: 'dbgPhase', label: 'Finish phase', accent: C.purple, onTap: () => debug.finishPhase() },
          { id: 'dbgFault', label: 'Fault now', accent: C.purple, onTap: () => cars.debugFault(job) },
          { id: 'dbgBreak', label: 'Breakthrough', accent: C.purple, onTap: () => cars.debugBreakthrough(job) },
        ],
      });
    }
    return stationSheet({
      title: `${pitBay.name} · ${job.name}`,
      line: `Building: ${phase.stage.toLowerCase()} (${phase.name})`,
      art: pitBay.art,
      now: [`Phase ${job.phaseIndex + 1} of ${PHASES.length}: ${phase.name} · ${pct}% · about ${days} day${days === 1 ? '' : 's'} left`],
      main: [
        {
          id: 'emergencyFix',
          label: 'Emergency Fix',
          sub: open ? `Fix one fault now · −${COSTS.emergencyFix.innovation} Innovation` : 'No open faults',
          cost: open ? `${fmt(COSTS.emergencyFix.credits)} Cr` : null,
          disabled: !open || !team.money.affordable(COSTS.emergencyFix.credits),
          accent: C.bad,
          onTap: () => {
            const r = team.money.emergencyFix(job);
            if (!r.ok) return say(r.reason);
            toast('Fault fixed');
          },
        },
      ],
      more: [garageButton()],
      body,
      upgrade,
    });
  });

  // A worker's card (style guide §6, Milestone 29 on the shared station sheet): who they are, what they are doing now,
  // Train / Details, and an item for them.
  menus.register('worker', (agent) => {
    const s = team.get(agent.staffId);
    if (!s) return null;
    return stationSheet({
      title: s.name,
      line: staffLine(s),
      art: s.art,
      badge: ROLES[s.role]?.badge ?? null,
      tag: team.isFounder(s.id) ? { text: 'FOUNDER' } : team.isLegacy?.(s.id) ? { text: 'LEGACY', color: C.purple } : null,
      accent: C.progress,
      now: [
        garage().stateText(s.id) || 'In the garage',
        { text: `Energy ${Math.round(s.energy)} · Morale ${Math.round(s.morale)}`, color: s.energy < 30 || s.morale < 30 ? C.bad : C.text },
        ...(team.isFounder(s.id) ? [{ text: `${FOUNDER_FLAG} · ${team.founderDef()?.perkName ?? ''}`, color: C.gold }] : []),
        ...(team.isLegacy?.(s.id) ? [{ text: `Legacy · carried into New Game+ ${team.ngLevel}`, color: C.purple }] : []), // Milestone 28
      ],
      main: [
        { id: 'details', label: 'Details', sub: team.isDriver(s) ? 'Driver ratings, stats and traits' : 'Stats and traits', icon: ROLES[s.role].badge, onTap: () => goStaff(s.id) },
        team.training.trainingOf(s.id) ? { id: 'train', label: 'On a course', sub: `${team.training.courseOf(s.id).name}: ${team.training.daysLeft(s.id)} days left`, icon: 'race_ui_02', accent: C.progress, onTap: () => goTrain(s.id) } : trainButton(s.id),
      ],
      more: [{ id: 'giveTo', label: 'Give an item', sub: items.count ? `${items.count} in the ${ITEM_RULES.storeName}` : ITEM_TEXT.empty, icon: ITEM_RULES.storeIcon, disabled: !items.count, onTap: () => open('giveTo', s.id) }],
    });
  });

  // Bottom bar: each slot's sheet. Build also leads to the Pit Bay and the Car Garage; Staff to the roster and each person.
  for (const slot of BOTTOM_SLOTS) {
    menus.register(slot.id, () => {
      const menu = { title: slot.label, subtitle: slot.line, art: slot.icon, sections: [] };
      if (slot.id === 'build') {
        const job = team.cars.active;
        const wings = fac.expansions().filter((z) => z.state !== 'hidden');
        menu.sections = [
          { columns: 1, buttons: [{ id: 'pitBay', label: job ? `Active build: ${job.name}` : 'New car', sub: job ? `${pitBay.name} · ${team.cars.phase(job).name} · ${Math.floor(team.cars.fraction(job) * 100)}%` : `${pitBay.name} · choose a class and parts`, icon: pitBay.art, onTap: () => open(pitBay.id) }] },
          // Milestone 29: the other project types in bible §7 / §14.1, shown and greyed until a later update builds them
          { columns: 1, buttons: BUILD_SHEET.later.map((p) => ({ id: p.id, label: p.label, sub: p.line, icon: 'race_ui_01', locked: true, onTap: () => {} })) },
          { columns: 1, buttons: [garageButton()] },
          // Milestone 10: Build → Facilities (Build Mode) and the Shop.
          {
            title: 'Facilities',
            lines: [`${fac.items().filter((p) => !fac.defs[p.def].prop).length} stations in the garage · ${wings.map((z) => (z.state === 'open' ? z.name : `${z.name} (${z.why})`)).join(' · ')}`],
            columns: 2,
            buttons: [
              { id: 'facilities', label: 'Facilities', sub: 'Move or sell stations', icon: 'race_ui_01', accent: C.progress, onTap: enterBuild },
              { id: 'shop', label: 'Shop', sub: team.money.economy.isBlocked('facility') ? BUILD_TEXT.debt : 'Build a facility', icon: 'race_ui_01', onTap: () => { enterBuild(); open('shop'); } },
            ],
          },
        ];
      }
      if (slot.id === 'staff') {
        menu.subtitle = `${team.roster.length} of ${team.recruitment.staffCap()} people · ${slot.line}`;
        menu.sections = [
          { columns: 1, buttons: [{ id: 'roster', label: 'Roster', sub: 'Everyone on the team', icon: slot.icon, onTap: goRoster }] },
          { columns: 2, buttons: [hireButton(), trainButton(), recordsButton()] }, // Milestone 12 (Milestone 26: Records)
          { buttons: team.roster.map((s) => ({ id: `staff_${s.id}`, label: s.name.split(' ')[0], sub: ROLES[s.role].name, icon: s.art, accent: C.progress, onTap: () => goStaff(s.id) })), columns: 3 },
        ];
      }
      if (slot.id === 'money') return moneyMenu({ slot, team, goMainMenu, debug, toast, openStore: () => open('shopStore') });
      if (slot.id === 'research') return { ...menu, sections: researchSections() }; // Milestone 11
      if (slot.id === 'compete' && goWeekend) {
        // Milestone 7: race weekends (Practice → Setup → Qualifying → Race). Milestone 20: the championship ladder — the
        // season in progress and its next round, the 12 championships, the Pine Ridge practice race, rivals, trophies.
        const cur = team.races.current;
        const last = team.races.last();
        const lastMe = last?.result.rows.find((r) => r.isPlayer);
        const CH = team.championships;
        const season = CH?.current ?? null;
        const next = CH?.nextRound() ?? null;
        if (next) menu.art = TRACKS[next.trackId]?.artKey; // the next round's scenery as the sheet's backdrop
        const champSections = [];
        // Milestone 22: your car — the one in the race / championship, else the newest — as it looks (resolved family,
        // team colour, sponsors)
        const yourCar = team.cars.cars.get(cur?.carNumber ?? season?.carNumber) ?? team.cars.cars.latest();
        if (yourCar && assets) {
          const fam = familyOfCar(yourCar, team);
          const cbs = (yourCar.result.combos ?? []).map((id) => comboById(id)?.name).filter(Boolean);
          champSections.push({ columns: 1, buttons: [{ id: 'yourCar', label: `Your car: ${yourCar.name}`, sub: `${FAMILY_NAMES[fam.id]} (${fam.id})${cbs.length ? ` · ${cbs.join(', ')}` : ''}`, icon: carArtKey(assets, team, yourCar, 'showcase', cur?.sponsors ?? team.sponsors.decals()), accent: C.progress, onTap: () => goCarGarage() }] });
        }
        if (season) {
          const def = champById(season.id);
          const me = CH.standings().find((r) => r.isPlayer);
          const inRound = cur?.champ?.id === season.id;
          champSections.push({
            title: `${def.name} · round ${Math.min(season.round + 1, def.rounds)} of ${def.rounds}`,
            lines: [
              next ? `Next: ${TRACKS[next.trackId].name} · ${next.ready ? 'ready to race' : `in ${next.daysAway} day${next.daysAway === 1 ? '' : 's'}`}` : '',
              me ? `You: P${me.pos} · ${me.points} pts · ${me.wins} win${me.wins === 1 ? '' : 's'}` : 'No points yet: the first round is to come',
            ].filter(Boolean),
            columns: 2,
            buttons: [
              { id: 'champRound', label: inRound ? 'Carry on: this round' : next?.ready ? `Race round ${next.index + 1}` : `Round ${(next?.index ?? 0) + 1}`, sub: next ? `${TRACKS[next.trackId].name}${next.ready ? '' : ` · in ${next.daysAway} days`}` : '', icon: 'race_ui_04', disabled: !inRound && (!next?.ready || !!cur), accent: C.action, onTap: () => goChampRound() },
              { id: 'champStandings', label: 'Standings', sub: 'Drivers and teams', icon: 'race_ui_14', accent: C.progress, onTap: () => open('champStandings') },
            ],
          });
        }
        champSections.push({
          title: 'Championships',
          columns: 2,
          buttons: CH ? CH.list().filter((x) => x.def.type !== 'secret' || !x.locked || CH.debugSecrets).map((x) => ({
            id: `champ_${x.def.id}`,
            label: `${x.def.id} ${x.def.name}`,
            sub: (x.def.type === 'secret' ? `${SECRET_WORD.found} · ` : '') + (x.state === 'active' ? 'In progress' : x.state === 'won' ? `Champions · ${x.def.rounds} rounds` : x.why ? x.why : `${x.def.rounds} rounds · entry ${fmt(x.fee)} Cr${x.best < 99 ? ` · best P${x.best}` : ''}`),
            icon: TROPHY_ART[x.def.tier],
            // (Milestone 29: a locked one is grey with its reason, and still opens its own sheet — what it needs, its prizes)
            accent: x.state === 'won' ? C.good : x.why && x.state !== 'active' ? C.outline : C.action,
            onTap: () => open('champ', x.def.id), // Milestone 29: the championship's own sheet (Enter is there)
          })) : [],
        });
        champSections.push({
          columns: 2,
          buttons: [
            { id: 'rivals', label: 'Rivals', sub: 'Teams, drivers, logos', icon: 'race_ui_27', accent: C.progress, onTap: () => open('rivals') },
            { id: 'trophies', label: 'Trophies', sub: `${CH?.trophies.count ?? 0} in the cabinet`, icon: 'race_reward_07', accent: C.progress, onTap: () => open('trophies') },
            ...(team.achievements ? [recordsButton()] : []), // Milestone 26
          ],
        });
        menu.sections = [
          ...champSections,
          {
            columns: 1,
            buttons: [
              { id: 'weekend', label: cur ? 'Carry on: race weekend' : 'Practice race', sub: cur ? `${TRACKS[cur.trackId]?.name ?? 'Pine Ridge'} · ${cur.champ ? `${cur.champ.id} round ${cur.champ.round + 1} · ` : ''}${cur.kind !== 'weekend' ? 'test race' : cur.stage === 'race' ? (cur.state ? 'race under way' : 'on the grid') : cur.stage}` : team.races.canRace ? 'Pine Ridge Club Circuit · not a championship round · 12 laps · prize money' : 'Build a car first (Build → Pit Bay)', icon: slot.icon, disabled: !cur && !team.races.canRace, onTap: goWeekend },
              ...(goTestRace && !cur && team.races.canRace ? [{ id: 'testRace', label: 'Test Race (debug)', sub: 'Straight to an 8-lap race, no prize', accent: C.purple, onTap: goTestRace }] : []),
              ...(last ? [{ id: 'lastResult', label: 'Last result', sub: `${lastMe?.status === 'retired' ? 'DNF' : `P${lastMe?.pos}`} at ${TRACKS[last.trackId]?.name ?? 'Pine Ridge'} · ${team.races.history.length} race${team.races.history.length === 1 ? '' : 's'} so far`, accent: C.progress, onTap: () => goRaceResult(team.races.history.length - 1) }] : []),
            ],
          },
          // Milestone 19 (?debug=1): a race weekend on any of the 12 tracks (T12 Zero Ring too), and the 100-lap check
          ...(debugTracks && !cur && team.races.canRace
            ? [{ title: 'Debug: championships', columns: 2, buttons: [{ id: 'dbgRoundDue', label: 'Skip to the next round', sub: 'The calendar jumps to its day', accent: C.purple, onTap: () => debugTracks.roundDue() }, { id: 'dbgSecrets', label: CH?.debugSecrets ? 'C11 / C12 open ✓' : 'Open C11 / C12', sub: 'And Ghostline races (testing only)', accent: C.purple, onTap: () => debugTracks.secrets() }] }, { title: 'Debug: tracks', columns: 2, buttons: [...TRACK_IDS.map((id) => ({ id: `dbgTrack_${id}`, label: `${id} ${TRACKS[id].name}`, sub: `${(geoOf(id).length / 1000).toFixed(1)} km · ${TRACKS[id].turns.length} turns · ${TRACKS[id].profile}${TRACKS[id].hidden ? ' · locked' : ''}`, accent: C.purple, onTap: () => debugTracks.weekend(id) })), { id: 'dbgTrack100', label: '100-lap test: all 12', sub: 'A full field, 100 laps on every track', accent: C.purple, onTap: () => debugTracks.hundred() }] }]
            : []),
        ];
      }
      return menu;
    });
  }
  // Milestone 26: the Records screen.
  function recordsButton() {
    return { id: 'records', label: 'Records', sub: team.achievements ? `${team.achievements.completion().text} · ${team.achievements.earnedList().length} achievements` : '', icon: 'race_reward_08', accent: C.progress, onTap: () => open('records') };
  }
  if (team.achievements) menus.register('records', () => recordsMenu({ team, open, menuRow }));
  // Milestone 22: the Parts Archive (the open parts by slot) → the Combo Archive and the Rumour Archive.
  menus.register('partsArchive', () => {
    const ctx = unlockContext(team);
    const found = COMBOS.filter((c) => team.combos.discovered(c.id)).length;
    return {
      title: 'Parts Archive',
      subtitle: 'Every part you can fit, and the combinations you have found',
      art: 'race_ui_03',
      accent: C.progress,
      sections: [
        {
          columns: 2,
          buttons: [
            { id: 'comboArchive', label: 'Combo Archive', sub: `${found} of 20 found · ${Object.keys(team.combos.records.data.clues).length} clues`, icon: 'race_ui_03', accent: C.action, onTap: () => open('comboArchive') },
            { id: 'rumourArchive', label: 'Rumour Archive', sub: `${team.combos.rumours().length} rumours`, icon: 'race_ui_03', accent: C.progress, onTap: () => open('rumourArchive') },
          ],
        },
        ...SLOTS.map((sl) => {
          const all = Object.keys(PARTS).filter((id) => PARTS[id].slot === sl.id && (!PARTS[id].secret || partState(id, ctx).open)); // (Milestone 25: a found secret part too)
          const open = all.filter((id) => partState(id, ctx).open);
          return { title: `${sl.name} · ${open.length} of ${all.length}`, lines: [open.map((id) => `${id} ${PARTS[id].name}`).join(' · ') || 'None yet'] };
        }),
      ],
    };
  });
  menus.register('comboArchive', () => {
    const rows = team.combos.archive();
    return {
      title: 'Combo Archive',
      subtitle: `${rows.filter((r) => r.discovered).length} of 20 combos found (for every team on this device)`,
      art: 'race_ui_03',
      accent: C.progress,
      sections: rows.map((r) => ({
        title: `${r.id} · ${r.name}`,
        lines: r.discovered
          ? [{ text: `Recipe: ${r.recipe}`, color: C.actionDark }, `Reward: ${r.reward}`, { text: `${r.tier[0].toUpperCase()}${r.tier.slice(1)} combo · found by ${r.when.team}${r.when.car ? ` (${r.when.car})` : ''}`, color: C.textMuted }]
          : [r.clue ? { text: `Clue: ${r.clue}`, color: C.actionDark } : { text: 'Not found yet', color: C.textMuted }],
      })),
    };
  });
  menus.register('rumourArchive', () => {
    const list = [...team.combos.rumours()].reverse();
    return {
      title: 'Rumour Archive',
      subtitle: 'Near-miss clues and the recipes you have found',
      art: 'race_ui_03',
      accent: C.progress,
      sections: [
        { title: 'Combos', lines: list.length ? list.map((x) => ({ text: `${x.kind === 'recipe' ? 'Recipe' : 'Rumour'}: ${x.text}`, color: x.kind === 'recipe' ? C.good : C.text })) : ['Nothing yet. Build cars: a combination that almost works starts a rumour.'] },
        // Milestone 24: the secrets — each one's newest clue stage (1 vague … 3 nearly explicit), a found one's exact recipe
        //   (Milestone 26, the hidden denominator: before the ending only how many were found, never how many exist)
        ...(team.secrets?.rules.length ? [{ title: team.secrets.postEnding ? `Secrets · ${team.secrets.foundCount()} of ${team.secrets.rules.length} found` : `Secrets · ${team.secrets.foundCount()} found`, lines: secretLines() }] : []),
        // Milestone 25: account-wide rewards — accolades and switches, Prestige Tokens, the final page
        ...(team.secrets?.accolades().length || team.prestigeTokens ? [{ title: 'Accolades', lines: [...team.secrets.accolades().map((a) => ({ text: a.text, color: C.good })), { text: `Prestige Tokens: ${team.prestigeTokens}`, color: C.actionDark }] }] : []),
        ...(team.secrets?.finalPage ? [{ title: 'The final page', lines: [{ text: team.secrets.finalPage, color: C.actionDark }] }] : []),
        ...(debug ? [{ columns: 1, buttons: [secretInspectorButton()] }] : []),
      ],
    };
  });
  // Milestone 24: the secret lines (the Rumour Archive) and the ?debug=1 why-false inspector.
  const STAGE_WORD = ['', 'Rumour', 'Hint', 'Almost', 'Found'];
  function secretLines() {
    const r = team.secrets.rumours();
    // (Milestone 29: an unfound secret is ??? with its clue — never its name or unlock; a found one says so)
    return r.length ? r.map((x) => ({ text: x.found ? `${STAGE_WORD[4]}: ${x.text} — ${x.name}` : `${SECRET_WORD.unknown} · ${STAGE_WORD[x.stage]}: ${x.text}`, color: x.found ? C.good : x.stage >= 3 ? C.actionDark : C.text })) : [{ text: 'No whispers yet — near misses in races and builds leave clues here.', color: C.textMuted }];
  }
  const secretInspectorButton = () => ({ id: 'secretInspector', label: 'Debug: secret inspector', sub: `${team.secrets.rules.length} rules · why each is not met`, icon: 'race_ui_28', accent: C.purple, onTap: () => open('secretInspector') });
  menus.register('secretInspector', () => {
    const S = team.secrets;
    return {
      title: 'Secret inspector',
      subtitle: `${S.rules.length} rules · facts live · first failing condition in red`,
      art: 'race_ui_28',
      accent: C.purple,
      sections: S.rules.length
        ? S.rules.map((r) => {
            const w = S.whyFalse(r.id);
            return {
              title: `${r.id} · ${r.name} · stage ${w.stage} of 4 · ${r.scope}${w.found ? ' · found' : ''}`,
              lines: [
                w.ok || w.found ? { text: w.found ? 'Found' : 'All conditions met (waits for its trigger)', color: C.good } : { text: `First failing: ${w.firstFail}`, color: C.bad },
                ...w.rows.map((x) => ({ text: `${x.ok ? '✓' : '✗'} ${x.kind === 'any' ? '(one of) ' : x.kind === 'forbid' ? '(never) ' : ''}${x.text}`, color: x.ok ? C.good : C.text })),
                { text: `Checked on: ${w.triggers.join(', ')}`, color: C.textMuted },
              ],
              // Milestone 25: force this one secret (its rewards fire once; it sets the competitive-invalid flag)
              ...(w.foundHere ? {} : { columns: 1, buttons: [{ id: `force:${r.id}`, label: `Debug: force ${r.id}`, sub: 'Rewards fire as if its facts held · sets the invalid flag', icon: 'race_ui_28', accent: C.purple, onTap: () => S.debugForce(r.id) }] }),
            };
          })
        : [{ lines: ['No rules loaded.'] }],
    };
  });

  // Milestone 23: the Inbox
  const INBOX_SHOWN = 60;
  const dateOf = (day) => `Y${Math.floor(day / 336) + 1} M${Math.floor((day % 336) / 28) + 1} D${(day % 28) + 1}`;
  menus.register('inbox', () => {
    const ev = team.events;
    const list = ev.inbox.slice(0, INBOX_SHOWN);
    const status = (e) => {
      if (e.answer) return e.answer.auto ? `Taken for you: ${e.answer.label}` : `You chose: ${e.answer.label}`;
      if (e.kind === 'choice') return 'Waiting for your answer';
      return e.body;
    };
    return {
      title: 'Inbox',
      subtitle: `${ev.unread} unread · ${ev.inbox.length} message${ev.inbox.length === 1 ? '' : 's'}`,
      art: 'race_ui_13',
      accent: C.progress,
      sections: [
        {
          columns: 2,
          buttons: [
            { id: 'inboxRumours', label: 'Rumour Archive', sub: `${team.combos.rumours().length} rumours`, icon: 'race_ui_28', accent: C.progress, onTap: () => open('rumourArchive') },
            ...(debug ? [secretInspectorButton()] : []),
            { id: 'inboxReadAll', label: 'Mark all read', sub: ev.unread ? `${ev.unread} unread` : 'All read', icon: 'race_ui_13', accent: C.progress, onTap: () => ev.markAllRead() },
          ],
        },
        list.length
          ? { columns: 1, buttons: list.map((e) => ({ id: `inbox_${e.id}`, label: `${e.read ? '' : '● '}${e.title}`, sub: `${dateOf(e.day)} · ${ev.classOf(e.data?.cls).name} · ${status(e)}`, icon: e.art ?? e.icon, accent: e.read ? C.outline : e.level === 'major' ? C.action : C.progress, onTap: () => ev.reopen(e.id) })) }
          : { lines: ['Nothing yet. News, offers, rumours and big moments will arrive here.'] },
        ...(ev.inbox.length > INBOX_SHOWN ? [{ lines: [{ text: `The newest ${INBOX_SHOWN} are shown.`, color: C.textMuted }] }] : []),
      ],
    };
  });

  // Milestone 20: the championship sub-sheets (they replace the Compete sheet; Back returns to it)
  const CH = team.championships;
  if (CH) {
    menus.register('champStandings', () => {
      const def = champById(CH.current?.id ?? CH.history[CH.history.length - 1]?.id);
      const rows = CH.standings();
      return {
        parent: 'compete',
        title: def ? `${def.name}${CH.current ? '' : ' (final)'}` : 'Standings',
        subtitle: def ? `${def.rounds} rounds · ${def.tracks.map((t) => TRACKS[t].name).join(' · ')}` : 'Enter a championship first',
        art: 'race_ui_14',
        accent: C.progress,
        sections: [
          { title: 'Drivers', lines: rows.length ? rows.map((r) => ({ text: `${r.pos}. ${r.name}${r.team ? ` (${r.team})` : ''}${r.wins ? ` · ${r.wins} win${r.wins === 1 ? '' : 's'}` : ''}`, right: `${r.points} pts`, color: r.isPlayer ? C.actionDark : undefined })) : [{ text: EMPTY_TEXT.standings, color: C.textMuted }] },
          { title: 'Teams', lines: CH.teamTable().length ? CH.teamTable().map((t) => ({ text: `${t.pos}. ${t.team}`, right: `${t.points} pts`, color: t.isPlayer ? C.actionDark : undefined })) : [{ text: EMPTY_TEXT.standings, color: C.textMuted }] },
          { columns: 1, buttons: [backButton('backCompete', 'Compete')] },
        ],
      };
    });

    // Milestone 29 (bible §7 Championship Detail): one championship — rounds and tracks, what it needs, the prizes, the
    // standings while it runs — and its main action (Enter, or race the next round). A locked one shows the reason; a
    // secret one is only ever listed once found (it never shows ??? or its unlock: that would tell how many exist).
    menus.register('champ', (id) => {
      const x = CH.list().find((c) => c.def.id === id);
      if (!x) return null;
      const def = x.def;
      const band = CHAMP_BANDS[def.id] ?? {};
      const active = x.state === 'active';
      const n = active ? CH.nextRound() : null;
      const cur = team.races.current;
      const me = active ? CH.standings().find((r) => r.isPlayer) : null;
      const now = active
        ? [`In progress · round ${Math.min((CH.current?.round ?? 0) + 1, def.rounds)} of ${def.rounds}`, me ? `You: P${me.pos} · ${me.points} pts` : 'No points yet', ...(n ? [`Next: ${TRACKS[n.trackId].name} · ${n.ready ? 'ready to race' : `in ${n.daysAway} days`}`] : [])]
        : x.state === 'won' ? [{ text: `Champions${x.best < 99 ? '' : ''} — the trophy is in your cabinet`, color: C.good }]
        : x.locked ? [{ text: `Locked · ${x.why}`, color: C.bad }]
        : x.why ? [{ text: x.why, color: C.bad }] : ['Open: enter to race its rounds'];
      const main = active
        ? [{ id: 'champRound', label: cur?.champ?.id === def.id ? 'Carry on: this round' : n?.ready ? `Race round ${n.index + 1}` : `Round ${(n?.index ?? 0) + 1}`, sub: n ? `${TRACKS[n.trackId].name}${n.ready ? '' : ` · in ${n.daysAway} days`}` : '', icon: 'race_ui_04', disabled: cur?.champ?.id !== def.id && (!n?.ready || !!cur), onTap: () => goChampRound() }]
        : x.state === 'won' ? []
        : [{ id: 'champEnter', label: `Enter ${def.name}`, sub: x.why ?? `${def.rounds} rounds · paid on entry`, cost: x.why ? null : `${fmt(x.fee)} Cr`, icon: TROPHY_ART[def.tier], disabled: !!x.why, locked: x.locked, onTap: () => enterChamp(def.id) }];
      return Object.assign(stationSheet({
        title: def.name,
        line: `${def.id} · ${CH.tierName?.(def.tier) ?? def.tier} · ${def.rounds} rounds · ${def.classText}`,
        art: TROPHY_ART[def.tier],
        accent: C.progress,
        now,
        main,
        more: [...(active ? [{ id: 'champStandings', label: 'Standings', sub: 'Drivers and teams', icon: 'race_ui_14', onTap: () => open('champStandings') }] : []), { id: 'rivals', label: 'Rivals', sub: 'Teams and drivers', icon: 'race_ui_27', onTap: () => open('rivals') }],
        body: [
          { title: 'Rounds', lines: def.tracks.map((t, i) => ({ text: `Round ${i + 1}: ${TRACKS[t]?.name ?? t}`, color: active && CH.current?.round > i ? C.textMuted : C.text })) },
          { title: 'What it needs', lines: [`To enter: ${def.unlockText}`, `Cars: ${def.classText}`, `Entry fee: ${fmt(x.fee)} Credits`] },
          { title: 'Prizes', lines: [{ text: 'Champions', right: `+${fmt(band.title ?? 0)} Cr` }, { text: 'Reputation for the title', right: `+${band.titleRep ?? 0}` }, `Trophy: ${CH.tierName?.(def.tier) ?? def.tier} · ${def.reward}`] },
          { columns: 1, buttons: [backButton('backCompete', 'Compete')] },
        ],
      }), { parent: 'compete' });
    });
    menus.register('rivals', () => ({
      parent: 'compete',
      title: 'Rivals',
      subtitle: 'Eight teams (one is a secret); their cars follow each championship’s band, never yours',
      art: 'race_ui_27',
      accent: C.progress,
      sections: [
        // (Milestone 25: Ghostline once SEC-RIVAL-01 is found — it races in the World-tier championships)
        ...Object.entries(RIVAL_TEAMS).filter(([, t]) => !t.secret || CH.debugSecrets || team.unlocks.secrets.includes(t.secret)).map(([id, t]) => ({
          title: t.secret ? `${t.name} · ${SECRET_WORD.found}` : t.name,
          lines: [`${t.identity} · ${t.strength} · from ${t.secret ? 'the World-tier championships (C08–C12)' : champById(t.first)?.name ?? t.first}`],
          columns: 1,
          buttons: [{ id: `rival_${id}`, label: t.drivers.map((d) => d.name).join(' · '), sub: t.drivers.map((d) => `${d.name.split(' ')[0]}: Q${d.ratings.qualifying} R${d.ratings.racecraft} W${d.ratings.wet} T${d.ratings.tyreCare} C${d.ratings.consistency} F${d.ratings.feedback}`).join(' · '), icon: t.logo, accent: C.outline, onTap: () => {} }],
        })),
        { columns: 1, buttons: [backButton('backCompete', 'Compete')] },
      ],
    }));
    menus.register('trophies', () => {
      const list = CH.trophyList();
      return {
        parent: 'compete',
        title: 'Trophy cabinet',
        subtitle: `${list.length} title${list.length === 1 ? '' : 's'} · ${(team.careers?.facts.wins ?? 0)} race wins · ${(team.careers?.facts.podiums ?? 0)} podiums`,
        art: 'race_reward_08',
        accent: C.progress,
        sections: [
          list.length
            ? { columns: 2, buttons: list.map((t) => ({ id: `trophy_${t.id}`, label: t.name, sub: `${CH.tierName(t.tier)} trophy · day ${t.day ?? '—'}`, icon: t.art, accent: C.good, onTap: () => {} })) }
            : { lines: [{ text: EMPTY_TEXT.trophies, color: C.textMuted }] },
          { lines: CH.history.map((h) => `${champById(h.id).name} (year ${h.year}): P${h.pos} · ${h.points} pts${h.title ? ' · champions' : ''}`) },
          { columns: 1, buttons: [backButton('backCompete', 'Compete')] },
        ],
      };
    });
  }
  return menus;
}
