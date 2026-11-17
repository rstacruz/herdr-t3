# Space 面板由可关闭的标签组成

取代 [0011](0011-one-space-panel.md) 的固定 Files／Review 两页；修订 [0015](0015-panel-pages-stay-independent.md) 的阅读状态生命周期。目录面包屑由 [0018](0018-files-follow-t3-surfaces.md) 修订为同 T3：从文件旁打开目录标签。详情 popup 原在本篇，已拆到 [0019](0019-details-popup.md)。

按 T3 Code `09a54f01` 的 surface 交互，每个 space 保存标签列表、活动标签、开关和放大状态；宽度仍是整个窗口一份。

- 文件各占一个标签，通用 Files 和 Review 各最多一个。通用 Files 打开文件时原位替换，已有文件则激活已有标签并移除通用标签。同名文件照 T3 不区分；名字被截断时 tooltip 显示全名。
- 标签列表的增删改是纯函数（`shared/surfaces.js`），`shared/panel.js` 只存储并摆布局。每个标签有实例号 `born` 和被选中次数 `reveal`。
- 关闭释放由各 mod 自己负责：发现读过的 `born` 不在列表里就释放。面板不写别的 mod 的键。Review 的 `review.shown` 和 `review` 请求都带 `born`，所以关闭再加从默认范围开始，迟到的读取和发给旧标签的请求都不生效。
- 选中标签让它的 `reveal` 加一，Files 据此清空搜索、展开祖先并定位（T3 的 revealRequestId）；Files 自己从树或搜索结果打开文件不算选中，搜索保留。
- 所有文件标签共用一棵 Files 树和一个活动预览，不复制 mod。每 space 仅最近显示的三个文件标签保留 Editor／阅读位置；更早标签从顶部重读，关闭立即释放。宿主没有滚动位置快照 API，这是有界缓存规则，不影响带行号 reveal。
- 隐藏保留标签和阅读位置，且退出放大；切到别的标签不重置 Review。关闭活动标签选右邻，无右邻选左邻；非活动关闭不换活动标签。最后一个关闭时收起面板；重新打开显示 Open a surface。
- Review 读标签工作处的仓库：该标签最后活动终端的 cwd，没有时用 space 文件夹，照 T3 的 diff 面板跟随线程的工作目录。`+` 菜单、空页、`cmd-shift-g` 的可用性和 Review 默认打开的仓库都经 `panel.js` 的 `reviewRepo` 判断，只实现一次。
- Files／Review 里的 `cmd-t`／`cmd-w` 只经 `keys.json` 的 `mod:t3-files`／`mod:review`：`t3-chrome.surface-menu` 在 `+` 下打开菜单，`t3-files.close`／`review.close` 关闭活动标签而不关终端。mod 的 `on_key_down` 不处理这两个键。标签右键只管理标签，不改变 Review 树内定位。
- 标签溢出时用滚轮横滚，‹ › 照 T3 并排在标签条后、到头置灰；横滚与标签栏共用 `shared/scroll-strip.js`。
- 没有 `tabs` 的旧记录（固定页时代的 `page`）不迁移，面板从空开始。Herdr 自带布局把 Review 停在自己的 stack 里（没有 `panel-empty`）时，只显示页面，不存标签。
- 文件树右键的 Insert 拒绝含控制字符的路径，保留 Copy path 作为手动入口。终端路径点击首版未完成：宿主没有链接／点击回调，不以覆盖终端或轮询文本替代。

## Considered Options

- **关闭时由面板清 Review 的范围记录**：面板要知道 Review 的键名，独立安装的 Review 也绑在这个协议上；Review 那边仍要再挡迟到写入，同一件事分在两处。
- **同名文件标签用 tooltip 显示路径区分**：T3 不区分，用户选择照 T3。
- **`cmd-t`／`cmd-w` 只走 mod 的 `on_key_down`**：宿主先把按键交给绑定还是先交给视图，没有文档写明，也未用真实按键验证；若先派发绑定，去掉 `mod:` 分区后 `cmd-w` 会关掉背后的终端标签。`mod:` 分区在两种顺序下都只触发一次，用户改选它。
