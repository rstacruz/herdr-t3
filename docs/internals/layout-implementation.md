# 布局实现中的宿主限制

改 render/timer、键盘/hover、测量/滚动、Review 文本或壁纸转换时读本文。可见规格与验收在 [RECIPE](../../RECIPE.zh-CN.md)；尺寸/颜色以 [t3-tokens](t3-tokens.md) 为准，跨帧数据和文件以 [storage](storage.md) 为准。本文只记不能从 API 签名看出的限制，不复制这两份的表，也不归档旧版 RECIPE。

## Render 只造 view

Herdr 在绘制中拒绝会再请求绘制的操作：`cx.notify()`、`cx.new()`、`cx.focus_handle()`、`InputState.new()` 等会抛错，保留旧帧并报 `This view could not be re-rendered`。Review 的首次读取和 `VirtualListScrollHandle.new()` 也要在 `cx.timer.after(0, …)` 启动；绘制中开始的读取可能不返回，直到 30s 超时。绘制发现 Undo 请求、主题变化需重读等，先安排 0ms timer，绘制后执行。

`scripts/render-guard.cjs` 在假的 Herdr 中预加载这些约束。`scripts/check.sh` 还在已装 app home 中运行检查，因为有测试查官方图标；类型检查用脚本里的 `tsc --noEmit` 参数，不用 git 忽略的 `jsconfig.json`，官方 check 新生成的默认配置不适合这些 mod。

Herdr 0.1.16 的 `checking()` 在整个检查期间为真；检查仍执行 `init()` 和首次绘制，`exec`、`hc`、`writeTextFile` 也照常执行，不能依赖宿主拦截。保留输入、焦点、列表等内存初始化与完整 render，只在外部工作入口跳过：Files 缓存清理／首次同步／文件夹菜单读取、壁纸草稿目录清理／扫描／合成／屏幕查询、主题导出、Spaces 机器／仓库探测、Chrome 的窗口按钮对齐及 Review 探测、Details 的机器名／Review 预读、Open in 的应用探测、Review 的首次仓库读取、独立 Review 栏的计数读取和 overlay 启动。`shared/check-checking.cjs` 记录启动及首次读取入口的命令和写入，检查模式必须为空，真实模式仍清理和导出；真实 `herdr-app check` 再覆盖绘制。其余 mod 的初始化只有内存／检查内共享状态和等待命令；实际用户动作不由检查触发。

各列表首次绘制中的项目 favicon 读取也由 `shared/project.js` 隔离；检查只用已知图标或 monogram，不探测项目文件、不写图标缓存。Space 右键菜单的 checkout 探测和 Details 范围菜单的初始化读取同样跳过，菜单内存状态照常建立。首次行计算可能结束 Settle / Snooze，`shared/labels.js` 在检查模式直接返回未写入，不向 core 发标签命令。

原生 popup 的自动高度不能直接套 `overflow_y_scrollbar()`：只有 `max_h`、没有确定高度的根滚动容器会被测成0，overlay虽已注册却看不见。详情用不收缩的内容层在 `on_size_change` 量高度，再给外层滚动视口明确高度（至少一行控件，最多420）；只在高度变化时notify，0测量不覆盖有效值。`herdr-app check` 和 `status.errors=[]` 都不验证实际布局，整窗截图与非零布局尺寸仍是必需证据。

## 隐藏副本与常驻入口

隐藏 stack 子节点/列里的 mod 不绘制、不收 `<mod>.<command>`；启动后的 timer 继续，首次显示前则尚未启动。Inbox/Agents 的行计算独立于 `render()`，由每秒 timer 也调用，只有当前模式写 agent order。必须随时工作的命令/Snooze 维护在根浮动、视觉为空的 `t3-tabs {part:"keys"}`；不能依赖可被面板放大藏住的标签条。

子 agent 弹层（`t3-pane` 的 `kidsMenu`）每次绘制现读 `terminals()` 建树（`shared/tree.js` 的 `kidTree`），不留快照，快照只会让状态晚到 1 秒。每秒 timer 只为时长刷新，后代全结束时关闭弹层。`tree.js` 对每份 `terminals()` 列表只建一次索引（`WeakMap`，按父地址分组的存活终端、按地址的终端）：Herdr 每次调用都返回新列表，所以按列表对象做键不会过期；同一次绘制内把同一份列表传下去才能复用索引。逐层 `filter` 整份列表是 O(agent × 终端)，5,000 个终端时 Tabs/Agents/Inbox 的一次绘制在 QuickJS 里会 `interrupted`（2026-11-14 实测：建索引后 1,000 个终端每次绘制 28ms→4ms，5,000 个从中断降到 19ms）。检查里的假 `terminals()` 也要每次返回新数组，原地改同一数组会读到旧索引。

面板的 `surface-*` 副本在 render 里判断 Review 能否读取（`probeReview`，key 不变即返回），不开周期定时器：隐藏副本的 timer 不停，250ms 轮询会在窗口空闲时一直读宿主列表。

`t3-tabs/main.js` 的 `nav()` 给 strip/keys 共用同一导航；strip 绘制前也 track，避免晚一帧。同一帧 track 两次必须幂等，`check-navigation.cjs` 按此回放。`shared/sidebar.js` 查 `sidebar`、`sidebar-lists`；缺 stack 不当作 Lists，独立发布 mod 未必有整个布局。

Home 的 layout select/row 高度和目标 panel restore 与 tab select 同次发出；在 `spaces()` 回传前暂认已到达，不能把 Home 面板写回来源 space。命令后的模型晚一帧左右，不从调用成功推断所有结构已回传。新 space 自带 shell、不能失最后 tab，替换 Home 内容先加入再关闭。Home 的识别/名称契约见 ADR 0005/0006，键和保存归属见 storage。

## Hover 和失踪的离开事件

Herdr 在最后已知鼠标仍落在元素上一帧范围时可能丢 leave，而 GPUI 已记为离开：按键后第一次移出行、按住拖出再松开、离开窗口都能留下 hover。`shared/tip.js` 的 `pointerGone` 在提示/详情显示期间每 100ms 用 `mouse_position()` 对比元素 box；没有卡片、仅 hover 点亮的控件用 `hoverKept`。macOS 指针出窗口后不再送 move；指针停住且沿最后一步再走两步会越窗口边，则视为已经离开。拖动在窗口失活也结束，不能只等永远不来的 release。

Tooltip 用自己管理时序的 `Popup`：`HoverCard` 会因指针停在卡片上继续开，透明 popup 仍挡住下面输入。每次打开换 id，尺寸只在一个 id 首次布局时上报；布局完再淡入。`Popup` 不自动翻转，顶栏等位置明确传 `below`。官方 `.tooltip()` 只有字符串和宿主样式，无法提供这套外观。

## 键盘、关闭键与菜单链

键盘模式由 `shared/focus.js` 管；每副本 close 调 `stopsEnd`。运行首副本通过 `globalThis.t3FocusRun` 清崩溃残值：Herdr 当前所有 mod 共用 JS context，但未承诺此能力，`sessionStorage` 又是每副本一份。没有在走键盘的副本遇到普通 stop 按下，要在 press 夺焦点前结束旧模式。Inbox 内菜单只在真正持键盘时保模式。Files 树只在用户从树、面包屑或 Locate 发起时 focus；标签切换、命令等外部 reveal 只滚动和选中，不把键盘从终端拿走。树行焦点环只在树里按过方向键等之后出现，点击不显示。

Herdr 自 0.1.14 起自动处理绑定 `tab.close`/`pane.close` 的关闭键，但布局绑到 `t3-tabs`，每个 popup/dialog 必须另有 `mod:<name>` 四键 `overlay.close` 覆盖。两页面板有自己的 close 覆盖（Files 的弹层菜单也由 `t3-files.close` 先关菜单、没有菜单才关标签，gate 接受 `<mod>.close`）；同时可停靠和弹层的 mod，键盘 Tab 到停靠副本时也会拦这四键、那时不关东西。仓库 gate 查自己打开的 overlay；Herdr 内置弹层名单升级时另核。

点已开的 popup 按钮，outside press 先关弹层、click 才到按钮；`close()` 写时间，按钮经 `shared/trigger.js`（`trigger()`／`opener()`，内部是 `pressed`＋`justClosed`）避免立刻重开，各弹层用自己的键，所以开着一个时点另一个的按钮仍会打开它。Review 页内弹层也一样：外部按下关闭时写 `review.<名字>Closed`，不再用 300ms 时间窗。`t3-menu`、Files、Review 和详情的菜单经 `shared/popup-menu.js` 登记谁挂在谁下面（子菜单关掉时在它的 `close()` 里把键盘交还上级；Herdr 不许在 render／layout 里 `focus()`，`scripts/render-guard.cjs` 让检查在那里聚焦时失败）：关闭时连带关掉后代，选中一项关掉整条链，子菜单旁开（`openBeside`）；子菜单关闭写各自的 `<mod>.submenuClosed`（详情的 Commits 写 `t3-actions.menuClosed`），上级渲染时读它重绘并收回键盘（`subGone`）。按钮下方的放置统一用 `shared/trigger.js` 的 `hang`。Review 页内子菜单复用 `shared/submenu.js` 的悬停意图/方向键规则。Snooze `Popover` 的 Enter/Space 要绑定在持 focus handle 的面板 context，否则宿主绑定只关菜单、不选项。滚动列表用 `shared/list.js` 同步 pointer/highlight/scroll，另包滚动容器会跟不上按键。

### macOS 菜单绕过布局规则（Herdr 0.1.16）

macOS 菜单的 `File > New Tab`、`File > Close Tab`、`Window > Go to Tab…` 分别直调 `tab.new`、`tab.close`、`mod.open:picker`，不查 `keys.json`，因此不经过 T3 的 Home 规则、关闭确认和 `t3-picker`：New Tab 能在 Home 里再开标签；Close Tab 对非最后一个、仍在运行程序的标签直接关闭（最后一个转成核心 `space.close`，仍可能有原生确认）；Go to Tab 打开的是官方 picker。键盘绑定仍走 T3，不能从菜单显示了同一个快捷键推断两者行为相同。

这是宿主限制：核心命令优先于 mod 命令，不能覆盖；菜单动作从终端的宿主元素冒泡，不经过各 block 里的 mod，`on_action` 也拦不住。绑定与派发依据为 Herdr `src/macos.rs`、`src/window.rs`；命令行为已有独立演示窗回放，真实菜单点击未验证。不在布局加模拟拦截层，本轮不改代码、不提上游。

## 尺寸、滚动与重排

文字截断提示统一经`shared/measured-text.js`：显示文字量容器，零高、不带truncate的副本量自然宽，二者字体／字重相同；只有布局宽度变化才更新。Actions、电脑名和surface tab仅截断或折成图标时提示，split箭头只有aria-label，面包屑／文件树行不放tooltip。T3原有状态／Woke动作提示保留。

`on_size_change` 返回乘 zoom 后像素；布局 resize 用逻辑像素，要除 `settings().zoom`。Actions/end 自定 block 宽，`tabs-row` 不可拖。Compact 在不受标签控件宽度影响的 `bar-measure` 测工作列；在标签区测会因控件收缩而反复开合。macOS traffic lights 是未缩放屏幕点，文件热加载补偿与并发安全写见 storage。

Herdr 普通 scroll area 不能脚本移动。标签条由 `tab-scroll` 裁切、`tab-strip.ml()` 偏移；零高全名副本量完整宽，只有 active/room 改变才修正。侧栏普通列表不能代码 scroll-to-current；搜索/树用可控虚拟列表。Agents 列表超过 50 行时改为窗口化（`mods/t3-agents/main.js`）：行高取自 `planMotion` 已有的条目高度和 y，只画视口内的行及上下各两行，滚轮自己移动，`leavingRows(view, top)` 跟着偏移；首次测量前按 800 高画。宿主的 `v_virtual_list` 行里不能挂处理函数，所以没用它。代价：窗口化时 Tab 只走到已画出的行。200 个 agent、5000 终端时一帧元素从 13,219 降到 427（2026-11-14 实测）。

导航列不用宿主 `h_resizable`：它按 id 留各块大小并随页面等比缩放，面板变宽时会先错误缩放一帧再弹回。共用 `shared/nav-column.js` 自绘边缘，拖动只改本页、释放才保存。`holdWidth` 共用算法但每页独立状态：宽稳定 300ms 后重排；Files 在此之前固定旧 Editor 宽并裁切，Review 保留旧折行列数。Editor 的 soft wrap 配置创建时取，切换后绘制外重建。Files 超过 16KB 的文件被改写或切换 Wrap 时先建纯文本 Editor，着色由 `colorLater` 的 `cx.timer.after` 换上：每次推迟换一个 stamp，旧计时器到点即作废；到点时文件不在显示就不换，等 render 看到仍未着色再排一次，所以隐藏的页面不着色。Files/Review 刷新与缓存生命周期由 storage 定义；本轮仍保留它们的轮询，不改 ADR 0015 的方案。

Herdr 0.1.16 的 `watchFolder()` 返回可取消的 Promise（`FolderWatch.cancel()`）：取消以空数组结束本次等待，只释放这个调用，不影响同目录的其他订阅者。Spaces 为每个本地仓库保留 token 和当前未决等待；仓库无人使用或视图关闭时移除 token 并取消，迟到 Git 读取不发布已离开的仓库。独立 Review 栏在当前目录变化或关闭时同样释放；旧事件即使正在 `check-ignore` 里等待，也不能修改新 token 的状态。保留 Spaces 的 60 秒前台补偿和独立 Review 栏的 10 秒补偿；T3 的 toggle 模式不启动计数监听。Files / Review 面板改为事件刷新另行验证，不把旧版「不能取消」当成当前 API 限制。

## 外部关闭与未读补偿

布局自己关先离开再删；程序结束/Send back/space 消失则来不及，Herdr 已在同一步显示邻居并标 seen。`navigation.js` 只为前一帧未读、仅被这次自动选择带出的 agent 记欠账，离开视野且 seen 回传后写 `herdr.seen=<turn-1>`（官方 Mark unread），一并归还误清 Woke。仍在视野满 3s 即真实已看；失败仅首次提示、有效期内重试。记忆仅本次运行，不做跨重启猜测；标签写法/归属由 storage 和 `shared/labels.js` 管。

## Review 的文字与树

`rows.js` 从 `vendor/char-width.js` 取宽度表（`scripts/vendor.sh` 用 get-east-asian-width 和 Unicode mark/default-ignorable 生成）：宽/全角 2，组合/连接/变体及被连接字符 0，其余 1；断行避开组合和被连接字符。分别量代码字体的 `0` 与 `中`：后备 CJK 字体每字未必等于两倍拉丁宽，未量到前才用两列。行到达时在读取任务 `clipRows` 建累计列宽；宽度变化只算行数，ASCII 除法、非 ASCII 在累计宽上二分，实际切分仅给可见行，不在每次绘制重算整份 diff。

组计数 `tabStats` 在读入/已看变化时算，不因 Herdr 任意重绘反复遍历。树的文件夹行勾选状态用 `files.js` 的 `underFolders`：建树后按组一次建好「文件夹 → 其下文件」，随 `treeOf` 失效；每行过滤整组是行数 × 文件数，悬停显示缩进线也会触发。Files 搜索的 `rankPaths` 只保留前 200 条、每 5,000 条让出一次，和 `filterPaths` 一样：一次排完 11 万条以上的命中会被中断。读入时一次规范化文件自然顺序，diff、行请求、j/k 同序。子组路径用 `group:<key>/src` 隔离同名目录，不能把子组合并成 lone folder。吸顶文件头需先垫 `background`，半透明 selected 不应透代码；unchecked 颜色先展开短 hex，再缩原 alpha，边框保原色。

## 壁纸转换而非用户生命周期

`extras/mods/asciicn-wallpaper/ascii-art.js` 是运行时把图片画成 `.ans`、再把 `.ans` 转成图块的唯一实现；内置画的图块已固定在 `scenes/`。asciicn无CLI/包。`imagePlan`按96格行、比例16–480列、格宽高比0.5算cover矩形，草稿就是Braille的采样网格（列×2、行×4，各模式最细的一档）：由系统缩放器直接出（sips、ImageMagick `-resize`），BMP base64一次回读，解码支持24/32位及两种行序。`sampleImage(pixels,style,plan)`对草稿做整块面积平均得到其他模式的网格（Braille原样用）；RGBA在草稿中复用，不重读原图。不照网站在JS里做4倍超采样再块平均：字形逐格一致率87–99%（Braille最低），整图看不出差别，选图到预览快5–10倍（用户拍板）。同一份采样RGBA的字形及每格RGB仍须与真正 `mapTones` 逐格一致，不能用手抄算法当oracle。

宿主`exec`静默丢弃stdout超过8MiB的尾部；网格草稿最大960×384，BMP约1.1MB、base64约1.5MB，一次 exec 读完。`decodeBmp` 仍接受分块文本。分配RGBA前检查头部、尺寸与实际解码字节完整度；RGBA转码每4096像素yield，不能按固定64行分块（大宽图会单步卡近200ms）。

Dots/Blocks每格1×1采样，Quadrants为2×2，Braille为2×4；autoLevels两端各裁0.5%，色调夹到[0,1]。Dots是**6档**（空白加5个点），阈值0.1/0.3/0.5/0.7/0.9；Blocks是` ░▒▓█`5档；两种packed字形严格大于0.5才亮。每格颜色平均保留上游gradeRgb默认浮点运算及Uint8ClampedArray取偶行为。新图片取VGA16的OKLab最近槽，不用RGB欧氏距离或6个色相桶；不透明度按HSV value分8档。旧无标记`.ans`仍走原颜色映射。完整画布和空白边都保留，不按内容裁切。

字符用SVG而非text：宿主text吞空格/换行，字体可能把`##`连写。几何字形沿上游glyph，其他字符以暗度条近似（Classic/Dense留待字形支持）。不改 `convert` 的纯半调方格推断；新图片靠头部标记取0.5（见storage）。图块仍按40格切，内置画 `scenes/` 的图块文件因此不变，合成时逐块拼进一张图。采样、色调、映射生成器分块yield，调用方在6ms预算内批处理便宜yield，再让input/paint运行；取消在下一块前结束生成器。切模式先立即绘制选中和spinner，独立代次目录防止迟到写入污染新scene。每个画好的模式（字符和合成图）按模式留在草稿里，切回不再计算；画失败退回上一个画好的模式。

壁纸只有一条绘制路径：图块按主题色合成一张 SVG（`ascii-art.js` 的 `picture`），交给原生 `image()`。不逐块用 `svg()`：宿主的 SVG mask 缓存键含绘制尺寸，切换、改高度或 Zoom 每遇一个新尺寸，就在绘制帧里同步解析、栅格化全部图块（实测50–570ms）。`image()` 在后台线程栅格化一次，之后 GPU 缩放同一纹理，所以拖动、Zoom、方向键只改几何。不透明度写在 `stroke-opacity`／`fill-opacity` 上，不用 `<g opacity>`：后者要离屏合成，慢约4倍。`image()` 没有加载完成回调，新路径的图在后台栅格化期间是空的：换主题时同一张画先留旧路径，直到新图做好并加载好；换画也是（见下段）。主题只有在 render 里读得到，所以 render 发现当前键没图时用 `timer.after(0)` 起一次合成（`pictureOf`，同键只起一次），不在 render 里直接写文件。GPUI 把 SVG `image()` 按声明尺寸的 2 倍栅格化（`SMOOTH_SVG_SCALE_FACTOR`），所以 SVG 声明 Home 显示它的设备像素，纹理是设备像素的 2 倍（尺寸、档位和重做规则见 [wallpaper spec](specs/wallpaper.md)「Picture size」）：纹理只到设备像素时，比像素小的点在 1x 上明显发灰发虚，2 倍才接近原来。2026-11-15 前一律声明 4096，即 8192 的纹理。已解码的图按路径留在宿主缓存里（mod 无法释放），本运行看过的画、长大前的小图都留着。2026-11-15 VM 实测 footprint（显示中的画加预载的另一张，900×560 窗口）：16:9 照片 1x 从 699MB 降到 107MB，2x 从 716MB 降到 289MB；2.5:1 的 Braille 宽图 1x 622→335MB，2x 689→575MB（宽图铺满时本来就宽，2x 上几乎省不下）。屏幕缩放没有给 mod 的 API：`screenScale` 用 `osascript` 问 NSScreen，按窗口中线的 x 对屏（GPUI 的窗口 y 是相对自己那块屏的）。

图片加载与等待。`image()` 在后台栅格化，没有完成回调，自己的 `on_size_change` 也不触发（实测）。但 GPUI 只在拿到图后才给不设尺寸的 `image()` 定尺寸，包住它的 div 的 `on_size_change` 会触发：`layers()` 在一个 0×0、`overflow_hidden` 的盒里放一份不设尺寸的新画，外层 div 报出宽度大于0时算加载好（`loaded`），才把新画换上；之前一直画上一张（`held`）。图层按图片路径做 id，新画是新元素，直接以目标不透明度出现，没有淡入。`loaded` 只留这一帧画着的路径（显示的和下面的 warm），其余每次 render 删掉：宿主会放掉不再画的图，再切回来时重新探测（缓存还在就下一帧报尺寸）。2026-11-15 实测：留着不再画的路径，换回它时会当成已加载直接换上，而宿主要从文件重新栅格化，Home 空了约0.8s。Home 的第一张画没有上一张可留，探测到之前 Home 是空的。

明暗切换不能靠「留上一张」：上一张是按旧明暗配色画的，浅色主题的纸面画（深色墨）放到深色底上几乎全黑，反过来是一片发白，等新图转换加探测要 0.5–1.9s（2026-11-15 VM 实测）。所以显示中的画加载好后，`warm()` 从 `settings()` 的 `theme_light`／`theme_dark` 和 `themes()` 取另一明暗主题的颜色（叠上 `settings().colors`），在后台做出那一张，用同样的 0×0 探测副本（`wallpaper-warm`）一直画着：一直画着宿主才不放掉它，所以它留在 `loaded` 里。切换的那次 render 里键已做好、已加载，新画与新底色同一帧出现。代价是多留一张载入的画（大小同显示中的那张，见上）。窗口变大时先做显示中的那张，它换上后另一张才按新尺寸重做，免得两张同时栅格化拖慢眼前这张。另选一个主题（不在当前这对里）仍要等它的图，期间留上一张。宿主放掉不再画的图后，只能从文件重新加载：同明暗旧调色板的文件被删时，它在 `pictures` 里的键也要删，否则切回那个调色板时路径还在、文件已无，探测永远不报尺寸，Home 停在上一张（2026-11-15 前的「黑屏」之一）。新画不从 opacity 0 渐显（上一张同帧拿掉，Home 会先空一帧、再暗几帧），上一张也不垫在下面（透明底的点阵叠在一起）。

等待提示统一走 `track(key, on, cx)`：渲染时第一次看到某个等待才开始计时，150ms 内结束就不显示，显示后至少留300ms；草稿的等待键带草稿 id，Cancel 时一并清掉。图片读取的进度来自 `readImage` 各步骤结束时的回调（读图占进度条前一半，第一次画占后一半），不是估算的时间。

不做渐进预览：先显示读到的原照片再换成点阵，画风会跳，只早0.25–0.45s；换模式时上一个模式的画就是粗预览，降分辨率也省不了字符转图块的耗时。

取景输入（`framing.js`）。滚轮事件的 `delta_lines` 只在带刻度的滚轮上出现（macOS `hasPreciseScrollingDeltas == NO`），触控板和 Magic Mouse 没有；据此判别：有 `delta_lines` 纵向缩放（6格翻倍）、横向占优时平移；没有时平移；带 ⌘ 或 Ctrl 一律缩放（200px翻倍）。缩放以指针为锚：`zoomAt` 先求指针下那一点在画上的比例位置，缩放后把它放回指针下，再把对齐比例钳在[0,1]。macOS 的惯性滚动没有单独阶段，抬指后照样以 `moved` 送达：收到 `ended` 后，间隔小于100ms的连续事件丢弃，`started` 或停顿≥100ms恢复。gpui-kit 没有暴露 GPUI 的 `PinchEvent`（`on_pinch`），捏合由 ⌘ 加双指滚动代替。取景卡浮在画布上、宿主没有 occlude：卡片自己的 `on_mouse_down`／`on_scroll_wheel` 先 `stop_propagation`，不让底下画布开始拖动或缩放；Zoom 行上滚动以 Home 中心缩放。`on_drop` 没有 drag-over 事件，拖入时无法高亮。

`+` 的菜单是本 mod 以 `props.menu = "add"` 开的 popup 副本：它没有 Home 的草稿，Choose image… 通过 `run("asciicn-wallpaper.add:<token>:image")` 回到开它的那个 Home（`nextCommand` 会送到每个副本，token 只认自己开的那次）；打开目录在菜单里直接执行。菜单 `close()` 盖 `asciicn-wallpaper.menuClosed` 时间戳，`+` 用共享 `trigger.js`，靠它判断第二次点击是关闭。keys.json 因此要有 `mod:asciicn-wallpaper` 一节；Home 停靠副本拿焦点时这几个键也会被拦，那时什么都不关。

原生 chooser 按 `window().platform`，不加 macOS `activate`（多等约2s）或 `default location`（Downloads 会请求目录权限，所以也不监视「下载」文件夹）。Windows 菜单不列两个选文件项，靠拖入和目录。EXIF 方向：`sips -g` 报存储尺寸、不报方向；`-z`／`-c` 按存储方向工作，写BMP时才应用方向标签。故 macOS 用 `osascript -l JavaScript` 经 ImageIO 读 Orientation（读不到当作1），5–8（侧放）时按转正后的宽高做计划、给 `-z` 的宽高对调，BMP 写出来已转正；2–4 的镜像和180°也由写BMP完成。不再先把整张原图转正成BMP（48MP 约0.57s）。sips 一次调用里同时 `-c` 和 `-z` 时，裁切量大就出错尺寸（极宽或极高图，例：应得32×384得32×307），所以分两步：先把整张缩到「裁切区正好是网格」，再在小BMP上 `-c` 裁出网格。Linux 每次 `convert` 带 `-auto-orient`，尺寸也经它读。浅色主题取 `settings().dark === false`；纸面取反在 `ascii-art.js` 的 `PAPER`：ramp 倒读、象限／Braille 掩码取补，色阶按暗度（1−亮度）而非HSV明度。导入/草稿/保存的路径、缓存键、分块原子发布、并发作废与清理条件只在 storage 维护，改这些先读它，不在这里写第二套规则。
