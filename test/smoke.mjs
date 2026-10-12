/**
 * smoke.mjs — 端到端冒烟测试（离线，使用合成数据）
 * 运行：node test/smoke.mjs
 */
import { strict as assert } from 'node:assert';
import { loadDemoData, normalizeFromRaw, parseNutritionText, parseCampaignMarkdown } from '../src/collect.mjs';
import { aggregate, categorize, matchCalories } from '../src/aggregate.mjs';
import { derivePersona } from '../src/persona.mjs';
import { renderReport, renderMarkdown } from '../src/render.mjs';

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ok - ${name}`); }
  catch (err) { console.error(`  FAIL - ${name}: ${err.message}`); process.exitCode = 1; }
}

console.log('麦门年鉴冒烟测试');

ok('分类器：汉堡/小食/饮料/甜品/早餐', () => {
  assert.equal(categorize('巨无霸'), 'burger');
  assert.equal(categorize('麦辣鸡腿汉堡'), 'burger');
  assert.equal(categorize('中薯条'), 'snack');
  assert.equal(categorize('可乐中杯'), 'drink');
  assert.equal(categorize('奥利奥麦旋风'), 'dessert');
  assert.equal(categorize('猪柳蛋麦满分'), 'breakfast');
});

ok('营养文本解析', () => {
  const text = '[2]{a,b,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\n  巨无霸,null,2146,513,27,26,42,961,171\n  中薯条,null,1210,289,4,12,38,165,18';
  const list = parseNutritionText(text);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, '巨无霸');
  assert.equal(list[0].kcal, 513);
});

ok('活动日历 Markdown 解析', () => {
  const md = '#### 2026年10月12日 今日\n\n-   **活动标题**：超值早餐两件套\n    **活动内容**：xxx\n\n#### 2026年10月13日\n\n-   **活动标题**：联名棒球帽\n';
  const list = parseCampaignMarkdown(md);
  assert.equal(list.length, 2);
  assert.equal(list[0].date, '2026-10-12');
  assert.equal(list[0].title, '超值早餐两件套');
});

ok('热量匹配：精确 + 包含', () => {
  const nutrition = parseNutritionText('[1]{a,b,c,kcal,p,f,cb,s,ca}:\n  巨无霸,null,0,513,0,0,0,0,0');
  assert.equal(matchCalories('巨无霸', nutrition), 513);
  assert.equal(matchCalories('不存在的餐品', nutrition), 0);
});

ok('聚合：订单统计正确', () => {
  const raw = normalizeFromRaw({
    'order-list': { data: { list: [
      { orderId: '1', createTime: '2026-07-03 17:11:45', storeName: '测试餐厅', realTotalAmount: '34.5',
        orderProductList: [{ productCode: 'x', productName: '套餐', quantity: 1,
          comboItemList: [{ name: '板烧鸡腿堡', quantity: 1 }, { name: '中薯条', quantity: 2 }] }] },
      { orderId: '2', createTime: '2026-08-03 12:00:00', storeName: '测试餐厅', realTotalAmount: '13.9',
        orderProductList: [{ productCode: 'y', productName: '随心配', quantity: 1,
          comboItemList: [{ name: '酥酥多笋卷', quantity: 1 }] }] },
    ] } },
    'query-my-account': { data: { availablePoint: '48.4', accumulativePoint: '286.4', expiredPoint: '238', usedPoint: '0' } },
  });
  const m = aggregate(raw);
  assert.equal(m.overview.orderCount, 2);
  assert.equal(m.overview.totalSpend, 48.4);
  assert.equal(m.overview.totalItems, 4);
  assert.equal(m.categories.burger, 1);
  assert.equal(m.categories.snack, 3);
  assert.equal(m.monthly.length, 2);
  assert.equal(m.points.available, 48.4);
});

ok('Persona：有输出且主称号唯一', () => {
  const raw = loadDemoData();
  const m = aggregate(raw);
  const p = derivePersona(m);
  assert.ok(p.title.length > 0);
  assert.ok(p.keywords.length >= 1);
  assert.ok(p.allTraits.length >= 1);
});

ok('渲染：HTML 自包含且含图表容器', () => {
  const raw = loadDemoData();
  const m = aggregate(raw);
  const p = derivePersona(m);
  const html = renderReport(m, p);
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('chart-monthly'));
  assert.ok(html.includes('echarts.min.js'));
  assert.ok(html.includes('麦门年鉴'));
  assert.ok(!html.includes('${'), '存在未替换的模板占位符');
  assert.ok(!html.includes('>NaN<'), '存在 NaN 数值泄漏');
  assert.ok(!html.includes('undefined,'), '存在 undefined 泄漏');
  const md = renderMarkdown(m, p);
  assert.ok(md.includes('年度订单'));
});

ok('边界：空数据不崩溃', () => {
  const raw = normalizeFromRaw({});
  const m = aggregate(raw);
  const p = derivePersona(m);
  const html = renderReport(m, p);
  assert.ok(html.includes('还没有订单'));
});

console.log(`\n${passed} 项通过`);
