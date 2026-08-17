/**
 * Componente Transacciones - Renderiza y gestiona transacciones
 */

import { state, save, uid, ls, safeDateStr, compareDates } from '../config/state.js';
import { fmtEUR, fmtNum, esc } from '../utils/helpers.js';
import { openModal, closeModal } from '../utils/dom.utils.js';
import { logoImg } from '../utils/chart.utils.js';
import { CURRENCIES } from '../config/constants.js';
import { renderHeader } from './header.js';
import { buildDivInfo } from './dividends.js';

export function renderTransactions() {
    if (!state._txSort) state._txSort = 'date';
    if (!state._txDir) state._txDir = 'desc';
    const txFilter = state._txFilter ?? ls.get('km_tx_filter', '');

    const COLS = [
        { key: 'id', label: 'ID' },
        { key: 'date', label: 'Fecha' },
        { key: 'ticker', label: 'Ticker' },
        { key: 'type', label: 'Tipo' },
        { key: 'shares', label: 'Acciones' },
        { key: 'price', label: 'Precio' },
        { key: 'commission', label: 'Comisión' },
        { key: 'currency', label: 'Divisa' },
        { key: 'total', label: 'Total' },
        { key: 'broker', label: 'Broker' },
        { key: 'notes', label: 'Notas' },
        { key: '', label: '' },
    ];

    const sel = state._selTx || null;
    const dir = state._txDir === 'asc' ? 1 : -1;
    const filteredTx = txFilter
        ? state.transactions.filter(t =>
            (t.ticker || '').toUpperCase().includes(txFilter.toUpperCase()) ||
            (t.notes || '').toLowerCase().includes(txFilter.toLowerCase()) ||
            (t.broker || '').toLowerCase().includes(txFilter.toLowerCase()))
        : state.transactions;
    const sorted = [...filteredTx].sort((a, b) => {
        const k = state._txSort;
        const va = k === 'total' ? (a.shares || 0) * (a.price || 0) : (a[k] || '');
        const vb = k === 'total' ? (b.shares || 0) * (b.price || 0) : (b[k] || '');
        if (va instanceof Date && vb instanceof Date) return dir * (va.getTime() - vb.getTime());
        if (typeof va === 'number') return dir * (va - vb);
        return dir * String(va).localeCompare(String(vb));
    });

    // ── Monitor de comisiones ──
    const commissionsCard = (() => {
        const currentYear = new Date().getFullYear();
        let totalAll = 0,
            totalYear = 0;
        state.transactions.forEach(t => {
            const c = toEUR(t.commission || 0, t.currency || 'EUR');
            totalAll += c;
            const d = t.date instanceof Date ? t.date : new Date(t.date);
            if (d.getFullYear() === currentYear) totalYear += c;
        });
        const totalInv = state.positions.reduce((s, p) => s + posInvEUR(p), 0);
        const impactPct = totalInv > 0 ? (totalAll / totalInv * 100) : 0;
        if (totalAll < 0.01) return '';
        return `<div class="card" style="margin-bottom:12px">
            <h4 style="font-size:12px;font-weight:700;color:#1d4ed8;margin-bottom:8px">💸 Comisiones pagadas</h4>
            <div style="display:flex;gap:20px;flex-wrap:wrap">
                <div><div style="font-size:10px;color:#64748b;font-weight:600">EN ${currentYear}</div><div style="font-size:17px;font-weight:800;color:#b45309">${fmtEUR(totalYear)}</div></div>
                <div><div style="font-size:10px;color:#64748b;font-weight:600">TOTAL HISTÓRICO</div><div style="font-size:17px;font-weight:800;color:#b45309">${fmtEUR(totalAll)}</div></div>
                <div><div style="font-size:10px;color:#64748b;font-weight:600">IMPACTO S/ INVERTIDO</div><div style="font-size:17px;font-weight:800;color:#b45309">${impactPct.toFixed(2)}%</div></div>
            </div>
        </div>`;
    })();

    const thStyle = (k) => {
        const active = state._txSort === k;
        return `style="cursor:${k ? 'pointer' : 'default'};user-select:none;white-space:nowrap;background:${active ? '#dbeafe' : '#f8fafc'};color:${active ? '#1d4ed8' : '#475569'}"`;
    };
    const arrow = (k) => state._txSort === k ? (state._txDir === 'asc' ? ' ↑' : ' ↓') : '';
    const sortClick = (k) => k ? `onclick="window.txSort('${k}')"` : '';

    const headers = COLS.map(c =>
        `<th ${thStyle(c.key)} ${sortClick(c.key)}>${c.label}${arrow(c.key)}</th>`
    ).join('');

    const rows = sorted.map(t => {
        const isSel = sel === t.id;
        return `<tr style="cursor:pointer;background:${isSel ? '#eff6ff' : ''}" onclick="state._selTx=${t.id === sel ? 'null' : t.id};window.renderActiveTab()">
            <td style="color:#94a3b8;font-size:10px">${t.id}</td>
            <td style="color:#64748b;white-space:nowrap">${safeDateStr(t.date)}</td>
            <td><div style="display:flex;align-items:center;gap:6px">${logoImg(t.ticker, '', 22)}<span style="color:#1d4ed8;font-weight:700">${esc(t.ticker)}</span></div></td>
            <td><span class="badge" style="background:${t.type === 'BUY' ? '#2563eb22' : t.type === 'SELL' ? '#dc262622' : '#b4530922'};color:${t.type === 'BUY' ? '#2563eb' : t.type === 'SELL' ? '#dc2626' : '#b45309'}">${esc(t.type)}</span></td>
            <td style="text-align:right">${t.shares}</td>
            <td style="text-align:right">${fmtNum(t.price || 0)}</td>
            <td style="text-align:right">${fmtNum(t.commission || 0)}</td>
            <td>${esc(t.currency || '')}</td>
            <td style="font-weight:600;text-align:right">${fmtNum((t.shares || 0) * (t.price || 0) + (t.commission || 0))}</td>
            <td style="color:#64748b;font-size:11px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.broker || '—')}</td>
            <td style="color:#64748b;font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.notes || '')}</td>
            <td style="white-space:nowrap">
                <button class="btn" style="font-size:10px;padding:2px 7px;margin-right:3px" onclick="event.stopPropagation();window.openEditTransaction(${t.id})">✏️</button>
                <button class="btn-danger-sm" onclick="event.stopPropagation();window.deleteTransaction(${t.id})">✕</button>
            </td>
        </tr>`;
    }).join('');

    return `<div style="padding:14px">
        ${commissionsCard}
        <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button class="btn" style="font-size:11px;padding:5px 12px" onclick="window.openAddTxManual()">＋ Nueva transacción</button>
            ${sel != null ? `<button class="btn" style="font-size:11px;padding:5px 12px;" onclick="window.openEditTransaction(${sel})">✏️ Editar seleccionada</button>` : ''}
            <input id="tx-filter" class="inp-sm" placeholder="🔍 Filtrar por ticker, broker o notas..." value="${esc(txFilter)}" style="width:220px" oninput="state._txFilter=this.value;ls.set('km_tx_filter',this.value);window.renderActiveTab()">
            <span style="font-size:11px;color:#94a3b8">${txFilter ? `${sorted.length} de ${state.transactions.length} transacciones` : `${state.transactions.length} transacciones`} · Click cabecera para ordenar</span>
        </div>
        <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;font-size:11px;color:#92400e;margin-bottom:10px">
            ℹ️ <strong>Las posiciones se calculan automáticamente desde las transacciones (método FIFO).</strong> Al añadir, editar o borrar una transacción, la cartera se actualiza sola.
        </div>
        <div style="overflow-x:auto">
            <table style="min-width:1000px">
                <thead><tr>${headers}</tr></thead>
                <tbody>${rows || `<tr><td colspan="12" style="text-align:center;color:#94a3b8;padding:28px">${txFilter ? 'Ninguna transacción coincide con el filtro' : 'Sin transacciones'}</td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}

export function txSort(col) {
    if (state._txSort === col) {
        state._txDir = state._txDir === 'asc' ? 'desc' : 'asc';
    } else {
        state._txSort = col;
        state._txDir = col === 'date' ? 'desc' : 'asc';
    }
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function openAddTxManual() {
    // ... ver código original
}

export function openEditTransaction(id) {
    // ... ver código original
}

export function saveTxModal(id) {
    // ... ver código original
}

export function deleteTransaction(id) {
    // ... ver código original
}

// ── Funciones auxiliares ──

function _rebuildPositionFromTx(ticker, currency) {
    // ... ver código original
}

function _calcSharesFromTx(ticker) {
    // ... ver código original
}