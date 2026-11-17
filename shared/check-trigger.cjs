// A button that opens a popup (trigger.js) in a fake kit, with the real tip.js, focus.js and button.js: a second click closes
// what the first opened, and its label stays down while what it opened is up.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements(), { find } = kit;
const findTip = (n) => n?.key?.startsWith?.("tip-body-") ? n : (n?.items ?? []).map(findTip).find(Boolean);

const state = {};
let now = 1000, zoom = 1;
const src = ["store.js", "focus.js", "tip.js", "color.js", "button.js", "trigger.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n")
  .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ")
  + "\nglobalThis.tr = { trigger, hang };";
const context = vm.createContext({
  div: () => element(), h_flex: () => element(), v_flex: () => element(), svg: () => element("svg"),
  Popup: { new: (id, child) => { const p = element("popup"); p.key = id; p.items.push(child); return p; } },
  shared: (k) => state[k], setShared: (k, v) => { state[k] = v; }, keys: () => [], window: { mouse_position: () => null, viewport_size: () => null },
  Date: { now: () => now }, settings: () => ({ zoom }),
});
vm.runInContext(src, context);
const { trigger, hang } = context.tr;

const cx = { notify() {}, stop_propagation() {}, timer: { after: (_ms, fn) => { fn(cx); return { cancel() {} }; }, every: () => ({ cancel() {} }) } };
const t = new Proxy({}, { get: (_t, k) => String(k) });
const view = { fs: { modal: false, handles: new Map(), free: [] } };
const CLOSED = "test.closed";
let opened = 0, popupUp = false;
const draw = () => trigger(view, t, "menu-btn", { icon: "x.svg", label: "Menu", hint: "More below", open: popupUp, closed: CLOSED,
  onOpen: () => { opened++; popupUp = true; } });
const press = () => { const b = find(draw(), "menu-btn"); b.handlers["on_mouse_down:left"]({ bounds: { x: 0, y: 0, width: 28, height: 28 } }, cx); return b; };
// The native popup closes on any press outside it, the button's too, and stamps its key as it goes.
const outsidePress = () => { if (popupUp) { popupUp = false; state[CLOSED] = now; } };

// Closed: a click opens it.
press().handlers.on_click(null, cx);
assert.equal(opened, 1, "a click opens the popup");
assert.ok(find(draw(), "menu-btn").style.bg, "open: the button stays on");

// Open: the press that brings the second click closes it, and the click mustn't open it again.
now += 400;
const b = press();
outsidePress();
b.handlers.on_click(null, cx);
assert.equal(opened, 1, "a second click closes it, not closes and reopens it");
assert.equal(popupUp, false);

// Hovered while closed, the label shows, with its second line.
const hover = () => { const el = draw(); find(el, "tip-over-menu-btn").handlers.on_hover(true, cx); find(el, "menu-btn").handlers.on_hover(true, cx); };
hover();
assert.ok(findTip(draw()), "closed and hovered: its label shows");
// Open and hovered: no label over what it opened.
popupUp = true;
hover();
assert.equal(findTip(draw()), undefined, "open: no label");

// Unset, `open` is whether this button's popup is up: on from its opening until its close stamps the key.
popupUp = false; view.hot = null;
const kept = () => find(trigger(view, t, "kept", { icon: "x.svg", label: "Sort", closed: CLOSED, onOpen: () => {} }), "kept");
now += 400;
kept().handlers["on_mouse_down:left"]({ bounds: null }, cx);
now += 10;
kept().handlers.on_click(null, cx);
assert.ok(kept().style.bg, "opened: on");
now += 400; state[CLOSED] = now;
assert.equal(kept().style.bg, undefined, "closed: off");
// A popup hangs under its control's press: right edges together by default, 4 below, in zoomed px; no press, the app's place.
const at24 = { x: 100, y: 10, width: 24, height: 24 };
assert.deepEqual(JSON.parse(JSON.stringify(hang(at24, 220))), { at: { x: -96, y: 38 } });
assert.deepEqual(JSON.parse(JSON.stringify(hang(at24, 220, { align: "start", gap: 6 }))), { at: { x: 100, y: 40 } });
zoom = 2;
assert.deepEqual(JSON.parse(JSON.stringify(hang(at24, 50, { gap: 5, nudge: 1 }))), { at: { x: 26, y: 44 } });
assert.deepEqual(JSON.parse(JSON.stringify(hang(null, 220))), {});

// A press that came to nothing (released off the button: no click), then the keyboard. The host clicks a focused stop on Enter's
// release, after its key-down went to that stop; the press mustn't still count: no old box to hang from, no old close to
// swallow the open (t3-tokens「菜单行」: opened by keys, its first row lights). Every handler an element gets runs, as GPUI's.
{
  const all = (kind = "div") => {
    const node = { kind, items: [], handlers: {}, style: {} };
    const proxy = new Proxy(node, { get(target, key) {
      if (key === "tracked" || key in target) return target[key];
      return (...args) => {
        if (key === "when") { if (args[0]) args[1](proxy); }
        else if (key === "child" || key === "content") node.items.push(args[0]);
        else if (key === "children") node.items.push(...args[0].filter(Boolean));
        else if (key === "id") node.key = args[0];
        else if (key === "track_focus") node.tracked = args[0];
        else if (key === "on_mouse_down") (node.handlers[`${key}:${args[0]}`] ??= []).push(args[1]);
        else if (key.startsWith("on_")) (node.handlers[key] ??= []).push(args[0]);
        else node.style[key] = args[0];
        return proxy;
      };
    } });
    return proxy;
  };
  const fire = (el, name, event) => (el.handlers[name] ?? []).forEach((h) => h(event, cx));
  const kstate = {};
  let know = 1000;
  const kc = vm.createContext({
    div: () => all(), h_flex: () => all(), v_flex: () => all(), svg: () => all("svg"),
    Popup: { new: (id, child) => { const p = all("popup"); p.key = id; p.items.push(child); return p; } },
    shared: (k) => kstate[k], setShared: (k, v) => { kstate[k] = v; }, props: () => ({}), closeOverlay: () => {},
    keys: () => [], window: { mouse_position: () => null, viewport_size: () => null }, Date: { now: () => know }, settings: () => ({ zoom: 1 }),
  });
  vm.runInContext(["store.js", "focus.js", "tip.js", "color.js", "button.js", "list.js", "trigger.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n")
    .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ") + "\nglobalThis.tr = { trigger, openLit, MODE };", kc);
  const { trigger: ktrigger, openLit, MODE } = kc.tr;
  const kview = { fs: { modal: false, handles: new Map(), free: [{ is_focused: () => true }], keyboard: false } };
  const at = [];
  const btn = () => find(ktrigger(kview, t, "menu-btn", { icon: "x.svg", label: "Menu", closed: CLOSED, onOpen: (b) => { at.push(b); } }), "menu-btn");
  const enter = () => { const b = btn(); assert.ok(b.tracked, "a stop, so Enter reaches it"); fire(b, "on_key_down", { key: "enter", keystroke: "enter" }); fire(b, "on_click", { click_count: 1, modifiers: {} }); };
  const abandoned = () => fire(btn(), "on_mouse_down:left", { bounds: { x: 400, y: 12, width: 28, height: 28 } });
  const tabBack = () => { kstate[MODE] = kview.fs.me = "me"; };
  // The press ends the keyboard mode; Tab brings it back; then Enter.
  abandoned(); tabBack(); enter();
  assert.ok(at[0] == null, "the abandoned press's box isn't where the keys' menu hangs");
  assert.equal(openLit(!at[0]), 0, "opened by keys: its first row lights");
  // That press closed the popup that was up (its close stamped the key): the keys' open still goes, the first time.
  at.length = 0; know += 400; kstate[CLOSED] = undefined;
  abandoned(); kstate[CLOSED] = know; tabBack();
  enter();
  assert.equal(at.length, 1, "the first Enter opens it: the abandoned press closed nothing it asked");
}
console.log("trigger ok");
