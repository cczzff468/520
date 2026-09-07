/* ============ SVG 图标库（应用图标 / UI图标 / 天气图标） ============ */

let _uid = 0;
const uid = () => 'g' + (++_uid);

/* 线性UI图标 */
function ui(paths, sw = 1.8, vb = '0 0 24 24') {
  return `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
/* 填充UI图标 */
function uiF(paths, vb = '0 0 24 24') {
  return `<svg viewBox="${vb}" fill="currentColor" aria-hidden="true">${paths}</svg>`;
}

const P = {
  chevronR: '<path d="M9 5l7 7-7 7"/>',
  chevronL: '<path d="M15 5l-7 7 7 7"/>',
  chevronDown: '<path d="M5 9l7 7 7-7"/>',
  chevronUp: '<path d="M5 15l7-7 7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  moreV: '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  camera: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 15.5l-4.5-4.5-7 7"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  trash: '<path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.9 13h9.2l.9-13M10 11v5.5M14 11v5.5"/>',
  play: '<path d="M8 5.2v13.6L19 12z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  prev: '<path d="M5.5 5.5v13H8v-13zM19 5.8v12.4L9.5 12z" fill="currentColor" stroke="none"/>',
  next: '<path d="M18.5 5.5v13H16v-13zM5 5.8v12.4L14.5 12z" fill="currentColor" stroke="none"/>',
  fwd15: '<path d="M12 3a9 9 0 1 1-8.6 6.4"/><path d="M3.5 2.5v7h7"/><text x="12" y="16" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">15</text>',
  back15: '<path d="M12 3a9 9 0 1 0 8.6 6.4"/><path d="M20.5 2.5v7h-7"/><text x="12" y="16" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">15</text>',
  shuffle: '<path d="M16 3h5v5M21 3l-7.5 7.5M8 21H3v-5M3 21l7.5-7.5M16 21h5v-5M21 21l-5-5M3 3l5 5"/>',
  repeat: '<path d="M17 2.5l4 4-4 4M3 12V9.5a3 3 0 0 1 3-3h15M7 21.5l-4-4 4-4M21 12v2.5a3 3 0 0 1-3 3H3"/>',
  repeat1: '<path d="M17 2.5l4 4-4 4M3 12V9.5a3 3 0 0 1 3-3h15M7 21.5l-4-4 4-4M21 12v2.5a3 3 0 0 1-3 3H3"/><text x="11" y="15.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">1</text>',
  volume: '<path d="M11 5L6 9H2.5v6H6l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  volumeOff: '<path d="M11 5L6 9H2.5v6H6l5 4zM16 9l5 6M21 9l-5 6"/>',
  share: '<path d="M12 2.5v12M8 6l4-3.5L16 6"/><path d="M6 10.5H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v12"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V9H15"/>',
  eye: '<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10.5 7 10.5 7a17.5 17.5 0 0 1-3 3.5M6.3 6.5A17 17 0 0 0 1.5 12s4 7 10.5 7c1.9 0 3.6-.6 5-1.4M2 2l20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  wrench: '<path d="M14.5 6.5a4.5 4.5 0 0 0-6.2 5.5L2.5 17.8l3.7 3.7 5.8-5.8a4.5 4.5 0 0 0 5.5-6.2l-3 3-2.8-.7-.7-2.8z"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  bell: '<path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>',
  home: '<path d="M3.5 10.5L12 3l8.5 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 20z"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>',
  moon: '<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7 7 0 0 0 10 10z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.2l1 2.6 2.8-.6 1 2.5 2.7.9-.5 2.8 2 2-2 2 .5 2.8-2.7.9-1 2.5-2.8-.6-1 2.6-1-2.6-2.8.6-1-2.5-2.7-.9.5-2.8-2-2 2-2-.5-2.8 2.7-.9 1-2.5 2.8.6z" stroke-linejoin="round"/>',
  user: '<circle cx="12" cy="7.5" r="4"/><path d="M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-.5A4.5 4.5 0 0 1 7 15h4a4.5 4.5 0 0 1 4.5 4.5V20"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M17.5 15.2a4 4 0 0 1 4 3.8V20"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>',
  location: '<path d="M20.5 10.5c0 6.5-8.5 12-8.5 12s-8.5-5.5-8.5-12a8.5 8.5 0 0 1 17 0z"/><circle cx="12" cy="10.5" r="3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 2.5V6M16 2.5V6M3.5 10.5h17"/>',
  note: '<path d="M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 6 2.5z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.7 5.5 3.7 8.5s-1.2 6-3.7 8.5c-2.5-2.5-3.7-5.5-3.7-8.5s1.2-6 3.7-8.5z"/>',
  heart: '<path d="M20.8 5a5.2 5.2 0 0 0-7.4 0l-1.4 1.4L10.6 5a5.2 5.2 0 0 0-7.4 7.4l1.4 1.4 7.4 7.4 7.4-7.4 1.4-1.4a5.2 5.2 0 0 0 0-7.4z"/>',
  heartF: '<path d="M20.8 5a5.2 5.2 0 0 0-7.4 0l-1.4 1.4L10.6 5a5.2 5.2 0 0 0-7.4 7.4l1.4 1.4 7.4 7.4 7.4-7.4 1.4-1.4a5.2 5.2 0 0 0 0-7.4z" fill="currentColor" stroke="none"/>',
  comment: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3-.4-4.3-1.1L3 20l1.1-4.6A8.5 8.5 0 1 1 21 11.5z"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  edit: '<path d="M17 3.5a2.4 2.4 0 0 1 3.5 3.5L7.5 20H3.5v-4z"/><path d="M15 5.5l3.5 3.5"/>',
  quote: '<path d="M4 6h16M4 10.5h10M4 15h13M4 19.5h8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  scan: '<path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16M3.5 12h17"/>',
  link: '<path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5"/><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L12.5 17"/>',
  compassUI: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  bookmark: '<path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z"/>',
  shield: '<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2.5"/><path d="M21.5 10.5v3M5 10.5v3M8 10.5v3M11 10.5v3"/>',
  flash: '<path d="M13 2L5 13.5h6L11 22l8-11.5h-6z"/>',
  flip: '<path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2"/><path d="M18.5 2.5v3.5h-3.5M5.5 21.5V18h3.5"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.5M3.5 12h.5M3.5 18h.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  lap: '<path d="M12 6.5a5.5 5.5 0 1 0 5.5 5.5"/><path d="M12 6.5V3.5M10.5 3.5h3"/><path d="M12 12l3.5-3.5"/>',
  hourglass: '<path d="M6.5 2.5h11v3L12 12l5.5 6.5v3h-11v-3L12 12 6.5 5.5z"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>',
  waveform: '<path d="M3.5 12h2M8 6.5v11M12 3.5v17M16 6.5v11M20.5 12h-.5"/>',
  musicNote: '<path d="M9 18.5V5l11-2v13.5"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="16.5" r="2.5"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  boltF: '<path d="M13 2L5 13.5h6L11 22l8-11.5h-6z" fill="currentColor" stroke="none"/>',
  stopWatch: '<circle cx="12" cy="13" r="8"/><path d="M12 13V8.5M10 2.5h4M18.5 6.5l1.5-1.5"/><path d="M12 13l3.5 2"/>',
  alarmI: '<circle cx="12" cy="13" r="8"/><path d="M12 13V9M5 3.5L2.5 6M19 3.5L21.5 6M4.5 18.5L2.5 20.5M19.5 18.5l2 2"/>',
  lang: '<path d="M3 5.5h8M7 3.5v2M9.5 5.5c-.5 4-3 7.5-6.5 9.5M5 10.5c1 2 3 3.5 5 4.5M13.5 20.5l4-10 4 10M15 17h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 1 2.5 6M3.5 12V7M3.5 12H8"/><path d="M12 7.5V12l3 2"/>',
  chart: '<path d="M3.5 3.5v17h17"/><path d="M7 15l4-5 3.5 3 5-6.5"/>',
  filter: '<path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8z"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5s1.2 1.8 3.5 1.8 3.5-1.8 3.5-1.8"/><circle cx="9" cy="10" r=".6" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".6" fill="currentColor" stroke="none"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.3 0 2-.8 2-1.8 0-1.6-1.5-2-1.5-3.2 0-1 .8-1.8 2-1.8H17a4 4 0 0 0 4-4c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11.5" r=".9" fill="currentColor" stroke="none"/><circle cx="10" cy="7.5" r=".9" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7" r=".9" fill="currentColor" stroke="none"/>',
  photoStack: '<path d="M8 3.5h11a1.5 1.5 0 0 1 1.5 1.5v11"/><path d="M5 7.5h11a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 16 20.5H5a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 5 7.5z"/><circle cx="8.5" cy="11.5" r="1.2"/><path d="M3.5 17.5l4-3.5 3.5 3 3-2.5 4.5 4"/>',
  cloud: '<path d="M17 18.5H7a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.3a5.1 5.1 0 0 1 2 4.2 5.3 5.3 0 0 1-3 6z"/>',
  flashlight: '<path d="M8 2.5h8v3l-2 3v13h-4v-13l-2-3zM10 9.5h4M10 13h4M10 16.5h4"/>',
  type: '<path d="M5 6.5V4h14v2.5M12 4v16M9 20h6"/>',
  bold: '<path d="M7 4h6.5a3.5 3.5 0 0 1 0 7H7zM7 11h7.5a3.75 3.75 0 0 1 0 7.5H7z"/>',
  italic: '<path d="M10 4h8M6 20h8M14 4l-4 16"/>',
  underline: '<path d="M6.5 4v7a5.5 5.5 0 0 0 11 0V4M5 21h14"/>',
  todo: '<path d="M4 6.5l2 2 3.5-3.5M4 17l2 2 3.5-3.5M12.5 7h8M12.5 17.5h8"/>',
  chevronsRight: '<path d="M6 5l7 7-7 7M12 5l7 7-7 7"/>',
  cropper: '<path d="M6 2.5v13a2 2 0 0 0 2 2h13M2.5 6h13a2 2 0 0 1 2 2v13"/>',
};

/* UI 图标对象 */
export const I = {};
for (const [k, v] of Object.entries(P)) {
  I[k] = (cls = 'ic') => `<span class="${cls}" style="display:inline-flex;line-height:0">${ui(v)}</span>`;
}
export const raw = (k, sw) => ui(P[k], sw);

/* ---------- 设置行彩色图标 ---------- */
export function rowIcon(color, glyphPath, vb = '0 0 24 24') {
  return `<svg viewBox="0 0 29 29" style="border-radius:6.5px"><rect width="29" height="29" rx="6.5" fill="${color}"/><g transform="translate(2.5,2.5) scale(1)" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphPath}</g></svg>`;
}

/* ---------- 天气图标（彩色，viewBox 0 0 48 48） ---------- */
const sunBody = (cx, cy, r, col = '#FFD335') => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>
  ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
    const rad = a * Math.PI / 180;
    const x1 = cx + Math.cos(rad) * (r + 4), y1 = cy + Math.sin(rad) * (r + 4);
    const x2 = cx + Math.cos(rad) * (r + 9.5), y2 = cy + Math.sin(rad) * (r + 9.5);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="3.2" stroke-linecap="round"/>`;
  }).join('')}`;

const cloudBody = (x, y, s, fill = '#FFFFFF', stroke = 'none') => `
  <g transform="translate(${x},${y}) scale(${s})">
    <path d="M9 16.5a5 5 0 0 1-.4-9.98 7 7 0 0 1 13.6 1.1 5 5 0 0 1 1.3 8.88z" fill="${fill}" ${stroke !== 'none' ? `stroke="${stroke}" stroke-width="1.5"` : ''}/>
  </g>`;

export const WIcon = {
  sunny: () => `<svg viewBox="0 0 48 48">${sunBody(24, 24, 9)}</svg>`,
  clearNight: () => `<svg viewBox="0 0 48 48"><path d="M33 27A12 12 0 1 1 21 15a9.5 9.5 0 0 0 12 12z" fill="#FFD335"/></svg>`,
  cloudy: () => `<svg viewBox="0 0 48 48"><circle cx="30" cy="17" r="7.5" fill="#FFD335"/>${cloudBody(4, 18, 1.15, '#F2F4F8')}</svg>`,
  overcast: () => `<svg viewBox="0 0 48 48">${cloudBody(2, 14, 1.1, '#D6DAE0')}${cloudBody(6, 21, 1.1, '#F2F4F8')}</svg>`,
  fog: () => `<svg viewBox="0 0 48 48">${cloudBody(6, 10, 1.05, '#F2F4F8')}<path d="M10 32h28M13 38h22" stroke="#B9C0CC" stroke-width="3.4" stroke-linecap="round"/></svg>`,
  rain: () => `<svg viewBox="0 0 48 48">${cloudBody(4, 8, 1.1, '#F2F4F8')}<path d="M16 33l-2.5 7M24 33l-2.5 7M32 33l-2.5 7" stroke="#3B9CFF" stroke-width="3.4" stroke-linecap="round"/></svg>`,
  shower: () => `<svg viewBox="0 0 48 48"><circle cx="31" cy="13" r="6.5" fill="#FFD335"/>${cloudBody(4, 10, 1.05, '#F2F4F8')}<path d="M16 34l-2.5 7M24 34l-2.5 7M32 34l-2.5 7" stroke="#3B9CFF" stroke-width="3.4" stroke-linecap="round"/></svg>`,
  snow: () => `<svg viewBox="0 0 48 48">${cloudBody(4, 8, 1.1, '#F2F4F8')}<g fill="#7EC8FF"><circle cx="16" cy="35" r="2.6"/><circle cx="24" cy="39" r="2.6"/><circle cx="32" cy="35" r="2.6"/><circle cx="24" cy="33" r="1.8" opacity=".5"/></g></svg>`,
  storm: () => `<svg viewBox="0 0 48 48">${cloudBody(4, 6, 1.1, '#8E98A6')}<path d="M25 30l-6 9h5l-3 8 9-11h-5l3-6z" fill="#FFD335"/></svg>`,
  drizzle: () => `<svg viewBox="0 0 48 48">${cloudBody(4, 8, 1.1, '#F2F4F8')}<path d="M16 34v3M22 38v3M28 34v3M34 38v3" stroke="#3B9CFF" stroke-width="3" stroke-linecap="round"/></svg>`,
};

export const WMO = {
  0: { t: '晴', i: 'sunny' }, 1: { t: '基本晴', i: 'sunny' }, 2: { t: '局部多云', i: 'cloudy' }, 3: { t: '阴', i: 'overcast' },
  45: { t: '有雾', i: 'fog' }, 48: { t: '雾凇', i: 'fog' },
  51: { t: '小毛雨', i: 'drizzle' }, 53: { t: '毛雨', i: 'drizzle' }, 55: { t: '大毛雨', i: 'drizzle' },
  56: { t: '冻毛雨', i: 'drizzle' }, 57: { t: '强冻毛雨', i: 'drizzle' },
  61: { t: '小雨', i: 'rain' }, 63: { t: '中雨', i: 'rain' }, 65: { t: '大雨', i: 'rain' },
  66: { t: '冻雨', i: 'rain' }, 67: { t: '强冻雨', i: 'rain' },
  71: { t: '小雪', i: 'snow' }, 73: { t: '中雪', i: 'snow' }, 75: { t: '大雪', i: 'snow' }, 77: { t: '雪粒', i: 'snow' },
  80: { t: '小阵雨', i: 'shower' }, 81: { t: '阵雨', i: 'shower' }, 82: { t: '强阵雨', i: 'shower' },
  85: { t: '小阵雪', i: 'snow' }, 86: { t: '阵雪', i: 'snow' },
  95: { t: '雷雨', i: 'storm' }, 96: { t: '雷雨伴冰雹', i: 'storm' }, 99: { t: '强雷雨', i: 'storm' },
};
export function wIcon(code, isNight = false) {
  const info = WMO[code] || WMO[3];
  if (isNight && (code === 0 || code === 1)) return WIcon.clearNight();
  return WIcon[info.i]();
}
export function wText(code) { return (WMO[code] || WMO[3]).t; }

/* ============ 16 个应用图标（60x60 圆角方块） ============ */
function icon(stops, content, opts = {}) {
  const id = uid();
  const { rx = 13.5, rot = 0 } = opts;
  const grad = stops ? `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"${rot ? ` gradientTransform="rotate(${rot} .5 .5)"` : ''}>${stops.map(([c, o]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>` : '';
  return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
    <defs>${grad}</defs>
    <rect x="0" y="0" width="60" height="60" rx="${rx}" fill="${stops ? `url(#${id})` : '#fff'}"/>
    ${content}
  </svg>`;
}

export const Apps = {
  wechat: () => icon([['#31D46B', 0], ['#07B94F', 1]], `
    <path d="M23.5 19.5c-6.4 0-11.5 4.2-11.5 9.4 0 2.9 1.6 5.5 4.1 7.2l-1.1 3.4a.8.8 0 0 0 1.2.9l3.9-2.3c1.1.2 2.2.4 3.4.4h.6a9.7 9.7 0 0 1-.3-2.5c0-5.4 5.2-9.7 11.5-9.7h.4c-1.2-4-6-6.8-11.2-6.8z" fill="#fff"/>
    <path d="M41 28.5c0-5-5-9.1-11.1-9.1s-11.1 4.1-11.1 9.1c0 2.6 1.2 4.9 3.2 6.6l-1 3.2a.8.8 0 0 0 1.1.9l3.8-2.2c1.6.5 3.2.7 5 .6l1.4.1c5.4-.3 8.7-4.3 8.7-9.2z" fill="#fff" opacity=".92"/>
    <circle cx="20.5" cy="27.5" r="1.7" fill="#07B94F"/><circle cx="28" cy="27.5" r="1.7" fill="#07B94F"/>
    <circle cx="34" cy="29" r="1.6" fill="#31D46B"/><circle cx="40" cy="29" r="1.6" fill="#31D46B"/>`),

  contacts: () => icon([['#FDFBFF', 0], ['#E8ECF2', 1]], `
    <circle cx="30" cy="24" r="8" fill="#8E99AB"/>
    <path d="M14.5 47a15.5 10 0 0 1 31 0z" fill="#8E99AB"/>
    <rect x="13" y="13" width="34" height="34" fill="none" stroke="#B9C2D0" stroke-width="1.6" rx="4" stroke-dasharray="0"/>
    <circle cx="30" cy="24" r="8" fill="none" stroke="#fff" stroke-width="1.4"/>`),

  photos: () => icon(null, (function () {
    const cols = ['#F8C630', '#FA4D56', '#E645A5', '#8B5CF6', '#3E7BFA', '#22C2F0', '#34C77B', '#9BE33D'];
    return `<g>${cols.map((c, i) => {
      const a = i * 45 * Math.PI / 180;
      const x = 30 + Math.cos(a) * 9.2, y = 30 + Math.sin(a) * 9.2;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="5.4" ry="8.4" fill="${c}" opacity=".82" transform="rotate(${i * 45} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join('')}</g>`;
  })()),

  camera: () => icon([['#D8DBE0', 0], ['#A9AEB6', 1]], `
    <rect x="10" y="17" width="40" height="28" rx="5" fill="#F2F3F5" opacity=".35"/>
    <circle cx="30" cy="31" r="10" fill="#2E3238"/>
    <circle cx="30" cy="31" r="7.2" fill="#48505A"/>
    <circle cx="27" cy="28" r="2.4" fill="#9AA6B4" opacity=".8"/>
    <rect x="10" y="17" width="12" height="5" rx="2.5" fill="#F2F3F5" opacity=".5"/>`),

  music: () => icon([['#FC5C7D', 0], ['#F83655', .55], ['#E5304E', 1]], `
    <path d="M40 12.5v20.2a6.8 6.8 0 1 1-3.4-5.9V19.3l-13 3v14.9a6.8 6.8 0 1 1-3.4-5.9V19z" fill="#fff"/>`),

  weather: () => icon([['#3E8BFF', 0], ['#1B62D9', 1]], `
    <circle cx="24" cy="22" r="8.5" fill="#FFD335"/>
    <path d="M16 40a7 7 0 0 1-.5-14A9.8 9.8 0 0 1 34.8 24.2 7 7 0 0 1 34 40z" fill="#fff"/>`),

  calculator: () => icon([['#3A3A3F', 0], ['#1C1C20', 1]], `
    <rect x="11" y="9" width="38" height="12" rx="2.5" fill="#2C2C31"/>
    <text x="45" y="18.5" text-anchor="end" font-size="8.5" fill="#fff" font-family="ui-monospace,monospace" font-weight="600">1,024</text>
    ${[0, 1, 2, 3].map(r => [0, 1, 2].map(c => {
      const x = 11 + c * 11, y = 24 + r * 7.5;
      const col = (r === 3) ? '#FF9F0A' : (c === 2 ? '#FF9F0A' : '#666470');
      return `<rect x="${x}" y="${y}" width="9.5" height="6" rx="2" fill="${col}"/>`;
    }).join('')).join('')}`),

  recorder: () => icon([['#4A4A50', 0], ['#222226', 1]], `
    <g stroke="#FF453A" stroke-width="3" stroke-linecap="round">
      <line x1="15" y1="28" x2="15" y2="32"/><line x1="20.5" y1="22" x2="20.5" y2="38"/>
      <line x1="26" y1="17" x2="26" y2="43"/><line x1="31.5" y1="21" x2="31.5" y2="39"/>
      <line x1="37" y1="25" x2="37" y2="35"/><line x1="42.5" y1="28" x2="42.5" y2="32"/>
    </g>`),

  clock: () => { // 实时时钟图标
    const d = new Date();
    const h = (d.getHours() % 12) + d.getMinutes() / 60;
    const m = d.getMinutes() + d.getSeconds() / 60;
    const s = d.getSeconds();
    const ha = (h / 12) * 360 - 90, ma = (m / 60) * 360 - 90, sa = (s / 60) * 360 - 90;
    const hand = (ang, len, w, col, tail = 0) => {
      const r = ang * Math.PI / 180;
      return `<line x1="${(30 - Math.cos(r) * tail).toFixed(1)}" y1="${(30 - Math.sin(r) * tail).toFixed(1)}" x2="${(30 + Math.cos(r) * len).toFixed(1)}" y2="${(30 + Math.sin(r) * len).toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
    };
    return icon(null, `
      <circle cx="30" cy="30" r="26" fill="#fff"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => {
        const a = (i / 12) * 360 * Math.PI / 180;
        return `<line x1="${(30 + Math.sin(a) * 22.5).toFixed(1)}" y1="${(30 - Math.cos(a) * 22.5).toFixed(1)}" x2="${(30 + Math.sin(a) * 24.5).toFixed(1)}" y2="${(30 - Math.cos(a) * 24.5).toFixed(1)}" stroke="#2A2A2E" stroke-width="${i % 3 === 0 ? 2.4 : 1.2}" stroke-linecap="round"/>`;
      }).join('')}
      ${hand(ha, 12, 3.2, '#111', 4)}
      ${hand(ma, 18.5, 2.4, '#111', 5)}
      ${hand(sa, 21, 1.2, '#FF9500', 6)}
      <circle cx="30" cy="30" r="2" fill="#111"/>`);
  },

  notes: () => icon([['#FFFFFF', 0], ['#F5F5F7', 1]], `
    <rect x="0" y="0" width="60" height="17" fill="#F7D774"/>
    <g stroke="#D9B93E" stroke-width="1.8" stroke-linecap="round">
      <line x1="14" y1="27" x2="46" y2="27"/><line x1="14" y1="34" x2="46" y2="34"/><line x1="14" y1="41" x2="38" y2="41"/>
    </g>`),

  calendar: () => { // 实时日历图标
    const d = new Date();
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    return icon(null, `
      <text x="30" y="14.5" text-anchor="middle" font-size="8" font-weight="700" fill="#FF3B30" font-family="-apple-system,sans-serif">${wd}</text>
      <text x="30" y="47" text-anchor="middle" font-size="31" font-weight="300" fill="#1D1D1F" font-family="-apple-system,sans-serif">${d.getDate()}</text>
      <line x1="0" y1="19" x2="60" y2="19" stroke="#E5E5EA" stroke-width="1"/>`);
  },

  browser: () => icon([['#2AC4FA', 0], ['#0F6FFF', 1]], `
    <circle cx="30" cy="30" r="17" fill="none" stroke="#fff" stroke-width="1.6" opacity=".9"/>
    <g stroke="#fff" stroke-width="1.2" opacity=".75">
      <line x1="30" y1="13" x2="30" y2="47"/><line x1="13" y1="30" x2="47" y2="30"/>
      <line x1="18" y1="18" x2="42" y2="42"/><line x1="42" y1="18" x2="18" y2="42"/>
    </g>
    <path d="M36.5 23.5L28 28l-4.5 8.5 8.5-4.5z" fill="#FF4D56"/>
    <path d="M23.5 36.5L32 32l4.5-8.5z" fill="#fff" opacity=".2"/>`),

  moments: () => icon([['#FFD76E', 0], ['#FFA93B', 1]], `
    <circle cx="30" cy="30" r="16.5" fill="none" stroke="#fff" stroke-width="2.2" opacity=".95"/>
    <path d="M30 19.5v21M19.5 30h21" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".95"/>
    <circle cx="30" cy="30" r="3.6" fill="#fff"/>`),

  compass: () => icon([['#3A3A3F', 0], ['#1A1A1E', 1]], `
    <circle cx="30" cy="30" r="22" fill="#2C2C31"/>
    <circle cx="30" cy="30" r="22" fill="none" stroke="#4A4A52" stroke-width="1.5"/>
    <g stroke="#7A7A84" stroke-width="1.6" stroke-linecap="round">
      ${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => {
        const r = a * Math.PI / 180;
        const len = a % 90 === 0 ? 5.5 : 3;
        return `<line x1="${(30 + Math.sin(r) * 16).toFixed(1)}" y1="${(30 - Math.cos(r) * 16).toFixed(1)}" x2="${(30 + Math.sin(r) * (16 + len)).toFixed(1)}" y2="${(30 - Math.cos(r) * (16 + len)).toFixed(1)}"/>`;
      }).join('')}
    </g>
    <path d="M30 16l3.2 12.6L30 44l-3.2-15.4z" fill="#FF453A" transform="rotate(28 30 30)"/>
    <path d="M30 16l3.2 12.6L30 44z" fill="#F2F2F7" transform="rotate(208 30 30)"/>
    <circle cx="30" cy="30" r="2.4" fill="#1A1A1E" stroke="#7A7A84"/>`),

  themes: () => icon([['#8E44E5', 0], ['#3E7BFA', 1]], `
    <circle cx="30" cy="30" r="13" fill="none" stroke="#fff" stroke-width="2.4"/>
    <path d="M33.5 21a11.5 11.5 0 1 0 5.5 13.5A9 9 0 0 1 33.5 21z" fill="#fff"/>`),

  settings: () => icon([['#8E99AB', 0], ['#5D687A', 1]], `
    <g fill="#fff">
      ${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => {
        const r = a * Math.PI / 180;
        const x1 = 30 + Math.sin(r) * 13.5, y1 = 30 - Math.cos(r) * 13.5;
        const x2 = 30 + Math.sin(r) * 21.5, y2 = 30 - Math.cos(r) * 21.5;
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#fff" stroke-width="4.6" stroke-linecap="round"/>`;
      }).join('')}
    </g>
    <circle cx="30" cy="30" r="10" fill="#fff"/>
    <circle cx="30" cy="30" r="6.8" fill="#6B7688"/>`),
};

/* 微信等App的Tab图标 */
export const TIcons = {
  chatOn: ui('<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1L3 20l1-5.2A8.5 8.5 0 1 1 21 11.5z" fill="currentColor" stroke="none"/>'),
  chat: ui('<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1L3 20l1-5.2A8.5 8.5 0 1 1 21 11.5z"/>'),
  users: ui(P.users),
  usersF: uiF('<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5v-.5A4.7 4.7 0 0 1 7.2 15h3.6a4.7 4.7 0 0 1 4.7 4.7v.8z"/><path d="M16 4.6a3.6 3.6 0 0 1 0 6.8M17.3 14.6a4.4 4.4 0 0 1 3.7 4.4v.9"/>'),
  discover: ui('<circle cx="12" cy="12" r="9"/><path d="M16 8l-2.2 5.8L8 16l2.2-5.8z"/>'),
  discoverF: uiF('<path fill-rule="evenodd" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 4l-2.4 6.1L7 15.5l2.4-6.1zM10 10.4l-1.2 3.1 3.1-1.2 1.2-3.1z" clip-rule="evenodd"/>'),
  me: ui(P.user),
  meF: uiF('<circle cx="12" cy="7.5" r="4"/><path d="M20 21.5v-1a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 20.5v1z"/>'),
  globe: ui(P.globe),
  alarm: ui(P.alarmI),
  stopwatch: ui(P.stopWatch),
  timerI: ui(P.timer),
  noteTab: ui('<path d="M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 6 2.5z"/><path d="M8 7h8M8 11h8M8 15h5"/>'),
  song: ui(P.musicNote),
  album: ui('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'),
  artist: ui(P.user),
  importI: ui(P.download),
};
