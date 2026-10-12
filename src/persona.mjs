/**
 * persona.mjs — 麦门称号算法
 *
 * 基于聚合数据计算人格特质，输出主称号 + 关键词 + 一句话评语。
 * 规则透明可复现：每个特质有明确阈值，主称号取权重最高者。
 */

export function derivePersona(model) {
  const { overview, categories, habits, calories, coupons, points, prizes } = model;
  const totalCat = Object.values(categories).reduce((a, b) => a + b, 0) || 1;
  const traits = [];

  const add = (t) => traits.push(t);

  // 汉堡鉴赏家：汉堡占比高且尝试品类多
  if (categories.burger / totalCat >= 0.4) {
    add({ key: 'burger', title: '汉堡鉴赏家', weight: 60 + categories.burger / totalCat * 40, desc: '无堡不欢，麦门正统信徒' });
  }
  // 早餐信徒
  if (habits.breakfastRatio >= 0.3) {
    add({ key: 'breakfast', title: '早餐信徒', weight: 55 + habits.breakfastRatio * 80, desc: '早八的快乐是一堡一咖给的' });
  }
  // 深夜食堂
  if (habits.lateNightRatio >= 0.2) {
    add({ key: 'latenight', title: '深夜麦厨', weight: 50 + habits.lateNightRatio * 100, desc: '城市的灯灭了，你的麦门灯亮着' });
  }
  // 薯条刺客
  if ((categories.snack / totalCat) >= 0.35) {
    add({ key: 'snack', title: '小食刺客', weight: 45 + categories.snack / totalCat * 50, desc: '主食是借口，小食才是目的' });
  }
  // 甜筒收藏家
  if ((categories.dessert / totalCat) >= 0.18) {
    add({ key: 'dessert', title: '甜筒收藏家', weight: 40 + categories.dessert / totalCat * 80, desc: '第二个胃是留给新地和麦旋风的' });
  }
  // 饮料灌篮
  if ((categories.drink / totalCat) >= 0.35) {
    add({ key: 'drink', title: '饮料灌篮王', weight: 42 + categories.drink / totalCat * 45, desc: '一杯不够，那就中杯加大杯' });
  }
  // 省钱大师
  if (overview.totalSpend > 0 && coupons.savedTotal / overview.totalSpend >= 0.12) {
    add({ key: 'saver', title: '麦门省钱学家', weight: 55 + (coupons.savedTotal / overview.totalSpend) * 120, desc: '每一分钱都要花出券后价' });
  }
  // 积分猎人
  if (points.accumulative > 0 && (points.used + points.expired) / points.accumulative >= 0.5) {
    add({ key: 'points', title: '积分猎人', weight: 48 + ((points.used + points.expired) / points.accumulative) * 40, desc: '积分不用来花，难道用来传家' });
  }
  // 欧皇本皇
  if (prizes.length >= 2) {
    add({ key: 'lucky', title: '欧皇本皇', weight: 46 + prizes.length * 6, desc: '抽奖池里长驻的幸运选手' });
  }
  // 周末战士
  if (habits.weekendRatio >= 0.55) {
    add({ key: 'weekend', title: '周末麦战士', weight: 38 + habits.weekendRatio * 30, desc: '工作日的苦，周末用麦麦补' });
  }

  if (traits.length === 0) {
    add({ key: 'believer', title: '麦门纯粹信徒', weight: 50, desc: '吃得杂而不滥，麦门因你而完整' });
  }

  traits.sort((a, b) => b.weight - a.weight);
  const main = traits[0];
  const keywords = traits.slice(0, 4).map((t) => t.title);

  // 年度关键词（数据事实向）
  const facts = [];
  if (model.topProducts[0]) facts.push(`年度餐品：${model.topProducts[0].name}`);
  if (model.peakHour >= 0) facts.push(`高频时段：${pad2(model.peakHour)}:00`);
  if (calories.bigMacEquiv > 0) facts.push(`热量当量：${calories.bigMacEquiv} 个巨无霸`);
  if (coupons.claimable > 0) facts.push(`待领券：${coupons.claimable} 张`);

  return {
    title: main.title,
    desc: main.desc,
    keywords,
    facts,
    allTraits: traits.map((t) => ({ title: t.title, desc: t.desc, weight: Math.round(t.weight) })),
  };
}

const pad2 = (x) => String(x).padStart(2, '0');
