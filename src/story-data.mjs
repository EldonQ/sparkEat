/**
 * story-data.mjs — 故事流数据层
 *
 * 把 aggregate 模型转成 Wrapped 式全屏故事流所需的文案与数据。
 * 另含城市坐标表（GCJ-02 标准城市中心坐标）与足迹聚合逻辑。
 */

/** GCJ-02 标准城市中心坐标（公开常识数据，用于城市级足迹聚合） */
const CITY_COORDS = {
  北京: [116.4074, 39.9042],
  上海: [121.4737, 31.2304],
  广州: [113.2644, 23.1291],
  深圳: [114.0579, 22.5431],
  杭州: [120.1551, 30.2741],
  成都: [104.0665, 30.5723],
  武汉: [114.3055, 30.5928],
  南京: [118.7969, 32.0603],
  西安: [108.9402, 34.3416],
  重庆: [106.5516, 29.563],
  苏州: [120.5853, 31.2989],
  天津: [117.1902, 39.1256],
  长沙: [112.9388, 28.2282],
  郑州: [113.6254, 34.7466],
  青岛: [120.3833, 36.0671],
  厦门: [118.0894, 24.4798],
  福州: [119.2965, 26.0745],
  合肥: [117.2272, 31.8206],
  昆明: [102.8329, 24.8801],
  沈阳: [123.4315, 41.8057],
  大连: [121.6147, 38.914],
  哈尔滨: [126.5349, 45.8038],
  济南: [117.1201, 36.6512],
  宁波: [121.5503, 29.8746],
  无锡: [120.3119, 31.4912],
  佛山: [113.122, 23.0288],
  东莞: [113.7518, 23.0207],
  南宁: [108.3669, 22.817],
  贵阳: [106.6302, 26.6477],
  南昌: [115.8582, 28.6829],
  石家庄: [114.5149, 38.0428],
  太原: [112.5489, 37.8706],
  兰州: [103.8343, 36.0611],
  海口: [110.1999, 20.044],
  三亚: [109.5082, 18.2479],
  珠海: [113.5767, 22.2707],
  中山: [113.3926, 22.5159],
  惠州: [114.4162, 23.1116],
  汕头: [116.682, 23.3535],
  湛江: [110.3594, 21.2707],
  泉州: [118.6757, 24.8741],
  温州: [120.6994, 27.9943],
  金华: [119.6474, 29.0792],
  嘉兴: [120.7555, 30.7461],
  南通: [120.8943, 31.9802],
  徐州: [117.1842, 34.2618],
  常州: [119.9743, 31.8113],
  烟台: [121.4479, 37.4638],
  潍坊: [119.1618, 36.7069],
  洛阳: [112.4537, 34.6197],
  宜昌: [111.2864, 30.6919],
  襄阳: [112.122, 32.009],
  柳州: [109.4155, 24.3254],
  桂林: [110.2901, 25.2736],
  绵阳: [104.6796, 31.4677],
  贵阳2: [106.6302, 26.6477],
};

/** 从门店名提取城市（覆盖主要城市 + 兜底策略） */
export function extractCity(storeName) {
  if (!storeName) return null;
  for (const city of Object.keys(CITY_COORDS)) {
    if (storeName.includes(city)) return city;
  }
  // 兜底：直辖市/省份简称模式
  const m = storeName.match(/麦当劳([一-龥]{2,3}?)[市省]/);
  if (m) return m[1];
  return null;
}

/**
 * 足迹聚合：按城市分组门店与订单
 * @param {Array} orders 归一化订单（含 storeName / storeCoords 可选）
 * @returns {{cities: Array, stores: Array, maxCount: number}}
 */
export function aggregateFootprint(orders) {
  const cityMap = new Map();
  const storeMap = new Map();
  for (const o of orders) {
    const city = extractCity(o.storeName) || '其他';
    if (!cityMap.has(city)) {
      cityMap.set(city, { city, count: 0, coords: CITY_COORDS[city] || null });
    }
    cityMap.get(city).count += 1;
    if (!storeMap.has(o.storeName)) {
      storeMap.set(o.storeName, { name: o.storeName, city, count: 0, coords: o.storeCoords || null });
    }
    storeMap.get(o.storeName).count += 1;
  }
  const cities = [...cityMap.values()].sort((a, b) => b.count - a.count);
  const stores = [...storeMap.values()].sort((a, b) => b.count - a.count);
  return { cities, stores, maxCount: cities[0]?.count || 1 };
}

/** 时段人格：根据小时分布给一个称号 */
export function hourPersona(peakHour, hourHist) {
  const total = hourHist.reduce((a, b) => a + b, 0) || 1;
  const morning = hourHist.slice(5, 10).reduce((a, b) => a + b, 0) / total;
  const noon = hourHist.slice(11, 14).reduce((a, b) => a + b, 0) / total;
  const afternoon = hourHist.slice(14, 18).reduce((a, b) => a + b, 0) / total;
  const night = (hourHist.slice(21, 24).reduce((a, b) => a + b, 0) + hourHist.slice(0, 5).reduce((a, b) => a + b, 0)) / total;
  const ratios = [
    { key: 'morning', label: '早八麦门人', v: morning, desc: '早餐时段的常驻选手，一堡一咖开启全天' },
    { key: 'noon', label: '干饭主力军', v: noon, desc: '午饭点准时出现在麦麦，稳得像个闹钟' },
    { key: 'afternoon', label: '下午茶捕手', v: afternoon, desc: '下午三四点的手最诚实，小食和饮料的忠实客户' },
    { key: 'night', label: '深夜食堂VIP', v: night, desc: '城市的灯灭了，你的麦门灯还亮着' },
  ].sort((a, b) => b.v - a.v);
  return ratios[0].v > 0.2 ? ratios[0] : { key: 'allday', label: '全天候麦门信徒', v: 1, desc: '早中晚深夜全线覆盖，麦门因你而完整' };
}

const pad2 = (x) => String(x).padStart(2, '0');
const fmtMoney = (v) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const fmtInt = (v) => Number(v).toLocaleString('zh-CN');

/** 热量趣味类比 */
export function calorieFun(totalKcal) {
  if (!totalKcal) return null;
  const riceBowls = Math.round(totalKcal / 200);      // 一碗米饭约 200 kcal
  const stairs = Math.round(totalKcal / 4);           // 爬一层楼梯约 4 kcal
  const runs = Math.round(totalKcal / 600);           // 慢跑一小时约 600 kcal
  return [
    { value: fmtInt(riceBowls), unit: '碗米饭', note: '按每碗约 200 kcal 计' },
    { value: fmtInt(stairs), unit: '层楼梯', note: '按每层约 4 kcal 计' },
    { value: fmtInt(runs), unit: '小时慢跑', note: '按每小时约 600 kcal 计' },
  ];
}

/** 峰值月点评 */
export function peakMonthNote(monthly) {
  if (!monthly.length) return null;
  const peak = monthly.reduce((a, b) => (b.spend > a.spend ? b : a));
  const [y, m] = peak.month.split('-');
  return { label: `${y}年${Number(m)}月`, spend: peak.spend, count: peak.count };
}

/**
 * 组装故事流全部数据
 */
export function buildStoryData(model, persona, orders) {
  const peak = peakMonthNote(model.monthly);
  const footprint = aggregateFootprint(orders);
  const hourTitle = hourPersona(model.peakHour, model.hourHist);
  return {
    meta: model.meta,
    account: model.account,
    overview: model.overview,
    monthly: model.monthly,
    categories: model.categories,
    topProducts: model.topProducts,
  hourHist: model.hourHist,
  peakHour: model.peakHour,
  weekdayHist: model.weekdayHist,
    calories: model.calories,
    habits: model.habits,
    points: model.points,
    coupons: model.coupons,
    lottery: model.lottery,
    prizes: model.prizes,
    campaigns: model.campaigns,
    maxOrder: model.maxOrder,
    persona,
    peak,
    footprint,
    hourTitle,
    calorieFun: calorieFun(model.calories.total),
  };
}

export { CITY_COORDS, pad2, fmtMoney, fmtInt };
