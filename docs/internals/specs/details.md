# Details popup

The Details popup (`t3-actions`, `cmd-shift-b`) and its Review row: geometry, rows, menus and edge rules. The [RECIPE](../../../RECIPE.md) says what it holds; the decision is [ADR 0019](../../adr/0019-details-popup.md); its button sits in the tab bar's [top-right group](tab-bar.md#top-right-group). Shared sizes are in [t3-tokens](../t3-tokens.md).

Sources: T3 `09a54f01` `chat/threadDetailsPanelStyles.ts`, `ThreadDetailsSection.tsx`, `threadDetailsCardLayout.ts`.

## Card

- A native popup hanging below its button, right-aligned to it (`align="end"`), 280 wide, 1px theme `border`, radius 16. Its height is the content's natural height, at most 420.
- No shadow: the native popup is the card's own size, so a shadow would be clipped square.
- Sections are padded 8. Rows 32, 13px medium text, 16px icons, gap 10, 10 horizontal, radius 8.
- Row colours: text `foreground`, icons `dim`, background `popover`, edge `border`. Hover is the card's 7%, an open menu the card's 12%; a split group and each of its halves respond to hover separately. Rows that aren't splits use `shared/button.js` `cardRow()`. Values are this layout's tokens, not T3's `foreground/80` or black/white alphas.
- A section `border` (1px) is drawn only when the section is visible and the section before it isn't empty: no empty separators.

### Scroll viewport

- The scrolling viewport is at least 50 high: one 32px row, 8 above and below, a 1px border each side. Content scrolls inside a capped viewport only when its natural height passes 420.
- The minimum keeps the host from measuring a scroll root of unknown height as 0 (see [layout implementation](../layout-implementation.md)); it doesn't fix the card at 50 or 420.
- The content height is measured in a layout callback, and the outer element gets that height plus 2px of border.

## Workspace rows

- **Machine**: the computer's name (this Mac's ComputerName, or the remote machine), truncated to one line. Locked: transparent, no hover, no chevron. The folder is only a tooltip in the row's trailing 32px slot, on the same vertical line as the other rows' chevrons. Right-click on the whole row opens a one-item Copy full path menu (right-click always opens a menu in this layout). No migration of a pretend terminal.
- **Open in**: Finder plus the installed T3 editors (Cursor, Trae, Kiro, VS Code, VS Code Insiders, VSCodium, Zed, Antigravity, JetBrains). The menu is always there; choosing only saves the global target, the main half opens. A missing target falls back to Finder. Remote spaces disable it with a reason. App icons are coloured `image()`s; without a dedicated icon, this mod's own `app-window`, never another mod's file. Host checks: `open -Ra` / `open -a`; Finder uses `open -R`.
- **Actions** (global, see [dialogs](dialogs.md#actions)): empty, an Add action row; otherwise the primary action with a menu. Edit shows only on hover or keyboard focus.

## Splits

- Splits use `shared/button.js` `split()` `row`: T3's `isPanel` split, `ghost`, not the outlined `xs` of a header (Files' Open in, Actions' bar): rows in a card read as a list, and an outline round each would box every row. A 32px chevron slot, a 1×16 middle rule.
- The chevron always shows, `dim`, as T3. At rest: no background, no rule. On hover (7%) or with its menu open (12%), the whole group takes one background and shows the rule. The half under the pointer adds its own 7% on top of the group's.
- Chevrons and the folder tooltip share the trailing slot. Chevrons have only an aria-label, no tooltip.
- Submenus are as wide as the whole row and hang 4px below it.

## Tooltips

- Add action's tooltip only in its icon-only state. Action, computer and surface names get one only when actually clipped (measured, `measuredTooltip`).
- All tooltips are the layout's own (`tip`), never the host's `.tooltip()`.

## Review row

- A `split()` row. The main half is the icon, the name, then in 12px `dim` the range the live Review tab shows: only `review.shown` written by a Review tab that still exists (matching `born`), otherwise nothing. Same words as Review's range button; a commit shows its title.
- The main half shows Review on that range, else its default.
- The chevron opens the range menu under the row: as wide as the row, 4 below, rows from t3-tokens「菜单行」. Review's ranges only: no base, no `‹ ›`. Only the shown range is checked; before Review has shown one, nothing is.
- Commits opens beside it in its own popup, 320 wide (T3 `w-80`), list at most 320 high, placed with `submenu.js` `subPlace` next to the Commits row.
- Choosing a range shows Review on it and closes Details.
- Counts, commits and refs are read afresh on every opening, outside render; a late read applies only if its token, root, space and base haven't changed. No Git writes, no PR rows.
- Details opening already reads them, for its own space only (`review-details.js` `prefetchRange`: `reviewRepo`, then `readScope`), when its Review row shows and can open.
- The menu draws at once, never a "Reading…" note: the last read of the same repository root and base (`review-scope.js`, kept for the mod's run, [storage](../storage.md)), its numbers replaced as the fresh read lands; the root the space read last (`roots`) is used at once and checked behind it. With nothing read for that root and base: the rows' names, their counts' places blank and not greyed; past 150ms still reading, `…` there (the wallpaper's rule: nothing for waits under 150ms). ↑/↓, Home, End and typeahead work throughout.
- A range picked before the fresh read lands (drawn from the last read, or not read yet) waits for it, then goes only if that row is still pickable in the fresh read (a count, or the range shown); otherwise nothing happens and the menu stays with the fresh counts. Commits opens at once (its commits are the last read's until the fresh one lands). The Review page's own range menu follows the same rules (shared `readScope`).
- Review not installed, or a remote space: disabled with a reason. Outside a Git repository, the menu says so.

## Keyboard and lifecycle

- Opened by keys (`cmd-shift-b`, Enter or Space on its button: `toggleDetails` with no press puts `litProp(true)` in its props), its first control has the keyboard with the focus ring; by the pointer, the card has it and nothing is ringed until the first arrow.
- ↑/↓, Home, End and typing move between rows as a menu's (`list.js` `menuKeys` over `detailsGrid`), wrapping and keeping the half; ←/→ move between a split's halves and stop at its ends. The machine row isn't in the walk. Tab, Enter and Space work as on every stop: Enter and Space are the control's click.
- A row's menu opened by keys hangs under that row (from `props.at` and the row's top: no press to measure) with its first row lit (t3-tokens「菜单行」). When it closes, the keyboard returns to the chevron that opened it (`popup-menu.js` `backTo`, run in its close, never in render), unless the focused terminal changed meanwhile, as when an action ran beside it.
- Escape closes one layer at a time; on the card, it closes Details and gives the keyboard back to the source terminal.
- Opening an editor keeps the popup; running an action closes only its menu.
- Opening captures the space, tab, terminal and cwd. An action's explicit cwd wins. When the source changes, the popup closes.
- Opening the panel closes Details. Clicking outside keeps the panel. With the panel maximized, the shortcut first restores the work column.
- Details never changes terminal geometry. Home has no Actions.

## Choose what to show

The card's right-click toggles the four items that exist (`environment`, `openIn`, `scripts`, `review`) and Reset. With all hidden, a Choose what to show row stays, opening its menu under itself. Stored in `t3-actions.detailsItems` (see [storage](../storage.md)).
