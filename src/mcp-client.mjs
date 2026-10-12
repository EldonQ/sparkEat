/**
 * mcp-client.mjs — 麦当劳 MCP Server 极简客户端
 *
 * 麦当劳中国 MCP 采用 Streamable HTTP 传输（https://mcp.mcd.cn）：
 *   1. POST initialize            → 响应头带回 mcp-session-id
 *   2. POST notifications/initialized
 *   3. POST tools/call            → 执行业务工具
 * 响应可能是 application/json 或 text/event-stream（SSE），两种都要能解析。
 * 限流：每 Token 每分钟 600 次请求。
 */

const PROTOCOL_VERSION = '2025-03-26';

export class McpError extends Error {
  constructor(message, { code, hint } = {}) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.hint = hint;
  }
}

export class McpClient {
  /**
   * @param {object} opts
   * @param {string} opts.url    MCP Server 地址，默认 https://mcp.mcd.cn
   * @param {string} opts.token  MCP Token（Bearer）
   * @param {number} [opts.timeoutMs] 单次请求超时，默认 30000
   * @param {Function} [opts.fetchImpl] 可注入 fetch（测试用）
   */
  constructor({ url = 'https://mcp.mcd.cn', token, timeoutMs = 30000, fetchImpl } = {}) {
    if (!token) throw new McpError('缺少 MCP Token', { code: 'NO_TOKEN', hint: '通过环境变量 MCD_MCP_TOKEN 提供，参见 mcp-config.example.json' });
    this.url = url;
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl || globalThis.fetch;
    this.sessionId = null;
    this._nextId = 1;
    this._initialized = false;
  }

  async #post(body, { expectSession = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.token}`,
          ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new McpError(`请求超时（${this.timeoutMs}ms）`, { code: 'TIMEOUT' });
      throw new McpError(`网络错误：${err.message}`, { code: 'NETWORK' });
    } finally {
      clearTimeout(timer);
    }

    if (expectSession) {
      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;
    }
    if (res.status === 401) throw new McpError('MCP Token 无效或已过期（401）', { code: 401, hint: '请前往 https://open.mcd.cn/mcp 控制台重新申请' });
    if (res.status === 429) throw new McpError('触发限流（429，每分钟 600 次）', { code: 429, hint: '降低调用频率后重试' });
    if (!res.ok) throw new McpError(`HTTP ${res.status}`, { code: res.status });

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    return contentType.includes('text/event-stream') ? parseSse(text) : safeJson(text);
  }

  async initialize() {
    if (this._initialized) return;
    const res = await this.#post({
      jsonrpc: '2.0',
      id: this._nextId++,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'mcd-yearbook', version: '1.0.0' },
      },
    }, { expectSession: true });
    if (res?.error) throw new McpError(`initialize 失败：${res.error.message}`, { code: res.error.code });
    await this.#post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    this._initialized = true;
  }

  /**
   * 调用一个 MCP 工具。
   * @returns {Promise<{ok: boolean, json?: any, text?: string, error?: string}>}
   *   麦当劳部分工具返回 Markdown 文本而非 JSON，因此保留原始 text。
   */
  async callTool(name, args = {}) {
    await this.initialize();
    const res = await this.#post({
      jsonrpc: '2.0',
      id: this._nextId++,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    if (res?.error) return { ok: false, error: res.error.message };
    const content = res?.result?.content;
    if (!Array.isArray(content) || content.length === 0) return { ok: false, error: '空响应' };
    if (res.result.isError) {
      const first = content.find((c) => c.type === 'text');
      return { ok: false, error: first?.text || '工具执行错误' };
    }
    const first = content.find((c) => c.type === 'text');
    const text = first?.text ?? '';
    try {
      return { ok: true, json: JSON.parse(text), text };
    } catch {
      return { ok: true, text };
    }
  }
}

/** 解析 SSE：取最后一个含 JSON 的 data: 行 */
export function parseSse(raw) {
  let last = null;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try { last = JSON.parse(payload); } catch { /* 跳过非 JSON 行 */ }
  }
  return last;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
