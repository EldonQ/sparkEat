/**
 * render-story.mjs — 麦门年鉴 · Wrapped 动效故事流渲染器
 *
 * 全屏 scroll-driven 故事流：数字 count-up、入场渐显、图表滚动触发、
 * 称号盖章、足迹地图（腾讯地图合规代理 + 降级）、shimmer 分享卡。
 * 同一文件兼顾屏幕浏览与打印/PDF（beforeprint 强制终态）。
 */
import { pad2 } from './story-data.mjs';

const C = {
  red: '#DA291C', redDeep: '#8F0B05', redSoft: '#F5C0B8',
  yellow: '#FFC72C', yellowDeep: '#E5A800', yellowSoft: '#FFF0C2',
  ink: '#221D19', ink2: '#8A8178', line: '#EAE2D6',
  paper: '#FAF7F2', card: '#FFFFFF', gray: '#C9C2B8',
};

const fmtMoney = (v) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
const fmtInt = (v) => Number(v).toLocaleString('zh-CN');
const safe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CAT_LABELS = { burger: '汉堡', snack: '小食', drink: '饮料', dessert: '甜品', breakfast: '早餐', other: '其他' };

export function renderStory(story, { echartsSource } = {}) {
  const m = story;
  const monthly = m.monthly.map((x) => ({ month: x.month.slice(2), spend: x.spend, count: x.count }));
  const cats = Object.entries(m.categories).filter(([, v]) => v > 0).map(([k, v]) => ({ name: CAT_LABELS[k] || k, value: v }));
  const topProducts = m.topProducts.map((p) => ({ name: p.name, value: p.count }));
  const hours = m.hourHist.map((v, h) => ({ hour: pad2(h), value: v }));
  const weekdays = m.weekdayHist.map((v, i) => ({ name: WEEKDAYS[i], value: v }));
  const maxWeekday = Math.max(1, ...weekdays.map((w) => w.value));
  const hasOrders = m.overview.orderCount > 0;
  const fp = m.footprint;

  const chartData = JSON.stringify({ monthly, cats, topProducts, hours })
    .replace(/<\//g, '<\\/');
  const fpData = JSON.stringify({
    cities: fp.cities.map((c) => ({ city: c.city, count: c.count, lng: c.coords?.[0] ?? null, lat: c.coords?.[1] ?? null })),
    stores: fp.stores.slice(0, 12).map((s) => ({ name: s.name, count: s.count, lng: s.coords?.[0] ?? null, lat: s.coords?.[1] ?? null })),
  }).replace(/<\//g, '<\\/');

  // ---------- 各屏 ----------
  const screenCover = `
  <section class="scr scr-cover" data-idx="0">
    <div class="wrap">
      <div class="cover-year rv">${m.meta.titleYear}</div>
      <h1 class="cover-title rv" style="--d:.1s">麦门年鉴</h1>
      <p class="cover-sub rv" style="--d:.2s">MCDONALD'S YEARBOOK · 个人年度饮食报告</p>
      <div class="stamp-wrap rv" style="--d:.45s"><span class="stamp">${safe(m.persona.title)}</span></div>
      <p class="cover-desc rv" style="--d:.6s">${safe(m.persona.desc)}</p>
      <p class="cover-range rv" style="--d:.75s">数据周期 ${m.meta.rangeLabel} · 账号 ${m.account.masked}<br>由麦当劳 MCP 真实数据生成${m.meta.isDemo ? '（合成演示数据）' : ''}</p>
      <div class="scroll-hint rv" style="--d:1s"><span class="mouse"><span class="wheel"></span></span>向下滚动，开启你的麦门一年</div>
    </div>
  </section>`;

  const screenOverview = `
  <section class="scr" data-idx="1">
    <div class="wrap">
      <div class="kicker rv"><span class="no">01</span>年度总览</div>
      <h2 class="h2 rv" style="--d:.05s">这一年，麦门记得你的每一次到来</h2>
      <div class="metric-grid">
        <div class="metric rv" style="--d:.15s"><div class="m-num"><span class="cnt" data-to="${m.overview.orderCount}">0</span><span class="m-unit">单</span></div><div class="m-label">年度订单</div></div>
        <div class="metric rv" style="--d:.25s"><div class="m-num"><span class="cnt" data-to="${m.overview.totalSpend}" data-fmt="money">0</span></div><div class="m-label">总消费</div></div>
        <div class="metric rv" style="--d:.35s"><div class="m-num"><span class="cnt" data-to="${m.overview.savedFromCoupons}" data-fmt="money">0</span></div><div class="m-label">券后节省</div></div>
        <div class="metric rv" style="--d:.45s"><div class="m-num"><span class="cnt" data-to="${m.overview.availablePoints}" data-fmt="int">0</span></div><div class="m-label">当前积分</div></div>
      </div>
      <p class="sec-note rv" style="--d:.55s">共 ${fmtInt(m.overview.totalItems)} 件餐品，客单价 ${fmtMoney(m.overview.avgSpend)}${m.peak ? `，${m.peak.label}是你的消费巅峰（${fmtMoney(m.peak.spend)} / ${m.peak.count} 单）` : ''}。</p>
    </div>
  </section>`;

  const screenTrajectory = `
  <section class="scr" data-idx="2">
    <div class="wrap">
      <div class="kicker rv"><span class="no">02</span>消费轨迹</div>
      <h2 class="h2 rv" style="--d:.05s">${m.peak ? `${m.peak.label}，你为麦门出力最多` : '你的消费节奏'}</h2>
      ${hasOrders ? '<div class="chart-box rv" style="--d:.2s" data-chart="st-monthly"><div id="st-monthly" class="chart"></div></div>' : '<p class="empty rv">周期内还没有订单记录。</p>'}
      <p class="sec-note rv" style="--d:.4s">按月订单金额。${m.peak ? `峰值 ${m.peak.label} ${fmtMoney(m.peak.spend)}。` : ''}稳定的输出，是麦门信徒的修养。</p>
    </div>
  </section>`;

  const screenCategory = `
  <section class="scr" data-idx="3">
    <div class="wrap">
      <div class="kicker rv"><span class="no">03</span>品类偏好</div>
      <h2 class="h2 rv" style="--d:.05s">汉堡、小食、饮料，谁是本命？</h2>
      <div class="cat-layout">
        ${cats.length ? '<div class="chart-box rv" style="--d:.2s" data-chart="st-category"><div id="st-category" class="chart chart-donut"></div></div>' : '<p class="empty rv">暂无品类数据</p>'}
        <div class="cat-legend">
          ${Object.entries(m.categories).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v], i) => {
            const total = Object.values(m.categories).reduce((a, b) => a + b, 0) || 1;
            const pct = Math.round((v / total) * 100);
            return `<div class="cat-row rv" style="--d:${0.25 + i * 0.08}s">
              <span class="cat-dot" style="background:${['#DA291C', '#FFC72C', '#3D3A36', '#F5C0B8', '#C9C2B8'][i % 5]}"></span>
              <span class="cat-name">${CAT_LABELS[k] || k}</span>
              <span class="cat-bar"><span class="cat-fill" style="--w:${pct}%"></span></span>
              <span class="cat-pct">${pct}%</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  </section>`;

  const screenTop = `
  <section class="scr" data-idx="4">
    <div class="wrap">
      <div class="kicker rv"><span class="no">04</span>常驻餐品</div>
      <h2 class="h2 rv" style="--d:.05s">这一年，你点的最多的是</h2>
      ${topProducts.length ? `<div class="top-list">
        ${topProducts.map((p, i) => `<div class="top-row rv" style="--d:${0.15 + i * 0.1}s">
          <span class="top-rank">${i + 1}</span>
          <span class="top-name">${safe(p.name)}</span>
          <span class="top-bar"><span class="top-fill" style="--fw:${Math.round((p.value / topProducts[0].value) * 100)}%"></span></span>
          <span class="top-count">${p.value} 次</span>
        </div>`).join('')}
      </div>` : '<p class="empty rv">暂无餐品数据</p>'}
      <p class="sec-note rv" style="--d:.7s">${topProducts[0] ? `「${safe(topProducts[0].name)}」是你的年度本命，没有之一。` : ''}</p>
    </div>
  </section>`;

  const screenCalories = `
  <section class="scr scr-dark" data-idx="5">
    <div class="wrap">
      <div class="kicker kicker-dark rv"><span class="no">05</span>热量成就</div>
      <h2 class="h2 h2-dark rv" style="--d:.05s">你的年度热量，超乎想象</h2>
      <div class="cal-hero">
        <div class="cal-num rv" style="--d:.2s"><span class="cnt" data-to="${m.calories.total}" data-fmt="int">0</span><span class="cal-unit">kcal</span></div>
        <div class="cal-equiv rv" style="--d:.35s">约等于 <b>${m.calories.bigMacEquiv}</b> 个巨无霸</div>
      </div>
      <div class="cal-fun">
        ${(m.calorieFun || []).map((f, i) => `<div class="fun-card rv" style="--d:${0.45 + i * 0.12}s">
          <div class="fun-v">${f.value}</div><div class="fun-u">${f.unit}</div><div class="fun-n">${f.note}</div>
        </div>`).join('')}
      </div>
      <p class="sec-note note-dark rv" style="--d:.9s">基于麦当劳官方营养数据逐项换算，匹配率约 ${m.calories.matchedRatio}%；单均 ${fmtInt(m.calories.perOrder)} kcal。数字仅供娱乐，吃麦快乐更重要。</p>
    </div>
  </section>`;

  const screenSchedule = `
  <section class="scr" data-idx="6">
    <div class="wrap">
      <div class="kicker rv"><span class="no">06</span>麦门作息</div>
      <h2 class="h2 rv" style="--d:.05s">${safe(m.hourTitle.label)}</h2>
      <p class="sec-sub rv" style="--d:.1s">${safe(m.hourTitle.desc)}</p>
      ${hasOrders ? '<div class="chart-box rv" style="--d:.2s" data-chart="st-hour"><div id="st-hour" class="chart"></div></div>' : '<p class="empty rv">暂无作息数据</p>'}
      <div class="week-bars">
        ${weekdays.map((w, i) => `<div class="wk rv" style="--d:${0.3 + i * 0.05}s">
          <span class="wk-c">${w.value}</span>
          <div class="wk-bar"><span class="wk-fill${w.value === maxWeekday ? ' peak' : ''}" style="--h:${Math.max(3, (w.value / maxWeekday) * 100)}%"></span></div>
          <span class="wk-t">${w.name}</span>
        </div>`).join('')}
      </div>
      <p class="sec-note rv" style="--d:.7s">高频时段 ${pad2(m.peakHour)}:00–${pad2((m.peakHour + 1) % 24)}:00 · 早餐单 ${m.habits.breakfastOrders} · 深夜单 ${m.habits.lateNightOrders} · 周末单 ${m.habits.weekendOrders}</p>
    </div>
  </section>`;

  const screenMoney = `
  <section class="scr" data-idx="7">
    <div class="wrap">
      <div class="kicker rv"><span class="no">07</span>省钱与积分</div>
      <h2 class="h2 rv" style="--d:.05s">会吃，更会省</h2>
      <div class="duo">
        <div class="panel rv" style="--d:.15s">
          <div class="p-title">优惠券战绩</div>
          <div class="p-rows">
            <div class="p-row"><span>卡包优惠券</span><b>${fmtInt(m.coupons.owned)} 张</b></div>
            <div class="p-row"><span>已使用</span><b>${fmtInt(m.coupons.used)} 张</b></div>
            <div class="p-row hot"><span>券面总额</span><b>${fmtMoney(m.coupons.savedTotal)}</b></div>
            <div class="p-row"><span>麦麦省待领</span><b class="green">${fmtInt(m.coupons.claimable)} 张</b></div>
          </div>
          <p class="p-note">${m.coupons.claimable > 0 ? `还有 ${m.coupons.claimable} 张券躺在麦麦省，记得领。` : '卡包干净，麦麦省暂无待领。'}</p>
        </div>
        <div class="panel rv" style="--d:.3s">
          <div class="p-title">积分流水</div>
          <div class="pts-bar">
            <span class="seg used" style="width:${(m.points.used / Math.max(1, m.points.accumulative)) * 100}%"></span>
            <span class="seg avail" style="width:${(m.points.available / Math.max(1, m.points.accumulative)) * 100}%"></span>
            <span class="seg expired" style="width:${(m.points.expired / Math.max(1, m.points.accumulative)) * 100}%"></span>
          </div>
          <div class="pts-legend">
            <span><i style="background:#DA291C"></i>已用 ${fmtInt(m.points.used)}</span>
            <span><i style="background:#FFC72C"></i>可用 ${fmtInt(m.points.available)}</span>
            <span><i style="background:#C9C2B8"></i>过期 ${fmtInt(m.points.expired)}</span>
          </div>
          <div class="p-rows">
            <div class="p-row"><span>累计获得</span><b>${fmtInt(m.points.accumulative)}</b></div>
            <div class="p-row"><span>本月即将过期</span><b class="${m.points.expiringSoon > 0 ? 'red' : ''}">${fmtInt(m.points.expiringSoon)}</b></div>
          </div>
        </div>
      </div>
    </div>
  </section>`;

  const screenLucky = `
  <section class="scr" data-idx="8">
    <div class="wrap">
      <div class="kicker rv"><span class="no">08</span>幸运时刻</div>
      <h2 class="h2 rv" style="--d:.05s">积分抽奖，你的高光数据库</h2>
      ${m.lottery ? `<p class="sec-sub rv" style="--d:.1s">${safe(m.lottery.name)} · 每抽 ${m.lottery.drawPoint} 积分 · 奖池：${m.lottery.prizePool.map(safe).join(' / ')}</p>` : ''}
      ${m.prizes.length ? `<div class="prize-list">
        ${m.prizes.map((p, i) => `<div class="prize-card rv" style="--d:${0.2 + i * 0.12}s">
          <span class="p-dot${/过期|失效|已使用/.test(p.status) ? ' off' : ''}"></span>
          <span class="p-name">${safe(p.name)}</span>
          <span class="p-status${/过期|失效|已使用/.test(p.status) ? ' off' : ''}">${safe(p.status)}</span>
          <span class="p-time">${safe((p.time || '').slice(0, 10))}</span>
        </div>`).join('')}
      </div>` : '<p class="empty rv">这一年还没有中奖记录，明年手气说不定就在你身上。</p>'}
      ${m.campaigns.count > 0 ? `<p class="sec-note rv" style="--d:.5s">这一年麦当劳中国共上线 ${fmtInt(m.campaigns.count)} 场营销活动，从早餐两件套到联名周边，你都没缺席。</p>` : ''}
    </div>
  </section>`;

  const screenMap = `
  <section class="scr" data-idx="9">
    <div class="wrap">
      <div class="kicker rv"><span class="no">09</span>麦门足迹</div>
      <h2 class="h2 rv" style="--d:.05s">你的麦门版图</h2>
      <div class="map-card rv" style="--d:.15s">
        <div id="fp-map" class="fp-map"></div>
        <div id="fp-fallback" class="fp-fallback" style="display:none">
          <div class="fp-fb-title">足迹城市</div>
          ${fp.cities.map((c) => `<div class="fp-fb-row"><span class="fp-fb-city">${safe(c.city)}</span><span class="fp-fb-bar"><span style="width:${Math.round((c.count / fp.maxCount) * 100)}%"></span></span><span class="fp-fb-c">${c.count} 单</span></div>`).join('') || '<div class="fp-fb-row">暂无足迹数据</div>'}
        </div>
      </div>
      <div class="store-chips">
        ${fp.stores.slice(0, 6).map((s, i) => `<span class="chip rv" style="--d:${0.3 + i * 0.06}s">${safe(s.name)} · ${s.count} 次</span>`).join('')}
      </div>
      <p class="sec-note rv" style="--d:.6s">覆盖 ${fp.cities.length} 座城市、${fp.stores.length} 家门店${fp.stores[0] ? `，最常光顾「${safe(fp.stores[0].name)}」` : ''}。</p>
    </div>
  </section>`;

  const screenPersona = `
  <section class="scr scr-dark" data-idx="10">
    <div class="wrap">
      <div class="kicker kicker-dark rv"><span class="no">10</span>年度称号</div>
      <div class="persona-stage">
        <div class="big-stamp rv" style="--d:.2s">${safe(m.persona.title)}</div>
        <p class="persona-desc rv" style="--d:.5s">${safe(m.persona.desc)}</p>
        <div class="kw-row">
          ${m.persona.keywords.filter((k) => k !== m.persona.title).map((k, i) => `<span class="kw rv" style="--d:${0.6 + i * 0.1}s">${safe(k)}</span>`).join('')}
        </div>
        <ul class="fact-list">
          ${m.persona.facts.map((f, i) => `<li class="rv" style="--d:${0.8 + i * 0.08}s">${safe(f)}</li>`).join('')}
          ${m.maxOrder ? `<li class="rv" style="--d:1.1s">最贵一单：${fmtMoney(m.maxOrder.amount)}（${safe(m.maxOrder.items)}）</li>` : ''}
        </ul>
      </div>
    </div>
  </section>`;

  const screenShare = `
  <section class="scr" data-idx="11">
    <div class="wrap">
      <div class="kicker rv"><span class="no">11</span>分享卡片</div>
      <h2 class="h2 rv" style="--d:.05s">截图这一屏，晒出你的麦门一年</h2>
      <div class="share-card rv" style="--d:.2s">
        <div class="sc-glow"></div>
        <div class="sc-year">${m.meta.titleYear}</div>
        <div class="sc-title">麦门年鉴</div>
        <div class="sc-stamp">${safe(m.persona.title)}</div>
        <div class="sc-grid">
          <div class="sc-cell"><b>${fmtInt(m.overview.orderCount)}</b><span>年度订单</span></div>
          <div class="sc-cell"><b>${fmtMoney(m.overview.totalSpend)}</b><span>总消费</span></div>
          <div class="sc-cell"><b>${fmtInt(m.calories.total)}</b><span>总热量 kcal</span></div>
          <div class="sc-cell"><b>${m.calories.bigMacEquiv}</b><span>巨无霸当量</span></div>
        </div>
        <div class="sc-foot">mcd-yearbook · 数据来自麦当劳中国 MCP</div>
      </div>
      <p class="sec-note rv" style="--d:.4s">年报由 <b>mcd-yearbook</b> 生成，项目开源：github.com/EldonQ/sparkEat。本项目为参赛作品，非麦当劳官方产品；数据仅供参考。</p>
    </div>
  </section>`;

  // ---------- 页面骨架 ----------
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>麦门年鉴 ${m.meta.titleYear} · ${safe(m.persona.title)}</title>
<script>${echartsSource ? echartsSource.replace(/<\/script/gi, '<\\/script') : "document.addEventListener('DOMContentLoaded',function(){var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js';document.head.appendChild(s);});"}</script>
<script type="text/javascript">
window._TMapSecurityConfig = {
  serviceHost: 'http://127.0.0.1:__WB_HTTP_PORT__/_TMapService/_wbt/__WB_TMAP_SECRET__',
};
</script>
<style>
:root{
  --red:#DA291C; --red-deep:#8F0B05; --red-soft:#F5C0B8;
  --yellow:#FFC72C; --yellow-deep:#E5A800; --yellow-soft:#FFF0C2;
  --ink:#221D19; --ink2:#8A8178; --line:#EAE2D6;
  --paper:#FAF7F2; --card:#FFFFFF; --gray:#C9C2B8;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  background:var(--paper); color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Segoe UI",sans-serif;
  line-height:1.7; -webkit-font-smoothing:antialiased; overflow-x:hidden;
}
.serif{font-family:Georgia,"Times New Roman","Songti SC",SimSun,serif}
::selection{background:var(--yellow); color:var(--ink)}

/* 滚动进度条 */
.progress{position:fixed;top:0;left:0;height:3px;width:0;background:linear-gradient(90deg,var(--yellow),var(--red));z-index:99}

/* 全屏章节 */
.scr{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:72px 24px;position:relative;overflow:hidden}
.scr-dark{background:var(--ink);color:#F7F3EC}
.scr-cover{background:radial-gradient(1200px 600px at 50% -10%,#FFF6DC 0%,var(--paper) 55%)}
.wrap{max-width:880px;width:100%}

/* 入场动效 */
.rv{opacity:0;transform:translateY(34px);transition:opacity .8s cubic-bezier(.2,.7,.3,1),transform .8s cubic-bezier(.2,.7,.3,1);transition-delay:var(--d,0s)}
.rv.vis{opacity:1;transform:none}

/* 封面 */
.cover-year{font-family:Georgia,serif;font-size:120px;font-weight:700;line-height:1;color:var(--red);letter-spacing:8px;text-align:center}
.cover-title{font-size:52px;font-weight:700;letter-spacing:14px;text-align:center;margin:10px 0 4px;text-indent:14px}
.cover-sub{text-align:center;color:var(--ink2);font-size:13px;letter-spacing:3px}
.stamp-wrap{text-align:center;margin-top:34px}
.stamp{display:inline-block;background:var(--yellow);color:var(--ink);font-size:20px;font-weight:700;letter-spacing:4px;padding:12px 34px;border-radius:999px;box-shadow:0 6px 24px rgba(229,168,0,.35)}
.cover-desc{text-align:center;color:var(--ink2);margin-top:14px;font-size:15px}
.cover-range{text-align:center;margin-top:26px;font-size:12px;color:var(--ink2);letter-spacing:1px}
.scroll-hint{position:absolute;bottom:34px;left:0;right:0;text-align:center;color:var(--ink2);font-size:12px;letter-spacing:2px}
.mouse{display:inline-block;width:22px;height:34px;border:1.5px solid var(--ink2);border-radius:12px;position:relative;margin-bottom:8px}
.wheel{position:absolute;top:6px;left:50%;width:3px;height:7px;margin-left:-1.5px;background:var(--ink2);border-radius:2px;animation:wh 1.6s infinite}
@keyframes wh{0%{transform:translateY(0);opacity:1}70%{transform:translateY(10px);opacity:0}100%{opacity:0}}

/* 章节标题 */
.kicker{display:flex;align-items:baseline;gap:12px;color:var(--red);font-family:Georgia,serif;font-size:15px;font-weight:700;letter-spacing:2px;margin-bottom:8px}
.kicker .no{font-size:15px}
.kicker-dark{color:var(--yellow)}
.h2{font-size:34px;font-weight:700;letter-spacing:1px;line-height:1.35;margin-bottom:26px}
.h2-dark{color:#FDFBF6}
.sec-note{color:var(--ink2);font-size:14px;margin-top:18px}
.note-dark{color:#A79E92}
.sec-sub{color:var(--ink2);font-size:15px;margin:-14px 0 22px}
.empty{color:var(--ink2);padding:60px 0;text-align:center}

/* 总览指标 */
.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:8px}
.metric{background:var(--card);border:.5px solid var(--line);border-radius:18px;padding:26px 18px;text-align:center;transition:transform .3s}
.metric:hover{transform:translateY(-4px)}
.m-num{font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;font-family:Georgia,serif}
.m-unit{font-size:14px;font-weight:400;color:var(--ink2);margin-left:3px;font-family:inherit}
.m-label{font-size:13px;color:var(--ink2);margin-top:6px;letter-spacing:1px}

/* 图表 */
.chart-box{background:var(--card);border:.5px solid var(--line);border-radius:18px;padding:18px 14px 8px}
.chart{width:100%;height:340px}
.chart-donut{height:330px}

/* 品类 */
.cat-layout{display:grid;grid-template-columns:1.1fr .9fr;gap:20px;align-items:center}
.cat-legend{display:flex;flex-direction:column;gap:16px}
.cat-row{display:flex;align-items:center;gap:10px;font-size:14px}
.cat-dot{width:11px;height:11px;border-radius:3px;flex:none}
.cat-name{width:44px;flex:none;font-weight:700}
.cat-bar{flex:1;height:10px;background:var(--line);border-radius:5px;overflow:hidden}
.cat-fill{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--yellow),var(--red));width:0;transition:width 1.1s cubic-bezier(.2,.7,.3,1) .25s}
.rv.vis .cat-fill{width:var(--w,0)}
.cat-pct{width:42px;text-align:right;font-variant-numeric:tabular-nums;color:var(--ink2)}
.cat-fill[style]{transition:width 1.1s cubic-bezier(.2,.7,.3,1) .25s}

/* TOP5 */
.top-list{display:flex;flex-direction:column;gap:18px;margin-top:6px}
.top-row{display:flex;align-items:center;gap:14px;background:var(--card);border:.5px solid var(--line);border-radius:14px;padding:16px 20px}
.top-rank{font-family:Georgia,serif;font-size:24px;font-weight:700;color:var(--red);width:32px;flex:none}
.top-name{font-weight:700;font-size:16px;width:180px;flex:none}
.top-bar{flex:1;height:14px;background:var(--line);border-radius:7px;overflow:hidden}
.top-fill{display:block;height:100%;width:0;border-radius:7px;background:linear-gradient(90deg,var(--yellow-soft),var(--yellow),var(--red));transition:width 1s cubic-bezier(.2,.7,.3,1)}
.top-row.vis .top-fill{width:var(--fw)}
.top-count{font-variant-numeric:tabular-nums;color:var(--ink2);font-size:14px;width:64px;text-align:right;flex:none}

/* 热量深色屏 */
.cal-hero{text-align:center;margin:10px 0 30px}
.cal-num{font-family:Georgia,serif;font-size:84px;font-weight:700;color:var(--yellow);line-height:1;font-variant-numeric:tabular-nums}
.cal-unit{font-size:20px;color:#FDFBF6;margin-left:8px;font-family:inherit}
.cal-equiv{font-size:18px;margin-top:12px;color:#FDFBF6}
.cal-equiv b{color:var(--yellow);font-size:24px}
.cal-fun{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.fun-card{background:#2E2823;border:1px solid #3E372F;border-radius:16px;padding:22px 14px;text-align:center}
.fun-v{font-size:32px;font-weight:700;color:var(--yellow);font-variant-numeric:tabular-nums}
.fun-u{font-size:14px;color:#FDFBF6;margin-top:2px}
.fun-n{font-size:11px;color:#8F867B;margin-top:8px}

/* 作息 */
.week-bars{display:flex;align-items:flex-end;gap:12px;height:110px;margin-top:26px}
.wk{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%}
.wk-c{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
.wk-bar{flex:1;width:100%;display:flex;align-items:flex-end}
.wk-fill{display:block;width:100%;height:0;background:var(--yellow-soft);border-radius:5px 5px 0 0;transition:height .9s cubic-bezier(.2,.7,.3,1)}
.wk-fill.peak{background:var(--yellow)}
.wk.vis .wk-fill{height:var(--h)}
.wk-t{font-size:11px;color:var(--ink2)}

/* 省钱积分 */
.duo{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.panel{background:var(--card);border:.5px solid var(--line);border-radius:18px;padding:24px}
.p-title{font-size:17px;font-weight:700;margin-bottom:16px;letter-spacing:1px}
.p-rows{display:flex;flex-direction:column;gap:10px}
.p-row{display:flex;justify-content:space-between;font-size:14px;color:var(--ink2)}
.p-row b{color:var(--ink);font-variant-numeric:tabular-nums}
.p-row.hot b{color:var(--red)}
.p-row b.green{color:#3E7C4F}
.p-row b.red{color:var(--red)}
.p-note{font-size:12px;color:var(--ink2);margin-top:14px}
.pts-bar{display:flex;height:16px;border-radius:8px;overflow:hidden;background:var(--line);margin-bottom:12px}
.seg{display:block;height:100%}
.seg.used{background:var(--red)}
.seg.avail{background:var(--yellow)}
.seg.expired{background:var(--gray)}
.pts-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--ink2);margin-bottom:16px}
.pts-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}

/* 奖品 */
.prize-list{display:flex;flex-direction:column;gap:12px}
.prize-card{display:flex;align-items:center;gap:14px;background:var(--card);border:.5px solid var(--line);border-radius:14px;padding:16px 20px}
.p-dot{width:11px;height:11px;border-radius:50%;background:var(--yellow);flex:none;box-shadow:0 0 0 4px rgba(255,199,44,.25)}
.p-dot.off{background:var(--gray);box-shadow:none}
.p-name{font-weight:700}
.p-status{font-size:11px;padding:2px 10px;border-radius:999px;background:var(--yellow-soft);margin-left:auto}
.p-status.off{background:#F0EBE2;color:var(--ink2)}
.p-time{font-size:12px;color:var(--ink2);font-variant-numeric:tabular-nums}

/* 足迹地图 */
.map-card{border-radius:18px;overflow:hidden;border:.5px solid var(--line);background:var(--card)}
.fp-map{width:100%;height:420px}
.fp-fallback{padding:26px}
.fp-fb-title{font-size:15px;font-weight:700;margin-bottom:16px;letter-spacing:1px}
.fp-fb-row{display:flex;align-items:center;gap:12px;padding:8px 0;font-size:14px}
.fp-fb-city{width:64px;font-weight:700;flex:none}
.fp-fb-bar{flex:1;height:12px;background:var(--line);border-radius:6px;overflow:hidden}
.fp-fb-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--yellow),var(--red));border-radius:6px}
.fp-fb-c{color:var(--ink2);font-variant-numeric:tabular-nums;flex:none}
.store-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.chip{font-size:12px;background:var(--card);border:.5px solid var(--line);border-radius:999px;padding:6px 14px;color:var(--ink2)}

/* 称号深色屏 */
.persona-stage{text-align:center;padding:20px 0}
.big-stamp{display:inline-block;font-size:56px;font-weight:700;letter-spacing:8px;color:var(--ink);background:var(--yellow);padding:18px 44px;border-radius:20px;transform:rotate(-3deg);box-shadow:0 20px 60px rgba(255,199,44,.25);animation:stampin .9s cubic-bezier(.2,1.4,.4,1) .5s both}
@keyframes stampin{0%{transform:scale(2.2) rotate(-14deg);opacity:0}60%{opacity:1}100%{transform:scale(1) rotate(-3deg);opacity:1}}
.persona-desc{font-size:18px;color:#FDFBF6;margin-top:30px}
.kw-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:22px}
.kw{border:1px solid var(--yellow);color:var(--yellow);border-radius:999px;padding:6px 18px;font-size:14px;font-weight:700;letter-spacing:1px}
.fact-list{margin-top:26px;display:flex;flex-direction:column;gap:8px;list-style:none}
.fact-list li{font-size:14px;color:#C9BFAF;position:relative;padding-left:18px}
.fact-list li::before{content:"";position:absolute;left:0;top:10px;width:7px;height:7px;border-radius:50%;background:var(--yellow)}

/* 分享卡 */
.share-card{position:relative;border:2px solid var(--ink);border-radius:22px;padding:44px 36px;text-align:center;background:var(--card);overflow:hidden}
.sc-glow{position:absolute;inset:-60px;background:conic-gradient(from 0deg,transparent 0%,rgba(255,199,44,.35) 8%,transparent 16%,transparent 50%,rgba(218,41,28,.28) 58%,transparent 66%);animation:spin 7s linear infinite;pointer-events:none}
@keyframes spin{to{transform:rotate(360deg)}}
.sc-year{font-family:Georgia,serif;font-size:60px;font-weight:700;color:var(--red);line-height:1;position:relative}
.sc-title{font-size:30px;font-weight:700;letter-spacing:8px;margin-top:8px;position:relative}
.sc-stamp{display:inline-block;margin-top:16px;background:var(--yellow);padding:5px 20px;border-radius:999px;font-weight:700;font-size:14px;letter-spacing:2px;position:relative}
.sc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:30px;position:relative}
.sc-cell b{display:block;font-size:24px;font-variant-numeric:tabular-nums}
.sc-cell span{font-size:11px;color:var(--ink2)}
.sc-foot{margin-top:24px;font-size:12px;color:var(--ink2);position:relative}

/* 响应式 */
@media (max-width:720px){
  .cover-year{font-size:76px}
  .cover-title{font-size:34px;letter-spacing:8px}
  .h2{font-size:26px}
  .metric-grid{grid-template-columns:repeat(2,1fr)}
  .cat-layout,.duo{grid-template-columns:1fr}
  .cal-fun{grid-template-columns:repeat(3,1fr);gap:8px}
  .fun-v{font-size:22px}
  .cal-num{font-size:54px}
  .big-stamp{font-size:34px;letter-spacing:4px;padding:14px 24px}
  .sc-grid{grid-template-columns:repeat(2,1fr)}
  .fp-map{height:320px}
  .top-name{width:110px}
}

/* 动效降级 */
@media (prefers-reduced-motion:reduce){
  .rv{opacity:1;transform:none;transition:none}
  .big-stamp{animation:none;transform:rotate(-3deg)}
  .sc-glow{animation:none}
  .wheel{animation:none}
  .cat-fill,.top-fill,.wk-fill{transition:none}
}

/* 打印 / PDF */
@media print{
  @page{size:A4;margin:0}
  body{background:#fff}
  .progress,.scroll-hint{display:none}
  .scr{min-height:auto;padding:44px 28px;break-after:page;display:block}
  .scr:last-child{break-after:auto}
  .rv{opacity:1!important;transform:none!important;transition:none!important}
  .cat-fill,.top-fill,.wk-fill{transition:none!important}
  .big-stamp{animation:none;transform:rotate(-3deg)}
  .sc-glow{animation:none}
  .fp-map{display:none!important}
  .fp-fallback{display:block!important}
  .chart{height:300px}
}
</style>
</head>
<body>
<div class="progress" id="progress"></div>

${screenCover}
${screenOverview}
${screenTrajectory}
${screenCategory}
${screenTop}
${screenCalories}
${screenSchedule}
${screenMoney}
${screenLucky}
${screenMap}
${screenPersona}
${screenShare}

<script>
(function () {
  var STORY = ${chartData};
  var FP = ${fpData};
  var charts = {};
  var inited = {};

  /* ---------- 滚动进度 ---------- */
  var progress = document.getElementById('progress');
  function onScroll() {
    var h = document.documentElement;
    var p = h.scrollTop / (h.scrollHeight - h.clientHeight || 1);
    progress.style.width = (p * 100).toFixed(2) + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 入场观察 ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('vis');
      if (e.target.dataset.chart) drawChart(e.target.dataset.chart);
      io.unobserve(e.target);
    });
  }, { threshold: 0.25 });
  document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });

  /* ---------- 数字滚动 ---------- */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function fmt(v, mode) {
    if (mode === 'money') return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return Math.round(v).toLocaleString('zh-CN');
  }
  var countIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      countIO.unobserve(el);
      var to = parseFloat(el.dataset.to) || 0;
      var mode = el.dataset.fmt || 'int';
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to, mode); return; }
      var dur = 1400, t0 = null;
      function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        el.textContent = fmt(to * easeOut(p), mode);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('.cnt').forEach(function (el) { countIO.observe(el); });

  /* ---------- 图表 ---------- */
  var printMode = false;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var axisStyle = { axisLine: { lineStyle: { color: '#EAE2D6' } }, axisLabel: { color: '#8A8178', fontSize: 11 }, splitLine: { lineStyle: { color: '#EAE2D6' } } };
  var tip = { trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontSize: 12 } };

  function drawChart(id) {
    if (inited[id] || typeof echarts === 'undefined') return;
    inited[id] = true;
    var el = document.getElementById(id);
    if (!el) return;
    var noAnim = printMode || reduced;
    var c = echarts.init(el);
    charts[id] = c;
    if (id === 'st-monthly') {
      c.setOption({
        tooltip: Object.assign({}, tip, { formatter: function (ps) { var p = ps[0]; return p.name + '<br/>消费 ' + p.value + ' 元 / ' + STORY.monthly[p.dataIndex].count + ' 单'; } }),
        grid: { left: 52, right: 16, top: 26, bottom: 28 },
        xAxis: Object.assign({ type: 'category', data: STORY.monthly.map(function (x) { return x.month; }) }, axisStyle, { splitLine: { show: false } }),
        yAxis: Object.assign({ type: 'value' }, axisStyle),
        series: [{ type: 'bar', barMaxWidth: 32, itemStyle: { color: '#DA291C', borderRadius: [5, 5, 0, 0] },
          data: STORY.monthly.map(function (x) { return x.spend; }),
          animation: !noAnim, animationDuration: 1200, animationEasing: 'cubicOut' }]
      });
    } else if (id === 'st-category') {
      c.setOption({
        tooltip: { trigger: 'item', formatter: '{b} {c} 件 ({d}%)' },
        legend: { bottom: 0, textStyle: { color: '#8A8178', fontSize: 12 }, itemWidth: 12, itemHeight: 8 },
        series: [{ type: 'pie', radius: ['48%', '72%'], center: ['50%', '44%'],
          itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 5 },
          label: { show: false }, labelLine: { show: false },
          data: STORY.cats.map(function (x, i) { return { name: x.name, value: x.value, itemStyle: { color: ['#DA291C', '#FFC72C', '#3D3A36', '#F5C0B8', '#C9C2B8'][i % 5] } }; }),
          animation: !noAnim, animationDuration: 1400, animationEasing: 'cubicOut' }]
      });
    } else if (id === 'st-hour') {
      c.setOption({
        tooltip: Object.assign({}, tip, { formatter: function (ps) { var p = ps[0]; return p.name + ':00 下单 ' + p.value + ' 单'; } }),
        grid: { left: 40, right: 16, top: 26, bottom: 28 },
        xAxis: Object.assign({ type: 'category', data: STORY.hours.map(function (x) { return x.hour; }) }, axisStyle, { splitLine: { show: false }, axisLabel: { interval: 1 } }),
        yAxis: Object.assign({ type: 'value', minInterval: 1 }, axisStyle),
        series: [{ type: 'bar', barMaxWidth: 10, itemStyle: { color: '#FFD96B', borderRadius: [3, 3, 0, 0] },
          data: STORY.hours.map(function (x) { return x.value; }),
          animation: !noAnim, animationDuration: 1400, animationDelay: noAnim ? 0 : function (idx) { return idx * 30; } }]
      });
    }
  }
  function initAllCharts() { ['st-monthly', 'st-category', 'st-hour'].forEach(drawChart); }
  window.addEventListener('resize', function () { Object.keys(charts).forEach(function (k) { charts[k].resize(); }); });

  /* ---------- 足迹地图（腾讯地图 GL JS · WorkBuddy 代理模式 + 降级） ---------- */
  function initFootprint() {
    var mapEl = document.getElementById('fp-map');
    var fbEl = document.getElementById('fp-fallback');
    function fallback() { if (mapEl) mapEl.style.display = 'none'; if (fbEl) fbEl.style.display = 'block'; }
    var cfg = window._TMapSecurityConfig;
    var proxied = cfg && cfg.serviceHost && String(cfg.serviceHost).indexOf('__WB_') === -1;
    if (!proxied) { fallback(); return; }
    var hasCoords = FP.cities.some(function (c) { return c.lng && c.lat; });
    if (!hasCoords) { fallback(); return; }
    var s = document.createElement('script');
    s.src = 'https://map.qq.com/api/gljs?v=1.exp&libraries=service';
    s.onerror = fallback;
    s.onload = function () {
      try {
        if (typeof TMap === 'undefined') { fallback(); return; }
        var center = null, bounds = null;
        FP.cities.forEach(function (c) {
          if (!c.lng || !c.lat) return;
          var ll = new TMap.LatLng(c.lat, c.lng);
          if (!center) center = ll;
          if (!bounds) bounds = new TMap.LatLngBounds();
          bounds.extend(ll);
        });
        var map = new TMap.Map(mapEl, { zoom: 11, center: center });
        if (bounds && FP.cities.length > 1) map.fitBounds(bounds, { padding: [60, 60, 60, 60] });
        var dotSvg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="10" fill="#DA291C" stroke="#fff" stroke-width="3"/></svg>');
        var storeSvg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="6" fill="#FFC72C" stroke="#8F0B05" stroke-width="2"/></svg>');
        var marker = new TMap.MultiMarker({
          map: map,
          styles: {
            city: new TMap.MarkerStyle({ width: 26, height: 26, src: dotSvg, anchor: { x: 13, y: 13 } }),
            store: new TMap.MarkerStyle({ width: 18, height: 18, src: storeSvg, anchor: { x: 9, y: 9 } })
          },
          geometries: FP.cities.filter(function (c) { return c.lng && c.lat; }).map(function (c, i) {
            return { id: 'c' + i, styleId: 'city', position: new TMap.LatLng(c.lat, c.lng), properties: { title: c.city + ' ' + c.count + ' 单' } };
          })
        });
        marker.on('click', function (evt) { var g = evt.geometry; if (g && g.properties) new TMap.InfoWindow({ map: map, position: g.position, content: '<div style="padding:6px 10px;font-size:13px">' + g.properties.title + '</div>', offset: { x: 0, y: -16 } }).open(); });
        /* 脉冲光环 */
        var pulse = new TMap.MultiCircle({
          map: map,
          styles: { p: new TMap.CircleStyle({ color: 'rgba(218,41,28,0.14)', borderColor: '#DA291C', borderWidth: 1 }) },
          geometries: FP.cities.filter(function (c) { return c.lng && c.lat; }).map(function (c, i) {
            return { id: 'p' + i, styleId: 'p', center: new TMap.LatLng(c.lat, c.lng), radius: 400 };
          })
        });
        var raf;
        (function loop(t) {
          var geos = pulse.getGeometries();
          geos.forEach(function (g, i) {
            var r = 400 + 500 * (0.5 + 0.5 * Math.sin(t / 700 + i));
            pulse.updateGeometry({ id: g.id, styleId: 'p', center: g.center, radius: r });
          });
          raf = requestAnimationFrame(loop);
        })(0);
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) cancelAnimationFrame(raf);
        /* 门店标记：有坐标的直接上图，无坐标的走地理编码（尽力而为） */
        var storeGeos = [];
        var needGeo = [];
        FP.stores.forEach(function (st) {
          if (st.lng && st.lat) {
            storeGeos.push({ id: 's' + st.name, styleId: 'store', position: new TMap.LatLng(st.lat, st.lng), properties: { title: st.name + ' ' + st.count + ' 次' } });
          } else {
            needGeo.push(st);
          }
        });
        if (storeGeos.length) marker.updateGeometries(storeGeos);
        if (needGeo.length && window.TMap && TMap.service && TMap.service.Geocoder) {
          var geocoder = new TMap.service.Geocoder({});
          needGeo.slice(0, 8).forEach(function (st) {
            try {
              geocoder.getLocation({ address: st.name }).then(function (res) {
                var loc = res && res.result && res.result.location;
                if (!loc) return;
                marker.updateGeometries([{ id: 's' + st.name, styleId: 'store', position: loc, properties: { title: st.name + ' ' + st.count + ' 次' } }]);
              }).catch(function () {});
            } catch (e) { /* 地理编码失败可接受 */ }
          });
        }
      } catch (err) { fallback(); }
    };
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFootprint);
  else initFootprint();

  /* ---------- 打印前强制终态 ---------- */
  function finalizeCounts() {
    document.querySelectorAll('.cnt').forEach(function (el) {
      var to = parseFloat(el.dataset.to) || 0;
      el.textContent = fmt(to, el.dataset.fmt || 'int');
    });
  }
  window.addEventListener('beforeprint', function () {
    printMode = true;
    initAllCharts();
    finalizeCounts();
    document.querySelectorAll('.rv').forEach(function (el) { el.classList.add('vis'); });
    var mapEl = document.getElementById('fp-map');
    var fbEl = document.getElementById('fp-fallback');
    if (mapEl) mapEl.style.display = 'none';
    if (fbEl) fbEl.style.display = 'block';
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('print');
    if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { if (e.matches) initAllCharts(); });
  }
})();
</script>
</body>
</html>`;
}
