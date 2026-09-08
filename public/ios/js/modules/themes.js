/* ============ 主题（外观定制）：外观模式卡片 + 主屏/锁屏壁纸双卡 + 自定义图标（手机上传） ============ */

import { el, uid, Bus } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { createNav } from '../core/nav.js';
import { toast, escapeHtml, escapeAttr, sheet, dialog } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';
import { Apps as Registry } from '../core/applayer.js';
import { applyTheme } from '../core/theme.js';
import { Wallpapers, applyWallpaper, wallpaperCSS } from '../core/wallpapers.js';
import { Home } from '../core/home.js';

let root = null;
let nav = null;

const UPLOAD_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4.5"/><path d="M7.5 9L12 4.5 16.5 9"/><path d="M4 15.5v2.6A2.4 2.4 0 0 0 6.4 20.5h11.2a2.4 2.4 0 0 0 2.4-2.4v-2.6"/></svg>';
const CHEV_SVG = '<svg width="9" height="15" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>';
const X_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const PHOTO_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 15.5l-4.5-4.5-7 7"/></svg>';
const CHECK_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';
const GRID_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2.2"/></svg>';
const TRASH_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4A1.3 1.3 0 0 1 14.5 4.8V7"/><path d="M6.5 7l.9 12.1A1.9 1.9 0 0 0 9.3 21h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7"/><path d="M10 11v6M14 11v6"/></svg>';
const INFO_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"/><path d="M12 11v5"/><path d="M12 7.6v.1"/></svg>';
const TRASH_R_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4A1.3 1.3 0 0 1 14.5 4.8V7"/><path d="M6.5 7l.9 12.1A1.9 1.9 0 0 0 9.3 21h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7"/><path d="M10 11v6M14 11v6"/></svg>';

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

/* 手机上传图片 → 居中裁方 240×240 图标 dataURL（PNG 保透明，过大回退 JPEG） */
function squareIconFromFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('读取文件失败'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片无法解码'));
      img.onload = () => {
        try {
          let { naturalWidth: w, naturalHeight: h } = img;
          if (!w || !h) { w = h = 240; }
          const side = Math.min(w, h);
          const sx = (w - side) / 2, sy = (h - side) / 2;
          const S = 240;
          const cv = document.createElement('canvas');
          cv.width = S; cv.height = S;
          const cx = cv.getContext('2d');
          cx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
          let data = cv.toDataURL('image/png');
          if (data.length > 180000) data = cv.toDataURL('image/jpeg', 0.9); // 大图降体积
          resolve(data);
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
  const style = await wallpaperCSS(wp || (which === 'home' ? { type: 'preset', id: 'aurora' } : { type: 'preset', id: 'snow' }));
  let name = which === 'home' ? '极光' : '纯白';
  if (wp?.type === 'preset') name = Wallpapers.preset(wp.id).name;
  else if (wp?.type === 'upload') {
    const up = await DB.get('wallpapers', wp.id);
    name = up ? up.name : '已上传';
  } else if (wp?.type === 'photo') name = '相册照片';
  return { style, name, wp };
}

/* 可自定义的全部应用 id（主屏 + 程序坞，排除已隐藏） */
function customizableIds() {
  const layout = Home.layout || { grid: [], dock: [], hidden: [] };
  const ids = [...(layout.grid || []), ...(layout.dock || [])]
    .filter(id => !(layout.hidden || []).includes(id) && Registry.get(id) && typeof AppIcons[id] === 'function');
  return ids.length ? ids : Registry.all().map(a => a.id).filter(id => typeof AppIcons[id] === 'function');
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
              <div class="tc-preview light">
                <div class="tcp-status"><i></i><i class="batt"></i></div>
                <div class="tcp-icons"><span></span><span></span><span></span><span></span></div>
                <div class="tcp-dock"><i></i><i></i><i></i><i></i></div>
              </div>
              <span>浅色</span>
              <span class="tc-check">${CHECK_SVG}</span>
            </div>
            <div class="theme-card" data-t="dark">
              <div class="tc-preview dark">
                <div class="tcp-status"><i></i><i class="batt"></i></div>
                <div class="tcp-icons"><span></span><span></span><span></span><span></span></div>
                <div class="tcp-dock"><i></i><i></i><i></i><i></i></div>
              </div>
              <span>深色</span>
              <span class="tc-check">${CHECK_SVG}</span>
            </div>
            <div class="theme-card" data-t="auto">
              <div class="tc-preview auto">
                <div class="tcp-status"><i></i><i class="batt"></i></div>
                <div class="tcp-icons"><span></span><span></span><span></span><span></span></div>
                <div class="tcp-dock"><i></i><i></i><i></i><i></i></div>
              </div>
              <span>自动</span>
              <span class="tc-check">${CHECK_SVG}</span>
            </div>
          </div>

          <div class="inset-group-title">壁纸 · 主屏与锁屏独立设置</div>
          <div class="th-wall-duo">
            <div class="th-wall-card" id="th-card-home">
              <div class="th-wall-preview" id="th-prev-home">
                <div class="th-hs">
                  <div class="th-hs-status"><span>9:41</span><i></i></div>
                  <div class="th-hs-icons"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
                  <div class="th-hs-dock"><i></i><i></i><i></i><i></i></div>
                </div>
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
                <div class="th-lock-time">9:41</div>
                <div class="th-lock-date">9月8日 星期二</div>
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

          <div class="inset-group-title">自定义图标 · 从手机上传</div>
          <div class="th-ic-card" id="th-ic-card">
            <div class="th-ic-head" id="th-ic-row">
              <div class="th-ic-head-icon">${GRID_ICON_SVG}</div>
              <div class="th-ic-head-txt">
                <div class="th-ic-head-title">自定义应用图标</div>
                <div class="th-ic-head-sub" id="th-ic-count">未自定义</div>
              </div>
              <div class="th-ic-head-chev">${CHEV_SVG}</div>
            </div>
            <div class="th-ic-strip" id="th-ic-strip"></div>
          </div>

          <div class="inset-group">
            <div class="inset-card">
              <div class="row" id="wp-photo"><div class="row-icon" style="background:var(--accent)">${PHOTO_SVG}</div>
                <div class="row-label">从相册选择壁纸</div>
                <div class="row-chevron">${CHEV_SVG}</div></div>
            </div>
          </div>

          <div class="inset-group-title">说明</div>
          <div class="inset-group">
            <div class="inset-card">
              <div class="row static"><div class="row-label" style="color:var(--text-2);font-size:14.5px;line-height:1.55">主屏与锁屏壁纸独立设置、互不影响。上传的壁纸与自定义图标压缩后永久保存在本机（IndexedDB），重启浏览器依然生效。</div></div>
            </div>
          </div>`;

        renderThemeCards(body);
        renderDuo();
        renderIconStrip();

        /* 上传（各自独立） */
        body.querySelector('#th-up-home').onclick = () => pickUploadFile('home');
        body.querySelector('#th-up-lock').onclick = () => pickUploadFile('lock');

        /* 更多 → 预设壁纸 Sheet（各自独立） */
        body.querySelector('#th-more-home').onclick = () => openWallSheet('home');
        body.querySelector('#th-more-lock').onclick = () => openWallSheet('lock');
        body.querySelector('#th-prev-home').onclick = () => openWallSheet('home');
        body.querySelector('#th-prev-lock').onclick = () => openWallSheet('lock');

        body.querySelector('#wp-photo').onclick = () => pickPhotoWallpaper();

        /* 自定义图标入口 */
        body.querySelector('#th-ic-row').onclick = () => openIconCustomize();
        body.querySelector('#th-ic-strip').onclick = () => openIconCustomize();
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

/* 双卡实时渲染当前壁纸（root 下按 id 查询，主页面唯一） */
async function renderDuo() {
  if (!root) return;
  for (const which of ['home', 'lock']) {
    const prev = root.querySelector('#th-prev-' + which);
    const nameEl = root.querySelector('#th-name-' + which);
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
      renderDuo();
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
        renderDuo();
        toast('壁纸已应用');
      };

      body.innerHTML = `
        ${uploads.length ? `
          <div class="inset-group-title" style="margin:2px 16px 8px;font-size:12.5px">我的上传 · 永久保存</div>
          <div class="wall-grid">
            ${uploads.map(u => `
              <div class="wall-cell${cur?.type === 'upload' && cur.id === u.id ? ' on' : ''}" data-up="${escapeAttr(u.id)}">
                <span>${escapeHtml(u.name)}</span>
                <button class="wall-del" data-del="${escapeAttr(u.id)}" aria-label="删除壁纸">${X_SVG}</button>
              </div>`).join('')}
          </div>` : ''}
        <div class="inset-group-title" style="margin:2px 16px 8px;font-size:12.5px">精选壁纸</div>
        <div class="wall-grid">
          ${Wallpapers.presets.map(w => `
            <div class="wall-cell${cur?.type === 'preset' && cur.id === w.id ? ' on' : ''}" data-preset="${escapeAttr(w.id)}">
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

      /* 修复：壁纸缩略图背景改由 JS 写入 ——
         之前用内联 style="background:url(\"data:...\")"，双引号嵌套截断 HTML 属性导致壁纸不显示 */
      body.querySelectorAll('[data-preset]').forEach(c => {
        c.style.background = `url("${Wallpapers.preset(c.dataset.preset).css}") center/cover no-repeat`;
      });
      body.querySelectorAll('[data-up]').forEach(c => {
        const u = uploads.find(x => x.id === c.dataset.up);
        if (u) c.style.background = `url("${u.data}") center/cover no-repeat`;
      });

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
            await Settings.set(key, { type: 'preset', id: which === 'home' ? 'aurora' : 'snow' });
            await applyWallpaper(which);
          }
          await DB.del('wallpapers', id);
          close();
          renderDuo();
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
            renderDuo();
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

/* ============ 自定义图标 ============ */

/* 主页图标预览条（全部应用，已自定义高亮）+ 计数 */
async function renderIconStrip() {
  if (!root) return;
  const strip = root.querySelector('#th-ic-strip');
  const count = root.querySelector('#th-ic-count');
  if (!strip) return;
  const ovs = await Settings.load('iconOverrides', {}) || {};
  const ids = customizableIds();
  strip.innerHTML = ids.map(id => {
    const ov = ovs[id];
    return `<div class="th-ic-chip${ov ? ' custom' : ''}" title="${escapeAttr(Registry.get(id) ? Registry.get(id).name : id)}">${ov ? `<img src="${ov}" alt="">` : AppIcons[id]()}${ov ? `<span class="th-ic-cb">${CHECK_SVG}</span>` : ''}</div>`;
  }).join('');
  if (count) {
    const n = ids.filter(id => ovs[id]).length;
    count.textContent = n ? `已自定义 ${n} 个 · 点按管理` : '未自定义 · 从手机上传图片';
  }
}

/* 图标自定义子页 */
function openIconCustomize() {
  const page = nav.makePage({
    title: '自定义图标',
    chevBack: true,
    build(body) {
      renderIconPage(body);
    },
  });
  nav.push(page);
}

async function renderIconPage(body) {
  const ovs = await Settings.load('iconOverrides', {}) || {};
  const ids = customizableIds();
  const anyCustom = ids.some(id => ovs[id]);
  body.innerHTML = `
    <div class="th-ic-pill">${INFO_SVG}点按应用图标 · 从手机上传图片替换</div>
    <div class="th-ic-sec"><span>全部应用</span><span>共 ${ids.length} 个</span></div>
    <div class="th-ic-grid" id="th-ic-grid">
      ${ids.map(id => {
        const ov = ovs[id];
        const app = Registry.get(id);
        return `<div class="th-ic-cell" data-ic="${id}">
          <div class="th-ic-sq${ov ? ' custom' : ''}">${ov ? `<img src="${ov}" alt="">` : AppIcons[id]()}${ov ? `<span class="th-ic-badge">${CHECK_SVG}</span>` : ''}</div>
          <div class="th-ic-name">${escapeHtml(app ? app.name : id)}</div>
          ${ov ? `<button class="th-ic-restore" type="button" data-ic="${id}">恢复默认</button>` : ''}
        </div>`;
      }).join('')}
    </div>
    ${anyCustom ? `<button class="th-ic-resetall" id="th-ic-resetall" type="button">${TRASH_R_SVG}恢复全部默认图标</button>` : ''}
    <div class="th-ic-hint">上传的图片自动居中裁成正方形，永久保存在本机。<br>自定义后，主屏幕与程序坞的图标同时更换。</div>`;

  body.querySelectorAll('.th-ic-cell').forEach(cell => {
    cell.onclick = () => iconActions(body, cell.dataset.ic, ovs);
  });
  /* 已自定义图标：名称下方「恢复默认」快捷钮（不弹 Sheet，一键还原） */
  body.querySelectorAll('.th-ic-restore').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation(); // 防止冒泡触发整格点击（弹操作Sheet）
      const id = btn.dataset.ic;
      const next = { ...(await Settings.load('iconOverrides', {}) || {}) };
      if (!next[id]) return;
      delete next[id];
      await Settings.set('iconOverrides', next);
      Bus.emit('icons:changed');
      hapticLite();
      renderIconPage(body);
      renderIconStrip();
      toast('已恢复默认图标');
    };
  });
  const resetBtn = body.querySelector('#th-ic-resetall');
  if (resetBtn) resetBtn.onclick = async () => {
    const ok = await dialog({
      title: '恢复默认图标',
      message: '将清除全部自定义图标，恢复为应用默认图标。',
      buttons: [
        { text: '取消', value: false },
        { text: '恢复', value: true, danger: true },
      ],
    });
    if (!ok) return;
    await Settings.set('iconOverrides', {});
    Bus.emit('icons:changed'); // 主屏立即重绘
    renderIconPage(body);
    renderIconStrip();
    toast('已恢复全部默认图标');
  };
}

/* 单个应用图标操作 Sheet：顶部当前图标预览 + 操作行 */
function iconActions(body, id, ovs) {
  const app = Registry.get(id);
  const isCustom = !!ovs[id];
  const ov = ovs[id];
  sheet({
    title: (app ? app.name : id) + ' · 图标',
    build(sb, close) {
      sb.innerHTML = `
        <div class="ia-preview">
          <div class="ia-sq${isCustom ? ' custom' : ''}">${ov ? `<img src="${ov}" alt="">` : AppIcons[id]()}</div>
          <div class="ia-status${isCustom ? ' custom' : ''}">${isCustom ? '当前使用上传的自定义图标' : '当前使用默认图标'}</div>
        </div>
        <div class="inset-group">
          <div class="inset-card">
            <div class="row" id="ia-upload"><div class="row-icon" style="background:var(--accent)">${PHOTO_SVG.replace('width="18" height="18"', 'width="17" height="17"')}</div>
              <div class="row-label">${isCustom ? '更换上传图片' : '从手机上传图片'}</div>
              <div class="row-chevron">${CHEV_SVG}</div></div>
            ${isCustom ? `<div class="row" id="ia-reset"><div class="row-icon" style="background:#FF453A">${TRASH_SVG}</div>
              <div class="row-label" style="color:var(--danger)">恢复默认图标</div></div>` : ''}
          </div>
        </div>`;
      sb.querySelector('#ia-upload').onclick = () => { close(); pickIconFile(body, id); };
      const rs = sb.querySelector('#ia-reset');
      if (rs) rs.onclick = async () => {
        close();
        const next = { ...(await Settings.load('iconOverrides', {}) || {}) };
        delete next[id];
        await Settings.set('iconOverrides', next);
        Bus.emit('icons:changed');
        renderIconPage(body);
        renderIconStrip();
        toast('已恢复默认图标');
      };
    },
  });
}

/* 上传图标：file input → 裁方 → 保存 → 主屏即时生效 */
function pickIconFile(body, id) {
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('请选择图片文件'); return; }
    try {
      const data = await squareIconFromFile(f);
      const next = { ...(await Settings.load('iconOverrides', {}) || {}) };
      next[id] = data;
      await Settings.set('iconOverrides', next);
      Bus.emit('icons:changed'); // Home 重载覆盖表并重绘网格
      renderIconPage(body);
      renderIconStrip();
      const app = Registry.get(id);
      toast('「' + (app ? app.name : id) + '」图标已更新');
    } catch (e) {
      toast('图片处理失败，请换一张试试');
    }
  };
  input.click();
}

function hapticLite() { try { navigator.vibrate && navigator.vibrate(5); } catch (e) {} }
