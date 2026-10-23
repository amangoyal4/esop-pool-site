// POOL - the aggregate view across all clients: mostly charts, no client lists, no editors.
// Numbers use the Weekly review's Thursday-close basis by default, or live prices (toggle in the header).
'use strict';
const poolState = {basis: 'thu', range: '1y', contrib: 'week'};
ROUTES.pool = {nav: 'pool', view: () => `<div id="poolpage"><div class="phead"><div><div class="eyebrow">Pool</div><h1 class="title">The pool</h1></div></div><p class="mut">Loading…</p></div>`,
  after: () => loadPool()};

async function loadPool(){
  const k = poolState.basis;
  try{
    let d = CACHE.pool[k];
    if(!d || Date.now() - d._at > 60 * 1000){ d = await api('/api/pool?basis=' + k); d._at = Date.now(); CACHE.pool[k] = d; }
    renderPool(d);
  } catch(e){ const el = $('#poolpage'); if(el) el.innerHTML = `<div class="phead"><div><div class="eyebrow">Pool</div><h1 class="title">The pool</h1><div class="lede">${esc(e.message)}</div></div></div>`; }
}
function setBasis(b){ poolState.basis = b; destroyLines(); loadPool(); }

function renderPool(d){
  const el = $('#poolpage'); if(!el) return;
  const k = d.kpis;
  const largest = d.companies[0];
  el.innerHTML = `<div class="phead"><div><div class="eyebrow">Pool · ${esc(d.basis_label)}</div><h1 class="title">The pool</h1>
      <div class="lede">Client ESOPs across every client and BH, as one book. ${d.basis === 'thu' ? "Values at Thursday's close, the Weekly review's basis." : 'Values at live prices.'}</div></div>
      <div class="right"><div class="seg" role="group" aria-label="Basis"><button class="${d.basis === 'thu' ? 'on' : ''}" onclick="setBasis('thu')">Thursday close</button><button class="${d.basis === 'live' ? 'on' : ''}" onclick="setBasis('live')">Live</button></div></div></div>
    ${kpis([
      ['Total ESOP value', fmtCr(k.total_cr, 1), d.basis === 'thu' ? "at Thursday's close" : 'at live prices'],
      ['Companies', String(k.n_companies), `${d.companies.filter(c => !c.listed).length} unlisted`],
      ['Clients', String(k.n_clients), `${S.kpis.teams.length} BHs`],
      ['USD · INR', `${fmtPct(k.usd_share, 0)} <span class="of">· ${fmtPct(isNum(k.usd_share) ? 1 - k.usd_share : null, 0)}</span>`, 'share of value, US vs India and unlisted'],
      ['20%+ below 52-week high', fmtPct(k.below20_share, 0), `${fmtCr(k.below20_cr, 1)} of value`],
    ])}
    ${sec('Pool value over time', `<div class="panel cpanel" style="margin-bottom:0"><div class="ctop"><span class="hint">Total ESOP value, rebuilt from daily closes</span>
        <div class="ranges">${['6m', '1y', '5y'].map(r => `<button class="${r === poolState.range ? 'on' : ''}" onclick="poolState.range='${r}';paintValueLine()">${r.toUpperCase()}</button>`).join('')}</div></div>
        <div class="chart small" id="poolline"></div>
        <p class="ccap">Uses current holdings throughout: each company's value today scaled by its close on each day; unlisted marks are held flat. It shows how today's book would have moved, not past holdings.</p></div>`)}
    ${sec('Exposure', `<div class="treemap" id="treemap"></div>
        <div class="tmkey"><span>Tile area = ESOP value · colour = distance below the 52-week high</span><span class="ramp"><i style="background:#ECE7DE"></i>at the high<i style="background:#C9A79F"></i>−25%<i style="background:#8A3A32"></i>−50% or more</span></div>`)}
    ${sec('Exposure by sector, market and BH', `<div class="allocs">${barSet('Sector', d.by_sector, k.total_cr)}${barSet('Market', d.by_market, k.total_cr)}${barSet('BH', d.by_rm, sum(d.by_rm, x => x[1]))}</div>`)}
    ${sec('Contribution to change', `<div class="seg small" role="group" style="margin-bottom:14px"><button class="${poolState.contrib === 'week' ? 'on' : ''}" onclick="poolState.contrib='week';paintWaterfall()">${d.basis === 'thu' ? 'Brief week' : 'Past week'}</button><button class="${poolState.contrib === 'm1' ? 'on' : ''}" onclick="poolState.contrib='m1';paintWaterfall()">Past month</button></div><div id="waterfall"></div>`)}
    ${sec('Valuation distribution', `<div id="buckets"></div><p class="hint" style="margin-top:8px">ESOP value by Re-val / De-val on P/S (desk normalized ÷ current − 1). Left: trading above the desk normalized multiple; right: below it.</p>`)}
    ${sec('Crowding', `<div class="wk2"><div>${table('pool-crowd', d.crowding, [
        {k: 'name', label: 'Held by the most clients', fmt: (v, r) => `<a class="nm" href="#/company/${encodeURIComponent(r.key)}">${esc(v)}</a><span class="tk">${esc(r.ticker)}</span>`},
        {k: 'n_clients', label: 'Clients', num: true},
        {k: 'value_cr', label: 'ESOP value', num: true, fmt: v => fmtCr(v, 1)},
        {k: 'share', label: 'Share of pool', num: true, get: r => k.total_cr ? r.value_cr / k.total_cr : null, fmt: v => fmtPct(v, 1)},
      ], {sort: 'n_clients'})}</div>
      <div class="bigstat"><div class="lbl">Largest single-company share</div><div class="serif bigv">${fmtPct(largest && k.total_cr ? largest.value_cr / k.total_cr : null, 1)}</div>
        <div class="hint">${largest ? `<a href="#/company/${encodeURIComponent(largest.key)}">${esc(largest.name)}</a>, ${fmtCr(largest.value_cr, 1)} across ${largest.n_clients} client${largest.n_clients === 1 ? '' : 's'}` : ''}</div>
        <div class="lbl" style="margin-top:22px">Top five companies</div><div class="serif bigv sm">${fmtPct(k.total_cr ? sum(d.companies.slice(0, 5), c => c.value_cr) / k.total_cr : null, 0)}</div><div class="hint">of the pool</div></div></div>`)}`;
  $('#poolpage').insertAdjacentHTML('beforeend', priceChangesHtml());
  paintValueLine(); paintTreemap(d); paintWaterfall(); paintBuckets(d);
  if(!renderPool._ro){ renderPool._ro = new ResizeObserver(() => { const dd = CACHE.pool[poolState.basis]; if(dd && $('#treemap')){ paintTreemap(dd); paintWaterfall(); paintBuckets(dd); } }); }
  renderPool._ro.disconnect(); if($('#treemap')) renderPool._ro.observe($('#treemap'));
}
function barSet(title, rows, total){
  const mx = Math.max(...rows.map(r => r[1]), 0.0001);
  return `<div class="alloc"><div class="lbl" style="margin-bottom:10px">${title}</div><ul class="hbars">${rows.map(([g, v]) => `<li><span class="n">${esc(g)}</span>
    <span class="b"><i style="width:${(v / mx * 100).toFixed(1)}%"></i></span><span class="v">${fmtCr(v, 1)}</span><span class="p">${total ? Math.round(v / total * 100) : 0}%</span></li>`).join('')}</ul></div>`;
}
async function paintValueLine(){
  $$('#poolpage .ranges button').forEach(b => b.classList.toggle('on', b.textContent.toLowerCase() === poolState.range));
  const el = $('#poolline'); if(!el) return;
  const ck = 'pool|' + poolState.range;
  try{
    let d = CACHE.vh[ck]; if(!d || Date.now() - d._at > 10 * 60 * 1000){ d = await api('/api/value_history?range=' + poolState.range); d._at = Date.now(); CACHE.vh[ck] = d; }
    destroyLines(); lineChart($('#poolline'), d.points);
  } catch(e){ el.innerHTML = `<div class="ld">${esc(e.message)}</div>`; }
}

// squarified treemap (Bruls, Huizing, van Wijk) on absolutely positioned tiles
function squarify(items, x, y, w, h){
  const out = []; const total = sum(items, i => i.v); if(!total) return out;
  const scale = w * h / total; let rest = items.map(i => ({...i, a: i.v * scale}));
  const worst = (row, side) => { const s = sum(row, r => r.a), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a)); return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn)); };
  while(rest.length){
    const side = Math.min(w, h); let row = [rest[0]]; let i = 1;
    while(i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)){ row.push(rest[i]); i++; }
    const s = sum(row, r => r.a);
    if(w >= h){ const cw = s / h; let cy = y; for(const r of row){ const ch = r.a / cw; out.push({...r, x, y: cy, w: cw, h: ch}); cy += ch; } x += cw; w -= cw; }
    else { const ch = s / w; let cx = x; for(const r of row){ const cw = r.a / ch; out.push({...r, x: cx, y, w: cw, h: ch}); cx += cw; } y += ch; h -= ch; }
    rest = rest.slice(i);
  }
  return out;
}
function tileColour(d){
  const t = isNum(d) ? Math.max(0, Math.min(1, -d / 0.5)) : 0;
  const a = [236, 231, 222], b = [138, 58, 50];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}
function paintTreemap(d){
  const el = $('#treemap'); if(!el) return;
  const W = el.clientWidth, H = W < 600 ? 420 : 440;
  el.style.height = H + 'px';
  const tiles = squarify(d.companies.filter(c => c.value_cr > 0).map(c => ({...c, v: c.value_cr})), 0, 0, W, H);
  el.innerHTML = tiles.map(t => { const dark = isNum(t.down52) && t.down52 < -0.25; const big = t.w > 70 && t.h > 38;
    return `<a class="tile ${dark ? 'dk' : ''}" href="#/company/${encodeURIComponent(t.key)}" style="left:${t.x.toFixed(1)}px;top:${t.y.toFixed(1)}px;width:${Math.max(0, t.w - 2).toFixed(1)}px;height:${Math.max(0, t.h - 2).toFixed(1)}px;background:${t.listed ? tileColour(t.down52) : '#F6F3EE'}"
      title="${esc(t.name)}: ${fmtCr(t.value_cr, 2)}${isNum(t.down52) ? ', ' + fmtPct(t.down52, 0, true) + ' from the 52-week high' : t.listed ? '' : ', unlisted'}">${big ? `<b>${esc(t.ticker)}</b><span>${fmtCr(t.value_cr, 1)}</span>` : (t.w > 34 && t.h > 16 ? `<b>${esc(t.ticker)}</b>` : '')}</a>`; }).join('');
}
function paintWaterfall(){
  const d = CACHE.pool[poolState.basis]; const el = $('#waterfall'); if(!d || !el) return;
  $$('#poolpage .seg.small button').forEach((b, i) => b.classList.toggle('on', (i === 0) === (poolState.contrib === 'week')));
  const key = poolState.contrib === 'week' ? 'week_cr' : 'm1_cr';
  const rows = d.companies.filter(c => isNum(c[key])).sort((a, b) => Math.abs(b[key]) - Math.abs(a[key]));
  const top = rows.slice(0, 8), others = sum(rows.slice(8), c => c[key]);
  const bars = [...top.map(c => ({label: c.ticker, key: c.key, v: c[key]})), {label: 'Others', v: others}];
  const total = sum(bars, b => b.v);
  const W = el.clientWidth, H = 260, L = 8, R = 8, T = 22, B = 46;
  let cum = 0; const steps = bars.map(b => { const s = {...b, from: cum, to: cum + b.v}; cum += b.v; return s; });
  const lo = Math.min(0, ...steps.map(s => Math.min(s.from, s.to))), hi = Math.max(0, ...steps.map(s => Math.max(s.from, s.to)));
  const span = (hi - lo) || 1, y = v => T + (hi - v) / span * (H - T - B);
  const n = steps.length + 1, bw = (W - L - R) / n;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Contribution to change"><line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#D9D0C2"/>`;
  steps.forEach((s, i) => { const x0 = L + i * bw + bw * 0.18, w = bw * 0.64; const y1 = y(Math.max(s.from, s.to)), y2 = y(Math.min(s.from, s.to));
    svg += `<rect x="${x0.toFixed(1)}" y="${y1.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" fill="${s.v >= 0 ? '#2F6B4F' : '#8A3A32'}" opacity="${s.label === 'Others' ? 0.45 : 0.85}"/>
      <text x="${(x0 + w / 2).toFixed(1)}" y="${(s.v >= 0 ? y1 - 5 : y2 + 12).toFixed(1)}" font-size="10" text-anchor="middle" fill="#6F6A63">${s.v >= 0 ? '+' : '−'}${fmtN(Math.abs(s.v), 2)}</text>
      <text x="${(x0 + w / 2).toFixed(1)}" y="${H - B + 18}" font-size="10" text-anchor="middle" fill="#14223A">${esc(W < 520 ? s.label.slice(0, 5) : s.label)}</text>`;
    if(i < steps.length - 1){ const nx = L + (i + 1) * bw + bw * 0.18; svg += `<line x1="${(x0 + w).toFixed(1)}" x2="${nx.toFixed(1)}" y1="${y(s.to).toFixed(1)}" y2="${y(s.to).toFixed(1)}" stroke="#B9AE9C" stroke-dasharray="2 2"/>`; } });
  const tx = L + steps.length * bw + bw * 0.18, tw = bw * 0.64;
  svg += `<rect x="${tx.toFixed(1)}" y="${y(Math.max(0, total)).toFixed(1)}" width="${tw.toFixed(1)}" height="${Math.max(1, Math.abs(y(total) - y(0))).toFixed(1)}" fill="#14223A"/>
    <text x="${(tx + tw / 2).toFixed(1)}" y="${(total >= 0 ? y(total) - 5 : y(total) + 12).toFixed(1)}" font-size="10.5" text-anchor="middle" fill="#14223A">${total >= 0 ? '+' : '−'}${fmtN(Math.abs(total), 2)}</text>
    <text x="${(tx + tw / 2).toFixed(1)}" y="${H - B + 18}" font-size="10" text-anchor="middle" fill="#14223A">Total</text>
    <text x="${L}" y="${H - 6}" font-size="10" fill="#8C7A60">₹ cr · top eight contributors by size, the rest grouped as Others</text></svg>`;
  el.innerHTML = svg;
}
function paintBuckets(d){
  const el = $('#buckets'); if(!el) return;
  const W = el.clientWidth, H = 220, T = 24, B = 40, L = 8, R = 8;
  const bs = d.buckets; const mx = Math.max(...bs.map(b => b.value_cr), 0.0001);
  const bw = (W - L - R) / bs.length;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Valuation distribution">`;
  bs.forEach((b, i) => { const h = b.value_cr / mx * (H - T - B), x0 = L + i * bw + bw * 0.16, w = bw * 0.68, y0 = H - B - h;
    const col = b.label === 'No multiple' ? '#E1DCD4' : i < 2 ? '#8A3A32' : i === 2 ? '#C9A79F' : i === 3 ? '#9DB5A6' : '#2F6B4F';
    svg += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" fill="${col}" opacity="0.85"><title>${esc(b.names.join(', '))}</title></rect>
      <text x="${(x0 + w / 2).toFixed(1)}" y="${(y0 - 6).toFixed(1)}" font-size="10.5" text-anchor="middle" fill="#14223A">${fmtCr(b.value_cr, 1)}</text>
      <text x="${(x0 + w / 2).toFixed(1)}" y="${H - B + 16}" font-size="10" text-anchor="middle" fill="#6F6A63">${esc(W < 520 ? b.label.replace(' to ', '…').replace('Below ', '<').replace('Above ', '>').replace('No multiple', 'n/a') : b.label)}</text>
      <text x="${(x0 + w / 2).toFixed(1)}" y="${H - B + 30}" font-size="9.5" text-anchor="middle" fill="#8C7A60">${b.names.length} name${b.names.length === 1 ? '' : 's'}</text>`; });
  el.innerHTML = svg + '</svg>';
}


// ---- price changes over 1M / 3M / 6M / 1Y, per company and for the pool (value-weighted), below Crowding
function priceChangesHtml(){
  const rows = S.companies.filter(c => c.listed && (c.live_value_cr || 0) > 0)
    .map(c => ({key: c.key, name: c.name, ticker: c.ticker || c.key, value: c.live_value_cr,
                m1: c.live.change_1m, m3: c.live.change_3m, m6: c.live.change_6m, y1: c.live.change_1y}));
  const wavg = f => { const r = rows.filter(x => isNum(x[f])); const v = sum(r, x => x.value); return v ? sum(r, x => x.value * x[f]) / v : null; };
  const pc = v => isNum(v) ? `<span class="${cls(v)}">${fmtPct(v, 1, true)}</span>` : '<span class="mut">–</span>';
  const pool = {m1: wavg('m1'), m3: wavg('m3'), m6: wavg('m6'), y1: wavg('y1')};
  const strip = kpis([['1 month', pc(pool.m1), 'pool, value-weighted'], ['3 months', pc(pool.m3), 'pool, value-weighted'],
                      ['6 months', pc(pool.m6), 'pool, value-weighted'], ['1 year', pc(pool.y1), 'pool, value-weighted']]);
  const cols = [
    {k: 'name', label: 'Company', fmt: (v, r) => `<a class="nm" href="#/company/${encodeURIComponent(r.key)}">${esc(v)}</a><span class="tk">${esc(r.ticker)}</span>`},
    {k: 'value', label: 'ESOP value', num: true, fmt: v => fmtCr(v, 1)},
    {k: 'm1', label: '1 month', num: true, fmt: pc},
    {k: 'm3', label: '3 months', num: true, fmt: pc},
    {k: 'm6', label: '6 months', num: true, fmt: pc},
    {k: 'y1', label: '1 year', num: true, fmt: pc},
  ];
  return sec('Price changes', `<div class="keyrow tight" style="margin-bottom:22px">${strip}</div>${table('pool-chg', rows, cols, {sort: 'value', cls: 'dense'})}
    <p class="hint" style="margin-top:10px">Share-price change to the latest close, in each stock's own currency; the pool figures weight each listed holding by its ESOP value today. Unlisted holdings are left out.</p>`);
}
