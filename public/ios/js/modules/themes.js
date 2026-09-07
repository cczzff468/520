/* ============ 主题（外观定制）：主屏/锁屏壁纸左右平行双卡 + 手机上传永久保存 ============ */

import { el, uid } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { createNav } from '../core/nav.js';
import { toast, escapeHtml, escapeAttr, sheet, dialog } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';
import { applyTheme } from '../core/theme.js';
import { Wallpapers, applyWallpaper, wallpaperCSS } from '../core/wallpapers.js';

let root = null;
let nav = null;

const UPLOAD_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4.5"/><path d="M7.5 9L12 4.5 16.5 9"/><path d="M4 15.5v2.6A2.4 2.4 0 0 0 6.4 20.5h11.2a2.4 2.4 0 0 0 2.4-2.4v-2.6"/></svg>';
const CHEV_SVG = '<svg width="9" height="15" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>';
const X_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const PHOTO_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 15.5l-4.5-4.5-7 7"/></svg>';
const SHUFFLE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M16 3h5v5M21 3l-7.5 7.5M8 21H3v-5M3 21l7.5-7.5M16 21h5v-5M21 21l-5-5M3 3l5 5"/></svg>';

/* 手机上传图片 → 压缩为 JPEG dataURL（长边≤1440，质量0.85，IndexedDB 友好） */
function compressImageFile(file, maxEdge = 1440, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('读取文件失败'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片无法解码'));
      img.onload = () => {
        try {
          let { naturalWidth: w, naturalHeight: h } = img;
          if (!w || !h) { w = h = 1000; }
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          const cv = document.createElement('canvas');
          cv.width = Math.round(w * scale);
          cv.height = Math.round(h * scale);
          const cx = cv.getContext('2d');
          cx.fillStyle = '#111';
          cx.fillRect(0, 0, cv.width, cv.height);
          cx.drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/jpeg', quality));
        } catch (e) { reject(e); }
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* 当前壁纸信息（预览背景 + 名称） */
async function wallInfo(which) {
  const key = which === 'home' ? 'wallpaperHome' : 'wallpaperLock';
  const wp = await Settings.load(key, null);
  const style = await wallpaperCSS(wp || (which === 'home' ? { type: 'preset', id: 'aurora' } : { type: 'preset', id: 'ink' }));
  let name = which === 'home' ? '极光' : '墨色';
  if (wp?.type === 'preset') name = Wallpapers.preset(wp.id).name;
  else if (wp?.type === 'upload') {
    const up = await DB.get('wallpapers', wp.id);
    name = up ? up.name : '已上传';
  } else if (wp?.type === 'photo') name = '相册照片';
  return { style, name, wp };
}

export default {
  id: 'themes',
  name: '主题',
  icon: AppIcons.themes,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    const page = nav.makePage({
      title: '主题与壁纸',
      large: true,
      build(body) {
        body.innerHTML = `
          <div class="inset-group-title">外观模式</div>
          <div class="theme-cards" id="theme-cards">
            <div class="theme-card" data-t="light">
              <div class="tc-preview light"><div class="tc-nav"></div><div class="tc-row"></div><div class="tc-row short"></div></div>
              <span>浅色</span>
            </div>
            <div class="theme-card" data-t="dark">
              <div class="tc-preview dark"><div class="tc-nav"></div><div class="tc-row"></div><div class="tc-row short"></div></div>
              <span>深色</span>
            </div>
            <div class="theme-card" data-t="auto">
              <div class="tc-preview auto"><div class="tc-nav"></div><div class="tc-row"></div><div class="tc-row short"></div></div>
              <span>自动</span>
            </div>
          </div>

          <div class="inset-group-title">壁纸 · 左右两块独立设置</div>
          <div class="th-wall-duo">
            <div class="th-wall-card" id="th-card-home">
              <div class="th-wall-preview" id="th-prev-home">
                <div class="th-prev-time">9:41</div>
                <div class="th-prev-label">主屏幕</div>
              </div>
              <div class="th-wall-meta">
                <div class="th-wall-name" id="th-name-home">—</div>
                <div class="th-wall-sub">当前壁纸</div>
              </div>
              <div class="th-wall-acts">
                <button class="th-wall-btn up" id="th-up-home">${UPLOAD_SVG}从手机上传</button>
                <button class="th-wall-btn more" id="th-more-home">更多${CHEV_SVG}</button>
              </div>
            </div>
            <div class="th-wall-card" id="th-card-lock">
              <div class="th-wall-preview dark" id="th-prev-lock">
                <div class="th-prev-time">9:41</div>
                <div class="th-prev-label">锁定屏幕</div>
              </div>
              <div class="th-wall-meta">
                <div class="th-wall-name" id="th-name-lock">—</div>
                <div class="th-wall-sub">当前壁纸</div>
              </div>
              <div class="th-wall-acts">
                <button class="th-wall-btn up" id="th-up-lock">${UPLOAD_SVG}从手机上传</button>
                <button class="th-wall-btn more" id="th-more-lock">更多${CHEV_SVG}</button>
              </div>
            </div>
          </div>

          <div class="inset-group">
            <div class="inset-card">
              <div class="row" id="wp-photo"><div class="row-icon" style="background:var(--accent)">${PHOTO_SVG}</div>
                <div class="row-label">从相册选择壁纸</div>
                <div class="row-chevron">${CHEV_SVG}</div></div>
              <div class="row" id="wp-random"><div class="row-icon" style="background:#8E44E5">${SHUFFLE_SVG}</div>
                <div class="row-label">随机主屏壁纸</div></div>
            </div>
          </div>

          <div class="inset-group-title">说明</div>
          <div class="inset-group">
            <div class="inset-card">
              <div class="row static"><div class="row-label" style="color:var(--text-2);font-size:14.5px;line-height:1.55">主屏幕与锁定屏幕壁纸独立设置、互不影响。从手机上传的壁纸压缩后永久保存在本机（IndexedDB），重启浏览器依然生效。</div></div>
            </div>
          </div>`;

        renderThemeCards(body);
        renderDuo(body);

        /* 上传（各自独立） */
        body.querySelector('#th-up-home').onclick = () => pickUploadFile('home');
        body.querySelector('#th-up-lock').onclick = () => pickUploadFile('lock');

        /* 更多 → 预设壁纸 Sheet（各自独立） */
        body.querySelector('#th-more-home').onclick = () => openWallSheet('home');
        body.querySelector('#th-more-lock').onclick = () => openWallSheet('lock');
        body.querySelector('#th-prev-home').onclick = () => openWallSheet('home');
        body.querySelector('#th-prev-lock').onclick = () => openWallSheet('lock');

        body.querySelector('#wp-photo').onclick = () => pickPhotoWallpaper();
        body.querySelector('#wp-random').onclick = async () => {
          const p = Wallpapers.presets[Math.floor(Math.random() * Wallpapers.presets.length)];
          await Settings.set('wallpaperHome', { type: 'preset', id: p.id });
          await applyWallpaper('home');
          renderDuo(body);
          toast('已换壁纸：' + p.name);
        };
      },
    });
    nav.setRoot(page);
  },

  unmount() { },
};

async function renderThemeCards(body) {
  const cur = await Settings.load('theme', 'auto');
  const cards = body.querySelectorAll('.theme-card');
  cards.forEach(card => {
    const t = card.dataset.t;
    card.classList.toggle('on', t === cur);
    card.onclick = async () => {
      await applyTheme(t);
      cards.forEach(x => x.classList.remove('on'));
      card.classList.add('on');
      hapticLite();
      toast({ light: '已切换到浅色模式', dark: '已切换到深色模式', auto: '已切换为跟随系统' }[t]);
    };
  });
}

/* 双卡实时渲染当前壁纸 */
async function renderDuo(body) {
  const pageBody = body || (root && root.querySelector('.page-body'));
  if (!pageBody) return;
  for (const which of ['home', 'lock']) {
    const prev = pageBody.querySelector('#th-prev-' + which);
    const nameEl = pageBody.querySelector('#th-name-' + which);
    if (!prev || !nameEl) continue;
    const info = await wallInfo(which);
    prev.style.background = info.style.background;
    nameEl.textContent = info.name;
  }
}

/* ---------- 从手机上传（file input → 压缩 → IndexedDB 永久保存 → 应用） ---------- */
function pickUploadFile(which) {
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.id = 'th-file-input';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('请选择图片文件'); return; }
    try {
      const data = await compressImageFile(f);
      const name = String(f.name || '上传壁纸').replace(/\.[^.]+$/, '').slice(0, 12) || '上传壁纸';
      const rec = { id: uid('wp'), name, data, addedAt: Date.now(), from: 'upload' };
      await DB.put('wallpapers', rec);
      const key = which === 'home' ? 'wallpaperHome' : 'wallpaperLock';
      await Settings.set(key, { type: 'upload', id: rec.id });
      await applyWallpaper(which);
      renderDuo(root.querySelector('.page-body'));
      toast('「' + name + '」已上传 · 永久保存在本机');
    } catch (e) {
      toast('图片处理失败，请换一张试试');
    }
  };
  input.click();
}

/* ---------- 壁纸选择 Sheet：预设 + 我的上传（可删除） + 相册 ---------- */
async function openWallSheet(which) {
  const key = which === 'home' ? 'wallpaperHome' : 'wallpaperLock';
  const cur = await Settings.load(key, null);
  const uploads = (await DB.byIndex('wallpapers', 'addedAt')).slice().reverse();
  const title = which === 'home' ? '选择主屏幕壁纸' : '选择锁定屏幕壁纸';

  sheet({
    title,
    build(body, close) {
      const apply = async (wp) => {
        await Settings.set(key, wp);
        await applyWallpaper(which);
        close();
        renderDuo(root.querySelector('.page-body'));
        toast('壁纸已应用');
      };

      body.innerHTML = `
        ${uploads.length ? `
          <div class="inset-group-title" style="margin:2px 16px 8px;font-size:12.5px">我的上传 · 永久保存</div>
          <div class="wall-grid">
            ${uploads.map(u => `
              <div class="wall-cell${cur?.type === 'upload' && cur.id === u.id ? ' on' : ''}" data-up="${escapeAttr(u.id)}" style="background:url("${u.data}") center/cover">
                <span>${escapeHtml(u.name)}</span>
                <button class="wall-del" data-del="${escapeAttr(u.id)}" aria-label="删除壁纸">${X_SVG}</button>
              </div>`).join('')}
          </div>` : ''}
        <div class="inset-group-title" style="margin:2px 16px 8px;font-size:12.5px">精选壁纸</div>
        <div class="wall-grid">
          ${Wallpapers.presets.map(w => `
            <div class="wall-cell${cur?.type === 'preset' && cur.id === w.id ? ' on' : ''}" data-preset="${escapeAttr(w.id)}" style="background:url("${w.css}") center/cover">
              <span>${w.name}</span>
            </div>`).join('')}
        </div>
        <div class="inset-group">
          <div class="inset-card">
            <div class="row" id="ws-upload"><div class="row-icon" style="background:var(--accent)">${PHOTO_SVG.replace('width="18" height="18"', 'width="17" height="17"')}</div>
              <div class="row-label">从手机上传新壁纸</div>
              <div class="row-chevron">${CHEV_SVG}</div></div>
            <div class="row" id="ws-album"><div class="row-icon" style="background:#FF9F0A">${PHOTO_SVG.replace('width="18" height="18"', 'width="17" height="17"')}</div>
              <div class="row-label">从相册选择</div>
              <div class="row-chevron">${CHEV_SVG}</div></div>
          </div>
        </div>`;

      body.querySelectorAll('[data-preset]').forEach(c => {
        c.onclick = () => apply({ type: 'preset', id: c.dataset.preset });
      });
      body.querySelectorAll('[data-up]').forEach(c => {
        c.onclick = (e) => {
          if (e.target.closest && e.target.closest('.wall-del')) return;
          apply({ type: 'upload', id: c.dataset.up });
        };
      });
      body.querySelectorAll('.wall-del').forEach(b => {
        b.onclick = async (e) => {
          e.stopPropagation();
          const id = b.dataset.del;
          const rec = uploads.find(u => u.id === id);
          if (!rec) return;
          const ok = await confirmDel(rec.name);
          if (!ok) return;
          /* 当前正在使用的壁纸被删 → 回退默认 */
          if (cur?.type === 'upload' && cur.id === id) {
            await Settings.set(key, { type: 'preset', id: which === 'home' ? 'aurora' : 'ink' });
            await applyWallpaper(which);
          }
          await DB.del('wallpapers', id);
          close();
          renderDuo(root.querySelector('.page-body'));
          toast('已删除「' + rec.name + '」');
        };
      });
      body.querySelector('#ws-upload').onclick = () => { close(); pickUploadFile(which); };
      body.querySelector('#ws-album').onclick = async () => {
        const photos = await DB.byIndex('photos', 'uploadDate');
        if (!photos.length) { toast('相册为空，先去添加照片'); return; }
        close();
        pickPhotoFromAlbum(which);
      };
    },
  });
}

function confirmDel(name) {
  return dialog({
    title: '删除壁纸',
    message: '「' + name + '」将从本机永久删除。\n如果正在使用将自动恢复默认壁纸。',
    buttons: [
      { text: '取消', value: false },
      { text: '删除', value: true, danger: true },
    ],
  });
}

/* 相册选壁纸（主屏/锁屏各自独立） */
function pickPhotoFromAlbum(which) {
  DB.byIndex('photos', 'uploadDate').then(photos => {
    if (!photos.length) { toast('相册为空，先去添加照片'); return; }
    sheet({
      title: which === 'home' ? '选择主屏幕壁纸' : '选择锁定屏幕壁纸',
      build(body, close) {
        body.innerHTML = `<div class="picker-grid">${photos.slice(0, 15).map(p => `<img src="${p.thumb || p.data}" data-id="${p.id}">`).join('')}</div>`;
        body.querySelectorAll('img').forEach(img => {
          img.onclick = async () => {
            const id = img.dataset.id;
            await Settings.set(which === 'home' ? 'wallpaperHome' : 'wallpaperLock', { type: 'photo', id });
            await applyWallpaper(which);
            close();
            renderDuo(root.querySelector('.page-body'));
            toast('照片壁纸已应用');
          };
        });
      },
    });
  });
}

/* 兼容旧入口（随机按钮调用的相册选择） */
async function pickPhotoWallpaper() {
  pickPhotoFromAlbum('home');
}

function hapticLite() { try { navigator.vibrate && navigator.vibrate(5); } catch (e) {} }
