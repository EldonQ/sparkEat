# MCP_INTEGRATION.md — 麦当劳 MCP 集成说明

本文档说明「麦门年鉴 mcd-yearbook」实际使用的麦当劳 MCP Server、工具、调用流程与业务价值。

## 1. MCP Server

| 项 | 值 |
|---|---|
| 服务名称 | 麦当劳中国 MCP Server |
| 接入地址 | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 认证方式 | 请求头 `Authorization: Bearer <MCD_TOKEN>` |
| Token 申请 | https://open.mcd.cn/mcp （手机号登录后在控制台激活） |
| 限流 | 每 Token 每分钟 600 次请求（超限返回 429） |
| 服务规则 | https://cdn.mcd.cn/cms/pages/MCPServerRules.html |

配置文件示例见 [mcp-config.example.json](./mcp-config.example.json)（仅使用环境变量占位符，不含任何真实密钥）。

## 2. 实际使用的工具（8 个，全部为只读工具）

| # | Tool | 用途 | 在年报中的章节 |
|---|---|---|---|
| 1 | `order-list` | 历史订单（含套餐子项 `comboItemList`） | 01 消费轨迹 / 02 品类偏好 / 03 常驻餐品 / 05 麦门作息 |
| 2 | `list-nutrition-foods` | 官方餐品营养表（能量、蛋白质、脂肪、碳水、钠、钙） | 04 热量成就（逐项 kcal 换算） |
| 3 | `query-my-account` | 积分账户（可用/累计/已用/已过期/冻结） | 07 积分流水 |
| 4 | `query-my-coupons` | 卡包优惠券资产 | 06 省钱战绩 |
| 5 | `available-coupons` | 麦麦省可领券列表 | 06 省钱战绩（待领福利） |
| 6 | `query-my-prizes` | 积分抽奖中奖记录 | 08 幸运时刻 |
| 7 | `query-lottery-info` | 抽奖活动信息与奖池 | 08 幸运时刻（活动上下文） |
| 8 | `campaign-calendar` | 当月营销活动日历 | 09 活动足迹 |

**未使用任何写操作工具**：项目刻意只调用只读工具，不涉及 `create-order`、`auto-bind-coupons`、`draw-lottery`、`mall-create-order` 等会产生真实资金/积分变动的操作，确保演示与运行过程绝对安全。

## 3. 调用流程

```
mcd-yearbook CLI
   │
   ├─ 1. POST initialize（protocolVersion 2025-03-26）
   │      → 响应头 mcp-session-id 建立会话
   ├─ 2. POST notifications/initialized
   └─ 3. POST tools/call × 8（上述只读工具，可并发/串行调度）
          → 响应为 application/json 或 text/event-stream（SSE），客户端双格式解析
   │
   ├─ 归一化：订单拆解套餐子项 / 营养表文本解析 / 活动日历 Markdown 解析
   ├─ 聚合：消费、品类、热量、作息、省钱、积分、抽奖、活动八维统计
   ├─ 人格：麦门称号算法（规则权重，可复现）
   └─ 渲染：自包含 HTML 年报（ECharts 已内联，离线可用）
```

实现见 `src/mcp-client.mjs`（约 120 行，零依赖，Node >= 18）。

### 返回格式的两面性

实测发现麦当劳 MCP 不同工具返回格式不一致：

- `order-list` / `query-my-account` / `query-my-prizes` / `query-lottery-info` 返回 **JSON**；
- `campaign-calendar` / `available-coupons` 返回 **Markdown 文本**（活动按日期分组、券以列表项组织）；
- `list-nutrition-foods` 返回一种**类 CSV 文本**（`[160]{headers}:` 头 + 每行一个餐品）；
- `query-my-coupons` 在卡包为空时返回纯文本「暂无可用优惠券」。

`src/collect.mjs` 对四种格式分别做了归一化解析，这也是本项目在工程上处理得最细的部分。

## 4. 业务价值

| 维度 | 价值说明 |
|---|---|
| 个人洞察 | 把散落在点餐、积分、券包、抽奖里的行为数据聚合成一份可读、可晒、可回顾的年度报告 |
| 数据可视化 | 消费轨迹、品类构成、24 小时作息、积分流水四类图表，均来自 MCP 真实数据；动效故事流形态（滚动触发 + 数字滚动） |
| 足迹地图 | 订单中的门店与城市在腾讯地图上点亮（前端零密钥代理，无代理环境降级为城市卡片） |
| 热量透明 | 用官方营养表逐项换算总热量与「巨无霸当量」，把抽象数字变成体感 |
| 省钱量化 | 券面总额、已用/待领张数，让「麦门省钱」有据可查 |
| 传播属性 | 分享卡片 + 麦门称号，天然适合社交传播，是开源项目获取 Star 的抓手 |

## 5. 安全与合规

- 只读：不调用任何写操作工具，不产生订单、不领券、不抽奖；
- 脱敏：报告中的账号 ID 仅显示后 4 位（`****7201`）；
- 配置：仓库内仅含 `mcp-config.example.json` 环境变量占位符，无真实 Token；
- 演示数据：`fixtures/demo-data.json` 为合成数据，不含任何真实用户信息；
- 免责：报告为参赛作品输出，仅供参考，餐品信息以麦当劳官方渠道实时结果为准。

## 6. 错误处理

| 场景 | 处理 |
|---|---|
| 401 Token 无效/过期 | 明确报错并引导至 open.mcd.cn/mcp 重新申请 |
| 429 限流 | 明确报错并建议降低频率 |
| 业务状态 `NOT_LOGIN` | 降级为空维度并在报告标注，不中断整体生成 |
| 某工具调用失败 | 记录 warning，其余维度继续生成（见 CLI 输出的「数据说明」） |
| 餐品未匹配营养表 | 热量按保守下限计，并在报告脚注说明匹配率 |
