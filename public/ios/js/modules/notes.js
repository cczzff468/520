/* ============ 备忘录（新版 iOS 风格：卡片列表 + 底部格式栏 + 黄色主题） ============ */

import { el, uid, Bus, haptic, fmtSmartTime, downloadBlob, downloadJSON } from '../core/utils.js';
import { DB } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, confirmDialog, promptDialog, escapeHtml } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

let root = null;
let nav = null;

const MORE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>';
/* 图钉（置顶） */
const PIN_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-label="已置顶"><path d="M9.2 3h5.6l-.8 5.6 3.5 4.2H6.5l3.5-4.2z"/><rect x="11.1" y="12.8" width="1.8" height="8" rx=".9"/></svg>';
/* 待办（圆圈打勾） */
const TODO_SVG = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.1"/><path d="M8.4 12.4l2.5 2.5 4.8-5.6"/></svg>';
/* 新建（方框铅笔） */
const COMPOSE_SVG = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.6V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2h7.6"/><path d="M17.6 3.4a1.94 1.94 0 0 1 2.75 2.75L13 13.5l-3.7.9.9-3.7z"/></svg>';
/* 无序/有序列表 */
const UL_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9.5 6h10.5M9.5 12h10.5M9.5 18h10.5"/><circle cx="4.6" cy="6" r="1.35" fill="currentColor" stroke="none"/><circle cx="4.6" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="4.6" cy="18" r="1.35" fill="currentColor" stroke="none"/></svg>';
const OL_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.4 4.9l1.3-.7v3.6" stroke-width="1.6"/><path d="M3.1 15.9c.4-.8 1.7-.9 2.1 0 .3.7-.2 1.2-.9 1.7l-1.3 1h2.4" stroke-width="1.6"/><path d="M3 10.8h2.2l-1.1 2.4" stroke-width="1.6"/></svg>';

export default {
  id: 'notes',
  name: '备忘录',
  icon: AppIcons.notes,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    root.classList.add('nt-app'); /* 黄色主题作用域（新版 iOS 备忘录强调色） */
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    const page = nav.makePage({
      title: '备忘录',
      right: [navBtn(MORE_SVG, async () => {
        const v = await actionSheet([
          { text: '导出全部备忘录（JSON 备份）', value: 'exp' },
        ]);
        if (v === 'exp') exportAllNotes();
      }, 'pill-btn')],
      build(body, pageEl) {
        body.classList.add('notes-body', 'has-fixed-toolbar');
        body.innerHTML = `
          <div class="searchbar nt-search">
            ${SEARCH_SVG}
            <input placeholder="搜索备忘录" id="nt-search">
          </div>
          <div class="nt-chips" id="nt-filter">
            <button data-c="全部" class="on">全部</button>
            <button data-c="个人">个人</button>
            <button data-c="工作">工作</button>
            <button data-c="置顶">置顶</button>
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

        /* 底部工具栏（iOS 格式栏质感）：左=新建待办，右=新建备忘录 */
        const bar = el('div', 'note-toolbar nt-bar');
        bar.innerHTML = `
          <button class="ntb" id="ntb-todo" aria-label="新建待办备忘录">${TODO_SVG}</button>
          <i class="tb-sep"></i>
          <button class="ntb ntb-compose" id="ntb-new" aria-label="新建备忘录">${COMPOSE_SVG}</button>`;
        pageEl.appendChild(bar);
        bar.querySelector('#ntb-new').onclick = () => { haptic(4); openEditor(null); };
        bar.querySelector('#ntb-todo').onclick = () => { haptic(4); openEditor(null, { todo: true }); };

        loadList();
      },
    });
    nav.setRoot(page);
  },

  unmount() {
    if (root) root.classList.remove('nt-app');
  },
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
        <div class="nte-sub">点底部的铅笔按钮新建一条</div>
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
        <div class="nr-line1">
          <div class="nr-title"><span class="ellipsis">${escapeHtml(n.title || '新备忘录')}</span>${n.pinned ? `<span class="nr-pin">${PIN_SVG}</span>` : ''}</div>
          <div class="nr-time">${fmtSmartTime(n.updatedAt)}</div>
        </div>
        <div class="nr-preview clamp2">${escapeHtml(stripHtml(n.content)).slice(0, 64) || '无附加文本'}</div>`;
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

/* 备忘录日期行（iOS 编辑器标题下的小字日期） */
function fmtNoteDate(ts) {
  const d = new Date(ts || Date.now());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

/* ============ 编辑器 ============ */
function openEditor(note, opts = {}) {
  const isNew = !note;
  const data = note || { id: uid('nt'), title: '', content: '', category: '个人', pinned: false, updatedAt: Date.now() };

  const page = nav.makePage({
    title: '',
    chevBack: true,
    right: [
      navBtn('<span class="nt-done-btn">完成</span>', () => page._save && page._save(false), 'pill-btn pill-text'),
    ],
    build(body, pageEl) {
      body.classList.add('note-editor-body', 'has-fixed-toolbar', 'nt-app');
      body.innerHTML = `
        <input class="note-title" placeholder="标题" value="${escapeAttr(data.title || '')}">
        <div class="note-date">${fmtNoteDate(data.updatedAt)}</div>
        <div class="note-editor" contenteditable="true" id="note-content"></div>`;

      /* 工具栏固定在页面底部（iOS 格式栏：待办 | B I U | 列表） */
      const toolbar = el('div', 'note-toolbar');
      toolbar.innerHTML = `
        <button data-cmd="todo" id="nb-todo" aria-label="待办">${TODO_SVG}</button>
        <i class="tb-sep"></i>
        <button data-cmd="bold" aria-label="粗体"><b>B</b></button>
        <button data-cmd="italic" aria-label="斜体"><i>I</i></button>
        <button data-cmd="underline" aria-label="下划线"><u>U</u></button>
        <i class="tb-sep"></i>
        <button data-cmd="insertUnorderedList" aria-label="无序列表">${UL_SVG}</button>
        <button data-cmd="insertOrderedList" aria-label="有序列表">${OL_SVG}</button>`;
      pageEl.appendChild(toolbar);

      const editor = body.querySelector('#note-content');
      editor.innerHTML = data.content || '';
      bindTodoCircles(editor); /* 打开旧笔记时重绑待办圆圈 */

      toolbar.querySelectorAll('button[data-cmd]').forEach(b => {
        b.onclick = (e) => {
          e.preventDefault();
          haptic(4);
          editor.focus();
          if (b.dataset.cmd === 'todo') insertTodo(editor);
          else document.execCommand(b.dataset.cmd, false, null);
        };
      });

      /* 新建待办备忘录：预置一条待办 */
      if (opts.todo && isNew && !editor.textContent.trim()) {
        setTimeout(() => insertTodo(editor), 60);
      }

      /* 显式保存：仅点「完成」或返回时确认（不再边打字边自动入库） */
      let dirty = false;
      const save = async (silent = true) => {
        data.title = body.querySelector('.note-title').value.trim() || (stripHtml(editor.innerHTML).slice(0, 18)) || '新备忘录';
        data.content = editor.innerHTML;
        data.updatedAt = Date.now();
        await DB.put('notes', data);
        dirty = false;
        if (!silent) { toast('已保存'); }
        nav.pop();
        loadList();
      };
      page._save = save;
      const markDirty = () => { dirty = true; };
      editor.addEventListener('input', markDirty);
      body.querySelector('.note-title').addEventListener('input', markDirty);

      /* 返回时若有未保存修改 → 询问（未修改直接退） */
      const tryBack = async () => {
        if (!dirty) { nav.pop(); return; }
        const ok = await confirmDialog('存储更改', '是否保存对此备忘录的更改？', { okText: '保存', cancelText: '不保存' });
        if (ok !== true) { nav.pop(); return; } // 不保存/关闭弹窗：丢弃返回
        await save(true);
      };
      const backBtn = pageEl.querySelector('.nav .nav-btn.chev');
      if (backBtn) backBtn.onclick = () => { haptic(6); tryBack(); };
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
