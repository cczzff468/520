/* ============ 设置 ============ */

import { el, uid, Bus, fmtBytes, downloadJSON, haptic } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, dialog, confirmDialog, promptDialog, escapeHtml, escapeAttr, loading, sheet } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';
import { applyTheme } from '../core/theme.js';
import { testConnection, testImageConnection, DEFAULT_API, DEFAULT_IMAGE_API, fetchModels, API_PRESETS, IMAGE_PRESETS, detectProvider, detectImageProvider, normalizeChatUrl } from '../api/chat.js';
import { WeatherEngine } from '../api/weather.js';

let root = null;
let nav = null;

const chevron = '<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>';
/* API 页内联图标 */
const BOOKMARK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.2 3.5h11.6c.99 0 1.8.78 1.8 1.74v15.02c0 .78-.86 1.26-1.54.86L12 17.1l-6.06 4.02c-.68.4-1.54-.08-1.54-.86V5.24c0-.96.81-1.74 1.8-1.74z"/></svg>';
const PLUS_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const LINK_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M10.6 13.4a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.7 1.7"/><path d="M13.4 10.6a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.7-1.7"/></svg>';
const EYE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.2"/></svg>';
const X_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const MORE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>';
const rowIconHTML = (color, path) => `<div class="row-icon" style="background:${color}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg></div>`;

/* Apple ID 账户头像（渐变底 + 人形剪影，仿 iCloud 账户卡） */
const PERSON_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12.2a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8zm0 2.3c-4.2 0-7.8 2.6-7.8 5.9 0 1 .7 1.6 1.9 1.6h11.8c1.2 0 1.9-.6 1.9-1.6 0-3.3-3.6-5.9-7.8-5.9z"/></svg>';
const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';
/* Apple 标志（页脚水印） */
const APPLE_MARK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" opacity=".45"><path d="M17.05 12.54c-.02-2.2 1.79-3.26 1.87-3.31-1.02-1.49-2.61-1.69-3.17-1.72-1.35-.14-2.63.79-3.31.79-.69 0-1.74-.77-2.86-.75-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.72 1.05 1.58 2.22 2.71 2.18 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.69.7 2.84.68 1.17-.02 1.92-1.07 2.64-2.12.83-1.22 1.17-2.4 1.19-2.46-.03-.01-2.29-.88-2.31-3.53zM14.31 5.66c.6-.73 1-1.74.89-2.75-.86.04-1.91.57-2.53 1.3-.55.64-1.03 1.66-.9 2.65.96.07 1.94-.49 2.54-1.2z"/></svg>';

/* iCloud 小云图标（账户卡副标题前缀） */
const ICLOUD_MINI = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6.5 6.5 0 0 0 5.2 11.5 4 4 0 0 0 6 19.5h11.5z"/></svg>';

const ICONS = {
  info: rowIconHTML('#8E8E93', '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>'),
  lang: rowIconHTML('#8E8E93', '<path d="M3 5.5h8M7 3.5v2M9.5 5.5c-.5 4-3 7.5-6.5 9.5M5 10.5c1 2 3 3.5 5 4.5M13.5 20.5l4-10 4 10M15 17h5"/>'),
  theme: rowIconHTML('#007AFF', '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>'),
  wall: rowIconHTML('#34AADC', '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 15.5l-4.5-4.5-7 7"/>'),
  lockWall: rowIconHTML('#5BC0EB', '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M8 4V2.5M16 4V2.5M3 9h18"/>'),
  wrench: rowIconHTML('#FF9500', '<path d="M14.5 6.5a4.5 4.5 0 0 0-6.2 5.5L2.5 17.8l3.7 3.7 5.8-5.8a4.5 4.5 0 0 0 5.5-6.2l-3 3-2.8-.7-.7-2.8z"/>'),
  notify: rowIconHTML('#FF3B30', '<path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>'),
  camera: rowIconHTML('#8E8E93', '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
  location: rowIconHTML('#007AFF', '<path d="M20.5 10.5c0 6.5-8.5 12-8.5 12s-8.5-5.5-8.5-12a8.5 8.5 0 0 1 17 0z"/><circle cx="12" cy="10.5" r="3"/>'),
  storage: rowIconHTML('#8E8E93', '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.5M7 16.5h.5"/>'),
  upload: rowIconHTML('#34C759', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 14l5-5 5 5M12 9v12"/>'),
  download: rowIconHTML('#34C759', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  weather: rowIconHTML('#007AFF', '<circle cx="12" cy="9" r="4"/><path d="M12 2.5v2M12 16v2M5 9H3M21 9h-2M6.4 3.6l1.4 1.4M16.2 13.2l1.4 1.4M6.4 14.4l1.4-1.4M16.2 4.8l1.4-1.4M9 20h6M11 22h2"/>'),
  city: rowIconHTML('#007AFF', '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.5M9 13h.5M9 17h.5M14 9h1M14 13h1M14 17h1"/>'),
  cloud: rowIconHTML('#007AFF', '<path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6.5 6.5 0 0 0 5.2 11.5 4 4 0 0 0 6 19.5h11.5z"/>'),
  media: rowIconHTML('#8E8E93', '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>'),
  server: rowIconHTML('#007AFF', '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.5M7 17h.5"/>'),
  cpu: rowIconHTML('#5E5CE6', '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5v2M15 2.5v2M9 19.5v2M15 19.5v2M2.5 9h2M2.5 15h2M19.5 9h2M19.5 15h2"/>'),
  eye: rowIconHTML('#00A3A1', '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.2"/>'),
  hapticIcon: rowIconHTML('#FF9500', '<rect x="8" y="2.5" width="8" height="19" rx="4"/><path d="M12 7.5v.5M12 11.5v.5M12 15.5v.5"/>'),
  lockPass: rowIconHTML('#007AFF', '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  lockKey: rowIconHTML('#5E5CE6', '<rect x="3" y="10" width="9" height="11" rx="2"/><path d="M12 10V6a3.5 3.5 0 0 1 7 0v4M6.5 14.5v2"/>'),
};

export default {
  id: 'settings',
  name: '设置',
  icon: AppIcons.settings,
  sbStyle: 'light',

  mount(rootEl, ctx, opts) {
    root = rootEl;
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    const page = nav.makePage({
      title: '设置',
      large: true,
      build(body) {
        body.innerHTML = `
          ${searchBarHTML()}
          ${accountCard()}
          ${group1()}
          ${groupPasscode()}
          ${groupWallpaper()}
          ${groupAPI()}
          ${groupPrivacy()}
          ${groupStorage()}
          ${groupWeather()}
          ${footerHTML()}`;
        bindGroups(body);
        bindSearch(body);
      },
    });
    nav.setRoot(page);

    // 打开时直接跳 API 配置（api=聊天API / imageapi=图像API）
    const sect = (ctx && ctx.section) || (opts && opts.section);
    if (sect === 'api' || sect === 'imageapi') {
      setTimeout(() => openApiPage(sect === 'imageapi' ? 1 : 0), 250);
    }
  },

  unmount() { },
};

/* ---------- Apple ID 账户卡（仿 iOS 设置顶部） ---------- */
function accountCard() {
  return `
    <div class="inset-group st-account-group">
      <div class="inset-card">
        <div class="row st-account-row" data-nav="account">
          <div class="st-avatar">${PERSON_SVG}</div>
          <div class="row-label">
            <div class="st-account-name" id="st-account-name">Apple ID</div>
            <div class="st-account-sub">${ICLOUD_MINI}iCloud · 媒体与购买项目</div>
          </div>
          <div class="row-chevron">${chevron}</div>
        </div>
      </div>
    </div>`;
}

/* ---------- 搜索栏（支持实时过滤设置项） ---------- */
function searchBarHTML() {
  return `
    <div class="searchbar st-search">
      ${SEARCH_SVG}
      <input id="st-search" placeholder="搜索" autocomplete="off" enterkeyhint="search">
    </div>`;
}

function footerHTML() {
  return `
    <div class="st-footer">
      <div class="st-footer-mark">${APPLE_MARK}</div>
      <div>AppleAI Web 1.0</div>
      <div>纯前端 · 数据仅存于本机 IndexedDB</div>
    </div>`;
}

/* ---------- 分组 ---------- */
function group1() {
  return `
    <div class="inset-group">
      <div class="inset-card">
        <div class="row" data-nav="theme">${ICONS.theme}<div class="row-label">外观</div><div class="row-val" id="st-theme-val">自动</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-nav="lang">${ICONS.lang}<div class="row-label">语言</div><div class="row-val">简体中文</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-nav="about">${ICONS.info}<div class="row-label">关于本机</div><div class="row-val">AppleAI Web 1.0</div><div class="row-chevron">${chevron}</div></div>
      </div>
    </div>`;
}

/* ---------- 锁屏密码（安全分组） ---------- */
function groupPasscode() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">安全</div>
      <div class="inset-card">
        <div class="row" id="st-pass-sw-row">${ICONS.lockPass}<div class="row-label">锁屏密码</div><div class="switch" id="st-pass-sw"></div></div>
        <div class="row" id="st-pass-change-row">${ICONS.lockKey}<div class="row-label">更改密码</div><div class="row-val" id="st-pass-val">未设置</div><div class="row-chevron">${chevron}</div></div>
      </div>
    </div>`;
}

function groupWallpaper() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">壁纸</div>
      <div class="inset-card">
        <div class="row" data-app="themes">${ICONS.wall}<div class="row-label">主屏幕壁纸</div><div class="row-val">点按更换</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-app="themes">${ICONS.lockWall}<div class="row-label">锁屏壁纸</div><div class="row-val">点按更换</div><div class="row-chevron">${chevron}</div></div>
      </div>
    </div>`;
}

function groupAPI() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">API 配置</div>
      <div class="inset-card">
        <div class="row" data-nav="api">${ICONS.wrench}<div class="row-label">AI 聊天 API</div><div class="row-val" id="st-api-val">内置 AI</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-nav="imageapi">${ICONS.eye}<div class="row-label">图像识别 API</div><div class="row-val" id="st-imgapi-val">内置视觉</div><div class="row-chevron">${chevron}</div></div>
      </div>
    </div>`;
}

function groupPrivacy() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">通用</div>
      <div class="inset-card">
        <div class="row" id="st-haptic-row">${ICONS.hapticIcon}<div class="row-label">触感反馈</div><div class="switch" id="st-haptic-sw"></div></div>
      </div>
    </div>
    <div class="inset-group">
      <div class="inset-group-title">隐私与权限</div>
      <div class="inset-card">
        <div class="row" data-act="perm-notify">${ICONS.notify}<div class="row-label">通知权限</div><div class="switch" id="pv-notify-sw"></div></div>
        <div class="row" data-act="perm-camera">${ICONS.camera}<div class="row-label">相机权限</div><div class="row-val" id="pv-camera">检查中…</div></div>
        <div class="row" data-act="perm-location">${ICONS.location}<div class="row-label">地理位置权限</div><div class="row-val" id="pv-location">检查中…</div></div>
      </div>
    </div>`;
}

function groupStorage() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">存储</div>
      <div class="inset-card">
        <div class="row" data-nav="storage">${ICONS.storage}<div class="row-label">存储空间</div><div class="row-val" id="st-storage-val">—</div><div class="row-chevron">${chevron}</div></div>
        <div class="row" data-act="export">${ICONS.upload}<div class="row-label">导出全部数据 (JSON)</div></div>
        <div class="row" data-act="import">${ICONS.download}<div class="row-label">导入数据备份</div></div>
      </div>
    </div>`;
}

function groupWeather() {
  return `
    <div class="inset-group">
      <div class="inset-group-title">天气</div>
      <div class="inset-card">
        <div class="row" data-act="weather-city">${ICONS.city}<div class="row-label">城市</div><div class="row-val" id="st-city-val">—</div></div>
        <div class="row" data-act="weather-unit">${ICONS.weather}<div class="row-label">温度单位</div><div class="row-val" id="st-unit-val">摄氏度 °C</div></div>
      </div>
    </div>`;
}

/* ---------- 绑定 ---------- */
async function bindGroups(body) {
  const theme = await Settings.load('theme', 'auto');
  const themeVal = body.querySelector('#st-theme-val');
  if (themeVal) themeVal.textContent = { light: '浅色', dark: '深色', auto: '自动' }[theme] || '自动';

  const nickname = await Settings.load('nickname', '我');
  const nameNode = body.querySelector('#st-account-name');
  if (nameNode && nickname) nameNode.textContent = nickname;

  const apiCfg = await Settings.load('api', null);
  const apiVal = body.querySelector('#st-api-val');
  if (apiVal) apiVal.textContent = (apiCfg?.key && apiCfg?.url) ? (detectProvider(apiCfg.url) === '自定义' ? '自定义 API' : detectProvider(apiCfg.url)) : '内置 AI';

  const imgCfg = await Settings.load('imageApi', null);
  const imgVal = body.querySelector('#st-imgapi-val');
  if (imgVal) imgVal.textContent = (imgCfg?.key && imgCfg?.url) ? (detectImageProvider(imgCfg.url) === '自定义' ? '自定义 API' : detectImageProvider(imgCfg.url)) : '内置视觉';

  /* 触感反馈开关（全局，utils.haptic 尊重该设置） */
  const hapticOn = await Settings.load('haptics', true);
  const hapticSw = body.querySelector('#st-haptic-sw');
  if (hapticSw) {
    hapticSw.classList.toggle('on', !!hapticOn);
    const { setHaptics } = await import('../core/utils.js');
    setHaptics(!!hapticOn);
    body.querySelector('#st-haptic-row').onclick = async () => {
      const next = !hapticSw.classList.contains('on');
      hapticSw.classList.toggle('on', next);
      await Settings.set('haptics', next);
      setHaptics(next);
      if (next) haptic(8);
      toast('触感反馈已' + (next ? '开启' : '关闭'));
    };
  }

  /* 锁屏密码：开启 / 关闭 / 更换（密码盘复用 core/passcode.js） */
  const { Passcode } = await import('../core/passcode.js');
  const passSw = body.querySelector('#st-pass-sw');
  const passVal = body.querySelector('#st-pass-val');
  if (passSw) {
    const syncPassUI = () => {
      passSw.classList.toggle('on', Passcode.isOn());
      if (passVal) passVal.textContent = Passcode.isOn() ? '已开启' : Passcode.hasCode() ? '已关闭' : '未设置';
    };
    body.querySelector('#st-pass-sw-row').onclick = async () => {
      haptic(4);
      if (Passcode.isOn()) {
        /* 关闭需验证当前密码（iOS 行为） */
        const ok = await Passcode.ask({ title: '输入密码以关闭', verify: true });
        if (!ok) return;
        await Passcode.disable();
        syncPassUI();
        toast('锁屏密码已关闭');
      } else if (Passcode.hasCode()) {
        const ok = await Passcode.ask({ title: '输入密码以开启', verify: true });
        if (!ok) return;
        await Passcode.enable();
        syncPassUI();
        toast('锁屏密码已开启');
      } else {
        const code = await Passcode.ask({ title: '设置新密码', confirmSecond: true });
        if (!code) return;
        await Passcode.setCode(code);
        syncPassUI();
        toast('锁屏密码已开启');
      }
    };
    body.querySelector('#st-pass-change-row').onclick = async () => {
      haptic(4);
      if (Passcode.hasCode()) {
        const ok = await Passcode.ask({ title: '输入旧密码', verify: true });
        if (!ok) return;
      }
      const code = await Passcode.ask({ title: '设置新密码', confirmSecond: true });
      if (!code) return;
      await Passcode.setCode(code);
      syncPassUI();
      toast('密码已设置并开启');
    };
    syncPassUI();
  }

  const city = await WeatherEngine.getCity();
  const cityVal = body.querySelector('#st-city-val');
  if (cityVal) cityVal.textContent = city.city || '北京市';

  const unit = Settings.get('weatherUnit', 'c');
  const unitVal = body.querySelector('#st-unit-val');
  if (unitVal) unitVal.textContent = unit === 'c' ? '摄氏度 °C' : '华氏度 °F';

  // 存储估算
  try {
    const est = await navigator.storage?.estimate?.();
    const sv = body.querySelector('#st-storage-val');
    if (sv && est?.usage != null) sv.textContent = `${fmtBytes(est.usage)} / ${fmtBytes(est.quota)}`;
  } catch (e) { /* noop */ }

  // 权限状态
  refreshPerm(body, 'pv-camera', 'camera');
  refreshPerm(body, 'pv-location', 'geolocation');
  syncNotifySwitch(body);

  body.querySelectorAll('[data-nav]').forEach(row => {
    row.onclick = () => {
      const t = row.dataset.nav;
      if (t === 'about') openAbout();
      if (t === 'lang') toast('当前版本仅支持简体中文');
      if (t === 'theme') openThemePicker();
      if (t === 'api') openApiPage(0);
      if (t === 'imageapi') openApiPage(1);
      if (t === 'storage') openStoragePage();
      if (t === 'account') openAccountPage();
    };
  });
  body.querySelectorAll('[data-app]').forEach(row => {
    row.onclick = async () => {
      const { openApp, closeApp, isAppOpen } = await import('../core/applayer.js');
      if (isAppOpen()) { closeApp(); setTimeout(() => openApp('themes'), 360); }
      else openApp('themes');
    };
  });
  body.querySelectorAll('[data-act]').forEach(row => {
    row.onclick = async () => {
      const t = row.dataset.act;
      if (t === 'perm-notify') {
        const sw = body.querySelector('#pv-notify-sw');
        const cur = sw?.classList.contains('on');
        if (cur) {
          /* 浏览器无法编程式撤销已授权权限 → 引导到系统设置 */
          toast('已授权，如需关闭请在浏览器站点设置中撤销');
          return;
        }
        const p = await requestNotifyPerm();
        toast('通知权限：' + permText(p));
        if (sw) sw.classList.toggle('on', p === 'granted');
      }
      if (t === 'perm-camera') {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true });
          s.getTracks().forEach(x => x.stop());
          toast('相机权限：已授权 ✓');
          body.querySelector('#pv-camera').textContent = '已授权';
        } catch (e) {
          toast('相机权限：' + (e.name === 'NotAllowedError' ? '被拒绝' : '不可用'));
          body.querySelector('#pv-camera').textContent = '未授权';
        }
      }
      if (t === 'perm-location') {
        try {
          await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }));
          toast('位置权限：已授权 ✓');
          body.querySelector('#pv-location').textContent = '已授权';
        } catch (e) {
          toast('位置权限：' + (e.code === 1 ? '被拒绝' : '获取失败'));
          body.querySelector('#pv-location').textContent = '未授权';
        }
      }
      if (t === 'export') {
        const data = await DB.exportAll();
        downloadJSON(data, `AppleAI备份_${new Date().toISOString().slice(0, 10)}.json`);
        toast('全部数据已导出');
      }
      if (t === 'import') {
        const input = el('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = async () => {
          try {
            const data = JSON.parse(await input.files[0].text());
            const ok = await confirmDialog('导入数据', '将清空当前数据并恢复备份，确定继续？', { okText: '导入', danger: true });
            if (!ok) return;
            const ld = loading('正在导入…');
            await DB.importAll(data);
            ld();
            toast('导入完成，即将刷新');
            setTimeout(() => location.reload(), 1200);
          } catch (e) { toast('导入失败：' + e.message); }
        };
        input.click();
      }
      if (t === 'weather-city') {
        const name = await promptDialog('设置城市', '输入城市名（如：上海）', { value: city.city || '', okText: '保存' });
        if (name) {
          try {
            const list = await WeatherEngine.searchCity(name);
            if (list.length) {
              await WeatherEngine.setCity(list[0]);
              body.querySelector('#st-city-val').textContent = list[0].city;
              toast('已切换到 ' + list[0].city);
            } else toast('未找到该城市');
          } catch (e) { toast('城市查询失败'); }
        }
      }
      if (t === 'weather-unit') {
        const next = Settings.get('weatherUnit', 'c') === 'c' ? 'f' : 'c';
        await Settings.set('weatherUnit', next);
        body.querySelector('#st-unit-val').textContent = next === 'c' ? '摄氏度 °C' : '华氏度 °F';
        Bus.emit('weather:unit-changed', next);
        toast('已切换为 ' + (next === 'c' ? '摄氏度' : '华氏度'));
      }
    };
  });
}

async function requestNotifyPerm() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
/* 通知权限 → iOS 开关状态 */
function syncNotifySwitch(body) {
  const sw = body.querySelector('#pv-notify-sw');
  if (!sw) return;
  const on = 'Notification' in window && Notification.permission === 'granted';
  sw.classList.toggle('on', on);
}
function permText(p) {
  return { granted: '已授权', denied: '被拒绝', default: '未决定', unsupported: '不支持' }[p] || p;
}
async function refreshPerm(body, id, name) {
  const node = body.querySelector('#' + id);
  if (!node) return;
  try {
    const st = await navigator.permissions?.query({ name });
    node.textContent = permText(st.state);
    st.onchange = () => { node.textContent = permText(st.state); };
  } catch (e) {
    if (name === 'notifications') node.textContent = ('Notification' in window) ? permText(Notification.permission) : '不支持';
    else node.textContent = '点击检查';
  }
}

/* ---------- 搜索：实时过滤设置项（仿 iOS 设置搜索） ---------- */
function bindSearch(body) {
  const input = body.querySelector('#st-search');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    body.querySelectorAll('.inset-group .row').forEach(r => {
      const label = r.querySelector('.row-label');
      const val = r.querySelector('.row-val');
      const text = ((label ? label.textContent : '') + ' ' + (val ? val.textContent : '')).toLowerCase();
      r.style.display = !q || text.includes(q) ? '' : 'none';
    });
    body.querySelectorAll('.inset-group').forEach(g => {
      const any = [...g.querySelectorAll('.row')].some(r => r.style.display !== 'none');
      g.style.display = any ? '' : 'none';
    });
  });
}

/* ---------- Apple ID 账户页 ---------- */
async function openAccountPage() {
  const nickname = await Settings.load('nickname', '我');
  let pct = 8, used = '—', quota = '—';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est && est.usage != null && est.quota) {
      pct = Math.min(100, (est.usage / est.quota) * 100);
      used = fmtBytes(est.usage);
      quota = fmtBytes(est.quota);
    }
  } catch (e) { /* 保持默认 */ }

  const page = nav.makePage({
    title: 'Apple ID', chevBack: true,
    build(body) {
      body.innerHTML = `
        <div class="st-acct-hero">
          <div class="st-avatar big">${PERSON_SVG}</div>
          <div class="st-acct-name">${escapeHtml(nickname || '我')}</div>
          <div class="st-acct-sub">Apple ID · 本地账户 · iCloud</div>
        </div>
        <div class="inset-group">
          <div class="inset-group-title">个人资料</div>
          <div class="inset-card">
            <div class="row" id="st-name-row">${ICONS.info}<div class="row-label">姓名</div><div class="row-val" id="st-name-val">${escapeHtml(nickname || '我')}</div><div class="row-chevron">${chevron}</div></div>
            <div class="row static">${ICONS.media}<div class="row-label">头像</div><div class="row-val">本地账户默认头像</div></div>
          </div>
        </div>
        <div class="inset-group">
          <div class="inset-group-title">iCloud</div>
          <div class="inset-card">
            <div class="row static" style="display:block;padding:15px 16px 13px">
              <div class="st-bar"><div style="width:${Math.max(2, pct).toFixed(1)}%"></div></div>
              <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-2);margin-top:7px">
                <span>已用 ${used}</span><span>共 ${quota}</span>
              </div>
            </div>
            <div class="row" data-acct="icloud">${ICONS.cloud}<div class="row-label">iCloud</div><div class="row-val">已开启</div><div class="row-chevron">${chevron}</div></div>
            <div class="row" data-acct="media">${ICONS.media}<div class="row-label">媒体与购买项目</div><div class="row-chevron">${chevron}</div></div>
            <div class="row" data-acct="find">${ICONS.location}<div class="row-label">查找我的 AppleAI</div><div class="row-val">开</div><div class="row-chevron">${chevron}</div></div>
          </div>
        </div>
        <div class="inset-group">
          <div class="inset-card">
            <div class="row" id="st-signout"><div class="row-label danger" style="flex:1;text-align:center">退出登录</div></div>
          </div>
        </div>
        <div class="st-footer"><div>AppleAI Web 1.0</div><div>账户信息仅存于本机浏览器</div></div>`;

      body.querySelectorAll('[data-acct]').forEach(r => {
        r.onclick = () => toast('演示界面：未接入真实服务');
      });

      /* 姓名编辑（同步微信个人页 / 朋友圈署名 / 设置账户卡） */
      body.querySelector('#st-name-row').onclick = async () => {
        const name = await promptDialog('姓名', '将显示在 Apple ID、微信与朋友圈', { value: nickname, okText: '保存' });
        if (name === null) return;
        const v = name.trim() || '我';
        await Settings.set('nickname', v);
        body.querySelector('.st-acct-name').textContent = v;
        body.querySelector('#st-name-val').textContent = v;
        const cardNode = root.querySelector('#st-account-name');
        if (cardNode) cardNode.textContent = v;
        toast('姓名已更新');
      };

      body.querySelector('#st-signout').onclick = async () => {
        const ok = await confirmDialog('退出登录？', '退出后 iCloud 相关功能将不可用（演示）。', { okText: '退出', danger: true });
        if (ok) toast('已退出登录（演示）');
      };
    },
  });
  nav.push(page);
}

/* ---------- 关于本机 ---------- */
function openAbout() {
  const page = nav.makePage({
    title: '关于本机', chevBack: true,
    build(body) {
      body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding:36px 20px 20px">
          <div style="width:74px;height:74px;border-radius:18px;overflow:hidden">${AppIcons.settings()}</div>
          <div style="font-size:24px;font-weight:700;margin-top:14px">AppleAI Web</div>
          <div style="font-size:13px;color:var(--text-2);margin-top:2px">版本 1.0.0 (Build 100)</div>
        </div>
        <div class="inset-group"><div class="inset-card">
          <div class="row static"><div class="row-label" style="color:var(--text-2)">机型</div><div class="row-val">iPhone（Web 模拟）</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">系统</div><div class="row-val">iOS 风格 Web 1.0</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">浏览器引擎</div><div class="row-val" id="ab-engine"></div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">存储引擎</div><div class="row-val">IndexedDB（本地）</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">应用数量</div><div class="row-val">16 个原生模块</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">屏幕</div><div class="row-val">393 × 852</div></div>
        </div></div>
        <div class="inset-group"><div class="inset-card">
          <div class="row static"><div class="row-label" style="color:var(--text-2)">隐私声明</div><div class="row-val" style="max-width:58%;font-size:13px;white-space:normal">所有数据仅存于本机浏览器，不上传任何服务器</div></div>
        </div></div>`;
      const ua = navigator.userAgent;
      const engine = /Chrome\/([\d.]+)/.test(ua) ? 'Blink ' + ua.match(/Chrome\/([\d.]+)/)[1]
        : /Firefox\/([\d.]+)/.test(ua) ? 'Gecko ' + ua.match(/Firefox\/([\d.]+)/)[1]
        : /Safari/.test(ua) ? 'WebKit' : '未知';
      body.querySelector('#ab-engine').textContent = engine;
    },
  });
  nav.push(page);
}

/* ---------- 主题选择 ---------- */
async function openThemePicker() {
  const v = await actionSheet([
    { text: '跟随系统（自动）', value: 'auto' },
    { text: '浅色模式', value: 'light' },
    { text: '深色模式', value: 'dark' },
  ], { title: '外观' });
  if (!v) return;
  await applyTheme(v);
  const tv = root.querySelector('#st-theme-val');
  if (tv) tv.textContent = { light: '浅色', dark: '深色', auto: '自动' }[v];
  toast('主题已切换');
}

/* ---------- API 配置页（自定义聊天 API + 图像识别 API 双面板） ---------- */
async function openApiPage(initialTab = 0) {
  const cfg = { ...DEFAULT_API, ...(await Settings.load('api', {})) };
  const icfg = { ...DEFAULT_IMAGE_API, ...(await Settings.load('imageApi', {})) };
  let model = cfg.model || DEFAULT_API.model;
  let imgModel = icfg.model || '';
  let tab = initialTab === 1 ? 1 : 0;
  /* 我的预设（IndexedDB 永久保存，跨会话可用） */
  let chatPresets = (await Settings.load('apiPresets', [])) || [];
  let imgPresets = (await Settings.load('imgPresets', [])) || [];
  const cleanUrl = (v) => String(v || '').replace(/\s+/g, '');

  const page = nav.makePage({
    title: 'API 配置', chevBack: true,
    build(body) {
      body.innerHTML = `
        <div class="segmented api-mode" id="api-mode">
          <button data-tab="0" class="${tab === 0 ? 'on' : ''}">自定义 API</button>
          <button data-tab="1" class="${tab === 1 ? 'on' : ''}">图像 API</button>
        </div>

        <!-- ============ 自定义聊天 API ============ -->
        <div class="api-panel" id="api-panel-chat" style="display:${tab === 0 ? '' : 'none'}">
          <div class="api-status-strip" id="api-chat-status"></div>
          <div class="api-prov-scroll" id="api-prov-scroll">
            ${API_PRESETS.map(p => `
              <button class="api-prov" data-prov="${escapeAttr(p.name)}" style="--pc:${p.color}">
                <span class="api-prov-dot"></span><span class="api-prov-name">${escapeHtml(p.name)}</span>
              </button>`).join('')}
          </div>
          <div class="inset-group">
            <div class="inset-card">
              <div class="api-url-box">
                <div class="api-url-head">
                  <span class="api-url-head-icon">${LINK_SVG}</span>
                  <div class="api-url-head-text">
                    <div class="api-url-head-title">接口地址</div>
                    <div class="api-url-head-sub">OpenAI 兼容 · 粘贴基地址自动补全</div>
                  </div>
                  <button class="api-url-clear" id="api-url-clear" title="清空地址" aria-label="清空地址">${X_SVG}</button>
                </div>
                <textarea class="api-url-area" id="api-url" rows="3" spellcheck="false" autocapitalize="off" placeholder="https://api.deepseek.com/v1/chat/completions">${escapeHtml(cfg.url)}</textarea>
                <div class="api-url-hint" id="api-url-hint"></div>
              </div>
              <div class="row api-field">
                <div class="api-field-label">API Key</div>
                <input class="row-input mono" id="api-key" type="password" spellcheck="false" autocapitalize="off" value="${escapeHtml(cfg.key)}" placeholder="sk-…（选填，未填则用内置 AI）">
                <button class="btn-sm" id="api-eye">显示</button>
              </div>
              <div class="row" id="api-model-row">
                ${ICONS.cpu}
                <div class="row-label">模型</div>
                <div class="row-val mono" id="api-model-val">${escapeHtml(model)}</div>
                <div class="row-chevron">${chevron}</div>
              </div>
            </div>
          </div>
          <div class="inset-group" id="api-presets-group">
            <div class="api-fold" id="api-presets-fold">
              <button class="api-fold-head" id="api-presets-toggle" aria-expanded="true">
                <span class="api-fold-icon">${BOOKMARK_SVG}</span>
                <span class="api-fold-text">
                  <span class="api-fold-title">我的预设</span>
                  <span class="api-fold-sub">永久保存在本机 · 点击折叠</span>
                </span>
                <span class="api-fold-count" id="api-presets-count">0</span>
                <span class="api-fold-chev">${chevron}</span>
              </button>
              <div class="api-fold-body">
                <div class="api-fold-inner">
                  <div id="api-presets-list"></div>
                  <button class="api-preset-add" id="api-save-preset">${PLUS_SVG}将当前配置保存为预设</button>
                </div>
              </div>
            </div>
          </div>
          <div class="inset-group">
            <div class="inset-group-title">生成参数</div>
            <div class="inset-card api-params">
              <div class="api-slider-row">
                <div class="api-slider-head"><span>请求超时</span><span class="api-slider-val" id="api-timeout-val">${cfg.timeout}s</span></div>
                <input type="range" class="api-slider" id="api-timeout" min="5" max="120" step="5" value="${cfg.timeout}">
              </div>
              <div class="api-slider-row">
                <div class="api-slider-head"><span>温度 temperature</span><span class="api-slider-val" id="api-temp-val">${cfg.temperature}</span></div>
                <input type="range" class="api-slider" id="api-temp" min="0" max="2" step="0.1" value="${cfg.temperature}">
              </div>
              <div class="api-slider-row">
                <div class="api-slider-head"><span>最大 Token</span></div>
                <input class="row-input" id="api-maxtokens" type="number" min="64" max="32768" step="64" value="${cfg.maxTokens}" inputmode="numeric" style="max-width:110px;margin-left:auto">
              </div>
            </div>
          </div>
          <div class="inset-group">
            <div class="inset-card">
              <div class="row" id="api-adv-toggle">
                <div class="row-label">自定义请求头（JSON）</div>
                <div class="row-val" id="api-adv-val">未设置</div>
                <div class="row-chevron api-adv-chev">${chevron}</div>
              </div>
              <div class="api-adv" id="api-adv" style="display:none">
                <textarea id="api-headers" rows="3" spellcheck="false" placeholder='{"X-Custom":"value"}'>${escapeHtml(cfg.headers || '')}</textarea>
              </div>
            </div>
          </div>
          <div class="inset-group">
            <button class="btn-fill" id="api-test">测试连接</button>
            <div class="api-test-result" id="api-test-result"></div>
            <button class="btn-fill ghost danger" id="api-reset">清除配置</button>
          </div>
          <div class="st-footer api-note" style="padding:6px 16px 0">未填写时，AI 聊天自动使用本站内置模型兜底 · API Key 仅保存在本机</div>
        </div>

        <!-- ============ 图像识别 API（识别图片） ============ -->
        <div class="api-panel" id="api-panel-image" style="display:${tab === 1 ? '' : 'none'}">
          <div class="api-status-strip" id="api-img-status"></div>
          <div class="api-prov-scroll" id="img-prov-scroll">
            ${IMAGE_PRESETS.map(p => `
              <button class="api-prov" data-prov="${escapeAttr(p.name)}" style="--pc:${p.color}">
                <span class="api-prov-dot"></span><span class="api-prov-name">${escapeHtml(p.name)}</span>
              </button>`).join('')}
          </div>
          <div class="inset-group">
            <div class="inset-card">
              <div class="api-url-box">
                <div class="api-url-head">
                  <span class="api-url-head-icon img">${EYE_SVG}</span>
                  <div class="api-url-head-text">
                    <div class="api-url-head-title">接口地址</div>
                    <div class="api-url-head-sub">OpenAI 兼容视觉端点 · 自动补全</div>
                  </div>
                  <button class="api-url-clear" id="img-url-clear" title="清空地址" aria-label="清空地址">${X_SVG}</button>
                </div>
                <textarea class="api-url-area" id="img-url" rows="3" spellcheck="false" autocapitalize="off" placeholder="https://open.bigmodel.cn/api/paas/v4/chat/completions">${escapeHtml(icfg.url)}</textarea>
                <div class="api-url-hint" id="img-url-hint"></div>
              </div>
              <div class="row api-field">
                <div class="api-field-label">API Key</div>
                <input class="row-input mono" id="img-key" type="password" spellcheck="false" autocapitalize="off" value="${escapeHtml(icfg.key)}" placeholder="sk-…（选填，未填则用内置识别）">
                <button class="btn-sm" id="img-eye">显示</button>
              </div>
              <div class="row" id="img-model-row">
                ${ICONS.eye}
                <div class="row-label">视觉模型</div>
                <div class="row-val mono" id="img-model-val">${escapeHtml(imgModel || '未选择')}</div>
                <div class="row-chevron">${chevron}</div>
              </div>
            </div>
            <div class="inset-group-title api-note">配置后，在微信聊天中发送图片，AI 会先通过此 API 识别图片内容再回复。</div>
          </div>
          <div class="inset-group" id="img-presets-group">
            <div class="api-fold" id="img-presets-fold">
              <button class="api-fold-head" id="img-presets-toggle" aria-expanded="true">
                <span class="api-fold-icon img">${BOOKMARK_SVG}</span>
                <span class="api-fold-text">
                  <span class="api-fold-title">我的预设</span>
                  <span class="api-fold-sub">永久保存在本机 · 点击折叠</span>
                </span>
                <span class="api-fold-count" id="img-presets-count">0</span>
                <span class="api-fold-chev">${chevron}</span>
              </button>
              <div class="api-fold-body">
                <div class="api-fold-inner">
                  <div id="img-presets-list"></div>
                  <button class="api-preset-add" id="img-save-preset">${PLUS_SVG}将当前视觉配置保存为预设</button>
                </div>
              </div>
            </div>
          </div>
          <div class="inset-group">
            <div class="inset-card">
              <div class="row" id="img-adv-toggle">
                <div class="row-label">自定义请求头（JSON）</div>
                <div class="row-val" id="img-adv-val">未设置</div>
                <div class="row-chevron api-adv-chev">${chevron}</div>
              </div>
              <div class="api-adv" id="img-adv" style="display:none">
                <textarea id="img-headers" rows="3" spellcheck="false" placeholder='{"X-Custom":"value"}'>${escapeHtml(icfg.headers || '')}</textarea>
              </div>
            </div>
          </div>
          <div class="inset-group">
            <button class="btn-fill" id="img-test">测试识别（发送一张测试图）</button>
            <div class="api-test-result" id="img-test-result"></div>
            <button class="btn-fill ghost danger" id="img-reset">清除配置</button>
          </div>
          <div class="st-footer api-note" style="padding:6px 16px 0">未配置时使用内置视觉识别 · API Key 仅保存在本机</div>
        </div>
        <div style="height:20px"></div>`;

      /* ---------- 元素引用 ---------- */
      const modeEl = body.querySelector('#api-mode');
      const panelChat = body.querySelector('#api-panel-chat');
      const panelImage = body.querySelector('#api-panel-image');
      const urlI = body.querySelector('#api-url');
      const keyI = body.querySelector('#api-key');
      const modelVal = body.querySelector('#api-model-val');
      const hintEl = body.querySelector('#api-url-hint');
      const timeoutI = body.querySelector('#api-timeout');
      const tempI = body.querySelector('#api-temp');
      const maxTokI = body.querySelector('#api-maxtokens');
      const headersI = body.querySelector('#api-headers');
      const imgUrlI = body.querySelector('#img-url');
      const imgKeyI = body.querySelector('#img-key');
      const imgModelVal = body.querySelector('#img-model-val');
      const imgHintEl = body.querySelector('#img-url-hint');
      const imgHeadersI = body.querySelector('#img-headers');

      /* ---------- 顶部状态条 ---------- */
      const renderChatStatus = () => {
        const el2 = body.querySelector('#api-chat-status');
        const on = !!(keyI.value.trim() && cleanUrl(urlI.value));
        const prov = detectProvider(cleanUrl(urlI.value));
        el2.innerHTML = on
          ? `<span class="dot"></span>当前使用：<b>自定义 API</b>${prov && prov !== '自定义' ? ` · ${escapeHtml(prov)}` : ''}`
          : `<span class="dot builtin"></span>当前使用：<b>内置 AI</b> · 未配置自定义`;
      };
      const renderImgStatus = () => {
        const el2 = body.querySelector('#api-img-status');
        const on = !!(imgKeyI.value.trim() && cleanUrl(imgUrlI.value));
        const prov = detectImageProvider(cleanUrl(imgUrlI.value));
        el2.innerHTML = on
          ? `<span class="dot"></span>当前使用：<b>自定义视觉 API</b>${prov && prov !== '自定义' ? ` · ${escapeHtml(prov)}` : ''}`
          : `<span class="dot builtin"></span>当前使用：<b>内置视觉</b> · 未配置自定义`;
      };

      /* ---------- 面板切换 ---------- */
      modeEl.querySelectorAll('button').forEach(b => {
        b.onclick = () => {
          const t = +b.dataset.tab;
          if (t === tab) return;
          tab = t;
          modeEl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          panelChat.style.display = tab === 0 ? '' : 'none';
          panelImage.style.display = tab === 1 ? '' : 'none';
          save();
          renderChatStatus();
          renderImgStatus();
        };
      });

      /* ---------- 地址：实时规范化提示 + 服务商高亮 ---------- */
      const renderHint = () => {
        const raw = cleanUrl(urlI.value);
        if (!raw) { hintEl.innerHTML = '<span class="warn">请填写接口地址</span>'; return; }
        const norm = normalizeChatUrl(raw);
        const prov = detectProvider(raw);
        hintEl.innerHTML = `<span class="dot"></span>请求端点：${escapeHtml(norm)}${prov && prov !== '自定义' ? ` · <b>${escapeHtml(prov)}</b>` : ''}`;
        highlightProv(body, '#api-prov-scroll', prov);
      };
      const renderImgHint = () => {
        const raw = cleanUrl(imgUrlI.value);
        if (!raw) { imgHintEl.innerHTML = '<span class="warn">请填写接口地址</span>'; return; }
        const norm = normalizeChatUrl(raw);
        const prov = detectImageProvider(raw);
        imgHintEl.innerHTML = `<span class="dot"></span>请求端点：${escapeHtml(norm)}${prov && prov !== '自定义' ? ` · <b>${escapeHtml(prov)}</b>` : ''}`;
        highlightProv(body, '#img-prov-scroll', prov);
      };
      const highlightProv = (scope, scrollSel, prov) => {
        scope.querySelectorAll(scrollSel + ' .api-prov').forEach(c => c.classList.toggle('on', c.dataset.prov === prov));
      };
      urlI.addEventListener('input', () => { renderHint(); renderChatStatus(); });
      imgUrlI.addEventListener('input', () => { renderImgHint(); renderImgStatus(); });
      renderHint();
      renderImgHint();

      /* ---------- 服务商快捷 ---------- */
      body.querySelectorAll('#api-prov-scroll .api-prov').forEach(c => {
        c.onclick = () => {
          const p = API_PRESETS.find(x => x.name === c.dataset.prov);
          if (!p) return;
          urlI.value = p.url;
          model = p.model;
          modelVal.textContent = model;
          renderHint();
          renderChatStatus();
          toast('已填入 ' + p.name + '，请继续填写 API Key');
        };
      });
      body.querySelectorAll('#img-prov-scroll .api-prov').forEach(c => {
        c.onclick = () => {
          const p = IMAGE_PRESETS.find(x => x.name === c.dataset.prov);
          if (!p) return;
          imgUrlI.value = p.url;
          imgModel = p.model;
          imgModelVal.textContent = imgModel;
          renderImgHint();
          renderImgStatus();
          toast('已填入 ' + p.name + ' 视觉配置，请继续填写 API Key');
        };
      });

      /* ---------- 我的预设（IndexedDB 永久保存，跨会话可用，可折叠） ---------- */
      const presetDotColor = (p, isImg) => {
        const prov = isImg ? detectImageProvider(p.url) : detectProvider(p.url);
        const all = isImg ? IMAGE_PRESETS : API_PRESETS;
        const hit = all.find(x => x.name === prov);
        return hit ? hit.color : (isImg ? '#5E5CE6' : '#0A84FF');
      };
      const presetSub = (p, isImg) => {
        const prov = isImg ? detectImageProvider(p.url) : detectProvider(p.url);
        return (prov && prov !== '自定义' ? prov + ' · ' : '') + (p.model || '未选模型');
      };
      const presetRowHTML = (p, isImg) => `
        <div class="row api-preset-row" data-id="${escapeAttr(String(p.id))}">
          <span class="api-preset-dot" style="--pc:${presetDotColor(p, isImg)}"></span>
          <div class="row-label">
            <div class="api-preset-name">${escapeHtml(p.name)}</div>
            <div class="api-preset-sub mono">${escapeHtml(presetSub(p, isImg))}</div>
          </div>
          <button class="api-preset-more" data-id="${escapeAttr(String(p.id))}" aria-label="预设操作">${MORE_SVG}</button>
        </div>`;

      const applyChatPreset = (p) => {
        urlI.value = p.url || '';
        keyI.value = p.key || '';
        model = p.model || DEFAULT_API.model;
        modelVal.textContent = model;
        timeoutI.value = p.timeout ?? 30;
        tempI.value = p.temperature ?? 0.7;
        maxTokI.value = p.maxTokens ?? 2048;
        body.querySelector('#api-timeout-val').textContent = timeoutI.value + 's';
        body.querySelector('#api-temp-val').textContent = tempI.value;
        headersI.value = p.headers || '';
        renderHint(); renderChatStatus(); save(); updateStApiVal();
        toast('已应用预设「' + p.name + '」');
      };
      const applyImgPreset = (p) => {
        imgUrlI.value = p.url || '';
        imgKeyI.value = p.key || '';
        imgModel = p.model || '';
        imgModelVal.textContent = imgModel || '未选择';
        imgHeadersI.value = p.headers || '';
        renderImgHint(); renderImgStatus(); save(); updateStApiVal();
        toast('已应用预设「' + p.name + '」');
      };

      const bindPresetRows = (listEl, presets, apply, actions) => {
        if (!listEl) return;
        listEl.querySelectorAll('.api-preset-row').forEach(r => {
          r.onclick = (e) => {
            if (e.target.closest && e.target.closest('.api-preset-more')) return;
            const p = presets.find(x => String(x.id) === r.dataset.id);
            if (p) apply(p);
          };
        });
        listEl.querySelectorAll('.api-preset-more').forEach(b => {
          b.onclick = (e) => {
            e.stopPropagation();
            const p = presets.find(x => String(x.id) === b.dataset.id);
            if (p) actions(p);
          };
        });
      };
      const presetActions = async (p, presets, storeKey, rerender, apply) => {
        const v = await actionSheet([
          { text: '应用此预设', value: 'apply' },
          { text: '重命名', value: 'rename' },
          { text: '删除预设', value: 'del', danger: true },
        ], { title: p.name });
        if (!v) return;
        if (v === 'apply') { apply(p); return; }
        if (v === 'rename') {
          const nn = await promptDialog('重命名预设', '输入新的预设名称', { value: p.name, okText: '保存' });
          if (nn == null || !String(nn).trim()) return;
          p.name = String(nn).trim();
          await Settings.set(storeKey, presets);
          rerender();
          toast('预设已重命名');
          return;
        }
        if (v === 'del') {
          presets.splice(presets.indexOf(p), 1);
          await Settings.set(storeKey, presets);
          rerender();
          toast('预设已删除');
        }
      };

      /* 折叠区（iOS disclosure 风格）：默认展开，点击头部平滑收合 */
      const bindFold = (foldSel, toggleSel, countSel, presets, initialOpen = true) => {
        const fold = body.querySelector(foldSel);
        const toggle = body.querySelector(toggleSel);
        if (!fold || !toggle) return () => {};
        let open = initialOpen;
        const apply = () => {
          fold.classList.toggle('open', open);
          toggle.setAttribute('aria-expanded', String(open));
        };
        toggle.onclick = () => { open = !open; apply(); haptic(); };
        apply();
        return (n) => {
          const badge = body.querySelector(countSel);
          if (badge) {
            badge.textContent = String(n);
            badge.classList.toggle('zero', !n);
          }
        };
      };
      const syncChatCount = bindFold('#api-presets-fold', '#api-presets-toggle', '#api-presets-count', chatPresets);
      const syncImgCount = bindFold('#img-presets-fold', '#img-presets-toggle', '#img-presets-count', imgPresets);

      const chatPresetList = body.querySelector('#api-presets-list');
      const renderChatPresets = () => {
        if (!chatPresetList) return;
        chatPresetList.innerHTML = chatPresets.length
          ? chatPresets.map(p => presetRowHTML(p, false)).join('')
          : '<div class="api-preset-empty">暂无预设 · 保存后可一键切换整套配置</div>';
        bindPresetRows(chatPresetList, chatPresets, applyChatPreset, (p) => presetActions(p, chatPresets, 'apiPresets', renderChatPresets, applyChatPreset));
        syncChatCount(chatPresets.length);
      };
      const imgPresetList = body.querySelector('#img-presets-list');
      const renderImgPresets = () => {
        if (!imgPresetList) return;
        imgPresetList.innerHTML = imgPresets.length
          ? imgPresets.map(p => presetRowHTML(p, true)).join('')
          : '<div class="api-preset-empty">暂无预设 · 保存后可一键切换整套配置</div>';
        bindPresetRows(imgPresetList, imgPresets, applyImgPreset, (p) => presetActions(p, imgPresets, 'imgPresets', renderImgPresets, applyImgPreset));
        syncImgCount(imgPresets.length);
      };

      body.querySelector('#api-save-preset').onclick = async () => {
        const prov = detectProvider(cleanUrl(urlI.value));
        const def = prov && prov !== '自定义' ? prov : (model || '');
        const name = await promptDialog('保存预设', '为当前配置起个名字 · 永久保存在本机', { value: def, okText: '保存' });
        if (name == null) return;
        const n = String(name).trim();
        if (!n) { toast('请输入预设名称'); return; }
        chatPresets.push({ id: uid('ps'), name: n, ...collect() });
        await Settings.set('apiPresets', chatPresets);
        renderChatPresets();
        toast('预设「' + n + '」已永久保存');
      };
      body.querySelector('#img-save-preset').onclick = async () => {
        const prov = detectImageProvider(cleanUrl(imgUrlI.value));
        const def = prov && prov !== '自定义' ? prov : (imgModel || '');
        const name = await promptDialog('保存预设', '为当前视觉配置起个名字 · 永久保存在本机', { value: def, okText: '保存' });
        if (name == null) return;
        const n = String(name).trim();
        if (!n) { toast('请输入预设名称'); return; }
        imgPresets.push({ id: uid('ps'), name: n, ...collectImage() });
        await Settings.set('imgPresets', imgPresets);
        renderImgPresets();
        toast('预设「' + n + '」已永久保存');
      };
      /* 地址清空按钮（双面板） */
      const bindUrlClear = (btnSel, input, rerender) => {
        const btn = body.querySelector(btnSel);
        if (!btn) return;
        const sync = () => {
          const has = !!input.value.trim();
          btn.classList.toggle('show', has);
        };
        btn.onclick = () => {
          input.value = '';
          input.dispatchEvent(new Event('input'));
          rerender();
          input.focus();
        };
        input.addEventListener('input', sync);
        sync();
      };
      bindUrlClear('#api-url-clear', urlI, renderHint);
      bindUrlClear('#img-url-clear', imgUrlI, renderImgHint);

      renderChatPresets();
      renderImgPresets();

      /* ---------- Key 显隐 ---------- */
      body.querySelector('#api-eye').onclick = () => {
        const show = keyI.type === 'password';
        keyI.type = show ? 'text' : 'password';
        body.querySelector('#api-eye').textContent = show ? '隐藏' : '显示';
      };
      body.querySelector('#img-eye').onclick = () => {
        const show = imgKeyI.type === 'password';
        imgKeyI.type = show ? 'text' : 'password';
        body.querySelector('#img-eye').textContent = show ? '隐藏' : '显示';
      };

      /* ---------- 模型选择 Sheet ---------- */
      body.querySelector('#api-model-row').onclick = () => openModelSheet({
        current: () => model,
        url: () => urlI.value.trim() || DEFAULT_API.url,
        key: () => keyI.value.trim(),
        headers: () => headersI.value.trim(),
        provider: () => detectProvider(urlI.value.trim()),
        onPick: (m) => { model = m; modelVal.textContent = model; },
      });
      body.querySelector('#img-model-row').onclick = () => openModelSheet({
        current: () => imgModel || '',
        url: () => imgUrlI.value.trim(),
        key: () => imgKeyI.value.trim(),
        headers: () => imgHeadersI.value.trim(),
        provider: () => detectImageProvider(imgUrlI.value.trim()),
        presets: IMAGE_PRESETS,
        onPick: (m) => { imgModel = m; imgModelVal.textContent = imgModel; },
      });

      /* ---------- 滑杆联动 ---------- */
      timeoutI.addEventListener('input', () => body.querySelector('#api-timeout-val').textContent = timeoutI.value + 's');
      tempI.addEventListener('input', () => body.querySelector('#api-temp-val').textContent = tempI.value);

      /* ---------- 高级：请求头折叠（双面板） ---------- */
      const bindAdv = (toggleId, advId, advValId, input) => {
        const toggle = body.querySelector(toggleId);
        const adv = body.querySelector(advId);
        const advVal = body.querySelector(advValId);
        const sync = () => { advVal.textContent = input.value.trim() ? '已设置' : '未设置'; };
        toggle.onclick = () => {
          const open = adv.style.display !== 'none';
          adv.style.display = open ? 'none' : '';
          toggle.querySelector('.api-adv-chev').classList.toggle('open', !open);
        };
        input.addEventListener('input', sync);
        sync();
      };
      bindAdv('#api-adv-toggle', '#api-adv', '#api-adv-val', headersI);
      bindAdv('#img-adv-toggle', '#img-adv', '#img-adv-val', imgHeadersI);

      /* ---------- 收集 / 保存 ---------- */
      const collect = () => ({
        url: cleanUrl(urlI.value) || DEFAULT_API.url,
        key: keyI.value.trim(),
        model: model || DEFAULT_API.model,
        timeout: +timeoutI.value,
        temperature: +tempI.value,
        maxTokens: +maxTokI.value || 2048,
        headers: headersI.value.trim(),
      });
      const collectImage = () => ({
        url: cleanUrl(imgUrlI.value),
        key: imgKeyI.value.trim(),
        model: imgModel || '',
        headers: imgHeadersI.value.trim(),
        timeout: DEFAULT_IMAGE_API.timeout,
      });
      const save = () => {
        Settings.set('api', collect()).catch(() => {});
        Settings.set('imageApi', collectImage()).catch(() => {});
      };
      const updateStApiVal = () => {
        const av = root.querySelector('#st-api-val');
        if (av) {
          const on = !!(keyI.value.trim() && cleanUrl(urlI.value));
          const prov = detectProvider(cleanUrl(urlI.value));
          av.textContent = on ? (prov && prov !== '自定义' ? prov : '自定义 API') : '内置 AI';
        }
        const iv = root.querySelector('#st-imgapi-val');
        if (iv) {
          const on = !!(imgKeyI.value.trim() && cleanUrl(imgUrlI.value));
          const prov = detectImageProvider(cleanUrl(imgUrlI.value));
          iv.textContent = on ? (prov && prov !== '自定义' ? prov : '自定义 API') : '内置视觉';
        }
      };

      /* ---------- 测试连接（聊天） ---------- */
      const runTest = async (btnId, resId) => {
        const btn = body.querySelector(btnId);
        const res = body.querySelector(resId);
        btn.disabled = true;
        btn.textContent = '测试中…';
        res.className = 'api-test-result testing';
        res.innerHTML = '<span class="pulse"></span>正在连接服务器…';
        try {
          save();
          const r = await testConnection(collect());
          if (r.fixed && r.url) { urlI.value = r.url; renderHint(); save(); }
          res.className = 'api-test-result ok';
          res.innerHTML =
            `<div class="atr-line"><span class="mark ok">✓</span>连接成功 · ${r.ms}ms</div>` +
            `<div class="atr-sub">${escapeHtml(r.mode === 'custom' ? r.model : '内置AI · 本机转发')}` +
            (r.fixed ? ` · <span style="color:var(--success)">地址已自动修正</span>` : '') +
            (r.tried > 1 ? ` · 自动尝试了 ${r.tried} 条路径` : '') + '</div>';
          updateStApiVal();
          renderChatStatus();
        } catch (e) {
          res.className = 'api-test-result fail';
          res.innerHTML =
            `<div class="atr-line"><span class="mark bad">✗</span>${escapeHtml(e.message || '连接失败')}</div>` +
            (e.hint ? `<div class="atr-sub">${escapeHtml(e.hint)}</div>` : '');
        }
        btn.disabled = false;
        btn.textContent = '测试连接';
      };
      body.querySelector('#api-test').onclick = () => runTest('#api-test', '#api-test-result');

      /* ---------- 测试识别（图像） ---------- */
      const runImgTest = async () => {
        const btn = body.querySelector('#img-test');
        const res = body.querySelector('#img-test-result');
        btn.disabled = true;
        btn.textContent = '识别中…';
        res.className = 'api-test-result testing';
        res.innerHTML = '<span class="pulse"></span>正在识别测试图片…';
        try {
          save();
          const r = await testImageConnection(collectImage());
          if (r.fixed && r.url) { imgUrlI.value = r.url; renderImgHint(); save(); }
          res.className = 'api-test-result ok';
          res.innerHTML =
            `<div class="atr-line"><span class="mark ok">✓</span>识别成功 · ${r.ms}ms</div>` +
            `<div class="atr-sub">${escapeHtml(r.mode === 'custom' ? r.model : '内置视觉模型')} · 模型回答：${escapeHtml(String(r.reply).slice(0, 60))}` +
            (r.fixed ? ` · <span style="color:var(--success)">地址已自动修正</span>` : '') + '</div>';
          updateStApiVal();
          renderImgStatus();
        } catch (e) {
          res.className = 'api-test-result fail';
          res.innerHTML =
            `<div class="atr-line"><span class="mark bad">✗</span>${escapeHtml(e.message || '识别失败')}</div>` +
            (e.hint ? `<div class="atr-sub">${escapeHtml(e.hint)}</div>` : '');
        }
        btn.disabled = false;
        btn.textContent = '测试识别（发送一张测试图）';
      };
      body.querySelector('#img-test').onclick = () => runImgTest();

      /* ---------- 重置（双面板） ---------- */
      body.querySelector('#api-reset').onclick = async () => {
        await Settings.set('api', {});
        urlI.value = DEFAULT_API.url;
        keyI.value = '';
        model = DEFAULT_API.model;
        modelVal.textContent = model;
        headersI.value = '';
        renderHint();
        renderChatStatus();
        toast('已清除，AI 聊天恢复内置模型');
        updateStApiVal();
      };
      body.querySelector('#img-reset').onclick = async () => {
        await Settings.set('imageApi', {});
        imgUrlI.value = '';
        imgKeyI.value = '';
        imgModel = '';
        imgModelVal.textContent = '未选择';
        imgHeadersI.value = '';
        renderImgHint();
        renderImgStatus();
        toast('已清除，图片识别恢复内置视觉');
        updateStApiVal();
      };

      renderChatStatus();
      renderImgStatus();

      /* ---------- 离开页面自动保存 ---------- */
      const origPop = nav.pop.bind(nav);
      nav.pop = () => {
        save();
        nav.pop = origPop;
        return origPop();
      };
    },
  });
  nav.push(page);
}

/* ---------- 模型选择 Sheet：搜索 + 在线拉取 + 预设 ---------- */
const SPARK_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.5l1.8 5.4a4 4 0 0 0 2.5 2.5l5.4 1.8-5.4 1.8a4 4 0 0 0-2.5 2.5L12 21.9l-1.8-5.4a4 4 0 0 0-2.5-2.5L2.3 12.2l5.4-1.8a4 4 0 0 0 2.5-2.5z"/></svg>';

function openModelSheet({ current, url, key, headers, provider, onPick, presets = API_PRESETS }) {
  let fetched = null; // null=未拉取
  sheet({
    title: '选择模型',
    build(body, close) {
      body.innerHTML = `
        <div class="searchbar" style="margin:2px 0 10px">
          ${SEARCH_SVG}
          <input id="md-search" placeholder="搜索模型" autocomplete="off" enterkeyhint="search">
        </div>
        <div class="md-fetch-row">
          <button class="btn-fill" id="md-fetch" style="flex:1;padding:11px;font-size:15px">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="vertical-align:-2px;margin-right:5px"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/></svg>从 API 拉取模型列表
          </button>
        </div>
        <div class="md-status" id="md-status"></div>
        <div class="md-list" id="md-list"></div>
        <div class="md-custom">
          <input class="mono" id="md-custom-input" placeholder="或输入自定义模型名…" spellcheck="false" autocapitalize="off">
          <button class="btn-sm" id="md-custom-ok">使用</button>
        </div>`;

      const list = body.querySelector('#md-list');
      const search = body.querySelector('#md-search');
      const status = body.querySelector('#md-status');
      let q = '';

      const modelList = () => {
        if (fetched) return fetched.map(id => ({ id }));
        const p = presets.find(x => x.name === provider());
        return (p ? p.models : ['gpt-4o-mini', 'gpt-4o', 'glm-4-flash', 'glm-4v-flash', 'qwen-vl-plus', 'deepseek-chat'])
          .map(id => ({ id, preset: true }));
      };

      const render = () => {
        const items = modelList().filter(m => !q || m.id.toLowerCase().includes(q));
        list.innerHTML = items.length
          ? items.map(m => `
              <div class="md-item${m.id === current() ? ' on' : ''}" data-id="${escapeAttr(m.id)}">
                <span class="md-item-name mono">${escapeHtml(m.id)}</span>
                ${m.preset ? '<span class="md-tag">预设</span>' : ''}
                <span class="md-check"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg></span>
              </div>`).join('')
          : `<div class="md-empty">${fetched ? '没有匹配的模型' : '没有匹配的预设模型，可在线拉取'}</div>`;
        list.querySelectorAll('.md-item').forEach(item => {
          item.onclick = () => { onPick(item.dataset.id); close(); };
        });
      };
      render();

      search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); render(); });

      body.querySelector('#md-custom-ok').onclick = () => {
        const v = body.querySelector('#md-custom-input').value.trim();
        if (!v) { toast('请输入模型名称'); return; }
        onPick(v); close();
      };

      body.querySelector('#md-fetch').onclick = async () => {
        const btn = body.querySelector('#md-fetch');
        btn.disabled = true;
        const old = btn.innerHTML;
        btn.textContent = '拉取中…';
        status.textContent = '';
        status.classList.remove('err');
        try {
          fetched = await fetchModels({ url: url(), key: key(), headers: headers() });
          status.innerHTML = `已拉取 <b>${fetched.length}</b> 个模型 · ${escapeHtml(provider())}`;
          search.value = ''; q = '';
        } catch (e) {
          status.textContent = '✗ ' + (e.message || '拉取失败');
          status.classList.add('err');
          toast('模型列表拉取失败');
        }
        render();
        btn.innerHTML = old;
        btn.disabled = false;
      };
    },
  });
}

/* ---------- 存储详情页 ---------- */
async function openStoragePage() {
  const page = nav.makePage({
    title: '存储空间', chevBack: true,
    build(body) {
      body.innerHTML = '<div style="display:flex;justify-content:center;padding:30px"><div class="spinner"></div></div>';
      (async () => {
        const est = await navigator.storage?.estimate?.().catch(() => null);
        const counts = {};
        for (const s of ['photos', 'music', 'recordings', 'messages', 'conversations', 'notes', 'events', 'contacts', 'moments', 'bookmarks', 'history']) {
          counts[s] = await DB.count(s);
        }
        const photoBytes = (await DB.all('photos')).reduce((s, p) => s + (p.size || 0), 0);
        const musicBytes = (await DB.all('music')).reduce((s, m) => s + (m.data?.byteLength || 0), 0);
        const recBytes = (await DB.all('recordings')).reduce((s, r) => s + (r.data?.byteLength || 0), 0);
        const used = est?.usage ?? (photoBytes + musicBytes + recBytes);
        const quota = est?.quota ?? 0;
        const pct = quota ? Math.min(100, (used / quota) * 100) : 0;

        const row = (label, val, color) => `<div class="row static"><div class="st-legend" style="--lc:${color}"></div><div class="row-label" style="color:var(--text-2)">${label}</div><div class="row-val">${val}</div></div>`;

        /* iOS 式分段存储条：按数据类型真实占比渲染 */
        const chatBytes = counts.messages * 620;              // 文本估算
        const miscBytes = Math.max(0, used - photoBytes - musicBytes - recBytes - chatBytes);
        const segs = [
          { label: '照片', bytes: photoBytes, color: '#FF9500' },
          { label: '音乐', bytes: musicBytes, color: '#FF2D55' },
          { label: '录音', bytes: recBytes, color: '#5E5CE6' },
          { label: '聊天', bytes: chatBytes, color: '#34C759' },
          { label: '系统与缓存', bytes: Math.max(1, miscBytes), color: '#8E8E93' },
        ].filter(s => s.bytes > 0).sort((a, b) => b.bytes - a.bytes);
        const segTotal = segs.reduce((s, x) => s + x.bytes, 0) || 1;
        const segBar = `<div class="st-segbar">${segs.map(s =>
          `<i style="width:${Math.max(0.8, s.bytes / segTotal * 100).toFixed(2)}%;background:${s.color}"></i>`).join('')}</div>`;

        body.innerHTML = `
          <div class="inset-group">
            <div class="inset-group-title">浏览器分配空间</div>
            <div class="inset-card" style="padding:18px 16px">
              ${segBar}
              <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-2);margin-top:8px">
                <span>已用 ${fmtBytes(used)}</span><span>共 ${fmtBytes(quota)}</span>
              </div>
            </div>
          </div>
          <div class="inset-group">
            <div class="inset-group-title">数据占用明细</div>
            <div class="inset-card">
              ${row('照片', `${counts.photos} 张 · ${fmtBytes(photoBytes)}`, '#FF9500')}
              ${row('音乐', `${counts.music} 首 · ${fmtBytes(musicBytes)}`, '#FF2D55')}
              ${row('录音', `${counts.recordings} 条 · ${fmtBytes(recBytes)}`, '#5E5CE6')}
              ${row('聊天消息', `${counts.messages} 条 · ${counts.conversations} 个会话`, '#34C759')}
              ${row('备忘录', `${counts.notes} 条`, '#32ADE6')}
              ${row('日历事件', `${counts.events} 个`, '#FF3B30')}
              ${row('联系人 / 朋友圈', `${counts.contacts} / ${counts.moments}`, '#007AFF')}
              ${row('浏览器足迹', `${counts.bookmarks} 书签 · ${counts.history} 历史`, '#5856D6')}
            </div>
          </div>
          <div class="inset-group">
            <div class="inset-group-title">清理</div>
            <div class="inset-card">
              <div class="row" data-clean="history"><div class="row-label danger">清除浏览器历史</div><div class="row-val">${counts.history} 条</div></div>
              <div class="row" data-clean="cache"><div class="row-label danger">清除浏览器缓存</div><div class="row-val">重新加载页面</div></div>
            </div>
            <div class="inset-group-title" style="color:var(--danger)">危险区域</div>
            <div class="inset-card">
              <div class="row" data-clean="all"><div class="row-label danger">抹掉所有内容和设置</div></div>
            </div>
          </div>`;
        body.querySelectorAll('[data-clean]').forEach(r => {
          r.onclick = async () => {
            const t = r.dataset.clean;
            if (t === 'history') {
              const ok = await confirmDialog('清除历史', '删除全部浏览器历史记录？', { okText: '清除', danger: true });
              if (ok) { await DB.clear('history'); openStoragePage(); toast('已清除'); }
            }
            if (t === 'cache') { toast('正在刷新…'); setTimeout(() => location.reload(), 600); }
            if (t === 'all') {
              const v = await promptDialog('抹掉所有数据', '输入「删除」以确认', { placeholder: '删除' });
              if (v === '删除') {
                const ld = loading('正在抹掉数据…');
                for (const s of ['messages', 'conversations', 'photos', 'music', 'recordings', 'notes', 'events', 'contacts', 'moments', 'bookmarks', 'history', 'settings', 'stickers']) {
                  await DB.clear(s);
                }
                localStorage.clear();
                ld();
                toast('已抹掉，即将重启');
                setTimeout(() => location.reload(), 1000);
              }
            }
          };
        });
      })();
    },
  });
  nav.push(page);
}
