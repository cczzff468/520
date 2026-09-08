/* ============ 天气：左上角 + → 城市管理（搜索添加/长按删除），城市名居中 ============ */

import { el, Bus, haptic } from '../core/utils.js';
import { Settings } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, loading, escapeHtml, confirmDialog } from '../core/ui.js';
import { Apps as AppIcons, wIcon, wText } from '../core/icons.js';
import { WeatherEngine } from '../api/weather.js';

let nav = null;
let root = null;
let ctxRef = null;

/* 头部：左上返回键 · 居中城市名 · 右侧[城市管理+刷新]
   返回主屏：左上返回键（也可底部横杠上滑关闭） */
const BACK_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4.5l-7.5 7.5 7.5 7.5"/></svg>';
const PLUS_SVG = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const REFRESH_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V9H15"/></svg>';

function headerHTML(cityName) {
  return `
    <div class="wt-header">
      <button class="wt-back" id="wt-back" data-own-back aria-label="返回主屏">${BACK_SVG}</button>
      <div class="wt-city" id="wt-city">${escapeHtml(cityName || '…')}</div>
      <div class="wt-right-group">
        <button class="wt-plus" id="wt-plus" aria-label="城市管理">${PLUS_SVG}</button>
        <button class="wt-refresh" id="wt-refresh" aria-label="刷新">${REFRESH_SVG}</button>
      </div>
    </div>`;
}

function wireHeader(scope) {
  const back = scope.querySelector('#wt-back');
  if (back) back.onclick = () => { haptic(6); ctxRef && ctxRef.close(); };
  const plus = scope.querySelector('#wt-plus');
  if (plus) plus.onclick = () => openCityManage();
  const rf = scope.querySelector('#wt-refresh');
  if (rf) rf.onclick = () => { haptic(6); renderMain(); };
}

export default {
  id: 'weather',
  name: '天气',
  icon: AppIcons.weather,
  sbStyle: 'dark',

  mount(rootEl, ctx) {
    root = rootEl; ctxRef = ctx;
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);
    renderMain();
  },

  unmount() { },
};

async function renderMain() {
  const page = nav.makePage({
    title: '天气',
    noNavbar: true,
    className: 'weather-page',
    build(body, pageEl) {
      pageEl.classList.add('weather-page');
      body.classList.add('weather-body');
      body.innerHTML = `
        ${headerHTML()}
        <div class="wt-loading"><div class="spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div></div>`;
      wireHeader(body);
      renderWeather(body);
    },
  });
  nav.resetToRoot(page);
}

async function renderWeather(body, force = false) {
  let target = body;
  if (!body.querySelector('.wt-loading') && !body.classList.contains('weather-body')) {
    target = document.querySelector('.weather-body');
  }
  if (!target) return;
  const city = await WeatherEngine.getCity();
  const cityEl = target.querySelector('#wt-city');
  if (cityEl) cityEl.textContent = (city.city || '—') + '';

  const loadEl = target.querySelector('.wt-loading');
  let data = null;
  try {
    data = await WeatherEngine.fetch(force);
    buildView(target, data, city);
  } catch (e) {
    target.innerHTML = `
      ${headerHTML(city.city || '天气')}
      <div class="wt-error">
        <div>☹️</div><div>天气数据获取失败</div><div class="wt-err-detail">${escapeHtml(e.message || '网络不可用')}</div>
        <button class="btn-fill" id="wt-retry">重试</button>
      </div>`;
    wireHeader(target);
    target.querySelector('#wt-retry').onclick = () => renderMain();
  }
}

function buildView(target, data, city) {
  const U = (c) => WeatherEngine.toDisplay(c);
  const cur = data.current;
  const today = data.daily[0];

  const windDirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const windDir = windDirs[Math.round(((cur.windDir || 0) % 360) / 45) % 8];

  target.innerHTML = `
    ${headerHTML(city.city || '—')}
    <div class="wt-now">
      <div class="wt-big-icon">${wIcon(cur.code, !cur.isDay)}</div>
      <div class="wt-temp num">${U(cur.temp)}°</div>
      <div class="wt-cond">${wText(cur.code)}</div>
      <div class="wt-hilo">最高 ${U(today.max)}° 最低 ${U(today.min)}°</div>
    </div>

    <div class="wt-card">
      <div class="wt-card-title">
        <span>${wText(cur.code)} · 24小时预报</span>
      </div>
      <div class="wt-hours" id="wt-hours"></div>
      <svg class="wt-line" id="wt-line" viewBox="0 0 600 70" preserveAspectRatio="none"></svg>
    </div>

    <div class="wt-card">
      <div class="wt-card-title"><span>未来 7 天</span></div>
      <div class="wt-daily" id="wt-daily"></div>
    </div>

    <div class="wt-grid">
      ${wtTile('体感温度', U(cur.feels) + '°', '🌡️')}
      ${wtTile('湿度', cur.humidity + '%', '💧')}
      ${wtTile('风速', (cur.wind || 0).toFixed(1) + ' m/s ' + windDir, '🌬️')}
      ${wtTile('紫外线指数', (today.uv ?? 0).toFixed(1), '☀️')}
      ${wtTile('能见度', ((data.hourly[0]?.vis ?? 10)).toFixed(1) + ' km', '👁️')}
      ${wtTile('气压', Math.round(cur.pressure || 1013) + ' hPa', '⚖️')}
      ${wtTile('云量', (cur.cloud ?? 0) + '%', '☁️')}
      ${wtTile('日出', (today.sunrise || '').slice(11, 16), '🌅')}
    </div>
    <div class="wt-footer">数据来源 Open-Meteo · 更新于 ${new Date(WeatherEngine.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>`;

  wireHeader(target);
  const hours = target.querySelector('#wt-hours');
  data.hourly.slice(0, 24).forEach((h, i) => {
    const d = new Date(h.time);
    const item = el('div', 'wt-hour');
    item.innerHTML = `
      <div class="wh-time">${i === 0 ? '现在' : `${d.getHours()}时`}</div>
      <div class="wh-icon">${wIcon(h.code)}</div>
      <div class="wh-temp num">${U(h.temp)}°</div>`;
    hours.appendChild(item);
  });

  /* 温度折线 SVG */
  const temps = data.hourly.slice(0, 24).map(h => U(h.temp));
  drawTempLine(target.querySelector('#wt-line'), temps);

  /* 7天 */
  const daily = target.querySelector('#wt-daily');
  const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const min = Math.min(...data.daily.map(d => d.min));
  const max = Math.max(...data.daily.map(d => d.max));
  data.daily.forEach((d, i) => {
    const dd = new Date(d.date + 'T00:00:00');
    const row = el('div', 'wt-day');
    const left = ((d.min - min) / (max - min || 1)) * 100;
    const width = Math.max(12, ((d.max - d.min) / (max - min || 1)) * 100);
    row.innerHTML = `
      <span class="wd-name">${i === 0 ? '今天' : weekNames[dd.getDay()]}</span>
      <span class="wd-icon">${wIcon(d.code)}</span>
      <span class="wd-low num">${U(d.min)}°</span>
      <span class="wd-bar"><i style="left:${left}%;width:${width}%"></i></span>
      <span class="wd-high num">${U(d.max)}°</span>`;
    daily.appendChild(row);
  });
}

function wtTile(label, value, emoji) {
  return `<div class="wt-tile"><div class="wtt-label">${label}</div><div class="wtt-value">${value}</div></div>`;
}

function drawTempLine(svg, temps) {
  if (!svg || !temps.length) return;
  const w = 600, h = 70, pad = 14;
  const min = Math.min(...temps), max = Math.max(...temps);
  const stepX = (w - pad * 2) / (temps.length - 1 || 1);
  const pts = temps.map((t, i) => {
    const x = pad + i * stepX;
    const y = h - 12 - ((t - min) / (max - min || 1)) * (h - 30);
    return [x, y];
  });
  let path = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    const mx = (px + cx) / 2;
    path += ` C ${mx} ${py}, ${mx} ${cy}, ${cx.toFixed(1)} ${cy.toFixed(1)}`;
  }
  const area = path + ` L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0]} ${h} Z`;
  svg.innerHTML = `
    <defs>
      <linearGradient id="wlg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".28"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#wlg)"/>
    <path d="${path}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".92"/>`;
}

/* ============ 城市管理：截图样式（全幅天气背景卡片） ============ */

/* 卡片背景：按天气状况 + 昼夜生成渐变 */
function cityCardBg(code, isDay) {
  if (isDay === false) return 'linear-gradient(135deg,#2A3B5E 0%,#141E33 100%)';   // 夜
  if (code == null) return 'linear-gradient(135deg,#5A8EC8 0%,#9DBBDA 100%)';      // 未知
  if (code === 0) return 'linear-gradient(135deg,#3E8FE0 0%,#7CC0F0 100%)';        // 晴
  if (code === 1) return 'linear-gradient(135deg,#5A8EC8 0%,#A4C4E0 100%)';        // 多云
  if (code === 2) return 'linear-gradient(135deg,#7595B5 0%,#B0C4D8 100%)';        // 局部多云
  if (code === 3) return 'linear-gradient(135deg,#8E9BAD 0%,#5F6B7C 100%)';        // 阴
  if (code >= 45 && code <= 48) return 'linear-gradient(135deg,#9AA5B1 0%,#6E7B88 100%)'; // 雾
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'linear-gradient(135deg,#3A5372 0%,#232F42 100%)'; // 雨
  if (code >= 71 && code <= 77) return 'linear-gradient(135deg,#9FB2C6 0%,#6E86A0 100%)'; // 雪
  if (code >= 95) return 'linear-gradient(135deg,#3D4557 0%,#1F2532 100%)';        // 雷暴
  return 'linear-gradient(135deg,#5A8EC8 0%,#A4C4E0 100%)';
}

function openCityManage() {
  const page = nav.makePage({
    title: '城市管理',
    chevBack: true,
    right: [navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => {
      const input = root.querySelector('#cm-input');
      if (input) { input.focus(); }
    })],
    build(body) {
      body.innerHTML = `
        <div class="cm-searchbar">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
          <input placeholder="搜索城市或景区" id="cm-input">
        </div>
        <div id="cm-results"></div>
        <div id="cm-cards"></div>
        <div class="inset-group" style="margin-top:4px"><div class="inset-card">
          <div class="row" id="cm-locate">
            <div class="row-icon" style="background:var(--accent)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M20.5 10.5c0 6.5-8.5 12-8.5 12s-8.5-5.5-8.5-12a8.5 8.5 0 0 1 17 0z"/><circle cx="12" cy="10.5" r="3"/></svg></div>
            <div class="row-label">使用当前定位</div>
            <div class="row-val">GPS</div>
          </div>
        </div></div>
        <div class="cm-tip">点击卡片切换城市 · 长按卡片 0.5 秒删除</div>`;

      renderCityCards(body);

      /* 搜索添加 */
      const input = body.querySelector('#cm-input');
      const results = body.querySelector('#cm-results');
      let timer;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (!q) { results.innerHTML = ''; return; }
        timer = setTimeout(async () => {
          results.innerHTML = '<div style="display:flex;justify-content:center;padding:20px"><div class="spinner"></div></div>';
          try {
            const list = await WeatherEngine.searchCity(q);
            if (!list.length) { results.innerHTML = '<div class="empty-state" style="padding:24px"><div>没有找到城市</div></div>'; return; }
            results.innerHTML = `<div class="inset-group"><div class="inset-card">${list.map((c, i) => `
              <div class="row" data-i="${i}"><div class="row-label">
                <div style="font-size:16.5px">${escapeHtml(c.city)}</div>
                <div style="font-size:12.5px;color:var(--text-2)">${escapeHtml([c.admin, c.country].filter(Boolean).join(' · '))}</div>
              </div><div class="row-val tappable">添加</div></div>`).join('')}</div></div>`;
            results.querySelectorAll('[data-i]').forEach(r => {
              r.onclick = async () => {
                const c = list[+r.dataset.i];
                await WeatherEngine.setCity(c);
                toast('已添加并切换到 ' + c.city);
                nav.pop();
                renderMain();
              };
            });
          } catch (e) {
            results.innerHTML = `<div class="empty-state" style="padding:24px"><div>搜索失败：${escapeHtml(e.message || '')}</div></div>`;
          }
        }, 400);
      });

      /* 定位 */
      body.querySelector('#cm-locate').onclick = async () => {
        const ld = loading('正在定位…');
        try {
          const c = await WeatherEngine.locate();
          await WeatherEngine.setCity(c);
          ld();
          toast('已定位到 ' + c.city);
          nav.pop();
          renderMain();
        } catch (e) {
          ld();
          toast('定位失败：' + (e.message || '未授权'));
        }
      };
    },
  });
  nav.push(page);
}

/* 城市天气卡片列表（截图样式） */
async function renderCityCards(body) {
  const wrap = body.querySelector('#cm-cards');
  if (!wrap) return;
  const cities = await WeatherEngine.getCities();
  const cur = await WeatherEngine.getCity();
  /* 当前城市排最前 */
  cities.sort((a, b) =>
    (WeatherEngine._sameCity(b, cur) ? 1 : 0) - (WeatherEngine._sameCity(a, cur) ? 1 : 0));

  wrap.innerHTML = '';
  if (!cities.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:40px 20px"><div class="es-title">暂无城市</div><div>上方搜索添加</div></div>`;
    return;
  }

  cities.forEach(c => {
    const card = el('div', 'cm-card');
    card.dataset.city = c.city;
    card.innerHTML = `
      <div class="cmc-left">
        <div class="cmc-city">${escapeHtml(c.city)}</div>
        <div class="cmc-detail">${escapeHtml([c.admin, c.country].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="cmc-temp num">—</div>`;
    wrap.appendChild(card);

    /* 点击 → 切换城市 */
    card.addEventListener('click', async () => {
      if (card._longFired) { card._longFired = false; return; }
      if (WeatherEngine._sameCity(c, cur)) return;
      haptic(6);
      await WeatherEngine.setCity(c);
      toast('已切换到 ' + c.city);
      nav.pop();
      renderMain();
    });

    /* 长按 0.5 秒 → 删除确认（移动超 12px 视为滑动，取消） */
    let t = null;
    let sx = 0, sy = 0;
    card.addEventListener('pointerdown', (e) => {
      card._longFired = false;
      sx = e.clientX; sy = e.clientY;
      t = setTimeout(async () => {
        card._longFired = true;
        haptic(10);
        const ok = await confirmDialog('删除城市', `将「${c.city}」从城市列表移除？`, { okText: '删除', danger: true });
        if (!ok) return;
        const remaining = await WeatherEngine.removeCity(c);
        /* 删除的是当前城市 → 自动切到列表首个 */
        if (WeatherEngine._sameCity(c, cur)) {
          if (remaining.length) {
            await WeatherEngine.setCity(remaining[0]);
            renderMain(); // 底层根页换城市，管理页保持在最上
            nav.pop();
          } else {
            toast('至少保留一个城市');
            renderCityCards(body);
            return;
          }
        }
        toast('已删除「' + c.city + '」');
        renderCityCards(body);
      }, 520);
    });
    card.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) clearTimeout(t);
    }, { passive: true });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      card.addEventListener(ev, () => clearTimeout(t), { passive: true }));
    card.addEventListener('contextmenu', (e) => e.preventDefault());

    /* 异步填充天气（当前城市优先复用主数据） */
    fillCardWeather(card, c, cur);
  });
}

async function fillCardWeather(card, c, cur) {
  let w = null;
  if (WeatherEngine._sameCity(c, cur) && WeatherEngine.data) {
    const d = WeatherEngine.data;
    w = { temp: d.current.temp, code: d.current.code, isDay: d.current.isDay, max: d.daily[0]?.max, min: d.daily[0]?.min };
  } else {
    w = await WeatherEngine.fetchCurrent(c);
  }
  if (!w || !card.isConnected) return;
  const U = (x) => WeatherEngine.toDisplay(x);
  card.style.background = cityCardBg(w.code, w.isDay);
  const detail = [];
  if (w.code != null) detail.push(wText(w.code));
  if (w.min != null && w.max != null) detail.push(`${U(w.min)}~${U(w.max)}°`);
  if (detail.length) card.querySelector('.cmc-detail').textContent = detail.join(' ');
  if (w.temp != null) card.querySelector('.cmc-temp').textContent = U(w.temp) + '°';
}
