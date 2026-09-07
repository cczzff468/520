/* ============ 主屏幕：应用网格 / Dock / 天气小组件 / 实时图标 ============ */

import { el, Bus } from './utils.js';
import { Apps as AppIcons, wIcon, wText } from './icons.js';
import { openApp, Apps as Registry } from './applayer.js';
import { WeatherEngine } from '../api/weather.js';
import { onSwipe } from './utils.js';

/* 按使用频率与功能分组编排：小组件旁放时钟/天气，其次是相册/通讯录，第三排工具类，第四排其他
   朋友圈不再单独占桌面图标（与微信深度整合，入口保留在微信「我」页） */
const GRID_ORDER = ['clock', 'weather', 'photos', 'contacts', 'notes', 'calendar', 'calculator', 'recorder', 'compass', 'themes', 'settings'];
const DOCK_ORDER = ['wechat', 'browser', 'camera', 'music'];
const LIVE_ICONS = ['clock', 'calendar'];

export const Home = {
  _iconEls: {},

  init() {
    const home = document.getElementById('home');
    home.innerHTML = '';
    this.grid = el('div', 'app-grid');
    this.grid.id = 'app-grid'; // 与 CSS #app-grid 选择器匹配（修复网格布局失效）
    this.dock = el('div', 'dock');
    this.dock.id = 'dock';
    this.dots = el('div', 'page-dots');
    this.dots.id = 'page-dots';
    this.dots.innerHTML = '<i class="on"></i>';
    home.append(this.grid, this.dots, this.dock);

    // 天气小组件
    this.widget = el('div', 'home-widget');
    this.widget.innerHTML = `<div class="hw-inner">
      <div class="hw-city">—</div>
      <div class="hw-temp">--°</div>
      <div class="hw-cond">加载中</div>
      <div class="hw-hilo">--° --°</div>
      <div class="hw-time"><div class="hw-clock num">--:--</div><div class="hw-date">--</div></div>
      <div class="hw-icon"></div>
    </div>`;
    this.widget.onclick = () => openApp('weather');
    this.grid.appendChild(this.widget);

    // 应用图标
    GRID_ORDER.forEach(id => this.grid.appendChild(this.buildIcon(id)));
    DOCK_ORDER.forEach(id => this.dock.appendChild(this.buildIcon(id)));

    // 实时图标每 20 秒刷新
    this._liveTimer = setInterval(() => this.refreshLiveIcons(), 20000);
    // 小组件时钟每分钟
    this._widgetTimer = setInterval(() => this.renderWidgetClock(), 10000);

    // 未读徽标
    Bus.on('wechat:unread', (n) => this.updateBadge('wechat', n));
    Bus.on('music:playing', () => this.updateIsland());

    // 下拉通知中心区域 → 打开控制中心（从右上角下滑由 control.js 监听）
    onSwipe(home, { down: () => { Bus.emit('gesture:pull-down'); } });

    this.renderWidgetClock();
    this.loadWeather();
  },

  buildIcon(id) {
    const app = Registry.get(id);
    const cell = el('div', 'app-icon-cell');
    cell.dataset.app = id;
    cell.innerHTML = `
      <div class="app-icon-shape ${LIVE_ICONS.includes(id) ? 'live-icon' : ''}">${AppIcons[id]()}</div>
      <div class="app-icon-label">${app ? app.name : id}</div>`;
    this._iconEls[id] = cell;
    cell.querySelector('.app-icon-shape').addEventListener('click', (e) => {
      e.stopPropagation();
      openApp(id, cell.querySelector('.app-icon-shape'));
    });
    return cell;
  },

  refreshLiveIcons() {
    LIVE_ICONS.forEach(id => {
      const cell = this._iconEls[id];
      if (cell) {
        const shape = cell.querySelector('.app-icon-shape');
        shape.innerHTML = AppIcons[id]();
      }
    });
  },

  updateBadge(id, n) {
    const cell = this._iconEls[id];
    if (!cell) return;
    const shape = cell.querySelector('.app-icon-shape');
    shape.classList.toggle('badge-dot', n > 0);
    if (n > 0 && !shape.querySelector('.badge-num')) {
      const b = el('div', 'badge-num');
      b.style.cssText = 'position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--danger);color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;z-index:2;border:1.5px solid rgba(255,255,255,.9)';
      b.textContent = n > 99 ? '99+' : n;
      shape.style.position = 'relative';
      shape.appendChild(b);
    } else if (n <= 0) {
      shape.querySelectorAll('.badge-num').forEach(x => x.remove());
    } else {
      shape.querySelector('.badge-num').textContent = n > 99 ? '99+' : n;
    }
  },

  renderWidgetClock() {
    const d = new Date();
    const clock = this.widget.querySelector('.hw-clock');
    const date = this.widget.querySelector('.hw-date');
    if (!clock) return;
    clock.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    date.textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]}`;
  },

  async loadWeather() {
    try {
      const data = await WeatherEngine.fetch();
      this.renderWeather(data);
    } catch (e) {
      const w = this.widget;
      w.querySelector('.hw-cond').textContent = '暂无数据 · 点击重试';
      w.querySelector('.hw-city').textContent = '天气';
    }
    const off = Bus.on('weather:updated', (data) => this.renderWeather(data));
  },

  renderWeather(data) {
    const city = WeatherEngine.city || { city: '—' };
    const w = this.widget;
    w.querySelector('.hw-city').textContent = (city.city || '').slice(0, 6);
    w.querySelector('.hw-temp').textContent = WeatherEngine.toDisplay(data.current.temp) + '°';
    const today = data.daily[0];
    w.querySelector('.hw-holo')?.remove();
    w.querySelector('.hw-hilo').textContent = `最高${WeatherEngine.toDisplay(today.max)}° 最低${WeatherEngine.toDisplay(today.min)}°`;
    w.querySelector('.hw-cond').textContent = data.current.code != null ? wText(data.current.code) : '';
    w.querySelector('.hw-icon').innerHTML = wIcon(data.current.code, !data.current.isDay);
  },

  updateIsland() { /* 由 island.js 处理 */ },

  show() { document.getElementById('home').classList.add('show'); },
  hide() { document.getElementById('home').classList.remove('show'); },
};
