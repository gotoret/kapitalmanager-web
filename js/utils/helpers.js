/**
 * Funciones de ayuda generales
 */

import { state } from '../config/state.js';
import { FX_FALLBACK } from '../config/constants.js';

// LocalStorage helper
export const ls = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

// Obtener tipo de cambio
export const getFX = (cur) => state.fxCache[cur] || FX_FALLBACK[cur] || 1;

// Detectar si es ticker en GBP (peniques)
export const isGBpTicker = (ticker) => String(ticker || '').toUpperCase().endsWith('.L');

// Convertir a EUR
export const toEUR = (v, cur) => (v || 0) * getFX(cur || 'EUR');

export const toEURhist = (v, pos) => {
    if (!pos || pos.currency === 'EUR') return v || 0;
    if (pos.fx_rate && pos.fx_rate !== 1) return (v || 0) / pos.fx_rate;
    return (v || 0) * getFX(pos.currency);
};

export const posToEUR = (v, pos) => {
    if (!v || isNaN(v)) return 0;
    return (v || 0) * getFX(pos?.currency || 'EUR');
};

export const priceToEUR = (v, pos) => {
    if (!v || isNaN(v)) return 0;
    return (v || 0) * getFX(pos?.currency || 'EUR');
};

export const posValEUR = (p) => {
    const cp = state.priceCache[p.ticker];
    return cp ? priceToEUR(p.shares * cp, p) : posToEUR(p.shares * p.avg_cost, p);
};

export const posInvEUR = (p) => posToEUR(p.shares * p.avg_cost, p);

// Formateadores
export const fmtEUR = v => {
    if (state.privacyMode) return '€ •••••';
    return '€' + ((v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
};

export const fmtPct = v => (v >= 0 ? '+' : '') + ((v || 0).toFixed(2)) + '%';

export const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const pnlColor = v => v >= 0 ? '#16a34a' : '#dc2626';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Parsear número desde string con formato español
export function parseNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    const s = String(v).trim().replace(/[^\d.,-]/g, '');
    if (!s) return 0;

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');

    if (hasDot && hasComma) {
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        if (lastComma > lastDot) {
            return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
        } else {
            return parseFloat(s.replace(/,/g, '')) || 0;
        }
    }
    if (hasComma && !hasDot) {
        const parts = s.split(',');
        if (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1) {
            return parseFloat(s.replace(/,/g, '')) || 0;
        }
        return parseFloat(s.replace(',', '.')) || 0;
    }
    if (hasDot && !hasComma) {
        const parts = s.split('.');
        if (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1) {
            return parseFloat(s.replace(/\./g, '')) || 0;
        }
        if (parts.length > 2) {
            return parseFloat(s.replace(/\./g, '')) || 0;
        }
        return parseFloat(s) || 0;
    }
    return parseFloat(s) || 0;
}

// Normalizar texto para comparación
export function normalizeText(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

// Normalizar encabezado para mapeo
export function normalizeHeader(s) {
    return normalizeText(s)
        .replace(/\s+/g, '_')
        .replace(/[^\w]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

// Convertir fecha Excel a ISO
export function excelDateToISO(v) {
    if (!v && v !== 0) return '';
    if (typeof v === 'string') {
        const s = v.trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
            const [d, m, y] = s.split('/');
            return `${y}-${m}-${d}`;
        }
        if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
            const [d, m, y] = s.split('-');
            return `${y}-${m}-${d}`;
        }
        const dt = new Date(s);
        if (!isNaN(dt)) return dt.toISOString().slice(0, 10);
        return '';
    }
    if (typeof v === 'number') {
        const utcDays = Math.floor(v - 25569);
        const utcValue = utcDays * 86400;
        const dateInfo = new Date(utcValue * 1000);
        return isNaN(dateInfo) ? '' : dateInfo.toISOString().slice(0, 10);
    }
    return '';
}

// Detectar divisa desde ticker
export function detectCurrencyFromTicker(ticker) {
    const t = String(ticker || '').toUpperCase();
    if (t.endsWith('.MC')) return 'EUR';
    if (t.endsWith('.L')) return 'GBP';
    return 'USD';
}

// Adivinar sector desde nombre o ticker
export function guessSectorFromNameOrTicker(ticker, name) {
    const t = String(ticker || '').toUpperCase();
    const n = String(name || '').toUpperCase();

    if (['IBE.MC', 'ENG.MC', 'RED.MC', 'ELE.MC', 'NWN'].includes(t) || n.includes('IBERDROLA') || n.includes('ENAGAS') || n.includes('UTILITY')) return 'Utilities';
    if (['REP.MC', 'XOM', 'CVX', 'KNOP'].includes(t) || n.includes('REPSOL') || n.includes('ENERGY') || n.includes('PETROLEUM')) return 'Energía';
    if (['TEF.MC', 'VZ', 'T'].includes(t) || n.includes('TELEFON') || n.includes('VERIZON') || n.includes('COMMUNICATION')) return 'Comunicaciones';
    if (['MAP.MC', 'BKT.MC', 'SAN.MC', 'BBVA.MC', 'CABK.MC', 'BEN', 'TROW'].includes(t) || n.includes('BANK') || n.includes('FINANCIAL') || n.includes('INSURANCE')) return 'Servicios Financieros';
    if (['PFE', 'CVS'].includes(t) || n.includes('PFIZER') || n.includes('HEALTH') || n.includes('PHARMA')) return 'Salud';
    if (['INTC', 'MSFT', 'AAPL', 'NVDA'].includes(t) || n.includes('INTEL') || n.includes('MICROSOFT') || n.includes('APPLE')) return 'Tecnología';
    if (['ACX.MC'].includes(t) || n.includes('STEEL') || n.includes('MINING')) return 'Materiales Básicos';
    if (['ACS.MC', 'LOG.MC', 'MCM.MC', 'MMM'].includes(t) || n.includes('INDUSTR') || n.includes('LOGISTA')) return 'Industria';
    if (['WPC'].includes(t) || n.includes('REALTY') || n.includes('PROPERTY') || n.includes('REIT')) return 'Inmobiliario';
    if (['BTI', 'MO', 'UVV', 'KO', 'KHC', 'EBRO.MC'].includes(t) || n.includes('TOBACCO') || n.includes('ALTRIA') || n.includes('COCA') || n.includes('KRAFT')) return 'Consumo Defensivo';

    return '';
}

// Normalizar precio cotizado
export function normalizeQuotedPrice(price, ticker, currency) {
    const p = parseNum(price);
    if (!p) return 0;
    if (String(ticker || '').toUpperCase().endsWith('.L') && currency === 'GBP') {
        return +(p / 100).toFixed(4);
    }
    return p;
}

// Número formateado
export function fmtNum(v) {
    if (v == null) return '—';
    return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formatear market cap
export function fmtMcap(v) {
    if (!v) return '—';
    if (v >= 1e12) return (v / 1e12).toFixed(1) + 'B€';
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'MM€';
    if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M€';
    return v.toFixed(0) + '€';
}