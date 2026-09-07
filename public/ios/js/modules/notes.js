/* ============ 备忘录（富文本） ============ */

import { el, uid, Bus, haptic, fmtSmartTime, downloadBlob, downloadJSON } from '../core/utils.js';
import { DB } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, confirmDialog, promptDialog, escapeHtml } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

let root = null;
let nav = null;

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
      right: [navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => openEditor(null))],
      build(body) {
        body.classList.add('notes-body');
        body.innerHTML = `
          <div class="segmented" id="nt-filter">
            <button data-c="全部" class="on">全部</button>
            <button data-c="个人">个人</button>
            <button data-c="工作">工作</button>
            <button data-c="置顶" >置顶</button>
          </div>
          <div class="searchbar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
            <input placeholder="搜索备忘录" id="nt-search">
          </div>
          <div id="nt-list"></div>`;
        body.querySelector('#nt-filter').querySelectorAll('button').forEach(b => {
          b.onclick = () => {
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

async function loadList() {
  const body = root.querySelector('.page-body');
  const listEl = body.querySelector('#nt-list');
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
    listEl.innerHTML = `<div class="empty-state"><div class="es-title">没有备忘录</div><div>点右上角 + 新建</div></div>`;
    return;
  }
  const mk = (arr, title) => {
    if (!arr.length) return;
    const t = el('div', 'inset-group-title');
    t.textContent = title;
    listEl.appendChild(t);
    const card = el('div', 'inset-card');
    arr.forEach(n => {
      const row = el('div', 'row note-row');
      row.innerHTML = `
        <div class="row-label" style="min-width:0">
          <div class="ellipsis" style="font-size:16.5px;font-weight:600">${escapeHtml(n.title || '新备忘录')}</div>
          <div class="clamp2" style="font-size:13px;color:var(--text-2);margin-top:3px">${escapeHtml(stripHtml(n.content)).slice(0, 60) || '无附加文本'}</div>
          <div style="font-size:11.5px;color:var(--text-3);margin-top:3px">${n.category || '个人'} · ${fmtSmartTime(n.updatedAt)}</div>
        </div>
        ${n.pinned ? '<span style="font-size:12px">📌</span>' : ''}`;
      row.onclick = () => openEditor(n);
      row.oncontextmenu = (e) => { e.preventDefault(); noteMenu(n); };
      let t;
      row.addEventListener('touchstart', () => { t = setTimeout(() => noteMenu(n), 500); }, { passive: true });
      row.addEventListener('touchmove', () => clearTimeout(t), { passive: true });
      row.addEventListener('touchend', () => clearTimeout(t));
      card.appendChild(row);
    });
    const g = el('div', 'inset-group');
    g.appendChild(card);
    listEl.appendChild(g);
  };
  mk(pinned, '置顶');
  mk(normal, '备忘录');
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
    right: [navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>', () => noteMenu(data))],
    build(body) {
      body.classList.add('note-editor-body');
      body.innerHTML = `
        <input class="note-title" placeholder="标题" value="${escapeAttr(data.title || '')}">
        <div class="note-meta">${data.category || '个人'} · ${new Date(data.updatedAt).toLocaleString('zh-CN')}</div>
        <div class="note-editor" contenteditable="true" id="note-content"></div>
        <div class="note-toolbar">
          <button data-cmd="bold"><b>B</b></button>
          <button data-cmd="italic"><i>I</i></button>
          <button data-cmd="underline"><u>U</u></button>
          <button data-cmd="insertUnorderedList">• 列表</button>
          <button data-cmd="insertOrderedList">1. 列表</button>
          <button data-cmd="todo" id="nb-todo">☑ 待办</button>
        </div>
        <div class="note-save-row">
          <button class="btn-fill" id="note-save">完成</button>
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
      // 保存快捷键
      body.querySelector('#note-save').onclick = async () => save();
      let saveTimer;
      editor.addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 1500); });
      body.querySelector('.note-title').addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 1500); });

      async function save(silent = true) {
        data.title = body.querySelector('.note-title').value.trim() || (stripHtml(editor.innerHTML).slice(0, 18)) || '新备忘录';
        data.content = editor.innerHTML;
        data.updatedAt = Date.now();
        await DB.put('notes', data);
        if (!silent) { toast('已保存'); nav.pop(); loadList(); }
      }
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
