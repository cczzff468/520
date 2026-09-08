/* ============ 锁屏（截图样式：左对齐大时钟 + 农历日期 + 明暗自适应） ============ */

import { el, fmtDate, onSwipe, haptic } from './utils.js';
import { applyWallpaper } from './wallpapers.js';
import { Bus } from './utils.js';
import { Statusbar } from './statusbar.js';
import { Settings } from './db.js';
import { toggleTorch } from './island.js';
import { lunarText } from './lunar.js';
import { Passcode } from './passcode.js';

export const Lock = {
  init() {
    Passcode.load(); // 预载锁屏密码配置（门禁同步判断）
    const lock = document.getElementById('lock');
    lock.innerHTML = `
      <div class="lock-wallpaper"></div>
      <div class="lock-inner">
        <div class="lock-clock-block" id="lock-clock-block">
          <div class="lock-date" id="lock-date">—</div>
          <div class="lock-time num" id="lock-time">9:41</div>
        </div>
      </div>
      <div class="lock-quick">
        <button id="lock-torch" aria-label="手电筒"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2.5h8v3l-2 3v13h-4v-13l-2-3zM10 9.5h4M10 13h4M10 16.5h4"/></svg></button>
        <button id="lock-cam" aria-label="相机"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
      </div>`;
    this._el = lock;
    this._timeNode = lock.querySelector('#lock-time');
    this._dateNode = lock.querySelector('#lock-date');

    this.render();
    this._timer = setInterval(() => this.render(), 1000);

    /* 上滑解锁（触摸/鼠标双通道，touch-action:none 保证移动端不被滚动接管） */
    onSwipe(lock, { up: () => this.unlock() });
    /* 时钟区域点击也可解锁（备用入口） */
    lock.querySelector('#lock-clock-block').addEventListener('click', () => this.unlock());

    lock.querySelector('#lock-cam').addEventListener('click', () => {
      /* 相机快捷入口同样需要通过密码门禁（解锁后再打开相机） */
      this.unlock(() => {
        import('./applayer.js').then(m => m.openApp('camera'));
      });
    });
    lock.querySelector('#lock-torch').addEventListener('click', () => {
      haptic();
      toggleTorch();
    });

    /* 明暗自适应：默认纯白壁纸 → 深色文字（截图样式）；
       自定义亮/暗壁纸由状态栏采样事件驱动切换 */
    (async () => {
      const wp = await Settings.load('wallpaperLock', null);
      if (!wp || (wp.type === 'preset' && (wp.id === 'snow' || wp.id === 'mint' || wp.id === 'peach'))) {
        lock.classList.add('light-ui');
      }
    })();
    Bus.on('sb:style', ({ style }) => {
      lock.classList.toggle('light-ui', style === 'light');
    });

    applyWallpaper('lock');
    /* 注意：不监听 wallpaper:changed 重刷锁屏壁纸 ——
       applyWallpaper('lock') 本身已直接写入 .lock-wallpaper 节点，
       若在此监听再调 applyWallpaper('lock') 会形成 emit→listen→apply→emit 无限事件循环，
       并持续清除状态栏采样定时器，导致亮度自适应失效（已根治） */
  },

  render() {
    const d = new Date();
    this._timeNode.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    let dateLine = `${d.getMonth() + 1}月${d.getDate()}日${wd}`;
    try {
      const lt = lunarText(d);
      if (lt) dateLine += ` · ${lt}`;
    } catch (e) { /* 农历异常不影响公历时间显示 */ }
    this._dateNode.textContent = dateLine;
  },

  show() {
    this._authed = false; // 每次上锁重置密码门禁
    this._asking = false; // 重置密码盘弹出标记
    this._el.classList.add('show');
    Statusbar.setStyle('dark'); // 过渡色
    Statusbar.auto(null, 60);  // 自动采样锁屏壁纸：浅色壁纸 → 黑字 + 锁屏浅色UI
  },
  /* 解锁入口：密码开启时先弹密码盘（验证通过才真正解锁）
     after：解锁成功后的回调（如锁屏相机快捷入口） */
  unlock(after) {
    if (!this._el.classList.contains('show')) return;
    if (this._asking) return; // 密码盘已弹出：防连续触发叠出第二块盘
    if (Passcode.isOn() && !this._authed) {
      /* forgot:true → 锁屏密码盘显示「忘记密码？」（取消键下方），可重设后直接解锁 */
      this._asking = true;
      Passcode.ask({ title: '输入密码', verify: true, forgot: true }).then(code => {
        this._asking = false;
        if (!code) return; // 取消 → 留在锁屏
        this._authed = true;
        this._doUnlock(after);
      });
      return;
    }
    this._doUnlock(after);
  },
  _doUnlock(after) {
    haptic(6);
    this._el.style.transition = 'transform .45s cubic-bezier(.32,.72,0,1), opacity .45s ease';
    this._el.style.transform = 'translateY(-100%)';
    this._el.style.opacity = '0';
    setTimeout(() => {
      this._el.classList.remove('show');
      this._el.style.cssText = '';
      document.getElementById('home').classList.add('show');
      // 解锁后回主屏：自动采样主屏壁纸亮度决定黑白字；若直接进入应用（如锁屏相机）则由 openApp 设置
      import('./applayer.js').then(m => { if (!m.isAppOpen()) Statusbar.auto(null, 80); });
      if (after) after();
    }, 480);
  },
};
