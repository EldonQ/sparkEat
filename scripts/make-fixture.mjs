/**
 * make-fixture.mjs — 生成合成演示数据（确定性种子，可复现）
 *
 * 生成 fixtures/demo-data.json，供 --demo 模式离线运行。
 * 所有订单/积分/奖品均为虚构合成数据，不包含任何真实用户信息。
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261012);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (min, max) => min + Math.floor(rng() * (max - min + 1));

// ---- 餐品库（名称需与 nutrition.json 可匹配，用于热量计算） ----
const BURGERS = ['板烧鸡腿堡', '麦辣鸡腿汉堡', '巨无霸', '双层吉士汉堡', '麦香鱼', '麦香鸡', '芝士安格斯厚牛堡'];
const SNACKS = ['中薯条', '大薯条', '麦乐鸡5块', '麦辣鸡翅-2块', '那么大鸡排', '脆薯饼', '酥酥多笋卷', '苹果片'];
const DRINKS = ['可乐中杯', '可乐大杯', '雪碧中杯', '无糖可口可乐中杯', '冰美式中杯', '热美式中杯', '锡兰红茶', '优品豆浆大杯', '100%苹果汁'];
const DESSERTS = ['圆筒冰淇淋', '奥利奥麦旋风', '草莓新地', '香芋派', '菠萝派', '朱古力新地'];
const BREAKFASTS = ['猪柳麦满分', '火腿扒麦满分', '烟肉蛋麦满分', '皮蛋鸡肉粥', '脆香油条'];

const COMBO_NAMES = [
  '精选单人餐三件套', '人气经典随心配', '超值双人餐', '麦乐鸡狂欢桶',
  '早餐全餐', '元气早餐两件套', '小食分享盒', '麦麦家族桶',
];

const STORES = [
  '麦当劳广州北亭广场餐厅', '麦当劳广州大学城贝岗餐厅', '麦当劳广州天河数码港餐厅',
  '麦当劳深圳南山科技园餐厅', '麦当劳深圳华强北餐厅', '麦当劳广州珠江新城餐厅',
];

/* 门店近似坐标（GCJ-02，公开商业区位置，仅用于演示地图标记） */
const STORE_COORDS = {
  '麦当劳广州北亭广场餐厅': [113.3966, 23.0527],
  '麦当劳广州大学城贝岗餐厅': [113.4093, 23.0466],
  '麦当劳广州天河数码港餐厅': [113.3365, 23.1355],
  '麦当劳深圳南山科技园餐厅': [113.9477, 22.5285],
  '麦当劳深圳华强北餐厅': [114.0859, 22.541],
  '麦当劳广州珠江新城餐厅': [113.3245, 23.1195],
};

function makeItems() {
  const items = [];
  const n = randInt(1, 3);
  const pools = [BURGERS, SNACKS, DRINKS, DESSERTS, BREAKFASTS];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const pool = pick(pools);
    const name = pick(pool);
    if (used.has(name)) continue;
    used.add(name);
    items.push({ name, quantity: rng() < 0.15 ? 2 : 1 });
  }
  return items;
}

function pad(n) { return String(n).padStart(2, '0'); }

function fmtTime(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 生成近 12 个月订单（2025-10-13 ~ 2026-10-12）
const end = new Date(2026, 9, 12);
const start = new Date(2025, 9, 13);
const orders = [];
const spanDays = Math.round((end - start) / 86400000);
const orderCount = 47;
const timeSlots = [8, 8, 9, 11, 12, 12, 12, 13, 15, 17, 17, 18, 18, 19, 20, 21, 22];

for (let i = 0; i < orderCount; i++) {
  const dayOffset = Math.floor((i / orderCount) * spanDays) + randInt(0, 3);
  const d = new Date(start.getTime() + dayOffset * 86400000);
  if (d > end) break;
  d.setHours(pick(timeSlots), randInt(0, 59), randInt(0, 59));
  const items = makeItems();
  const base = 12 + items.reduce((s, it) => s + it.quantity, 0) * randInt(9, 16);
  const total = (base + rng() * 6).toFixed(1);
  const storeName = pick(STORES);
  orders.push({
    orderId: `1030${randInt(100000000000000, 999999999999999)}`,
    orderType: rng() < 0.85 ? '1' : '2',
    createTime: fmtTime(d),
    beType: '1',
    beCode: '',
    storeCode: String(1400000 + randInt(0, 500)),
    storeName: storeName,
    storeCoords: STORE_COORDS[storeName] || null,
    orderStatus: '订单已完成',
    orderProductList: items.map((it) => ({
      productCode: String(9900000000 + randInt(0, 99999)),
      productName: rng() < 0.4 ? pick(COMBO_NAMES) : it.name,
      quantity: it.quantity,
      comboItemList: items.map((x) => ({
        productCode: String(1000 + randInt(0, 8999)),
        name: x.name,
        quantity: x.quantity,
      })),
    })),
    realTotalAmount: total,
  });
}
orders.sort((a, b) => (a.createTime < b.createTime ? 1 : -1));

// 卡包优惠券（合成）
const couponNames = ['中薯条买一送一', '麦辣鸡腿堡堡单件优惠', '板烧三件套5折券', '甜辣小食组合5折券', '早餐两件套9.9元', '麦旋风5折券', '下单立减3元券', '免费脆薯饼', '人气麦旋风买一送一'];
const myCoupons = [];
for (let i = 0; i < 14; i++) {
  const used = rng() < 0.55;
  myCoupons.push({
    title: pick(couponNames),
    status: used ? '已使用' : '未使用',
    value: +(rng() * 12 + 2).toFixed(1),
  });
}

// 抽奖奖品（合成）
const prizeNames = ['夏至', '下单立减3元券', '麦旋风5折券', '30积分', '小食四件套5.5折券'];
const prizes = [];
for (let i = 0; i < 3; i++) {
  const d = new Date(start.getTime() + randInt(0, spanDays) * 86400000);
  prizes.push({
    id: `6a3e${randInt(100000000000000, 999999999999999)}`,
    name: pick(prizeNames),
    prizeType: randInt(1, 30),
    recordTime: fmtTime(d),
    status: i === 0 ? 0 : 2,
    statusText: i === 0 ? '可用' : '已过期',
    timeRemindText: i === 0 ? '有效期至 2026-12-31' : '',
  });
}
prizes.sort((a, b) => (a.recordTime < b.recordTime ? 1 : -1));

// 活动日历（合成，贴近 10 月真实营销节奏）
const campaigns = [
  { date: '2026-10-08', title: '超值9.9元早餐两件套陪你开工啦' },
  { date: '2026-10-08', title: '韩式风味蘸酱上新，就「酱」心有所「薯」' },
  { date: '2026-10-08', title: '麦当劳 X PEACEMINUSONE 联名复古棒球帽' },
  { date: '2026-10-08', title: '麦当劳联动 G-DRAGON 韩式风味系列新品' },
  { date: '2026-10-09', title: '蓝莓爆爆珠麦旋风上新' },
  { date: '2026-10-08', title: '早餐爆款回归，厚松饼堡返场' },
  { date: '2026-09-09', title: '过家家派对上线，解锁梦想职业' },
  { date: '2026-09-20', title: '乐享90分钟高质量亲子时间' },
  { date: '2026-10-01', title: '国庆七天乐，麦麦套餐特惠' },
  { date: '2026-08-15', title: '麦麦脆汁鸡买一送一' },
];

const demo = {
  meta: {
    synthetic: true,
    note: '本文件为合成演示数据，由 scripts/make-fixture.mjs 确定性生成，不包含任何真实用户信息。',
    generatedFor: '2026-10-12',
  },
  account: {
    accountId: '02001008347429365504925887201',
    availablePoint: '186',
    accumulativePoint: '1042',
    expiredPoint: '238',
    usedPoint: '618',
    frozenPoint: '0',
    currency: '麦享会积分',
  },
  orders,
  myCoupons,
  claimableCouponCount: 8,
  prizes,
  lottery: {
    activityCode: 'dtx2',
    activityName: '麦麦积分抽奖',
    activityStatusText: '进行中',
    drawPoint: '24',
    drawTypeText: '消耗积分抽奖',
    prizePool: ['下单立减3元券', '下单立减2元券', '麦辣三件套5折券', '板烧三件套5折券', '30积分'],
  },
  campaigns,
};

const out = join(here, '..', 'fixtures', 'demo-data.json');
writeFileSync(out, JSON.stringify(demo, null, 2));
console.log(`demo-data.json written: ${orders.length} orders, ${myCoupons.length} coupons, ${prizes.length} prizes, ${campaigns.length} campaigns`);
