/**
 * render.mjs — 年报渲染器
 *
 * 输入 aggregate 模型 + persona，输出自包含 HTML（ECharts CDN）。
 * 设计语言：暖白纸面 + 麦当劳红黄点缀 + 编辑排版（子图编号 + 图注式说明）。
 */

const C = {
  red: '#DA291C', redDeep: '#A50F08', redSoft: '#F2B8B2',
  yellow: '#FFC72C', yellowSoft: '#FFE9A8',
  ink: '#241F1B', ink2: '#8A8178', line: '#EAE2D6',
  paper: '#FAF7F2', card: '#FFFFFF',
  gray: '#C9C2B8', green: '#3E7C4F',
};

const fmtMoney = (v) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const fmtInt = (v) => Number(v).toLocaleString('zh-CN');
const pad2 = (x) => String(x).padStart(2, '0');
const safe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CAT_LABELS = { burger: '汉堡', snack: '小食', drink: '饮料', dessert: '甜品', breakfast: '早餐', other: '其他' };

export function renderReport(model, persona, { echartsSource } = {}) {
  const m = model;
  const monthly = m.monthly.map((x) => ({ month: x.month.slice(2), spend: x.spend, count: x.count }));
  const cats = Object.entries(m.categories).filter(([, v]) => v > 0).map(([k, v]) => ({ name: CAT_LABELS[k] || k, value: v }));
  const topProducts = m.topProducts.map((p) => ({ name: p.name, value: p.count }));
  const hours = m.hourHist.map((v, h) => ({ hour: `${pad2(h)}:00`, value: v }));
  const weekdays = m.weekdayHist.map((v, i) => ({ name: WEEKDAYS[i], value: v }));

  const hasOrders = m.overview.orderCount > 0;
  const maxWeekday = Math.max(1, ...weekdays.map((w) => w.value));

  const chartData = JSON.stringify({ monthly, cats, topProducts, hours })
    .replace(/<\//g, '<\\/');

  const emptyNote = (text) => `<p class="empty">${safe(text)}</p>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>麦门年鉴 ${m.meta.titleYear} · ${safe(persona.title)}</title>
<script>${echartsSource
    ? echartsSource.replace(/<\/script/gi, '<\\/script')
    : `if (!window.echarts) { var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js'; s.onload = function () { window.dispatchEvent(new Event('resize')); }; document.head.appendChild(s); }`}</script>
<style>
  :root {
    --red: ${C.red}; --red-deep: ${C.redDeep}; --red-soft: ${C.redSoft};
    --yellow: ${C.yellow}; --yellow-soft: ${C.yellowSoft};
    --ink: ${C.ink}; --ink2: ${C.ink2}; --line: ${C.line};
    --paper: ${C.paper}; --card: ${C.card}; --gray: ${C.gray};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--paper); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif;
    line-height: 1.7; -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 860px; margin: 0 auto; padding: 48px 24px 64px; }
  .serif { font-family: Georgia, "Times New Roman", "Songti SC", SimSun, serif; }

  /* ---------- 封面 ---------- */
  .cover { text-align: center; padding: 56px 0 40px; position: relative; }
  .cover .year {
    font-size: 88px; font-weight: 700; letter-spacing: 6px; line-height: 1;
    color: var(--red); font-family: Georgia, "Times New Roman", serif;
  }
  .cover h1 { font-size: 40px; font-weight: 700; letter-spacing: 10px; margin: 14px 0 6px; }
  .cover .subtitle { color: var(--ink2); font-size: 14px; letter-spacing: 2px; }
  .persona-badge {
    display: inline-block; margin-top: 26px; padding: 10px 28px;
    background: var(--yellow); color: var(--ink); font-size: 18px; font-weight: 700;
    letter-spacing: 3px; border-radius: 999px;
  }
  .persona-desc { margin-top: 12px; color: var(--ink2); font-size: 14px; }
  .cover .range { margin-top: 22px; font-size: 12px; color: var(--ink2); letter-spacing: 1px; }
  .cover .rule { width: 56px; height: 3px; background: var(--red); margin: 26px auto 0; }

  /* ---------- 指标卡 ---------- */
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 36px 0 8px; }
  .metric { background: var(--card); border: 0.5px solid var(--line); border-radius: 14px; padding: 18px 16px; }
  .metric .label { font-size: 12px; color: var(--ink2); letter-spacing: 1px; }
  .metric .value { font-size: 26px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .metric .value .unit { font-size: 13px; font-weight: 400; color: var(--ink2); margin-left: 2px; }
  .metric.hot .value { color: var(--red); }

  /* ---------- 章节 ---------- */
  section.card {
    background: var(--card); border: 0.5px solid var(--line); border-radius: 16px;
    padding: 26px 28px; margin-top: 20px;
  }
  .sec-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; }
  .sec-head .no { font-family: Georgia, serif; font-size: 15px; color: var(--red); font-weight: 700; }
  .sec-head h2 { font-size: 19px; font-weight: 700; letter-spacing: 1px; }
  .sec-note { font-size: 13px; color: var(--ink2); margin-bottom: 10px; }
  .chart { width: 100%; height: 300px; }
  .chart.tall { height: 340px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
  .grid-2 section.card { margin-top: 0; }
  .empty { color: var(--ink2); font-size: 13px; padding: 40px 0; text-align: center; }

  /* ---------- 热量 ---------- */
  .calorie-row { display: flex; align-items: flex-end; gap: 28px; flex-wrap: wrap; padding: 8px 0 4px; }
  .calorie-big .num { font-size: 44px; font-weight: 700; color: var(--red); font-variant-numeric: tabular-nums; }
  .calorie-big .unit { font-size: 14px; color: var(--ink2); margin-left: 4px; }
  .calorie-side { display: flex; gap: 28px; }
  .calorie-side .item .k { font-size: 12px; color: var(--ink2); }
  .calorie-side .item .v { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }

  /* ---------- 麦门作息 ---------- */
  .habit-bars { display: flex; align-items: flex-end; gap: 10px; height: 90px; margin-top: 14px; }
  .habit-bars .b { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .habit-bars .bar { width: 100%; background: var(--yellow-soft); border-radius: 4px 4px 0 0; min-height: 2px; }
  .habit-bars .bar.peak { background: var(--yellow); }
  .habit-bars .t { font-size: 11px; color: var(--ink2); }
  .habit-bars .c { font-size: 11px; color: var(--ink); font-weight: 700; }

  /* ---------- 省钱 / 积分 ---------- */
  .stat-list { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
  .stat-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; }
  .stat-row .k { color: var(--ink2); }
  .stat-row .v { font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat-row .v.red { color: var(--red); }
  .stat-row .v.green { color: ${C.green}; }
  .points-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; margin: 14px 0 10px; background: var(--line); }
  .points-bar span { display: block; height: 100%; }
  .points-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--ink2); }
  .points-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; }

  /* ---------- 奖品 ---------- */
  .prize-list { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
  .prize { display: flex; align-items: center; gap: 14px; padding: 12px 14px; background: var(--paper); border-radius: 10px; }
  .prize .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--yellow); flex: none; }
  .prize .dot.used { background: var(--gray); }
  .prize .name { font-weight: 700; font-size: 14px; }
  .prize .time { font-size: 12px; color: var(--ink2); margin-left: auto; font-variant-numeric: tabular-nums; }
  .prize .status { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--yellow-soft); }
  .prize .status.off { background: #EFEAE2; color: var(--ink2); }

  /* ---------- 活动足迹 ---------- */
  .campaign-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .campaign { display: flex; gap: 14px; font-size: 13px; align-items: baseline; }
  .campaign .d { color: var(--red); font-variant-numeric: tabular-nums; flex: none; font-weight: 700; }
  .campaign .t { color: var(--ink); }

  /* ---------- 关键词 ---------- */
  .keyword-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
  .keyword { padding: 8px 18px; border: 1px solid var(--red); color: var(--red-deep); border-radius: 999px; font-size: 14px; font-weight: 700; letter-spacing: 1px; }
  .keyword.main { background: var(--red); color: #fff; border-color: var(--red); }
  .fact-list { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
  .fact-list li { font-size: 13px; color: var(--ink2); list-style: none; padding-left: 16px; position: relative; }
  .fact-list li::before { content: ""; position: absolute; left: 0; top: 9px; width: 6px; height: 6px; background: var(--yellow); border-radius: 50%; }

  /* ---------- 分享卡 ---------- */
  .share-card {
    margin-top: 24px; border: 2px solid var(--ink); border-radius: 18px; padding: 30px 28px;
    background: linear-gradient(180deg, #fff 0%, var(--paper) 100%); text-align: center;
  }
  .share-card .sc-title { font-size: 22px; font-weight: 700; letter-spacing: 4px; }
  .share-card .sc-persona { display: inline-block; margin-top: 10px; background: var(--yellow); padding: 4px 16px; border-radius: 999px; font-size: 13px; font-weight: 700; }
  .share-card .sc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 22px; }
  .share-card .sc-grid .cell .v { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .share-card .sc-grid .cell .k { font-size: 11px; color: var(--ink2); margin-top: 2px; }
  .share-card .sc-foot { margin-top: 20px; font-size: 12px; color: var(--ink2); letter-spacing: 1px; }
  .share-card .sc-foot b { color: var(--red); }

  footer { text-align: center; margin-top: 28px; font-size: 12px; color: var(--ink2); }
  footer .disclaimer { margin-top: 6px; font-size: 11px; }

  @media (max-width: 720px) {
    .metrics { grid-template-columns: repeat(2, 1fr); }
    .grid-2 { grid-template-columns: 1fr; }
    .cover .year { font-size: 64px; }
    .cover h1 { font-size: 30px; }
    .share-card .sc-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media print {
    body { background: #fff; }
    section.card, .share-card { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <header class="cover">
    <div class="year serif">${m.meta.titleYear}</div>
    <h1>麦门年鉴</h1>
    <p class="subtitle">MCDONALD'S YEARBOOK · 个人年度饮食报告</p>
    <div><span class="persona-badge">${safe(persona.title)}</span></div>
    <p class="persona-desc">${safe(persona.desc)}</p>
    <p class="range">数据周期 ${m.meta.rangeLabel} · 账号 ${m.account.masked} · 由麦当劳 MCP 真实数据生成${m.meta.isDemo ? '（当前为合成演示数据）' : ''}</p>
    <div class="rule"></div>
  </header>

  <div class="metrics">
    <div class="metric hot"><div class="label">年度订单</div><div class="value">${fmtInt(m.overview.orderCount)}<span class="unit">单</span></div></div>
    <div class="metric"><div class="label">总消费</div><div class="value">${fmtMoney(m.overview.totalSpend)}</div></div>
    <div class="metric"><div class="label">券后节省</div><div class="value">${fmtMoney(m.overview.savedFromCoupons)}</div></div>
    <div class="metric"><div class="label">当前积分</div><div class="value">${fmtInt(m.overview.availablePoints)}</div></div>
  </div>

  <section class="card">
    <div class="sec-head"><span class="no">01</span><h2>消费轨迹</h2></div>
    <p class="sec-note">按月统计的订单金额与单量。全年共 ${fmtInt(m.overview.orderCount)} 单，客单价 ${fmtMoney(m.overview.avgSpend)}。</p>
    ${hasOrders ? '<div id="chart-monthly" class="chart"></div>' : emptyNote('周期内还没有订单，去麦当劳来一单，明年年鉴见。')}
  </section>

  <div class="grid-2">
    <section class="card">
      <div class="sec-head"><span class="no">02</span><h2>品类偏好</h2></div>
      <p class="sec-note">按餐品件数统计的品类构成。</p>
      ${cats.length ? '<div id="chart-category" class="chart"></div>' : emptyNote('暂无品类数据')}
    </section>
    <section class="card">
      <div class="sec-head"><span class="no">03</span><h2>常驻餐品 TOP5</h2></div>
      <p class="sec-note">按订单中出现次数排名。</p>
      ${topProducts.length ? '<div id="chart-top" class="chart"></div>' : emptyNote('暂无餐品数据')}
    </section>
  </div>

  <section class="card">
    <div class="sec-head"><span class="no">04</span><h2>热量成就</h2></div>
    <p class="sec-note">基于麦当劳官方营养数据（list-nutrition-foods）逐项换算，匹配率约 ${m.calories.matchedRatio}%。</p>
    <div class="calorie-row">
      <div class="calorie-big"><span class="num">${fmtInt(m.calories.total)}</span><span class="unit">kcal</span></div>
      <div class="calorie-side">
        <div class="item"><div class="k">约等于巨无霸</div><div class="v">${m.calories.bigMacEquiv} 个</div></div>
        <div class="item"><div class="k">单均热量</div><div class="v">${fmtInt(m.calories.perOrder)} kcal</div></div>
        <div class="item"><div class="k">总餐品件数</div><div class="v">${fmtInt(m.overview.totalItems)} 件</div></div>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="sec-head"><span class="no">05</span><h2>麦门作息</h2></div>
    <p class="sec-note">一天 24 小时的下单分布。你的高频时段是 ${pad2(m.peakHour)}:00–${pad2((m.peakHour + 1) % 24)}:00。</p>
    ${hasOrders ? '<div id="chart-hour" class="chart"></div>' : emptyNote('暂无作息数据')}
    <div class="habit-bars">
      ${weekdays.map((w) => `
        <div class="b">
          <span class="c">${w.value}</span>
          <div class="bar${w.value === maxWeekday ? ' peak' : ''}" style="height:${Math.max(2, (w.value / maxWeekday) * 100)}%"></div>
          <span class="t">${w.name}</span>
        </div>`).join('')}
    </div>
    <p class="sec-note" style="margin-top:10px">早餐时段订单 ${m.habits.breakfastOrders} 单 · 深夜（21 点后 / 5 点前）${m.habits.lateNightOrders} 单 · 周末 ${m.habits.weekendOrders} 单</p>
  </section>

  <div class="grid-2">
    <section class="card">
      <div class="sec-head"><span class="no">06</span><h2>省钱战绩</h2></div>
      <div class="stat-list">
        <div class="stat-row"><span class="k">卡包优惠券</span><span class="v">${fmtInt(m.coupons.owned)} 张</span></div>
        <div class="stat-row"><span class="k">已使用</span><span class="v">${fmtInt(m.coupons.used)} 张</span></div>
        <div class="stat-row"><span class="k">券面总额</span><span class="v red">${fmtMoney(m.coupons.savedTotal)}</span></div>
        <div class="stat-row"><span class="k">麦麦省待领</span><span class="v green">${fmtInt(m.coupons.claimable)} 张</span></div>
      </div>
      <p class="sec-note" style="margin-top:12px">${m.coupons.claimable > 0 ? `还有 ${m.coupons.claimable} 张券躺在麦麦省等你领。` : '卡包很干净，麦麦省暂时无待领券。'}</p>
    </section>
    <section class="card">
      <div class="sec-head"><span class="no">07</span><h2>积分流水</h2></div>
      ${(() => {
        const p = m.points;
        const total = Math.max(1, p.accumulative);
        const seg = (v, color) => `<span style="width:${(v / total) * 100}%;background:${color}"></span>`;
        return `
      <div class="points-bar">${seg(p.used, C.red)}${seg(p.expired, C.gray)}${seg(p.available, C.yellow)}${seg(p.frozen, '#B7C4CF')}</div>
      <div class="points-legend">
        <span><i style="background:${C.red}"></i>已使用 ${fmtInt(p.used)}</span>
        <span><i style="background:${C.yellow}"></i>可用 ${fmtInt(p.available)}</span>
        <span><i style="background:${C.gray}"></i>已过期 ${fmtInt(p.expired)}</span>
        <span><i style="background:#B7C4CF"></i>冻结 ${fmtInt(p.frozen)}</span>
      </div>
      <div class="stat-list" style="margin-top:14px">
        <div class="stat-row"><span class="k">累计获得</span><span class="v">${fmtInt(p.accumulative)}</span></div>
        <div class="stat-row"><span class="k">本月即将过期</span><span class="v${p.expiringSoon > 0 ? ' red' : ''}">${fmtInt(p.expiringSoon)}</span></div>
      </div>
      <p class="sec-note" style="margin-top:12px">${p.expiringSoon > 0 ? `有 ${fmtInt(p.expiringSoon)} 积分即将过期，赶紧去麦麦商城看看。` : '暂无临近过期的积分。'}</p>`;
      })()}
    </section>
  </div>

  <section class="card">
    <div class="sec-head"><span class="no">08</span><h2>幸运时刻</h2></div>
    <p class="sec-note">${m.lottery ? `${safe(m.lottery.name)} · 每次消耗 ${m.lottery.drawPoint} 积分 · 奖池：${m.lottery.prizePool.map(safe).join(' / ')}` : '暂无抽奖活动数据'}</p>
    ${m.prizes.length ? `<div class="prize-list">
      ${m.prizes.map((p) => `
        <div class="prize">
          <span class="dot${/过期|失效|已使用/.test(p.status) ? ' used' : ''}"></span>
          <span class="name">${safe(p.name)}</span>
          <span class="status${/过期|失效|已使用/.test(p.status) ? ' off' : ''}">${safe(p.status)}</span>
          <span class="time">${safe((p.time || '').slice(0, 10))}</span>
        </div>`).join('')}
    </div>` : emptyNote('这一年还没有中奖记录，明年手气说不定就在你身上。')}
  </section>

  <section class="card">
    <div class="sec-head"><span class="no">09</span><h2>活动足迹</h2></div>
    <p class="sec-note">数据周期内麦当劳中国营销活动共 ${fmtInt(m.campaigns.count)} 场，以下为部分摘录。</p>
    ${m.campaigns.items.length ? `<div class="campaign-list">
      ${m.campaigns.items.map((c) => `<div class="campaign"><span class="d">${safe(c.date)}</span><span class="t">${safe(c.title)}</span></div>`).join('')}
    </div>` : emptyNote('暂无活动日历数据')}
  </section>

  <section class="card">
    <div class="sec-head"><span class="no">10</span><h2>年度关键词</h2></div>
    <div class="keyword-row">
      <span class="keyword main">${safe(persona.title)}</span>
      ${persona.keywords.filter((k) => k !== persona.title).map((k) => `<span class="keyword">${safe(k)}</span>`).join('')}
    </div>
    <ul class="fact-list">
      ${persona.facts.map((f) => `<li>${safe(f)}</li>`).join('')}
      ${m.maxOrder ? `<li>最贵一单：${fmtMoney(m.maxOrder.amount)}（${safe(m.maxOrder.items)}）</li>` : ''}
      ${m.topStores[0] ? `<li>最常光顾：${safe(m.topStores[0].name)}（${m.topStores[0].count} 次）</li>` : ''}
    </ul>
  </section>

  <div class="share-card">
    <div class="sc-title serif">麦门年鉴 ${m.meta.titleYear}</div>
    <div><span class="sc-persona">${safe(persona.title)}</span></div>
    <div class="sc-grid">
      <div class="cell"><div class="v">${fmtInt(m.overview.orderCount)}</div><div class="k">年度订单</div></div>
      <div class="cell"><div class="v">${fmtMoney(m.overview.totalSpend)}</div><div class="k">总消费</div></div>
      <div class="cell"><div class="v">${fmtInt(m.calories.total)}</div><div class="k">总热量 kcal</div></div>
      <div class="cell"><div class="v">${m.calories.bigMacEquiv}</div><div class="k">巨无霸当量</div></div>
    </div>
    <div class="sc-foot">由 <b>mcd-yearbook</b> 生成 · 数据来自麦当劳中国 MCP · github.com/EldonQ/sparkEat</div>
  </div>

  <footer>
    <div>麦门年鉴 mcd-yearbook · 基于麦当劳中国 MCP 能力构建</div>
    <div class="disclaimer">本项目为参赛作品，非麦当劳官方产品；报告输出仅供参考，餐品信息以麦当劳官方渠道实时结果为准。</div>
  </footer>
</div>

<script>
(function () {
  var DATA = ${chartData};
  var RED = '${C.red}', YELLOW = '${C.yellow}', INK2 = '${C.ink2}', LINE = '${C.line}';
  var charts = [];
  function make(id, option) {
    var el = document.getElementById(id);
    if (!el || typeof echarts === 'undefined') return;
    var c = echarts.init(el, null, { renderer: 'canvas' });
    c.setOption(option);
    charts.push(c);
  }
  window.addEventListener('resize', function () { charts.forEach(function (c) { c.resize(); }); });

  function whenEchartsReady(cb) {
    if (window.echarts) { cb(); return; }
    if (!window.__ybLoading) {
      window.__ybLoading = true;
      window.__ybQueue = [];
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js';
      s.onload = function () { window.__ybQueue.forEach(function (f) { f(); }); };
      document.head.appendChild(s);
    }
    window.__ybQueue.push(cb);
  }
  whenEchartsReady(function () {
  var axisStyle = {
    axisLine: { lineStyle: { color: LINE } },
    axisLabel: { color: INK2, fontSize: 11 },
    splitLine: { lineStyle: { color: LINE } }
  };
  var tip = { trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontSize: 12 } };

  make('chart-monthly', {
    tooltip: Object.assign({}, tip, { formatter: function (ps) { var p = ps[0]; return p.name + '<br/>消费 ' + p.value + ' 元 / ' + (DATA.monthly[p.dataIndex].count) + ' 单'; } }),
    grid: { left: 48, right: 16, top: 24, bottom: 28 },
    xAxis: Object.assign({ type: 'category', data: DATA.monthly.map(function (x) { return x.month; }) }, axisStyle, { splitLine: { show: false } }),
    yAxis: Object.assign({ type: 'value', name: '元' }, axisStyle),
    series: [{
      type: 'bar', data: DATA.monthly.map(function (x) { return x.spend; }),
      barMaxWidth: 34, itemStyle: { color: RED, borderRadius: [4, 4, 0, 0] }
    }]
  });

  make('chart-category', {
    tooltip: { trigger: 'item', formatter: '{b} {c} 件 ({d}%)' },
    legend: { bottom: 0, textStyle: { color: INK2, fontSize: 12 }, itemWidth: 12, itemHeight: 8 },
    series: [{
      type: 'pie', radius: ['46%', '70%'], center: ['50%', '44%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
      label: { show: false }, labelLine: { show: false },
      data: DATA.cats.map(function (x, i) {
        return { name: x.name, value: x.value, itemStyle: { color: [RED, YELLOW, '#3D3A36', '#F2B8B2', '#C9C2B8'][i % 5] } };
      })
    }]
  });

  make('chart-top', {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) { var p = ps[0]; return p.name + '：' + p.value + ' 次'; } },
    grid: { left: 8, right: 36, top: 8, bottom: 8, containLabel: true },
    xAxis: Object.assign({ type: 'value' }, axisStyle, { splitLine: { show: false } }),
    yAxis: Object.assign({ type: 'category', inverse: true, data: DATA.topProducts.map(function (x) { return x.name; }) }, axisStyle, { splitLine: { show: false } }),
    series: [{
      type: 'bar', data: DATA.topProducts.map(function (x) { return x.value; }),
      barMaxWidth: 16,
      itemStyle: { color: YELLOW, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: INK2, fontSize: 11 }
    }]
  });

  make('chart-hour', {
    tooltip: Object.assign({}, tip, { formatter: function (ps) { var p = ps[0]; return p.name + ' 下单 ' + p.value + ' 单'; } }),
    grid: { left: 40, right: 16, top: 24, bottom: 28 },
    xAxis: Object.assign({ type: 'category', data: DATA.hours.map(function (x) { return x.hour; }) }, axisStyle, { splitLine: { show: false }, axisLabel: { interval: 1 } }),
    yAxis: Object.assign({ type: 'value', minInterval: 1 }, axisStyle),
    series: [{
      type: 'bar', data: DATA.hours.map(function (x) { return x.value; }),
      barMaxWidth: 12,
      itemStyle: { color: '#FFD96B', borderRadius: [3, 3, 0, 0] },
      markPoint: DATA.hours.reduce(function (acc, x, i) {
        if (x.value === Math.max.apply(null, DATA.hours.map(function (h) { return h.value; })) && x.value > 0) {
          acc.push({ coord: [i, x.value], value: '峰值', itemStyle: { color: RED }, label: { fontSize: 10, color: '#fff' } });
        }
        return acc;
      }, [])
    }]
  });
  });
})();
</script>
</body>
</html>`;
}

/** 终端 / Issue 简介用的 Markdown 摘要 */
export function renderMarkdown(model, persona) {
  const m = model;
  const lines = [
    `# 麦门年鉴 ${m.meta.titleYear} · ${persona.title}`,
    '',
    `> ${persona.desc}`,
    '',
    `- 数据周期：${m.meta.rangeLabel}`,
    `- 年度订单：${m.overview.orderCount} 单，总消费 ${fmtMoney(m.overview.totalSpend)}，客单价 ${fmtMoney(m.overview.avgSpend)}`,
    `- 券后节省：${fmtMoney(m.overview.savedFromCoupons)}，待领券 ${m.coupons.claimable} 张`,
    `- 总热量：${fmtInt(m.calories.total)} kcal（约 ${m.calories.bigMacEquiv} 个巨无霸）`,
    `- 积分：可用 ${m.points.available} / 累计 ${m.points.accumulative} / 已过期 ${m.points.expired}`,
  ];
  if (m.topProducts[0]) lines.push(`- 年度餐品：${m.topProducts.map((p) => `${p.name} x${p.count}`).join('，')}`);
  if (m.prizes.length) lines.push(`- 中奖记录：${m.prizes.map((p) => p.name).join('，')}`);
  lines.push('', `*由 mcd-yearbook 生成，数据来自麦当劳中国 MCP。非麦当劳官方产品。*`);
  return lines.join('\n');
}
