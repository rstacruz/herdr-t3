// Loads ascii-art.js: images drawn in each mode, the frames saved for them converted to tinted tiles, anything else refused.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const src = fs.readFileSync(path.join(__dirname, "ascii-art.js"), "utf8").replace(/^export (function\*?|const) /gm, "$1 ")
  + "\nglobalThis.art = { convert, picture, tintOf, imageGrid, decodeBmp, imageAns, imagePlan: typeof imagePlan === 'function' ? imagePlan : null, sampleImage: typeof sampleImage === 'function' ? sampleImage : null };";
const context = vm.createContext({});
vm.runInContext(src, context);
const { convert, picture, tintOf, imageGrid, decodeBmp, imageAns, imagePlan, sampleImage } = context.art;

// All of a conversion: the tiles and what it returns.
function run(text, paper) {
  const it = convert(text, paper), tiles = [];
  for (;;) {
    const step = it.next();
    if (step.done) return { tiles, ...step.value };
    if (step.value) tiles.push(step.value);
  }
}
const count = (svg, s) => svg.split(s).length - 1;
const E = (codes) => `\x1b[${codes}m`;
const markOf = (style) => `\x1b]777;asciicn-wallpaper;image-v4;${style}\x07`;

// New images use eight brightness steps and all sixteen nearest VGA slots, not the old hue buckets.
assert.deepEqual(JSON.parse(JSON.stringify(tintOf({ rgb: [255, 255, 255] }))), { tint: "ansi15", step: 7 });

// Only a frame made here converts: an unmarked one, or one from before modes (v3), is refused, before anything is drawn.
for (const text of ["\x1b[38;2;255;0;0m⠿⣿\x1b[0m\n", "·•●\n", "\x1b]777;asciicn-wallpaper;image-v3\x07\x1b[38;2;9;9;9m●\n"]) {
  assert.throws(() => run(text), /made here/, JSON.stringify(text));
}
// Truecolor Braille: each set bit a dot, the cells half as wide as tall.
{
  const r = run(`${markOf("braille")}${E("38;2;170;0;0")}⠿⣿${E("0")}\n`);
  assert.deepEqual([r.aspect, r.width, r.height, r.paper], [0.5, 1, 1, true]);
  const [t] = r.tiles;
  assert.deepEqual({ tint: t.tint, opacity: t.opacity }, { tint: "ansi1", opacity: 0.7 }, "VGA red, its value's step");
  assert.equal(count(t.svg, "h0"), 6 + 8, "⠿ has six dots, ⣿ eight");
  assert.match(t.svg, /stroke-width="0\.17"/, "radius 0.17 cell widths, at half a cell height wide");
}
// Dense supported shapes must fit the host's 1 MiB limit for each tile write.
{
  for (const glyph of ["░", "▒", "▓", "⣿", "▟", "●"]) {
    const r = run(`${markOf("dots")}${E("38;2;255;255;255")}${`${glyph.repeat(160)}\n`.repeat(80)}`);
    assert.deepEqual([r.width, r.height], [80, 80], "tiling keeps the complete canvas");
    assert.ok(r.tiles.length > 0);
    for (const t of r.tiles) assert.ok(Buffer.byteLength(t.svg) <= 1024 * 1024, `${glyph}: ${Buffer.byteLength(t.svg)}-byte tile exceeds the native write limit`);
  }
}
// Tiles cut at 40 cell heights, the box in cell heights.
{
  const r = run(`${markOf("dots")}${E("38;2;255;255;255")}${"●".repeat(170)}\n`);
  assert.deepEqual(r.tiles.map(t => [t.x0, t.x1]), [[0, 40], [40, 80], [80, 85]]);
  assert.equal(new Set(r.tiles.map(t => t.file)).size, 3, "a name each");
}
// An image. A BMP as sips writes it (24-bit, top-down, rows padded to 4 bytes) or ImageMagick's
// bmp3 (bottom-up), here 32-bit too; pixels given top row first as [r, g, b].
const finish = (it) => { for (;;) { const s = it.next(); if (s.done) return s.value; } };
function bmp(rows, { bits = 24, topDown = true } = {}) {
  const h = rows.length, w = rows[0].length, step = bits / 8, stride = Math.ceil((bits * w) / 32) * 4, out = Buffer.alloc(54 + stride * h);
  out.write("BM"); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10); out.writeUInt32LE(40, 14);
  out.writeInt32LE(w, 18); out.writeInt32LE(topDown ? -h : h, 22); out.writeUInt16LE(1, 26); out.writeUInt16LE(bits, 28);
  rows.forEach((row, y) => row.forEach(([r, g, b], x) => {
    const at = 54 + (topDown ? y : h - 1 - y) * stride + x * step;
    out[at] = b; out[at + 1] = g; out[at + 2] = r;
  }));
  return out.toString("base64").replace(/(.{76})/g, "$1\n");
}
{
  const px = [[[255, 0, 0], [0, 255, 0], [0, 0, 255]], [[1, 2, 3], [4, 5, 6], [7, 8, 9]]];
  for (const opts of [{}, { topDown: false }, { bits: 32 }, { bits: 32, topDown: false }]) {
    const encoded = bmp(px, opts), img = finish(decodeBmp(encoded));
    assert.deepEqual([img.width, img.height], [3, 2]);
    assert.deepEqual([...img.rgba.slice(0, 4), ...img.rgba.slice(20, 24)], [255, 0, 0, 255, 7, 8, 9, 255], `top row first, ${JSON.stringify(opts)}`);
    for (const size of [1, 7, 16]) {
      const chunks = encoded.match(new RegExp(`[\\s\\S]{1,${size}}`, "g"));
      const streamed = finish(decodeBmp(chunks));
      assert.deepEqual([...streamed.rgba], [...img.rgba], `chunked base64 preserves pixels across ${size}-character boundaries`);
    }
  }
  assert.throws(() => finish(decodeBmp(Buffer.from("GIF89a").toString("base64"))), /not a BMP/);
  const complete = bmp(px, { bits: 32 }), truncated = Buffer.from(complete, "base64").subarray(0, -1).toString("base64");
  assert.throws(() => finish(decodeBmp(truncated)), /incomplete BMP/, "truncated exec output must fail, not paint missing rows black");
  assert.throws(() => finish(decodeBmp([truncated.slice(0, 7), truncated.slice(7)])), /incomplete BMP/);
  for (const [offset, value] of [[18, 0x7fffffff], [18, -1], [18, 0], [22, 0], [10, 53], [10, 0x7fffffff], [14, 124]]) {
    const forged = Buffer.from(complete, "base64");
    forged.writeInt32LE(value, offset);
    assert.throws(() => finish(decodeBmp(forged.toString("base64"))), /incomplete BMP/, `invalid header ${offset}=${value} fails before allocating RGBA`);
  }
  assert.throws(() => finish(decodeBmp(Buffer.from(complete, "base64").subarray(0, 50).toString("base64"))), /incomplete BMP/);
  const pending = decodeBmp([complete, complete]);
  assert.equal(pending.next().done, false, "the decoder yields after cleaning a chunk, before image work");
  pending.return();
  // These one-row BMPs have the same padded byte length, hence identical base64 work. Only pixel work crosses 4096.
  const wide = [];
  for (const width of [4095, 4096]) {
    const encoded = bmp([Array.from({ length: width }, () => [17, 34, 51])]);
    const it = decodeBmp(encoded);
    let yields = 0, s;
    while (!(s = it.next()).done) yields++;
    assert.equal(s.value.rgba.length, width * 4);
    assert.deepEqual([...s.value.rgba.slice(-4)], [17, 34, 51, 255]);
    wide.push({ length: encoded.length, yields });
  }
  assert.equal(wide[0].length, wide[1].length, "padding keeps the base64 decoder work equal");
  assert.equal(wide[1].yields, wide[0].yields + 1, "RGBA conversion yields at 4096 pixels, even inside one wide row");
}
console.log("ok: BMP chunks preserve pixels; incomplete/forged headers fail before RGBA allocation.");
// The image generator emits website image-cell geometry, persisted in a non-drawing OSC header.
const HEADER = /^\x1b\]777;asciicn-wallpaper;image-v\d[^\x07]*\x07/;
const plain = (text) => text.replace(HEADER, "").replace(/\x1b\[[0-9;]*m/g, "");
const pixelsOf = (rows) => finish(decodeBmp(bmp(rows)));
{
  const pixels = pixelsOf([[0, 32, 96, 160, 224, 255].map(v => [v, v, v])]);
  const text = finish(imageAns(pixels, "dots"));
  assert.ok(text.startsWith(markOf("dots")), "new image metadata, with its mode, stays in the saved .ans");
  assert.ok(text.includes(`${E("38;2;0;0;0")} `), "a blank opaque cell keeps its colour, so it can be inked on paper");
  assert.equal(run(text).aspect, 0.5, "new halftone images are half-width cells, including after reload");
  assert.equal(plain(text), " ·∙•⦁●\n", "website six-glyph dots ramp includes a blank level");
}
// Every mode starts from the same draft: the crop resized by the system to Braille's sample grid, the finest any mode takes.
assert.equal(typeof imagePlan, "function", "image import exposes the resize/crop plan");
{
  const plan = imagePlan(2756, 1654);
  assert.deepEqual([plan.columns, plan.rows, plan.width, plan.height], [320, 96, 640, 384], "the draft is the Braille sample grid");
  assert.deepEqual(JSON.parse(JSON.stringify(imageGrid(1000, 500, "dots"))), { columns: 384, rows: 96, width: 384, height: 96 });
  assert.deepEqual(JSON.parse(JSON.stringify(imageGrid(1000, 500, "quadrants"))), { columns: 384, rows: 96, width: 768, height: 192 });
  const source = pixelsOf([0, 1, 2, 3].map(() => [[255, 0, 0], [0, 0, 255]]));
  const smallPlan = { columns: 1, rows: 1, crop: { width: 2, height: 4 } };
  const dots = finish(sampleImage(source, "dots", smallPlan));
  assert.deepEqual([dots.width, dots.height, ...dots.rgba], [1, 1, 128, 0, 128, 255], "average a whole rectangular source region, half to even");
  const braille = finish(sampleImage(source, "braille", smallPlan));
  assert.deepEqual([...braille.rgba], [...source.rgba], "switching to Braille keeps the original pixels");
  assert.deepEqual([...source.rgba.slice(0, 8)], [255, 0, 0, 255, 0, 0, 255, 255], "sampling does not mutate the draft");
  source.rgba[3] = source.rgba[11] = source.rgba[19] = source.rgba[27] = 0;
  const transparent = finish(sampleImage(source, "dots", smallPlan));
  assert.deepEqual([...transparent.rgba], [0, 0, 255, 128], "transparent red contributes no hue to the opaque blue");
  assert.equal(transparent.tones[0], Math.fround(0.0722 * 0.5), "tone is unrounded average luma times coverage");
  const fractional = pixelsOf([0, 1].map(() => [0, 90, 180].map(v => [v, v, v])));
  const sampled = finish(sampleImage(fractional, "dots", { columns: 2, rows: 1, crop: { width: 3, height: 2 } }));
  assert.deepEqual([...sampled.rgba], [30, 30, 30, 255, 150, 150, 150, 255], "fractional canvas boundaries use area coverage, not nearest pixels");
  const largePlan = imagePlan(1024, 1024), large = { width: largePlan.width, height: largePlan.height, rgba: new Uint8ClampedArray(largePlan.width * largePlan.height * 4) };
  const pending = sampleImage(large, "dots", largePlan);
  assert.equal(pending.next().done, false, "expensive sampling yields before completion, so callers can cancel");
  pending.return();
}
console.log("ok: ascii-art converts website image frames and refuses any other.");

// Independent mapTones fixtures hash every glyph and visible cell's RGB, across the full 96-row image.
const oracle = require("./fixtures/image-v3-map-tones.json");
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function cellsOf(text) {
  const cells = [];
  let color = null;
  for (const token of text.replace(HEADER, "").matchAll(/\x1b\[([0-9;]*)m|([^\x1b\n])/gu)) {
    if (token[1] !== undefined) {
      const code = token[1].split(";").map(Number);
      color = code[0] === 38 ? code.slice(2) : null;
    } else cells.push([token[2], token[2] === " " ? null : color]);
  }
  return cells;
}
for (const { style, columns, rows, sha256 } of oracle.cases) {
  const [gx, gy] = { dots: [1, 1], blocks: [1, 1], quadrants: [2, 2], braille: [2, 4] }[style];
  const width = columns * gx, height = rows * gy, rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    rgba[i * 4] = Math.floor(255 * x / (width - 1));
    rgba[i * 4 + 1] = Math.floor(255 * y / (height - 1));
    rgba[i * 4 + 2] = (Math.floor(x * 8 / width) + Math.floor(y * 8 / height)) % 2 ? 220 : 20;
    rgba[i * 4 + 3] = x < width / 8 && y < height / 8 ? 0 : 255;
  }
  const text = finish(imageAns({ width, height, rgba }, style));
  assert.equal(cellsOf(text).length, columns * rows, `${style}: all cells, including blanks`);
  assert.equal(hash(cellsOf(text)), sha256, `${style}: every glyph and RGB matches upstream mapTones`);
}
for (const { rgb, ansi } of oracle.tints) assert.equal(tintOf({ rgb }).tint, `ansi${ansi}`, `${rgb}: nearest VGA in OKLab`);
for (let step = 0; step < 8; step++) {
  const v = 16 + step * 32;
  assert.equal(tintOf({ rgb: [v, 0, 0] }).step, step, "opacity uses value, not red's low luminance");
}
console.log("ok: four full image modes match upstream mapTones cell-for-cell; eight values and VGA16 match.");

{
  const bytesHash = value => crypto.createHash("sha256").update(value).digest("hex");
  const directory = path.join(__dirname, "scenes");
  const files = fs.readdirSync(directory, { recursive: true }).filter(f => fs.statSync(path.join(directory, f)).isFile()).sort();
  assert.equal(files.length, 263);
  assert.equal(bytesHash(files.map(f => f + "\0" + bytesHash(fs.readFileSync(path.join(directory, f)))).join("\n")),
    "f0825e83534e3aea2cabf0ad951aa4fd5e93dc06076e2da319e437526bab947e", "all builtin scene files are unchanged");
}
// Blank edges remain part of every mode's canvas, not a content bounding box.
for (const style of ["dots", "blocks", "quadrants", "braille"]) {
  const plan = { columns: 8, rows: 4, crop: { width: 16, height: 16 } };
  for (const value of [0, 255]) {
    const source = pixelsOf(Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => [value, value, value])));
    const text = finish(imageAns(finish(sampleImage(source, style, plan)), style)), r = run(text);
    assert.deepEqual([r.width, r.height, r.aspect], [4, 4, 0.5], `${style}: even blank images reload at the correct aspect`);
    assert.equal(cellsOf(text).length, 32);
    if (value === 0) assert.equal(r.tiles.length, 0);
    else assert.ok(r.tiles.every(t => t.tint === "ansi15" && t.opacity === 1));
  }
  const source = pixelsOf(Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => x < 8 && y < 8 ? [255, 255, 255] : [0, 0, 0])));
  const r = run(finish(imageAns(finish(sampleImage(source, style, plan)), style)));
  assert.deepEqual([r.tiles[0].x0, r.tiles[0].y0, r.tiles[0].x1, r.tiles[0].y1], [0, 0, 2, 2], `${style}: same source subject, same normalized position`);
}
for (const dimensions of [[0, 10], [10, 0], [Infinity, 10], [10, NaN], [-1, 10]]) assert.throws(() => imagePlan(...dimensions), /image dimensions/);
for (const style of ["", "other", "Braille", null, 1, {}, []]) assert.throws(() => finish(imageAns(pixelsOf([[[0, 0, 0]]]), style)), /image style/i);
{
  const pixels = pixelsOf(Array.from({ length: 2 }, (_, y) => Array.from({ length: 32 }, (_, x) => {
    const mask = Math.floor(x / 2), v = mask & (1 << (y * 2 + x % 2)) ? 255 : 0;
    return [v, v, v];
  })));
  assert.equal(plain(finish(imageAns(pixels, "quadrants"))), " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█\n", "all sixteen quadrant masks, in position order");
  pixels.tones = new Float32Array(pixels.width * pixels.height).fill(0.5);
  assert.equal(plain(finish(imageAns(pixels, "quadrants"))), "                \n", "packed threshold is strictly greater than 0.5");
  pixels.tones.fill(0.50000006);
  assert.equal(plain(finish(imageAns(pixels, "quadrants"))), "████████████████\n");
}
assert.equal(imageGrid(4000, 100).columns, 480);
assert.equal(imageGrid(100, 4000).columns, 16);
console.log("ok: blank edges and the image grid's limits; all 263 builtin scene files are unchanged.");

// Light themes draw on paper: a new image's tones turn over (blank cells become full ones) and opacity follows darkness.
{
  const tilesOf = (text, paper) => run(text, paper).tiles;
  const solid = (rgb, style) => finish(imageAns(pixelsOf([[rgb]]), style));
  for (const style of ["dots", "blocks", "quadrants", "braille"]) {
    const [gx, gy] = { dots: [1, 1], blocks: [1, 1], quadrants: [2, 2], braille: [2, 4] }[style];
    const fill = (rgb) => finish(imageAns(pixelsOf(Array.from({ length: gy }, () => Array.from({ length: gx }, () => rgb))), style));
    assert.equal(tilesOf(fill([0, 0, 0]), false).length, 0, `${style}: black is blank in the dark`);
    const ink = tilesOf(fill([0, 0, 0]), true);
    assert.ok(ink.length && ink.every(t => t.tint === "ansi0" && t.opacity === 1), `${style}: black is full ink on paper`);
    assert.equal(tilesOf(fill([255, 255, 255]), true).length, 0, `${style}: white is blank on paper`);
    assert.equal(run(fill([0, 0, 0])).paper, true, `${style}: a new image says it can be drawn on paper`);
  }
  const one = (style, glyph) => `${markOf(style)}${E("38;2;128;128;128")}${glyph}\n`;
  const svgOf = (text, paper) => tilesOf(text, paper)[0].svg;
  assert.equal(count(svgOf(one("braille", "⠁"), true), "h0"), 7, "a Braille cell's dots complement on paper");
  assert.equal(count(svgOf(one("quadrants", "▘"), true), "z"), 3, "a quadrant cell complements on paper");
  assert.equal(svgOf(one("blocks", "░"), true), svgOf(one("blocks", "▓"), false), "a shade turns over on paper");
  assert.equal(svgOf(one("dots", "·"), true), svgOf(one("dots", "⦁"), false), "a dot size turns over on paper");
  assert.equal(tilesOf(one("dots", "·"), false)[0].opacity, 0.55, "grey 128 in the dark: eight value steps");
  assert.equal(tilesOf(one("dots", "·"), true)[0].opacity, 0.4, "grey 128 on paper: eight darkness steps");
  const clear = finish(imageAns({ width: 1, height: 1, rgba: new Uint8ClampedArray([0, 0, 0, 0]) }, "dots"));
  assert.equal(tilesOf(clear, true).length, 0, "transparent cells stay empty on paper");
}
console.log("ok: new images turn over on paper.");

// One picture of every tile, each in its theme colour at its opacity, 4096px on the long edge; a new image says it is one.
{
  const { tiles, width, height } = run(`${markOf("blocks")}${E("38;2;255;255;255")}█${E("38;2;170;0;0")}▒\n`);
  const svg = picture(tiles, (tint) => ({ ansi15: "#fffffe", ansi1: "#cd3131", foreground: "#000000" })[tint], width, height);
  assert.match(svg, /^<svg [^>]*width="4096" height="4096" viewBox="0 0 1 1"/, "two half-width cells: a square");
  assert.equal(count(svg, "<svg"), 1, "the tiles are one picture");
  assert.match(svg, /stroke="#fffffe"[^>]*stroke-opacity="1"[^>]*fill-opacity="1"><path fill="#fffffe"/, "white: bright white, full");
  assert.match(svg, /stroke="#cd3131"[^>]*stroke-opacity="0.7"[^>]*fill-opacity="0.7"><path fill="#cd3131"/, "VGA red at its value's step");
  assert.ok(!svg.includes("#000\""), "no tile keeps its placeholder ink");
  console.log("ok: tiles become one theme-coloured picture.");
}
