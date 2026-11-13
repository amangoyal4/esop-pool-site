// WEEKLY REVIEW - the Friday read for the research desk: one Thursday close to the next (src/brief.py).
// Reading order: KPIs, For discussion, Story against price, The week, What moved and why,
// Near the 52-week high (within 5%), Valuation watch, Next week.
// Written text comes from tools/brief_cli.py; until a block is written it shows its numbers only.
'use strict';
let weekPoll = null;
ROUTES.week = {nav: 'week', view: () => `<div id="weekpage"><div class="phead"><div><div class="eyebrow">Weekly review</div><h1 class="title">Loading the review…</h1></div></div></div>`,
  after: arg => loadWeek(arg)};

async function loadWeek(week){
  try{
    if(!CACHE.briefs || Date.now() - CACHE.briefs._at > 60 * 1000){ CACHE.briefs = await api('/api/briefs'); CACHE.briefs._at = Date.now(); }
    const b = await loadBrief(week || '');
    renderWeek(b, CACHE.briefs.briefs);
    if(b.progress && b.progress.running) pollBuild(week);
  } catch(e){ const el = $('#weekpage'); if(el) el.innerHTML = `<div class="phead"><div><div class="eyebrow">Weekly review</div><h1 class="title">The review could not be loaded</h1><div class="lede">${esc(e.message)}</div></div></div>`; }
}
const whenBuilt = iso => new Date(iso).toLocaleString('en-IN', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false});
function weekHead(b, list, listed, nMat){
  const p = b.progress || {}; const running = p.running;
  const end = b.end_thursday;
  const fri = end ? new Date(Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10) + 1)).toISOString().slice(0, 10) : null;
  const opts = (list || []).map(x => `<option value="${esc(x.week)}" ${x.week === b.week ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
  const sel = opts ? `<select aria-label="Week" onchange="location.hash='#/week/'+this.value">${opts}${(list || []).some(x => x.week === b.week) ? '' : `<option selected>${esc(b.label)}</option>`}</select>` : '';
  const btn = `<button class="ql" ${running ? 'disabled' : ''} onclick="buildBrief('${esc(b.week)}')">${running ? 'Building…' : (b.missing ? 'Build this week' : 'Rebuild')}</button>`;
  return `<div class="phead">
      <div><div class="eyebrow">${fri ? `Review of Friday ${dLong(fri)}` : 'Weekly review'}</div>
        <h1 class="title">${end ? `The week to Thursday ${dLong(end)}` : esc(b.label)}</h1>
        <div class="lede">${b.missing ? 'This week has not been built yet.' : `${nMat} of ${listed} listed holdings moved materially. All figures at Thursday's close, ${dDay(b.start_thursday)} to ${dDay(b.end_thursday)}.`}</div>
        ${b.generated ? `<div class="hint" style="margin-top:6px">Prices and filings as built ${whenBuilt(b.generated)}${(b.narrative || {}).written_at ? ` · text written ${whenBuilt(b.narrative.written_at)}` : ' · text not written yet'}</div>` : ''}</div>
      <div class="right">${sel}${btn}</div></div>
    ${running ? `<div class="progress" title="${esc(p.current || '')}"><span style="width:${p.total ? Math.round(100 * p.step / p.total) : 3}%"></span></div><p class="hint" style="margin:-12px 0 20px">Building · ${esc(p.current || '')} · step ${p.step || 0} of ${p.total || '?'}</p>` : ''}
    ${!running && p.error ? `<div class="note">The last build stopped: ${esc(p.error)}</div>` : ''}
    ${b.outdated ? `<div class="note">This week was built with the earlier engine. Rebuild it to see every section.</div>` : ''}`;
}
const chg3 = st => `<span class="${cls(st.change)}">${fmtPct(st.change, 1, true)}</span> week · <span class="${cls(st.change_1m)}">${fmtPct(st.change_1m, 1, true)}</span> 1M · <span class="${cls(st.change_3m)}">${fmtPct(st.change_3m, 1, true)}</span> 3M`;
const nameCell = (k, st, extra = '') => `<a class="nm" href="#/company/${encodeURIComponent(k)}">${esc(st.name)}</a><span class="tk">${esc(st.ticker)}</span>${extra}`;

// ---------------------------------------------------------------- for discussion
// Forward-looking: the open business question for a client conversation, why it matters now, and what would
// change the picture. The week's price move belongs to "What moved and why", not here.
function discCard(d, n){
  const f = d.facts || {};
  const facts = [f.results ? `Results ${dShort(f.results)}` : '', f.outlook ? `Earnings outlook ${f.outlook.toLowerCase()}` : '',
    isNum(f.reval_ps) ? `Re-val / De-val ${fmtPct(f.reval_ps, 0, true)} on P/S` : ''].filter(Boolean);
  const cl = d.clients || [];
  return `<article class="dcard q">
    <div class="dtop"><div><div class="eyebrow" style="margin-bottom:4px"><a href="#/company/${encodeURIComponent(d.key)}">${esc(d.name)}</a> · ${esc(d.ticker)}</div>
      <h3 class="dq">${n.question ? esc(n.question) : '<span class="mut">The note for this name has not been written yet.</span>'}</h3></div>
      <div class="dval">${fmtCr(d.esop_value_cr, 1)}<div class="s">client ESOPs</div></div></div>
    ${n.question ? `<div class="dnote"><p>${esc(n.why_now)}</p>
      <div class="sub">What would change the picture</div><ul>${(n.watch || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${facts.length ? `<p class="dfacts">${esc(facts.join(' · '))}</p>` : ''}
    <div class="dclients"><span class="lbl">Clients holding it</span> ${cl.slice(0, 4).map(x => `<a href="#/client/${encodeURIComponent(x.client_id)}">${esc(x.client)}</a> ${fmtCr(x.value_cr, 2)}${isNum(x.pct_of_aum) ? ` <span class="${x.pct_of_aum >= S.settings.concentration_threshold ? 'neg' : 'mut'}">${fmtN(x.pct_of_aum * 100, 0)}% of AUM</span>` : ''}`).join(' · ')}${cl.length > 4 ? ` · <span class="mut">+${cl.length - 4}</span>` : ''}</div>
    ${(n.sources || []).length ? `<details class="srcs"><summary>Sources</summary><div>${srcLinks(n.sources)}</div></details>` : ''}
  </article>`;
}
function discussionHtml(list){
  if(!list || !list.length) return '<p class="mut" style="margin:0">Nothing for discussion this week.</p>';
  return `<div class="dgrid">${list.map(d => {
    const f = d.facts || {}; const fired = new Set(d.rules.map(r => r.rule));   // the chips already state these
    const facts = [`Week ${fmtPct(f.change, 1, true)}`, `1M ${fmtPct(f.change_1m, 1, true)}`,
      isNum(f.down52) ? `${fmtPct(Math.abs(f.down52), 0)} below the 52-week high` : '',
      isNum(f.reval_ps) && !fired.has('a') ? `Re-val / De-val ${fmtPct(f.reval_ps, 0, true)} on P/S` : '',
      f.outlook && !fired.has('b') ? `earnings outlook ${f.outlook.toLowerCase()}` : '', f.results && !fired.has('d') ? `results ${dShort(f.results)}` : ''].filter(Boolean).join(' · ');
    const n = d.note || {};
    if(n.question || !(n.lead || n.note)) return discCard(d, n);   // older weeks keep their earlier layout
    const srcs = (n.sources || []).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}${x.date ? ` · ${dShort(x.date)}` : ''}</a>`).join('');
    const note = n.lead
      ? `<p class="lead">${esc(n.lead)}</p>
         <p class="facts">${esc(facts)}.</p>
         ${(n.points || []).length ? `<div class="sub">What came out</div><ul>${n.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
         ${n.context ? `<div class="sub">The backdrop</div><p>${esc(n.context)}</p>` : ''}
         ${n.next ? `<p class="next"><span>Next</span>${esc(n.next)}</p>` : ''}
         ${srcs ? `<details class="srcs"><summary>Sources</summary><div>${srcs}</div></details>` : ''}`
      : n.note ? n.note.split('\n').map(l => `<p>${esc(l)}</p>`).join('') : `<p class="facts">${esc(facts)}.</p>`;
    const cl = d.clients || [];
    return `<article class="dcard">
      <div class="dtop"><div><div class="eyebrow" style="margin-bottom:4px">${esc(d.ticker)}</div><h3 class="mc-name"><a href="#/company/${encodeURIComponent(d.key)}">${esc(d.name)}</a></h3></div>
        <div class="dval">${fmtCr(d.esop_value_cr, 1)}<div class="s">client ESOPs</div></div></div>
      <div class="chips">${d.rules.map(r => `<span class="chip rule">${esc(r.label)}</span>`).join('')}</div>
      <div class="dnote">${note}</div>
      <div class="dclients"><span class="lbl">Affected clients</span> ${cl.slice(0, 4).map(x => `<a href="#/client/${encodeURIComponent(x.client_id)}">${esc(x.client)}</a> ${fmtCr(x.value_cr, 2)}${isNum(x.pct_of_aum) ? ` <span class="${x.pct_of_aum >= S.settings.concentration_threshold ? 'neg' : 'mut'}">${fmtN(x.pct_of_aum * 100, 0)}% of AUM</span>` : ''}`).join(' · ')}${cl.length > 4 ? ` · <span class="mut">+${cl.length - 4}</span>` : ''}</div>
    </article>`; }).join('')}</div>`;
}

// ---------------------------------------------------------------- story against price (SVG bubble chart)
const OUT_Y = {Improving: 0, Stable: 1, Softening: 2};
function hash01(s){ let h = 2166136261; for(const ch of s){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }
function drawStory(b){
  const host = $('#story'); if(!host) return;
  const rows = Object.entries(b.companies || {}).filter(([, e]) => e.stats.listed && isNum(e.stats.reval_ps) && (e.stats.esop_value_cr || 0) > 0)
    .map(([k, e]) => ({k, st: e.stats, ol: ((comp(k) || {}).earnings_outlook || {}).value}));
  const W = Math.max(320, host.clientWidth), narrow = W < 620;
  const L = 14, R = 14, T = 26, rowH = narrow ? 92 : 110, H3 = rowH * 3, stripH = 58, axisH = 44;
  const H = T + H3 + axisH + stripH;
  const x = v => L + (Math.max(-0.6, Math.min(0.6, v)) + 0.6) / 1.2 * (W - L - R);
  const maxV = Math.max(...rows.map(r => r.st.esop_value_cr), 1);
  const rad = v => 4 + Math.sqrt(v / maxV) * (narrow ? 20 : 30);
  const set = rows.filter(r => r.ol in OUT_Y), unset = rows.filter(r => !(r.ol in OUT_Y));
  const bubble = (r, cx, cy) => { const rr = rad(r.st.esop_value_cr);
    return `<g class="bub" data-k="${esc(r.k)}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="rgba(20,34,58,0.14)" stroke="#14223A" stroke-width="1"/>
      <text x="${(cx + rr + 4).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="11" fill="#14223A">${esc(r.st.ticker)}</text></g>`; };
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Re-val / De-val on P/S against earnings outlook">`;
  ['Improving', 'Stable', 'Softening'].forEach((o, i) => {
    const y0 = T + i * rowH;
    svg += `<rect x="${L}" y="${y0}" width="${W - L - R}" height="${rowH}" fill="${i % 2 ? '#FBF9F5' : '#FFFFFF'}"/>
      <text x="${L + 6}" y="${y0 + 15}" font-size="10" letter-spacing="1.5" fill="#8C7A60">${o.toUpperCase()}</text>`;
  });
  svg += `<line x1="${x(0)}" x2="${x(0)}" y1="${T - 6}" y2="${T + H3}" stroke="#A8875A" stroke-width="1" stroke-dasharray="3 3"/>
    <text x="${x(0)}" y="${T - 10}" font-size="10" text-anchor="middle" fill="#8C7A60">At desk normalized</text>`;
  if(!narrow){
    const cap = (t, xx, yy, anchor) => `<text x="${xx}" y="${yy}" font-size="10.5" text-anchor="${anchor}" fill="#B9AE9C">${t}</text>`;
    svg += cap('Above normalized, outlook improving', L + 8, T + rowH - 8, 'start') + cap('Below normalized, outlook improving', W - R - 8, T + rowH - 8, 'end')
      + cap('Above normalized, outlook softening', L + 8, T + H3 - 8, 'start') + cap('Below normalized, outlook softening', W - R - 8, T + H3 - 8, 'end');
  }
  for(const r of set){ const band = OUT_Y[r.ol]; const cy = T + band * rowH + rowH / 2 + (hash01(r.k) - 0.5) * rowH * 0.55; svg += bubble(r, x(r.st.reval_ps), cy); }
  // axis
  const ay = T + H3;
  svg += `<line x1="${L}" x2="${W - R}" y1="${ay}" y2="${ay}" stroke="#D9D0C2"/>`;
  for(const t of [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6]){ if(narrow && (t === -0.4 || t === 0.4)) continue;
    svg += `<line x1="${x(t)}" x2="${x(t)}" y1="${ay}" y2="${ay + 5}" stroke="#D9D0C2"/><text x="${x(t)}" y="${ay + 17}" font-size="10" text-anchor="middle" fill="#6F6A63">${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t * 100)}%</text>`; }
  svg += `<text x="${L}" y="${ay + 34}" font-size="10.5" fill="#8C7A60">← trading above desk normalized P/S</text><text x="${W - R}" y="${ay + 34}" font-size="10.5" text-anchor="end" fill="#8C7A60">trading below →</text>`;
  // outlook not set
  const sy = ay + axisH;
  svg += `<rect x="${L}" y="${sy}" width="${W - L - R}" height="${stripH - 8}" fill="#F6F3EE"/><text x="${L + 6}" y="${sy + 14}" font-size="10" letter-spacing="1.5" fill="#8C7A60">OUTLOOK NOT SET</text>`;
  for(const r of unset){ const cy = sy + 30 + (hash01(r.k) - 0.5) * 12; const rr = Math.min(rad(r.st.esop_value_cr), 11);
    svg += `<g class="bub" data-k="${esc(r.k)}"><circle cx="${x(r.st.reval_ps).toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="rgba(20,34,58,0.10)" stroke="#8C7A60" stroke-width="1"/></g>`; }
  svg += '</svg>';
  host.innerHTML = svg + `<div class="hov" id="storyhov"></div>`;
  const byK = Object.fromEntries(rows.map(r => [r.k, r]));
  $$('.bub', host).forEach(g => {
    const r = byK[g.dataset.k];
    g.onmouseenter = ev => { const h = $('#storyhov'); const st = r.st;
      h.innerHTML = `<div class="d">${esc(st.name)}</div><div>Re-val / De-val <b class="${cls(st.reval_ps)}">${fmtPct(st.reval_ps, 0, true)}</b> on P/S</div>
        <div>P/S ${fmtX(st.ps)} · desk normalized ${fmtX(st.normalized_pr)}</div><div>Outlook ${esc(r.ol || 'not set')}</div>
        <div>Client ESOPs ${fmtCr(st.esop_value_cr, 2)} · week ${fmtPct(st.change, 1, true)}</div>`;
      h.style.display = 'block'; const box = host.getBoundingClientRect(), c = g.getBoundingClientRect();
      let left = c.right - box.left + 8; if(left + h.offsetWidth > box.width) left = c.left - box.left - h.offsetWidth - 8;
      h.style.left = Math.max(0, left) + 'px'; h.style.top = Math.max(0, c.top - box.top - 10) + 'px'; };
    g.onmouseleave = () => { $('#storyhov').style.display = 'none'; };
    g.onclick = () => { location.hash = '#/company/' + encodeURIComponent(g.dataset.k); };
  });
  const skipped = Object.values(b.companies || {}).filter(e => e.stats.listed && !isNum(e.stats.reval_ps)).length;
  $('#storynote').textContent = `Bubble area = client ESOP value. Re-val / De-val clamped at ±60%. ${unset.length} of ${rows.length} names have no earnings outlook set yet.${skipped ? ` ${skipped} listed name${skipped > 1 ? 's have' : ' has'} no P/S multiple and ${skipped > 1 ? 'are' : 'is'} left out.` : ''}`;
}

// ---------------------------------------------------------------- what moved and why
function movedBlock(k, e, hidden){
  const st = e.stats, t = e.text;
  return `<article class="mcard ${hidden ? 'more' : ''}">
    <div class="mc-top">
      <div><div class="eyebrow" style="margin-bottom:6px">${esc(st.exchange || '')} · ${esc(st.ticker)}</div>
        <h3 class="mc-name"><a href="#/company/${encodeURIComponent(k)}">${esc(st.name)}</a></h3>
        <div class="mc-chg">${chg3(st)}</div></div>
      <div class="mc-spark">${sparkSvg(st.spark, {w: 170, h: 46, sw: 1.4, r: 2.4})}<div class="cap">3 months to Thursday</div></div>
      <div class="mc-move"><div class="v ${cls(st.impact_cr)}">${signedCr(st.impact_cr, 2)}</div><div class="s">on ${fmtCr(st.esop_value_cr, 1)} of client ESOPs</div></div>
    </div>
    ${t && t.why ? `<div class="prose mc-text" style="margin-top:16px"><p>${esc(t.why)}</p></div>` : ''}
    <div style="margin-top:12px">${chipsHtml(e.triggers)}</div>
    ${t && t.why && (t.sources || []).length ? `<details class="srcs"><summary>Sources</summary><div>${srcLinks(t.sources)}</div></details>` : ''}
  </article>`;
}

function renderWeek(b, list){
  const el = $('#weekpage'); if(!el) return;
  const all = Object.entries(b.companies || {});
  const listed = all.filter(([, e]) => e.stats.listed);
  if(b.missing){ el.innerHTML = weekHead(b, list, 0, 0) + `<div class="sec"><p>This week has not been built. <b>Build this week</b> computes it from Thursday's closes.</p></div>`; return; }
  const s = S.settings; const pool = b.pool || {};
  const mats = listed.filter(([, e]) => e.material).sort((x, y) => Math.abs(y[1].stats.impact_cr || 0) - Math.abs(x[1].stats.impact_cr || 0));
  const calm = listed.filter(([, e]) => !e.material);
  const NEAR = -0.05;   // within 5% of the 52-week high, at Thursday's close
  const near = listed.filter(([, e]) => isNum(e.stats.down52) && e.stats.down52 >= NEAR);
  const next = listed.filter(([, e]) => (e.stats.earnings_next || []).length && e.stats.n_clients)
    .map(([k, e]) => ({k, st: e.stats, date: e.stats.earnings_next[0]})).sort((a, z) => a.date.localeCompare(z.date));
  const para = b.narrative && b.narrative.week_paragraph;

  const nearCols = [
    {k: 'name', label: 'Company', get: ([, e]) => e.stats.name, fmt: (v, [k, e]) => nameCell(k, e.stats, e.stats.new_high ? ' <span class="newtag">New high</span>' : '')},
    {k: 'down', label: 'From the high', num: true, get: ([, e]) => e.stats.down52, fmt: v => `<b class="big">${Math.abs(v) < 0.0005 ? 'At the high' : fmtPct(v, 1, true)}</b>`},
    {k: 'high', label: '52-week high', num: true, get: ([, e]) => e.stats.high52, fmt: (v, [, e]) => `${fmtPx(v, e.stats.currency)}<div class="hint">${dShort(e.stats.high52_date)}</div>`},
    {k: 'close', label: 'Thursday close', num: true, get: ([, e]) => e.stats.end_close, fmt: (v, [, e]) => fmtPx(v, e.stats.currency)},
    {k: 'wk', label: 'Week', num: true, get: ([, e]) => e.stats.change, fmt: v => fmtPct(v, 1, true), cls: v => cls(v)},
    {k: 'm1', label: '1M', num: true, get: ([, e]) => e.stats.change_1m, fmt: v => fmtPct(v, 1, true), cls: v => cls(v)},
    {k: 'm3', label: '3M', num: true, get: ([, e]) => e.stats.change_3m, fmt: v => fmtPct(v, 1, true), cls: v => cls(v)},
    {k: 'rv', label: 'Re-val / De-val', num: true, get: ([, e]) => e.stats.reval_ps, fmt: v => reval(v)},
    {k: 'esop', label: 'Clients · ESOP value', num: true, get: ([, e]) => e.stats.esop_value_cr, fmt: (v, [, e]) => `${e.stats.n_clients} · ${fmtCr(v, 2)}`},
  ];
  const calmCols = [
    {k: 'name', label: 'Company', get: ([, e]) => e.stats.name, fmt: (v, [k, e]) => nameCell(k, e.stats)},
    {k: 'chg', label: 'Week', num: true, get: ([, e]) => e.stats.change, fmt: v => fmtPct(v, 1, true), cls: v => cls(v)},
    {k: 'm1', label: '1M', num: true, get: ([, e]) => e.stats.change_1m, fmt: v => fmtPct(v, 1, true), cls: v => cls(v)},
    {k: 'rv', label: 'Re-val / De-val', num: true, get: ([, e]) => e.stats.reval_ps, fmt: v => reval(v)},
    {k: 'val', label: 'ESOP value', num: true, get: ([, e]) => e.stats.esop_value_cr, fmt: v => fmtCr(v, 2)},
  ];
  const nextCols = [
    {k: 'date', label: 'Results', fmt: v => dDay(v)},
    {k: 'name', label: 'Company', get: r => r.st.name, fmt: (v, r) => nameCell(r.k, r.st)},
    {k: 'esop', label: 'Clients · ESOP value', num: true, get: r => r.st.esop_value_cr, fmt: (v, r) => `${r.st.n_clients} · ${fmtCr(v, 2)}`},
  ];
  SORT['wk-near'] = SORT['wk-near'] || {k: 'down', dir: -1};
  SORT['wk-next'] = SORT['wk-next'] || {k: 'date', dir: 1};

  el.innerHTML = weekHead(b, list, listed.length, mats.length) +
    kpis([
      ['Pool ESOP value', fmtCr(pool.value_cr, 1), `listed ${fmtCr(pool.covered_cr, 1)} · unlisted marks ${fmtCr(pool.unlisted_cr, 1)}`],
      ['Week change', signedCr(pool.change_cr, 2), `${fmtPct(pool.change_pct, 2, true)} on listed holdings`, cls(pool.change_cr)],
      ['Moved materially', `${mats.length} <span class="of">of ${listed.length}</span>`, 'listed names'],
      ['Near the 52-week high', String(near.length), `within 5% · ${fmtCr(sum(near, ([, e]) => e.stats.esop_value_cr), 1)} of client ESOPs`],
    ]) +
    sec('For discussion this week', discussionHtml(b.discussion), `<span class="hint">the open question for each name, ahead of client conversations</span>`, 'disc', 'anchor') +
    sec('Story against price', `<div class="story" id="story"></div><p class="hint" id="storynote" style="margin-top:8px"></p>`, `<span class="hint">Re-val / De-val on P/S against the earnings outlook</span>`) +
    (para ? sec('The week', `<div class="backdrop prose">${paras(para)}</div>`) : '') +
    sec('What moved and why · by rupee impact', mats.length ? mats.map(([k, e], i) => movedBlock(k, e, i >= 8)).join('')
      + (mats.length > 8 ? `<button class="ql showall" onclick="this.parentElement.classList.toggle('all');this.textContent=this.parentElement.classList.contains('all')?'Show fewer':'Show all ${mats.length}'">Show all ${mats.length}</button>` : '')
      : '<p class="mut">No listed holding crossed a materiality rule this week.</p>', '', 'moved') +
    sec('Near the 52-week high', `<div class="panel feature">${near.length ? table('wk-near', near, nearCols, {limit: 10}) : '<p class="mut">No holding closed within 5% of its 52-week high on Thursday.</p>'}
      <p class="hint" style="margin:14px 0 0">Holdings that closed on Thursday within 5% of their 52-week high (the highest daily high over the past year). "New high" marks a fresh 52-week high this week.</p></div>`) +
    sec('Next week · results', next.length ? table('wk-next', next, nextCols) : '<p class="mut">No results dates for held companies in the ten days after this review.</p>');
  drawStory(b);
  if(!renderWeek._ro){ renderWeek._ro = new ResizeObserver(() => { if($('#story') && CACHE.brief) drawStory(CACHE.brief); }); }
  renderWeek._ro.disconnect(); if($('#story')) renderWeek._ro.observe($('#story'));
}
function pollBuild(week){
  clearTimeout(weekPoll);
  weekPoll = setTimeout(async () => {
    try{
      const p = await api('/api/brief/progress');
      if(p.running){ const b = CACHE.brief; if(b && $('#weekpage')){ b.progress = p; renderWeek(b, CACHE.briefs ? CACHE.briefs.briefs : []); } pollBuild(week); }
      else { CACHE.brief = null; CACHE.briefs = null; if(location.hash.startsWith('#/week') || !location.hash) await loadWeek(week); toast(p.error ? 'The build failed: ' + p.error : 'Weekly review ready'); }
    } catch(e){ pollBuild(week); }
  }, 2000);
}
async function buildBrief(week){
  try{
    const r = await api('/api/brief/build', {method: 'POST', body: JSON.stringify({week})});
    if(!r.started) toast('A build is already running');
    CACHE.brief = null; await loadWeek(week); pollBuild(week);
  } catch(e){ toast('Could not start the build: ' + e.message); }
}
