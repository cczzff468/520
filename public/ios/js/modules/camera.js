/* ============ 相机 ============ */

import { el, uid, haptic, Bus } from '../core/utils.js';
import { DB } from '../core/db.js';
import { toast, actionSheet, escapeHtml } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

const FILTERS = [
  { id: 'none', name: '原图', css: 'none' },
  { id: 'vivid', name: '反差色', css: 'contrast(1.32) saturate(1.55)' },
  { id: 'warm', name: '鲜暖色', css: 'saturate(1.35) sepia(.24) contrast(1.08)' },
  { id: 'cold', name: '鲜冷色', css: 'saturate(1.3) hue-rotate(-18deg) contrast(1.1)' },
  { id: 'mono', name: '黑白', css: 'grayscale(1) contrast(1.18)' },
  { id: 'silver', name: '银色调', css: 'grayscale(1) brightness(1.12) contrast(.9) sepia(.12)' },
];

let stream = null;
let root = null;
let ctxRef = null;
let currentFilter = 'none';
let activePreview = null; // 预览层引用（供返回键关闭）

export default {
  id: 'camera',
  name: '相机',
  icon: AppIcons.camera,
  sbStyle: 'dark',
  fullscreen: true,

  /* 全局返回键钩子：预览打开时优先退出预览而非退出应用 */
  onBack() {
    if (activePreview && activePreview.isConnected) {
      activePreview.remove();
      activePreview = null;
      return true;
    }
    return false;
  },

  mount(rootEl, ctx) {
    root = rootEl; ctxRef = ctx;
    root.innerHTML = '';
    buildUI();
    startCamera();
  },

  async unmount() {
    stopCamera();
  },
};

function buildUI() {
  root.innerHTML = `
    <div class="cam-stage" id="cam-stage">
      <video id="cam-video" autoplay playsinline muted></video>
      <div class="cam-grid" id="cam-grid"></div>
      <div class="cam-denied" id="cam-denied" style="display:none">
        <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><path d="M3 3l18 18" stroke-width="1.8"/></svg>
        <div class="cd-title">无法访问摄像头</div>
        <div class="cd-desc">请在浏览器弹窗中允许相机权限<br>（部分浏览器需 HTTPS 环境）</div>
        <button class="btn-fill" id="cam-retry" style="width:160px;margin-top:18px">重试</button>
      </div>
    </div>
    <div class="cam-topbar">
      <div class="cam-tb-left">
        <button class="cam-tb-btn" id="cam-back" aria-label="返回"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4.5l-7.5 7.5 7.5 7.5"/></svg></button>
        <button class="cam-tb-btn" id="cam-flash"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L5 13.5h6L11 22l8-11.5h-6z"/></svg></button>
      </div>
      <div class="cam-mode-label">照片</div>
      <button class="cam-tb-btn" id="cam-grid-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg></button>
    </div>
    <div class="cam-bottom">
      <button class="cam-thumb" id="cam-thumb"></button>
      <button class="cam-shutter" id="cam-shutter"><div class="cam-shutter-inner"></div></button>
      <button class="cam-flip" id="cam-flip">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2"/><path d="M18.5 2.5v3.5h-3.5M5.5 21.5V18h3.5"/></svg>
      </button>
    </div>
    <div class="cam-filter-bar" id="cam-filterbar" style="display:none">
      ${FILTERS.map(f => `<button data-f="${f.id}" ${f.id === 'none' ? 'class="on"' : ''}>${f.name}</button>`).join('')}
    </div>`;

  root.querySelector('#cam-shutter').onclick = capture;
  root.querySelector('#cam-back').onclick = () => {
    if (activePreview && activePreview.isConnected) { activePreview.remove(); activePreview = null; return; }
    ctxRef && ctxRef.close(); // 返回主屏
  };
  root.querySelector('#cam-grid-btn').onclick = () => {
    const g = root.querySelector('#cam-grid');
    g.style.display = g.style.display === 'none' ? 'block' : 'none';
  };
  root.querySelector('#cam-flash').onclick = toggleFlash;
  root.querySelector('#cam-flip').onclick = flipCamera;
  root.querySelector('#cam-retry').onclick = () => { root.querySelector('#cam-denied').style.display = 'none'; startCamera(); };

  root.querySelectorAll('#cam-filterbar button').forEach(b => {
    b.onclick = () => {
      root.querySelectorAll('#cam-filterbar button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      currentFilter = b.dataset.f;
      applyFilterPreview();
    };
  });

  // 最近照片缩略
  DB.byIndex('photos', 'uploadDate').then(ps => {
    const thumb = root.querySelector('#cam-thumb');
    if (ps.length) thumb.style.backgroundImage = `url(${ps[0].thumb || ps[0].data})`;
    thumb.onclick = async () => {
      const { default: photosApp, viewPhoto } = await import('./photos.js');
      if (ps.length) viewPhoto(ps[0].id);
    };
  });
}

async function startCamera(facing = 'environment') {
  stopCamera();
  const video = root.querySelector('#cam-video');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1920 } },
      audio: false,
    });
    video.srcObject = stream;
    video.style.display = 'block';
  } catch (e) {
    console.warn('[camera]', e.message);
    video.style.display = 'none';
    root.querySelector('#cam-denied').style.display = 'flex';
  }
}

function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

async function flipCamera() {
  haptic(8);
  camFacing = camFacing === 'environment' ? 'user' : 'environment';
  startCamera(camFacing);
}
let camFacing = 'environment';

let flashOn = false;
async function toggleFlash() {
  haptic();
  flashOn = !flashOn;
  root.querySelector('#cam-flash').classList.toggle('on', flashOn);
  if (flashOn) toast('拍照时将开启闪光（屏幕补光）');
}

function applyFilterPreview() {
  const f = FILTERS.find(x => x.id === currentFilter);
  const video = root.querySelector('#cam-video');
  video.style.filter = f ? f.css : 'none';
}

/* ---------- 拍照 ---------- */
async function capture() {
  const video = root.querySelector('#cam-video');
  if (!video.srcObject) { toast('摄像头不可用'); return; }
  haptic(15);

  // 屏幕补光（无硬件闪光时）
  if (flashOn) {
    const flash = el('div', '');
    flash.style.cssText = 'position:absolute;inset:0;background:#fff;z-index:5;opacity:.9';
    root.querySelector('.cam-stage').appendChild(flash);
    setTimeout(() => flash.remove(), 180);
  }

  const f = FILTERS.find(x => x.id === currentFilter);
  const w = video.videoWidth, h = video.videoHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (f && f.css !== 'none') ctx.filter = f.css;
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  // 缩略图
  const tc = document.createElement('canvas');
  const k = 300 / Math.max(w, h);
  tc.width = Math.round(w * k); tc.height = Math.round(h * k);
  tc.getContext('2d').drawImage(canvas, 0, 0, tc.width, tc.height);
  const thumb = tc.toDataURL('image/jpeg', 0.7);

  const photo = {
    id: uid('ph'), name: `拍照_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.jpg`,
    data: dataUrl, thumb, w, h, size: Math.round(dataUrl.length * 0.75),
    uploadDate: Date.now(), from: 'camera', filter: currentFilter,
  };

  const preview = el('div', 'cam-preview');
  preview.innerHTML = `
    <img src="${dataUrl}">
    <div class="cam-pv-top">
      <button id="cp-retake">重拍</button>
      <div class="cam-mode-label">预览</div>
      <button id="cp-done" class="cp-done">使用照片</button>
    </div>
    <div class="cam-filter-bar" style="display:flex">
      ${FILTERS.map(x => `<button data-f="${x.id}" ${x.id === photo.filter ? 'class="on"' : ''}>${x.name}</button>`).join('')}
    </div>`;
  root.appendChild(preview);
  activePreview = preview;

  const rerender = (fid) => {
    const ff = FILTERS.find(x => x.id === fid);
    preview.querySelector('img').style.filter = ff ? ff.css : 'none';
    // 重新捕获滤镜
    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    const cx2 = c2.getContext('2d');
    if (ff && ff.css !== 'none') cx2.filter = ff.css;
    cx2.drawImage(video, 0, 0, w, h);
    // 注意：video 仍在播放，用原始帧重画
  };

  preview.querySelectorAll('.cam-filter-bar button').forEach(b => {
    b.onclick = () => {
      preview.querySelectorAll('.cam-filter-bar button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const ff = FILTERS.find(x => x.id === b.dataset.f);
      preview.querySelector('img').style.filter = ff ? ff.css : 'none';
      // 用原图重新应用滤镜
      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      const cx2 = c2.getContext('2d');
      if (ff && ff.css !== 'none') cx2.filter = ff.css;
      cx2.drawImage(canvas, 0, 0, w, h);
      const newData = c2.toDataURL('image/jpeg', 0.85);
      photo.data = newData;
      photo.filter = b.dataset.f;
      preview.querySelector('img').src = newData;
    };
  });

  preview.querySelector('#cp-retake').onclick = () => { preview.remove(); activePreview = null; };
  preview.querySelector('#cp-done').onclick = async () => {
    preview.remove();
    activePreview = null;
    const v = await actionSheet([
      { text: '保存到相册', value: 'save', desc: '存入 IndexedDB' },
      { text: '发送给 AI 助手', value: 'ai', desc: '跳转到微信聊天' },
      { text: '保存并发送', value: 'both' },
    ]);
    if (!v) return;
    if (v === 'save' || v === 'both') {
      await DB.put('photos', photo);
      Bus.emit('photos:changed');
      toast('已存入相册');
      const thumbBtn = root.querySelector('#cam-thumb');
      if (thumbBtn) thumbBtn.style.backgroundImage = `url(${photo.thumb})`;
    }
    if (v === 'ai' || v === 'both') {
      const { sendPhotoToAI } = await import('./wechat.js').catch(() => ({}));
      if (sendPhotoToAI) { sendPhotoToAI(photo); }
      else {
        await DB.put('photos', photo);
        toast('已存入相册，请在微信中选择发送');
      }
    }
  };
}
