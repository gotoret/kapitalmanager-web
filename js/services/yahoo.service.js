/**
 * Servicio de Yahoo Finance - Precios, históricos, dividendos
 */

import { state, save, saveCaches, ls, safeDateStr, compareDates } from '../config/state.js';
import { 
    PROXIES, SEARCH_PROXIES, YIELD_PROXIES, TS_PROXIES, TS_ANNUAL,
    BATCH_QUOTE_PROXIES 
} from '../config/constants.js';
import { sleep, toEUR } from '../utils/helpers.js';
import { renderHeader } from '../components/header.js';
import { buildDivInfo } from '../components/dividends.js';

let autoRetryTimer = null;
let autoRetryPriceAttempts = 0;
let pricesInFlight = false;
let countdownInterval = null;

// ── Precios en tiempo real ──

export async function fetchQuotesFMP(tickers) {
    if (!state.fmpKey) return null;
    try {
        const symbols = tickers.map(t => encodeURIComponent(t)).join(',');
        const res = await fetch(`https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${state.fmpKey}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const arr = await res.json();
        if (!Array.isArray(arr) || !arr.length) return null;
        const map = {};
        arr.forEach(r => {
            if (r?.price == null || !r?.symbol) return;
            if (r.changesPercentage != null) state.priceChangeCache[r.symbol] = +Number(r.changesPercentage).toFixed(2);
            let price = r.price;
            if (String(r.symbol).toUpperCase().endsWith('.L')) price = +(price / 100).toFixed(4);
            map[r.symbol] = price;
        });
        return Object.keys(map).length ? map : null;
    } catch (e) {
        console.error('fetchQuotesFMP: fallo →', e);
        return null;
    }
}

export async function fetchQuotesTwelveData(tickers) {
    if (!state.twelveDataKey) return null;
    const capped = tickers.slice(0, 8);
    try {
        const symbols = capped.map(t => encodeURIComponent(t)).join(',');
        const res = await fetch(`https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${state.twelveDataKey}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        const entries = data?.symbol ? [[data.symbol, data]] : Object.entries(data || {});
        const map = {};
        entries.forEach(([sym, r]) => {
            let price = parseFloat(r?.close);
            if (isNaN(price)) return;
            if (r?.percent_change != null) state.priceChangeCache[sym] = +Number(r.percent_change).toFixed(2);
            if (String(sym).toUpperCase().endsWith('.L')) price = +(price / 100).toFixed(4);
            map[sym] = price;
        });
        return Object.keys(map).length ? map : null;
    } catch (e) {
        console.error('fetchQuotesTwelveData: fallo →', e);
        return null;
    }
}

export async function fetchQuotesFCS(tickers) {
    if (!state.fcsapiKey) return null;
    try {
        const symbols = tickers.map(t => encodeURIComponent(t)).join(',');
        const res = await fetch(`https://api-v4.fcsapi.com/stock/latest?symbol=${symbols}&access_key=${state.fcsapiKey}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        const arr = data?.response;
        if (!Array.isArray(arr) || !arr.length) return null;
        const map = {};
        arr.forEach(r => {
            let price = parseFloat(r?.c ?? r?.close ?? r?.price);
            const sym = r?.s || r?.symbol;
            if (isNaN(price) || !sym) return;
            if (r?.cp != null) state.priceChangeCache[sym] = +Number(r.cp).toFixed(2);
            if (String(sym).toUpperCase().endsWith('.L')) price = +(price / 100).toFixed(4);
            map[sym] = price;
        });
        return Object.keys(map).length ? map : null;
    } catch (e) {
        console.error('fetchQuotesFCS: fallo →', e);
        return null;
    }
}

export async function fetchQuotesFinnhub(tickers) {
    if (!state.finnhubKey) return null;
    const map = {};
    const CONCURRENCY = 8;
    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
        const chunk = tickers.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(async (ticker) => {
            try {
                const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${state.finnhubKey}`, { signal: AbortSignal.timeout(6000) });
                if (!res.ok) return;
                const r = await res.json();
                if (r?.c != null && r.c !== 0) {
                    map[ticker] = String(ticker).toUpperCase().endsWith('.L') ? +(r.c / 100).toFixed(4) : r.c;
                    if (r.dp != null) state.priceChangeCache[ticker] = +Number(r.dp).toFixed(2);
                }
            } catch (e) { /* se ignora este ticker */ }
        }));
    }
    return Object.keys(map).length ? map : null;
}

export async function fetchQuotesMarketstack(tickers) {
    if (!state.marketstackKey) return null;
    try {
        const symbols = tickers.map(t => encodeURIComponent(t)).join(',');
        const res = await fetch(`https://api.marketstack.com/v1/eod/latest?access_key=${state.marketstackKey}&symbols=${symbols}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        const arr = data?.data;
        if (!Array.isArray(arr) || !arr.length) return null;
        const map = {};
        arr.forEach(r => {
            if (r?.close == null || !r?.symbol) return;
            map[r.symbol] = String(r.symbol).toUpperCase().endsWith('.L') ? +(r.close / 100).toFixed(4) : r.close;
        });
        return Object.keys(map).length ? map : null;
    } catch (e) {
        console.error('fetchQuotesMarketstack: fallo →', e);
        return null;
    }
}

export async function fetchQuotesAlphaVantage(tickers) {
    if (!state.alphaVantageKey) return null;
    const map = {};
    const limited = tickers.slice(0, 5);
    for (const ticker of limited) {
        try {
            const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${state.alphaVantageKey}`, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) continue;
            const data = await res.json();
            const price = parseFloat(data?.['Global Quote']?.['05. price']);
            if (!isNaN(price)) {
                map[ticker] = String(ticker).toUpperCase().endsWith('.L') ? +(price / 100).toFixed(4) : price;
                const chg = parseFloat(data?.['Global Quote']?.['10. change percent']);
                if (!isNaN(chg)) state.priceChangeCache[ticker] = +chg.toFixed(2);
            }
        } catch (e) { /* se ignora este ticker */ }
    }
    return Object.keys(map).length ? map : null;
}

export async function fetchQuotesEdgeFunction(tickers) {
    try {
        const { supabaseClient } = await import('./supabase.service.js');
        const { data, error } = await supabaseClient.functions.invoke('quotes', {
            body: { tickers }
        });
        if (error || !data?.prices) return null;
        if (data.changes) {
            Object.entries(data.changes).forEach(([t, chg]) => { state.priceChangeCache[t] = chg; });
        }
        return data.prices;
    } catch (e) {
        console.error('fetchQuotesEdgeFunction: fallo →', e);
        return null;
    }
}

export async function fetchBatchQuotes(tickers) {
    if (!tickers.length) return {};
    const symbols = tickers.map(t => encodeURIComponent(t)).join(',');
    for (const proxyFn of BATCH_QUOTE_PROXIES) {
        try {
            const url = proxyFn(symbols);
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const data = await res.json();
            const results = data?.quoteResponse?.result;
            if (!Array.isArray(results) || !results.length) continue;
            const map = {};
            results.forEach(r => {
                let price = r?.regularMarketPrice;
                if (price == null) return;
                const prevClose = r?.regularMarketPreviousClose;
                if (prevClose && prevClose > 0) {
                    state.priceChangeCache[r.symbol] = +(((price - prevClose) / prevClose) * 100).toFixed(2);
                }
                if (String(r.symbol).toUpperCase().endsWith('.L')) price = +(price / 100).toFixed(4);
                map[r.symbol] = price;
            });
            if (Object.keys(map).length) return map;
        } catch (e) { /* probar el siguiente proxy */ }
    }
    return {};
}

export async function fetchWithProxy(proxies, ticker) {
    for (const proxyFn of proxies) {
        try {
            const url = proxyFn(ticker);
            const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) continue;
            const data = await res.json();
            const meta = data?.chart?.result?.[0]?.meta;
            let price = meta?.regularMarketPrice;
            if (price) {
                const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
                if (prevClose && prevClose > 0) {
                    state.priceChangeCache[ticker] = +(((price - prevClose) / prevClose) * 100).toFixed(2);
                }
                if (String(ticker).toUpperCase().endsWith('.L')) price = +(price / 100).toFixed(4);
                return price;
            }
        } catch (e) { /* try next */ }
    }
    return null;
}

export async function fetchWithProxyFull(proxies, ticker) {
    for (const proxyFn of proxies) {
        try {
            const url = proxyFn(ticker);
            const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) continue;
            const data = await res.json();
            const meta = data?.chart?.result?.[0]?.meta;
            if (meta?.regularMarketPrice) {
                if (String(ticker).toUpperCase().endsWith('.L')) {
                    meta.regularMarketPrice = +(meta.regularMarketPrice / 100).toFixed(4);
                    if (meta.fiftyTwoWeekHigh) meta.fiftyTwoWeekHigh = +(meta.fiftyTwoWeekHigh / 100).toFixed(4);
                    if (meta.fiftyTwoWeekLow) meta.fiftyTwoWeekLow = +(meta.fiftyTwoWeekLow / 100).toFixed(4);
                }
                return meta;
            }
        } catch (e) { /* try next */ }
    }
    return null;
}

export async function fetchYahooSearch(query) {
    for (const proxyFn of SEARCH_PROXIES) {
        try {
            const url = proxyFn(query);
            const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) continue;
            const data = await res.json();
            const quotes = data?.quotes || [];
            return quotes.filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF').map(q => ({
                ticker: q.symbol,
                name: q.longname || q.shortname || q.symbol,
                exchange: q.exchange || '',
                type: q.quoteType || ''
            }));
        } catch (e) { /* try next */ }
    }
    return [];
}

export async function fetchFXRates() {
    const pairs = ['EURUSD=X', 'EURGBP=X', 'EURJPY=X', 'EURCHF=X', 'EURCAD=X', 'EURAUD=X'];
    for (const pair of pairs) {
        const price = await fetchWithProxy(PROXIES, pair);
        if (price) {
            const cur = pair.replace('EUR', '').replace('=X', '');
            state.fxCache[cur] = +(1 / price).toFixed(6);
        }
    }
    state.fxCache['EUR'] = 1.0;
}

// ── Actualización de precios ──

export async function refreshPrices(isAutoRetry) {
    if (pricesInFlight) {
        if (isAutoRetry) { if (autoRetryTimer) clearTimeout(autoRetryTimer); autoRetryTimer = setTimeout(() => refreshPrices(true), 5000); }
        return;
    }
    pricesInFlight = true;
    const btn = document.getElementById('refresh-btn');
    if (btn && !isAutoRetry) { btn.disabled = true; btn.textContent = '⏳ Actualizando...'; }
    try {
        await fetchFXRates();

        let liveCount = 0;
        const tickers = state.positions.map(p => p.ticker);
        const missing = tickers.filter(t => state.priceCache[t] == null);
        const already = tickers.filter(t => state.priceCache[t] != null);
        let remaining = [...missing, ...already];

        const PROVIDER_CHAIN = [
            fetchQuotesEdgeFunction,
            fetchQuotesFMP,
            fetchQuotesTwelveData,
            fetchQuotesFCS,
            fetchQuotesFinnhub,
            fetchBatchQuotes,
            fetchQuotesMarketstack,
            fetchQuotesAlphaVantage,
        ];

        for (const provider of PROVIDER_CHAIN) {
            if (!remaining.length) break;
            let result = null;
            try { result = await provider(remaining); } catch (e) { result = null; }
            if (result) {
                remaining.forEach(t => {
                    if (result[t] != null) { state.priceCache[t] = result[t]; liveCount++; }
                });
                remaining = remaining.filter(t => result[t] == null);
            }
        }

        const CONCURRENCY = 5;
        for (let i = 0; i < remaining.length; i += CONCURRENCY) {
            const chunk = remaining.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(async (ticker) => {
                const price = await fetchWithProxy(PROXIES, ticker);
                if (price) {
                    state.priceCache[ticker] = price;
                    liveCount++;
                }
            }));
            if (i + CONCURRENCY < remaining.length) await sleep(150);
        }

        state.livePrices = liveCount > 0;
        state.pricesStale = liveCount < tickers.length;
        state.lastUpdate = new Date();
        state.countdown = 60;
        saveCaches();

        const stillMissing = tickers.filter(t => state.priceCache[t] == null);
        if (autoRetryTimer) { clearTimeout(autoRetryTimer); autoRetryTimer = null; }
        if (stillMissing.length) {
            autoRetryPriceAttempts = (autoRetryPriceAttempts || 0) + 1;
            if (autoRetryPriceAttempts <= 6) {
                autoRetryTimer = setTimeout(() => refreshPrices(true), 15000);
            }
        } else {
            autoRetryPriceAttempts = 0;
        }

        const tag = document.getElementById('price-mode-tag');
        if (tag) {
            if (state.livePrices) {
                tag.className = 'price-tag price-live';
                tag.textContent = state.pricesStale
                    ? `✅ ${liveCount}/${tickers.length} precios en tiempo real (el resto: último precio conocido)`
                    : `✅ ${liveCount}/${tickers.length} precios en tiempo real`;
            } else {
                tag.className = 'price-tag price-sim';
                tag.textContent = '⚠️ Sin conexión: mostrando últimos precios conocidos';
            }
        }

        checkAlerts();
        renderHeader();
        import('../components/tabs.js').then(m => m.renderActiveTab());

    } finally {
        const btnEnd = document.getElementById('refresh-btn');
        if (btnEnd) { btnEnd.disabled = false; btnEnd.textContent = '↻ Actualizar'; }
        pricesInFlight = false;
    }
}

// ── Alertas ──

export function checkAlerts() {
    state.alerts.forEach(a => {
        if (!a.active || a.triggered) return;
        const pos = state.positions.find(p => p.ticker === a.ticker);
        const cp = state.priceCache[a.ticker];
        if (!cp) return;
        const cpE = pos ? priceToEUR(cp, pos) : toEUR(cp, pos?.currency || 'EUR');
        if ((a.direction === 'ABOVE' && cpE >= a.price) || (a.direction === 'BELOW' && cpE <= a.price)) {
            a.triggered = true;
            a.active = false;
            notifyAlertTriggered(a, cpE);
        }
    });
    save();
}

function notifyAlertTriggered(alert, currentPrice) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        const n = new Notification(`🔔 ${alert.ticker} ha ${alert.direction === 'ABOVE' ? 'subido' : 'bajado'} de precio`, {
            body: `Precio objetivo: ${fmtEUR(alert.price)} · Precio actual: ${fmtEUR(currentPrice)}`,
            tag: `km-alert-${alert.id}`,
        });
        n.onclick = () => { window.focus(); n.close(); };
    } catch (e) { console.warn('No se pudo mostrar la notificación:', e); }
}

export function maybeRequestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
}

// ── Countdown ──

export function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        state.countdown--;
        if (state.countdown <= 0) { refreshPrices(); return; }
        const el = document.getElementById('last-update-label');
        if (el && state.lastUpdate) el.textContent = `Actualizado: ${state.lastUpdate.toLocaleTimeString('es-ES')} | Próx: ${state.countdown}s`;
    }, 1000);
}

// ── Dividendos ──

export async function fetchDividendDataFMP(ticker) {
    if (!state.fmpKey) return null;
    try {
        const res = await fetch(`https://financialmodelingprep.com/stable/dividends?symbol=${encodeURIComponent(ticker)}&apikey=${state.fmpKey}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const arr = await res.json();
        if (!Array.isArray(arr) || !arr.length) return { yield: 0, rate: 0, exDate: null, freq: '—' };

        const sorted = [...arr].sort((a, b) => new Date(b.date) - new Date(a.date));
        const freqMap = { 'Monthly': 'Mensual', 'Quarterly': 'Trimestral', 'Semi-Annual': 'Semestral', 'Annual': 'Anual' };
        const freqRaw = sorted[0]?.frequency;
        const freq = freqMap[freqRaw] || 'Anual';
        const nPagos = { 'Mensual': 12, 'Trimestral': 4, 'Semestral': 2, 'Anual': 1 }[freq];

        const recent = sorted.slice(0, nPagos);
        const annualDividend = recent.reduce((s, d) => s + (d.dividend ?? d.adjDividend ?? 0), 0);

        return {
            yield: null,
            rate: +annualDividend.toFixed(4),
            exDate: sorted[0]?.date || null,
            freq
        };
    } catch (e) {
        console.warn(`fetchDividendDataFMP(${ticker}) falló:`, e?.message || e);
        return null;
    }
}

export async function fetchDividendData(ticker, proxyStartIdx) {
    const fmpResult = await fetchDividendDataFMP(ticker);
    if (fmpResult && fmpResult.rate > 0) {
        const price = state.priceCache[ticker];
        let rate = fmpResult.rate;
        if (price > 0) {
            const impliedYield = rate / price;
            if (impliedYield > 0.5) rate = rate / 100;
            else if (impliedYield < 0.0005) rate = rate * 100;
        }
        fmpResult.rate = +rate.toFixed(4);
        fmpResult.yield = price ? +(rate / price).toFixed(4) : null;
        return fmpResult;
    }
    const n = YIELD_PROXIES.length;
    const start = proxyStartIdx || 0;
    for (let i = 0; i < n; i++) {
        const proxyFn = YIELD_PROXIES[(start + i) % n];
        try {
            const url = proxyFn(ticker);
            const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) continue;
            const data = await res.json();
            const result = data?.chart?.result?.[0];
            if (!result) continue;

            const isGBp = String(ticker).toUpperCase().endsWith('.L');
            let price = result.meta?.regularMarketPrice;
            if (isGBp && price) price = price / 100;

            const divEvents = result.events?.dividends;
            if (!divEvents || !Object.keys(divEvents).length) {
                return { yield: 0, rate: 0, exDate: null, freq: '—' };
            }

            const list = Object.values(divEvents).sort((a, b) => a.date - b.date);
            const oneYearAgo = Date.now() / 1000 - 365 * 86400;
            const lastYear = list.filter(d => d.date >= oneYearAgo);
            const sample = lastYear.length ? lastYear : list.slice(-4);

            let annualDividend = sample.reduce((s, d) => s + (d.amount || 0), 0) * (lastYear.length ? 1 : 4 / sample.length);
            if (isGBp) annualDividend = annualDividend / 100;

            const nPagos = lastYear.length || sample.length;
            const freq = nPagos >= 10 ? 'Mensual' : nPagos >= 3 ? 'Trimestral' : nPagos >= 2 ? 'Semestral' : 'Anual';

            const lastExTs = Math.max(...list.map(d => d.date));
            return {
                yield: price ? +(annualDividend / price).toFixed(4) : null,
                rate: +annualDividend.toFixed(4),
                exDate: lastExTs ? new Date(lastExTs * 1000).toISOString().slice(0, 10) : null,
                freq
            };
        } catch (e) { /* probar siguiente proxy */ }
    }
    return null;
}

let autoRetryYieldTimer = null;
let autoRetryYieldAttempts = 0;
let yieldsInFlight = false;

export async function refreshDividendYields() {
    if (yieldsInFlight) {
        if (autoRetryYieldTimer) clearTimeout(autoRetryYieldTimer);
        autoRetryYieldTimer = setTimeout(refreshDividendYields, 6000);
        return;
    }
    yieldsInFlight = true;
    try {
        const tickers = [...new Set(state.positions.map(p => p.ticker))];
        tickers.filter(t => String(t).toUpperCase().endsWith('.L')).forEach(t => { delete state.yieldCache[t]; });
        const pending = tickers.filter(t => !state.yieldCache[t]);
        if (autoRetryYieldTimer) { clearTimeout(autoRetryYieldTimer); autoRetryYieldTimer = null; }
        if (!pending.length) { autoRetryYieldAttempts = 0; return; }

        const CONCURRENCY = 3;
        for (let i = 0; i < pending.length; i += CONCURRENCY) {
            const chunk = pending.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(async (t, j) => {
                const d = await fetchDividendData(t, (i + j) % YIELD_PROXIES.length);
                if (d) state.yieldCache[t] = d;
            }));
            buildDivInfo();
            saveCaches();
            if (state.activeTab === 2) import('../components/tabs.js').then(m => m.renderActiveTab());
            if (i + CONCURRENCY < pending.length) await sleep(400);
        }

        const stillPending = tickers.filter(t => !state.yieldCache[t]);
        if (stillPending.length) {
            autoRetryYieldAttempts = (autoRetryYieldAttempts || 0) + 1;
            if (autoRetryYieldAttempts <= 8) {
                autoRetryYieldTimer = setTimeout(refreshDividendYields, 12000);
            }
        } else {
            autoRetryYieldAttempts = 0;
        }
    } finally {
        yieldsInFlight = false;
    }
}

// ── Histórico de precios ──

export async function fetchPriceHistory(ticker, range = '1y') {
    if (!state._chartCache) state._chartCache = {};
    if (!state._chartCacheOrder) state._chartCacheOrder = [];
    const key = `${ticker}_${range}`;
    if (state._chartCache[key] === 'loading') return;
    state._chartCache[key] = 'loading';

    const isGBp = ticker.toUpperCase().endsWith('.L');
    const interval = range === '10y' || range === '5y' ? '1mo' : range === '3y' ? '1wk' : range === '6mo' || range === 'ytd' ? '1d' : '1wk';

    const histProxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`)}`,
    ];

    for (const url of histProxies) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) continue;
            const json = await res.json();
            const result = json?.chart?.result?.[0];
            if (!result) continue;
            const timestamps = result.timestamp || [];
            const closes = result.indicators?.quote?.[0]?.close || [];
            if (timestamps.length < 3) continue;

            const prices = timestamps.map((t, i) => ({
                t, v: closes[i] != null ? (isGBp ? closes[i] / 100 : closes[i]) : null
            })).filter(p => p.v != null);

            if (prices.length < 3) continue;
            state._chartCache[key] = prices;
            state._chartCacheOrder = state._chartCacheOrder.filter(k => k !== key);
            state._chartCacheOrder.push(key);
            const MAX_PRICE_HIST_CACHE = 20;
            while (state._chartCacheOrder.length > MAX_PRICE_HIST_CACHE) {
                const old = state._chartCacheOrder.shift();
                delete state._chartCache[old];
            }
            if (state.selectedTicker === ticker && state.activeTab === 0) import('../components/tabs.js').then(m => m.renderActiveTab());
            return;
        } catch (e) {}
    }
    state._chartCache[key] = null;
    if (state.selectedTicker === ticker && state.activeTab === 0) import('../components/tabs.js').then(m => m.renderActiveTab());
}

// ── Fuentes de precios (modal) ──

export function openPriceSourcesModal() {
    const fields = [
        { key: 'fmpKey', ls: 'km_fmp_key', label: 'Financial Modeling Prep', url: 'financialmodelingprep.com/developer' },
        { key: 'twelveDataKey', ls: 'km_twelvedata_key', label: 'Twelve Data', url: 'twelvedata.com' },
        { key: 'fcsapiKey', ls: 'km_fcsapi_key', label: 'FCS API', url: 'fcsapi.com' },
        { key: 'finnhubKey', ls: 'km_finnhub_key', label: 'Finnhub', url: 'finnhub.io' },
        { key: 'marketstackKey', ls: 'km_marketstack_key', label: 'Marketstack', url: 'marketstack.com' },
        { key: 'alphaVantageKey', ls: 'km_alphavantage_key', label: 'Alpha Vantage', url: 'alphavantage.co' },
    ];
    openModal(`
        <h3>⚙️ Fuentes de precios</h3>
        <div class="small" style="margin-bottom:12px;color:#64748b">
            Al actualizar, se prueban en orden hasta conseguir el precio de cada acción. Las que dejes en blanco se saltan solas.
        </div>
        <div class="field" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 12px;margin-bottom:12px">
            <label style="color:#166534">✅ Yahoo Finance — activo siempre, no necesita clave</label>
            <div class="small" style="color:#166534">Es la primera fuente que se prueba (directo y luego por proxy si falla). No hace falta que hagas nada aquí.</div>
        </div>
        ${fields.map(f => `
            <div class="field">
                <label>${f.label} <a href="https://${f.url}" target="_blank" style="font-size:11px;color:#2563eb">(conseguir clave gratis)</a></label>
                <input id="m-src-${f.key}" class="inp" placeholder="Pega aquí tu API key (opcional)" value="${esc(state[f.key] || '')}">
            </div>`).join('')}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
            <button class="btn-gray" onclick="window.closeModal()">Cancelar</button>
            <button class="btn" onclick="window.savePriceSourcesModal()">💾 Guardar</button>
        </div>`);
}

export function savePriceSourcesModal() {
    const fields = [
        ['fmpKey', 'km_fmp_key'], ['twelveDataKey', 'km_twelvedata_key'], ['fcsapiKey', 'km_fcsapi_key'],
        ['finnhubKey', 'km_finnhub_key'], ['marketstackKey', 'km_marketstack_key'],
        ['alphaVantageKey', 'km_alphavantage_key'],
    ];
    fields.forEach(([key, lsKey]) => {
        const val = (document.getElementById(`m-src-${key}`)?.value || '').trim();
        state[key] = val;
        ls.set(lsKey, val);
    });
    closeModal();
    alert('Fuentes de precios guardadas. Pulsa "Actualizar" para probarlas.');
}

// ── Yahoo Time Series (para fundamentales) ──

export async function _fetchYahooTimeSeries(ticker) {
    const errors = [];
    for (const proxyFn of TS_PROXIES) {
        const url = proxyFn(ticker);
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
            if (!res.ok) { errors.push(`HTTP ${res.status} @ ${url.slice(0, 70)}`); continue; }
            const json = await res.json();
            const ts = json?.timeseries?.result;
            if (!ts?.length) { errors.push(`TS vacío @ ${url.slice(0, 60)}`); continue; }

            const map = {};
            ts.forEach(item => {
                const type = item.meta?.type?.[0];
                if (!type) return;
                const values = item[type];
                if (Array.isArray(values)) map[type] = values.filter(v => v?.reportedValue?.raw != null);
            });

            const revSeries = map['annualTotalRevenue'] || [];
            if (!revSeries.length) { errors.push(`Sin annualTotalRevenue @ ${url.slice(0, 60)}`); continue; }

            const M = 1e6;
            const getTS = (key, i) => { const s = map[key]; return s?.[i]?.reportedValue?.raw ?? null; };
            const n = revSeries.length;
            const years = revSeries.map(x => {
                const year = parseInt(x.asOfDate?.slice(0, 4));
                return isNaN(year) ? null : year;
            }).filter(y => y !== null);

            const clamp = (v, min, max) => v != null && v >= min && v <= max ? v : null;

            const revenue = Array.from({ length: n }, (_, i) => { const v = getTS('annualTotalRevenue', i); return v != null ? +(v / M).toFixed(0) : null; });
            const ebit = Array.from({ length: n }, (_, i) => { const v = getTS('annualOperatingIncome', i); return v != null ? +(v / M).toFixed(0) : null; });
            const net_income = Array.from({ length: n }, (_, i) => { const v = getTS('annualNetIncome', i); return v != null ? +(v / M).toFixed(0) : null; });
            const ebitda_arr = Array.from({ length: n }, (_, i) => { const v = getTS('annualEbitda', i); return v != null ? +(v / M).toFixed(0) : null; });
            const cfo = Array.from({ length: n }, (_, i) => { const v = getTS('annualOperatingCashFlow', i); return v != null ? +(v / M).toFixed(0) : null; });
            const capex = Array.from({ length: n }, (_, i) => { const v = getTS('annualCapitalExpenditure', i); return v != null ? +(v / M).toFixed(0) : null; });
            const fcf_raw = Array.from({ length: n }, (_, i) => getTS('annualFreeCashFlow', i));
            const fcf = fcf_raw.map((v, i) => v != null ? +(v / M).toFixed(0) : (cfo[i] != null && capex[i] != null ? +(cfo[i] + capex[i]).toFixed(0) : null));
            const gross_margin = Array.from({ length: n }, (_, i) => { const v = getTS('annualGrossProfitMargin', i); return clamp(v != null ? +(v * 100).toFixed(1) : null, -10, 100); });
            const ebit_margin = Array.from({ length: n }, (_, i) => { const v = getTS('annualOperatingIncomeMargin', i); return clamp(v != null ? +(v * 100).toFixed(1) : null, -50, 80); });
            const net_margin = Array.from({ length: n }, (_, i) => { const v = getTS('annualNetIncomeMargin', i); return clamp(v != null ? +(v * 100).toFixed(1) : null, -50, 60); });
            const totalDebt = Array.from({ length: n }, (_, i) => getTS('annualTotalDebt', i));
            const cash = Array.from({ length: n }, (_, i) => getTS('annualCashAndCashEquivalents', i));
            const net_debt = totalDebt.map((d, i) => { const c = cash[i] || 0; return d != null ? +((d - c) / M).toFixed(0) : null; });
            const buybacks_raw = Array.from({ length: n }, (_, i) => getTS('annualRepurchaseOfCapitalStock', i));
            const buybacks = buybacks_raw.map(v => v != null ? +(Math.abs(v) / M).toFixed(0) : null);
            const debt_ebitda = net_debt.map((nd, i) => ebitda_arr[i] && ebitda_arr[i] > 0 ? clamp(+(nd / ebitda_arr[i]).toFixed(2), -5, 20) : null);
            const roe = Array.from({ length: n }, (_, i) => { const v = getTS('annualReturnOnEquity', i); return v != null ? clamp(+(v * 100).toFixed(1), -60, 100) : null; });
            const roic = Array.from({ length: n }, (_, i) => {
                const ni = (net_income[i] || 0) * M;
                const d = totalDebt[i] || 0;
                const c = cash[i] || 0;
                const netD = Math.max(0, d - c);
                const ebitdaV = (ebitda_arr[i] || 0) * M;
                const capEmp = netD + Math.max(ebitdaV * 4, 1);
                const v = ni && capEmp ? +((ni / capEmp) * 100).toFixed(1) : null;
                return clamp(v, -30, 80);
            });
            const eps = Array.from({ length: n }, (_, i) => { const v = getTS('annualBasicEPS', i) ?? getTS('annualDilutedEPS', i); return v != null ? +v.toFixed(2) : null; });
            const intExp = Array.from({ length: n }, (_, i) => getTS('annualInterestExpense', i));
            const interest_coverage = ebit.map((e, i) => { const ie = Math.abs(intExp[i] || 0); return e != null && ie ? clamp(+((e * M) / ie).toFixed(1), 0, 50) : null; });
            const curP = state.priceCache[ticker] || 0;
            const fcf_per_share = fcf.map((f, i) => {
                const ni = net_income[i];
                const e = eps[i];
                if (f != null && ni && e && Math.abs(ni) > 0) return clamp(+(f * e / ni).toFixed(2), -50, 200);
                return null;
            });
            const pe_hist = eps.map(e => e && e > 0 && curP ? clamp(+(curP / e).toFixed(1), 0, 200) : null);
            const pfcf_hist = fcf_per_share.map(f => f && f > 0 && curP ? clamp(+(curP / f).toFixed(1), 0, 200) : null);

            const result = {
                years, revenue, ebit, net_income, cfo, fcf, gross_margin, ebit_margin, net_margin,
                net_debt, debt_ebitda, interest_coverage, eps, fcf_per_share,
                price_hist: years.map((_, i) => i === years.length - 1 ? curP : null),
                pe_hist, pfcf_hist, ev_ebitda_hist: years.map(() => null), roe, roic, buybacks
            };

            return result;
        } catch (e) { errors.push(`${e.message} @ ${url.slice(0, 50)}`); }
    }
    return { _errors: errors, _failed: true };
}