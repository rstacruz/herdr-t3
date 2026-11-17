# Tab bar

Geometry, constants and edge rules of the 40px tab row (`t3-tabs`, plus the `actions` and `window-end` blocks), tab navigation and close safety. The [RECIPE](../../../RECIPE.md) says what the bar shows; shared sizes are in [t3-tokens](../t3-tokens.md); why the Inbox bar follows the agent is [ADR 0010](../../adr/0010-inbox-tab-bar-follows-the-agent.md).

## Lists tabs

- 24px, radius 6, 12px text; the active tab and a hovered one take the `chrome` on and hover fills (t3-tokens「按钮」).
- `shared/tab.js`, shared with the panel head's tabs. All the space's tabs: a 16px leading slot with the 12px program or terminal icon, the name, a trailing 16px state slot (kept empty without a state, so the width doesn't follow it). Hover or keyboard focus turns the leading slot into the close button (12px `×`, radius 4, `tab` surface), over the icon as T3's; the state stays at the end. The `×` is a keyboard stop only while it shows.
- At least 96px for short names (t3-tokens「有意不同」).
- Full names until crowded. Then the longest shrink first, the active tab to 240px and the others to 144px; then the strip scrolls.
- On active-tab or room changes only, bring the active tab into view with the least movement. Wheel scrolling is left alone.

## Inbox bar

- Left, a breadcrumb: space / relevant parent / viewed agent. 14px medium, 12 apart, dim slashes; the space `muted`, the viewed agent `foreground`. A sub-agent split with its parent follows it after another slash. Peers in the same tab get no switcher: their cards and panes reach them.
- Right, tool tabs: the same tab (`shared/tab.js`), sized to content, no minimum width and no state slot; hover `×` covers the icon.
- Tool order: non-agent panes hidden by zoom, the current family's other tabs, then tabs with no agent. 16px-high rules between non-empty groups. Tabs already in the breadcrumb (current, parent) aren't repeated.

### Room

- The breadcrumb takes its full width, up to the whole row. Right-aligned tools give way down to zero width, keeping their end visible, scrolled by wheel, clipped edges faded.
- Below 360px of breadcrumb room, the parent becomes `…`. Names truncate only when the breadcrumb itself exceeds the row.

### Who's in view

The bar and the Inbox share one rule (`navigation.js` `inViewAgent`), recomputed every frame from `spaces()`, `panes()`, `agents()`, `terminals()`:

| Focus | In view |
| --- | --- |
| An agent's pane | That agent: card lit, breadcrumb title |
| A sub-agent without a pane (peek, blocked) | Its nearest listed ancestor |
| An opted-in mod card's pane | That card; the bar treats it as a tool and the breadcrumb keeps the tab's last agent, unlit |
| A pane mod that didn't opt in | The agent beside it |
| A program in the same tab (held) | No card lit; the breadcrumb keeps the tab's last-viewed agent, dimmed |
| A tab with no agent, entered from the strip or tab keys (away) | No card lit; the breadcrumb keeps the space's last agent and family, dimmed |
| A tab with no agent after the breadcrumb space or `cmd-t` (fresh) | Just the space, until another agent is viewed |

- Two memories, in memory only: `trail` (space → last shown tab) and `lastIn` (tab → last-viewed agent). Each frame drops entries whose tab or agent is gone; a tab then falls back to its first agent. Restart loses both.
- While a close's landing hasn't shown yet (`going`), the neighbour Herdr picked doesn't count as in view.
- A held or away title returns to its agent on click and has no chevron. The current title opens the agent menu below, left-aligned; its chevron shows only on hover or focus.
- Right-click on the space, title or parent opens that object's menu, dimmed or not.

## Tab tooltips

- Only a clipped name gets a label: `tip.js`'s tooltip, below the tab, with the whole name (t3-tokens P5). Whole names get none, and the state isn't said, as `×` no longer covers the mark. Any press on the tab hides it; it stays down while a drag is held.
- The close button's tooltip, `Close tab`, waits 500ms; only the active tab's shows the key.

## Zoom group

- When Herdr's native zoom is on in a multi-pane tab, the tab becomes a 24px dashed-outline group, radius 6, one icon-and-name segment per pane. The zoomed segment is lit as the active tab (`foreground` 7%), at most 240px; others at most 144px.
- Lists keeps the tab's state at the group's end. The group has no close, tab menu or drag (shortcut in code).
- In Inbox the agent stays in the breadcrumb and only non-agent panes form tool segments.
- Clicking a segment focuses that pane and moves the zoom, without restructuring splits. Splits come back with the pane's zoom button or `cmd-shift-enter`; the bar has no button for it.

## Top-right group

Shaped as T3 `chat/PanelLayoutControls.tsx`: 28×28 ghost `sm` buttons, 16px `square-menu` and `panel-right`, 4 apart (t3-tokens P3, T3's `gap-1`).

- Order: Lists' new-terminal `+` (`tabs-end`), Details (the `actions` block), then the closed panel's `panel-right` (`window-end`, the `window` part of `t3-tabs`). `+` sits before Details and never moves it; the panel toggle always holds the corner, except at Home, which has neither. Each side carries its 4: `tabs-end` ends with it while `+` shows, `window-end` starts with it while the toggle shows (`panel.js` `windowEndPx` counts it), so the toggle ends 12 from the window edge open or closed and `titlebar.js` `detailsAnchor` computes Details' right edge from `windowEndPx` and the inset, never from a measure a frame behind; only the open panel's width is measured. Windows/Linux window buttons come last, 8 apart from the group.
- The group's right edge comes from the layout's `tabs-end-inset` (12, owned by no mod), aligned with the pane header's last control (t3-tokens R1). On a Mac with the panel closed, the toggle is 12 from the window edge and Details 44; with the panel open, Details is 12 from the work column's edge, and the panel and window buttons move to the panel head, onto the same screen points: the panel head's padding puts its last button 12 from the window edge too (`check-buttons.cjs` and t3-chrome's `check-surfaces.cjs` hold both at 12).
- The three blocks size themselves with `layout.resize`; leftovers under half a pixel after zoom aren't rounded up, or adjacent blocks gain a 1px gap.
- That resize follows a frame's measure, so it lands a frame late. Whatever shows or hides the panel (`panel.js` `showPanel`) resizes `window-end` in the same go to what it will draw (`windowEndPx`), so the frame that shows the change already has Details where it ends up. `check-buttons.cjs` holds `windowEndPx` to the drawn width; `check-panel.cjs` checks every open and close sizes it.
- On the 40px bar they take the `chrome` surface's fills (t3-tokens「按钮」), as the brand bar and panel head do. Details is a `trigger()`; tooltips sit below.

## Tab interactions

- Lists: click selects, double-click renames, right-click opens the tab menu, middle-click closes (the same `t3-tabs.close-tab:<id>` as `×`, so a running program asks first). Drag starts at 6px; Esc or leaving the bar cancels; keyboard focus is held only while dragging. Wheel only scrolls; it never switches tabs.
- Inbox: only tabs with no agent can be dragged, among themselves.
- The breadcrumb's space reuses a lone prompt-shell tab in that space, most recently viewed first, and creates one only if none exists, so repeated clicks don't pile up empty tabs. `cmd-t` always creates.

## Navigation keys

- Agent next/previous (`cmd-]` / `cmd-[`) walks the selected mode's rows without wrapping, including mod cards, not pane-less sub-agents. From Home, next takes the first row and previous the last.
- Tab next/previous wraps through the displayed tabs; `cmd-1…9` numbering follows them too.
- Space keys follow sidebar order, folded worktrees included, skipping Home and synthetic checkout rows; project numbers stay stable.

## Close landing

- Closing the viewed agent's whole tab or last pane: Inbox lands on Home, Lists on the space's last-viewed tab. With panes left, stay in the tab.
- A tab with no agent returns to the previous tab. Background closes never navigate. Without history (after restart), Herdr's choice stands.
- Layout closes leave first and close second, so an unread neighbour isn't marked seen.
- External closes and program exits can flash Herdr's choice for a frame. After leaving, the layout gives back a consumed done or `Woke` (writing `herdr.seen`) and retries failed label writes; staying 3s counts as seen. A brief neighbour or done flicker remains possible.

## Close confirmation

- Every layout ×, a tab's middle-click, close key, context-menu Close and Go to's `ctrl-d` asks `hc get <terminal> --json` first. Only the terminal's own shell: close at once. A running program, or no answer: ask.
- `Close terminal "<name>"?` with `This stops the running process and clears its history.` Several programs: a plural title and a list of names. A tab's lone pane uses the tab's name.
- Enter confirms, Esc cancels. The space's last pane uses Herdr's own Close space. Direct `tab.close` / `pane.close`, palette included, stay native.

## t3-tabs commands

The floating `tabs-keys` copy handles these even with the sidebar hidden or the panel maximized; the keyed ones are in the RECIPE's key table.

- `t3-tabs.{panel,review,files,home,settings,new,next,prev,settle,undo,details}`
- `t3-tabs.close-tab:<id>`, `t3-tabs.close-pane:<id>`
- `t3-tabs.pin:<address>`, `unpin:<address>`, `settle:<address>`, `wake:<address>`, `snooze:<address>:<wake-ms>`. Settle and Wake of a background agent don't go Home; the viewed agent leaves as with the key.
- `t3-tabs.space:<n>`, `space-next`, `space-prev`, `tab:<n>`, `tab-next`, `tab-prev`, `open-empty`
