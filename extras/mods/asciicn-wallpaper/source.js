// A picture file as the pixels every image mode is drawn from: turned upright, cropped to cover and resized by sips (macOS)
// or ImageMagick (Linux) straight to imagePlan's sample grid, read back as a BMP. Mode changes reuse these pixels.
import { exec, window } from "herdr";
import { decodeBmp, imagePlan } from "./ascii-art.js";
import { finish, quote, sh } from "./library.js";

// EXIF orientation through ImageIO (sips -g doesn't report it). sips sizes and crops in the stored order and applies the tag
// on writing a BMP: so a photo stored on its side (5–8) is planned with its sides swapped and comes out upright.
const ORIENTATION = 'ObjC.import("Foundation");ObjC.import("ImageIO");function run(a){const s=$.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(a[0]),null);'
  + 'if(!s)return "1";const o=ObjC.castRefToObject($.CGImageSourceCopyPropertiesAtIndex(s,0,null)).objectForKey("Orientation");return o.isNil()?"1":String(ObjC.unwrap(o))}';

/**
 * `{ pixels, plan }` from the picture at `from`, working in `dir`; null once `current()` turns false. `step(f)` hears how far
 * it has got, 0 to 1, as each step ends.
 */
export async function readImage(from, dir, cx, current, step = (_f) => {}) {
  const mac = window()?.platform === "macos", scaled = `${dir}/scaled.bmp`, bmp = `${dir}/image.bmp`;
  try {
    let turned = false;
    if (mac) {
      const read = await exec("osascript", ["-l", "JavaScript", "-e", ORIENTATION, from]).catch(() => null);
      turned = read?.code === 0 && /^[5-8]$/.test(read.stdout.trim());
    }
    step(0.1);
    const size = await (mac ? exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", from]) : exec("convert", [`${from}[0]`, "-auto-orient", "-format", "%w %h", "info:"]));
    let [w, h] = mac ? ["Width", "Height"].map((d) => Number(size.stdout.match(new RegExp(`pixel${d}: (\\d+)`))?.[1])) : size.stdout.trim().split(" ").map(Number);
    if (!(w > 0 && h > 0)) throw new Error("This isn't a picture this computer can read.");
    if (turned) [w, h] = [h, w];
    step(0.2);
    const plan = imagePlan(w, h), c = plan.crop;
    let made;
    if (mac) {
      // One sips call that both crops and resizes gets the size wrong when the crop is large: so the whole picture is
      // resized until its crop is the grid, then that crop is cut from the small BMP.
      const sw = Math.max(plan.width, Math.round(w * plan.width / c.width)), sh = Math.max(plan.height, Math.round(h * plan.height / c.height));
      made = await exec("sips", ["-s", "format", "bmp", "-z", String(turned ? sw : sh), String(turned ? sh : sw), from, "--out", scaled]);
      step(0.6);
      if (made.code === 0) made = await exec("sips", ["-c", String(plan.height), String(plan.width), "--cropOffset",
        String(Math.min(sh - plan.height, Math.round(c.y * plan.height / c.height))), String(Math.min(sw - plan.width, Math.round(c.x * plan.width / c.width))), scaled, "--out", bmp]);
    } else {
      made = await exec("convert", [`${from}[0]`, "-auto-orient", "-crop", `${c.width}x${c.height}+${c.x}+${c.y}`, "+repage", "-resize", `${plan.width}x${plan.height}!`, `bmp3:${bmp}`]);
    }
    if (made.code !== 0) throw new Error(made.stderr.trim() || "The picture couldn't be resized.");
    if (!current()) return null;
    // At most 960×384: well inside exec's 8 MiB of stdout.
    step(0.7);
    const read = await sh(`base64 < ${quote(bmp)} | tr -d '\\n'`, dir);
    if (read.code !== 0 || !read.stdout) throw new Error(read.stderr.trim() || "Couldn't read the preview pixels.");
    step(0.8);
    const pixels = await finish(decodeBmp(read.stdout), cx, current);
    step(1);
    return pixels && { pixels, plan };
  } catch (e) {
    if (!mac && /ENOENT|not found|spawn/i.test(String(e?.message ?? e))) throw new Error("Install ImageMagick to import pictures.");
    throw e;
  } finally {
    await exec("rm", ["-f", scaled, bmp]);
  }
}
