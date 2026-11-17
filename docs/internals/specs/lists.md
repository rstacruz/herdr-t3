# Lists: Spaces and Agents

Geometry, constants and edge rules of Lists (`t3-spaces`, `t3-agents`). The [RECIPE](../../../RECIPE.md) says what Lists shows and how it behaves; shared sizes are in [t3-tokens](../t3-tokens.md); hover details and space marks are in [sidebar](sidebar.md).

## Headings

Spaces and Agents share the column equally, each at least 90px. Each heading is 32px, aligned with the Inbox's top row, with touching 28px buttons (16px icons).

## Spaces

- The list starts 4px below its heading. Rows are 32px, 1 apart (T3 puts 8 between folders; see t3-tokens「有意不同」), padding 8, gap 10: a 16px space mark and the medium name.
- With more than one machine, group by machine; an empty machine gets a `New space here` row. The machine heading's right-click offers New space here and Connect when the machine is connected or its core was rebuilt; a sleeping machine has no menu.
- Connect keeps its machine-specific accessibility label; no tooltip repeats the row's machine name. A rebuilt machine's Connect runs `hc machine rm`, then `hc machine add`.
- When `hc machine ls --json` reports `keeps_running_after_logout === false`, the machine heading keeps its connection dot and adds a `blocked` circle-alert after it: a 20px micro row button with a 12px icon, using `trigger()` and its tooltip/focus handling. Its label says agents stop when you disconnect and offers the fix. Clicking opens the shipped `machine-add` dialog (width 560), never runs `sudo`, and never folds the heading. The modal covers the button, so the trigger keeps no popup-open stamp. True or a missing field shows nothing; the report needs remote herdr-core 0.1.21+. The next machine refresh removes the warning after repair.
- Git facts only when unusual: `repo · branch ↑2 ↓1`, leaving out `main` and `master`. Reads are read-only `git status` and `git rev-parse` with `--no-optional-locks -c core.fsmonitor=false`, without untracked scans, on place, command, turn or reconnection changes, with a slow foreground fallback. Machines come from `hc machine ls --json`.
- A local repository's pending folder watch is cancelled as soon as no space uses it, and every watch is released when the view closes. A late event or read cannot restart a released watch. Git probes still have a 60-second foreground fallback; remote repositories use no local watch.
- Worktrees nest under their repository with tree lines. Fold state is kept per repository.
- With the checkout closed, two or more worktrees sit under a dim synthetic checkout at the first worktree's old position; a single one stays a plain `repo · branch` row. Clicking the synthetic checkout opens it once with `space.new`, replacing the row without moving the group; a bare repository folds instead.
- The viewed worktree stays outside a fold and out of its hidden count.

### Space dragging

- Drag 6px to reorder within the space's machine. A checkout moves with its expanded worktrees; a worktree moves only among its siblings.
- The lifted row is `selected` with a shadow, with an insertion gap. Release commits with `space.move`, holding the intent until the model echoes it. Esc or leaving cancels.

## Agents

- Rows 36px, radius 6, 1 apart, padding 8, gap 10, a 16px program slot.
- The viewed and attention-needing agents stand out; others recede until hovered, working ones at 70%.
- Before the status, time in state (`<1m`, `5m`, `3h`, `2d`, 12px). Hover cross-fades it to a pin control over 150ms.
- No inline machine mark: the hover details card carries it.

### Sorting and groups

- Sort by space or by priority. Pinned is a shared group in either sort.
- Priority headers use the Inbox shelves' 32px form. Space headers use T3's project-folder form: 8 above, a 16px mark, the medium name, and a right-click space menu.
- A closed group shows its hidden count and urgency mark, and keeps the viewed row outside the fold.
- The sort menu hangs right-aligned 4px below its button, fades in over 150ms, 28px rows; the same button closes it.
- Motion is the Inbox's ([inbox](inbox.md#motion)) for sorting and folding; fold chevrons cross-fade their direction.

### Sub-agents

- A parent's fold chevron comes before the time. Folded by default, with a dim hidden count in a badge 20 high and at least 20 wide.
- A first-level sub-agent's row is 28 in, each level below 20 further. Status marks sit in a 20px column on every row.
- Tree lines are 1.5 wide and run down the parent icon's centre, 15.25 from the row's edge (a level down, 35.25). A middle child's line runs on; a last child's turns in: 9.75 long, 6 radius, ending 4 before the child's icon. Worktrees under a checkout use the same lines, their icon 20 in, level with a sub-agent's.
- Blocked or errored sub-agents still show one step in while folded.
- A sub-agent with its own pane appears once, under its parent, unless pinned.
- A folded sub-agent in view lights its parent. The viewed done agent stays Done until left.
- Fold state of ended agents is dropped.

### Clicks and pins

- A top-level row runs `agent.focus`; a sub-agent row peeks (`terminal.peek`).
- Pin buttons share the Inbox's pins (`shared/pins.js`) and end Snooze; unpin uses the global Undo notice.
- Settled and snoozed agents keep their order and working spinner in Lists; only unread done is suppressed. There is no Settled group here.
