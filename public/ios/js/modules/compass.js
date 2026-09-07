/* ============ 指南针 ============ */

import { el } from '../core/utils.js';
import { Apps as AppIcons } from '../core/icons.js';

let root = null;
let cleanup = null;

export default {
  id: 'compass',
  name: '指南针',
  icon: AppIcons.compass,
  sbStyle: 'dark',
  fullscreen: true,

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = `
      <div class="cp-root">
        <div class="cp-back" id="cp-back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>
          <span>指南针</span>
        </div>
        <div class="cp-dial-wrap">
          <div class="cp-dial" id="cp-dial">
            <div class="cp-ticks">
              ${Array.from({ length: 72 }, (_, i) => {
                const major = i % 18 === 0, mid = i % 6 === 0;
                return `<i style="transform:rotate(${i * 5}deg)" class="${major ? 'major' : mid ? 'mid' : ''}"></i>`;
              }).join('')}
            </div>
            <div class="cp-labels">
              <div class="cp-lab n">N</div>
              <div class="cp-lab e">E</div>
              <div class="cp-lab s">S</div>
              <div class="cp-lab w">W</div>
            </div>
            <div class="cp-needle"><i class="north"></i><i class="south"></i></div>
            <div class="cp-center"></div>
          </div>
        </div>
        <div class="cp-readout">
          <div class="cp-deg num" id="cp-deg">--°</div>
          <div class="cp-dir" id="cp-dir">等待传感器…</div>
          <div class="cp-loc" id="cp-loc"></div>
          <div class="cp-hint">无传感器时可拖动罗盘旋转（模拟模式）</div>
        </div>
      </div>`;

    root.querySelector('#cp-back').onclick = async () => {
      const { closeApp } = await import('../core/applayer.js');
      closeApp();
    };

    const dial = root.querySelector('#cp-dial');
    const degEl = root.querySelector('#cp-deg');
    const dirEl = root.querySelector('#cp-dir');

    let heading = 0;
    let sensorActive = false;
    const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

    const setHeading = (h) => {
      heading = ((h % 360) + 360) % 360;
      dial.style.transform = `rotate(${-heading}deg)`;
      degEl.textContent = Math.round(heading) + '°';
      dirEl.textContent = DIRS[Math.round(heading / 45) % 8];
      if (sensorActive) dirEl.textContent = DIRS[Math.round(heading / 45) % 8];
    };

    const handler = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
      else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) h = (360 - e.alpha) % 360;
      if (h != null) { sensorActive = true; setHeading(h); dirEl.textContent = DIRS[Math.round(heading / 45) % 8]; }
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);

    /* 拖拽模拟（无传感器时） */
    let dragging = false, lastAngle = 0;
    const angleOf = (e) => {
      const r = dial.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };
    const down = (e) => { dragging = true; lastAngle = angleOf(e); try { dial.setPointerCapture(e.pointerId); } catch (err) {} };
    const move = (e) => {
      if (!dragging) return;
      const a = angleOf(e);
      let d = a - lastAngle;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      lastAngle = a;
      if (!sensorActive) setHeading(heading + d);
    };
    const up = () => { dragging = false; };
    dial.addEventListener('pointerdown', down);
    dial.addEventListener('pointermove', move);
    dial.addEventListener('pointerup', up);
    dial.addEventListener('pointercancel', up);
    dial.style.touchAction = 'none';
    dial.style.cursor = 'grab';

    // 3 秒无传感器则进入模拟模式提示
    setTimeout(() => { if (!sensorActive) dirEl.textContent = '模拟模式'; }, 3000);

    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        root.querySelector('#cp-loc').textContent = `${pos.coords.latitude.toFixed(4)}°N ${pos.coords.longitude.toFixed(4)}°E`;
      },
      () => { root.querySelector('#cp-loc').textContent = ''; },
      { timeout: 6000 }
    );

    cleanup = () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
      dial.removeEventListener('pointerdown', down);
      dial.removeEventListener('pointermove', move);
      dial.removeEventListener('pointerup', up);
      dial.removeEventListener('pointercancel', up);
    };
  },

  unmount() { cleanup && cleanup(); cleanup = null; },
};
