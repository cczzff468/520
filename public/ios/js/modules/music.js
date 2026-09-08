/* ============ 音乐（本地音乐库 + 全局播放引擎） ============ */

import { el, qsa, Bus, uid, haptic, fmtDur, rgbToHex } from '../core/utils.js';
import { DB } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, dialog, confirmDialog, escapeHtml, sheet, loading } from '../core/ui.js';
import { Apps as AppIcons, TIcons } from '../core/icons.js';

let nav = null;
let root = null;

/* ============ 全局音乐引擎 ============ */
export const MusicEngine = {
  audio: null,
  queue: [],
  index: -1,
  mode: 'order', // order | repeat | repeat1 | shuffle
  _urls: {},

  init() {
    if (this.audio) return;
    this.audio = document.getElementById('global-audio');
    this.audio.addEventListener('ended', () => this.next(true));
    this.audio.addEventListener('timeupdate', () => Bus.emit('music:time', { t: this.audio.currentTime, d: this.audio.duration }));
    this.audio.addEventListener('play', () => this.emit());
    this.audio.addEventListener('pause', () => this.emit());
  },

  url(song) {
    if (!this._urls[song.id]) {
      const blob = new Blob([song.data], { type: song.mime || 'audio/mpeg' });
      this._urls[song.id] = URL.createObjectURL(blob);
    }
    return this._urls[song.id];
  },

  playList(list, index) {
    this.queue = list;
    this.index = index;
    this.play();
  },

  play() {
    const song = this.queue[this.index];
    if (!song) return;
    this.audio.src = this.url(song);
    this.audio.play().then(() => this.emit()).catch(e => {
      console.warn('[music]', e);
      toast('播放失败：' + (e.message || '格式不支持'));
    });
    this.emit();
  },

  toggle() {
    if (this.audio.paused) this.audio.play().catch(() => {});
    else this.audio.pause();
    this.emit();
  },

  next(auto = false) {
    if (!this.queue.length) return;
    if (this.mode === 'repeat1' && auto) { this.audio.currentTime = 0; this.audio.play(); return; }
    if (this.mode === 'shuffle') {
      this.index = Math.floor(Math.random() * this.queue.length);
    } else {
      this.index = (this.index + 1) % this.queue.length;
    }
    this.play();
  },

  prev() {
    if (!this.queue.length) return;
    if (this.audio.currentTime > 4) { this.audio.currentTime = 0; return; }
    this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this.play();
  },

  control(act) {
    if (act === 'play') this.toggle();
    else if (act === 'next') this.next();
    else if (act === 'prev') this.prev();
  },

  cycleMode() {
    const modes = ['order', 'repeat', 'repeat1', 'shuffle'];
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    toast({ order: '顺序播放', repeat: '列表循环', repeat1: '单曲循环', shuffle: '随机播放' }[this.mode]);
    Bus.emit('music:mode', this.mode);
    return this.mode;
  },

  seek(t) { if (this.audio.duration) this.audio.currentTime = t; },

  state() {
    const song = this.queue[this.index];
    return {
      playing: !!song && !this.audio.paused,
      title: song?.title || '未知歌曲',
      artist: song?.artist || '未知歌手',
      cover: song?.cover || null,
      duration: song?.duration || 0,
    };
  },

  emit() { Bus.emit('music:state', this.state()); },
};

/* ============ ID3 解析（手写迷你版） ============ */
function parseID3(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const result = { title: null, artist: null, album: null, cover: null };
  const dec = (arr, enc) => {
    try {
      if (enc === 1) return new TextDecoder('utf-16').decode(arr);
      if (enc === 2) return new TextDecoder('utf-16be').decode(arr);
      if (enc === 3) return new TextDecoder('utf-8').decode(arr);
      return new TextDecoder('windows-1252').decode(arr);
    } catch (e) { return null; }
  };
  const syncsafe = (off) => ((view.getUint8(off) & 0x7f) << 21) | ((view.getUint8(off + 1) & 0x7f) << 14) | ((view.getUint8(off + 2) & 0x7f) << 7) | (view.getUint8(off + 3) & 0x7f);

  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const ver = bytes[3];
    const size = syncsafe(6);
    let off = 10;
    const end = Math.min(10 + size, bytes.length);
    while (off + 10 <= end) {
      const id = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
      let fsize = ver === 4 ? syncsafe(off + 4) : view.getUint32(off + 4);
      if (!/^[A-Z0-9]{4}$/.test(id) || fsize <= 0 || off + 10 + fsize > end) break;
      const dataStart = off + 10;
      if (id === 'TIT2' || id === 'TPE1' || id === 'TALB') {
        const enc = bytes[dataStart];
        const text = dec(bytes.slice(dataStart + 1, dataStart + fsize), enc);
        if (text) result[{ TIT2: 'title', TPE1: 'artist', TALB: 'album' }[id]] = text.replace(/\0+$/, '').trim();
      } else if (id === 'APIC') {
        const enc = bytes[dataStart];
        let p = dataStart + 1;
        let mime = '';
        while (p < end && bytes[p] !== 0) mime += String.fromCharCode(bytes[p++]);
        p++; // null
        p++; // picture type
        if (enc === 1 || enc === 2) { while (p + 1 < end && !(bytes[p] === 0 && bytes[p + 1] === 0)) p += 2; p += 2; }
        else { while (p < end && bytes[p] !== 0) p++; p++; }
        const imgBytes = bytes.slice(p, dataStart + fsize);
        if (imgBytes.length > 100) {
          let bin = '';
          for (let i = 0; i < imgBytes.length; i++) bin += String.fromCharCode(imgBytes[i]);
          result.cover = 'data:' + (mime || 'image/jpeg') + ';base64,' + btoa(bin);
        }
      }
      off = dataStart + fsize;
    }
  }
  // ID3v1 回退
  if (!result.title && bytes.length > 128) {
    const tail = bytes.slice(bytes.length - 128);
    if (String.fromCharCode(tail[0], tail[1], tail[2]) === 'TAG') {
      const txt = (a, l) => dec(a, 0);
      const title = txt(tail.slice(3, 33), 32);
      const artist = txt(tail.slice(33, 63), 32);
      if (title) result.title = title.replace(/\0+$/, '').trim();
      if (artist) result.artist = artist.replace(/\0+$/, '').trim();
    }
  }
  return result;
}

/* ============ 应用 ============ */
export default {
  id: 'music',
  name: '音乐',
  icon: AppIcons.music,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    MusicEngine.init();
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    const tabHost = el('div', 'app-root');
    overlay.before(tabHost);
    buildLibrary(tabHost);
  },

  unmount() { /* 引擎全局，无需清理 */ },
};

async function buildLibrary(tabHost) {
  const songs = await DB.byIndex('music', 'addedAt');
  MusicEngine.queue = songs;
  tabHost.innerHTML = '';

  const content = el('div', '');
  content.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;position:relative;overflow:hidden;';
  const tabbar = el('div', 'tabbar');
  const tabs = [
    { label: '歌曲', icon: TIcons.song },
    { label: '专辑', icon: TIcons.album },
    { label: '歌手', icon: TIcons.artist },
    { label: '导入', icon: TIcons.importI },
  ];
  const views = [() => renderSongs(content, songs), () => renderGrouped(content, songs, 'album', '专辑'), () => renderGrouped(content, songs, 'artist', '歌手'), () => renderImport(content, songs)];
  const tabEls = [];
  tabs.forEach((t, i) => {
    const item = el('div', 'tab-item' + (i === 0 ? ' on' : ''));
    item.innerHTML = `${t.icon}<span>${t.label}</span>`;
    item.onclick = () => {
      tabEls.forEach(x => x.classList.remove('on'));
      tabEls[i].classList.add('on');
      views[i]();
    };
    tabEls.push(item);
    tabbar.appendChild(item);
  });
  tabHost.append(content, tabbar);
  renderSongs(content, songs);
}

function libraryHeader(body, count) {
  const head = el('div', 'large-title');
  head.innerHTML = `资料库 <span style="font-size:14px;font-weight:400;color:var(--text-2)">${count} 首歌曲</span>`;
  body.appendChild(head);
}

function renderSongs(content, songs) {
  content.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">音乐</div><div class="nav-side right"></div>`;
  const body = el('div', 'page-body');
  page.append(navBar, body);
  content.appendChild(page);
  libraryHeader(body, songs.length);

  if (!songs.length) {
    body.innerHTML += `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 18.5V5l11-2v13.5"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="16.5" r="2.5"/></svg>
      <div class="es-title">曲库为空</div><div>到「导入」标签上传本地 MP3（自动读取 ID3）</div></div>`;
    return;
  }
  const list = el('div', 'inset-card');
  songs.forEach((s, i) => {
    const row = el('div', 'row song-row');
    row.innerHTML = `
      <div class="song-cover">${s.cover ? `<img src="${s.cover}">` : '<span>♪</span>'}</div>
      <div class="row-label" style="min-width:0">
        <div class="ellipsis" style="font-size:16px;${playingIdx() === i ? 'color:var(--danger)' : ''}">${escapeHtml(s.title || '未知歌曲')}</div>
        <div class="ellipsis" style="font-size:13px;color:var(--text-2)">${escapeHtml(s.artist || '未知歌手')} · ${fmtDur(s.duration || 0)}</div>
      </div>`;
    row.onclick = () => { MusicEngine.playList(songs, i); openPlayer(s, i, songs); };
    list.appendChild(row);
  });
  const g = el('div', 'inset-group');
  g.appendChild(list);
  body.appendChild(g);
}

function playingIdx() {
  const st = MusicEngine.state();
  return MusicEngine.queue.findIndex(s => s.title === st.title && s.artist === st.artist);
}

function renderGrouped(content, songs, key, label) {
  content.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">音乐</div><div class="nav-side right" style="width:1px"></div>`;
  const body = el('div', 'page-body');
  page.append(navBar, body);
  content.appendChild(page);

  const map = new Map();
  songs.forEach(s => {
    const k = s[key] || '未知' + label;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  });
  if (!map.size) {
    body.innerHTML = `<div class="empty-state"><div class="es-title">暂无${label}</div><div>先导入歌曲</div></div>`;
    return;
  }
  const list = el('div', 'inset-card');
  for (const [name, arr] of map) {
    const row = el('div', 'row');
    row.innerHTML = `
      <div class="song-cover sq"><span>${escapeHtml((name[0] || '♪').toUpperCase())}</span></div>
      <div class="row-label"><div class="ellipsis" style="font-size:16px">${escapeHtml(name)}</div>
      <div style="font-size:13px;color:var(--text-2)">${arr.length} 首</div></div>
      <div class="row-chevron"><svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg></div>`;
    row.onclick = () => MusicEngine.playList(arr, 0);
    list.appendChild(row);
  }
  const g = el('div', 'inset-group');
  g.appendChild(list);
  body.appendChild(g);
}

function renderImport(content, songs) {
  content.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">音乐</div><div class="nav-side right" style="width:1px"></div>`;
  const body = el('div', 'page-body pad');
  page.append(navBar, body);
  content.appendChild(page);

  body.innerHTML = `
    <div class="import-hero">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      <div class="ih-title">导入本地音乐</div>
      <div class="ih-desc">支持 MP3 / M4A / WAV / OGG · 自动读取 ID3 标签（歌名、歌手、专辑封面）· 存入浏览器 IndexedDB，下次打开无需重复导入</div>
      <button class="btn-fill" id="import-btn" style="margin-top:16px">选择音乐文件</button>
    </div>
    ${songs.length ? `<div class="inset-group"><div class="inset-group-title">已导入 ${songs.length} 首</div><div class="inset-card" id="imported-list"></div></div>` : ''}`;

  if (songs.length) {
    const listEl = body.querySelector('#imported-list');
    songs.forEach(s => {
      const row = el('div', 'row');
      row.innerHTML = `<div class="song-cover">${s.cover ? `<img src="${s.cover}">` : '<span>♪</span>'}</div>
        <div class="row-label"><div class="ellipsis" style="font-size:15.5px">${escapeHtml(s.title || '未知歌曲')}</div>
        <div style="font-size:12.5px;color:var(--text-2)">${escapeHtml(s.artist || '未知歌手')}</div></div>
        <button class="btn-sm danger" data-del="${s.id}">删除</button>`;
      row.querySelector('[data-del]').onclick = async (e) => {
        e.stopPropagation();
        const ok = await confirmDialog('删除歌曲', `从曲库删除「${s.title || '未知歌曲'}」？`, { okText: '删除', danger: true });
        if (!ok) return;
        await DB.del('music', s.id);
        buildLibrary(root.querySelector('.app-root') || root);
      };
      listEl.appendChild(row);
    });
  }

  body.querySelector('#import-btn').onclick = () => {
    const input = el('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.onchange = async () => {
      const files = [...input.files];
      if (!files.length) return;
      const ld = loading(`正在导入 ${files.length} 首歌曲…`);
      let ok = 0;
      for (const f of files) {
        try {
          const ab = await f.arrayBuffer();
          const meta = parseID3(ab);
          // 读取时长
          const duration = await probeDuration(ab, f.type);
          await DB.put('music', {
            id: uid('song'), title: meta.title || f.name.replace(/\.[^.]+$/, ''), artist: meta.artist || '未知歌手',
            album: meta.album || '未知专辑', cover: meta.cover, data: ab, duration,
            addedAt: Date.now(), mime: f.type || 'audio/mpeg',
          });
          ok++;
        } catch (e) { console.warn('[import]', f.name, e); }
      }
      ld();
      toast(`成功导入 ${ok} 首${ok < files.length ? `，${files.length - ok} 首失败` : ''}`);
      buildLibrary(root.querySelector('.app-root') || root);
    };
    input.click();
  };
}

function probeDuration(arrayBuffer, mime) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([arrayBuffer], { type: mime || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(a.duration) ? a.duration : 0); };
      a.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      a.src = url;
      setTimeout(() => resolve(isFinite(a.duration) ? a.duration : 0), 3000);
    } catch (e) { resolve(0); }
  });
}

/* ============ 播放器页面 ============ */
function openPlayer(song, index, songs) {
  const page = nav.makePage({
    title: '',
    chevBack: true,
    noNavbar: true,
    className: 'player-page',
    build(body, pageEl) {
      pageEl.classList.add('player-page');
      body.classList.add('player-body');
      body.innerHTML = `
        <button class="pl-back" id="pl-back"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
        <button class="pl-more" id="pl-more"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>
        <div class="pl-art-wrap"><div class="pl-art" id="pl-art"></div></div>
        <div class="pl-info">
          <div class="pl-title ellipsis" id="pl-title"></div>
          <div class="pl-artist ellipsis" id="pl-artist"></div>
        </div>
        <div class="pl-progress">
          <input type="range" class="big" id="pl-seek" min="0" max="100" value="0" step="0.1">
          <div class="pl-times"><span id="pl-cur">0:00</span><span id="pl-dur">0:00</span></div>
        </div>
        <div class="pl-controls">
          <button id="pl-mode"></button>
          <button id="pl-prev"><svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M5.5 5.5v13H8v-13zM19 5.8v12.4L9.5 12z"/></svg></button>
          <button class="pl-play" id="pl-play"></button>
          <button id="pl-next"><svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 5.5v13H16v-13zM5 5.8v12.4L14.5 12z"/></svg></button>
          <button id="pl-queue"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h13M4 12h13M4 18h9M19 15l3 3-3 3"/></svg></button>
        </div>
        <div class="pl-volume">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 5L6 9H2.5v6H6l5 4z"/></svg>
          <input type="range" id="pl-vol" min="0" max="1" step="0.01" value="${MusicEngine.audio.volume}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 5L6 9H2.5v6H6l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>
        </div>
        <div class="pl-lyrics hidden" id="pl-lyrics"></div>`;

      const art = body.querySelector('#pl-art');
      const title = body.querySelector('#pl-title');
      const artist = body.querySelector('#pl-artist');
      const playBtn = body.querySelector('#pl-play');
      const seek = body.querySelector('#pl-seek');
      const cur = body.querySelector('#pl-cur');
      const dur = body.querySelector('#pl-dur');
      const modeBtn = body.querySelector('#pl-mode');
      const lyrics = body.querySelector('#pl-lyrics');

      const MODE_ICON = {
        order: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 2.5l4 4-4 4M3 12V9.5a3 3 0 0 1 3-3h15M7 21.5l-4-4 4-4M21 12v2.5a3 3 0 0 1-3 3H3"/></svg>',
        repeat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 2.5l4 4-4 4M3 12V9.5a3 3 0 0 1 3-3h15M7 21.5l-4-4 4-4M21 12v2.5a3 3 0 0 1-3 3H3"/></svg>',
        repeat1: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 2.5l4 4-4 4M3 12V9.5a3 3 0 0 1 3-3h15M7 21.5l-4-4 4-4M21 12v2.5a3 3 0 0 1-3 3H3"/><text x="11.5" y="15.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">1</text></svg>',
        shuffle: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 3h5v5M21 3l-7.5 7.5M8 21H3v-5M3 21l7.5-7.5M16 21h5v-5M21 21l-5-5M3 3l5 5"/></svg>',
      };

      function render() {
        const s = MusicEngine.queue[MusicEngine.index];
        if (!s) return;
        art.innerHTML = s.cover ? `<img src="${s.cover}" class="${!MusicEngine.audio.paused ? 'rotating' : ''}">` : `<div class="pl-art-ph">♪</div>`;
        title.textContent = s.title || '未知歌曲';
        artist.textContent = (s.artist || '未知歌手') + (s.album && s.album !== '未知专辑' ? ' — ' + s.album : '');
        playBtn.innerHTML = MusicEngine.audio.paused
          ? '<svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>'
          : '<svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>';
        modeBtn.innerHTML = MODE_ICON[MusicEngine.mode];
        dur.textContent = fmtDur(s.duration || 0);
        if (s.lyrics) { lyrics.textContent = s.lyrics; }
        else lyrics.innerHTML = '<span style="opacity:.4">暂无歌词 · 点右上角 ··· 添加</span>';
        MusicEngine.emit();
      }

      body.querySelector('#pl-back').onclick = () => nav.pop();
      playBtn.onclick = () => { MusicEngine.toggle(); render(); };
      body.querySelector('#pl-prev').onclick = () => { MusicEngine.prev(); render(); };
      body.querySelector('#pl-next').onclick = () => { MusicEngine.next(); render(); };
      modeBtn.onclick = () => { MusicEngine.cycleMode(); render(); };
      body.querySelector('#pl-queue').onclick = () => showQueue();
      body.querySelector('#pl-more').onclick = () => songMenu();

      seek.addEventListener('input', () => {
        const pct = seek.value / 100;
        MusicEngine.seek(pct * (MusicEngine.audio.duration || 0));
      });

      const vol = body.querySelector('#pl-vol');
      vol.addEventListener('input', () => { MusicEngine.audio.volume = +vol.value; });

      const offTime = Bus.on('music:time', ({ t, d }) => {
        if (!d) return;
        if (document.activeElement !== seek) seek.value = (t / d) * 100;
        cur.textContent = fmtDur(t);
        dur.textContent = fmtDur(d);
      });
      const offState = Bus.on('music:state', () => render());

      function showQueue() {
        sheet({
          title: '播放队列',
          build(body) {
            body.innerHTML = `<div class="inset-card" style="margin:0">${MusicEngine.queue.map((s, i) => `
              <div class="row" data-i="${i}" style="${i === MusicEngine.index ? 'color:var(--danger)' : ''}">
                <div class="row-label"><div class="ellipsis" style="font-size:15.5px">${escapeHtml(s.title || '未知歌曲')}</div>
                <div style="font-size:12.5px;color:var(--text-2)">${escapeHtml(s.artist || '未知歌手')}</div></div>
                ${i === MusicEngine.index ? '<span style="font-size:11px;color:var(--danger);flex:none">正在播放</span>' : ''}
              </div>`).join('')}</div>`;
            body.querySelectorAll('[data-i]').forEach(r => {
              r.onclick = () => { MusicEngine.index = +r.dataset.i; MusicEngine.play(); render(); r.closest('.sheet-mask').remove(); };
            });
          },
        });
      }

      async function songMenu() {
        const s = MusicEngine.queue[MusicEngine.index];
        if (!s) return;
        const v = await actionSheet([
          { text: s.lyrics ? '编辑歌词' : '添加歌词', value: 'lyrics' },
          { text: '从曲库删除', value: 'del', danger: true },
        ]);
        if (v === 'lyrics') {
          const val = await dialog({
            title: '歌词（纯文本）', message: '',
            input: true, value: s.lyrics || '', okText: '保存',
            buttons: [{ text: '取消', value: null }, { text: '保存', value: undefined, bold: true }],
          });
          if (val !== null) { s.lyrics = val; await DB.put('music', s); render(); toast('歌词已保存'); }
        }
        if (v === 'del') {
          const ok = await confirmDialog('删除歌曲', `从曲库删除「${s.title}」？`, { okText: '删除', danger: true });
          if (!ok) return;
          await DB.del('music', s.id);
          MusicEngine.queue.splice(MusicEngine.index, 1);
          if (MusicEngine.queue.length) { MusicEngine.index = Math.max(0, MusicEngine.index - 1); MusicEngine.play(); }
          else { MusicEngine.audio.pause(); MusicEngine.audio.removeAttribute('src'); }
          render();
        }
      }

      render();

      // 页面销毁时解绑
      const origPop = nav.pop.bind(nav);
      nav.pop = () => {
        offTime(); offState();
        nav.pop = origPop;
        return origPop();
      };
    },
  });
  nav.push(page);
}
