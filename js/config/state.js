/**
 * Estado global y funciones de persistencia
 */

import { ls } from '../utils/helpers.js';

let _uid = Date.now();
export const uid = () => ++_uid;

// Helper seguro para obtener año de una fecha
export function safeGetYear(dateVal) {
    if (!dateVal) return null;
    let d;
    if (dateVal instanceof Date) {
        d = dateVal;
    } else if (typeof dateVal === 'string') {
        d = new Date(dateVal);
    } else if (typeof dateVal === 'number') {
        d = new Date(dateVal);
    } else if (dateVal && typeof dateVal === 'object' && dateVal._d) {
        d = new Date(dateVal._d);
    } else {
        return null;
    }
    if (isNaN(d.getTime())) return null;
    return d.getFullYear();
}

// Compara dos fechas sea cual sea su formato
export function compareDates(a, b) {
    const da = a instanceof Date ? a.getTime() : new Date(a || 0).getTime();
    const db = b instanceof Date ? b.getTime() : new Date(b || 0).getTime();
    return (isNaN(da) ? 0 : da) - (isNaN(db) ? 0 : db);
}

// Convierte a string de fecha segura
export function safeDateStr(dateVal) {
    if (!dateVal) return new Date().toISOString().slice(0, 10);
    let d;
    if (dateVal instanceof Date) {
        d = dateVal;
    } else if (typeof dateVal === 'string') {
        d = new Date(dateVal);
    } else if (typeof dateVal === 'number') {
        d = new Date(dateVal);
    } else if (dateVal && typeof dateVal === 'object' && dateVal._d) {
        d = new Date(dateVal._d);
    } else {
        return String(dateVal).slice(0, 10);
    }
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
}

// Normaliza todas las fechas de dividendos y transacciones a objetos Date reales
export function normalizeAllDates() {
    const toDate = (v) => {
        if (v instanceof Date) return isNaN(v.getTime()) ? new Date() : v;
        if (typeof v === 'string' || typeof v === 'number') {
            const d = new Date(v);
            return isNaN(d.getTime()) ? new Date() : d;
        }
        return new Date();
    };
    state.dividends = (state.dividends || []).map(d => ({ ...d, date: toDate(d.date) }));
    state.transactions = (state.transactions || []).map(t => ({ ...t, date: toDate(t.date) }));
}

// Estado global de la aplicación
export let state = {
    positions: ls.get('km_positions', []),
    alerts: ls.get('km_alerts', []),
    dividends: ls.get('km_dividends', []),
    dividendCashUsed: ls.get('km_dividend_cash_used', []),
    goalConfig: ls.get('km_goal_config', { goal: 100000, pg: 7, dg: 3, contrib: 5000, yrs: 10, dy: 4, reinvest: true }),
    autoRegisterEnabled: ls.get('km_auto_register_dividends', true),
    transactions: ls.get('km_transactions', []),
    priceCache: ls.get('km_priceCache', {}),
    priceChangeCache: ls.get('km_priceChangeCache', {}),
    fxCache: ls.get('km_fxCache', {}),
    yieldCache: ls.get('km_yieldCache', {}),
    divInfo: [],
    activeTab: 0,
    sortCol: null,
    sortDir: 1,
    selectedTicker: null,
    countdown: 60,
    lastUpdate: null,
    livePrices: false,
    authUser: null,
    authUserId: null,
    _appStarted: false,
    fmpKey: ls.get('km_fmp_key', ''),
    privacyMode: ls.get('km_privacy_mode', false),
    darkMode: ls.get('km_dark_mode', false),
    analysis360: null,
    finnhubKey: ls.get('km_finnhub_key', ''),
    twelveDataKey: ls.get('km_twelvedata_key', ''),
    alphaVantageKey: ls.get('km_alphavantage_key', ''),
    marketstackKey: ls.get('km_marketstack_key', ''),
    fcsapiKey: ls.get('km_fcsapi_key', ''),
    importPreview: [],
    importMap: null,
    importHeaders: [],
    importFileName: '',
    _divYearSel: 'Anual',
    _divSort: { col: 'fecha', dir: 'desc' },
    _divEsperadosSort: { col: 'ticker', dir: 'asc' },
    _divEsperadosCollapsed: false,
    _divHistorialCollapsed: false,
    _divChartTab: 0,
    _portfolioCharts: {
        selectedTicker: 'Todas',
        period: 'MAX',
        divPeriod: 'Anual',
        companyData: {},
        loading: false,
        indexCompare: {},
        indexData: {}
    },
    _chartCache: {},
    _chartCacheOrder: [],
    _chartRange: {},
    _multiChartCache: {},
    _multiChartCacheOrder: [],
    _healthLoading: false,
    _healthProgress: null,
    _fundsDebug: null,
    _valTicker: '',
    _valResult: null,
    _valLoading: false,
    _valError: '',
    _valTab: 0,
    _valFromCache: false,
    _valCacheAgeHours: 0,
    _valProgressSec: 0,
    _valMissingSources: [],
    _newsCache: null,
    _newsLoading: false,
    _newsProgress: null,
    _txFilter: ls.get('km_tx_filter', ''),
    _txSort: 'date',
    _txDir: 'desc',
    _selTx: null,
    _priceChartPeriod: '1A',
    _projData: null,
    _newAutoDividends: [],
    radar: {
        region: ls.get('km_radar_region', 'Todos'),
        sector: ls.get('km_radar_sector', 'Todos'),
        currency: ls.get('km_radar_currency', 'Todas'),
        hideOwned: ls.get('km_radar_hideOwned', true),
        exchange: '',
        per_max: '', evEbitda_max: '', pb_max: '', ps_max: '', yield_min: '', payout_max: '',
        revGrowth_min: '', epsGrowth_min: '', divGrowth_min: '',
        margin_min: '', roe_min: '', roic_min: '', fcf_min: '',
        debtEbitda_max: '', coverage_min: '', currentRatio_min: '',
        mcap_min: '', mcap_max: '',
        divYield_min: '', divYears_min: '', divStable: false,
        _results: [], _loading: false, _searched: false, _error: '', _progress: null
    }
};

// Normalizar fechas al cargar
normalizeAllDates();

// Aplicar modo oscuro al inicio
if (document.body.classList) {
    document.body.classList.toggle('dark-mode', !!state.darkMode);
}

// Función de guardado global
export function save() {
    const dividendsToSave = (state.dividends || []).map(d => ({
        ...d,
        date: d.date instanceof Date ? d.date.toISOString() : (d.date || new Date().toISOString())
    }));
    ls.set('km_positions', state.positions);
    ls.set('km_alerts', state.alerts);
    ls.set('km_dividends', dividendsToSave);
    ls.set('km_dividend_cash_used', state.dividendCashUsed);
    ls.set('km_goal_config', state.goalConfig);
    ls.set('km_transactions', state.transactions);
    if (state.authUserId) {
        import('../services/supabase.service.js').then(module => {
            module.saveCloud();
        }).catch(() => {});
    }
}

export function saveCaches() {
    ls.set('km_priceCache', state.priceCache);
    ls.set('km_priceChangeCache', state.priceChangeCache);
    ls.set('km_fxCache', state.fxCache);
    ls.set('km_yieldCache', state.yieldCache);
}