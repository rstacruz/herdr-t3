const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({ svg: file => { const el = { file, size(n) { this.px = n; return this; }, flex_none() { return this; }, text_color(color) { this.color = color; return this; } }; return el; } });
const load = file => fs.readFileSync(path.join(__dirname, file), "utf8").replace(/^import[^;]+;\n/gm, "").replace(/^export /gm, "");
vm.runInContext(load("pierre-icons-data.js") + load("pierre-icons.js") + "\nglobalThis.api={pierreIconFile,pierreFileIcon,PIERRE_NAMES,PIERRE_EXTENSIONS};", context);
const { pierreIconFile, pierreFileIcon, PIERRE_NAMES, PIERRE_EXTENSIONS } = context.api;
assert.equal(pierreIconFile("src/App.TSX"), "file-tree-builtin-react");
assert.equal(pierreIconFile("package.json"), "file-tree-builtin-npm");
assert.equal(pierreIconFile("AGENTS.md"), "t3-file-icon-agents");
assert.equal(pierreIconFile("unknown.whatever"), "file-tree-builtin-default");
assert.equal(pierreIconFile("constructor"), "file-tree-builtin-default");
const t = { ansi4: "#123456", dim: "#666666" }, glyph = pierreFileIcon(t, "mods/t3-files", "a.ts");
assert.equal(glyph.color, "#123456", "the shape takes this layout's theme hue");
assert.equal(glyph.px, 16);
for (const icon of new Set(["file-tree-builtin-default", ...Object.values(PIERRE_NAMES), ...Object.values(PIERRE_EXTENSIONS)]))
  assert.ok(fs.existsSync(path.join(__dirname, "icons/pierre", `${icon}.svg`)), `${icon} has an asset`);
console.log("ok: T3/Pierre icon shapes resolve by name/extension, all assets exist and colors use theme tokens.");
