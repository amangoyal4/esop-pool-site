// Guardian's ESOP Pool - shared state, formatting, tables, router, drawers, account menu.
// Pages register themselves in ROUTES (review.js, pool.js, company.js, clients.js).
'use strict';
let S = null;                                   // /api/state
const ROUTES = {};                              // name -> {view(arg) -> html, after(arg), nav}
const CACHE = {hist: {}, news: {}, brief: null, briefWeek: null, briefs: null, sparks: {}, pool: {}, vh: {}};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const EDGE_WS = /^\s+|\s+$/g;                // leading / trailing whitespace
const isNum = v => typeof v === 'number' && isFinite(v);
const sum = (arr, f = x => x) => { let t = 0; for(const x of arr){ const v = f(x); if(isNum(v)) t += v; } return t; };
const evEl = e => e.composedPath()[0];          // the element an event started on

// ---------------------------------------------------------------- formatting
const fmtN = (v, d = 2) => isNum(v) ? v.toLocaleString('en-IN', {minimumFractionDigits: d, maximumFractionDigits: d}) : '–';
const fmtCr = (v, d = 2) => isNum(v) ? '₹ ' + fmtN(v, d) + ' cr' : '–';
const fmtPct = (v, d = 1, sign = false) => isNum(v) ? ((sign && v > 0) ? '+' : (v < 0 ? '−' : '')) + Math.abs(v * 100).toFixed(d) + '%' : '–';
const fmtX = (v, d = 2) => isNum(v) ? fmtN(v, d) + 'x' : '–';
const cls = v => !isNum(v) ? 'mut' : v > 0.0005 ? 'pos' : v < -0.0005 ? 'neg' : '';
const ccySym = ccy => ccy === 'USD' ? '$' : ccy === 'INR' ? '₹' : (ccy ? ccy + ' ' : '');
const fmtPx = (v, ccy) => isNum(v) ? ccySym(ccy) + ' ' + fmtN(v, 2) : '–';
const signedCr = (v, d = 2) => isNum(v) ? (v >= 0 ? '+' : '−') + fmtCr(Math.abs(v), d) : '–';
const signed = (v, d = 2) => isNum(v) ? (v >= 0 ? '+' : '−') + fmtN(Math.abs(v), d) : '–';
const pts = v => isNum(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + ' pts' : '–';
// Re-val / De-val = normalized / current - 1: positive = below normalized (re-rating room), negative = above it
const reval = (v, d = 0) => isNum(v) ? `<span class="${cls(v)}">${fmtPct(v, d, true)}</span>` : '<span class="mut">–</span>';
function fmtMcap(c){
  const lv = c.live; if(!isNum(lv.mcap)) return '–';
  if(lv.currency === 'USD'){ const bn = lv.mcap / 1e9; return bn >= 1000 ? '$ ' + fmtN(bn / 1000, 2) + ' tn' : '$ ' + fmtN(bn, 1) + ' bn'; }
  const cr = lv.mcap / 1e7; return cr >= 1e5 ? '₹ ' + fmtN(cr / 1e5, 2) + ' lakh cr' : '₹ ' + fmtN(cr, 0) + ' cr';
}
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dLong = iso => { if(!iso) return '–'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const dShort = iso => iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}) : '–';
const dDay = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {weekday: 'short', day: '2-digit', month: 'short'}) : '–';
const dTime = iso => iso ? new Date(iso).toLocaleString('en-IN', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}) : '–';
const comp = key => S.companies.find(c => c.key === key);
const client = id => S.clients.find(c => c.id === id);
const multLabel = l => l === 'PR' ? 'P/S' : l === 'PE' ? 'P/E' : l;
const OUTLOOK_CLS = {Improving: 'pos', Stable: 'lab', Softening: 'neg'};
const outlookTag = o => o && o.value ? `<span class="otag ${OUTLOOK_CLS[o.value] || ''}">${esc(o.value)}</span>` : '<span class="mut">Not set</span>';
const impactTag = i => i ? `<span class="itag ${esc(i)}">${esc(i === 'mixed' ? 'Mixed for earnings' : i === 'positive' ? 'Positive for earnings' : 'Negative for earnings')}</span>` : '';
function toast(msg, ms = 2800){ const t = $('#toast'); t.textContent = msg; t.classList.toggle('show', true); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.toggle('show', false), ms); }

async function api(path, opts = {}){
  if(window.SITE){   // the published read-only link: every response comes from the encrypted snapshot
    if(opts.method && opts.method !== 'GET') throw new Error('This is the read-only link. Make changes in the desk app.');
    return SITE.get(path);
  }
  const r = await fetch(path, {headers: {'Content-Type': 'application/json'}, ...opts});
  if(r.status === 401){ location.href = '/login'; throw new Error('signed out'); }
  const type = r.headers.get('content-type') || '';
  if(!type.includes('json')) throw new Error(r.status === 404
    ? 'The app server is running an older version. Close the ESOP Pool window and start it again to load this view.'
    : `The server answered ${r.status} ${r.statusText}`);
  const j = await r.json();
  if(!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// ---------------------------------------------------------------- small charts
// Sparkline as inline SVG. opts: {w, h, color, base (hairline at this value), dot, sw, r}
function sparkSvg(values, opts = {}){
  const v = (values || []).filter(isNum);
  const w = opts.w || 72, h = opts.h || 20;
  if(v.length < 2) return '';
  const mn = Math.min(...v, isNum(opts.base) ? opts.base : Infinity), mx = Math.max(...v, isNum(opts.base) ? opts.base : -Infinity), span = (mx - mn) || 1;
  const y = val => (h - 2 - (val - mn) / span * (h - 4)).toFixed(1);
  const p = v.map((val, i) => `${(i / (v.length - 1) * (w - 3) + 1).toFixed(1)},${y(val)}`).join(' ');
  const end = v[v.length - 1] >= v[0] ? '#2F6B4F' : '#8A3A32';
  const base = isNum(opts.base) ? `<line x1="0" x2="${w}" y1="${y(opts.base)}" y2="${y(opts.base)}" stroke="#D9D0C2" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>` : '';
  const dot = opts.dot === false ? '' : `<circle cx="${(w - 2).toFixed(1)}" cy="${y(v[v.length - 1])}" r="${opts.r || 1.8}" fill="${end}"/>`;
  return `<svg class="spk" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${base}<polyline points="${p}" fill="none" stroke="${opts.color || '#14223A'}" stroke-width="${opts.sw || 1.2}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${dot}</svg>`;
}
async function sparks(params = ''){
  const k = params || 'default';
  const c = CACHE.sparks[k];
  if(c && Date.now() - c._at < 10 * 60 * 1000) return c;
  const d = await api('/api/sparklines' + (params ? '?' + params : '')); d._at = Date.now(); CACHE.sparks[k] = d; return d;
}

// ---------------------------------------------------------------- sortable tables
// table(id, rows, cols, opts) -> html. cols: [{k, label, num, get(r), fmt(v, r), cls(v, r), nosort}]
// opts: {sort, dir, href(r), rowCls(r), cls, limit (rows shown before "Show all"), after()}
// Sorting re-renders only this table.
const TABLES = {}, SORT = {}, OPEN = {};
function table(id, rows, cols, opts = {}){
  TABLES[id] = {rows, cols, opts};
  const st = SORT[id] || (SORT[id] = {k: opts.sort || cols[0].k, dir: opts.dir || -1});
  const get = (r, c) => c.get ? c.get(r) : r[c.k];
  const col = cols.find(c => c.k === st.k) || cols[0];
  const sorted = [...rows].sort((a, b) => {
    let x = get(a, col), y = get(b, col);
    if(x == null && y == null) return 0; if(x == null) return 1; if(y == null) return -1;
    if(typeof x === 'string') return x.localeCompare(y) * st.dir;
    return (x - y) * st.dir;
  });
  const lim = opts.limit && !OPEN[id] ? opts.limit : Infinity;
  const th = cols.map(c => { const on = st.k === c.k;
    return `<th class="${c.num ? 'num' : ''} ${on ? 'sorted' : ''}" ${c.nosort ? '' : `data-k="${c.k}"`}>${c.label}${on ? `<span class="ar">${st.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`; }).join('');
  const tr = sorted.slice(0, lim).map(r => `<tr class="${opts.href ? 'click' : ''} ${opts.rowCls ? opts.rowCls(r) : ''}" ${opts.href ? `data-href="${esc(opts.href(r))}"` : ''}>` +
    cols.map(c => { const v = get(r, c); const txt = c.fmt ? c.fmt(v, r) : esc(v ?? '–'); return `<td class="${c.num ? 'num' : ''} ${c.cls ? c.cls(v, r) : ''}">${txt}</td>`; }).join('') + '</tr>').join('');
  const more = rows.length > lim ? `<button class="ql showall" data-open="${esc(id)}">Show all ${rows.length}</button>`
    : (opts.limit && OPEN[id] && rows.length > opts.limit ? `<button class="ql showall" data-close="${esc(id)}">Show fewer</button>` : '');
  return `<div class="tw" data-tbl="${esc(id)}"><table class="tbl ${opts.cls || ''}"><thead><tr>${th}</tr></thead><tbody>${tr || `<tr><td colspan="${cols.length}" class="empty">Nothing to show.</td></tr>`}</tbody></table>${more}</div>`;
}
function rerender(id){ const wrap = $(`[data-tbl="${id}"]`); const t = TABLES[id]; if(!wrap || !t) return; wrap.outerHTML = table(id, t.rows, t.cols, t.opts); if(t.opts.after) t.opts.after(); }
document.addEventListener('click', e => {
  const el = evEl(e);
  if(!(el instanceof Element)) return;
  if(!el.closest('#acct') && $('#acctmenu')) $('#acctmenu').classList.toggle('open', false);
  const th = el.closest('th[data-k]');
  if(th && th.closest('[data-tbl]')){
    const id = th.closest('[data-tbl]').dataset.tbl; const st = SORT[id];
    if(st.k === th.dataset.k) st.dir *= -1; else { st.k = th.dataset.k; st.dir = -1; }
    rerender(id); return;
  }
  const sa = el.closest('[data-open],[data-close]');
  if(sa){ const id = sa.dataset.open || sa.dataset.close; OPEN[id] = !!sa.dataset.open; rerender(id); return; }
  const a = el.closest('a[data-ext]');
  if(a){ e.preventDefault(); window.open(a.href, '_blank', 'noopener'); return; }
  const tr = el.closest('tr[data-href],[data-go]');
  if(tr && !el.closest('a,button,input,select,summary,details')) location.hash = tr.dataset.href || tr.dataset.go;
});

// ---------------------------------------------------------------- prose helpers
const linkify = s => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener" data-ext>$1</a>');
function para(lines){
  if(!lines || !lines.length) return '';
  let html = '', inList = false;
  for(const l of lines){
    if(l.startsWith('## ')){ if(inList){ html += '</ul>'; inList = false; } html += `<h4>${esc(l.slice(3))}</h4>`; continue; }
    const item = /^(\d+[.)]|[-•*]|--->)\s*/.test(l);
    if(item){ if(!inList){ html += '<ul>'; inList = true; } html += `<li>${linkify(esc(l.replace(/^(\d+[.)]|--->|[-•*])\s*/, '')))}</li>`; }
    else { if(inList){ html += '</ul>'; inList = false; } html += `<p>${linkify(esc(l))}</p>`; }
  }
  if(inList) html += '</ul>';
  return html;
}
const paras = s => (s || '').split(/\n\s*\n/).filter(p => p.replace(EDGE_WS, '')).map(p => `<p>${esc(p.replace(EDGE_WS, ''))}</p>`).join('');
const srcLinks = list => (list || []).map(s => `<a href="${esc(s.url)}" rel="noopener" data-ext>${esc(s.label || 'Source')}</a>${s.date ? ` <span class="mut">${esc(dShort(s.date))}</span>` : ''}`).join(' · ');
function noteList(al){
  return `<ul class="flags">${al.map(a => {
    const link = a.client && a.kind === 'gap' ? `#/client/${encodeURIComponent(a.client)}` : a.company ? `#/company/${encodeURIComponent(a.company)}` : '#';
    return `<li><span class="k">${a.kind === 'concentration' ? 'Concentration' : 'Data gap'}</span><div><a class="t" href="${link}">${esc(a.title)}</a>${a.detail ? `<div class="d">${esc(a.detail)}</div>` : ''}</div></li>`;
  }).join('')}</ul>`;
}
function kpis(items, n){
  return `<div class="kpis" style="--n:${n || items.length}">${items.map(([l, v, s, vc]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${vc || ''}">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}</div>`;
}
const sec = (label, body, acts = '', id = '', extra = '') => `<section class="sec ${extra}" ${id ? `id="${id}"` : ''}><div class="sec-h"><span class="lbl">${label}</span>${acts ? `<span class="acts">${acts}</span>` : ''}</div>${body}</section>`;
const chipsHtml = tr => `<div class="chips">${(tr || []).map(t => `<span class="chip ${esc(t.kind || '')}">${esc(t.label)}</span>`).join('')}</div>`;

// ---------------------------------------------------------------- chrome
function paintStatus(){
  const age = S.quote_age_min;
  const dot = age == null ? 'off' : age > 60 ? 'stale' : '';
  const when = S.quotes_asof ? new Date(S.quotes_asof).toLocaleString('en-IN', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'}) : 'never';
  const errs = Object.keys(S.quote_errors || {}).length;
  const html = `<span class="dot ${dot}"></span><span>${S.refreshing ? 'Refreshing quotes' : 'Quotes ' + when}${errs ? ' · ' + errs + ' failed' : ''} · USD/INR ${fmtN(S.fx, 2)}</span>`;
  $('#qstat').innerHTML = html; $('#qstat2').innerHTML = html;
  // hosted site: an edit that did not reach the private repo would be lost at the next restart
  if(S.sync && S.sync.failing && !paintStatus.warned){ paintStatus.warned = true; toast('Not saved to the repo: ' + S.sync.last_error, 12000); }
}
async function refreshQuotes(){
  const b = $('#refreshBtn'); b.disabled = true; b.textContent = 'Refreshing';
  try{ S = await api('/api/refresh', {method: 'POST'}); paintStatus(); route(true); toast(S.refresh_error ? 'Refresh problem: ' + S.refresh_error : 'Quotes refreshed'); }
  catch(e){ toast('Refresh failed: ' + e.message); }
  b.disabled = false; b.textContent = 'Refresh';
}
function toggleMenu(force){
  const m = $('#menu'); const open = force === undefined ? !m.classList.contains('open') : force;
  m.classList.toggle('open', open); $('#menuBtn').setAttribute('aria-expanded', open);
}
function toggleAccount(){ const m = $('#acctmenu'); m.classList.toggle('open'); $('#acctBtn').setAttribute('aria-expanded', m.classList.contains('open')); }
async function load(){ S = await api('/api/state'); paintStatus(); }

// ---------------------------------------------------------------- account: password + previous versions
function closeMenus(){ toggleMenu(false); $('#acctmenu').classList.toggle('open', false); }
function openPassword(){
  closeMenus();
  openDrawer({title: 'Change password', eyebrow: 'Account', width: 480, noDesc: true, saveLabel: 'Change password',
    body: `<div class="fgrid" style="grid-template-columns:1fr">${fld('Current password', '<input id="p_cur" type="password" autocomplete="current-password">')}
      ${fld('New password', '<input id="p_new" type="password" autocomplete="new-password">', '', 'At least six characters (ten on the hosted server). Everyone signed in stays signed in.')}</div>`,
    onSave: async () => { await api('/api/password', {method: 'POST', body: JSON.stringify({current: $('#p_cur').value, new: $('#p_new').value})}); closeDrawer(); toast('Password changed'); }});
}
async function openRestore(){
  closeMenus();
  openDrawer({title: 'Restore a previous version', eyebrow: 'Account', width: 640, noSave: true,
    body: `<p class="hint" style="margin-top:0">Every save keeps the file as it was before. Restoring one keeps the current file as a version too.</p><div id="snaps"><p class="mut">Loading…</p></div>`});
  try{
    const list = await api('/api/snapshots');
    const rows = list.map(s => { const m = s.file.match(/^(\d{8})-(\d{6})_(clients|companies|settings)(?:\.json)?_?(.*?)(\.json.*)?$/);
      return {...s, when: m ? `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)} ${m[2].slice(0, 2)}:${m[2].slice(2, 4)}` : '', what: m ? m[3] : '',
        desc: m ? ((m[4] || '') + (m[5] || '')).replace(/\.json/g, '').replace(/^\./, '').replace(/[_.]/g, ' ').replace(EDGE_WS, '') : s.file}; });
    $('#snaps').innerHTML = rows.length ? table('snaps', rows, [
      {k: 'when', label: 'Saved', fmt: v => esc(v || '–')},
      {k: 'what', label: 'File', fmt: v => esc(v || '–')},
      {k: 'desc', label: 'Change', fmt: v => `<span class="small">${esc(v || '–')}</span>`},
      {k: 'file', label: '', nosort: true, fmt: v => `<button class="ql" onclick="restoreSnap('${esc(v)}')">Restore</button>`},
    ], {sort: 'when', limit: 15}) : '<p class="mut">No previous versions yet.</p>';
  } catch(e){ $('#snaps').textContent = e.message; }
}
async function restoreSnap(f){
  if(!confirm('Restore ' + f + '? The current file is kept as a version first.')) return;
  try{ const r = await api('/api/snapshots/restore', {method: 'POST', body: JSON.stringify({file: f})}); await load(); closeDrawer(); route(true); toast('Restored ' + r.restored); } catch(e){ toast(e.message); }
}

// ---------------------------------------------------------------- router
let lastHash = '';
function route(keepScroll){
  if(!S) return;
  const parts = (location.hash.replace(/^#\/?/, '') || 'week').split('/');
  const r = ROUTES[parts[0]] ? parts[0] : 'week', arg = decodeURIComponent(parts[1] || '');
  const nav = ROUTES[r].nav || r;
  $$('#nav a, #menu a[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === nav));
  toggleMenu(false);
  if(typeof Chart !== 'undefined') Chart.destroy();
  if(typeof destroyLines === 'function') destroyLines();
  $('#app').innerHTML = ROUTES[r].view(arg) || '';
  const same = lastHash === location.hash; lastHash = location.hash;
  if(!same && !keepScroll) window.scrollTo(0, 0);
  if(ROUTES[r].after) ROUTES[r].after(arg);
}
window.addEventListener('hashchange', () => route());

// ---------------------------------------------------------------- drawers
// openDrawer({title, eyebrow, body, width, onSave, noDesc, noSave, saveLabel, descHint})
function openDrawer(o){
  closeDrawer(true);
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.id = 'scrim'; scrim.onclick = () => closeDrawer();
  const d = document.createElement('aside'); d.className = 'drawer'; d.id = 'drawer'; d.style.setProperty('--dw', (o.width || 600) + 'px');
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', o.title);
  d.innerHTML = `<div class="dh"><div>${o.eyebrow ? `<div class="eyebrow" style="margin-bottom:8px">${o.eyebrow}</div>` : ''}<h2>${esc(o.title)}</h2></div><button class="x" onclick="closeDrawer()" aria-label="Close">×</button></div>
    <div class="db">${o.body}</div>
    ${o.noSave ? '' : `<div class="df">${o.noDesc ? '' : `<div class="f"><label for="d_desc">Change description (kept with the previous version)</label><input id="d_desc" placeholder="${esc(o.descHint || 'What changed and why')}"></div>`}
      <div class="row"><span class="err" id="d_err"></span><button class="btn" onclick="closeDrawer()">Cancel</button><button class="btn primary" id="d_save">${esc(o.saveLabel || 'Save')}</button></div></div>`}`;
  document.body.append(scrim, d);
  if(!o.noSave) $('#d_save').onclick = async () => {
    const b = $('#d_save'); b.disabled = true; $('#d_err').textContent = '';
    try{ await o.onSave($('#d_desc') ? $('#d_desc').value : ''); }
    catch(e){ if($('#d_err')) $('#d_err').textContent = e.message; }
    if($('#d_save')) $('#d_save').disabled = false;
  };
  requestAnimationFrame(() => { scrim.classList.toggle('show', true); d.classList.toggle('show', true); });
  document.body.style.overflow = 'hidden';
}
function closeDrawer(now){
  const d = $('#drawer'), s = $('#scrim'); document.body.style.overflow = '';
  if(!d) return;
  if(now){ d.remove(); s && s.remove(); return; }
  d.classList.toggle('show', false); s && s.classList.toggle('show', false);
  setTimeout(() => { d.remove(); s && s.remove(); }, 220);
}
document.addEventListener('keydown', e => { if(e.key === 'Escape' && $('#drawer')) closeDrawer(); });
const fld = (label, inner, cls = '', hint = '') => `<div class="f ${cls}"><label>${label}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;

// ---------------------------------------------------------------- weekly brief (shared by several pages)
async function loadBrief(week){
  const w = week || '';
  if(CACHE.brief && CACHE.briefWeek === w && Date.now() - CACHE.brief._at < 60 * 1000 && !(CACHE.brief.progress || {}).running) return CACHE.brief;
  const b = await api(w ? `/api/brief/${encodeURIComponent(w)}` : '/api/brief'); b._at = Date.now(); CACHE.brief = b; CACHE.briefWeek = w; return b;
}

// ---------------------------------------------------------------- simple line charts (pool and client value over time)
const LINES = [];
function destroyLines(){ while(LINES.length){ const x = LINES.pop(); try{ x.ro.disconnect(); x.chart.remove(); }catch(e){} } }
function lineChart(el, points, opts = {}){
  if(!el || !window.LightweightCharts) return;
  el.innerHTML = '';
  if(!points.length){ el.innerHTML = '<div class="ld">No history yet.</div>'; return; }
  const chart = LightweightCharts.createChart(el, {width: el.clientWidth, height: el.clientHeight,
    layout: {background: {type: 'solid', color: '#FFFFFF'}, textColor: '#6F6A63', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontSize: 11, attributionLogo: false},
    grid: {vertLines: {visible: false}, horzLines: {color: '#F3EFE8'}}, rightPriceScale: {borderVisible: false, scaleMargins: {top: 0.12, bottom: 0.08}},
    timeScale: {borderVisible: false, fixLeftEdge: true, fixRightEdge: true}, handleScroll: false, handleScale: false,
    crosshair: {vertLine: {color: '#B9AE9C', labelBackgroundColor: '#14223A'}, horzLine: {color: '#B9AE9C', labelBackgroundColor: '#14223A'}},
    localization: {dateFormat: "dd MMM ''yy", priceFormatter: v => '₹ ' + fmtN(v, v < 100 ? 2 : 1) + ' cr'}});
  const s = chart.addAreaSeries({lineColor: '#14223A', topColor: 'rgba(20,34,58,0.05)', bottomColor: 'rgba(20,34,58,0.05)', lineWidth: 2, priceLineVisible: false});
  s.setData(points.map(p => ({time: p.t, value: p.v})));
  chart.timeScale().fitContent();
  const ro = new ResizeObserver(() => chart.applyOptions({width: el.clientWidth})); ro.observe(el);
  LINES.push({chart, ro});
}

// ---------------------------------------------------------------- boot
async function boot(){
  try{ await load(); route(); }
  catch(e){ $('#app').innerHTML = `<div class="empty">Could not load: ${esc(e.message)}</div>`; }
  // pick up the background quote refresh without disturbing an open editor or a chart selection
  setInterval(async () => {
    try{ const st = await api('/api/state'); if(st && st.quotes_asof !== S.quotes_asof){ S = st; paintStatus();
      const typing = document.activeElement && document.activeElement.matches('input,select,textarea');
      if(!$('#drawer') && !typing && !/^#\/(company|pool|client)/.test(location.hash)) route(true); } }
    catch(e){}
  }, 60000);
}
