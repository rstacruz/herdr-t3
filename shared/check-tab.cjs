// A closable tab, the tab bar's and the panel head's, on inert elements: its look, its × over the icon, its mark kept at the
// end, the three ways to close or reach its menu, and its name said whole only when cut.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements(), { find } = kit;
const srcs = (n) => !n || typeof n !== "object" ? [] : [...(typeof n.src === "string" ? [n.src] : []), ...n.items.flatMap(srcs)];
const tips = [];
const scope = vm.createContext({
  div: element, h_flex: element, svg: src => Object.assign(element(), { src }), Popup: { new: (_id, el) => element().child(el) },
  settings: () => ({ zoom: 1 }), pointerAt: () => null, pointerGone: () => false, pointerMoved() {}, POINTER_WATCH: 100, FADE: {},
  tip: (_v, _t, id, label, el, options) => { tips.push([id, label, options]); return el; }, tipCard: element,
  glow: (view, id) => (on) => { if (on) view.hot = id; else if (view.hot === id) view.hot = null; },
  keptHover: (view, key, id) => ({ hover: (on) => { if (on) view[key] = id; else if (view[key] === id) view[key] = null; }, move() {} }),
  stop: (_v, _t, _id, el) => el, within: () => false,
});
const strip = (f) => kit.strip(fs.readFileSync(path.join(__dirname, f), "utf8"));
vm.runInContext(strip("color.js"), scope);
vm.runInContext(`(() => {\n${strip("button.js")}\nglobalThis.button = button; globalThis.ghostTint = tint;\n})();`, scope);
vm.runInContext(strip("measured-text.js"), scope);
vm.runInContext(strip("tab.js") + "\nglobalThis.tab = tab;", scope);

const t = { chrome: "#111111", foreground: "#ffffff", muted: "#777777", dim: "#555555", raised: "#333333", hover: "#222222", selected: "#444444" };
const cx = { notify() {}, stop_propagation() {} };
const calls = [];
const view = { hot: null };
const draw = (options = {}) => scope.tab(view, t, "tab-a", { mod: "mods/x", label: "Task", icon: Object.assign(element(), { src: "glyph" }),
  close: () => calls.push("close"), menu: () => calls.push("menu"), ...options });

// T3's panel tab: 24 high, radius 6, 6 in on the left and 8 on the right, 2 between; the one shown at 7%, another hovered at 4%.
let el = draw({ active: true, mark: Object.assign(element(), { src: "mark" }) });
assert.deepEqual([el.style.h, el.style.rounded, el.style.pl, el.style.pr, el.style.gap], [24, 6, 6, 8, 2]);
assert.equal(el.style.bg, "#ffffff12", "the tab shown: 7%");
assert.equal(draw().hoverStyle.bg, "#ffffff0a", "another, hovered: 4%");

// At rest: the icon in the leading slot, the name, the mark at the end. Hovered: × over the icon, the mark still there.
const order = (el) => el.items.filter(Boolean).map(k => k.key ?? srcs(k)[0]);
el = draw({ mark: Object.assign(element(), { src: "mark" }) });
assert.deepEqual(srcs(find(el, "tab-a-close")), ["glyph"], "at rest, the icon");
assert.equal(srcs(el).at(-1), "mark", "the mark at the end");
el.handlers.on_hover(true, cx);
el = draw({ mark: Object.assign(element(), { src: "mark" }) });
assert.deepEqual(srcs(find(el, "tab-a-close")), ["mods/x/icons/x.svg"], "hovered, × over the icon");
assert.equal(srcs(el).at(-1), "mark", "hovered, the mark is still at the end");
assert.equal(order(el)[0], "tab-a-close", "× leads");
assert.equal(el.style.text_color, t.foreground, "hovered, the name brightens");

// A Lists tab keeps its end slot with no mark, so its width never moves with its state; a panel tab has none.
assert.equal(draw({ slot: true }).items.filter(Boolean).length, 3, "the end slot kept");
assert.equal(draw().items.filter(Boolean).length, 2, "no slot");

// Closing: ×, or a middle press on the tab; a right press opens the tab's own menu. A press of any button hides the name's label.
el = draw();
calls.length = 0;
find(el, "tab-a-close").handlers.on_click({}, cx);
el.handlers["on_mouse_down:middle"]({}, cx);
view.hot = "tab-a";
el.handlers["on_mouse_down:right"]({}, cx);
assert.deepEqual(calls, ["close", "close", "menu"]);
assert.equal(view.hot, null, "the right press hides the label");

// The name: said whole in a label below only when cut (t3-tokens P5).
const named = (width) => {
  tips.length = 0;
  const root = draw();
  find(root, "text-name-tab-a").handlers.on_size_change({ width }, cx);
  find(root, "text-measure-tab-a").handlers.on_size_change({ width: 72 }, cx);
  tips.length = 0; draw();
  return tips.find(([id]) => id === "tab-a");
};
assert.equal(named(72), undefined, "a whole name has no label");
assert.deepEqual(named(40).slice(0, 2), ["tab-a", "Task"], "cut, its whole name");
assert.equal(named(40)[2].below, true, "below, as the bar has no room above");

console.log("ok: tab: T3's look, × over the icon with the mark kept, × / middle press close, right press opens its menu, a cut name labelled.");
