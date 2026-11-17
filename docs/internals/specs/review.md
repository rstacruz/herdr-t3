# Review

The optional Review page (`extras/mods/review`, for the pulls.review fork): toolbar, range and base menus, group tabs, tree, diff text and refresh. The [RECIPE](../../../RECIPE.md) says what Review does; decisions are ADRs [0013](../../adr/0013-space-panel-pages-share-one-frame.md), [0014](../../adr/0014-review-groups-filter-the-tree.md) and [0017](../../adr/0017-space-panel-surfaces.md); which repository it reads is in [space-panel](space-panel.md#which-repository-review-reads); the tree row is Files' ([files](files.md#tree-rows)). Shared sizes are in [t3-tokens](../t3-tokens.md).

## Toolbar

- T3 `DiffPanel`'s head, but 32 high, not T3's 40, as [Files' file header](files.md#file-header) (`check-pane.cjs` holds it to the layout). Its menus (scope, fold, settings, status, the comparison target's) hang 4 under their buttons from `controls.js` `HEADER` / `BELOW`, never a fixed offset. 12 horizontal (R1), no rule below (T3's subheaders in the panel). The scope button leading it keeps a `sm` button's own 10 padding both sides: its box at 12, under the panel head's first tab's box, its words at 22, where Files' first crumb's are (`check-pane.cjs`).
- Buttons are all `sm` (28) with 14px icons (T3's diff toolbar) and the `chrome` hover and on (t3-tokens「按钮」): range, commit `‹ ›`, Analyze, fold menu, settings, navigation toggle. Icon buttons are 4 apart (P3), the commit `‹ ›` too; text buttons and icon groups are 8 apart. The comparison target (a combobox trigger) stays `xs`, as T3.
- Popovers open 4 below their button (top 38), right-aligned to it. Page popovers write `review.<name>Closed` when an outside press closes them (see [storage](../storage.md)).
- No repository, or another machine: the toolbar says `Review` and navigation is disabled. A range with no changes says `No changes`.

## Range menu

- Changes, Uncommitted, Outgoing, Incoming, each with its count as `3 commits` / `1 file`; zero disables a row unless it is the one shown. Opened by keys, the first row is lit; by the pointer, none.
- A separator, then the searchable Commits submenu (list at most 320).
- Branch ranges show `head → base`, `vs base` under 640px; a commit shows its short SHA with `‹ ›`.
- `review.scope[:commits]` opens it by command.

## Comparison target

- Changes has a separate target button, 36–192 wide, opening a 288 wide searchable popover: BRANCH and REMOTE sections, 28px rows, list at most 256. Automatic is left out while searching.
- Local branches except head, each paired with its same-name remotes (origin first) and a 22×14 remote switch; then at most 200 newest remote-only branches, excluding HEAD. Default branch first, then newest.
- Choosing a base opens `base...head` without analysing. The switch leaves the menu open.
- The chosen base is kept per space (`review.bases`); Changes counts and Commits follow it. `review.base` opens it by command.

## Group tabs

- With two or more groups: one horizontal, scrolling, non-wrapping row under the toolbar, across diff and tree, on the toolbar's edge, with no rule below. Rule-based groups count as well as AI groups.
- Row: 12 horizontal (the toolbar's edge), 8 vertical, 6 apart. Tabs radius 8, no outline, padding 8/2. Line 1: 14px category icon, 12px medium name, critical mark. Line 2 (11px): additions/deletions, file count, and a 14px progress ring once reviewed. Binary-only groups get no meaningless line-count separator.
- Current group on the `chrome` on fill, others the hover fill, as the panel's tabs.
- Clicking a group starts it at the top in diff and tree.
- An AI group's summary heads the diff: 13px medium title over 12px `muted` text, at most 160 high, with no rule under it. Rule-based boilerplate is left out.

## Tree

- The navigation column works as Files' ([files](files.md#layout)), with this page's own open state and width.

- Only the current group's folders and files, then its subgroups as rows: category, name, critical, count, reviewed. Subgroups start open, folders folded. A subgroup is never compacted into its sole folder. Clicking a subgroup opens it and scrolls to its header.
- Files keep Files' natural order; diff, line requests and `j`/`k` follow it.
- One current file: from a click, `j`/`k`, or the file at the diff viewport's top. Jumps expand ancestors.
- Reviewed boxes precede icons; folder and subgroup boxes are tri-state; removed files keep an empty slot. Reviewed files dim and strike through.
- Files and folders can drag into terminals using their absolute paths under the Review repository and the space's machine; compact folders use their outermost real path, never `group:<key>/` prefixes. Deleted files (`missing` or Git `removed`) and subgroup rows cannot drag.
- Files' shared native tree menu ([files](files.md#tree-menu)): Open, Reveal, Open with, relative Copy path and Insert into the tab's last active terminal; remote paths omit local apps. Deleted files offer only Copy path; subgroup rows have no menu. Right-click preserves the current file, folder folds and reviewed state; its row stays highlighted while the menu is open. `cmd-w` closes menus before the Review tab. Real dragging and right-clicks require user verification.
- Folder rows read a per-folder file index built with the tree, not a filter of the whole group per row.

## Diff

- R1 throughout: file headers 12 horizontal, the reviewed box on the left and the last 20 slot on the right; hunk rows 12 horizontal, text truncated 12 inside the right; file comments 12 horizontal; line-comment cards 12 outside; group summary 12 horizontal.
- Only code and hunk headers use the window's code font; everything else the layout font.
- Wrapped rows are 20 high. Unicode wide characters, combining marks and joined sequences keep their shapes and break safely.
- Settings' Lines: Wrap/Scroll is this page's own, independent of Files.
- A binary file shows only its `binary` header and requests no rows.
- The diff and the group summary over it are on `background`, as T3's diff on `--code-background` (nav-column.js puts the content there); the toolbar, group tabs and the navigation column stay on the panel's `chrome`. As Pierre's diff, nothing in it is ruled or outlined: file headers sit on the diff's ground, the stuck one too (the file in front isn't lit; the tree says which), hunk rows on `foreground` 5% (Pierre's separator), a line's note card on 4% with radius 8 (a critical one on `blocked` 10%), and split's sides are 1px apart on the panel's `chrome`.
- Sticky file headers stay opaque over scrolling code. Translucent theme checkbox colours keep their own alpha when scaled.

## Refresh and memory

- While visible, refresh every 15s; catch up on return. Hiding or switching stops refresh and invalidates in-flight reads.
- Full data, rows and layout caches only for the last three shown spaces; eviction releases them and late reads can't refill them. Analysis status stays light, per space.
- The layout has no Review bar by default (one can be added as the RECIPE says), and nothing analyses on opening a surface: pick a range and Analyze on the page.

## Settings

Language, Agent and Model are settings submenus (Model searchable); a pick closes only that submenu. `review.settings[:language|agent|model]` opens them by command.

## Programs

`jin.review` and the shared read-only Git range/base/ref helpers; the local daemon and Review's `config.json`. No remote Review.
