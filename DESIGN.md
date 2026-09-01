# DESIGN.md — Magic The Traveling 设计系统

## 世界观（visual world）
深色书房里的烫金卡牌室。底为近黑深蓝紫，面板比底亮半度，金棕描边与金箔高光标记可交互与稀有；立绘与 emoji 是内容主角，chrome 退后。

## 色板（tokens，style.css :root）
- `--bg #14141f` 页面底；`--panel #1e1e2e` 一级面；`--panel-2 #101018` 二级面（侧栏/卡片内嵌）
- `--line #2e2e44` 弱描边；`--line-2 #3a3a52` 强描边
- `--text #e8e4d8` 主文；`--text-2 #d8d8e0` 次文；`--muted #8a8a9a` 弱文；`--muted-2 #4a4a60` 最弱
- `--gold #d8b96a` 主金（标题/强调/主按钮描边）；`--gold-bright #ffd700` 亮金（选中/奖励）；`--gold-dim #8a744a` 金棕（按钮描边）
- `--accent #7ab8ff` 链接/信息蓝
- 语义：胜=绿 #5a8a52、败/危险=红 #8a4a4a、选中=金、禁用=opacity .4

## 字阶（roles，唯一来源）
| 角色 | 字号/字重 | 用途 |
|---|---|---|
| display | 20px / bold / 金 / letter-spacing 2px | 页标题（topbar h1、面板主标题） |
| h2 | 15px / bold / 金 / letter-spacing 1px | 区块标题（race-section、rl-title） |
| body | 14px / regular / 主文 | 正文、按钮、列表 |
| label | 13px / regular / 次文 | 表单标签、字段名 |
| meta | 12px / regular / 弱文 | 说明、提示、次要信息 |
| data | 12-13px / regular / 主文 | 数值（攻甲血、金币、计数） |

行高：body 1.45，data 1.2；中文正文不做 letter-spacing；标题才加字距。

## 间距（4px 基）
`--s1:4px --s2:8px --s3:12px --s4:16px --s5:24px --s6:32px`
- 面板内边距 = s3~s4；组内间距 = s2；组间间距 = s4~s5；页面边距 = s3。

## 圆角与高度（elevation）
- 圆角：面板 `--r-lg 14px`、卡片/按钮 `--r-md 10px`、小控件 6px。
- 高度只有一档：模态 = `0 8px 24px rgba(0,0,0,.45)`；其余一律用 1px 描边表达层级，禁止阴影+描边叠加的 ghost card。

## 组件
- **按钮**：`.btn` 基础（棕底 #4a3b22、金棕描边、body）；`.btn-primary` 主操作（金）；`.btn-danger` 危险（红）；`.btn-ghost` 弱操作（透明底 muted 文）。hover 亮一档、active 下沉 1px、disabled opacity .4。
- **面板**：surface-1 = `--panel`（浮层/卡片），surface-2 = `--panel-2`（侧栏/内嵌），surface-3 = 底（页面）。
- **卡牌**：游戏内容卡（db-card/hand-card/minion）保持现有种族底色；界面 chrome 不仿卡。
- **标签**：词条 badge 用 meta 字阶 + surface-2 底 + line 描边。
- **状态**：hover/focus-visible（2px accent 环）/active/disabled/selected（金描边）必须每控件齐备。

## 浏览器表面
滚动条 8px 细深色；选区棕底金字；focus-visible 2px `--accent` 环；caret/输入框同色系。

## 主题（data-theme）
三套同构：default（深色金）/ skeuo（皮革拟物）/ pixel（RPG Maker 像素）。任何 chrome 改动必须三套同步，令牌驱动，不写死色值。
