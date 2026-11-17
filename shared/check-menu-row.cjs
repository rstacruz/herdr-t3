// A popup menu's row (menu-row.js) in a fake kit: what lights it, what a disabled one does, what a click does.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements();
const strip = (f) => kit.strip(fs.readFileSync(path.join(__dirname, f), "utf8"));
const tips = [];
const context = vm.createContext({ div: () => element(), h_flex: () => element(), svg: () => element("svg"), settings: () => ({ zoom: 1 }), Date,
  DISABLED: 0.64, glow: (view, id) => (on) => { view.hot = on ? id : null; },
  tip: (_view, _t, id, label, trigger) => { tips.push([id, label]); const p = element("tip"); p.items.push(trigger); return p; } });
vm.runInContext(strip("list.js") + strip("menu-row.js") + "\nglobalThis.m = { menuRow, litOnHover };", context);
const { menuRow } = context.m;
const t = { selected: "SEL", foreground: "FG", muted: "MUTED", dim: "DIM" };
const cx = { notify() {}, stop_propagation() {} };
const view = {};
const draw = (i, o = {}) => menuRow(view, t, `row-${i}`, { at: [view, "at", i], label: `Row ${i}`, ...o });
const lit = (row) => row.style.bg === "SEL";

// Lit only while the pointer's on it, whatever order the leave and the next enter come in.
view.at = -1;
draw(0).handlers.on_hover(true, cx);
assert.ok(lit(draw(0)));
draw(1).handlers.on_hover(true, cx); draw(0).handlers.on_hover(false, cx);
assert.ok(lit(draw(1)) && !lit(draw(0)), "a late leave doesn't unlight the next row");
draw(1).handlers.on_hover(false, cx);
assert.ok(!lit(draw(0)) && !lit(draw(1)), "off the rows, nothing is lit");
assert.ok(lit(draw(2, { open: true })), "a row whose submenu is open stays lit");

// A click picks it.
let picked = 0;
draw(3, { pick: () => picked++ }).handlers.on_click(null, cx);
assert.equal(picked, 1);

// Disabled: faded, never lit or picked, and says why in the layout's tooltip.
view.at = 4;
const off = draw(4, { disabled: true, hint: "No active terminal in this tab", pick: () => picked++ });
assert.equal(off.kind, "tip", "a disabled row's reason is a tip()");
assert.deepEqual(tips.at(-1), ["row-4", "No active terminal in this tab"]);
const inner = off.items[0];
assert.equal(inner.style.opacity, 0.64);
assert.ok(!lit(inner), "a disabled row isn't lit");
assert.equal(inner.handlers.on_click, undefined, "a disabled row isn't picked");
assert.equal(draw(5, { disabled: true }).kind, "div", "no reason, no tooltip");
console.log("ok: menu rows light under the pointer only, pick on click, and a disabled one says why");
