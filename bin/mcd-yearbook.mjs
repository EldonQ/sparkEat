#!/usr/bin/env node
/**
 * mcd-yearbook — 麦门年鉴 CLI
 *
 * 用法：
 *   mcd-yearbook --demo                          # 合成演示数据，免 Token
 *   mcd-yearbook --token <MCD_MCP_TOKEN>         # 真实数据（也支持环境变量 MCD_MCP_TOKEN）
 *   mcd-yearbook --data raw.json                 # WorkBuddy Skill 通路：Agent 已保存的工具返回
 *   mcd-yearbook --demo --out report.html --md   # 指定输出 + 生成 Markdown 摘要
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDemoData, collectLiveData, normalizeFromRaw, TOOLS_USED } from '../src/collect.mjs';
import { aggregate } from '../src/aggregate.mjs';
import { derivePersona } from '../src/persona.mjs';
import { renderReport, renderMarkdown } from '../src/render.mjs';
import { McpClient } from '../src/mcp-client.mjs';
import { readFileSync } from 'node:fs';

function parseArgs(argv) {
  const args = { demo: false, out: 'mcd-yearbook.html', md: false, url: 'https://mcp.mcd.cn', data: null, token: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') args.demo = true;
    else if (a === '--md') args.md = true;
    else if (a === '--open-hint') args.openHint = true;
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
  mcd-yearbook --demo                     使用合成演示数据（免 Token，快速预览）
  mcd-yearbook --token <TOKEN>            使用真实数据（Token 也可经环境变量 MCD_MCP_TOKEN 提供）
  mcd-yearbook --data <raw.json>          使用 WorkBuddy 已保存的 MCP 工具返回
  mcd-yearbook --out <file.html>          指定输出文件（默认 mcd-yearbook.html）
  mcd-yearbook --md                       同时输出 Markdown 摘要（<name>.md）
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

  let echartsSource = null;
  try {
    echartsSource = readFileSync(new URL('../web/echarts.min.js', import.meta.url), 'utf8');
  } catch {
    console.warn('  提示：未找到 web/echarts.min.js，报告将回退为 CDN 加载模式');
  }

  const html = renderReport(model, persona, { echartsSource });
  const outPath = resolve(args.out);
  writeFileSync(outPath, html);
  console.log(`\n年鉴已生成：${outPath}`);
  console.log(`  年度称号：${persona.title} — ${persona.desc}`);

  if (args.md) {
    const mdPath = outPath.replace(/\.html?$/i, '') + '.md';
    writeFileSync(mdPath, renderMarkdown(model, persona));
    console.log(`  Markdown 摘要：${mdPath}`);
  }

  if (model.warnings.length) {
    console.log('\n数据说明：');
    for (const w of model.warnings) console.log(`  - ${w}`);
  }
  if (args.openHint) console.log('\n用浏览器打开上面的 HTML 文件即可查看年报。');
}

main().catch((err) => {
  console.error(`失败：${err.message}`);
  if (err.hint) console.error(`提示：${err.hint}`);
  process.exit(1);
});
