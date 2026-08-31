# AGENTS.md — Magic The Traveling（使魔卡牌对战）

单文件网页卡牌对战游戏（H3 题材，13 阵营 274 卡），零构建纯静态，GitHub Pages 部署。
在线地址：<https://lychees.github.io/Magic-The-Traveling/>

## 快速命令

```bash
# 改卡后必跑：校验 cards.json 并注入 index.html 内嵌 #cards-json 块
node tools/sync-cards.js            # 仅校验+注入
node tools/sync-cards.js --recompute # 附带按公式重算全部 rating

# 本地预览（holo 3D 模块走 importmap，必须 http；主游戏 file:// 可玩）
python -m http.server 8474 --bind 127.0.0.1   # 注意：8931 端口被别的项目占用，固定用 8474

# 部署：.deploy/ 是 GitHub 仓库 lychees/Magic-The-Traveling 的克隆（Pages 跟踪 main 根目录）
cp index.html cards.json README.md style.css .deploy/ && cp -r js tools docs .deploy/
cd .deploy && git add -A && git commit -m "..." && git push origin main
```

## 文件地图

```
index.html        游戏本体：HTML 骨架 + 内嵌 cards-json + 全部游戏脚本 + holo 3D 模块
style.css         全部样式（步骤 2 从 index.html 抽出后）
cards.json        卡牌唯一数据源（cards 数组 + races + _comment 字段说明）
tools/sync-cards.js  校验 cards.json 并注入 index.html 内嵌块；--recompute 重算评分
tools/rating.js   战斗力公式唯一数据源（UMD：游戏页与 sync 工具共用）
docs/             平衡性评审.md、roguelike设计.md、引擎结算.md
.deploy/          GitHub Pages 仓库克隆（部署目标，所有产物拷这里提交）
.tmp-test/        本地 playwright 测试脚本（不入库）
```

## 测试

- 语法检查：`sed -n '/^<script>$/,/^<\/script>$/p' index.html | sed '1d;$d' > .tmp-test/game.js && node --check .tmp-test/game.js`
- playwright（Python，机器已装）：脚本在 `.tmp-test/`，跑前先起 8474 服务。
  常用套件：`test_cardeditor.py`（编辑器）、`test_edges_full.py`（闯关连线通关）、`test_album_claim.py`（集卡册领取）、`test_paramtraits.py`（参数词条）、`test_branchmap.py`（分支地图）、`test_sfx_flow.py`（撕包音效流程）。
- 探针注意事项：
  - `playCard()` 等引擎函数**不会**触发 `render()`（真实 UI 由点击处理器补 render）；探针直接调 API 后需 `window.render()`。
  - 调试游戏状态用 `window.__api`（主脚本导出）；holo 模块用 `window.__holo`。
  - 点 3D 场景坐标要先算（相机 fov 35°、z=16，世界坐标→屏幕换算）；左侧调试面板会挡住点击。
  - headless 帧率低，动画计时被 `dt≤0.05` 钳制后实际耗时是真实时间的数倍，等待要给足。
  - 打印含 emoji/❤ 的字符串在 GBK 控制台会崩，探针输出避开。

## 硬约定（违反就会出 bug，全都踩过）

1. **cards.json 是唯一卡牌数据源**。改卡只改它，然后跑 sync；不要手改 index.html 内嵌块。
2. **index.html 为 LF 行尾**（曾混合 CRLF 导致补丁锚点失效）。编辑前 Read 再行内 Edit；大段替换用 node 脚本。
3. `window.__holo.xxx` 赋值必须在 `window.__holo = {...}` 字面量之后或作为其方法，否则 holo 模块初始化崩。
4. 替换函数时别留旧定义（JS 后定义者生效，易留双份）。
5. 测试断言别硬编码血量/法力（攻击次数、费用都会消耗它们）。
6. **跨模块接口**（改之前先看谁消费）：
   - `window.__api`：主脚本 → 探针/测试的游戏引擎接口
   - `window.__holo`：主脚本/holo 模块互调（open/openAlbum/openPack/openBox/close）
   - `window.__drawCardFace`：holo 模块 → 主脚本/编辑器（卡面生成器）
   - `window.VIEWER_TEXT`：词条/战吼/单位法术/法术效果描述表（VIEWER_TEXT 脚本块）
   - `MTCG_RATING`（tools/rating.js）：评分公式（ratingTraitW/edRating 委托给它）
7. **新机制注册点**：新词条要在多处登记——cards.json traits、VIEWER_TEXT.traits、引擎结算处（traitLv/特判）、ratingTraitW 权重、编辑器词条列表（参数家族还要 ED_PARAM_TRAITS）。
8. localStorage 键：`mtcg-collection`/`mtcg-gold`/`mtcg-albums`/`mtcg-run`/`mtcg-memorials`/`mtcg-config`/`mtcg-card-overrides`/`mtcg-custom-cards`/`mtcg-econ-v2`。

## 部署后验证

推送后 GitHub Pages 自动发布（约 1 分钟）。线上地址即 README 顶部链接；
本地 8474 预览与线上行为一致（同源静态文件）。
