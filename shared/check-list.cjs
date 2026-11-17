// Loads list.js in a fake kit: the keys, and a list that keeps the highlight in view, by key and by wheel.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { elements } = require("./check-kit.js");
const element = elements();

let now = 0, zoom = 2;
const src = fs.readFileSync(path.join(__dirname, "list.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ")
  + "\nglobalThis.list = { step, menuJump, scrollList, menuKeys, openLit, litProp, propsLit };";
let closed = [], popupProps = { overlay: "o1" };
const context = vm.createContext({ div: element, settings: () => ({ zoom }), Date: { now: () => now }, props: () => popupProps, closeOverlay: (id) => closed.push(id) });
vm.runInContext(src, context);
const { step, menuJump, scrollList, menuKeys, openLit, litProp, propsLit } = context.list;

// ↑/↓ go round the ends, and with nothing lit start from one.
assert.equal(step({ key: "down" }, 2, 3), 0);
assert.equal(step({ key: "up" }, 0, 3), 2);
assert.equal(step({ key: "down" }, -1, 3), 0);
assert.equal(step({ key: "up" }, -1, 3), 2);
assert.equal(step({ key: "down" }, 0, 0), -1, "no rows");
assert.equal(step({ key: "a" }, 0, 3), -1);

// T3's Base UI menus: ↑/↓, Home, End, and typing.
{
  const v = {}, rows = ["In 1 hour", "In 3 hours", "This evening", "Tomorrow", "Custom…"];
  const type = (ch, at, more = {}) => menuJump(v, { key: ch, key_char: ch, modifiers: {}, ...more }, rows, at);
  assert.equal(menuJump(v, { key: "home" }, rows, 3), 0);
  assert.equal(menuJump(v, { key: "end" }, rows, 0), 4);
  assert.equal(menuJump(v, { key: "down" }, rows, 0), 1);
  assert.equal(menuJump(v, { key: "up" }, rows, -1), 4);
  assert.equal(menuJump(v, { key: "space", key_char: " " }, rows, 0), -1, "Space is the row's");
  assert.equal(type("a", 0, { modifiers: { platform: true } }), -1, "a chord is the app's");
  assert.equal(type("T", -1), 2, "any case, and with nothing lit from the top");
  now += 100;
  assert.equal(type("o", 2), 3, "letters in a row spell a word");
  now += 1000;
  assert.equal(type("i", 3), 0, "past 750ms it's a new word");
  now += 100;
  assert.equal(type("i", 0), 1, "the same letter steps through the rows it starts");
  now += 100;
  assert.equal(type("i", 1), 0, "and wraps");
  now += 1000;
  assert.equal(type("z", 1), -1);
}

const cx = { notify() {}, stop_propagation() { cx.stopped = true; } };
const draw = (i) => { const row = element(); row.id(i); return row; };
const shown = (list) => list.items.map((n) => [n.key, n.style.top]);

// The row keys reach stays in view with the least move, down, up and round the ends; six rows in a list of twenty.
{
  const v = {}, list = (at) => scrollList(v, "l", { count: 20, row: 10, at, height: 60, draw, wheeled() {} });
  assert.equal(list(0).style.h, 60, "a height known is the list's");
  assert.deepEqual(shown(list(0)).at(-1), [5, 50]);
  assert.deepEqual(shown(list(5))[0], [0, 0], "in view: no move");
  assert.deepEqual(shown(list(6))[0], [1, 0], "past the bottom: just far enough");
  assert.deepEqual(shown(list(6)).at(-1), [6, 50]);
  assert.deepEqual(shown(list(3))[0], [1, 0]);
  assert.deepEqual(shown(list(0))[0], [0, 0], "past the top: to the top");
  assert.deepEqual(shown(list(19)).at(-1), [19, 50], "up from the first, round to the last");
  assert.deepEqual(shown(list(19)).length, 6);
  assert.deepEqual(shown(list(0))[0], [0, 0], "down from the last, round to the first");
  assert.deepEqual(shown(list(25)).length, 6, "a row since gone doesn't scroll it past the end");
}

// The row the pointer lit, half in view, doesn't move the list from under the pointer; a key still brings its row into view.
{
  const v = { scrollTop: { l: 5 } }, list = (at) => scrollList(v, "l", { count: 20, row: 10, at, height: 60, draw, wheeled() {} });
  list(-1).handlers.on_mouse_move({ local_position: { y: 58 * zoom } }, cx);
  assert.deepEqual(shown(list(6)).at(-1), [6, 55], "lit by the pointer: no move");
  assert.deepEqual(shown(list(7)).at(-1), [7, 50], "by a key: into view");
  list(7).handlers.on_hover(false, cx);
  v.scrollTop.l = 5;
  assert.deepEqual(shown(list(6)).at(-1), [6, 50], "the pointer gone, the lit row comes into view");
}

// Not known, it's measured, in zoomed pixels: a tall screen's rows until then, none scrolled. A review's file tree runs to a
// thousand rows, and drawing them all ran its render past Herdr's limit; interrupted, it was never measured, and drew them all again.
{
  const v = {}, list = () => scrollList(v, "l", { count: 20, row: 10, at: 9, draw, wheeled() {} });
  assert.equal(list().items.length, 20);
  assert.equal(scrollList({}, "l", { count: 1000, row: 10, draw }).items.length, 200);
  list().handlers.on_size_change({ height: 40 * zoom }, cx);
  assert.deepEqual(shown(list()).map((r) => r[0]), [6, 7, 8, 9]);
}

// The wheel, two events before the next render as a trackpad sends them, takes the highlight along; none lit stays none.
{
  const v = {}, keeps = [], list = (at) => scrollList(v, "l", { count: 20, row: 10, at, height: 40, draw, wheeled: (keep) => keeps.push(keep) });
  const wheel = list(0);
  for (let i = 0; i < 2; i++) wheel.handlers.on_scroll_wheel({ delta: { y: -15 * zoom } }, cx);
  assert.deepEqual(keeps.splice(0), [2, 3], "the nearest row wholly in view");
  assert.deepEqual(shown(list(3))[0], [3, 0]);
  const up = list(3);
  up.handlers.on_scroll_wheel({ delta: { y: 10 * zoom } }, cx);
  assert.deepEqual(keeps.splice(0), [3], "a row still in view stays lit");
  list(-1).handlers.on_scroll_wheel({ delta: { y: 10 * zoom } }, cx);
  assert.deepEqual(keeps.splice(0), [-1]);
  cx.stopped = false;
  const end = scrollList({}, "l", { count: 2, row: 10, at: 0, height: 40, draw, wheeled: () => keeps.push("moved") });
  end.handlers.on_scroll_wheel({ delta: { y: 10 } }, cx);
  assert.deepEqual([cx.stopped, keeps], [true, []], "nothing to scroll: still not what's under the popup's");
}

// A menu opened by keys (Enter, →, a shortcut) lights its first row; opened by the pointer, none until an arrow key.
{
  assert.deepEqual([openLit(true), openLit(false)], [0, -1]);
  popupProps = { overlay: "o1", ...litProp(true) }; assert.equal(propsLit(), 0, "a popup opened by keys");
  popupProps = { overlay: "o1", ...litProp(false) }; assert.equal(propsLit(), -1, "by the pointer");
  const cx = { stop_propagation() {}, notify() {} }, v = { at: propsLit() };
  menuKeys(v, ["A", "B"], () => {})({ key: "down" }, cx); assert.equal(v.at, 0, "its first arrow lights the first row");
  popupProps = { overlay: "o1" };
}

// A popup menu's keys (menuKeys), with each of its options.
{
  const cx = { stop_propagation() { cx.stopped = true; }, notify() {} };
  const labels = ["Alpha", "Beta", "Gamma"], picks = [];
  const choose = (at, _cx, keys) => picks.push([at, keys]);
  const press = (keys, e) => { cx.stopped = false; keys(e, cx); };
  let v = { at: -1 };
  const plain = menuKeys(v, labels, choose);
  press(plain, { key: "down" }); assert.equal(v.at, 0);
  press(plain, { key: "space" }); press(plain, { key: "enter" });
  assert.deepEqual(picks.splice(0), [[0, true], [0, true]], "Enter and Space pick the lit row, by keys");
  closed = []; press(plain, { key: "escape" }); assert.deepEqual(closed, ["o1"], "Escape closes this popup");
  press(plain, { key: "left" }); press(plain, { key: "right" });
  assert.deepEqual([closed, picks, v.at], [["o1"], [], 0], "← and → do nothing in a plain menu");
  // `at`: another field holds the lit row; `close`: Escape's own.
  v = { pickAt: 1 }; let shut = 0;
  press(menuKeys(v, labels, choose, { at: "pickAt", close: () => shut++ }), { key: "down" }); assert.equal(v.pickAt, 2);
  press(menuKeys(v, labels, choose, { at: "pickAt", close: () => shut++ }), { key: "escape" }); assert.equal(shut, 1);
  // `back`: a submenu's ← closes it; `sub`: → on a row with a submenu picks it.
  v = { at: 1 }; closed = [];
  press(menuKeys(v, labels, choose, { back: true }), { key: "left" }); assert.deepEqual(closed, ["o1"]);
  press(menuKeys(v, labels, choose, { sub: (i) => i === 1 }), { key: "right" }); assert.deepEqual(picks.splice(0), [[1, true]]);
  v.at = 0; press(menuKeys(v, labels, choose, { sub: (i) => i === 1 }), { key: "right" }); assert.deepEqual(picks, [], "no submenu: → does nothing");
  // `disabled`: moves skip the row.
  v = { at: 0 };
  press(menuKeys(v, labels, choose, { disabled: (i) => i === 1 }), { key: "down" }); assert.equal(v.at, 2);
  now += 1000; press(menuKeys(v, labels, choose, { disabled: (i) => i === 1 }), { key: "b", key_char: "b" }); assert.equal(v.at, 2, "typing finds no disabled row");
  // `enter`: false leaves Enter to what has the keyboard in the row (an Edit button).
  press(menuKeys(v, labels, choose, { enter: () => false }), { key: "enter" });
  assert.deepEqual([picks, cx.stopped], [[], false]);
}

console.log("ok: list: ↑/↓ round the ends, Home, End and typing, the highlight kept in view by key and wheel.");
