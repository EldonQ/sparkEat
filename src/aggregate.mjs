/**
 * aggregate.mjs — 统计聚合引擎
 *
 * 输入 collect.mjs 的归一化数据，输出年鉴模型：
 * 消费轨迹 / 品类偏好 / 热量成就 / 麦门作息 / 省钱战绩 / 积分流水 / 幸运时刻 / 活动足迹
 */

const CATEGORY_RULES = [
  { key: 'breakfast', label: '早餐', test: /麦满分|粥|油条|松饼|炒双蛋|早安|营养卷/ },
  { key: 'dessert', label: '甜品', test: /新地|麦旋风|冰淇淋|圆筒|雪冰|拉明顿|奶冻|阿芙佳朵|^香芋派$|^菠萝派$|派$/ },
  { key: 'drink', label: '饮料', test: /可乐|雪碧|咖啡|美式|拿铁|玛奇朵|卡布奇诺|红茶|豆浆|牛奶|果汁|怡泉|麦旋酷|朱古力|奶铁|纯悦/ },
  { key: 'snack', label: '小食', test: /薯条|薯饼|鸡翅|鸡排|鸡块|麦乐鸡|玉米|鸡球|笋卷|V翅|脆汁鸡|香肠|沙拉|苹果片/ },
  { key: 'burger', label: '汉堡', test: /堡|巨无霸|麦香鱼|麦香鸡/ },
];

export function categorize(name) {
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(name)) return rule.key;
  }
  return 'other';
}

const pad = (x) => String(x).padStart(2, '0');
export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function parseTime(s) {
  const d = new Date(String(s).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 餐品名 → 热量（kcal）。精确匹配优先，其次包含匹配。 */
export function matchCalories(name, nutrition) {
  if (!name || !nutrition?.length) return 0;
  const exact = nutrition.find((x) => x.name === name);
  if (exact) return exact.kcal;
  const contains = nutrition.find((x) => x.name.length >= 2 && (name.includes(x.name) || x.name.includes(name)));
  return contains ? contains.kcal : 0;
}

export function aggregate(raw) {
  const orders = raw.orders || [];
  const nutrition = raw.nutrition || [];
  const warnings = [...(raw.warnings || [])];

  // ---------- 订单基础统计 ----------
  let totalSpend = 0;
  let totalItems = 0;
  let totalKcal = 0;
  let unmatchedKcalItems = 0;
  const productCount = new Map();   // name -> {count, spend}
  const storeCount = new Map();
  const categoryCount = { burger: 0, snack: 0, drink: 0, dessert: 0, breakfast: 0, other: 0 };
  const monthly = new Map();        // "2026-07" -> {spend, count}
  const hourHist = new Array(24).fill(0);
  const weekdayHist = new Array(7).fill(0);
  const dates = [];

  for (const o of orders) {
    const d = parseTime(o.createTime);
    if (!d) continue;
    dates.push(d);
    totalSpend += o.totalAmount;
    const mk = monthKey(d);
    if (!monthly.has(mk)) monthly.set(mk, { spend: 0, count: 0 });
    monthly.get(mk).spend += o.totalAmount;
    monthly.get(mk).count += 1;
    hourHist[d.getHours()] += 1;
    weekdayHist[d.getDay()] += 1;
    storeCount.set(o.storeName, (storeCount.get(o.storeName) || 0) + 1);
    for (const item of o.items) {
      const qty = item.quantity || 1;
      totalItems += qty;
      const cat = categorize(item.name);
      categoryCount[cat] += qty;
      const kcal = matchCalories(item.name, nutrition);
      if (kcal === 0) unmatchedKcalItems += qty;
      totalKcal += kcal * qty;
      const pc = productCount.get(item.name) || { count: 0, spend: 0 };
      pc.count += qty;
      productCount.set(item.name, pc);
    }
  }

  dates.sort((a, b) => a - b);
  const first = dates[0] || new Date();
  const last = dates[dates.length - 1] || new Date();

  // 补齐区间内所有月份（含零订单月）
  const monthlySeries = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const endMonth = new Date(last.getFullYear(), last.getMonth(), 1);
  while (cursor <= endMonth) {
    const key = monthKey(cursor);
    const m = monthly.get(key) || { spend: 0, count: 0 };
    monthlySeries.push({ month: key, spend: +m.spend.toFixed(1), count: m.count });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const topProducts = [...productCount.entries()]
    .map(([name, v]) => ({ name, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topStores = [...storeCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // 客单价按餐品分摊（用于"最贵一餐点了什么"）
  const maxOrder = orders.reduce((best, o) => (!best || o.totalAmount > best.totalAmount ? o : best), null);

  // 时段偏好
  const peakHour = hourHist.indexOf(Math.max(...hourHist));
  const breakfastOrders = orders.filter((o) => {
    const d = parseTime(o.createTime);
    return d && d.getHours() < 10;
  }).length;
  const lateNightOrders = orders.filter((o) => {
    const d = parseTime(o.createTime);
    return d && (d.getHours() >= 21 || d.getHours() < 5);
  }).length;
  const weekendOrders = orders.filter((o) => {
    const d = parseTime(o.createTime);
    return d && (d.getDay() === 0 || d.getDay() === 6);
  }).length;

  // ---------- 积分 ----------
  const acc = raw.account || {};
  const points = {
    available: Number(acc.availablePoint) || 0,
    accumulative: Number(acc.accumulativePoint) || 0,
    expired: Number(acc.expiredPoint) || 0,
    used: Number(acc.usedPoint) || 0,
    frozen: Number(acc.frozenPoint) || 0,
    expiringSoon: Number(acc.currentMouthExpirePoint || acc.nextMouthExpirePoint) || 0,
    accountId: acc.accountId || '',
  };

  // ---------- 优惠券 ----------
  const coupons = raw.myCoupons || { total: 0, used: 0, savedTotal: 0, items: [] };

  // ---------- 抽奖 ----------
  const prizes = (raw.prizes || []).map((p) => ({ name: p.name, time: p.recordTime, status: p.statusText || '未知' }));
  const lotteryPool = raw.lottery?.prizes || raw.lottery?.prizePool || [];
  const lottery = raw.lottery ? {
    name: raw.lottery.activityName || '积分抽奖',
    drawPoint: Number(raw.lottery.drawPoint) || 0,
    prizePool: lotteryPool.map((p) => (typeof p === 'string' ? p : p.name)).filter(Boolean).slice(0, 5),
  } : null;

  // ---------- 活动 ----------
  const campaigns = raw.campaigns || [];

  // ---------- 汇总 ----------
  const model = {
    meta: {
      source: raw.source,
      generatedAt: new Date(),
      rangeStart: first,
      rangeEnd: last,
      rangeLabel: `${first.getFullYear()}.${pad(first.getMonth() + 1)}.${pad(first.getDate())} – ${last.getFullYear()}.${pad(last.getMonth() + 1)}.${pad(last.getDate())}`,
      titleYear: last.getFullYear(),
      isDemo: raw.source !== 'live',
    },
    account: {
      masked: points.accountId ? `****${points.accountId.slice(-4)}` : '未登录',
    },
    overview: {
      orderCount: orders.length,
      totalSpend: +totalSpend.toFixed(1),
      avgSpend: orders.length ? +(totalSpend / orders.length).toFixed(1) : 0,
      totalItems,
      savedFromCoupons: +coupons.savedTotal.toFixed(1),
      availablePoints: points.available,
    },
    monthly: monthlySeries,
    categories: categoryCount,
    topProducts,
    topStores,
    hourHist,
    weekdayHist,
    peakHour,
    habits: {
      breakfastRatio: orders.length ? breakfastOrders / orders.length : 0,
      lateNightRatio: orders.length ? lateNightOrders / orders.length : 0,
      weekendRatio: orders.length ? weekendOrders / orders.length : 0,
      breakfastOrders,
      lateNightOrders,
      weekendOrders,
    },
    calories: {
      total: totalKcal,
      perOrder: orders.length ? Math.round(totalKcal / orders.length) : 0,
      bigMacEquiv: +(totalKcal / 513).toFixed(1),
      matchedRatio: totalItems ? +((1 - unmatchedKcalItems / totalItems) * 100).toFixed(0) : 0,
    },
    points,
    coupons: {
      owned: coupons.total,
      used: coupons.used,
      savedTotal: +coupons.savedTotal.toFixed(1),
      claimable: raw.claimableCoupons || 0,
    },
    lottery,
    prizes,
    campaigns: {
      count: campaigns.length,
      items: campaigns.slice(0, 8),
    },
    maxOrder: maxOrder ? {
      amount: maxOrder.totalAmount,
      date: maxOrder.createTime,
      items: maxOrder.items.map((i) => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join(' + '),
      store: maxOrder.storeName,
    } : null,
  };

  if (unmatchedKcalItems > 0 && totalItems > 0) {
    warnings.push(`${unmatchedKcalItems}/${totalItems} 个餐品未匹配到营养数据，热量统计为保守下限`);
  }
  model.warnings = warnings;
  return model;
}
