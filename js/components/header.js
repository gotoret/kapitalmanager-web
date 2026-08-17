/**
 * Componente Header - Renderiza la cabecera y métricas
 */

import { state, save, ls, safeDateStr, compareDates, fmtEUR, fmtPct, pnlColor, esc } from '../config/state.js';
import { posToEUR, priceToEUR, posValEUR, posInvEUR, toEUR, getFX } from '../utils/helpers.js';
import { buildHeaderEvoSparkline } from '../utils/chart.utils.js';
import { openModal, closeModal } from '../utils/dom.utils.js';
import { buildDivInfo } from './dividends.js';

// Funciones de dividendos que se exportan para uso en header
export { buildDivInfo };

let autoRetryYieldTimer = null;
let autoRetryYieldAttempts = 0;
let yieldsInFlight = false;

// Total dividendos cobrados en EUR
export function totalDividendosCobradosEUR() {
    return (state.dividends || []).reduce((s, d) =>
        s + toEUR((d.amount || 0) * (d.shares || 0) - (d.fee || 0), d.currency), 0);
}

export function totalDividendCashUsedEUR() {
    return (state.dividendCashUsed || []).reduce((s, u) => s + (u.amount || 0), 0);
}

export function dividendCashAvailable() {
    return totalDividendosCobradosEUR() - totalDividendCashUsedEUR();
}

export function openDividendCashModal() {
    const cobrado = totalDividendosCobradosEUR();
    const usado = totalDividendCashUsedEUR();
    const disponible = cobrado - usado;
    const usos = [...(state.dividendCashUsed || [])].sort((a, b) => compareDates(b.date, a.date));

    openModal(`
        <h3>💵 Efectivo acumulado de dividendos</h3>
        <div style="font-size:12px;color:#64748b;margin-bottom:14px;line-height:1.5">
            Es el dinero que has ido cobrando en dividendos, para que sepas de un vistazo cuánto
            tienes disponible para reinvertir comprando más acciones. Cuando lo gastes, regístralo
            aquí abajo y se descontará del total.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px">
                <div style="font-size:10px;color:#16a34a;font-weight:700;text-transform:uppercase">Total cobrado</div>
                <div style="font-size:18px;font-weight:700;color:#16a34a">${fmtEUR(cobrado)}</div>
            </div>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px">
                <div style="font-size:10px;color:#dc2626;font-weight:700;text-transform:uppercase">Ya usado</div>
                <div style="font-size:18px;font-weight:700;color:#dc2626">${fmtEUR(usado)}</div>
            </div>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px;margin-bottom:16px;text-align:center">
            <div style="font-size:10px;color:#2563eb;font-weight:700;text-transform:uppercase">Disponible para reinvertir</div>
            <div style="font-size:24px;font-weight:800;color:#2563eb">${fmtEUR(disponible)}</div>
        </div>
        <button class="btn" style="width:100%;margin-bottom:14px" onclick="window.openRegisterDividendCashUse()">➖ Registrar uso (he comprado acciones)</button>
        <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:6px">Historial de usos registrados</div>
        <div style="max-height:220px;overflow-y:auto">
            ${usos.length ? usos.map(u => `
                <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f5f9">
                    <div style="flex:1">
                        <div style="font-size:12px;font-weight:600;color:#1e293b">${fmtEUR(u.amount)}</div>
                        <div style="font-size:10px;color:#94a3b8">${safeDateStr(u.date)}${u.note ? ' · ' + esc(u.note) : ''}</div>
                    </div>
                    <button onclick="window.openRegisterDividendCashUse(${u.id})" style="background:none;border:none;cursor:pointer;font-size:14px" title="Editar">✏️</button>
                    <button onclick="window.deleteDividendCashUse(${u.id})" style="background:none;border:none;cursor:pointer;font-size:14px" title="Eliminar">🗑️</button>
                </div>
            `).join('') : `<div style="text-align:center;color:#94a3b8;font-size:12px;padding:16px 0">Todavía no has registrado ningún uso</div>`}
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <button class="btn-gray" onclick="window.closeModal()">Cerrar</button>
        </div>
    `);
}

export function openRegisterDividendCashUse(id) {
    const u = id ? (state.dividendCashUsed || []).find(x => x.id === id) : null;
    openModal(`
        <h3>${u ? '✏️ Editar uso registrado' : '➖ Registrar uso del efectivo de dividendos'}</h3>
        <div class="field"><label>Importe usado (€)</label><input id="m-dcu-amount" type="number" step="0.01" class="inp" value="${u?.amount ?? ''}" placeholder="Ej. 250.00"></div>
        <div class="field"><label>Fecha</label><input id="m-dcu-date" type="date" class="inp" value="${(u?.date || new Date().toISOString()).slice(0, 10)}"></div>
        <div class="field"><label>Nota (opcional)</label><input id="m-dcu-note" class="inp" placeholder="Ej. Compra de acciones de IBE.MC" value="${esc(u?.note || '')}"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
            <button class="btn-gray" onclick="window.openDividendCashModal()">Cancelar</button>
            <button class="btn" onclick="window.saveDividendCashUse(${u ? u.id : 'null'})">💾 Guardar</button>
        </div>
    `);
}

export function saveDividendCashUse(id) {
    const amount = +document.getElementById('m-dcu-amount').value;
    const dateVal = document.getElementById('m-dcu-date').value || new Date().toISOString().slice(0, 10);
    const note = document.getElementById('m-dcu-note').value;
    if (!amount || amount <= 0) { alert('Introduce un importe válido'); return; }
    if (!state.dividendCashUsed) state.dividendCashUsed = [];
    const isoDate = new Date(dateVal).toISOString();
    if (id) {
        const u = state.dividendCashUsed.find(x => x.id === id);
        if (u) Object.assign(u, { amount, date: isoDate, note });
    } else {
        state.dividendCashUsed.unshift({ id: uid(), amount, date: isoDate, note });
    }
    save();
    openDividendCashModal();
    renderHeader();
}

export function deleteDividendCashUse(id) {
    if (!confirm('¿Eliminar este registro de uso? El importe volverá a sumarse al disponible.')) return;
    state.dividendCashUsed = (state.dividendCashUsed || []).filter(x => x.id !== id);
    save();
    openDividendCashModal();
    renderHeader();
}

export function renderHeader() {
    try {
        const totals = state.positions.reduce((acc, p) => {
            const inv = posToEUR(p.shares * p.avg_cost, p);
            const cur = state.priceCache[p.ticker] ? priceToEUR(p.shares * state.priceCache[p.ticker], p) : inv;
            acc.inv += inv;
            acc.cur += cur;
            return acc;
        }, { inv: 0, cur: 0 });
        const pnl = totals.cur - totals.inv;
        const pct = totals.inv ? pnl / totals.inv * 100 : 0;
        const pc = pnlColor(pnl);
        const activeAlerts = state.alerts.filter(a => a.active && !a.triggered).length;
        const triggered = state.alerts.filter(a => a.triggered);
        const divCash = dividendCashAvailable();

        document.getElementById('metrics-grid').innerHTML = `
            <div class="metric-card" style="border-left:3px solid #2563eb"><div class="metric-label">INVERTIDO</div><div class="metric-value" style="color:#2563eb">${fmtEUR(totals.inv)}</div></div>
            <div class="metric-card" style="border-left:3px solid #0284c7"><div class="metric-label">VALOR ACTUAL</div><div class="metric-value" style="color:#0284c7">${fmtEUR(totals.cur)}</div></div>
            <div class="metric-card" style="border-left:3px solid ${pc}"><div class="metric-label">GANANCIA/PÉRDIDA</div><div class="metric-value" style="color:${pc}">${pnl >= 0 ? '+' : ''}${fmtEUR(Math.abs(pnl))}</div></div>
            <div class="metric-card" style="border-left:3px solid ${pc}"><div class="metric-label">RENTABILIDAD</div><div class="metric-value" style="color:${pc}">${fmtPct(pct)}</div></div>
            <div class="metric-card" style="border-left:3px solid #16a34a;cursor:pointer" onclick="window.openDividendCashModal()" title="Dinero acumulado en dividendos cobrados, disponible para reinvertir"><div class="metric-label">💵 CAJA DIVIDENDOS ℹ️</div><div class="metric-value" style="color:#16a34a">${fmtEUR(divCash)}</div></div>
            <div class="metric-card" style="border-left:3px solid #7c3aed;padding:8px 10px">
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                    <div class="metric-label" style="margin-bottom:0">POSICIONES</div>
                    <div class="metric-value" style="color:#7c3aed;font-size:14px">${state.positions.length}</div>
                </div>
                <div style="height:1px;background:#e2e8f0;margin:5px 0"></div>
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                    <div class="metric-label" style="margin-bottom:0">ALERTAS</div>
                    <div class="metric-value" style="color:#b45309;font-size:14px">${activeAlerts}${triggered.length ? ` <span style="font-size:10px;color:#dc2626;font-weight:600">(${triggered.length} disp.)</span>` : ''}</div>
                </div>
            </div>
        `;

        const badgeEl = document.getElementById('pos-alert-badge');
        if (badgeEl) badgeEl.innerHTML = '';

        const evoEl = document.getElementById('header-evo-chart');
        if (evoEl) evoEl.innerHTML = buildHeaderEvoSparkline(totals.inv, totals.cur);

        const banner = document.getElementById('alert-banner');
        if (triggered.length) {
            banner.style.display = 'block';
            banner.textContent = '⚡ ' + triggered.map(a => `${a.ticker} ${a.direction === 'ABOVE' ? 'subió' : 'bajó'} a ${fmtEUR(a.price)}`).join('  ·  ');
        } else { banner.style.display = 'none'; }

        const lbl = document.getElementById('last-update-label');
        if (lbl) lbl.textContent = state.lastUpdate ? `Actualizado: ${state.lastUpdate.toLocaleTimeString('es-ES')} | Próx: ${state.countdown}s` : `Sin actualizar | Próx: ${state.countdown}s`;
    } catch (e) { console.error('renderHeader error:', e); }
}

export function togglePrivacyMode() {
    state.privacyMode = !state.privacyMode;
    ls.set('km_privacy_mode', state.privacyMode);
    updatePrivacyButton();
    renderHeader();
    // Re-renderizar la pestaña activa
    import('../components/tabs.js').then(m => m.renderActiveTab());
}

function updatePrivacyButton() {
    const btn = document.getElementById('privacy-toggle-btn');
    if (!btn) return;
    btn.textContent = state.privacyMode ? '🙈' : '👁️';
    btn.title = state.privacyMode ? 'Mostrar importes' : 'Ocultar importes';
}

export function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    ls.set('km_dark_mode', state.darkMode);
    applyDarkMode();
}

function applyDarkMode() {
    document.body.classList.remove('dark-mode');
    return;
}