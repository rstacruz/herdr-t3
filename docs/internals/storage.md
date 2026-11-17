# 数据存在哪里、怎么取名、怎么读写

布局里凡是要保留到下一帧之后的数据，都按本文存放、取名和读写。本文是唯一出处：新增一种数据、改一个键名，先改这里。

## 六个地方

先问两件事：谁要看到它，它要留多久。答案决定存放位置。

| 存在哪里 | 放什么 | 谁看得到 | 留多久 | 例子 |
|---|---|---|---|---|
| 终端标签 | 某个终端（agent）自己的事实 | 每个窗口、每台机器 | 和终端一样长 | `settled`、`snoozed`（早于取名规则，不带前缀，不像 `herdr.seen`、`pi.session`） |
| 共享状态 `shared()` | 本机几个 mod 共用的数据 | 本机所有 mod、所有窗口 | 重启后保留 | `t3.pins`、`t3.settings` |
| `localStorage` | 一个 mod 自己的界面状态（折叠、筛选、收纳区开合） | 只有这个 mod 副本 | 重启后保留 | Inbox 的 `scope`、`settled.open` |
| 内存 | 本次运行的记忆 | 只有这个 mod 副本 | 重启就没了 | `navigation.js` 的 `trail`、`lastIn`、`fresh` |
| 布局文件 | Herdr 没有命令能改的布局字段 | Herdr | 直到下次更新覆盖 | `traffic_lights` |
| 用户文件夹 | 用户放进来的文件，和由它们生成的缓存 | 读它的 mod，以及用户本人 | 直到用户删除 | `<appHome>/asciicn-wallpaper/*.ans` |

- **终端标签**只经 `shared/labels.js` 的 `writeLabel` 写：它统一报错（`Couldn't update the agent`），返回是否写成；`quiet` 用于会重试的写入，只在第一次失败时提示。
- **内存**里的记忆在代码注释里写明「只记本次运行」，必要时附 `shortcut:` 说明何时改为持久。
- Spaces 和独立 Review 栏的目录监听 token、未决 `FolderWatch`、关闭标记只留本次运行的内存；取消后先移走 token，迟到结果只认仍属自己的 token，不重建已释放的监听。
- **用户文件夹**放在 `<appHome>/<用途>/`，不放进 mod 文件夹：`scripts/update.sh` 用 `rsync --delete` 更新 mod，会把它冲掉。生成的缓存放在其中的隐藏子目录（`asciicn-wallpaper/.tiles/`、`.builtin/`），以源文件的 `cksum` 加生成代码的版本号为键，最后写完成标记，所以源文件改了、生成中断、或生成代码换了，都会重新生成；源文件没了，缓存一起删。
- 检查模式不触碰这些文件、Files 图片缓存或主题导出，也不占用本次运行的壁纸 `previewsReady`；只有真实窗口初始化才清理遗留缓存和草稿。隔离入口见 [layout-implementation](layout-implementation.md)。
- **布局文件**只用 `writeTextFile` 带 `expected` 写，在文本里只替换那一个字段，替换后和解析结果核对。`layout.set` 会清空 Herdr 记的点击状态（侧栏宽度、当前 stack、选过的主题），不用于外观字段（[ADR 0009](../adr/0009-settings-hold-real-preferences.md)）。

### 壁纸草稿

壁纸目录 `<appHome>/asciicn-wallpaper/` 里：

- `*.ans`：用户的画（由图片画成），名字即壁纸名（`file:<文件名主干>`）。
- `.tiles/<名>/`：可重建的缓存。`scene.json`（源 `cksum` 加 `VERSION`、几何、`paper`）最后写，作完成标记；旁边是合成图 `<dark|light>-<键哈希>-<像素>.svg`，和每种明暗一份未上色的模板 `tiles-<dark|light>-<哈希>.tpl`。
- `.builtin/<id>/`：内置画的合成图。内置画的图块在 mod 的 `scenes/` 里，只读。
- `.preview/<草稿id>/`：草稿的工作目录。每个代次一个 `frame-<n>/`，画好的各模式都留到 Apply 或 Cancel；读图时还有临时 BMP。

合成图（`library.js` 的 `makePicture`）按「目录、源校验、明暗、调色板」取键，文件名带键的哈希和 SVG 声明的长边像素（[wallpaper spec](specs/wallpaper.md)「Picture size」：按设备像素 512 一档，最多 4096），写成后不再改写，因为 `image()` 按路径缓存已加载的图。所以磁盘上同键、像素不小于所需的文件就是这张图（有几张取最小的）：已保存的画和内置画（几何已知）先查它，在就直接用，重启后不再转换。需要更大时用同一模板按新像素再 `sed` 一张，期间内存里这个键仍指向小的那张，各 Home 照常显示它；需要更小时不重做。写入先写到临时名（不超过 1 MiB 时一次写完，否则分块再拼），`mv` 到位；之后同目录同明暗的其他文件（旧调色板、其他像素、2026-11-15 前不带像素的旧名）都删掉，所以每张画最多留一明一暗两张；被删文件的键同时作废，因为宿主不会再从不存在的路径加载，切回那个调色板要重做。一个键同时只做一张，各 Home 共用；做到一半被取消（草稿换代、转换作废）就不记，下次再做。目录被清掉时，内存里对应的键一并作废。

模板是同一明暗的合成图把颜色换成色名占位（`@ansi1@`），尺寸固定声明 4096，`sed` 上色时换成所需像素，名字取「目录、源校验（含 `VERSION`）、明暗」的哈希：第一次画某一明暗时写下（先写临时名再 `mv`，`mv` 即完成标记），之后换调色板，重启后也一样，只用 `sed` 把占位换成主题色，写成新的合成图，不再读 `.ans` 转换，也不经过 JS。源文件变了，目录随重新转换清掉；校验或版本不同，名字也不同，所以不会用到旧模板。同目录同明暗只留最新一份，所以每张画最多两份，各约一张合成图大小（VM 实测：960×384 Braille 宽图的目录 3.0→6.1MB，682×384 Dots 照片 0.28→0.55MB）。Apply 采用预览图时把草稿的模板一并 `link` 过去，合成图按它做成时的像素命名。

导入图片先建内存草稿：解码像素、采样计划、模式、代次、请求身份、相对构图和 `draft.savedName` 都不提前持久化。图片默认 Dots，切模式只从同一份像素重画，不重读原图；画过的模式留在 `draft.frames`，切回直接用；新代次取消旧任务，迟到结果核对草稿与代次后丢弃。`draft.savedName` 只记这个草稿自己发布过的 `.ans`：Apply 在最终缓存失败时保留草稿和已发布的源；重试只复用自己记下、且内容与草稿完全一致的文件，否则按不覆盖规则另存。每次运行，各副本共用 `previewsReady`，在建第一个草稿前清一次上次遗留的 `.preview/`；之后各自只清自己的目录。

新图片的 `.ans` 以非绘制 OSC `ESC ] 777;asciicn-wallpaper;image-v4;<dots|blocks|quadrants|braille> BEL` 开头，记下 0.5 格宽比、8 档／VGA 主题映射和模式；v4 不透明的空格也带颜色。浅色主题合成时据此把字形取反、按暗度分档（纸面），不需要原图，也不另存文件。读取时只认完整的开头标记并剥离；没有这个标记的 `.ans`（asciicn Studio 导出的、手写的、`image-v3`）转换失败，提示一次，`scene.json` 记为失败，不列出。内置画是 mod 的 `scenes/` 里现成的图块，不经转换。

预览不写 `.ans`，也不改共享的 `asciicn-wallpaper.scene`。**Apply** 保存 `.ans`，它的合成图和 `scene.json` 就绪后才写构图、更新选择并清草稿。当前主题的预览图已做好时，Apply 在 `.ans` 出现之前把它 `link` 进 `.tiles/<名>/`（按保存后场景的键命名），并写好 `scene.json`（暂存文本的 `cksum`），扫描到 `.ans` 时就无需转换；这一步失败或主题已变，照常转换。**Cancel** 保留原来的选择、构图和文件，包括失败的 Apply 已发布的 `.ans`。只保存生成的画，不复制或修改原图。取景按钮对任何画（内置或导入）用它现有的合成图和已存构图开草稿（`draft.saved`），不读文件、不转换；Apply 只写构图表和选择。删除（取景卡底栏的 Delete，只对导入的画）先显示文件名并再次确认，取消不动文件、缓存或构图。已列出的画重新转换期间仍留在显示列表里，带 `redrawing` 标记（Home 留着上一张、取景按钮禁用），转换失败或被删除（另一个 Home 删的也算）才移出；确认删除不依赖这个列表；它使对应的在途转换及等待中的 Apply 失效，正在发布的源要先等它写完再删。取消标记随任务留在内存里，任务结束才释放，防止新旧任务并行写同一缓存。迟到的结果不能发布场景、选择或构图，也不能留下重建的缓存。

`shared("asciicn-wallpaper.placements")` 是本 mod 唯一写入的持久构图表，键为导入画的 `file:<文件名主干>` 或内置画的 id（如 `lighthouse`），值为 `{ mode: "cover" | "contain", zoom: 1..4, x: 0..1, y: 0..1 }`。x/y 表示画布与缩放后图片之间剩余空间的对齐比例；0/0是左上，0.5/0.5居中，1/1是右下。画布／侧栏尺寸变化和主题切换只重算相同参数下的几何，不重转字符画。读取有限数值并钳制范围；无记录保留旧壁纸的主体focus和铺满规则。构图独立于 `.tiles/` 可重建缓存；确认删除后清对应条目，外部源文件消失时也清理（只清 `file:` 键，内置画的构图一直保留）；扫描开始后若有更新构图提交，旧扫描不得删掉新记录。拖动、缩放、重置只改草稿，不写共享表或文件。Reset 保留当前 mode，恢复1倍，x 取画的主体 focus、y 取0.5。

用户文件名保留合法 Unicode、前导短横和普通隐藏名；文件枚举及校验元数据用 NUL 分隔，文件路径按参数而非选项处理。`.ans` 的文件名主干为空、`.` 或 `..`（`.ans`、`..ans`、`...ans`）时安全拒绝，不能把它们用作 `.tiles/` 缓存目录；`.hidden.ans` 等普通隐藏文件照常支持。转换器用40大小图块，展开后的阴影图形低于每次写入1MiB；版本键失配只重建缓存，不改源文件或构图。

Apply 保存时，在独占的 `.preview/save-<unique-id>` 写入文本（不超过 1 MiB 时一次写；否则在 `<它>.parts/` 写分块，每块最多 64K 个 Unicode 字符，低于 `writeTextFile` 的 1 MiB 上限，再拼成完整文件），然后通过 POSIX `link` 原子发布目标 `.ans`；已有文件、符号链接或目录都不覆盖。成功或失败都清理自己的保存目录，源图和其他草稿保持不动。

确认删除先等待同名、已启动的源发布收口再删文件，避免发布落在删除之后；等待中的重试收到删除取消标记后不能再发布源文件。发布 promise 和 Apply 取消标记都只留本次运行的内存，任务结束即释放。

## 共享状态的键名

布局 mod（`mods/`）带数据的键都列在 `shared/store.js` 的 `KEY` 里，代码只写 `KEY.<名字>`，不写字面量；`extras/` 里的 mod 按同一取名规则管理自己的键；布局也要读的 `review.shown`、`review.status` 只在 `shared/panel.js` 命名一次（`REVIEW_SHOWN`、`REVIEW_STATUS`）。取名按写入方：

- **`<mod>.<name>`**：只有一个 mod 写，其他 mod 可以读。`t3-tabs.home`、`t3-inbox.rows`。
- **`t3.<name>`**：几个 mod 都写，或者属于整个布局。`t3.pins`、`t3.notice`、`t3.settings`。
- `<name>` 用 lowerCamel：`t3.spaceIcons`、`t3.agentOrder`。

两类按约定取名，不进 `KEY`：

- **弹窗关闭时间戳**：mod 整个就是一个弹窗时用 `<mod>.closed`（`t3-picker.closed`）；mod 平时是别的东西、另外还会以某种弹窗打开时用 `<mod>.<那种弹窗>Closed`（`t3-agents.sortClosed`）。键名只经 `shared/store.js` 的 `closedKey(mod, popup?)` 生成，读写两边不写字面量（`check-store.cjs` 扫描把关）。由弹窗的 `close()` 写，打开它的控件用 `shared/trigger.js` 读（内部是 `focus.js` 的 `justClosed`），按钮的 on 态也由它与打开时间比出来。Review 页内弹层不是 mod 弹窗，外部按下关闭时由页面写 `review.<名字>Closed`（`settingsClosed`、`scopeClosed` 等）。
- **名字由别人定的键**，照用：和 Herdr 自带 mod 共用的 `layout`、`space.colors`、`agents.sort`；Inbox 的 mod 卡片约定 `<mod>.program`、`<mod>.status`、`<mod>.titles`。

Review 的树菜单也是本 mod 的原生 popup，复用 `shared/menus.js`：顶层关闭写 `closedKey("review", "menu")`，子菜单写 `closedKey("review", "submenu")`。开启行的 id／时间只记本次运行；路径、来源 space／tab、删除标记只随 popup props 传递，不改变当前文件或已看状态。

## 读写

`t3.settings` 默认 `{ afterAway: "home", homeMod: "t3-home" }`，Terminal 存为 `homeMod: null`。`t3-actions.actions` 是 `{ list: [{ id, name, command, icon, place, cwd? }], last }`，全局一份。`t3-inbox.rows`、`t3-agents.rows` 发布各自画出的 `{ order, view }`，供上／下 agent 键走同一顺序。重启保留 pins、settings、每 space 面板、Home id、最近 pane（`t3-tabs.recent`，至多 30 个）和终端标签；最后看的 agent 和关闭历史只在内存里。

`t3.panels[space]` 只存 `{ tabs, active, open, wide }`，由 `shared/panel.js` 写；增删改规则在纯函数 `shared/surfaces.js`。标签为 `{ id, born, reveal, path?, folder?, trail? }`：`files`、`file:<相对路径>` 或 `review`。`born` 是标签实例号（比本副本给过的都大的毫秒数），关闭再加就是新实例；各 mod 自己比对 `born` 释放旧实例的状态，面板不写别的 mod 的键。`reveal` 是该标签被选中的次数，Files 见它变化就清搜索并定位（T3 的 revealRequestId）。没有 `tabs` 的旧记录（固定页时代的 `page`）从空列表开始，不迁移；首次写入只保留上述字段。布局 stack 子块只是渲染位，空列表选 `panel-empty`；Herdr 自带布局的 stack 没有此块，面板不存标签（`panelState().owns` 为假）。

`t3.openTarget` 在Files／详情之间全局只保存一个目标名，不保留本轮旧键迁移；本机每次运行共用 `globalThis.t3OpenInTargets` 的 `{version:3,promise,names}` 并行应用检测，名单版本变化即替换旧缓存，目标卸载时失效并回退Finder。已完成名单可经knownTargets只读访问，避免热加载时旧init任务丢失使Files永久只留Finder；绘制不等待promise或扫描应用。候选仅取T3完整编辑器表，以macOS LaunchServices查安装（GUI进程PATH可能没有CLI）；绘制和打开菜单不扫描。最后一个非 null 的活动终端（space/tab → terminal/cwd/pane）只保留在本次运行的 `globalThis.t3TerminalContext`，与 focus.js 一样依赖宿主当前共用 JS context；终端关闭即移除。Insert 短暂借用文本剪贴板，粘贴后恢复；图片剪贴板不覆盖，用户在延时内新复制的内容优先。

Files 的树按 space 共用，文件阅读位置按标签实例只记本次运行；每个 space 仅最近显示的三个文件标签保留预览和 Editor，更早标签从顶部重读；关闭立即释放。页级最近三个 space 的边界照旧，因此最多九个文件 Editor。`review.shown[space]` 存 `{ root, page, base, label, born? }`，`label` 是 Review 范围按钮的字（提交读到后为标题），供详情的 Review 行照写；`born` 是写它的 Review 标签实例（`panel.js` 的 `surfaceBorn`，Herdr 自带 stack 里没有）。读的一方（Review、详情、Review 栏）都经 `panel.js` 的 `reviewShown(space)`，只认 `born` 与当前 Review 标签相同的记录，所以关闭再加的 Review 从默认范围开始。`review` 请求 `{ space, root, page, base?, n, analyze, born? }` 只由 `panel.js` 的 `reviewRequest` 写（Review 页自己的范围菜单、Review 栏和详情共用），同样带 `born`：先 `showPage("review")` 再写请求，Review 不接手发给已关闭标签的请求。Review 的内存副本按实例号驱逐，迟到读取失效。范围菜单的读数（`review-scope.js` 的 `scopeCache`，按「仓库根 + 对比基准」）和详情记的各 space 仓库根（`review-details.js` 的 `roots`）只记本次运行，各 mod 副本各一份：新开的菜单先画它，后台照常重读，迟到读取照 `live()` 丢弃。详情来源和弹层 id 只通过 popup props 传递，不写持久状态；本机机器名在弹层启动时读取。

`globalThis.t3Titlebar` 只记本次运行测到的面板宽度（t3-chrome 的面板头），供键盘打开详情时锚定到同一入口；面板关着时详情的位置由 `panel.js` `windowEndPx` 和布局的 `tabs-end-inset` 算出，不靠测量。读写都经 `shared/titlebar.js`（`notePanelWidth`、`detailsAnchor`）；不写共享状态或磁盘。Files 的 Insert 借剪贴板粘贴路径，进行中只记本次运行的 `globalThis.t3PastePending`，防止连按把剪贴板换成半截；约 150ms 后放回原剪贴板并清掉。Insert 拒绝带控制字符的路径，防止粘贴成为终端控制输入；Copy path 仍可用。

详情只记本次运行的 `globalThis.t3Details.id`（打开着的详情 popup）。t3-menu、Files 和详情的菜单谁挂在谁下面，只记在本次运行的 `globalThis.t3Popups`（`shared/popup-menu.js`：overlay id → `{ mod, parent, kind, back? }`），用于行和split的开启态、关闭时连带关掉下级菜单，以及子菜单自己关闭时把键盘交回上级（`back`）；关闭即删。Commits 子菜单打开时从本次运行的 `globalThis.t3DetailsRange`（打开着的范围菜单）取已读到的提交，不再读 Git。都不写共享偏好。Open in菜单选择只更新既有全局目标名，真正执行只在主按钮点击发生。全局Actions的数据归属不改成项目脚本，已有动作不迁移或删除。

`t3-actions.detailsItems` 保存详情中可用项目的显隐偏好：`environment`、`openIn`、`scripts`、`review`。默认全开，只存与默认不同的 `false`；Reset 清空。卡片右键与所有详情副本共用这一份，不存未知项目或缺少后端的T3功能。全隐藏仍显示 Choose what to show 入口，不改变Actions数据、面板标签或Git仓库。

详情的 Review 行与 Review 页共用`shared/review-scope.js`（读取、行、Commits 子菜单的内容与按键；Review 页的标题、base 选择和页内菜单在它自己的 `scope-header.js`）：范围菜单每次打开都重读计数、提交和refs，不缓存；迟到结果只在读取凭据、root、space和所选base都没变时生效，菜单关闭或驱逐即作废。范围选择继续写既有`review`请求和`review.bases`；不新增持久范围。详情的范围菜单没有base选择；选范围收起详情。


- 几个 mod 都要读写的数据，经 `shared/` 里的一个模块读写，默认值也写在那里：置顶经 `shared/pins.js`（`pinList`、`pin`、`unpin`、`putBack`），布局设置经 `shared/layout-settings.js`。所以 Pin 不管从哪里点，都会结束 Snooze；Undo 不管从哪里点，都会把置顶放回原位。
- 只有一个 mod 读写的键，在那个 mod 里写 `shared(KEY.x) ?? 默认值`。

Markdown 文件显示预览还是源码是 `t3-files.markdown`（`"code"` 或 `"preview"`，未设为预览），全局一份。Files 的树选中行、搜索中的折叠集合、目录 loading/error 仅存本次运行，不写 shared 或磁盘。Files 的菜单是本 mod 的原生 popup，登记在 `globalThis.t3Popups`（见上）；顶层菜单关闭写 `t3-files.menuClosed`，子菜单关闭写 `t3-files.submenuClosed`（按「弹窗关闭时间戳」约定）。Insert into agent terminal 借剪贴板粘贴的 150ms 内，本次运行的 `globalThis.t3PastePending` 为真，再按不重入。内部树选择打开文件时保留搜索；选标签（`reveal` 变化）／open 命令清搜索并 reveal。Files 自己打开文件后记下当前标签的 `id:born:reveal`，下一帧不把它当作外部选择。树仍按 space 共用，不复制每标签树。`t3.panels` 的目录标签复用 `file:<path>`，加 `folder:true` 与可选的 `trail`；根目录仍是 `files`，`trail` 保留原文件面包屑。此为新增标签元数据，已有文件标签不迁移、不写文件内容。

`shared/measured-text.js`的`nameW`／`textW`仅记本次运行各文字的自然宽／容器宽，供同一份nameText／named／measuredTooltip判断截断。原生布局回调按zoom归一化，宽度未变不notify；不以字符数估算，不在每次重绘重新测量。

## `localStorage` 的键名

小写单词，用点连接，写成 `<东西>.<状态>`：`settled.open`、`repos.folded`；只有一个词就够时用一个词：`scope`、`changes`。每个 mod 副本各有一份，不加 mod 前缀。

Files 和 Review 各自保存 `lines.wrap`（布尔字符串）、`nav.width`（逻辑 px）和 `nav.open`。两页复用读写函数，但只访问自己副本的 `localStorage`。

两页的完整 space 数据都是本次运行的缓存，每页最多保留最近三个。较早的 space 只留轻量的选择、展开和评审范围等阅读设置；文件内容、Editor、diff 行、换行和布局缓存都要释放。驱逐时使已发出的异步读取失效；迟到的结果不能重新填满已释放的数据。两页使用仅可见时的有界刷新，不保留不可退订的目录监听。关闭 space 时一并清理它的内存记录。
