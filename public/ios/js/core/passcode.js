/* ============ 锁屏密码（4 位数字 · iOS 风格全屏密码盘）
    - 存储：Settings 'lockPasscode' = { hash, enabled }（哈希存储，非明文）
    - UI：ask() 全屏毛玻璃密码盘，供锁屏解锁门禁与设置（开启/关闭/更换）复用
    - 忘记密码：verify 模式且 forgot:true 时，取消键下方显示「忘记密码？」
      → 确认层 → 直接进入"设置新密码"两次输入流，成功后写库即刻生效并放行 ============ */

import { haptic } from './utils.js';
import { Settings } from './db.js';
import { Statusbar } from './statusbar.js';

const KEY = 'lockPasscode';
const LEN = 4;

/* 轻量 FNV-1a 字符串哈希（演示用途：避免明文落库，非安全加密） */
function hash4(code) {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* 数字键下的电话字母（iOS 细节） */
const KEY_SUB = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ' };

export const Passcode = {
  _cfg: null, // { hash, enabled }

  /* 启动时预载（锁屏门禁需同步判断） */
  async load() {
    try { this._cfg = await Settings.load(KEY, null) || null; } catch (e) { this._cfg = null; }
    return this._cfg;
  },
  async _save(cfg) { this._cfg = cfg; await Settings.set(KEY, cfg); },

  isOn() { return !!(this._cfg && this._cfg.enabled && this._cfg.hash); },
  hasCode() { return !!(this._cfg && this._cfg.hash); },
  check(code) { return this.hasCode() && hash4(code) === this._cfg.hash; },

  async setCode(code) { await this._save({ hash: hash4(String(code)), enabled: true }); },
  async enable() { await this._save({ ...this._cfg, hash: this._cfg?.hash || hash4('0000'), enabled: true }); },
  async disable() { await this._save({ ...this._cfg, enabled: false }); },

  /* ---------- iOS 风格密码盘（全屏毛玻璃） ----------
     options:
       title      标题（默认「输入密码」）
       subtitle   副标题（可空）
       verify     true=校验已存密码（错→抖动重输）
       confirmSecond true=两次输入设置新密码（不一致→抖动重来）
       forgot     true=verify 模式下显示「忘记密码？」（取消键下方），可重设密码
     resolve: 成功=4位密码字符串；取消=null */
  ask({ title = '输入密码', subtitle = '', verify = false, confirmSecond = false, forgot = false } = {}) {
    return new Promise((resolve) => {
      const screen = document.getElementById('screen');
      if (!screen) { resolve(null); return; }

      const pad = document.createElement('div');
      pad.className = 'pp-overlay';
      pad.innerHTML = `
        <div class="pp-title" id="pp-title">${title}</div>
        <div class="pp-sub" id="pp-sub">${subtitle || ''}</div>
        <div class="pp-dots" id="pp-dots">${'<span></span>'.repeat(LEN)}</div>
        <div class="pp-pad" id="pp-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `
            <button class="pp-key" data-k="${n}">${n}${KEY_SUB[n] ? `<small>${KEY_SUB[n]}</small>` : ''}</button>`).join('')}
          <span class="pp-key blank"></span>
          <button class="pp-key" data-k="0">0</button>
          <button class="pp-del" id="pp-del" aria-label="删除">
            <svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 2.5h13.5a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H8.5L1.5 10z"/><path d="M12 7l6 6M18 7l-6 6"/></svg>
          </button>
        </div>
        <div class="pp-confirm" id="pp-confirm" style="display:none">
          <div class="pp-cf-text">将清除原密码并立即设置新密码。<br>重设成功后，新密码即刻生效。</div>
          <div class="pp-cf-acts">
            <button class="pp-cf-btn" id="pp-cf-no" type="button">取消</button>
            <button class="pp-cf-btn danger" id="pp-cf-yes" type="button">重设密码</button>
          </div>
        </div>
        <button class="pp-cancel" id="pp-cancel" type="button">取消</button>
        <button class="pp-forgot" id="pp-forgot" type="button" style="${verify && forgot ? '' : 'display:none'}">忘记密码？</button>`;
      screen.appendChild(pad);

      const prevStyle = 'dark';
      Statusbar.setStyle(prevStyle); // 密码盘深色底 → 白色状态栏字

      let input = '';
      let first = null;       // 首次输入（confirmSecond 模式）
      let resetOnDone = false; // 忘记密码重设模式：两次一致后写库并放行
      let modeTitle = title;  // 当前模式标题（重设模式会切换，取消/抖动需还原到它）
      const dots = [...pad.querySelectorAll('.pp-dots span')];
      const titleNode = pad.querySelector('#pp-title');
      const subNode = pad.querySelector('#pp-sub');
      const dotsRow = pad.querySelector('#pp-dots');
      const padGrid = pad.querySelector('#pp-pad');
      const cancelBtn = pad.querySelector('#pp-cancel');
      const forgotBtn = pad.querySelector('#pp-forgot');
      const confirmBox = pad.querySelector('#pp-confirm');
      let busy = false; // 抖动动画期间锁定输入

      const paint = () => dots.forEach((d, i) => d.classList.toggle('fill', i < input.length));
      const close = (val) => {
        pad.classList.add('out');
        setTimeout(() => pad.remove(), 210);
        Statusbar.auto(null, 80); // 恢复采样（锁屏壁纸/应用底色）
        resolve(val);
      };
      const shake = (msg) => {
        busy = true;
        haptic(12);
        dotsRow.classList.remove('shake');
        void dotsRow.offsetWidth; // 重启动画
        dotsRow.classList.add('shake');
        subNode.textContent = msg || '';
        subNode.classList.add('warn');
        setTimeout(() => {
          input = '';
          paint();
          busy = false;
        }, 460);
      };
      const submit = () => {
        if (verify) {
          if (this.check(input)) { haptic(8); close(input); }
          else shake('密码不正确，请重试');
          return;
        }
        if (!confirmSecond) { close(input); return; }
        if (first === null) {
          first = input;
          input = '';
          paint();
          titleNode.textContent = '再次输入新密码';
          subNode.textContent = '';
          subNode.classList.remove('warn');
          return;
        }
        if (first === input) {
          haptic(8);
          if (resetOnDone) {
            /* 忘记密码重设：新密码写库（开启状态）后再放行，调用方按验证成功处理 */
            this.setCode(input).catch(() => {}).finally(() => close(input));
          } else {
            close(input);
          }
        } else { first = null; titleNode.textContent = modeTitle; shake('两次输入不一致，请重新设置'); }
      };
      const push = (k) => {
        if (busy || input.length >= LEN) return;
        input += k;
        subNode.classList.remove('warn');
        haptic(4);
        paint();
        if (input.length === LEN) setTimeout(submit, 120); // 点位填充后短暂停顿再校验（iOS 节奏）
      };

      /* ---- 输入区显隐（忘记密码确认层 ↔ 密码盘） ---- */
      const showEntry = (show) => {
        dotsRow.style.display = show ? '' : 'none';
        padGrid.style.display = show ? '' : 'none';
        cancelBtn.style.display = show ? '' : 'none';
        forgotBtn.style.display = (show && verify && forgot && !resetOnDone) ? '' : 'none';
      };

      /* 忘记密码 → 确认层 */
      forgotBtn.addEventListener('click', () => {
        haptic(6);
        confirmBox.style.display = '';
        showEntry(false);
        titleNode.textContent = '忘记密码？';
        subNode.textContent = '';
        subNode.classList.remove('warn');
      });
      /* 确认层 · 取消 → 回到密码盘 */
      pad.querySelector('#pp-cf-no').addEventListener('click', () => {
        haptic(4);
        confirmBox.style.display = 'none';
        showEntry(true);
        titleNode.textContent = modeTitle;
        subNode.textContent = subtitle || '';
        subNode.classList.remove('warn');
      });
      /* 确认层 · 重设密码 → 直接进入"设置新密码"两次输入流（不再验旧码） */
      pad.querySelector('#pp-cf-yes').addEventListener('click', () => {
        haptic(8);
        confirmBox.style.display = 'none';
        verify = false;
        confirmSecond = true;
        resetOnDone = true;
        first = null;
        input = '';
        paint();
        modeTitle = '设置新密码';
        titleNode.textContent = modeTitle;
        subNode.textContent = '';
        subNode.classList.remove('warn');
        showEntry(true);
      });

      pad.querySelectorAll('.pp-key[data-k]').forEach(btn => {
        btn.addEventListener('click', () => push(btn.dataset.k));
      });
      pad.querySelector('#pp-del').addEventListener('click', () => {
        if (busy || !input.length) return;
        input = input.slice(0, -1);
        haptic(3);
        paint();
      });
      cancelBtn.addEventListener('click', () => close(null));
    });
  },
};
