/* ============ 计算器（竖屏标准 / 横屏科学） ============ */

import { el, haptic } from '../core/utils.js';
import { Apps as AppIcons } from '../core/icons.js';
import { toast } from '../core/ui.js';

let root = null;
let mode = 'standard'; // standard | scientific
let display = '0';
let expr = '';
let angleMode = 'DEG';

/* 标准模式状态 */
let pending = null;   // { value, op }
let freshEntry = true;
let lastOp = null;    // 重复等号

export default {
  id: 'calculator',
  name: '计算器',
  icon: AppIcons.calculator,
  sbStyle: 'dark',
  fullscreen: true,

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    detectMode();
    buildUI();
    this._onResize = () => {
      const m = detectMode();
      if (m !== mode) { mode = m; buildUI(); }
    };
    window.addEventListener('resize', this._onResize);
    if (screen.orientation) {
      screen.orientation.addEventListener?.('change', this._onResize);
    }
  },

  unmount() {
    window.removeEventListener('resize', this._onResize);
    if (screen.orientation) screen.orientation.removeEventListener?.('change', this._onResize);
  },
};

function detectMode() {
  const landscape = window.innerWidth > window.innerHeight && window.matchMedia('(pointer: coarse)').matches;
  if (screen.orientation?.type?.startsWith('landscape')) mode = 'scientific';
  else if (screen.orientation?.type?.startsWith('portrait')) mode = landscape ? 'scientific' : 'standard';
  else mode = landscape ? 'scientific' : 'standard';
  return mode;
}

function buildUI() {
  const sci = mode === 'scientific';
  root.innerHTML = `
    <div class="calc-root ${sci ? 'sci' : ''}">
      <button class="calc-mode-toggle" id="calc-mode-btn" aria-label="切换科学计算器">${sci ? '标准' : '科学'}</button>
      <div class="calc-display">
        <div class="calc-expr" id="calc-expr"></div>
        <div class="calc-num num" id="calc-num">0</div>
      </div>
      ${sci ? `
      <div class="calc-sci-rows">
        <button class="calc-key fn" data-k="DEG" id="calc-anglemode">DEG</button>
        <button class="calc-key fn" data-k="sin">sin</button>
        <button class="calc-key fn" data-k="cos">cos</button>
        <button class="calc-key fn" data-k="tan">tan</button>
        <button class="calc-key fn" data-k="log">log</button>
        <button class="calc-key fn" data-k="ln">ln</button>
        <button class="calc-key fn" data-k="sqrt">√</button>
        <button class="calc-key fn" data-k="sq">x²</button>
        <button class="calc-key fn" data-k="cube">x³</button>
        <button class="calc-key fn" data-k="pow">xⁿ</button>
        <button class="calc-key fn" data-k="(">(</button>
        <button class="calc-key fn" data-k=")">)</button>
        <button class="calc-key fn" data-k="pi">π</button>
        <button class="calc-key fn" data-k="e">e</button>
        <button class="calc-key fn" data-k="inv">1/x</button>
        <button class="calc-key fn" data-k="fact">x!</button>
      </div>` : ''}
      <div class="calc-std-grid">
        <button class="calc-key util" data-k="AC" id="calc-ac">AC</button>
        <button class="calc-key util" data-k="neg">+/−</button>
        <button class="calc-key util" data-k="pct">%</button>
        <button class="calc-key op" data-k="÷">÷</button>

        <button class="calc-key num" data-k="7">7</button>
        <button class="calc-key num" data-k="8">8</button>
        <button class="calc-key num" data-k="9">9</button>
        <button class="calc-key op" data-k="×">×</button>

        <button class="calc-key num" data-k="4">4</button>
        <button class="calc-key num" data-k="5">5</button>
        <button class="calc-key num" data-k="6">6</button>
        <button class="calc-key op" data-k="−">−</button>

        <button class="calc-key num" data-k="1">1</button>
        <button class="calc-key num" data-k="2">2</button>
        <button class="calc-key num" data-k="3">3</button>
        <button class="calc-key op" data-k="+">+</button>

        <button class="calc-key num zero" data-k="0">0</button>
        <button class="calc-key num" data-k=".">.</button>
        <button class="calc-key op eq" data-k="=" id="calc-eq">=</button>
      </div>
    </div>`;

  root.querySelectorAll('.calc-key').forEach(bindKey);
  root.querySelector('#calc-mode-btn')?.addEventListener('click', () => {
    haptic(6);
    mode = mode === 'scientific' ? 'standard' : 'scientific';
    buildUI();
  });
  render();
}

function bindKey(btn) {
  const press = () => {
    btn.classList.add('pressed');
    haptic(6);
    handleKey(btn.dataset.k);
  };
  const release = () => btn.classList.remove('pressed');
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', release);
}

function handleKey(k) {
  const numEl = root.querySelector('#calc-num');
  const exprEl = root.querySelector('#calc-expr');
  const acEl = root.querySelector('#calc-ac');
  const angleEl = root.querySelector('#calc-anglemode');

  if (mode === 'scientific') {
    handleScientific(k, { numEl, exprEl, acEl, angleEl });
    render();
    return;
  }

  /* ---- 标准模式（iOS 立即执行逻辑） ---- */
  if (/^[0-9]$/.test(k)) {
    if (freshEntry) { display = k; freshEntry = false; }
    else if (display.replace(/[-.]/g, '').length < 9) display = display === '0' ? k : display + k;
  } else if (k === '.') {
    if (freshEntry) { display = '0.'; freshEntry = false; }
    else if (!display.includes('.')) display += '.';
  } else if (k === 'AC') {
    display = '0'; pending = null; lastOp = null; freshEntry = true; expr = '';
  } else if (k === 'neg') {
    if (display !== '0') display = display.startsWith('-') ? display.slice(1) : '-' + display;
  } else if (k === 'pct') {
    display = fmtNum(parseFloat(display) / 100);
  } else if (['+', '−', '×', '÷'].includes(k)) {
    const cur = parseFloat(display);
    if (pending && !freshEntry) {
      display = fmtNum(applyOp(pending.value, cur, pending.op));
    }
    pending = { value: parseFloat(display), op: k };
    lastOp = { value: parseFloat(display), op: k };
    freshEntry = true;
  } else if (k === '=') {
    if (pending) {
      const cur = parseFloat(display);
      display = fmtNum(applyOp(pending.value, cur, pending.op));
      pending = null;
    } else if (lastOp) {
      display = fmtNum(applyOp(parseFloat(display), lastOp.value, lastOp.op));
    }
    freshEntry = true;
  }

  if (acEl) acEl.textContent = (display !== '0' || pending || expr) ? 'C' : 'AC';
  render();
}

function applyOp(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
  }
  return b;
}

/* ---- 科学模式（表达式求值） ---- */
function handleScientific(k, { exprEl, acEl, angleEl }) {
  if (k === 'DEG') { angleMode = angleMode === 'DEG' ? 'RAD' : 'DEG'; if (angleEl) angleEl.textContent = angleMode; return; }

  const exprTokens = {
    sin: 'sin(', cos: 'cos(', tan: 'tan(', log: 'log(', ln: 'ln(', sqrt: '√(',
    pi: 'π', e: 'e', '(': '(', ')': ')',
    sq: '^2', cube: '^3', pow: '^', inv: '1÷(', fact: '!',
  };

  if (k === 'AC') { expr = ''; display = '0'; pending = null; freshEntry = true; if (acEl) acEl.textContent = 'AC'; return; }
  if (k === '=') {
    try {
      const val = evaluate(expr || display);
      display = fmtNum(val);
      expr = '';
    } catch (e) { display = '错误'; expr = ''; }
    return;
  }
  if (/^[0-9]$/.test(k)) { expr += k; }
  else if (k === '.') { expr += '.'; }
  else if (k === 'neg') { expr += '(-'; }
  else if (k === 'pct') { expr += '÷100'; }
  else if (['+', '−', '×', '÷'].includes(k)) { expr += k; }
  else if (exprTokens[k]) {
    const t = exprTokens[k];
    if (t === '!' || t.startsWith('^')) { expr += t; }
    else if (t === 'π' || t === 'e') { expr += t; }
    else if (t === ')' ) { expr += ')'; }
    else if (t === '(' ) { expr += '('; }
    else { expr += t; }
  }
  // 实时预览
  try {
    if (expr && /[0-9)].$/.test(expr)) {
      const val = evaluate(expr);
      display = Number.isFinite(val) ? fmtNum(val) : display;
    }
  } catch (e) { /* 表达式未完成 */ }
}

/* ---- 表达式解析器 ---- */
function evaluate(src) {
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/π/g, 'PI').replace(/−/g, '-').replace(/√/g, 'sqrt');
  let pos = 0;
  const peek = () => s[pos];
  const next = () => s[pos++];

  function parseExpr() {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') { const op = next(); const r = parseTerm(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function parseTerm() {
    let v = parseUnary();
    while (peek() === '*' || peek() === '/') { const op = next(); const r = parseUnary(); v = op === '*' ? v * r : v / r; }
    return v;
  }
  function parseUnary() {
    if (peek() === '-') { next(); return -parseUnary(); }
    if (peek() === '+') { next(); return parseUnary(); }
    return parsePower();
  }
  function parsePower() {
    const base = parsePostfix();
    if (peek() === '^') { next(); const exp = parseUnary(); return Math.pow(base, exp); }
    return base;
  }
  function parsePostfix() {
    let v = parsePrimary();
    while (peek() === '!') { next(); v = factorial(v); }
    return v;
  }
  function parsePrimary() {
    if (/[0-9.]/.test(peek() || '')) {
      let n = '';
      while (/[0-9.]/.test(peek() || '')) n += next();
      const v = parseFloat(n);
      if (isNaN(v)) throw new Error('bad number');
      return v;
    }
    if (peek() === '(') {
      next();
      const v = parseExpr();
      if (peek() !== ')') throw new Error('missing )');
      next();
      return v;
    }
    const funcs = ['sin(', 'cos(', 'tan(', 'log(', 'ln(', 'sqrt('];
    for (const f of funcs) {
      if (s.startsWith(f, pos)) {
        pos += f.length;
        let inner;
        if (peek() === '(') { inner = parseExpr(); if (peek() !== ')') throw new Error('missing )'); next(); }
        else { inner = parsePrimary(); }
        return applyFunc(f.slice(0, -1), inner);
      }
    }
    if (s.startsWith('PI', pos)) { pos += 2; return Math.PI; }
    if (peek() === 'e') { next(); return Math.E; }
    throw new Error('unexpected ' + (peek() || 'end'));
  }
  const val = parseExpr();
  if (pos < s.length) throw new Error('unexpected ' + s[pos]);
  if (!Number.isFinite(val)) throw new Error('NaN');
  return val;
}

function applyFunc(f, x) {
  const toAng = angleMode === 'DEG' ? x * Math.PI / 180 : x;
  const fromAng = (v) => angleMode === 'DEG' ? v * 180 / Math.PI : v;
  switch (f) {
    case 'sin': return Math.sin(toAng);
    case 'cos': return Math.cos(toAng);
    case 'tan': return fromAng(Math.tan(toAng));
    case 'log': return Math.log10(x);
    case 'ln': return Math.log(x);
    case 'sqrt': return Math.sqrt(x);
  }
  return x;
}

function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) { const g = 1; throw new Error('factorial'); }
  let r = 1;
  for (let i = 2; i <= Math.min(n, 170); i++) r *= i;
  return r;
}

/* ---- 显示 ---- */
function render() {
  const numEl = root.querySelector('#calc-num');
  const exprEl = root.querySelector('#calc-expr');
  if (!numEl) return;
  const text = display === '错误' ? '错误' : formatDisplay(display);
  numEl.textContent = text;
  // 字号随长度收缩（基准 86px / 460，长数逐级缩小）
  const len = text.length;
  numEl.style.fontSize = (len > 9 ? 62 : len > 7 ? 74 : 86) + 'px';
  if (mode === 'scientific' && exprEl) {
    exprEl.textContent = prettyExpr(expr);
  } else if (exprEl) {
    exprEl.textContent = pending ? `${pending.value} ${pending.op}` : '';
  }
}

function prettyExpr(e) {
  return e.replace(/\*/g, '×').replace(/\//g, '÷').replace(/PI/g, 'π');
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return '错误';
  if (Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-9 && n !== 0)) return n.toExponential(6).replace(/e/, 'e');
  const r = parseFloat(n.toPrecision(11));
  return String(r);
}

function formatDisplay(d) {
  if (d === '错误') return d;
  if (d.includes('e')) return d;
  const [int, dec] = d.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = int.replace('-', '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + grouped + (dec !== undefined ? '.' + dec : '');
}
