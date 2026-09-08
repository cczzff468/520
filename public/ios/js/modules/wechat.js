/* ============ 微信（AI聊天核心） ============ */

import { el, qs, qsa, Bus, uid, haptic, fmtTime, fmtSmartTime, debounce, downloadJSON, onSwipe, pinyinInitial } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, dialog, confirmDialog, promptDialog, escapeHtml, loading, sheet } from '../core/ui.js';
import { Apps as AppIcons, TIcons } from '../core/icons.js';
import { chatComplete, getApiConfig, describeImage } from '../api/chat.js';

const PAGE = 30;
const EMOJIS = '😀 😄 😅 😂 🤣 🙂 😉 😍 🤔 🤨 😮 😢 😭 😠 🤯 😴 🤗 🤫 🤭 🥳 🥺 😎 🤓 😇 😈 🙄 😲 🤝 👍 👎 👊 ✌️ 🤞 👌 👏 🙏 💪 ❤️ 💔 💯 🔥 ✨ 🌟 🎉 🎁 🍉 🍎 ☕ 🍜 ⚽ 🎮 🎧 📱 💻 🚀 🌈 ☀️ 🌙 ⛅ 🌧️ ❄️ 🐱 🐶 🐼'.split(' ');

let nav = null;
let root = null;
let ctxRef = null;
let currentChat = null; // { convId, el, listEl, bottomBar, msgs, loadedAll }
const cleanups = [];

export default {
  id: 'wechat',
  name: '微信',
  icon: AppIcons.wechat,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl; ctxRef = ctx;
    root.innerHTML = '';

    /* 主结构：Tab 内容 + TabBar + 全屏导航层 */
    const tabContent = el('div', '');
    tabContent.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;position:relative;overflow:hidden;background:var(--bg);';
    const tabbar = el('div', 'tabbar');
    const tabs = [
      { key: 'msgs', label: '消息', icon: TIcons.chat },
      { key: 'contacts', label: '通讯录', icon: TIcons.users },
      { key: 'discover', label: '发现', icon: TIcons.discover },
      { key: 'me', label: '我', icon: TIcons.me },
    ];
    const tabEls = [];
    tabs.forEach((t, i) => {
      const item = el('div', 'tab-item' + (i === 0 ? ' on' : ''));
      item.innerHTML = `${t.icon}<span>${t.label}</span>`;
      item.onclick = () => { if (item.classList.contains('on')) return; haptic(4); switchTab(t.key); };
      tabEls.push(item); tabbar.appendChild(item);
    });
    root.append(tabContent, tabbar);
    this._tabContent = tabContent;
    this._tabEls = tabEls;

    /* 全屏导航层（聊天页等） */
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:20;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    switchTab('msgs');

    Bus.on('wechat:refresh', renderConvList);
    cleanups.push(() => Bus.off('wechat:refresh', renderConvList));

    // 处理来自其他应用（通讯录/相机）的跳转请求
    const pendingConv = sessionStorage.getItem('openConv');
    if (pendingConv) {
      sessionStorage.removeItem('openConv');
      setTimeout(() => openChat(pendingConv), 260);
    }
  },

  unmount() {
    currentChat = null;
    cleanups.forEach(fn => fn());
    cleanups.length = 0;
  },
};

/* ============ Tab 切换 ============ */
function switchTab(key) {
  const c = getTabContent(); c.innerHTML = '';
  qsa('.tab-item', root).forEach(x => x.classList.remove('on'));
  const idx = { msgs: 0, contacts: 1, discover: 2, me: 3 }[key];
  root.querySelectorAll('.tabbar .tab-item')[idx].classList.add('on');
  if (key === 'msgs') renderConvList();
  else if (key === 'contacts') renderContacts();
  else if (key === 'discover') renderDiscover();
  else if (key === 'me') renderMe();
}

/* ============ Tab 1：消息列表 ============ */
async function renderConvList() {
  const c = getTabContent(); c.innerHTML = '';
  const navPage = el('div', 'nav-page');
  navPage.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.style.minHeight = 'calc(var(--sb-h) + 44px)';
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">微信</div><div class="nav-side right"></div>`;
  const plusBtn = navBtn('<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => {
    actionSheet([
      { text: '发起群聊', value: 'group' },
      { text: '添加朋友', value: 'add' },
    ]).then(v => {
      if (v === 'add') showAddFriend();
      if (v === 'group') createGroupChat();
    });
  });
  navBar.querySelector('.nav-side.right').appendChild(plusBtn);
  const body = el('div', 'page-body');
  navPage.append(navBar, body);
  c.appendChild(navPage);

  const search = el('div', 'searchbar');
  search.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg><input placeholder="搜索消息、联系人、聊天记录">`;
  body.appendChild(search);
  const searchInput = search.querySelector('input');
  searchInput.addEventListener('input', debounce(async () => {
    renderConvRows(body, searchInput.value.trim());
  }, 250));

  renderConvRows(body, '');
  emitUnread();
}

async function renderConvRows(body, keyword) {
  let listEl = body.querySelector('.conv-list');
  if (!listEl) { listEl = el('div', 'conv-list'); body.appendChild(listEl); }
  listEl.innerHTML = '<div style="display:flex;justify-content:center;padding:30px"><div class="spinner"></div></div>';

  let convs = await DB.byIndex('conversations', 'updatedAt');
  if (keyword) {
    const k = keyword.toLowerCase();
    convs = convs.filter(cn => (cn.name || '').toLowerCase().includes(k) || (cn.lastMessage || '').toLowerCase().includes(k));
    // 全文消息搜索
    const allMsgs = await DB.all('messages');
    const matched = allMsgs.filter(m => (m.content || '').toLowerCase().includes(k));
    const convIds = new Set(convs.map(c => c.id));
    const extra = matched.map(m => m.conversationId).filter(id => !convIds.has(id));
    for (const cid of extra) {
      const conv = await DB.get('conversations', cid);
      if (conv) convs.push(conv);
    }
    if (matched.length && !convs.length) { /* 无会话但有消息结果 */ }
  }
  convs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);

  listEl.innerHTML = '';
  if (!convs.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="es-title">暂无会话</div><div>点击右上角 + 发起聊天</div></div>`;
    return;
  }
  for (const conv of convs) {
    listEl.appendChild(convRow(conv));
  }
}

function convRow(conv) {
  const row = el('div', 'row conv-row');
  row.innerHTML = `
    <div class="avatar av-sil ${conv.type === 'group' ? 'group' : ''}" style="width:47px;height:47px"></div>
    <div class="row-label" style="min-width:0">
      <div style="display:flex;align-items:center;gap:6px">
        <span class="conv-name ellipsis" style="font-weight:600;font-size:16.5px">${escapeHtml(conv.name)}</span>
        ${conv.pinned ? '<span style="font-size:10px;color:var(--text-3)">置顶</span>' : ''}
      </div>
      <div class="conv-preview clamp2" style="font-size:13.5px;color:var(--text-2);margin-top:3px">${escapeHtml(conv.lastMessage || '')}</div>
    </div>
    <div style="flex:none;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:5px">
      <span style="font-size:12px;color:var(--text-3)">${fmtSmartTime(conv.updatedAt)}</span>
      ${conv.unread > 0 ? `<span class="badge ${conv.type === 'group' ? 'green' : ''}" style="font-size:11.5px">${conv.unread > 99 ? '99+' : conv.unread}</span>` : ''}
    </div>`;
  row.onclick = () => openChat(conv.id);
  // 左滑菜单
  attachSwipeMenu(row, conv);
  return row;
}

function attachSwipeMenu(row, conv) {
  let open = false; let menu = null;
  const close = () => { if (menu) { menu.remove(); menu = null; open = false; row.style.transform = ''; } };
  row.addEventListener('touchstart', (e) => { const x = e.touches[0].clientX; row._sx = x; row._sy = e.touches[0].clientY; }, { passive: true });
  row.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - (row._sx || 0);
    const dy = e.touches[0].clientY - (row._sy || 0);
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx < -30 && !open) {
      open = true;
      closeOthersSwipe();
      menu = buildConvMenu(conv, close);
      row.appendChild(menu);
      row.style.transform = 'translateX(-158px)';
    }
  }, { passive: true });
  row.addEventListener('touchend', (e) => {
    const dx = (e.changedTouches[0].clientX || 0) - (row._sx || 0);
    if (dx > 40) close();
  }, { passive: true });
  document.addEventListener('click', close);
  if (cleanups.length === 0) cleanups.push(() => document.removeEventListener('click', close));
}
let swipeCloser = [];
function closeOthersSwipe() { swipeCloser.forEach(fn => fn()); swipeCloser = []; }
function buildConvMenu(conv, onClose) {
  const menu = el('div', 'swipe-menu');
  const mk = (label, danger, fn) => {
    const b = el('button', danger ? 'danger' : '');
    b.textContent = label;
    b.onclick = async (e) => {
      e.stopPropagation();
      await fn();
  if (onClose) onClose();
      renderConvList();
    };
    return b;
  };
  menu.append(
    mk(conv.pinned ? '取消置顶' : '置顶', false, async () => { conv.pinned = !conv.pinned; await DB.put('conversations', conv); }),
    mk(conv.unread > 0 ? '标为已读' : '标为未读', false, async () => { conv.unread = conv.unread > 0 ? 0 : 1; await DB.put('conversations', conv); emitUnread(); }),
    mk('删除', true, async () => {
      const ok = await confirmDialog('删除会话', `删除与「${conv.name}」的会话及全部聊天记录？`, { okText: '删除', danger: true });
      if (!ok) return;
      const msgs = await DB.byIndex('messages', 'conversationId', conv.id);
      for (const m of msgs) await DB.del('messages', m.id);
      await DB.del('conversations', conv.id);
      emitUnread();
    }),
  );
  swipeCloser.push(() => { menu?.remove(); });
  return menu;
}

async function emitUnread() {
  const convs = await DB.all('conversations');
  Bus.emit('wechat:unread', convs.reduce((s, c) => s + (c.unread || 0), 0));
}

/* 头像统一：灰底人形剪影（真实微信默认头像），不再使用彩色 emoji */

/* ============ 聊天页 ============ */
async function openChat(convId) {
  const conv = await DB.get('conversations', convId);
  if (!conv) return;
  if (conv.unread) { conv.unread = 0; await DB.put('conversations', conv); emitUnread(); }

  let contact = null;
  if (conv.type === 'single') contact = await DB.get('contacts', conv.contactId);

  const page = nav.makePage({
    title: conv.name,
    chevBack: true,
    right: [navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>', () => chatMenu(conv))],
    build(body) {
      body.classList.add('chat-body');
      body.innerHTML = `
        <div class="pull-hint"><div class="pull-spinner" style="display:none;margin:0 auto 4px" ><div class="spinner" style="width:16px;height:16px;border-width:2px"></div></div><span class="pull-text"></span></div>
        <div class="chat-list"></div>`;
      const listEl = body.querySelector('.chat-list');

      const inputBar = el('div', 'chat-input-bar');
      inputBar.innerHTML = `
        <button class="cib-emoji" title="表情"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5s1.2 1.8 3.5 1.8 3.5-1.8 3.5-1.8"/><circle cx="9" cy="10" r=".6" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".6" fill="currentColor" stroke="none"/></svg></button>
        <div class="chat-input-wrap"><input class="chat-input" placeholder="发送消息…" enterkeyhint="send"></div>
        <button class="cib-plus" title="更多"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/></svg></button>
        <button class="cib-send">发送</button>`;
      body.parentNode.appendChild(inputBar);

      currentChat = { conv, contact, listEl, body, inputBar, msgs: [], loadedAll: false, streaming: false };

      // 事件绑定
      const input = inputBar.querySelector('.chat-input');
      const sendBtn = inputBar.querySelector('.cib-send');
      const trySend = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        autoGrow(input);
        sendUserMessage(conv, text, null, null);
      };
      sendBtn.onclick = trySend;
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); trySend(); } });
      input.addEventListener('input', () => autoGrow(input));

      inputBar.querySelector('.cib-emoji').onclick = () => showEmojiPanel(body, input);
      inputBar.querySelector('.cib-plus').onclick = () => showPlusPanel(conv, body);

      // 下拉加载历史
      bindPullHistory(conv, body, listEl);

      // 初始加载
      loadHistory(conv, listEl, true);
    },
  });
  page.el.classList.add('chat-page');
  nav.push(page);
}

function autoGrow(input) { input.style.height = 'auto'; input.style.height = Math.min(96, input.scrollHeight) + 'px'; }

async function loadHistory(conv, listEl, scrollBottom) {
  const chat = currentChat;
  const msgs = await DB.byIndex('messages', 'conversationId', conv.id);
  const start = Math.max(0, msgs.length - PAGE - (chat.msgs.length ? 0 : 0));
  const slice = msgs.slice(Math.max(0, msgs.length - PAGE));
  chat.msgs = msgs;
  chat.loadedAll = msgs.length <= PAGE;
  listEl.innerHTML = '';
  for (const m of slice) listEl.appendChild(msgRow(conv, m));
  if (scrollBottom) scrollToBottom(true);
}

function bindPullHistory(conv, body, listEl) {
  let startY = 0, pulling = false;
  const hint = body.querySelector('.pull-hint');
  const text = hint.querySelector('.pull-text');
  body.addEventListener('touchstart', (e) => {
    if (body.scrollTop <= 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0 && body.scrollTop <= 0) {
      text.textContent = dy > 70 ? '松开加载更早消息' : '下拉加载更早消息';
      hint.style.height = Math.min(44, dy / 2.4) + 'px';
    }
  }, { passive: true });
  body.addEventListener('touchend', async (e) => {
    if (!pulling) return;
    pulling = false;
    const dy = (e.changedTouches[0].clientY || 0) - startY;
    hint.style.height = '28px';
    text.textContent = '';
    if (dy > 70 && currentChat && !currentChat.loadedAll) {
      hint.querySelector('.pull-spinner').style.display = 'block';
      const all = currentChat.msgs;
      const shown = listEl.querySelectorAll('.msg-row').length;
      const prev = all.slice(Math.max(0, all.length - shown - PAGE), all.length - shown);
      if (prev.length) {
        const frag = document.createDocumentFragment();
        prev.forEach(m => frag.appendChild(msgRow(conv, m)));
        listEl.prepend(frag);
        if (all.length - shown - prev.length <= 0) currentChat.loadedAll = true;
      }
      await sleep(400);
      hint.querySelector('.pull-spinner').style.display = 'none';
    }
  }, { passive: true });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function scrollToBottom(force) {
  const body = currentChat?.body;
  if (!body) return;
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
}

/* ---------- 消息行渲染 ---------- */
function msgRow(conv, m) {
  const mine = m.role === 'user';
  const row = el('div', 'msg-row' + (mine ? ' me' : ''));
  row.dataset.id = m.id;

  let senderLabel = '';
  if (!mine && conv.type === 'group') {
    const memberColor = { 'c_poet': '#E645A5', 'c_dev': '#34C759', 'c_ai': '#0A84FF' }[m.senderId] || 'var(--text-2)';
    senderLabel = `<div class="msg-sender" style="color:${memberColor}">${escapeHtml(m.senderName || '')}</div>`;
  }

  let avatarHtml = '';
  if (!mine) {
    avatarHtml = `<div class="avatar av-sil ${conv.type === 'group' ? 'group' : ''} msg-avatar" style="width:36px;height:36px"></div>`;
  }

  let contentHtml;
  if (m.images && m.images.length) {
    contentHtml = `<img class="msg-image" src="${m._thumb || ''}" data-photo="${m.images[0]}">`;
  } else {
    contentHtml = `<div class="bubble">${m.quote ? `<div class="msg-quote"><span>${escapeHtml(m.quote.author)}: ${escapeHtml(m.quote.text)}</span></div>` : ''}<span class="msg-text">${renderRich(m.content || '')}</span>${m.edited ? '<span class="msg-edited">已编辑</span>' : ''}</div>`;
  }

  const statusHtml = mine ? `<div class="msg-status" data-status="${m.status || 'sent'}">${statusIcon(m.status)}</div>` : '';
  row.innerHTML = `${avatarHtml}<div class="msg-main">${senderLabel}<div class="msg-bubble-wrap">${contentHtml}${statusHtml}</div><div class="msg-time">${fmtTime(m.timestamp)}</div></div>`;

  // 图片消息懒加载缩略图
  const img = row.querySelector('.msg-image');
  if (img) {
    DB.get('photos', m.images[0]).then(p => { if (p && img.isConnected) img.src = p.thumb || p.data; });
    img.onclick = async () => {
      const { default: photosApp } = await import('./photos.js');
      photosApp.viewPhoto(m.images[0]);
    };
  }

  // 长按菜单
  bindMsgLongPress(row, conv, m);
  return row;
}

function statusIcon(status) {
  if (status === 'sending') return `<div class="spinner" style="width:12px;height:12px;border-width:1.6px"></div>`;
  if (status === 'failed') return `<span style="color:var(--danger);font-weight:700">!</span>`;
  if (status === 'read') return `<svg width="15" height="11" viewBox="0 0 18 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1 7.5l3.5 3.5L10 4"/><path d="M7 8.5l2 2.5L15 4"/></svg>`;
  return `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1.5 6.5l3 3L10.5 2.5"/></svg>`;
}

function bindMsgLongPress(row, conv, m) {
  let timer = null;
  const start = (e) => {
    const pt = e.touches ? e.touches[0] : e;
    timer = setTimeout(async () => {
      haptic(30);
      const actions = [
        { text: '复制', value: 'copy' },
      ];
      if (m.role === 'user' && !(m.images && m.images.length)) actions.push({ text: '编辑', value: 'edit' });
      if (!(m.images && m.images.length)) actions.push({ text: '引用', value: 'quote' });
      actions.push({ text: '删除', value: 'del', danger: true });
      if (m.status === 'failed') actions.unshift({ text: '重新发送', value: 'retry' });
      const v = await actionSheet(actions, { title: (m.content || '[图片]').slice(0, 20) });
      if (!v) return;
      if (v === 'copy') { navigator.clipboard?.writeText(m.content || ''); toast('已复制'); }
      if (v === 'edit') {
        const val = await promptDialog('编辑消息', '', { value: m.content, okText: '保存' });
        if (val !== null && val.trim()) {
          m.content = val.trim(); m.edited = true;
          await DB.put('messages', m);
          refreshMsgRow(conv, m);
        }
      }
      if (v === 'quote') { setQuote(conv, m); }
      if (v === 'del') {
        await DB.del('messages', m.id);
        row.remove();
        toast('已删除');
      }
      if (v === 'retry') {
        await DB.del('messages', m.id);
        row.remove();
        sendUserMessage(conv, m.content, null, null);
      }
    }, 480);
    row._pt = { x: pt.clientX, y: pt.clientY };
  };
  const cancel = (e) => {
    if (timer) clearTimeout(timer);
    if (e.touches) {
      const pt = e.touches[0];
      if (Math.abs(pt.clientX - row._pt.x) > 10 || Math.abs(pt.clientY - row._pt.y) > 10) { clearTimeout(timer); }
    }
  };
  row.addEventListener('touchstart', start, { passive: true });
  row.addEventListener('touchmove', cancel, { passive: true });
  row.addEventListener('touchend', () => timer && clearTimeout(timer));
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); });
}

function refreshMsgRow(conv, m) {
  const row = currentChat?.listEl?.querySelector(`[data-id="${m.id}"]`);
  if (row) row.replaceWith(msgRow(conv, m));
}

/* ---------- 轻量 Markdown 渲染（AI回复） ---------- */
function renderRich(text) {
  let s = escapeHtml(text || '');
  s = s.replace(/\n/g, '<br>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|<br>)/g, '$1<i>$2</i>');
  s = s.replace(/`([^`\n]+)`/g, '<span class="md-code">$1</span>');
  s = s.replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>');
  return s;
}

/* ---------- 引用 ---------- */
function setQuote(conv, m) {
  if (!currentChat) return;
  let quoteBar = currentChat.body.querySelector('.quote-bar');
  if (!quoteBar) {
    quoteBar = el('div', 'quote-bar');
    currentChat.body.parentNode.insertBefore(quoteBar, currentChat.inputBar);
  }
  const author = m.role === 'user' ? '我' : (m.senderName || currentChat.conv.name);
  quoteBar.innerHTML = `<span class="qb-text ellipsis"></span><button class="qb-x">×</button>`;
  quoteBar.querySelector('.qb-text').textContent = `回复 ${author}: ${m.content.slice(0, 40)}`;
  quoteBar.querySelector('.qb-x').onclick = () => quoteBar.remove();
  quoteBar._quote = { author, text: m.content.slice(0, 60) };
  currentChat.body.querySelector('.chat-input')?.focus();
}

/* ---------- 发送 ---------- */
async function sendUserMessage(conv, text, images, photoThumb) {
  if (currentChat?.streaming) { toast('AI 正在回复中…'); return; }
  const quoteEl = currentChat?.body?.parentNode?.querySelector('.quote-bar');
  const quote = quoteEl?._quote || null;
  if (quoteEl) quoteEl.remove();

  const msg = {
    id: uid('m'), conversationId: conv.id, role: 'user',
    content: text, images: images || undefined, quote: quote || undefined,
    timestamp: Date.now(), status: 'sending',
  };
  msg._thumb = photoThumb;
  await DB.put('messages', msg);
  currentChat.msgs.push(msg);

  if (currentChat && currentChat.conv.id === conv.id) {
    const row = msgRow(conv, msg);
    currentChat.listEl.appendChild(row);
    scrollToBottom();
  }
  conv.lastMessage = images && images.length ? '[图片] ' + (text || '') : text;
  conv.updatedAt = Date.now();
  await DB.put('conversations', conv);

  setTimeout(async () => { msg.status = 'sent'; await DB.put('messages', msg); refreshMsgRow(conv, msg); }, 350);

  // AI 回复
  aiReply(conv, msg);
}

async function aiReply(conv, userMsg) {
  if (conv.type === 'single') {
    const contact = await DB.get('contacts', conv.contactId);
    if (!contact || !contact.isAI) return cannedReply(conv, contact, userMsg);
    return llmReply(conv, contact, userMsg);
  }
  // 群聊：选择回复成员
  const members = (conv.members || []).filter(id => id !== 'me');
  const contacts = [];
  for (const id of members) { const c = await DB.get('contacts', id); if (c?.isAI) contacts.push(c); }
  if (!contacts.length) return;
  let responder = null;
  const atMatch = userMsg.content?.match(/@([\u4e00-\u9fa5\w]+)\s/);
  if (atMatch) responder = contacts.find(c => c.name.includes(atMatch[1]) || atMatch[1].includes(c.name));
  if (!responder) responder = contacts[Math.floor(Math.random() * contacts.length)];
  await llmReply(conv, responder, userMsg);
  // 40% 概率另一位成员也回复
  if (Math.random() < 0.4 && contacts.length > 1) {
    const other = contacts.find(c => c.id !== responder.id);
    if (other) {
      await sleep(1200);
      await llmReply(conv, other, userMsg, true);
    }
  }
}

async function cannedReply(conv, contact, userMsg) {
  showTyping(conv);
  await sleep(900 + Math.random() * 1500);
  const pool = contact?.canned || ['收到'];
  const text = pool[Math.floor(Math.random() * pool.length)];
  hideTyping();
  await appendAssistantMsg(conv, { content: text, senderId: contact?.id, senderName: contact?.name });
}

async function llmReply(conv, contact, userMsg, secondReply = false) {
  const chat = currentChat;
  if (!chat || chat.conv.id !== conv.id) { // 聊天页已关闭：仅存库
    try { await callLLM(conv, contact, null); } catch (e) { console.warn(e); }
    return;
  }
  chat.streaming = true;
  showTyping(conv, contact?.name);

  // 标记我的消息为已读
  for (const m of chat.msgs) {
    if (m.role === 'user' && m.status === 'sent') { m.status = 'read'; await DB.put('messages', m); refreshMsgRow(conv, m); }
  }

  // 创建流式消息行
  const streamMsg = {
    id: uid('m'), conversationId: conv.id, role: 'assistant',
    senderId: conv.type === 'group' ? contact.id : undefined,
    senderName: conv.type === 'group' ? contact.name : undefined,
    content: '', timestamp: Date.now(), status: 'sending',
  };
  let row = null, textSpan = null;

  try {
    await callLLM(conv, contact, (delta) => {
      hideTyping();
      streamMsg.content += delta;
      if (!row || !row.isConnected) {
        hideTyping();
        row = msgRow(conv, streamMsg);
        chat.listEl.appendChild(row);
        textSpan = row.querySelector('.msg-text');
      }
      if (textSpan) textSpan.innerHTML = renderRich(streamMsg.content);
      scrollToBottom();
    });
    if (!streamMsg.content.trim()) throw new Error('回复为空');
    streamMsg.status = 'sent';
    streamMsg.timestamp = Date.now();
    await DB.put('messages', streamMsg);
    chat.msgs.push(streamMsg);
    if (row?.isConnected) row.replaceWith(msgRow(conv, streamMsg));
    conv.lastMessage = streamMsg.content.slice(0, 60);
    conv.updatedAt = Date.now();
    await DB.put('conversations', conv);
  } catch (e) {
    hideTyping();
    const aborted = e.name === 'AbortError';
    if (!aborted) {
      streamMsg.status = 'failed';
      if (row?.isConnected) row.replaceWith(msgRow(conv, streamMsg));
      toast('AI 回复失败：' + (e.message || '网络错误'), 3000);
      // 失败消息不落库，行内点击重试
      if (currentChat) {
        const failRow = currentChat.listEl.querySelector(`[data-id="${streamMsg.id}"]`);
        failRow?.addEventListener('click', () => {
          actionSheet([{ text: '重试', value: 'retry' }, { text: '关闭', value: 'close' }]).then(v => {
            if (v === 'retry') { failRow.remove(); aiReply(conv, userMsg); }
            else failRow.remove();
          });
        });
      }
    } else {
      row?.remove();
    }
  } finally {
    if (currentChat) currentChat.streaming = false;
    hideTyping();
  }
}

async function callLLM(conv, contact, onDelta) {
  const history = await DB.byIndex('messages', 'conversationId', conv.id);
  const recent = history.slice(-20);

  /* 图片识别：最近一条带图的用户消息，若无缓存描述则先识别（自定义图像API/内置视觉） */
  const lastImgMsg = [...recent].reverse().find(m => m.role === 'user' && m.images?.length && !m.imageDesc);
  if (lastImgMsg) {
    try {
      const photo = await DB.get('photos', lastImgMsg.images[0]);
      const dataUrl = photo?.data || photo?.thumb;
      if (dataUrl) {
        lastImgMsg.imageDesc = await describeImage({
          dataUrl,
          question: '用一到两句话客观描述这张图片（场景、主体、显著细节），供对话助手理解。',
        });
        if (lastImgMsg.status === 'sending') lastImgMsg.status = 'sent'; /* 识图较慢，避免把已发送状态回滚成发送中 */
        await DB.put('messages', lastImgMsg);
      }
    } catch (e) {
      console.warn('[vision]', e.message || e);
      lastImgMsg.imageDesc = null; // 失败不再重试，用占位文本
    }
  }

  const apiMsgs = [];
  if (contact?.prompt) {
    apiMsgs.push({ role: 'system', content: conv.type === 'group'
      ? `${contact.prompt}\n（当前你在群聊「${conv.name}」中，以「${contact.name}」的身份简短回复，一般不超过80字。）`
      : contact.prompt });
  } else {
    apiMsgs.push({ role: 'system', content: '你是用户的智能助手朋友，回复自然、简洁、友好，使用中文。' });
  }
  for (const m of recent) {
    if (m.role === 'user') {
      let content = m.content || '';
      if (m.images?.length) {
        content = (m.imageDesc ? `（用户发送了一张图片：${m.imageDesc}）` : '（用户发送了一张图片）') + content;
      }
      apiMsgs.push({ role: 'user', content });
    } else if (m.content) {
      apiMsgs.push({ role: 'assistant', content: m.content });
    }
  }
  return chatComplete({ messages: apiMsgs, onDelta });
}

async function appendAssistantMsg(conv, { content, senderId, senderName }) {
  const msg = {
    id: uid('m'), conversationId: conv.id, role: 'assistant',
    senderId, senderName, content, timestamp: Date.now(), status: 'sent',
  };
  await DB.put('messages', msg);
  if (currentChat && currentChat.conv.id === conv.id) {
    currentChat.listEl.appendChild(msgRow(conv, msg));
    scrollToBottom();
  }
  conv.lastMessage = content.slice(0, 60);
  conv.updatedAt = Date.now();
  await DB.put('conversations', conv);
}

/* ---------- 正在输入动画 ---------- */
function showTyping(conv, who) {
  hideTyping();
  if (!currentChat || currentChat.conv.id !== conv.id) return;
  const t = el('div', 'msg-row typing-row');
  const avatar = conv.type === 'single'
    ? `<div class="avatar av-sil msg-avatar" style="width:36px;height:36px;flex:none"></div>`
    : `<div class="avatar av-sil group msg-avatar" style="width:36px;height:36px;flex:none"></div>`;
  t.innerHTML = `${avatar}<div class="msg-main"><div class="bubble typing-bubble"><i></i><i></i><i></i></div><div class="msg-time">${who ? who + ' 正在输入…' : '对方正在输入…'}</div></div>`;
  currentChat.listEl.appendChild(t);
  scrollToBottom();
  currentChat._typingEl = t;
}
function hideTyping() {
  if (currentChat?._typingEl) { currentChat._typingEl.remove(); currentChat._typingEl = null; }
}

/* ---------- 表情面板 ---------- */
function showEmojiPanel(body, input) {
  let panel = body.querySelector('.emoji-panel');
  if (panel) { panel.remove(); return; }
  panel = el('div', 'emoji-panel');
  panel.innerHTML = `<div class="emoji-grid">${EMOJIS.map(e => `<button>${e}</button>`).join('')}</div>`;
  panel.querySelectorAll('button').forEach(b => {
    b.onclick = () => { input.value += b.textContent; input.focus(); };
  });
  body.parentNode.insertBefore(panel, currentChat.inputBar);
}

/* ---------- 加号面板（发图/拍照） ---------- */
function showPlusPanel(conv, body) {
  let panel = body.querySelector('.plus-panel');
  if (panel) { panel.remove(); return; }
  panel = el('div', 'plus-panel');
  panel.innerHTML = `
    <div class="pp-grid">
      <button class="pp-item" data-act="album"><div class="pp-icon" style="background:#0A84FF"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 15.5l-4.5-4.5-7 7"/></svg></div><span>相册</span></button>
      <button class="pp-item" data-act="camera"><div class="pp-icon" style="background:#FF9500"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div><span>拍照</span></button>
      <button class="pp-item" data-act="file"><div class="pp-icon" style="background:#34C759"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></div><span>文件</span></button>
    </div>`;
  body.parentNode.insertBefore(panel, currentChat.inputBar);
  panel.querySelector('[data-act="album"]').onclick = async () => {
    panel.remove();
    const photos = await DB.byIndex('photos', 'uploadDate');
    if (!photos.length) { toast('相册是空的，先去「相册」或「相机」添加照片吧'); return; }
    const sh = sheet({
      title: '发送图片',
      build(body, close) {
        body.innerHTML = `<div class="picker-grid">${photos.slice(0, 18).map(p => `<img src="${p.thumb || p.data}" data-id="${p.id}">`).join('')}</div>`;
        body.querySelectorAll('img').forEach(img => {
          img.onclick = () => {
            /* 修复预存Bug：原代码引用未定义的 s（ReferenceError）导致点选照片无法发送 */
            close();
            sendUserMessage(conv, '', [img.dataset.id], img.src);
          };
        });
      },
    });
    void sh;
  };
  panel.querySelector('[data-act="camera"]').onclick = async () => {
    panel.remove();
    const { closeApp, openApp } = await import('../core/applayer.js');
    closeApp();
    setTimeout(() => openApp('camera'), 300);
  };
  panel.querySelector('[data-act="file"]').onclick = () => {
    panel.remove();
    toast('演示环境暂不支持发送文件');
  };
}

/* ---------- 聊天页右上角菜单 ---------- */
async function chatMenu(conv) {
  const v = await actionSheet([
    { text: conv.type === 'group' ? '群公告' : 'TA 的资料', value: 'info' },
    { text: '导出聊天记录 (JSON)', value: 'export' },
    { text: '清空聊天记录', value: 'clear', danger: true },
  ]);
  if (!v) return;
  if (v === 'info') {
    if (conv.type === 'group') {
      await dialog({ title: '群公告', message: conv.announcement || '暂无公告', buttons: [{ text: '知道了' }] });
    } else {
      const contact = await DB.get('contacts', conv.contactId);
      await dialog({
        title: contact?.name || conv.name,
        message: `签名：${contact?.signature || '无'}\n微信号：${contact?.wxid || '—'}\n类型：${contact?.isAI ? 'AI 智能好友' : '普通联系人（模拟回复）'}`,
        buttons: [{ text: '好' }],
      });
    }
  }
  if (v === 'export') {
    const msgs = await DB.byIndex('messages', 'conversationId', conv.id);
    downloadJSON({ conversation: conv.name, exportedAt: new Date().toISOString(), messages: msgs }, `聊天记录-${conv.name}-${Date.now()}.json`);
    toast('已导出 JSON');
  }
  if (v === 'clear') {
    const ok = await confirmDialog('清空聊天记录', `将删除与「${conv.name}」的全部 ${conv.unread || ''}消息？此操作不可恢复。`, { okText: '清空', danger: true });
    if (!ok) return;
    const msgs = await DB.byIndex('messages', 'conversationId', conv.id);
    for (const m of msgs) await DB.del('messages', m.id);
    if (currentChat && currentChat.conv.id === conv.id) { currentChat.msgs = []; currentChat.listEl.innerHTML = ''; }
    conv.lastMessage = ''; conv.updatedAt = Date.now();
    await DB.put('conversations', conv);
    toast('已清空');
  }
}

/* ============ Tab 2：通讯录（真实微信：搜索 + 固定入口 + 字母分组 + 右侧选择栏） ============ */
const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>';

async function renderContacts() {
  const c = getTabContent(); c.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">通讯录</div><div class="nav-side right"></div>`;
  navBar.querySelector('.nav-side.right').appendChild(navBtn('<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => showAddFriend()));
  const body = el('div', 'page-body');
  page.append(navBar, body);
  c.appendChild(page);

  const search = el('div', 'searchbar');
  search.innerHTML = `${SEARCH_SVG}<input placeholder="搜索">`;
  body.appendChild(search);
  const input = search.querySelector('input');
  input.addEventListener('input', debounce(() => renderContactRows(body, input.value.trim()), 200));
  renderContactRows(body, '');
}

/* 真实微信通讯录固定入口 */
const CT_ENTRIES = [
  { label: '新的朋友', bg: 'linear-gradient(135deg,#FFC24B,#FF9500)', svg: '<circle cx="10" cy="9" r="4"/><path d="M4.5 19.5a5.5 5.5 0 0 1 11 0z"/><path d="M18 6.5v5M15.5 9h5"/>', fn: () => showAddFriend() },
  { label: '仅聊天的朋友', bg: 'linear-gradient(135deg,#8ED0FF,#4E9BFF)', svg: '<circle cx="9" cy="8.5" r="3.6"/><path d="M3.5 19a5.2 5.2 0 0 1 10.5 0z"/><path d="M15.5 12.5h5.2a1 1 0 0 1 1 1v3.2a1 1 0 0 1-1 1h-1.3l-1.9 1.7v-1.7h-2a1 1 0 0 1-1-1v-3.2a1 1 0 0 1 1-1z"/>', fn: () => toast('该功能暂未开放') },
  { label: '群聊', bg: 'linear-gradient(135deg,#7FE0C3,#2BB3A3)', svg: '<circle cx="8.8" cy="9" r="3.4"/><path d="M3.5 19a5.3 5.3 0 0 1 10.6 0z"/><circle cx="16.4" cy="10" r="2.9"/><path d="M11.6 19a4.7 4.7 0 0 1 9.4 0"/>', fn: () => createGroupChat() },
  { label: '标签', bg: 'linear-gradient(135deg,#FFD9A0,#FF9F45)', svg: '<path d="M9.2 4h5.6L20 9.2v5.6L14.8 20H9.2L4 14.8V9.2z"/><circle cx="12" cy="12" r="1.6"/>', fn: () => toast('该功能暂未开放') },
  { label: '公众号', bg: 'linear-gradient(135deg,#FDF1B8,#F0C24B)', svg: '<path d="M5 8.5a7 7 0 0 1 14 0v4.2a3 3 0 0 1-3 3h-1.2l-.9 3-2.4-3H8a3 3 0 0 1-3-3z"/><circle cx="9.5" cy="11" r=".8" fill="#fff" stroke="none"/><circle cx="14.5" cy="11" r=".8" fill="#fff" stroke="none"/>', fn: () => toast('该功能暂未开放') },
];

async function renderContactRows(body, keyword) {
  let list = body.querySelector('.contacts-list');
  if (!list) { list = el('div', 'contacts-list'); body.appendChild(list); }
  list.innerHTML = '';
  /* 旧选择栏清理（重渲染时） */
  body.parentNode.querySelector('.wx-idxbar')?.remove();

  let contacts = (await DB.all('contacts')).sort((a, b) => a.pinyin.localeCompare(b.pinyin) || a.name.localeCompare(b.name));
  if (keyword) {
    const k = keyword.toLowerCase();
    contacts = contacts.filter(ct => ct.name.toLowerCase().includes(k) || (ct.wxid || '').toLowerCase().includes(k));
  }

  /* 固定入口卡（搜索时不显示） */
  if (!keyword) {
    const entryCard = el('div', 'inset-card');
    CT_ENTRIES.forEach(en => {
      const row = el('div', 'row');
      row.innerHTML = `<div class="row-icon" style="background:${en.bg}"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${en.svg}</svg></div>
        <div class="row-label" style="font-size:16.5px">${en.label}</div><div class="row-chevron">${CHEV}</div>`;
      row.onclick = en.fn;
      entryCard.appendChild(row);
    });
    const eg = el('div', 'inset-group'); eg.style.margin = '0 0 6px';
    eg.appendChild(entryCard);
    list.appendChild(eg);
  }

  if (!contacts.length) {
    const hint = keyword ? '未找到匹配的联系人' : '右上角 + 添加朋友';
    list.innerHTML += `<div class="empty-state"><div class="es-title">暂无联系人</div><div>${hint}</div></div>`;
    return;
  }

  /* 字母分组（真实微信：灰底字母条 + 白底整行列表） */
  const grouped = new Map();
  contacts.forEach(ct => {
    const k = ct.pinyin || '#';
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(ct);
  });

  const pageHost = body.parentNode; /* .nav-page(static)，索引栏锚到 tab 容器不随滚动 */
  const idxbar = el('div', 'wx-idxbar');
  const letters = [];
  for (const [letter, arr] of grouped) {
    letters.push(letter);
    const t = el('div', 'contacts-letter');
    t.textContent = letter;
    t.dataset.letter = letter;
    list.appendChild(t);

    const block = el('div', 'contacts-block');
    arr.forEach(ct => {
      const row = el('div', 'row');
      row.innerHTML = `
        <div class="avatar av-sil" style="width:40px;height:40px"></div>
        <div class="row-label"><div style="font-size:16.5px">${escapeHtml(ct.name)}</div></div>`;
      row.onclick = () => showContactDetail(ct);
      block.appendChild(row);
    });
    list.appendChild(block);

    const idx = el('span', '', letter);
    idx.onclick = () => t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    idxbar.appendChild(idx);
  }
  pageHost.appendChild(idxbar);

  /* 滚动时高亮当前字母 */
  idxbar.querySelectorAll('span').forEach(sp => sp.classList.remove('on'));
  const markActive = () => {
    const st = body.scrollTop;
    let cur = null;
    for (const l of letters) {
      const h = list.querySelector(`.contacts-letter[data-letter="${l}"]`);
      if (h && h.offsetTop <= st + 60) cur = l;
    }
    idxbar.querySelectorAll('span').forEach(sp => sp.classList.toggle('on', sp.textContent === cur));
  };
  body.onscroll = markActive;
  markActive();
}

/* ---------- 联系人详情（真实微信风格） ---------- */
function showContactDetail(ct) {
  const page = nav.makePage({
    title: '', chevBack: true,
    build(body) {
      body.style.background = 'var(--bg)';
      body.innerHTML = `
        <div class="wx-d-card wx-d-head">
          <div class="avatar av-sil" style="width:64px;height:64px"></div>
          <div style="flex:1;min-width:0">
            <div class="wx-d-name">${escapeHtml(ct.name)}</div>
            <div class="wx-d-sub">微信号：${escapeHtml(ct.wxid || '—')}</div>
          </div>
        </div>
        <div class="wx-d-card">
          <div class="row"><div class="row-label" style="font-size:16.5px">设置备注和标签</div><div class="row-chevron">${CHEV}</div></div>
          <div class="row"><div class="row-label" style="font-size:16.5px">朋友权限</div><div class="row-val" style="font-size:13.5px">聊天、朋友圈等</div><div class="row-chevron">${CHEV}</div></div>
        </div>
        <div class="wx-d-card">
          <div class="row" id="cd-moments"><div class="row-label" style="font-size:16.5px">朋友圈</div><div class="row-chevron">${CHEV}</div></div>
          <div class="row" id="cd-more"><div class="row-label" style="font-size:16.5px">更多信息</div><div class="row-chevron">${CHEV}</div></div>
        </div>
        <div class="wx-d-card wx-d-act">
          <div class="row" id="cd-msg">
            <div class="row-icon"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.8-.3-4-.9L3 21l1.9-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg></div>
            <div class="row-label" style="font-size:16.5px">发消息</div>
          </div>
          <div class="row" id="cd-call">
            <div class="row-icon"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 4.5l-11 11 4 4 11-11a2.8 2.8 0 0 0-4-4z"/><path d="M14 6l4 4"/><path d="M6 18l-2.5 2.5M8.5 19.5L6 22"/></svg></div>
            <div class="row-label" style="font-size:16.5px">音视频通话</div>
          </div>
        </div>
        <div class="wx-d-card wx-d-danger"><div class="row" id="cd-del">删除联系人</div></div>`;
      body.querySelector('#cd-moments').onclick = () => openAppCompat('moments');
      body.querySelector('#cd-more').onclick = async () => {
        await dialog({
          title: '更多信息',
          message: `签名：${ct.signature || '无'}\n类型：${ct.isAI ? 'AI 智能好友' : '普通联系人（模拟回复）'}${ct.prompt ? `\n人设：${ct.prompt.slice(0, 80)}` : ''}`,
          buttons: [{ text: '好的' }],
        });
      };
      body.querySelector('#cd-msg').onclick = async () => {
        let conv = (await DB.all('conversations')).find(cn => cn.type === 'single' && cn.contactId === ct.id);
        if (!conv) {
          conv = { id: uid('conv'), type: 'single', contactId: ct.id, name: ct.name, lastMessage: '', updatedAt: Date.now(), unread: 0, pinned: false };
          await DB.put('conversations', conv);
        }
        nav.pop();
        openChat(conv.id);
      };
      body.querySelector('#cd-call').onclick = () => toast('演示环境暂不支持音视频通话');
      body.querySelector('#cd-del').onclick = async () => {
        const ok = await confirmDialog('删除联系人', `删除「${ct.name}」及与其的聊天记录？`, { okText: '删除', danger: true });
        if (!ok) return;
        const convs = (await DB.all('conversations')).filter(cn => cn.contactId === ct.id);
        for (const cn of convs) {
          const msgs = await DB.byIndex('messages', 'conversationId', cn.id);
          for (const m of msgs) await DB.del('messages', m.id);
          await DB.del('conversations', cn.id);
        }
        await DB.del('contacts', ct.id);
        nav.pop();
        renderContacts();
        toast('已删除');
      };
    },
  });
  nav.push(page);
}

/* ---------- 添加朋友（头像统一灰底剪影，不再选 emoji/颜色） ---------- */
function showAddFriend() {
  sheet({
    title: '添加朋友',
    build(body, close) {
      body.innerHTML = `
        <div class="inset-card" style="margin:0">
          <div class="row"><div class="row-label" style="color:var(--text-2)">名字</div><input class="row-input" id="af-name" placeholder="朋友的名字"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">签名</div><input class="row-input" id="af-sig" placeholder="一句话签名（可选）"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">AI 智能体</div><div class="switch on" id="af-ai"></div></div>
          <div id="af-prompt-wrap"><div class="row" style="align-items:flex-start"><div class="row-label" style="color:var(--text-2);flex:none;width:56px">人设</div><textarea id="af-prompt" rows="3" placeholder="描述TA的性格和回复风格，例如：你是一位温柔的插画师朋友…" style="flex:1;background:var(--fill);border-radius:9px;padding:9px 12px;font-size:14.5px;min-height:0"></textarea></div></div>
        </div>
        <div class="sheet-actions"><button class="btn-fill wechat-green" id="af-ok">添加</button></div>`;
      const sw = body.querySelector('#af-ai');
      sw.onclick = () => {
        sw.classList.toggle('on');
        body.querySelector('#af-prompt-wrap').style.display = sw.classList.contains('on') ? 'block' : 'none';
      };
      body.querySelector('#af-ok').onclick = async () => {
        const name = body.querySelector('#af-name').value.trim();
        if (!name) { toast('请填写名字'); return; }
        const isAI = sw.classList.contains('on');
        const prompt = body.querySelector('#af-prompt')?.value.trim() || '';
        const sig = body.querySelector('#af-sig').value.trim();
        const contact = {
          id: uid('c'), name, pinyin: pinyinOf(name),
          isAI, signature: sig || (isAI ? '一位新朋友' : '普通联系人'),
          prompt: isAI ? (prompt || `你是「${name}」，用户的好朋友。性格随和，回复自然简短。`) : undefined,
          canned: isAI ? undefined : ['好的', '收到~', '哈哈', '回头聊', '嗯嗯'],
          wxid: 'wx_' + Math.random().toString(36).slice(2, 10),
        };
        await DB.put('contacts', contact);
        close();
        toast('已添加「' + name + '」');
        if (nav.stack.length === 0) renderContacts();
      };
    },
  });
}

function pinyinOf(name) {
  return pinyinInitial(name);
}

/* ---------- 发起群聊 ---------- */
async function createGroupChat() {
  const contacts = (await DB.all('contacts')).filter(c => c.isAI);
  sheet({
    title: '发起群聊',
    build(body, close) {
      body.innerHTML = `
        <div style="font-size:13px;color:var(--text-2);padding-bottom:8px">选择至少 1 位 AI 成员：</div>
        <div class="inset-card" style="margin:0">${contacts.map(c => `
          <div class="row member-row" data-id="${c.id}"><div class="avatar av-sil" style="width:38px;height:38px"></div>
          <div class="row-label">${escapeHtml(c.name)}</div><div class="check-dot" style="margin-left:auto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M4.5 12.5l5 5 10-11"/></svg></div></div>`).join('')}
        </div>
        <div class="sheet-actions"><button class="btn-fill wechat-green" id="gp-ok">创建群聊</button></div>`;
      const picked = new Set();
      body.querySelectorAll('.member-row').forEach(r => {
        r.onclick = () => {
          const dot = r.querySelector('.check-dot');
          const on = dot.classList.toggle('on');
          if (on) { picked.add(r.dataset.id); } else { picked.delete(r.dataset.id); }
        };
      });
      body.querySelector('#gp-ok').onclick = async () => {
        if (!picked.size) { toast('至少选择一位成员'); return; }
        const name = await promptDialog('群聊名称', '给群聊起个名字', { placeholder: 'AI 茶话会', okText: '创建' });
        if (name === null || name === '') return;
        const conv = {
          id: uid('conv'), type: 'group', name: name.trim(),
          members: ['me', ...picked], announcement: '',
          lastMessage: '群聊已创建', updatedAt: Date.now(), unread: 0, pinned: false,
        };
        await DB.put('conversations', conv);
        close();
        openChat(conv.id);
      };
    },
  });
}

/* ============ Tab 3：发现 ============ */
const CHEV = '<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>';
const dIcon = (bg, svg) => `<div class="row-icon" style="background:${bg}"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></div>`;

/* 真实微信发现页：分组列表（朋友圈独立一组，无红点、无头像） */
function renderDiscover() {
  const c = getTabContent(); c.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">发现</div><div class="nav-side right" style="width:1px"></div>`;
  const body = el('div', 'page-body');
  page.append(navBar, body);
  c.appendChild(page);

  const notReady = () => toast('该功能暂未开放');
  const groups = [
    [
      { label: '朋友圈', icon: dIcon('linear-gradient(135deg,#FFD170,#FF9A3D)', '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3" fill="#fff" stroke="none"/>'), fn: () => openAppCompat('moments') },
    ],
    [
      { label: '扫一扫', icon: dIcon('linear-gradient(135deg,#5AC8FA,#0A84FF)', '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8"/><path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8"/><path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16"/><path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M4.5 12h15"/>'), fn: openScan },
      { label: '看一看', icon: dIcon('linear-gradient(135deg,#FFD60A,#FF9500)', '<path d="M2.8 12s3.4-5.8 9.2-5.8 9.2 5.8 9.2 5.8-3.4 5.8-9.2 5.8S2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.6"/>'), fn: notReady },
      { label: '搜一搜', icon: dIcon('linear-gradient(135deg,#7EDC7E,#34C759)', '<circle cx="11" cy="11" r="6.3"/><path d="M15.6 15.6L20 20"/>'), fn: notReady },
    ],
    [
      { label: '附近', icon: dIcon('linear-gradient(135deg,#FF9F6B,#FF6A3D)', '<path d="M12 21s-6.5-5.2-6.5-10.2a6.5 6.5 0 1 1 13 0C18.5 15.8 12 21 12 21z"/><circle cx="12" cy="10.8" r="2.3"/>'), fn: notReady },
      { label: '摇一摇', icon: dIcon('linear-gradient(135deg,#64E0C8,#2BB3A3)', '<rect x="9.5" y="3.5" width="5" height="17" rx="1.6" transform="rotate(-18 12 12)"/><path d="M4.8 9.5l1.6.7M4.8 14.5l1.6-.7M19.2 9.5l-1.6.7M19.2 14.5l-1.6-.7"/>'), fn: notReady },
    ],
    [
      { label: '购物', icon: dIcon('linear-gradient(135deg,#FF7A8A,#F5445C)', '<path d="M5.5 8.5h13l-1 11.3a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>'), fn: notReady },
      { label: '游戏', icon: dIcon('linear-gradient(135deg,#A58BFF,#7C5CFF)', '<path d="M7 9.5h10a4.4 4.4 0 0 1 4.3 3.5l.8 4.2a2.5 2.5 0 0 1-4.4 2l-1-1.4H7.3l-1 1.4a2.5 2.5 0 0 1-4.4-2l.8-4.2A4.4 4.4 0 0 1 7 9.5z"/><path d="M8.4 12.6v2.4M7.2 13.8h2.4"/><circle cx="15.4" cy="13.2" r=".7" fill="#fff" stroke="none"/><circle cx="17.3" cy="14.6" r=".7" fill="#fff" stroke="none"/>'), fn: notReady },
    ],
    [
      { label: '小程序', icon: dIcon('linear-gradient(135deg,#6EB5FF,#3D7DFF)', '<rect x="4" y="4" width="7" height="7" rx="2.2"/><rect x="13" y="4" width="7" height="7" rx="2.2"/><rect x="4" y="13" width="7" height="7" rx="2.2"/><path d="M14.6 14.6l4.8 4.8M19.4 14.6l-4.8 4.8"/>'), fn: showMiniPrograms },
    ],
  ];
  groups.forEach((items, gi) => {
    const g = el('div', 'inset-group');
    if (gi === 0) g.style.marginTop = '10px';
    if (gi === groups.length - 1) g.style.marginBottom = '30px';
    const card = el('div', 'inset-card');
    items.forEach(it => {
      const row = el('div', 'row');
      row.innerHTML = `${it.icon}<div class="row-label" style="font-size:16.5px">${it.label}</div><div class="row-chevron">${CHEV}</div>`;
      row.onclick = it.fn;
      card.appendChild(row);
    });
    g.appendChild(card);
    body.appendChild(g);
  });
}

async function openAppCompat(id) {
  const { openApp, closeApp } = await import('../core/applayer.js');
  closeApp();
  setTimeout(() => openApp(id), 360);
}

/* 扫一扫：自绘仿扫描界面（不调起真实相机），带扫描线动画 */
function openScan() {
  const page = nav.makePage({
    title: '',
    noNavbar: true,
    build(body) {
      body.classList.add('scan-body');
      body.innerHTML = `
        <div class="scan-top">
          <button class="scan-back" data-own-back aria-label="返回"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4.5l-7.5 7.5 7.5 7.5"/></svg></button>
          <div class="scan-title">扫一扫</div>
        </div>
        <div class="scan-stage">
          <div class="scan-frame">
            <i class="scan-c tl"></i><i class="scan-c tr"></i><i class="scan-c bl"></i><i class="scan-c br"></i>
            <div class="scan-line"></div>
          </div>
          <div class="scan-hint">将二维码 / 条码放入框内，即可自动扫描</div>
        </div>
        <div class="scan-bottom">
          <button class="scan-bt" id="scan-album">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 15.5l-4.5-4.5-7 7"/></svg>
            <span>相册</span>
          </button>
          <button class="scan-bt" id="scan-qr">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><path d="M13.5 13.5h3v3h-3zM17.5 17.5h3v3h-3z"/><path d="M13.8 20.5h3.9"/></svg>
            <span>我的二维码</span>
          </button>
        </div>`;
      body.querySelector('.scan-back').onclick = () => nav.pop();
      body.querySelector('#scan-album').onclick = () => toast('演示环境：可打开「相册」选择图片');
      body.querySelector('#scan-qr').onclick = async () => {
        await dialog({
          title: '我的二维码',
          message: '扫一扫功能为界面演示。\n这是你的专属二维码占位卡片。',
          buttons: [{ text: '好的' }],
        });
      };
    },
  });
  nav.push(page);
}

function showMiniPrograms() {
  sheet({
    title: '小程序',
    build(body) {
      const links = [
        { name: '百度', url: 'https://www.baidu.com', emoji: '🔍' },
        { name: '搜狗搜索', url: 'https://www.sogou.com', emoji: '🐕' },
        { name: '必应', url: 'https://www.bing.com', emoji: '🔷' },
        { name: '知乎', url: 'https://www.zhihu.com', emoji: '💬' },
      ];
      body.innerHTML = `<div class="inset-card" style="margin:0">${links.map(l => `
        <div class="row" data-url="${l.url}"><div class="row-icon" style="background:var(--fill-2);font-size:16px">${l.emoji}</div>
        <div class="row-label">${l.name}</div><div class="row-val tappable">打开</div></div>`).join('')}</div>
        <div style="font-size:12px;color:var(--text-2);padding:10px 6px 0">将跳转到「浏览器」应用打开</div>`;
      body.querySelectorAll('[data-url]').forEach(r => {
        r.onclick = async () => {
          const { default: browserApp } = await import('./browser.js');
          const { openApp, closeApp, isAppOpen } = await import('../core/applayer.js');
          browserApp.setPendingUrl(r.dataset.url);
          if (isAppOpen()) { closeApp(); setTimeout(() => openApp('browser'), 360); }
          else openApp('browser');
        };
      });
    },
  });
}

/* ============ Tab 4：我 ============ */
async function renderMe() {
  const c = getTabContent(); c.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">我</div><div class="nav-side right" style="width:1px"></div>`;
  const body = el('div', 'page-body');
  page.append(navBar, body);
  c.appendChild(page);

  const nickname = Settings.get('nickname', '我');

  const profile = el('div', 'me-profile');
  profile.innerHTML = `
    <div class="avatar av-sil" style="width:66px;height:66px"></div>
    <div style="flex:1;min-width:0">
      <div style="font-size:21px;font-weight:600">${escapeHtml(nickname)}</div>
      <div style="font-size:13.5px;color:var(--text-2);margin-top:4px">微信号：appleai_web</div>
    </div>
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>`;
  profile.onclick = editProfile;
  body.appendChild(profile);

  const cfg = await getApiConfig();
  const group1 = el('div', 'inset-group');
  group1.innerHTML = `<div class="inset-card">
    <div class="row" id="me-api"><div class="row-icon" style="background:#FF9500"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"><path d="M14.5 6.5a4.5 4.5 0 0 0-6.2 5.5L2.5 17.8l3.7 3.7 5.8-5.8a4.5 4.5 0 0 0 5.5-6.2l-3 3-2.8-.7-.7-2.8z"/></svg></div>
      <div class="row-label">AI 服务</div><div class="row-val">${cfg.custom ? '自定义 API' : '内置 AI'}</div><div class="row-chevron"><svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg></div></div>
  </div>`;
  group1.querySelector('#me-api').onclick = async () => {
    const { openApp, closeApp, isAppOpen } = await import('../core/applayer.js');
    if (isAppOpen()) { closeApp(); setTimeout(() => openApp('settings', { section: 'api' }), 360); }
    else openApp('settings', { section: 'api' });
  };
  body.appendChild(group1);

  const group2 = el('div', 'inset-group');
  group2.innerHTML = `<div class="inset-card">
    <div class="row" id="me-settings"><div class="row-icon" style="background:#8E8E93"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.2l1 2.6 2.8-.6 1 2.5 2.7.9-.5 2.8 2 2-2 2 .5 2.8-2.7.9-1 2.5-2.8-.6-1 2.6-1-2.6-2.8.6-1-2.5-2.7-.9.5-2.8-2-2 2-2-.5-2.8 2.7-.9 1-2.5 2.8.6z" stroke-linejoin="round"/></svg></div>
      <div class="row-label">设置</div><div class="row-chevron"><svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg></div></div>
  </div>`;
  group2.querySelector('#me-settings').onclick = async () => {
    const { openApp, closeApp, isAppOpen } = await import('../core/applayer.js');
    if (isAppOpen()) { closeApp(); setTimeout(() => openApp('settings'), 360); }
    else openApp('settings');
  };
  body.appendChild(group2);
}

async function editProfile() {
  const nickname = Settings.get('nickname', '我');
  sheet({
    title: '编辑资料',
    build(body, close) {
      body.innerHTML = `
        <div class="inset-card" style="margin:0">
          <div class="row"><div class="row-label" style="color:var(--text-2)">昵称</div><input class="row-input" id="pf-name" value="${escapeAttr2(nickname)}" maxlength="24"></div>
        </div>
        <div style="font-size:12.5px;color:var(--text-3);padding:10px 4px 0">头像为系统默认样式</div>
        <div class="sheet-actions"><button class="btn-fill wechat-green" id="pf-ok">保存</button></div>`;
      body.querySelector('#pf-ok').onclick = async () => {
        const name = body.querySelector('#pf-name').value.trim() || '我';
        await Settings.set('nickname', name);
        close();
        renderMe();
        toast('资料已保存');
      };
    },
  });
}
function escapeAttr2(s) { return String(s).replace(/"/g, '&quot;').replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

/* ---------- 对外：相机拍照发送给 AI ---------- */
export async function sendPhotoToAI(photo) {
  let conv = (await DB.all('conversations')).find(cn => cn.type === 'single' && cn.contactId === 'c_ai');
  if (!conv) {
    conv = { id: uid('conv'), type: 'single', contactId: 'c_ai', name: 'AI 助手', lastMessage: '', updatedAt: Date.now(), unread: 0, pinned: true };
    await DB.put('conversations', conv);
  }
  const { closeApp, openApp, isAppOpen } = await import('../core/applayer.js');
  const deliver = async () => {
    await sleep(450);
    await openChat(conv.id);
    await sleep(200);
    sendUserMessage(conv, '', [photo.id], photo.thumb);
  };
  if (isAppOpen()) { closeApp(); setTimeout(() => openApp('wechat'), 380); }
  else openApp('wechat');
  deliver();
}

/* ---------- 工具 ---------- */
function getTabContent() {
  return root ? root.firstChild : null;
}
