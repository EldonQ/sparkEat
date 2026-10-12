/**
 * collect.mjs — 数据采集与归一化
 *
 * 两条数据通路，输出同一种归一化结构：
 *   A. live：调用麦当劳 MCP 的 8 个只读工具
 *   B. demo：读取 fixtures/demo-data.json（合成数据，免 Token）
 *
 * 注意：麦当劳部分工具返回 Markdown 文本而非 JSON（campaign-calendar、
 * available-coupons、空卡包时的 query-my-coupons），此处统一做文本解析。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** 麦门年鉴实际调用的 MCP 工具（全部为只读工具） */
export const TOOLS_USED = [
  { name: 'order-list', purpose: '历史订单 → 消费轨迹、品类偏好、热量', writes: false },
  { name: 'query-my-account', purpose: '积分账户 → 积分流水', writes: false },
  { name: 'query-my-coupons', purpose: '卡包优惠券 → 省钱战绩', writes: false },
  { name: 'available-coupons', purpose: '麦麦省可领券 → 待领福利数', writes: false },
  { name: 'query-my-prizes', purpose: '抽奖奖品 → 幸运时刻', writes: false },
  { name: 'query-lottery-info', purpose: '抽奖活动与奖池 → 抽奖战绩上下文', writes: false },
  { name: 'campaign-calendar', purpose: '营销活动日历 → 活动足迹', writes: false },
  { name: 'list-nutrition-foods', purpose: '餐品营养表 → 热量换算基准', writes: false },
];

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 解析 list-nutrition-foods 的特式返回："[160]{headers}:\n  名称,描述,kj,kcal,..." */
export function parseNutritionText(text) {
  if (!text) return [];
  const lines = String(text).split('\n').slice(1);
  const out = [];
  for (const line of lines) {
    const p = line.trim().split(',');
    if (p.length < 9) continue;
    out.push({
      name: p[0].trim(),
      kcal: n(p[3]),
      kj: n(p[2]),
      protein: n(p[4]),
      fat: n(p[5]),
      carb: n(p[6]),
      sodium: n(p[7]),
      calcium: n(p[8]),
    });
  }
  return out;
}

/** 解析 campaign-calendar 的 Markdown：按 "#### 日期" 分组提取 "**活动标题**：xxx" */
export function parseCampaignMarkdown(md) {
  if (!md) return [];
  const out = [];
  let currentDate = null;
  for (const line of String(md).split('\n')) {
    const dateMatch = line.match(/^#{3,5}\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (dateMatch) {
      currentDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
      continue;
    }
    const titleMatch = line.match(/\*\*活动标题\*\*[：:]\s*(.+)/);
    if (titleMatch && currentDate) {
      const title = titleMatch[1].replace(/\*\*/g, '').trim();
      if (title && !out.some((c) => c.date === currentDate && c.title === title)) {
        out.push({ date: currentDate, title });
      }
    }
  }
  return out;
}

/** 统计 Markdown 券列表中的条目数（"优惠券标题：" 出现次数） */
function countMarkdownCoupons(md) {
  if (!md) return 0;
  return (String(md).match(/优惠券标题[：:]/g) || []).length;
}

/** 从 query-my-coupons 的返回（JSON 或 Markdown）提取卡包统计 */
function normalizeMyCoupons(result) {
  if (!result?.ok) return { total: 0, used: 0, savedTotal: 0, items: [] };
  if (result.json?.data) {
    const d = result.json.data;
    const list = Array.isArray(d.list) ? d.list : Array.isArray(d.coupons) ? d.coupons : [];
    const items = list.map((c) => ({
      title: c.title || c.couponName || c.name || '优惠券',
      status: c.statusText || c.status || '未知',
      value: n(c.amount || c.value || c.denomination),
    }));
    const used = items.filter((c) => /已使|已用/.test(c.status)).length;
    return { total: items.length, used, savedTotal: items.reduce((s, c) => s + c.value, 0), items };
  }
  const count = countMarkdownCoupons(result.text);
  return { total: count, used: 0, savedTotal: 0, items: [] };
}

/** 归一化订单列表：拆出 comboItemList 作为实际餐品项 */
function normalizeOrders(result) {
  if (!result?.ok) return [];
  const list = result.json?.data?.list || [];
  return list.map((o) => {
    const items = [];
    for (const p of o.orderProductList || []) {
      const combos = p.comboItemList || [];
      if (combos.length > 0) {
        for (const c of combos) items.push({ name: c.name || '未知餐品', quantity: n(c.quantity) || 1 });
      } else {
        items.push({ name: p.productName || '未知餐品', quantity: n(p.quantity) || 1 });
      }
    }
    return {
      orderId: o.orderId || '',
      createTime: o.createTime || '',
      storeName: o.storeName || '未知门店',
      totalAmount: n(o.realTotalAmount),
      items,
    };
  }).filter((o) => o.createTime);
}

/**
 * A. 真实数据通路
 * @param {import('./mcp-client.mjs').McpClient} client
 */
export async function collectLiveData(client, { onProgress } = {}) {
  const warnings = [];
  const step = async (label, fn) => {
    onProgress?.(label);
    try { return await fn(); } catch (err) { warnings.push(`${label} 失败：${err.message}`); return null; }
  };

  const orderRes = await step('order-list', () => client.callTool('order-list'));
  const accountRes = await step('query-my-account', () => client.callTool('query-my-account'));
  const couponRes = await step('query-my-coupons', () => client.callTool('query-my-coupons', { pageSize: '200' }));
  const claimRes = await step('available-coupons', () => client.callTool('available-coupons'));
  const prizeRes = await step('query-my-prizes', () => client.callTool('query-my-prizes', { pageSize: '50' }));
  const lotteryRes = await step('query-lottery-info', () => client.callTool('query-lottery-info'));
  const campaignRes = await step('campaign-calendar', () => client.callTool('campaign-calendar'));
  const nutritionRes = await step('list-nutrition-foods', () => client.callTool('list-nutrition-foods'));

  if (accountRes?.ok && accountRes.json?.data?.status?.code === 'NOT_LOGIN') {
    warnings.push('积分账户未登录，部分维度为空');
  }

  return {
    source: 'live',
    fetchedAt: new Date().toISOString(),
    account: accountRes?.ok ? accountRes.json?.data : null,
    orders: normalizeOrders(orderRes),
    myCoupons: normalizeMyCoupons(couponRes),
    claimableCoupons: claimRes?.ok ? countMarkdownCoupons(claimRes.text) : 0,
    prizes: (prizeRes?.ok ? prizeRes.json?.data?.prizes : []) || [],
    lottery: lotteryRes?.ok ? lotteryRes.json?.data : null,
    campaigns: parseCampaignMarkdown(campaignRes?.text),
    nutrition: parseNutritionText(nutritionRes?.text || (nutritionRes?.ok ? nutritionRes.json?.data : '')),
    warnings,
  };
}

/**
 * B. 演示数据通路
 */
export function loadDemoData() {
  const file = join(here, '..', 'fixtures', 'demo-data.json');
  const demo = JSON.parse(readFileSync(file, 'utf8'));
  const nutrition = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'nutrition.json'), 'utf8'));
  return {
    source: 'demo',
    fetchedAt: new Date().toISOString(),
    account: demo.account,
    orders: demo.orders.map((o) => ({
      orderId: o.orderId,
      createTime: o.createTime,
      storeName: o.storeName,
      storeCoords: o.storeCoords || null,
      totalAmount: n(o.realTotalAmount),
      items: (o.orderProductList || []).flatMap((p) =>
        (p.comboItemList || []).map((c) => ({ name: c.name, quantity: n(c.quantity) || 1 }))),
    })),
    myCoupons: {
      total: demo.myCoupons.length,
      used: demo.myCoupons.filter((c) => /已使/.test(c.status)).length,
      savedTotal: demo.myCoupons.reduce((s, c) => s + n(c.value), 0),
      items: demo.myCoupons,
    },
    claimableCoupons: demo.claimableCouponCount,
    prizes: demo.prizes.map((p) => ({ name: p.name, recordTime: p.recordTime, statusText: p.statusText })),
    lottery: demo.lottery,
    campaigns: demo.campaigns,
    nutrition,
    warnings: [],
  };
}

/**
 * C. WorkBuddy Skill 通路：Agent 已将各工具原始返回存入一个 JSON 文件
 *    格式：{ "order-list": <原始响应>, "query-my-account": <原始响应>, ... }
 */
export function normalizeFromRaw(rawMap) {
  const wrap = (json) => ({ ok: true, json, text: JSON.stringify(json) });
  const wrapText = (text) => ({ ok: true, text });
  const g = (k) => (rawMap[k] != null ? rawMap[k] : null);

  const orderRes = g('order-list');
  const accountRes = g('query-my-account');
  const couponRaw = g('query-my-coupons');
  const claimRaw = g('available-coupons');
  const prizeRaw = g('query-my-prizes');
  const lotteryRaw = g('query-lottery-info');
  const campaignRaw = g('campaign-calendar');
  const nutritionRaw = g('list-nutrition-foods');

  const couponRes = couponRaw && typeof couponRaw === 'object'
    ? wrap(couponRaw)
    : wrapText(String(couponRaw || ''));
  const claimRes = typeof claimRaw === 'string' ? wrapText(claimRaw) : wrap(claimRaw);

  return {
    source: 'workbuddy',
    fetchedAt: new Date().toISOString(),
    account: accountRes?.data ?? accountRes ?? null,
    orders: normalizeOrders(orderRes && typeof orderRes === 'object' ? wrap(orderRes) : null),
    myCoupons: normalizeMyCoupons(couponRes),
    claimableCoupons: countMarkdownCoupons(claimRes.text),
    prizes: (prizeRaw?.data?.prizes) || (Array.isArray(prizeRaw?.prizes) ? prizeRaw.prizes : []) || [],
    lottery: lotteryRaw?.data ?? lotteryRaw ?? null,
    campaigns: typeof campaignRaw === 'string' ? parseCampaignMarkdown(campaignRaw) : [],
    nutrition: typeof nutritionRaw === 'string'
      ? parseNutritionText(nutritionRaw)
      : (nutritionRaw?.data && typeof nutritionRaw.data === 'string' ? parseNutritionText(nutritionRaw.data) : []),
    warnings: [],
  };
}
