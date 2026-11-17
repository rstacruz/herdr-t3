// The real shared button, rendered at each bar site: clicks, children and platform glyphs survive the migration.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements(), { find } = kit;
const t = { chrome: "#111111", background: "#222222", dim: "#555555", muted: "#777777", foreground: "#ffffff", hover: "#333333", selected: "#444444" };
const calls = [], space = { id: "s", active: true, tabs: [] }, tab = { id: "b", active: true, named: true, name: "Task" };
let part = { part: "end" }, platform = "windows", panelOpen = false, home = false;
const cx = { notify() {}, stop_propagation() {} };
const env = {
  View: class {}, div: element, svg: src => { const e = element(); e.src = src; return e; }, image: element, h_flex: element,
  Popup: { new: (_id, trigger) => element().child(trigger) },
  theme: () => t, props: () => part, settings: () => ({ zoom: 1 }), window: () => ({ platform, buttons: true }),
  spaces: () => [space], agents: () => [], terminals: () => [], panes: () => [], layout: () => ({}), shared: () => null,
  sidebarParts: () => ({ stack: { active: "lists" } }), panelState: () => ({ pages: ["files"], page: "files", tabs: [], open: panelOpen }),
  tip: (_view, _t, _id, _label, el) => el, stop: (_view, _t, _id, el) => el, focusRoot: (_view, el) => el,
  glow: (view, id) => on => { view.hot = on ? id : null; }, within: () => false,
  keptHover: (view, key, id) => ({ hover: on => { view[key] = on ? id : null; }, move() {} }), tipCard: (_t, id) => element().id(id), FADE: {},
  run: (cmd, args) => calls.push([cmd, args]), newTab: s => calls.push(["new", s.id]), togglePanel: () => calls.push(["panel"]),
  toggleWide: () => calls.push(["wide"]), hidePanel: () => calls.push(["hide"]), updates: () => ({ app: {} }), KEY: {}, REVIEW_STATUS: "review.status",
  navigation: () => ({ get atHome() { return home; }, frame: () => ({ tabs: [tab], context: null }) }),
  subAgents: () => () => [], namer: () => p => p.title, programIcon: () => null,
  POINTER_WATCH: 100, pointerAt: () => null, pointerGone: () => false, pointerMoved() {}, pressed() {}, justClosed: () => false,
  openMenu: (_view, kind, target) => calls.push([kind, target]), openOverlay: value => calls.push(["overlay", value]),
};
function load(dir) {
  const scope = vm.createContext({ ...env });
  const { strip } = kit;
  vm.runInContext(strip(fs.readFileSync(path.join(__dirname, "../../shared/measured-text.js"), "utf8")), scope);
  vm.runInContext(strip(fs.readFileSync(path.join(__dirname, "../../shared/details.js"), "utf8")), scope);
  vm.runInContext(strip(fs.readFileSync(path.join(__dirname, "../../shared/scroll-strip.js"), "utf8")), scope);
  vm.runInContext(strip(fs.readFileSync(path.join(__dirname, "../../shared/status-mark.js"), "utf8")), scope);
  vm.runInContext(strip(fs.readFileSync(path.join(__dirname, "../../shared/store.js"), "utf8")), scope);
  vm.runInContext(strip(fs.readFileSync(path.join(__dirname, "../../shared/list.js"), "utf8")), scope);
  vm.runInContext('globalThis.namedLabel = named;', scope);
  vm.runInContext("(() => {\n" + strip(["color.js", "button.js", "trigger.js", "tab.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n")) + "\nglobalThis.tab = tab; globalThis.drawButton = button; globalThis.radiusOf = radiusOf; globalThis.ghostTint = tint; globalThis.GROUP_GAP = GROUP_GAP; Object.assign(globalThis, { trigger, opener, popupOpen, hang });\n})();", scope);
  vm.runInContext(fs.readFileSync(path.join(dir, "main.js"), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export default class", "globalThis.Mod = class"), scope);
  return Object.assign(new scope.Mod(), { nameW: {}, tabStrip: {}, surfaceWidths: {}, surfaceStrip: {}, pressed: null, over: null, area: 600 });
}
const click = (root, id) => { const el = find(root, id); assert.ok(el, id); el.handlers.on_click({}, cx); return el; };
const tabs = load(__dirname);
let root = tabs.render();
click(root, "tab-new");
part = { part: "window" };
root = tabs.render();
click(root, "panel-toggle");
for (const id of ["minimize", "maximize", "close-window"]) {
  const el = click(root, id);
  assert.equal(el.style.h, 28); assert.equal(el.style.w, 28); assert.equal(el.items[0].style.size, 16);
}
assert.deepEqual(calls.splice(0), [["new", "s"], ["panel"], ["window.minimize", undefined], ["window.maximize", undefined], ["window.close", undefined]]);
panelOpen = true;
assert.equal(find(tabs.render(), "close-window"), null, "platform buttons move to the panel head");
assert.equal(find(tabs.render(), "panel-toggle"), null, "open panel owns its rightmost toggle");
panelOpen = false;

// On a Mac only the closed panel's toggle, then the layout's 12, follow Details: Lists' + never pushes it (「规则」R1).
{
  const row = JSON.parse(fs.readFileSync(path.join(__dirname, "../../layouts/herdr-t3.json"), "utf8"));
  const walk = n => n?.id === "tabs-row" ? n : (n?.children ?? []).map(walk).find(Boolean);
  const blocks = walk(row).children, at = blocks.findIndex(b => b.id === "actions");
  const drawn = ["tab-new", "panel-toggle", "minimize", "maximize", "close-window"];
  const wasWindow = env.window, wasParts = env.sidebarParts;
  for (const mode of ["lists", "inbox"]) for (const open of [false, true]) {
    env.window = () => ({ platform: "macos", buttons: false }); env.sidebarParts = () => ({ stack: { active: mode } }); panelOpen = open;
    const view = load(__dirname), ids = list => list.flatMap(b => b.content ? (part = b.content.props, drawn.filter(id => find(view.render(), id))) : []);
    const before = ids(blocks.slice(0, at)), after = ids(blocks.slice(at + 1)), state = `${mode}, panel ${open ? "open" : "closed"}`;
    assert.deepEqual(after, open ? [] : ["panel-toggle"], `only the closed panel's toggle follows Details (${state})`);
    // 4 from Details to the closed panel's toggle, and from Lists' + to Details (P3).
    const lead = (part = { part: "window" }, find(view.render(), "window-end").style.pl ?? 0), trail = (part = { part: "end" }, find(view.render(), "tabs-end").style.pr ?? 0);
    assert.deepEqual([lead, trail], [open ? 0 : 4, mode === "lists" ? 4 : 0], `4 beside Details (${state})`);
    assert.deepEqual(before, mode === "lists" ? ["tab-new"] : [], `Lists' + comes before Details (${state})`);
  }
  env.window = wasWindow; env.sidebarParts = wasParts; panelOpen = false; part = { part: "window" };
}
// The closed panel's toggle ends 12 from the window edge, where the open panel's head puts it (t3-chrome check-surfaces), on
// rows as high, so the 28 buttons share a centre too.
{
  const root = JSON.parse(fs.readFileSync(path.join(__dirname, "../../layouts/herdr-t3.json"), "utf8"));
  const node = (n, id) => n?.id === id ? n : (n?.children ?? []).map(c => node(c, id)).find(Boolean);
  const row = node(root, "tabs-row").children, closed = row.slice(row.findIndex(b => b.id === "window-end") + 1).reduce((sum, b) => sum + b.size.px, 0);
  assert.equal(closed, 12, "the closed panel's toggle, 12 from the window edge");
  assert.equal(node(root, "panel-head").size.px, node(root, "tabs-row").size.px, "the panel head and the tab bar share a centre line");
}
// panel.js sizes the window part as it shows or hides the panel (so that frame has Details where it ends up): the width it
// gives is the width this part draws, each platform, panel open or closed.
{
  const scope = vm.createContext({ layout: () => ({ id: "root", children: [{ id: "panel-body", children: [{ id: "files" }] }] }), window: () => env.window(), GROUP_GAP: 4,
    KEY: { home: "t3-tabs.home" }, shared: k => k === "t3-tabs.home" ? "h" : null, spaces: () => [{ id: home ? "h" : "s", active: true }] });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../shared/panel.js"), "utf8").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export /gm, "") + "\nglobalThis.windowEndPx = windowEndPx;", scope);
  part = { part: "window" };
  const was = env.window;
  for (const atHome of [false, true]) for (const p of ["windows", "macos"]) for (const open of [false, true]) {
    env.window = () => ({ platform: p, buttons: p !== "macos" }); panelOpen = open; home = atHome;
    const el = load(__dirname).render(), drawn = (find(el, "panel-toggle") ? 4 + 28 : 0) + (find(el, "minimize") ? 8 + 3 * 28 : 0);
    assert.equal(scope.windowEndPx(open), drawn, `${p}, panel ${open ? "open" : "closed"}${atHome ? ", at Home" : ""}`);
  }
  // At Home the panel's toggle isn't drawn, as +: the row folds to 8 there, and a 28 toggle squeezed into it still took the
  // pointer. ⌥⌘B still opens the panel. Window buttons stay, the row not folding while they show.
  panelOpen = false; home = true;
  for (const p of ["macos", "windows"]) {
    env.window = () => ({ platform: p, buttons: p !== "macos" });
    const el = load(__dirname).render();
    assert.equal(find(el, "panel-toggle"), null, `${p}: no panel toggle at Home`);
    assert.equal(Boolean(find(el, "minimize")), p !== "macos", `${p}: window buttons as anywhere`);
  }
  home = false;
  env.window = was;
  panelOpen = false;
}
platform = "linux";
root = tabs.render();
assert.equal(find(root, "minimize").items[0], "−"); assert.equal(find(root, "maximize").items[0], "□");
const toggle = tabs.sidebarToggle(t, () => {}, [{ status: "done" }], a => a.status);
assert.equal(toggle.style.h, 28); assert.equal(toggle.style.px, 10); assert.equal(toggle.style.gap, 6);
assert.equal(toggle.style.w, undefined); assert.ok(find(toggle, "agents-done"));
assert.equal(tabs.sidebarToggle(t, () => {}, [], a => a.status).style.w, 28, "nothing to count: the 28px square");
click(toggle, "sidebar-toggle");
assert.equal(calls.pop()[0], "layout.toggle");
part = {};
tabs.overTab = "tab-b";
root = tabs.render();
const close = click(root, "tab-b-close");
assert.equal(close.style.h, 16); assert.equal(close.items.length, 1); assert.equal(close.items[0].style.size, 12);
assert.equal(close.hoverStyle.bg, t.raised, "as T3's tab close, bg-muted"); assert.equal(calls.pop()[0], "t3-tabs.close-tab:b");
assert.equal(find(root, "tab-b").style.bg, "#ffffff12", "the tab shown: the text color at 7%, as the panel's tabs");
tabs.overTab = null;
assert.notEqual(find(tabs.render(), "tab-b-close").items[0]?.src, "mods/t3-tabs/icons/x.svg", "× shows only while the tab is hovered");
// A middle press closes the tab through the same close-tab path as ×, so a running agent still asks first.
root = tabs.render();
[].concat(find(root, "tab-b").handlers["on_mouse_down:middle"]).forEach(f => f({}, cx));
assert.equal(calls.pop()[0], "t3-tabs.close-tab:b", "a middle press closes the tab");

const chrome = load(path.join(__dirname, "../t3-chrome"));
part = { footer: true };
root = chrome.render();
for (const id of ["settings", "t3-settings"]) assert.equal(click(root, id).style.h, 32);
assert.deepEqual(calls.splice(0).map(c => c[0]), ["app.settings", "t3-tabs.settings"]);
part = {};
root = chrome.render();
for (const id of ["sidebar-mode", "sidebar-toggle"]) assert.equal(click(root, id).style.h, 28);
assert.deepEqual(calls.splice(0).map(c => c[0]), ["t3-tabs.sidebar", "layout.toggle"]);
part = { part: "panel" };
root = chrome.render();
for (const id of ["panel-wide", "panel-close"]) assert.equal(click(root, id).style.h, 28);
assert.deepEqual(calls.splice(0), [["wide"], ["hide"]]);

let notices = 0;
const pending = [], timedCx = { ...cx, timer: { after(ms, callback) { const task = { ms, callback, cancel() { this.cancelled = true; } }; pending.push(task); return task; }, every() { return { cancel() {} }; } } };
const tick = ms => { const i = pending.findIndex(task => !task.cancelled && task.ms === ms); assert.notEqual(i, -1); pending.splice(i, 1)[0].callback(timedCx); };
const measureCx = { ...cx, notify() { notices++; } }, bounds = { x: 10, y: 20, width: 30, height: 24 };
const crumbContext = { space: { id: 's', name: 'Space' }, head: 'agent', parent: 'parent' };
const crumbData = { every: [{ address: 'agent', title: 'Wide title' }, { address: 'parent', title: 'Parent' }], ps: [], name: a => a.title, narrow: false, stopPress() {} };
env.projectMark = () => element();
const crumbs = load(__dirname);
root = crumbs.crumb(t, crumbContext, crumbData);
assert.ok(find(root, 'text-name-peer-agent'), 'the breadcrumb uses the shared measured text');
find(root, 'text-name-peer-agent').handlers.on_size_change({ width: 40 }, measureCx);
find(root, 'text-measure-peer-agent').handlers.on_size_change({ width: 90 }, measureCx);
const first = notices;
find(root, 'text-name-peer-agent').handlers.on_size_change({ width: 40 }, measureCx);
find(root, 'text-measure-peer-agent').handlers.on_size_change({ width: 90 }, measureCx);
assert.equal(notices, first, 'unchanged breadcrumb widths do not notify');
root = crumbs.crumb(t, crumbContext, crumbData);
const title = find(root, 'peer-agent');
title.handlers.on_hover(true, timedCx); assert.equal(crumbs.details, undefined, 'cut names retain the opening delay');
tick(150); tick(34); assert.equal(crumbs.details, 'peer-agent'); assert.equal(crumbs.detailsIn, true, 'the original details timer finishes its fade in');
title.handlers.on_mouse_move({ bounds }); assert.equal(crumbs.detailsBox.key, 'peer-agent'); assert.equal(crumbs.detailsBox.box, bounds);
title.handlers["on_mouse_down:left"]({ bounds }, timedCx); assert.equal(crumbs.details, null, 'press closes the tooltip');
title.handlers.on_click({}, cx);
assert.equal(calls.at(-1)[1].at.x, 10); assert.equal(calls.at(-1)[1].at.y, 48, 'title menu retains its pressed anchor');
title.handlers["on_mouse_down:right"]({}, timedCx); assert.equal(calls.at(-1)[0], 'agent'); assert.equal(calls.at(-1)[1].address, 'agent');
find(root, 'text-name-peer-agent').handlers.on_size_change({ width: 90 }, measureCx);
root = crumbs.crumb(t, crumbContext, crumbData);
find(root, 'peer-agent').handlers.on_hover(true, timedCx); assert.equal(crumbs.details, null, 'whole titles show no repeated label');
root = crumbs.crumb(t, crumbContext, { ...crumbData, narrow: true });
find(root, 'crumb-parent').handlers.on_hover(true, timedCx); assert.equal(crumbs.details, 'crumb-parent', 'an ellipsis still shows the full parent name');
console.log("ok: tab/window/sidebar and chrome buttons use the real helper and preserve their clicks, counts and platform glyphs.");
