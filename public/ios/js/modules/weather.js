/* ============ 天气 ============ */

import { el, Bus } from '../core/utils.js';
import { Settings } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, loading, escapeHtml } from '../core/ui.js';
import { Apps as AppIcons, wIcon, wText } from '../core/icons.js';
import { WeatherEngine } from '../api/weather.js';

let nav = null;
let root = null;
let ctxRef = null;

/* 头部返回键（深色背景上的白色圆钮） */
const WT_BACK_BTN = '<button class="wt-back" id="wt-back" aria-label="返回主屏幕"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4.5l-7.5 7.5 7.5 7.5"/></svg></button>';
function wireBack(scope) {
  const b = scope.querySelector('#wt-back');
  if (b) b.onclick = () => { ctxRef && ctxRef.close(); };
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
        <div class="wt-header">
          ${WT_BACK_BTN}
          <div class="wt-city" id="wt-city">…</div>
          <div class="wt-refresh" id="wt-refresh"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V9H15"/></svg></div>
          <div class="wt-search" id="wt-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg></div>
        </div>
        <div class="wt-loading"><div class="spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div></div>`;
      body.querySelector('#wt-refresh').onclick = () => renderWeather(body, true);
      body.querySelector('#wt-search').onclick = openCitySearch;
      wireBack(body);
      renderWeather(body);
    },
  });
  nav.setRoot(page);
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
      <div class="wt-header">
        ${WT_BACK_BTN}
        <div class="wt-city">${escapeHtml(city.city || '天气')}</div>
        <div class="wt-refresh" id="wt-refresh"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V9H15"/></svg></div>
        <div class="wt-search" id="wt-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg></div>
      </div>
      <div class="wt-error">
        <div>☹️</div><div>天气数据获取失败</div><div class="wt-err-detail">${escapeHtml(e.message || '网络不可用')}</div>
        <button class="btn-fill" id="wt-retry">重试</button>
      </div>`;
    target.querySelector('#wt-retry').onclick = () => renderMain();
    target.querySelector('#wt-refresh')?.addEventListener('click', () => renderMain());
    target.querySelector('#wt-search')?.addEventListener('click', openCitySearch);
    wireBack(target);
  }
}

function buildView(target, data, city) {
  const U = (c) => WeatherEngine.toDisplay(c);
  const cur = data.current;
  const today = data.daily[0];

  const windDirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const windDir = windDirs[Math.round(((cur.windDir || 0) % 360) / 45) % 8];

  target.innerHTML = `
    <div class="wt-header">
      ${WT_BACK_BTN}
      <div class="wt-city" id="wt-city">${escapeHtml(city.city || '—')}</div>
      <div class="wt-refresh" id="wt-refresh"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V9H15"/></svg></div>
      <div class="wt-search" id="wt-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg></div>
    </div>
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

  target.querySelector('#wt-refresh').onclick = () => renderWeather(target, true);
  target.querySelector('#wt-search').onclick = openCitySearch;
  wireBack(target);
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

/* ---------- 城市搜索 ---------- */
function openCitySearch() {
  const page = nav.makePage({
    title: '搜索城市', back: '天气',
    build(body) {
      body.classList.add('pad');
      body.innerHTML = `
        <div class="searchbar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
          <input placeholder="输入城市名，如：上海" id="cs-input">
        </div>
        <div class="inset-group">
          <div class="inset-card">
            <div class="row" id="cs-locate">
              <div class="row-icon" style="background:var(--accent)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M20.5 10.5c0 6.5-8.5 12-8.5 12s-8.5-5.5-8.5-12a8.5 8.5 0 0 1 17 0z"/><circle cx="12" cy="10.5" r="3"/></svg></div>
              <div class="row-label">使用当前定位</div>
              <div class="row-val">GPS</div>
            </div>
          </div>
        </div>
        <div id="cs-results"></div>`;

      const input = body.querySelector('#cs-input');
      const results = body.querySelector('#cs-results');
      let timer;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (!q) { results.innerHTML = ''; return; }
        timer = setTimeout(async () => {
          results.innerHTML = '<div style="display:flex;justify-content:center;padding:20px"><div class="spinner"></div></div>';
          try {
            const list = await WeatherEngine.searchCity(q);
            if (!list.length) { results.innerHTML = '<div class="empty-state" style="padding:30px"><div>没有找到城市</div></div>'; return; }
            results.innerHTML = `<div class="inset-group"><div class="inset-card">${list.map((c, i) => `
              <div class="row" data-i="${i}"><div class="row-label">
                <div style="font-size:16.5px">${escapeHtml(c.city)}</div>
                <div style="font-size:12.5px;color:var(--text-2)">${escapeHtml([c.admin, c.country].filter(Boolean).join(' · '))}</div>
              </div><div class="row-val tappable">切换</div></div>`).join('')}</div></div>`;
            results.querySelectorAll('[data-i]').forEach(r => {
              r.onclick = async () => {
                const c = list[+r.dataset.i];
                await WeatherEngine.setCity(c);
                toast('已切换到 ' + c.city);
                nav.pop();
                renderMain();
              };
            });
          } catch (e) {
            results.innerHTML = `<div class="empty-state" style="padding:30px"><div>搜索失败：${escapeHtml(e.message || '')}</div></div>`;
          }
        }, 400);
      });

      body.querySelector('#cs-locate').onclick = async () => {
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
