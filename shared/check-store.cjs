// Loads store.js in a fake herdr: every key is named by the rule, and each page keeps its own line mode.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const state = {}, local = new Map();
const src = fs.readFileSync(path.join(__dirname, "store.js"), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ")
  + "\nglobalThis.store = { KEY, closedKey, wrapLines, setWrapLines };";
const context = vm.createContext({
  shared: (k) => state[k] ?? null, setShared: (k, v) => { state[k] = v; },
  localStorage: { getItem: (k) => local.get(k) ?? null, setItem: (k, v) => local.set(k, v), removeItem: (k) => local.delete(k) },
});
vm.runInContext(src, context);
const { KEY, closedKey, wrapLines, setWrapLines } = context.store;

// Each page (its own copy, its own localStorage) wraps until set to Scroll, and one page's choice cannot change the other.
assert.equal(wrapLines(), true);
setWrapLines(false); assert.equal(wrapLines(), false);
const other = new Map(), otherScope = vm.createContext({
  shared: (k) => state[k] ?? null, setShared: (k, v) => { state[k] = v; },
  localStorage: { getItem: (k) => other.get(k) ?? null, setItem: (k, v) => other.set(k, String(v)), removeItem: (k) => other.delete(k) },
});
vm.runInContext(src, otherScope);
assert.equal(otherScope.store.wrapLines(), true, "one page's choice cannot change the other");

for (const k of Object.values(KEY)) assert.match(k, /^(t3|t3-[a-z-]+)\.[a-z][A-Za-z]*$/, `${k}: <mod>.<name> or t3.<name>, lowerCamel`);
// A popup's close() and the control that opens it name its stamp through closedKey, never as a literal one side could misspell.
assert.deepEqual([closedKey("t3-picker"), closedKey("t3-agents", "sort")], ["t3-picker.closed", "t3-agents.sortClosed"]);
const root = path.join(__dirname, "..");
for (const dir of ["shared", "mods", "extras/mods"]) for (const f of fs.readdirSync(path.join(root, dir), { recursive: true })) {
  if (!f.endsWith(".js") || path.basename(f) === "store.js") continue;
  const hit = fs.readFileSync(path.join(root, dir, f), "utf8").match(/["'`][^"'`\s]*\.([a-z]+C|c)losed["'`]/);
  assert.equal(hit, null, `${dir}/${f}: ${hit?.[0]} — name a popup's close stamp with closedKey`);
}
console.log("ok: store names every key by the rule, and each page keeps its own line mode.");
