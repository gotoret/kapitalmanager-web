/**
 * Componente Alertas - Renderiza y gestiona alertas de precio
 */

import { state, save, uid } from '../config/state.js';
import { esc, fmtEUR } from '../utils/helpers.js';
import { openModal, closeModal } from '../utils/dom.utils.js';
import { maybeRequestNotificationPermission } from '../services/yahoo.service.js';
import { renderHeader } from './header.js';

export function renderAlerts() {
    const rows = state.alerts.map(a => {
        const cond = a.direction === 'ABOVE' ? '↑ Sube a' : '↓ Baja a';
        const st = a.triggered ? '✅ Disparada' : a.active ? '🟢 Activa' : '⬛ Inactiva';
        const sc = a.triggered ? '#16a34a' : a.active ? '#2563eb' : '#94a3b8';
        return `<tr>
            <td style="color:#94a3b8">${a.id}</td>
            <td style="color:#1d4ed8;font-weight:700">${esc(a.ticker)}</td>
            <td>${cond}</td>
            <td style="font-weight:600">${fmtEUR(a.price)}</td>
            <td style="color:${sc};font-weight:600">${st}</td>
            <td style="color:#64748b">${(a.created_at || '').slice(0, 16)}</td>
            <td><button class="btn-sm" onclick="window.openAddAlert(null,null,null,${a.id})" title="Editar" style="margin-right:4px">✏️</button><button class="btn-danger-sm" onclick="window.deleteAlert(${a.id})">✕</button></td>
        </tr>`;
    }).join('');

    return `<div style="padding:14px">
        <div style="margin-bottom:12px"><button class="btn" onclick="window.openAddAlert()">＋ Nueva alerta</button></div>
        <table><thead><tr>${['ID', 'Ticker', 'Condición', 'Precio objetivo', 'Estado', 'Creada', ''].map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows || `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:28px">Sin alertas configuradas</td></tr>`}</tbody>
    </div>`;
}

export function deleteAlert(id) {
    state.alerts = state.alerts.filter(a => a.id !== id);
    save();
    import('./tabs.js').then(m => m.renderActiveTab());
    renderHeader();
}

export function openAddAlert(defaultTicker, defaultName, defaultPrice, editId) {
    const editing = editId ? state.alerts.find(a => a.id === editId) : null;
    const tk = editing ? editing.ticker : defaultTicker;
    const isInPortfolio = state.positions.some(p => p.ticker === tk);
    const portfolioOptions = state.positions.map(p => `<option ${p.ticker === (tk || state.selectedTicker) ? 'selected' : ''}>${esc(p.ticker)} — ${esc(p.name)}</option>`).join('');
    const extraOption = tk && !isInPortfolio
        ? `<option value="${esc(tk)}" selected>${esc(tk)}${defaultName ? ' — ' + esc(defaultName) : ''}</option>`
        : '';
    openModal(`
        <h3>🔔 ${editing ? 'Editar alerta' : 'Nueva alerta'} de precio</h3>
        <div class="field"><label>Ticker</label>
            <select id="m-a-ticker" class="inp" ${editing ? 'disabled' : ''}>
                ${extraOption}${portfolioOptions}
            </select>
        </div>
        <div class="field"><label>Condición</label>
            <select id="m-a-dir" class="inp">
                <option value="ABOVE" ${editing?.direction === 'ABOVE' ? 'selected' : ''}>↑ Sube por encima de</option>
                <option value="BELOW" ${editing?.direction === 'BELOW' ? 'selected' : ''}>↓ Baja por debajo de</option>
            </select>
        </div>
        <div class="field"><label>Precio objetivo (€)</label>
            <input id="m-a-price" type="number" step="0.01" class="inp" value="${editing ? editing.price : (defaultPrice ? (+defaultPrice * 0.9).toFixed(2) : 0)}">
        </div>
        <div style="font-size:11px;color:#64748b;margin-bottom:12px">
            ${defaultPrice && !editing ? `Precio actual: <b>${(+defaultPrice).toFixed(2)}</b> — sugerido -10%` : ''}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
            <button class="btn-gray" onclick="window.closeModal()">Cancelar</button>
            <button class="btn" onclick="window.saveAlertModal(${editing ? editing.id : 'null'})">💾 Guardar</button>
        </div>`);
}

export function saveAlertModal(editId) {
    const ticker = (document.getElementById('m-a-ticker').value || '').split(' ')[0];
    const direction = document.getElementById('m-a-dir').value;
    const price = +document.getElementById('m-a-price').value;
    if (!ticker || price <= 0) { alert('Completa todos los campos'); return; }
    if (editId) {
        const a = state.alerts.find(x => x.id === editId);
        if (a) {
            const changed = a.direction !== direction || a.price !== price;
            Object.assign(a, { direction, price });
            if (changed) { a.triggered = false;
                a.active = true; }
        }
    } else {
        state.alerts.push({ id: uid(), ticker, direction, price, active: true, triggered: false, created_at: new Date().toISOString() });
    }
    save();
    closeModal();
    import('./tabs.js').then(m => m.renderActiveTab());
    renderHeader();
    maybeRequestNotificationPermission();
}