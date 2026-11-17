// titlebar.js: where Details' button stands, panel open or closed, zoomed: closed, from the window part panel.js sizes (never
// from a measure that can lag a frame behind); open, from the panel's measured width.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let buttons = false, ours = true;
const context = vm.createContext({
  layout: () => ({ id: "root", children: ours ? [{ id: "tabs-end-inset", size: { px: 12 } }] : [] }),
  windowEndPx: (open) => open ? 0 : 4 + 28 + (buttons ? 8 + 3 * 28 : 0),
  layoutNode: (n, id) => n?.id === id ? n : (n?.children ?? []).reduce((hit, c) => hit ?? context.layoutNode(c, id), null),
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "titlebar.js"), "utf8").replace(/^import [^;]*;\n/gm, "").replace(/^export /gm, "") + "\nglobalThis.tb = { notePanelWidth, detailsAnchor };", context);
const { notePanelWidth, detailsAnchor } = context.tb;
const plain = (v) => JSON.parse(JSON.stringify(v));
const viewport = { width: 1600 };

// Closed, before any frame (cmd-shift-b at once) or the frame after the panel closed: the toggle, its gap and the row's 12.
assert.deepEqual(plain(detailsAnchor(viewport, 1, false)), { x: 1600 - 12 - 32 - 28, y: 6, width: 28, height: 28 });
// The window's own buttons (Windows, Linux) after the toggle.
buttons = true;
assert.deepEqual(plain(detailsAnchor(viewport, 1, false)), { x: 1600 - 12 - 124 - 28, y: 6, width: 28, height: 28 });
buttons = false;
// Open, its head not drawn yet: no place, the popup takes its default one.
assert.equal(detailsAnchor(viewport, 1, true), null, "the panel open but its head not drawn yet");
// Open: the row's 12 and what the panel takes.
notePanelWidth(601);
assert.deepEqual(plain(detailsAnchor(viewport, 1, true)), { x: 1600 - 12 - 601 - 28, y: 6, width: 28, height: 28 });
// Zoomed 1.25: the panel's measure is in zoomed px already; the layout's sizes and the button scale.
notePanelWidth(750);
assert.deepEqual(plain(detailsAnchor(viewport, 1.25, true)), { x: 1600 - 15 - 750 - 35, y: 7.5, width: 35, height: 35 });
assert.deepEqual(plain(detailsAnchor(viewport, 1.25, false)), { x: 1600 - 55 - 35, y: 7.5, width: 35, height: 35 });
// Herdr's own layout (t3-actions alone): nothing says where the button is, so the popup takes its default place.
ours = false;
assert.equal(detailsAnchor(viewport, 1, false), null);
console.log("titlebar ok");
