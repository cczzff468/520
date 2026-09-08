/* ============ 应用注册表 + 窗口管理（打开/关闭动画）+ 全局返回键 ============ */

import { el, haptic, Bus } from './utils.js';
import { Statusbar } from './statusbar.js';
import { resetNavs, navBack } from './nav.js';

const registry = {};
let current = null; // { app, win, content, offNav, offSb }

/* 应用快照缓存：关闭应用时保存最终界面 DOM，供多任务切换器显示“实时界面”卡片。
   克隆时清除 id（防双 id 冲突）与媒体元素（canvas/video 克隆后无内容） */
export const Snapshots = {
  _store: new Map(),
  save(id, contentEl) {
    try {
      const clone = contentEl.cloneNode(true);
      clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      clone.querySelectorAll('canvas, video, audio, iframe').forEach(n => n.remove());
      clone.style.pointerEvents = 'none';
      this._store.set(id, clone);
      if (this._store.size > 12) {
        this._store.delete(this._store.keys().next().value); // 淘汰最旧
      }
    } catch (e) { /* 快照失败 → 切换器降级为图标卡片 */ }
  },
  get(id) { return this._store.get(id) || null; },
  clear(id) { this._store.delete(id); },
};

export const Apps = {
  register(app) { registry[app.id] = app; },
  get(id) { return registry[id]; },
  all() { return Object.values(registry); },
  currentId() { return current ? current.app.id : null; },
};

/* 当子页面/应用自带返回按钮时，隐藏全局返回键避免双按钮 */
const OWN_BACK_SEL = [
  '.nav-page:not(.leave) .nav-btn.chev', // 导航栏自带返回的子页面
  '.nav-page:not(.leave) .pl-back',      // 音乐播放器自带返回
  '.nav-page:not(.leave) #mo-back',      // 朋友圈自带返回
  '.nav-page:not(.leave) [data-own-back]', // 通用：页面自带返回键（天气返回/扫一扫等）
  '#cp-back',                             // 指南针自带返回
  '#cam-back',                            // 相机自带返回
].join(', ');

export function openApp(id, opts) {
  if (current) return; // 同一时间只允许一个应用
  const app = registry[id];
  if (!app) return;
  haptic(8);
  resetNavs(); // 清空上一应用的导航栈注册

  const iconEl = opts instanceof Element ? opts : (opts && opts.icon);
  const section = opts && opts.section;

  const layer = document.getElementById('app-layer');
  const win = el('div', 'app-window');
  win.dataset.app = id; // 供应用级 CSS 定向覆盖（如微信去除返回键毛玻璃）
  const content = app.fullscreen ? el('div', 'app-fullscreen') : el('div', 'app-root');

  // 从图标位置缩放打开
  if (iconEl) {
    const r = iconEl.getBoundingClientRect();
    const sr = document.getElementById('screen').getBoundingClientRect();
    win.style.transformOrigin = `${((r.left + r.width / 2 - sr.left) / sr.width * 100).toFixed(1)}% ${((r.top + r.height / 2 - sr.top) / sr.height * 100).toFixed(1)}%`;
  }
  win.appendChild(content);
  layer.appendChild(win);
  win.classList.add('anim-open');
  setTimeout(() => { win.classList.remove('anim-open'); win.style.transformOrigin = ''; }, 520);
  /* ---- 全局返回键：所有应用左上角常驻（毛玻璃圆钮，纯图标） ----
     点击优先级：应用自定义覆盖层返回 → 应用内子页面返回 → 关闭应用回主屏 */
  const backFab = el('button', 'app-back-fab' + (app.sbStyle === 'dark' ? ' on-dark' : ''));
  backFab.type = 'button';
  backFab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4.5l-7.5 7.5 7.5 7.5"/></svg>`;
  backFab.setAttribute('aria-label', '返回上级或主屏幕');
  const updateBackFab = () => {
    backFab.classList.toggle('hide', !!win.querySelector(OWN_BACK_SEL));
  };
  const offNav = Bus.on('nav:changed', updateBackFab);
  backFab.onclick = () => {
    haptic(6);
    if (app.onBack && app.onBack() === true) return; // 1. 相册查看器/相机预览等自定义覆盖层
    if (navBack()) return;                           // 2. 导航栈子页面退一级
    closeApp();                                      // 3. 根页面 → 回主屏幕
  };
  win.appendChild(backFab);

  document.getElementById('home').classList.remove('show');
  /* 状态栏：先按应用声明样式立即上色，随后自动采样真实背景亮度修正 */
  const initStyle = app.sbStyle === 'dark' ? 'dark' : 'light';
  Statusbar.setStyle(initStyle);
  Statusbar.auto(initStyle, 480);
  /* 采样结果变化时同步返回键深浅变体 */
  const offSb = Bus.on('sb:style', ({ style }) => backFab.classList.toggle('on-dark', style === 'dark'));

  current = { app, win, content, offNav, offSb };

  const ctx = {
    close: () => closeApp(),
    openApp: (id2, opts2) => { closeApp(); setTimeout(() => openApp(id2, opts2), 380); },
    setSbStyle: (s) => Statusbar.setStyle(s === 'dark' ? 'dark' : 'light'),
    win, section,
  };
  try {
    app.mount(content, ctx);
  } catch (e) {
    console.error('[mount]', id, e);
    content.innerHTML = `<div class="empty-state"><div class="es-title">应用启动失败</div><div>${String(e.message || e)}</div></div>`;
  }
  updateBackFab(); // 挂载后立即校正（兼容朋友圈/指南针/相机/天气等自带返回键的应用）
  Bus.emit('app:opened', id);
}

export function closeApp() {
  if (!current) return;
  const { app, win, content, offNav, offSb } = current;
  if (offNav) offNav();
  if (offSb) offSb();
  resetNavs();
  Snapshots.save(app.id, content); // 先存快照再 unmount（防 unmount 清理 DOM）
  try { app.unmount && app.unmount(); } catch (e) { console.error('[unmount]', e); }
  win.classList.add('anim-close');
  setTimeout(() => { win.remove(); }, 400);
  current = null;
  document.getElementById('home').classList.add('show');
  Statusbar.setStyle('dark'); // 主屏过渡色：'app:closed' 事件后自动采样壁纸亮度修正
  Bus.emit('app:closed', app.id);
}

export function isAppOpen() { return !!current; }

/* 当前应用实时 DOM 根（切换器 live 卡片克隆用） */
export function getLiveContent() { return current ? current.content : null; }

/* 全局桥接（供相册等模块跳转使用，避免循环导入） */
window.__openApp = openApp;
window.__isAppOpen = isAppOpen;
window.__currentAppId = () => (current ? current.app.id : null);
window.__closeApp = closeApp;

/* 底部 Home 手势区上滑交互由 switcher.js 接管（多任务卡片流） */
