# workbuddy.md — WorkBuddy 开发上下文

本文件记录「麦门年鉴 mcd-yearbook」使用腾讯 WorkBuddy 智能体开发的过程与关键决策，用于麦当劳程序员创意开发大赛 WorkBuddy 专项奖励核验。

## 1. 开发环境

- 智能体平台：腾讯 WorkBuddy（Agent 模式）
- 开发日期：2026-10-12（大赛报名期第 4 天）
- 本地工作区：`F:\sparkEat`（git 仓库，remote: github.com/EldonQ/sparkEat）
- 运行环境：Node.js 22（WorkBuddy 托管运行时），零第三方 npm 依赖

## 2. 与 WorkBuddy 的协作流程

### 阶段一：大赛调研（本会话前半段）

用户提供大赛仓库地址（M-China/mcd-developer-innovation-challenge）后，WorkBuddy 执行了：

1. 抓取并研读官方 README、activityGuidelines.md、CONTEST_DECLARATION.md、RANKING.md；
2. 实测用户已接入的麦当劳 MCP：调用 `now-time-info`、`list-nutrition-foods` 验证连通性（返回 160 条官方营养数据）；
3. 抓取官方 RANKING.md（截至 2026-10-12 10:00 的 100 个项目），用 Chart.js 内联图表完成赛道竞争态势分析：省钱/卡路里赛道 30+ 项目严重同质化，派对赛道头部 85★ 但项目少，**个人数据报告/年鉴类几乎空白**；
4. 输出结构化调研报告与三个候选方向对比表，用户经 AskUserQuestion 选定「麦门年鉴」方向。

### 阶段二：MCP 真实结构探测

正式编码前，WorkBuddy 先并行调用了 7 个只读用户接口（order-list / query-my-account / query-my-coupons / available-coupons / query-my-prizes / query-lottery-info / campaign-calendar），实测发现：

- 不同工具返回格式不一致：JSON、Markdown 文本、类 CSV 文本三种形态并存；
- `order-list` 的 `comboItemList` 可拆出套餐内真实单品，是热量精确换算的关键；
- `query-my-prizes` 等带 `status.code` 业务状态字段，需容错。

这一探测直接决定了数据层「多格式归一化」的设计。

### 阶段三：工程实现

WorkBuddy 在单次会话内完成全链路开发：

| 模块 | 文件 | 说明 |
|---|---|---|
| MCP 客户端 | `src/mcp-client.mjs` | Streamable HTTP JSON-RPC 握手（initialize→initialized→tools/call），SSE/JSON 双解析，401/429 错误分类 |
| 数据采集 | `src/collect.mjs` | live / demo / workbuddy 三条通路归一化；营养 CSV 解析、活动日历 Markdown 解析、空卡包文本容错 |
| 聚合引擎 | `src/aggregate.mjs` | 八维统计：消费轨迹、品类、热量、作息、省钱、积分、抽奖、活动 |
| 人格算法 | `src/persona.mjs` | 麦门称号规则权重模型（早餐信徒/汉堡鉴赏家/积分猎人/欧皇本皇等 11 种特质） |
| 渲染器 | `src/render.mjs` | ECharts 四图年报模板，暖白纸面 + 麦当劳红黄编辑排版 |
| CLI | `bin/mcd-yearbook.mjs` | `--demo` / `--token` / `--data` 三种模式 |
| 测试 | `test/smoke.mjs` | 8 项冒烟测试（分类器/解析/聚合/人格/渲染/空数据边界） |
| Fixture | `scripts/make-fixture.mjs` | 确定性种子合成数据生成器（47 笔订单） |

### 阶段四：验证与修复

1. 冒烟测试首轮发现 2 个问题：分类器漏匹配「巨无霸」（"霸"非"堡"）、测试断言自身错误——均已修复，8/8 通过；
2. 无头 Chrome 截图验证发现图表空白：根因是 CDN（cdnjs）在当前网络环境不可达。**决策：将 ECharts（1MB）内联进报告 HTML**，使报告完全自包含、离线可开——这对评委查看体验是关键改进；
3. 用阶段二捕获的真实 MCP 响应验证 `--data` 通路（第三条数据通路），确认真实数据下全链路可用。

## 3. 关键工程决策

| 决策 | 理由 |
|---|---|
| 只用只读工具 | 演示与运行零资金风险，符合 MCP 服务规则 |
| ECharts 内联而非 CDN | 报告单文件自包含，断网可开，便于分享传播 |
| 三条数据通路（demo/token/data） | 评委无 Token 也能 `--demo` 秒开；Skill 场景走 `--data` |
| 合成 fixture 确定性生成 | 可复现、无真实用户信息，符合参赛声明 |
| 账号 ID 脱敏 | 隐私合规 |

## 4. 本项目对 WorkBuddy 能力的使用

- MCP 连接器（麦当劳 mcp-mcp）：数据源与真实结构探测；
- Agent 模式多工具协作：WebFetch 调研、Bash 工程执行、Chart.js 可视化分析、无头 Chrome 视觉 QA；
- 任务管理（TaskCreate）：7 项任务拆解与跟踪；
- 可视化（show_widget）：赛道竞争态势图，直接支撑方向决策。

## 5. 致谢

感谢麦当劳中国提供 MCP 开放能力，感谢腾讯 WorkBuddy 作为大赛官方合作伙伴提供开发平台。
