# T3 视觉基准

布局的圆角、边距、尺寸、字号统一到 T3 Code。本文是统一时的查表入口，**T3 源码优先于本表**：`pingdotgg/t3code` 的 `apps/web/src`，提交 `337c5858`（2026-11-05）。本机副本在 `/private/tmp/t3code-terminal-research`，没有时重新 clone 这个提交。

本文只放全布局共用的规则和 token。只属于一个界面的尺寸和细节（面板标签、详情 popup、Files、Review、壁纸……）在 [specs](specs/) 的对应文件里。

## 规则

1. 每个数值都能指向 T3 的一个组件。没有直接对应时，用用途最接近的组件，并在代码注释里写一句为什么。
2. 同一种用途全布局只有一个值。三处相同就够了，不要新建共享常量文件。
3. 宿主做不到的（Herdr 弹窗外壳、玻璃效果、缩放动画）记进下面的「做不到」，不写模拟层。
4. 只统一视觉。行为、颜色（由主题决定）和下面的「有意不同」不改。例外是按钮和标签的悬停、on 底：取 `foreground` 的固定比例（见「按钮」），不取主题的 `hover`／`selected`，所以浅色、深色主题深浅一致。T3 的 `destructive` 取 `ansi1`，不取 Herdr 的 `destructive`（即 `blocked`，部分主题是琥珀色）；只用作文字色，不填色块（见「有意不同」）。

换算：T3 `1rem = 16px`，`spacing(1) = 4px`，Herdr 的逻辑 px 与之一比一。带 `sm:` 的取 `sm:` 的值，这是桌面尺寸。

### 设计原则

每块重写都按这九条自查（2026-11-14 设计审查提出，用户全部采纳）：

- **P1 一列一条边**：同一列上下相邻的两行，首个图标或文字用同一条左缘，末个控件用同一条右缘。对的是所在列的内容边，不是窗口边。截图量，误差 ≤1px。
- **P2 中心一致**：同一条栏里的元素垂直中心相同（40px 栏是 20）；图标在按钮框里居中；同一组按钮尺寸相同。
- **P3 同组 4，组间 8**：同一组相邻的按钮间距 4，取 `shared/button.js` 的 `GROUP_GAP`（T3 `PanelLayoutControls`、`DiffPanel` 的 `gap-1`），每个按钮的悬停和 on 底各是一块完整的圆角方块；组与组之间、按钮与文字或输入框之间 8。本来就是一个控件的才相接：分体按钮（`split()`，含 Actions 的 ▶|⌄）和分段切换。窗口按钮（最小化、最大化、关闭）照系统相接。
- **P4 一套笔画**：UI 图标用 Lucide 24 网格、1.75px 笔画，并排图标的视觉重量相近。`scripts/check.sh` 拦其他笔画（Pierre 图标和 Windows 窗口按钮除外），借用的 Herdr `workspace-chrome` 图标也照查（读 Herdr 自带的那份；只豁免 spinner：加载动画，不是 Lucide 图标），运行时拼出的借用路径直接判失败。Herdr 自带的是 2px，要用就在 mod 自己的 `icons/` 放 1.75 的副本；共享模块要用的（`menu-row.js` 的 `›`、`project.js` 的文件夹）放在 `shared/icons/ui/`，由 `scripts/sync.sh` 复制给用到的 mod。
- **P5 不写自明或重复的字**：提示只补控件自己说不出的东西（动作名、按键、被截掉的全文、禁用原因）；说明文字不重复标签已说过的话。
- **P6 打开弹层的按钮一种做法**：照侧栏 Filter by space，用 `shared/trigger.js`。提示是布局自己的卡片，可带第二行说明；弹层开着时提示收起，按钮保持 on；再点一次是关闭。见下文「按钮」。
- **P7 静止时安静，颜色只表达状态**：ghost 按钮和详情卡里的 split（`row`）静止时无底、无分隔线；栏上的 split（`xs`）照 T3 头部是 outline，静止时只有描边和中线，没有底；同一条栏上的按钮用同一种悬停面和 on 面；`accent` 不做按钮的底。
- **P8 T3 优先，偏离写明**：每个数值都能指到一个 T3 组件；不同之处写进「有意不同」。
- **P9 层级从上往下**：卡片和弹层先放标题或内容，再放控件，说明放最后。

### 对齐

- **R1 末端对齐**：每条顶栏最右的按钮，框的右缘对齐正下方那一行最右的控件。侧栏是两行都离侧栏边 8；工作列对齐窗格头末端（离窗口边 12）；面板列对齐页头：面板没有卡片，面板头和页面同为 `chrome` 一整面，内容离列边 12（面板头由布局的 padding 给，页内各行自己留），所以开关也离窗口边 12，面板开合时不动。左侧同理：面板头首个标签的框和页头的面包屑框都离列边 12。面板页内每一行都按这条边：首末控件的框（静止无底的 ghost 也按框算，与未选中标签一样）或无框的文字，在所在列内 12，行首静止无底、带文字的按钮也是框在 12、左右用该尺寸按钮的标准内边距（Review 的范围按钮 `sm` 10，文字在 22），悬停底与面板头首个标签的框左缘对齐；Files 面包屑首级同样框在 12、文字在 22，切页时首字不动（2026-11-15 用户决定，取代先前的左内边距 2）（导航列从左边线内侧算）。Review：顶栏、组页签行、diff 文件头、hunk 行、文件注释、行注释卡、组说明、导航列头和树行；Files：文件头、树头、树行、Markdown 预览。右对齐的代码行号栏（Review 的 diff 与 Files 的宿主 `Editor`）是一列 gutter，不算。
- **R2 列内同尺寸**：上下对齐的两行用同一尺寸的按钮，同一组也一样。
- **R3 内容右缘**：侧栏卡片、slim 行和 Lists 的 Spaces／Agents 行（含子 agent 行和树线）横向内边距 8，状态文字和程序图标的右缘落在按钮图标的右缘上，左缘与 Search 图标、底栏齿轮同线。
- **R4 子菜单挂在行旁**：子菜单贴着打开它的那一行的右缘，首行与那一行同高（照 T3 `MenuSubPopup` 的 alignOffset，子菜单顶比行顶高 5，抵掉它的边框和内边距）。右侧放得下就放右侧；只有左侧放得下就翻到左侧，右缘贴着行的左缘；两边都放不下，放在空间大的一侧并收窄到那一侧的宽度。无论哪种情况都不盖住那一行。原生 popup 和 Review 页内的子菜单都用 `shared/submenu.js` 的 `subPlace` 定位（页内留出面板两端各 8）；垂直方向只为留在窗口或面板内而移动。

## 圆角

| T3 | px | 用途 |
| --- | --- | --- |
| `rounded-sm` | 4 | 菜单和 combobox 的行、20px 及更小的按钮、标签的 ×、徽章、键帽 |
| `rounded-md` | 6 | tooltip、compact 输入框、28px 高的小按钮 |
| `rounded-lg`、`--control-radius` | 8 | 菜单、popover、combobox、select 的面板，输入框，默认按钮 |
| `rounded-2xl` | 16 | 对话框、命令面板 |

## 组件

| 组件 | T3 文件 | 数值 |
| --- | --- | --- |
| 菜单面板 | `ui/menu.tsx` | 内边距 4，圆角 8，大阴影 |
| 菜单位置 | `ui/menu.tsx` 的 `sideOffset`、各处 `align` | 按钮下方 4；对齐按钮朝窗口那侧的边：靠右的按钮右边对齐（`align="end"`），靠左的左边对齐（`start`）；位置取按下时按钮的 `e.bounds`，没有按下（辅助技术）就用 app 默认的指针处。右键菜单在指针处，命令面板顶部居中 |
| 菜单行 | `ui/menu.tsx` | 最小高 28，横向 8、纵向 4，间距 8，字号 14，圆角 4；图标 16 muted、左右各内缩 2；子菜单箭头 16 muted 80%、右内缩 2；行尾提示 12 medium dim；分隔线 1、横 8、纵 4。由 `shared/menu-row.js` 统一绘制，见下文「菜单行」 |
| 菜单搜索框 | `ui/menu.tsx` | 外层横向 8、上 6、下 4；输入框高 26，下 6 后 1px 下划线，图标 16，文字起点 20 |
| Combobox 搜索框 | `ui/combobox.tsx` | 外层横向 12、上 10；其余同菜单搜索框 |
| Combobox 行 | `ui/combobox.tsx` | 见源码，横向 8、纵向 4，圆角 4 |
| Tooltip | `ui/tooltip.tsx` | 横向 8、纵向 4，字号 12，圆角 6，最宽 320；通常在控件上方，40px 顶栏上的控件在下方；卡片由 `shared/tip.js` 的 `tipCard` 画，`measured-text.js` 的 `named()` 也用它 |
| Popover | `ui/popover.tsx` | 圆角 8；default 纵向 16、横向 16，compact 纵向 8、横向 12 |
| 输入框 | `ui/input.tsx` | 默认高 30、横向 11、圆角 8；sm 高 26、横向 9；compact 高 28、横向 9、字号 12、圆角 6 |
| Select | `ui/select.tsx` | 同尺寸的按钮；面板内边距 4，圆角 8；箭头 14 |
| 按钮 | `ui/button.tsx` | 默认高 32；sm 高 28；xs 高 24，字号 12，图标 14 |
| 图标按钮 | `ui/button.tsx` | 32、28、24（图标 14）、20（圆角 4，图标 12）、16（图标 12） |
| 键帽 | `ui/kbd.tsx` | 高 20，最小宽 20，横向 4，字号 12 medium，圆角 4；`foreground` 7% 底、75% 字；全布局一种，`shared/palette.js` `keycap` |
| 徽章 | `ui/badge.tsx` | 见源码，圆角 4 |
| 对话框 | `ui/dialog.tsx`、`dialog-styles.ts` | 最宽 512，圆角 16；头部内边距 24、间距 8；标题 20 半粗；正文 24；底部横向 24、纵向 16；默认有上边线，`bare` 变体没有（Actions 编辑器用它） |
| 确认框 | `ui/alert-dialog.tsx` | 同对话框 |
| 命令面板 | `ui/command.tsx`、`CommandPalette*.tsx` | 最宽 576，最高 420，圆角 16；搜索纵向 6；底部纵向 10，上边线 |
| 标签关闭 | `ui/panel-tab-close-button.tsx` | 16，圆角 4，图标 12 |
| 标题栏按钮 | `index.css`、`ui/sidebar.tsx` 的 `SidebarTrigger` | 28，间距 12，图标 16 |
| 侧栏 | `Sidebar*.tsx`、`ui/sidebar.tsx` | 见源码；[specs](specs/) 里已写明的是之前量过的值，仍要对照 |

## 按钮

按钮一律用 `shared/button.js` 的 `button()` 画，对照 T3 `ui/button.tsx`；为什么按钮例外于规则 2，见 [ADR 0016](../adr/0016-buttons-share-one-helper.md)。颜色只从这张表取，`accent` 不做按钮的底（它是焦点环和强调文字的色），`accent_foreground` 只配 `accent` 底的非按钮元素（`check.sh` 查）。

| variant | T3 | 静止 | 悬停 | on（按下、弹层开着） |
| --- | --- | --- | --- | --- |
| `primary` | `default` | `solid` 底和边、`solid_foreground` 字 | 透明度 0.9 | — |
| `outline` | `outline` | `raised` 底、`input` 边、`foreground` 字 | 透明度 0.9 | — |
| `danger` | `destructive-outline` | 同 outline，字 `ansi1` | 透明度 0.9 | — |
| `ghost` | `ghost-muted` | 无底无边，`dim` 字；`hot` 时 `foreground` | 底见下 | 底见下，字 `foreground` |
| `plain` | `ghost` | 无底无边，`foreground` 字（工具栏里的文字动作，如 Review 的 Analyze、Retry） | 底见下 | 底见下 |

- ghost 和 plain 的底随它所在的面（`surface`），取 `foreground` 的固定比例，浅色、深色主题都按这个比例：`chrome` 上悬停 4%、on 7%（T3 深色的 `accent` 和 Toggle 按下的 `input/64`；2026-11-15 用户决定，主题的 `hover`／`selected` 在 maple-dark 等主题里是一块实色）；终端标签栏和面板头的标签也一样，当前标签 7%，悬停 4%；`card`（`background` 卡片、`popover`、对话框）上悬停 7%、on 12%；`row`（侧栏的行和卡片里的控件，T3 行控件）没有底，只变亮；`tab`（标签的 ×）悬停 `raised`，照 T3 tab close 的 `bg-muted`。
- 禁用：整体透明度 0.64（T3 `disabled:opacity-64`），不换底色和字色，没有悬停，不响应点击；禁用的 toggle 不算按下，不画 on 底。
- 焦点：`stop()` 的 2px `accent` 内环，半径取 `radiusOf(size)`。
- 指针（全布局，2026-11-15 用户决定）：ghost 按钮、`trigger()` 和分段切换悬停时是箭头，`button()` 不传 `act`、`ghostButton()` 即如此；实底按钮（primary、outline、danger）、菜单行、split 两半和列表行是手形，`button()` 传 `act` 或调用方加 `cursor_pointer()`；能拖动的画面（壁纸取景）是 `cursor_grab()`。
- 打开弹层或菜单的按钮一律用 `shared/trigger.js` 的 `trigger(view, t, id, { label, hint?, action?, below?, open?, closed?, onOpen, icon?, iconSize?, text?, size?, surface?, color?, disabled? }, extra?)`（P6）：画 `button()`（默认 `sm`／`chrome`）、`tip()` 卡片和 `stop()`；按下记 `pressed()` 和按钮位置，点击时若这次按下刚关掉弹层（`justClosed(view, closed)`）就不再打开，否则 `onOpen(bounds, cx)`；`open` 为真时按钮 on、提示 `off`。`closed` 是弹层 `close()` 写的时间戳键（见 [storage.md](storage.md)）；不传 `open` 时由 `popupOpen(view, id, closed)` 判断：本按钮打开之后键还没再写过。`onOpen` 返回 `false` 表示没开出弹层（如直接新建 space）。不是按钮的触发处（split 的箭头半、详情行、标题、面包屑 ›）用同文件的 `opener(view, { id?, closed?, onOpen, press? })` 接同样的按下和点击，on 态自己画。Review 页内弹层由 `closePopup` 在外部按下时写 `review.<名字>Closed`。
- svg 不吃悬停样式，ghost 的字色变化靠调用方传 `hot`（`view.hot === id`）。卡片上的 ghost 图标按钮一律用同文件的 `ghostButton(view, t, id, { icon, label, act, press?, on?, disabled?, color?, size?, iconSize?, surface? })`（`surface` 默认 `card`，40px 顶栏上传 `chrome`）：它接好悬停（tip.js `glow`）、按下不下传、点击执行，调用方只加 `stop()` 和 `tip()`。
- 不是按钮却按 ghost 方式点亮的元素（标签、详情行、Review 分组标签、面包屑 ›），底色取同文件导出的 `tint(t, surface, on)`。
- 从主题色取比例（悬停底、淡底、焦点环、徽章底）一律经 `shared/color.js` 的 `alpha(color, "12")`：主题色可以是 `#rgb`、`#rrggbb` 或带透明度的 `#rrggbbaa`，后者按自身透明度再乘比例；直接拼两位会得到宿主不认的 5 位或 10 位色。`scripts/check.sh` 拦直接拼接。
- 尺寸：`default` 32、`sm` 28、`compact` 28（字 12、圆角 6）、`xs` 24、`micro` 20（字 11、圆角 4）、`tiny` 16（圆角 4）；只有图标时是正方形，图标 16/16/14/14/12/12。子标题栏（Files 文件头、Review 顶栏）的 `sm` 按钮传 `iconSize: 14`，照 T3 文件和 diff 工具栏的 `size-3.5`；面板头和其他 40 栏仍是 16。

分体控件（T3 OpenInPicker、ProjectScriptsControl、ThreadDetailsControl 的 primary＋secondary）一律用同文件的 `split()`，mod 不自己画描边。T3 按所在位置分两种画法，`size` 二选一：

- `xs`：栏上（T3 头部，`variant="outline"` 的 xs 按钮组）。高 24，一圈 `input` 描边和一根全高 `input` 中线，静止时就在，没有底（T3 的 `input/32` 底在 chrome 上读作一块按钮，布局不画，同 Actions 原来的理由：底会像选中的标签）；指针下的那一半单独填 `surface` 的悬停底，菜单开着时箭头那半填 on 底。主半边只有图标时宽 25（含左描边），有文字时传 `wide`，左 5 右 7、间距 4（T3 xs 的 `px-[7px]` 加 svg 的 `-mx-0.5`）；箭头半宽 24（含右描边），箭头 16。整体禁用时连描边一起降到 0.64。用于 Files 文件头的 Open in、Actions 栏的 ▶|⌄（见 [Files](specs/files.md#open-in)）。
- `row`：详情卡里（T3 `isPanel`，`variant="ghost"`）。一体 ghost 组，底和中线属于整组，见[详情](specs/details.md#splits)。

不走 `button()` 的：列表行、菜单行（`shared/menu-row.js`，见下）、标签、分段切换（ToggleGroup）、日历格、select 的触发框和画成输入框的按钮（Inbox 的 Search）、输入框自带的 stepper（`NumberInput` 的 − +）、行内链接（Undo，悬停下划线）、命令面板底部的文字动作（只变亮）、Inbox 卡片和行上的悬停控件（T3 行控件，无底）、Update 胶囊、品牌栏 Home。

## 菜单行

所有弹出菜单的行用 `shared/menu-row.js` 的 `menuRow(view, t, id, { at: [state, key, i], label, open?, icon?, lead?, trail?, color?, sub?, disabled?, hint?, pick?, also? })`，照 T3 `ui/menu.tsx` 的 MenuItem：

- 打开时：用键盘打开的菜单和子菜单（按钮上 Enter／Space、→、快捷键）点亮第一行；用指针打开的什么都不亮，直到第一次按方向键或指针停到行上（2026-11-14 用户决定）。由 `shared/list.js` 统一给出：页内菜单打开时取 `openLit(keys)`；原生 popup 由打开方在 props 里放 `litProp(keys)`（`popup-menu.js` 的 `openPopup`／`openBeside` 收 `keys` 参数代放），popup 启动时取 `propsLit()`。按钮的 `opener`／`trigger` 的 `onOpen(b)` 没有按下坐标（`b` 为空）就是按键打开，传 `!b`；命令和快捷键传 `true`；右键传 `false`。带搜索框的选择器（Go to、New、Review 栏菜单、base 选择器）按各自的首项规则，不在此列。
- 只在指针停在行上或键盘选中时用 `selected` 底；指针离开就熄灭，宿主晚到的 leave 不熄灭指针已进入的下一行（`shared/list.js` 的 `litOnHover`）。子菜单开着时（`open`）父行保持点亮。
- 禁用：整行透明度 0.64（`DISABLED`），不点亮、不响应点击；`hint` 用 `tip()` 说明原因，不用宿主 `.tooltip()`。
- 行尾提示用 `menuHint`，分隔线用 `menuRule`。按键用 `list.js` 的 `menuKeys`，滚动用 `scrollList`，子菜单用 `popup-menu.js`／`submenu.js`，由各菜单自己接。`label` 不是文字（元素）时，调用方自己设 `accessibility_label`；role 不是按钮的（设置页 Select 的选项 `list_box_option`、base 的 `radio_button`）在调用方覆盖。
- 子 agent 列表也用 `menuRow`：每级缩进 16 用 `lead` 放 `16 × 层级 − 8` 的占位（加上行的 gap 8），状态用 `trail`。Review 的 base 和 Commits 列表、Review 设置的语言／agent／model 子菜单、设置页 Select 的选项也用 `menuRow`：指针离开即熄灭，和其余菜单一致（2026-11-14 用户决定）。

## 程序标志

程序标志直接使用 Herdr 官方资源，各组件沿用 T3 的图标槽尺寸，由 `shared/program.js` 的 `programIcon` 统一绘制。素材的画布、内部留白、宽高比与配色由 Herdr 维护，布局随官方资源更新。mod 提供的自定义图标也按其原画布绘制。

## 有意不同

用户决定保留，不要改回 T3（见 [ADR 0002](../adr/0002-inbox-rules-stay-in-inbox.md) 和 [ADR 0004](../adr/0004-putting-away-lands-on-home.md)）：

- Lists 的终端标签名字很短时最小 96px，末尾留一格 16 放状态标记，没有状态也留着，宽度不随状态变；悬停时 × 照 T3 盖住左端图标，状态标记不被盖住。Inbox 右侧的工具标签不显示状态（ADR 0002），不留末尾那格，按内容收紧、不设最小宽度。两条标签栏的标签由 `shared/tab.js` 画（2026-11-15 用户决定统一）。
- 标签条放不下时，被裁的一端渐隐，两种模式相同。
- 确认框的执行按钮照 Actions 编辑器的 Delete：`raised` 底、`ansi1` 文字，写出动作；底部 bare。T3 的红色实心按钮在浅色调主题里是一块粉色，和布局别处不搭。
- Settle 后回 Home，Review 回打开它之前的地方。
- `cmd-]` 在 Lists 下也走折叠的组。
- 标签栏高度、工作区框架等 T3 没有的结构，以及 Review 的 diff 内容区。
- 侧栏头的按钮相接，不按 P3 的 4：品牌栏右端两个、Inbox 顶行和 Lists 两个标题行的按钮组，照 T3 侧栏头，品牌栏两个按钮各自对准下方顶行的按钮（用户定侧栏头保持现状）。全布局只有一个组内间距：T3 面板头 ‹ › 的 `gap-0.5`、文件头的 `gap-2` 都取 4（2026-11-15 用户决定）。
- 侧栏顶行 Search 框和按钮组之间 4（T3 原样），不按 P3 的 8：用户定侧栏头保持现状。
- 侧栏卡片和 slim 行横向内边距 8，T3 是 10（R3）。
- ghost 按钮和分段切换悬停时指针不变，T3 的 `Button` 一律 `cursor-pointer`：规则见「按钮」的指针一条。
- Files 和 Review 的内容区（导航列左边那块）一律 `background`，导航列和页头是面板的 `chrome`：T3 只有代码和 diff 用 `--code-background`，Markdown 预览和图片在 `bg-background` 上；布局让 Files 的 Markdown、图片也在 `background` 上，换文件类型时内容区和树的分界不变（2026-11-15 用户要求按底色分界）。
- 树头（通用 Files 的搜索行、两页导航列头，`nav-column.js` 的 `treeHead`）高 32、下方 8，T3 是 36、下方 4：通用 Files 上它是页面第一行，中心同样落在 56；树的第一行位置不变（2026-11-15 用户决定）。
- Files 文件头和 Review 顶栏高 32，T3 是 40：这一行的中心（40 + 16 = 56）落在工作列窗格头的中心（标签栏 40、窗格边框 2、28 的一半），左右两侧读作一条线（2026-11-15 用户决定）。
- 面板页的边一律12（R1）：树行不取 Pierre 的16，Markdown 预览不取 T3 的 `px-6`，Review 文件头不取 T3 的左8。
- 文件树没有折叠箭头，目录图标开合两态表示展开；T3 的 Pierre 树是 chevron。Files 与 Review 两棵树是同一种行（用户决定统一）。
- Spaces 行之间 1，T3 的文件夹之间 8：space 多了太占高度。
- 子 agent 的 Failed 用 `!` 徽章，`ansi1` 的 15% 底，和 Needs you 同形只换颜色：用户决定两者共用一个标记（`shared/status-mark.js`），12px 的底不会成一块粉色。

## 做不到

- 玻璃效果（背景模糊）和弹窗的缩放动画。
- 字距（`tracking-widest`）：kit 没有字距 API。
- 命令面板的背景遮罩：New 和 Go to 是 popup，改 dialog 就不能固定在顶部。顶部 `offset` 96 是 T3 `10vh` 的近似值，宿主只收固定值。
- Herdr 自带的 `space.close` 确认框和 worktree 对话框：数值写死，mod 碰不到。
- 数字框内容居中：`NumberInput` 不接受。
- 竖向滚动条的尺寸由宿主决定。

外壳圆角能做到：`frame: "none"` 由 mod 自画，已用于 16 圆角的 New、Go to、Actions 编辑器、确认框和 Custom snooze。菜单类弹层的宿主外壳本来就接近 8，不用自画。

确认框放在 `t3-actions` 的 `actions: "confirm"` 里，因为宿主 `confirm` 改不了圆角；单独发布的 Inbox 没有 `t3-actions`，回退到宿主 `confirm`。
