// An agent's status mark (status-mark.js) in a fake kit: one shape at every size it's drawn.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const element = require("./check-kit.js").elements();
const src = ["color.js", "status-mark.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ");
const context = vm.createContext({ div: () => element("div"), svg: () => element("svg") });
vm.runInContext(src + "\nglobalThis.m = { statusMark };", context);
const { statusMark } = context.m;
const t = { working: "#111111", blocked: "#222222", done: "#333333", ansi1: "#444444" };

for (const size of [12, 14, 16]) {
  const spin = statusMark(t, "working", size);
  assert.equal(spin.kind, "svg"); assert.equal(spin.style.size, 12, "the spinner is 12 at any size"); assert.equal(spin.style.text_color, "#111111");
  for (const [st, c] of [["blocked", "#222222"], ["error", "#444444"]]) {
    const box = statusMark(t, st, size);
    assert.equal(box.style.size, size); assert.equal(box.style.bg, c + "26"); assert.equal(box.style.text_color, c);
    assert.equal(box.style.text_size, size < 14 ? 10 : 11); assert.deepEqual(box.items, ["!"]);
  }
  const dot = statusMark(t, "done", size);
  assert.equal(dot.style.size, 6); assert.equal(dot.style.bg, "#333333"); assert.ok(!("mx" in dot.style), "done is a bare dot: a column centres it");
  assert.equal(statusMark(t, "idle", size), null); assert.equal(statusMark(t, undefined, size), null);
}
console.log("status-mark ok");
