/**
 * Utilidades para gráficos SVG
 */

import { state, safeDateStr } from '../config/state.js';
import { TICKER_DOMAIN, PIE_COLORS, DONUT_PALETTE } from '../config/constants.js';
import { esc, fmtEUR } from './helpers.js';

// ── Logo de empresa ──

export function logoImg(ticker, name, size = 28) {
    const abbr = ticker.replace(/\.(MC|L|PA|DE|AS|MI|SW)$/i, '').slice(0, 4).toUpperCase();
    const colors = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#065f46'];
    const color = colors[abbr.charCodeAt(0) % colors.length];
    const domain = TICKER_DOMAIN[ticker] ||
        ticker.replace(/\.(MC|L|PA|DE|AS|MI|SW)$/i, '').toLowerCase() + '.com';
    const s = size,
        fs = Math.round(s * 0.34);
    const url = `https://icon.horse/icon/${domain}`;
    return `<div style="width:${s}px;height:${s}px;border-radius:50%;overflow:hidden;background:#fff;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1.5px solid #e2e8f0;box-shadow:0 1px 3px #0001" title="${esc(name || ticker)}">
        <img src="${url}" width="${s}" height="${s}" style="object-fit:contain;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
        <span style="display:none;font-size:${fs}px;font-weight:800;color:${color};line-height:1;width:100%;height:100%;align-items:center;justify-content:center;text-align:center">${abbr.slice(0, 3)}</span>
    </div>`;
}

// ── Gráfico de precio con SMA ──

export function buildPriceChartSvg(ticker, avgCost) {
    if (!state._chartRange) state._chartRange = {};
    const range = state._chartRange[ticker] || '1y';
    const key = `${ticker}_${range}`;
    const data = state._chartCache?.[key];

    const RANGES = [
        { v: 'ytd', l: 'YTD' }, { v: '6mo', l: '6M' }, { v: '1y', l: '1A' },
        { v: '3y', l: '3A' }, { v: '5y', l: '5A' }, { v: '10y', l: '10A' },
    ];

    const rangeBtns = RANGES.map(r =>
        `<button onclick="event.stopPropagation();window.selectChartRange('${ticker}','${r.v}')"
            style="padding:2px 7px;border:1px solid ${range === r.v ? '#2563eb' : '#e2e8f0'};border-radius:4px;font-size:10px;font-weight:600;
            background:${range === r.v ? '#2563eb' : '#fff'};color:${range === r.v ? '#fff' : '#64748b'};cursor:pointer">${r.l}</button>`
    ).join('');

    const loadingOrError = `<div style="height:110px;display:flex;align-items:center;justify-content:center">
        <span style="font-size:11px;color:#94a3b8">${data === 'loading' ? '⏳ Cargando gráfico...' : '📊 Sin datos históricos'}</span>
    </div>`;

    if (!data || data === 'loading') {
        return `<div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">${rangeBtns}</div>
            ${loadingOrError}
        </div>`;
    }

    const W = 268,
        H = 110,
        PL = 6,
        PR = 6,
        PT = 14,
        PB = 16;
    const gW = W - PL - PR,
        gH = H - PT - PB;
    const vals = data.map(d => d.v);
    const minV = Math.min(...vals),
        maxV = Math.max(...vals);
    const rng = maxV - minV || 1;
    const toX = i => PL + (i / (data.length - 1)) * gW;
    const toY = v => PT + gH - ((v - minV) / rng) * gH;

    const first = vals[0],
        last = vals[vals.length - 1];
    const pct = ((last - first) / first * 100).toFixed(1);
    const isUp = last >= first;
    const color = isUp ? '#16a34a' : '#dc2626';
    const fillId = `fill_${ticker.replace(/[^a-z0-9]/gi, '_')}`;

    const pts = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' ');
    const areaPath = `M${PL},${PT + gH} L${data.map((d, i) => `${toX(i).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' L')} L${W - PR},${PT + gH} Z`;

    let costLine = '';
    if (avgCost && avgCost >= minV * 0.7 && avgCost <= maxV * 1.3) {
        const cy = toY(avgCost).toFixed(1);
        costLine = `<line x1="${PL}" y1="${cy}" x2="${W - PR}" y2="${cy}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3,2"/>
        <text x="${W - PR + 1}" y="${+cy + 3}" font-size="7.5" fill="#f59e0b">↔ coste</text>`;
    }

    const labelIdxs = [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(data.length * 3 / 4), data.length - 1];
    const months = ['En', 'Fe', 'Ma', 'Ab', 'My', 'Jn', 'Jl', 'Ag', 'Se', 'Oc', 'No', 'Di'];
    const xLabels = labelIdxs.map((idx, li) => {
        if (idx >= data.length) return '';
        const d = new Date(data[idx].t * 1000);
        const label = range === '10y' || range === '5y' ? d.getFullYear() :
            range === '3y' ? `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` :
            `${d.getDate()} ${months[d.getMonth()]}`;
        const x = toX(idx);
        const anchor = li === 0 ? 'start' : li === labelIdxs.length - 1 ? 'end' : 'middle';
        return `<text x="${x.toFixed(1)}" y="${H - 1}" text-anchor="${anchor}" font-size="8" fill="#94a3b8">${label}</text>`;
    }).join('');

    const fmtV = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v >= 1 ? v.toFixed(2) : v.toFixed(4);
    const svgId = `chart_${ticker.replace(/[^a-z0-9]/gi, '_')}`;

    return `<div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="display:flex;gap:3px;flex-wrap:wrap">${rangeBtns}</div>
            <span style="font-size:12px;font-weight:700;color:${color}">${isUp ? '+' : ''}${pct}%</span>
        </div>
        <div style="position:relative" id="${svgId}_wrap">
            <svg id="${svgId}" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible;cursor:crosshair"
                onmousemove="window.chartMouseMove(event,'${svgId}',${W},${PL},${gW},'${key}',${PT},${gH},${minV},${rng})"
                onmouseleave="window.chartMouseLeave('${svgId}')">
                <defs>
                    <linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
                        <stop offset="100%" stop-color="${color}" stop-opacity="0.01"/>
                    </linearGradient>
                </defs>
                <path d="${areaPath}" fill="url(#${fillId})"/>
                <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
                ${costLine}
                ${xLabels}
                <text x="${PL}" y="${PT - 1}" font-size="7.5" fill="#cbd5e1">${fmtV(maxV)}</text>
                <text x="${PL}" y="${PT + gH + 7}" font-size="7.5" fill="#cbd5e1">${fmtV(minV)}</text>
                <line id="${svgId}_vline" x1="0" y1="${PT}" x2="0" y2="${PT + gH}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3,2" display="none"/>
                <circle id="${svgId}_dot" cx="0" cy="0" r="4" fill="${color}" stroke="white" stroke-width="1.5" display="none"/>
            </svg>
            <div id="${svgId}_tip" style="display:none;position:absolute;top:0;left:0;background:#1e293b;color:#fff;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;pointer-events:none;white-space:nowrap;z-index:10;box-shadow:0 2px 8px #0004"></div>
        </div>
    </div>`;
}

// ── Gráfico de evolución de cartera (header) ──

export function buildHeaderEvoSparkline(totalInvested, totalValue) {
    const tickers = state.positions.map(p => p.ticker);
    if (!tickers.length) return `<div style="font-size:9px;color:#94a3b8;text-align:center;line-height:30px">Sin posiciones</div>`;

    const hist = calculatePortfolioHistory(tickers, 'MAX');
    if (!hist.length) return `<div style="font-size:9px;color:#94a3b8;text-align:center;line-height:30px">Sin histórico aún</div>`;

    const lastInvested = totalInvested || hist[hist.length - 1].invested || 0;
    const currentValue = totalValue || hist[hist.length - 1].value || lastInvested;
    const ratio = lastInvested > 0 ? currentValue / lastInvested : 1;

    const points = hist.map(h => ({ date: new Date(h.date), v: Math.max(0, (h.invested || 0) * ratio) }));
    const originDate = new Date(points[0].date);
    originDate.setDate(originDate.getDate() - 1);
    points.unshift({ date: originDate, v: 0 });
    points.push({ date: new Date(), v: currentValue });

    if (points.length < 2) return `<div style="font-size:9px;color:#94a3b8;text-align:center;line-height:30px">Historial insuficiente</div>`;

    const W = 300,
        H = 30,
        PAD = 2;
    const minV = 0,
        maxV = Math.max(...points.map(p => p.v), 1);
    const range = (maxV - minV) || 1;
    const minT = points[0].date.getTime(),
        maxT = points[points.length - 1].date.getTime();
    const spanT = (maxT - minT) || 1;
    const toX = t => PAD + ((t - minT) / spanT) * (W - PAD * 2);
    const toY = v => (H - PAD) - ((v - minV) / range) * (H - PAD * 2);

    const coords = points.map(p => `${toX(p.date.getTime()).toFixed(1)},${toY(p.v).toFixed(1)}`);
    const linePath = `M${coords.join(' L')}`;
    const areaPath = `${linePath} L${toX(maxT).toFixed(1)},${(H - PAD).toFixed(1)} L${toX(minT).toFixed(1)},${(H - PAD).toFixed(1)} Z`;

    const positive = currentValue >= lastInvested;
    const color = positive ? '#16a34a' : '#dc2626';
    const pct = lastInvested > 0 ? ((currentValue - lastInvested) / lastInvested * 100) : 0;
    const firstRealDate = points[1]?.date;
    const tip = `Evolución de la cartera desde ${firstRealDate ? firstRealDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }) : 'el inicio'}: ` +
        `${fmtEUR(currentValue)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
        <title>${esc(tip)}</title>
        <defs>
            <linearGradient id="hdrEvoFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>
                <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#hdrEvoFill)" stroke="none"/>
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

// ── Histórico de cartera ──

function calculatePortfolioHistory(tickers, period) {
    const tickerSet = new Set(tickers);
    const periodMap = { '1A': 12, '3A': 36, '5A': 60, '10A': 120, 'MAX': 240 };
    const months = periodMap[period] || 12;

    const txs = [...state.transactions].filter(t => tickerSet.has(t.ticker)).sort((a, b) => compareDates(a.date, b.date));

    const result = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - months);

    const monthlyData = {};
    txs.forEach(tx => {
        const d = new Date(tx.date);
        if (d < startDate) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[key]) monthlyData[key] = { date: d, buys: 0, sells: 0 };
        if (tx.type === 'BUY') monthlyData[key].buys += tx.shares * tx.price;
        else if (tx.type === 'SELL') monthlyData[key].sells += tx.shares * tx.price;
    });

    const relevantPositions = state.positions.filter(p => tickerSet.has(p.ticker));
    const currentValue = relevantPositions.reduce((acc, p) => {
        const price = state.priceCache[p.ticker] || p.avg_cost;
        return acc + (p.shares * price);
    }, 0);

    let cumulativeCost = 0;
    const monthsKeys = Object.keys(monthlyData).sort();

    monthsKeys.forEach(key => {
        const data = monthlyData[key];
        cumulativeCost += data.buys - data.sells;
        result.push({
            date: data.date,
            invested: cumulativeCost,
            value: currentValue || cumulativeCost,
            profit: (currentValue || cumulativeCost) - cumulativeCost
        });
    });

    return result;
}

// ── Gráficos de múltiples series ──

export function multiChartMouseMove(e, svgId, W, PL, gW, PT, gH) {
    const cache = state._multiChartCache?.[svgId];
    if (!cache?.points?.length) return;
    const svg = document.getElementById(svgId);
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    const relX = mx - PL;
    const n = cache.points.length;
    const idx = Math.max(0, Math.min(n - 1, Math.round(relX / gW * (n - 1))));
    const point = cache.points[idx];
    if (!point) return;

    const toX = i => PL + (n > 1 ? (i / (n - 1)) * gW : gW / 2);
    const cx = toX(idx).toFixed(1);

    const vline = document.getElementById(`${svgId}_vline`);
    if (vline) { vline.setAttribute('x1', cx);
        vline.setAttribute('x2', cx);
        vline.removeAttribute('display'); }

    let html = `<div style="font-weight:700;margin-bottom:3px">${esc(point.label)}</div>`;
    cache.series.forEach((s, si) => {
        const dot = document.getElementById(`${svgId}_dot${si}`);
        const v = point.values[si];
        if (v == null) { if (dot) dot.setAttribute('display', 'none'); return; }
        if (dot && cache.toY) {
            dot.setAttribute('cx', cx);
            dot.setAttribute('cy', cache.toY(v).toFixed(1));
            dot.removeAttribute('display');
        }
        html += `<div style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:${s.color};border-radius:2px;display:inline-block"></span>${esc(s.label)}: <b>${s.fmt ? s.fmt(v) : v}</b></div>`;
    });

    const tip = document.getElementById(`${svgId}_tip`);
    if (tip) {
        tip.innerHTML = html;
        const rectW = rect.width;
        const tipX = e.clientX - rect.left;
        tip.style.display = 'block';
        tip.style.left = (tipX + 10 > rectW - 150 ? tipX - 156 : tipX + 8) + 'px';
        tip.style.top = '4px';
    }
}

export function multiChartMouseLeave(svgId) {
    const vline = document.getElementById(`${svgId}_vline`);
    const tip = document.getElementById(`${svgId}_tip`);
    if (vline) vline.setAttribute('display', 'none');
    if (tip) tip.style.display = 'none';
    document.querySelectorAll(`[id^="${svgId}_dot"]`).forEach(d => d.setAttribute('display', 'none'));
}

// ── Donut chart ──

export function donutSegmentHover(e, svgId, idx) {
    const cache = state._multiChartCache?.[svgId];
    const item = cache?.donutItems?.[idx];
    const tip = document.getElementById(`${svgId}_tip`);
    const wrap = document.getElementById(`${svgId}_wrap`);
    if (!item || !tip || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    tip.innerHTML = `${esc(item.label)}<br><span style="font-weight:400;color:#cbd5e1">${fmtEUR(item.value)} · ${item.pct.toFixed(1)}%</span>`;
    tip.style.display = 'block';
    const tipX = e.clientX - rect.left;
    const tipY = e.clientY - rect.top;
    tip.style.left = (tipX + 90 > rect.width ? tipX - 100 : tipX + 10) + 'px';
    tip.style.top = Math.max(0, tipY - 34) + 'px';
}

export function donutMouseLeave(svgId) {
    const tip = document.getElementById(`${svgId}_tip`);
    if (tip) tip.style.display = 'none';
}

// ── Chart scroll wrap ──

export function chartScrollWrap(svgId, W, H, innerSvg, extra = '') {
    return `<div style="overflow-x:auto;overflow-y:hidden">
        <div style="position:relative;min-width:${W}px">
            <svg id="${svgId}" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible;cursor:crosshair" ${extra}>
                ${innerSvg}
            </svg>
            <div id="${svgId}_tip" style="display:none;position:absolute;top:0;left:0;background:#1e293b;color:#fff;padding:5px 9px;border-radius:6px;font-size:10px;font-weight:500;pointer-events:none;white-space:nowrap;z-index:10;box-shadow:0 2px 8px #0004"></div>
        </div>
    </div>`;
}