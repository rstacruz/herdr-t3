// The editor's framing maths: a placement (storage.md: mode, zoom 1–4, x/y the picture's alignment in the room it leaves) in
// a Home `{ W, H }` whose picture is `{ w, h }` at zoom 1. Its top left is ((W − w·zoom)·x, (H − h·zoom)·y).

export const PRESETS = [1, 1.25, 1.5, 2, 2.5, 3, 4];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// The alignment that puts the picture's edge at `o` in `room` (Home less the picture); none to share keeps it as it was.
const along = (o, room, was) => Math.abs(room) > 0.01 ? clamp(o / room, 0, 1) : was;

/** `p` zoomed by `r`, the Home point `at` held still where the bounds allow. */
export function zoomAt(p, r, at, { W, H, w, h }) {
  const zoom = clamp(p.zoom * r, 1, 4), w0 = w * p.zoom, h0 = h * p.zoom, w1 = w * zoom, h1 = h * zoom;
  const u = (at.x - (W - w0) * p.x) / w0, v = (at.y - (H - h0) * p.y) / h0;
  return { ...p, zoom, x: along(at.x - u * w1, W - w1, p.x), y: along(at.y - v * h1, H - h1, p.y) };
}

/** `p` moved `dx`, `dy` Home px, stopping at its edges. */
export function pan(p, dx, dy, { W, H, w, h }) {
  const w0 = w * p.zoom, h0 = h * p.zoom;
  return { ...p, x: along((W - w0) * p.x + dx, W - w0, p.x), y: along((H - h0) * p.y + dy, H - h0, p.y) };
}

// The slider is logarithmic, so 1→2 and 2→4 are as long.
export const toSlider = (zoom) => Math.log(zoom) / Math.log(4);
export const fromSlider = (s) => 4 ** s;

/** The next preset up (`dir` 1) or down (-1) from `zoom`. */
export const nextPreset = (zoom, dir) => dir > 0 ? PRESETS.find((z) => z > zoom + 1e-6) ?? 4 : [...PRESETS].reverse().find((z) => z < zoom - 1e-6) ?? 1;

/**
 * What a scroll does: `{ zoom }`, a factor, or `{ pan: [dx, dy] }` in the event's px; null for a lift or its momentum.
 * A notched wheel reports lines and zooms (6 notches double it), sideways it pans; a trackpad reports none and pans; ⌘ or
 * Ctrl with either zooms (200 px double it), standing in for a pinch Herdr doesn't pass on. After a lift, events less than
 * 100 ms apart are momentum (macOS sends it as more "moved"): framing has to stop where the fingers left it. `g` keeps that.
 */
export function scroll(e, g) {
  const now = Date.now();
  if (e.touch_phase === "ended") { g.lifted = now; return null; }
  if (e.touch_phase === "started") g.lifted = null;
  if (g.lifted != null && now - g.lifted < 100) { g.lifted = now; return null; }
  g.lifted = null;
  const { delta, delta_lines: lines, modifiers } = e;
  if (modifiers?.platform || modifiers?.control) return { zoom: 2 ** (delta.y / 200) };
  if (!lines) return { pan: [delta.x, delta.y] };
  return Math.abs(lines.x) > Math.abs(lines.y) ? { pan: [delta.x, 0] } : { zoom: 2 ** (lines.y / 6) };
}
