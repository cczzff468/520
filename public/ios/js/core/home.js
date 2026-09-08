/* ============ 主屏幕：应用网格 / Dock / 天气小组件 / 抖动编辑 / 实时图标 ============ */

import { el, Bus, haptic } from './utils.js';
import { Apps as AppIcons, wIcon, wText } from './icons.js';
import { openApp, Apps as Registry } from './applayer.js';
import { WeatherEngine } from '../api/weather.js';
import { Settings } from './db.js';
import { toast } from './ui.js';

/* 按使用频率与功能分组编排：小组件旁放时钟/天气，其次是相册/通讯录，第三排工具类，第四排其他
   朋友圈不再单独占桌面图标（与微信深度整合，入口保留在微信「我」页） */
const GRID_ORDER = ['clock', 'weather', 'photos', 'contacts', 'notes', 'calendar', 'calculator', 'recorder', 'compass', 'themes', 'settings'];
const DOCK_ORDER = ['wechat', 'browser', 'camera', 'music'];
const LIVE_ICONS = ['clock', 'calendar'];
const X_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const DEFAULT_LAYOUT = () => ({ grid: [...GRID_ORDER], dock: [...DOCK_ORDER], hidden: [], widgetIndex: 0 });

/* DOM 位置互换（跨容器拖拽交换用） */
function swapNodes(a, b) {
  const marker = document.createComment('swap');
  a.replaceWith(marker);
  b.replaceWith(a);
  marker.replaceWith(b);
}

export const Home = {
  _iconEls: {},
  editing: false,
  layout: null,

  async init() {
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

    /* 布局持久化：顺序 + 已删除图标
       防御：IndexedDB 读取异常/数据形状非法时回退默认布局，绝不让图标渲染中断 */
    let saved = null;
    try { saved = await Settings.load('homeLayout', null); } catch (e) { saved = null; }
    this.layout = (saved && Array.isArray(saved.grid) && Array.isArray(saved.dock)) ? saved : DEFAULT_LAYOUT();
    this.layout.hidden = Array.isArray(this.layout.hidden) ? this.layout.hidden : [];
    /* 过滤历史遗留的非法 id（如已下线应用/损坏数据），防止 buildIcon 崩溃中断整屏渲染 */
    this.layout.grid = this.layout.grid.filter(id => typeof id === 'string' && Registry.get(id) && typeof AppIcons[id] === 'function');
    this.layout.dock = this.layout.dock.filter(id => typeof id === 'string' && Registry.get(id) && typeof AppIcons[id] === 'function');

    /* 兼容后续新增的默认应用：自动补到网格末尾 */
    GRID_ORDER.concat(DOCK_ORDER).forEach(id => {
      if (!this.layout.grid.includes(id) && !this.layout.dock.includes(id) && !this.layout.hidden.includes(id)) {
        this.layout.grid.push(id);
      }
    });

    /* 兜底：可见图标为 0（hidden 覆盖了全部/数据损坏）时自动恢复默认布局并固化清洗
       注意：直接持久化内存对象（此时 DOM 尚未渲染，不能走 _persistLayout 的 DOM 读取） */
    const visible = this.layout.grid.filter(id => !this.layout.hidden.includes(id)).length
                  + this.layout.dock.filter(id => !this.layout.hidden.includes(id)).length;
    if (visible === 0) {
      this.layout = DEFAULT_LAYOUT();
      try { Settings.setQuiet('homeLayout', { grid: [...this.layout.grid], dock: [...this.layout.dock], hidden: [] }); } catch (e) { /* 固化失败不影响本次渲染 */ }
    }

    /* 天气小组件（截图样式：蓝色渐变大温度卡片） */
    this.widget = el('div', 'home-widget');
    this.widget.innerHTML = `<div class="hw-inner">
      <div class="hw-top">
        <div class="hw-main">
          <div class="hw-temp"><span class="hw-t">--</span><span class="hw-deg">°</span></div>
          <div class="hw-cond">加载中</div>
        </div>
        <div class="hw-icon"></div>
      </div>
      <div class="hw-bottom">
        <div class="hw-left">
          <div class="hw-air">--</div>
          <div class="hw-hilo">--° ~ --°</div>
        </div>
        <div class="hw-city">—</div>
      </div>
    </div>`;
    this.widget.onclick = () => { if (!this.editing) openApp('weather'); };
    this._bindDrag(this.widget); // 编辑模式下小组件可拖拽换位

    this.renderGrid();

    /* 实时图标每 20 秒刷新 */
    this._liveTimer = setInterval(() => this.refreshLiveIcons(), 20000);

    /* 未读徽标 */
    Bus.on('wechat:unread', (n) => this.updateBadge('wechat', n));
    Bus.on('music:playing', () => this.updateIsland());

    /* 编辑模式：点击空白（壁纸）退出 */
    home.addEventListener('click', (e) => {
      if (!this.editing) return;
      if (e.target.closest('.app-icon-cell') || e.target.closest('.home-widget') || e.target.closest('.home-edit-bar')) return;
      this.exitEdit();
    });

    this.loadWeather();
  },

  renderGrid() {
    this.grid.querySelectorAll('.app-icon-cell, .home-widget').forEach(n => n.remove());
    this.dock.querySelectorAll('.app-icon-cell').forEach(n => n.remove());
    this._iconEls = {};
    /* 小组件按持久化的插入位渲染（widgetIndex：前方图标数） */
    const gridIds = this.layout.grid.filter(id => !this.layout.hidden.includes(id));
    const wi = Math.min(Math.max(this.layout.widgetIndex || 0, 0), gridIds.length);
    /* 单个图标构建失败不影响其余图标渲染 */
    const appendIcon = (id) => { const c = this.buildIcon(id); if (c) this.grid.appendChild(c); };
    let i = 0;
    for (; i < wi && i < gridIds.length; i++) appendIcon(gridIds[i]);
    this.grid.appendChild(this.widget);
    for (; i < gridIds.length; i++) appendIcon(gridIds[i]);
    this.layout.dock.filter(id => !this.layout.hidden.includes(id)).forEach(id => {
      const cell = this.buildIcon(id);
      if (cell) this.dock.appendChild(cell);
    });
  },

  buildIcon(id) {
    const app = Registry.get(id);
    const iconFn = AppIcons[id];
    if (!app || typeof iconFn !== 'function') return null; // 非法 id：跳过而非中断整屏
    const cell = el('div', 'app-icon-cell');
    cell.dataset.app = id;
    cell.innerHTML = `
      <div class="app-icon-shape ${LIVE_ICONS.includes(id) ? 'live-icon' : ''}">${AppIcons[id]()}</div>
      <div class="app-icon-label">${app ? app.name : id}</div>`;
    this._iconEls[id] = cell;

    const shape = cell.querySelector('.app-icon-shape');
    /* 点击打开（绑在 cell：鼠标指针捕获后 click 目标为 cell；触摸冒泡也到 cell） */
    cell.addEventListener('click', (e) => {
      if (this.editing) return; // 编辑模式点图标不打开
      if (e.target.closest && e.target.closest('.icon-del')) return;
      openApp(id, shape);
    });

    /* 长按 550ms → 进入抖动编辑模式 */
    cell.addEventListener('pointerdown', () => {
      clearTimeout(this._lp);
      if (this.editing) return;
      this._lp = setTimeout(() => this.enterEdit(), 550);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      cell.addEventListener(ev, () => clearTimeout(this._lp)));
    cell.addEventListener('contextmenu', (e) => e.preventDefault());

    /* 编辑模式下的拖拽排序（仅同容器内互换） */
    this._bindDrag(cell);

    return cell;
  },

  /* ---------- 抖动编辑模式：任意拖拽排序 + 删除 + 恢复默认 ----------
     支持跨容器：grid↔dock 图标互换、小组件↔图标互换（小组件仅限 grid 内移动） */
  enterEdit() {
    if (this.editing) return;
    this.editing = true;
    haptic(10);
    document.getElementById('home').classList.add('edit-mode');
    [this.grid, this.dock].forEach(c => c.classList.add('edit'));
    const cells = [...this.grid.querySelectorAll('.app-icon-cell'), ...this.dock.querySelectorAll('.app-icon-cell')];
    cells.forEach(cell => {
      cell.classList.add('jiggle');
      cell.style.animationDelay = (Math.random() * 0.24).toFixed(2) + 's';
      this._addDelButton(cell);
    });
    this.widget.classList.add('jiggle');
    this.widget.style.animationDelay = '0.12s';

    this._editBar = el('div', 'home-edit-bar');
    this._editBar.innerHTML = `
      <button class="heb-btn ghost" id="heb-reset">恢复默认</button>
      <button class="heb-btn fill" id="heb-done">完成</button>`;
    document.getElementById('home').appendChild(this._editBar);
    this._editBar.querySelector('#heb-done').onclick = () => this.exitEdit();
    this._editBar.querySelector('#heb-reset').onclick = () => {
      this.layout = DEFAULT_LAYOUT();
      this.exitEdit(true); // 跳过持久化：避免用旧 DOM 顺序覆盖刚重置的布局
      this.renderGrid();
      this._persistLayout();
      toast('已恢复默认布局');
    };
  },

  exitEdit(skipPersist = false) {
    if (!this.editing) return;
    this.editing = false;
    if (!skipPersist) this._persistLayout();
    haptic(6);
    document.getElementById('home').classList.remove('edit-mode');
    [this.grid, this.dock].forEach(c => c.classList.remove('edit'));
    [...this.grid.querySelectorAll('.app-icon-cell'), ...this.dock.querySelectorAll('.app-icon-cell')].forEach(cell => {
      cell.classList.remove('jiggle');
      cell.style.animationDelay = '';
      cell.querySelectorAll('.icon-del').forEach(b => b.remove());
    });
    this.widget.classList.remove('jiggle');
    this.widget.style.animationDelay = '';
    if (this._editBar) { this._editBar.remove(); this._editBar = null; }
  },

  _addDelButton(cell) {
    if (cell.querySelector(':scope > .icon-del')) return;
    const btn = el('button', 'icon-del');
    btn.type = 'button';
    btn.setAttribute('aria-label', '删除应用');
    btn.innerHTML = X_SVG;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.editing) return;
      haptic(8);
      const total = this.grid.querySelectorAll('.app-icon-cell').length + this.dock.querySelectorAll('.app-icon-cell').length;
      if (total <= 1) { toast('至少保留一个应用图标'); return; }
      const id = cell.dataset.app;
      cell.style.transition = 'transform .26s var(--ease-ios, ease), opacity .26s ease';
      cell.style.transform = 'scale(.25)';
      cell.style.opacity = '0';
      setTimeout(() => {
        this.layout.hidden.push(id);
        cell.remove();
        this._persistLayout();
      }, 250);
    });
    /* 挂在 cell 上：shape 的 overflow:hidden 会裁掉探出的角标（显示不完整的根因） */
    cell.appendChild(btn);
  },

  /* ---------- 拖拽排序（跨容器）：图标与小组件通用 ----------
     动画体系：①拖拽中元素始终粘在指针下（DOM 换位后增量校正 transform）
              ②被挤开的图标 FLIP 平滑滑动让位（不再是瞬移）
              ③换位滞回 26px（防止指针在两格之间反复横跳导致图标闪烁）
              ④松手后弹性回位（从拖拽位过渡回布局位） */
  _bindDrag(dragEl) {
    const isWidget = dragEl === this.widget;
    dragEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('.icon-del')) return; // 删除按钮不拖拽
      /* 小组件长按也进入编辑模式（与图标一致） */
      if (isWidget && !this.editing) {
        clearTimeout(this._lp);
        this._lp = setTimeout(() => this.enterEdit(), 550);
      }
      /* 鼠标显式捕获：拖拽过程中 pointermove 始终派发到本元素（触摸天然隐式捕获） */
      if (e.pointerType === 'mouse') { try { dragEl.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } }
      const startX = e.clientX, startY = e.clientY;
      const LIFT = isWidget ? 1.04 : 1.09; // 拖拽放大
      let dragging = false;
      let grabX = 0, grabY = 0;   // 指针在元素内的抓取偏移
      let tx = 0, ty = 0;         // 当前累计 translate
      let lastRx = -1e9, lastRy = -1e9; // 上次换位时指针位置（滞回基准）

      const applyT = () => { dragEl.style.transform = `translate(${tx}px, ${ty}px) scale(${LIFT})`; };

      const onMove = (ev) => {
        if (!this.editing) {
          /* 长按未完成时大幅移动 → 取消长按（iOS 行为） */
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 14) clearTimeout(this._lp);
          return;
        }
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > 10) {
          dragging = true;
          dragEl.classList.add('dragging');
          dragEl.style.animation = 'none'; // 拖拽中停止抖动
          dragEl.style.transition = 'none'; // 防残留过渡干扰跟手
          const r = dragEl.getBoundingClientRect();
          grabX = startX - r.left; grabY = startY - r.top;
          tx = ty = 0;
          applyT();
        }
        if (!dragging) return;
        /* 期望视觉左上角 = 指针 - 抓取偏移；逐帧增量校正：
           DOM 换位改变布局位置后，校正量自动把元素拉回指针下（不跳变） */
        const wantL = ev.clientX - grabX, wantT = ev.clientY - grabY;
        let r = dragEl.getBoundingClientRect();
        tx += wantL - r.left; ty += wantT - r.top;
        applyT();
        /* 换位滞回：上次换位后指针需再移动 ≥26px（避免相邻格反复换位闪烁） */
        if (Math.hypot(ev.clientX - lastRx, ev.clientY - lastRy) < 26) return;
        const target = this._nearestCell(dragEl, ev.clientX, ev.clientY);
        if (target && target !== dragEl) {
          const changed = this._reorder(dragEl, target, ev.clientX, ev.clientY);
          if (changed) { lastRx = ev.clientX; lastRy = ev.clientY; } /* 仅真换位才更新滞回基准（无操作不占用额度） */
          /* 换位后布局基点已变：立即再次校正，指针下零跳变 */
          r = dragEl.getBoundingClientRect();
          tx += wantL - r.left; ty += wantT - r.top;
          applyT();
        }
      };

      const onUp = () => {
        dragEl.removeEventListener('pointermove', onMove);
        dragEl.removeEventListener('pointerup', onUp);
        dragEl.removeEventListener('pointercancel', onUp);
        clearTimeout(this._lp);
        if (dragging) {
          /* 弹性回位：固化当前拖拽 transform → 过渡回 0（带回弹曲线） */
          dragEl.style.animation = 'none';
          dragEl.style.transition = 'none';
          applyT();
          void dragEl.offsetWidth; // 强制回流，确保起始态生效
          dragEl.style.transition = 'transform .38s cubic-bezier(.28,1.18,.4,1)';
          dragEl.style.transform = '';
          const finish = () => {
            dragEl.style.transition = '';
            dragEl.style.animation = ''; // 恢复抖动
            dragEl.classList.remove('dragging');
          };
          setTimeout(finish, 420); // 超时兜底
          dragEl.addEventListener('transitionend', function done(e) {
            /* 仅认元素自身 transform 过渡（子元素过渡冒泡不算） */
            if (e.target !== dragEl || e.propertyName !== 'transform') return;
            dragEl.removeEventListener('transitionend', done);
            finish();
          });
          this._persistLayout();
          haptic(6);
        }
      };
      dragEl.addEventListener('pointermove', onMove);
      dragEl.addEventListener('pointerup', onUp);
      dragEl.addEventListener('pointercancel', onUp);
    });
  },

  /* FLIP：容器内图标换位时，被挤开的图标从旧位置平滑滑到新位置
     skipEl = 正在拖拽的元素（其位置由指针跟随逻辑管理，不可被 FLIP 覆盖） */
  _withFlip(mutate, skipEl) {
    const cells = [];
    [this.grid, this.dock].forEach(c => {
      if (!c) return;
      c.querySelectorAll(':scope > .app-icon-cell, :scope > .home-widget').forEach(n => cells.push(n));
    });
    const before = new Map();
    cells.forEach(c => { const r = c.getBoundingClientRect(); before.set(c, { l: r.left, t: r.top }); });
    const changed = mutate();
    if (changed !== false) {
      cells.forEach(c => {
        if (c === skipEl) return; /* 拖拽元素不参与 FLIP（transform 由拖拽控制） */
        const b = before.get(c);
        const r = c.getBoundingClientRect();
        const dx = b.l - r.left, dy = b.t - r.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        /* 抖动动画的 transform 会盖掉内联 transform → FLIP 期间先暂停抖动 */
        c.style.animation = 'none';
        c.style.transition = 'none';
        c.style.transform = `translate(${dx}px, ${dy}px)`;
        void c.offsetWidth;
        requestAnimationFrame(() => {
          c.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
          c.style.transform = '';
          const restore = () => { c.style.transition = ''; c.style.animation = ''; };
          c.addEventListener('transitionend', function done(e) {
            /* 仅认元素自身 transform 过渡（子元素过渡冒泡不算） */
            if (e.target !== c || e.propertyName !== 'transform') return;
            c.removeEventListener('transitionend', done);
            restore();
          });
          setTimeout(restore, 340); // 超时兜底
        });
      });
    }
    return changed !== false;
  },

  /* 重排：同容器流式插入；跨容器插入/交换（dock 满员时互换；小组件仅限 grid）
     返回 true=DOM 真实变化（用于拖拽滞回基准更新） */
  _reorder(dragEl, target, px, py) {
    return this._withFlip(() => this._reorderNow(dragEl, target, px, py), dragEl);
  },

  _reorderNow(dragEl, target, px, py) {
    const selfIn = dragEl.parentElement;
    const targetIn = target.parentElement;
    if (selfIn === targetIn) {
      /* 同容器：指针越过哪个格子的中心，就插入其前后（行优先阅读序）。
         以指针位置而非索引比较 → 插入后指针仍在原相对位置，不会来回翻转 */
      const kids = [...selfIn.children].filter(c => c !== dragEl
        && (c.classList.contains('app-icon-cell') || c === this.widget));
      let k = kids.length;
      for (let i = 0; i < kids.length; i++) {
        const kr = kids[i].getBoundingClientRect();
        const sameRow = Math.abs((kr.top + kr.height / 2) - py) < kr.height * 0.6;
        const before = sameRow ? (px < kr.left + kr.width / 2) : (py < kr.top + kr.height / 2);
        if (before) { k = i; break; }
      }
      const ref = k < kids.length ? kids[k] : null;
      if (dragEl.nextSibling === ref) return false; /* 已在目标位：无操作 */
      selfIn.insertBefore(dragEl, ref);
      return true;
    }
    /* 小组件不跨容器（不可拖入 dock） */
    if (dragEl === this.widget) return false;
    if (targetIn === this.dock) {
      const dockIcons = this.dock.querySelectorAll('.app-icon-cell').length;
      if (dockIcons < 4) {
        if (dragEl.nextElementSibling === target && dragEl.parentElement === this.dock) return false;
        this.dock.insertBefore(dragEl, target); // 有空位：插入
      } else {
        swapNodes(dragEl, target); // 满员：互换（对方图标落到 grid）
      }
      return true;
    }
    if (targetIn === this.grid) {
      if (target === this.widget) {
        /* dock 图标拖到小组件位：图标插入小组件前（小组件留在 grid，不进 dock） */
        if (selfIn === this.dock) this.grid.insertBefore(dragEl, this.widget);
        else swapNodes(dragEl, this.widget); // grid 图标与小组件互换
      } else {
        this.grid.insertBefore(dragEl, target);
      }
      return true;
    }
    return false;
  },

  /* 全屏最近可放置目标（含小组件与跨容器，排除自身） */
  _nearestCell(dragEl, x, y, exclude) {
    let best = null, bestD = Infinity;
    const pools = dragEl === this.widget ? [this.grid] : [this.grid, this.dock];
    for (const container of pools) {
      for (const c of container.children) {
        if (c === dragEl || (c !== this.widget && !c.classList.contains('app-icon-cell'))) continue;
        const r = c.getBoundingClientRect();
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    return bestD < 150 ? best : null;
  },

  _persistLayout() {
    /* grid 子元素 = 图标 + 小组件（记录小组件插入位）；dock 仅图标 */
    const gridKids = [...this.grid.children].filter(n => n.classList.contains('app-icon-cell') || n === this.widget);
    const wi = gridKids.indexOf(this.widget);
    this.layout.widgetIndex = wi >= 0 ? wi : 0;
    this.layout.grid = gridKids.filter(n => n !== this.widget).map(c => c.dataset.app);
    this.layout.dock = [...this.dock.querySelectorAll('.app-icon-cell')].map(c => c.dataset.app);
    Settings.setQuiet('homeLayout', this.layout);
  },

  refreshLiveIcons() {
    if (this.editing) return; // 编辑模式下刷新会清掉删除角标
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

  async loadWeather() {
    try {
      const data = await WeatherEngine.fetch();
      this.renderWeather(data);
    } catch (e) {
      const w = this.widget;
      const cond = w.querySelector('.hw-cond');
      const city = w.querySelector('.hw-city');
      if (cond) cond.textContent = '暂无数据 · 点击重试';
      if (city) city.textContent = '天气';
    }
    Bus.on('weather:updated', (data) => this.renderWeather(data));
  },

  renderWeather(data) {
    const w = this.widget;
    if (!w || !w.querySelector('.hw-t')) return;
    if (!data || !data.current || !Array.isArray(data.daily) || !data.daily[0]) return; // 数据不完整：保留骨架不炸
    try {
      const city = WeatherEngine.city || { city: '—' };
      const U = (c) => WeatherEngine.toDisplay(c);
      const cur = data.current;
      const today = data.daily[0];
      w.querySelector('.hw-t').textContent = U(cur.temp);
      w.querySelector('.hw-cond').textContent = data.current.code != null ? wText(data.current.code) : '';
      w.querySelector('.hw-icon').innerHTML = wIcon(cur.code, !cur.isDay);
      w.querySelector('.hw-air').textContent = `湿度 ${cur.humidity ?? '--'}%`;
      w.querySelector('.hw-hilo').textContent = `${U(today.max)}° ~ ${U(today.min)}°`;
      w.querySelector('.hw-city').textContent = (city.city || '').slice(0, 6);
    } catch (e) { /* 单字段失败不影响其他字段 */ }
  },

  updateIsland() { /* 由 island.js 处理 */ },

  show() { document.getElementById('home').classList.add('show'); },
  hide() { document.getElementById('home').classList.remove('show'); },
};
