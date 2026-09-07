/* ============ 锁屏：大时钟 + 上滑解锁 ============ */

import { el, fmtDate, onSwipe, haptic } from './utils.js';
import { applyWallpaper } from './wallpapers.js';
import { Bus } from './utils.js';
import { Statusbar } from './statusbar.js';

export const Lock = {
  init() {
    const lock = document.getElementById('lock');
    lock.innerHTML = `
      <div class="lock-wallpaper"></div>
      <div class="lock-inner">
        <svg class="lock-lock-icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
        <div class="lock-time num" id="lock-time">9:41</div>
        <div class="lock-date" id="lock-date">—</div>
        <div class="lock-hint">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          <span>上滑解锁</span>
        </div>
      </div>
      <div class="lock-quick">
        <button id="lock-torch"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2.5h8v3l-2 3v13h-4v-13l-2-3zM10 9.5h4M10 13h4M10 16.5h4"/></svg></button>
        <button id="lock-cam"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
      </div>`;
    this._el = lock;
    this._timeNode = lock.querySelector('#lock-time');
    this._dateNode = lock.querySelector('#lock-date');

    this.render();
    this._timer = setInterval(() => this.render(), 1000);

    onSwipe(lock, { up: () => this.unlock() });
    lock.querySelector('.lock-hint').addEventListener('click', () => this.unlock());
    lock.querySelector('#lock-cam').addEventListener('click', () => {
      this.unlock();
      import('./applayer.js').then(m => m.openApp('camera'));
    });
    lock.querySelector('#lock-torch').addEventListener('click', () => {
      haptic();
      import('./control.js').then(m => m.toggleTorch());
    });

    applyWallpaper('lock');
    /* 注意：不监听 wallpaper:changed 重刷锁屏壁纸 ——
       applyWallpaper('lock') 本身已直接写入 .lock-wallpaper 节点，
       若在此监听再调 applyWallpaper('lock') 会形成 emit→listen→apply→emit 无限事件循环，
       并持续清除状态栏采样定时器，导致亮度自适应失效（已根治） */
  },

  render() {
    const d = new Date();
    this._timeNode.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const wd = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
    this._dateNode.textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${wd}`;
  },

  show() {
    this._el.classList.add('show');
    Statusbar.setStyle('dark'); // 过渡色
    Statusbar.auto(null, 60);  // 自动采样锁屏壁纸：浅色壁纸 → 黑字
  },
  unlock() {
    if (!this._el.classList.contains('show')) return;
    this._el.style.transition = 'transform .45s cubic-bezier(.32,.72,0,1), opacity .45s ease';
    this._el.style.transform = 'translateY(-100%)';
    this._el.style.opacity = '0';
    setTimeout(() => {
      this._el.classList.remove('show');
      this._el.style.cssText = '';
      document.getElementById('home').classList.add('show');
      // 解锁后回主屏：自动采样主屏壁纸亮度决定黑白字；若直接进入应用（如锁屏相机）则由 openApp 设置
      import('./applayer.js').then(m => { if (!m.isAppOpen()) Statusbar.auto(null, 80); });
    }, 480);
  },
};
