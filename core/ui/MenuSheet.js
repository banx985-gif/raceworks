// The Menu sheet (series common feature §1, first built for DEVWORKS Milestone 40e; any series game): every screen in
// plain words, grouped, each row with its icon and a one-line "what this is for". Content-free: the game passes its
// rows as data and says what each id opens, so a row opens the very same sheet / screen the art opens.
//
//   menuSheet({ title, subtitle, art, groups, open, state })  → a core/ui/BottomSheet menu spec
//     groups: [{ title, rows: [{ id, label, line, icon }] }]   (game data, e.g. data/menu.js)
//     state(id) → { hidden?, locked?: 'reason', badge?, sub? } (optional; hidden rows are left out, a locked row is
//       greyed with its reason as its line and does nothing when tapped)
//     open(id) — what a row does (the game's one code path)
//   A group with no visible rows is left out. Rows show in one column: label, the line under it, the icon on the left.
export function menuSheet({ title = 'Menu', subtitle = '', art = null, accent = undefined, groups = [], open, state = () => ({}) }) {
  const sections = [];
  for (const g of groups) {
    const buttons = [];
    for (const r of g.rows) {
      const st = state(r.id) ?? {};
      if (st.hidden) continue;
      buttons.push({
        id: `menu:${r.id}`,
        label: r.label,
        sub: st.locked ? st.locked : (st.sub ?? r.line),
        icon: r.icon ?? null,
        locked: !!st.locked,
        badge: st.badge ?? null,
        onTap: () => {
          if (!st.locked) open(r.id);
        },
      });
    }
    if (buttons.length) sections.push({ title: g.title, columns: 1, buttons });
  }
  return { title, subtitle, art, accent, menuSheet: true, sections };
}

// Every row id in the groups (tests: each must be openable).
export const menuRowIds = (groups) => groups.flatMap((g) => g.rows.map((r) => r.id));
