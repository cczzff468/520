/* ============ 通讯录 ============ */

import { el, uid, Bus, pinyinInitial } from '../core/utils.js';
import { DB } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, confirmDialog, escapeHtml, sheet } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

let root = null;
let nav = null;

export default {
  id: 'contacts',
  name: '通讯录',
  icon: AppIcons.contacts,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    const page = nav.makePage({
      title: '通讯录',
      large: true,
      right: [navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => editContact(null))],
      build(body) {
        body.innerHTML = `
          <div class="searchbar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
            <input placeholder="搜索" id="ct-search">
          </div>
          <div id="ct-list" style="position:relative;padding-right:18px"></div>`;
        body.querySelector('#ct-search').addEventListener('input', () => loadList());
        loadList();
      },
    });
    nav.setRoot(page);
  },

  unmount() { },
};

async function loadList() {
  const listEl = root.querySelector('#ct-list');
  const kw = root.querySelector('#ct-search').value.trim().toLowerCase();
  let contacts = (await DB.all('contacts')).sort((a, b) => (a.pinyin || '#').localeCompare(b.pinyin || '#') || a.name.localeCompare(b.name));
  if (kw) contacts = contacts.filter(c => c.name.toLowerCase().includes(kw));

  listEl.innerHTML = '';
  if (!contacts.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="es-title">无联系人</div><div>点右上角 + 添加</div></div>`;
    return;
  }
  const grouped = new Map();
  contacts.forEach(c => {
    const k = c.pinyin || '#';
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(c);
  });
  const idxBar = el('div', 'ct-idxbar');
  for (const [letter, arr] of grouped) {
    const t = el('div', 'contacts-letter');
    t.textContent = letter;
    listEl.appendChild(t);
    const card = el('div', 'inset-card');
    arr.forEach(c => {
      const row = el('div', 'row');
      row.innerHTML = `
        <div class="avatar av-sil" style="width:40px;height:40px"></div>
        <div class="row-label ellipsis" style="font-size:16.5px">${escapeHtml(c.name)}</div>`;
      row.onclick = () => showDetail(c);
      card.appendChild(row);
    });
    const g = el('div', 'inset-group');
    g.appendChild(card);
    listEl.appendChild(g);
    const idx = el('span', '', letter);
    idx.onclick = () => t.scrollIntoView({ behavior: 'smooth' });
    idxBar.appendChild(idx);
  }
  listEl.appendChild(idxBar);
}

const CHEV = '<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>';

function showDetail(c) {
  const page = nav.makePage({
    title: '', chevBack: true,
    build(body) {
      body.style.background = 'var(--bg)';
      body.innerHTML = `
        <div class="wx-d-card wx-d-head">
          <div class="avatar av-sil" style="width:64px;height:64px"></div>
          <div style="flex:1;min-width:0">
            <div class="wx-d-name">${escapeHtml(c.name)}</div>
            <div class="wx-d-sub">微信号：${escapeHtml(c.wxid || '—')}</div>
          </div>
        </div>
        <div class="wx-d-card">
          <div class="row" id="ct-remark"><div class="row-label" style="font-size:16.5px">设置备注和标签</div><div class="row-chevron">${CHEV}</div></div>
          <div class="row" id="ct-more"><div class="row-label" style="font-size:16.5px">更多信息</div><div class="row-chevron">${CHEV}</div></div>
        </div>
        <div class="wx-d-card wx-d-act">
          <div class="row" id="ct-chat">
            <div class="row-icon"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.8-.3-4-.9L3 21l1.9-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg></div>
            <div class="row-label" style="font-size:16.5px">发消息</div>
          </div>
        </div>
        <div class="wx-d-card"><div class="row" id="ct-edit"><div class="row-label" style="font-size:16.5px">编辑资料</div><div class="row-chevron">${CHEV}</div></div></div>
        <div class="wx-d-card wx-d-danger"><div class="row" id="ct-del">删除联系人</div></div>`;
      body.querySelector('#ct-remark').onclick = () => { toast('演示环境：备注功能暂未开放'); };
      body.querySelector('#ct-more').onclick = () => {
        sheet({
          title: '更多信息',
          build(sb) {
            sb.innerHTML = `<div class="inset-card" style="margin:0">
              <div class="row static"><div class="row-label" style="color:var(--text-2)">签名</div><div class="row-val">${escapeHtml(c.signature || '—')}</div></div>
              <div class="row static"><div class="row-label" style="color:var(--text-2)">类型</div><div class="row-val">${c.isAI ? 'AI 智能好友' : '普通联系人'}</div></div>
              ${c.prompt ? `<div class="row static"><div class="row-label" style="color:var(--text-2)">人设</div><div class="row-val clamp2" style="max-width:62%;font-size:13px;white-space:normal">${escapeHtml(c.prompt.slice(0, 60))}…</div></div>` : ''}
            </div>`;
          },
        });
      };
      body.querySelector('#ct-chat').onclick = async () => {
        let conv = (await DB.all('conversations')).find(cn => cn.type === 'single' && cn.contactId === c.id);
        if (!conv) {
          conv = { id: uid('conv'), type: 'single', contactId: c.id, name: c.name, lastMessage: '', updatedAt: Date.now(), unread: 0, pinned: false };
          await DB.put('conversations', conv);
        }
        sessionStorage.setItem('openConv', conv.id);
        const { openApp, closeApp, isAppOpen } = await import('../core/applayer.js');
        if (isAppOpen()) { closeApp(); setTimeout(() => openApp('wechat'), 360); }
        else openApp('wechat');
      };
      body.querySelector('#ct-edit').onclick = () => editContact(c);
      body.querySelector('#ct-del').onclick = async () => {
        const ok = await confirmDialog('删除联系人', `删除「${c.name}」及与其的聊天记录？`, { okText: '删除', danger: true });
        if (!ok) return;
        const convs = (await DB.all('conversations')).filter(cn => cn.contactId === c.id);
        for (const cn of convs) {
          const msgs = await DB.byIndex('messages', 'conversationId', cn.id);
          for (const m of msgs) await DB.del('messages', m.id);
          await DB.del('conversations', cn.id);
        }
        await DB.del('contacts', c.id);
        nav.pop();
        loadList();
        Bus.emit('contacts:changed');
        toast('已删除');
      };
    },
  });
  nav.push(page);
}

function editContact(c) {
  const isNew = !c;
  const data = c || { name: '', isAI: true, signature: '' };
  sheet({
    title: isNew ? '添加联系人' : '编辑联系人',
    build(body, close) {
      let isAI = !!data.isAI;
      body.innerHTML = `
        <div class="inset-card" style="margin:0">
          <div class="row"><div class="row-label" style="color:var(--text-2)">姓名</div><input class="row-input" id="ec-name" value="${escapeHtml(data.name)}" placeholder="名字"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">签名</div><input class="row-input" id="ec-sig" value="${escapeHtml(data.signature || '')}" placeholder="一句话签名"></div>
          <div class="row"><div class="row-label">AI 智能体（可聊天）</div><div class="switch ${isAI ? 'on' : ''}" id="ec-ai"></div></div>
          <div class="row" style="align-items:flex-start"><div class="row-label" style="color:var(--text-2);flex:none;width:34px">人设</div><textarea id="ec-prompt" rows="3" placeholder="AI 人设提示词" style="flex:1;background:var(--fill);border-radius:9px;padding:9px 12px;font-size:14px">${escapeHtml(c?.prompt || '')}</textarea></div>
        </div>
        <div class="sheet-actions"><button class="btn-fill" id="ec-ok">${isNew ? '添加' : '保存'}</button></div>`;
      const sw = body.querySelector('#ec-ai');
      sw.onclick = () => {
        sw.classList.toggle('on');
        isAI = sw.classList.contains('on');
        body.querySelector('#ec-prompt').parentElement.style.display = isAI ? 'flex' : 'none';
      };
      if (!isAI) body.querySelector('#ec-prompt').parentElement.style.display = 'none';
      body.querySelector('#ec-ok').onclick = async () => {
        const name = body.querySelector('#ec-name').value.trim();
        if (!name) { toast('请填写姓名'); return; }
        const record = {
          ...(c || {}), id: c?.id || uid('c'), name,
          pinyin: pinyinInitial(name),
          signature: body.querySelector('#ec-sig').value.trim(),
          color: c?.color || '#8E8E93', emoji: c?.emoji || '',
          isAI,
          prompt: isAI ? (body.querySelector('#ec-prompt')?.value.trim() || `你是「${name}」，用户的好朋友，回复自然简短友好。`) : undefined,
          wxid: c?.wxid || ('wx_' + Math.random().toString(36).slice(2, 10)),
        };
        await DB.put('contacts', record);
        close();
        loadList();
        Bus.emit('contacts:changed');
        toast(isNew ? '已添加' : '已保存');
      };
    },
  });
}
