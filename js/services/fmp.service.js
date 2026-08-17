/**
 * Servicio de Financial Modeling Prep API
 */

import { state } from '../config/state.js';
import { TS_PROXIES, QS_PROXIES, MODULES } from '../config/constants.js';

function _buildFundamentalsResult(years, inc, cf, bs, km, curPrice) {
    const M = 1e6;
    if (inc[0] && 'revenue' in inc[0]) {
        const revenue = inc.map(x => x.revenue != null ? +(x.revenue / M).toFixed(0) : null);
        const ebit = inc.map(x => x.operatingIncome != null ? +(x.operatingIncome / M).toFixed(0) : null);
        const net_income = inc.map(x => x.netIncome != null ? +(x.netIncome / M).toFixed(0) : null);
        const eps = inc.map(x => x.eps != null ? +x.eps.toFixed(2) : null);
        const ebitda_arr = inc.map(x => x.ebitda != null ? +(x.ebitda / M).toFixed(0) : null);
        const gross_margin = inc.map(x => x.grossProfitRatio != null ? +(x.grossProfitRatio * 100).toFixed(1) : null);
        const ebit_margin = inc.map(x => x.operatingIncomeRatio != null ? +(x.operatingIncomeRatio * 100).toFixed(1) : null);
        const net_margin = inc.map(x => x.netIncomeRatio != null ? +(x.netIncomeRatio * 100).toFixed(1) : null);
        const cfo = cf.map(x => x.operatingCashFlow != null ? +(x.operatingCashFlow / M).toFixed(0) : null);
        const fcf = cf.map(x => x.freeCashFlow != null ? +(x.freeCashFlow / M).toFixed(0) : null);
        const net_debt = bs.map(x => { const d = x.totalDebt ?? x.longTermDebt ?? 0; const c = x.cashAndCashEquivalents ?? 0; return +((d - c) / M).toFixed(0); });
        const buybacks = cf.map(x => x.commonStockRepurchased != null ? +(Math.abs(x.commonStockRepurchased) / M).toFixed(0) : null);
        const debt_ebitda = net_debt.map((nd, i) => ebitda_arr[i] ? +(nd / ebitda_arr[i]).toFixed(2) : null);
        const interest_coverage = km.map(x => x.interestCoverage != null ? +x.interestCoverage.toFixed(1) : null);
        const roe = km.map(x => x.roe != null ? +(x.roe * 100).toFixed(1) : null);
        const roic = km.map(x => x.roic != null ? +(x.roic * 100).toFixed(1) : null);
        const pe_hist = km.map(x => x.peRatio != null && x.peRatio > 0 && x.peRatio < 500 ? +x.peRatio.toFixed(1) : null);
        const pfcf_hist = km.map(x => x.pfcfRatio != null && x.pfcfRatio > 0 && x.pfcfRatio < 500 ? +x.pfcfRatio.toFixed(1) : null);
        const ev_ebitda_hist = km.map(x => x.evToEbitda != null && x.evToEbitda > 0 && x.evToEbitda < 200 ? +x.evToEbitda.toFixed(1) : null);
        const price_hist = years.map((_, i) => i === years.length - 1 ? curPrice : null);
        return { years, revenue, ebit, net_income, cfo, fcf, gross_margin, ebit_margin, net_margin,
            net_debt, debt_ebitda, interest_coverage, eps, price_hist, pe_hist, pfcf_hist, ev_ebitda_hist, roe, roic, buybacks };
    }
    return null;
}

async function _fetchFMP(ticker, key) {
    const BASE = 'https://financialmodelingprep.com/api/v3';
    const tickers = [ticker];
    if (ticker.includes('.')) tickers.push(ticker.split('.')[0]);

    const wrapUrl = (url) => [
        url,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    ];

    const errors = [];
    for (const t of tickers) {
        const incUrls = wrapUrl(`${BASE}/income-statement/${t}?limit=25&apikey=${key}`);
        for (const incUrl of incUrls) {
            try {
                const incR = await fetch(incUrl, { signal: AbortSignal.timeout(10000) });
                if (!incR.ok) { errors.push(`HTTP ${incR.status} @ ${incUrl.slice(0, 50)}`); continue; }
                const iD = await incR.json();
                if (iD?.['Error Message']) {
                    errors.push(`FMP clave/plan: ${iD['Error Message'].slice(0, 80)}`);
                    break;
                }
                const inc = Array.isArray(iD) && iD.length ? [...iD].reverse() : [];
                if (!inc.length) { errors.push(`FMP: sin datos para ${t} @ ${incUrl.slice(0, 50)}`); continue; }

                const proxyType = incUrl.startsWith('https://corsproxy') ? 'corsproxy'
                    : incUrl.startsWith('https://api.allorigins') ? 'allorigins'
                    : incUrl.startsWith('https://api.codetabs') ? 'codetabs' : 'direct';
                const wrap2 = (u) =>
                    proxyType === 'corsproxy' ? `https://corsproxy.io/?url=${encodeURIComponent(u)}`
                    : proxyType === 'allorigins' ? `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
                    : proxyType === 'codetabs' ? `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
                    : u;

                const [cfR, bsR, kmR] = await Promise.all([
                    fetch(wrap2(`${BASE}/cash-flow-statement/${t}?limit=25&apikey=${key}`), { signal: AbortSignal.timeout(10000) }),
                    fetch(wrap2(`${BASE}/balance-sheet-statement/${t}?limit=25&apikey=${key}`), { signal: AbortSignal.timeout(10000) }),
                    fetch(wrap2(`${BASE}/key-metrics/${t}?limit=25&apikey=${key}`), { signal: AbortSignal.timeout(10000) }),
                ]);
                const [cD, bD, kD] = await Promise.all([cfR.json(), bsR.json(), kmR.json()]);
                const cf = Array.isArray(cD) && cD.length ? [...cD].reverse() : [];
                const bs = Array.isArray(bD) && bD.length ? [...bD].reverse() : [];
                const km = Array.isArray(kD) && kD.length ? [...kD].reverse() : [];
                const years = inc.map(x => parseInt((x.calendarYear || x.date || '').slice(0, 4)));
                const r = _buildFundamentalsResult(years, inc, cf, bs, km, 0);
                if (r) return r;
                errors.push(`FMP: _buildFundamentalsResult vacío para ${t}`);
            } catch (e) { errors.push(`${e.message} @ ${incUrl.slice(0, 50)}`); }
        }
    }
    return { _errors: errors, _failed: true };
}

function _parseQS(json, ticker) {
    const M = 1e6;
    const r = json?.quoteSummary?.result?.[0];
    if (!r) return null;
    const getV = (obj, ...keys) => { for (const k of keys) { const v = obj?.[k]?.raw; if (v != null) return +v; } return null; };
    const inc = [...(r.incomeStatementHistory?.incomeStatementHistory || [])].sort((a, b) => a.endDate?.raw - b.endDate?.raw);
    const cf = [...(r.cashflowStatementHistory?.cashflowStatementHistory || [])].sort((a, b) => a.endDate?.raw - b.endDate?.raw);
    const bs = [...(r.balanceSheetHistory?.balanceSheetHistory || [])].sort((a, b) => a.endDate?.raw - b.endDate?.raw);
    const ks = r.defaultKeyStatistics || {};
    const years = inc.map(x => {
        const ts = x.endDate?.raw;
        if (!ts) return null;
        const d = new Date(ts * 1000);
        return isNaN(d.getTime()) ? null : d.getFullYear();
    }).filter(y => y !== null);
    if (!years.length) return null;
    const revenue = inc.map(x => { const v = getV(x, 'totalRevenue'); return v != null ? +(v / M).toFixed(0) : null; });
    const ebit = inc.map(x => { const v = getV(x, 'ebit', 'operatingIncome'); return v != null ? +(v / M).toFixed(0) : null; });
    const net_income = inc.map(x => { const v = getV(x, 'netIncome'); return v != null ? +(v / M).toFixed(0) : null; });
    const cfo = cf.map(x => { const v = getV(x, 'totalCashFromOperatingActivities'); return v != null ? +(v / M).toFixed(0) : null; });
    const capex = cf.map(x => { const v = getV(x, 'capitalExpenditures'); return v != null ? +(v / M).toFixed(0) : null; });
    const fcf = cfo.map((c, i) => c != null && capex[i] != null ? +(c + capex[i]).toFixed(0) : null);
    const gm = inc.map(x => { const g = getV(x, 'grossProfit'), rv = getV(x, 'totalRevenue'); return g && rv ? +((g / rv) * 100).toFixed(1) : null; });
    const ebitda_arr = inc.map((x, i) => { const e = (ebit[i] || 0) * M; const da = Math.abs(getV(x, 'depreciationAndAmortization') || 0); return e + da > 0 ? +((e + da) / M).toFixed(0) : null; });
    const nd = bs.map(x => { const d = getV(x, 'longTermDebt', 'totalDebt') || 0; const c = getV(x, 'cash', 'cashAndCashEquivalents') || 0; return +((d - c) / M).toFixed(0); });
    const buybacks_r = cf.map(x => { const v = getV(x, 'repurchaseOfStock'); return v != null ? +(Math.abs(v) / M).toFixed(0) : null; });
    const eps = inc.map(x => { const v = getV(x, 'basicEPS', 'dilutedEPS'); return v != null ? +v.toFixed(2) : null; });
    const shares = getV(ks, 'sharesOutstanding') || 1;
    const fsh = fcf.map(f => f != null ? +((f * M) / shares).toFixed(2) : null);
    const curP = state.priceCache[ticker] || 0;
    const roe_r = bs.map((x, i) => { const eq = getV(x, 'totalStockholderEquity'); return eq && net_income[i] ? +((net_income[i] * M / eq) * 100).toFixed(1) : null; });
    const roic_r = bs.map((x, i) => { const eq = getV(x, 'totalStockholderEquity') || 0; const d = getV(x, 'longTermDebt') || 0; const ic = eq + d; const n = (ebit[i] || 0) * M * 0.75; return ic > 0 ? +((n / ic) * 100).toFixed(1) : null; });
    return {
        years, revenue, ebit, net_income, cfo, fcf, gross_margin: gm,
        ebit_margin: inc.map((_, i) => revenue[i] && ebit[i] ? +((ebit[i] / revenue[i]) * 100).toFixed(1) : null),
        net_margin: inc.map((_, i) => revenue[i] && net_income[i] ? +((net_income[i] / revenue[i]) * 100).toFixed(1) : null),
        net_debt: nd, debt_ebitda: nd.map((d, i) => ebitda_arr[i] ? +(d / ebitda_arr[i]).toFixed(2) : null),
        interest_coverage: inc.map((x, i) => { const ie = Math.abs(getV(x, 'interestExpense') || 0); return ebit[i] && ie ? +((ebit[i] * M) / ie).toFixed(1) : null; }),
        eps, fcf_per_share: fsh, price_hist: years.map((_, i) => i === years.length - 1 ? curP : null),
        pe_hist: eps.map(e => e && curP ? +(curP / e).toFixed(1) : null),
        pfcf_hist: fsh.map(f => f && f > 0 && curP ? +(curP / f).toFixed(1) : null),
        ev_ebitda_hist: years.map(() => null), roe: roe_r, roic: roic_r, buybacks: buybacks_r
    };
}

async function _fetchYahooQS(ticker) {
    const errors = [];
    for (const proxyFn of QS_PROXIES) {
        try {
            const url = proxyFn(ticker);
            const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
            if (!res.ok) { errors.push(`HTTP ${res.status} @ ${url.slice(0, 70)}`); continue; }
            const json = await res.json();
            const r = _parseQS(json, ticker);
            if (r) return r;
            errors.push('QS parse falló');
        } catch (e) { errors.push(`${e.message} @ ${url.slice(0, 50)}`); }
    }
    return { _errors: errors, _failed: true };
}

export async function fetchFundamentals(ticker) {
    state._fundsDebug = null;
    const debug = { ts: null, fmp: null, yahoo: null };

    const r0 = await import('./yahoo.service.js').then(m => m._fetchYahooTimeSeries(ticker));
    if (r0 && !r0._failed) return r0;
    debug.ts = r0?._errors || ['Yahoo TS sin datos'];

    if (state.fmpKey) {
        const r = await _fetchFMP(ticker, state.fmpKey);
        if (r && !r._failed) return r;
        debug.fmp = r?._errors || ['FMP no devolvió datos'];
    }

    const r2 = await _fetchYahooQS(ticker);
    if (r2 && !r2._failed) return r2;
    debug.yahoo = r2?._errors || ['Yahoo QS no devolvió datos'];

    state._fundsDebug = debug;
    return null;
}

export async function fetchRadarQuotesFMP(tickers) {
    if (!state.fmpKey) return null;
    const CHUNK = 50;
    const out = {};
    for (let i = 0; i < tickers.length; i += CHUNK) {
        const chunk = tickers.slice(i, i + CHUNK);
        try {
            const symbols = chunk.map(t => encodeURIComponent(t)).join(',');
            const res = await fetch(`https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${state.fmpKey}`, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) continue;
            const arr = await res.json();
            if (!Array.isArray(arr)) continue;
            arr.forEach(r => {
                if (r?.price == null || !r?.symbol) return;
                let price = r.price;
                if (String(r.symbol).toUpperCase().endsWith('.L')) price = +(price / 100).toFixed(4);
                out[r.symbol] = {
                    symbol: r.symbol,
                    shortName: r.name || r.symbol,
                    regularMarketPrice: price,
                    marketCap: r.marketCap ?? ((price && r.sharesOutstanding) ? price * r.sharesOutstanding : null),
                    currency: r.symbol.endsWith('.MC') ? 'EUR' : r.symbol.endsWith('.L') ? 'GBP' : 'USD',
                    exchange: r.exchange || '',
                    sector: null,
                    trailingPE: r.pe ?? null,
                    forwardPE: null, priceToBook: null,
                    trailingAnnualDividendYield: null,
                    returnOnEquity: null, profitMargins: null, debtToEquity: null, payoutRatio: null,
                };
            });
        } catch (e) { console.warn('fetchRadarQuotesFMP chunk falló:', e); }
    }
    return Object.keys(out).length ? out : null;
}