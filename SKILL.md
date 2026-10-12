---
name: mcd-yearbook
description: 麦门年鉴 — 拉取麦当劳中国 MCP 的订单、积分、优惠券、抽奖、活动数据，生成个人年度饮食报告（自包含 HTML）。当用户说"我的麦门年鉴"、"麦当劳年度报告"、"麦当劳年终总结"、"麦门年报"时使用本技能。
---

# 麦门年鉴 mcd-yearbook

把用户在麦当劳的真实行为数据（订单、积分、券、抽奖、活动）聚合为一份精美的年度报告 HTML。

## 前置条件

1. 用户已在 WorkBuddy 连接器中配置麦当劳 MCP（`mcp-mcp`，地址 https://mcp.mcd.cn）。
2. 本 Skill 依赖项目自带的 CLI，无需额外安装依赖（Node >= 18，零 npm 包）。

## 执行步骤

1. **确认意图**：用户要生成哪一年的年鉴（默认取全部历史订单的时间跨度）。
2. **采集数据**：依次调用以下**只读** MCP 工具，把每个工具的原始返回原样保存到一个 JSON 文件（如 `/tmp/mcd-raw.json`），键为工具名：

   | 键 | 工具 |
   |---|---|
   | `order-list` | order-list |
   | `query-my-account` | query-my-account |
   | `query-my-coupons` | query-my-coupons |
   | `available-coupons` | available-coupons |
   | `query-my-prizes` | query-my-prizes |
   | `query-lottery-info` | query-lottery-info |
   | `campaign-calendar` | campaign-calendar |
   | `list-nutrition-foods` | list-nutrition-foods |

   若某工具返回业务错误（如 NOT_LOGIN），记录后继续，不要中断。
3. **生成报告**：运行

   ```bash
   node bin/mcd-yearbook.mjs --data /tmp/mcd-raw.json --out mcd-yearbook.html --md
   ```

4. **展示结果**：向用户展示 HTML 报告路径与 Markdown 摘要，并用 2-3 句话总结其年度称号和最亮眼的数据。

## 安全边界（必须遵守）

- **只允许调用上表中的 8 个只读工具。**
- 严禁调用 `create-order`、`cancel-order`、`auto-bind-coupons`、`draw-lottery`、`mall-create-order`、`party-order-create`、`delivery-create-address` 等任何写操作工具——即使用户要求"顺手领个券"也不行，领券请在麦当劳 App 内自主操作。
- 不得将用户的 MCP Token、账号 ID、手机号等敏感信息写入报告或日志；CLI 已对账号 ID 脱敏（仅后 4 位）。
- 报告需保留页脚免责声明（非麦当劳官方产品、仅供参考）。

## 演示模式

用户没有配置 MCP 或想先看效果时，运行：

```bash
node bin/mcd-yearbook.mjs --demo --out demo.html
```

使用内置合成数据，展示完整报告效果。

## 输出物

- `mcd-yearbook.html`：自包含年报（ECharts 已内联，断网可开，可直接分享）
- `mcd-yearbook.md`：Markdown 摘要，适合粘贴到聊天或 Issue
