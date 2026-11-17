const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(`${__dirname}/open-in.js`, "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
function load(installed, previous) {
  const calls = [], context = vm.createContext({
    checking: () => false,
    t3OpenInTargets: previous,
    exec: async (command, args) => {
      calls.push([command, args]);
      return { code: args[0] === "-Ra" && !installed.has(args[1]) ? 1 : 0, stderr: "" };
    },
  });
  vm.runInContext(source, context);
  return { calls, context };
}

(async () => {
  const expected = ["Cursor", "Trae", "Kiro", "Visual Studio Code", "Visual Studio Code - Insiders", "VSCodium", "Zed", "Antigravity", "IntelliJ IDEA", "Aqua", "CLion", "DataGrip", "DataSpell", "GoLand", "PhpStorm", "PyCharm", "Rider", "RubyMine", "RustRover", "WebStorm"];
  const { context, calls } = load(new Set([...expected, "Sublime Text", "Xcode", "TextEdit"]), Promise.resolve(["Finder", "Visual Studio Code"]));
  const targets = await context.installedTargets();
  assert.deepEqual(Array.from(targets), ["Finder", ...expected], "all T3 editor candidates are discovered, including VSCodium; no T3-external app or stale four-editor cache");
  const count = calls.length;
  assert.deepEqual(Array.from(vm.runInContext("knownTargets()", context)), ["Finder", ...expected], "persistent views can read completed metadata without a new native task or probe");
  await context.installedTargets();
  assert.equal(calls.length, count, "Files and Details reuse one asynchronous discovery per run");
  const path = '/tmp/a "quoted"; $(no-command)\nfile';
  assert.equal(await context.openTarget("VSCodium", path), "VSCodium");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ["open", ["-a", "VSCodium", "--", path]], "launch uses literal argv, never a shell");
  assert.equal(await context.openTarget("VSCodium", path, () => false), null);
  assert.equal(calls.length, count + 2, "invalidated sources do not launch or probe");
  const missing = load(new Set());
  assert.equal(await missing.context.openTarget("VSCodium", path), "Finder");
  assert.deepEqual(JSON.parse(JSON.stringify(missing.calls.at(-1))), ["open", ["--", path]], "uninstalled editor falls back to Finder");
  console.log("ok: T3 installed editors, versioned asynchronous discovery, literal launch and source invalidation");
})().catch(e => { console.error(e); process.exitCode = 1; });
