/* ============ 动态岛（音乐播放时展开） + 锁屏手电筒 + 全局音量 ============ */

import { el, Bus } from './utils.js';
import { Settings } from './db.js';

let torchOn = false;

/* 手电筒：白色全屏遮罩（原控制中心职责，保留给锁屏快捷按钮） */
export function toggleTorch() {
  torchOn = !torchOn;
  let t = document.getElementById('torch-overlay');
  if (!t) {
    t = el('div', '');
    t.id = 'torch-overlay';
    document.getElementById('screen').appendChild(t);
    t.addEventListener('click', () => toggleTorch());
  }
  t.style.display = torchOn ? 'block' : 'none';
}

export const Island = {
  init() {
    const island = document.getElementById('island');
    if (!island) return;
    island.innerHTML = `<div class="island-music">
      <div class="island-art"></div>
      <div class="island-music-info"><div class="island-music-title ellipsis">—</div></div>
      <div class="island-bars"><i></i><i></i><i></i><i></i></div>
    </div>`;
    island.addEventListener('click', async () => {
      if (!island.classList.contains('expanded')) return;
      const { openApp, isAppOpen } = await import('./applayer.js');
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

    /* 全局音量默认值（原控制中心音量滑块的持久化值仍生效） */
    const audio = document.getElementById('global-audio');
    if (audio) Settings.load('volume', 0.6).then(v => { audio.volume = v; });
  },
};
