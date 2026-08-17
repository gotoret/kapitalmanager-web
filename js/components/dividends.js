/**
 * Componente Dividendos - Renderiza y gestiona dividendos
 */

import { state, save, uid, ls, safeDateStr, compareDates } from '../config/state.js';
import {
    toEUR, posValEUR, posInvEUR, fmtEUR, esc, fmtNum,
    detectCurrencyFromTicker, getFX
} from '../utils/helpers.js';
import { openModal, closeModal, divChartTip, divChartTipHide } from '../utils/dom.utils.js';
import { logoImg } from '../utils/chart.utils.js';
import { renderHeader } from './header.js';

// ── Construir info de dividendos ──

export function buildDivInfo() {
    state.divInfo = state.positions.map(p => {
        const cached = state.yieldCache[p.ticker];
        const hasCache = cached != null;
        const yld = hasCache ? (cached.yield ?? 0) : 0.045;
        const rate = hasCache ? (cached.rate ?? 0) : +(p.avg_cost * 0.045).toFixed(4);
        const annual_income = +(rate * p.shares).toFixed(2);
        const freq = cached?.freq || (hasCache ? 'Anual' : '—');
        return {
            ticker: p.ticker,
            name: p.name,
            shares: p.shares,
            currency: p.currency,
            div_rate: rate,
            div_yield: yld,
            annual_income,
            ex_date: cached?.exDate || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
            freq,
            _estimated: !hasCache
        };
    });
    updateDivTicker();
    autoRegisterDividends();
}

// ── Ticker de dividendos ──

function updateDivTicker() {
    const wrap = document.getElementById('div-ticker-wrap');
    const inner = document.getElementById('div-ticker-inner');
    if (!wrap || !inner) return;

    const items = state.divInfo.filter(d => d.annual_income > 0);
    if (!items.length) { wrap.style.display = 'none'; return; }

    const today = new Date().toISOString().slice(0, 10);

    function nextExDate(lastExDateStr, annualRate, priceRef) {
        if (!lastExDateStr) return null;
        const last = new Date(lastExDateStr);
        const freqDays = 90;
        let next = new Date(last);
        while (next.toISOString().slice(0, 10) <= today) {
            next = new Date(next.getTime() + freqDays * 864e5);
        }
        return next.toISOString().slice(0, 10);
    }

    const withNext = items.map(d => ({
        ...d,
        next_ex: nextExDate(d.ex_date, d.div_rate, d.avg_cost) || d.ex_date
    })).sort((a, b) => a.next_ex.localeCompare(b.next_ex));

    const makeItem = d => {
        const dateStr = new Date(d.next_ex).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        const income = (d.div_rate * d.shares).toFixed(2);
        const est = d._estimated ? '~' : '';
        return `<span>💰 <b>${d.ticker}</b> · ${d.name} · <em>${est}${income}€</em> · <s>próx. ex-div ${dateStr}</s></span>`;
    };

    const html = withNext.map(makeItem).join('  ·  ') + '　　' +
        withNext.map(makeItem).join('  ·  ') + '　　';
    inner.innerHTML = html;

    inner.style.animation = 'none';
    inner.offsetWidth;

    const totalW = inner.scrollWidth / 2;
    const dur = Math.max(10, totalW / 180);
    inner.style.animation = `ticker-slide ${dur}s linear infinite`;

    wrap.style.display = 'block';
}

// ── Auto-registro de dividendos ──

const FREQ_PAYMENTS_PER_YEAR = { 'Mensual': 12, 'Trimestral': 4, 'Semestral': 2, 'Anual': 1 };

export function autoRegisterDividends() {
    if (!state.autoRegisterEnabled) return [];
    if (!state.dividends) state.dividends = [];
    if (!state.divInfo) return [];
    const today = new Date().toISOString().slice(0, 10);
    const newlyAdded = [];

    state.divInfo.forEach(d => {
        if (d._estimated) return;
        if (!d.ex_date || d.ex_date > today) return;
        if (!d.div_rate || d.div_rate <= 0) return;

        const pos = state.positions.find(p => p.ticker === d.ticker);
        if (!pos || !pos.shares || pos.shares <= 0) return;

        const exDateMs = new Date(d.ex_date).getTime();
        const alreadyCovered = state.dividends.some(x => {
            if (x.ticker !== d.ticker) return false;
            let xDate;
            if (x.date instanceof Date) {
                xDate = x.date;
            } else if (typeof x.date === 'string') {
                xDate = new Date(x.date);
            } else if (typeof x.date === 'number') {
                xDate = new Date(x.date);
            } else {
                return false;
            }
            if (isNaN(xDate.getTime())) return false;
            return Math.abs(xDate.getTime() - exDateMs) <= 45 * 86400000;
        });
        if (alreadyCovered) return;

        const paymentsPerYear = FREQ_PAYMENTS_PER_YEAR[d.freq] || 1;
        const amountPerShare = +(d.div_rate / paymentsPerYear).toFixed(4);
        if (amountPerShare <= 0) return;

        const entry = {
            id: uid(),
            ticker: d.ticker,
            amount: amountPerShare,
            shares: Math.round(pos.shares),
            currency: pos.currency || 'EUR',
            date: new Date(d.ex_date).toISOString(),
            fee: 0,
            notes: 'Registrado automáticamente al llegar la fecha ex-dividendo (importe estimado a partir del histórico) — revisa y ajusta si hace falta',
            source: 'auto',
            exDateRef: d.ex_date
        };
        state.dividends.unshift(entry);
        newlyAdded.push(entry);
    });

    if (newlyAdded.length) {
        state._newAutoDividends = [...new Set([...(state._newAutoDividends || []), ...newlyAdded.map(e => e.id)])];
        save();
    }
    return newlyAdded;
}

export function dismissAutoDividendBanner() {
    state._newAutoDividends = [];
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function toggleAutoRegisterDividends(checked) {
    state.autoRegisterEnabled = checked;
    ls.set('km_auto_register_dividends', checked);
    if (checked) autoRegisterDividends();
    import('./tabs.js').then(m => m.renderActiveTab());
}

// ── Render principal ──

export function renderDividends() {
    // Esta función contiene todo el HTML de la pestaña Dividendos
    // Debido a su extensión, aquí se muestra la estructura
    // El código completo debe extraerse del archivo original

    const totalAnn = state.divInfo.reduce((s, d) => s + toEUR(d.annual_income || 0, d.currency || 'EUR'), 0);
    const totalNeto = state.divInfo.reduce((s, d) => {
        const ret = retencionOrigenPct(d.ticker, d.currency);
        return s + toEUR((d.annual_income || 0) * (1 - ret), d.currency || 'EUR');
    }, 0);

    // ... resto del renderizado (ver archivo original)
    return `<div>Dividendos - ver código original</div>`;
}

// ── Funciones auxiliares ──

export function retencionOrigenPct(ticker, currency) {
    const t = String(ticker || '').toUpperCase();
    if (t.endsWith('.MC') || t.endsWith('.MAD')) return 0.19;
    if (t.endsWith('.L')) return 0.00;
    if (t.endsWith('.SW') || t.endsWith('.VX')) return 0.35;
    if (t.endsWith('.PA') || t.endsWith('.NX')) return 0.128;
    if (t.endsWith('.DE') || t.endsWith('.F') || t.endsWith('.BE') || t.endsWith('.MU') || t.endsWith('.DU')) return 0.25;
    if (t.endsWith('.AS')) return 0.15;
    if (t.endsWith('.MI')) return 0.26;
    if (t.endsWith('.LS')) return 0.28;
    if (t.endsWith('.BR')) return 0.30;
    if (t.endsWith('.ST')) return 0.30;
    if (t.endsWith('.HE')) return 0.30;
    if (t.endsWith('.OL')) return 0.25;
    if (t.endsWith('.CO')) return 0.27;
    if (currency === 'USD') return 0.15;
    if (currency === 'CAD') return 0.15;
    if (currency === 'AUD') return 0.15;
    if (currency === 'JPY') return 0.15;
    return 0.15;
}

export function paisLabel(ticker, currency) {
    const t = String(ticker || '').toUpperCase();
    if (t.endsWith('.MC')) return '🇪🇸 España';
    if (t.endsWith('.L')) return '🇬🇧 Reino Unido';
    if (t.endsWith('.SW') || t.endsWith('.VX')) return '🇨🇭 Suiza';
    if (t.endsWith('.PA') || t.endsWith('.NX')) return '🇫🇷 Francia';
    if (t.endsWith('.DE') || t.endsWith('.F') || t.endsWith('.BE') || t.endsWith('.MU') || t.endsWith('.DU')) return '🇩🇪 Alemania';
    if (t.endsWith('.AS')) return '🇳🇱 P. Bajos';
    if (t.endsWith('.MI')) return '🇮🇹 Italia';
    if (t.endsWith('.LS')) return '🇵🇹 Portugal';
    if (t.endsWith('.BR')) return '🇧🇪 Bélgica';
    if (t.endsWith('.ST')) return '🇸🇪 Suecia';
    if (t.endsWith('.HE')) return '🇫🇮 Finlandia';
    if (t.endsWith('.OL')) return '🇳🇴 Noruega';
    if (t.endsWith('.CO')) return '🇩🇰 Dinamarca';
    if (currency === 'USD') return '🇺🇸 EE.UU.';
    if (currency === 'CAD') return '🇨🇦 Canadá';
    if (currency === 'AUD') return '🇦🇺 Australia';
    if (currency === 'JPY') return '🇯🇵 Japón';
    return '🌍 Internacional';
}

export function sortDivTable(col) {
    if (state._divSort.col === col) {
        state._divSort.dir = state._divSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        state._divSort.col = col;
        state._divSort.dir = 'asc';
    }
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function sortDivEsperados(col) {
    if (state._divEsperadosSort.col === col) {
        state._divEsperadosSort.dir = state._divEsperadosSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        state._divEsperadosSort.col = col;
        state._divEsperadosSort.dir = 'asc';
    }
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function toggleDivEsperados() {
    state._divEsperadosCollapsed = !state._divEsperadosCollapsed;
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function toggleDivHistorial() {
    state._divHistorialCollapsed = !state._divHistorialCollapsed;
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function setDivChartTab(idx) {
    state._divChartTab = idx;
    if (idx !== 0) {
        const dividends = state.dividends || [];
        const years = [];
        dividends.forEach(d => {
            let dt;
            if (d.date instanceof Date) {
                dt = d.date;
            } else if (typeof d.date === 'string') {
                dt = new Date(d.date);
            } else if (typeof d.date === 'number') {
                dt = new Date(d.date);
            } else {
                return;
            }
            if (!isNaN(dt.getTime())) {
                years.push(dt.getFullYear());
            }
        });
        const uniqueYears = [...new Set(years)].sort((a, b) => b - a);
        state._divYearSel = uniqueYears.length > 0 ? uniqueYears[0] : 'Anual';
    }
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function selectDivYear(y) {
    state._divYearSel = y;
    import('./tabs.js').then(m => m.renderActiveTab());
}

// ── Selector de año en calendario de dividendos ──

export function selectDivCalendarYear(y) {
    state.divCalendarYearSel = y;
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function openDivCalendarMonth(key) {
    // ... ver código original
}

// ── Exportar/Importar CSV ──

export function exportDividendsCsv() {
    // ... ver código original
}

export async function importDividendsCsv(event) {
    // ... ver código original
}

// ── Modal de dividendo ──

export function openAddDividend() {
    openDividendModal(null);
}

export function editDividend(id) {
    openDividendModal(state.dividends.find(x => x.id === id));
}

export function openDividendModal(d) {
    // ... ver código original
}

export function updateDivShares(autoFill) {
    // ... ver código original
}

export function updateDivTotal() {
    // ... ver código original
}

export function saveDividendModal(id) {
    // ... ver código original
}

// ── Calendario de dividendos (proyección) ──

export function buildDividendCalendarEvents() {
    const MONTHSAHEAD = 12;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setMonth(horizon.getMonth() + MONTHSAHEAD);

    const paymentsPerYear = { Mensual: 12, Trimestral: 4, Semestral: 2, Anual: 1 };
    const events = [];

    state.divInfo.forEach(d => {
        if (d._estimated || !d.ex_date || !d.div_rate) return;

        const freq = paymentsPerYear[d.freq] ? d.freq : 'Anual';
        const nPayments = paymentsPerYear[freq];
        const step = 12 / nPayments;

        const perPayment = (d.div_rate * d.shares) / nPayments;

        let dt = new Date(d.ex_date);
        let guard = 0;
        while (dt < today && guard < 24) {
            dt.setMonth(dt.getMonth() + step);
            guard++;
        }

        guard = 0;
        while (dt <= horizon && guard < 48) {
            events.push({
                date: new Date(dt),
                ticker: d.ticker,
                name: d.name,
                amountEUR: toEUR(perPayment, d.currency)
            });
            dt.setMonth(dt.getMonth() + step);
            guard++;
        }
    });

    return events.sort((a, b) => a.date - b.date);
}

export function getDivCalendarEvents() {
    const sel = state.divCalendarYearSel || 'proj';
    if (sel === 'proj') return buildDividendCalendarEvents();

    const year = Number(sel);
    return state.dividends
        .map(d => {
            let dt;
            if (d.date instanceof Date) dt = d.date;
            else if (typeof d.date === 'string') dt = new Date(d.date);
            else if (typeof d.date === 'number') dt = new Date(d.date);
            else return null;
            if (isNaN(dt.getTime()) || dt.getFullYear() !== year) return null;

            const pos = state.positions.find(p => p.ticker === d.ticker);
            const amountEUR = toEUR((d.amount || 0) * (d.shares || 0), d.currency || 'EUR');
            return {
                date: dt,
                ticker: d.ticker,
                name: pos?.name || d.ticker,
                amountEUR
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.date - b.date);
}

// ── Render del dashboard de dividendos ──

export function renderDivDashboard(totalAnnExpected) {
    // ... ver código original
    return '';
}

// ── Funciones de caja de dividendos (exportadas desde header) ──
export { openDividendCashModal, openRegisterDividendCashUse, deleteDividendCashUse, saveDividendCashUse } from './header.js';