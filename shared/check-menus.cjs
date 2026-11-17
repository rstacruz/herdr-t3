// Files and Review's menu offers what a path can do; Insert preserves the clipboard (menus.js).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = ["store.js", "menus.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n")
  .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ") + "\nglobalThis.menu = { rowItems, mention };";
const calls = [], notices = [], jobs = []; let clipboard = "original";
const context = vm.createContext({ checking: () => false, run: (c, a) => calls.push([c, a]), notify: n => notices.push(n), MENU_ROW: 28 });
vm.runInContext(src, context);
const ids = (o) => [...context.menu.rowItems(o).map((it) => it.id)];
const agent = { terminal: "t1" };

assert.deepEqual(ids({ platform: "macos", agent, editors: ["Zed"] }), ["open", "reveal", "open-with", "copy-path", "mention"]);
assert.deepEqual(ids({ platform: "macos" }), ["open", "reveal", "copy-path", "mention"], "no editors: no Open with");
assert.deepEqual(ids({ platform: "macos", remote: true, editors: ["Zed"] }), ["copy-path", "mention"], "another machine's: nothing opens here");
assert.deepEqual(ids({ platform: "linux" }), ["copy-path", "mention"]);
assert.equal(context.menu.rowItems({}).at(-1).disabled, true, "no terminal in the tab: Insert is off");

const cx = { read_from_clipboard: () => clipboard, write_to_clipboard: v => { clipboard = v; }, sleep: async () => {}, spawn: f => jobs.push(f) };
(async () => {
  clipboard = "original"; context.menu.mention("a.js", "t1", cx); assert.equal(clipboard, " a.js");
  assert.deepEqual(calls.map(c => c[0]), ["pane.focus", "terminal.paste"]);
  assert.equal(calls[0][1].terminal, "t1");
  await jobs.shift()(cx); assert.equal(clipboard, "original", "paste restores the text it borrowed");
  context.menu.mention("b.js", "t1", cx); clipboard = "new user copy"; await jobs.shift()(cx);
  assert.equal(clipboard, "new user copy", "a later user copy wins");
  clipboard = undefined; const before = calls.length; context.menu.mention("c.js", "t1", cx);
  assert.equal(calls.length, before); assert.equal(clipboard, undefined); assert.equal(notices.length, 1);
  clipboard = "kept"; context.menu.mention("a\nwhoami", "t1", cx);
  assert.equal(calls.length, before); assert.equal(clipboard, "kept", "a newline filename cannot execute through an unbracketed paste");
  console.log("ok: Files menu items, relative paths and clipboard-safe terminal insertion");
})().catch(e => { console.error(e); process.exitCode = 1; });
