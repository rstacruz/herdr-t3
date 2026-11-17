# Pane header and sub-agent list

Geometry and edge rules of the pane header (`t3-pane`) and its sub-agent list. The [RECIPE](../../../RECIPE.md) says what the header shows; shared sizes are in [t3-tokens](../t3-tokens.md).

## Header

- 28px, inside the pane, on every pane outside Home.
- Order: program icon, name (14px medium), folder 12 after, sub-agent button, state, then split right, split down, zoom/unzoom and close.
- Header controls are 24px with 14px icons, shown on hover or keyboard focus.
- The first icon and word line up under the first tab; the last control or state sits 12 from the window edge (t3-tokens R1).
- A name equal to its program's name is left out. In Inbox, a lone or zoomed agent's name is already in the breadcrumb and is left out; split panes keep their names.
- Inbox headers mark a settled agent with a 14px `dim` check, a snoozed one with a 12px `accent` alarm clock and the time left; working and blocked take precedence. Lists shows neither mark.
- In a split, unfocused headers fade icon, name and folder to 50%, back on hover; state and controls keep full opacity.
- Terminal addresses never show here; Copy address is on the terminal and header menu (not on mod panes).

## Sub-agent button

- `3 ⌄`: live descendants only, tinted `blocked` if any need the person (no `!` of its own). While any descendant, at any depth, is working and the agent itself isn't, the 12px `statusMark` spinner stands before the count, 4 apart, so the button grows 16: a header shows at most one spinner, and the agent's own comes first. Tooltip and aria give the total, the attention count and the working count (`3 sub-agents, 1 needs you, 2 working`). The header's state mark stays the agent's own.
- 24px control, 12px medium text, padding 8, gap 4, 14px chevron, radius 8. A `trigger()`: on while its list is open.

## Sub-agent list

- A popup 280 wide, 4 below the button, right-aligned to it; padding 4, 28px rows, no heading. Ten rows, then it scrolls. It closes when no descendant is left.
- Depth-first tree order, never sorted by urgency. Each level indents 16: `menuRow`'s `lead` holds a `16 × depth − 8` spacer (plus the row's gap of 8).
- Row: program icon (16), name, then the Agents rows' mark in `trail`: spinner and duration; `!` and `Needs you`; `!` and `Failed` in `ansi1` (same badge, see t3-tokens「有意不同」); an unread done dot; idle age (`12m`). Blank before the first report.
- The pointer or arrows light a row; leaving clears it. Click or Enter peeks (`terminal.peek`) and closes. Right-click closes the list and opens the shared `t3-menu` agent menu.
- Command shells aren't agents and are skipped.
- Built from each frame's `terminals()` through `shared/tree.js` `kidTree`, with no snapshot; a 1s timer only refreshes durations (see [layout implementation](../layout-implementation.md)).
