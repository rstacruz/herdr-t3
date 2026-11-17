// What a person sees and does with the wallpaper, in a temporary app home: pictures drawn in the theme, the + menu, dropped
// files, the framing card as it reads and opens out, modes, framing by drag, keys, wheel and trackpad, Apply, Cancel,
// reframing any picture, deletion, and work not done twice. The picture file reader is stood in for (check-source.cjs runs
// the real one); everything else is the mod's own code, with real files.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runtime, find, texts } = require("./harness.cjs");

const MOD = "asciicn-wallpaper", KEY = `${MOD}.scene`, PLACEMENTS = `${MOD}.placements`;
// A photo: its left half black, its right half white.
const W = 64, H = 32, rgba = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) { const v = i % W < W / 2 ? 0 : 255; rgba.set([v, v, v, 255], i * 4); }
const PHOTO = { width: W, height: H, rgba };
const watchdog = setTimeout(() => { console.error("wallpaper check did not finish"); process.exit(1); }, 60000);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "herdr-wallpaper-check-"));
  try {
    const reads = [];
    let hold = null, unreadable = false;
    const source = { "source.js": (m) => ({ readImage: async (from) => {
      reads.push(from);
      await hold;
      if (unreadable) throw new Error("This isn't a picture this computer can read.");
      return { pixels: PHOTO, plan: m["ascii-art.js"].imagePlan(W, H) };
    } }) };
    const base = path.join(root, "home");
    const r = await runtime(base, { stubs: source });
    const { cx, state, hooks, look, settle, dir, app } = r;
    const { toSlider } = r.modules["framing.js"];
    Object.assign(look.colours, { ansi0: "#000001", ansi15: "#fffffe", ansi7: "#c0c0c1", ansi8: "#808081" });
    const h = await r.home();
    // As Herdr, which loads a picture shortly after it is first drawn: its hidden copy then takes the picture's size. A file
    // no longer there never loads.
    const loads = (t, c = cx) => {
      for (const id of ["wallpaper-probe", "wallpaper-warm"]) {
        const box = find(t, `${id}-size`), file = find(box, `${id}-image`)?.props.path;
        if (file && existsSync(path.join(app, file))) box.handlers.on_size_change({ width: 640, height: 480 }, c);
      }
      return t;
    };
    const tree = () => loads(h.render(cx));
    const at = (id) => find(tree(), id);
    const click = (id) => at(id).handlers.on_click({}, cx);
    // The picture Home shows once the one for this theme is made and loaded.
    const shown = async (home = h, rt = r) => {
      const draw = () => loads(home.render(rt.cx), rt.cx);
      // Made for this theme at the size Home wants (pictureOf), then loaded in place of the last one.
      const now = () => { draw(); const { path, small } = home.picture ?? {}; return small ? undefined : path; };
      await rt.settle(now); await rt.settle(() => find(draw(), "wallpaper-picture")?.props.path === now()); return now();
    };
    const svgOf = async (p) => fs.readFile(path.join(app, p), "utf8");
    const ans = async () => (await fs.readdir(dir)).filter(n => n.endsWith(".ans")).sort();
    let io = 0, writes = [], cats = [];
    hooks.beforeExec = (cmd, args) => { io++; if (cmd === "cat") cats.push(args[0]); };
    hooks.beforeWrite = (file) => { io++; writes.push(file); };

    // A built-in picture is one image in the theme's colours; a new theme draws another, the old one up until it's made.
    const dark = await shown();
    assert.ok(dark && (await svgOf(dark)).includes("#cd3131"), "the built-in picture is drawn in the theme's colours");
    look.colours.ansi1 = "#aa0000";
    assert.equal(at("wallpaper-picture")?.props.path, dark, "the old picture stays up while the new one is made");
    writes = [];
    const tiles = [];
    hooks.afterRead = (file) => { if (file.includes("/scenes/")) tiles.push(file); };
    const recoloured = await shown();
    hooks.afterRead = null;
    assert.notEqual(recoloured, dark);
    assert.ok((await svgOf(recoloured)).includes("#aa0000"), "a new palette is a new picture");
    assert.equal(writes.length, 0, "a new palette colours the tiles kept on disk, writing nothing from here");
    assert.deepEqual(tiles, [], "a new palette only colours the tiles again");
    // Back to a palette seen before, though the newer one's picture took its place on disk.
    look.colours.ansi1 = "#cd3131";
    assert.equal(await shown(), dark, "the earlier palette's picture shows again");

    // With the layout's light and dark themes known, the other appearance's picture is made and loaded while this one
    // shows: a switch between them shows it in the same frame, never this one on the other's background.
    look.themes = { dark: { ...look.colours }, light: { ...look.colours, foreground: "#111111", ansi1: "#aa0000" } };
    const other = () => { const { madePicture, pictureKey } = r.modules["library.js"]; return madePicture(pictureKey(h.all()[0], { ...look.themes[look.dark ? "light" : "dark"] }, look.dark))?.path; };
    await settle(() => { tree(); return !!other() && h.loaded.has(other()); });
    const paper = other();
    look.dark = false;
    assert.equal(find(h.render(cx), "wallpaper-picture").props.path, paper, "light: its picture at once");
    await settle(() => { tree(); return !!other() && h.loaded.has(other()); });
    look.dark = true;
    assert.equal(find(h.render(cx), "wallpaper-picture").props.path, dark, "and back");
    // A picture no longer drawn, even out of sight, is no longer counted loaded: the host may let it go, and a newer palette
    // may take its file, so showing it again waits for it to load, the last picture up meanwhile.
    look.dark = false;
    find(h.render(cx), "wallpaper-picture");
    look.themes.dark = { ...look.colours, ansi1: "#00aa00" };
    await settle(() => { tree(); return !!other() && h.loaded.has(other()); });
    assert.ok(!h.loaded.has(dark), "the dark picture of the theme before is let go");
    look.themes = null;
    look.dark = true;
    assert.equal(await shown(), dark);

    // A picture's SVG declares the device pixels Home shows it at, rounded up to 512, and is named by them (Herdr rasterises
    // it at twice that). A taller window, a denser screen or a zoom past what it was made for makes it again, the last one
    // up meanwhile; a smaller window doesn't.
    const sideOf = async (p) => { const [, w, ht] = (await svgOf(p)).match(/^<svg [^>]*width="(\d+)" height="(\d+)"/); return Math.max(+w, +ht); };
    const pxOf = (p) => Number(p.match(/-(\d+)\.svg$/)?.[1]);
    // Lighthouse is 331×137: covering 1000×800 it shows 1932.8 wide.
    assert.deepEqual([pxOf(dark), await sideOf(dark)], [2048, 2048], "1x: 1932.8 device px, up to 2048");
    h.height = 600;
    assert.equal(await shown(), dark, "a smaller window keeps the picture");
    h.height = 1000;
    assert.equal(at("wallpaper-picture")?.props.path, dark, "a taller window keeps the last picture up while it's made again");
    const taller = await shown();
    assert.deepEqual([pxOf(taller), await sideOf(taller)], [2560, 2560], "1000 high: 2416 device px, up to 2560");
    h.height = 700;
    r.win.bounds = { ...r.win.bounds, x: 1440 };
    const retina = await shown();
    assert.deepEqual([pxOf(retina), await sideOf(retina)], [3584, 3584], "700 high on a 2x screen: 1691 points, 3382 device px");
    r.win.bounds = { ...r.win.bounds, x: 0 };
    assert.equal(await shown(), retina, "back on a 1x screen it keeps the sharper one");
    h.height = 4000;
    assert.equal(pxOf(await shown()), 4096, "never past 4096, the size before");
    // A screen it hasn't seen is asked about again.
    r.win.screens = [...r.win.screens, [2880, 0, 1440, 900, 3]];
    r.win.bounds = { ...r.win.bounds, x: 2880 };
    h.height = 800;
    assert.equal(h.screenScale(cx), null, "a screen not known yet waits for its scale");
    await settle(() => h.screenScale(cx) === 3);
    r.win.bounds = { ...r.win.bounds, x: 0 };
    const largest = await shown();
    assert.equal((await fs.readdir(path.join(dir, ".builtin/lighthouse"))).filter((n) => /^dark-.*\.svg$/.test(n)).length, 1, "one picture per side on disk");

    // Switching to a picture not made yet keeps the last one up until the new one is ready.
    state[KEY] = "ember";
    assert.equal(at("wallpaper-picture").props.path, largest, "the last picture stays up meanwhile");
    const ember = await shown();
    assert.ok(ember.includes("/ember/"), "then the new one shows");

    // A made picture shows only once it has loaded, however long that takes: until its hidden copy has a size, the last one
    // stays up. Then the new one takes its place in one frame: never neither, never both.
    state[KEY] = "nebula";
    await settle(() => find(h.render(cx), "wallpaper-probe-image"));
    await settle();
    let raw = h.render(cx);
    const pictures = (n) => !n || typeof n !== "object" ? 0 : Number(n.key === "wallpaper-picture") + n.items.reduce((sum, x) => sum + pictures(x), 0);
    assert.equal(find(raw, "wallpaper-picture").props.path, ember, "the last picture stays up while the new one loads");
    find(raw, "wallpaper-probe-size").handlers.on_size_change({ width: 0, height: 0 }, cx);
    assert.equal(find(h.render(cx), "wallpaper-picture").props.path, ember, "no size yet is not loaded");
    find(raw, "wallpaper-probe-size").handlers.on_size_change({ width: 640, height: 480 }, cx);
    raw = h.render(cx);
    assert.ok(find(raw, "wallpaper-picture").props.path.includes("/nebula/"), "loaded, the new picture shows");
    assert.equal(pictures(raw), 1, "in the last one's place");
    assert.equal(find(raw, "wallpaper-probe-image"), undefined);
    state[KEY] = "ember";
    await shown();
    delete state[KEY];
    await shown();

    // The switcher: ‹ name › frame +, nothing greyed out to hold a place; framing works for a built-in picture too.
    assert.equal(at("wallpaper-remove"), undefined, "deleting isn't on the switcher");
    for (const id of ["wallpaper-back", "wallpaper-next", "wallpaper-frame", "wallpaper-add"]) assert.ok(at(id).handlers.on_click, `${id} works`);
    // As the layout's other ghost buttons (pane header, Files, sidebar), hovering one leaves the pointer as it is.
    const hand = (id) => "cursor_pointer" in at(id).props;
    for (const id of ["wallpaper-back", "wallpaper-next", "wallpaper-frame", "wallpaper-add"]) assert.ok(!hand(id), `${id} keeps the pointer`);

    // + opens this mod's menu as a popup above it; its rows send the pick back to this Home.
    at("wallpaper-add").handlers.on_mouse_down({ bounds: { x: 900, y: 760, width: 24, height: 24 } }, cx);
    click("wallpaper-add");
    const menu = r.overlays.at(-1);
    assert.equal(menu.mod, MOD);
    assert.equal(menu.kind, "popup");
    assert.ok(menu.at.y + menu.height <= 760, "the menu opens above +");
    r.view.props = { ...menu.props, overlay: "o1" };
    const Mod = r.modules["main.js"].default, m = new Mod();
    m.init({}, cx);
    const rows = m.render(cx);
    assert.deepEqual(texts(rows), ["Choose image…", "Open wallpaper folder"], "the menu: an image, or the folder");
    hooks.picked = "/photos/Coast.png";
    find(rows, "wallpaper-menu-image").handlers.on_click({}, cx);
    const [sent] = r.runs.at(-1);
    assert.ok(sent.startsWith(`${MOD}.`), "the pick goes to the mod's commands");
    m.close();
    assert.ok(state[`${MOD}.menuClosed`] > 0, "closing stamps the menu closed, for + to toggle");
    r.view.props = null;

    // Choosing reads the picture; the card shows only its name until it's drawn, its footer already in place. A wait under
    // 150 ms shows nothing; past that, progress, kept on screen at least 300 ms.
    const sleep = (ms) => new Promise(go => setTimeout(go, ms));
    let release;
    hold = new Promise(go => { release = go; });
    const choosing = h.command(sent.slice(MOD.length + 1), cx);
    await settle(() => reads.length === 1);
    let card = at("wallpaper-card");
    assert.ok(card, "the card takes the switcher's place");
    assert.equal(at("wallpaper-switcher"), undefined);
    assert.equal(card.props.bottom, 12);
    assert.equal(find(card, "wallpaper-zoom"), undefined, "no framing controls while reading");
    assert.equal(find(card, "wallpaper-progress"), undefined, "nothing says it is waiting before 150 ms");
    assert.ok(find(card, "wallpaper-apply") && !find(card, "wallpaper-apply").handlers.on_click, "Apply stands where it will be, not yet pressable");
    assert.equal(card.items.at(-1).key, "wallpaper-card-footer", "the footer ends the card");
    await sleep(200);
    card = at("wallpaper-card");
    assert.ok(find(card, "wallpaper-progress"), "a longer wait shows progress");
    assert.ok(texts(card).some(s => /Reading/.test(s)), "and says it is reading");
    release(); hold = null;
    await choosing;
    let d = h.draft;
    assert.equal(d.phase, "ready");
    assert.ok(find(at("wallpaper-card"), "wallpaper-progress"), "progress that showed doesn't vanish at once");
    await sleep(350);
    card = at("wallpaper-card");
    assert.equal(find(card, "wallpaper-progress"), undefined, "it goes once it has shown long enough");
    assert.equal(card.props.bottom, 12);
    assert.equal(card.items.at(-1).key, "wallpaper-card-footer", "opened out upward, the footer stays where it was");
    assert.ok(find(card, "wallpaper-zoom") && find(card, "wallpaper-styles") && find(card, "wallpaper-apply").handlers.on_click);
    assert.equal(find(card, "wallpaper-card-name").items.join(""), "Coast", "the name heads the card");
    assert.match(d.text, /image-v4;dots/, "new pictures start in Dots");
    const preview = await shown();
    assert.ok(preview?.includes("/.preview/"), "the preview is drawn the same way, from its own folder");
    assert.equal(state[KEY], undefined);
    assert.deepEqual(await ans(), []);

    // A mode that can't be drawn goes back to the one before and says why, in the footer.
    hooks.beforeWrite = (file) => { if (/\.preview\//.test(file)) throw new Error("No room left"); };
    await h.setStyle("braille", cx);
    hooks.beforeWrite = (file) => { io++; writes.push(file); };
    assert.equal(h.draft.style, "dots", "the mode goes back");
    assert.equal(h.draft.phase, "ready");
    assert.match(texts(at("wallpaper-card-status")).join(""), /No room left/);

    // While a mode draws, the last one stays up, faded a little, and says so once it takes a while.
    let gate;
    const shownBefore = at("wallpaper-picture").props.path;
    hooks.beforeWrite = async (file) => { io++; writes.push(file); if (/\.preview\//.test(file)) await gate; };
    gate = new Promise(go => { release = go; });
    const drawing2 = h.setStyle("blocks", cx);
    assert.equal(at("wallpaper-picture").props.path, shownBefore, "the last mode stays up");
    assert.doesNotMatch(texts(at("wallpaper-card-status")).join(""), /Drawing/, "nothing says so before 150 ms");
    await sleep(200);
    assert.equal(at("wallpaper-picture").props.path, shownBefore, "still up while drawing");
    assert.match(texts(at("wallpaper-card-status")).join(""), /Drawing Blocks/);
    assert.ok(find(at("wallpaper-styles"), "wallpaper-style-spinner"), "the mode being drawn spins");
    release();
    await drawing2;
    hooks.beforeWrite = (file) => { io++; writes.push(file); };
    await sleep(350);
    await shown();
    assert.notEqual(at("wallpaper-picture").props.path, shownBefore, "then the new mode replaces it");
    assert.doesNotMatch(texts(at("wallpaper-card-status")).join(""), /Drawing/);
    await h.setStyle("dots", cx);

    // Modes redraw the same pixels; a quick new choice replaces unfinished work; a mode drawn before comes back for free.
    for (const style of ["braille", "blocks", "quadrants", "dots"]) {
      await h.setStyle(style, cx);
      assert.match(h.draft.text, new RegExp(`image-v4;${style}`));
      assert.equal(h.draft.message, null, "a drawing clears what went wrong before");
    }
    await Promise.all(["braille", "blocks", "quadrants"].map(s => h.setStyle(s, cx)));
    assert.match(h.draft.text, /image-v4;quadrants/, "the last choice wins");
    assert.equal(h.draft.phase, "ready");
    assert.equal(reads.length, 1, "switching modes never reads the picture file again");
    assert.deepEqual(await ans(), [], "nor saves a drawing");
    io = 0;
    await h.setStyle("braille", cx);
    assert.match(h.draft.text, /image-v4;braille/);
    assert.equal(io, 0, "a mode drawn before shows again without drawing");
    at("wallpaper-style-braille").handlers.on_key_down({ key: "right", modifiers: {} }, cx);
    await settle(() => h.draft.phase === "ready" && /image-v4;blocks/.test(h.draft.text));
    assert.match(h.draft.text, /image-v4;blocks/, "arrow keys move along the modes");

    // On paper: in a light theme the photo's dark half carries the marks, in a dark theme its bright half.
    const inks = async () => { const s = await svgOf(await shown()); return [s.includes("#fffffe"), s.includes("#000001")]; };
    assert.deepEqual(await inks(), [true, false], "dark theme: the white half is drawn");
    look.dark = false;
    assert.deepEqual(await inks(), [false, true], "light theme: the black half is drawn");
    look.dark = true;
    const unzoomed = await shown();

    // Framing: Fill/Fit, drag, keys, the zoom buttons, slider, wheel and trackpad, and Reset, converting nothing: zooming in
    // only colours the kept tiles again at a larger size.
    await settle();
    cats = []; writes = [];
    for (const id of ["wallpaper-cover", "wallpaper-style-dots", "wallpaper-zoom-in", "wallpaper-zoom-out"]) assert.ok(!hand(id), `${id} keeps the pointer`);
    assert.ok(hand("wallpaper-apply") && hand("wallpaper-cancel"), "the footer's filled buttons take the hand, as the layout's dialogs'");
    click("wallpaper-contain");
    const geometry = () => at(`wallpaper-at:${at("wallpaper-picture").props.path}`).props;
    const sceneRatio = h.draft.scene.width / h.draft.scene.height;
    assert.ok(Math.abs(geometry().w - 1000) < 1e-6 && Math.abs(geometry().h - 1000 / sceneRatio) < 1e-6, "Fit shows the whole picture");
    const canvas = () => at("wallpaper-compose");
    // A drag follows the pointer move after move, not only its first step.
    canvas().handlers.on_mouse_down({ position: { x: 300, y: 300 } }, cx);
    canvas().handlers.on_mouse_move({ position: { x: 300, y: 290 } }, cx);
    const stepped = h.draft.placement.y;
    canvas().handlers.on_mouse_move({ position: { x: 300, y: 250 } }, cx);
    assert.ok(h.draft.placement.y < stepped, `a drag keeps moving the picture after its first step (${stepped} → ${h.draft.placement.y})`);
    canvas().handlers.on_mouse_up({}, cx);
    canvas().handlers.on_mouse_down({ position: { x: 300, y: 300 } }, cx);
    canvas().handlers.on_mouse_move({ position: { x: 300, y: 2000 } }, cx);
    canvas().handlers.on_mouse_up({}, cx);
    assert.equal(h.draft.placement.y, 1, "dragging stops at the edge");
    // Let go outside the window, or with the window no longer in front, no release comes: the drag ends once that's seen.
    canvas().handlers.on_mouse_down({ position: { x: 300, y: 300 }, bounds: { x: 0, y: 0, width: 1000, height: 800 } }, cx);
    r.win.active = false;
    r.ticks();
    r.win.active = true;
    canvas().handlers.on_mouse_move({ position: { x: 300, y: 100 } }, cx);
    assert.equal(h.draft.placement.y, 1, "a drag the window let go of moves nothing");
    canvas().handlers.on_key_down({ key: "up", modifiers: {} }, cx);
    assert.ok(h.draft.placement.y < 1, "arrow keys move it");
    click("wallpaper-zoom-in");
    near(h.draft.placement.zoom, 1.25, "+ steps to the next preset");
    near(h.scale.value(), toSlider(1.25), "the slider follows");
    assert.equal(texts(at("wallpaper-zoom-value")).join(""), "125%");
    canvas().handlers.on_key_down({ key: "-", key_char: "-", modifiers: {} }, cx);
    near(h.draft.placement.zoom, 1, "- steps back");
    h.scale.handlers.change(toSlider(2), cx);
    near(h.draft.placement.zoom, 2, "the slider is logarithmic: halfway is 2×");
    h.scale.handlers.change(99, cx);
    assert.equal(h.draft.placement.zoom, 4, "zoom stops at 4×");
    assert.ok(pxOf(await shown()) > pxOf(unzoomed), "zoomed in, the picture is made again sharper");
    h.setPlacement(h.draft, { zoom: 1 }, cx);
    const wheel = (o) => canvas().handlers.on_scroll_wheel({ delta: { x: 0, y: 0 }, touch_phase: "moved", modifiers: {}, position: { x: 500, y: 400 }, ...o }, cx);
    wheel({ delta: { x: 0, y: 60 }, delta_lines: { x: 0, y: 6 } });
    near(h.draft.placement.zoom, 2, "6 notches of a wheel double the zoom");
    near(h.scale.value(), toSlider(2), "and the slider moves with it");
    h.setPlacement(h.draft, { y: 0.5 }, cx);
    wheel({ delta: { x: 0, y: -40 } });
    near(h.draft.placement.y, 0.7, "a trackpad pans with the fingers: 40 px up of the 200 px to spare");
    assert.equal(h.draft.placement.zoom, 2);
    wheel({ delta: { x: 0, y: -200 }, modifiers: { platform: true } });
    near(h.draft.placement.zoom, 1, "⌘-scroll zooms");
    h.setPlacement(h.draft, { zoom: 3, x: 0.1, y: 0.9 }, cx);
    click("wallpaper-reset");
    assert.deepEqual({ ...h.draft.placement }, { mode: "contain", zoom: 1, x: 0.5, y: 0.5 }, "Reset goes back to 1×, the subject in view, and keeps Fit");
    assert.equal(at("wallpaper-reset").handlers.on_click, undefined, "Reset rests while there is nothing to reset");
    assert.deepEqual([reads.length, cats, writes], [1, [], []], "framing reads, converts and saves nothing");
    h.setPlacement(h.draft, { zoom: 2, x: 0.25 }, cx);

    // Cancel leaves no trace; Apply saves one drawing, its framing and the selection, reusing the preview's picture.
    const kept = { ...h.draft.placement };
    canvas().handlers.on_key_down({ key: "escape", modifiers: {} }, cx);
    await settle(() => h.draft === null);
    await settle();
    assert.deepEqual(await fs.readdir(path.join(dir, ".preview")), []);
    await h.choose(cx);
    h.setPlacement(h.draft, kept, cx);
    const drawn = await svgOf(await shown());
    cats = []; writes = [];
    // Pressed, Apply leaves nothing on the card that looks pressable, as none would act while it saves; only its words wait
    // 150ms to read Applying….
    let saved_; const saving = new Promise(go => { saved_ = go; });
    hooks.beforeWrite = async (file) => { io++; writes.push(file); if (file.includes("/.preview/save-")) await saving; };
    const applying = h.applyPreview(cx);
    const pressed = h.render(cx), { DISABLED } = r.modules["button.js"];
    for (const id of ["wallpaper-style-dots", "wallpaper-cover", "wallpaper-contain", "wallpaper-zoom-in", "wallpaper-cancel", "wallpaper-apply"]) {
      assert.ok(!find(pressed, id).handlers.on_click && find(pressed, id).props.opacity === DISABLED, `${id} shows disabled at once`);
    }
    assert.equal(texts(find(pressed, "wallpaper-apply")).join(""), "Apply");
    saved_();
    hooks.beforeWrite = (file) => { io++; writes.push(file); };
    await applying;
    assert.equal(h.draft, null);
    assert.deepEqual(await ans(), ["Coast.ans"]);
    assert.equal(state[KEY], "file:Coast");
    assert.deepEqual({ ...state[PLACEMENTS]["file:Coast"] }, kept);
    assert.deepEqual(cats.filter(f => f.endsWith("Coast.ans")), [], "Apply doesn't convert the drawing again");
    assert.equal(writes.filter(f => f.endsWith(".svg") || /\.stage-/.test(f)).length, 0, "nor draws its picture again");
    assert.equal(at("wallpaper-compose"), undefined, "a saved picture can't be dragged");
    assert.equal(at("wallpaper-switcher").props.opacity, 1, "the switcher shows the new name for a moment");
    assert.ok(texts(at("wallpaper-switcher")).includes("Coast"));
    const saved = await shown();
    assert.ok(saved?.includes("/.tiles/Coast/"), "the saved picture is drawn from its own cache");
    assert.equal(await svgOf(saved), drawn, "the same picture the preview showed");
    h.width = 600;
    const at600 = at(`wallpaper-at:${saved}`).props;
    assert.ok(Math.abs(at600.w - 1200) < 1e-6, "saved Fit at 2× recomputes for a narrower Home");
    h.width = 1000;
    state[PLACEMENTS]["file:Coast"] = { mode: "nonsense", zoom: Infinity, x: -2, y: 3 };
    assert.equal(at(`wallpaper-at:${saved}`).props.bottom, 0, "nonsense framing falls back to bounded values");
    state[PLACEMENTS]["file:Coast"] = kept;

    // The next run of the app shows a saved picture from disk, converting and writing nothing.
    const again = await runtime(base, { stubs: source });
    Object.assign(again.look.colours, look.colours);
    Object.assign(again.state, state);
    const cats2 = [], writes2 = [];
    again.hooks.beforeExec = (cmd, args) => { if (cmd === "cat") cats2.push(args[0]); };
    again.hooks.beforeWrite = (file) => { writes2.push(file); };
    const h2 = await again.home();
    assert.equal(await shown(h2, again), saved, "the picture on disk is shown again");
    assert.deepEqual([cats2.filter(f => f.endsWith(".ans")), writes2], [[], []], "without converting or writing");
    // A new palette after a restart only colours the tiles kept on disk beside the picture, uncoloured, one per side: the
    // .ans isn't converted again.
    const ansi15 = again.look.colours.ansi15;
    again.look.colours.ansi15 = "#00aa01";
    const restarted = await shown(h2, again);
    assert.ok(restarted !== saved && (await svgOf(restarted)).includes("#00aa01"), "a new palette, a new picture");
    assert.deepEqual(cats2.filter(f => f.endsWith(".ans")), [], "without converting again");
    again.look.colours.ansi15 = ansi15;
    assert.equal(await shown(h2, again), saved);
    const kept2 = (await fs.readdir(path.join(dir, ".tiles/Coast"))).filter(n => !n.endsWith(".svg") && n !== "scene.json");
    assert.ok(kept2.length >= 1 && kept2.length <= 2, `at most one set of tiles per side: ${kept2}`);
    h2.close();

    // Reframing a saved image opens its framing over the same picture, without modes, and saves only framing.
    click("wallpaper-frame");
    await settle(() => h.draft?.phase === "ready");
    d = h.draft;
    assert.deepEqual({ ...d.placement }, kept, "it opens where it was left");
    near(h.scale.value(), toSlider(2), "the slider shows its zoom");
    assert.equal(await shown(), saved, "nothing is converted again");
    assert.equal(at("wallpaper-styles"), undefined, "a saved picture keeps its mode: no mode row");
    assert.ok(at("wallpaper-delete")?.handlers.on_click, "an added picture can be deleted from here");
    assert.deepEqual(texts(at("wallpaper-delete")), ["Delete"], "named as the layout names what a confirm dialog asks about, without …");
    h.setPlacement(d, { zoom: 3 }, cx);
    at("wallpaper-compose").handlers.on_key_down({ key: "enter", modifiers: {} }, cx);
    await settle(() => h.draft === null);
    assert.deepEqual(await ans(), ["Coast.ans"], "no second drawing");
    assert.equal(state[PLACEMENTS]["file:Coast"].zoom, 3);

    // A built-in picture reframes the same way, keeps its framing, and has nothing to delete.
    state[KEY] = "lighthouse";
    click("wallpaper-frame");
    await settle(() => h.draft?.phase === "ready");
    assert.equal(at("wallpaper-delete"), undefined, "a built-in picture can't be deleted");
    assert.equal(at("wallpaper-styles"), undefined);
    h.setPlacement(h.draft, { zoom: 1.5 }, cx);
    await h.applyPreview(cx);
    assert.equal(state[PLACEMENTS].lighthouse.zoom, 1.5, "a built-in picture's framing is saved under its id");
    assert.equal(state[KEY], "lighthouse");
    await h.lib.refresh(cx);
    assert.equal(state[PLACEMENTS].lighthouse?.zoom, 1.5, "and a rescan of the folder keeps it");

    // Dropped on Home: an image previews as one chosen.
    at("wallpaper").handlers.on_drop({ paths: ["/photos/Dropped.jpg", "/photos/Other.jpg"] }, cx);
    await settle(() => h.draft?.phase === "ready");
    assert.equal(h.draft.name, "Dropped");
    assert.ok(h.draft.pixels, "a dropped image is drawn in a mode");
    await h.cancelPreview(cx);

    // An unreadable picture: the card says why, offers another, and closes.
    unreadable = true;
    hooks.picked = "/photos/Broken.png";
    await h.choose(cx);
    unreadable = false;
    card = at("wallpaper-card");
    assert.ok(texts(card).some(s => /can read/.test(s)), "the reason shows");
    assert.equal(texts(find(card, "wallpaper-card-status")).length, 0, "once, not again in the footer");
    assert.equal(find(card, "wallpaper-zoom"), undefined);
    assert.equal(card.items.at(-1).key, "wallpaper-card-footer");
    find(card, "wallpaper-choose-another").handlers.on_click({}, cx);
    await settle(() => h.draft?.name === "Broken" && h.draft.phase === "ready");
    await h.cancelPreview(cx);

    // Apply while a mode is drawing waits for it, then saves that mode.
    hooks.picked = "/photos/Wait.png";
    await h.choose(cx);
    const drawing = h.setStyle("quadrants", cx);
    await h.applyPreview(cx);
    await drawing;
    await settle(() => h.draft === null);
    assert.match(await fs.readFile(path.join(dir, "Wait.ans"), "utf8"), /image-v4;quadrants/, "the mode chosen last is the one saved");

    // Another Home's file under the same name is never overwritten: the preview stays, the error in the footer, Apply retryable.
    hooks.picked = "/photos/Coast.png";
    await h.choose(cx);
    // Another Home's picture, made here as every one is.
    const othersFrame = "\x1b]777;asciicn-wallpaper;image-v4;dots\x07\x1b[38;2;200;150;220m●\x1b[0m\n";
    hooks.beforeExec = async (cmd, args) => { if (cmd === "link" && args[1].endsWith(".ans")) await fs.writeFile(args[1], othersFrame); };
    await h.applyPreview(cx);
    hooks.beforeExec = null;
    assert.equal(await fs.readFile(path.join(dir, "Coast 2.ans"), "utf8"), othersFrame);
    assert.equal(h.draft.phase, "ready");
    assert.match(texts(at("wallpaper-card-status")).join(""), /exists/);
    assert.equal(state[KEY], "file:Wait");
    await h.applyPreview(cx);
    assert.equal(state[KEY], "file:Coast 3", "a retry takes the next free name");

    // Cancelling while progress shows takes it away with the card.
    hold = new Promise(go => { release = go; });
    const slow = h.startPreview("/photos/Slow.png", "Slow", cx);
    await settle(() => reads.at(-1) === "/photos/Slow.png");
    tree();
    await sleep(200);
    assert.ok(find(at("wallpaper-card"), "wallpaper-progress"));
    await h.cancelPreview(cx);
    assert.equal(at("wallpaper-card"), undefined);
    assert.equal(at("wallpaper-progress"), undefined, "no progress is left behind");
    assert.equal(at("wallpaper-wait"), undefined);
    release(); hold = null;
    await slow;

    // A slow picture can't replace a newer choice, nor reopen a cancelled one.
    hold = new Promise(go => { release = go; });
    const old = h.startPreview("/photos/Old.png", "Old", cx);
    await settle(() => reads.at(-1) === "/photos/Old.png");
    const latest = h.startPreview("/photos/New.png", "New", cx);
    release(); hold = null;
    await Promise.all([old, latest]);
    assert.equal(h.draft.name, "New");
    hold = new Promise(go => { release = go; });
    const late = h.startPreview("/photos/Late.png", "Late", cx);
    await settle(() => reads.at(-1) === "/photos/Late.png");
    await h.cancelPreview(cx);
    release(); hold = null;
    await late;
    assert.equal(h.draft, null);
    assert.deepEqual(await fs.readdir(path.join(dir, ".preview")), [], "and leaves no files");

    // A cancelled dialog says nothing.
    const said = r.messages.length;
    hooks.picked = null;
    await h.choose(cx);
    assert.equal(h.draft, null);
    assert.equal(r.messages.length, said);

    // An edited picture is drawn again; meanwhile Home keeps it under its own name, and framing waits, so it can't frame or
    // save another picture as the choice.
    state[KEY] = "file:Coast";
    const coastShown = await shown();
    const tilesKept = async () => (await fs.readdir(path.join(dir, ".tiles/Coast"))).filter(n => n.endsWith(".tpl"));
    const tilesBefore = await tilesKept();
    let drawn_; const redrawn = new Promise(go => { drawn_ = go; });
    hooks.beforeWrite = async (file) => { io++; writes.push(file); if (file.endsWith("/scene.json")) await redrawn; };
    await fs.appendFile(path.join(dir, "Coast.ans"), "\n");
    const redrawing = h.lib.refresh(cx);
    await settle(() => h.lib.importing === "Coast");
    await settle(null, 200);
    tree();
    const mid = tree();
    assert.equal(find(mid, "wallpaper-picture").props.path, coastShown, "Home keeps the picture while it's drawn again");
    assert.ok(texts(find(mid, "wallpaper-switcher")).some(s => s.includes("Coast")), "under its name");
    assert.equal(find(mid, "wallpaper-frame").handlers.on_click, undefined, "framing waits for it");
    drawn_();
    hooks.beforeWrite = (file) => { io++; writes.push(file); };
    await redrawing;
    assert.equal(state[KEY], "file:Coast");
    assert.ok((await shown()).includes("/Coast/"), "then the new drawing shows");
    const tilesAfter = await tilesKept();
    assert.ok(tilesBefore.length === 1 && tilesAfter.length === 1 && tilesAfter[0] !== tilesBefore[0], "an edited file's kept tiles are made again");

    // A new draft leaves the last picture where it was until the draft's own picture has loaded.
    state[KEY] = "lighthouse";
    state[PLACEMENTS] = { ...state[PLACEMENTS], lighthouse: { mode: "cover", zoom: 3, x: 0.2, y: 0.8 } };
    await shown();
    const geometry2 = (t) => { const p = find(t, "wallpaper-picture").props.path, g = find(t, `wallpaper-at:${p}`).props; return [p, g.w, g.h, g.bottom, g.left]; };
    const lit = geometry2(h.render(cx));
    find(h.render(cx), "wallpaper").handlers.on_drop({ paths: ["/photos/New.png"] }, cx);
    await settle(() => h.draft?.phase === "ready");
    assert.deepEqual(geometry2(h.render(cx)), lit, "the last picture keeps its own framing");
    await h.cancelPreview(cx);
    delete state[PLACEMENTS].lighthouse;

    // Deleting asks by name first; a failed deletion changes nothing, a confirmed one moves the selection back.
    state[KEY] = "file:Coast";
    const coast = h.lib.imported.find(s => s.name === "Coast");
    click("wallpaper-frame");
    await settle(() => h.draft?.phase === "ready");
    io = 0;
    hooks.beforeExec = () => { io++; };
    click("wallpaper-delete");
    assert.equal(io, 0, "asking does nothing to the files");
    assert.match(r.overlays.at(-1).props.title, /Coast/);
    await h.cancelPreview(cx);
    hooks.beforeExec = async (cmd, args) => { if (cmd === "sh" && args[1].startsWith("rm -f")) await fs.chmod(dir, 0o500); };
    assert.equal(await h.lib.remove(coast, h.all(), cx), false);
    await fs.chmod(dir, 0o700);
    hooks.beforeExec = null;
    assert.equal(state[KEY], "file:Coast", "a failed deletion keeps the selection");
    assert.ok(h.lib.imported.includes(coast));
    assert.ok(await h.lib.remove(coast, h.all(), cx));
    await assert.rejects(fs.stat(path.join(dir, "Coast.ans")));
    assert.notEqual(state[KEY], "file:Coast");
    assert.equal(state[PLACEMENTS]["file:Coast"], undefined, "its framing goes too");

    // On Windows, with no file dialog, the menu is the folder alone; an image arrives by dropping it on Home.
    const win = await runtime(path.join(root, "win"), { stubs: source, platform: "windows" });
    win.view.props = { menu: "add", token: "t" };
    const wm = new (win.modules["main.js"].default)();
    wm.init({}, win.cx);
    const winRows = wm.render(win.cx);
    assert.deepEqual(texts(winRows), ["Open wallpaper folder"]);
    assert.ok(find(winRows, "wallpaper-menu-folder").handlers.on_click, "its one row opens the folder");

    console.log("ok: wallpaper pictures, + menu, drops, the framing card, modes, paper, framing, Apply/Cancel, reframing, deletion, no work twice.");
  } finally {
    clearTimeout(watchdog);
    await fs.chmod(root, 0o700).catch(() => null);
    // A picture a last render asked for may still be landing.
    await new Promise(go => setTimeout(go, 300));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
