/**
 * Componente Tabs - Renderiza las pestañas y gestiona el cambio
 */

import { state } from '../config/state.js';
import { TABS } from '../config/constants.js';

// Importar dinámicamente los componentes para carga bajo demanda
async function loadComponent(tabIndex) {
    switch (tabIndex) {
        case 0: return import('./portfolio.js');
        case 1: return import('./alerts.js');
        case 2: return import('./dividends.js');
        case 3: return import('./transactions.js');
        case 4: return import('./charts.js');
        case 5: return import('./goals.js');
        case 6: return import('./valuation.js');
        case 7: return import('./renta.js');
        case 8: return import('./radar.js');
        case 9: return import('./analysis360.js');
        default: return import('./portfolio.js');
    }
}

export function renderTabs() {
    document.getElementById('tabs-bar').innerHTML = TABS.map((t, i) =>
        `<button class="tab-btn ${state.activeTab === i ? 'active' : ''}" onclick="window.switchTab(${i})">${esc(t)}</button>`
    ).join('');
}

export function switchTab(i) {
    state.activeTab = i;
    state.selectedTicker = null;
    renderTabs();
    renderActiveTab();
}

export async function renderActiveTab() {
    const el = document.getElementById('content');
    const active = document.activeElement;
    const activeId = active && active.id && el.contains(active) ? active.id : null;
    const selStart = activeId && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    const selEnd = activeId && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

    try {
        const module = await loadComponent(state.activeTab);
        // Los componentes exportan su función de renderizado como `render`
        // o con el nombre específico (renderPortfolio, renderAlerts, etc.)
        const renderFn = module.default || module.render || module[Object.keys(module).find(k => k.startsWith('render'))];
        if (renderFn) {
            el.innerHTML = renderFn();
        } else {
            el.innerHTML = `<div style="padding:20px;color:#dc2626;">Error: Componente no encontrado</div>`;
        }
        
        if (activeId) {
            const restored = document.getElementById(activeId);
            if (restored) {
                restored.focus();
                if (selStart != null && typeof restored.setSelectionRange === 'function') {
                    try { restored.setSelectionRange(selStart, selEnd); } catch (e) {}
                }
            }
        }
    } catch (e) {
        console.error('Error en renderActiveTab (tab ' + state.activeTab + '):', e);
        el.innerHTML = `<div style="padding:20px;color:#dc2626;font-size:13px">
            <b>⚠️ Error al cargar la vista</b><br><br>
            <code style="font-size:11px;background:#fee2e2;padding:8px;border-radius:6px;display:block;white-space:pre-wrap">${e?.message || e}</code>
            <br><button class="btn" onclick="location.reload()">🔄 Recargar app</button>
        </div>`;
    }
}

// Exportar también la función para que app.js pueda usarla
export function renderActiveTabContent(tabIndex) {
    // Esta función es llamada desde app.js para obtener el HTML de una pestaña
    // pero usamos renderActiveTab que ya maneja la carga dinámica
    return renderActiveTab();
}