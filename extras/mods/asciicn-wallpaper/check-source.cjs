// A real picture file through source.js on macOS (sips, ImageIO): a phone photo stored sideways comes out upright, and
// whatever its size or shape, the draft is the plan's sample grid, every row of it. Elsewhere, or without ImageMagick to make the photos, it says so and passes.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { runtime } = require("./harness.cjs");

const has = (cmd) => { try { execFileSync("sh", ["-c", `command -v ${cmd}`]); return true; } catch { return false; } };
if (process.platform !== "darwin" || !has("magick")) {
  console.log("skipped: picture files are read with sips on macOS, and made here with ImageMagick");
  process.exit(0);
}

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "herdr-wallpaper-source-"));
  try {
    const r = await runtime(root), { imagePlan } = r.modules["ascii-art.js"], { readImage } = r.modules["source.js"];
    const read = async (file) => {
      const dir = path.join(root, "draft");
      await fs.mkdir(dir, { recursive: true });
      return readImage(file, dir, r.cx, () => true);
    };
    const colour = ({ pixels }, x, y) => [...pixels.rgba.slice((y * pixels.width + x) * 4, (y * pixels.width + x) * 4 + 3)];
    // 80×40 stored, red on the left; tagged "rotate 90° clockwise to view" (6), so it is 40×80 with red on top.
    // ImageMagick writes the tag into a TIFF, as a camera does into its JPEGs; ImageIO reads both the same way.
    const sideways = path.join(root, "sideways.tif");
    execFileSync("magick", ["-size", "40x40", "xc:red", "-size", "40x40", "xc:blue", "+append", "-orient", "RightTop", sideways]);
    const upright = await read(sideways);
    assert.equal(upright.plan.columns, imagePlan(40, 80).columns, "a sideways photo is planned upright");
    const [top, bottom] = [colour(upright, upright.pixels.width >> 1, 2), colour(upright, upright.pixels.width >> 1, upright.pixels.height - 3)];
    assert.ok(top[0] > 200 && top[2] < 60 && bottom[2] > 200 && bottom[0] < 60, `red comes out on top, blue below: ${top} / ${bottom}`);
    // Every EXIF orientation, mirrors included, comes out as ImageMagick's -auto-orient shows it: each corner its colour.
    const ORIENT = ["TopLeft", "TopRight", "BottomRight", "BottomLeft", "LeftTop", "RightTop", "RightBottom", "LeftBottom"];
    for (const [i, tag] of ORIENT.entries()) {
      const file = path.join(root, `orient-${i + 1}.tif`);
      execFileSync("magick", ["-size", "60x30", "xc:red", "-fill", "lime", "-draw", "rectangle 30,0 59,14", "-fill", "blue", "-draw", "rectangle 0,15 29,29",
        "-fill", "white", "-draw", "rectangle 30,15 59,29", "-orient", tag, file]);
      const want = execFileSync("magick", [file, "-auto-orient", "-format", "%w %h %[pixel:p{1,1}] %[pixel:p{%[fx:w-2],%[fx:h-2]}]", "info:"]).toString().split(" ");
      const got = await read(file), px = got.pixels, name = ([r, g, b]) => r > 200 && g > 200 ? "white" : r > 200 ? "red" : g > 200 ? "lime" : "blue";
      assert.equal(got.plan.columns, imagePlan(Number(want[0]), Number(want[1])).columns, `orientation ${i + 1} is planned upright`);
      assert.deepEqual([name(colour(got, 1, 1)), name(colour(got, px.width - 2, px.height - 2))],
        [want[2], want[3]].map(c => c.includes("255,255,255") ? "white" : /\(255,0,0|red/.test(c) ? "red" : /\(0,255,0|lime/.test(c) ? "lime" : "blue"), `orientation ${i + 1}'s corners`);
    }
    const plain = path.join(root, "plain.png");
    execFileSync("magick", ["-size", "40x40", "xc:red", "-size", "40x40", "xc:blue", "+append", plain]);
    assert.equal((await read(plain)).plan.columns, imagePlan(80, 40).columns, "an upright one is read as it is");
    // A tall photo stored sideways, cropped at its ends (narrower than 1:12), and a big picture: each the plan's grid, every row there.
    const tall = path.join(root, "tall.tif");
    execFileSync("magick", ["-size", "150x2400", "gradient:white-black", "-rotate", "-90", "-orient", "RightTop", tall]);
    for (const [file, w, h] of [[tall, 150, 2400], [path.join(root, "big.png"), 6000, 2000]]) {
      if (file.endsWith("big.png")) execFileSync("magick", ["-size", "6000x2000", "gradient:white-black", file]);
      const got = await read(file), plan = imagePlan(w, h);
      assert.deepEqual([got.pixels.width, got.pixels.height], [plan.columns * 2, plan.rows * 4], `${path.basename(file)} is drawn from the sample grid`);
      assert.ok(colour(got, 0, got.pixels.height - 1)[0] < 60, `${path.basename(file)}'s last row arrived`);
    }
    assert.deepEqual((await fs.readdir(path.join(root, "draft"))), [], "nothing is left in the draft folder");
    console.log("ok: picture files are read upright, whole, and leave nothing behind.");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
