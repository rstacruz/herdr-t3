# Space panel

The right-hand space panel's head (`t3-chrome` `part:"panel"`), its surface tabs, empty page and tab lifecycle. Files and Review pages have their own specs, [files](files.md) and [review](review.md). Decisions: [ADR 0017](../../adr/0017-space-panel-surfaces.md); stored state: [storage](../storage.md) (`t3.panels`). Shared sizes are in [t3-tokens](../t3-tokens.md).

Sources: T3 `09a54f01` `RightPanelTabs.tsx`, `ui/panel-tab-close-button.tsx`, `RightPanelEmptyState`.

## Column

The rightmost full-height column: initially hidden, initially equal in weight to the work column, at least 480px, its outside divider draggable. No card: the 40px head and `panel-body` below it are one `chrome` surface from the top to the window's bottom, set apart from the work column by the root's 1px divider. The head's layout padding (12 each side) and the pages' own rows put content 12 in from the column's edges, so the head's panel-right stands where the tab bar's does with the panel closed (12 from the window edge, same 40px row). The width is one for the whole window.

## Head

- The head's ends sit 12 inside the column, by `panel-head`'s layout padding (t3-tokens R1): the first tab's box and the last button's box on the same edges as the page header below. The head's mod draws no inset of its own.
- Tabs: `shared/tab.js`, the tab bar's. 24 high, at most 144 wide, radius 6, padding 6 left and 8 right, children 2 apart, 12px text. A 16px slot on the left holds the 12px surface icon; on tab hover or keyboard focus it becomes a 12px `×` (radius 4, `tab` surface), a keyboard stop only then. Review's run status sits in a 16px slot at the end and stays while `×` shows. A clipped name says itself whole in a tooltip below; any press hides it.
- Active and hovered tabs take the `chrome` on and hover fills, as the tab bar's (t3-tokens「按钮」); text `foreground` / `muted`, as the tab strip's unselected tabs.
- `+` follows the last tab, 4 apart, inside the same scrolled strip: `trigger()`, xs ghost (24 square, 14px icon).
- Overflow: wheel scrolls; T3's `‹ ›` (xs, 4 apart, P3) sit after the strip, greyed at the ends (`DISABLED`). Both ends of the strip fade over 16px (`shared/scroll-strip.js`, shared with the tab bar). The active tab, and a last tab's `+`, scroll into view.
- Then maximize/restore and panel-right (sm, 4 apart, 16px icons), 8 after the arrows; their `chrome` hover and on are the bar's. Layout controls are rightmost. With the panel open, the window buttons move here too.
- Same names aren't told apart (T3); a clipped name's tooltip gives it whole.

## Surface menu

- `+`'s menu: left-aligned, 6 below; opened by keyboard, it computes the same position from the head's width and scroll. 220 wide, rows × 28 + 8 high; rows from t3-tokens「菜单行」.
- Rows: Files (F), Review (R) when installed. Letters pick, arrows skip greyed rows, Enter runs; letters with modifiers, or with an input focused, pass through. Review greyed with its reason when unavailable; no "checking" flash.
- In Files or Review, `cmd-t` opens this menu under `+` and `cmd-w` closes the active tab, never the terminal: both through `keys.json`'s `mod:t3-files` / `mod:review` contexts (`t3-chrome.surface-menu`, `t3-files.close`, `review.close`), not `on_key_down`.

## Empty page

- Centred "Open a surface", as T3's `RightPanelEmptyState` and Home: title `foreground`; a list at most 320 wide, rows 32, padding 10, gap 10, radius 8; key hints are 20px keycaps (radius 4, 12px medium, `foreground` 7% wash).
- The group is centred in the panel after leaving 40 at the bottom (T3's top-bar height).
- The page doesn't take the keyboard from the terminal. Review's availability is checked at render, with no polling timer.

## Tabs and their lifecycle

- No fixed pages: one tab per file, at most one generic Files and one Review.
- `+` Files adds or selects the full-width tree. Opening a file replaces generic Files, or selects the file's existing tab.
- All file tabs share one tree. Selecting a tab bumps its `reveal`: Files clears the search and reveals the file. Opening a file from the tree or search results isn't a selection and keeps the search.
- Close with `×` or a middle click. Closing the active tab picks the right neighbour, else the left; closing another keeps the active one. Closing the last hides the panel; reopening shows the empty page.
- Tab menu: Copy path (file or folder), Close, Close others, Close to the right, Close all; impossible items greyed; bulk closes in one step.
- Hiding or switching keeps everything; closing lets go: each mod drops what a gone tab instance (`born`) held. Review re-added starts at its default range and ignores requests sent to the closed one.
- Per space, the three most recently shown file tabs keep their preview, Editor and position; older ones reload at the top.
- A deleted or renamed file keeps its tab, showing the path and root, with Locate and Try again.
- Each space keeps its tabs, active tab, open state and maximized state; unused spaces start closed and empty. Hiding keeps the tabs and leaves maximize; returning to the space restores it.
- Terminal path clicks aren't done: the host has no link callback.

## Which repository Review reads

The repository where the tab works: its last active terminal's cwd, else the space folder (as T3's diff follows its thread). Remote, or not a repository, greys Review with the reason, in `+` too. `panel.js` `reviewRepo` decides it once for the menu, the empty page, `cmd-shift-g` and Review itself.
