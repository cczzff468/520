/* ============ 真实状态栏：时间每秒同步 + Battery API + 背景色自动采样 ============
   颜色自适应：采样状态栏背后内容的平均亮度（壁纸 / 应用背景 / 渐变），
   深色背景 → 白字，浅色背景 → 黑字（仿 iOS 行为）。 */

import { Bus } from './utils.js';

/* ---------- 颜色工具 ---------- */
function parseRGBA(str) {
  if (!str) return null;
  const m = String(str).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[\/,]\s*([\d.]+)\s*)?\)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}
/* alpha 合成：top 半透明色叠在 bottom 上 */
function blend(top, bottom) {
  const a = top.a == null ? 1 : top.a;
  return [
    top.r * a + bottom[0] * (1 - a),
    top.g * a + bottom[1] * (1 - a),
    top.b * a + bottom[2] * (1 - a),
  ];
}
function lumOf(rgb) { return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255; }
function darkenRGB(rgb, k) { return [rgb[0] * (1 - k), rgb[1] * (1 - k), rgb[2] * (1 - k)]; }

/* 解析 background-image 值 → 平均 RGB：
   渐变 → 所有色标平均；data:/blob: 图片 → canvas 采样顶部 20% 条带 */
function bgImageColor(bi) {
  const v = String(bi);
  if (v.includes('gradient')) {
    const stops = [...v.matchAll(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:[\/,]\s*[\d.]+\s*)?\)/g)].map(m => parseRGBA(m[0]));
    if (!stops.length) return Promise.resolve(null);
    let r = 0, g = 0, b = 0;
    stops.forEach(c => { r += c.r; g += c.g; b += c.b; });
    return Promise.resolve([r / stops.length, g / stops.length, b / stops.length]);
  }
  const u = v.match(/url\((['"]?)(.*?)\1\)/);
  if (!u) return Promise.resolve(null);
  return imageTopRGB(u[2]);
}

/* 图片顶部条带平均色（仅 data:/blob: 本地源，避免网络请求与跨域污染） */
function imageTopRGB(src) {
  return new Promise((resolve) => {
    if (!/^(data:|blob:)/i.test(src)) { resolve(null); return; }
    const img = new Image();
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = 24; cv.height = 10;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        const sh = Math.max(1, Math.round((img.naturalHeight || 1) * 0.2)); // 顶部 20%：状态栏所处区域
        cx.drawImage(img, 0, 0, img.naturalWidth || 24, sh, 0, 0, 24, 10);
        const d = cx.getImageData(0, 0, 24, 10).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        finish([r / n, g / n, b / n]);
      } catch (e) { finish(null); }
    };
    img.onerror = () => finish(null);
    img.src = src;
    setTimeout(() => finish(null), 400); // 解码超时保护
  });
}

export const Statusbar = {
  _timer: null,
  _battery: { level: 1, charging: false, supported: false },
  _autoTimer: null,
  _autoFallback: null,
  _style: 'light',

  init() {
    this._timeNode = document.getElementById('sb-time');
    this._battNode = document.getElementById('sb-batt');
    this._fillNode = document.getElementById('sb-batt-fill');
    this._numNode = document.getElementById('sb-batt-num');
    this._boltNode = document.getElementById('sb-batt-bolt');

    this.renderTime();
    this._timer = setInterval(() => this.renderTime(), 1000);

    this.initBattery();

    /* ---- 自动采样触发点：应用开关 / 子页面切换 / 壁纸与主题变更 ---- */
    Bus.on('app:closed', () => this.auto(null, 400));
    Bus.on('nav:changed', () => this.auto(null, 360));
    Bus.on('wallpaper:changed', () => this.auto(null, 60));
    Bus.on('theme:changed', () => this.auto(null, 420));
    Bus.on('sb:reauto', () => this.auto(null, 60));
  },

  renderTime() {
    const d = new Date();
    const m = String(d.getMinutes()).padStart(2, '0');
    this._timeNode.textContent = `${d.getHours()}:${m}`; // iOS 状态栏：纯时间，无上午/下午
  },

  async initBattery() {
    // 绘制默认电量（API 不可用时显示满电）
    this.renderBattery();
    try {
      if (navigator.getBattery) {
        const b = await navigator.getBattery();
        this._battery = { level: b.level, charging: b.charging, supported: true };
        b.addEventListener('levelchange', () => { this._battery.level = b.level; this.renderBattery(); });
        b.addEventListener('chargingchange', () => { this._battery.charging = b.charging; this.renderBattery(); });
        this.renderBattery();
      }
    } catch (e) { /* 保持默认 */ }
  },

  renderBattery() {
    const { level, charging, supported } = this._battery;
    const pct = Math.round(level * 100);
    // 填充条基于内框宽度（左内缩1px + 右预留1px）
    this._fillNode.style.width = `calc((100% - 2px) * ${Math.max(4, pct) / 100})`;
    // 百分比常显：iOS 真实行为，未获取到系统电量时展示满电 100
    this._numNode.textContent = pct + '%';
    this._battNode.classList.toggle('charging', charging);
    this._battNode.classList.toggle('low', supported && !charging && pct <= 20);
    Bus.emit('battery:updated', { pct, charging, supported });
  },

  /** 设置状态栏内容颜色：'light'=浅色背景(黑字) / 'dark'=深色背景(白字) */
  setStyle(style) {
    this._style = style === 'dark' ? 'dark' : 'light';
    const sb = document.getElementById('statusbar');
    sb.classList.toggle('sb-dark', this._style === 'dark');
    document.body.classList.toggle('sb-dark-body', this._style === 'dark');
    Bus.emit('sb:style', { style: this._style });
  },

  /* ================= 背景色自动采样 ================= */

  /** 自动模式：延迟采样状态栏背后亮度 → 黑底白字 / 白底黑字
   *  fallback：采样失败时回退的样式（如应用声明的 sbStyle） */
  auto(fallback, delay = 90) {
    clearTimeout(this._autoTimer);
    this._autoFallback = fallback || null;
    this._autoTimer = setTimeout(() => this._runAuto(0), delay);
  },

  async _runAuto(retry) {
    // 应用开关 / 页面切换动画进行中 → 等动画结束再采样（最多重试 12 次）
    if (this._animating()) {
      if (retry < 12) this._autoTimer = setTimeout(() => this._runAuto(retry + 1), 110);
      return;
    }
    let l = null;
    try { l = await this.sampleLuminance(); } catch (e) { l = null; }
    if (l == null) {
      if (this._autoFallback) this.setStyle(this._autoFallback);
      return;
    }
    this.setStyle(l < 0.5 ? 'dark' : 'light');
  },

  _animating() {
    return !!document.querySelector('.app-window.anim-open, .app-window.anim-close, .nav-page.enter, .nav-page.leave');
  },

  /** 采样当前状态栏背后的平均亮度（0=纯黑, 1=纯白）；null=无法判定 */
  async sampleLuminance() {
    const screen = document.getElementById('screen');
    if (!screen) return null;

    /* 锁屏 → 直接采样锁屏壁纸（叠 25% 压暗，与 CSS ::after 一致） */
    const lock = document.getElementById('lock');
    if (lock && lock.classList.contains('show')) {
      const wp = lock.querySelector('.lock-wallpaper');
      const c = wp ? await this.elBackColor(wp) : null;
      return c ? lumOf(darkenRGB(c, 0.25)) : 0;
    }

    /* 多任务切换器 → 深色毛玻璃 → 白字 */
    const ts = document.getElementById('task-switcher');
    if (ts && ts.classList.contains('show')) return 0;

    /* 应用窗口 → 采样顶部条带的实际渲染元素 */
    const appWin = document.querySelector('#app-layer .app-window');
    if (appWin) return await this.sampleAppTop();

    /* 主屏 → 采样主屏壁纸（叠 18% 压暗） */
    const wp = document.getElementById('wallpaper-home');
    const c = wp ? await this.elBackColor(wp) : null;
    return c ? lumOf(darkenRGB(c, 0.18)) : 0;
  },

  /** 元素自身背景（背景图优先，其次背景色） */
  async elBackColor(node) {
    const cs = getComputedStyle(node);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      const c = await bgImageColor(cs.backgroundImage);
      if (c) return c;
    }
    const c = parseRGBA(cs.backgroundColor);
    return c ? [c.r, c.g, c.b] : null;
  },

  /** 应用窗口顶部采样：状态栏高度带内取 4 个采样点（避开灵动岛），
   *  elementFromPoint → 沿 DOM 向上做 alpha 合成，得到等效背景色 */
  async sampleAppTop() {
    const sb = document.getElementById('statusbar');
    const screen = document.getElementById('screen');
    if (!sb || !screen) return null;
    const sbRect = sb.getBoundingClientRect();
    const sr = screen.getBoundingClientRect();
    const y = sbRect.top + sbRect.height * 0.45;
    const ir = document.getElementById('island').getBoundingClientRect();

    /* 采样期间临时隐藏全局弹层（Sheet 遮罩），只看应用本体 */
    const sheetEl = document.getElementById('layer-sheet');
    const sheetHadContent = sheetEl && sheetEl.childElementCount > 0;
    const sheetWasVisible = sheetHadContent && sheetEl.style.visibility !== 'hidden';
    if (sheetWasVisible) sheetEl.style.visibility = 'hidden';

    let sum = 0, n = 0;
    try {
      for (const f of [0.14, 0.26, 0.74, 0.86]) {
        const x = sr.left + sr.width * f;
        if (x >= ir.left - 3 && x <= ir.right + 3) continue; // 灵动岛区域跳过
        const node = document.elementFromPoint(x, y);
        if (!node || node === document.documentElement || node === document.body) continue;
        if (node.closest && node.closest('#island, #statusbar, #home-bar')) continue;
        const rgb = await this.chainColor(node);
        if (rgb) { sum += lumOf(rgb); n++; }
      }
    } finally {
      if (sheetWasVisible) sheetEl.style.visibility = '';
    }
    return n ? sum / n : null;
  },

  /** 从命中元素向上遍历：背景色 alpha 合成 + 渐变/图片平均色 → 等效 RGB */
  async chainColor(start) {
    const screenEl = document.getElementById('screen');
    const layers = [];
    let node = start;
    let guard = 0;
    while (node && guard++ < 30) {
      const cs = getComputedStyle(node);
      const bi = cs.backgroundImage;
      const bc = parseRGBA(cs.backgroundColor);
      layers.push({ bi, bc });
      if (bi === 'none' && bc && bc.a >= 0.99) break; // 不透明实底，无需再向上
      if (node === screenEl) break;
      node = node.parentElement;
    }
    let rgb = [0, 0, 0]; // #screen 底色
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (L.bi && L.bi !== 'none') {
        const c = await bgImageColor(L.bi);
        if (c) { rgb = c; continue; } // background-image 覆盖（铺满）
      }
      if (L.bc) rgb = blend(L.bc, rgb);
    }
    return rgb;
  },

  destroy() { clearInterval(this._timer); },
};
