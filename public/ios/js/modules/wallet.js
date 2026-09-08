/* ============ 钱包（支付系统）· 0525 全功能移植版 ============
    数据：Settings 'wallet'（余额/零钱通/亲属卡/银行卡/支付密码） + 'bills'（账单）
    UI：作为库模块供「信息」APP 调用（nav 页面构建器 + 支付组件）
    特色：红包/转账/亲属卡全链路、付款码/收款码（分钟级刷新）、扫一扫付款、
          零钱通每日收益结算、6位支付密码键盘、支付成功页 ============ */

import { el, uid, Bus, haptic, fmtSmartTime } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { toast, dialog, confirmDialog, sheet, escapeHtml, promptDialog } from '../core/ui.js';

/* ============ 数据层 ============ */

const FUND_RATE = 0.01986; // 零钱通七日年化

const DEFAULT_WALLET = {
  balance: 666.66,
  changeFund: 1288.0,
  fundYield: 36.42,
  lastYieldDate: '',
  relativeCards: [],
  bankCards: [
    { id: 'card-seed-cmb', bankName: '招商银行', cardTail: '1234', holder: '', phone: '', cardType: '储蓄卡', available: 52000, createdAt: Date.now() - 86400000 * 90 },
    { id: 'card-seed-icbc', bankName: '工商银行', cardTail: '5678', holder: '', phone: '', cardType: '储蓄卡', available: 18600, createdAt: Date.now() - 86400000 * 40 },
  ],
  payPassword: undefined, // 6 位支付密码（未设置则支付免密）
};

/* 支持的账单类型：充值/提现/红包/转账/亲属卡/零钱通/收益/收付款 */
export const Wallet = {
  async load() {
    const raw = await Settings.load('wallet', {}) || {};
    /* 无存量记录时回退到默认种子卡（有记录则以存库为准，可为空数组） */
    const bankCards = (Array.isArray(raw.bankCards) ? raw.bankCards : DEFAULT_WALLET.bankCards).map(c => ({ ...c, available: typeof c.available === 'number' ? c.available : 0 }));
    return { ...DEFAULT_WALLET, ...raw, bankCards };
  },
  async save(w) { await Settings.set('wallet', w); Bus.emit('wallet:changed', w); return w; },
  async update(fn) { const w = await this.load(); const next = fn(w) || w; return this.save(next); },
  hasPwd(w) { return !!(w && w.payPassword); },

  /* 零钱通每日收益（进入钱包/零钱通页时结算） */
  async settleYield() {
    const w = await this.load();
    const today = new Date().toDateString();
    if (w.lastYieldDate === today || w.changeFund < 1) return false;
    const amt = round2((w.changeFund * FUND_RATE) / 365);
    await this.save({ ...w, changeFund: round2(w.changeFund + amt), fundYield: round2(w.fundYield + amt), lastYieldDate: today });
    if (amt >= 0.01) {
      await Bill.add({ kind: '收益', title: '零钱通收益', amount: amt, status: '已到账', note: '七日年化收益率 1.9860%' });
      return true;
    }
    return false;
  },
};

export const Bill = {
  async all() { return (await Settings.load('bills', []) || []).slice().sort((a, b) => b.time - a.time); },
  async add({ kind, title, amount, status = '已完成', friendName = '', note = '' }) {
    const list = await this.all();
    list.unshift({ id: uid('bill'), kind, title, amount, time: Date.now(), status, friendName, note });
    await Settings.set('bills', list);
    Bus.emit('wallet:changed');
    return list[0];
  },
  async remove(id) { await Settings.set('bills', (await this.all()).filter(b => b.id !== id)); },
};

/* ============ 支付工具 ============ */

export function round2(n) { return Math.round(n * 100) / 100; }
export function formatMoney(n) { return (Math.round(n * 100) / 100).toFixed(2); }

/* 支付来源：balance=零钱，其余为银行卡 id */
export function paySources(w) {
  const rows = [{ key: 'balance', label: '零钱余额', desc: `可用余额 ¥${formatMoney(w.balance)}`, amount: w.balance }];
  for (const c of w.bankCards) rows.push({ key: c.id, label: c.bankName, desc: `尾号 ${c.cardTail} · 可用 ¥${formatMoney(c.available)}`, amount: c.available });
  return rows;
}
export function payLabel(w, key) {
  if (key === 'balance' || !key) return '零钱';
  const c = w.bankCards.find(x => x.id === key);
  return c ? `${c.bankName}（尾号 ${c.cardTail}）` : '零钱';
}
export function checkAmount(w, key, amount) {
  const s = paySources(w).find(x => x.key === key);
  if (!s) return '请选择支付方式';
  if (!(amount > 0)) return '请输入正确的金额';
  if (amount > s.amount) return s.key === 'balance' ? '零钱余额不足' : '银行卡可用余额不足';
  return null;
}
export function deduct(w, key, amount) {
  const m = round2(amount);
  if (key === 'balance') return { ...w, balance: round2(w.balance - m) };
  return { ...w, bankCards: w.bankCards.map(c => (c.id === key ? { ...c, available: round2(c.available - m) } : c)) };
}
export function income(w, amount) { return { ...w, balance: round2(w.balance + round2(amount)) }; }

/* ============ 装饰二维码 / 条形码（种子随机 · 纯视觉） ============ */

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function finderPattern(matrix, row, col) {
  for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
    const rr = row + r, cc = col + c;
    if (rr < 0 || cc < 0 || rr >= matrix.length || cc >= matrix.length) continue;
    matrix[rr][cc] = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
  }
}
export function qrDataUrl(seed, size = 560) {
  const n = 29, quiet = 4;
  const scale = Math.floor(size / (n + quiet * 2));
  const real = scale * (n + quiet * 2);
  const matrix = Array.from({ length: n }, () => Array(n).fill(false));
  const rand = mulberry32(hashSeed(seed));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const inFinder = (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);
    if (inFinder) continue;
    if (r === 6 || c === 6) { matrix[r][c] = (r + c) % 2 === 0; continue; }
    matrix[r][c] = rand() < 0.46;
  }
  finderPattern(matrix, 0, 0); finderPattern(matrix, 0, n - 7); finderPattern(matrix, n - 7, 0);
  const cv = document.createElement('canvas');
  cv.width = cv.height = real;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, real, real);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (matrix[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  }
  return cv.toDataURL('image/png');
}
export function barcodeDataUrl(seed, width = 560, height = 130) {
  const rand = mulberry32(hashSeed(seed));
  const cv = document.createElement('canvas');
  cv.width = width; cv.height = height;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  let x = 14;
  while (x < width - 14) {
    const w = 1 + Math.floor(rand() * 4);
    if (rand() < 0.62) ctx.fillRect(x, 8, w, height - 16);
    x += w + 1 + Math.floor(rand() * 3);
  }
  return cv.toDataURL('image/png');
}

/* ============ 支付组件（方式选择 + 密码键盘） ============ */

const CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#07C160" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';

/* 支付方式行（表单内嵌，点击弹选择器） */
function payMethodRow(w, key, onOpen) {
  const row = el('div', 'row');
  row.innerHTML = `
    <div class="row-icon" style="background:linear-gradient(135deg,#ffd53d,#ffb800)"><span class="wi-glyph">¥</span></div>
    <div class="row-label">支付方式<div class="row-sub">${escapeHtml(payLabel(w, key))}</div></div>
    <div class="row-chevron"><svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg></div>`;
  row.onclick = onOpen;
  return row;
}

/* 支付方式选择 Sheet */
function openPayPicker(w, key, onPick) {
  const sh = sheet({
    title: '选择支付方式',
    build(body, close) {
      body.innerHTML = `<div class="inset-group"><div class="inset-card"></div></div>`;
      const card = body.querySelector('.inset-card');
      paySources(w).forEach(s => {
        const r = el('div', 'row');
        r.innerHTML = `
          <div class="row-icon" style="background:${s.key === 'balance' ? 'linear-gradient(135deg,#ffd53d,#ffb800)' : 'linear-gradient(135deg,#6ba8ff,#1a7dff)'}"><span class="wi-glyph">${s.key === 'balance' ? '¥' : '卡'}</span></div>
          <div class="row-label">${escapeHtml(s.label)}<div class="row-sub">${escapeHtml(s.desc)}</div></div>
          <div class="row-end" style="color:#07C160">${s.key === key ? CHECK_SVG : ''}</div>`;
        r.onclick = () => { haptic(4); close(); onPick(s.key); };
        card.appendChild(r);
      });
      body.querySelector('.inset-group').insertAdjacentHTML('afterend', `<div style="font-size:12px;color:var(--text-3);text-align:center;padding:10px 0 4px">支付密码可在「钱包 → 支付密码」中设置</div>`);
    },
  });
  void sh;
}

/* 6 位支付密码键盘（全屏遮罩）→ Promise<pwd|null> */
export function askPayPwd({ title = '请输入支付密码', desc = '' } = {}) {
  return new Promise((resolve) => {
    const mask = el('div', 'paykbd-mask');
    mask.innerHTML = `
      <div class="paykbd-sheet">
        <div class="paykbd-title">${escapeHtml(title)}</div>
        ${desc ? `<div class="paykbd-desc">${escapeHtml(desc)}</div>` : ''}
        <div class="paykbd-dots">${'<i></i>'.repeat(6)}</div>
        <div class="paykbd-err"></div>
        <div class="paykbd-grid">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
          <span class="blank"></span>
          <button data-k="0">0</button>
          <button class="paykbd-del" aria-label="删除"><svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 2.5h13.5a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H8.5L1.5 10z"/><path d="M12 7l6 6M18 7l-6 6"/></svg></button>
        </div>
      </div>`;
    document.getElementById('screen').appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));

    let pwd = '';
    const dots = [...mask.querySelectorAll('.paykbd-dots i')];
    const errEl = mask.querySelector('.paykbd-err');
    const paint = () => dots.forEach((d, i) => d.classList.toggle('fill', i < pwd.length));
    const done = (val) => {
      mask.classList.remove('show');
      setTimeout(() => mask.remove(), 240);
      resolve(val);
    };
    mask.querySelectorAll('.paykbd-grid button[data-k]').forEach(b => {
      b.onclick = () => {
        if (pwd.length >= 6) return;
        haptic(4);
        pwd += b.dataset.k;
        paint();
        if (pwd.length === 6) setTimeout(() => done(pwd), 140);
      };
    });
    mask.querySelector('.paykbd-del').onclick = () => { pwd = pwd.slice(0, -1); errEl.textContent = ''; paint(); };
    mask.addEventListener('click', (e) => { if (e.target === mask) done(null); });
  });
}

/* 校验支付密码：已设置 → 弹键盘验证；未设置 → 直接放行（返回 true 并执行 fn） */
async function verifyPwd(desc, fn) {
  const w = await Wallet.load();
  if (!Wallet.hasPwd(w)) return fn(null);
  const pwd = await askPayPwd({ desc });
  if (pwd === null) return null; // 取消
  if (pwd !== w.payPassword) { toast('支付密码不正确', 2000); return null; }
  return fn(pwd);
}

/* ============ 通用小件 ============ */

function moneyInput({ placeholder = '0.00', max = 200000 } = {}) {
  const wrap = el('div', 'wallet-amount-input');
  wrap.innerHTML = `<span>¥</span><input type="number" inputMode="decimal" placeholder="${placeholder}" min="0" max="${max}" step="0.01">`;
  return wrap;
}
function readAmount(input) {
  const n = Math.round(Number(String(input.value).replace(/[^\d.]/g, '')) * 100) / 100;
  return n > 0 ? n : 0;
}

/* 支付成功页 */
export function openPaySuccess(nav, { title = '支付成功', amount, payLabel: pl = '零钱', sub = '' }) {
  const page = nav.makePage({
    title: '', chevBack: false, noNavbar: true,
    build(body) {
      body.classList.add('payok-body');
      body.innerHTML = `
        <div class="payok-check"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg></div>
        <div class="payok-title">${escapeHtml(title)}</div>
        <div class="payok-amount">¥<b>${formatMoney(amount || 0)}</b></div>
        <div class="payok-sub">${escapeHtml(pl)}${sub ? ` · ${escapeHtml(sub)}` : ''}</div>
        <button class="wallet-btn primary payok-back">完成</button>`;
      body.querySelector('.payok-back').onclick = () => { nav.pop(); if (nav.stack.length > 1) nav.pop(); };
    },
  });
  page.el.classList.add('wallet-ok-page');
  nav.push(page);
  Bus.emit('wallet:changed');
}

/* ============ 页面：钱包主页 ============ */

export function openWalletHome(nav, { onNeedContacts } = {}) {
  const page = nav.makePage({
    title: '钱包', chevBack: true,
    build(body) { renderWalletHome(body, nav); },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

async function renderWalletHome(body, nav) {
  await Wallet.settleYield();
  const w = await Wallet.load();
  const bills = await Bill.all();
  const given = w.relativeCards.filter(c => c.direction === 'given');
  const monthTotal = bills.filter(b => Date.now() - b.time < 86400000 * 30).reduce((s, b) => s + Math.abs(b.amount), 0);

  body.innerHTML = `
    <div class="wl-hero">
      <div class="wl-hero-top">
        <button class="wl-hero-act" id="wl-receive">${iconReceive()}<span>收付款</span></button>
        <div class="wl-hero-bal">
          <div class="wl-bal-num"><span>¥</span>${formatMoney(w.balance + w.changeFund)}</div>
          <div class="wl-bal-sub">总资产 · 零钱 ¥${formatMoney(w.balance)} + 零钱通 ¥${formatMoney(w.changeFund)}</div>
        </div>
        <button class="wl-hero-act" id="wl-scan">${iconScan()}<span>扫一扫</span></button>
      </div>
      <div class="wl-hero-month">近30日收支 ¥${formatMoney(round2(monthTotal))} · 银行卡 ${w.bankCards.length} 张${Wallet.hasPwd(w) ? ' · 支付密码已开启' : ''}</div>
    </div>
    <div class="inset-group"><div class="inset-card" id="wl-services"></div></div>
    <div class="inset-group"><div class="inset-card" id="wl-pwd-row"></div></div>`;

  const services = [
    { key: 'change', name: '零钱', desc: `¥${formatMoney(w.balance)}`, bg: 'linear-gradient(135deg,#ffd53d,#ffb800)', glyph: '¥' },
    { key: 'fund', name: '零钱通', desc: `¥${formatMoney(w.changeFund)} · 累计收益 ¥${formatMoney(w.fundYield)}`, bg: 'linear-gradient(135deg,#ffc93d,#ff9d00)', glyph: '◆' },
    { key: 'relatives', name: '亲属卡', desc: given.length ? `已赠出 ${given.length} 张` : '亲情消费我买单', bg: 'linear-gradient(135deg,#4cd97b,#07c160)', svg: iconCard() },
    { key: 'bankcards', name: '银行卡', desc: `${w.bankCards.length} 张卡`, bg: 'linear-gradient(135deg,#6ba8ff,#1a7dff)', svg: iconBank() },
    { key: 'bills', name: '账单', desc: '收支明细', bg: 'linear-gradient(135deg,#8aa2c4,#576b95)', svg: iconBill() },
    { key: 'redpacket', name: '红包记录', desc: '收发红包', bg: 'linear-gradient(135deg,#ff8a6b,#fa5151)', glyph: '红' },
  ];
  const svcEl = body.querySelector('#wl-services');
  services.forEach(s => {
    const r = el('div', 'row');
    r.innerHTML = `
      <div class="row-icon" style="background:${s.bg}">${s.svg || `<span class="wi-glyph">${s.glyph}</span>`}</div>
      <div class="row-label">${s.name}<div class="row-sub">${escapeHtml(s.desc)}</div></div>
      <div class="row-chevron"><svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg></div>`;
    r.onclick = () => { haptic(4); openPageByKey(nav, s.key); };
    svcEl.appendChild(r);
  });

  const pwdRow = body.querySelector('#wl-pwd-row');
  pwdRow.innerHTML = `
    <div class="row" id="wl-pwd"><div class="row-icon" style="background:linear-gradient(135deg,#c0c6cf,#8e959e)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/></svg></div>
      <div class="row-label">支付密码</div>
      <div class="row-val">${Wallet.hasPwd(w) ? '已设置' : '未设置'}</div>
      <div class="row-chevron"><svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg></div></div>`;
  pwdRow.querySelector('#wl-pwd').onclick = () => openPayPwdSet(nav);
}

async function openPageByKey(nav, key) {
  if (key === 'change') openChange(nav);
  else if (key === 'fund') openFund(nav);
  else if (key === 'relatives') openRelatives(nav);
  else if (key === 'bankcards') openBankCards(nav);
  else if (key === 'bills') openBills(nav);
  else if (key === 'redpacket') openRedPacketRecords(nav);
}

/* ============ 页面：零钱 ============ */

export function openChange(nav) {
  const page = nav.makePage({
    title: '零钱', chevBack: true,
    async build(body) {
      const w = await Wallet.load();
      body.innerHTML = `
        <div class="wl-balance-card">
          <div class="wl-b-label">零钱余额（元）</div>
          <div class="wl-b-num">¥${formatMoney(w.balance)}</div>
        </div>
        <div class="inset-group"><div class="inset-card">
          <div class="row" id="cg-in"><div class="row-icon" style="background:linear-gradient(135deg,#6ba8ff,#1a7dff)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M12 19V6M6.5 11.5L12 6l5.5 5.5"/></svg></div>
            <div class="row-label">充值<div class="row-sub">从银行卡转入零钱</div></div><div class="row-chevron">${chev()}</div></div>
          <div class="row" id="cg-out"><div class="row-icon" style="background:linear-gradient(135deg,#ffd53d,#ffb800)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M12 5v13M6.5 12.5L12 18l5.5-5.5"/></svg></div>
            <div class="row-label">提现<div class="row-sub">零钱转出到银行卡</div></div><div class="row-chevron">${chev()}</div></div>
          <div class="row" id="cg-fund"><div class="row-icon" style="background:linear-gradient(135deg,#ffc93d,#ff9d00)"><span class="wi-glyph">◆</span></div>
            <div class="row-label">转入零钱通<div class="row-sub">赚收益，随用随取</div></div><div class="row-chevron">${chev()}</div></div>
        </div></div>
        <div class="wl-tip">零钱可用于红包、转账与消费。提现 2 小时内到账（演示模拟）。</div>`;
      body.querySelector('#cg-in').onclick = () => changeIO(nav, 'in');
      body.querySelector('#cg-out').onclick = () => changeIO(nav, 'out');
      body.querySelector('#cg-fund').onclick = () => fundTransfer(nav, 'in');
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* 充值/提现 */
function changeIO(nav, dir) {
  const page = nav.makePage({
    title: dir === 'in' ? '充值' : '提现', chevBack: true,
    async build(body) {
      const w = await Wallet.load();
      let payId = w.bankCards[0]?.id || 'balance';
      body.innerHTML = `
        <div class="wl-form">
          <div class="tf-amount-label">${dir === 'in' ? '充值金额' : '提现金额'}</div>
          ${moneyInput({ placeholder: '0.00' }).outerHTML}
          ${dir === 'out' ? `<div class="wl-avail">可提现 ¥${formatMoney(w.balance)}</div>` : `<div class="wl-avail">银行卡转入，实时到账</div>`}
          <div class="inset-group"><div class="inset-card">
            <div class="row" id="io-card"><div class="row-icon" style="background:linear-gradient(135deg,#6ba8ff,#1a7dff)"><span class="wi-glyph">卡</span></div>
              <div class="row-label">银行卡<div class="row-sub" id="io-card-sub"></div></div><div class="row-chevron">${chev()}</div></div>
          </div></div>
          <button class="wallet-btn primary" id="io-go">${dir === 'in' ? '充值' : '提现'}</button>
          <div class="wl-err"></div>
        </div>`;
      const input = body.querySelector('input');
      const cardSub = body.querySelector('#io-card-sub');
      const paintCard = () => {
        const c = w.bankCards.find(x => x.id === payId);
        cardSub.textContent = c ? `${c.bankName} 尾号 ${c.cardTail} · 可用 ¥${formatMoney(c.available)}` : '请添加银行卡';
      };
      paintCard();
      const go = async (pwd) => {
        const amount = readAmount(input);
        const w2 = await Wallet.load();
        if (dir === 'in') {
          const c = w2.bankCards.find(x => x.id === payId);
          if (!c) { err('请先添加银行卡'); return null; }
          const e = checkAmount(w2, payId, amount);
          if (e) { err(e); return null; }
          await Wallet.save(deduct(w2, payId, amount));
          await Wallet.save(income(await Wallet.load(), amount));
          await Bill.add({ kind: '充值', title: `零钱充值`, amount, status: '已到账', note: payLabel(w2, payId) });
          return true;
        }
        const e = checkAmount(w2, 'balance', amount);
        if (e) { err(e); return null; }
        let next = deduct(w2, 'balance', amount);
        next = { ...next, bankCards: next.bankCards.map(c => (c.id === payId ? { ...c, available: round2(c.available + amount) } : c)) };
        await Wallet.save(next);
        await Bill.add({ kind: '提现', title: `零钱提现`, amount: -amount, status: '已到账', note: payLabel(w2, payId) });
        return true;
      };
      const errEl = body.querySelector('.wl-err');
      const err = (msg) => { errEl.textContent = msg; };
      body.querySelector('#io-card').onclick = () => {
        openPayPicker(w, payId, k => { if (k !== 'balance') { payId = k; paintCard(); } });
      };
      body.querySelector('#io-go').onclick = async () => {
        errEl.textContent = '';
        const amount = readAmount(input);
        if (!amount) { err(dir === 'in' ? '请输入充值金额' : '请输入提现金额'); return; }
        const ok = await verifyPwd(`充值 ¥${formatMoney(amount)}`, go);
        if (ok) { haptic(8); openPaySuccess(nav, { title: dir === 'in' ? '充值成功' : '提现申请已提交', amount, payLabel: dir === 'in' ? payLabel(w, payId) : '零钱' }); }
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：零钱通 ============ */

export function openFund(nav) {
  const page = nav.makePage({
    title: '零钱通', chevBack: true,
    async build(body) {
      await Wallet.settleYield();
      const w = await Wallet.load();
      const todayYield = round2((w.changeFund * FUND_RATE) / 365);
      body.innerHTML = `
        <div class="fund-hero">
          <div class="fund-label">零钱通总额（元）</div>
          <div class="fund-num">¥${formatMoney(w.changeFund)}</div>
          <div class="fund-sub">累计收益 ¥${formatMoney(w.fundYield)} · 七日年化 1.9860%</div>
          <div class="fund-actions">
            <button class="wallet-btn ghost" id="fund-in">转入</button>
            <button class="wallet-btn ghost" id="fund-out">转出</button>
          </div>
          <div class="fund-yield-row">今日预计收益 ¥${formatMoney(todayYield)}</div>
        </div>
        <div class="wl-tip">零钱通资金可随时转出，收益每日自动结算并入本金。</div>`;
      body.querySelector('#fund-in').onclick = () => fundTransfer(nav, 'in');
      body.querySelector('#fund-out').onclick = () => fundTransfer(nav, 'out');
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* 零钱 ⇄ 零钱通 */
function fundTransfer(nav, dir) {
  const page = nav.makePage({
    title: dir === 'in' ? '转入零钱通' : '转出到零钱', chevBack: true,
    async build(body) {
      const w = await Wallet.load();
      const avail = dir === 'in' ? w.balance : w.changeFund;
      body.innerHTML = `
        <div class="wl-form">
          <div class="tf-amount-label">${dir === 'in' ? '转入金额' : '转出金额'}</div>
          ${moneyInput().outerHTML}
          <div class="wl-avail">${dir === 'in' ? `零钱可用 ¥${formatMoney(w.balance)}` : `零钱通可转出 ¥${formatMoney(w.changeFund)}`}</div>
          <button class="wallet-btn primary" id="fund-go">${dir === 'in' ? '确认转入' : '确认转出'}</button>
          <div class="wl-err"></div>
        </div>`;
      const input = body.querySelector('input');
      const errEl = body.querySelector('.wl-err');
      body.querySelector('#fund-go').onclick = async () => {
        errEl.textContent = '';
        const amount = readAmount(input);
        const w2 = await Wallet.load();
        if (!amount) { errEl.textContent = '请输入金额'; return; }
        if (amount > (dir === 'in' ? w2.balance : w2.changeFund)) { errEl.textContent = '余额不足'; return; }
        if (dir === 'in') await Wallet.save({ ...w2, balance: round2(w2.balance - amount), changeFund: round2(w2.changeFund + amount) });
        else await Wallet.save({ ...w2, balance: round2(w2.balance + amount), changeFund: round2(w2.changeFund - amount) });
        await Bill.add({ kind: '零钱通', title: dir === 'in' ? '转入零钱通' : '零钱通转出', amount: dir === 'in' ? -amount : amount, status: '已完成' });
        haptic(8);
        nav.pop();
        toast(dir === 'in' ? `已转入零钱通 ¥${formatMoney(amount)}` : `已转出到零钱 ¥${formatMoney(amount)}`);
        Bus.emit('wallet:changed');
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：付款码 / 收款码 ============ */

export function openPayCode(nav) {
  const page = nav.makePage({
    title: '付款码', chevBack: true, noNavbar: false,
    build(body) {
      body.classList.add('paycode-body');
      let minute = Math.floor(Date.now() / 60000);
      const render = async () => {
        const w = await Wallet.load();
        const name = Settings.get('nickname', '我');
        const seed = `pay-${name}-${minute}`;
        body.innerHTML = `
          <div class="paycode-card">
            <div class="paycode-me"><div class="avatar av-sil" style="width:30px;height:30px"></div><span>${escapeHtml(name)}</span></div>
            <img class="paycode-barcode" src="${barcodeDataUrl(seed)}" alt="付款条形码">
            <img class="paycode-qr" src="${qrDataUrl(seed)}" alt="付款二维码">
            <div class="paycode-amount">零钱 ¥${formatMoney(w.balance)}</div>
            <div class="paycode-refresh">每分钟自动更新</div>
          </div>
          <div class="paycode-note">向商家付款</div>
          <button class="wallet-btn ghost paycode-switch" id="pc-recv">切换为收款码</button>`;
        body.querySelector('#pc-recv').onclick = () => openReceiveCode(nav);
      };
      render();
      const timer = setInterval(() => { minute = Math.floor(Date.now() / 60000); if (body.isConnected) render(); }, 30000);
      page.onPop = () => clearInterval(timer);
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

export function openReceiveCode(nav) {
  const page = nav.makePage({
    title: '收款码', chevBack: true,
    build(body) {
      body.classList.add('paycode-body');
      const name = Settings.get('nickname', '我');
      let setAmt = 0;
      const render = () => {
        const seed = `recv-${name}-${setAmt}`;
        body.innerHTML = `
          <div class="paycode-card">
            <div class="paycode-me"><div class="avatar av-sil" style="width:30px;height:30px"></div><span>${escapeHtml(name)}</span></div>
            <img class="paycode-qr" src="${qrDataUrl(seed, 620)}" alt="收款二维码">
            ${setAmt > 0 ? `<div class="paycode-amount">¥${formatMoney(setAmt)}</div>` : `<div class="paycode-amount" style="color:var(--text-3)">扫码向我付款</div>`}
            <div class="paycode-refresh">二维码长期有效</div>
          </div>
          <div class="paycode-note">二维码收款</div>
          <button class="wallet-btn ghost paycode-switch" id="rv-set">${setAmt > 0 ? '清除金额' : '设置固定金额'}</button>`;
        body.querySelector('#rv-set').onclick = async () => {
          if (setAmt > 0) { setAmt = 0; render(); return; }
          const raw = await promptDialog('设置收款金额', '扫码后对方需支付指定金额', { placeholder: '0.00', inputType: 'decimal' });
          const num = Math.round(Number(raw) * 100) / 100;
          if (num > 0 && num <= 100000) { setAmt = num; render(); }
        };
      };
      render();
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：扫一扫（商家付款流） ============ */

export function openScanPay(nav) {
  const page = nav.makePage({
    title: '扫一扫', chevBack: true,
    build(body) {
      body.classList.add('scanpay-body');
      body.innerHTML = `
        <div class="scan-viewfinder">
          <i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>
          <div class="scan-laser"></div>
          <div class="scan-tip">将付款码放入框内，即可自动扫描</div>
        </div>
        <button class="wallet-btn primary" id="scan-go">模拟扫到商家码</button>`;
      body.querySelector('#scan-go').onclick = () => {
        haptic(8);
        const merchants = ['晨光便利店', '金鼎轩餐厅', '瑞幸咖啡', '永辉超市', '蜜雪冰城'];
        const m = merchants[Math.floor(Math.random() * merchants.length)];
        scanPayAmount(nav, m);
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

function scanPayAmount(nav, merchant) {
  const page = nav.makePage({
    title: '向商家付款', chevBack: true,
    async build(body) {
      const w = await Wallet.load();
      let payId = 'balance';
      body.innerHTML = `
        <div class="wl-form">
          <div class="scan-merchant">${escapeHtml(merchant)}</div>
          <div class="tf-amount-label">付款金额</div>
          ${moneyInput().outerHTML}
          <div class="inset-group"><div class="inset-card">
            <div class="row" id="sp-pay"></div>
          </div></div>
          <button class="wallet-btn primary" id="sp-go">付款</button>
          <div class="wl-err"></div>
        </div>`;
      const input = body.querySelector('input');
      const errEl = body.querySelector('.wl-err');
      const payRow = body.querySelector('#sp-pay');
      const paintPay = () => { payRow.innerHTML = ''; payRow.appendChild(payMethodRow(w, payId, () => openPayPicker(w, payId, k => { payId = k; paintPay(); }))); };
      paintPay();
      body.querySelector('#sp-go').onclick = async () => {
        errEl.textContent = '';
        const amount = readAmount(input);
        const doPay = async () => {
          const w2 = await Wallet.load();
          const e = checkAmount(w2, payId, amount);
          if (e) { errEl.textContent = e; return null; }
          await Wallet.save(deduct(w2, payId, amount));
          await Bill.add({ kind: '收付款', title: merchant, amount: -amount, status: '已支付', note: payLabel(w2, payId) });
          return true;
        };
        const ok = await verifyPwd(`向${merchant}付款 ¥${formatMoney(amount)}`, doPay);
        if (ok) { haptic(8); openPaySuccess(nav, { title: '支付成功', amount, payLabel: payLabel(w, payId), sub: merchant }); }
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：账单 ============ */

export function openBills(nav, filter = 'all') {
  const page = nav.makePage({
    title: '账单', chevBack: true,
    async build(body) {
      renderBills(body, filter, nav);
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

async function renderBills(body, filter, nav) {
  let bills = await Bill.all();
  if (filter === 'in') bills = bills.filter(b => b.amount > 0);
  if (filter === 'out') bills = bills.filter(b => b.amount < 0);
  const totalIn = bills.filter(b => b.amount > 0).reduce((s, b) => s + b.amount, 0);
  const totalOut = bills.filter(b => b.amount < 0).reduce((s, b) => s - b.amount, 0);
  body.innerHTML = `
    <div class="bills-tabs">
      ${[['all', '全部'], ['in', '收入'], ['out', '支出']].map(([k, label]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${label}</button>`).join('')}
    </div>
    <div class="bills-sum">收入 ¥${formatMoney(round2(totalIn))} · 支出 ¥${formatMoney(round2(totalOut))}</div>
    <div class="inset-group"><div class="inset-card bills-list">${bills.length ? '' : '<div class="bills-empty">暂无账单</div>'}</div></div>`;
  body.querySelectorAll('.bills-tabs button').forEach(b => {
    b.onclick = () => { haptic(3); renderBills(body, b.dataset.f, nav); };
  });
  const list = body.querySelector('.bills-list');
  const KIND_META = {
    '充值': ['#6ba8ff', '↑'], '提现': ['#ffb800', '↓'], '红包': ['#fa5151', '红'], '转账': ['#ffa231', '转'],
    '亲属卡': ['#07c160', '亲'], '零钱通': ['#ff9d00', '◆'], '收益': ['#34c759', '益'], '收付款': ['#576b95', '付'],
  };
  for (const b of bills) {
    const [color, glyph] = KIND_META[b.kind] || ['#8e959e', '·'];
    const r = el('div', 'row');
    r.innerHTML = `
      <div class="row-icon" style="background:${color}"><span class="wi-glyph">${glyph}</span></div>
      <div class="row-label">${escapeHtml(b.title)}<div class="row-sub">${escapeHtml(b.friendName ? b.friendName + ' · ' : '')}${fmtSmartTime(b.time)} · ${escapeHtml(b.status)}</div></div>
      <div class="bill-amount ${b.amount > 0 ? 'in' : ''}">${b.amount > 0 ? '+' : ''}${formatMoney(b.amount)}</div>`;
    r.onclick = () => openBillDetail(nav, b);
    list.appendChild(r);
  }
}

function openBillDetail(nav, b) {
  const page = nav.makePage({
    title: '账单详情', chevBack: true,
    build(body) {
      body.innerHTML = `
        <div class="billd-hero">
          <div class="billd-icon">${escapeHtml((b.title || '账单')[0])}</div>
          <div class="billd-amount ${b.amount > 0 ? 'in' : ''}">${b.amount > 0 ? '+' : ''}${formatMoney(b.amount)}</div>
          <div class="billd-status">${escapeHtml(b.status)}</div>
        </div>
        <div class="inset-group"><div class="inset-card">
          ${[['交易类型', b.kind], ['交易对象', b.friendName || '—'], ['交易时间', new Date(b.time).toLocaleString('zh-CN', { hour12: false })], ['备注', b.note || '—']].map(([k, v]) => `
            <div class="row static"><div class="row-label" style="color:var(--text-2)">${k}</div><div class="row-val">${escapeHtml(String(v))}</div></div>`).join('')}
        </div></div>`;
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 内联图标 ============ */
function chev() { return '<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 1.5L6.5 7l-5 5.5"/></svg>'; }
function iconCard() { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="7" width="17" height="11" rx="2" stroke="#fff" stroke-width="1.7"/><path d="M3.5 11h17" stroke="#fff" stroke-width="1.7"/></svg>'; }
function iconBank() { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="5.5" width="18" height="13" rx="2.2" stroke="#fff" stroke-width="1.7"/><path d="M3 10h18" stroke="#fff" stroke-width="1.7"/><path d="M6.5 14.5h4" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
function iconBill() { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 4.5h12v15l-3-1.8-3 1.8-3-1.8-3 1.8v-15Z" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 9h6M9 12.5h6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>'; }
function iconReceive() { return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="6" width="17" height="14" rx="2.6"/><path d="M3.8 9.6h16.4"/><path d="m6.2 9.6 5.8 4.9 5.8-4.9"/></svg>'; }
function iconScan() { return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6"/><path d="M6 12h12"/></svg>'; }

/* ============ 页面：发红包（聊天内发送） ============
    opts: { target: {id,name}, onSent(amount, blessing, payId) } */
export function openRedPacketSend(nav, { target, onSent } = {}) {
  const page = nav.makePage({
    title: '', chevBack: true,
    async build(body) {
      body.classList.add('rp-body');
      const w = await Wallet.load();
      let payId = 'balance';
      body.innerHTML = `
        <div class="rp-head"><span class="rp-head-icon">${iconEnvelop()}</span><span class="rp-head-title">发红包</span></div>
        ${target ? `
        <div class="wl-form">
          <div class="inset-group"><div class="inset-card">
            <div class="row static"><div class="row-label">单个金额</div>
              <div class="rp-amount-input"><span>¥</span><input type="number" inputMode="decimal" placeholder="0.00"></div></div>
            <div class="rp-amount-max">单个金额不可超过 200 元</div>
            <div class="row static"><div class="row-label">祝福语</div>
              <input class="rp-input" value="恭喜发财，大吉大利" maxlength="25"></div>
            <div class="rp-pay-row"></div>
          </div></div>
          <button class="wallet-btn primary rp-send-btn">塞钱进红包</button>
          <div class="wl-err"></div>
          <div class="rp-tip">未领取的红包，将于 24 小时后发起退款</div>
          <div class="rp-target"><div class="avatar av-sil" style="width:22px;height:22px"></div>发给 ${escapeHtml(target.name)}</div>
        </div>` : `<div class="empty-state"><div class="es-title">请从聊天中发送红包</div></div>`}`;
      const input = body.querySelector('.rp-amount-input input');
      const bless = body.querySelector('.rp-input');
      const errEl = body.querySelector('.wl-err');
      const payRow = body.querySelector('.rp-pay-row');
      const paintPay = () => { payRow.innerHTML = ''; payRow.appendChild(payMethodRow(w, payId, () => openPayPicker(w, payId, k => { payId = k; paintPay(); }))); };
      paintPay();
      body.querySelector('.rp-send-btn').onclick = async () => {
        errEl.textContent = '';
        const amount = readAmount(input);
        if (!amount) { errEl.textContent = '请输入红包金额'; return; }
        if (amount > 200) { errEl.textContent = '单个红包金额不可超过 200 元'; return; }
        const doSend = async () => {
          const w2 = await Wallet.load();
          const e = checkAmount(w2, payId, amount);
          if (e) { errEl.textContent = e; return null; }
          await Wallet.save(deduct(w2, payId, amount));
          return true;
        };
        const ok = await verifyPwd(`红包金额 ¥${formatMoney(amount)}`, doSend);
        if (ok) {
          haptic(8);
          const blessing = (bless.value || '').trim() || '恭喜发财，大吉大利';
          await Bill.add({ kind: '红包', title: `红包 · ${blessing}`, amount: -amount, status: '待领取', friendName: target.name, note: payLabel(w, payId) });
          onSent && onSent(amount, blessing, payId);
          nav.pop();
          toast('红包已发送');
        }
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：转账（聊天内发送） ============ */
export function openTransferSend(nav, { target, onSent } = {}) {
  const page = nav.makePage({
    title: '转账', chevBack: true,
    async build(body) {
      const w = await Wallet.load();
      let payId = 'balance';
      body.innerHTML = `
        ${target ? `
        <div class="tf-hero"><div class="avatar av-sil" style="width:58px;height:58px"></div><span class="tf-hero-name">向 ${escapeHtml(target.name)} 转账</span></div>
        <div class="wl-form">
          <div class="transfer-amount"><span class="transfer-cny">¥</span><input type="number" inputMode="decimal" placeholder="0.00"></div>
          <div class="inset-group"><div class="inset-card">
            <div class="row static"><input class="rp-input tf-note" placeholder="添加转账说明" maxlength="20"></div>
            <div class="tf-pay-row"></div>
          </div></div>
          <button class="wallet-btn primary tf-submit-btn">转账</button>
          <div class="wl-err"></div>
          <div class="rp-tip">零钱余额 ¥${formatMoney(w.balance)} · 对方确认收款后资金将直接转入对方零钱</div>
        </div>` : `<div class="empty-state"><div class="es-title">请从聊天中发起转账</div></div>`}`;
      const input = body.querySelector('.transfer-amount input');
      const note = body.querySelector('.tf-note');
      const errEl = body.querySelector('.wl-err');
      const payRow = body.querySelector('.tf-pay-row');
      const paintPay = () => { payRow.innerHTML = ''; payRow.appendChild(payMethodRow(w, payId, () => openPayPicker(w, payId, k => { payId = k; paintPay(); }))); };
      paintPay();
      body.querySelector('.tf-submit-btn').onclick = async () => {
        errEl.textContent = '';
        const amount = readAmount(input);
        if (!amount) { errEl.textContent = '请输入转账金额'; return; }
        const doSend = async () => {
          const w2 = await Wallet.load();
          const e = checkAmount(w2, payId, amount);
          if (e) { errEl.textContent = e; return null; }
          await Wallet.save(deduct(w2, payId, amount));
          return true;
        };
        const ok = await verifyPwd(`转账金额 ¥${formatMoney(amount)}`, doSend);
        if (ok) {
          haptic(8);
          const nt = (note.value || '').trim() || '转账';
          await Bill.add({ kind: '转账', title: `转账给 ${target.name}`, amount: -amount, status: '待收款', friendName: target.name, note: `${nt} · ${payLabel(w, payId)}` });
          onSent && onSent(amount, nt, payId);
          nav.pop();
          toast('转账已发送');
        }
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：赠送亲属卡（聊天内） ============ */
export function openRelativeGift(nav, { target, onSent } = {}) {
  const page = nav.makePage({
    title: '赠送亲属卡', chevBack: true,
    build(body) {
      body.innerHTML = `
        <div class="wl-form">
          <div class="rg-hero">
            <div class="rg-card-visual"><span>亲属卡</span><b>${escapeHtml(target?.name || '家人')}</b><i>亲情消费我买单</i></div>
          </div>
          <div class="tf-amount-label">每月消费额度上限</div>
          ${moneyInput({ placeholder: '如 500' }).outerHTML}
          <div class="inset-group"><div class="inset-card">
            <div class="row static"><input class="rp-input rg-note" placeholder="赠言（可选）" maxlength="20"></div>
          </div></div>
          <button class="wallet-btn primary" id="rg-go">赠出亲属卡</button>
          <div class="wl-err"></div>
          <div class="rp-tip">额度范围 ¥1.00 ~ ¥3000.00 · 赠出后可随时解除</div>
        </div>`;
      const input = body.querySelector('input');
      const note = body.querySelector('.rg-note');
      const errEl = body.querySelector('.wl-err');
      body.querySelector('#rg-go').onclick = async () => {
        errEl.textContent = '';
        const limit = readAmount(input);
        if (!limit) { errEl.textContent = '请输入每月额度'; return; }
        if (limit > 3000) { errEl.textContent = '额度不可超过 ¥3000.00'; return; }
        const card = { id: uid('rc'), friendId: target.id, friendName: target.name, monthlyLimit: limit, used: 0, direction: 'given', status: 'pending', createdAt: Date.now() };
        await Wallet.update(w => ({ ...w, relativeCards: [...w.relativeCards, card] }));
        await Bill.add({ kind: '亲属卡', title: `亲属卡 · ${target.name}`, amount: 0, status: '赠送成功', friendName: target.name, note: `每月额度 ¥${formatMoney(limit)}` });
        haptic(8);
        onSent && onSent(card, (note.value || '').trim());
        nav.pop();
        toast(`已向${target.name}赠出亲属卡`);
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：亲属卡管理 ============ */
export function openRelatives(nav) {
  const page = nav.makePage({
    title: '亲属卡', chevBack: true,
    async build(body) { renderRelatives(body, nav); },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

async function renderRelatives(body, nav) {
  const w = await Wallet.load();
  const cards = w.relativeCards;
  body.innerHTML = `
    <div class="wl-tip" style="padding-top:14px">亲属卡：家人消费我买单（赠出）/ 亲友为我的消费买单（收到）。</div>
    <div class="inset-group"><div class="inset-card" id="rc-list">${cards.length ? '' : '<div class="bills-empty">暂无亲属卡</div>'}</div></div>`;
  const list = body.querySelector('#rc-list');
  for (const c of cards) {
    const given = c.direction === 'given';
    const statusTxt = c.status === 'pending' ? '待领取' : c.status === 'rejected' ? '已退还' : c.status === 'claimed' ? '使用中' : '使用中';
    const r = el('div', 'row');
    r.innerHTML = `
      <div class="row-icon" style="background:linear-gradient(135deg,${given ? '#4cd97b,#07c160' : '#8fd3ff,#1a7dff'})"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="7" width="17" height="11" rx="2" stroke="#fff" stroke-width="1.7"/><path d="M3.5 11h17" stroke="#fff" stroke-width="1.7"/></svg></div>
      <div class="row-label">${escapeHtml(c.friendName)}<div class="row-sub">${given ? '我赠出' : '我收到'} · 月额度 ¥${formatMoney(c.monthlyLimit)} · 已用 ¥${formatMoney(c.used)} · ${statusTxt}</div></div>
      <div class="row-chevron">${chev()}</div>`;
    r.onclick = () => openRcCardDetail(nav, c);
    list.appendChild(r);
  }
}

/* 亲属卡详情（管理页进入） */
function openRcCardDetail(nav, card) {
  const page = nav.makePage({
    title: '亲属卡详情', chevBack: true,
    build(body) {
      const given = card.direction === 'given';
      const pct = Math.min(100, Math.round((card.used / Math.max(1, card.monthlyLimit)) * 100));
      body.innerHTML = `
        <div class="billd-hero">
          <div class="rg-card-visual"><span>亲属卡</span><b>${escapeHtml(card.friendName)}</b><i>${given ? '我赠出 · 对方消费我买单' : '对方赠出 · 我的消费TA买单'}</i></div>
        </div>
        <div class="inset-group"><div class="inset-card">
          <div class="row static"><div class="row-label" style="color:var(--text-2)">本月额度</div><div class="row-val">¥${formatMoney(card.monthlyLimit)}</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">已使用</div><div class="row-val">¥${formatMoney(card.used)}（${pct}%）</div></div>
          <div class="rc-bar"><i style="width:${pct}%"></i></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">状态</div><div class="row-val">${card.status === 'pending' ? '待领取' : card.status === 'rejected' ? '已退还' : '使用中'}</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">创建时间</div><div class="row-val">${new Date(card.createdAt).toLocaleDateString('zh-CN')}</div></div>
        </div></div>
        ${given ? `<button class="wallet-btn danger" id="rc-stop">解除亲属卡</button>` : ''}`;
      const stop = body.querySelector('#rc-stop');
      if (stop) stop.onclick = async () => {
        const ok = await confirmDialog('解除亲属卡', `解除后「${card.friendName}」将无法继续使用该卡消费。`, { okText: '解除', danger: true });
        if (!ok) return;
        await Wallet.update(w => ({ ...w, relativeCards: w.relativeCards.filter(x => x.id !== card.id) }));
        Bus.emit('wallet:changed');
        nav.pop();
        toast('已解除亲属卡');
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：红包记录 ============ */
export function openRedPacketRecords(nav) {
  const page = nav.makePage({
    title: '红包记录', chevBack: true,
    async build(body) {
      const bills = (await Bill.all()).filter(b => b.kind === '红包');
      const inSum = round2(bills.filter(b => b.amount > 0).reduce((s, b) => s + b.amount, 0));
      const outSum = round2(-bills.filter(b => b.amount < 0).reduce((s, b) => s + b.amount, 0));
      body.innerHTML = `
        <div class="bills-sum">收到 ¥${formatMoney(inSum)} · 发出 ¥${formatMoney(outSum)}</div>
        <div class="inset-group"><div class="inset-card bills-list">${bills.length ? '' : '<div class="bills-empty">暂无红包记录</div>'}</div></div>`;
      const list = body.querySelector('.bills-list');
      for (const b of bills) {
        const r = el('div', 'row');
        r.innerHTML = `
          <div class="row-icon" style="background:#fa5151"><span class="wi-glyph">红</span></div>
          <div class="row-label">${escapeHtml(b.title)}<div class="row-sub">${escapeHtml(b.friendName || '')} ${fmtSmartTime(b.time)} · ${escapeHtml(b.status)}</div></div>
          <div class="bill-amount ${b.amount > 0 ? 'in' : ''}">${b.amount > 0 ? '+' : ''}${formatMoney(b.amount)}</div>`;
        r.onclick = () => openBillDetail(nav, b);
        list.appendChild(r);
      }
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：红包 / 转账消息详情（聊天气泡点入） ============ */
export function openMsgDetail(nav, { kind, msg }) {
  const isRp = kind === 'redpacket';
  const info = isRp ? msg.redpacket : msg.transfer;
  const title = isRp ? '红包详情' : '转账详情';
  const page = nav.makePage({
    title, chevBack: true,
    build(body) {
      body.innerHTML = `
        <div class="msgd-hero ${isRp ? 'rp' : 'tf'}">
          <div class="msgd-icon">${isRp ? iconEnvelop(30) : iconTransfer(30)}</div>
          <div class="msgd-amount">¥${formatMoney(info.amount)}</div>
          <div class="msgd-status">${isRp ? escapeHtml(info.blessing || '恭喜发财') : escapeHtml(info.note || '转账')} · ${escapeHtml(info.status)}</div>
        </div>
        <div class="inset-group"><div class="inset-card">
          <div class="row static"><div class="row-label" style="color:var(--text-2)">${isRp ? '领取状态' : '收款状态'}</div><div class="row-val">${escapeHtml(info.status)}</div></div>
          ${info.openedAt || info.confirmedAt ? `<div class="row static"><div class="row-label" style="color:var(--text-2)">${isRp ? '领取时间' : '确认时间'}</div><div class="row-val">${new Date(info.openedAt || info.confirmedAt).toLocaleString('zh-CN', { hour12: false })}</div></div>` : ''}
          <div class="row static"><div class="row-label" style="color:var(--text-2)">发起时间</div><div class="row-val">${new Date(msg.timestamp).toLocaleString('zh-CN', { hour12: false })}</div></div>
        </div></div>
        <div class="wl-tip">${isRp ? '未领取的红包将于 24 小时后自动退回零钱' : '24 小时未确认将自动退回对方零钱'}（演示模拟）</div>`;
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：银行卡 ============ */
export function openBankCards(nav) {
  const page = nav.makePage({
    title: '银行卡', chevBack: true,
    async build(body) { renderBankCards(body, nav); },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

async function renderBankCards(body, nav) {
  const w = await Wallet.load();
  body.innerHTML = `
    <div class="inset-group"><div class="inset-card" id="bc-list">${w.bankCards.length ? '' : '<div class="bills-empty">暂无银行卡</div>'}</div></div>
    <button class="wallet-btn primary" id="bc-add">添加银行卡</button>
    <div class="wl-tip">银行卡可用于充值、提现与支付（演示数据，非真实卡）。</div>`;
  const list = body.querySelector('#bc-list');
  for (const c of w.bankCards) {
    const r = el('div', 'row');
    r.innerHTML = `
      <div class="row-icon" style="background:linear-gradient(135deg,#6ba8ff,#1a7dff)"><span class="wi-glyph">卡</span></div>
      <div class="row-label">${escapeHtml(c.bankName)}<div class="row-sub">尾号 ${escapeHtml(c.cardTail)} · ${escapeHtml(c.cardType || '储蓄卡')} · 可用 ¥${formatMoney(c.available)}</div></div>
      <div class="row-chevron">${chev()}</div>`;
    r.onclick = () => openBankCardDetail(nav, c);
    list.appendChild(r);
  }
  body.querySelector('#bc-add').onclick = () => openBankCardAdd(nav);
}

function openBankCardDetail(nav, card) {
  const page = nav.makePage({
    title: card.bankName, chevBack: true,
    build(body) {
      body.innerHTML = `
        <div class="bankcard-visual" style="background:linear-gradient(135deg,#4a7dff,#1a3fd6)">
          <span>${escapeHtml(card.bankName)}</span>
          <b>**** **** **** ${escapeHtml(card.cardTail)}</b>
          <i>${escapeHtml(card.cardType || '储蓄卡')}</i>
        </div>
        <div class="inset-group"><div class="inset-card">
          <div class="row static"><div class="row-label" style="color:var(--text-2)">可用额度</div><div class="row-val">¥${formatMoney(card.available)}</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">持卡人</div><div class="row-val">${escapeHtml(card.holder || Settings.get('nickname', '我'))}</div></div>
          <div class="row static"><div class="row-label" style="color:var(--text-2)">绑定时间</div><div class="row-val">${new Date(card.createdAt).toLocaleDateString('zh-CN')}</div></div>
        </div></div>
        <button class="wallet-btn danger" id="bc-del">解绑银行卡</button>`;
      body.querySelector('#bc-del').onclick = async () => {
        const ok = await confirmDialog('解绑银行卡', `解除绑定 ${card.bankName}（尾号 ${card.cardTail}）？`, { okText: '解绑', danger: true });
        if (!ok) return;
        await Wallet.update(w => ({ ...w, bankCards: w.bankCards.filter(x => x.id !== card.id) }));
        Bus.emit('wallet:changed');
        nav.pop();
        toast('已解绑');
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

function openBankCardAdd(nav) {
  const page = nav.makePage({
    title: '添加银行卡', chevBack: true,
    build(body) {
      const banks = ['招商银行', '工商银行', '建设银行', '农业银行', '中国银行', '交通银行', '邮储银行', '中信银行', '浦发银行', '民生银行'];
      body.innerHTML = `
        <div class="wl-form">
          <div class="inset-group"><div class="inset-card">
            <div class="row static"><div class="row-label">银行</div>
              <select class="bc-select"><option value="">请选择银行</option>${banks.map(b => `<option>${b}</option>`).join('')}</select></div>
            <div class="row static"><div class="row-label">卡号后四位</div><input class="bc-tail" type="text" maxlength="4" placeholder="1234"></div>
            <div class="row static"><div class="row-label">初始额度</div><input class="bc-avail" type="number" inputMode="decimal" placeholder="10000"></div>
          </div></div>
          <button class="wallet-btn primary" id="bc-go">确认绑定</button>
          <div class="wl-err"></div>
        </div>`;
      const sel = body.querySelector('.bc-select');
      const tail = body.querySelector('.bc-tail');
      const avail = body.querySelector('.bc-avail');
      const errEl = body.querySelector('.wl-err');
      body.querySelector('#bc-go').onclick = async () => {
        errEl.textContent = '';
        if (!sel.value) { errEl.textContent = '请选择银行'; return; }
        if (!/^\d{4}$/.test(tail.value)) { errEl.textContent = '请输入 4 位卡号尾号'; return; }
        const money = readAmount(avail);
        if (money <= 0) { errEl.textContent = '请输入初始额度'; return; }
        await Wallet.update(w => ({ ...w, bankCards: [...w.bankCards, { id: uid('card'), bankName: sel.value, cardTail: tail.value, holder: '', phone: '', cardType: '储蓄卡', available: money, createdAt: Date.now() }] }));
        haptic(8);
        nav.pop();
        toast('绑定成功');
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 页面：支付密码设置 ============ */
export function openPayPwdSet(nav) {
  const page = nav.makePage({
    title: '支付密码', chevBack: true,
    async build(body) {
      const w = await Wallet.load();
      const has = Wallet.hasPwd(w);
      body.innerHTML = `
        <div class="wl-tip" style="padding:18px 16px 4px;text-align:left">支付密码为 6 位数字。设置后，零钱支付、红包、转账等操作都需要验证密码。忘记密码可通过「重设」修改。</div>
        <div class="inset-group"><div class="inset-card">
          <div class="row" id="pw-set"><div class="row-icon" style="background:linear-gradient(135deg,#0a84ff,#0060df)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/></svg></div>
            <div class="row-label">${has ? '修改支付密码' : '设置支付密码'}</div><div class="row-chevron">${chev()}</div></div>
          ${has ? `<div class="row" id="pw-off"><div class="row-icon" style="background:linear-gradient(135deg,#c0c6cf,#8e959e)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l14 14"/></svg></div>
            <div class="row-label" style="color:var(--danger)">关闭支付密码</div><div class="row-chevron">${chev()}</div></div>` : ''}
        </div></div>`;
      body.querySelector('#pw-set').onclick = async () => {
        const pwd1 = await askPayPwd({ title: '设置支付密码', desc: '请输入 6 位数字密码' });
        if (!pwd1) return;
        const pwd2 = await askPayPwd({ title: '确认支付密码', desc: '请再次输入新密码' });
        if (!pwd2) return;
        if (pwd1 !== pwd2) { toast('两次输入的密码不一致', 2200); return; }
        if (/^(\d)\1+$/.test(pwd1)) { toast('密码过于简单，请勿使用重复数字'); return; }
        await Wallet.update(x => ({ ...x, payPassword: pwd1 }));
        haptic(8);
        toast('支付密码已设置');
        nav.pop();
      };
      const off = body.querySelector('#pw-off');
      if (off) off.onclick = async () => {
        const ok = await confirmDialog('关闭支付密码', '关闭后所有支付操作将不再需要密码验证。', { okText: '关闭', danger: true });
        if (!ok) return;
        await Wallet.update(x => { const n = { ...x }; delete n.payPassword; return n; });
        toast('已关闭支付密码');
        nav.pop();
      };
    },
  });
  page.el.classList.add('wallet-page');
  nav.push(page);
}

/* ============ 图标补充 ============ */
function iconEnvelop(size = 26) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="6" width="17" height="14" rx="2.6" fill="rgba(255,255,255,0.18)" stroke="#fff" stroke-width="1.7"/><path d="M3.8 9.6h16.4" stroke="#fff" stroke-width="1.7"/><path d="m6.2 9.6 5.8 4.9 5.8-4.9" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
function iconTransfer(size = 26) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10h10l-3.2-3.4"/><path d="M17 14H7l3.2 3.4"/></svg>`; }

