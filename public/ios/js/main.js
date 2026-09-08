/* ============ 启动入口 ============ */

import { DB } from './core/db.js';
import { Settings } from './core/db.js';
import { seedIfNeeded } from './core/seed.js';
import { initTheme, applyTheme } from './core/theme.js';
import { Statusbar } from './core/statusbar.js';
import { Home } from './core/home.js';
import { Lock } from './core/lock.js';
import { Island } from './core/island.js';
import { Switcher } from './core/switcher.js';
import { Apps as Registry } from './core/applayer.js';
import { applyWallpaper } from './core/wallpapers.js';
import { Bus } from './core/utils.js';

/* 注册 16 个应用 */
import wechat from './modules/wechat.js';
import contacts from './modules/contacts.js';
import photos from './modules/photos.js';
import camera from './modules/camera.js';
import music from './modules/music.js';
import weather from './modules/weather.js';
import calculator from './modules/calculator.js';
import recorder from './modules/recorder.js';
import clock from './modules/clock.js';
import notes from './modules/notes.js';
import calendar from './modules/calendar.js';
import browser from './modules/browser.js';
import moments from './modules/moments.js';
import compass from './modules/compass.js';
import themes from './modules/themes.js';
import settings from './modules/settings.js';

[wechat, contacts, photos, camera, music, weather, calculator, recorder, clock, notes, calendar, browser, moments, compass, themes, settings]
  .forEach(app => Registry.register(app));

/* ---------- 手机缩放适配（桌面视口） ---------- */
function fitPhone() {
  const phone = document.getElementById('phone');
  const isMobile = window.matchMedia('(max-width: 560px)').matches || (window.matchMedia('(max-height: 700px) and (pointer: coarse)').matches);
  if (isMobile) {
    phone.style.transform = '';
    return;
  }
  const scale = Math.min(1, (window.innerHeight - 36) / 852, (window.innerWidth - 20) / 393);
  phone.style.transform = `scale(${scale.toFixed(3)})`;
}

async function boot() {
  await DB.open();
  await seedIfNeeded();
  await initTheme();
  await applyWallpaper('home');
  await applyWallpaper('lock');

  Statusbar.init();
  /* Home 渲染失败不阻断锁屏/其余系统启动（内部已全防御，此处双保险） */
  try { await Home.init(); } catch (e) { console.error('[Home.init]', e); }
  Island.init();
  Lock.init();
  Switcher.init();
  fitPhone();
  window.addEventListener('resize', fitPhone);

  // 锁屏首屏展示
  Lock.show();

  // 预载设置缓存
  await Settings.load('api', null);
  await Settings.load('weatherUnit', 'c');
  await Settings.load('nickname', '我');
  const hapticsOn = await Settings.load('haptics', true);
  (await import('./core/utils.js')).setHaptics(!!hapticsOn);

  Bus.emit('app:ready');
}

boot().catch(e => {
  console.error('[boot]', e);
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;padding:30px;text-align:center;background:#000;z-index:9999';
  d.textContent = '系统启动失败：' + (e.message || e);
  document.getElementById('screen') && document.getElementById('screen').appendChild(d);
});
