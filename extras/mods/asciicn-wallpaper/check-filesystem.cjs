// The wallpaper's files under races and odd names, in a temporary app home with real files and processes: what is saved,
// kept, cleaned up or never brought back when Homes, conversions, Applies and deletions overlap.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { runtime } = require("./harness.cjs");
const run = promisify(execFile);
const onlyCase = process.argv.find(a => a.startsWith("--case="))?.slice(7);
// A picture as this mod saves one: its header, then a frame.
const FRAME = "\x1b]777;asciicn-wallpaper;image-v4;dots\x07\x1b[38;2;200;150;220m●\x1b[0m\n";
// The picture file reader stood in for (check-source.cjs runs the real one): any image is a small grey photo.
const W = 16, H = 8, PHOTO = { width: W, height: H, rgba: new Uint8Array(W * H * 4).fill(160) };
const stubs = { "source.js": (m) => ({ readImage: async () => ({ pixels: PHOTO, plan: m["ascii-art.js"].imagePlan(W, H) }) }) };
const KEY = "asciicn-wallpaper.scene";
const PLACEMENTS = "asciicn-wallpaper.placements";
const pending = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const CASE_MS = 10000;
let running = "setup";
process.on("beforeExit", () => {
  if (running === null) return;
  console.error(`FAIL check-filesystem stopped during ${running}: not every case ran`);
  process.exit(1);
});
const exists = async p => fs.stat(p).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; });

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "herdr-wallpaper-audit-")), results = [];
  const emit = () => {
    for (const result of results) console.log(JSON.stringify(result));
    if (results.some(r => r.verdict === "broken")) process.exitCode = 1;
  };
  // A case that never settles fails at its timeout; one that leaves nothing pending to wake it would end the process
  // early, so ending before every case ran fails too (beforeExit, below), naming the case.
  const test = async (name, fn) => {
    if (onlyCase && !name.startsWith(onlyCase)) return;
    let evidence, timer;
    running = name;
    const late = new Promise((_, fail) => { timer = setTimeout(() => fail(Object.assign(new Error(`timed out after ${CASE_MS}ms`), { code: "ERR_ASSERTION" })), CASE_MS); });
    try { await Promise.race([fn(v => { evidence = v; }), late]); results.push({ name, verdict: "survived", evidence }); }
    catch (e) {
      if (e.code !== "ERR_ASSERTION") throw e;
      results.push({ name, verdict: "broken", assertion: e.message.split("\n")[0], evidence });
    } finally { clearTimeout(timer); }
  };
  try {
    for (const [label, stem] of [["plain", "Plain"], ["unicode", "图片"], ["option", "-option"], ["hidden", ".hidden"], ["spaces", " spaced "]]) {
      await test(`file-name:${label}`, async record => {
        const r = await runtime(path.join(root, label), { stubs }), h = await r.home();
        r.hooks.picked = path.join(root, `${stem}.png`);
        await h.choose(r.cx);
        assert.ok(h.draft, "an import previews without publishing");
        await h.applyPreview(r.cx);
        record({ stem, saved: (await fs.readdir(r.dir)).filter(n => n.endsWith(".ans")), imported: h.lib.imported.map(s => s.id), selected: r.state[KEY] ?? null, notices: r.messages.length });
        assert.equal(h.lib.imported.length, 1, "a valid named .ans must be visible after successful import");
        assert.equal(h.lib.imported[0].name, stem, "valid names are preserved");
        await h.choose(r.cx);
        await h.applyPreview(r.cx);
        assert.equal(h.lib.imported.length, 2, "reimport allocates a distinct name, including hidden names");
      });
    }
    await test("shell-metacharacters-and-publication", async record => {
      const r = await runtime(path.join(root, "shell"), { stubs }), h = await r.home();
      const sentinel = path.join(r.dir, "AUDIT_PWNED");
      const names = ["literal; touch AUDIT_PWNED.ans", "$(touch AUDIT_PWNED).ans", "`touch AUDIT_PWNED`.ans", "single'quote.ans", 'double"quote.ans', "line\nbreak.ans", "-dash.ans", ".hidden.ans"];
      for (const name of names) await fs.writeFile(path.join(r.dir, name), FRAME);
      await h.lib.refresh(r.cx);
      assert.equal(h.lib.imported.length, names.length);
      assert.equal(await exists(sentinel), false);
      const text = `${FRAME}$(touch AUDIT_PWNED)🌅\n`.repeat(50000);
      await h.lib.saveFile("large 'quoted", text);
      assert.ok(await fs.readFile(path.join(r.dir, "large 'quoted.ans"), "utf8") === text);
      await assert.rejects(h.lib.saveFile("large 'quoted", "replacement"));
      assert.ok(await fs.readFile(path.join(r.dir, "large 'quoted.ans"), "utf8") === text);
      await fs.mkdir(path.join(r.dir, "folder.ans"));
      await assert.rejects(h.lib.saveFile("folder", "replacement"));
      assert.deepEqual(await fs.readdir(path.join(r.dir, "folder.ans")), []);
      const target = path.join(root, "symlink-target");
      await fs.writeFile(target, "original");
      await fs.symlink(target, path.join(r.dir, "symlink.ans"));
      await assert.rejects(h.lib.saveFile("symlink", "replacement"));
      assert.equal(await fs.readFile(target, "utf8"), "original");
      assert.deepEqual(await fs.readdir(path.join(r.dir, ".preview")), []);
      assert.equal(await exists(sentinel), false);
      record({ literalNames: names.length, largeUtf8Bytes: Buffer.byteLength(text), existingFileDirectoryAndSymlinkProtected: true, sentinelCreated: false, stagingEmpty: true });
    });
    await test("reserved-stems-and-hidden-cache-cleanup", async record => {
      const r = await runtime(path.join(root, "reserved"), { stubs }), h = await r.home();
      const names = [".ans", "..ans", "...ans", ".hidden.ans"];
      for (const name of names) await fs.writeFile(path.join(r.dir, name), FRAME);
      await h.lib.refresh(r.cx);
      assert.deepEqual(Array.from(h.lib.imported, s => s.name), [".hidden"]);
      for (const name of names) assert.equal(await fs.readFile(path.join(r.dir, name), "utf8"), FRAME, "source files survive invalid stem rejection");
      assert.equal(r.messages.length, 3);
      await fs.unlink(path.join(r.dir, ".hidden.ans"));
      await h.lib.refresh(r.cx);
      assert.deepEqual(await fs.readdir(path.join(r.dir, ".tiles")), []);
      record({ invalidNamesRejected: 3, sourceFilesKept: true, hiddenCacheCleaned: true });
    });
    await test("cache-failure-after-publish", async record => {
      const r = await runtime(path.join(root, "cache-failure"), { stubs }), h = await r.home();
      const input = path.join(root, "Fail.png");
      r.hooks.picked = input;
      await h.choose(r.cx);
      const composed = { mode: "contain", zoom: 1.5, x: 0.3, y: 0.7 }, out = h.draft.dir;
      h.draft.placement = composed;
      r.hooks.beforeWrite = async file => { if (file.includes("/.tiles/Fail/")) throw new Error("ENOSPC: simulated cache write failure"); };
      await h.applyPreview(r.cx);
      record({ sourceSaved: await exists(path.join(r.dir, "Fail.ans")), draftRetained: !!h.draft, previousPreviewFilesRetained: await exists(out), imported: h.lib.imported.map(s => s.id), selected: r.state[KEY] ?? null, notices: r.messages.map(m => m.title) });
      assert.ok(h.draft, "failed final conversion must retain the working preview for recovery");
      assert.equal(h.draft.phase, "ready", "Apply can be pressed again");
      assert.match(h.draft.message, /ENOSPC/, "the exact cache failure remains inline for retry");
      assert.equal(r.messages.length, 1, "one failed Apply produces one warning, not two");
      assert.equal(r.state[PLACEMENTS], undefined, "failed Apply never publishes framing");
      assert.equal(await exists(out), true);
      r.hooks.beforeWrite = null;
      await h.applyPreview(r.cx);
      assert.equal(h.draft, null, "retry selects the completed import and clears the draft");
      assert.deepEqual((await fs.readdir(r.dir)).filter(n => n.endsWith(".ans")), ["Fail.ans"], "retry reuses the saved source");
      assert.equal(r.state[KEY], "file:Fail");
      assert.deepEqual(JSON.parse(JSON.stringify(r.state[PLACEMENTS]["file:Fail"])), composed);
      const reopened = await r.home();
      await fs.rm(path.join(r.dir, ".tiles/Fail"), { recursive: true });
      await reopened.lib.refresh(r.cx);
      assert.deepEqual(JSON.parse(JSON.stringify(r.state[PLACEMENTS]["file:Fail"])), composed, "cache rebuild keeps composition");
      await fs.unlink(path.join(r.dir, "Fail.ans"));
      await reopened.lib.refresh(r.cx);
      assert.equal(r.state[PLACEMENTS]["file:Fail"], undefined);
    });
    await test("retry-preserves-replaced-source", async record => {
      const r = await runtime(path.join(root, "replaced"), { stubs }), h = await r.home();
      const input = path.join(root, "Replaced.png");
      r.hooks.picked = input;
      await h.choose(r.cx);
      r.hooks.beforeWrite = async file => { if (file.includes("/.tiles/")) throw new Error("cache failure"); };
      await h.applyPreview(r.cx);
      assert.ok(h.draft);
      const drawn = h.draft.text;
      await fs.writeFile(path.join(r.dir, "Replaced.ans"), FRAME + "●\n");
      r.hooks.beforeWrite = null;
      await h.applyPreview(r.cx);
      assert.equal(await fs.readFile(path.join(r.dir, "Replaced.ans"), "utf8"), FRAME + "●\n");
      assert.equal(await fs.readFile(path.join(r.dir, "Replaced 2.ans"), "utf8"), drawn);
      assert.equal(r.state[KEY], "file:Replaced 2");
      assert.equal(h.draft, null);
      record({ externallyReplacedSourceKept: true, draftSavedSeparately: true });
    });
    await test("delete-before-apply-commit", async record => {
      const r = await runtime(path.join(root, "delete-apply"), { stubs }), a = await r.home(), b = await r.home();
      const input = path.join(root, "import.png");
      r.hooks.picked = input;
      await a.choose(r.cx);
      await a.lib.saveFile("Tracked", a.draft.text);
      await a.lib.refresh(r.cx); await b.lib.refresh(r.cx);
      a.draft.savedName = "Tracked";
      r.state[KEY] = "lighthouse";
      const read = pending(), release = pending();
      r.hooks.afterRead = async file => {
        if (!file.endsWith("/Tracked/scene.json")) return;
        r.hooks.afterRead = null; read.resolve(); await release.promise;
      };
      const applying = a.applyPreview(r.cx);
      await read.promise;
      await b.lib.remove(b.lib.imported[0], b.all(), r.cx);
      release.resolve(); await applying;
      assert.equal(await exists(path.join(r.dir, "Tracked.ans")), false);
      assert.equal(r.state[KEY], "lighthouse", "late Apply cannot reselect a deleted wallpaper");
      assert.equal(r.state[PLACEMENTS]?.["file:Tracked"], undefined);
      assert.ok(a.draft);
      record({ deletedSourceKeptAbsent: true, lateApplyDidNotCommit: true });
    });
    await test("deleted-retry-cannot-republish-source", async record => {
      const r = await runtime(path.join(root, "delete-retry"), { stubs }), a = await r.home(), b = await r.home();
      const input = path.join(root, "retry.png"), file = path.join(r.dir, "Tracked.ans");
      r.hooks.picked = input;
      await a.choose(r.cx); await a.lib.saveFile("Tracked", a.draft.text);
      await a.lib.refresh(r.cx); await b.lib.refresh(r.cx);
      a.draft.savedName = "Tracked"; a.draft.name = "Tracked"; r.state[KEY] = "lighthouse";
      const read = pending(), release = pending();
      r.hooks.beforeExec = async (cmd, args) => {
        if (cmd !== "cat" || args[0] !== file) return;
        r.hooks.beforeExec = null; read.resolve(); await release.promise;
      };
      const retry = a.applyPreview(r.cx);
      await read.promise;
      await b.lib.remove(b.lib.imported[0], b.all(), r.cx);
      release.resolve(); await retry;
      record({ sourceExists: await exists(file), selected: r.state[KEY] });
      assert.equal(await exists(file), false, "a deleted saved source must not be published again by its in-flight retry");
      assert.equal(r.state[KEY], "lighthouse");
      assert.equal(r.state[PLACEMENTS]?.["file:Tracked"], undefined);
    });
    await test("delete-waits-for-source-publication", async record => {
      const r = await runtime(path.join(root, "delete-publish"), { stubs }), a = await r.home(), b = await r.home();
      const input = path.join(root, "Tracked.png"), file = path.join(r.dir, "Tracked.ans");
      r.hooks.picked = input;
      await a.choose(r.cx); await a.lib.saveFile("Tracked", a.draft.text);
      await a.lib.refresh(r.cx); await b.lib.refresh(r.cx);
      const scene = b.lib.imported[0];
      a.draft.savedName = "Tracked"; r.state[KEY] = "lighthouse";
      await fs.unlink(file);
      const writing = pending(), release = pending();
      let published = false, removedBeforePublication = false;
      // Held while the drawing is staged, before it's linked into place (a small one is one write, no parts).
      r.hooks.beforeWrite = async output => {
        if (!output.includes("/.preview/save-")) return;
        r.hooks.beforeWrite = null; writing.resolve(); await release.promise;
      };
      r.hooks.beforeExec = async (cmd, args) => { if (cmd === 'sh' && args[1].startsWith('rm -f')) removedBeforePublication = !published; };
      r.hooks.afterExec = async cmd => { if (cmd === 'link') published = true; };
      const retry = a.applyPreview(r.cx);
      await writing.promise;
      const removal = b.lib.remove(scene, b.all(), r.cx);
      release.resolve(); await Promise.all([removal, retry]);
      record({ removedBeforePublication, sourceExists: await exists(file) });
      assert.equal(removedBeforePublication, false, "deletion must wait for its already-started source publication");
      assert.equal(await exists(file), false, "publication cannot recreate the confirmed-deleted source afterwards");
      assert.equal(r.state[PLACEMENTS]?.['file:Tracked'], undefined);
    });
    await test("old-scan-preserves-new-composition", async record => {
      const r = await runtime(path.join(root, "scan-placement"), { stubs }), a = await r.home(), b = await r.home();
      const input = path.join(root, "replace.png");
      r.hooks.picked = input;
      await b.choose(r.cx);
      b.draft.name = "Reused";
      const composed = { mode: "contain", zoom: 2, x: 0.2, y: 0.8 };
      r.state[PLACEMENTS] = { "file:Reused": composed };
      b.draft.placement = composed;
      const scanned = pending(), release = pending();
      r.hooks.afterExec = async (cmd, args) => {
        if (cmd !== "sh" || !args[1].startsWith("for f")) return;
        r.hooks.afterExec = null; scanned.resolve(); await release.promise;
      };
      const old = a.lib.refresh(r.cx);
      await scanned.promise;
      await b.applyPreview(r.cx);
      release.resolve(); await old;
      assert.deepEqual(JSON.parse(JSON.stringify(r.state[PLACEMENTS]["file:Reused"])), composed, "an old scan cannot clear a newly saved composition");
      record({ newlySavedCompositionKept: true });
    });
    await test("closed-scan-cannot-prune-metadata", async record => {
      const r = await runtime(path.join(root, "closed-scan"), { stubs }), h = await r.home();
      const composed = { mode: "contain", zoom: 2, x: 0.2, y: 0.8 };
      r.state[PLACEMENTS] = { "file:Reused": composed };
      const scanned = pending(), release = pending();
      r.hooks.afterExec = async (cmd, args) => {
        if (cmd !== "sh" || !args[1].startsWith("for f")) return;
        r.hooks.afterExec = null; scanned.resolve(); await release.promise;
      };
      const old = h.lib.refresh(r.cx);
      await scanned.promise;
      h.close();
      release.resolve(); await old;
      assert.deepEqual(r.state[PLACEMENTS]["file:Reused"], composed, "a closed module cannot prune framing owned by the next module run");
      record({ closedScanIgnored: true });
    });
    await test("confirmed-delete-while-redrawing", async record => {
      const r = await runtime(path.join(root, "confirm-race"), { stubs }), h = await r.home();
      const file = path.join(r.dir, "Tracked.ans");
      await fs.writeFile(file, FRAME); await h.lib.refresh(r.cx);
      const scene = h.lib.imported[0];
      h.askRemove(scene);
      await fs.writeFile(file, FRAME + "●\n");
      const read = pending(), release = pending();
      r.hooks.afterExec = async (cmd, args) => { if (cmd === "cat" && args[0] === file) { read.resolve(); await release.promise; } };
      const conversion = h.lib.refresh(r.cx);
      await read.promise;
      assert.deepEqual(JSON.parse(JSON.stringify(h.lib.imported.map(s => [s.name, s.redrawing]))), [["Tracked", true]], "listed still while it is drawn again");
      await h.lib.remove(scene, h.all(), r.cx);
      release.resolve(); await conversion;
      record({ sourceExists: await exists(file), cacheExists: await exists(path.join(r.dir, ".tiles/Tracked")), imported: h.lib.imported.map(s => s.id) });
      assert.equal(await exists(file), false, "confirmation deletes the file while it is drawn again");
      assert.equal(h.lib.imported.length, 0, "the late conversion doesn't list it again");
      assert.equal(await exists(path.join(r.dir, ".tiles/Tracked")), false);
    });
    await test("source-changes-during-conversion", async record => {
      const r = await runtime(path.join(root, "changed"), { stubs }), h = await r.home();
      const file = path.join(r.dir, "Changing.ans");
      await fs.writeFile(file, FRAME);
      r.hooks.beforeWrite = async output => {
        if (!output.includes("/.tiles/Changing/")) return;
        r.hooks.beforeWrite = null;
        await fs.writeFile(file, FRAME + "●\n");
      };
      await h.lib.refresh(r.cx);
      assert.equal(h.lib.imported.length, 1);
      const checksum = (await run("cksum", [file])).stdout.trim().split(/\s+/).slice(0, 2).join("-");
      assert.ok(h.lib.imported[0].sum.startsWith(checksum + "-"), "only the current source can be published");
      record({ currentSourcePublished: true });
    });
    await test("delete-during-conversion", async record => {
      const r = await runtime(path.join(root, "delete-race"), { stubs }), a = await r.home(), b = await r.home();
      const file = path.join(r.dir, "Tracked.ans");
      await fs.writeFile(file, FRAME);
      await a.lib.refresh(r.cx); await b.lib.refresh(r.cx);
      r.state[KEY] = "file:Tracked";
      await fs.writeFile(file, FRAME + "●\n");
      const read = pending(), release = pending();
      r.hooks.afterExec = async (cmd, args) => {
        if (cmd === "cat" && args[0] === file) { read.resolve(); await release.promise; }
      };
      const conversion = a.lib.refresh(r.cx);
      await read.promise;
      const scene = b.lib.imported[0];
      b.askRemove(scene);
      await b.lib.remove(scene, b.all(), r.cx);
      release.resolve(); await conversion;
      record({ sourceExists: await exists(file), aImported: a.lib.imported.map(s => s.id), bImported: b.lib.imported.map(s => s.id), cacheRecreated: await exists(path.join(r.dir, ".tiles/Tracked/scene.json")), selected: r.state[KEY] });
      assert.equal(a.lib.imported.some(s => s.id === "file:Tracked"), false, "a completed old conversion must not republish a deleted import");
      assert.equal(await exists(path.join(r.dir, ".tiles/Tracked")), false, "late conversion leaves no cache");
    });
    emit();
    running = null;
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 2; });
