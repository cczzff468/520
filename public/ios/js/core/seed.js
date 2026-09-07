/* ============ 首次启动种子数据 ============ */

import { DB, Settings } from './db.js';
import { uid } from './utils.js';

/* 生成示例照片（canvas 渐变画布） */
function makeSamplePhoto(colors, label, w = 900, h = 1200) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h);
  colors.forEach((col, i) => g.addColorStop(i / (colors.length - 1), col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 柔和光斑
  for (let i = 0; i < 4; i++) {
    const rg = ctx.createRadialGradient(
      Math.random() * w, Math.random() * h, 10,
      Math.random() * w, Math.random() * h, 160 + Math.random() * 200);
    rg.addColorStop(0, 'rgba(255,255,255,.25)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = '600 44px -apple-system, sans-serif';
  ctx.fillText(label, 60, h - 80);
  const data = c.toDataURL('image/jpeg', 0.8);
  // 缩略图
  const tc = document.createElement('canvas');
  tc.width = 300; tc.height = 400;
  tc.getContext('2d').drawImage(c, 0, 0, 300, 400);
  return { data, thumb: tc.toDataURL('image/jpeg', 0.7) };
}

/* 生成一段示例音乐（WAV：琶音） */
function makeSampleSong() {
  const sr = 44100, dur = 16, len = sr * dur;
  const ab = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = ab.getChannelData(0);
  const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 523.25, 392.0, 329.63];
  const noteDur = 0.5;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const nIdx = Math.floor(t / noteDur) % notes.length;
    const phase = (t % noteDur) / noteDur;
    const freq = notes[nIdx];
    const env = Math.exp(-3 * phase) * (phase < 0.02 ? phase / 0.02 : 1);
    let s = Math.sin(2 * Math.PI * freq * t) * 0.5 + Math.sin(4 * Math.PI * freq * t) * 0.12;
    ch[i] = s * env * 0.28;
  }
  // WAV 编码
  const bytes = 44 + len * 2;
  const buf = new ArrayBuffer(bytes);
  const view = new DataView(buf);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); view.setUint32(4, bytes - 8, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wstr(36, 'data'); view.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function songCover() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FC5C7D"/><stop offset="1" stop-color="#6A5CFF"/></linearGradient></defs>
    <rect width="400" height="400" fill="url(#g)"/>
    <g fill="rgba(255,255,255,.9)"><circle cx="200" cy="200" r="105" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="2"/>
    <path d="M235 130v110a28 28 0 1 1-14-24V150z"/></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const momentCover = (c1, c2) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="500" height="500" fill="url(#g)"/>
    <circle cx="380" cy="110" r="70" fill="rgba(255,255,255,.18)"/>
    <circle cx="120" cy="390" r="90" fill="rgba(255,255,255,.12)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export async function seedIfNeeded() {
  const seeded = await Settings.load('seeded', false);
  if (seeded) return;
  const now = Date.now();

  /* ---- AI 联系人 ---- */
  const contacts = [
    { id: 'c_ai', name: 'AI 助手', pinyin: 'A', color: '#0A84FF', emoji: '🤖', isAI: true, signature: '有事随时问我', prompt: '你是「AI助手」，一个友好、专业的通用智能助手。回答简洁实用，用中文，适当使用emoji，语气自然亲切。', wxid: 'ai_helper' },
    { id: 'c_poet', name: '小诗', pinyin: 'X', color: '#E645A5', emoji: '🌸', isAI: true, signature: '人间值得，诗和远方', prompt: '你是「小诗」，一位浪漫的诗人朋友。说话温柔有画面感，偶尔引用或创作短诗，喜欢用比喻，回复末尾经常带一句两行小诗。', wxid: 'xiaoshi_poem' },
    { id: 'c_dev', name: '阿码', pinyin: 'A', color: '#34C759', emoji: '💻', isAI: true, signature: '代码改变世界', prompt: '你是「阿码」，一位资深程序员朋友。说话直接干脆带点幽默，擅长用简洁的语言解释技术问题，偶尔用代码块示例，口头禅是“这事儿简单”。', wxid: 'ama_dev' },
    { id: 'c_lao', name: '老王', pinyin: 'L', color: '#FF9500', emoji: '🧔', isAI: false, signature: '改天请你吃饭', canned: ['收到收到', '哈哈哈', '行，我知道了', '改天约饭啊兄弟', '在忙，回聊~', '这个可以！'], wxid: 'laowang_88' },
  ];
  await DB.bulkPut('contacts', contacts);

  /* ---- 会话 ---- */
  const convAI = {
    id: 'conv_ai', type: 'single', contactId: 'c_ai',
    name: 'AI 助手', lastMessage: '你好！我是你的 AI 助手，有什么可以帮你？', updatedAt: now, unread: 0, pinned: true,
  };
  await DB.put('conversations', convAI);
  await DB.put('messages', {
    id: uid('m'), conversationId: 'conv_ai', role: 'assistant',
    content: '你好！我是你的 AI 助手 🤖\n\n我可以陪你聊天、答疑解惑、写文案、想点子。在「设置 → API配置」里还可以接入你自己的大模型。', timestamp: now - 60 * 1000, status: 'read',
  });

  const convGroup = {
    id: 'conv_group', type: 'group', name: 'AI 茶话会',
    members: ['me', 'c_ai', 'c_poet', 'c_dev'],
    announcement: '每周话题：聊聊最近的AI新鲜事 🎉',
    lastMessage: '小诗：晚风把星星揉碎了，撒进人间的梦里', updatedAt: now - 3600 * 1000, unread: 2, pinned: false,
  };
  await DB.put('conversations', convGroup);
  await DB.bulkPut('messages', [
    { id: uid('m'), conversationId: 'conv_group', role: 'assistant', senderId: 'c_poet', senderName: '小诗', content: '晚风把星星揉碎了，撒进人间的梦里 ✨', timestamp: now - 7200 * 1000, status: 'read' },
    { id: uid('m'), conversationId: 'conv_group', role: 'assistant', senderId: 'c_dev', content: '你这段像Rust写的，看着优雅，不知道编译要多久 😂', timestamp: now - 3600 * 1000, status: 'read' },
  ]);

  /* ---- 示例照片 ---- */
  const samples = [
    makeSamplePhoto(['#355C7D', '#C06C84', '#F67280', '#F8B195'], '日落 · 示例照片'),
    makeSamplePhoto(['#0B486B', '#3B8686', '#79BD9A'], '青屿 · 示例照片'),
    makeSamplePhoto(['#5D4157', '#A8C0FF', '#3F2B96'], '夜航 · 示例照片'),
    makeSamplePhoto(['#FF9A8B', '#FF6A88', '#FF99AC'], '蜜桃 · 示例照片'),
  ];
  const photoRows = samples.map((s, i) => ({
    id: 'seed_photo_' + i, name: '示例照片' + (i + 1) + '.jpg',
    data: s.data, thumb: s.thumb,
    w: 900, h: 1200, size: Math.round(s.data.length * 0.75),
    uploadDate: now - (i + 1) * 86400000 * 3, from: 'seed',
  }));
  await DB.bulkPut('photos', photoRows);

  /* ---- 示例音乐 ---- */
  try {
    const blob = makeSampleSong();
    const ab = await blob.arrayBuffer();
    await DB.put('music', {
      id: 'seed_song_1', title: '八音盒 · 开机旋律', artist: 'AppleAI Web', album: '系统示例',
      cover: songCover(), data: ab, duration: 16, addedAt: now, mime: 'audio/wav',
    });
  } catch (e) { console.warn('示例音乐生成失败', e); }

  /* ---- 朋友圈 ---- */
  await DB.bulkPut('moments', [
    {
      id: uid('mo'), authorId: 'c_poet', authorName: '小诗', authorColor: '#E645A5', authorEmoji: '🌸',
      text: '今天的晚霞很温柔，像一封没有署名的信 🌇',
      images: [momentCover('#FF9A8B', '#FF6A88'), momentCover('#F67280', '#C06C84')],
      createdAt: now - 3600000 * 5, likes: [], comments: [{ name: '阿码', text: '文采依旧在线 👍' }],
    },
    {
      id: uid('mo'), authorId: 'c_dev', authorName: '阿码', authorColor: '#34C759', authorEmoji: '💻',
      text: '终于把这个 bug 修好了。不是我搞定的，是我删了那个功能 😅',
      images: [],
      createdAt: now - 3600000 * 26, likes: ['me', 'c_poet'], comments: [],
    },
    {
      id: uid('mo'), authorId: 'c_ai', authorName: 'AI 助手', authorColor: '#0A84FF', authorEmoji: '🤖',
      text: '欢迎来到 AppleAI Web！这里的一切数据都只存在你的浏览器里 🔒\n试试给「小诗」或「阿码」发条消息吧～',
      images: [momentCover('#3E7BFA', '#1B62D9')],
      createdAt: now - 3600000 * 50, likes: ['me'], comments: [{ name: '小诗', text: '欢迎回家 ✨' }],
    },
  ]);

  /* ---- 欢迎备忘录 ---- */
  await DB.put('notes', {
    id: 'seed_note_1', title: '欢迎使用备忘录',
    content: `<div><b>欢迎使用 AppleAI Web 👋</b></div><div><br></div><div>这里的一切都存在你自己的浏览器 IndexedDB 里，不上传云端，关掉再打开数据都在。</div><div><br></div><div>✍️ 支持富文本：<b>加粗</b>、<i>斜体</i>、<u>下划线</u>、列表</div><div>☑️ 支持待办事项，点左边圆圈打勾</div><div><br></div><div>去「设置 → API配置」接入你自己的大模型，AI 聊天能力立刻升级 🚀</div>`,
    updatedAt: now, category: '个人', pinned: true,
  });

  /* ---- 示例日历事件 ---- */
  const d = new Date();
  await DB.put('events', {
    id: 'seed_event_1', title: '🎉 AppleAI Web 体验日',
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0).getTime(),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 11, 30).getTime(),
    location: '浏览器里', note: '逛逛这16个应用，给AI助手发条消息', color: '#0A84FF', repeat: 'none', remind: false,
  });

  await Settings.setQuiet('seeded', true);
  await Settings.setQuiet('nickname', '我');
  await Settings.setQuiet('avatar', { emoji: '😀', color: '#8E8E93' });
}
