# New, Go to, Actions and dialogs

Geometry and rules of the command popups (`t3-new-menu`, `t3-picker`), Actions (`t3-actions`), confirmations and Layout Settings. The [RECIPE](../../../RECIPE.md) says what they do; dialog and palette tokens are in [t3-tokens](../t3-tokens.md)「组件」 and「做不到」.

## New and Go to

- Top-centred popups, offset 96 (t3-tokens「做不到」), 576 wide, content-sized up to 420, radius 16, 1px border, `shadow_2xl`. Content shows from the first frame.
- Rows 48: 20px title line and 16px second line, radius 4, 6 vertical padding.
- A ruled footer with 20px keycaps (radius 4, 12px medium).
- Go to has a borderless 36px search, 6 above and below. New's list caps at 285, Go to's at 313; both scroll with the keyboard highlight.

### Go to

- `cmd-p` or the Inbox's Search. One row per pane: agents, shells, programs and mods; never terminals without panes, never Home.
- Order: recent panes newest first, then the current space, the current machine, the remaining space and tab order; the current pane last. Up to 30 live panes are remembered from every navigation route (`t3-tabs.recent`). It opens on the previous pane, so `cmd-p`, Enter toggles back and forth.
- Row: space mark and shared pane name; beneath, program icon and name, remote machine, space and live sub-agent `+n`; state at the right.
- Searches space and machine, explicitly named tab, pane name, program name and key, and folder. Pane-name matches rank before metadata-only matches.
- Enter or click runs `pane.focus`, across spaces. `ctrl-d` closes through the same confirmation as other closes ([tab-bar](tab-bar.md#close-confirmation)).
- Footer: ↑/↓ Navigate, Enter Go, Ctrl-D Close pane, Esc Close; New tab opens New.

### New

- Spaces, current first, machines kept together; the second line is the folder, with server or machine for remote spaces.
- Platform `1…9` pick numbered rows, labelled `⌘1` on macOS and `Super+1` elsewhere.
- New space in the footer asks which machine when there are several, disabled until ready, with `← Spaces` to go back. `cmd-n` uses the active space's machine directly and is shown in the footer only when no machine question is needed.
- The sidebar's New space starts at the machine step; with one machine it creates at once.
- New tab uses the space's current place (first terminal's folder, else original folder), not always its creation folder.

## Actions

- Global, not per project. The primary is the last run, else the first. `▶` repeats it; choosing from the menu runs and makes it primary; a row's gear edits; Add action creates. The menu is one, from the bar's `⌄` or Details' row, as T3's `ProjectScriptsControl`: no rule over Add action, a row's gear only while the row is lit or the gear has the keyboard.
- Editor fields: required non-blank Name and Command; optional Folder, icon and place (Tab / Split right / Split down). Save is disabled until valid; Delete asks.
- Each run opens a new named tab or split: `terminal.open { argv: ["sh", "-c", command], name, place, folder? }`; the shell stays after the command exits.
- Without a Folder: the focused terminal's cwd, else a same-tab terminal's cwd, else the space folder; `~` expands.
- The list and last choice persist across restarts (`t3-actions.actions`, shape in [storage](../storage.md)).
- Shell aliases and functions need an explicit shell, such as `zsh -ic '…'`; plain Windows needs `sh` installed.

## Actions editor and confirmations

- 512 wide, radius 16, content-sized, padding 24, 20px semibold titles, 32px fields and buttons of radius 8; the shell is drawn by the mod (t3-tokens「做不到」).
- Confirmation titles wrap. Cancel comes before the named action (Close, Delete, Confirm). The action is red text (`ansi1`) on `raised`, not a red slab; the footer is bare, with no rule (t3-tokens「有意不同」).

## Layout Settings

- Opens from the footer's sliders or `cmd-shift-,`; invoking again replaces it. Esc closes an open select first, then the dialog.
- Deliberately Herdr's Settings, not T3: 880×620, a 190px left navigation with the `Herdr T3` title and a Home section, the right page inset 28/22, 14px row titles over 12.5px `dim` hints, dividers, 220×32 selects.
- Selects use 28px menu rows, no initial highlight, a check on the current item, arrows, Home, End and typeahead, Enter or Space to choose, Esc or outside to close.
- Home shows lists installed mods with `"home": true` in `mod.json`, read from the app home's `mods/` when opening; unreadable or invalid manifests are skipped. Sorted by title, else folder name; the selected mod stays listed even if it no longer offers itself.
- Choosing Home content refits Home at once and on arrival. Settings are live across instances and survive updates (`t3.settings`, defaults in [storage](../storage.md)).
