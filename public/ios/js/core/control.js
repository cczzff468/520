/* ============ 控制中心 + 手电筒 + 动态岛 ============ */

import { el, Bus, haptic, onSwipe } from './utils.js';
import { Settings } from './db.js';
import { Statusbar } from './statusbar.js';

export const Control = {
  _torchOn: false,

  init() {
    const cc = document.getElementById('control-center');
    cc.innerHTML = `
      <div class="cc-inner">
        <div class="cc-group cc-tile cc-tile-icons-wrap" style="grid-column:span 2;grid-row:span 2;flex-direction:row;flex-wrap:wrap;padding:16px 14px;gap:22px;justify-content:center;align-content:center;">
          <div class="cc-toggle" data-key="airplane" style="display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;">
            <div class="cc-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 15.5L14 12l7.5-3.5-1-2.3-9.8 2.2-4.2-4.2-1.8.8 3 5-4.9 2.3.1 1.7 5.4.6.9 5.7 1.7-.5-1.5-5.1 9.6 2.1zM3 21l17-17" stroke="currentColor" stroke-width="0"/></svg></div>
            <span style="font-size:10.5px">飞行模式</span>
          </div>
          <div class="cc-toggle on" data-key="wifi" style="display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;">
            <div class="cc-icon"><svg width="22" height="22" viewBox="0 0 18 14" fill="currentColor"><path d="M9 11.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z"/><path d="M9 6.2c1.7 0 3.3.65 4.5 1.8l1.2-1.25A8.6 8.6 0 0 0 9 4.4a8.6 8.6 0 0 0-5.7 2.35l1.2 1.25A6.3 6.3 0 0 1 9 6.2z"/><path d="M9 2.1c2.7 0 5.2 1.05 7.05 2.85L17.3 3.6A10.9 10.9 0 0 0 9 .2C5.8.2 2.8 1.45.7 3.6l1.25 1.35A9.7 9.7 0 0 1 9 2.1z"/></svg></div>
            <span style="font-size:10.5px">无线局域网</span>
          </div>
          <div class="cc-toggle on" data-key="bt" style="display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;">
            <div class="cc-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7l10 10-5 4V3l5 4L7 17"/></svg></div>
            <span style="font-size:10.5px">蓝牙</span>
          </div>
          <div class="cc-toggle on" data-key="cell" style="display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;">
            <div class="cc-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 13a2.5 2.5 0 0 1-2.5-2.5V6a2.5 2.5 0 0 1 5 0v4.5A2.5 2.5 0 0 1 12 13zM17 11.5a5 5 0 0 1-10 0M12 16.5V21M8.5 21h7"/></svg></div>
            <span style="font-size:10.5px">蜂窝数据</span>
          </div>
        </div>

        <div class="cc-music" id="cc-music" style="grid-column:span 2;grid-row:span 2;">
          <div class="cc-music-title">未在播放</div>
          <div class="cc-music-artist">音乐</div>
          <div class="cc-music-ctrl">
            <button data-act="prev">${svgPrev}</button>
            <button data-act="play" style="transform:scale(1.35)">${svgPlay}</button>
            <button data-act="next">${svgNext}</button>
          </div>
        </div>

        <div class="cc-slider" id="cc-bright">
          <div class="fill" style="height:75%"></div>
          <div class="cc-slider-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg></div>
        </div>

        <div class="cc-slider" id="cc-vol">
          <div class="fill" style="height:60%"></div>
          <div class="cc-slider-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2.5v6H6l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg></div>
        </div>

        <div class="cc-group" id="cc-lock-rotate" style="grid-column:span 2;">
          <div class="cc-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2"/><path d="M18.5 2.5v3.5h-3.5M5.5 21.5V18h3.5"/></svg></div>
          <span>旋转锁定</span>
        </div>

        <div class="cc-group" id="cc-theme">
          <div class="cc-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7 7 0 0 0 10 10z"/></svg></div>
          <span>深色模式</span>
        </div>

        <div class="cc-group" id="cc-torch-btn">
          <div class="cc-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2.5h8v3l-2 3v13h-4v-13l-2-3zM10 9.5h4M10 13h4M10 16.5h4"/></svg></div>
          <span>手电筒</span>
        </div>

        <div class="cc-group" id="cc-lock-now" style="grid-column:span 2;">
          <div class="cc-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg></div>
          <span>锁定屏幕</span>
        </div>
      </div>`;
    this._cc = cc;

    // 关闭手势：上滑或点击空白
    onSwipe(cc, { up: () => this.hide() });
    cc.addEventListener('click', (e) => { if (e.target === cc) this.hide(); });

    // 开关
    cc.querySelectorAll('.cc-toggle').forEach(t => {
      t.addEventListener('click', () => {
        t.classList.toggle('on');
        haptic();
      });
    });

    // 主题切换
    cc.querySelector('#cc-theme').addEventListener('click', async () => {
      haptic();
      const cur = Settings.get('theme', 'auto');
      const next = cur === 'dark' ? 'light' : 'dark';
      const { applyTheme } = await import('./theme.js');
      await applyTheme(next);
      this.hide();
    });

    // 手电筒
    cc.querySelector('#cc-torch-btn').addEventListener('click', () => { haptic(); this.toggleTorch(); });

    // 锁定屏幕
    cc.querySelector('#cc-lock-now').addEventListener('click', async () => {
      haptic();
      this.hide();
      const { closeApp } = await import('./applayer.js');
      closeApp();
      const { Lock } = await import('./lock.js');
      Lock.show();
    });

    // 音乐控制
    cc.querySelector('#cc-music').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      import('../modules/music.js').then(m => m.MusicEngine.control(act));
    });

    // 滑块（亮度/音量）
    this.bindSlider(cc.querySelector('#cc-bright'), (v) => {
      document.getElementById('screen').style.filter = `brightness(${(0.35 + v * 0.65).toFixed(2)})`;
    });
    this.bindSlider(cc.querySelector('#cc-vol'), async (v) => {
      const audio = document.getElementById('global-audio');
      audio.volume = v;
      await Settings.setQuiet('volume', v);
    });
    const audio = document.getElementById('global-audio');
    audio.volume = 0.6;

    Bus.on('gesture:pull-down', () => this.show());

    // 音乐状态同步
    Bus.on('music:state', (s) => this.renderMusic(s));
    this.initIsland();
  },

  bindSlider(node, cb) {
    const fill = node.querySelector('.fill');
    const set = (clientY) => {
      const r = node.getBoundingClientRect();
      let v = 1 - (clientY - r.top) / r.height;
      v = Math.max(0, Math.min(1, v));
      fill.style.height = (v * 100).toFixed(1) + '%';
      cb(v);
    };
    const move = (e) => { set(e.touches ? e.touches[0].clientY : e.clientY); };
    node.addEventListener('pointerdown', (e) => {
      node.setPointerCapture(e.pointerId);
      set(e.clientY);
      const mm = (ev) => move(ev);
      const mu = () => { node.removeEventListener('pointermove', mm); node.removeEventListener('pointerup', mu); };
      node.addEventListener('pointermove', mm);
      node.addEventListener('pointerup', mu);
    });
  },

  renderMusic(s) {
    const m = this._cc.querySelector('#cc-music');
    if (!m) return;
    m.querySelector('.cc-music-title').textContent = s && s.title ? s.title : '未在播放';
    m.querySelector('.cc-music-artist').textContent = s && s.artist ? s.artist : '音乐';
    m.querySelector('[data-act="play"]').innerHTML = s && s.playing ? svgPause : svgPlay;
  },

  toggleTorch() {
    this._torchOn = !this._torchOn;
    let t = document.getElementById('torch-overlay');
    if (!t) {
      t = el('div', '');
      t.id = 'torch-overlay';
      document.getElementById('screen').appendChild(t);
      t.addEventListener('click', () => { this.toggleTorch(); });
    }
    t.style.display = this._torchOn ? 'block' : 'none';
  },

  show() {
    this._cc.classList.add('show');
    Statusbar.setStyle('dark'); // 控制中心深色玻璃 → 白字
  },
  hide() {
    this._cc.classList.remove('show');
    Statusbar.auto(null, 60); // 关闭后重新采样背后的应用/壁纸
  },

  /* ---------- 动态岛：音乐播放时展开 ---------- */
  initIsland() {
    const island = document.getElementById('island');
    island.innerHTML = `<div class="island-music">
      <div class="island-art"></div>
      <div class="island-music-info"><div class="island-music-title ellipsis">—</div></div>
      <div class="island-bars"><i></i><i></i><i></i><i></i></div>
    </div>`;
    island.addEventListener('click', async () => {
      if (!island.classList.contains('expanded')) return;
      const { closeApp, openApp, isAppOpen } = await import('./applayer.js');
      if (isAppOpen()) return;
      openApp('music');
    });
    Bus.on('music:state', (s) => {
      const expanded = s && s.playing;
      island.classList.toggle('expanded', !!expanded);
      if (expanded) {
        island.querySelector('.island-music-title').textContent = s.title || '未知歌曲';
        const art = island.querySelector('.island-art');
        if (s.cover) { art.innerHTML = `<img src="${s.cover}">`; }
        else { art.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9 18.5V5l11-2v13.5"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="16.5" r="2.5"/></svg></div>`; }
      }
    });
  },
};

const svgPlay = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>`;
const svgPause = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>`;
const svgPrev = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5.5 5.5v13H8v-13zM19 5.8v12.4L9.5 12z"/></svg>`;
const svgNext = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 5.5v13H16v-13zM5 5.8v12.4L14.5 12z"/></svg>`;
