# Files

The Files surface (`t3-files`): header, tree, search, menus, reading limits and the host facts it relies on. The tree row is shared with Review. The [RECIPE](../../../RECIPE.md) says what Files does; the decision is [ADR 0018](../../adr/0018-files-follow-t3-surfaces.md); tabs and their lifecycle are in [space-panel](space-panel.md). Shared sizes are in [t3-tokens](../t3-tokens.md).

Sources: T3 `09a54f01` `files/fileSurfaceChrome.tsx`, `FileBrowserPanel.tsx`, `FileBreadcrumbs.tsx`, Pierre `style.js`.

## Layout

- Generic Files is the full-width tree. With a file open: content on the left, the tree in the navigation column on the right.
- Grounds, as T3's code surface beside its FileExplorerPane: the content (code, Markdown, image, its states) on `background`, by `nav-column.js` `withNav`, the column shut too; the header and the column on the panel's `chrome`. The column's left rule stays (T3 keeps `border-l border-border/60` between the two grounds).
- Files reads the space's `folder` on the space's machine, not the terminal's cwd.
- Navigation column: open state and width are this copy's own (`nav.open`, `nav.width`), as is Wrap/Scroll (`lines.wrap`). Width starts at 256, between 160 and 560, the content at least 256; a 6px drag handle on its left; keyboard steps of 16, Home and End. No breakpoint: the layout reflows once the width has been stable for 300ms. No cross-page reveal.

## File header

- Inline: 32 high, not T3's 40 (t3-tokens「有意不同」), so its row reads as one line with the work column's pane header; `check-files.cjs` holds it to the layout. Controls centred, as Review's toolbar, so Tree and its neighbours keep their place between the pages; 12 horizontal (R1, the panel head's edge), no bottom rule.
- Breadcrumbs on the left: each crumb at most 160 wide, padding 2; the first (the root's) 10 on its left, so its box is at 12, under the panel head's first tab's, and its words at 22, where Review's scope button has them (`check-files.cjs`). The `›` slot is 16×20, 2 outside, 14px icon; the `chrome` hover fill, on while its menu is open, as the bar's buttons. Crumbs scroll and truncate, with no strip of their own. A folder crumb's hover brightens text only, no fill; the keyboard focus ring stays. Crumbs are buttons to assistive tech.
- On the right, two groups 8 apart (P3): the Open in split, then Preview/Code, Wrap and Tree, `sm` (28) buttons 4 apart with 14px icons (T3's file toolbar; the Open in icon too, its chevron 16). All take the `chrome` hover and on (`foreground` 4% / 7%, P7). Open in is 24 high, as T3's xs beside its 28 toolbar toggles.
- Preview/Code, Wrap and Tree keep fixed slots and are disabled when they don't apply (T3 hides Wrap; deliberate).
- Pointer shapes are t3-tokens「按钮」's: the ghost toggles (Preview/Code, Wrap, Tree) and the crumbs' `›` keep the arrow; Open in's two halves, a folder crumb, menu rows and tree rows show the hand.

## Open in

- `split()` `xs` (`surface: "chrome"`), T3's OpenInPicker in a header (`outline`): 24 high, radius 8, an `input` outline and a full-height `input` rule at rest, no fill; a 25 wide icon half (14px icon) and a 24 wide chevron half (16), 50 in all ([t3-tokens「按钮」](../t3-tokens.md)).
- The half under the pointer takes the `chrome` hover fill alone; with its menu open the chevron's half is on. Disabled (remote), the whole control, outline too, fades to 0.64, nothing shifting. The chevron has only an aria-label.
- Its menu is Details' (`shared/open-in.js` `targetsMenu`): 220 wide, 28px rows, right edge on the group's (`align="end"`), 4 below. No check mark: the main icon already says the target. App icons from `targetIcon`: coloured brand art, single-colour brand marks in `foreground`, others a `dim` generic window.
- Choosing saves the target; the main half opens it.

## Tree header

- `shared/nav-column.js` `treeHead`, one for generic Files and every navigation column: 32 high, 8 below, 12 horizontal; buttons and the field 8 apart. 32, not T3's 36: on generic Files it is the page's first row, level with the pane header as the file header is (t3-tokens「有意不同」); under those 32 bars a column's head shares its centre with Review's 32 file header beside it. 8 below keeps the tree 40 under the head's top, where it always was. `check-files.cjs` and Review's `check-pane.cjs` hold both.
- The search field is T3's compact input: 28 high, 9 horizontal padding, 12px text, radius 6. Transparent at rest and hovered (T3's ghost input is 1.2%, unseen). Focused: `background`, a 1px `accent` border and an inner 3px `accent` 24% ring (`ui/input-group.tsx`), with no layout change. No clear slot: Escape clears and leaves the field. It is a Tab stop.
- Navigation column heads, Review's too, are this one, with no rule under them (T3's subheaders in the panel). The column's left rule is `border` at 60% (T3's `border-border/60`), drawn as its own element so a theme's translucent border keeps its alpha; it sits where the content's `background` meets the column's `chrome`.

## Tree rows

`shared/file-tree.js` `treeRow`, shared by Files and Review; slots never change its geometry.

- Row 24, 12px text, radius 6, padding 6.4, margin 1.6, 16px icons, gap 4.8. Each level indents 16 + 4.8 = 20.8, so a child's icon sits under its parent's name.
- No fold chevron: folders are Lucide `folder` / `folder-open` (`dim`), files Pierre's shapes coloured by theme ANSI or `dim` (t3-tokens「有意不同」).
- Review's reviewed box is a fixed 16 slot (plus the gap) before the icon; tri-state boxes and status letters as before.
- With the pointer over the tree, each level draws a 1px `foreground` 14% indent guide on the centre line of its folder row's first 16 slot: the icon in Files, the reviewed box in Review, so no line crosses a child's box.
- Hover 7%, selected 12%, a row whose context menu is open 7%. The `accent` 1px keyboard ring appears only after a key moves the selection.
- Ignored and reviewed rows: text `dim`, icon 50%; reviewed is also struck through.
- The viewport pads 10.4 each side: with the row margin, row boxes sit 12 inside the column, the head's edge (R1); Pierre uses 16.
- The tree-width handle steps 16 by keyboard.

## Tree behaviour

- Files and Review path rows are native drag sources (`treeRow`'s `drag` option), carrying the absolute path and the space's machine to `.drag_paths()`. Files uses `[join(st.root, row.top)]`; Review uses its repository root and real paths, never subgroup prefixes. A compact folder chain carries its outermost path, not its last segment. Deleted files and subgroup rows cannot drag. Normal clicks still open files or expand/collapse folders; starting a drag must not choose a row. Insert into terminal remains a separate menu action.
- Herdr 0.1.16 owns delivery: quote and paste without Enter; local files may copy into a remote terminal, local folders cannot upload; remote paths only drop on their own machine. It rejects control-character paths. Dropping outside a terminal cancels. Do not reimplement quoting, copying or validation in the mod. These real gestures require user verification; an element-tree check proves only the path/machine payload and unchanged clicks.
- Loaded single-folder chains stay compact when closed.
- Order: folders first, natural order (a small ASCII digit-run comparer: QuickJS has no `Intl`, and `localeCompare` puts `file2` after `file10`). Dotfiles shown except `.git`. Ignored entries dim.
- No Git badges, no deleted ghosts, no row or crumb tooltips (the user removed them, clipped names included).
- One selection. Arrows, Home, End, Enter, Space and Shift+F10 work.
- Only moves started from the tree or the breadcrumbs focus the tree. Tab switches, commands and other reveals only scroll and select, never taking the terminal's keyboard.
- Rows are virtual: only visible rows are drawn. The focus index and folder counts are built once per tree rebuild.
- A folder that can't be listed says so at its own row's end: `Can't list · Retry`, 12px `ansi1` (the destructive color is words only), what the shell or Herdr said on hover; a click reads it again without opening or closing it. Only the top folder's error stands in for the tree, with nothing else to draw.

## Folders from the breadcrumbs

- A folder crumb opens a folder tab beside the source file, keeping its trail; moving between folders then replaces that tab in place. Folders are never read as text.
- `›` opens that folder's menu, one native popup, as T3's `FileBreadcrumbs` (the user's choice, 2026-11-15, replacing a cascade): folders show a folder icon and `›`, files their type icon. Click or Enter on a folder shows it in the same menu, read afresh; keys that moved it light its first row. Opened from the keys, its first row is lit ([t3-tokens「菜单行」](../t3-tokens.md)).
- Below the crumb's own folder, the first row is `Back to <folder above>` (the project's name at the root, arrow-left icon), then a rule; both stay put while the entries scroll. Back or ← goes up one folder, never above the crumb that opened it; there ← does nothing. Esc closes; picking a file opens it and closes the menu.
- The menu's left edge lines up with `›`, 4 below; it keeps its height (12 rows) while it moves, and the entries scroll past that.

## Search

- Debounced 200ms, at most 256 characters; every word must appear in the path, case-insensitive substring.
- A query's results never show under another query; a query not yet searched shows loading.
- Results and their ancestors stay a tree; opening a result keeps the query.
- At most 200 files, file-name matches first, then shorter paths, then text order, plus a note to refine. `rankPaths` keeps only the top 200 by binary insertion and yields every 5000 paths, so 200,000 matches don't interrupt QuickJS; after it returns, the search checks it still counts.
- Sources: Git's non-ignored paths (`git ls-files -co --exclude-standard -z`), or a filesystem walk (`find`) up to 200,000 entries; remote at most 1000 (`awk`).
- Loading, no matches and errors are separate states.

## Reading and refresh

- Read only while the panel shows Files and the window is in front (`shown()`: a window behind, such as the demo's, never focused, stays on Loading files…). Returning reads at once; then every 5s locally, 10s remote, backing off when reads are slow. No recursive watcher; refreshes never race and do no synchronous disk IO.
- Text changes update in place; images reselect.
- Text up to 1MB; remote images up to 512KB. Binary, missing and non-UTF-8 files say why. A read error offers Try again beside Locate.
- Folder reads (a listing and its Git ignore check, each a process with two pipes) go at most 8 at a time across the page (`READ_AT_ONCE`): Herdr doesn't raise a GUI app's 256 open files, and a refresh listing every folder Expand all opened, all at once, had dozens fail to start ("Too many open files").
- Expand all skips ignored folders, as T3's `FileBrowserPanel`: each folder asks the repository it's in (`git check-ignore` run in that folder), so a clone inside a space's folder that isn't a repository has its `node_modules` left closed too; folders in no repository open (user's choice, 2026-11-15). At most 200 folders, four reads at a time; an ignored folder still opens by hand. Collapsing, a manual toggle or a search cancels a pending expansion, checked again after each await.
- Full data for the last three shown spaces; eviction releases it and late answers can't refill it.
- Thousands of rows stay smooth.

## Content

- Read-only: Markdown preview (`TextView.markdown`, 12 inside, not T3's `px-6`), the native read-only `Editor` with syntax colours, images. No editing or saving.
- The content area stops left presses from bubbling, so the root doesn't steal native selection focus; selecting and copying work.
- Colours: Herdr's `EditorState` colours on the UI thread, the whole file each `new` or `set_value`, about 1.5ms per KB; 1MB takes about 1.46s, a one-line change as long. Wrap is only an option of `new`, and a new editor starts at the top: the host gives no scroll position to read or set. So a file opened, or picked again, up to 256KB (`AUTO_MAX`) is coloured at once: a stall, never a jump (user's choice over plain-first). Plain first only where the text is back at the top anyway, and only over 16KB (`SYNC_MAX`, about 25ms; smaller is coloured at once): text rewritten while it shows goes in plain (1MB in about 12ms) and is coloured once it has held 10s (`SETTLED`), so an agent writing it stalls the window once; Wrap switched, plain, coloured after 300ms (`IDLE`). Either waits only while that file shows with the window in front. A scroll wheel over the plain code (`scrolled`) stops the swap, for its rewrites too, until the file is opened again. Over 256KB it isn't coloured without asking: `noticeBar` (`shared/panel-states.js`, T3's `FileSurfaceNotice`, `ansi3`) says so with **Highlight anyway**, which colours it at once, and its rewrites once they hold, while the page keeps it.
- The host has no gutter colour or height API, so the gutter can't match T3; the user kept the native Editor rather than an HTML renderer (a 40,000-line HTML prototype stalled painting).

### Editor languages

`EditorState.language` accepts any string, but only some names have a grammar. Mapped by extension (`model.js` `LANGUAGES`); the rest stay plain:

| Extensions | Language |
| --- | --- |
| `js mjs cjs jsx ts mts cts tsx` | `js` (the TS names showed no colour) |
| `json jsonc` | `json` |
| `yaml yml` | `yaml` |
| `rs` / `go` / `py` | `rust` / `go` / `python` |
| `sh` / `bash` / `zsh` | `sh` / `bash` / `zsh` |
| `css` | `css` |
| `c h` / `cpp cc cxx hpp` | `c` / `cpp` |
| `java` / `kt kts` | `java` / `kotlin` |
| `rb` / `php` / `sql` / `lua` | `ruby` / `php` / `sql` / `lua` |
| `graphql gql` | `graphql` |
| `Makefile`, `GNUmakefile` | `makefile` |

Seen without colour, so left plain: `toml`, `scss`, `html`, `vue`, `svelte`, `swift`, `dockerfile`, `diff`, `xml`, `nix`, `zig`, `elixir`. Markdown goes to `TextView.markdown`, not the Editor. Re-probe before adding a name: constructing an Editor without an error doesn't prove a grammar exists.

### readTextFile

Only a missing file returns `null`; an empty file returns `""`. Binary and invalid UTF-8 throw `stream did not contain valid UTF-8`, over 1 MiB throws `Text file exceeds 1 MiB`, a folder throws `Is a directory`. So `null` never means binary or too large; images go by extension. `model.js` `readProblem` turns the errors into sentences. Images are written under the app's `cache/t3-files/` (remote ones from base64) and cleared on close and at the next start.

## Tree menu

- A native popup at the pointer, 220 wide, 4 top and bottom, rows from t3-tokens「菜单行」.
- Local: Open, Reveal (`open -R`), Open with (default app where supported); relative Copy path; Insert into the tab's last active terminal (disabled when there is none). Remote spaces get no local-app rows.
- Arrows, Escape and typeahead work. `cmd-w` closes the menu before the tab.
- Insert: save the text clipboard, write the path, `pane.focus` the terminal, `terminal.paste`, then restore the clipboard 150ms later (paste reads the clipboard late; restoring at once pastes the old text). Never presses Enter, never overwrites an image clipboard or something copied meanwhile. Paths with control characters are refused; Copy path still works.
- Files and Review share `shared/menus.js`, copied to each mod with its dependencies; each opens its own popup, so standalone Review needs no Files mod. Right-click does not select, toggle a folder or mark reviewed. The menu owner keeps the shared row's context highlight. Review's deleted files offer only relative Copy path; subgroup rows have no menu.

## Commands

`t3-files.open:<path>`, `t3-files.search:<words>`, `t3-files.close`.
