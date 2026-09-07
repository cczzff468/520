/* ============ AI 对接层：内置 /api/chat（z-ai）+ 自定义 OpenAI 兼容 API + 图像识别 ============ */

import { Settings } from '../core/db.js';

export const DEFAULT_API = {
  url: 'https://api.openai.com/v1/chat/completions',
  key: '',
  model: 'gpt-3.5-turbo',
  timeout: 60,
  temperature: 0.7,
  maxTokens: 2048,
  headers: '',
};

/* 图像识别（视觉）API 默认值：未配置时自动走内置 /api/image */
export const DEFAULT_IMAGE_API = {
  url: '',
  key: '',
  model: '',
  headers: '',
  timeout: 60,
};

export async function getApiConfig() {
  const cfg = await Settings.load('api', null);
  if (cfg && cfg.key && cfg.url) return { ...DEFAULT_API, ...cfg, url: normalizeChatUrl(cfg.url), custom: true };
  return { ...DEFAULT_API, ...(cfg || {}), custom: false };
}

/* ---------- URL 智能规范化（根治 404：用户常填基地址而非完整端点） ----------
   规则：
   - 补协议：api.deepseek.com → https://api.deepseek.com
   - 已含 /chat/completions、/completions、/messages → 视为完整端点，仅去尾斜杠
   - 结尾是版本段（/v1 /v2 /v3 /v4 /compatible-mode/v1 等）→ 追加 /chat/completions
   - 其余（裸域名/带路径前缀）→ 追加 /v1/chat/completions                              */
export function normalizeChatUrl(input) {
  let u = String(input || '').trim().replace(/\s/g, '').replace(/\/+$/, '');
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    const path = parsed.pathname.replace(/\/+$/, '');
    /* 已是 /chat/completions → 原样保留 */
    if (/\/chat\/completions$/i.test(path)) { /* noop */ }
    /* 写了 /completions 或 /messages → 统一改为 /chat/completions */
    else if (/\/(completions|messages)$/i.test(path)) {
      parsed.pathname = path.replace(/\/(completions|messages)$/i, '/chat/completions');
    }
    /* 结尾是版本段（/v1 /v4 /compatible-mode/v1 等）→ 追加 /chat/completions */
    else if (/\/v\d+$/i.test(path) || /\/compatible-mode(\/v\d+)?$/i.test(path)) {
      parsed.pathname = path + '/chat/completions';
    }
    /* 裸域名 / 其他前缀 → 追加 /v1/chat/completions（OpenAI 兼容标准路径） */
    else {
      parsed.pathname = path + '/v1/chat/completions';
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch (e) { return u; }
}

/* 测试连接时的候选路径（按可能性排序） */
export function chatUrlCandidates(input) {
  const norm = normalizeChatUrl(input);
  if (!norm) return [];
  const set = [norm];
  try {
    const p = new URL(norm);
    const path = p.pathname;
    const base = path.replace(/\/(v\d+\/)?chat\/completions$/i, '');
    for (const cand of [base + '/chat/completions', base + '/v1/chat/completions']) {
      if (cand !== path) { p.pathname = cand; set.push(p.toString().replace(/\/+$/, '')); }
    }
  } catch (e) { /* 忽略 */ }
  return [...new Set(set)];
}

/**
 * 发送对话。
 * @param {Array<{role:string, content:string}>} messages 含 system 的消息列表
 * @param {Function} onDelta 增量回调 (textDelta)
 * @param {AbortSignal} signal 可选中断
 * @returns {Promise<string>} 完整回复文本
 */
export async function chatComplete({ messages, onDelta, signal }) {
  const cfg = await getApiConfig();
  if (cfg.custom) return customChat(cfg, { messages, onDelta, signal });
  return builtinChat({ messages, onDelta, signal });
}

/* ---------- 自定义 OpenAI 兼容接口（流式 SSE） ---------- */
async function customChat(cfg, { messages, onDelta, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(5, cfg.timeout) * 1000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);

  let headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key };
  if (cfg.headers) {
    try {
      const extra = JSON.parse(cfg.headers);
      headers = { ...headers, ...extra };
    } catch (e) { /* 自定义头格式忽略 */ }
  }

  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model || 'gpt-3.5-turbo',
        messages,
        temperature: cfg.temperature ?? 0.7,
        max_tokens: cfg.maxTokens || 2048,
        stream: true,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API 返回 ${res.status}${text ? '：' + text.slice(0, 120) : ''}`);
    }
    const ctype = res.headers.get('content-type') || '';
    if (ctype.includes('text/event-stream')) {
      return await readSSE(res, onDelta);
    }
    // 非流式响应
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || json.choices?.[0]?.delta?.content || '';
    onDelta && onDelta(content);
    return content;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function readSSE(res, onDelta) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
        if (delta) { full += delta; onDelta && onDelta(delta); }
      } catch (e) { /* 跳过不完整行 */ }
    }
  }
  return full;
}

/* ---------- 内置 AI（Next.js /api/chat，z-ai-web-dev-sdk） ---------- */
async function builtinChat({ messages, onDelta, signal }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream: true }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`内置AI返回 ${res.status}${text ? '：' + text.slice(0, 120) : ''}`);
  }
  const ctype = res.headers.get('content-type') || '';
  if (ctype.includes('text/event-stream')) return await readSSE(res, onDelta);

  const json = await res.json();
  const content = json.content || json.choices?.[0]?.message?.content || '';
  // 打字机式逐段输出，模拟流式体验
  if (onDelta && content) {
    const chunks = content.match(/[\s\S]{1,18}/g) || [];
    for (const c of chunks) {
      if (signal?.aborted) break;
      onDelta(c);
      await new Promise(r => setTimeout(r, 16));
    }
  }
  return content;
}

/* ---------- 拉取模型列表（OpenAI 兼容 /models，自动路径推导） ---------- */
export async function fetchModels({ url, key, headers: headersRaw }) {
  let base = String(url || '').trim().replace(/\s/g, '').replace(/\/+$/, '');
  if (!base) throw new Error('请先填写 API 地址');
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  base = base
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/completions$/i, '')
    .replace(/\/messages$/i, '');
  const modelsUrl = base + '/models';

  const headers = {};
  if (key) headers['Authorization'] = 'Bearer ' + key;
  if (headersRaw) {
    try { Object.assign(headers, JSON.parse(headersRaw)); } catch (e) { /* 忽略格式错误 */ }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(modelsUrl, { headers, signal: ctrl.signal });
    if (!res.ok) {
      let hint = '';
      try { const j = await res.json(); hint = j?.error?.message || j?.error || j?.message || ''; } catch (e) { /* 非JSON */ }
      throw new Error(`HTTP ${res.status}${hint ? '：' + String(hint).slice(0, 90) : ''}`);
    }
    const json = await res.json();
    const arr = Array.isArray(json) ? json : (json.data || json.models || []);
    const ids = arr
      .map(x => (typeof x === 'string' ? x : (x?.id || x?.name || x?.model || '')))
      .filter(id => id && typeof id === 'string')
      .sort((a, b) => a.localeCompare(b));
    if (!ids.length) throw new Error('接口未返回模型列表');
    return [...new Set(ids)];
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('请求超时（15s）');
    if (e instanceof TypeError) throw new Error('网络错误或跨域被拦截（CORS）');
    throw e;
  } finally { clearTimeout(timer); }
}

/* ---------- 常用服务商预设（OpenAI 兼容） ---------- */
export const API_PRESETS = [
  { name: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini', 'gpt-3.5-turbo'], color: '#10A37F' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'], color: '#4D6BFE' },
  { name: 'Kimi 月之暗面', url: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest'], color: '#1D1D1F' },
  { name: '智谱 GLM', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4'], color: '#3E5BFA' },
  { name: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo', models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'], color: '#615CED' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o-mini', models: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5', 'meta-llama/llama-3.1-70b-instruct'], color: '#8B5CF6' },
  { name: 'SiliconFlow 硅基流动', url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-7B-Instruct', models: ['Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1'], color: '#FF6A00' },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant', models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'], color: '#F55036' },
  { name: 'Ollama 本地', url: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5', models: ['qwen2.5', 'llama3.1', 'deepseek-r1'], color: '#8E8E93' },
];

/** 根据 URL 推测服务商名称 */
export function detectProvider(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return '';
  const hit = API_PRESETS.find(p => p.url.replace(/\/$/, '').toLowerCase() === u.replace(/\/$/, ''));
  if (hit) return hit.name;
  if (u.includes('openai.com')) return 'OpenAI';
  if (u.includes('deepseek')) return 'DeepSeek';
  if (u.includes('moonshot')) return 'Kimi';
  if (u.includes('bigmodel')) return '智谱 GLM';
  if (u.includes('dashscope') || u.includes('aliyun')) return '通义千问';
  if (u.includes('openrouter')) return 'OpenRouter';
  if (u.includes('siliconflow')) return 'SiliconFlow';
  if (u.includes('groq')) return 'Groq';
  if (u.includes('localhost') || u.includes('127.0.0.1')) return 'Ollama 本地';
  return '自定义';
}

/* ---------- 测试连接（多候选路径自动探测 + 友好错误提示） ---------- */

/* 把 HTTP 错误翻译为可操作的建议（HTML 响应体不拼入消息，避免噪音） */
export function explainApiError(status, body) {
  const raw = String(body || '');
  const isHtml = /^\s*<(?:!doctype|html)/i.test(raw);
  const text = isHtml ? '' : raw.slice(0, 140);
  const hint404 = '地址路径不存在：请确认填的是 OpenAI 兼容端点（形如 https://…/v1/chat/completions），已自动尝试候选路径';
  if (status === 404) return { msg: `API 返回 404${text ? '：' + text : '（not found）'}`, hint: hint404 };
  if (status === 401) return { msg: `API 返回 401${text ? '：' + text : ''}`, hint: 'API Key 无效或未填写，请检查密钥是否正确、是否有余额' };
  if (status === 403) return { msg: `API 返回 403${text ? '：' + text : ''}`, hint: '密钥无权限或账号受限，请到服务商控制台检查' };
  if (status === 429) return { msg: `API 返回 429`, hint: '请求过于频繁或额度用尽，稍后重试' };
  if (status >= 500) return { msg: `API 返回 ${status}`, hint: '服务端错误，请稍后重试' };
  return { msg: `API 返回 ${status}${text ? '：' + text : ''}`, hint: '' };
}

async function probeChatEndpoint(url, cfg) {
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.key) headers['Authorization'] = 'Bearer ' + cfg.key;
  if (cfg.headers) {
    try { Object.assign(headers, JSON.parse(cfg.headers)); } catch (e) { /* 忽略 */ }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(8, cfg.timeout || 30) * 1000);
  try {
    const res = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({
        model: cfg.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: '回复"OK"两个字母即可，不要任何其他内容。' }],
        max_tokens: 8,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(explainApiError(res.status, text).msg);
      err.status = res.status; err.body = text;
      throw err;
    }
    const json = await res.json().catch(() => ({}));
    const reply = json.choices?.[0]?.message?.content || json.content || '';
    if (!String(reply).trim()) throw new Error('连接成功但回复为空，模型可能异常');
    return reply;
  } finally { clearTimeout(timer); }
}

/**
 * 测试连接。
 * - 内置模式：POST /api/chat（本机服务）
 * - 自定义模式：normalizeChatUrl 后逐个候选路径探测；某条路径 404 时自动换下一条，
 *   成功后返回实际可用 URL 供界面回写，彻底解决"填了基地址 → 404 not found"。
 * @param {{url?:string, key?:string, model?:string, headers?:string, timeout?:number}} override 可选：直接用表单值测试（未落库）
 */
export async function testConnection(override) {
  const t0 = performance.now();
  const cfg = override ? { ...DEFAULT_API, ...override } : await getApiConfig();
  /* 有 Key 且有地址 → 自定义；否则 → 内置（与实际聊天时的 getApiConfig 判定一致） */
  const isCustom = !!(cfg.key && cfg.url);

  if (!isCustom) {
    const reply = await builtinChat({ messages: [{ role: 'user', content: '回复"OK"两个字母即可，不要任何其他内容。' }], onDelta: null });
    if (!reply || !reply.trim()) throw new Error('回复为空');
    return { ok: true, ms: Math.round(performance.now() - t0), mode: 'builtin', model: '内置AI' };
  }

  /* 自定义：多候选路径探测 */
  const candidates = chatUrlCandidates(cfg.url);
  if (!candidates.length) throw new Error('请填写 API 地址');
  let lastErr = null;
  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    try {
      const reply = await probeChatEndpoint(url, cfg);
      return {
        ok: true, ms: Math.round(performance.now() - t0), mode: 'custom',
        model: cfg.model || 'gpt-3.5-turbo', url,
        fixed: url !== normalizeChatUrl(cfg.url),   // 地址被自动修正
        tried: i + 1,
      };
    } catch (e) {
      lastErr = e;
      if (e instanceof TypeError) {
        throw new Error('网络错误或跨域被拦截（CORS）：请确认地址可访问、已允许浏览器跨域调用');
      }
      if (e.status !== 404) throw e;  // 非 404（如 401/超时/CORS）无需换路径，直接抛出
    }
  }
  const ex = explainApiError(lastErr?.status, lastErr?.body);
  const err = new Error(ex.msg + (ex.hint ? ' · ' + ex.hint : ''));
  err.hint = ex.hint;
  throw err;
}

/* ============================================================
 * 图像识别 API（视觉模型，OpenAI 兼容 content-parts 格式）
 * 未配置时自动回退内置 /api/image（z-ai 视觉模型）。
 * ============================================================ */

/* 视觉模型服务商预设 */
export const IMAGE_PRESETS = [
  { name: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'], color: '#10A37F' },
  { name: '智谱 GLM', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4v-flash', models: ['glm-4v-flash', 'glm-4v-plus', 'glm-4v'], color: '#3E5BFA' },
  { name: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-plus', models: ['qwen-vl-plus', 'qwen-vl-max', 'qwen2.5-vl-72b-instruct'], color: '#615CED' },
  { name: 'Kimi 月之暗面', url: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k-vision-preview', models: ['moonshot-v1-8k-vision-preview', 'kimi-latest'], color: '#1D1D1F' },
  { name: 'SiliconFlow 硅基流动', url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-VL-32B-Instruct', models: ['Qwen/Qwen2.5-VL-32B-Instruct', 'Qwen/Qwen2.5-VL-72B-Instruct', 'deepseek-ai/deepseek-vl2'], color: '#FF6A00' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o-mini', models: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'google/gemini-flash-1.5'], color: '#8B5CF6' },
  { name: 'Ollama 本地', url: 'http://localhost:11434/v1/chat/completions', model: 'minicpm-v', models: ['minicpm-v', 'llava', 'qwen2.5vl'], color: '#8E8E93' },
];

/** 读取图像 API 配置（未配置返回 configured:false） */
export async function getImageApiConfig() {
  const cfg = await Settings.load('imageApi', null);
  if (cfg && cfg.url && cfg.key) {
    return { ...DEFAULT_IMAGE_API, ...cfg, url: normalizeChatUrl(cfg.url), configured: true };
  }
  return { ...DEFAULT_IMAGE_API, ...(cfg || {}), configured: false };
}

/** 根据 URL 推测视觉服务商名称 */
export function detectImageProvider(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return '';
  const hit = IMAGE_PRESETS.find(p => p.url.replace(/\/$/, '').toLowerCase() === u.replace(/\/$/, ''));
  if (hit) return hit.name;
  for (const p of IMAGE_PRESETS) if (u.includes(p.url.split('/')[2]?.split('.').slice(-2).join('.'))) return p.name;
  return '自定义';
}

/* 自定义视觉请求头 */
function visionHeaders(cfg) {
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.key) headers['Authorization'] = 'Bearer ' + cfg.key;
  if (cfg.headers) {
    try { Object.assign(headers, JSON.parse(cfg.headers)); } catch (e) { /* 忽略 */ }
  }
  return headers;
}

/**
 * 识别图片：自定义视觉 API（content-parts）→ 未配置走内置 /api/image。
 * @param {{dataUrl?:string, url?:string, question?:string, signal?:AbortSignal}} opts
 * @returns {Promise<string>} 图片描述文本
 */
export async function describeImage({ dataUrl, url, question, signal }) {
  const img = dataUrl || url || '';
  const q = (question || '').trim() || '用一两句话客观描述这张图片的内容，包括场景、主体和显著细节。';
  const cfg = await getImageApiConfig();

  /* ---- 自定义视觉 API ---- */
  if (cfg.configured) {
    const ctrl = signal ? null : new AbortController();
    const timer = ctrl ? setTimeout(() => ctrl.abort(), Math.max(10, cfg.timeout || 60) * 1000) : null;
    try {
      const res = await fetch(normalizeChatUrl(cfg.url), {
        method: 'POST',
        headers: visionHeaders(cfg),
        body: JSON.stringify({
          model: cfg.model || 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: q },
              { type: 'image_url', image_url: { url: img } },
            ],
          }],
          max_tokens: 400,
          stream: false,
        }),
        signal: signal || (ctrl && ctrl.signal),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const ex = explainApiError(res.status, text);
        throw new Error(ex.msg + (ex.hint ? ' · ' + ex.hint : ''));
      }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || json.content || '';
      if (!String(content).trim()) throw new Error('识别结果为空');
      return String(content).trim();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('识别超时');
      if (e instanceof TypeError) throw new Error('网络错误或跨域被拦截（CORS）');
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ---- 内置视觉（/api/image） ---- */
  const res = await fetch('/api/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: img, question: q }),
    signal,
  });
  if (!res.ok) {
    let msg = '内置识别返回 ' + res.status;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch (e) { /* noop */ }
    throw new Error(msg);
  }
  const json = await res.json();
  const content = json.content || '';
  if (!String(content).trim()) throw new Error('识别结果为空');
  return String(content).trim();
}

/* 测试连接用的 2x2 红色小方块（最小合法 PNG dataURL 之上手绘） */
const TEST_IMAGE = (function () {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#E8483F';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#FCD648';
  ctx.beginPath();
  ctx.arc(32, 32, 18, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL('image/jpeg', 0.9);
})();

/**
 * 测试图像识别连接。
 * @param override 表单值（未落库）：{ url, key, model, headers }
 * @returns {ok, ms, mode, model, reply}
 */
export async function testImageConnection(override) {
  const t0 = performance.now();
  let cfg;
  if (override && override.url && override.key) {
    cfg = { ...DEFAULT_IMAGE_API, ...override, url: normalizeChatUrl(override.url), configured: true };
  } else {
    cfg = await getImageApiConfig();
  }

  if (!cfg.configured) {
    /* 内置识别直测 */
    const reply = await describeImage({ dataUrl: TEST_IMAGE, question: '这张图里有什么形状和颜色？15字以内回答。' });
    return { ok: true, ms: Math.round(performance.now() - t0), mode: 'builtin', model: '内置视觉模型', reply };
  }

  /* 自定义视觉：多候选路径探测（与文本 API 同款 404 自愈） */
  const candidates = chatUrlCandidates(cfg.url);
  if (!candidates.length) throw new Error('请填写 API 地址');
  let lastErr = null;
  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    try {
      const reply = await probeVisionEndpoint(url, cfg);
      return { ok: true, ms: Math.round(performance.now() - t0), mode: 'custom', model: cfg.model || 'gpt-4o-mini', url, reply, fixed: url !== normalizeChatUrl(cfg.url), tried: i + 1 };
    } catch (e) {
      lastErr = e;
      if (e instanceof TypeError) throw new Error('网络错误或跨域被拦截（CORS）：请确认地址可访问、已允许浏览器跨域调用');
      if (e.status !== 404) throw e;
    }
  }
  const ex = explainApiError(lastErr?.status, lastErr?.body);
  const err = new Error(ex.msg + (ex.hint ? ' · ' + ex.hint : ''));
  err.hint = ex.hint;
  throw err;
}

async function probeVisionEndpoint(url, cfg) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(8, cfg.timeout || 30) * 1000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: visionHeaders(cfg),
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '这张图里有什么颜色？10字以内回答。' },
            { type: 'image_url', image_url: { url: TEST_IMAGE } },
          ],
        }],
        max_tokens: 40,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(explainApiError(res.status, text).msg);
      err.status = res.status; err.body = text;
      throw err;
    }
    const json = await res.json().catch(() => ({}));
    const reply = json.choices?.[0]?.message?.content || json.content || '';
    if (!String(reply).trim()) throw new Error('连接成功但回复为空，该模型可能不支持图像输入');
    return reply;
  } finally { clearTimeout(timer); }
}
