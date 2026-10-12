#!/usr/bin/env node
/**
 * mcd-yearbook — 麦门年鉴 CLI
 *
 * 用法：
 *   mcd-yearbook --demo                          合成演示数据，免 Token
 *   mcd-yearbook --token <MCD_MCP_TOKEN>         真实数据（也支持环境变量 MCD_MCP_TOKEN）
 *   mcd-yearbook --data raw.json                 WorkBuddy Skill 通路：Agent 已保存的工具返回
 *   mcd-yearbook --mode story|dashboard|both     输出形态（默认 story 动效故事流）
 *   mcd-yearbook --pdf                           额外导出 PDF（调用本机 Chrome/Edge）
 *   mcd-yearbook --out report.html --md          指定输出 + Markdown 摘要
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDemoData, collectLiveData, normalizeFromRaw, TOOLS_USED } from '../src/collect.mjs';
import { aggregate } from '../src/aggregate.mjs';
import { derivePersona } from '../src/persona.mjs';
import { renderReport } from '../src/render.mjs';
import { renderStory } from '../src/render-story.mjs';
import { buildStoryData } from '../src/story-data.mjs';
import { htmlToPdf } from '../src/pdf.mjs';
import { McpClient } from '../src/mcp-client.mjs';

function parseArgs(argv) {
  const args = { demo: false, mode: 'story', pdf: false, out: 'mcd-yearbook.html', md: false, url: 'https://mcp.mcd.cn', data: null, token: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') args.demo = true;
    else if (a === '--pdf') args.pdf = true;
    else if (a === '--md') args.md = true;
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--data') args.data = argv[++i];
    else if (a === '--token') args.token = argv[++i];
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const HELP = `麦门年鉴 mcd-yearbook — 基于麦当劳中国 MCP 的个人年度饮食报告生成器

用法：
  mcd-yearbook --demo                     合成演示数据（免 Token，快速预览）
  mcd-yearbook --token <TOKEN>            真实数据（Token 也可经环境变量 MCD_MCP_TOKEN 提供）
  mcd-yearbook --data <raw.json>          使用 WorkBuddy 已保存的 MCP 工具返回
  mcd-yearbook --mode story               动效故事流（默认，Wrapped 式全屏滚动）
  mcd-yearbook --mode dashboard           静态数据看板（经典版）
  mcd-yearbook --mode both                两种形态都输出
  mcd-yearbook --pdf                      额外导出 PDF（调用本机 Chrome/Edge 无头模式）
  mcd-yearbook --out <file.html>          指定输出文件（默认 mcd-yearbook.html）
  mcd-yearbook --md                       同时输出 Markdown 摘要
  mcd-yearbook --list-tools               列出使用的 MCP 工具

数据来源为麦当劳 MCP 只读工具：${TOOLS_USED.map((t) => t.name).join(', ')}
Token 申请：https://open.mcd.cn/mcp  配置示例见 mcp-config.example.json
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (process.argv.includes('--list-tools')) {
    console.log('麦门年鉴使用的麦当劳 MCP 工具（全部只读）：');
    for (const t of TOOLS_USED) console.log(`  ${t.name.padEnd(22)} ${t.purpose}`);
    return;
  }
  if (!['story', 'dashboard', 'both'].includes(args.mode)) {
    console.error(`错误：--mode 仅支持 story / dashboard / both，当前为 ${args.mode}`);
    process.exit(1);
  }

  let raw;
  if (args.demo) {
    console.log('模式：合成演示数据（--demo）');
    raw = loadDemoData();
  } else if (args.data) {
    console.log(`模式：WorkBuddy 数据文件（${args.data}）`);
    raw = normalizeFromRaw(JSON.parse(readFileSync(resolve(args.data), 'utf8')));
  } else {
    const token = args.token || process.env.MCD_MCP_TOKEN;
    if (!token) {
      console.error('错误：未提供 MCP Token。\n请使用 --token <TOKEN>，或设置环境变量 MCD_MCP_TOKEN，或先用 --demo 体验。');
      process.exit(1);
    }
    console.log('模式：麦当劳 MCP 真实数据');
    const client = new McpClient({ url: args.url, token });
    raw = await collectLiveData(client, (label) => console.log(`  采集 ${label} ...`));
  }

  console.log(`  订单 ${raw.orders.length} 笔 · 积分 ${raw.account?.availablePoint ?? '—'} · 奖品 ${raw.prizes.length} 个 · 活动 ${raw.campaigns.length} 场`);
  for (const w of raw.warnings) console.warn(`  警告：${w}`);

  const model = aggregate(raw);
  const persona = derivePersona(model);
  const story = buildStoryData(model, persona, raw.orders);

  let echartsSource = null;
  try {
    echartsSource = readFileSync(new URL('../web/echarts.min.js', import.meta.url), 'utf8');
  } catch {
    console.warn('  提示：未找到 web/echarts.min.js，报告将回退为 CDN 加载模式');
  }

  const outputs = [];
  const push = (p) => { outputs.push(p); console.log(`  已生成 ${p}`); };

  if (args.mode === 'story' || args.mode === 'both') {
    const storyPath = args.mode === 'both' ? resolve(args.out).replace(/\.html?$/i, '') + '-story.html' : resolve(args.out);
    writeFileSync(storyPath, renderStory(story, { echartsSource }));
    push(storyPath);
    if (args.pdf) {
      const pdfPath = storyPath.replace(/\.html?$/i, '') + '.pdf';
      console.log('  正在导出 PDF（无头 Chrome）...');
      const r = htmlToPdf(storyPath, pdfPath);
      if (r.ok) push(pdfPath);
      else console.warn(`  PDF 导出失败：${r.error}。可改用浏览器打开 HTML 后 Ctrl/Cmd+P 打印为 PDF。`);
    }
  }
  if (args.mode === 'dashboard' || args.mode === 'both') {
    const dashPath = args.mode === 'both' ? resolve(args.out).replace(/\.html?$/i, '') + '-dashboard.html' : resolve(args.out);
    writeFileSync(dashPath, renderReport(model, persona, { echartsSource }));
    push(dashPath);
    if (args.pdf && args.mode === 'dashboard') {
      const pdfPath = dashPath.replace(/\.html?$/i, '') + '.pdf';
      console.log('  正在导出 PDF（无头 Chrome）...');
      const r = htmlToPdf(dashPath, pdfPath);
      if (r.ok) push(pdfPath);
      else console.warn(`  PDF 导出失败：${r.error}。可改用浏览器打开 HTML 后 Ctrl/Cmd+P 打印为 PDF。`);
    }
  }

  if (args.md) {
    const mdPath = resolve(args.out).replace(/\.html?$/i, '') + '.md';
    writeFileSync(mdPath, renderMarkdownSummary(story));
    push(mdPath);
  }

  console.log(`\n年鉴已生成 · 年度称号：${persona.title} — ${persona.desc}`);
  if (model.warnings.length) {
    console.log('数据说明：');
    for (const w of model.warnings) console.log(`  - ${w}`);
  }
  if (args.mode !== 'dashboard') {
    console.log('提示：故事流支持全屏滚动浏览；打印/PDF 时自动切换为分页终态。足迹地图在 WorkBuddy 预览环境显示腾讯地图，其余环境自动降级为城市卡片。');
  }
}

function renderMarkdownSummary(story) {
  const m = story;
  const lines = [
    `# 麦门年鉴 ${m.meta.titleYear} · ${m.persona.title}`,
    '',
    `> ${m.persona.desc}`,
    '',
    `- 数据周期：${m.meta.rangeLabel}`,
    `- 年度订单：${m.overview.orderCount} 单，总消费 ¥${m.overview.totalSpend}，客单价 ¥${m.overview.avgSpend}`,
    `- 券后节省：¥${m.overview.savedFromCoupons}，待领券 ${m.coupons.claimable} 张`,
    `- 总热量：${m.calories.total} kcal（约 ${m.calories.bigMacEquiv} 个巨无霸）`,
    `- 积分：可用 ${m.points.available} / 累计 ${m.points.accumulative} / 已过期 ${m.points.expired}`,
  ];
  if (m.topProducts[0]) lines.push(`- 年度餐品：${m.topProducts.map((p) => `${p.name} x${p.count}`).join('，')}`);
  if (m.prizes.length) lines.push(`- 中奖记录：${m.prizes.map((p) => p.name).join('，')}`);
  if (m.footprint.cities.length) lines.push(`- 足迹城市：${m.footprint.cities.map((c) => `${c.city}(${c.count}单)`).join('，')}`);
  lines.push('', `*由 mcd-yearbook 生成，数据来自麦当劳中国 MCP。非麦当劳官方产品。*`);
  return lines.join('\n');
}

main().catch((err) => {
  console.error(`失败：${err.message}`);
  if (err.hint) console.error(`提示：${err.hint}`);
  process.exit(1);
});
