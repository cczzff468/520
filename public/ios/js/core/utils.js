/* ============ 工具函数 + 事件总线 ============ */

/* ---------- 发布订阅总线 ---------- */
const listeners = {};
export const Bus = {
  on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
    return () => this.off(evt, fn);
  },
  off(evt, fn) {
    const arr = listeners[evt];
    if (arr) { const i = arr.indexOf(fn); if (i > -1) arr.splice(i, 1); }
  },
  emit(evt, data) {
    (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error('[bus]', evt, e); } });
  },
};

/* ---------- DOM 助手 ---------- */
export function el(tag, className = '', html = '') {
  const d = document.createElement(tag);
  if (className) d.className = className;
  if (html) d.innerHTML = html;
  return d;
}
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

/* ---------- ID ---------- */
export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- 时间格式化 ---------- */
export function fmtTime(ts, withNoon = false) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  if (!withNoon) return `${h}:${m}`;
  const noon = h < 12 ? '上午' : '下午';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${noon} ${hh}:${m}`;
}

export function fmtTimePeriod(ts) { return fmtTime(ts, true); }

export function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtSmartTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return fmtTime(ts);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  if (now.getFullYear() === d.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtDur(sec, withHour = true) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0 && withHour) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtBytes(n) {
  if (n == null || isNaN(n)) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

/* ---------- 防抖 ---------- */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------- 触感反馈（受「设置·触感反馈」开关控制） ---------- */
let HAPTICS_ON = true;
export function setHaptics(on) { HAPTICS_ON = !!on; }
export function haptic(ms = 10) {
  if (!HAPTICS_ON) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* noop */ }
}

/* ---------- 滑动手势 ----------
   回调签名：up/down/left/right(startX, startY, target)
   startX/startY 为手势起始坐标（clientX/Y），target 为落点元素。
   事件绑定策略（双绑定，tracking 标志天然去重）：
   - 鼠标：Pointer 事件（桌面可拖拽测试）
   - 触摸：touch 事件兜底 —— 浏览器接管滚动时会派发 pointercancel
     而不派发 pointerup，但 touchend 始终触发；
     pointerup 与 touchend 同时到达时，先到者消费 tracking，后者直接忽略 */
export function onSwipe(node, { up, down, left, right, threshold = 46 } = {}) {
  let sx = 0, sy = 0, tracking = false, sTarget = null;
  const start = (e) => {
    if (tracking) return; // pointerdown 与 touchstart 双触发只记首次
    const t = e.touches ? e.touches[0] : e;
    sx = t.clientX; sy = t.clientY;
    sTarget = e.target;
    tracking = true;
  };
  const end = (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    const args = [sx, sy, sTarget];
    if (Math.abs(dx) > Math.abs(dy)) { const fn = dx > 0 ? right : left; fn && fn(...args); }
    else { const fn = dy > 0 ? down : up; fn && fn(...args); }
  };
  node.addEventListener('pointerdown', start, { passive: true });
  node.addEventListener('pointerup', end, { passive: true });
  node.addEventListener('touchstart', start, { passive: true });
  node.addEventListener('touchend', end, { passive: true });
  return () => {
    node.removeEventListener('pointerdown', start);
    node.removeEventListener('pointerup', end);
    node.removeEventListener('touchstart', start);
    node.removeEventListener('touchend', end);
  };
}

/* ---------- 文件下载 ---------- */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
}

export function downloadJSON(obj, filename) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}

/* ---------- 汉字转拼音首字母（简化版，够用于 A-Z 分组） ---------- */
const PINYIN_MAP = (function () {
  const boundary = '啊芭擦搭蛾发噶哈击喀垃妈拿哦啪期然撒塌挖希压匝'.split('');
  const letters = 'ABCDEFGHJKLMNOPQRSTWXYZ';
  return { boundary, letters };
})();
const PINYIN_CODES = [18384, 17731, 17516, 17355, 17241, 17120, 16998, 16883, 16725, 16575, 16431, 16273, 16163, 16018, 15871, 15741, 15562, 15318, 15141, 14934, 14758, 14563, 14376, 14195, 13988, 13745, 13571, 13298, 12990, 12704, 12487, 12251, 12052, 11831, 11604, 11357, 11123, 10867, 10611, 10375, 10128, 9909, 9646, 9404, 9112, 8844, 8594, 8341, 8087, 7845, 7611, 7366, 7114, 6876, 6629, 6390, 6141, 5897, 5646, 5397, 5146, 4900, 4651, 4406, 4158, 3909, 3661, 3412, 3168, 2922, 2679, 2435, 2191, 1948, 1705, 1462, 1219, 976, 733, 490, 247];

export function pinyinInitial(str) {
  if (!str) return '#';
  const ch = str.trim()[0];
  const code = ch.charCodeAt(0);
  if (code >= 0x41 && code <= 0x5A) return ch; // A-Z
  if (code >= 0x61 && code <= 0x7A) return ch.toUpperCase();
  if (code < 0x4E00 || code > 0x9FFF) return '#';
  for (let i = 0; i < PINYIN_CODES.length; i++) {
    if (code >= PINYIN_CODES[i]) return PINYIN_MAP.letters[Math.min(i, PINYIN_MAP.letters.length - 1)];
  }
  return '#';
}

/* ---------- 颜色工具 ---------- */
export function hexToRgb(hex) {
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
export function rgbToHex(r, g, b) {
  const f = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}

/** 从图片提取主色调 */
export function extractDominantColor(imgEl) {
  try {
    const c = document.createElement('canvas');
    c.width = 26; c.height = 26;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, 26, 26);
    const data = ctx.getImageData(0, 0, 26, 26).data;
    let best = null, bestScore = -1;
    const buckets = {};
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      if (lum < 0.12 || lum > 0.94) continue;
      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      const score = sat * 2 + 0.4;
      buckets[key] = (buckets[key] || 0) + score;
      if (buckets[key] > bestScore) { bestScore = buckets[key]; best = [r, g, b]; }
    }
    if (!best) return null;
    let [r, g, b] = best;
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    if (lum < 0.35) { r = r * 1.5 + 20; g = g * 1.5 + 20; b = b * 1.5 + 20; }
    return rgbToHex(r, g, b);
  } catch (e) { return null; }
}

/* ---------- 图片压缩（相册上传用，目标 < 200KB） ---------- */
export function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxDim) {
          const k = maxDim / Math.max(w, h);
          w = Math.round(w * k); h = Math.round(h * k);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let q = quality;
        while (dataUrl.length > 200 * 1024 * 1.37 && q > 0.3) { // 200KB（base64≈1.37x）
          q -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }
        // 生成缩略图
        const tc = document.createElement('canvas');
        const tw = Math.min(320, w), th = Math.round(h * (Math.min(320, w) / w));
        tc.width = tw; tc.height = th;
        tc.getContext('2d').drawImage(img, 0, 0, tw, th);
        const thumb = tc.toDataURL('image/jpeg', 0.7);
        URL.revokeObjectURL(url);
        resolve({ dataUrl, thumb, w, h });
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

/* ---------- AudioBuffer → WAV 编码（录音裁剪导出用） ---------- */
export function audioBufferToWav(buffer) {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const len = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bytes = 44 + len * numCh * 2;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); view.setUint32(4, bytes - 8, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * 2, true); view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  wstr(36, 'data'); view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

/* ---------- 通知 ---------- */
export async function notify(title, body, opts = {}) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, ...opts });
    }
  } catch (e) { /* noop */ }
}

export async function requestNotifyPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/* ---------- 提示音（WebAudio） ---------- */
let audioCtx = null;
export function beep(freq = 880, ms = 180, when = 0, type = 'sine', vol = 0.4) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, audioCtx.currentTime + when);
    g.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + when + ms / 1000);
    o.connect(g).connect(audioCtx.destination);
    o.start(audioCtx.currentTime + when);
    o.stop(audioCtx.currentTime + when + ms / 1000 + 0.05);
  } catch (e) { /* noop */ }
}

export function alarmRing(times = 8) {
  for (let i = 0; i < times; i++) {
    beep(1568, 120, i * 0.36, 'square', 0.25);
    beep(1175, 120, i * 0.36 + 0.18, 'square', 0.25);
  }
}
