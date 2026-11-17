// framing.js: zooming holds the point under the pointer still, nothing leaves its bounds, the slider is logarithmic, and a
// scroll is read as a wheel's zoom, a trackpad's pan or a lift's momentum.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ Date: { now: () => context.now } });
context.now = 0;
vm.runInContext(fs.readFileSync(path.join(__dirname, "framing.js"), "utf8").replace(/^export\s+/gm, "")
  + "\nglobalThis.f = { zoomAt, pan, toSlider, fromSlider, nextPreset, scroll, PRESETS };", context);
const { zoomAt, pan, toSlider, fromSlider, nextPreset, scroll, PRESETS } = context.f;

// Where a Home point lands on the picture, and back.
const origin = (p, b) => [(b.W - b.w * p.zoom) * p.x, (b.H - b.h * p.zoom) * p.y];
const onPicture = (p, b, at) => { const [ox, oy] = origin(p, b); return [(at.x - ox) / (b.w * p.zoom), (at.y - oy) / (b.h * p.zoom)]; };
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// A wide picture filling a 1000×800 Home, and a tall one fitted inside it.
const boxes = [{ W: 1000, H: 800, w: 2000, h: 800 }, { W: 1000, H: 800, w: 400, h: 800 }];
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (const b of boxes) for (let n = 0; n < 500; n++) {
  const p = { mode: "cover", zoom: 1 + rand() * 3, x: rand(), y: rand() }, at = { x: rand() * b.W, y: rand() * b.H }, r = 0.25 + rand() * 4;
  const q = zoomAt(p, r, at, b);
  assert.ok(q.zoom >= 1 && q.zoom <= 4 && q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1, "zoom stays in 1–4, x and y in 0–1");
  assert.equal(q.mode, "cover", "zooming keeps the mode");
  // Unclamped, the point under the pointer stays under it.
  const clamped = [q.x, q.y].some(v => v === 0 || v === 1) || q.zoom === 1 || q.zoom === 4;
  if (!clamped) {
    const [u, v] = onPicture(p, b, at), [u2, v2] = onPicture(q, b, at);
    near(u2, u, "the point under the pointer keeps its place across"); near(v2, v, "and down");
  }
  const m = pan(p, rand() * 400 - 200, rand() * 400 - 200, b);
  assert.ok(m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1 && m.zoom === p.zoom, "panning stays in bounds and keeps the zoom");
}
// Panning moves the picture with the hand: 10 px right is 10 px right, until an edge.
{
  const b = boxes[0], p = { mode: "cover", zoom: 1, x: 0.5, y: 0.5 }, q = pan(p, 10, 0, b);
  near(origin(q, b)[0] - origin(p, b)[0], 10, "a 10 px pan moves the picture 10 px");
  assert.equal(pan(p, 99999, 0, b).x, 0, "a picture wider than Home stops at its left edge");
  assert.equal(pan(p, 0, 50, b).y, 0.5, "with no room down there, nothing moves that way");
}
// The slider is logarithmic: 1→2 and 2→4 are the same length; presets step from wherever the zoom is.
near(toSlider(1), 0, "1× at the start"); near(toSlider(4), 1, "4× at the end"); near(toSlider(2), 0.5, "2× halfway");
near(fromSlider(toSlider(2.5)), 2.5, "slider and zoom convert both ways");
assert.deepEqual(plain(PRESETS), [1, 1.25, 1.5, 2, 2.5, 3, 4]);
assert.deepEqual([nextPreset(1, 1), nextPreset(1.3, 1), nextPreset(1.3, -1), nextPreset(4, 1), nextPreset(1, -1), nextPreset(2, -1)], [1.25, 1.5, 1.25, 4, 1, 1.5]);

// Scrolls: a notched wheel zooms (6 notches double it), sideways it pans; a trackpad pans; ⌘ or Ctrl zooms either (200 px
// double it); after a lift, the momentum that follows within 100 ms is dropped.
const e = (o) => ({ delta: { x: 0, y: 0 }, touch_phase: "moved", modifiers: {}, ...o });
const g = {};
near(scroll(e({ delta: { x: 0, y: 60 }, delta_lines: { x: 0, y: 6 } }), g).zoom, 2, "6 notches away zoom in 2×");
near(scroll(e({ delta: { x: 0, y: -30 }, delta_lines: { x: 0, y: -3 } }), g).zoom, 2 ** -0.5, "3 towards zoom out");
assert.deepEqual(plain(scroll(e({ delta: { x: 40, y: 0 }, delta_lines: { x: 4, y: 0 } }), g)), { pan: [40, 0] }, "a sideways wheel pans");
assert.deepEqual(plain(scroll(e({ delta: { x: 3, y: -7 } }), g)), { pan: [3, -7] }, "a trackpad pans with the fingers");
near(scroll(e({ delta: { x: 0, y: 200 }, modifiers: { platform: true } }), g).zoom, 2, "⌘-scroll zooms");
near(scroll(e({ delta: { x: 0, y: -200 }, modifiers: { control: true } }), g).zoom, 0.5, "Ctrl-scroll zooms");
context.now = 1000;
assert.equal(scroll(e({ touch_phase: "ended" }), g), null, "a lift does nothing itself");
context.now = 1050;
assert.equal(scroll(e({ delta: { x: 5, y: 5 } }), g), null, "momentum right after a lift is dropped");
context.now = 1120;
assert.equal(scroll(e({ delta: { x: 5, y: 5 } }), g), null, "and keeps being dropped while it keeps coming");
context.now = 1400;
assert.deepEqual(plain(scroll(e({ delta: { x: 5, y: 5 } }), g)), { pan: [5, 5] }, "a pause of 100 ms or more ends it");
context.now = 1500;
scroll(e({ touch_phase: "ended" }), g);
context.now = 1510;
assert.deepEqual(plain(scroll(e({ touch_phase: "started", delta: { x: 1, y: 0 } }), g)), { pan: [1, 0] }, "fingers back down count at once");
console.log("ok: framing holds the pointer's point, stays in bounds, and reads wheels, trackpads and momentum.");
