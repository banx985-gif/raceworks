// The save inspector (Milestone 30, ?debug=1 only: Settings → Debug: save inspector). One sheet: where the saves live,
// then each of the four slots and the account — version, size, the trigger that wrote the current copy, its age and the
// previous copy's, every copy's checksum status — with:
//   Export   the current copy as text (window.__rwExport, and the clipboard when the browser allows)
//   Import   paste one: it becomes the slot's newest copy once it migrates and passes the check (the old copies are
//            kept aside first)
//   Corrupt  spoil the current copy's data (its checksum then fails): the next load must fall back. Twice = both copies.
//            Not on the slot that is open (its next autosave would simply write a good copy over it).
//   Dry run  the migrations and the check on the current copy — nothing written
// and "Old saves" — every fixture in tests/raceworks/save_fixtures (one per save version ever shipped) run dry (only on
// the development copy, where the tests folder is served).
//   const insp = createSaveInspector({ slots: () => slots, storage: () => adapter, activeSlot: () => n, textPrompt, layout,
//                                      triggerLabel, onChanged })
//   insp.refresh() → Promise     insp.menu() → the sheet (rebuilt each frame from the last refresh)     insp.actions
import { THEME } from '../../../../core/Theme.js';
import { SLOT_COUNT } from '../../data/setup.js';
const C = THEME.color;

const kb = (n) => `${((n ?? 0) / 1024).toFixed(1)} KB`;
export function ago(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} days`;
}
const FIXTURE_URL = (v) => `../../tests/raceworks/save_fixtures/v${v}.json`;

export function createSaveInspector({ slots, storage, activeSlot = () => null, textPrompt = null, layout = null, triggerLabel = (t) => t, onChanged = async () => {}, fixtureVersions = 22, fetchFn = (u) => fetch(u, { cache: 'no-store' }) }) {
  let info = null; // { at, stores: [{ id, label, copies, slot }] }
  let note = null; // { text, color }
  const say = (text, color = C.good) => (note = { text, color });

  const storeOf = (id) => (id === 'account' ? slots().account : slots().slot(id));
  async function refresh() {
    const S = slots();
    if (!S) return (info = null);
    const stores = [];
    for (let n = 1; n <= SLOT_COUNT; n++) stores.push({ id: n, label: `Slot ${n}`, copies: await S.slot(n).list() });
    stores.push({ id: 'account', label: 'Account (shared by every slot)', copies: await S.account.list() });
    info = { at: Date.now(), stores };
    return info;
  }

  const actions = {
    async exportSave(id) {
      const raw = await storeOf(id).current();
      if (!raw) return say('Nothing to export', C.bad);
      const text = JSON.stringify({ raceworksSave: 1, store: id, record: raw });
      globalThis.__rwExport = text;
      try {
        await globalThis.navigator?.clipboard?.writeText(text);
        say(`${id === 'account' ? 'Account' : `Slot ${id}`}: ${kb(text.length)} copied to the clipboard (also window.__rwExport)`);
      } catch {
        say(`${id === 'account' ? 'Account' : `Slot ${id}`}: ${kb(text.length)} ready in window.__rwExport (no clipboard here)`);
      }
      return text;
    },
    // text: a save exported above (or a bare record, or a fixture file)
    async importSave(id, text) {
      try {
        const v = JSON.parse(text);
        const raw = v.record ?? v;
        const store = storeOf(id);
        await store.quarantine(); // whatever was there is kept aside first
        await store.importRecord(raw);
        say(`${id === 'account' ? 'Account' : `Slot ${id}`}: imported (v${raw.saveVersion ?? '?'} → the newest copy)`);
        await onChanged(id);
      } catch (err) {
        say(`Import failed: ${err.message}`, C.bad);
      }
      await refresh();
    },
    promptImport(id) {
      if (!textPrompt || !layout) return;
      const sr = layout.safeRect;
      textPrompt.open({ rect: { x: sr.x + 40, y: sr.y + sr.h / 2 - 60, w: sr.w - 80, h: 120 }, value: '', maxLength: 20000000, placeholder: 'Paste a save here', onDone: (v) => v && actions.importSave(id, v) });
    },
    async corrupt(id) {
      if (id === activeSlot()) return say('That team is open — go to the main menu first', C.bad);
      const k = await storeOf(id).damage();
      say(k ? `Corrupted ${k}: the next load falls back to the copy before it` : 'No good copy left to corrupt', k ? C.gold : C.bad);
      await onChanged(id);
      await refresh();
    },
    async dryRun(id) {
      const r = await storeOf(id).dryRun();
      const what = id === 'account' ? 'Account' : `Slot ${id}`;
      if (r.error) say(`${what}: ${r.error}`, C.bad);
      else say(`${what}: v${r.from} → v${r.to} in ${r.trace.length} step${r.trace.length === 1 ? '' : 's'} · ${r.ok ? 'passes the check' : `fails: ${r.problems.slice(0, 2).join('; ')}`} · nothing written`, r.ok ? C.good : C.bad);
      return r;
    },
    // Every old save version the game ever shipped, run dry through today's chain and check.
    async dryRunFixtures() {
      const out = [];
      for (let v = 1; v <= fixtureVersions; v++) {
        try {
          const res = await fetchFn(FIXTURE_URL(v));
          if (!res.ok) throw new Error('not served');
          const fx = await res.json();
          out.push({ v, ...(await slots().slot(1).dryRun(fx.record)) });
        } catch (err) {
          out.push({ v, ok: false, error: err.message, trace: [] });
        }
      }
      const good = out.filter((r) => r.ok).length;
      if (out.every((r) => r.error === 'not served')) say('Old saves are only on the development copy', C.bad);
      else say(`Old saves: ${good} of ${out.length} migrate to v${out[0]?.to ?? '?'} and pass the check${good < out.length ? ` (failed: ${out.filter((r) => !r.ok).map((r) => `v${r.v}`).join(', ')})` : ''}`, good === out.length ? C.good : C.bad);
      return out;
    },
  };

  function storeSection(st) {
    const now = Date.now();
    const cur = st.copies.find((c) => c.current);
    const prev = cur ? st.copies.filter((c) => c !== cur && c.status !== 'damaged' && c.seq < cur.seq).sort((a, b) => b.seq - a.seq)[0] : null;
    const open = st.id === activeSlot();
    const lines = [];
    if (!st.copies.length) lines.push({ text: 'Empty', color: C.textMuted });
    else {
      lines.push({ text: cur ? `v${cur.version} · ${kb(cur.bytes)} · ${cur.trigger ? triggerLabel(cur.trigger) : 'trigger not recorded'}` : 'No copy reads — damaged', color: cur ? C.text : C.bad, right: cur ? `${ago(now - cur.savedAt)} ago` : '' });
      lines.push({ text: prev ? `Previous save: ${ago(cur.savedAt - prev.savedAt)} older (v${prev.version})` : 'Previous save: none yet', color: C.textMuted, right: prev ? `${ago(now - prev.savedAt)} ago` : '' });
      for (const c of st.copies) lines.push({ text: `${c.current ? '▶ ' : ''}${c.key} · #${c.seq} · v${c.version ?? '?'} · ${kb(c.bytes)} · ${c.status}${c.newer ? ' (newer game)' : ''}`, color: c.status === 'damaged' || c.newer ? C.bad : c.current ? C.good : C.textMuted });
    }
    const has = st.copies.length > 0;
    return {
      title: `${st.label}${open ? ' · open now' : ''}`,
      lines,
      columns: 4,
      buttons: [
        { id: `insExport_${st.id}`, label: 'Export', accent: C.progress, disabled: !has, onTap: () => actions.exportSave(st.id) },
        { id: `insImport_${st.id}`, label: 'Import', accent: C.purple, disabled: open, onTap: () => actions.promptImport(st.id) },
        { id: `insCorrupt_${st.id}`, label: 'Corrupt', accent: C.bad, disabled: !has || open, onTap: () => actions.corrupt(st.id) },
        { id: `insDry_${st.id}`, label: 'Dry run', accent: C.gold, disabled: !has, onTap: () => actions.dryRun(st.id) },
      ],
    };
  }

  function menu() {
    const a = storage();
    const sections = [
      {
        lines: [
          { text: `Storage: ${a?.kind ?? '—'}${a?.degraded ? ' — a write failed and went to localStorage' : ''}`, color: a?.degraded ? C.bad : C.text },
          ...(note ? [{ text: note.text, color: note.color }] : []),
        ],
        columns: 2,
        buttons: [
          { id: 'insRefresh', label: 'Read again', sub: 'Like reopening the app', accent: C.progress, onTap: () => refresh() },
          { id: 'insFixtures', label: 'Old saves', sub: 'Every version ever shipped, run dry', accent: C.gold, onTap: () => actions.dryRunFixtures() },
        ],
      },
      ...(info ? info.stores.map(storeSection) : [{ lines: [{ text: 'Reading the saves…', color: C.textMuted }] }]),
    ];
    return { title: 'Save inspector', subtitle: 'Debug only · every slot, the account, every copy', art: 'race_ui_28', accent: C.purple, sections };
  }

  return {
    refresh,
    menu,
    actions,
    get info() {
      return info;
    },
    get note() {
      return note;
    },
  };
}
