#!/bin/sh
# Every check this repo has: the shared modules' copies, `herdr-app check` and `tsc` on each mod, and each mod's checks in a fake herdr.
# They run from an installed Herdr App home, where some look for the shipped icons.
set -u
# Run as a git hook (pre-commit), git's own variables point every git call at this repository, even in the throwaway
# repositories some checks make: from a linked worktree that once re-initialised it as bare. They go.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_PREFIX GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
src=$(cd "$(dirname "$0")/.." && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
cd "$src"
fail=0

# Gallery skips recipes over 64 KB; leave room in both translations.
for recipe in RECIPE.md RECIPE.zh-CN.md; do
  bytes=$(wc -c < "$recipe") || exit 1
  [ "$bytes" -le 60000 ] || { echo "FAIL $recipe is $bytes bytes; maximum 60000 for Gallery"; exit 1; }
done

# shared/ holds the one source; scripts/sync.sh makes the copies.
for s in shared/*.js; do
  for c in $(find mods extras/mods -name "$(basename "$s")"); do
    cmp -s "$s" "$c" || { echo "FAIL $c differs from $s: edit that one, then run scripts/sync.sh"; fail=1; }
  done
done

# What scripts/vendor.sh bundles has to run in a mod: no npm or Node imports and none of what Herdr's runtime lacks.
for f in $(find mods extras/mods -path '*/vendor/*.js'); do
  grep -nE "(^|[^.])\b(import|from) *[\"'][^./]|require\(|\bprocess\.|\bBuffer\b|\bset(Timeout|Interval)\b|\bWorker\b|WebAssembly|__dirname" "$f" \
    && { echo "FAIL $f uses what a mod can't (above): bundle it differently in scripts/vendor.sh"; fail=1; }
done

# The options live here, not in each mod's jsconfig.json: that file is gpui-shell's, gitignored and written fresh by
# `herdr-app check` with defaults that fail these mods. These are the ones its notes explain, plus skipLibCheck, which a
# jsconfig.json implies. --noUnusedLocals: an import or local nobody reads fails, so dead code doesn't pile up between rounds.
ts="--noUnusedLocals --noEmit --allowJs --checkJs --target ES2022 --module ES2022 --moduleResolution bundler --lib ES2022 --strict
  --strictNullChecks false --noImplicitAny false --useUnknownInCatchVariables false --skipLibCheck"
for d in mods/t3-*/ extras/mods/*/; do
  out=$(herdr-app check "$d" 2>&1) || { echo "FAIL herdr-app check $d"; echo "$out" | tail -20; fail=1; }
  # gpui-kit.d.ts is the API `herdr-app check` just wrote.
  out=$(bunx -p typescript tsc $ts "$d"*.js "$d"gpui-kit.d.ts types/*.d.ts 2>&1) || { echo "FAIL tsc $d"; echo "$out" | tail -20; fail=1; }
done

# A wrong icon path draws nothing and raises nothing. Paths built at runtime aren't caught here.
for p in $(grep -rhoE --include='*.js' --exclude=gpui-kit.d.ts 'mods/(t3-[a-z-]+|review|pulls-review)/[a-z0-9/-]+\.svg' shared mods extras/mods | sort -u); do
  [ -f "$p" ] || [ -f "extras/$p" ] || { echo "FAIL no such icon: $p"; fail=1; }
done

# UI icons are Lucide's 24 grid at one 1.75 stroke (docs/internals/t3-tokens.md「规则」P4): a currentColor stroke at any other
# width, or at Lucide's default 2 by leaving it out, fails. Pierre's vendored set and the Windows caption glyphs (1px) are drawn so.
for f in $(grep -rl --include='*.svg' 'stroke="currentColor"' shared/icons mods extras/mods | grep -vE '/icons/(pierre|cat)/|/win-[a-z]+\.svg$'); do
  [ "$(grep -o 'stroke-width="[^"]*"' "$f" | sort -u)" = 'stroke-width="1.75"' ] || { echo "FAIL $f: a UI icon's stroke is 1.75"; fail=1; }
done
# The same for what a mod borrows from Herdr's shipped workspace-chrome: read where Herdr ships it. Exempt: spinner, a progress
# ring drawn at its own weight, not a Lucide UI icon. A borrowed path built at runtime would escape this, so it fails too.
grep -rnE --include='*.js' --exclude=gpui-kit.d.ts 'mods/workspace-chrome/\$\{' shared mods extras/mods && { echo "FAIL a borrowed icon's path is built at runtime (above): name it whole, or use the mod's own"; fail=1; }
for p in $(grep -rhoE --include='*.js' --exclude=gpui-kit.d.ts 'mods/workspace-chrome/[a-z0-9-]+\.svg' shared mods extras/mods | sort -u); do
  [ "$p" = mods/workspace-chrome/spinner.svg ] && continue
  f=$app/$p
  [ -f "$f" ] || { echo "FAIL no such shipped icon: $p"; fail=1; continue; }
  ! grep -q 'stroke="currentColor"' "$f" || [ "$(grep -o 'stroke-width="[^"]*"' "$f" | sort -u)" = 'stroke-width="1.75"' ] \
    || { echo "FAIL $p is borrowed at Herdr's stroke, not 1.75 (t3-tokens P4): give the mod its own copy"; fail=1; }
done

# A theme color at a share of its opacity goes through shared/color.js alpha: a color with its own alpha (#rrggbbaa, which
# Herdr's themes take) plus two more digits is 10, which the host refuses, and #rgb plus two is 5.
grep -rnE --include='*.js' --exclude=gpui-kit.d.ts --exclude=color.js \
    -e '\+ *"[0-9a-fA-F]{2}"' -e '\+ *\([^)]*\? *"[0-9a-fA-F]{2}" *:' -e '`\$\{[^}]+\}[0-9a-fA-F]{2}`' shared mods extras/mods | grep -v '/vendor/' \
  && { echo "FAIL a color + two hex digits (above): use color.js alpha(color, share)"; fail=1; }

# accent is the focus ring's and emphasis's color, never a button's fill (docs/internals/t3-tokens.md「按钮」): its foreground
# only goes on the few non-buttons filled with it, listed here.
for f in $(grep -rlE --include='*.js' --exclude=gpui-kit.d.ts 'accent_foreground' shared mods extras/mods); do
  case $f in extras/mods/review/controls.js|mods/t3-labels/main.js) ;; *) echo "FAIL $f uses accent_foreground: a button takes shared/button.js's colors"; fail=1 ;; esac
done

# Herdr closes an open dialog or popup on a key bound to tab.close or pane.close; ours are bound to t3-tabs, so each mod that
# opens as one needs its own `mod:` section, or cmd-w closes the tab behind it. `mod: MOD` is the file's own folder. A mod
# whose own close (`<mod>.close`) closes its popups first, as Files', may bind that instead.
for f in $(grep -rlE --include='*.js' --exclude=gpui-kit.d.ts 'openOverlay|mod\.open' mods extras/mods); do
  own=$(basename "$(dirname "$f")")
  for m in $(grep -hoE 'openOverlay\(\{ *mod: *("[a-z0-9-]+"|MOD)|mod\.open", *\{ *name: *"[a-z0-9-]+"|"mod\.open:[a-z0-9-]+"' "$f" \
      | sed -E "s/.*MOD$/$own/; s/.*[\":]([a-z0-9-]+)\"?$/\1/" | sort -u); do
    jq -e --arg s "mod:$m" --arg own "$m.close" '.[$s]["cmd-w"] == "overlay.close" or .[$s]["cmd-w"] == $own' keys.json >/dev/null || { echo "FAIL keys.json has no mod:$m section closing it with cmd-w ($f opens it)"; fail=1; }
  done
done

# render-guard.cjs: what Herdr refuses while a view draws (cx.notify and the rest) fails the check, as it would in the app.
for f in $(find shared mods extras/mods -name 'check*.cjs'); do
  out=$(cd "$app" && node -r "$src/scripts/render-guard.cjs" "$src/$f" 2>&1) || { echo "FAIL $f"; echo "$out" | tail -20; fail=1; }
done

scripts/check-update.sh || fail=1

[ "$fail" = 0 ] && echo "all checks passed"
exit "$fail"
