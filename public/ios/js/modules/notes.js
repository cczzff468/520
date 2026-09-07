/* ============ 备忘录（富文本 · iOS 风格时间分组列表） ============ */

import { el, uid, Bus, haptic, fmtSmartTime, downloadBlob, downloadJSON } from '../core/utils.js';
import { DB } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, confirmDialog, promptDialog, escapeHtml } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

let root = null;
let nav = null;

const PLUS_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const MORE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>';

export default {
  id: 'notes',
  name: '备忘录',
  icon: AppIcons.notes,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    const page = nav.makePage({
      title: '备忘录',
      right: [navBtn(PLUS_SVG, () => openEditor(null))],
      build(body) {
        body.classList.add('notes-body');
        body.innerHTML = `
          <div class="nt-chips" id="nt-filter">
            <button data-c="全部" class="on">全部</button>
            <button data-c="个人">个人</button>
            <button data-c="工作">工作</button>
            <button data-c="置顶">置顶</button>
          </div>
          <div class="searchbar nt-search">
            ${SEARCH_SVG}
            <input placeholder="搜索备忘录" id="nt-search">
          </div>
          <div id="nt-list"></div>`;
        body.querySelector('#nt-filter').querySelectorAll('button').forEach(b => {
          b.onclick = () => {
            haptic(4);
            body.querySelector('#nt-filter').querySelectorAll('button').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            loadList();
          };
        });
        body.querySelector('#nt-search').addEventListener('input', () => loadList());
        loadList();
      },
    });
    nav.setRoot(page);
  },

  unmount() { },
};

/* ---------- 时间分组（iOS 备忘录列表风格） ---------- */
function timeGroup(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return '今天';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '昨天';
  if (Date.now() - ts < 7 * 86400000) return '前 7 天';
  return '更早';
}

async function loadList() {
  const body = root.querySelector('.page-body');
  if (!body) return;
  const listEl = body.querySelector('#nt-list');
  if (!listEl) return;
  const keyword = body.querySelector('#nt-search').value.trim().toLowerCase();
  const cat = body.querySelector('#nt-filter .on')?.dataset.c || '全部';

  let notes = await DB.byIndex('notes', 'updatedAt');
  if (cat === '置顶') notes = notes.filter(n => n.pinned);
  else if (cat !== '全部') notes = notes.filter(n => (n.category || '个人') === cat);
  if (keyword) notes = notes.filter(n => (n.title + ' ' + stripHtml(n.content)).toLowerCase().includes(keyword));

  const pinned = notes.filter(n => n.pinned);
  const normal = notes.filter(n => !n.pinned);

  listEl.innerHTML = '';
  if (!notes.length) {
    listEl.innerHTML = `
      <div class="nt-empty">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2.6"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5"/></svg>
        <div class="nte-title">没有备忘录</div>
        <div class="nte-sub">点右上角 + 新建一条</div>
      </div>`;
    return;
  }

  const mk = (title, arr) => {
    const t = el('div', 'nt-group-title');
    t.textContent = title;
    listEl.appendChild(t);
    const card = el('div', 'inset-card nt-card');
    arr.forEach(n => {
      const row = el('div', 'row note-row');
      row.innerHTML = `
        <div class="row-label">
          <div class="nr-title"><span class="ellipsis">${escapeHtml(n.title || '新备忘录')}</span>${n.pinned ? '<span class="nr-pin">📌</span>' : ''}</div>
          <div class="nr-preview clamp2">${escapeHtml(stripHtml(n.content)).slice(0, 60) || '无附加文本'}</div>
        </div>
        <div class="nr-time">${fmtSmartTime(n.updatedAt)}</div>`;
      row.onclick = () => openEditor(n);
      row.oncontextmenu = (e) => { e.preventDefault(); noteMenu(n); };
      let t;
      row.addEventListener('touchstart', () => { t = setTimeout(() => noteMenu(n), 500); }, { passive: true });
      row.addEventListener('touchmove', () => clearTimeout(t), { passive: true });
      row.addEventListener('touchend', () => clearTimeout(t));
      card.appendChild(row);
    });
    const g = el('div', 'inset-group nt-group');
    g.appendChild(card);
    listEl.appendChild(g);
  };

  mk('置顶', pinned);
  const buckets = { '今天': [], '昨天': [], '前 7 天': [], '更早': [] };
  normal.forEach(n => buckets[timeGroup(n.updatedAt)].push(n));
  Object.entries(buckets).forEach(([label, arr]) => { if (arr.length) mk(label, arr); });
}

function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return d.textContent || '';
}

async function noteMenu(n) {
  const v = await actionSheet([
    { text: n.pinned ? '取消置顶' : '置顶', value: 'pin' },
    { text: '移动到「个人」', value: 'c1' },
    { text: '移动到「工作」', value: 'c2' },
    { text: '导出 TXT', value: 'txt' },
    { text: '删除', value: 'del', danger: true },
  ]);
  if (!v) return;
  if (v === 'pin') { n.pinned = !n.pinned; await DB.put('notes', n); }
  if (v === 'c1') { n.category = '个人'; await DB.put('notes', n); }
  if (v === 'c2') { n.category = '工作'; await DB.put('notes', n); }
  if (v === 'txt') {
    downloadBlob(new Blob([n.title + '\n\n' + stripHtml(n.content)], { type: 'text/plain' }), (n.title || '备忘录') + '.txt');
    toast('已导出 TXT');
  }
  if (v === 'del') {
    const ok = await confirmDialog('删除备忘录', `删除「${n.title || '新备忘录'}」？`, { okText: '删除', danger: true });
    if (!ok) return;
    await DB.del('notes', n.id);
  }
  loadList();
}

/* ============ 编辑器 ============ */
function openEditor(note) {
  const isNew = !note;
  const data = note || { id: uid('nt'), title: '', content: '', category: '个人', pinned: false, updatedAt: Date.now() };

  const page = nav.makePage({
    title: '',
    back: '备忘录',
    right: [
      navBtn('<span class="nt-done-btn">完成</span>', () => page._save && page._save(false)),
      navBtn(MORE_SVG, () => noteMenu(data)),
    ],
    build(body) {
      body.classList.add('note-editor-body');
      body.innerHTML = `
        <input class="note-title" placeholder="标题" value="${escapeAttr(data.title || '')}">
        <div class="note-meta">
          <span class="nm-chip">${escapeHtml(data.category || '个人')}</span>
          <span>${new Date(data.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="note-editor" contenteditable="true" id="note-content"></div>
        <div class="note-toolbar">
          <button data-cmd="bold"><b>B</b></button>
          <button data-cmd="italic"><i>I</i></button>
          <button data-cmd="underline"><u>U</u></button>
          <button data-cmd="insertUnorderedList">• 列表</button>
          <button data-cmd="insertOrderedList">1. 列表</button>
          <button data-cmd="todo" id="nb-todo">☑ 待办</button>
        </div>`;

      const editor = body.querySelector('#note-content');
      editor.innerHTML = data.content || '';

      body.querySelectorAll('.note-toolbar button[data-cmd]').forEach(b => {
        b.onclick = (e) => {
          e.preventDefault();
          haptic(4);
          editor.focus();
          if (b.dataset.cmd === 'todo') insertTodo(editor);
          else document.execCommand(b.dataset.cmd, false, null);
        };
      });
      // 自动保存（1.5s 防抖）
      let saveTimer;
      const save = async (silent = true) => {
        data.title = body.querySelector('.note-title').value.trim() || (stripHtml(editor.innerHTML).slice(0, 18)) || '新备忘录';
        data.content = editor.innerHTML;
        data.updatedAt = Date.now();
        await DB.put('notes', data);
        if (!silent) { toast('已保存'); nav.pop(); loadList(); }
      };
      page._save = save;
      editor.addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 1500); });
      body.querySelector('.note-title').addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 1500); });
    },
  });
  nav.push(page);
}

function insertTodo(editor) {
  const sel = window.getSelection();
  const text = sel.toString() || '';
  document.execCommand('insertHTML', false, `<div class="note-todo" data-done="0"><span class="todo-circle" contenteditable="false"></span><span>${escapeHtml(text) || '待办事项'}</span></div><div><br></div>`);
  bindTodoCircles(editor);
}

function bindTodoCircles(editor) {
  editor.querySelectorAll('.todo-circle').forEach(c => {
    if (c._bound) return;
    c._bound = true;
    c.onclick = () => {
      const item = c.parentElement;
      const done = item.dataset.done === '1';
      item.dataset.done = done ? '0' : '1';
      item.classList.toggle('done', !done);
      haptic(4);
    };
  });
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

/* 全局导出 */
export async function exportAllNotes() {
  const notes = await DB.all('notes');
  downloadJSON({ notes, exportedAt: new Date().toISOString() }, '备忘录备份.json');
  toast('已导出全部备忘录');
}
