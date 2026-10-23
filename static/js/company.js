// COMPANIES - the list, the company page and the research editor (drawer).
//
// The company page is assembled from two registries so new analysis can be added without touching the
// rest of the page:
//   COMPANY_SECTIONS  the page body, in order (single column; no fixed side rail)
// Each entry is {id, label, render(c) -> html ('' leaves the section out), acts?(c), load?(c, el)}.
// To insert a section (say a results scorecard), put one entry where it should appear:
//   COMPANY_SECTIONS.splice(COMPANY_SECTIONS.findIndex(s => s.id === 'financials'), 0, {id: 'scorecard', label: 'Results scorecard', render: c => ...});
'use strict';
const cofilt = {q: ''};
ROUTES.companies = {nav: 'companies', view: viewCompanies, after: () => paintCompaniesBody()};
ROUTES.company = {nav: 'companies', view: viewCompany, after: afterCompany};
const updatesAsOf = c => { const lu = c.latest_updates || {}; return (lu.points || []).length ? (lu.as_of || (lu.written_at || '').slice(0, 10)) : null; };

// ================================================================ list
function viewCompanies(){
  const n = S.companies.length, listed = S.companies.filter(c => c.listed).length;
  return `<div class="phead"><div><div class="eyebrow">Companies · ${n} · ${listed} listed</div><h1 class="title">Companies</h1>
      <div class="lede">Every name held in client ESOPs, with the desk's research behind it. Prices are live; Re-val / De-val is the desk normalized P/S over the current P/S, less one.</div></div>
      <div class="right"><button class="btn primary" onclick="editCompany(null)">New company</button></div></div>
    <div class="filters"><input class="search" type="search" placeholder="Search company or symbol" value="${esc(cofilt.q)}" oninput="cofilt.q=this.value;paintCompaniesBody()"><span class="count" id="cocount"></span></div>
    <div id="cobody"></div>`;
}
function paintCompaniesBody(){
  const el = $('#cobody'); if(!el) return;
  const q = cofilt.q.toLowerCase();
  const rows = S.companies.filter(c => !q || (c.name + ' ' + c.key + ' ' + (c.yahoo_symbol || '')).toLowerCase().includes(q));
  $('#cocount').textContent = `${rows.length} of ${S.companies.length}`;
  const cols = [
    {k: 'name', label: 'Company', fmt: (v, c) => `<span class="nm">${esc(v)}</span><span class="tk">${esc(c.ticker || c.key)}</span>`},
    {k: 'exchange', label: 'Exchange', fmt: (v, c) => c.listed ? esc(v || '') : '<span class="mut">Unlisted</span>'},
    {k: 'n_clients', label: 'Clients', num: true},
    {k: 'live_value_cr', label: 'ESOP value', num: true, fmt: v => fmtCr(v)},
    {k: 'price', label: 'Price', num: true, get: c => c.live.price, fmt: (v, c) => c.listed ? fmtPx(v, c.live.currency) : '<span class="mut">–</span>'},
    {k: 'down52', label: 'vs 52-wk high', num: true, get: c => c.live.down52, fmt: v => fmtPct(v, 1, true), cls: v => cls(v)},
    {k: 'ps', label: 'P/S now · norm.', num: true, get: c => c.live.current_pr, fmt: (v, c) => isNum(v) ? `${fmtX(v)} <span class="mut">/ ${fmtX(c.normalized_pr)}</span>` : '–'},
    {k: 'rv', label: 'Re-val / De-val', num: true, get: c => c.live.reval_pr, fmt: v => reval(v)},
    {k: 'ol', label: 'Outlook', get: c => (c.earnings_outlook || {}).value || null, fmt: (v, c) => outlookTag(c.earnings_outlook)},
    {k: 'upd', label: 'Updates', num: true, get: c => updatesAsOf(c), fmt: v => v ? dShort(v) : '<span class="mut">none</span>'},
    {k: 'research', label: 'Research', num: true, get: c => c.live.research_ok ? (c.research_asof || '0') : null, fmt: (v, c) => v ? dShort(c.research_asof) : '<span class="mut">none</span>'},
  ];
  const gaps = S.alerts.filter(a => a.kind === 'gap' && a.company && !a.client);
  el.innerHTML = table('companies', rows, cols, {sort: 'live_value_cr', cls: 'dense', href: c => '#/company/' + encodeURIComponent(c.key)}) +
    (gaps.length ? `<details class="quiet" style="margin-top:22px"><summary>${gaps.length} data gap${gaps.length === 1 ? '' : 's'}</summary>${noteList(gaps)}</details>` : '');
}

// ================================================================ company page
const isPctRow = l => /\(%\)|%|\bgrowth\b|\bmargin\b|\broe\b|\broce\b|\broa\b|\bratio\b|to equity|\byoy\b/i.test(l) && !/\(x\)/i.test(l);
const isMutedRow = l => isPctRow(l) || /debt to equity|\bratio\b/i.test(l);

function viewCompany(key){
  const c = comp(key); if(!c) return `<div class="empty">Company not found. <a href="#/companies">All companies</a></div>`;
  const lv = c.live, m = c.manual || {}, ol = c.earnings_outlook || {};
  const head = `<div class="chead">
    <div><div class="eyebrow"><a href="#/companies">Companies</a> · ${esc(c.listed ? (c.exchange || '') : 'Unlisted')}${c.listed ? ' · ' + esc(c.ticker || c.key) : ''}${c.sector ? ' · ' + esc(c.sector) : ''}</div>
      <h1 class="title">${esc(c.name)}</h1>
      <div class="cmeta">${c.n_clients ? `Held by <b>${c.n_clients} client${c.n_clients === 1 ? '' : 's'}</b> · <b>${fmtCr(c.live_value_cr)}</b> in ESOPs` : 'Not held by any client'}${c.listed && lv.asof ? ` · quote ${dTime(lv.asof)}` : ''}</div></div>
    <div class="chead-r"><button class="btn" onclick="editCompany('${esc(c.key)}')">Edit research</button>
      <span class="hint">Research ${c.analysis ? 'written ' + dShort(c.analysis.as_of) : 'as of ' + dShort(c.research_asof)}</span></div>
  </div>`;
  const strip = c.listed ? kpis([
      ['Price', fmtPx(lv.price, lv.currency), isNum(lv.change_pct) ? `<span class="${cls(lv.change_pct)}">${fmtPct(lv.change_pct, 2, true)} today</span>` : (lv.quote_ok ? '' : 'quote unavailable')],
      ['Market cap', fmtMcap(c), lv.currency === 'USD' && isNum(lv.mcap_inr_cr) ? `₹ ${fmtN(lv.mcap_inr_cr / 1e5, 2)} lakh cr` : ''],
      ['P/E', fmtX(lv.current_pe, 1), `desk normalized ${fmtX(c.normalized_pe, 1)}`],
      ['Price to sales', fmtX(lv.current_pr), `desk normalized ${fmtX(c.normalized_pr)}`],
      ['Re-val / De-val', isNum(lv.reval_pr) ? `<span class="${cls(lv.reval_pr)}">${fmtPct(lv.reval_pr, 0, true)}</span>` : '–', `on P/S${isNum(lv.reval_pe) ? ` · P/E ${fmtPct(lv.reval_pe, 0, true)}` : ''}`],
      ['1-year change', `<span class="${cls(lv.change_1y)}">${fmtPct(lv.change_1y, 1, true)}</span>`, isNum(lv.down52) ? `${fmtPct(lv.down52, 1, true)} from the 52-week high` : ''],
    ]) : kpis([
      ['Valuation mark', isNum(m.valuation_cr) ? fmtCr(m.valuation_cr, 0) : '–', m.asof ? `as of ${dShort(m.asof)}` : 'last round or 409A'],
      ['Price per share', isNum(m.price) ? fmtPx(m.price, 'INR') : '–', 'manual'],
      ['ESOP value', fmtCr(c.live_value_cr), `${c.n_clients} client${c.n_clients === 1 ? '' : 's'}`],
    ]);
  const main = COMPANY_SECTIONS.map(s => { const body = s.render(c); return body ? sec(s.label, body, s.acts ? s.acts(c) : '', 'cs-' + s.id) : ''; }).join('');
  return `${head}<div class="keyrow tight">${strip}</div>
    ${c.listed ? chartPanel(c) : marksPanel(c)}
    ${bandHtml(c)}
    <div id="cmain" class="cbody">${main}</div>`;
}
function afterCompany(key){
  const c = comp(key); if(!c) return;
  if(c.listed) initChart(key); else loadMarks(key);
  for(const s of COMPANY_SECTIONS){
    if(!s.load) continue;
    const el = $('#cs-' + s.id);
    if(el) s.load(c, el);
  }
}

// ---- the band under the chart: outlook, 52-week range, holders in brief
function bandHtml(c){
  const lv = c.live, ol = c.earnings_outlook || {};
  const cells = [];
  cells.push(`<div class="bc"><div class="lbl">Earnings outlook</div><div class="bv">${ol.value ? outlookTag(ol) : '<span class="mut">Not set</span>'}</div>${ol.reason ? `<div class="bs">${esc(ol.reason)}</div>` : ''}</div>`);
  if(c.listed){
    const r = rangeHtml(c);
    if(r) cells.push(`<div class="bc wide"><div class="lbl">52-week range</div>${r}</div>`);
  }
  const top = c.holders.slice().sort((a, b) => (b.live_value_cr || 0) - (a.live_value_cr || 0));
  cells.push(`<div class="bc"><div class="lbl">Client exposure</div><div class="bv serif">${fmtCr(c.live_value_cr)}</div>
    <div class="bs">${c.n_clients} client${c.n_clients === 1 ? '' : 's'}${top.length ? ` · largest ${esc(top[0].client)} ${fmtCr(top[0].live_value_cr)}` : ''}</div></div>`);
  return `<div class="cband">${cells.join('')}</div>`;
}

// ---------------------------------------------------------------- sections, in order
const COMPANY_SECTIONS = [
  {id: 'updates', label: 'Latest updates', render: c => updatesHtml(c),
    acts: c => { const lu = c.latest_updates || {}; return updatesAsOf(c) ? `<span class="hint">as of ${dShort(updatesAsOf(c))}${lu.written_by ? ' · ' + esc(lu.written_by) : ''}</span>` : ''; }},
  {id: 'moved', label: 'Why the stock moved', render: c => movedHtml(c)},
  {id: 'analysis', label: 'The company', render: c => analysisHtml(c),
    acts: c => c.analysis ? `<span class="hint">written ${dShort(c.analysis.as_of)} · ${esc(c.analysis.written_by || '')}</span>` : ''},
  {id: 'financials', label: 'Financial statements', render: c => c.listed ? `<div id="finbody"><p class="mut">Loading statements…</p></div>` : '', load: (c, el) => loadFinancials(c)},
  {id: 'valuation', label: 'Valuation history', render: c => valuationHtml(c)},
  {id: 'notes', label: 'Desk notes', render: c => !c.notes.length ? '' : c.analysis
    ? `<details class="quiet"><summary>The desk's original notes (from the workbook; the analysis above is newer)</summary><div class="prose" style="margin-top:12px">${para(c.notes)}${c.highlights.length ? `<h4>Results highlights at the time</h4>${para(c.highlights)}` : ''}</div></details>`
    : `<div class="prose">${para(c.notes)}</div>`},
  {id: 'sources', label: 'Sources', render: c => sourcesHtml(c)},
];
function updatesHtml(c){
  const pts = (c.latest_updates || {}).points || [];
  if(!pts.length) return c.analysis ? '' : '<p class="mut" style="margin:0">No updates written yet.</p>';
  return `<ol class="updates two">${pts.map(p => `<li><div class="uh">${esc(p.headline)}</div><div class="ux">${esc(p.explanation)}</div>
    <div class="um">${impactTag(p.impact)}${(p.sources || []).length ? `<span class="us">${srcLinks(p.sources)}</span>` : ''}</div></li>`).join('')}</ol>`;
}
function movedHtml(c){
  const lv = c.live; if(!c.listed) return '';
  const big = (isNum(lv.change_1m) && Math.abs(lv.change_1m) > 0.10) || (isNum(lv.down52) && lv.down52 <= -0.20);
  if(!big) return '';
  const w = ((c.latest_updates || {}).why_moved || {}).text;
  return `<div class="moved"><dl class="mnums"><div><dt>1 month</dt><dd class="${cls(lv.change_1m)}">${fmtPct(lv.change_1m, 1, true)}</dd></div>
      <div><dt>3 months</dt><dd class="${cls(lv.change_3m)}">${fmtPct(lv.change_3m, 1, true)}</dd></div>
      <div><dt>From the 52-week high</dt><dd class="${cls(lv.down52)}">${fmtPct(lv.down52, 1, true)}</dd><dd class="hint">high ${fmtPx(lv.high52, lv.currency)}${lv.high52_date ? ', ' + dShort(lv.high52_date) : ''}</dd></div></dl>
    ${w ? `<div class="prose"><p>${esc(w)}</p></div>` : ''}</div>`;
}

// ---- the company: written analysis, with the desk's original research as the fallback
function analysisHtml(c){
  const a = c.analysis;
  if(!a) return businessHtml(c) + (c.highlights.length ? `<h4 class="subh">Recent results</h4><div class="prose">${para(c.highlights)}</div>` : '');
  const seg = a.segments;
  const segHtml = seg && seg.rows && seg.rows.length ? (() => {
    const tot = sum(seg.rows, r => r.share || 0);
    const bar = tot >= 0.5 ? `<div class="mixbar">${seg.rows.map((r, i) => `<span style="width:${(r.share || 0) / Math.max(tot, 1) * 100}%;background:${MIX_COLS[i % MIX_COLS.length]}" title="${esc(r.name)}"></span>`).join('')}</div>` : '';
    return `<h4 class="subh">How it makes money${seg.period ? ` · ${esc(seg.period)}` : ''}</h4>${bar}
      <div class="tw"><table class="tbl fin segtbl"><thead><tr><th>Segment</th><th class="num">Revenue${seg.unit ? ` (${esc(seg.unit)})` : ''}</th><th class="num">Share</th><th class="num">Growth</th><th>What it is</th></tr></thead><tbody>${
        seg.rows.map((r, i) => `<tr><td><i class="dot" style="background:${MIX_COLS[i % MIX_COLS.length]}"></i><span class="nm">${esc(r.name)}</span></td><td class="num">${isNum(r.revenue) ? fmtU(r.revenue, seg.unit) : '–'}</td><td class="num">${isNum(r.share) ? fmtPct(r.share, 0) : '–'}</td><td class="num">${isNum(r.growth) ? `<span class="${cls(r.growth)}">${fmtPct(r.growth, 0, true)}</span>` : '–'}</td><td class="small">${esc(r.note || '')}</td></tr>`).join('')
      }</tbody></table></div>${seg.note ? `<p class="hint">${esc(seg.note)}</p>` : ''}`;
  })() : (c.segments.length ? `<h4 class="subh">Segments</h4>${businessHtml({...c, about: []})}` : '');
  const list = (items, cls2) => `<ol class="pts ${cls2}">${items.map(x => `<li><b>${esc(x.head)}</b><span>${esc(x.text)}</span></li>`).join('')}</ol>`;
  const watch = (a.watch || []).length ? `<h4 class="subh">What to watch</h4><div class="tw"><table class="tbl fin watch"><thead><tr><th>Measure</th><th>Latest</th><th>Why it matters</th></tr></thead><tbody>${
      a.watch.map(w => `<tr><td><span class="nm">${esc(w.metric)}</span></td><td>${esc(w.latest)}</td><td class="small">${esc(w.why)}</td></tr>`).join('')}</tbody></table></div>` : '';
  return `<p class="inbrief">${esc(a.in_brief)}</p>
    ${segHtml}
    <div class="dr2"><div><h4 class="subh">What drives earnings</h4>${list(a.drivers || [], 'pos')}</div>
      <div><h4 class="subh">What could go wrong</h4>${list(a.risks || [], 'neg')}</div></div>
    ${watch}`;
}

// ---- financial statements from filings
const FIN_STATE = {view: 'annual'};
const fmtU = (v, unit) => !isNum(v) ? '–' : (unit && /USD/.test(unit) ? v.toLocaleString('en-US', {maximumFractionDigits: Math.abs(v) < 100 ? 1 : 0}) : fmtN(v, Math.abs(v) < 100 ? 1 : 0));
async function loadFinancials(c){
  const el = $('#finbody'); if(!el) return;
  let d;
  try{ d = CACHE.fin && CACHE.fin[c.key] ? CACHE.fin[c.key] : await api('/api/financials/' + encodeURIComponent(c.key)); }
  catch(e){ el.innerHTML = `<p class="mut">${esc(e.message)}</p>`; return; }
  (CACHE.fin = CACHE.fin || {})[c.key] = d;
  paintFinancials(c, d);
  const vs = $('#cs-valuation .sec-b') || $('#cs-valuation'); if(vs && c.valuations.rows.length){ const body = valuationHtml(c); const host = $('#cs-valuation'); if(host){ const hd = host.querySelector('.sec-h'); host.innerHTML = (hd ? hd.outerHTML : '') + body; } }
}
function paintFinancials(c, d){
  const el = $('#finbody'); if(!el) return;
  if(!d || d.error){ el.innerHTML = `<p class="mut">${esc((d && d.error) || 'No statements available.')}</p>` + deskTable(c); return; }
  const T = d[FIN_STATE.view] || d.annual;
  const meta = d.rows_meta, order = d.row_order;
  const fv = (v, kind) => !isNum(v) ? '<span class="mut">–</span>' : kind === 'pct' ? `<span class="${v < 0 ? 'neg' : ''}">${fmtPct(v, 1)}</span>` : kind === 'eps' ? v.toFixed(2) : `<span class="${v < 0 ? 'neg' : ''}">${fmtU(v, d.unit)}</span>`;
  const groups = [['income', 'Income statement'], ['cash', 'Cash flow'], ['balance', 'Balance sheet']];
  const block = ([g, label]) => {
    const ids = order.filter(r => meta[r].group === g && T.rows[r]);
    if(!ids.length) return '';
    return `<div class="tw"><table class="tbl fin stmt"><thead><tr><th>${label}</th>${T.periods.map(p => `<th class="num${p === 'TTM' ? ' ttm' : ''}">${esc(p)}${p === 'TTM' && d.ttm_label ? `<span class="tsub">${esc(d.ttm_label.replace('TTM to ', 'to '))}</span>` : ''}</th>`).join('')}<th class="num">Trend</th></tr></thead><tbody>${
      ids.map(r => { const k = meta[r].kind, sub = k === 'pct';
        return `<tr class="${sub ? 'muted' : ''}"><td>${sub ? esc(meta[r].label) : `<span class="nm">${esc(meta[r].label)}</span>`}</td>${T.rows[r].map((v, i) => `<td class="num${T.periods[i] === 'TTM' ? ' ttm' : ''}">${fv(v, k)}</td>`).join('')}<td class="num">${sub ? '' : sparkSvg(T.rows[r], {w: 56, h: 16, sw: 1.1, r: 1.6})}</td></tr>`; }).join('')
    }</tbody></table></div>`;
  };
  const a = c.analysis || {};
  el.innerHTML = `<div class="fintop"><div class="seg2"><button class="${FIN_STATE.view === 'annual' ? 'on' : ''}" onclick="FIN_STATE.view='annual';paintFinancials(comp('${esc(c.key)}'), CACHE.fin['${esc(c.key)}'])">Annual</button><button class="${FIN_STATE.view === 'quarterly' ? 'on' : ''}" onclick="FIN_STATE.view='quarterly';paintFinancials(comp('${esc(c.key)}'), CACHE.fin['${esc(c.key)}'])">Quarterly</button></div>
      <span class="hint">${esc(d.unit)} except EPS · ${esc(d.source)}</span></div>
    ${a.numbers ? `<div class="readnum"><span class="lbl">Reading the numbers</span><p>${esc(a.numbers)}</p></div>` : ''}
    ${groups.map(block).join('')}
    <p class="hint">Growth is year on year (quarters against the same quarter a year earlier). Free cash flow = operating cash flow less capital expenditure. Balance-sheet lines are at the period end. ${(d.notes || []).map(esc).join(' ')}</p>
    ${deskTable(c)}`;
}
function deskTable(c){
  const m = c.metrics; if(!m || !m.rows.length) return '';
  const fv = (v, l) => !isNum(v) ? '<span class="mut">–</span>' : isPctRow(l) ? fmtPct(v, 1) : (Math.abs(v) < 100 && v !== Math.round(v)) ? fmtN(v, 2) : fmtU(v, c.revenue_unit);
  return `<details class="quiet" style="margin-top:18px"><summary>The desk's original table</summary><div class="tw" style="margin-top:12px"><table class="tbl fin"><thead><tr><th>${esc(c.revenue_unit || '')}</th>${m.periods.map(p => `<th class="num">${esc(p)}</th>`).join('')}<th class="num">CAGR</th></tr></thead><tbody>${
    m.rows.map(r => { const muted = isMutedRow(r.label);
      return `<tr class="${muted ? 'muted' : ''}"><td>${muted ? esc(r.label) : `<span class="nm">${esc(r.label)}</span>`}</td>${r.values.map(v => `<td class="num">${fv(v, r.label)}</td>`).join('')}<td class="num">${isNum(r.cagr) ? fmtPct(r.cagr, 1) : ''}</td></tr>`; }).join('')
  }</tbody></table></div></details>`;
}
function holdersTable(c){
  if(!c.holders.length) return '';
  const cols = [
    {k: 'client', label: 'Client', fmt: (v, h) => `<a class="nm" href="#/client/${encodeURIComponent(h.client_id)}">${esc(v)}</a>`},
    {k: 'team', label: 'BH', fmt: v => esc(v || '–')},
    {k: 'live_value_cr', label: 'ESOP value', num: true, fmt: v => fmtCr(v)},
    {k: 'aum_cr', label: 'PMS AUM', num: true, fmt: v => fmtCr(v)},
    {k: 'pct_of_aum', label: 'ESOP ÷ AUM', num: true, fmt: v => isNum(v) ? `<span class="${v >= S.settings.concentration_threshold ? 'neg' : ''}">${fmtN(v * 100, 0)}%</span>` : '–'},
  ];
  return table('holders-' + c.key, c.holders, cols, {sort: 'live_value_cr', cls: 'dense'});
}
function sourcesHtml(c){
  const all = [...((c.analysis || {}).sources || []), ...c.sources];
  if(!all.length) return '';
  return `<ul class="plain">${all.map(s => `<li><span>${esc(s.label || 'Source')}${s.date ? ` · ${dShort(s.date)}` : ''}</span> <a href="${esc(s.url)}" rel="noopener" data-ext>${esc(s.url)}</a></li>`).join('')}</ul>`;
}
function rangeHtml(c){
  const lv = c.live; if(!c.listed || !isNum(lv.low52) || !isNum(lv.high52) || !isNum(lv.price) || lv.high52 <= lv.low52) return '';
  const pos = Math.max(0, Math.min(100, (lv.price - lv.low52) / (lv.high52 - lv.low52) * 100));
  return `<div class="r52"><div class="track"><span class="fill" style="width:${pos}%"></span><span class="mk" style="left:${pos}%" data-v="${esc(fmtPx(lv.price, lv.currency))}"></span></div>
    <div class="ends"><span><b>Low</b>${fmtPx(lv.low52, lv.currency)}</span><span style="text-align:right"><b>High</b>${fmtPx(lv.high52, lv.currency)}</span></div></div>`;
}

// ---- the business: about + segment mix (a thin bar when the segments carry percentages)
const SEG_RE = /^\s*(?:\d+[.)]\s*)?(.+?)\s*(?::\s*-?|\s[-–—])\s*~?(\d+(?:\.\d+)?)\s*%\s*(.*)$/;
const MIX_COLS = ['#14223A', '#A8875A', '#5B6880', '#C9B593', '#97A0B3', '#7A5F36', '#D8D2C6'];
function businessHtml(c){
  const about = para(c.about);
  const segs = c.segments || [];
  const mix = [], rest = [];
  for(const l of segs){
    const m = l.match(SEG_RE);
    if(m) mix.push({label: m[1].replace(/[:\s-]+$/, ''), pct: parseFloat(m[2]), detail: m[3].replace(/^[(\s]+|[)\s]+$/g, '')}); else rest.push(l);
  }
  const tot = sum(mix, s => s.pct);
  let segHtml = '';
  if(mix.length >= 2 && tot >= 50 && tot <= 110){
    segHtml = `<h4>Segment mix</h4><div class="mixbar">${mix.map((s, i) => `<span style="width:${s.pct / Math.max(tot, 100) * 100}%;background:${MIX_COLS[i % MIX_COLS.length]}" title="${esc(s.label)} ${s.pct}%"></span>`).join('')}</div>
      <ul class="legend">${mix.map((s, i) => `<li><i style="background:${MIX_COLS[i % MIX_COLS.length]}"></i><span>${esc(s.label)}${s.detail ? `<span class="hint"> · ${esc(s.detail)}</span>` : ''}</span><span class="v">${s.pct}%</span></li>`).join('')}</ul>
      ${rest.length ? `<div style="margin-top:14px">${para(rest)}</div>` : ''}`;
  } else if(segs.length){
    segHtml = `<h4>Segments</h4>${para(segs)}`;
  }
  if(!about && !segHtml) return '';
  return `<div class="prose">${about}${segHtml}</div>`;
}
function valuationHtml(c){
  const v = c.valuations, lv = c.live; if(!v.rows.length) return '';
  const liveOf = l => l === 'PR' ? lv.current_pr : l === 'PE' ? lv.current_pe : null;
  const basisOf = l => l === 'PR' ? lv.ttm_revenue_label : l === 'PE' ? lv.ttm_pat_label : '';
  const summary = `<div class="tw"><table class="tbl fin"><thead><tr><th></th><th class="num">Now (TTM)</th><th class="num">2-yr avg</th><th class="num">5-yr avg</th><th class="num">Desk normalized</th><th class="num">Re-val / De-val</th><th>TTM basis</th></tr></thead><tbody>${
    v.rows.map(r => { const live = liveOf(r.label); return `<tr><td><span class="nm">${esc(multLabel(r.label))}</span></td><td class="num"><b style="font-weight:500">${fmtX(live)}</b></td><td class="num">${fmtX(r.avg2)}</td><td class="num">${fmtX(r.avg5)}</td><td class="num"><b style="font-weight:500">${fmtX(r.normalized)}</b></td><td class="num">${isNum(r.normalized) && isNum(live) ? reval(r.normalized / live - 1) : '<span class="mut">–</span>'}</td><td class="small">${esc(basisOf(r.label) || '')}</td></tr>`; }).join('')
  }</tbody></table></div>`;
  const hist = v.history_labels.length ? `<div class="tw" style="margin-top:22px"><table class="tbl fin"><thead><tr><th>By year</th>${v.history_labels.map(h => `<th class="num">${esc(h)}</th>`).join('')}<th class="num">Trend</th></tr></thead><tbody>${
    v.rows.map(r => `<tr><td><span class="nm">${esc(multLabel(r.label))}</span></td>${r.history.map(h => `<td class="num">${fmtX(h, 1)}</td>`).join('')}<td class="num">${sparkSvg([...r.history].reverse(), {w: 56, h: 16, sw: 1.1, r: 1.6})}</td></tr>`).join('')
  }</tbody></table></div>` : '';
  const fin = (CACHE.fin || {})[c.key];
  const ttmCol = fin && fin.annual && fin.annual.periods[fin.annual.periods.length - 1] === 'TTM' ? fin.annual.periods.length - 1 : -1;
  const nonop = ttmCol >= 0 && fin.annual.rows.nonop ? fin.annual.rows.nonop[ttmCol] : null;
  const ni = ttmCol >= 0 && fin.annual.rows.net_income ? fin.annual.rows.net_income[ttmCol] : null;
  const distort = isNum(nonop) && isNum(ni) && ni > 0 && nonop / ni > 0.25
    ? ` TTM profit includes ${fmtU(nonop, fin.unit)} ${esc(fin.unit)} of non-operating income (${fmtPct(nonop / ni, 0)} of it), so P/E on reported profit reads lower than the operating business alone would.` : '';
  return summary + hist + `<p class="hint" style="margin-top:10px" id="valnote">Now = today's market cap ÷ trailing twelve months from filings (revenue ${fmtU(lv.ttm_revenue, c.revenue_unit)}, profit ${fmtU(lv.ttm_pat, c.revenue_unit)} ${esc(c.revenue_unit || '')}), the same basis as the P/E and P/S charts. Re-val / De-val = desk normalized ÷ now − 1.${distort}</p>`;
}
// ---- unlisted: valuation-mark history in place of the chart
function marksPanel(c){
  return `<div class="panel cpanel marks" id="markspanel"><div class="ctop"><span class="lbl">Valuation marks</span><span class="hint">from saved versions of the research file</span></div><div id="marksbody" style="margin-top:14px"><p class="mut">Loading…</p></div></div>`;
}
async function loadMarks(key){
  let d; try{ d = await api('/api/marks/' + encodeURIComponent(key)); } catch(e){ const el = $('#marksbody'); if(el) el.innerHTML = `<p class="mut">${esc(e.message)}</p>`; return; }
  const el = $('#marksbody'); if(!el) return;
  const ms = (d.marks || []).filter(m => isNum(m.valuation_cr));
  if(!ms.length){ el.innerHTML = `<p class="mut" style="margin:0 0 6px">No valuation mark has been entered. Each mark entered under Edit research is kept and drawn here.</p>`; return; }
  if(ms.length === 1){ const m = ms[0]; el.innerHTML = `<p style="margin:0 0 6px">One mark on record: <span class="serif" style="font-size:20px;color:var(--navy)">${fmtCr(m.valuation_cr, 0)}</span>${m.asof ? ` as of ${dShort(m.asof)}` : ''}${m.note ? ` · ${esc(m.note.replace(/\.\s*$/, ''))}` : ''}.</p><p class="hint">Later marks will be drawn here as a history.</p>`; return; }
  const W = 900, H = 220, pad = 40;
  const vals = ms.map(m => m.valuation_cr), mn = Math.min(...vals) * 0.9, mx = Math.max(...vals) * 1.05;
  const x = i => pad + i / (ms.length - 1) * (W - 2 * pad), y = v => H - 30 - (v - mn) / ((mx - mn) || 1) * (H - 60);
  const path = ms.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.valuation_cr).toFixed(1)}`).join(' ');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="#14223A" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    ${ms.map((m, i) => `<circle cx="${x(i)}" cy="${y(m.valuation_cr)}" r="3.5" fill="#fff" stroke="#A8875A" stroke-width="1.5"/><text x="${x(i)}" y="${y(m.valuation_cr) - 10}" text-anchor="middle" font-size="11" fill="#14223A">${esc(fmtN(m.valuation_cr, 0))}</text><text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#8C7A60">${esc(m.asof ? dShort(m.asof) : 'undated')}</text>`).join('')}</svg>
    <p class="hint">₹ cr, each mark as entered.</p>`;
}

// ================================================================ research editor (drawer)
function pointBlock(p, i){
  return `<div class="hold upt" data-i="${i}">
    <div class="hh"><span class="lbl">Point</span><button class="ql danger" type="button" onclick="this.closest('.upt').remove()">Remove</button></div>
    <div class="fgrid">
      ${fld('Headline (6-10 words)', `<input name="u_head" value="${esc(p.headline || '')}">`, 'full')}
      ${fld('What happened and why it matters for earnings', `<textarea name="u_expl" style="min-height:70px">${esc(p.explanation || '')}</textarea>`, 'full')}
      ${fld('Earnings impact', `<select name="u_imp">${['positive', 'negative', 'mixed'].map(x => `<option ${p.impact === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}
      ${fld('Sources · label | url | date per line', `<textarea name="u_src" style="min-height:52px">${esc((p.sources || []).map(s => [s.label, s.url, s.date || ''].join(' | ')).join('\n'))}</textarea>`, 'full')}
    </div></div>`;
}
function editCompany(key){
  const c = key ? JSON.parse(JSON.stringify(comp(key))) : {key: '', name: '', ticker: '', listed: true, yahoo_symbol: '', exchange: 'NSE', currency: 'INR', revenue_unit: 'Rs cr',
    about: [], segments: [], highlights: [], notes: [], sources: [],
    metrics: {periods: ['FY21', 'FY22', 'FY23', 'FY24', 'FY25', 'FY26'], rows: [{label: 'Revenue from Operations', values: [], cagr: null}, {label: 'EBITDA', values: [], cagr: null}, {label: 'PAT', values: [], cagr: null}]},
    valuations: {history_labels: ['FY26', 'FY25', 'FY24', 'FY23', 'FY22', 'FY21'], rows: [{label: 'PE', history: []}, {label: 'PR', history: []}]},
    growth_estimate: null, normalized_pr: null, normalized_pe: null, ttm_revenue: null, ttm_pat: null, manual: {}};
  const m = c.manual || {}, lu = c.latest_updates || {}, ol = c.earnings_outlook || {};
  const del = `<button class="ql danger" type="button" onclick="this.closest('tr').remove()">×</button>`;
  const mrow = r => `<tr><td><input class="wide" name="m_label" value="${esc(r.label)}"></td>${c.metrics.periods.map((p, j) => `<td><input name="m_v" type="number" step="any" value="${r.values[j] ?? ''}"></td>`).join('')}<td><input class="mid" name="m_cagr" type="number" step="any" value="${r.cagr ?? ''}"></td><td>${del}</td></tr>`;
  const vrow = r => `<tr><td><input class="mid" name="v_label" value="${esc(r.label)}"></td><td><input class="mid" name="v_current" type="number" step="any" value="${r.current ?? ''}"></td><td><input class="mid" name="v_avg2" type="number" step="any" value="${r.avg2 ?? ''}"></td><td><input class="mid" name="v_avg5" type="number" step="any" value="${r.avg5 ?? ''}"></td><td><input class="mid" name="v_norm" type="number" step="any" value="${r.normalized ?? ''}"></td>${c.valuations.history_labels.map((h, j) => `<td><input class="mid" name="v_h" type="number" step="any" value="${r.history[j] ?? ''}"></td>`).join('')}<td>${del}</td></tr>`;
  const ta = (id, label, lines, cls = 'full') => fld(label, `<textarea id="${id}">${esc((lines || []).join('\n'))}</textarea>`, cls);
  openDrawer({
    title: key ? c.name : 'New company', eyebrow: key ? 'Edit research' : 'New company', width: 640,
    descHint: 'e.g. updated FY26 results and the desk normalized P/S',
    body: `<div class="fgrid">
        ${fld('Key (short id)', `<input id="c_key" value="${esc(c.key)}" ${key ? 'disabled' : ''} placeholder="e.g. HDFCBANK">`)}
        ${fld('Company name', `<input id="c_name" value="${esc(c.name)}">`)}
        ${fld('Ticker', `<input id="c_ticker" value="${esc(c.ticker || '')}">`)}
        ${fld('Status', `<select id="c_listed" onchange="document.getElementById('listedbox').style.display=this.value==='1'?'':'none';document.getElementById('unlistedbox').style.display=this.value==='1'?'none':''"><option value="1" ${c.listed ? 'selected' : ''}>Listed (live quotes)</option><option value="0" ${!c.listed ? 'selected' : ''}>Unlisted / private</option></select>`)}
        ${fld('Sector', `<input id="c_sector" value="${esc(c.sector_manual || '')}" placeholder="blank = from Yahoo">`)}
      </div>
      <div class="dsec"><span class="lbl">Earnings outlook</span><div class="fgrid">
        ${fld('Outlook', `<select id="o_val"><option value="">Not set</option>${['Improving', 'Stable', 'Softening'].map(x => `<option ${ol.value === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`, '', ol.set_at ? `set by ${esc(ol.set_by || '')}, ${dShort(ol.set_at)}` : '')}
        ${fld('One-line reason', `<input id="o_reason" value="${esc(ol.reason || '')}">`)}
      </div></div>
      <div class="dsec"><span class="lbl">Latest updates · 5-6 points, client language</span>
        <div class="fgrid" style="margin-bottom:12px">${fld('As of', `<input id="u_asof" type="date" value="${esc(lu.as_of || '')}">`, '', lu.written_by ? `last written by ${esc(lu.written_by)}` : '')}</div>
        <div id="upts">${(lu.points || []).map(pointBlock).join('')}</div>
        <button class="ql" type="button" onclick="if(document.querySelectorAll('#upts .upt').length<6)document.getElementById('upts').insertAdjacentHTML('beforeend', pointBlock({}, Date.now()))">New point</button>
        <div class="fgrid" style="margin-top:16px">${fld('Why the stock moved · shown when the 1-month move is beyond ±10% or the stock is 20%+ below its high', `<textarea id="u_why">${esc((lu.why_moved || {}).text || '')}</textarea>`, 'full')}</div></div>
      <div id="listedbox" class="dsec" style="${c.listed ? '' : 'display:none'}"><span class="lbl">Market and model inputs</span><div class="fgrid">
        ${fld('Yahoo symbol', `<div style="display:flex;gap:8px"><input id="c_yahoo" value="${esc(c.yahoo_symbol || '')}" style="flex:1"><button class="btn sm" type="button" onclick="checkSymbol()">Test</button></div>`, '', '<span id="symres">NSE names end in .NS</span>')}
        ${fld('Exchange', `<input id="c_exch" value="${esc(c.exchange || '')}" list="exch"><datalist id="exch"><option>NSE</option><option>BSE</option><option>NASDAQ</option><option>NYSE</option></datalist>`)}
        ${fld('Currency', `<select id="c_ccy"><option ${c.currency === 'INR' ? 'selected' : ''}>INR</option><option ${c.currency === 'USD' ? 'selected' : ''}>USD</option></select>`)}
        ${fld('Figures unit', `<select id="c_unit"><option ${c.revenue_unit === 'Rs cr' ? 'selected' : ''}>Rs cr</option><option ${c.revenue_unit === 'USD mn' ? 'selected' : ''}>USD mn</option></select>`)}
        ${fld('Earnings growth estimate', `<input id="c_growth" type="number" step="any" value="${c.growth_estimate ?? ''}">`, '', 'a fraction, e.g. 0.15 (research input)')}
        ${fld('Desk normalized P/S (PR)', `<input id="c_npr" type="number" step="any" value="${c.normalized_pr ?? ''}">`)}
        ${fld('Desk normalized P/E', `<input id="c_npe" type="number" step="any" value="${c.normalized_pe ?? ''}">`)}
        ${fld('TTM revenue (unit)', `<input id="c_rev" type="number" step="any" value="${c.ttm_revenue ?? ''}">`)}
        ${fld('TTM profit (unit)', `<input id="c_pat" type="number" step="any" value="${c.ttm_pat ?? ''}">`)}
      </div></div>
      <div id="unlistedbox" class="dsec" style="${c.listed ? 'display:none' : ''}"><span class="lbl">Valuation mark</span><div class="fgrid">
        ${fld('Valuation (₹ cr)', `<input id="m_val" type="number" step="any" value="${m.valuation_cr ?? ''}">`)}
        ${fld('Price per share (₹)', `<input id="m_px" type="number" step="any" value="${m.price ?? ''}">`)}
        ${fld('As of', `<input id="m_asof" type="date" value="${esc(m.asof || '')}">`)}
        ${fld('Note', `<input id="m_note" value="${esc(m.note || '')}">`)}
      </div></div>
      <div class="dsec"><span class="lbl">Research text · one point per line, "## " for a sub-heading</span><div class="fgrid">
        ${ta('c_about', 'About the company', c.about)}
        ${ta('c_seg', 'Business segments · "Name - 40%" draws the mix bar', c.segments)}
        ${ta('c_hi', 'Recent results', c.highlights)}
        ${ta('c_notes', 'Desk notes', c.notes)}
        ${fld('Sources · label | url per line', `<textarea id="c_src" style="min-height:60px">${esc(c.sources.map(s => s.label + ' | ' + s.url).join('\n'))}</textarea>`, 'full')}
      </div></div>
      <div class="dsec"><span class="lbl">Financials · ${esc(c.revenue_unit || '')}; growth and margins as fractions</span>
        <div class="tw"><table class="grid-edit" id="mgrid"><thead><tr><th>Particulars</th>${c.metrics.periods.map(p => `<th><input class="mid" name="m_period" value="${esc(p)}"></th>`).join('')}<th>CAGR</th><th></th></tr></thead><tbody>${c.metrics.rows.map(mrow).join('')}</tbody></table></div>
        <div style="display:flex;gap:16px;margin-top:10px"><button class="ql" type="button" onclick="metricRow()">New row</button><button class="ql" type="button" onclick="metricPeriod()">New period</button></div></div>
      <div class="dsec"><span class="lbl">Valuation multiples · PE and PR (P/S)</span>
        <div class="tw"><table class="grid-edit" id="vgrid"><thead><tr><th></th><th>At research</th><th>2-yr avg</th><th>5-yr avg</th><th>Normalized</th>${c.valuations.history_labels.map(h => `<th><input class="mid" name="v_hl" value="${esc(h)}"></th>`).join('')}<th></th></tr></thead><tbody>${c.valuations.rows.map(vrow).join('')}</tbody></table></div>
        <div style="display:flex;gap:16px;margin-top:10px"><button class="ql" type="button" onclick="valRow()">New row</button><button class="ql" type="button" onclick="valHist()">New history column</button></div></div>`,
    onSave: desc => saveCompany(key || '', desc, c),
  });
}
const DEL_TD = `<td><button class="ql danger" type="button" onclick="this.closest('tr').remove()">×</button></td>`;
function metricRow(){ const n = $$('#mgrid thead input[name=m_period]').length; $('#mgrid tbody').insertAdjacentHTML('beforeend', `<tr><td><input class="wide" name="m_label" placeholder="label"></td>${Array.from({length: n}, () => '<td><input name="m_v" type="number" step="any"></td>').join('')}<td><input class="mid" name="m_cagr" type="number" step="any"></td>${DEL_TD}</tr>`); }
function metricPeriod(){ const hr = $('#mgrid thead tr'); hr.children[hr.children.length - 2].insertAdjacentHTML('beforebegin', '<th><input class="mid" name="m_period" placeholder="FY27"></th>'); $$('#mgrid tbody tr').forEach(tr => tr.children[tr.children.length - 2].insertAdjacentHTML('beforebegin', '<td><input name="m_v" type="number" step="any"></td>')); }
function valRow(){ const n = $$('#vgrid thead input[name=v_hl]').length; $('#vgrid tbody').insertAdjacentHTML('beforeend', `<tr><td><input class="mid" name="v_label" placeholder="PB"></td><td><input class="mid" name="v_current" type="number" step="any"></td><td><input class="mid" name="v_avg2" type="number" step="any"></td><td><input class="mid" name="v_avg5" type="number" step="any"></td><td><input class="mid" name="v_norm" type="number" step="any"></td>${Array.from({length: n}, () => '<td><input class="mid" name="v_h" type="number" step="any"></td>').join('')}${DEL_TD}</tr>`); }
function valHist(){ const hr = $('#vgrid thead tr'); hr.children[hr.children.length - 1].insertAdjacentHTML('beforebegin', '<th><input class="mid" name="v_hl" placeholder="FY20"></th>'); $$('#vgrid tbody tr').forEach(tr => tr.children[tr.children.length - 1].insertAdjacentHTML('beforebegin', '<td><input class="mid" name="v_h" type="number" step="any"></td>')); }
async function checkSymbol(){
  const s = $('#c_yahoo').value.replace(EDGE_WS, ''); const el = $('#symres'); el.textContent = 'checking…';
  try{ const r = await api('/api/symbol_check?symbol=' + encodeURIComponent(s)); el.innerHTML = r.ok ? `<span class="ok">Found: ${esc(r.quote.currency)} ${fmtN(r.quote.price)} · 52-week high ${fmtN(r.quote.high52)}</span>` : `<span class="neg">${esc(r.error)}</span>`; }
  catch(e){ el.textContent = e.message; }
}
async function saveCompany(key, desc, orig){
  const v = id => $('#' + id).value;
  const k = (key || v('c_key')).replace(EDGE_WS, '').toUpperCase().replace(/[^A-Z0-9&.-]/g, '');
  if(!k) throw new Error('A key is required');
  const periods = $$('#mgrid thead input[name=m_period]').map(i => i.value);
  const mrows = $$('#mgrid tbody tr').map(tr => ({label: $('[name=m_label]', tr).value, values: $$('[name=m_v]', tr).map(i => i.value), cagr: $('[name=m_cagr]', tr).value}));
  const hl = $$('#vgrid thead input[name=v_hl]').map(i => i.value);
  const vrows = $$('#vgrid tbody tr').map(tr => ({label: $('[name=v_label]', tr).value, current: $('[name=v_current]', tr).value, avg2: $('[name=v_avg2]', tr).value, avg5: $('[name=v_avg5]', tr).value, normalized: $('[name=v_norm]', tr).value, history: $$('[name=v_h]', tr).map(i => i.value)}));
  const body = {name: v('c_name'), ticker: v('c_ticker'), listed: v('c_listed') === '1', yahoo_symbol: v('c_yahoo'), exchange: v('c_exch'), currency: v('c_ccy'), revenue_unit: v('c_unit'),
    sector: v('c_sector'), growth_estimate: v('c_growth'), normalized_pr: v('c_npr'), normalized_pe: v('c_npe'), ttm_revenue: v('c_rev'), ttm_pat: v('c_pat'),
    about: v('c_about'), segments: v('c_seg'), highlights: v('c_hi'), notes: v('c_notes'),
    sources: v('c_src').split('\n').map(l => { const [label, ...u] = l.split('|'); return {label: (label || '').replace(EDGE_WS, ''), url: u.join('|').replace(EDGE_WS, '')}; }),
    metrics: {periods, rows: mrows}, valuations: {history_labels: hl, rows: vrows},
    manual: {valuation_cr: v('m_val'), price: v('m_px'), asof: v('m_asof'), note: v('m_note')}, desc};
  if(!body.listed) body.exchange = 'Unlisted';
  // latest updates and the outlook are sent only when they changed, so who wrote them stays accurate
  const points = $$('#upts .upt').map(b => ({headline: $('[name=u_head]', b).value, explanation: $('[name=u_expl]', b).value, impact: $('[name=u_imp]', b).value,
    sources: $('[name=u_src]', b).value.split('\n').map(l => { const [label, url, date] = l.split('|').map(x => (x || '').replace(EDGE_WS, '')); return {label, url, date}; }).filter(s => s.url)}))
    .filter(p => p.headline.replace(EDGE_WS, '') || p.explanation.replace(EDGE_WS, ''));
  const lu = orig.latest_updates || {};
  const oldPts = JSON.stringify((lu.points || []).map(p => ({headline: p.headline, explanation: p.explanation, impact: p.impact, sources: (p.sources || []).map(s => ({label: s.label, url: s.url, date: s.date || ''}))})));
  const newPts = JSON.stringify(points.map(p => ({...p, sources: p.sources.map(s => ({label: s.label, url: s.url, date: s.date || ''}))})));
  const why = v('u_why').replace(EDGE_WS, '');
  if(oldPts !== newPts || why !== ((lu.why_moved || {}).text || '') || (v('u_asof') || '') !== (lu.as_of || '')){
    body.latest_updates = {points, as_of: v('u_asof') || null, why_moved: why};
  }
  const ol = orig.earnings_outlook || {};
  if(v('o_val') !== (ol.value || '') || v('o_reason').replace(EDGE_WS, '') !== (ol.reason || '')) body.earnings_outlook = {value: v('o_val'), reason: v('o_reason')};
  await api('/api/companies/' + encodeURIComponent(k), {method: 'POST', body: JSON.stringify(body)});
  Object.keys(CACHE.hist).filter(x => x.startsWith(k + '|')).forEach(x => delete CACHE.hist[x]);
  CACHE.brief = null; CACHE.pool = {};
  closeDrawer(); await load(); location.hash = '#/company/' + encodeURIComponent(k); route(true); toast('Research saved');
}
async function deleteCompany(key){
  if(!confirm('Delete this company and its research? The current file is kept as a previous version.')) return;
  try{ await api('/api/companies/' + encodeURIComponent(key), {method: 'DELETE'}); await load(); location.hash = '#/companies'; toast('Deleted'); } catch(e){ toast(e.message); }
}
