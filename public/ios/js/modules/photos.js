/* ============ 相册（照片） ============ */

import { el, qsa, Bus, uid, haptic, fmtDate, fmtBytes, compressImage, downloadBlob, extractDominantColor } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, dialog, confirmDialog, escapeHtml, sheet } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

let nav = null;
let root = null;
let ctx = null;
let viewMode = 'day'; // day | month | year
let selectMode = false;
let selected = new Set();
let currentPhotos = [];

let pendingViewId = null;

/* 相机来源小角标 */
const CAM_MINI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="12" r="3.4"/></svg>';

export default {
  id: 'photos',
  name: '相册',
  icon: AppIcons.photos,
  sbStyle: 'light',

  /* 全局返回键钩子：查看器打开时优先关闭查看器而非退出应用 */
  onBack() {
    if (viewer && viewer.isConnected) {
      viewer.style.animation = 'fadeOut .2s ease both';
      setTimeout(() => viewer.remove(), 200);
      return true;
    }
    return false;
  },

  mount(rootEl, ctxArg) {
    root = rootEl; ctx = ctxArg;
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    const page = nav.makePage({
      title: '相册',
      right: [navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => uploadPhotos())],
      build: async (body) => {
        const seg = el('div', 'segmented');
        seg.innerHTML = `<button data-m="year">年</button><button data-m="month">月</button><button data-m="day" class="on">日</button>`;
        seg.querySelectorAll('button').forEach(b => {
          b.onclick = () => {
            seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            viewMode = b.dataset.m;
            renderGrid(body);
          };
        });
        body.appendChild(seg);
        const grid = el('div', 'photo-groups');
        grid.style.minHeight = '200px';
        body.appendChild(grid);
        renderGrid(body);
      },
    });
    nav.setRoot(page);

    if (pendingViewId) {
      const id = pendingViewId; pendingViewId = null;
      setTimeout(() => viewPhoto(id), 350);
    }
  },

  unmount() { selectMode = false; selected.clear(); },
};

/* ---------- 渲染分组网格 ---------- */
async function renderGrid(body) {
  const grid = body.querySelector('.photo-groups');
  if (!grid) return;
  grid.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div class="spinner"></div></div>';
  const photos = await DB.byIndex('photos', 'uploadDate');
  currentPhotos = photos;
  grid.innerHTML = '';

  if (!photos.length) {
    grid.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 15.5l-4.5-4.5-7 7"/></svg>
      <div class="es-title">没有照片</div><div>点右上角 + 上传，或用「相机」拍一张</div></div>`;
    return;
  }

  if (viewMode === 'day') {
    const groups = groupBy(photos, p => new Date(p.uploadDate).toDateString());
    for (const [key, arr] of groups) {
      const d = new Date(arr[0].uploadDate);
      const head = el('div', 'pg-head');
      head.innerHTML = `<span class="pg-date">${fmtDate(arr[0].uploadDate).replace(/^\d+年/, '')}</span><span class="pg-count">${arr.length} 张照片</span>`;
      grid.appendChild(head);
      grid.appendChild(photoGrid(arr, 3));
    }
  } else if (viewMode === 'month') {
    const groups = groupBy(photos, p => `${new Date(p.uploadDate).getFullYear()}-${new Date(p.uploadDate).getMonth()}`);
    for (const [key, arr] of groups) {
      const d = new Date(arr[0].uploadDate);
      const head = el('div', 'pg-head');
      head.innerHTML = `<span class="pg-date">${d.getFullYear()}年${d.getMonth() + 1}月</span><span class="pg-count">${arr.length} 张</span>`;
      grid.appendChild(head);
      grid.appendChild(photoGrid(arr, 4));
    }
  } else {
    const groups = groupBy(photos, p => new Date(p.uploadDate).getFullYear());
    for (const [key, arr] of groups) {
      const head = el('div', 'pg-head');
      head.innerHTML = `<span class="pg-date">${key}年</span><span class="pg-count">${arr.length} 张</span>`;
      grid.appendChild(head);
      grid.appendChild(photoGrid(arr, 6));
    }
  }
}

function groupBy(arr, fn) {
  const map = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(x);
  }
  return map;
}

function photoGrid(arr, cols) {
  const g = el('div', 'photo-grid');
  g.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  arr.forEach(p => g.appendChild(photoCell(p)));
  return g;
}

function photoCell(p) {
  const cell = el('div', 'photo-cell');
  cell.dataset.id = p.id;
  cell.innerHTML = `<img loading="lazy" src="${p.thumb || p.data}" alt="${escapeHtml(p.name)}">
    ${p.from === 'camera' ? `<span class="from-cam">${CAM_MINI}</span>` : ''}
    ${p.liked ? '<span class="cell-liked">\u2665</span>' : ''}
    ${selectMode ? `<div class="select-dot ${selected.has(p.id) ? 'on' : ''}"></div>` : ''}`;
  cell.onclick = () => {
    if (selectMode) {
      if (selected.has(p.id)) selected.delete(p.id); else selected.add(p.id);
      cell.querySelector('.select-dot').classList.toggle('on', selected.has(p.id));
      updateSelectBar();
    } else {
      openViewer(p.id);
    }
  };
  cell.oncontextmenu = (e) => { e.preventDefault(); photoMenu(p); };
  let t;
  cell.addEventListener('touchstart', () => { t = setTimeout(() => { haptic(30); photoMenu(p); }, 500); }, { passive: true });
  cell.addEventListener('touchmove', () => clearTimeout(t), { passive: true });
  cell.addEventListener('touchend', () => clearTimeout(t));
  return cell;
}

async function photoMenu(p) {
  const v = await actionSheet([
    { text: '查看', value: 'view' },
    { text: '设为壁纸', value: 'wall' },
    { text: '分享', value: 'share' },
    { text: '保存到本地', value: 'save' },
    { text: '删除', value: 'del', danger: true },
  ]);
  if (!v) return;
  if (v === 'view') openViewer(p.id);
  if (v === 'wall') setAsWallpaper(p);
  if (v === 'share') sharePhoto(p);
  if (v === 'save') {
    const blob = dataURLtoBlob(p.data);
    downloadBlob(blob, p.name || 'photo.jpg');
    toast('已保存到本地');
  }
  if (v === 'del') await deletePhotos([p.id]);
}

/* ---------- 上传 ---------- */
function uploadPhotos() {
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async () => {
    const files = [...input.files];
    if (!files.length) return;
    const ld = toast(`正在导入 ${files.length} 张照片…`, 8000);
    let ok = 0;
    for (const f of files) {
      try {
        const { dataUrl, thumb, w, h } = await compressImage(f);
        await DB.put('photos', {
          id: uid('ph'), name: f.name || 'photo.jpg', data: dataUrl, thumb,
          w, h, size: Math.round(dataUrl.length * 0.75), uploadDate: Date.now(), from: 'upload',
        });
        ok++;
      } catch (e) { console.warn(e); }
    }
    Bus.emit('photos:changed');
    toast(`已导入 ${ok} 张照片`);
    const body = root.querySelector('.page-body');
    if (body) renderGrid(body);
  };
  input.click();
}

/* ---------- 查看器 ---------- */
let viewer = null;

async function openViewer(photoId) {
  if (!currentPhotos.length) currentPhotos = await DB.byIndex('photos', 'uploadDate');
  const photos = currentPhotos;
  const idx = photos.findIndex(p => p.id === photoId);
  if (idx < 0) {
    toast('照片不存在');
    return;
  }

  viewer = el('div', 'photo-viewer');
  viewer.innerHTML = `
    <div class="pv-top">
      <button class="pv-btn" id="pv-back"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="pv-title"><div id="pv-date"></div></div>
      <button class="pv-btn" id="pv-more"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>
    </div>
    <div class="pv-stage" id="pv-stage">
      <img id="pv-img" draggable="false">
      <div class="pv-count" id="pv-count"></div>
    </div>
    <div class="pv-toolbar">
      <button class="pv-btn" id="pv-share"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v12M8 6l4-3.5L16 6"/><path d="M6 10.5H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg></button>
      <button class="pv-btn" id="pv-info"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg></button>
      <button class="pv-btn" id="pv-heart"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 5a5.2 5.2 0 0 0-7.4 0l-1.4 1.4L10.6 5a5.2 5.2 0 0 0-7.4 7.4l1.4 1.4 7.4 7.4 7.4-7.4 1.4-1.4a5.2 5.2 0 0 0 0-7.4z"/></svg></button>
      <button class="pv-btn" id="pv-trash"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.9 13h9.2l.9-13"/></svg></button>
    </div>`;

  root.appendChild(viewer);
  viewer.style.animation = 'fadeIn .25s ease both';

  let cur = idx;
  let scale = 1, tx = 0, ty = 0;
  const img = viewer.querySelector('#pv-img');
  const stage = viewer.querySelector('#pv-stage');

  function show(i) {
    cur = (i + photos.length) % photos.length;
    const p = photos[cur];
    img.src = p.data;
    img.style.transform = 'translate(0,0) scale(1)';
    scale = 1; tx = 0; ty = 0;
    viewer.querySelector('#pv-date').textContent = fmtDate(p.uploadDate);
    viewer.querySelector('#pv-count').textContent = `${cur + 1} / ${photos.length}`;
    viewer.querySelector('#pv-heart').classList.toggle('liked', !!p.liked);
  }
  show(idx);

  viewer.querySelector('#pv-back').onclick = () => { viewer.style.animation = 'fadeOut .2s ease both'; setTimeout(() => viewer.remove(), 200); };
  viewer.querySelector('#pv-more').onclick = async () => {
    const v = await actionSheet([
      { text: '设为主屏幕壁纸', value: 'home' },
      { text: '设为锁屏壁纸', value: 'lock' },
      { text: '保存到本地', value: 'save' },
    ]);
    const p = photos[cur];
    if (v === 'home' || v === 'lock') setAsWallpaper(p, v);
    if (v === 'save') { downloadBlob(dataURLtoBlob(p.data), p.name || 'photo.jpg'); toast('已保存'); }
  };
  viewer.querySelector('#pv-info').onclick = async () => {
    const p = photos[cur];
    await dialog({
      title: p.name || '照片',
      message: `尺寸：${p.w || '?'} × ${p.h || '?'} 像素\n大小：${fmtBytes(p.size)}\n拍摄/导入：${fmtDate(p.uploadDate)}\n来源：${p.from === 'seed' ? '示例' : p.from === 'camera' ? '相机' : '本地导入'}`,
      buttons: [{ text: '好' }],
    });
  };
  viewer.querySelector('#pv-share').onclick = () => sharePhoto(photos[cur]);
  viewer.querySelector('#pv-heart').onclick = async () => {
    const p = photos[cur];
    p.liked = !p.liked;
    await DB.put('photos', p);
    viewer.querySelector('#pv-heart').classList.toggle('liked', p.liked);
    haptic(4);
    toast(p.liked ? '已收藏' : '已取消收藏');
  };
  viewer.querySelector('#pv-trash').onclick = async () => {
    const ok = await confirmDialog('删除照片', '这张照片将从相册（IndexedDB）中删除。', { okText: '删除', danger: true });
    if (!ok) return;
    await deletePhotos([photos[cur].id]);
    photos.splice(cur, 1);
    if (!photos.length) { viewer.remove(); renderGrid(root.querySelector('.page-body')); return; }
    show(cur);
  };

  /* 缩放与切换手势 */
  let pinchStart = 0, scaleStart = 1;
  let panStart = null;
  let swipeStart = null;

  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStart = dist(e.touches);
      scaleStart = scale;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      swipeStart = { x: t.clientX, y: t.clientY, t: Date.now() };
      if (scale > 1) panStart = { x: t.clientX - tx, y: t.clientY - ty };
    }
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStart) {
      const k = dist(e.touches) / pinchStart;
      scale = Math.min(5, Math.max(0.6, scaleStart * k));
      applyTransform();
    } else if (e.touches.length === 1 && panStart && scale > 1) {
      tx = e.touches[0].clientX - panStart.x;
      ty = e.touches[0].clientY - panStart.y;
      applyTransform();
    }
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      if (swipeStart && scale <= 1) {
        const t = e.changedTouches[0];
        const dx = t.clientX - swipeStart.x, dy = t.clientY - swipeStart.y;
        const dt = Date.now() - swipeStart.t;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && dt < 500) { haptic(6); show(cur + (dx < 0 ? 1 : -1)); }
      }
      if (scale < 1) { scale = 1; tx = 0; ty = 0; applyTransform(); }
      if (scale <= 1.05 && !panStart) { tx = 0; ty = 0; scale = 1; applyTransform(); }
      panStart = null; pinchStart = 0; swipeStart = null;
    }
  });

  // 双击放大/还原
  let lastTap = 0;
  stage.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      scale = scale > 1 ? 1 : 2.4;
      tx = 0; ty = 0;
      applyTransform();
    }
    lastTap = now;
  });
  // 桌面滚轮缩放
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = Math.min(5, Math.max(0.6, scale * (e.deltaY < 0 ? 1.12 : 0.9)));
    if (scale <= 1) { tx = 0; ty = 0; }
    applyTransform();
  }, { passive: false });

  function applyTransform() {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    img.style.transition = 'none';
  }
  function dist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }
}

/* ---------- 对外接口：直接查看指定照片 ---------- */
export function viewPhoto(id) {
  const cur = window.__currentAppId ? window.__currentAppId() : null;
  if (cur === 'photos') { openViewer(id); return; }
  pendingViewId = id;
  const isOpen = window.__isAppOpen ? window.__isAppOpen() : false;
  if (isOpen && window.__closeApp) {
    window.__closeApp();
    setTimeout(() => window.__openApp && window.__openApp('photos'), 380);
  } else if (window.__openApp) {
    window.__openApp('photos');
  }
}

/* ---------- 多选模式 ---------- */
function updateSelectBar() { /* 保留接口 */ }

/* ---------- 删除 / 分享 / 壁纸 ---------- */
async function deletePhotos(ids) {
  for (const id of ids) {
    await DB.del('photos', id);
    const i = currentPhotos.findIndex(p => p.id === id);
    if (i > -1) currentPhotos.splice(i, 1);
  }
  Bus.emit('photos:changed');
  toast(`已删除 ${ids.length} 张照片`);
  const body = root?.querySelector('.page-body');
  if (body && root.isConnected) renderGrid(body);
}

async function sharePhoto(p) {
  try {
    const blob = dataURLtoBlob(p.data);
    const file = new File([blob], p.name || 'photo.jpg', { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: p.name || '照片' });
      return;
    }
  } catch (e) { /* 降级下载 */ }
  downloadBlob(dataURLtoBlob(p.data), p.name || 'photo.jpg');
  toast('当前环境不支持系统分享，已改为下载');
}

async function setAsWallpaper(p, which = null) {
  if (!which) {
    which = await actionSheet([
      { text: '设为主屏幕壁纸', value: 'home' },
      { text: '设为锁屏壁纸', value: 'lock' },
      { text: '同时设置', value: 'both' },
    ]);
    if (!which) return;
  }
  const targets = which === 'both' ? ['home', 'lock'] : [which];
  for (const t of targets) {
    await Settings.set(t === 'home' ? 'wallpaperHome' : 'wallpaperLock', { type: 'photo', id: p.id });
  }
  const { applyWallpaper } = await import('../core/wallpapers.js');
  for (const t of targets) await applyWallpaper(t);
  // 取主色作为强调色
  const color = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(extractDominantColor(img));
    img.onerror = () => resolve(null);
    img.src = p.thumb || p.data;
  });
  if (color) {
    document.documentElement.style.setProperty('--accent', color);
    await Settings.setQuiet('accentColor', color);
  }
  toast('壁纸已更新');
}

function dataURLtoBlob(dataURL) {
  const [head, body] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
