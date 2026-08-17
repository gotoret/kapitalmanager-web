/**
 * Control principal de la aplicación
 * Gestiona el ciclo de vida, inicialización y estado global
 */

import { state, save, ls } from './config/state.js';
import { TABS } from './config/constants.js';
import { buildDivInfo, renderHeader } from './components/header.js';
import { renderTabs, switchTab } from './components/tabs.js';
import { renderActiveTab as renderTab } from './components/tabs.js';
import { checkPlanAccess } from './services/auth.service.js';
import { loadCloudData, saveCloud } from './services/supabase.service.js';
import { refreshPrices, refreshDividendYields, startCountdown } from './services/yahoo.service.js';
import { setupAutocomplete } from './utils/dom.utils.js';

// Re-exportar para otros módulos
export { state, save, ls };

/**
 * Renderiza la pestaña activa
 */
export function renderActiveTab() {
    const el = document.getElementById('content');
    const active = document.activeElement;
    const activeId = active && active.id && el.contains(active) ? active.id : null;
    const selStart = activeId && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    const selEnd = activeId && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

    try {
        // Importar dinámicamente los componentes según la pestaña activa
        // Esto permite cargar solo lo necesario
        import('./components/tabs.js').then(module => {
            const html = module.renderActiveTabContent(state.activeTab);
            el.innerHTML = html;
            
            if (activeId) {
                const restored = document.getElementById(activeId);
                if (restored) {
                    restored.focus();
                    if (selStart != null && typeof restored.setSelectionRange === 'function') {
                        try { restored.setSelectionRange(selStart, selEnd); } catch(e) {}
                    }
                }
            }
        }).catch(e => {
            console.error('Error al cargar el componente:', e);
            el.innerHTML = `<div style="padding:20px;color:#dc2626;font-size:13px">
                <b>⚠️ Error al cargar la vista</b><br><br>
                <code style="font-size:11px;background:#fee2e2;padding:8px;border-radius:6px;display:block;white-space:pre-wrap">${e?.message || e}</code>
                <br><button class="btn" onclick="location.reload()">🔄 Recargar app</button>
            </div>`;
        });
    } catch(e) {
        console.error('Error en renderActiveTab:', e);
        el.innerHTML = `<div style="padding:20px;color:#dc2626;font-size:13px">
            <b>⚠️ Error al cargar la vista</b><br><br>
            <code style="font-size:11px;background:#fee2e2;padding:8px;border-radius:6px;display:block;white-space:pre-wrap">${e?.message || e}</code>
            <br><button class="btn" onclick="location.reload()">🔄 Recargar app</button>
        </div>`;
    }
}

/**
 * Acepta el disclaimer legal
 */
export function acceptDisclaimer() {
    ls.set('km_disclaimer', true);
    document.getElementById('disclaimer-overlay').style.display = 'none';
    maybeShowOnboarding();
}

/**
 * Cierra el onboarding
 */
export function closeOnboarding() {
    ls.set('km_onboarding_done', true);
    const el = document.getElementById('onboarding-overlay');
    if (el) el.style.display = 'none';
}

/**
 * Muestra el onboarding si es la primera vez y la cartera está vacía
 */
function maybeShowOnboarding() {
    if (ls.get('km_onboarding_done', false)) return;
    if ((state.positions || []).length > 0) { 
        ls.set('km_onboarding_done', true); 
        return; 
    }
    const el = document.getElementById('onboarding-overlay');
    if (el) el.style.display = 'flex';
}

/**
 * Actualiza el estado de login en la UI
 */
export function updateLoginStatus() {
    const loginOverlay = document.getElementById('login-overlay');
    const emailLabel = document.getElementById('user-email-label');

    if (state.authUser) {
        loginOverlay.style.display = 'none';
        if (emailLabel) emailLabel.textContent = state.authUser;
        startAppIfNeeded().catch(e => {
            console.error('startAppIfNeeded: excepción no controlada →', e);
            alert('Error al cargar la aplicación: ' + (e?.message || e));
        });
    } else {
        loginOverlay.style.display = 'flex';
        document.getElementById('disclaimer-overlay').style.display = 'none';
        if (emailLabel) emailLabel.textContent = '';
        const passInp = document.getElementById('login-pass');
        if (passInp) passInp.value = '';
    }
}

/**
 * Inicia la aplicación si el usuario está autenticado
 */
async function startAppIfNeeded() {
    if (state._appStarted) {
        buildDivInfo();
        renderTabs();
        renderHeader();
        renderActiveTab();
        return;
    }

    const accessOk = await checkPlanAccess();
    if (!accessOk) return;

    state._appStarted = true;

    await loadCloudData();

    if (ls.get('km_disclaimer', false)) {
        document.getElementById('disclaimer-overlay').style.display = 'none';
        maybeShowOnboarding();
    } else {
        document.getElementById('disclaimer-overlay').style.display = 'flex';
    }

    buildDivInfo();
    renderTabs();
    renderHeader();
    renderActiveTab();
    updatePrivacyButton();
    applyDarkMode();

    document.getElementById('tabs-bar').addEventListener('click', () => {
        setTimeout(() => {
            if (state.activeTab === 6) {
                setupAutocomplete('val-ticker', r => {
                    state._valTicker = r.ticker;
                    const inp = document.getElementById('val-ticker');
                    if (inp) inp.value = r.ticker;
                });
            }
        }, 150);
    });

    refreshPrices();
    refreshDividendYields();
    startCountdown();
}

/**
 * Actualiza el botón de privacidad
 */
export function updatePrivacyButton() {
    const btn = document.getElementById('privacy-toggle-btn');
    if (!btn) return;
    btn.textContent = state.privacyMode ? '🙈' : '👁️';
    btn.title = state.privacyMode ? 'Mostrar importes' : 'Ocultar importes';
}

/**
 * Aplica el modo oscuro
 */
export function applyDarkMode() {
    // Modo oscuro deshabilitado temporalmente
    document.body.classList.remove('dark-mode');
    return;
}

/**
 * Inicializa la aplicación
 */
export async function init() {
    document.getElementById('disclaimer-overlay').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
    
    // Cargar el usuario desde Supabase
    const { loadMe } = await import('./services/auth.service.js');
    await loadMe();
}

// Exportar funciones necesarias
export { startAppIfNeeded, maybeShowOnboarding };