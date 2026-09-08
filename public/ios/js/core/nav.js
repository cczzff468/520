/* ============ 应用内页面导航栈（iOS 滑动过渡） ============ */

import { el, haptic, Bus } from './utils.js';

/* ============ 全局导航实例注册表（供全局返回键使用） ============ */
const NAVS = [];
/** 打开/关闭应用时清空注册表（由 applayer 调用） */
export function resetNavs() { NAVS.length = 0; }
/** 智能返回：从最新创建的导航栈开始尝试退一页；成功返回 true，无可退页面返回 false */
export function navBack() {
  for (let i = NAVS.length - 1; i >= 0; i--) {
    if (NAVS[i].canPop()) { NAVS[i].pop(); return true; }
  }
  return false;
}

/**
 * 创建导航容器。页面结构: .nav-page > .nav + .page-body
 * page: { el, title, onPop?, onShow?, noNavbar? }
 */
export function createNav(host) {
  const navHost = el('div', 'nav-host');
  host.appendChild(navHost);
  const stack = [];
  let hasRoot = false; // 是否通过 setRoot 设立了根页面（无根页面的应用：微信/音乐）

  function makePage({ title = '', back = null, right = [], large = false, build, noNavbar = false, className = '', chevBack = false }) {
    const page = el('div', 'nav-page' + (className ? ' ' + className : ''));
    let t = null;
    if (!noNavbar) {
      const nav = el('div', 'nav');
      const left = el('div', 'nav-side');
      t = el('div', 'nav-title');
      t.textContent = title;
      const r = el('div', 'nav-side right');
      right.forEach(b => r.appendChild(b));
      if (back !== null || chevBack) {
        const backBtn = el('button', 'nav-btn chev only');
        /* 统一返回键：全部为纯 chevron 图标（无文字），全局一致风格
           back 参数仍被接受（兼容旧调用），但不再渲染文字 */
        backBtn.innerHTML = '<svg width="12" height="21" viewBox="0 0 12 21" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2L2 10.5 10 19"/></svg>';
        backBtn.setAttribute('aria-label', '返回');
        backBtn.onclick = () => { haptic(6); pop(); };
        left.appendChild(backBtn);
      } else {
        left.style.width = '1px';
      }
      nav.append(left, t, r);
      page.appendChild(nav);
    }
    const body = el('div', 'page-body');
    if (large && title) {
      const lt = el('div', 'large-title');
      lt.textContent = title;
      body.appendChild(lt);
      /* iOS 收合行为：滚动超过大标题后，导航栏居中小标题淡入 */
      if (t) {
        t.style.opacity = '0';
        t.style.transition = 'opacity .22s ease';
        body.addEventListener('scroll', () => {
          t.style.opacity = body.scrollTop > 46 ? '1' : '0';
        }, { passive: true });
      }
    }
    page.appendChild(body);
    const result = { el: page, body, title, _build: build || null };
    return result;
  }

  function runBuild(page) {
    if (page && page._build) {
      const fn = page._build;
      page._build = null;
      try {
        fn(page.body, page.el);
      } catch (e) {
        console.error('[page build]', e);
        page.body.innerHTML = `<div class="empty-state"><div class="es-title">页面加载失败</div><div>${String(e.message || e)}</div></div>`;
      }
    }
  }

  function setRoot(page) {
    hasRoot = true;
    navHost.appendChild(page.el);
    stack.push(page);
    runBuild(page);
    Bus.emit('nav:changed');
  }

  /** 重置整个栈并设立新根页（避免反复 setRoot 造成页面堆叠） */
  function resetToRoot(page) {
    hasRoot = true;
    navHost.innerHTML = '';
    stack.length = 0;
    navHost.appendChild(page.el);
    stack.push(page);
    runBuild(page);
    Bus.emit('nav:changed');
  }

  function push(page, { back = null } = {}) {
    page._back = back;
    page.el.classList.add('enter');
    navHost.appendChild(page.el);
    requestAnimationFrame(() => {
      page.el.classList.remove('enter');
    });
    // 380ms 后清理动画类，避免影响布局
    setTimeout(() => { page.el.style.animation = ''; }, 420);
    stack.push(page);
    runBuild(page);
    haptic(4);
    Bus.emit('nav:changed');
  }

  /** 是否还有页面可退：无根栈的单页（如微信聊天页/音乐播放页）可退；有根栈的根页不可退 */
  function canPop() {
    return stack.length > 0 && !(hasRoot && stack.length === 1);
  }

  function pop() {
    if (!canPop()) return false;
    const page = stack.pop();
    page.el.classList.add('leave');
    const prev = stack[stack.length - 1];
    if (prev && prev.onShow) prev.onShow();
    if (page.onPop) page.onPop();
    setTimeout(() => { page.el.remove(); }, 400);
    Bus.emit('nav:changed');
    return true;
  }

  function refresh(page) { /* 重新渲染当前页(可选) */ }

  const api = { setRoot, resetToRoot, push, pop, canPop, makePage, stack, host: navHost };
  NAVS.push(api); // 注册到全局导航注册表
  return api;
}

/** 快速构建导航页 */
export function page({ title, back, right, large, build, noNavbar, className }) {
  return createNavProxy({ title, back, right, large, build, noNavbar, className });
}
function createNavProxy(opts) {
  // 不依附 nav 实例的独立构建（供 applayer 兼容）
  const frag = el('div', 'nav-page ' + (opts.className || ''));
  return { el: frag, opts };
}

/** 右侧按钮构造 */
export function navBtn(html, onClick, cls = '') {
  const b = el('button', 'nav-btn ' + cls);
  b.innerHTML = html;
  b.onclick = (e) => { haptic(6); onClick && onClick(e); };
  return b;
}

/** 底部 Tab 容器切换 */
export function tabRoot({ tabs, onChange, initial = 0 }) {
  const root = el('div', 'app-root');
  const content = el('div', '');
  content.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;position:relative;overflow:hidden;';
  const tabbar = el('div', 'tabbar');
  const tabEls = [];
  tabs.forEach((t, i) => {
    const item = el('div', 'tab-item' + (i === initial ? ' on' : ''));
    item.innerHTML = `${t.icon}<span>${t.label}</span>`;
    item.onclick = () => {
      if (tabEls[i].classList.contains('on')) return;
      haptic(4);
      tabEls.forEach(x => x.classList.remove('on'));
      tabEls[i].classList.add('on');
      onChange(i);
    };
    tabEls.push(item);
    tabbar.appendChild(item);
  });
  root.append(content, tabbar);
  return { root, content, tabbar, setTab: (i) => { tabEls.forEach(x => x.classList.remove('on')); tabEls[i].classList.add('on'); onChange(i); } };
}
