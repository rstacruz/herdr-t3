# Sidebar chrome, space marks and hover details

What the [RECIPE](../../../RECIPE.md) leaves out of the sidebar's frame: exact geometry, timings and the rules behind space marks and the hover details card. Shared sizes (buttons, tooltips, menus) are in [t3-tokens](../t3-tokens.md); the Inbox and Lists bodies have their own specs, [inbox](inbox.md) and [lists](lists.md).

## Brand bar

- macOS window buttons first. Then Herdr's mark (`frame/welcome/herdr.png`, 20px, radius 5, 70% opacity) and `Herdr` (14px medium `muted`), 8 apart. Both brighten on hover and while Home is in view.
- Mark and name are one 28px button that goes Home: no tooltip, no hover fill.
- When the name can't fit whole, hide all of it and keep the mark; never `Her…`.
- At the right, 8 in: mode switch and hide sidebar, touching 28px buttons with 16px Lucide icons. The mode icon names the destination: `inbox` or `layout-list`.

## Window buttons

- macOS traffic lights start at `[16, 12]`: centred on the 40px brand bar, 16 screen points before the mark.
- Without a title bar and outside full screen, their unzoomed Y is `12 + 20 × (zoom − 1)`. Only the installed layout named `herdr-t3` is adjusted, never a renamed copy. The field is written as [storage](../storage.md) says for layout files (expected-content write of `traffic_lights` only).
- Sidebar hidden or narrow: the tab bar reserves room for the lights.
- Windows: 28px window buttons at the end of the bar, the `window-end` block (see [tab-bar](tab-bar.md)).

## Footer

- 44px high. 32px icon buttons 4 apart (t3-tokens P3; radius 8, 16px icons), 8 in from the side and 4 from the top: Herdr Settings, then the layout's sliders button (Layout Settings).
- The free space between them and the edge holds the Undo notice ([inbox](inbox.md#undo-notice)).
- When an update has downloaded: a right-aligned 32px `Update` pill, 12px `accent` text on a 15% `accent` wash, running `app.update`.

## Sidebar icon sizes

From T3 `SidebarThreadHeader.tsx`, `SidebarProjectFolderHeader.tsx`, `ui/collapsible-section-header.tsx`, `SidebarThreadRow.tsx`: the icon follows its button. A 28px button takes a 16px icon, a 24px small button (`icon-xs`) a 14px icon; shelf and folder fold chevrons, in-row controls and marks are 12px.

## Right-edge columns

The sidebar keeps two icon columns at its right edge, in Inbox and Lists alike: 12px fold chevrons centred 22px from the edge; the machine `+` (24px, 14px icon) centred 50px from the edge.

## Space marks

- Prefer the project's favicon from the repository root of the space's current place: its first terminal's folder, else its original folder. Well-known favicon files first, then icon declarations in pages and routes; never `.icns`.
- Drawn 16px, radius 25%.
- Otherwise the name's first letter or digit, capitalised, bold mono at 8.25/16 of the mark, in one of T3's 18 colours picked by a hash of the name (Tailwind 400 on dark themes, 600 on light), on a 14% wash of that colour. No usable character: a folder icon.
- Found icons are rechecked after ten minutes, missing ones after one.
- Reads run on the space's machine: `git rev-parse --show-toplevel`, `sh -c` file tests, `base64`. Copies are kept under the app's `cache/t3-icons/`; icon and colour metadata is shared (`t3.spaceIcons`, see [storage](../storage.md)).

## Status marks

`shared/status-mark.js`, the same everywhere:

- Working: the shipped spinner in `working`, with the duration where there is room.
- Blocked: a rounded `!` on a 15% `blocked` wash: 14px normally, 16px in the Inbox, 12px in Agents and sub-agent rows. A sub-agent's Failed is the same badge in `ansi1`.
- Done: a 6px `done` dot until read; the Inbox writes a green `Done`. A sub-agent's done is its own and never becomes the parent's unread result.
- Idle: a ring in Agents, elapsed time in the sub-agent list, nothing elsewhere.

## Hover details card

Inbox cards and slim rows, Agents rows and sub-agent rows share one card.

- Content: title, space, remote machine, branch and program. A sub-agent's card names its parent's space and shows a branch only if the sub-agent has its own pane.
- 12px text, at most 320 wide, solid surface with `shadow_xl`, 4px to the right of the row, tops aligned.
- The first card waits 150ms. Within 400ms of another closing, the next opens at once.
- The first and last fade and slide 4px over 150ms; instant replacements never overlap.
- Controls suppress the card across their whole corner. A click dismisses it, a drag hides it.
- Program, pin and machine marks have no tooltip of their own: the card carries them.
