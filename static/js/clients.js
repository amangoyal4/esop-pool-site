// CLIENTS - the people view: the list grouped by BH, the client page (a one-page conversation brief) and the
// client + holdings editor (drawer). The data key for the business head stays `team`; the UI calls it BH (business head).
'use strict';
const cfilt = {rm: '', q: '', sort: 'live_value_cr', dir: -1};
ROUTES.clients = {nav: 'clients', view: viewClients, after: () => paintClientsBody()};
ROUTES.client = {nav: 'clients', view: viewClient, after: afterClient};
const concentrated = v => isNum(v) && v >= S.settings.concentration_threshold;

async function discussionCounts(){
  try{ const b = await loadBrief(''); const out = {};
    for(const d of b.discussion || []) for(const c of d.clients || []) out[c.client_id] = (out[c.client_id] || 0) + 1;
    return out; } catch(e){ return {}; }
}
function viewClients(){
  return `<div class="phead"><div><div class="eyebrow">Clients · ${S.clients.length} · ${S.kpis.teams.length} BHs</div><h1 class="title">Clients</h1>
      <div class="lede">Each client's ESOPs against their PMS assets, by business head.</div></div>
      <div class="right"><button class="btn primary" onclick="editClient(null)">New client</button></div></div>
    <div class="filters">
      <select aria-label="BH" onchange="cfilt.rm=this.value;paintClientsBody()"><option value="">All BHs</option>${S.kpis.teams.map(t => `<option ${cfilt.rm === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <input class="search" type="search" placeholder="Search client or company" value="${esc(cfilt.q)}" oninput="cfilt.q=this.value;paintClientsBody()">
      <span class="count" id="clcount"></span>
    </div><div id="clbody"></div>`;
}
const CL_COLS = [['name', 'Client'], ['aum_cr', 'PMS AUM', 1], ['live_value_cr', 'ESOP value', 1], ['pct_of_aum', 'ESOP as % of AUM', 1], ['n_holdings', 'Holdings', 1], ['disc', 'For discussion', 1]];
async function paintClientsBody(){
  const el = $('#clbody'); if(!el) return;
  const counts = await discussionCounts();
  if(!$('#clbody')) return;
  const q = cfilt.q.toLowerCase();
  const rows = S.clients.filter(c => (!cfilt.rm || c.team === cfilt.rm) && (!q || (c.name + ' ' + c.holdings.map(h => h.company_name).join(' ')).toLowerCase().includes(q)))
    .map(c => ({...c, disc: counts[c.id] || 0}));
  $('#clcount').textContent = `${rows.length} of ${S.clients.length} clients`;
  const groups = {};
  rows.forEach(c => (groups[c.team || 'No BH'] = groups[c.team || 'No BH'] || []).push(c));
  const val = (c, k) => c[k];
  const sorter = (a, b) => { const x = val(a, cfilt.sort), y = val(b, cfilt.sort);
    if(x == null && y == null) return 0; if(x == null) return 1; if(y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * cfilt.dir; };
  const th = CL_COLS.map(([k, l, n]) => `<th class="${n ? 'num' : ''} ${cfilt.sort === k ? 'sorted' : ''}" data-cs="${k}">${l}${cfilt.sort === k ? `<span class="ar">${cfilt.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('');
  const thr = S.settings.concentration_threshold;
  el.innerHTML = `<div class="tw"><table class="tbl clients"><thead><tr>${th}</tr></thead>${Object.entries(groups).sort((a, b) => sum(b[1], c => c.live_value_cr) - sum(a[1], c => c.live_value_cr)).map(([rm, list]) => `
    <tbody><tr class="grp"><td colspan="${CL_COLS.length}"><span class="serif">${esc(rm)}</span><span class="hint">${list.length} client${list.length === 1 ? '' : 's'} · ${fmtCr(sum(list, c => c.live_value_cr), 1)} of ESOPs</span></td></tr>
    ${list.sort(sorter).map(c => { const p = c.pct_of_aum;
      return `<tr class="click" data-href="#/client/${encodeURIComponent(c.id)}"><td><span class="nm">${esc(c.name)}</span></td><td class="num">${fmtCr(c.aum_cr)}</td><td class="num">${fmtCr(c.live_value_cr)}</td>
        <td class="num"><span class="gauge" title="${isNum(p) ? fmtN(p * 100, 0) + '% of AUM' : 'AUM not set'}"><i class="${concentrated(p) ? 'hi' : ''}" style="width:${isNum(p) ? Math.min(100, p * 100).toFixed(0) : 0}%"></i><b style="left:${(thr * 100).toFixed(0)}%"></b></span><span class="${concentrated(p) ? 'neg' : ''}">${isNum(p) ? fmtN(p * 100, 0) + '%' : '–'}</span></td>
        <td class="num">${c.n_holdings}</td><td class="num">${c.disc ? `<span class="chip rule">${c.disc} this week</span>` : '<span class="mut">–</span>'}</td></tr>`; }).join('')}</tbody>`).join('')}</table></div>
    <p class="hint" style="margin-top:12px">The gauge runs to 100% of PMS AUM; the tick marks ${fmtPct(thr, 0)}, the concentration level. "For discussion" counts this client's names in the Weekly review's For discussion list.</p>`;
  $$('th[data-cs]', el).forEach(t => t.onclick = () => { const k = t.dataset.cs; if(cfilt.sort === k) cfilt.dir *= -1; else { cfilt.sort = k; cfilt.dir = k === 'name' ? 1 : -1; } paintClientsBody(); });
}

// ---------------------------------------------------------------- client page (conversation brief)
const clState = {range: '1y'};
function viewClient(id){
  const c = client(id); if(!c) return `<div class="empty">Client not found. <a href="#/clients">All clients</a></div>`;
  const cols = [
    {k: 'company_name', label: 'Company', fmt: (v, h) => `<a class="nm" href="#/company/${encodeURIComponent(h.company)}">${esc(v)}</a>`},
    {k: 'amount_cr', label: 'Amount', num: true, fmt: v => fmtCr(v)},
    {k: 'live_value_cr', label: 'Live value', num: true, fmt: (v, h) => fmtCr(v) + (h.value_basis && h.value_basis !== 'amount x price/ref' ? `<div class="hint">${esc(h.value_basis)}</div>` : '')},
    {k: 'pct_of_aum', label: '% of AUM', num: true, fmt: v => isNum(v) ? fmtN(v * 100, 0) + '%' : '–', cls: v => concentrated(v) ? 'neg' : ''},
    {k: 'change_1m', label: '1M', num: true, fmt: v => fmtPct(v, 1, true), cls: v => cls(v)},
    {k: 'down52', label: 'vs 52-wk high', num: true, fmt: (v, h) => h.listed ? fmtPct(v, 1, true) : '<span class="mut">unlisted</span>', cls: v => cls(v)},
    {k: 'reval_pr', label: 'Re-val / De-val', num: true, fmt: v => reval(v)},
    {k: 'vesting', label: 'Vesting · note', get: h => [h.vesting, h.note].filter(Boolean).join(' · '), fmt: v => v ? `<span class="small">${esc(v)}</span>` : '<span class="mut">–</span>'},
  ];
  const conc = S.alerts.filter(a => a.client === id && a.kind === 'concentration');
  const changed = c.holdings.slice().sort((a, b) => (b.live_value_cr || 0) - (a.live_value_cr || 0)).map(h => {
    const co = comp(h.company) || {}; const pts = ((co.latest_updates || {}).points || []).slice(0, 2);
    return `<li><div class="ch"><a class="nm" href="#/company/${encodeURIComponent(h.company)}">${esc(h.company_name)}</a><span class="hint">${fmtCr(h.live_value_cr, 2)}</span><span class="olw">Earnings outlook ${outlookTag(co.earnings_outlook)}</span></div>
      ${pts.length ? `<ul class="uplist">${pts.map(p => `<li>${esc(p.headline)} ${impactTag(p.impact)}</li>`).join('')}</ul>` : '<p class="mut" style="margin:4px 0 0">No updates written yet.</p>'}</li>`; }).join('');
  return `<div class="phead"><div><div class="eyebrow"><a href="#/clients">Clients</a> · BH ${esc(c.team || 'not set')}</div><h1 class="title">${esc(c.name)}</h1>
      <div class="lede">PMS AUM ${fmtCr(c.aum_cr)} · ${c.holdings.length} ESOP holding${c.holdings.length === 1 ? '' : 's'} · updated ${dShort(c.updated_at)}${c.notes ? `<br>${esc(c.notes)}` : ''}</div></div>
      <div class="right"><button class="ql danger" onclick="deleteClient('${esc(c.id)}')">Delete</button><button class="btn primary" onclick="editClient('${esc(c.id)}')">Edit client and holdings</button></div></div>
    <div id="clkpis">${clientKpis(c, null)}</div>
    ${sec('ESOP value over time', `<div class="panel cpanel" style="margin-bottom:0"><div class="ctop"><span class="hint">This client's ESOP value, rebuilt from daily closes</span>
        <div class="ranges" id="clranges">${['6m', '1y', '5y'].map(r => `<button class="${r === clState.range ? 'on' : ''}" onclick="clState.range='${r}';paintClientLine('${esc(id)}')">${r.toUpperCase()}</button>`).join('')}</div></div>
        <div class="chart small" id="clline"></div><p class="ccap">Uses today's holdings throughout; unlisted marks are held flat.</p></div>`)}
    ${sec("What's changed in your holdings", `<ul class="changed">${changed}</ul>`)}
    ${sec('Holdings', table('ch-' + id, c.holdings, cols, {sort: 'live_value_cr'}))}
    ${conc.length ? sec('Concentration', noteList(conc)) : ''}`;
}
function clientKpis(c, s){
  return kpis([
    ['ESOP value', fmtCr(c.live_value_cr), `entered ${fmtCr(c.exposure_cr)}`],
    ['ESOP as % of AUM', isNum(c.pct_of_aum) ? fmtN(c.pct_of_aum * 100, 0) + '%' : '–', 'held outside the PMS', concentrated(c.pct_of_aum) ? 'neg' : ''],
    ['Past week', s ? signedCr(s.week_cr) : '…', 'change in ESOP value', s ? cls(s.week_cr) : ''],
    ['Past month', s ? signedCr(s.m1_cr) : '…', 'change in ESOP value', s ? cls(s.m1_cr) : ''],
    ['Below 52-week highs', s ? fmtCr(s.below_high_cr) : '…', 'value short of each holding at its high'],
  ]);
}
async function afterClient(id){
  const c = client(id); if(!c) return;
  paintClientLine(id);
  try{ const s = await api(`/api/client/${encodeURIComponent(id)}/summary`); if($('#clkpis')) $('#clkpis').innerHTML = clientKpis(c, s); } catch(e){}
}
async function paintClientLine(id){
  $$('#clranges button').forEach(b => b.classList.toggle('on', b.textContent.toLowerCase() === clState.range));
  const el = $('#clline'); if(!el) return;
  try{ const d = await api(`/api/value_history?client=${encodeURIComponent(id)}&range=${clState.range}`); destroyLines(); lineChart($('#clline'), d.points); }
  catch(e){ el.innerHTML = `<div class="ld">${esc(e.message)}</div>`; }
}

// ---------------------------------------------------------------- editor
function holdBlock(h, i){
  const opts = S.companies.slice().sort((a, b) => a.name.localeCompare(b.name)).map(x => `<option value="${esc(x.key)}" ${x.key === h.company ? 'selected' : ''}>${esc(x.name)}${x.listed ? '' : ' (unlisted)'}</option>`).join('');
  return `<div class="hold" data-i="${i}">
    <div class="hh"><span class="lbl">Holding</span><button class="ql danger" type="button" onclick="this.closest('.hold').remove()">Remove</button></div>
    <div class="fgrid">
      ${fld('Company', `<select name="company"><option value="">Choose a company</option>${opts}</select>`, 'full')}
      ${fld('Amount (₹ cr)', `<input name="amount_cr" type="number" step="0.01" value="${h.amount_cr ?? ''}">`)}
      ${fld('Reference price', `<input name="ref_price" type="number" step="0.01" value="${h.ref_price ?? ''}" placeholder="today's price">`)}
      ${fld('Reference date', `<input name="ref_date" type="date" value="${h.ref_date ?? ''}">`)}
      ${fld('Units', `<input name="units" type="number" step="1" value="${h.units ?? ''}">`)}
      ${fld('Grant price', `<input name="grant_price" type="number" step="0.01" value="${h.grant_price ?? ''}">`)}
      ${fld('Vesting', `<input name="vesting" value="${esc(h.vesting || '')}" placeholder="e.g. 25% a year to 2028">`)}
      ${fld('Note', `<input name="note" value="${esc(h.note || '')}">`, 'full')}
    </div></div>`;
}
function editClient(id){
  const c = id ? client(id) : {id: '', name: '', team: '', aum_cr: null, notes: '', holdings: []};
  openDrawer({
    title: id ? c.name : 'New client', eyebrow: id ? 'Edit client and holdings' : 'New client', width: 620,
    descHint: 'e.g. the Q3 vesting for Amazon',
    body: `<div class="fgrid">
        ${fld('Client name', `<input id="f_name" value="${esc(c.name)}">`, 'full')}
        ${fld('BH', `<input id="f_team" list="rms" value="${esc(c.team || '')}"><datalist id="rms">${S.kpis.teams.map(t => `<option value="${esc(t)}">`).join('')}</datalist>`)}
        ${fld('PMS AUM (₹ cr)', `<input id="f_aum" type="number" step="0.01" value="${c.aum_cr ?? ''}">`)}
        ${fld('Notes', `<input id="f_notes" value="${esc(c.notes || '')}">`, 'full')}
      </div>
      <div class="dsec"><span class="lbl">ESOP holdings</span>
        <p class="hint" style="margin:-6px 0 14px">Amount is the ESOP value in ₹ cr as entered. Leave the reference price blank to pin today's live price; the live value is then amount × live price ÷ reference price. With units entered, the value is units × live price (US names at live USD/INR).</p>
        <div id="hrows">${c.holdings.map(holdBlock).join('')}</div>
        <button class="btn sm" type="button" onclick="document.getElementById('hrows').insertAdjacentHTML('beforeend', holdBlock({}, Date.now()))">New holding</button></div>`,
    onSave: async desc => {
      const holdings = $$('#hrows .hold').map(r => Object.fromEntries($$('[name]', r).map(i => [i.name, i.value])));
      const body = {id: id || undefined, name: $('#f_name').value, team: $('#f_team').value, aum_cr: $('#f_aum').value, notes: $('#f_notes').value, holdings, desc};
      const r = await api('/api/clients', {method: 'POST', body: JSON.stringify(body)});
      CACHE.pool = {}; CACHE.brief = null;
      closeDrawer(); await load(); location.hash = '#/client/' + encodeURIComponent(r.id); route(true); toast('Client saved');
    },
  });
}
async function deleteClient(id){
  const c = client(id); if(!confirm(`Delete ${c.name} and all ${c.holdings.length} holdings? The current file is kept as a previous version.`)) return;
  try{ await api('/api/clients/' + encodeURIComponent(id), {method: 'DELETE'}); await load(); location.hash = '#/clients'; toast('Client deleted'); } catch(e){ toast(e.message); }
}
