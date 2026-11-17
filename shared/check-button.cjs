// The buttons' colors and states (docs/internals/t3-tokens.md「按钮」): primary on `solid`, never `accent`; a ghost's fill by
// its surface; disabled faded, with no hover and no click.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = ["color.js", "button.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n")
  .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ")
  + "\nglobalThis.b = { button, radiusOf, DISABLED, split, ghostButton };";
// An element that records its calls; `when` runs its branch, `hover` records the style it sets.
const element = (calls = []) => new Proxy({ calls }, { get: (target, key) => key === "calls" ? target.calls : (...args) => {
  if (key === "when") return args[0] ? args[1](element(calls)) : element(calls);
  if (key === "hover") { const h = element([]); args[0](h); calls.push(["hover", h.calls]); return element(calls); }
  calls.push([key, ...args]);
  return element(calls);
} });
// tip.js's glow.
const glow = (view, id) => (on) => { view.hot = on ? id : null; };
const context = vm.createContext({ h_flex: () => element(), div: () => element(), svg: (p) => element([["svg", p]]), glow });
vm.runInContext(src, context);
const { button, split, ghostButton, DISABLED } = context.b;
const t = { solid: "SOLID", solid_foreground: "INK", raised: "RAISED", input: "INPUT", foreground: "#ffffff", dim: "DIM",
  hover: "HOVER", selected: "SELECTED", border: "BORDER", ansi1: "RED", accent: "ACCENT", accent_foreground: "ACCENT_FG" };
const calls = (o) => button(t, "b", o).calls;
const arg = (c, key) => c.filter(([k]) => k === key).map(([, v]) => v);

// A theme whose text color has its own alpha (#rrggbbaa, which Herdr's themes take): the fill stays a color the host reads.
{
  const fills = button({ ...t, foreground: "#abcdef80" }, "b", { on: true }).calls.filter(([k]) => k === "bg").map(([, v]) => v);
  assert.deepEqual(fills, ["#abcdef09"], "an 8-digit text color at 7%: its own half, scaled, not 10 digits");
}
const primary = calls({ variant: "primary", size: "default", text: "Apply" });
assert.deepEqual(arg(primary, "bg"), ["SOLID"]);
assert.deepEqual(arg(primary, "text_color"), ["INK"]);
assert.ok(!JSON.stringify(primary).includes("ACCENT"), "no button fills with accent");
assert.deepEqual([arg(primary, "h")[0], arg(primary, "px")[0], arg(primary, "rounded")[0]], [32, 12, 8], "T3's default: 12 in");
assert.deepEqual(arg(primary, "border_1"), [], "primary draws no border over its fill");
assert.deepEqual(arg(calls({ variant: "outline", size: "default", text: "Cancel" }), "px"), [11], "11 in from the 1px border");
assert.deepEqual(primary.find(([k]) => k === "hover")[1], [["opacity", 0.9]]);

const danger = calls({ variant: "danger", text: "Delete" });
assert.deepEqual([arg(danger, "bg")[0], arg(danger, "text_color")[0], arg(danger, "border_color")[0]], ["RAISED", "RED", "INPUT"]);

const off = calls({ variant: "primary", text: "Opening…", disabled: true, act: () => {} });
assert.deepEqual(arg(off, "opacity"), [0.64]);
assert.ok(!off.some(([k]) => k === "hover" || k === "on_click"), "disabled: no hover, no click");
assert.deepEqual(arg(off, "bg"), ["SOLID"], "disabled keeps its fill");

// On chrome, T3's accent and pressed toggle as a share of the text color, whatever the theme's hover and selected.
assert.deepEqual(calls({ icon: "x.svg", label: "Close" }).find(([k]) => k === "hover")[1], [["bg", "#ffffff0a"]], "on chrome, 4% of the text");
assert.deepEqual(arg(calls({ icon: "x.svg", label: "Wrap", on: true }), "bg"), ["#ffffff12"], "on chrome, on: 7% of the text");
assert.ok(!JSON.stringify(calls({ icon: "x.svg", label: "Wrap", on: true })).includes("SELECTED"), "not the theme's selected");
// A subheader's icons are 14 in its 28 buttons, as T3's file and diff toolbars; unasked, the size's own.
const glyphs = (o) => button(t, "b", o).calls.filter(([k, el]) => k === "child" && typeof el !== "string").flatMap(([, el]) => el.calls.filter(([k]) => k === "size").map(([, v]) => v));
assert.deepEqual(glyphs({ icon: "x.svg", label: "Wrap", size: "sm", iconSize: 14 }), [14]);
assert.deepEqual(glyphs({ icon: "x.svg", label: "Wrap", size: "sm" }), [16]);
assert.deepEqual(glyphs({ icon: "x.svg", text: "Analyze", size: "sm", iconSize: 14 }), [14], "beside words too");
assert.deepEqual(calls({ icon: "x.svg", label: "Close", surface: "card" }).find(([k]) => k === "hover")[1], [["bg", "#ffffff12"]], "on a card, 7% of the text");
const open = calls({ icon: "x.svg", label: "Sort", on: true, surface: "card" });
assert.deepEqual(arg(open, "bg"), ["#ffffff1f"]);
assert.deepEqual(arg(open, "text_color"), ["#ffffff"], "on is lit");
assert.ok(!open.some(([k]) => k === "hover"));
assert.deepEqual(arg(calls({ icon: "x.svg", label: "Close" }), "text_color"), ["DIM"]);
assert.deepEqual(arg(calls({ icon: "x.svg", label: "Close", hot: true }), "text_color"), ["#ffffff"]);

const square = calls({ icon: "x.svg", label: "Close", size: "micro" });
assert.deepEqual([arg(square, "h")[0], arg(square, "w")[0], arg(square, "rounded")[0]], [20, 20, 4]);
assert.deepEqual(arg(square, "accessibility_label"), ["Close"]);
assert.deepEqual(arg(square, "px"), [], "an icon alone is a square, no padding");
const marked = calls({ icon: "x.svg", label: "Show sidebar", size: "sm", wide: true });
assert.deepEqual([arg(marked, "w"), arg(marked, "px"), arg(marked, "gap")], [[], [10], [6]], "wide: padded for what the caller adds");
assert.deepEqual(arg(calls({ variant: "plain", text: "Retry", surface: "card" }), "text_color"), ["#ffffff"], "plain: T3's ghost, words in foreground");
assert.ok(!calls({ icon: "x.svg", label: "Pin", surface: "row", hot: true }).some(([k]) => k === "hover" || k === "bg"), "in a row it only lights");
assert.deepEqual(calls({ icon: "x.svg", label: "Close", surface: "tab", size: "tiny" }).find(([k]) => k === "hover")[1], [["bg", "RAISED"]]);
let clicked = 0;
calls({ text: "Go", act: () => clicked++ }).find(([k]) => k === "on_click")[1](null, null);
assert.equal(clicked, 1);
assert.deepEqual(arg(calls({ icon: "x.svg", label: "Wrap", on: true, disabled: true, surface: "card" }), "bg"), [], "a disabled toggle isn't pressed: no on fill");

// split() `row`, T3's details panel (isPanel, ghost): one group, so its fill is the group's, with the seam; its chevron always shows.
const flat = (c) => c.flatMap((call) => call[0] === "child" ? flat(call[1].calls) : [call]);
const group = (o) => split(t, { id: "g", mainId: "m", moreId: "x", chevron: "c.svg", ...o }, (m) => m, (x) => x).calls;
const pair = (o) => { const g = flat(group({ size: "row", ...o })); return { bg: new Set(arg(g, "bg")), svg: arg(g, "svg") }; };
assert.equal(pair({}).bg.size, 0, "at rest: no fill, no seam");
assert.deepEqual(pair({}).svg, ["c.svg"], "at rest the chevron still says there's a menu");
assert.ok(pair({ hot: "main" }).bg.has("#ffffff12") && pair({ hot: "main" }).bg.has("BORDER"), "hovered: 7% under both halves, the seam shown");
assert.ok(pair({ on: true }).bg.has("#ffffff1f"), "menu open: 12%");
assert.equal(pair({ hot: "main", locked: true }).bg.size, 0, "a locked main half doesn't light the pair");

// split() `xs`, T3's header (OpenInPicker, ProjectScriptsControl: a Group of xs outline buttons): one `input` outline round
// both halves and its full-height rule at rest, no fill; the half under the pointer fills alone, the chevron's 7% while its menu is open.
{
  const half = (calls, id) => calls.find(([k, el]) => k === "child" && el.calls.some(([s, v]) => s === "id" && v === id))[1].calls;
  const rest = group({ size: "xs", surface: "chrome" });
  assert.deepEqual([arg(rest, "h")[0], arg(rest, "border_color")[0], arg(rest, "bg").length], [24, "INPUT", 0], "24 high, outlined in input, no fill at rest");
  assert.ok(rest.some(([k]) => k === "border_1"), "outlined");
  const rule = half(rest, "g-rule");
  assert.deepEqual([arg(rule, "bg")[0], arg(rule, "h")[0]], ["INPUT", 22], "the rule shows at rest, the outline's full inside height");
  assert.deepEqual([arg(half(rest, "m"), "w")[0], arg(half(rest, "x"), "w")[0]], [24, 23], "T3's 25 and 24 wide halves, the outline drawn by the group");
  const hot = group({ size: "xs", surface: "chrome", hot: "main" });
  assert.deepEqual([arg(hot, "bg"), arg(half(hot, "m"), "bg"), arg(half(hot, "x"), "bg")], [[], ["#ffffff0a"], []], "hovered: only that half fills, chrome's 4%");
  const open = group({ size: "xs", surface: "chrome", on: true });
  assert.deepEqual([arg(half(open, "m"), "bg"), arg(half(open, "x"), "bg")], [[], ["#ffffff12"]], "menu open: the chevron's half 7%");
  const wide = half(group({ size: "xs", wide: true }), "m");
  assert.deepEqual([arg(wide, "w"), arg(wide, "pl")[0], arg(wide, "pr")[0]], [[], 5, 7], "with words: T3's xs padding, its svg 2 into it");
  const off = group({ size: "xs", disabled: true });
  assert.deepEqual(arg(off, "opacity"), [DISABLED], "disabled: the whole control fades, outline too");
  assert.equal(arg(half(off, "m"), "opacity").length, 0, "not twice");
}

// ghostButton(): the wired icon button. Hovering lights its icon, a click runs it; disabled, neither.
{
  const view = {}, cx = { stop_propagation() {} };
  let ran = 0;
  const draw = (disabled = false) => ghostButton(view, t, "g", { icon: "x.svg", label: "Tree", act: () => ran++, disabled });
  const handler = (el, key) => el.calls.find(([k]) => k === key)?.at(-1);
  assert.deepEqual(arg(draw().calls, "text_color"), ["DIM"]);
  handler(draw(), "on_hover")(true);
  assert.deepEqual(arg(draw().calls, "text_color"), ["#ffffff"], "hovered, its icon lights");
  handler(draw(), "on_click")(null, cx);
  assert.equal(ran, 1);
  view.hot = null;
  const sized = ghostButton(view, t, "g", { icon: "x.svg", label: "Tree", act: () => {}, size: "sm", iconSize: 14 }).calls;
  assert.ok(sized.some(([k, el]) => k === "child" && el.calls.some(([s, v]) => s === "size" && v === 14)), "ghostButton passes the icon size on");
  const off = draw(true).calls;
  assert.ok(!off.some(([k]) => k === "on_click" || k === "on_hover"), "disabled: no click, no hover");
}
console.log("button ok");
