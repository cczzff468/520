/* ============ 浏览器（iOS Safari 风格 + 顶部多标签页） ============ */

import { el, uid, haptic, fmtSmartTime } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { toast, actionSheet, confirmDialog, promptDialog, dialog, escapeHtml } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

let root = null;
let pendingUrl = null;
let iframe = null;          // 活动标签的 iframe（兼容外部引用）
let tabs = [];              // { id, url, title, webEl }
let activeTab = null;
let stripHost = null;       // 标签胶囊容器
let contentHost = null;     // 内容宿主（起始页 / 各标签网页视图）
let startPage = null;       // 共享起始页（一个标签的「新标签页」）

/* ---------- 快捷方式（品牌图形 / 单字徽标，白底瓷片） ---------- */
const MARKS = {
  baidu: '<svg viewBox="0 0 24 24" fill="#2932E1"><circle cx="7.1" cy="8.1" r="2.7"/><circle cx="12" cy="6.3" r="2.9"/><circle cx="16.9" cy="8.1" r="2.7"/><path d="M12 9.5c-3.3 0-5.7 3.2-5.7 6.2 0 2.2 1.7 3.8 3.9 3.8 1.1 0 1.5-.4 1.8-.4.3 0 .7.4 1.8.4 2.2 0 3.9-1.6 3.9-3.8 0-3-2.4-6.2-5.7-6.2z"/></svg>',
  bilibili: '<svg viewBox="0 0 24 24"><rect x="3.6" y="7.2" width="16.8" height="11.6" rx="3.4" fill="#FB7299"/><path d="M8.6 3.6l2 2.2M15.4 3.6l-2 2.2" stroke="#FB7299" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.2" cy="13" r="1.4" fill="#fff"/><circle cx="14.8" cy="13" r="1.4" fill="#fff"/></svg>',
  weibo: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12.2" r="8.8" fill="#E6162D"/><circle cx="12" cy="12.2" r="4.6" fill="#fff"/><circle cx="12" cy="12.2" r="2.1" fill="#E6162D"/></svg>',
};

const QUICK_LINKS = [
  { name: '百度', url: 'https://www.baidu.com', mark: MARKS.baidu },
  { name: '哔哩哔哩', url: 'https://www.bilibili.com', mark: MARKS.bilibili },
  { name: '微博', url: 'https://weibo.com', mark: MARKS.weibo },
  { name: '知乎', url: 'https://www.zhihu.com', glyph: '知', color: '#0084FF' },
  { name: '必应', url: 'https://www.bing.com', glyph: 'b', color: '#0F8BCC' },
  { name: '搜狗', url: 'https://www.sogou.com', glyph: '搜', color: '#FF6B00' },
  { name: '京东', url: 'https://www.jd.com', glyph: '京', color: '#E1251B' },
  { name: '淘宝', url: 'https://www.taobao.com', glyph: '淘', color: '#FF5000' },
];

const CHEV_L = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4.5L7 12l7.5 7.5"/></svg>';
const SHARE_I = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14V3.5M8 6.5L12 3l4 3.5"/><path d="M5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8"/></svg>';
const BOOK_I = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z"/></svg>';
const RELOAD_I = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5V9H15"/></svg>';
const X_I = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const PLUS_I = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

/* 标签字母头像的稳定配色（host 哈希 → HSL） */
function hostColor(host) {
  let h = 0;
  for (const ch of String(host || '?')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 52%)`;
}

export default {
  id: 'browser',
  name: '浏览器',
  icon: AppIcons.browser,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    tabs = [];
    activeTab = null;
    buildChrome();
    restoreTabs();
  },

  unmount() { iframe = null; },

  /* 全局返回键：网页视图 → 回该标签的起始页；起始页 → 交给应用层关闭 */
  onBack() {
    if (activeTab && activeTab.url) { showStart(); return true; }
    return false;
  },
};

export function setPendingUrl(url) { pendingUrl = url; }

/* ============ 骨架：顶部标签条 + 内容宿主 ============ */
function buildChrome() {
  const shell = el('div', 'app-root br-shell');
  stripHost = el('div', 'br-tabs');
  const addBtn = el('button', 'br-tab-add');
  addBtn.innerHTML = PLUS_I;
  addBtn.setAttribute('aria-label', '新建标签页');
  addBtn.onclick = () => { haptic(6); createTab({ activate: true }); };
  stripHost.appendChild(addBtn);

  contentHost = el('div', 'br-content');

  shell.append(stripHost, contentHost);
  root.appendChild(shell);

  startPage = buildStartPage();
  contentHost.appendChild(startPage);
}

/* ============ 标签管理 ============ */
async function restoreTabs() {
  let saved = [];
  try { saved = (await Settings.load('browserTabs', [])) || []; } catch (e) { /* noop */ }
  saved = saved.filter(t => t && t.url);
  if (pendingUrl) {
    const u = pendingUrl; pendingUrl = null;
    if (saved.length) saved[saved.length - 1] = { url: u, title: hostOf(u) };
    else saved = [{ url: u, title: hostOf(u) }];
  }
  if (!saved.length) {
    createTab({ activate: true });
    return;
  }
  saved.forEach((t, i) => {
    const tab = { id: uid('tab'), url: t.url, title: t.title || hostOf(t.url), webEl: null };
    tabs.push(tab);
    if (i === saved.length - 1) activateTab(tab, { skipRender: true });
  });
  renderStrip();
  /* 激活含网址的恢复标签：懒加载 iframe */
  if (activeTab && activeTab.url) ensureWebEl(activeTab);
}

async function persistTabs() {
  const data = tabs.filter(t => t.url).map(t => ({ url: t.url, title: t.title }));
  try { await Settings.set('browserTabs', data); } catch (e) { /* noop */ }
}

function createTab({ url = '', title = '', activate = false } = {}) {
  const tab = { id: uid('tab'), url, title: title || (url ? hostOf(url) : ''), webEl: null };
  tabs.push(tab);
  if (activate) activateTab(tab);
  else renderStrip();
  return tab;
}

function activateTab(tab, { skipRender = false } = {}) {
  if (activeTab === tab) return;
  activeTab = tab;
  if (!skipRender) haptic(4);
  /* 只显示该标签的视图：有网址 → 网页视图；无 → 共享起始页 */
  [...contentHost.children].forEach(ch => { ch.style.display = 'none'; });
  if (tab.url) {
    const web = ensureWebEl(tab);
    web.style.display = '';
    iframe = web.querySelector('iframe');
  } else {
    startPage.style.display = '';
    iframe = null;
    refreshStart();
  }
  if (!skipRender) renderStrip();
}

/* 懒创建网页视图（首次激活才加载 iframe，后台标签不占流量） */
function ensureWebEl(tab) {
  if (tab.webEl && tab.webEl.isConnected) return tab.webEl;
  const web = buildWebEl(tab);
  tab.webEl = web;
  contentHost.appendChild(web);
  return web;
}

function closeTab(tab) {
  const idx = tabs.indexOf(tab);
  if (idx < 0) return;
  haptic(6);
  tabs.splice(idx, 1);
  if (tab.webEl) tab.webEl.remove();
  if (!tabs.length) {
    activeTab = null;
    createTab({ activate: true });
  } else if (activeTab === tab) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    activateTab(next);
  }
  renderStrip();
  persistTabs();
}

/* 标签条渲染（胶囊：字母头像 + 标题 + 关闭） */
function renderStrip() {
  if (!stripHost) return;
  stripHost.querySelectorAll('.br-tab').forEach(n => n.remove());
  const addBtn = stripHost.querySelector('.br-tab-add');
  tabs.forEach(tab => {
    const chip = el('button', 'br-tab' + (tab === activeTab ? ' on' : ''));
    const host = tab.url ? hostOf(tab.url) : '';
    const label = tab.url ? (tab.title || host) : '新标签页';
    chip.innerHTML = `
      <span class="br-tab-ico" style="--tc:${tab.url ? hostColor(host) : 'var(--text-3)'}">${escapeHtml(tab.url ? (host[0] || '·').toUpperCase() : '+')}</span>
      <span class="br-tab-label ellipsis">${escapeHtml(label)}</span>
      <span class="br-tab-x" role="button" aria-label="关闭标签页">${X_I}</span>`;
    chip.onclick = (e) => {
      if (e.target.closest('.br-tab-x')) { e.stopPropagation(); closeTab(tab); return; }
      activateTab(tab);
    };
    stripHost.insertBefore(chip, addBtn);
  });
  /* 活动胶囊滚入视野 */
  const on = stripHost.querySelector('.br-tab.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  persistTabs();
}

/* ============ 起始页（共享的「新标签页」） ============ */
function buildStartPage() {
  const page = el('div', 'page-body br-start');
  page.innerHTML = `
    <div class="br-hero">
      <div class="br-searchbar" id="br-search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
        <input placeholder="搜索或输入网址名称" id="br-input" enterkeyhint="go">
      </div>
    </div>

    <div class="br-quick" id="br-quick">
      ${QUICK_LINKS.map(q => `
        <button class="br-ql" data-url="${q.url}">
          <div class="br-ql-icon">${q.mark || `<span style="color:${q.color}">${q.glyph}</span>`}</div>
          <span>${q.name}</span>
        </button>`).join('')}
    </div>

    <div class="inset-group br-sec">
      <div class="inset-card">
        <div class="row" id="br-privacy">
          <div class="row-icon" style="background:var(--accent)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l7.5 3v6c0 5-3.2 8.6-7.5 10-4.3-1.4-7.5-5-7.5-10v-6z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg></div>
          <div class="row-label">隐私报告</div>
          <div class="row-val" id="br-privacy-val">—</div>
          <div class="row-chevron"><svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg></div>
        </div>
      </div>
    </div>

    <div class="br-sec">
      <div class="br-sec-title">书签</div>
      <div class="inset-card" id="br-bookmarks"></div>
    </div>
    <div class="br-sec">
      <div class="br-sec-title">最近访问</div>
      <div class="inset-card" id="br-history"></div>
    </div>`;

  const input = page.querySelector('#br-input');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(input.value.trim()); });
  page.querySelectorAll('.br-ql').forEach(b => b.onclick = () => go(b.dataset.url));

  loadBookmarks(page.querySelector('#br-bookmarks'));
  loadHistory(page.querySelector('#br-history'));
  loadPrivacy(page);
  return page;
}

function refreshStart() {
  if (!startPage || !startPage.isConnected) return;
  loadBookmarks(startPage.querySelector('#br-bookmarks'));
  loadHistory(startPage.querySelector('#br-history'));
  loadPrivacy(startPage);
}

/* 回到活动标签的起始页（网页视图关闭） */
function showStart() {
  if (!activeTab) return;
  activeTab.url = '';
  activeTab.title = '';
  if (activeTab.webEl) { activeTab.webEl.remove(); activeTab.webEl = null; }
  [...contentHost.children].forEach(ch => { ch.style.display = 'none'; });
  startPage.style.display = '';
  iframe = null;
  refreshStart();
  renderStrip();
  persistTabs();
}

/* 在活动标签内导航（新标签页/搜索/快捷/书签触发） */
function navigate(url) {
  if (!activeTab) createTab({ activate: true });
  const tab = activeTab;
  tab.url = url;
  tab.title = hostOf(url);
  tab.webEl = null; // 重建视图（避免旧 iframe 状态混入）
  const web = ensureWebEl(tab);
  [...contentHost.children].forEach(ch => { ch.style.display = 'none'; });
  web.style.display = '';
  iframe = web.querySelector('iframe');
  renderStrip();
  persistTabs();
  recordHistory(url);
}

function go(q) {
  if (!q) return;
  let url = q;
  if (!/^https?:\/\//i.test(q)) {
    /* 域名（可含端口）直接补协议，否则视为搜索词 */
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(q)) url = 'https://' + q;
    else url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(q);
  }
  navigate(url);
}

/* ============ 网页视图（提示条 + 进度条 + iframe + 底部工具栏） ============ */
function buildWebEl(tab) {
  const url = tab.url;
  const web = el('div', 'br-web');
  web.innerHTML = `
    <div class="br-notice" id="br-notice">
      <span>部分网站会拒绝被内嵌显示，若空白请点 ↗ 打开</span>
      <button class="br-open">↗ 新标签</button>
      <button class="br-notice-x">✕</button>
    </div>
    <div class="br-progress"><i class="br-progress-bar"></i></div>
    <iframe class="br-frame" src="${escapeHtml(url)}" referrerpolicy="no-referrer"></iframe>
    <div class="br-toolbar">
      <button class="brw-back" title="返回起始页">${CHEV_L}</button>
      <button class="brw-share" title="在新窗口打开">${SHARE_I}</button>
      <button class="brw-bookmark" title="添加书签">${BOOK_I}</button>
      <button class="brw-reload" title="刷新">${RELOAD_I}</button>
    </div>`;

  const frame = web.querySelector('.br-frame');
  const bar = web.querySelector('.br-progress-bar');
  const progress = web.querySelector('.br-progress');

  /* 加载进度条：0 → 82% 匀速推进，onload 时补满并淡出 */
  progress.classList.add('on');
  bar.style.transition = 'none';
  bar.style.width = '12%';
  requestAnimationFrame(() => {
    bar.style.transition = 'width 1.6s ease-out';
    bar.style.width = '82%';
  });
  frame.onload = () => {
    bar.style.transition = 'width .25s ease-out';
    bar.style.width = '100%';
    setTimeout(() => { progress.classList.remove('on'); bar.style.width = '0'; }, 380);
  };

  /* 底部工具栏（iOS Safari 布局，作用于本标签） */
  web.querySelector('.brw-back').onclick = () => { haptic(6); showStart(); };
  web.querySelector('.brw-share').onclick = () => window.open(url, '_blank');
  web.querySelector('.brw-bookmark').onclick = () => addBookmark(url);
  web.querySelector('.brw-reload').onclick = () => {
    haptic(6);
    frame.src = url;
    recordHistory(url);
  };

  /* 内嵌提示条：5 秒自动收起 */
  const notice = web.querySelector('.br-notice');
  web.querySelector('.br-open').onclick = () => window.open(url, '_blank');
  web.querySelector('.br-notice-x').onclick = () => notice.classList.add('min');
  setTimeout(() => notice.classList.add('min'), 5000);

  return web;
}

/* 隐私报告（本地数据统计，Safari 风格表达） */
async function loadPrivacy(scope) {
  try {
    const [hist, bms] = await Promise.all([DB.count('history'), DB.count('bookmarks')]);
    const sites = new Set((await DB.all('history')).map(h => hostOf(h.url))).size;
    const val = scope.querySelector('#br-privacy-val');
    if (val) val.textContent = sites ? `${sites} 个网站` : '无记录';
    scope.querySelector('#br-privacy').onclick = () => {
      dialog({
        title: '隐私报告',
        message: `过去一段时间：\n· 浏览过 ${sites} 个网站（${hist} 条历史）\n· 收藏了 ${bms} 个书签\n· 共 ${tabs.length} 个标签页\n· 所有记录仅保存在本机 IndexedDB，不上传任何服务器`,
        buttons: [{ text: '了解隐私' }, { text: '好' }],
      });
    };
  } catch (e) { /* noop */ }
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}

async function recordHistory(url) {
  const hist = await DB.byIndex('history', 'visitedAt');
  const last = hist[0];
  if (last && last.url === url) { last.visitedAt = Date.now(); await DB.put('history', last); return; }
  await DB.put('history', { id: uid('h'), url, title: hostOf(url), visitedAt: Date.now() });
}

async function loadHistory(listEl) {
  const hist = (await DB.byIndex('history', 'visitedAt')).slice(0, 10);
  if (!hist.length) {
    listEl.innerHTML = `<div class="row static br-empty">暂无历史记录</div>`;
    return;
  }
  listEl.innerHTML = '';
  hist.forEach(h => {
    const row = el('div', 'row');
    row.innerHTML = `<div class="row-label"><div class="ellipsis" style="font-size:15px">${escapeHtml(h.title)}</div>
      <div style="font-size:11.5px;color:var(--text-3)">${fmtSmartTime(h.visitedAt)}</div></div>
      <div class="row-chevron"><svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg></div>`;
    row.onclick = () => navigate(h.url);
    listEl.appendChild(row);
  });
}

async function loadBookmarks(listEl) {
  const bms = (await DB.byIndex('bookmarks', 'visitedAt')).slice(0, 8);
  if (!bms.length) {
    listEl.innerHTML = `<div class="row static br-empty">暂无书签 · 在网页中点 ⚑ 收藏</div>`;
    return;
  }
  listEl.innerHTML = '';
  bms.forEach(b => {
    const row = el('div', 'row');
    row.innerHTML = `<div class="row-label"><div class="ellipsis" style="font-size:15px">${escapeHtml(b.title)}</div>
      <div style="font-size:11.5px;color:var(--text-3)" class="ellipsis">${escapeHtml(b.url)}</div></div>`;
    row.onclick = () => navigate(b.url);
    row.oncontextmenu = async (e) => { e.preventDefault(); await DB.del('bookmarks', b.id); loadBookmarks(listEl); };
    listEl.appendChild(row);
  });
}

async function addBookmark(url) {
  if (!url) return;
  const name = await promptDialog('添加书签', hostOf(url), { value: hostOf(url), okText: '收藏' });
  if (name === null) return;
  await DB.put('bookmarks', { id: uid('bm'), url, title: name || hostOf(url), visitedAt: Date.now() });
  toast('已加入书签');
}
