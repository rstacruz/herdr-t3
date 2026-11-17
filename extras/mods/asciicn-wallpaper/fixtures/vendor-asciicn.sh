#!/bin/sh
# Copy the pure asciicn modules the panels need out of a clone, rewriting their
# `@/lib/ascii/x` imports to relative ones. Nothing in the clone is built or run.
#   sh vendor-asciicn.sh <clone of github.com/opencoredev/asciicn> <output dir>
set -e
CLONE=$1
OUT=${2:-site}
COMMIT=$(git -C "$CLONE" rev-parse HEAD)
mkdir -p "$OUT"
for f in atlas charsets frame glyphs matrices measure palettes blue-noise; do
  cp "$CLONE/lib/ascii/$f.ts" "$OUT/$f.ts"
done
sed -i '' -E 's#"@/lib/ascii/([a-z-]+)"#"./\1.ts"#g' "$OUT"/*.ts
cp "$CLONE/LICENSE" "$OUT/LICENSE-asciicn"
echo "asciicn $COMMIT" > "$OUT/provenance.txt"
echo "copied $OUT from $COMMIT"
