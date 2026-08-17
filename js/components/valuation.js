/**
 * Componente Valoración - Análisis de valoración con IA
 */

import { state, save, ls, uid } from '../config/state.js';
import { 
    fmtEUR, esc, sleep, posValEUR, posInvEUR, toEUR, 
    detectCurrencyFromTicker, guessSectorFromNameOrTicker,
    fmtNum, fmtMcap
} from '../utils/helpers.js';
import { openModal, closeModal, setupAutocomplete } from '../utils/dom.utils.js';
import { 
    logoImg, chartScrollWrap, multiChartMouseMove, multiChartMouseLeave,
    registerChartCacheKey, lineChart, barLineChart, priceLineChart,
    drawdownChart, divBarChart, yieldLineChart, footballField, weissValuationCard
} from '../utils/chart.utils.js';
import { renderHeader } from './header.js';

// ── Estado de valoración ──

if (!state._valTicker) state._valTicker = '';
if (!state._valResult) state._valResult = null;
if (!state._valLoading) state._valLoading = false;
if (!state._valError) state._valError = '';
if (!state._valTab) state._valTab = 0;
if (!state._valFromCache) state._valFromCache = false;
if (!state._valCacheAgeHours) state._valCacheAgeHours = 0;
if (!state._valProgressSec) state._valProgressSec = 0;
if (!state._valMissingSources) state._valMissingSources = [];
if (!state._chartCache) state._chartCache = {};
if (!state._chartCacheOrder) state._chartCacheOrder = [];
if (!state._fundsDebug) state._fundsDebug = null;

// ── Constantes ──

const methodLabels = {
    ddm: 'DDM — Dividendos',
    epv: 'EPV — Beneficios actuales',
    pe: 'P/E Múltiplos',
    ev_ebitda: 'EV/EBITDA',
    pb: 'Price/Book',
    ev_revenue: 'EV/Revenue',
    dcf_quality: 'Calidad DCF',
    weiss: 'Geraldine Weiss'
};

const methodExplanations = {
    ddm: 'Descuenta a valor presente los dividendos futuros esperados. Premia a empresas con dividendo estable y creciente en el tiempo.',
    epv: 'Earnings Power Value: valora la empresa según su capacidad actual de generar beneficios, sin asumir ningún crecimiento futuro — un enfoque conservador.',
    pe: 'Compara el PER (precio/beneficio) actual de la empresa con su media histórica y la de su sector, para ver si cotiza cara o barata.',
    ev_ebitda: 'Compara el valor total de la empresa (incluida la deuda) frente a su EBITDA. Útil para comparar empresas con distinta estructura financiera.',
    pb: 'Price/Book: compara el precio de la acción con el valor contable de sus activos netos.',
    ev_revenue: 'Compara el valor de la empresa con sus ingresos totales. Útil en sectores de bajo margen o alto crecimiento donde el beneficio aún no es representativo.',
    dcf_quality: 'Evalúa la calidad y previsibilidad de los flujos de caja futuros de la empresa, la base de cualquier descuento de flujos (DCF).',
    weiss: 'Método de Geraldine Weiss: compara el yield (rentabilidad por dividendo) actual con su rango histórico propio para detectar si la acción cotiza barata o cara según su dividendo.'
};

const RADAR_SECTORS = [
    'Todos', 'Tecnología', 'Consumo Defensivo', 'Consumo Cíclico', 'Salud',
    'Financiero', 'Servicios Financieros', 'Energía', 'Utilities', 'Industria',
    'Materiales Básicos', 'Inmobiliario', 'Comunicaciones', 'Otros'
];

// ── Render principal ──

export function renderValuation() {
    const ticker = state._valTicker || '';
    const result = state._valResult;
    const loading = state._valLoading;
    const error = state._valError || '';

    const fmpKey = state.fmpKey || '';

    // Panel de FMP
    const fmpPanel = `
        <div style="background:${fmpKey ? '#f0fdf4' : '#fffbeb'};border:1px solid ${fmpKey ? '#bbf7d0' : '#fde68a'};border-radius:10px;padding:12px 14px;margin-bottom:14px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="font-size:13px;font-weight:700;color:${fmpKey ? '#15803d' : '#92400e'}">${fmpKey ? '✅ Datos fundamentales: Financial Modeling Prep conectado' : '⚙️ Configura la fuente de datos fundamentales'}</span>
            </div>
            ${fmpKey
                ? `<div style="font-size:11px;color:#15803d">Clave activa — las gráficas de Crecimiento, Calidad, Balance y Valoración funcionan para cualquier empresa.</div>
                   <button onclick="state.fmpKey='';ls.set('km_fmp_key','');window.renderActiveTab()" style="margin-top:6px;font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;text-decoration:underline">Cambiar clave</button>`
                : `<div style="font-size:11px;color:#92400e;margin-bottom:8px;line-height:1.5">
                     Las gráficas de análisis necesitan una API key gratuita de <strong>Financial Modeling Prep</strong>.<br>
                     1. Regístrate gratis en <strong>financialmodelingprep.com/developer</strong><br>
                     2. Copia tu API key y pégala aquí — se guarda en tu navegador.
                   </div>
                   <div style="display:flex;gap:6px">
                     <input id="fmp-key-input" class="inp-sm" placeholder="Pega tu API key de FMP aquí..." style="flex:1;font-size:12px" onkeydown="if(event.key==='Enter')window.saveFmpKey()">
                     <button class="btn" onclick="window.saveFmpKey()" style="padding:5px 12px;font-size:12px">Guardar</button>
                   </div>`
            }
        </div>`;

    // Resultado HTML
    let resultHtml = '';
    if (result) {
        const validScores = Object.values(result.scores || {}).filter(v => typeof v === 'number');
        const overall = result.overall_score != null ? result.overall_score : (validScores.length ? +((validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1)) : null);
        const oc = overall == null ? '#94a3b8' : overall >= 60 ? '#16a34a' : overall >= 45 ? '#f59e0b' : '#ef4444';
        const myRec = overall == null ? '⚪ Datos insuficientes' : overall >= 60 ? '🟢 Precio de COMPRA' : overall >= 45 ? '🟡 Precio NORMAL' : '🔴 NO comprar a este precio';

        // Score bars
        const scoreBars = Object.entries(result.scores || {}).map(([k, v]) => {
            const hasData = typeof v === 'number';
            const c = !hasData ? '#94a3b8' : v >= 70 ? '#16a34a' : v >= 40 ? '#f59e0b' : '#ef4444';
            const expl = methodExplanations[k] || '';
            const note = (result.method_notes || {})[k];
            return `<div style="margin-bottom:9px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;font-size:12px">
                    <span style="color:#475569;display:flex;align-items:center;gap:5px">${methodLabels[k] || k}<span onclick="window.toggleMethodInfo('${k}')" title="Cómo se calcula" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:700;cursor:pointer;flex-shrink:0">?</span></span>
                    <span style="color:${c};font-weight:700">${hasData ? `${v}/100` : 'Sin datos'}</span>
                </div>
                <div style="background:#e2e8f0;border-radius:6px;height:8px"><div style="background:${c};border-radius:6px;height:8px;width:${hasData ? v : 0}%"></div></div>
                ${note ? `<div style="font-size:11px;color:#b45309;background:#fffbeb;border-radius:6px;padding:6px 8px;margin-top:5px;line-height:1.4">⚠️ ${esc(note)}</div>` : ''}
                <div id="method-info-${k}" style="display:none;font-size:11px;color:#64748b;background:#f8fafc;border-radius:6px;padding:7px 9px;margin-top:5px;line-height:1.45">${esc(expl)}</div>
            </div>`;
        }).join('');

        // Metrics
        const metricRows = Object.entries(result.metrics || {}).map(([k, v]) =>
            `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
                <span style="color:#64748b">${k.replace(/_/g, ' ')}</span><span style="font-weight:600">${v !== null && v !== undefined ? v : '—'}</span>
            </div>`
        ).join('');

        const ph = result.priceHistory;
        const fd = result.fundamentals || {};
        const years = fd.years || [];
        const hasData = years.length > 0;

        // Tab names
        const tabNames = ['🏆 Scoring', '📈 Precio', '💰 Dividendos', '📐 Valoración', '🔬 Fundamentales'];

        // Header
        resultHtml = `
            <div style="background:#f0f7ff;border-radius:14px;border:1px solid #bfdbfe;padding:16px;margin-bottom:12px">
                <div style="display:flex;align-items:center;gap:10px">
                    ${logoImg(result.ticker || '', result.name || '', 40)}
                    <div>
                        <div style="font-size:17px;font-weight:700;color:#1d4ed8">${esc(result.name)}</div>
                        <div style="font-size:12px;color:#475569;margin:2px 0 6px">${esc(result.ticker)} · ${esc(result.sector)}</div>
                        <div style="font-size:12px;color:#64748b">${esc(result.description)}</div>
                    </div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:14px">
                ${[
                    ['P/E', result.metrics?.PER_fwd, 'x'],
                    ['EV/EBITDA', result.metrics?.EV_EBITDA, 'x'],
                    ['FCF Yield', result.metrics?.FCF_yield, '%'],
                    ['ROIC', result.metrics?.ROIC, '%'],
                    ['D/EBITDA', result.metrics?.Deuda_EBITDA, 'x'],
                    ['Yield', result.metrics?.Yield_pct, '%']
                ].map(([l, v, u]) => {
                    const val = v != null ? `${v}${u}` : '—';
                    return `<div class="metric-card" style="padding:8px;text-align:center">
                        <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px">${l}</div>
                        <div style="font-size:16px;font-weight:800;color:#1d4ed8;margin-top:2px">${val}</div>
                    </div>`;
                }).join('')}
            </div>
            <div style="display:flex;gap:0;border-bottom:2px solid #e2e8f0;margin-bottom:14px;overflow-x:auto">
                ${tabNames.map((t, i) =>
                    `<button onclick="window.setValTab(${i})" style="padding:7px 12px;font-size:11px;font-weight:600;border:none;background:none;cursor:pointer;white-space:nowrap;border-bottom:2px solid ${(state._valTab || 0) === i ? '#2563eb' : 'transparent'};color:${(state._valTab || 0) === i ? '#2563eb' : '#64748b'};margin-bottom:-2px">${t}</button>`
                ).join('')}
            </div>
            <div style="display:${(state._valTab || 0) === 0 ? 'block' : 'none'}">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;min-width:0">
                    <div class="card"><h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:12px">📊 Puntuaciones por método</h4>${result._note ? `<div style="font-size:11px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:10px">⚠️ ${esc(result._note)}</div>` : ''}${scoreBars}</div>
                    <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
                        <div class="card">
                            <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:10px">🏆 Puntuación global</h4>
                            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                                <span style="font-size:42px;font-weight:900;color:${oc};line-height:1">${overall}</span>
                                <span style="font-size:14px;color:#94a3b8">/100</span>
                                <span class="badge" style="background:${oc}22;color:${oc}">${myRec}</span>
                            </div>
                            <div style="font-size:10px;color:#94a3b8;margin-top:6px">≥60 precio de compra · 45-60 normal · &lt;45 no comprar${result.recommendation ? ` · texto del servidor: "${esc(result.recommendation)}"` : ''}</div>
                        </div>
                        <div class="card"><h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:10px">📋 Métricas clave</h4>${metricRows}</div>
                    </div>
                </div>
                <div style="background:#f0fdf4;border-radius:14px;border:2px solid ${result.weiss_color || '#16a34a'}55;padding:16px;margin-top:12px">
                    <h4 style="font-size:13px;font-weight:700;color:${result.weiss_color || '#16a34a'};margin-bottom:6px">📘 Valoración Geraldine Weiss</h4>
                    <div style="color:${result.weiss_color || '#16a34a'};font-weight:600;font-size:12px">${esc(result.weiss_verdict)}</div>
                </div>
                <div style="margin-top:12px;text-align:right">
                    <button class="btn" style="font-size:12px;padding:7px 16px" onclick="window.createValAlert('${esc(result.ticker || '')}','${esc(result.name || '')}',${result.metrics?.PER_fwd || 0},${result.metrics?.Yield_pct || 0})">🔔 Crear alerta de compra óptima</button>
                </div>
            </div>
            <div style="display:${(state._valTab || 0) === 1 ? 'block' : 'none'}">
                ${ph?.priceItems?.length
                    ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">
                        ${priceLineChart('📈 Precio histórico + SMA 12 meses', ph.priceItems, { divList: ph.divList })}
                        ${drawdownChart('📉 Drawdown desde máximo histórico', ph.priceItems)}
                    </div>`
                    : `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px;background:#fafafa;border-radius:10px;border:1px solid #e2e8f0">📊 Cargando datos de precio...</div>`}
            </div>
            <div style="display:${(state._valTab || 0) === 2 ? 'block' : 'none'}">
                ${ph?.divYears?.length
                    ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">
                        ${divBarChart('💰 Dividendos anuales históricos', ph.divYears, ph.divByYear, ph.projYears, ph.projAmounts, ph.divCagr)}
                        ${yieldLineChart('📊 Yield histórico por año', ph.yieldByYear || {})}
                    </div>`
                    : `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px;background:#fafafa;border-radius:10px;border:1px solid #e2e8f0">💰 Esta empresa no ha pagado dividendos en los últimos 10 años.</div>`}
            </div>
            <div style="display:${(state._valTab || 0) === 3 ? 'block' : 'none'}">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">
                    ${footballField(result)}
                    ${weissValuationCard(result, ph)}
                    ${hasData ? lineChart('🔢 P/E · P/FCF · EV/EBITDA histórico', years,
                        [{ label: 'P/E', values: fd.pe_hist || [], color: '#2563eb' },
                         { label: 'P/FCF', values: fd.pfcf_hist || [], color: '#7c3aed' },
                         { label: 'EV/EBITDA', values: fd.ev_ebitda_hist || [], color: '#f59e0b' }], 'x') : ''}
                </div>
            </div>
            <div style="display:${(state._valTab || 0) === 4 ? 'block' : 'none'}">
                ${hasData
                    ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">
                        ${barLineChart('📈 Ingresos · EBIT · Bº neto', years,
                            [{ label: 'Ingresos', values: fd.revenue || [], color: '#2563eb' },
                             { label: 'EBIT', values: fd.ebit || [], color: '#16a34a' },
                             { label: 'Bº neto', values: fd.net_income || [], color: '#f59e0b' }], 'M€')}
                        ${barLineChart('💵 Flujo operativo · FCF', years,
                            [{ label: 'CFO', values: fd.cfo || [], color: '#0891b2' },
                             { label: 'FCF', values: fd.fcf || [], color: '#16a34a' }], 'M€')}
                        ${lineChart('📊 Márgenes', years,
                            [{ label: 'Mg. Bruto', values: fd.gross_margin || [], color: '#2563eb' },
                             { label: 'Mg. Oper.', values: fd.ebit_margin || [], color: '#16a34a' },
                             { label: 'Mg. Neto', values: fd.net_margin || [], color: '#f59e0b' }], '%')}
                        ${lineChart('🏆 ROIC · ROE', years,
                            [{ label: 'ROIC', values: fd.roic || [], color: '#7c3aed' },
                             { label: 'ROE', values: fd.roe || [], color: '#dc2626' }], '%')}
                        ${barLineChart('🏦 Deuda neta · D/EBITDA', years,
                            [{ label: 'Deuda neta', values: fd.net_debt || [], color: '#dc2626' },
                             { label: 'D/EBITDA', values: fd.debt_ebitda || [], color: '#f59e0b' }], 'M€')}
                        ${lineChart('💧 Cobertura intereses', years,
                            [{ label: 'EBIT/Intereses', values: fd.interest_coverage || [], color: '#0891b2' }], 'x')}
                    </div>`
                    : `<div style="padding:16px;background:#fffbeb;border-radius:10px;border:1px solid #fde68a;font-size:12px;color:#92400e;line-height:1.8">
                        <strong>🔬 Datos fundamentales (P&L, Cash Flow, Balance)</strong><br>
                        ${!fmpKey
                            ? `Para ver estas gráficas configura una API key gratuita de <strong>Financial Modeling Prep</strong>
                               (<a href="https://financialmodelingprep.com/developer" target="_blank" style="color:#2563eb">financialmodelingprep.com/developer</a>) en el panel de arriba.
                               Funciona para tickers de bolsas USA. Las pestañas <strong>Precio</strong> y <strong>Dividendos</strong> siempre funcionan sin clave.`
                            : `No se pudieron cargar los datos. La app intentó 11 fuentes distintas y todas fallaron.
                               <br><br>
                               <strong>Posibles causas:</strong><br>
                               • Tu clave FMP puede haber llegado al límite diario (250 llamadas/día en plan gratuito)<br>
                               • Yahoo Finance bloquea peticiones desde proxies CORS (habitual en 2025)<br>
                               • Prueba de nuevo en unos minutos — los proxies tienen rate limiting propio<br><br>
                               <button class="btn" onclick="state._fundsDebug=null;window.analyzeValuation()" style="border-radius:6px;padding:5px 12px;font-size:11px;margin-right:6px">🔄 Reintentar</button>
                               <a href="https://financialmodelingprep.com/developer/docs/dashboard" target="_blank" style="font-size:11px;color:#2563eb">Comprobar clave FMP</a>`}
                    </div>`
                }
            </div>
        `;
    }

    return `<div style="padding:14px">
        <div style="background:#f0f7ff;border-radius:12px;border:1px solid #bfdbfe;padding:16px;margin-bottom:14px">
            <h4 style="font-size:14px;font-weight:700;color:#1d4ed8;margin-bottom:10px">📐 Análisis de Valoración</h4>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <div class="ac-wrap" style="flex:1;max-width:340px">
                    <input id="val-ticker" class="inp-sm" placeholder="Empresa o ticker: Iberdrola, GOOGL, KO..." style="width:100%;background:#fff" value="${esc(ticker)}" onkeydown="if(event.key==='Enter')window.analyzeValuation()">
                </div>
                <button class="btn" onclick="window.analyzeValuation()" ${loading ? 'disabled' : ''} style="padding:6px 16px">${loading ? `<span class="spinner"></span> Analizando${state._valProgressSec ? ` (${state._valProgressSec}s)` : ''}...` : '🔍 Analizar'}</button>
                ${(!loading && state._valFromCache) ? `<button class="btn-gray" onclick="window.analyzeValuation(true)" style="padding:6px 12px;font-size:11px" title="Vuelve a descargar los datos en vez de usar la caché compartida de 24h">🔄 Forzar actualización</button>` : ''}
            </div>
            ${(!loading && state._valFromCache) ? `<div style="font-size:10.5px;color:#94a3b8;margin-top:6px">📦 Datos en caché compartida de hace ${state._valCacheAgeHours < 1 ? Math.round(state._valCacheAgeHours * 60) + ' min' : state._valCacheAgeHours.toFixed(1) + ' h'}</div>` : ''}
            ${error ? `<div style="color:#dc2626;margin-top:10px;font-size:12px">⚠️ ${esc(error)}</div>` : ''}
            ${result?._note ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 10px;margin-top:10px;font-size:11px;color:#991b1b">⚠️ ${esc(result._note)}</div>` : ''}
            <div style="margin-top:8px;font-size:11px;color:#64748b">Autocompletado activo con Yahoo Finance. El análisis IA requiere conexión a internet.</div>
        </div>
        ${fmpPanel}
        ${resultHtml}
    </div>`;
}

// ── Analizar valoración ──

export async function analyzeValuation(forceRefresh = false) {
    const input = document.getElementById('val-ticker');
    const ticker = (input?.value || '').trim().toUpperCase().split(' ')[0];
    if (!ticker) return;
    state._valTicker = ticker;
    state._valLoading = true;
    state._valResult = null;
    state._valError = '';
    state._valMissingSources = [];
    state._valTab = 0;
    state._valProgressSec = 0;
    import('./tabs.js').then(m => m.renderActiveTab());

    const progressTimer = setInterval(() => {
        state._valProgressSec = (state._valProgressSec || 0) + 1;
        if (state._valLoading) import('./tabs.js').then(m => m.renderActiveTab());
    }, 1000);

    try {
        const { supabaseClient } = await import('../services/supabase.service.js');
        const { data, error } = await supabaseClient.functions.invoke('valuation', {
            body: { ticker, forceRefresh }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data.priceHistory?.priceItems) {
            data.priceHistory.priceItems = data.priceHistory.priceItems
                .map(p => ({ ...p, date: new Date(p.date) }))
                .filter(p => !isNaN(p.date.getTime()));
        }
        if (data.priceHistory?.divList) {
            data.priceHistory.divList = data.priceHistory.divList
                .map(d => ({ ...d, date: new Date(d.date) }))
                .filter(d => !isNaN(d.date.getTime()));
        }

        state._valResult = data;
        state._valFromCache = !!data._fromCache;
        state._valCacheAgeHours = data._cacheAgeHours || 0;
        state._valError = '';

        if (data.metrics?.PER != null || data.priceHistory) {
            const lastPrice = data.priceHistory?.priceItems?.length
                ? data.priceHistory.priceItems[data.priceHistory.priceItems.length - 1].close : null;
            if (lastPrice) state.priceCache[ticker] = lastPrice;
        }
    } catch (e) {
        console.error('Error análisis Valoración:', e);
        state._valResult = null;
        state._valError = 'No se pudo conectar con el servidor de Valoración. Comprueba tu conexión a internet e inténtalo de nuevo — ' + (e?.message || e);
    } finally {
        clearInterval(progressTimer);
    }
    state._valLoading = false;
    import('./tabs.js').then(m => m.renderActiveTab());

    setTimeout(() => {
        setupAutocomplete('val-ticker', r => {
            state._valTicker = r.ticker;
            const inp = document.getElementById('val-ticker');
            if (inp) inp.value = r.ticker;
        });
    }, 100);
}

// ── Cambiar pestaña de valoración ──

export function setValTab(i) {
    state._valTab = i;
    import('./tabs.js').then(m => m.renderActiveTab());
}

// ── Guardar clave FMP ──

export function saveFmpKey() {
    const inp = document.getElementById('fmp-key-input');
    if (!inp) return;
    const k = inp.value.trim();
    state.fmpKey = k;
    ls.set('km_fmp_key', k);
    import('./tabs.js').then(m => m.renderActiveTab());
}

// ── Crear alerta de valoración ──

export function createValAlert(ticker, name, perFwd, yieldPct) {
    const livePrice = state.priceCache[ticker];
    let suggestedPrice = null;

    if (livePrice) {
        suggestedPrice = +livePrice.toFixed(2);
    }

    const priceTxt = suggestedPrice ? `${suggestedPrice}` : '';
    const infoTxt = suggestedPrice
        ? `Precio actual: ${livePrice?.toFixed(2)}€ — puesto por defecto abajo, cámbialo si quieres un precio de alerta distinto.`
        : `No hay precio en tiempo real para ${ticker}. Introduce el precio de alerta manualmente.`;

    openModal(`
        <h3>🔔 Alerta de compra óptima — ${esc(ticker)}</h3>
        <div style="background:#f0fdf4;border-radius:8px;padding:10px;font-size:11px;color:#166534">${infoTxt}</div>
        <div class="field"><label>Ticker</label><input class="inp" id="va-ticker" value="${esc(ticker)}" readonly style="background:#f8fafc"/></div>
        <div class="field"><label>Precio de alerta (€) — avisar cuando BAJE a este precio</label><input class="inp" id="va-price" type="number" step="0.01" value="${priceTxt}" placeholder="Ej: 42.50"/></div>
        <button class="btn" style="width:100%;margin-top:6px;" onclick="window.saveValAlert()">🔔 Crear alerta</button>
    `);
}

export function saveValAlert() {
    const ticker = (document.getElementById('va-ticker')?.value || '').trim().toUpperCase();
    const price = parseFloat(document.getElementById('va-price')?.value);
    if (!ticker || isNaN(price) || price <= 0) { alert('Introduce un precio válido.'); return; }
    state.alerts.push({ id: uid(), ticker, direction: 'BELOW', price, active: true, triggered: false, created_at: new Date().toISOString() });
    save();
    closeModal();
    // Pedir permiso de notificaciones
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
    alert(`✅ Alerta creada: aviso cuando ${ticker} baje a ${price.toFixed(2)}€`);
}

// ── Toggle método info ──

export function toggleMethodInfo(key) {
    const el = document.getElementById('method-info-' + key);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}