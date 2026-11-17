#!/bin/sh
# After editing this repo: copy t3-inbox, t3-actions and the Review extra to their standalone repos, then update the local Herdr App (update.sh).
# Real copies, not symlinks: Herdr App doesn't load a mod's own SVGs through a symlink.
set -eu
src=$(cd "$(dirname "$0")/.." && pwd)
inbox=${HERDR_T3_INBOX:-$src/../herdr-t3-inbox}
actions=${HERDR_T3_ACTIONS:-$src/../herdr-t3-actions}
review=${HERDR_PULLS_REVIEW:-$src/../herdr-pulls-review}
gen="--exclude gpui-kit.d.ts --exclude jsconfig.json"

# shared/ holds one source for what several mods use; a mod can't import outside its folder, so each gets a copy.
share() { f=$1; shift; for d; do cp "$src/shared/$f.js" "$src/$d/"; done; }
share name mods/t3-inbox mods/t3-agents mods/t3-tabs mods/t3-pane mods/t3-picker
share program mods/t3-inbox mods/t3-agents mods/t3-tabs mods/t3-pane mods/t3-picker
share tree mods/t3-inbox mods/t3-agents mods/t3-tabs mods/t3-pane mods/t3-picker mods/t3-menu
share status-mark mods/t3-pane mods/t3-agents mods/t3-tabs mods/t3-picker mods/t3-chrome mods/t3-inbox extras/mods/pulls-review
share project mods/t3-inbox mods/t3-agents mods/t3-picker mods/t3-spaces mods/t3-new-menu mods/t3-tabs mods/t3-menu
share tip mods/t3-menu mods/t3-inbox mods/t3-agents mods/t3-tabs mods/t3-pane mods/t3-chrome mods/t3-spaces mods/t3-actions mods/t3-home mods/t3-new-menu mods/t3-files extras/mods/pulls-review extras/mods/review extras/mods/asciicn-wallpaper
share details mods/t3-inbox mods/t3-agents mods/t3-tabs extras/mods/pulls-review
share measured-text mods/t3-actions mods/t3-chrome mods/t3-tabs
share tab mods/t3-tabs mods/t3-chrome
share motion mods/t3-inbox mods/t3-agents mods/t3-spaces
share focus extras/mods/review mods/t3-inbox mods/t3-agents mods/t3-tabs mods/t3-pane mods/t3-chrome mods/t3-spaces mods/t3-actions mods/t3-home mods/t3-new-menu mods/t3-picker mods/t3-files extras/mods/pulls-review extras/mods/asciicn-wallpaper
share list mods/t3-chrome mods/t3-tabs mods/t3-inbox mods/t3-agents mods/t3-pane mods/t3-actions mods/t3-menu mods/t3-new-menu mods/t3-picker mods/t3-files extras/mods/pulls-review extras/mods/review extras/mods/asciicn-wallpaper
share zoom mods/t3-inbox mods/t3-agents mods/t3-tabs mods/t3-picker
share sidebar mods/t3-chrome mods/t3-home mods/t3-tabs mods/t3-spaces mods/t3-agents mods/t3-inbox mods/t3-pane mods/t3-menu
share layout-settings mods/t3-chrome mods/t3-tabs mods/t3-inbox
share snooze-presets mods/t3-inbox mods/t3-menu
share store mods/t3-inbox mods/t3-agents mods/t3-tabs mods/t3-pane mods/t3-chrome mods/t3-spaces mods/t3-actions mods/t3-home mods/t3-new-menu mods/t3-picker mods/t3-menu mods/t3-files extras/mods/pulls-review extras/mods/review extras/mods/asciicn-wallpaper
share labels mods/t3-inbox mods/t3-agents mods/t3-tabs mods/t3-menu
share space-labels mods/t3-inbox mods/t3-spaces mods/t3-labels
share pins mods/t3-inbox mods/t3-agents mods/t3-tabs mods/t3-menu
share menu mods/t3-inbox mods/t3-agents mods/t3-spaces mods/t3-tabs mods/t3-pane
share panel mods/t3-chrome mods/t3-tabs mods/t3-actions mods/t3-files extras/mods/pulls-review extras/mods/review
share terminal-context mods/t3-tabs mods/t3-actions mods/t3-files mods/t3-chrome extras/mods/pulls-review extras/mods/review
share surfaces mods/t3-chrome mods/t3-tabs mods/t3-actions mods/t3-files extras/mods/pulls-review extras/mods/review
share scroll-strip mods/t3-tabs mods/t3-chrome
share submenu mods/t3-menu mods/t3-files mods/t3-actions extras/mods/review
share review-git mods/t3-actions extras/mods/pulls-review extras/mods/review
share review-menu mods/t3-actions extras/mods/review
share review-scope mods/t3-actions extras/mods/review
share pierre-icons mods/t3-files mods/t3-chrome extras/mods/review
share pierre-icons-data mods/t3-files mods/t3-chrome extras/mods/review
share file-tree mods/t3-files extras/mods/review
share file-listing mods/t3-files extras/mods/review
share menus mods/t3-files extras/mods/review
share nav-column mods/t3-files extras/mods/review
share menu-row mods/t3-pane mods/t3-files mods/t3-actions mods/t3-chrome mods/t3-menu mods/t3-inbox extras/mods/review extras/mods/asciicn-wallpaper extras/mods/pulls-review
share open-in mods/t3-files mods/t3-actions extras/mods/review
share panel-states mods/t3-files extras/mods/review
share color mods/t3-menu mods/t3-actions mods/t3-agents mods/t3-spaces mods/t3-inbox mods/t3-tabs mods/t3-pane mods/t3-chrome mods/t3-files mods/t3-home mods/t3-new-menu mods/t3-picker extras/mods/pulls-review extras/mods/review extras/mods/asciicn-wallpaper
share button mods/t3-menu mods/t3-actions mods/t3-agents mods/t3-spaces mods/t3-inbox mods/t3-tabs mods/t3-pane mods/t3-chrome mods/t3-files extras/mods/pulls-review extras/mods/review extras/mods/asciicn-wallpaper
share trigger mods/t3-actions mods/t3-chrome mods/t3-pane mods/t3-tabs mods/t3-inbox mods/t3-spaces mods/t3-agents mods/t3-files extras/mods/review extras/mods/asciicn-wallpaper extras/mods/pulls-review
share popup-menu mods/t3-menu mods/t3-files mods/t3-actions extras/mods/review
share titlebar mods/t3-chrome mods/t3-actions
share palette mods/t3-home mods/t3-chrome mods/t3-new-menu mods/t3-picker
# The checks' fake elements and loader, beside each mod's checks: a standalone repo has no shared/.
share check-kit mods/t3-actions mods/t3-chrome mods/t3-files mods/t3-inbox mods/t3-new-menu mods/t3-pane mods/t3-picker mods/t3-spaces mods/t3-tabs extras/mods/pulls-review extras/mods/review
# The file tree's icons (pierre-icons.js's, scripts/vendor-files-icons.ts makes them; a folder's two): each mod draws only its own.
for d in mods/t3-files mods/t3-chrome extras/mods/review; do rsync -a --delete "$src/shared/icons/pierre/" "$src/$d/icons/pierre/"; done
for d in mods/t3-files extras/mods/review; do rsync -a --delete "$src/shared/icons/tree/" "$src/$d/icons/tree/"; done
# What shared modules draw from the mod's own icons/ (they name `${mod}/icons/…`), for the mods that pass them: menu-row.js's
# submenu chevron, project.js's plain folder. Herdr's own are drawn at 2, not the layout's 1.75 (check.sh).
for d in mods/t3-menu mods/t3-files mods/t3-actions extras/mods/review; do mkdir -p "$src/$d/icons"; cp "$src/shared/icons/ui/chevron-right.svg" "$src/$d/icons/"; done
for d in mods/t3-inbox mods/t3-agents mods/t3-picker mods/t3-spaces mods/t3-new-menu mods/t3-tabs mods/t3-menu; do mkdir -p "$src/$d/icons"; cp "$src/shared/icons/ui/folder.svg" "$src/$d/icons/"; done
# Open in's app artwork, the ones Details uses, copied into Files' own folder.
for icon in finder vscode vscodium cursor zed app-window; do cp "$src/mods/t3-actions/icons/$icon.svg" "$src/mods/t3-files/icons/$icon.svg"; done
# Review's shared path menu draws the same artwork from its own folder, including the standalone extra.
for icon in finder vscode vscodium cursor zed app-window external-link folder-open copy at-sign check arrow-left refresh-cw; do cp "$src/mods/t3-files/icons/$icon.svg" "$src/extras/mods/review/icons/$icon.svg"; done

# mod.json stays per repo: here the layout places it ("none"), alone it docks left.
rsync -a --delete $gen --exclude mod.json "$src/mods/t3-inbox/" "$inbox/mods/t3-inbox/"
rsync -a --delete $gen "$src/mods/t3-actions/" "$actions/mods/t3-actions/"
# Their jsconfig.json (each person's own, never copied) includes these, and no mod folder ships them.
for r in "$inbox" "$actions" "$review"; do mkdir -p "$r/types"; cp "$src"/types/*.d.ts "$r/types/"; done
# The Review extra (pulls-review and review): config.json is the person's own, so it is never shipped or deleted.
for m in pulls-review review; do rsync -a --delete $gen --exclude config.json "$src/extras/mods/$m/" "$review/mods/$m/"; done
"$src/scripts/update.sh"
