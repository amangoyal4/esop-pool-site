// Company chart: Price | P/E | Price to sales (lightweight-charts 4.2.3).
//  * Price ranges 1D 5D 1M 6M YTD 1Y 5Y Max; multiple ranges 1Y 3Y 5Y 10Y Max.
//  * Each tab shows only its own series: no reference lines or bands. P/E and P/S carry TTM EPS / TTM sales as
//    bars on a secondary axis in the lower 30% (one block per reported period), as on Screener, so a move in the
//    multiple can be read against a move in earnings.
//  * The axis autoscales to the visible data on every change; the change figure covers exactly the visible range
//    (1D against the previous close) and never changes on hover; drag across the chart (either direction) to
//    select two dates and the figure above switches to that span, earlier date to later date, until cleared (the
//    library's own pan and zoom are off); the hover card shows date, multiple, price and the TTM figure in force.
'use strict';
const Chart = {key: null, tab: 'price', rangePx: '1y', rangeMx: '5y', inst: null, series: null, ro: null, token: 0, selClear: null, selOn: false,
  data: null,
  get range(){ return this.tab === 'price' ? this.rangePx : this.rangeMx; },
  destroy(){
    if(this.ro){ try{ this.ro.disconnect(); }catch(e){} this.ro = null; }
    if(this.inst){ try{ this.inst.remove(); }catch(e){} this.inst = null; }
    this.series = null; this.selClear = null; this.selOn = false;
  }};
const RANGES_PX = ['1d', '5d', '1m', '6m', 'ytd', '1y', '5y', 'max'];
const RANGES_MX = ['1y', '3y', '5y', '10y', 'max'];
const RANGE_TXT = {'1d': 'today, against the previous close', '5d': 'past five sessions', '1m': 'past month', '6m': 'past six months', 'ytd': 'year to date',
  '1y': 'past year', '3y': 'past three years', '5y': 'past five years', '10y': 'past ten years', 'max': 'all available history'};
const TABS = [['price', 'Price'], ['pe', 'P/E'], ['ps', 'Price to sales']];
const C_NAVY = '#14223A', C_BRONZE = '#A8875A', C_LABEL = '#8C7A60', C_SLATE = '#5B6880', C_QUIET = '#B9AE9C';

function chartPanel(c){
  return `<div class="panel cpanel" id="chartcard" data-key="${esc(c.key)}">
    <div class="ctop">
      <div class="tabs" id="ctabs">${TABS.map(([k, l]) => `<button data-t="${k}" class="${k === Chart.tab ? 'on' : ''}" onclick="setChartTab('${k}')">${l}</button>`).join('')}</div>
      <div class="ranges" id="cranges">${rangeButtons()}</div>
    </div>
    <div class="cval"><span class="v" id="cv">&nbsp;</span><span class="c" id="cc"></span><span class="w" id="cw"></span></div>
    <div class="chart" id="chart"><div class="ld">Loading…</div></div>
    <div class="cleg" id="cleg"></div>
    <div class="ccap" id="ccap"></div>
  </div>`;
}
const rangeButtons = () => (Chart.tab === 'price' ? RANGES_PX : RANGES_MX).map(r =>
  `<button data-r="${r}" class="${r === Chart.range ? 'on' : ''}" onclick="setChartRange('${r}')">${r === 'max' ? 'Max' : r.toUpperCase()}</button>`).join('');
function initChart(key){ Chart.key = key; drawChart(); }
function setChartTab(t){ Chart.tab = t; $$('#ctabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); $('#cranges').innerHTML = rangeButtons(); drawChart(); }
function setChartRange(r){ if(Chart.tab === 'price') Chart.rangePx = r; else Chart.rangeMx = r; $('#cranges').innerHTML = rangeButtons(); drawChart(); }

async function chartData(key, tab, range, force){
  const ck = `${key}|${tab}|${range}`;
  let d = CACHE.hist[ck];
  if(!force && d && Date.now() - d._at < 5 * 60 * 1000) return d;
  const raw = tab === 'price'
    ? await api(`/api/history/${encodeURIComponent(key)}?range=${range}${force ? '&refresh=1' : ''}`)
    : await api(`/api/multiples/${encodeURIComponent(key)}?metric=${tab}&range=${range}${force ? '&refresh=1' : ''}`);
  d = {...raw, tab, _at: Date.now(),
       pts: (raw.points || []).map(p => tab === 'price' ? {t: p.t, v: p.p, close: p.p} : {t: p.t, v: p.v, close: p.close, eps: p.eps, ttm: p.ttm}),
       prev: tab === 'price' ? raw.prev_close : raw.prev};
  // which reported period each day's TTM figure belongs to (for the bars and the hover card)
  if(tab !== 'price'){ let bi = -1; const bars = raw.bars || []; d.pts.forEach(p => { while(bi + 1 < bars.length && bars[bi + 1].t <= p.t) bi++; p.period = bi >= 0 ? bars[bi].period : null; p.bar = bi; }); }
  CACHE.hist[ck] = d;
  return d;
}

const whenTxt = (t, intraday) => intraday
  ? new Date(t * 1000).toLocaleString('en-GB', {timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'})
  : new Date(t + 'T00:00:00').toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'});

async function drawChart(force){
  const el = $('#chart'); if(!el) return;
  const tok = ++Chart.token, key = Chart.key, tab = Chart.tab, range = Chart.range;
  if(Chart.selClear) Chart.selClear();
  Chart.selOn = false;
  $('#cc').innerHTML = '<span class="mut">loading…</span>'; $('#cw').textContent = '';
  let d;
  try{ d = await chartData(key, tab, range, force); }
  catch(e){
    if(tok === Chart.token && $('#chart')){ Chart.destroy(); $('#chart').innerHTML = `<div class="ld">${esc(e.message)}</div>`; $('#cc').innerHTML = ''; $('#cv').innerHTML = '&nbsp;'; $('#cleg').innerHTML = ''; $('#ccap').innerHTML = ''; }
    return;
  }
  if(tok !== Chart.token || !$('#chart') || $('#chartcard').dataset.key !== key) return;     // a newer request owns the panel
  Chart.data = d;
  const c = comp(key); const ccy = d.currency || c.live.currency;
  const isPx = tab === 'price';
  const fmtV = v => isPx ? fmtPx(v, ccy) : fmtX(v);
  const valid = d.pts.filter(p => isNum(p.v));
  Chart.destroy();
  el.innerHTML = '';
  paintLegend(c, d, ccy);
  if(!valid.length){
    const why = d.error || (tab === 'pe' && d.pts.length ? 'No P/E over this range: trailing twelve-month profit was not positive.' : 'No data for this range yet.');
    el.innerHTML = `<div class="ld">${esc(why)}</div>`;
    $('#cv').innerHTML = '&nbsp;'; $('#cc').innerHTML = ''; return;
  }
  const last = valid[valid.length - 1].v;
  const base = (range === '1d' && isNum(d.prev)) ? d.prev : valid[0].v;
  // The figure above the chart shows ONE change at a time: the whole visible period by default, or the
  // selected span while a selection is on the chart. Hovering never changes it.
  const head = (v, b, txt) => {
    $('#cv').textContent = fmtV(v);
    const dc = v - b, dp = b ? dc / b : null;
    $('#cc').innerHTML = `<span class="${cls(dc)}">${isPx ? signed(dc, 2) : signed(dc, 2) + 'x'} (${fmtPct(dp, 2, true)})</span>`;
    $('#cw').textContent = txt;
  };
  const headPeriod = () => head(last, base, RANGE_TXT[range]);
  const headSpan = (p0, p1) => head(p1.v, p0.v, `${whenTxt(p0.t, d.intraday)} → ${whenTxt(p1.t, d.intraday)}`);
  headPeriod();

  const lo = Math.min(...valid.map(p => p.v)), hi = Math.max(...valid.map(p => p.v));
  const floor = lo - (hi - lo) * 0.06;
  const LW = LightweightCharts;
  const chart = Chart.inst = LW.createChart(el, {
    width: el.clientWidth, height: el.clientHeight,
    layout: {background: {type: 'solid', color: '#FFFFFF'}, textColor: '#6F6A63', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontSize: 11, attributionLogo: false},
    grid: {vertLines: {visible: false}, horzLines: {color: '#F3EFE8'}},
    rightPriceScale: {borderVisible: false, autoScale: true, scaleMargins: isPx ? {top: 0.1, bottom: 0.08} : {top: 0.08, bottom: 0.3}},
    timeScale: {borderVisible: false, timeVisible: !!d.intraday, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true},
    crosshair: {mode: LW.CrosshairMode.Magnet, vertLine: {color: C_QUIET, width: 1, style: LW.LineStyle.Solid, labelBackgroundColor: C_NAVY},
      horzLine: {color: C_QUIET, width: 1, style: LW.LineStyle.Dashed, labelBackgroundColor: C_NAVY}},
    handleScroll: false, handleScale: false,
    // on the multiple tabs the lower 30% holds the bars: leave the main axis unlabelled below the data
    localization: {dateFormat: "dd MMM ''yy", priceFormatter: v => (!isPx && v < floor) ? '' : fmtN(v, Math.abs(v) < 1000 ? 2 : 0)},
  });
  // fundamentals bars first (behind the line): one block per reported period, a one-day gap between blocks
  if(!isPx){
    const bars = chart.addHistogramSeries({priceScaleId: 'fund', priceLineVisible: false, lastValueVisible: false, base: 0,
      autoscaleInfoProvider: o => { const r = o(); if(r){ r.priceRange.minValue = Math.min(0, r.priceRange.minValue); r.priceRange.maxValue = Math.max(0, r.priceRange.maxValue); } return r; }});   // bars measured from zero
    chart.priceScale('fund').applyOptions({scaleMargins: {top: 0.74, bottom: 0.0}, visible: false});
    const fv = p => tab === 'pe' ? p.eps : p.ttm;
    bars.setData(d.pts.map((p, i) => {
      const v = fv(p); const gap = i > 0 && d.pts[i - 1].bar !== p.bar;
      return (!isNum(v) || gap) ? {time: p.t} : {time: p.t, value: v, color: v < 0 ? 'rgba(138,58,50,0.16)' : 'rgba(20,34,58,0.10)'};
    }));
  }
  const series = Chart.series = chart.addAreaSeries({
    lineColor: C_NAVY, topColor: isPx ? 'rgba(20,34,58,0.05)' : 'rgba(20,34,58,0)', bottomColor: isPx ? 'rgba(20,34,58,0.05)' : 'rgba(20,34,58,0)', lineWidth: 2,
    priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 3.5,
    crosshairMarkerBorderColor: '#FFFFFF', crosshairMarkerBackgroundColor: C_NAVY,
    autoscaleInfoProvider: original => original(),          // the visible data only
  });
  series.setData(d.pts.map(p => isNum(p.v) ? {time: p.t, value: p.v} : {time: p.t}));

  chart.timeScale().fitContent();
  chart.priceScale('right').applyOptions({autoScale: true});

  // ---- hover card
  const hov = document.createElement('div'); hov.className = 'hov'; el.appendChild(hov);
  const byT = new Map(d.pts.map(p => [String(p.t), p]));
  const unit = d.bar_unit || '';
  chart.subscribeCrosshairMove(p => {
    const sd = p && p.time && p.seriesData ? p.seriesData.get(series) : null;
    if(!sd || !isNum(sd.value) || !p.point || Chart.selOn){ hov.style.display = 'none'; return; }
    const when = whenTxt(p.time, d.intraday);
    const pt = byT.get(String(p.time)) || {};
    hov.innerHTML = `<div class="d">${esc(when)}</div>` + (isPx ? `<div><b>${fmtPx(sd.value, ccy)}</b></div>`
      : `<div><b>${fmtX(sd.value)}</b> ${tab === 'pe' ? 'P/E' : 'P/S'}</div><div>Price ${fmtPx(pt.close, ccy)}</div>
         <div>${tab === 'pe' ? 'TTM EPS ' + fmtN(pt.eps, 2) + ' ' + esc(ccy || '') : 'TTM sales ' + fmtN(pt.ttm, 0) + ' ' + esc(unit)}${pt.period ? ` <span class="mut">(${esc(pt.period)})</span>` : ''}</div>`);
    hov.style.display = 'block';
    const w = hov.offsetWidth, x = p.point.x + 14 + w > el.clientWidth - 70 ? p.point.x - w - 14 : p.point.x + 14;
    hov.style.left = Math.max(4, x) + 'px'; hov.style.top = '8px';
  });
  attachRangeSelect(el, chart, d.pts, hov, headSpan, headPeriod);
  Chart.ro = new ResizeObserver(() => { if($('#chart') === el && Chart.inst === chart){ chart.applyOptions({width: el.clientWidth}); chart.timeScale().fitContent(); } });
  Chart.ro.observe(el);
}

function attachRangeSelect(el, chart, pts, hov, onSpan, onClear){
  const sel = document.createElement('div'); sel.className = 'sel'; el.appendChild(sel);
  const ts = chart.timeScale();
  const nearest = i => { for(let k = 0; k < pts.length; k++){ for(const j of [i - k, i + k]){ if(j >= 0 && j < pts.length && isNum(pts[j].v)) return j; } } return null; };
  const idxAt = x => { const l = ts.coordinateToLogical(x); if(l == null) return null; return nearest(Math.max(0, Math.min(pts.length - 1, Math.round(l)))); };
  let a = null, dragging = false, startX = 0;
  const clear = () => { sel.style.display = 'none'; a = null; if(Chart.selOn){ Chart.selOn = false; onClear(); } };
  const paint = (i, j) => {
    const lo = Math.min(i, j), hi = Math.max(i, j);          // dragging backwards still reads earlier -> later
    const x1 = ts.logicalToCoordinate(lo), x2 = ts.logicalToCoordinate(hi);
    if(x1 == null || x2 == null) return;
    sel.style.left = x1 + 'px'; sel.style.width = Math.max(1, x2 - x1) + 'px'; sel.style.display = 'block';
    Chart.selOn = true; hov.style.display = 'none';
    onSpan(pts[lo], pts[hi]);
  };
  el.onpointerdown = e => {
    if(e.button !== 0) return;
    const r = el.getBoundingClientRect(); const i = idxAt(e.clientX - r.left); if(i == null) return;
    clear(); a = i; startX = e.clientX; dragging = true;
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
  };
  el.onpointermove = e => {
    if(!dragging || Math.abs(e.clientX - startX) < 4) return;
    const r = el.getBoundingClientRect(); const j = idxAt(e.clientX - r.left);
    if(j != null && j !== a) paint(a, j);
  };
  el.onpointerup = el.onpointercancel = e => {
    if(!dragging) return; dragging = false;
    try{ el.releasePointerCapture(e.pointerId); }catch(_){}
    if(Math.abs(e.clientX - startX) < 4) clear();            // a plain click inside the chart clears too
  };
  Chart.selClear = clear;
}
document.addEventListener('pointerdown', e => { const t = evEl(e); if(Chart.selClear && !(t instanceof Element && t.closest('#chart'))) Chart.selClear(); });

function paintLegend(c, d, ccy){
  const isPx = d.tab === 'price';
  let items, cap;
  if(isPx){
    items = [`<span><i style="border-color:${C_NAVY}"></i>${d.intraday ? '5-minute prices, exchange time' : 'Daily close'}${d.asof ? ' · as of ' + dTime(d.asof) : ''}</span>`];
    cap = 'Prices from Yahoo Finance (split-adjusted daily closes; 1D and 5D use 5-minute bars). Drag across the chart to compare two dates.';
  } else {
    items = [`<span><i style="border-color:${C_NAVY}"></i>${d.tab === 'pe' ? 'P/E' : 'Price to sales'}, daily</span>`,
      `<span><i class="bar"></i>${d.tab === 'pe' ? 'TTM EPS' : 'TTM sales'} (${esc(d.bar_unit || '')}), lower axis</span>`];
    cap = [...(d.notes || []).map(n => `<b style="font-weight:500;color:var(--ink)">${esc(n)}</b>`), esc(d.caption || '')].filter(Boolean).join('<br>');
  }
  cap += ` <span style="white-space:nowrap">Chart: <a href="https://www.tradingview.com/" rel="noopener" data-ext>TradingView Lightweight Charts</a>.</span>`;
  items.push(`<span class="r"><button class="ql" onclick="drawChart(true)">Refresh data</button></span>`);
  $('#cleg').innerHTML = items.join('');
  $('#ccap').innerHTML = cap;
}
