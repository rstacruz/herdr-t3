// A theme color at a share of its opacity (color.js alpha): what the host reads (gpui-kit's as_color: 3, 6 or 8 hex digits)
// whichever of those the theme wrote, an 8-digit color keeping its own alpha, scaled.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "color.js"), "utf8").replace(/^export (function|const) /gm, "$1 ") + "\nglobalThis.alpha = alpha;", context);
const { alpha } = context;
const valid = (c) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c);

assert.equal(alpha("#abcdef", "12"), "#abcdef12", "six digits: the share appended, as before");
assert.equal(alpha("#abc", "12"), "#aabbcc12", "three: expanded first");
assert.equal(alpha("#abcdef80", "12"), "#abcdef09", "eight: its own half, times 7%");
assert.equal(alpha("#abcdefff", "1f"), "#abcdef1f", "eight, opaque: as six");
assert.equal(alpha("#ABCDEF00", "ff"), "#ABCDEF00", "transparent stays transparent");
for (const c of ["#abc", "#abcdef", "#abcdef80"]) for (const a of ["00", "0a", "12", "1f", "80", "bf", "ff"]) assert.ok(valid(alpha(c, a)), `${c} at ${a}`);
console.log("ok: color: a share of any theme color the host reads stays one it reads");
