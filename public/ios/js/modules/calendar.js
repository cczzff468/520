/* ============ 日历（月 / 周 / 日视图 + 重复事件） ============ */

import { el, uid, Bus, haptic, fmtTime, notify, requestNotifyPermission } from '../core/utils.js';
import { DB } from '../core/db.js';
import { createNav, navBtn } from '../core/nav.js';
import { toast, actionSheet, dialog, confirmDialog, promptDialog, escapeHtml, sheet } from '../core/ui.js';
import { Apps as AppIcons } from '../core/icons.js';

let root = null;
let nav = null;
let viewMode = 'month';
let curDate = new Date(); // 当前聚焦日期
let remindTimer = null;

const COLORS = ['#0A84FF', '#FF3B30', '#34C759', '#FF9500', '#E645A5', '#8E44E5'];

export default {
  id: 'calendar',
  name: '日历',
  icon: AppIcons.calendar,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    const overlay = el('div', '');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10;';
    root.appendChild(overlay);
    nav = createNav(overlay);

    const page = nav.makePage({
      title: '日历',
      right: [navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => addEvent())],
      build(body) {
        body.innerHTML = `
          <div class="cal-top">
            <div class="cal-month" id="cal-month"></div>
            <div style="display:flex;gap:2px">
              <button class="cal-nav" id="cal-prev">‹</button>
              <button class="cal-nav" id="cal-next">›</button>
            </div>
          </div>
          <div class="segmented">
            <button data-v="day">日</button>
            <button data-v="week">周</button>
            <button data-v="month" class="on">月</button>
          </div>
          <div id="cal-view"></div>`;
        body.querySelectorAll('.segmented button').forEach(b => {
          b.onclick = () => {
            body.querySelectorAll('.segmented button').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            viewMode = b.dataset.v;
            renderView();
          };
        });
        body.querySelector('#cal-prev').onclick = () => { shift(-1); };
        body.querySelector('#cal-next').onclick = () => { shift(1); };
        renderView();
        scheduleReminders();
      },
    });
    nav.setRoot(page);
  },

  unmount() { clearInterval(remindTimer); },
};

function shift(n) {
  if (viewMode === 'month') { curDate = new Date(curDate.getFullYear(), curDate.getMonth() + n, 1); }
  else if (viewMode === 'week') { curDate.setDate(curDate.getDate() + n * 7); }
  else { curDate.setDate(curDate.getDate() + n); }
  renderView();
}

/* ---------- 事件展开（含重复） ---------- */
async function getEventsInRange(start, end) {
  const all = await DB.byIndex('events', 'start', null, false);
  const out = [];
  for (const e of all) {
    const base = { ...e };
    if (!e.repeat || e.repeat === 'none') {
      if (e.start < end && e.end > start) out.push(base);
    } else {
      // 重复事件：从事件开始到范围结束展开
      let occ = new Date(e.start);
      const limit = Math.min(end, Date.now() + 1000 * 86400 * 365);
      let guard = 0;
      while (occ.getTime() < limit && guard++ < 500) {
        const occEnd = occ.getTime() + (e.end - e.start);
        if (occ.getTime() >= start && occ.getTime() < end) {
          out.push({ ...e, start: occ.getTime(), end: occEnd, _repeat: true });
        }
        if (e.repeat === 'daily') occ.setDate(occ.getDate() + 1);
        else if (e.repeat === 'weekly') occ.setDate(occ.getDate() + 7);
        else if (e.repeat === 'monthly') occ.setMonth(occ.getMonth() + 1);
        else break;
        if (occEnd > end && occ.getTime() > end) break;
      }
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

async function renderView() {
  const view = root.querySelector('#cal-view');
  const monthEl = root.querySelector('#cal-month');
  const y = curDate.getFullYear(), m = curDate.getMonth();
  monthEl.textContent = viewMode === 'month'
    ? `${y}年${m + 1}月`
    : `${y}年${m + 1}月${curDate.getDate()}日`;

  if (viewMode === 'month') {
    const first = new Date(y, m, 1);
    const start = new Date(first); start.setDate(start.getDate() - first.getDay());
    const end = new Date(start); end.setDate(end.getDate() + 42);
    const events = await getEventsInRange(start.getTime(), end.getTime());
    view.innerHTML = '';
    view.appendChild(monthGrid(start, events));
    view.appendChild(await dayList(curDate, events));
  } else if (viewMode === 'week') {
    const start = new Date(curDate); start.setDate(start.getDate() - start.getDay()); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const events = await getEventsInRange(start.getTime(), end.getTime());
    view.innerHTML = '';
    view.appendChild(weekGrid(start, events));
  } else {
    const start = new Date(curDate); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const events = await getEventsInRange(start.getTime(), end.getTime());
    view.innerHTML = '';
    view.appendChild(dayTimeline(events));
  }
}

/* ---------- 月视图 ---------- */
function monthGrid(start, events) {
  const grid = el('div', 'cal-month-grid');
  const heads = ['日', '一', '二', '三', '四', '五', '六'];
  grid.innerHTML = `<div class="cal-week-head">${heads.map(h => `<span class="${h === '日' || h === '六' ? 'wknd' : ''}">${h}</span>`).join('')}</div>`;
  const cells = el('div', 'cal-cells');
  const today = new Date();
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const cell = el('div', 'cal-cell' + (d.getMonth() !== curDate.getMonth() ? ' dim' : ''));
    const isToday = d.toDateString() === today.toDateString();
    cell.innerHTML = `<span class="cc-day ${isToday ? 'today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'wknd' : ''}">${d.getDate()}</span>
      <div class="cc-dots"></div>`;
    if (d.toDateString() === curDate.toDateString()) cell.classList.add('sel');
    // 事件点
    const dayEvents = events.filter(e => sameDay(new Date(e.start), d));
    const dotWrap = cell.querySelector('.cc-dots');
    [...new Set(dayEvents.map(e => e.color))].slice(0, 4).forEach(c => {
      dotWrap.innerHTML += `<i style="background:${c}"></i>`;
    });
    cell.onclick = () => { curDate = new Date(d); renderView(); };
    cells.appendChild(cell);
  }
  grid.appendChild(cells);
  return grid;
}

async function dayList(day, events) {
  const wrap = el('div', 'cal-day-list');
  const list = events.filter(e => sameDay(new Date(e.start), day));
  wrap.innerHTML = `<div class="inset-group-title" style="text-transform:none;font-size:15px;font-weight:600;color:var(--text)">${day.getMonth() + 1}月${day.getDate()}日 ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day.getDay()]}${list.length ? '' : ' · 无事件'}</div>`;
  if (!list.length) {
    wrap.innerHTML += `<div class="inset-group"><div class="inset-card"><div class="row static" style="justify-content:center;color:var(--text-2)">点击右上角 + 添加事件</div></div></div>`;
    return wrap;
  }
  const card = el('div', 'inset-card');
  list.forEach(ev => {
    const row = el('div', 'row ev-row');
    row.innerHTML = `
      <div class="ev-bar" style="background:${ev.color}"></div>
      <div class="row-label" style="min-width:0">
        <div class="ellipsis" style="font-size:16px;font-weight:500">${escapeHtml(ev.title)}</div>
        <div style="font-size:12.5px;color:var(--text-2)">${fmtTime(ev.start)} – ${fmtTime(ev.end)}${ev.location ? ' · ' + escapeHtml(ev.location) : ''}${ev._repeat ? ' · 重复' : ''}</div>
      </div>`;
    row.onclick = () => viewEvent(ev);
    card.appendChild(row);
  });
  const g = el('div', 'inset-group');
  g.appendChild(card);
  wrap.appendChild(g);
  return wrap;
}

/* ---------- 周视图 ---------- */
function weekGrid(start, events) {
  const wrap = el('div', 'cal-week');
  const hours = el('div', 'cw-hours');
  for (let h = 0; h < 24; h++) {
    hours.innerHTML += `<div class="cw-hour"><span>${String(h).padStart(2, '0')}:00</span></div>`;
  }
  const days = el('div', 'cw-days');
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const col = el('div', 'cw-day');
    col.innerHTML = `<div class="cwd-head ${d.toDateString() === today.toDateString() ? 'today' : ''}"><span>${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}</span><b>${d.getDate()}</b></div>`;
    const evWrap = el('div', 'cwd-events');
    events.filter(e => sameDay(new Date(e.start), d)).forEach(ev => {
      const block = el('div', 'cwd-ev');
      const topPct = ((new Date(ev.start).getHours() * 60 + new Date(ev.start).getMinutes()) / 1440) * 100;
      const heightPct = Math.max(2.2, ((ev.end - ev.start) / 60000 / 1440) * 100);
      block.style.cssText = `top:${topPct}%;height:${heightPct}%;background:${ev.color}`;
      block.textContent = ev.title;
      block.onclick = () => viewEvent(ev);
      evWrap.appendChild(block);
    });
    col.appendChild(evWrap);
    days.appendChild(col);
  }
  wrap.append(hours, days);
  return wrap;
}

/* ---------- 日视图（24小时时间轴） ---------- */
function dayTimeline(events) {
  const wrap = el('div', 'cal-day-timeline');
  const now = new Date();
  const nowLine = sameDay(now, curDate)
    ? `<div class="cdt-now" style="top:${((now.getHours() * 60 + now.getMinutes()) / 1440) * 100}%"><i></i><span>${fmtTime(Date.now())}</span></div>` : '';
  let inner = '';
  for (let h = 0; h < 24; h++) {
    inner += `<div class="cdt-hour"><span>${String(h).padStart(2, '0')}:00</span></div>`;
  }
  events.forEach(ev => {
    const s = new Date(ev.start);
    const topPct = ((s.getHours() * 60 + s.getMinutes()) / 1440) * 100;
    const heightPct = Math.max(3, ((ev.end - ev.start) / 60000 / 1440) * 100);
    inner += `<div class="cdt-ev" data-id="${ev.id}" data-start="${ev.start}" style="top:${topPct}%;height:${heightPct}%;background:${ev.color}">
      <div>${escapeHtml(ev.title)}</div><div>${fmtTime(ev.start)}</div></div>`;
  });
  wrap.innerHTML = inner + nowLine;
  wrap.querySelectorAll('.cdt-ev').forEach(b => {
    b.onclick = async () => {
      const e = (await DB.all('events')).find(x => x.id === b.dataset.id);
      if (e) viewEvent(e);
    };
  });
  return wrap;
}

function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

/* ---------- 添加 / 查看 / 编辑事件 ---------- */
function addEvent(presetDate) {
  const base = presetDate || curDate;
  sheet({
    title: '新建事件',
    build(body, close) {
      const dstr = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      const startD = new Date(base); startD.setHours(10, 0, 0, 0);
      const endD = new Date(startD); endD.setHours(11, 0, 0, 0);
      body.innerHTML = `
        <div class="inset-card" style="margin:0">
          <div class="row"><div class="row-label" style="color:var(--text-2)">标题</div><input class="row-input" id="ev-title" placeholder="新事件"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">开始</div><input type="datetime-local" class="row-input" id="ev-start" value="${dstr(startD)}"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">结束</div><input type="datetime-local" class="row-input" id="ev-end" value="${dstr(endD)}"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">地点</div><input class="row-input" id="ev-loc" placeholder="可选"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">备注</div><input class="row-input" id="ev-note" placeholder="可选"></div>
        </div>
        <div style="font-size:13px;color:var(--text-2);padding:12px 2px 6px">颜色</div>
        <div class="color-dots" id="ev-color">${COLORS.map((c, i) => `<i style="background:${c}" data-c="${c}" class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
        <div style="font-size:13px;color:var(--text-2);padding:12px 2px 6px">重复</div>
        <div class="segmented" style="margin:0"><button data-r="none" class="on">无</button><button data-r="daily">每天</button><button data-r="weekly">每周</button><button data-r="monthly">每月</button></div>
        <div class="row" style="margin-top:8px"><div class="row-label">开始时提醒我</div><div class="switch on" id="ev-remind"></div></div>
        <div class="sheet-actions"><button class="btn-fill" id="ev-ok">保存事件</button></div>`;
      let color = COLORS[0], repeat = 'none';
      body.querySelectorAll('#ev-color i').forEach(i => i.onclick = () => {
        body.querySelectorAll('#ev-color i').forEach(x => x.classList.remove('on'));
        i.classList.add('on'); color = i.dataset.c;
      });
      body.querySelectorAll('.segmented button[data-r]').forEach(b => b.onclick = () => {
        body.querySelectorAll('.segmented button[data-r]').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); repeat = b.dataset.r;
      });
      const sw = body.querySelector('#ev-remind');
      sw.onclick = () => sw.classList.toggle('on');
      body.querySelector('#ev-ok').onclick = async () => {
        const title = body.querySelector('#ev-title').value.trim();
        const start = new Date(body.querySelector('#ev-start').value).getTime();
        const end = new Date(body.querySelector('#ev-end').value).getTime();
        if (!title) { toast('请填写标题'); return; }
        if (isNaN(start) || isNaN(end) || end < start) { toast('时间不正确'); return; }
        await DB.put('events', {
          id: uid('ev'), title, start, end,
          location: body.querySelector('#ev-loc').value.trim(),
          note: body.querySelector('#ev-note').value.trim(),
          color, repeat, remind: sw.classList.contains('on'),
        });
        close();
        renderView();
        scheduleReminders();
        await requestNotifyPermission();
        toast('事件已添加');
      };
    },
  });
}

async function viewEvent(ev) {
  const editable = await DB.get('events', ev.id);
  const v = await actionSheet([
    { text: '编辑', value: 'edit' },
    { text: '删除', value: 'del', danger: true },
  ], { title: `${ev.title} · ${fmtTime(ev.start)}` });
  if (!v) return;
  if (v === 'del') {
    await DB.del('events', ev.id);
    renderView();
    toast('已删除事件');
  }
  if (v === 'edit' && editable) editEvent(editable);
}

function editEvent(ev) {
  sheet({
    title: '编辑事件',
    build(body, close) {
      const dstr = (ts) => {
        const d = new Date(ts);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      body.innerHTML = `
        <div class="inset-card" style="margin:0">
          <div class="row"><div class="row-label" style="color:var(--text-2)">标题</div><input class="row-input" id="ev-title" value="${escapeHtml(ev.title)}"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">开始</div><input type="datetime-local" class="row-input" id="ev-start" value="${dstr(ev.start)}"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">结束</div><input type="datetime-local" class="row-input" id="ev-end" value="${dstr(ev.end)}"></div>
          <div class="row"><div class="row-label" style="color:var(--text-2)">地点</div><input class="row-input" id="ev-loc" value="${escapeHtml(ev.location || '')}"></div>
        </div>
        <div class="sheet-actions"><button class="btn-fill" id="ev-ok">保存修改</button></div>`;
      body.querySelector('#ev-ok').onclick = async () => {
        ev.title = body.querySelector('#ev-title').value.trim() || ev.title;
        ev.start = new Date(body.querySelector('#ev-start').value).getTime();
        ev.end = new Date(body.querySelector('#ev-end').value).getTime();
        ev.location = body.querySelector('#ev-loc').value.trim();
        await DB.put('events', ev);
        close(); renderView(); scheduleReminders();
        toast('已保存');
      };
    },
  });
}

/* ---------- 提醒调度 ---------- */
async function scheduleReminders() {
  clearInterval(remindTimer);
  remindTimer = setInterval(async () => {
    if (!root?.isConnected) { clearInterval(remindTimer); return; }
    const events = await DB.all('events');
    const now = Date.now();
    for (const e of events) {
      if (!e.remind) continue;
      const key = 'rem_' + e.id + '_' + e.start;
      if (window[key]) continue;
      if (now >= e.start - 30000 && now <= e.start + 60000) {
        window[key] = true;
        notify('日历提醒 📅', e.title + ' 即将开始');
        toast('📅 ' + e.title + ' 即将开始');
      }
    }
  }, 30000);
}
