'use strict';
/* Picozaca – quản lý quán ăn vặt. Dữ liệu lưu trong trình duyệt (localStorage). */

const KEY = 'picozaca_v1';
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Math.round(n || 0).toLocaleString('vi-VN') + ' ₫';
const num = n => (+(+n || 0).toFixed(2)).toLocaleString('vi-VN');
const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

/* ---------- Ngày tháng ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const vn = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MODE_NAME = { day: 'Ngày', week: 'Tuần', month: 'Tháng', year: 'Năm' };

function range(mode, anchor) {
  const d = parse(anchor), y = d.getFullYear(), m = d.getMonth();
  if (mode === 'day') return { start: anchor, end: anchor, label: `${DOW[d.getDay()]}, ${vn(anchor)}` };
  if (mode === 'week') {
    const start = addDays(anchor, -((d.getDay() + 6) % 7)), end = addDays(start, 6);
    return { start, end, label: `${vn(start).slice(0, 5)} – ${vn(end)}` };
  }
  if (mode === 'month') return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)), label: `Tháng ${m + 1}/${y}` };
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Năm ${y}` };
}
function shift(mode, anchor, dir) {
  const d = parse(anchor);
  if (mode === 'day') return addDays(anchor, dir);
  if (mode === 'week') return addDays(anchor, 7 * dir);
  if (mode === 'month') return iso(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  return iso(new Date(d.getFullYear() + dir, d.getMonth(), 1));
}

/* ---------- Dữ liệu ---------- */
const blank = () => ({ ingredients: [], products: [], sales: [], purchases: [], cash: [], adjusts: [] });
let db = load();
function load() {
  try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return blank(); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

const ing = id => db.ingredients.find(i => i.id === id);
const productCost = p => sum(p.recipe || [], r => { const i = ing(r.ingId); return i ? i.cost * r.qty : 0; });
const inRange = (start, end) => x => x.date >= start && x.date <= end;
const CAT = { food: 'Đồ ăn', drink: 'Thức uống' };
const CAT_ICON = { food: '🍢', drink: '🥤' };

function txns(start, end) {
  const ok = inRange(start, end), list = [];
  db.sales.filter(ok).forEach(s => list.push({
    kind: 'sale', id: s.id, date: s.date, ts: s.ts, type: 'in', label: 'Bán hàng',
    note: s.items.map(i => `${i.name} ×${i.qty}`).join(', '), amount: s.total
  }));
  db.purchases.filter(ok).forEach(p => list.push({
    kind: 'purchase', id: p.id, date: p.date, ts: p.ts, type: 'out', label: 'Nhập hàng',
    note: `${p.name} × ${num(p.qty)} ${p.unit || ''}`, amount: p.total
  }));
  db.cash.filter(ok).forEach(c => list.push({
    kind: 'cash', id: c.id, date: c.date, ts: c.ts, type: c.type, label: c.category, note: c.note, amount: c.amount
  }));
  return list.sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
}
function summary(start, end) {
  const t = txns(start, end), sales = db.sales.filter(inRange(start, end));
  const thu = sum(t.filter(x => x.type === 'in'), x => x.amount);
  const chi = sum(t.filter(x => x.type === 'out'), x => x.amount);
  const rev = sum(sales, s => s.total), cogs = sum(sales, s => s.costTotal);
  return { t, thu, chi, net: thu - chi, rev, cogs, gross: rev - cogs, orders: sales.length };
}
function productStats(start, end) {
  const map = new Map();
  db.products.forEach(p => map.set(p.id, { name: p.name, category: p.category, qty: 0, revenue: 0, profit: 0 }));
  db.sales.filter(inRange(start, end)).forEach(s => s.items.forEach(i => {
    if (!map.has(i.productId)) map.set(i.productId, { name: i.name, category: i.category, qty: 0, revenue: 0, profit: 0 });
    const r = map.get(i.productId);
    r.qty += i.qty; r.revenue += i.qty * i.price; r.profit += i.qty * (i.price - i.cost);
  }));
  return [...map.values()];
}

/* ---------- Trạng thái giao diện ---------- */
const ui = {
  view: 'home',
  cash: { mode: 'day', anchor: today() },
  rep: { mode: 'week', anchor: today(), cat: 'all', sort: 'qty' },
  cart: {}, posDate: today(), posCat: 'all'
};
const TITLES = { home: 'Tổng quan', pos: 'Bán hàng', stock: 'Kho nguyên liệu', menu: 'Thực đơn & giá vốn', cash: 'Thu chi', report: 'Báo cáo bán hàng', settings: 'Cài đặt & sao lưu' };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2400);
}
function render() {
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.view === ui.view));
  $('#title').textContent = TITLES[ui.view];
  $('#app').innerHTML = views[ui.view]();
}
function commit(msg) { save(); render(); if (msg) toast(msg); }

/* ---------- Hộp thoại nhập liệu ---------- */
const dlg = $('#dlg');
function field(f) {
  const attrs = `name="${f.name}" ${f.required ? 'required' : ''}`;
  let input;
  if (f.type === 'select') {
    input = `<select ${attrs}>${f.options.map(([v, l]) => `<option value="${esc(v)}" ${v === f.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else {
    const n = f.type === 'number' ? 'step="any" min="0" inputmode="decimal"' : '';
    input = `<input type="${f.type || 'text'}" ${attrs} ${n} value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}">`;
  }
  return `<label>${esc(f.label)}${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
}
function openForm({ title, fields = [], extra = '', submit = 'Lưu', onSubmit, onOpen }) {
  dlg.innerHTML = `<form class="form"><h3>${esc(title)}</h3>${fields.map(field).join('')}${extra}
    <div class="err" hidden></div>
    <div class="actions"><button type="button" class="btn" data-close>Huỷ</button><button class="btn primary">${esc(submit)}</button></div></form>`;
  const form = $('form', dlg);
  form.onsubmit = e => {
    e.preventDefault();
    const err = onSubmit(Object.fromEntries(new FormData(form)), form);
    if (err) { const box = $('.err', form); box.textContent = err; box.hidden = false; }
    else dlg.close();
  };
  $('[data-close]', form).onclick = () => dlg.close();
  if (onOpen) onOpen(form);
  dlg.showModal();
}
const f = v => parseFloat(v) || 0;

/* ---------- Thành phần dùng chung ---------- */
function periodBar(key, modes) {
  const st = ui[key], r = range(st.mode, st.anchor);
  return `<div class="pbar">
    <div class="seg">${modes.map(m => `<button class="${st.mode === m ? 'on' : ''}" data-act="pmode" data-key="${key}" data-mode="${m}">${MODE_NAME[m]}</button>`).join('')}</div>
    <div class="pnav">
      <button class="btn sm" data-act="pshift" data-key="${key}" data-dir="-1" aria-label="Kỳ trước">‹</button>
      <b>${r.label}</b>
      <button class="btn sm" data-act="pshift" data-key="${key}" data-dir="1" aria-label="Kỳ sau">›</button>
      <button class="btn sm" data-act="pnow" data-key="${key}">Hôm nay</button>
    </div></div>`;
}
function statCards(s) {
  return `<div class="grid g4" style="margin-bottom:16px">
    <div class="stat"><small>Tổng thu</small><b class="pos">${money(s.thu)}</b><em>${s.orders} đơn bán</em></div>
    <div class="stat"><small>Tổng chi</small><b class="neg">${money(s.chi)}</b><em>Nhập hàng + chi phí khác</em></div>
    <div class="stat"><small>Còn lại (thu − chi)</small><b class="${s.net >= 0 ? 'pos' : 'neg'}">${money(s.net)}</b><em>Dòng tiền thực tế</em></div>
    <div class="stat"><small>Lãi gộp bán hàng</small><b>${money(s.gross)}</b><em>Doanh thu − giá vốn món</em></div>
  </div>`;
}
function chart(mode, r) {
  if (mode === 'day') return '';
  let cols = [];
  if (mode === 'year') {
    const y = r.start.slice(0, 4);
    for (let m = 1; m <= 12; m++) cols.push({ label: 'T' + m, start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-31` });
  } else {
    for (let d = r.start; d <= r.end; d = addDays(d, 1))
      cols.push({ label: mode === 'week' ? DOW[parse(d).getDay()] : String(+d.slice(8)), start: d, end: d });
  }
  cols.forEach(c => { const s = summary(c.start, c.end); c.thu = s.thu; c.chi = s.chi; });
  const max = Math.max(1, ...cols.map(c => Math.max(c.thu, c.chi)));
  return `<div class="card"><div class="card-h"><h2>Biểu đồ thu chi</h2>
    <div class="legend"><span><i style="background:var(--in)"></i>Thu</span><span><i style="background:#f87171"></i>Chi</span></div></div>
    <div class="chart">${cols.map(c => `<div class="col" title="${c.label}: thu ${money(c.thu)} · chi ${money(c.chi)}">
      <div class="bars"><div class="bar i" style="height:${c.thu / max * 100}%"></div><div class="bar o" style="height:${c.chi / max * 100}%"></div></div>
      <span>${c.label}</span></div>`).join('')}</div></div>`;
}
const emptyBox = (icon, text, btn = '') => `<div class="empty"><b>${icon}</b>${text}${btn ? `<div style="margin-top:12px">${btn}</div>` : ''}</div>`;
function stockTag(i) {
  if (i.stock <= 0) return '<span class="tag out">Hết hàng</span>';
  if (i.stock <= i.min) return '<span class="tag low">Sắp hết</span>';
  return '<span class="tag ok">Đủ</span>';
}

/* ---------- Các màn hình ---------- */
const views = {
  home() {
    if (!db.products.length && !db.ingredients.length) {
      return `<div class="card">${emptyBox('👋', `<h2 style="color:var(--ink)">Chào mừng đến với Picozaca!</h2>
        <p>Bắt đầu theo 3 bước:<br>1. Vào <b style="display:inline;font-size:inherit">Kho</b> thêm nguyên liệu và nhập hàng<br>
        2. Vào <b style="display:inline;font-size:inherit">Thực đơn</b> tạo món và công thức để tính giá vốn<br>
        3. Vào <b style="display:inline;font-size:inherit">Bán hàng</b> để ghi đơn mỗi ngày</p>`,
        `<div class="row" style="justify-content:center"><button class="btn primary" data-view="stock">Thêm nguyên liệu đầu tiên</button>
        <button class="btn" data-act="sample">Xem thử với dữ liệu mẫu</button></div>`)}</div>`;
    }
    const t = today(), d = summary(t, t), w = range('week', t), ws = summary(w.start, w.end);
    const low = db.ingredients.filter(i => i.stock <= i.min);
    const top = productStats(w.start, w.end).filter(p => p.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 5);
    return `<div class="grid g4" style="margin-bottom:16px">
        <div class="stat"><small>Thu hôm nay</small><b class="pos">${money(d.thu)}</b><em>${d.orders} đơn bán</em></div>
        <div class="stat"><small>Chi hôm nay</small><b class="neg">${money(d.chi)}</b><em>&nbsp;</em></div>
        <div class="stat"><small>Thu tuần này</small><b class="pos">${money(ws.thu)}</b><em>${w.label}</em></div>
        <div class="stat"><small>Còn lại tuần này</small><b class="${ws.net >= 0 ? 'pos' : 'neg'}">${money(ws.net)}</b><em>Chi ${money(ws.chi)}</em></div>
      </div>
      <div class="row" style="margin-bottom:16px">
        <button class="btn primary" data-view="pos">🛒 Bán hàng</button>
        <button class="btn" data-act="addCash" data-type="out">＋ Ghi khoản chi</button>
        <button class="btn" data-view="report">📊 Báo cáo tuần</button>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h2>⚠️ Cảnh báo kho</h2><button class="btn sm" data-view="stock">Xem kho</button></div>
          ${low.length ? `<table>${low.map(i => `<tr><td>${esc(i.name)}</td><td class="n">${num(i.stock)} ${esc(i.unit)}</td><td class="n">${stockTag(i)}</td></tr>`).join('')}</table>`
        : emptyBox('✅', 'Tất cả nguyên liệu đều đủ hàng')}</div>
        <div class="card"><div class="card-h"><h2>🔥 Bán chạy tuần này</h2></div>
          ${top.length ? `<table>${top.map((p, i) => `<tr><td>${i + 1}. ${esc(p.name)}</td><td class="n">${num(p.qty)} phần</td><td class="n">${money(p.revenue)}</td></tr>`).join('')}</table>`
        : emptyBox('🍽️', 'Tuần này chưa có đơn bán nào')}</div>
      </div>`;
  },

  pos() {
    if (!db.products.length) return `<div class="card">${emptyBox('🍟', 'Chưa có món nào trong thực đơn', '<button class="btn primary" data-view="menu">Tạo món đầu tiên</button>')}</div>`;
    const list = db.products.filter(p => ui.posCat === 'all' || p.category === ui.posCat);
    const items = Object.entries(ui.cart).map(([id, qty]) => ({ p: db.products.find(x => x.id === id), qty })).filter(x => x.p);
    const total = sum(items, x => x.p.price * x.qty);
    return `<div class="pos-wrap"><div>
        <div class="row" style="margin-bottom:12px"><div class="seg">
          ${[['all', 'Tất cả'], ['food', '🍢 Đồ ăn'], ['drink', '🥤 Thức uống']].map(([k, l]) => `<button class="${ui.posCat === k ? 'on' : ''}" data-act="posCat" data-cat="${k}">${l}</button>`).join('')}
        </div></div>
        <div class="pgrid">${list.map(p => `<button class="pcard" data-act="cartAdd" data-id="${p.id}">
          ${ui.cart[p.id] ? `<span class="badge">${ui.cart[p.id]}</span>` : ''}
          <span class="em">${CAT_ICON[p.category]}</span><b>${esc(p.name)}</b><small>${money(p.price)}</small></button>`).join('')}</div>
      </div>
      <div class="card cart"><div class="card-h"><h2>Đơn hàng</h2>
          <input type="date" class="in-date" value="${ui.posDate}" max="${today()}" data-change="posDate" title="Ngày bán"></div>
        ${items.length ? items.map(x => `<div class="citem"><div class="nm"><b>${esc(x.p.name)}</b><div class="mut">${money(x.p.price * x.qty)}</div></div>
          <div class="qty"><button data-act="cartSub" data-id="${x.p.id}" aria-label="Bớt">−</button><b>${x.qty}</b><button data-act="cartAdd" data-id="${x.p.id}" aria-label="Thêm">+</button></div></div>`).join('')
        + `<div class="total"><span>Tổng</span><span>${money(total)}</span></div>
          <button class="btn primary big" data-act="checkout">Thanh toán</button>
          <button class="btn big" style="margin-top:8px" data-act="cartClear">Xoá đơn</button>`
        : '<div class="mut" style="padding:8px 0">Chạm vào món để thêm vào đơn</div>'}
      </div></div>`;
  },

  stock() {
    const value = sum(db.ingredients, i => Math.max(i.stock, 0) * i.cost);
    const hist = [
      ...db.purchases.map(p => ({ date: p.date, ts: p.ts, name: p.name, text: `Nhập +${num(p.qty)} ${p.unit || ''}`, amount: money(p.total) })),
      ...db.adjusts.map(a => ({ date: a.date, ts: a.ts, name: a.name, text: `Kiểm kê ${a.diff >= 0 ? '+' : ''}${num(a.diff)} ${a.unit || ''}`, amount: a.diff < 0 ? `Hao hụt ${money(-a.diff * a.cost)}` : '' }))
    ].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).slice(0, 30);
    return `<div class="card"><div class="card-h"><div><h2>Nguyên liệu trong kho</h2><span class="mut">Giá trị tồn kho: <b>${money(value)}</b></span></div>
        <button class="btn primary" data-act="editIng">＋ Thêm nguyên liệu</button></div>
      ${db.ingredients.length ? `<div class="tbl-wrap"><table><thead><tr><th>Tên</th><th class="n">Tồn kho</th><th class="n hide-m">Giá vốn / đơn vị</th><th>Trạng thái</th><th></th></tr></thead><tbody>
        ${db.ingredients.map(i => `<tr><td><b>${esc(i.name)}</b><span class="sub">Báo khi còn ≤ ${num(i.min)} ${esc(i.unit)}</span></td>
          <td class="n"><b>${num(i.stock)}</b> ${esc(i.unit)}</td><td class="n hide-m">${money(i.cost)}</td><td>${stockTag(i)}</td>
          <td class="n"><div class="row" style="justify-content:flex-end">
            <button class="btn sm primary" data-act="buy" data-id="${i.id}">Nhập hàng</button>
            <button class="btn sm" data-act="count" data-id="${i.id}">Kiểm kê</button>
            <button class="icon-btn" data-act="editIng" data-id="${i.id}" title="Sửa">✏️</button>
            <button class="icon-btn" data-act="delIng" data-id="${i.id}" title="Xoá">🗑️</button></div></td></tr>`).join('')}
      </tbody></table></div>` : emptyBox('📦', 'Chưa có nguyên liệu. Thêm những thứ bạn mua về để làm món (bánh tráng, xúc xích, trà, ly nhựa…)')}</div>
      <div class="card"><div class="card-h"><h2>Lịch sử kho gần đây</h2></div>
      ${hist.length ? `<div class="tbl-wrap"><table>${hist.map(h => `<tr><td class="mut">${vn(h.date)}</td><td>${esc(h.name)}</td><td>${esc(h.text)}</td><td class="n">${h.amount}</td></tr>`).join('')}</table></div>`
        : emptyBox('🧾', 'Chưa có lần nhập hàng hay kiểm kê nào')}</div>`;
  },

  menu() {
    return `<div class="card"><div class="card-h"><div><h2>Món ăn & thức uống</h2><span class="mut">Giá vốn được tính tự động từ công thức và giá nguyên liệu</span></div>
        <button class="btn primary" data-act="editProd">＋ Thêm món</button></div>
      ${db.products.length ? `<div class="tbl-wrap"><table><thead><tr><th>Món</th><th class="n">Giá bán</th><th class="n">Giá vốn</th><th class="n">Lãi / phần</th><th class="n hide-m">Tỷ lệ lãi</th><th></th></tr></thead><tbody>
        ${db.products.map(p => {
      const c = productCost(p), profit = p.price - c, pct = p.price ? profit / p.price * 100 : 0;
      return `<tr><td><b>${esc(p.name)}</b><span class="sub"><span class="tag cat">${CAT_ICON[p.category]} ${CAT[p.category]}</span> ${(p.recipe || []).length ? `${p.recipe.length} nguyên liệu` : 'Chưa có công thức'}</span></td>
          <td class="n">${money(p.price)}</td><td class="n">${money(c)}</td><td class="n ${profit >= 0 ? 'pos' : 'neg'}"><b>${money(profit)}</b></td><td class="n hide-m">${pct.toFixed(0)}%</td>
          <td class="n"><button class="icon-btn" data-act="editProd" data-id="${p.id}" title="Sửa">✏️</button><button class="icon-btn" data-act="delProd" data-id="${p.id}" title="Xoá">🗑️</button></td></tr>`;
    }).join('')}</tbody></table></div>` : emptyBox('🍟', 'Chưa có món nào. Thêm món và công thức để biết mỗi phần lãi bao nhiêu.')}</div>`;
  },

  cash() {
    const st = ui.cash, r = range(st.mode, st.anchor), s = summary(r.start, r.end);
    return periodBar('cash', ['day', 'week', 'month', 'year']) + statCards(s) + chart(st.mode, r) +
      `<div class="card"><div class="card-h"><h2>Các khoản thu chi</h2><div class="row">
        <button class="btn sm" data-act="addCash" data-type="in">＋ Khoản thu khác</button>
        <button class="btn sm primary" data-act="addCash" data-type="out">＋ Khoản chi</button></div></div>
      ${s.t.length ? `<div class="tbl-wrap"><table>${s.t.map(x => `<tr><td class="mut" style="white-space:nowrap">${vn(x.date).slice(0, 5)}</td>
        <td><b>${esc(x.label)}</b><span class="sub">${esc(x.note || '')}</span></td>
        <td class="n ${x.type === 'in' ? 'pos' : 'neg'}"><b>${x.type === 'in' ? '+' : '−'}${money(x.amount)}</b></td>
        <td class="n"><button class="icon-btn" data-act="delTxn" data-kind="${x.kind}" data-id="${x.id}" title="Xoá">🗑️</button></td></tr>`).join('')}</table></div>`
        : emptyBox('💸', 'Chưa có khoản thu chi nào trong kỳ này')}</div>`;
  },

  report() {
    const st = ui.rep, r = range(st.mode, st.anchor);
    const all = productStats(r.start, r.end).filter(p => st.cat === 'all' || p.category === st.cat);
    const by = k => [...all].sort((a, b) => b[k] - a[k]);
    const box = (title, icon, list, k) => `<div class="card" style="margin:0"><div class="card-h"><h2>${icon} ${title}</h2></div>
      ${list.length ? `<table>${list.map((p, i) => `<tr><td>${i + 1}. ${esc(p.name)}</td><td class="n"><b>${k === 'qty' ? num(p.qty) + ' phần' : money(p.revenue)}</b></td></tr>`).join('')}</table>` : '<span class="mut">Chưa có món</span>'}</div>`;
    const sorted = by(st.sort), max = Math.max(1, ...all.map(p => p[st.sort]));
    const tq = sum(all, p => p.qty), tr = sum(all, p => p.revenue), tp = sum(all, p => p.profit);
    return periodBar('rep', ['week', 'month', 'year']) +
      `<div class="row" style="margin-bottom:14px"><div class="seg">${[['all', 'Tất cả'], ['food', '🍢 Đồ ăn'], ['drink', '🥤 Thức uống']].map(([k, l]) =>
        `<button class="${st.cat === k ? 'on' : ''}" data-act="repSet" data-k="cat" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="stat"><small>Số phần đã bán</small><b>${num(tq)}</b></div>
        <div class="stat"><small>Doanh thu</small><b class="pos">${money(tr)}</b></div>
        <div class="stat"><small>Lãi gộp</small><b>${money(tp)}</b></div>
      </div>
      ${all.length ? `<div class="grid g2" style="margin-bottom:16px">
        ${box('Bán được nhiều nhất', '🏆', by('qty').slice(0, 3), 'qty')}
        ${box('Bán được ít nhất', '🐢', by('qty').reverse().slice(0, 3), 'qty')}
        ${box('Doanh thu cao nhất', '💰', by('revenue').slice(0, 3), 'revenue')}
        ${box('Doanh thu thấp nhất', '📉', by('revenue').reverse().slice(0, 3), 'revenue')}
      </div>
      <div class="card"><div class="card-h"><h2>Bảng xếp hạng tất cả món</h2><div class="seg">
          <button class="${st.sort === 'qty' ? 'on' : ''}" data-act="repSet" data-k="sort" data-v="qty">Theo số lượng</button>
          <button class="${st.sort === 'revenue' ? 'on' : ''}" data-act="repSet" data-k="sort" data-v="revenue">Theo doanh thu</button></div></div>
        <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Món</th><th class="hide-m"></th><th class="n">Số lượng</th><th class="n">Doanh thu</th><th class="n hide-m">Lãi gộp</th></tr></thead><tbody>
        ${sorted.map((p, i) => `<tr><td>${i + 1}</td><td><b>${esc(p.name)}</b><span class="sub">${CAT_ICON[p.category] || ''} ${CAT[p.category] || ''}</span></td>
          <td class="hide-m" style="width:30%"><div class="hbar"><i style="width:${p[st.sort] / max * 100}%"></i></div></td>
          <td class="n">${num(p.qty)}</td><td class="n">${money(p.revenue)}</td><td class="n hide-m">${money(p.profit)}</td></tr>`).join('')}
        </tbody></table></div></div>` : `<div class="card">${emptyBox('📊', 'Chưa có món nào để thống kê')}</div>`}`;
  },

  settings() {
    return `<div class="card"><h2>Sao lưu dữ liệu</h2>
        <p class="mut">Dữ liệu được lưu ngay trên trình duyệt của thiết bị này. Hãy tải bản sao lưu thường xuyên (ví dụ mỗi tuần) để không mất dữ liệu khi đổi máy hoặc xoá lịch sử trình duyệt.</p>
        <div class="row"><button class="btn primary" data-act="export">⬇️ Tải bản sao lưu</button>
        <button class="btn" data-act="import">⬆️ Khôi phục từ file</button></div></div>
      <div class="card"><h2>Dữ liệu mẫu</h2><p class="mut">Nạp một quán mẫu với nguyên liệu, món và 2 tuần bán hàng để xem thử các tính năng.</p>
        <button class="btn" data-act="sample">Nạp dữ liệu mẫu</button></div>
      <div class="card"><h2>Xoá toàn bộ dữ liệu</h2><p class="mut">Xoá hết nguyên liệu, món, đơn bán và thu chi. Không thể hoàn tác.</p>
        <button class="btn danger" data-act="wipe">Xoá toàn bộ</button></div>`;
  }
};

/* ---------- Hành động ---------- */
const actions = {
  pmode({ key, mode }) { ui[key].mode = mode; render(); },
  pshift({ key, dir }) { ui[key].anchor = shift(ui[key].mode, ui[key].anchor, +dir); render(); },
  pnow({ key }) { ui[key].anchor = today(); render(); },
  repSet({ k, v }) { ui.rep[k] = v; render(); },
  posCat({ cat }) { ui.posCat = cat; render(); },

  cartAdd({ id }) { ui.cart[id] = (ui.cart[id] || 0) + 1; render(); },
  cartSub({ id }) { if (--ui.cart[id] <= 0) delete ui.cart[id]; render(); },
  cartClear() { ui.cart = {}; render(); },
  checkout() {
    const items = [], used = {};
    for (const [id, qty] of Object.entries(ui.cart)) {
      const p = db.products.find(x => x.id === id); if (!p) continue;
      items.push({ productId: p.id, name: p.name, category: p.category, qty, price: p.price, cost: productCost(p) });
      (p.recipe || []).forEach(r => { used[r.ingId] = (used[r.ingId] || 0) + r.qty * qty; });
    }
    if (!items.length) return;
    const short = [];
    for (const [id, q] of Object.entries(used)) { const i = ing(id); if (i) { i.stock -= q; if (i.stock < 0) short.push(i.name); } }
    const total = sum(items, i => i.qty * i.price);
    db.sales.push({
      id: uid(), ts: Date.now(), date: ui.posDate, items, total, costTotal: sum(items, i => i.qty * i.cost),
      used: Object.entries(used).map(([ingId, qty]) => ({ ingId, qty }))
    });
    ui.cart = {};
    commit(short.length ? `Đã lưu đơn ${money(total)}. Kho bị âm: ${short.join(', ')} – hãy kiểm kê lại` : `Đã lưu đơn ${money(total)}`);
  },

  editIng({ id }) {
    const i = id ? ing(id) : null;
    openForm({
      title: i ? 'Sửa nguyên liệu' : 'Thêm nguyên liệu',
      fields: [
        { name: 'name', label: 'Tên nguyên liệu', value: i?.name, required: true, placeholder: 'VD: Xúc xích' },
        { name: 'unit', label: 'Đơn vị tính', value: i?.unit, required: true, placeholder: 'VD: cây, g, ml, cái', hint: 'Dùng đơn vị nhỏ mà công thức món sẽ dùng (g thay vì kg, ml thay vì lít)' },
        { name: 'min', label: 'Báo sắp hết khi tồn kho còn', type: 'number', value: i?.min ?? 0 },
        ...(i ? [{ name: 'cost', label: 'Giá vốn mỗi đơn vị (₫)', type: 'number', value: i.cost, hint: 'Tự cập nhật theo giá trung bình mỗi lần nhập hàng' }] : [])
      ],
      onSubmit(d) {
        if (i) Object.assign(i, { name: d.name.trim(), unit: d.unit.trim(), min: f(d.min), cost: f(d.cost) });
        else db.ingredients.push({ id: uid(), name: d.name.trim(), unit: d.unit.trim(), min: f(d.min), stock: 0, cost: 0 });
        commit(i ? 'Đã lưu' : 'Đã thêm. Bấm "Nhập hàng" để ghi số lượng và giá mua');
      }
    });
  },
  delIng({ id }) {
    const i = ing(id), usedBy = db.products.filter(p => (p.recipe || []).some(r => r.ingId === id)).map(p => p.name);
    if (!confirm(`Xoá nguyên liệu "${i.name}"?` + (usedBy.length ? `\nĐang dùng trong: ${usedBy.join(', ')} (sẽ bị gỡ khỏi công thức).` : ''))) return;
    db.ingredients = db.ingredients.filter(x => x.id !== id);
    db.products.forEach(p => { p.recipe = (p.recipe || []).filter(r => r.ingId !== id); });
    commit('Đã xoá');
  },
  buy({ id }) {
    const i = ing(id);
    openForm({
      title: `Nhập hàng: ${i.name}`, submit: 'Nhập kho',
      fields: [
        { name: 'qty', label: `Số lượng nhập (${i.unit})`, type: 'number', required: true },
        { name: 'total', label: 'Tổng tiền đã trả (₫)', type: 'number', required: true, hint: 'Sẽ được ghi vào khoản chi của ngày nhập' },
        { name: 'date', label: 'Ngày nhập', type: 'date', value: today(), required: true }
      ],
      onSubmit(d) {
        const qty = f(d.qty), total = f(d.total);
        if (qty <= 0) return 'Số lượng phải lớn hơn 0';
        const have = Math.max(i.stock, 0);
        i.cost = (have * i.cost + total) / (have + qty);
        i.stock += qty;
        db.purchases.push({ id: uid(), ts: Date.now(), date: d.date, ingId: i.id, name: i.name, unit: i.unit, qty, total });
        commit(`Đã nhập ${num(qty)} ${i.unit} ${i.name}`);
      }
    });
  },
  count({ id }) {
    const i = ing(id);
    openForm({
      title: `Kiểm kê: ${i.name}`, submit: 'Cập nhật tồn kho',
      fields: [{ name: 'actual', label: `Số lượng thực tế đếm được (${i.unit})`, type: 'number', value: i.stock, required: true, hint: `Trên sổ đang ghi: ${num(i.stock)} ${i.unit}` }],
      onSubmit(d) {
        const diff = f(d.actual) - i.stock;
        if (diff) db.adjusts.push({ id: uid(), ts: Date.now(), date: today(), ingId: i.id, name: i.name, unit: i.unit, diff, cost: i.cost });
        i.stock = f(d.actual);
        commit(diff < 0 ? `Hao hụt ${num(-diff)} ${i.unit} (${money(-diff * i.cost)})` : 'Đã cập nhật tồn kho');
      }
    });
  },

  editProd({ id }) {
    const p = id ? db.products.find(x => x.id === id) : null;
    const row = (r = {}) => `<div class="rrow"><select class="r-ing">${db.ingredients.map(i => `<option value="${i.id}" ${i.id === r.ingId ? 'selected' : ''}>${esc(i.name)} (${esc(i.unit)})</option>`).join('')}</select>
      <input class="r-qty" type="number" step="any" min="0" inputmode="decimal" placeholder="Số lượng" value="${r.qty ?? ''}"><button type="button" class="icon-btn" data-rm aria-label="Bỏ">✕</button></div>`;
    const readRows = form => [...form.querySelectorAll('.rrow')].map(el => ({ ingId: $('.r-ing', el).value, qty: f($('.r-qty', el).value) })).filter(r => r.qty > 0);
    openForm({
      title: p ? 'Sửa món' : 'Thêm món',
      fields: [
        { name: 'name', label: 'Tên món', value: p?.name, required: true, placeholder: 'VD: Trà sữa trân châu' },
        { name: 'category', label: 'Loại', type: 'select', value: p?.category || 'food', options: [['food', '🍢 Đồ ăn'], ['drink', '🥤 Thức uống']] },
        { name: 'price', label: 'Giá bán (₫)', type: 'number', value: p?.price, required: true }
      ],
      extra: `<div><b style="font-size:14px">Công thức cho 1 phần</b>
        ${db.ingredients.length ? `<div class="rows" style="margin-top:6px">${(p?.recipe || []).map(row).join('')}</div>
        <button type="button" class="btn sm" data-addrow>＋ Thêm nguyên liệu</button>` : '<div class="mut">Chưa có nguyên liệu trong kho – hãy thêm ở mục Kho trước để tính được giá vốn.</div>'}</div>
        <div class="costbox"></div>`,
      onOpen(form) {
        const recalc = () => {
          const cost = productCost({ recipe: readRows(form) }), price = f(form.price.value), profit = price - cost;
          $('.costbox', form).innerHTML = `Giá vốn: <b>${money(cost)}</b> · Lãi mỗi phần: <b class="${profit >= 0 ? 'pos' : 'neg'}">${money(profit)}</b>${price ? ` (${(profit / price * 100).toFixed(0)}%)` : ''}`;
        };
        form.addEventListener('input', recalc);
        form.addEventListener('click', e => {
          if (e.target.closest('[data-addrow]')) $('.rows', form).insertAdjacentHTML('beforeend', row());
          if (e.target.closest('[data-rm]')) { e.target.closest('.rrow').remove(); recalc(); }
        });
        recalc();
      },
      onSubmit(d, form) {
        const data = { name: d.name.trim(), category: d.category, price: f(d.price), recipe: readRows(form) };
        if (p) Object.assign(p, data); else db.products.push({ id: uid(), ...data });
        commit('Đã lưu món');
      }
    });
  },
  delProd({ id }) {
    const p = db.products.find(x => x.id === id);
    if (!confirm(`Xoá món "${p.name}"? Các đơn đã bán vẫn được giữ trong báo cáo.`)) return;
    db.products = db.products.filter(x => x.id !== id); delete ui.cart[id];
    commit('Đã xoá');
  },

  addCash({ type }) {
    const cats = type === 'out' ? ['Tiền thuê mặt bằng', 'Điện nước', 'Lương nhân viên', 'Dụng cụ, vật dụng', 'Chi khác'] : ['Thu khác'];
    openForm({
      title: type === 'out' ? 'Ghi khoản chi' : 'Ghi khoản thu khác',
      fields: [
        { name: 'category', label: 'Loại', type: 'select', value: cats[0], options: cats.map(c => [c, c]) },
        { name: 'amount', label: 'Số tiền (₫)', type: 'number', required: true },
        { name: 'note', label: 'Ghi chú', placeholder: 'Không bắt buộc' },
        { name: 'date', label: 'Ngày', type: 'date', value: today(), required: true }
      ],
      onSubmit(d) {
        if (f(d.amount) <= 0) return 'Số tiền phải lớn hơn 0';
        db.cash.push({ id: uid(), ts: Date.now(), date: d.date, type, category: d.category, note: d.note.trim(), amount: f(d.amount) });
        commit('Đã ghi');
      }
    });
  },
  delTxn({ kind, id }) {
    if (kind === 'sale') {
      if (!confirm('Xoá đơn bán này? Nguyên liệu sẽ được trả lại kho.')) return;
      const s = db.sales.find(x => x.id === id);
      (s.used || []).forEach(u => { const i = ing(u.ingId); if (i) i.stock += u.qty; });
      db.sales = db.sales.filter(x => x.id !== id);
    } else if (kind === 'purchase') {
      if (!confirm('Xoá lần nhập hàng này? Số lượng sẽ bị trừ khỏi kho.')) return;
      const p = db.purchases.find(x => x.id === id), i = ing(p.ingId);
      if (i) i.stock -= p.qty;
      db.purchases = db.purchases.filter(x => x.id !== id);
    } else {
      if (!confirm('Xoá khoản này?')) return;
      db.cash = db.cash.filter(x => x.id !== id);
    }
    commit('Đã xoá');
  },

  export() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }));
    a.download = `picozaca-saoluu-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
  },
  import() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try {
        const data = JSON.parse(await inp.files[0].text());
        if (!Array.isArray(data.ingredients) || !Array.isArray(data.products) || !Array.isArray(data.sales)) throw 0;
        if (!confirm('Thay toàn bộ dữ liệu hiện tại bằng bản sao lưu này?')) return;
        db = Object.assign(blank(), data); commit('Đã khôi phục dữ liệu');
      } catch { alert('File không hợp lệ. Hãy chọn file sao lưu của Picozaca.'); }
    };
    inp.click();
  },
  wipe() {
    if (!confirm('Xoá TOÀN BỘ dữ liệu? Không thể hoàn tác.')) return;
    db = blank(); ui.cart = {}; commit('Đã xoá toàn bộ dữ liệu');
  },
  sample() {
    const has = db.products.length || db.ingredients.length || db.sales.length;
    if (has && !confirm('Dữ liệu hiện tại sẽ bị thay bằng dữ liệu mẫu. Tiếp tục?')) return;
    db = sampleData(); ui.cart = {}; ui.view = 'home'; commit('Đã nạp dữ liệu mẫu');
  }
};

function sampleData() {
  const d = blank(), t = today();
  const I = (name, unit, stock, cost, min) => { const o = { id: uid(), name, unit, stock, cost, min }; d.ingredients.push(o); return o; };
  const P = (name, category, price, recipe, pop) => { const o = { id: uid(), name, category, price, recipe: recipe.map(([i, qty]) => ({ ingId: i.id, qty })) }; d.products.push(o); o._pop = pop; return o; };
  const banh = I('Bánh tráng', 'g', 1800, 60, 500), xx = I('Xúc xích', 'cây', 12, 4500, 15), cv = I('Cá viên', 'viên', 240, 900, 80);
  const khoai = I('Khoai tây', 'g', 3500, 28, 1000), dau = I('Dầu ăn', 'ml', 2600, 38, 800), tra = I('Trà', 'g', 420, 180, 100);
  const sua = I('Sữa đặc', 'ml', 900, 75, 300), tc = I('Trân châu', 'g', 0, 55, 300), ly = I('Ly nhựa + ống hút', 'cái', 130, 700, 50), chanh = I('Chanh', 'quả', 35, 1500, 10);
  P('Bánh tráng trộn', 'food', 20000, [[banh, 80]], 9); P('Xúc xích chiên', 'food', 12000, [[xx, 1], [dau, 15]], 7);
  P('Cá viên chiên', 'food', 15000, [[cv, 8], [dau, 20]], 8); P('Khoai tây chiên', 'food', 25000, [[khoai, 200], [dau, 30]], 4);
  P('Trà sữa trân châu', 'drink', 22000, [[tra, 8], [sua, 40], [tc, 50], [ly, 1]], 10); P('Trà chanh', 'drink', 12000, [[tra, 5], [chanh, 1], [ly, 1]], 6);
  P('Trà đào', 'drink', 18000, [[tra, 6], [ly, 1]], 2);
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let k = 13; k >= 0; k--) {
    const date = addDays(t, -k);
    const items = d.products.map(p => ({ productId: p.id, name: p.name, category: p.category, qty: Math.floor(rnd() * p._pop * 1.6), price: p.price, cost: sum(p.recipe, r => d.ingredients.find(i => i.id === r.ingId).cost * r.qty) })).filter(i => i.qty > 0);
    d.sales.push({ id: uid(), ts: Date.now() - k * 864e5, date, items, total: sum(items, i => i.qty * i.price), costTotal: sum(items, i => i.qty * i.cost), used: [] });
    if (k % 4 === 0) d.purchases.push({ id: uid(), ts: Date.now() - k * 864e5, date, ingId: xx.id, name: xx.name, unit: xx.unit, qty: 50, total: 225000 });
    if (k % 5 === 0) d.purchases.push({ id: uid(), ts: Date.now() - k * 864e5, date, ingId: tra.id, name: tra.name, unit: tra.unit, qty: 500, total: 90000 });
  }
  d.cash.push({ id: uid(), ts: Date.now(), date: addDays(t, -6), type: 'out', category: 'Điện nước', note: 'Tiền điện tháng', amount: 450000 });
  d.cash.push({ id: uid(), ts: Date.now(), date: addDays(t, -10), type: 'out', category: 'Tiền thuê mặt bằng', note: '', amount: 1500000 });
  d.products.forEach(p => delete p._pop);
  return d;
}

/* ---------- Sự kiện ---------- */
document.addEventListener('click', e => {
  const v = e.target.closest('[data-view]');
  if (v) { ui.view = v.dataset.view; render(); window.scrollTo(0, 0); return; }
  const a = e.target.closest('[data-act]');
  if (a && actions[a.dataset.act]) actions[a.dataset.act](a.dataset);
});
document.addEventListener('change', e => {
  if (e.target.dataset.change === 'posDate') ui.posDate = e.target.value || today();
});
render();
