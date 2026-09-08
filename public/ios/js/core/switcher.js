/* ============ 多任务切换器：底部横杠上滑 → 应用卡片流
    左右滑动切换 · 点击卡片进入应用 · 上滑卡片关闭 ============ */

import { el, haptic, Bus, onSwipe } from './utils.js';
import { Apps as Registry, openApp, closeApp, isAppOpen, getLiveContent, Snapshots } from './applayer.js';
import { Apps as AppIcons } from './icons.js';
import { Statusbar } from './statusbar.js';
import { wallpaperCSS } from './wallpapers.js';

const MAX_RECENTS = 10;
const HOME_ZONE = 40; // 屏幕底部 40px 手势区

export const Switcher = {
  _recents: [],
  _el: null,
  _rail: null,

  init() {
    /* 最近使用应用：打开即置顶去重 */
    Bus.on('app:opened', (id) => {
      this._recents = [id, ...this._recents.filter(x => x !== id)].slice(0, MAX_RECENTS);
    });

    /* 底部 Home 手势区上滑（应用内/主屏均生效；锁屏除外） */
    const screen = document.getElementById('screen');
    onSwipe(screen, {
      up: (sx, sy, target) => {
        if (target && target.closest && target.closest('#lock')) return; // 锁屏上滑是解锁
        const r = screen.getBoundingClientRect();
        if (sy < r.bottom - HOME_ZONE) return; // 起点不在底部手势区 → 不触发
        if (this.isOpen()) { this.dismissToHome(); return; }
        this.show();
      },
    });

    /* 主屏/应用内点击底部 Home 横杠 → 打开切换器（显式入口） */
    const homeBar = document.getElementById('home-bar');
    if (homeBar) {
      homeBar.addEventListener('click', () => {
        if (document.getElementById('lock').classList.contains('show')) return;
        this.show();
      });
    }
  },

  isOpen() { return !!(this._el && this._el.classList.contains('show') && !this._el.classList.contains('closing')); },

  /* 把正在运行的应用窗口搬回 app-layer（卡片里展示期间它一直在真实运行） */
  _restoreLiveWindow() {
    if (!this._liveWin) return;
    const layer = document.getElementById('app-layer');
    if (layer && this._liveWin.isConnected) layer.appendChild(this._liveWin);
    this._liveWin = null;
  },

  show() {
    if (this.isOpen()) return;
    if (!this._recents.length && !isAppOpen()) { haptic(6); return; } // 无最近应用
    haptic(8);

    if (!this._el) {
      /* 优先使用 index.html 中的静态 #task-switcher（避免同 ID 双元素） */
      this._el = document.getElementById('task-switcher');
      if (!this._el) {
        this._el = el('div', '');
        this._el.id = 'task-switcher';
        document.getElementById('screen').appendChild(this._el);
      }
      /* 点击卡片以外任何空白区域 → 返回主屏（关闭当前应用，iOS 真实行为） */
      this._el.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('.ts-card')) return;
        this.dismissToHome();
      });
    }

    this._el.innerHTML = '';
    /* 背景：当前主屏壁纸重度模糊 + 暗色遮罩（iOS 切换器质感） */
    const bg = el('div', 'ts-bg');
    const shade = el('div', 'ts-shade');
    this._applySwitcherWallpaper(bg);
    this._rail = el('div', 'ts-rail');
    const list = this._visibleRecents();
    const curId = Registry.currentId();

    list.forEach((id, i) => {
      const app = Registry.get(id);
      if (!app) return;
      /* ts-item = 卡片 + 下方脚注（小图标+应用名，iOS 卡片下签名样式） */
      const item = el('div', 'ts-item');
      const card = el('div', 'ts-card' + (id === curId ? ' cur' : ''));
      card.dataset.app = id;
      /* 卡片内容来源：
         当前应用 = 真实运行中的窗口直接搬入卡片（继续运行，真·实时界面）
         其他应用 = 关闭时保存的界面快照克隆 */
      let snap = null;
      let liveWin = null;
      if (id === curId && getLiveContent()) {
        liveWin = document.querySelector('#app-layer .app-window');
      }
      if (!liveWin && id !== curId) {
        snap = Snapshots.get(id);
        if (snap) snap = snap.cloneNode(true); // 展示克隆，源留给下次
      }

      if (liveWin || snap) {
        /* 实时界面卡片：缩放的界面（名称在卡片下方脚注） */
        card.innerHTML = `
          ${id === curId ? '<span class="ts-badge">正在使用</span>' : ''}
          <div class="ts-snap-wrap"><div class="ts-snap"></div></div>`;
        const snapHost = card.querySelector('.ts-snap');
        if (liveWin) {
          snapHost.appendChild(liveWin); // 搬入真实窗口：计时器/音频/动画持续运行
          this._liveWin = liveWin;
        } else {
          snapHost.appendChild(snap);
        }
        /* 按卡片实际宽度缩放（app-root 固定 393px 宽）——两段式：
           ① 立即用布局宽度 clientWidth（不受入场动画 transform 影响，但取整有亚像素误差）
           ② 入场动画结束后改用 getBoundingClientRect 分数宽度 ×1.004 过盈缩放：
              完全覆盖卡片边缘，杜绝深色应用露底色发丝缝（700ms 兜底防动画被打断） */
        const snapScale = (frac) => {
          if (!snapHost.isConnected) return;
          const w = frac
            ? card.querySelector('.ts-snap-wrap').getBoundingClientRect().width
            : (card.querySelector('.ts-snap-wrap').clientWidth || 240);
          if (w) snapHost.style.transform = `scale(${(w / 393 * (frac ? 1.004 : 1.001)).toFixed(4)})`;
        };
        requestAnimationFrame(() => snapScale(false));
        card.addEventListener('animationend', (e) => {
          if (e.target === card && e.animationName === 'tsCardIn') snapScale(true);
        });
        setTimeout(() => snapScale(true), 700);
      } else {
        /* 无快照占位卡片（图标居中，名称在下方脚注） */
        card.innerHTML = `
          ${id === curId ? '<span class="ts-badge">正在使用</span>' : ''}
          <div class="ts-placeholder">
            <div class="ts-icon">${AppIcons[id]()}</div>
          </div>`;
      }
      /* 卡片下方脚注：小图标 + 应用名 */
      const foot = el('div', 'ts-foot');
      foot.innerHTML = `
        <div class="ts-mini">${AppIcons[id]()}</div>
        <div class="ts-name">${app.name}</div>`;
      item.append(card, foot);

      /* 入场 stagger */
      card.style.animationDelay = (i * 45).toFixed(0) + 'ms';
      card.classList.add('enter');

      /* 鼠标指针显式捕获：上滑松手时 pointerup 仍落在卡片上（触摸天然隐式捕获） */
      card.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') { try { card.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } }
      });
      let swiped = false; // 上滑关闭后抑制紧随的 click（避免误触打开应用）
      /* 点击卡片 → 进入该应用（当前应用则仅收起） */
      card.addEventListener('click', () => {
        if (swiped) { swiped = false; return; }
        if (card.classList.contains('closing')) return;
        if (id === Registry.currentId()) { this.dismiss(); return; }
        this.close();
        if (isAppOpen()) closeApp();
        setTimeout(() => openApp(id), 360);
      });
      /* 上滑卡片 → 从最近任务移除；若为当前应用则一并关闭 */
      onSwipe(card, {
        up: () => {
          swiped = true;
          haptic(8);
          card.classList.add('closing');
          const remove = () => {
            this._recents = this._recents.filter(x => x !== id);
            Snapshots.clear(id); // 快照一并清理
            if (id === Registry.currentId()) { this._restoreLiveWindow(); closeApp(); }
            item.remove();
            if (!this._visibleRecents().length) this.close();
          };
          setTimeout(remove, 240);
        },
      });
      this._rail.appendChild(item);
      /* 初始滚动定位到当前应用（或第一张） */
      requestAnimationFrame(() => {
        if (id === curId || (!curId && i === 0)) {
          const r = card.getBoundingClientRect();
          const rr = this._rail.getBoundingClientRect();
          this._rail.scrollTo({ left: this._rail.scrollLeft + (r.left - rr.left) - (rr.width - r.width) / 2, behavior: 'auto' });
        }
      });
    });

    const hint = el('div', 'ts-hint');
    hint.textContent = '点击空白处返回主屏 · 上滑卡片可关闭应用';
    this._el.append(bg, shade, this._rail, hint);
    this._el.classList.add('show');
    Statusbar.setStyle('dark');
  },

  /* 背景 = 当前主屏壁纸（同步读 #wallpaper-home 已应用的样式；取不到再回退异步读库） */
  _applySwitcherWallpaper(bg) {
    try {
      const wp = document.getElementById('wallpaper-home');
      const b = wp ? getComputedStyle(wp).backgroundImage : 'none';
      if (wp && b && b !== 'none') {
        bg.style.backgroundImage = b;
        bg.style.backgroundSize = 'cover';
        bg.style.backgroundPosition = 'center';
        return;
      }
    } catch (e) { /* 回退异步 */ }
    wallpaperCSS().then(s => {
      if (bg.isConnected) {
        bg.style.background = s.background;
        bg.style.backgroundColor = '#111';
      }
    }).catch(() => { /* 保持暗底 */ });
  },

  _visibleRecents() {
    /* 当前应用若不在最近列表头部也可见 */
    const cur = Registry.currentId();
    const list = this._recents.filter(id => Registry.get(id));
    if (cur && !list.includes(cur)) return [cur, ...list];
    return list;
  },

  dismiss() {
    /* 收起 → 回到当前应用或主屏 */
    if (!this._el) return;
    this.close();
    Statusbar.auto(null, 300);
  },

  dismissToHome() {
    /* 底部再次上滑 → 回主屏（关闭当前应用） */
    if (!this._el) return;
    this.close();
    if (isAppOpen()) closeApp();
    Statusbar.auto(null, 300);
  },

  close() {
    if (!this._el) return;
    this._restoreLiveWindow(); // 先把真实窗口搬回应用层再收起
    this._el.classList.add('closing');
    setTimeout(() => {
      this._el.classList.remove('show', 'closing');
      this._el.innerHTML = '';
      this._rail = null;
    }, 200);
    Statusbar.auto(null, 400);
  },
};
