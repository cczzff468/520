/* ============ iOS 风格弹层组件：Toast / 对话框 / 底部面板 / 动作菜单 ============ */

import { el, haptic } from './utils.js';

const screenEl = () => document.getElementById('screen');

/* ---------- Toast ---------- */
export function toast(msg, ms = 2200) {
  const layer = document.getElementById('layer-toast');
  const t = el('div', 'toast');
  t.textContent = msg;
  layer.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms);
}

/* ---------- 中央对话框（alert / confirm / prompt） ---------- */
export function dialog({ title = '', message = '', input = null, inputType = 'text', placeholder = '', value = '', mono = false, buttons = [{ text: '好' }] }) {
  return new Promise((resolve) => {
    const mask = el('div', 'dialog-mask');
    const d = el('div', 'dialog');
    d.innerHTML = `
      ${title ? `<div class="dialog-title">${escapeHtml(title)}</div>` : ''}
      ${message ? `<div class="dialog-msg">${escapeHtml(message).replace(/\n/g, '<br>')}</div>` : ''}
      ${input !== null ? `<div class="dialog-input-row"><input class="dialog-input${mono ? ' mono' : ''}" type="${inputType}" placeholder="${escapeHtml(placeholder)}" value="${escapeAttr(value)}"></div>` : ''}
      <div class="dialog-btns"></div>`;
    const btnRow = d.querySelector('.dialog-btns');
    buttons.forEach((b, i) => {
      const btn = el('button', (b.bold ? 'bold ' : '') + (b.danger ? 'danger' : ''));
      btn.textContent = b.text;
      btn.onclick = () => {
        haptic();
        const val = input !== null ? d.querySelector('.dialog-input').value : null;
        mask.remove();
        resolve(b.value !== undefined ? b.value : (i === 0 ? true : val));
      };
      btnRow.appendChild(btn);
    });
    mask.appendChild(d);
    mask.addEventListener('click', (e) => { if (e.target === mask && input === null) { mask.remove(); resolve(buttons.length > 1 ? null : false); } });
    screenEl().appendChild(mask);
    const inp = d.querySelector('.dialog-input');
    if (inp) {
      setTimeout(() => inp.focus(), 60);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { btnRow.children[Math.min(1, buttons.length - 1)].click(); } });
    }
  });
}

export function confirmDialog(title, message, { okText = '确定', cancelText = '取消', danger = false } = {}) {
  return dialog({
    title, message,
    buttons: [
      { text: cancelText, value: false },
      { text: okText, value: true, bold: true, danger },
    ],
  });
}

export function promptDialog(title, message, { placeholder = '', value = '', inputType = 'text', mono = false, okText = '好' } = {}) {
  return dialog({
    title, message, input: true, inputType, placeholder, value, mono,
    buttons: [{ text: '取消', value: null }, { text: okText, value: undefined, bold: true }],
  });
}

/* ---------- 底部 Sheet（内容自定义） ---------- */
export function sheet({ title = '', build, onClose, full = false }) {
  const mask = el('div', 'sheet-mask');
  const s = el('div', 'sheet');
  s.style.maxHeight = full ? '96%' : '88%';
  s.innerHTML = `
    <div class="sheet-handle"></div>
    ${title ? `<div class="sheet-title">${escapeHtml(title)}</div>` : ''}
    <div class="sheet-body"></div>`;
  const body = s.querySelector('.sheet-body');
  const result = build ? build(body, close) : null;
  mask.appendChild(s);

  function close(val) {
    mask.classList.add('closing');
    setTimeout(() => mask.remove(), 300);
    onClose && onClose(val);
  }
  mask.addEventListener('click', (e) => { if (e.target === mask) close(result); });
  screenEl().appendChild(s ? mask : mask);
  return { close, mask, sheet: s, body, result };
}

/* ---------- iOS 动作菜单 ActionSheet ---------- */
export function actionSheet(actions, { cancelText = '取消', title = '' } = {}) {
  return new Promise((resolve) => {
    const mask = el('div', 'dialog-mask');
    mask.style.background = 'rgba(0,0,0,.4)';
    const wrap = el('div', '');
    wrap.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:0 10px calc(22px + 14px);display:flex;flex-direction:column;gap:8px;animation:sheetUp .35s cubic-bezier(.32,.72,0,1) both;';
    if (title) {
      const t = el('div', 'action-sheet-group');
      t.style.cssText += 'background:rgba(120,120,128,.28);color:var(--text-2);font-size:13px;padding:12px;text-align:center;backdrop-filter:blur(20px);';
      t.textContent = title;
      wrap.appendChild(t);
    }
    const group = el('div', 'action-sheet-group');
    actions.forEach((a) => {
      const btn = el('button', 'action-sheet-btn' + (a.danger ? ' danger' : ''));
      btn.innerHTML = `${escapeHtml(a.text)}${a.desc ? `<span class="as-desc">${escapeHtml(a.desc)}</span>` : ''}`;
      btn.onclick = () => { haptic(); done(a.value); };
      group.appendChild(btn);
    });
    wrap.appendChild(group);
    const cancel = el('div', 'action-sheet-group');
    cancel.innerHTML = `<button class="action-sheet-btn as-cancel">取消</button>`;
    cancel.querySelector('button').onclick = () => done(null);
    wrap.appendChild(cancel);
    mask.appendChild(wrap);
    function done(val) {
      mask.classList.add('closing');
      mask.style.animation = 'fadeOut .2s ease both';
      setTimeout(() => mask.remove(), 220);
      resolve(val);
    }
    mask.addEventListener('click', (e) => { if (e.target === mask) done(null); });
    screenEl().appendChild(mask);
  });
}

/* ---------- HTML 转义 ---------- */
export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

/* ---------- iOS 加载指示 ---------- */
export function loading(text = '加载中…') {
  const mask = el('div', 'dialog-mask');
  mask.style.background = 'rgba(0,0,0,.18)';
  const d = el('div', '');
  d.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(30,30,34,.88);backdrop-filter:blur(16px);color:#fff;padding:22px 28px;border-radius:16px;display:flex;flex-direction:column;align-items:center;gap:12px;min-width:96px;`;
  d.innerHTML = `<div class="spinner" style="border-color:rgba(255,255,255,.25);border-top-color:#fff;"></div><div style="font-size:14px;">${escapeHtml(text)}</div>`;
  mask.appendChild(d);
  screenEl().appendChild(mask);
  return () => mask.remove();
}
