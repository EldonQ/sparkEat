/**
 * pdf.mjs — PDF 导出
 *
 * 复用故事流 HTML 的打印样式（beforeprint 强制终态 + 地图降级卡片），
 * 调用本机 Chrome/Edge 无头模式 --print-to-pdf 生成 PDF。
 * 找不到浏览器时返回 null，由 CLI 提示用户手动打印（Ctrl/Cmd+P）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BROWSER_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/microsoft-edge',
];

export function findBrowser() {
  return BROWSER_CANDIDATES.find((p) => existsSync(p)) || null;
}

/**
 * @param {string} htmlPath 故事流 HTML 绝对路径
 * @param {string} pdfPath  输出 PDF 绝对路径
 * @returns {{ok: boolean, browser?: string, error?: string}}
 */
export function htmlToPdf(htmlPath, pdfPath) {
  const browser = findBrowser();
  if (!browser) return { ok: false, error: '未找到本机 Chrome/Edge 浏览器' };
  try {
    execFileSync(browser, [
      '--headless', '--disable-gpu', '--no-sandbox',
      '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=20000',
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ], { timeout: 90000, stdio: 'ignore' });
    if (!existsSync(pdfPath) || statSync(pdfPath).size < 1024) {
      return { ok: false, error: 'PDF 生成异常（文件过小或缺失）' };
    }
    return { ok: true, browser };
  } catch (err) {
    return { ok: false, error: `浏览器调用失败：${err.message}` };
  }
}

/** 临时文件路径（Windows 兼容） */
export function tempPath(name) {
  return join(tmpdir(), name);
}
