// The space panel's file tree as data: flattened folders, Review's paths in their order, the row a path is in, and the keys.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = ["color.js", "file-tree.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n")
  .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ")
  + "\nglobalThis.tree = { treeRows, pathEntries, rowAt, treeKey, naturalCompare, sortEntries };";
// The row as drawn: each element a tag and what it holds, in order.
const el = (tag) => { const node = { tag, kids: [], calls: {} }; const p = new Proxy(node, { get: (t, k) => k in t ? t[k] : k === "child" ? (c) => (t.kids.push(c), p)
  : k === "when" ? (c, f) => (c ? f(p) : p) : (...args) => (t.calls[k] = args, p) }); return p; };
const context = vm.createContext({ div: () => el("div"), svg: (src) => Object.assign(el("svg"), { src }), h_flex: () => el("row"), pierreFileIcon: () => el("svg") });
vm.runInContext(src.replace("globalThis.tree = { treeRows,", "globalThis.tree = { treeRow, treeRows,"), context);
const { treeRows, pathEntries, rowAt, treeKey, treeRow, naturalCompare, sortEntries } = context.tree;
const plain = (v) => JSON.parse(JSON.stringify(v));
const shape = (rows) => plain(rows).map((r) => `${"  ".repeat(r.depth)}${r.dir ? (r.open ? "v " : "> ") : ""}${r.name}`);

// The two pages use the same conventional order, including uppercase root files and numeric suffixes.
assert.deepEqual(plain(["file10", "File2", "b", "file1", "A", "file02"].sort(naturalCompare)), ["A", "b", "file1", "File2", "file02", "file10"]);
const entries = [{ name: "README.md", dir: false }, { name: "mods", dir: true }, { name: "docs", dir: true },
  { name: "AGENTS.md", dir: false }, { name: "file10", dir: false }, { name: "file2", dir: false }];
assert.deepEqual(plain(sortEntries(entries)).map(e => e.name), ["docs", "mods", "AGENTS.md", "file2", "file10", "README.md"]);
assert.equal(sortEntries(entries)[0], entries[2], "sorting preserves each entry's metadata and identity");
const many = Array.from({ length: 12000 }, (_, i) => ({ name: `f${12000 - i}`, dir: i % 7 === 0 }));
const sorted = sortEntries(many);
assert.equal(sorted.length, many.length);
assert.ok(sorted.findIndex(e => !e.dir) > 0 && sorted.slice(0, sorted.findIndex(e => !e.dir)).every(e => e.dir));

// Review's paths, in the diff's order: folders where their first path comes, a chain of lone folders one row.
const kids = pathEntries(["packages/cli/src/a.ts", "README.md", "packages/cli/src/daemon/b.ts", "gone/c.ts"].map((p) => ({ path: p, missing: p.startsWith("gone") })));
const all = treeRows((rel) => kids.get(rel) ?? [], () => true);
assert.deepEqual(shape(all), ["v packages / cli / src", "  a.ts", "  v daemon", "    b.ts", "README.md", "v gone", "  c.ts"]);
assert.deepEqual([all[0].path, all[0].top, all[6].missing, all[6].path], ["packages/cli/src", "packages", true, "gone/c.ts"]);

// A closed folder stops the chain at it and hides what's under it; a closed chain's end shows the chain, closed.
const shut = new Set(["packages/cli"]);
assert.deepEqual(shape(treeRows((rel) => kids.get(rel) ?? [], (p) => !shut.has(p))).slice(0, 2), ["> packages / cli", "README.md"]);
shut.clear(); shut.add("packages/cli/src");
assert.deepEqual(shape(treeRows((rel) => kids.get(rel) ?? [], (p) => !shut.has(p))).slice(0, 2), ["> packages / cli / src", "README.md"]);
shut.clear(); shut.add("packages");
assert.equal(shape(treeRows(rel => kids.get(rel) ?? [], p => !shut.has(p), true))[0], "> packages / cli / src", "Files keeps a loaded directory chain compact when closed");
// A lone folder's entries come with the row: the last folder's, as Files dims what Git ignores.
const lone = new Map([["", [{ name: "a", dir: true }]], ["a", [{ name: "b", dir: true, ignored: true }]], ["a/b", [{ name: "x", dir: false }]]]);
const loneRows = treeRows((rel) => lone.get(rel) ?? [], () => true);
assert.deepEqual(plain(loneRows.map((r) => [r.path, r.name, r.ignored ?? false])), [["a/b", "a / b", true], ["a/b/x", "x", false]]);

// The row a path is in: its own, or the flattened one it's a folder of; nothing past it.
assert.equal(rowAt(all, "packages/cli"), 0);
assert.equal(rowAt(all, "packages"), 0);
assert.equal(rowAt(all, "packages/cli/src/daemon"), 2);
assert.equal(rowAt(all, "pack"), -1, "a name's start isn't a folder");
assert.equal(rowAt(all, "nope"), -1);

// Keys: ↑/↓ stop at the ends, from none at the first; → opens, then goes in; ← closes, then goes up.
assert.deepEqual(plain(treeKey("down", all, -1)), { at: 0 });
assert.deepEqual(plain(treeKey("down", all, 6)), { at: 6 });
assert.deepEqual(plain(treeKey("up", all, 0)), { at: 0 });
assert.deepEqual(plain(treeKey("end", all, 0)), { at: 6 });
assert.deepEqual(plain(treeKey("home", all, 4)), { at: 0 });
assert.equal(treeKey("right", all, 0).at, 1, "into an open folder");
assert.equal(treeKey("left", all, 3).at, 2, "a file goes to its folder");
assert.equal(treeKey("left", all, 2).toggle.path, "packages/cli/src/daemon", "an open folder closes");
assert.equal(treeKey("left", all, 4), null, "nothing above the top level");
assert.equal(treeKey("right", all, 1).at, 2, "Pierre moves right on a file to the next visible row");
const closed = treeRows((rel) => kids.get(rel) ?? [], (p) => p !== "gone");
assert.equal(treeKey("right", closed, 5).toggle.path, "gone", "a closed folder opens");
assert.equal(treeKey("enter", all, 4).pick.path, "README.md");
assert.equal(treeKey("x", all, 0), null);
assert.equal(treeKey("down", [], -1), null);

// A group is never joined to its lone folder, nor a folder to a lone group under it.
const grouped = new Map([["", [{ name: "G", dir: true, path: "group:g", flat: false }]], ["group:g", [{ name: "src", dir: true, path: "group:g/src" }]],
  ["group:g/src", [{ name: "a.ts", dir: false, path: "src/a.ts" }]]]);
assert.deepEqual(shape(treeRows((rel) => grouped.get(rel) ?? [], () => true)), ["v G", "  v src", "    a.ts"]);

// One row for both pages: the page's box only fills a lane before the icon, the indent and margins don't move with it; no
// chevron, a folder's icon shows whether it's open.
const t = { dim: "#888888", accent: "#0000ff", foreground: "#ffffff" };
const drawn = treeRow(t, "mods/x", { path: "a.ts", name: "a.ts", depth: 2 }, "r", { leading: el("box"), trailing: el("tail"), status: "M" });
const bare = treeRow(t, "mods/x", { path: "a.ts", name: "a.ts", depth: 2 }, "f");
assert.deepEqual(drawn.kids.map((k) => k.tag), ["box", "svg", "div", "div", "tail"], "box, icon, name, letter, the page's own");
assert.deepEqual(bare.kids.map((k) => k.tag), ["svg", "div"], "no box, no lane");
assert.deepEqual([drawn.calls.pl, drawn.calls.mx, drawn.calls.h], [bare.calls.pl, bare.calls.mx, bare.calls.h], "the same geometry with or without a box");
const icon = (open) => treeRow(t, "mods/x", { path: "src", name: "src", dir: true, open, depth: 0 }, "d").kids[0].src;
assert.notDeepEqual(icon(true), icon(false), "an open folder's icon differs from a closed one's");
assert.equal(treeKey("space", all, 4)?.pick.path, "README.md", "Space activates like Enter");

// Indent guides: no level's line crosses the row's own box or icon, with a box or without; without one, each still runs
// down its folder icon's centre (Files' place).
const guides = (opts, depth) => {
  const row = treeRow(t, "mods/x", { path: "a.ts", name: "a.ts", depth }, "g", { guides: true, ...opts });
  return { pl: row.calls.pl[0], gap: row.calls.gap[0], lines: row.calls.children[0].map((g) => g.calls.left[0]) };
};
for (const depth of [1, 2, 4]) for (const leading of [el("box"), undefined]) {
  const { pl, gap, lines } = guides({ leading }, depth);
  const boxes = leading ? [[pl, pl + 16], [pl + 16 + gap, pl + 32 + gap]] : [[pl, pl + 16]];
  for (const x of lines) for (const [a, b] of boxes) assert.ok(x + 1 <= a || x >= b, `depth ${depth}${leading ? " with a box" : ""}: the line at ${x} crosses [${a}, ${b}]`);
}
assert.deepEqual(plain(guides({}, 3).lines), [0, 1, 2].map((l) => 6.4 + l * 20.8 + 8 - 0.5), "Files' guides stay on its folder icons' centres");

console.log("ok: file tree: lone folders flatten (groups never), paths keep their order, a path finds its row, the keys move as Pierre's, and both pages draw one row.");
