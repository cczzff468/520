/* ============ 录音机（语音备忘录） ============ */

import { el, uid, haptic, fmtDur, fmtSmartTime, downloadBlob, audioBufferToWav } from '../core/utils.js';
import { DB } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, dialog, confirmDialog, promptDialog, escapeHtml } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

let root = null;
let nav = null;

let mediaStream = null;
let mediaRecorder = null;
let chunks = [];
let recording = false;
let paused = false;
let recordStart = 0;
let analyser = null;
let audioCtx = null;
let waveRAF = null;

let playObj = null; // { audio, url, rec }

export default {
  id: 'recorder',
  name: '录音机',
  icon: AppIcons.recorder,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    const page = nav.makePage({
      title: '录音机',
      right: [navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => {
        const input = el('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = async () => {
          for (const f of input.files) {
            const ab = await f.arrayBuffer();
            await DB.put('recordings', { id: uid('rec'), name: f.name.replace(/\.[^.]+$/, ''), data: ab, mime: f.type || 'audio/webm', duration: 0, createdAt: Date.now() });
          }
          toast('已导入 ' + input.files.length + ' 条录音');
          loadList();
        };
        input.click();
      })],
      build(body) {
        body.classList.add('rec-body');
        body.innerHTML = `
          <div class="rec-record-zone">
            <div class="rec-time num" id="rec-time">0:00.0</div>
            <div class="rec-canvas-wrap"><canvas id="rec-canvas" height="90"></canvas></div>
            <button class="rec-btn" id="rec-btn">
              <div class="rec-btn-shape"></div>
            </button>
            <div class="rec-hint" id="rec-hint">轻点开始录音</div>
            <div class="rec-actions hidden" id="rec-actions">
              <button id="rec-cancel">取消</button>
              <button id="rec-done" class="rec-done">完成</button>
            </div>
          </div>
          <div class="rec-list-wrap">
            <div class="inset-group-title" style="text-transform:none;font-size:15px;font-weight:600;color:var(--text)">所有录音 <span id="rec-count" style="color:var(--text-2);font-weight:400"></span></div>
            <div id="rec-list"></div>
          </div>`;
        bindRecord(body);
        loadList();
      },
    });
    nav.setRoot(page);
  },

  unmount() {
    stopRecording(true);
    stopPlayback();
    if (waveRAF) cancelAnimationFrame(waveRAF);
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} }
  },
};

/* ============ 录音 ============ */
function bindRecord(body) {
  const btn = body.querySelector('#rec-btn');
  const timeEl = body.querySelector('#rec-time');
  const hint = body.querySelector('#rec-hint');
  const actions = body.querySelector('#rec-actions');
  const canvas = body.querySelector('#rec-canvas');

  btn.onclick = async () => {
    if (!recording) {
      await startRecording(canvas, timeEl, hint, actions, btn);
    } else if (!paused) {
      mediaRecorder.pause();
      paused = true;
      btn.classList.add('paused');
      hint.textContent = '已暂停 · 轻点继续';
    } else {
      mediaRecorder.resume();
      paused = false;
      btn.classList.remove('paused');
      hint.textContent = '正在录音…';
    }
  };

  body.querySelector('#rec-cancel').onclick = async () => {
    stopRecording(true);
    resetUI();
    toast('已取消录音');
  };
  body.querySelector('#rec-done').onclick = async () => {
    const dur = (Date.now() - recordStart) / 1000;
    const blob = await stopRecording(false);
    if (!blob || dur < 0.5) { resetUI(); toast('录音太短'); return; }
    const ab = await blob.arrayBuffer();
    const name = await promptDialog('存储录音', '为这条录音命名', { placeholder: '新录音', value: `新录音 ${new Date().toLocaleDateString('zh-CN')}`, okText: '存储' });
    await DB.put('recordings', {
      id: uid('rec'), name: name || '新录音',
      data: ab, mime: blob.type || 'audio/webm',
      duration: dur, createdAt: Date.now(),
    });
    resetUI();
    loadList();
    toast('录音已保存');
  };

  function resetUI() {
    timeEl.textContent = '0:00.0';
    hint.textContent = '轻点开始录音';
    actions.classList.add('hidden');
    btn.classList.remove('recording', 'paused');
    drawIdle(canvas);
  }
}

async function startRecording(canvas, timeEl, hint, actions, btn) {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    toast('无法访问麦克风：' + (e.message || '请检查权限'), 3000);
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaStreamSource(mediaStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);

  chunks = [];
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType: pickMime() });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mediaRecorder.start(200);
  recording = true; paused = false;
  recordStart = Date.now();
  btn.classList.add('recording');
  hint.textContent = '正在录音…';
  actions.classList.remove('hidden');
  haptic(20);

  const times = new Uint8Array(analyser.frequencyBinCount);
  const peaks = [];
  const draw = () => {
    waveRAF = requestAnimationFrame(draw);
    if (paused) return;
    analyser.getByteTimeDomainData(times);
    let peak = 0;
    for (let i = 0; i < times.length; i++) peak = Math.max(peak, Math.abs(times[i] - 128));
    peaks.push(peak);
    if (peaks.length > 3000) peaks.splice(0, 500);
    drawWave(canvas, peaks, true);
    const sec = (Date.now() - recordStart) / 1000;
    timeEl.textContent = fmtDur(sec, false) + '.' + Math.floor((sec % 1) * 10);
  };
  draw();
}

function pickMime() {
  const prefs = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const m of prefs) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function stopRecording(cancel) {
  return new Promise((resolve) => {
    if (!recording) { resolve(null); return; }
    recording = false; paused = false;
    if (waveRAF) cancelAnimationFrame(waveRAF);
    try { analyser = null; if (audioCtx) audioCtx.close(); audioCtx = null; } catch (e) {}
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
      resolve(cancel ? null : blob);
    };
    try { mediaRecorder.stop(); } catch (e) { resolve(null); }
  });
}

function drawIdle(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio > 1 ? 2 : 1);
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,69,58,.25)';
  const bars = 48;
  for (let i = 0; i < bars; i++) {
    const x = (i / bars) * w + 2;
    ctx.fillRect(x, h / 2 - 1.5, 3, 3);
  }
}

function drawWave(canvas, peaks, live) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(300, canvas.clientWidth * (window.devicePixelRatio > 1 ? 2 : 1));
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const n = 90;
  const slice = peaks.length / n;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = Math.floor(i * slice); j < Math.floor((i + 1) * slice) && j < peaks.length; j++) v = Math.max(v, peaks[j]);
    const barH = Math.max(3, (v / 128) * (h - 10));
    const x = (i / n) * w + 2;
    const grad = live ? '#FF453A' : 'rgba(255,69,58,.55)';
    ctx.fillStyle = grad;
    ctx.fillRect(x, h / 2 - barH / 2, Math.max(2, (w / n) - 4), barH);
  }
}

/* ============ 列表 ============ */
async function loadList() {
  const list = root.querySelector('#rec-list');
  if (!list) return;
  const recs = await DB.byIndex('recordings', 'createdAt');
  root.querySelector('#rec-count') && (root.querySelector('#rec-count').textContent = recs.length ? `· ${recs.length} 条` : '');
  list.innerHTML = '';
  if (!recs.length) {
    list.innerHTML = `<div class="empty-state"><div class="es-title">没有录音</div><div>点击上方红色按钮开始录制</div></div>`;
    return;
  }
  const card = el('div', 'inset-card');
  recs.forEach(r => {
    const row = el('div', 'row rec-row');
    row.innerHTML = `
      <button class="rec-play-btn" data-id="${r.id}"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg></button>
      <div class="row-label" style="min-width:0">
        <div class="ellipsis" style="font-size:16px">${escapeHtml(r.name)}</div>
        <div style="font-size:12.5px;color:var(--text-2)">${fmtDur(r.duration || 0)} · ${fmtSmartTime(r.createdAt)}</div>
      </div>`;
    row.querySelector('.rec-play-btn').onclick = () => openPlayback(r);
    row.oncontextmenu = (e) => { e.preventDefault(); recMenu(r); };
    let t;
    row.addEventListener('touchstart', () => { t = setTimeout(() => recMenu(r), 500); }, { passive: true });
    row.addEventListener('touchmove', () => clearTimeout(t), { passive: true });
    row.addEventListener('touchend', () => clearTimeout(t));
    card.appendChild(row);
  });
  const g = el('div', 'inset-group');
  g.appendChild(card);
  list.appendChild(g);
}

async function recMenu(r) {
  const v = await actionSheet([
    { text: '播放', value: 'play' },
    { text: '重命名', value: 'rename' },
    { text: '导出（下载）', value: 'export' },
    { text: '删除', value: 'del', danger: true },
  ]);
  if (!v) return;
  if (v === 'play') openPlayback(r);
  if (v === 'rename') {
    const name = await promptDialog('重命名', '', { value: r.name, okText: '好' });
    if (name) { r.name = name; await DB.put('recordings', r); loadList(); }
  }
  if (v === 'export') exportRec(r);
  if (v === 'del') {
    const ok = await confirmDialog('删除录音', `删除「${r.name}」？`, { okText: '删除', danger: true });
    if (ok) { await DB.del('recordings', r.id); loadList(); toast('已删除'); }
  }
}

/* ============ 播放与裁剪 ============ */
function openPlayback(r) {
  const blob = new Blob([r.data], { type: r.mime || 'audio/webm' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  playObj = { audio, url, rec: r };
  audio.play().catch(() => {});

  const bar = el('div', 'rec-player');
  bar.innerHTML = `
    <div class="rp-row1">
      <div class="rp-name ellipsis">${escapeHtml(r.name)}</div>
      <button class="rp-close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="rp-controls">
      <button class="rp-skip" data-s="-15"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 8.6 6.4"/><path d="M20.5 2.5v7h-7"/><text x="12" y="16" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">15</text></svg></button>
      <button class="rp-play"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg></button>
      <button class="rp-skip" data-s="15"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3a9 9 0 1 1-8.6 6.4"/><path d="M3.5 2.5v7h7"/><text x="12" y="16" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">15</text></svg></button>
      <div class="rp-speed">1x</div>
    </div>
    <input type="range" class="rp-seek" min="0" max="100" value="0" step="0.1">
    <div class="rp-times num"><span class="rp-cur">0:00</span><span class="rp-dur">${fmtDur(r.duration || 0)}</span></div>
    <div class="rp-tools">
      <button data-act="trim">裁剪</button>
      <button data-act="rename">重命名</button>
      <button data-act="export">导出</button>
    </div>`;
  root.appendChild(bar);

  const playBtn = bar.querySelector('.rp-play');
  const seek = bar.querySelector('.rp-seek');
  const cur = bar.querySelector('.rp-cur');
  const durEl = bar.querySelector('.rp-dur');
  const speedBtn = bar.querySelector('.rp-speed');

  const update = () => {
    if (!audio.duration) return;
    seek.value = (audio.currentTime / audio.duration) * 100;
    cur.textContent = fmtDur(audio.currentTime);
  };
  audio.addEventListener('timeupdate', update);
  audio.addEventListener('loadedmetadata', () => { durEl.textContent = fmtDur(audio.duration); if (!r.duration) { r.duration = audio.duration; DB.put('recordings', r); } });
  audio.addEventListener('ended', () => { playBtn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>'; });
  audio.addEventListener('play', () => { playBtn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>'; });

  playBtn.onclick = () => { if (audio.paused) audio.play(); else audio.pause(); };
  seek.addEventListener('input', () => { if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration; });
  bar.querySelectorAll('.rp-skip').forEach(b => {
    b.onclick = () => { audio.currentTime = Math.max(0, Math.min(audio.duration || 1e9, audio.currentTime + (+b.dataset.s))); };
  });
  let speeds = [1, 1.5, 2, 0.5], si = 0;
  speedBtn.onclick = () => { si = (si + 1) % speeds.length; audio.playbackRate = speeds[si]; speedBtn.textContent = speeds[si] + 'x'; };
  bar.querySelector('.rp-close').onclick = () => { stopPlayback(); bar.remove(); };
  bar.querySelectorAll('.rp-tools button').forEach(b => {
    b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'rename') {
        const name = await promptDialog('重命名', '', { value: r.name });
        if (name) { r.name = name; await DB.put('recordings', r); bar.querySelector('.rp-name').textContent = name; loadList(); }
      } else if (act === 'export') {
        exportRec(r);
      } else if (act === 'trim') {
        showTrim(r, bar);
      }
    };
  });
}

function stopPlayback() {
  if (playObj) {
    playObj.audio.pause();
    URL.revokeObjectURL(playObj.url);
    playObj = null;
  }
  document.querySelectorAll('.rec-player').forEach(x => x.remove());
}

async function exportRec(r) {
  if (r.trimStart != null || r.trimEnd != null) {
    const wav = await trimToWav(r);
    if (wav) { downloadBlob(wav, r.name + '.wav'); toast('已导出 WAV'); return; }
  }
  downloadBlob(new Blob([r.data], { type: r.mime || 'audio/webm' }), r.name + (r.mime?.includes('mp4') ? '.m4a' : '.webm'));
  toast('已导出录音');
}

/* ---- 裁剪（音频片段选择 → 存为新录音 / 导出 WAV） ---- */
async function showTrim(r, playerBar) {
  stopPlayback();
  playerBar?.remove();

  // 解码获取波形
  let audioBuffer;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await ctx.decodeAudioData(new Blob([r.data], { type: r.mime }).slice(0));
    ctx.close();
  } catch (e) {
    toast('当前浏览器无法解码该音频格式');
    return;
  }

  const sheetMask = el('div', 'sheet-mask');
  const s = el('div', 'sheet');
  s.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">裁剪录音</div>
    <div class="sheet-body">
      <div class="trim-canvas-wrap"><canvas id="trim-canvas"></canvas>
        <div class="trim-overlay"><div class="trim-window" id="trim-window"></div></div>
      </div>
      <div class="trim-times num"><span id="trim-start">0:00</span><span id="trim-end">${fmtDur(audioBuffer.duration)}</span></div>
      <div class="sheet-actions" style="margin-top:8px">
        <button class="btn-fill ghost" id="trim-cancel">取消</button>
        <button class="btn-fill danger" id="trim-save">裁剪并保存</button>
      </div>
    </div>`;
  sheetMask.appendChild(s);
  document.getElementById('screen').appendChild(sheetMask);
  sheetMask.addEventListener('click', (e) => { if (e.target === sheetMask) sheetMask.remove(); });
  s.querySelector('#trim-cancel').onclick = () => sheetMask.remove();

  // 波形
  const canvas = s.querySelector('#trim-canvas');
  const channel = audioBuffer.getChannelData(0);
  const peaks = [];
  const n = 100;
  const slice = Math.floor(channel.length / n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = i * slice; j < (i + 1) * slice; j += 16) v = Math.max(v, Math.abs(channel[j] || 0));
    peaks.push(v);
  }
  const wrap = canvas.parentElement;
  canvas.width = wrap.clientWidth * 2;
  canvas.height = 160;
  const ctx2 = canvas.getContext('2d');
  ctx2.fillStyle = 'rgba(255,69,58,.65)';
  peaks.forEach((v, i) => {
    const bh = Math.max(3, v * 150);
    ctx2.fillRect(i * (canvas.width / n) + 2, 80 - bh / 2, canvas.width / n - 4, bh);
  });

  // 拖拽选区
  let startFrac = 0, endFrac = 1;
  const win = s.querySelector('#trim-window');
  const setWindow = () => {
    win.style.left = startFrac * 100 + '%';
    win.style.width = (endFrac - startFrac) * 100 + '%';
    s.querySelector('#trim-start').textContent = fmtDur(startFrac * audioBuffer.duration);
    s.querySelector('#trim-end').textContent = fmtDur(endFrac * audioBuffer.duration);
  };
  setWindow();
  let drag = null;
  const hit = (x) => {
    const r = wrap.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (x - r.left) / r.width));
    if (Math.abs(f - startFrac) < 0.04) return 'start';
    if (Math.abs(f - endFrac) < 0.04) return 'end';
    return null;
  };
  wrap.addEventListener('pointerdown', (e) => {
    const h = hit(e.clientX);
    if (h) { drag = h; wrap.setPointerCapture(e.pointerId); }
    else {
      const r = wrap.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      drag = 'start'; startFrac = f; endFrac = Math.max(endFrac, f + 0.02); setWindow();
    }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = wrap.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (drag === 'start') startFrac = Math.min(f, endFrac - 0.02);
    if (drag === 'end') endFrac = Math.max(f, startFrac + 0.02);
    setWindow();
  });
  wrap.addEventListener('pointerup', () => { drag = null; });

  s.querySelector('#trim-save').onclick = async () => {
    const ld = toast('正在裁剪…', 3000);
    const newBlob = trimToWav(r, startFrac, endFrac, audioBuffer);
    if (!newBlob) { toast('裁剪失败'); return; }
    await DB.put('recordings', {
      id: uid('rec'), name: r.name + '（裁剪）', data: await newBlob.arrayBuffer(),
      mime: 'audio/wav', duration: (endFrac - startFrac) * audioBuffer.duration, createdAt: Date.now(),
    });
    sheetMask.remove();
    loadList();
    toast('裁剪完成，已保存新录音');
  };
}

async function trimToWav(r, startFrac = 0, endFrac = 1, bufferArg = null) {
  try {
    const buffer = bufferArg || await (async () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const b = await ctx.decodeAudioData(new Blob([r.data], { type: r.mime }).slice(0));
      ctx.close();
      return b;
    })();
    const sr = buffer.sampleRate;
    const start = Math.floor(startFrac * buffer.length);
    const end = Math.max(start + 1, Math.floor(endFrac * buffer.length));
    const out = new AudioBuffer({ numberOfChannels: Math.min(2, buffer.numberOfChannels), length: end - start, sampleRate: sr });
    for (let c = 0; c < out.numberOfChannels; c++) {
      out.getChannelData(c).set(buffer.getChannelData(c).slice(start, end));
    }
    return audioBufferToWav(out);
  } catch (e) {
    console.warn(e);
    return null;
  }
}
