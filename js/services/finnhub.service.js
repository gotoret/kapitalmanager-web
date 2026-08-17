/**
 * Servicio de Finnhub - Noticias y eventos corporativos
 */

import { state } from '../config/state.js';

export async function loadNewsAndEvents() {
    if (!state.finnhubKey) return;
    if (state._newsLoading) return;
    state._newsLoading = true;
    state._newsProgress = { done: 0, total: state.positions.length };
    import('../components/tabs.js').then(m => m.renderActiveTab());

    const news = {};
    const CONCURRENCY = 3;
    const tickers = state.positions.map(p => p.ticker).filter(Boolean);
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 14);
    const fmt = d => d.toISOString().slice(0, 10);

    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
        const batch = tickers.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map(async t => {
            try {
                const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(t)}&from=${fmt(from)}&to=${fmt(today)}&token=${state.finnhubKey}`, { signal: AbortSignal.timeout(8000) });
                if (!res.ok) return;
                const arr = await res.json();
                if (Array.isArray(arr) && arr.length) news[t] = arr.slice(0, 2);
            } catch (e) { console.warn(`loadNewsAndEvents(${t}) falló:`, e?.message || e); }
        }));
        state._newsProgress.done += batch.length;
        import('../components/tabs.js').then(m => m.renderActiveTab());
    }

    let earnings = [];
    try {
        const to = new Date(today);
        to.setDate(to.getDate() + 45);
        const res = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${fmt(today)}&to=${fmt(to)}&token=${state.finnhubKey}`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
            const data = await res.json();
            const tickerSet = new Set(tickers);
            earnings = (data?.earningsCalendar || []).filter(e => tickerSet.has(e.symbol));
        }
    } catch (e) { console.warn('loadNewsAndEvents: calendario de resultados falló:', e?.message || e); }

    state._newsCache = { news, earnings, loadedAt: new Date() };
    state._newsLoading = false;
    import('../components/tabs.js').then(m => m.renderActiveTab());
}