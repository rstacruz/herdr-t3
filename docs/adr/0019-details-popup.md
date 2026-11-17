# 详情是主工作区按钮下的原生 popup

原属 [0017](0017-space-panel-surfaces.md)，2026-11-14 拆出：详情和面板标签是两件事。

详情是主工作区按钮下的原生 popup，不是标签。Workspace 放 locked 机器／目录、Open in、全局 Actions，下面是 Review 行：主半边显示Review，箭头开Review范围菜单；不含分支切换、PR信息或Git写操作。打开时捕获来源，space／终端标签改变即失效。面板入口在窗口右上，打开面板收起详情；放大时进入详情先恢复工作列。

宿主验证已确认本机 `open -Ra`／`open -a`：Open in 列 Finder 和已装编辑器，全局记上次目标，缺失回退 Finder，远程置灰。

详情按 T3 `threadDetailsPanelStyles.ts` 的整行／locked／split 结构实现，尺寸颜色取本仓 token。机器行无 hover／chevron，folder 仅 tooltip，整行右键复制；Open in 菜单只选偏好、主按钮执行。Actions 保持全局数据，有动作 split、空时 Add action，编辑保留父详情。split 菜单同整行宽、开启时保留中线／on底。卡片右键可切四个实际实现项目的显隐并Reset，全隐藏保留恢复入口。Review 行的范围选择和Review页同源，计数／提交在绘制外异步读取，每次打开重读、不缓存，来源变更即作废。证据与宿主差异见本任务报告，不以静态截图声称真实鼠标通过。

Review 行选范围时先添加或选中 Review 标签，再写带该标签 `born` 的请求（见 0017），所以关闭后再加的 Review 不接手旧请求；它显示的当前范围只取 `born` 与当前 Review 标签相同的 `review.shown` 记录。

2026-11-14 重写（审查后用户拍板）：菜单打开时不预先高亮任何行；Review 还没显示过范围时范围菜单不打勾；动作名被截断时才给提示；文案用 GLOSSARY 的词，不照抄 T3；删掉范围快照缓存，每次打开重读；Review 行的来源规则与详情相同，只看 space／标签／终端是否还在。每层菜单都是独立的原生 popup，挂在它的行下或旁边，和 t3-menu、Files 的级联同一套做法；不再用一块透明大画布装下范围、Commits 和 base 三层，因为透明部分也挡输入。范围菜单只选范围，base 和 commit 的 ‹ › 留给 Review 页。主半边不恢复已关闭 Review 标签的范围（同 0017 的「关闭即释放」）。只有详情本身盯来源，下级菜单随它关闭；共享的 `review-scope.js` 不认识详情，宿主视图提供 `pick` 和 `openCommits`，请求一律由 `panel.js` 的 `reviewRequest` 写。

2026-11-15（用户拍板）：Quick Review 改名 Review。详情可用键盘操作：键盘打开时第一个控件带焦点环，↑／↓ 换行、←／→ 换 split 的两半；键盘打开的行菜单首行点亮，关闭后键盘回到它的箭头；电脑名行不进方向键。
