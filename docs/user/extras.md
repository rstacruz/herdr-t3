# Herdr T3 extras

English · [中文](extras.zh-CN.md)

Not part of the layout and not copied by an install; add them by hand if you want them.

## pulls.review

`extras/mods/pulls-review` and `extras/mods/review` add Review to the space panel, using [my pulls.review fork](https://github.com/JinJieBeWater/pulls.review/tree/multi-repo) (`jin.review`). Install both mods; `scripts/update.sh` adds the review render slot. In Herdr T3, + → Review or `cmd-shift-g` opens its unique closable tab. The layout has no Review bar by default; you can add one yourself. An older toggle-only bar collapses to nothing. Switching retains the range, group, file and reading position; closing and re-adding resets to the default range. Pick Changes, Uncommitted, Outgoing, Incoming or Commits in its own toolbar, independently of Files. Its tree keeps reviewed boxes and shares Files' drag-to-terminal and right-click actions without changing the current file or reviewed state. Deleted files only offer Copy path and cannot drag; subgroup rows have neither action. In Herdr's own layout the Review bar's counts still open the chosen diff. See [the guide](guide.md) for reading controls and resource limits.

Review follows your theme, including translucent checkbox colors in themes such as Graphite. The stuck file header keeps an opaque background so scrolling code cannot overlap its filename.

## Theme export for Pi

`extras/mods/t3-theme-export` is the Herdr half of [pi-herdr-theme](https://github.com/JinJieBeWater/pi-stuff/tree/main/packages/pi-herdr-theme), a Pi extension in [my Pi setup](https://github.com/JinJieBeWater/pi-stuff) that makes Pi's colors follow Herdr's. The mod has no UI: whenever the colors Herdr draws with change (a pick in Settings, a layout's theme, the system's light or dark mode, a built-in preset), it writes `{ "name", "colors" }` to `~/.cache/herdr-app-theme.json`; the extension watches that file and regenerates Pi's theme. Install both: copy the folder into `~/.config/herdr-app/mods/`, then ask your Herdr agent to add `{ "id": "theme-export", "type": "block", "size": { "px": 0 }, "content": { "mod": "t3-theme-export" } }` at the end of this layout's `work` column, once. Leave it shown: a hidden block never starts. It only runs in a layout that has it: switch to another and Pi keeps its colors, so add the block there too if you want Pi to follow. `scripts/update.sh` keeps that block when it updates this layout.

## asciicn wallpaper

A Home that is a still picture in [asciicn](https://asciicn.dev)'s style, in your theme's colours, so it changes with the theme, light or dark. It comes with four of asciicn's pictures (Lighthouse, Mountain dusk, Nebula, Ember), and takes your own images. The picture is drawn as sharp as your screen shows it and no sharper, which keeps the memory it takes down: when the window grows, moves to a Retina screen or you zoom in while framing, it is drawn again, the current one staying up meanwhile.

Move the pointer to Home's bottom-right corner and a switcher shows there: `‹ ›` step through the pictures, the crop button frames the picture shown, and `+` adds one. A long name or *Importing…* is cut to fit; `‹ ›` are greyed out only when there's a single picture.

`+` opens a menu: **Choose image…** picks a picture (PNG, JPG, HEIC and the like), and **Open wallpaper folder** shows where your pictures are kept. You can also drop an image straight onto Home.

The framing card then takes the switcher's place. While the picture is read it shows only its name and, if that takes a moment, a progress bar with the step it's on (*Reading image…*, *Drawing Dots…*); if the file can't be read it says why, with **Choose another…** and **Close**. Once the picture shows, the card opens upward; **Cancel** and **Apply** stay where they were. Your current wallpaper stays up until the new picture is ready.

An image previews across Home in **Dots** (halftone). The mode row offers **Dots**, **Braille**, **Blocks** (`░▒▓█`) and **Quadrants** (**Quads** on a narrow card): click one, or use the arrow keys on it. They follow how asciicn draws an image, in your theme's colours. While a mode is drawn for the first time, the one you had stays up, a little faded, and the mode's button spins. Going back to a mode you've already seen is instant.

Frame the picture before saving: **Fill** covers Home and may crop, **Fit** shows all of it. Drag it, scroll with two fingers on a trackpad, or use the arrow keys (Shift moves further). Zoom from 100% to 400% with the mouse wheel or ⌘-scroll (Ctrl-scroll on Linux) at the pointer, or with the slider and its − + buttons, which follow along; `-` and `=` zoom too. **Reset** (or `0`) goes back to 100% with the picture's subject in view. **Apply** (or Enter) saves it and its framing and selects it; **Cancel** (or Esc) goes back to the wallpaper you had, saving nothing. Your original image is never changed or copied, only the drawing made from it.

The framing is kept as a fit, a zoom and an alignment, so it holds in a new Home, after a restart, in another theme and at any window or sidebar size. To change it later, select the picture, built-in ones included, and press the crop button: it opens where you left it, and **Apply** saves the new framing. Its mode can't be changed there; choose the original image again for that.

Home never goes blank between pictures: when you switch, change theme or apply, the picture you had stays up until the next one has loaded, with a small spinner beside the name in the switcher, or in Home's bottom-right corner. Anything quicker than about a sixth of a second shows no spinner at all.

In a light theme, a picture you added from an image is drawn like ink on paper: the marks go where the photo is dark. The built-in ones keep the same tones in both. A phone photo stored on its side is turned upright first.

If Apply can't finish, the card stays open with the reason at its bottom: fix it and press **Apply** again, which reuses the drawing it already saved. Your selected wallpaper doesn't change until Apply succeeds. To delete a picture you added, press the crop button on it, then **Delete** at the card's bottom left, and confirm its name; that also removes its framing.

Your pictures are `.ans` files in `~/.config/herdr-app/asciicn-wallpaper/`, the drawings made from your images. One you copy there from another Herdr appears in the switcher without a preview, covering Home; one you change there is drawn again, keeping its framing. Any other `.ans`, such as one exported from asciicn Studio, isn't shown: a notice says so once. Names may be Unicode, start with `-` or be hidden (`.hidden.ans`); files named only `.ans`, `..ans` or `...ans` are refused, so rename them first.

Install: copy `extras/mods/asciicn-wallpaper` into `~/.config/herdr-app/mods/`, then pick asciicn wallpaper under **Home shows** in this layout's settings. `scripts/update.sh` updates it, and leaves what you added alone. Image selection is available on macOS, and on Linux with `zenity` and ImageMagick installed. Where no file picker is available (including Windows), drop the image on Home; there the menu has only **Open wallpaper folder**. The built-in pictures are asciicn's, MIT (`LICENSE-asciicn`).

## Theme and settings

The layout sets no theme: yours stays. `extras/themes/` holds two light and dark pairs if you want them:

- `catppuccin-mocha` and `catppuccin-latte`: [Catppuccin](https://catppuccin.com)'s official palette, terminal colors as its spec gives them and the panels in Catppuccin's own surfaces (mantle behind, base for cards, surface0 for selection and borders), with blue as the accent.
- `t3-code-dark` and `t3-code-light`: the colors T3 Code's web app draws by default, a true black canvas with accent `#346bf1` and a `#fcfcfc` canvas with accent `#1b4ed8`, with the VS Code terminal palette T3 Code uses. Terminal text takes the chat's 90% foreground, so an agent's replies read like T3 Code's.

Copy the files you want into `~/.config/herdr-app/themes/` and pick one in Settings, or set a pair in `settings.json` so it follows the system's light and dark mode, for example `"theme": { "light": "catppuccin-latte", "dark": "catppuccin-mocha" }`. The preview's other settings:

```json
{
  "font": "Geist Mono",
  "ui_font": "Geist",
  "font_size": 12,
  "zoom": 1.1,
  "minimum_contrast": 3
}
```
