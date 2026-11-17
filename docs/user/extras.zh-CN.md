# Herdr T3 可选扩展

[English](extras.md) · 中文

不属于布局本身，安装时也不会被复制；需要的话手动添加。

## pulls.review

`extras/mods/pulls-review` 和 `extras/mods/review` 为 space 面板添加 Review，使用[我的 pulls.review fork](https://github.com/JinJieBeWater/pulls.review/tree/multi-repo)（`jin.review`）。安装两个 mod，`scripts/update.sh` 加入 review 渲染位。在 Herdr T3 用 + → Review 或 `cmd-shift-g` 打开唯一可关闭标签；布局默认没有 Review 栏，可以自己加；旧纯开关栏自动收成零宽。切换保留范围／组／文件／阅读位置，关闭重加回默认范围。在页内工具栏选择 Changes、Uncommitted、Outgoing、Incoming 或 Commits，与 Files 独立；树保留已看框，并和 Files 共用拖进终端及右键操作，不改当前文件和已看状态。已删除文件只能 Copy path、不能拖动；子组行两者都没有。Herdr 自带布局里的 Review 栏仍用数量打开所选 diff。阅读操作和资源边界见[指南](guide.zh-CN.md)。

Review 跟随你的主题，包括 Graphite 等主题里带透明度的复选框颜色。吸顶文件头保留不透明底色，滚动的代码不会透出并和文件名重叠。

## 给 Pi 用的主题导出

`extras/mods/t3-theme-export` 是 [pi-herdr-theme](https://github.com/JinJieBeWater/pi-stuff/tree/main/packages/pi-herdr-theme) 在 Herdr 这一侧的部分。pi-herdr-theme 是[我的 Pi 配置](https://github.com/JinJieBeWater/pi-stuff)里的一个 Pi 扩展，让 Pi 的配色跟着 Herdr 走。这个 mod 没有界面：Herdr 实际显示的颜色一变（设置页点选、布局主题、系统明暗、内置预设都算），它就把 `{ "name", "colors" }` 写到 `~/.cache/herdr-app-theme.json`；扩展监听这个文件，重新生成 Pi 主题。两边都要装：把目录复制进 `~/.config/herdr-app/mods/`，再让你的 Herdr agent 在这个布局的 `work` 列末尾加一次 `{ "id": "theme-export", "type": "block", "size": { "px": 0 }, "content": { "mod": "t3-theme-export" } }`。不要设成隐藏，隐藏的块不会启动。它只在放了这个块的布局里运行：切到其他布局后 Pi 保持原来的颜色，想跟随就在那个布局里也加上。`scripts/update.sh` 更新这个布局时会保留这个块。

## asciicn 壁纸

把 Home 换成一张静止的 [asciicn](https://asciicn.dev) 风格的画，颜色取自你的主题，换主题或明暗模式时跟着变。自带 4 张 asciicn 的画（灯塔、黄昏山峦、星云、余烬），也可以用你自己的图片。画只按屏幕实际显示的清晰度绘制，不多画，以减少占用的内存：窗口变大、移到 Retina 屏幕或取景时放大，会重新绘制一张，期间当前这张一直留着。

鼠标移到 Home 的右下角，那里会出现切换器：`‹ ›` 换画，裁切按钮给当前这张画取景，`+` 添加。长画名或 *Importing…* 截断显示；只有一张画时 `‹ ›` 置灰。

`+` 打开一个菜单：**Choose image…** 选一张图片（PNG、JPG、HEIC 等），**Open wallpaper folder** 打开存画的文件夹。也可以直接把图片拖到 Home 上。

之后取景卡出现在切换器的位置。读取期间只显示画名；要等一会儿时，再显示进度条和当前步骤（*Reading image…*、*Drawing Dots…*）。文件读不了时写明原因，并给出 **Choose another…** 和 **Close**。画显示出来后卡片向上展开，**Cancel** 和 **Apply** 留在原处。新画准备好之前，当前壁纸一直留着。

图片在整个 Home 上以 **Dots**（半调圆点）预览。模式行有 **Dots**、**Braille**、**Blocks**（`░▒▓█`）和 **Quadrants**（窄卡写作 **Quads**）：点击，或在上面用方向键切换。它们照 asciicn 处理图片的方式绘制，颜色取自主题。第一次画某个模式时，原来的画留着、稍微变暗，那个模式的按钮在转圈。切回看过的模式是瞬间的。

保存前先取景：**Fill** 铺满 Home，可能裁切；**Fit** 显示整张图。拖动、在触控板上双指滑动，或用方向键移动（按住 Shift 移得更远）。用鼠标滚轮或 ⌘ 加滚动（Linux 上是 Ctrl 加滚动）以指针为中心缩放，范围 100%–400%，滑块和它两边的 − + 会跟着动；`-` 和 `=` 也能缩放。**Reset**（或 `0`）回到 100%，画的主体在画面内。**Apply**（或 Enter）保存这张画和构图并选中它；**Cancel**（或 Esc）回到原来的壁纸，什么都不保存。原图不会被修改或复制，只保存由它生成的画。

构图按铺放方式、缩放和对齐保存，所以在新 Home、重启后、换主题以及任何窗口或侧栏宽度下都保持不变。以后想改，选中这张画（内置画也行）再按裁切按钮：它从上次的构图打开，**Apply** 保存新构图。那里不能换模式，要换请重新选原图。

换画之间 Home 不会空白：切换、换主题或 Apply 后，原来的画一直留到下一张加载好，切换器的画名旁边（或 Home 右下角）有一个小圈在转。很快就完成的操作（约六分之一秒以内）不显示任何转圈。

浅色主题里，从图片添加的画像墨画在纸上：照片暗的地方落笔。内置画在明暗主题下明暗不变。横着存的手机照片会先转正。

Apply 未能完成时，卡片保持打开，底部写明原因：处理后再点 **Apply**，它会沿用已经保存的那张画。Apply 成功之前，当前壁纸不会变。删除自己加的画：对它按裁切按钮，点卡片左下角的 **Delete**，在确认里核对画名；构图也一并删除。

你的画是 `~/.config/herdr-app/asciicn-wallpaper/` 里的 `.ans` 文件，即由你的图片画成的画。从别的 Herdr 复制进去的不经预览直接出现在切换器里，铺满 Home；在那里修改的会重新绘制，构图保留。其他 `.ans`（比如从 asciicn Studio 导出的）不显示，会提示一次。文件名可以是 Unicode、以 `-` 开头或隐藏文件（`.hidden.ans`）；名字只是 `.ans`、`..ans`、`...ans` 的文件会被拒绝，先改名。

安装：把 `extras/mods/asciicn-wallpaper` 复制到 `~/.config/herdr-app/mods/`，然后在这套布局的设置里，把 **Home shows** 选成 asciicn wallpaper。它由 `scripts/update.sh` 负责更新，不会动你加的画。选图片在 macOS 上、以及装了 `zenity` 和 ImageMagick 的 Linux 上可用。没有文件选择框的平台（包括 Windows），把图片拖到 Home 上；那里的菜单只有 **Open wallpaper folder**。自带的画来自 asciicn，MIT 许可（`LICENSE-asciicn`）。

## 主题和设置

布局不指定主题，沿用你自己的。`extras/themes/` 里附带两对明暗主题，需要的话可以用：

- `catppuccin-mocha` 和 `catppuccin-latte`：[Catppuccin](https://catppuccin.com) 官方色板，终端色按官方规范，界面用 Catppuccin 自己的层次色（底层 mantle、卡片 base、选中和边框 surface0），强调色为 blue。
- `t3-code-dark` 和 `t3-code-light`：T3 Code 网页端默认绘制的颜色，深色 canvas 为纯黑、accent 为 `#346bf1`，浅色 canvas 为 `#fcfcfc`、accent 为 `#1b4ed8`，终端用 T3 Code 采用的 VS Code 终端配色。终端文字取对话正文的 90% 前景色，让 agent 的回复读起来和 T3 Code 一样。

把想要的文件复制进 `~/.config/herdr-app/themes/`，在设置页选上；或者在 `settings.json` 里写一对，跟随系统明暗切换，例如 `"theme": { "light": "catppuccin-latte", "dark": "catppuccin-mocha" }`。预览图里的其余设置：

```json
{
  "font": "Geist Mono",
  "ui_font": "Geist",
  "font_size": 12,
  "zoom": 1.1,
  "minimum_contrast": 3
}
```
