/* ============ 壁纸库（SVG 渐变壁纸 + 相册照片壁纸） ============ */

function svgWallpaper(inner, w = 800, h = 1732) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const Wallpapers = {
  presets: [
    { id: 'aurora', name: '极光', css: svgWallpaper(`
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0F1B33"/><stop offset="1" stop-color="#05070F"/></linearGradient>
        <radialGradient id="g1" cx=".28" cy=".18" r=".5"><stop offset="0" stop-color="#3B6FE0" stop-opacity=".85"/><stop offset="1" stop-color="#3B6FE0" stop-opacity="0"/></radialGradient>
        <radialGradient id="g2" cx=".78" cy=".42" r=".55"><stop offset="0" stop-color="#7A3BE0" stop-opacity=".7"/><stop offset="1" stop-color="#7A3BE0" stop-opacity="0"/></radialGradient>
        <radialGradient id="g3" cx=".5" cy=".82" r=".6"><stop offset="0" stop-color="#1FB6A8" stop-opacity=".55"/><stop offset="1" stop-color="#1FB6A8" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${800}" height="${1732}" fill="url(#bg)"/>
      <rect width="${800}" height="${1732}" fill="url(#g1)"/>
      <rect width="${800}" height="${1732}" fill="url(#g2)"/>
      <rect width="${800}" height="${1732}" fill="url(#g3)"/>`) },
    { id: 'sunset', name: '日落', css: svgWallpaper(`
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2B1055"/><stop offset=".45" stop-color="#7B2F8E"/><stop offset=".8" stop-color="#F17C54"/><stop offset="1" stop-color="#F9C749"/>
      </linearGradient></defs>
      <rect width="${800}" height="${1732}" fill="url(#s)"/>
      <circle cx="560" cy="1180" r="150" fill="#FFD9A0" opacity=".85"/>`) },
    { id: 'mint', name: '青柠', css: svgWallpaper(`
      <defs>
        <linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D3F5E3"/><stop offset="1" stop-color="#8ED9B8"/></linearGradient>
        <radialGradient id="m2" cx=".8" cy=".1" r=".6"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".8"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${800}" height="${1732}" fill="url(#m)"/>
      <rect width="${800}" height="${1732}" fill="url(#m2)"/>`) },
    { id: 'snow', name: '纯白', css: svgWallpaper(`
      <defs><rect width="${800}" height="${1732}" fill="#FAFAFA"/></defs>
      <rect width="${800}" height="${1732}" fill="#FAFAFA"/>`) },
    { id: 'ink', name: '墨色', css: svgWallpaper(`
      <defs><linearGradient id="k" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#232529"/><stop offset="1" stop-color="#0A0A0C"/>
      </linearGradient></defs>
      <rect width="${800}" height="${1732}" fill="url(#k)"/>`) },
    { id: 'peach', name: '蜜桃', css: svgWallpaper(`
      <defs>
        <linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE0D6"/><stop offset=".5" stop-color="#FFC2BA"/><stop offset="1" stop-color="#FF9AA8"/></linearGradient>
        <radialGradient id="p2" cx=".2" cy=".85" r=".5"><stop offset="0" stop-color="#FF7E9A" stop-opacity=".6"/><stop offset="1" stop-color="#FF7E9A" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${800}" height="${1732}" fill="url(#p)"/>
      <rect width="${800}" height="${1732}" fill="url(#p2)"/>`) },
    { id: 'ocean', name: '深海', css: svgWallpaper(`
      <defs>
        <linearGradient id="o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0F5E8C"/><stop offset="1" stop-color="#041B2E"/></linearGradient>
        <radialGradient id="o2" cx=".5" cy=".25" r=".55"><stop offset="0" stop-color="#2FA3D8" stop-opacity=".75"/><stop offset="1" stop-color="#2FA3D8" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${800}" height="${1732}" fill="url(#o)"/>
      <rect width="${800}" height="${1732}" fill="url(#o2)"/>`) },
    { id: 'mono', name: '石板', css: svgWallpaper(`
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#4C5560"/><stop offset="1" stop-color="#1E232B"/></linearGradient></defs>
      <rect width="${800}" height="${1732}" fill="url(#g)"/>`) },
  ],

  preset(id) { return this.presets.find(p => p.id === id) || this.presets[0]; },
};

import { Settings, DB } from './db.js';
import { Bus } from './utils.js';

/** 解析壁纸设置 → CSS background 值 */
export async function wallpaperCSS(wp) {
  if (!wp) wp = await Settings.load('wallpaperHome', { type: 'preset', id: 'aurora' });
  if (wp.type === 'preset') {
    return { background: `url("${Wallpapers.preset(wp.id).css}") center/cover no-repeat` };
  }
  if (wp.type === 'upload') {
    const up = await DB.get('wallpapers', wp.id);
    if (up) return { background: `url("${up.data}") center/cover no-repeat` };
  }
  if (wp.type === 'photo') {
    const photo = await DB.get('photos', wp.id);
    if (photo) return { background: `url("${photo.data}") center/cover no-repeat` };
  }
  return { background: `url("${Wallpapers.presets[0].css}") center/cover no-repeat` };
}

export async function applyWallpaper(which = 'home') {
  const key = which === 'home' ? 'wallpaperHome' : 'wallpaperLock';
  const wp = await Settings.load(key, null);
  const style = await wallpaperCSS(wp || (which === 'home' ? { type: 'preset', id: 'aurora' } : { type: 'preset', id: 'snow' }));
  const node = which === 'home' ? document.getElementById('wallpaper-home') : document.querySelector('#lock .lock-wallpaper');
  if (node) {
    node.style.background = style.background;
    node.style.backgroundColor = '#111';
  }
  Bus.emit('wallpaper:changed', which);
}
