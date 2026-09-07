/* ============ 朋友圈（真实微信风格） ============ */

import { el, uid, fmtSmartTime, haptic, compressImage } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { createNav } from '../core/nav.js';
import { toast, confirmDialog, escapeHtml, sheet, actionSheet } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';
import { Statusbar } from '../core/statusbar.js';

let root = null;
let mnav = null;
let cmtbarEl = null;
let cmtInputEl = null;
let cmtCtx = null; /* { post, replyTo, listEl } */

const CHEV_W = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4.5l-7.5 7.5 7.5 7.5"/></svg>';
const CAM_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 18.5a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 18.5V8.3a1.8 1.8 0 0 1 1.8-1.8h2.9l1.8-2.8h5l1.8 2.8h2.9A1.8 1.8 0 0 1 21 8.3z"/><circle cx="12" cy="13" r="3.6"/></svg>';
const DOTS_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>';
const HEART_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.4-4.6-9.5-8.7C.8 9 2.4 5.5 5.7 4.8c2-.4 4 .4 5.2 2h.2c1.2-1.6 3.2-2.4 5.2-2 3.3.7 4.9 4.2 3.2 7.5C19.4 16.4 12 21 12 21z"/></svg>';
const HEART_O = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20.5s-7-4.4-9-8.3C1.4 9 3 5.8 6.1 5.1c1.9-.4 3.8.4 4.9 1.9h.1c1.1-1.5 3-2.3 4.9-1.9 3.1.7 4.7 3.9 3.1 7.1-2 3.9-9 8.3-9 8.3z"/></svg>';
const CMT_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.8-.3-4-.9L3 21l1.9-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg>';

export default {
  id: 'moments',
  name: '朋友圈',
  icon: AppIcons.moments,
  sbStyle: 'dark',

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    cmtCtx = null;
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    mnav = createNav(overlay);

    const page = mnav.makePage({
      title: '朋友圈',
      noNavbar: true,
      build(body, pageEl) {
        pageEl.classList.add('moments-page');
        body.classList.add('moments-body');
        const nickname = Settings.get('nickname', '我');
        body.innerHTML = `
          <div class="mo-topbar" id="mo-topbar">
            <button id="mo-back" data-own-back aria-label="返回">${CHEV_W}</button>
            <span class="mo-title">朋友圈</span>
            <button id="mo-add" aria-label="发表朋友圈">${CAM_ICON}</button>
          </div>
          <div class="mo-header">
            <div class="mo-cover" id="mo-cover"><span class="mo-cover-tip">点击更换封面</span></div>
            <div class="mo-me">
              <span class="mo-name">${escapeHtml(nickname)}</span>
              <div class="avatar av-sil mo-myavatar"></div>
            </div>
          </div>
          <div id="mo-list"></div>`;

        /* 评论输入条（真实微信：出现在页面顶部） */
        cmtbarEl = el('div', 'mo-cmtbar');
        cmtbarEl.innerHTML = `<input id="mo-cmt-input" placeholder="评论" maxlength="200"><button class="mo-cmt-send" id="mo-cmt-send">发送</button>`;
        pageEl.appendChild(cmtbarEl);
        cmtInputEl = cmtbarEl.querySelector('#mo-cmt-input');
        cmtbarEl.querySelector('#mo-cmt-send').onclick = sendComment;
        cmtInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendComment(); } });
        /* 点击评论区以外区域收起输入条 */
        body.addEventListener('click', (e) => {
          if (!e.target.closest('.mo-cmt, .mo-act, .mo-actbar, .mo-cmt-btn')) hideCmtbar();
        });

        body.querySelector('#mo-back').onclick = async () => {
          const { closeApp } = await import('../core/applayer.js');
          closeApp();
        };
        body.querySelector('#mo-add').onclick = () => publish();

        /* ---- 封面：点击从手机上传，IndexedDB 永久保存；长按恢复默认 ---- */
        const cover = body.querySelector('#mo-cover');
        const coverInput = el('input');
        coverInput.type = 'file';
        coverInput.accept = 'image/*';
        coverInput.style.display = 'none';
        pageEl.appendChild(coverInput);
        const applyCover = (url) => {
          if (url) { cover.style.backgroundImage = `url(${url})`; cover.classList.add('has-img'); }
          else { cover.style.backgroundImage = ''; cover.classList.remove('has-img'); }
        };
        coverInput.onchange = async () => {
          const f = coverInput.files && coverInput.files[0];
          coverInput.value = '';
          if (!f) return;
          try {
            const { dataUrl } = await compressImage(f, 1440, 0.85);
            await Settings.set('momentsCover', dataUrl);
            applyCover(dataUrl);
            toast('封面已更新 · 永久保存');
          } catch (e) {
            console.warn('[cover]', e);
            toast('图片处理失败，请换一张试试');
          }
        };
        cover.onclick = () => coverInput.click();
        cover.oncontextmenu = async (e) => {
          e.preventDefault();
          if (!Settings.get('momentsCover')) return;
          const ok = await confirmDialog('恢复默认封面', '将朋友圈封面恢复为默认渐变？', { okText: '恢复' });
          if (ok) { await Settings.set('momentsCover', null); applyCover(null); toast('已恢复默认封面'); }
        };
        Settings.load('momentsCover').then(v => applyCover(v));

        /* ---- 滚动：顶栏变白 + 状态栏黑白切换 ---- */
        const topbar = body.querySelector('#mo-topbar');
        Statusbar.setStyle('dark'); /* 封面深色 → 白字 */
        body.addEventListener('scroll', () => {
          const past = body.scrollTop > 230;
          topbar.classList.toggle('scrolled', past);
          Statusbar.setStyle(past ? 'light' : 'dark');
        }, { passive: true });

        loadFeed(body.querySelector('#mo-list'));
      },
    });
    mnav.setRoot(page);
  },

  unmount() { root = null; cmtbarEl = null; cmtInputEl = null; cmtCtx = null; },
};

/* ============ 动态流 ============ */
async function loadFeed(listEl) {
  const posts = await DB.byIndex('moments', 'createdAt');
  const contacts = await DB.all('contacts');
  const nameMap = { me: Settings.get('nickname', '我') };
  contacts.forEach(c => { nameMap[c.id] = c.name; });

  listEl.innerHTML = '';
  if (!posts.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="es-title">还没有动态</div><div>点右上角相机发表朋友圈</div></div>`;
    return;
  }
  for (const p of posts) {
    const item = el('div', 'mo-item');
    const likeNames = (p.likes || []).map(id => nameMap[id] || '朋友');
    const iLiked = (p.likes || []).includes('me');
    item.innerHTML = `
      <div class="avatar av-sil mo-avatar"></div>
      <div class="mo-main">
        <div class="mo-author">${escapeHtml(p.authorName)}</div>
        ${p.text ? `<div class="mo-text">${escapeHtml(p.text).replace(/\n/g, '<br>')}</div>` : ''}
        ${p.images?.length ? `<div class="mo-images ${p.images.length === 1 ? 'single' : ''}">${p.images.map(src => `<img src="${src}">`).join('')}</div>` : ''}
        <div class="mo-meta">
          <span class="mo-time">${fmtSmartTime(p.createdAt)}</span>
          <div class="mo-actwrap">
            <div class="mo-actbar" hidden>
              <button class="mo-like-btn">${HEART_O} 赞</button>
              <button class="mo-cmt-btn">${CMT_ICON} 评论</button>
            </div>
            <button class="mo-act" aria-label="赞和评论">${DOTS_ICON}</button>
          </div>
        </div>
        ${(likeNames.length || p.comments?.length) ? `
        <div class="mo-social">
          ${likeNames.length ? `<div class="mo-likes ${iLiked ? 'liked' : ''}">${HEART_ICON}<span>${likeNames.map(escapeHtml).join('，')}</span></div>` : ''}
          ${p.comments?.length ? `<div class="mo-comments">${p.comments.map((cm, i) => `
            <div class="mo-cmt" data-i="${i}"><b>${escapeHtml(cm.name)}</b>${cm.replyTo ? ` 回复 <b>@${escapeHtml(cm.replyTo)}</b>` : ''}：${escapeHtml(cm.text)}</div>`).join('')}</div>` : ''}
        </div>` : ''}
      </div>`;

    const actbar = item.querySelector('.mo-actbar');
    item.querySelector('.mo-act').onclick = (e) => {
      e.stopPropagation();
      /* 收起其他动态的展开条 */
      listEl.querySelectorAll('.mo-actbar:not([hidden])').forEach(x => { if (x !== actbar) x.hidden = true; });
      actbar.hidden = !actbar.hidden;
      haptic(4);
    };
    actbar.querySelector('.mo-like-btn').onclick = async (e) => {
      e.stopPropagation();
      p.likes = p.likes || [];
      const i = p.likes.indexOf('me');
      if (i > -1) p.likes.splice(i, 1); else p.likes.push('me');
      await DB.put('moments', p);
      loadFeed(listEl);
    };
    actbar.querySelector('.mo-cmt-btn').onclick = (e) => { e.stopPropagation(); openComment(listEl, p, null); };
    /* 点击别人的评论 → 回复该评论（回复@昵称） */
    item.querySelectorAll('.mo-cmt').forEach(cEl => {
      cEl.onclick = (e) => {
        e.stopPropagation();
        const cm = p.comments[+cEl.dataset.i];
        if (cm) openComment(listEl, p, cm.name);
      };
    });
    if (p.isMine) {
      item.oncontextmenu = async (e) => {
        e.preventDefault();
        const ok = await confirmDialog('删除动态', '删除这条朋友圈？', { okText: '删除', danger: true });
        if (ok) { await DB.del('moments', p.id); loadFeed(listEl); }
      };
    }
    listEl.appendChild(item);
  }
}

/* ============ 评论输入（支持 回复@昵称） ============ */
function openComment(listEl, post, replyTo) {
  cmtCtx = { post, replyTo, listEl };
  cmtbarEl.classList.add('show');
  cmtInputEl.placeholder = replyTo ? `回复@${replyTo}：` : '评论';
  cmtInputEl.value = '';
  cmtInputEl.focus();
}
function hideCmtbar() {
  if (!cmtbarEl) return;
  cmtbarEl.classList.remove('show');
  cmtCtx = null;
}
async function sendComment() {
  if (!cmtCtx) return;
  const text = cmtInputEl.value.trim();
  if (!text) return;
  const { post, replyTo, listEl } = cmtCtx;
  post.comments = post.comments || [];
  post.comments.push({ name: Settings.get('nickname', '我'), text, replyTo: replyTo || undefined });
  await DB.put('moments', post);
  cmtInputEl.value = '';
  hideCmtbar();
  loadFeed(listEl);
  toast(replyTo ? `已回复 @${replyTo}` : '评论已发送');
}

/* ============ 发表朋友圈（独立页面：文字 + 手机上传/相册选图） ============ */
function publish() {
  const page = mnav.makePage({
    title: '',
    noNavbar: true,
    build(body, pageEl) {
      pageEl.classList.add('pub-page');
      const images = []; /* dataUrl 列表，随动态一起存入 IndexedDB 永久保存 */
      body.innerHTML = `
        <div class="pub-header">
          <button class="pub-cancel" id="pub-cancel">取消</button>
          <button class="pub-submit" id="pub-submit" disabled>发表</button>
        </div>
        <div class="pub-scroll">
          <textarea class="pub-textarea" id="pub-text" placeholder="这一刻的想法…" maxlength="2000"></textarea>
          <div class="pub-grid" id="pub-grid"></div>
        </div>`;

      /* 手机相册/文件选择器（多选） */
      const fileInput = el('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      pageEl.appendChild(fileInput);
      fileInput.onchange = async () => {
        const files = [...(fileInput.files || [])];
        fileInput.value = '';
        if (!files.length) return;
        const room = 9 - images.length;
        if (files.length > room) toast(`最多选择 9 张，已取前 ${room} 张`);
        for (const f of files.slice(0, room)) {
          try {
            const { dataUrl } = await compressImage(f, 1200, 0.82);
            images.push(dataUrl);
          } catch (e) { console.warn('[pub-img]', e); }
        }
        renderGrid();
      };

      const grid = body.querySelector('#pub-grid');
      const submit = body.querySelector('#pub-submit');
      const textEl = body.querySelector('#pub-text');
      const refreshState = () => { submit.disabled = !(textEl.value.trim() || images.length); };
      textEl.addEventListener('input', refreshState);

      function renderGrid() {
        grid.innerHTML = images.map((src, i) => `
          <div class="pub-cell"><img src="${src}"><button class="pub-del" data-i="${i}" aria-label="移除">×</button></div>`).join('')
          + (images.length < 9 ? `<button class="pub-add" id="pub-add" aria-label="添加图片"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>` : '');
        grid.querySelectorAll('.pub-del').forEach(b => {
          b.onclick = (e) => { e.stopPropagation(); images.splice(+b.dataset.i, 1); renderGrid(); };
        });
        const add = grid.querySelector('#pub-add');
        if (add) add.onclick = chooseSource;
        refreshState();
      }

      async function chooseSource() {
        const v = await actionSheet([
          { text: '从手机相册上传', value: 'phone' },
          { text: '从应用内相册选择', value: 'album' },
        ]);
        if (v === 'phone') fileInput.click();
        if (v === 'album') openAlbumPicker();
      }

      function openAlbumPicker() {
        sheet({
          title: '从相册选择',
          async build(sbBody, close) {
            const photos = await DB.byIndex('photos', 'uploadDate');
            const picked = [];
            sbBody.innerHTML = photos.length ? `
              <div class="picker-grid" id="pub-picker">${photos.slice(0, 12).map(p => `<img src="${p.thumb || p.data}" data-src="${p.thumb || p.data}">`).join('')}</div>
              <div class="sheet-actions"><button class="btn-fill wechat-green" id="pub-picker-ok">添加（0）</button></div>`
              : `<div class="empty-state" style="padding:10px 0 20px"><div>相册为空，可用「从手机相册上传」</div></div>`;
            const okBtn = sbBody.querySelector('#pub-picker-ok');
            sbBody.querySelectorAll('#pub-picker img').forEach(img => {
              img.onclick = () => {
                const i = picked.indexOf(img.dataset.src);
                if (i > -1) { picked.splice(i, 1); img.style.outline = 'none'; }
                else { picked.push(img.dataset.src); img.style.outline = '3px solid var(--wechat)'; }
                if (okBtn) okBtn.textContent = `添加（${picked.length}）`;
              };
            });
            if (okBtn) okBtn.onclick = () => {
              const room = 9 - images.length;
              images.push(...picked.slice(0, room));
              close();
              renderGrid();
            };
          },
        });
      }

      renderGrid();
      body.querySelector('#pub-cancel').onclick = () => mnav.pop();
      submit.onclick = async () => {
        const text = textEl.value.trim();
        if (!text && !images.length) { toast('写点什么或选张图吧'); return; }
        await DB.put('moments', {
          id: uid('mo'), isMine: true, authorId: 'me', authorName: Settings.get('nickname', '我'),
          text, images, createdAt: Date.now(), likes: [], comments: [],
        });
        mnav.pop();
        loadFeed(root.querySelector('#mo-list'));
        toast('已发表');
      };
    },
  });
  mnav.push(page);
}
