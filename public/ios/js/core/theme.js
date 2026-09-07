/* ============ 主题系统：浅色 / 深色 / 自动跟随系统 ============ */

import { Settings } from './db.js';
import { Bus } from './utils.js';

const mq = window.matchMedia('(prefers-color-scheme: dark)');

function resolve(pref) {
  if (pref === 'auto') return mq.matches ? 'dark' : 'light';
  return pref === 'dark' ? 'dark' : 'light';
}

export async function applyTheme(pref) {
  const mode = resolve(pref);
  document.documentElement.dataset.theme = mode;
  document.documentElement.dataset.themePref = pref;
  await Settings.setQuiet('theme', pref);
  Bus.emit('theme:changed', { pref, mode });
}

export async function initTheme() {
  const pref = await Settings.load('theme', 'auto');
  document.documentElement.dataset.theme = resolve(pref);
  document.documentElement.dataset.themePref = pref;
  mq.addEventListener('change', async () => {
    const cur = await Settings.load('theme', 'auto');
    if (cur === 'auto') {
      document.documentElement.dataset.theme = resolve('auto');
      Bus.emit('theme:changed', { pref: 'auto', mode: resolve('auto') });
    }
  });
  return pref;
}
