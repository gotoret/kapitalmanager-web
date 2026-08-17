/**
 * Componente Análisis 360 - Informe completo por empresa
 */

import { state } from '../config/state.js';
import { fmtEUR, esc } from '../utils/helpers.js';
import { logoImg } from '../utils/chart.utils.js';

// ── Análisis de ticker ──

export async function analyzeTicker360(forceRefresh = false) {
    const input = document.getElementById('a360-ticker');
    const ticker = (input?.value || '').trim().toUpperCase().split(' ')[0];
    if (!ticker) return;
    state.analysis360 = { ticker, loading: true, result: null, error: '', earnings: null, progressSec: 0 };
    import('./tabs.js').then(m => m.renderActiveTab());

    const progressTimer = setInterval(() => {
        if (!state.analysis360?.loading) { clearInterval(progressTimer); return; }
        state.analysis360.progressSec = (state.analysis360.progressSec || 0) + 1;
        import('./tabs.js').then(m => m.renderActiveTab());
    }, 1000);

    try {
        const { supabaseClient } = await import('../services/supabase.service.js');
        const { data, error } = await supabaseClient.functions.invoke('valuation', { body: { ticker, forceRefresh } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data.priceHistory?.priceItems) {
            data.priceHistory.priceItems = data.priceHistory.priceItems.map(p => ({ ...p, date: new Date(p.date) })).filter(p => !isNaN(p.date.getTime()));
        }
        state.analysis360.result = data;

        // Earnings report real (Finnhub)
        if (state.finnhubKey) {
            try {
                const res = await fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(ticker)}&token=${state.finnhubKey}`, { signal: AbortSignal.timeout(8000) });
                if (res.ok) {
                    const arr = await res.json();
                    if (Array.isArray(arr) && arr.length) state.analysis360.earnings = arr[0];
                }
            } catch (e) { console.warn('analyzeTicker360: earnings Finnhub falló:', e?.message || e); }
        }
    } catch (e) {
        state.analysis360.error = e?.message || String(e);
    } finally {
        state.analysis360.loading = false;
        clearInterval(progressTimer);
        import('./tabs.js').then(m => m.renderActiveTab());
    }
}

// ── No data helper ──

function _a360NoData(txt = 'Sin datos suficientes para calcular este punto.') {
    return `<div style="font-size:12px;color:#94a3b8;font-style:italic;padding:8px 0">${esc(txt)}</div>`;
}

// ── Render principal ──

export function renderAnalysis360() {
    const a = state.analysis360 || {};
    const r = a.result;

    const searchBar = `<div class="card" style="margin-bottom:14px">
        <h3 style="font-size:14px;font-weight:700;color:#1d4ed8;margin-bottom:10px">🔬 Análisis 360 — informe completo por empresa</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input id="a360-ticker" class="inp" placeholder="Ticker (ej. AAPL, IBE.MC)" value="${esc(a.ticker || '')}" style="max-width:180px" onkeydown="if(event.key==='Enter')window.analyzeTicker360()">
            <button class="btn" onclick="window.analyzeTicker360()" ${a.loading ? 'disabled' : ''}>${a.loading ? `<span class="spinner"></span> Analizando${a.progressSec ? ` (${a.progressSec}s)` : ''}...` : '🔍 Analizar'}</button>
            ${r ? `<button class="btn-gray" onclick="window.analyzeTicker360(true)" ${a.loading ? 'disabled' : ''}>♻️ Forzar actualización</button>` : ''}
            ${r ? `<button class="btn-gray" onclick="window.printAnalysis360()">📄 Generar informe PDF</button>` : ''}
        </div>
        <div style="font-size:10px;color:#94a3b8;margin-top:8px">Todos los datos son reales (misma fuente que la pestaña Valoración). Lo que no se puede obtener de una fuente fiable se marca como "sin datos", nunca se estima ni se inventa.</div>
    </div>`;

    if (a.error) {
        return `<div style="padding:14px">${searchBar}<div style="padding:10px 12px;background:#fef2f2;border-radius:8px;font-size:12px;color:#991b1b">⚠️ ${esc(a.error)}</div></div>`;
    }
    if (!r) return `<div style="padding:14px">${searchBar}</div>`;

    const fd = r.fundamentals || {};
    const m = r.metrics || {};
    const scores = r.scores || {};
    const price = r.priceHistory?.priceItems?.length ? r.priceHistory.priceItems[r.priceHistory.priceItems.length - 1].close : null;
    const priceItems = r.priceHistory?.priceItems || [];
    const week52 = priceItems.length ? { lo: Math.min(...priceItems.slice(-252).map(p => p.close)), hi: Math.max(...priceItems.slice(-252).map(p => p.close)) } : null;

    // ── 1. Resumen ejecutivo ──
    const mod1 = `<div class="card" style="margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">1️⃣ Resumen ejecutivo</h4>
        <div style="font-size:16px;font-weight:800;color:#1e293b">${esc(r.name || a.ticker)}</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">${esc(a.ticker)} · ${esc(r.sector || 'Sector no disponible')}</div>
        ${r.description ? `<div style="font-size:12px;color:#334155;line-height:1.5;margin-bottom:10px">${esc(r.description)}</div>` : ''}
        <div style="display:flex;gap:20px;flex-wrap:wrap">
            <div><div style="font-size:10px;color:#64748b;font-weight:600">PRECIO ACTUAL</div><div style="font-size:16px;font-weight:800">${price != null ? fmtEUR(price) : '—'}</div></div>
            <div><div style="font-size:10px;color:#64748b;font-weight:600">RANGO 52 SEMANAS</div><div style="font-size:14px;font-weight:700">${week52 ? `${fmtEUR(week52.lo)} – ${fmtEUR(week52.hi)}` : '—'}</div></div>
            <div><div style="font-size:10px;color:#64748b;font-weight:600">PUNTUACIÓN GLOBAL</div><div style="font-size:16px;font-weight:800;color:${r.rec_color || '#64748b'}">${r.overall_score != null ? r.overall_score + '/100' : '—'}</div></div>
        </div>
        ${r.recommendation ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:${r.rec_color || '#64748b'}">${esc(r.recommendation)}</div>` : ''}
    </div>`;

    // ── 2. Financiero 5 años ──
    const years = fd.years || [];
    const mod2 = years.length ? `<div class="card" style="margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">2️⃣ Evolución financiera (${years.length} años)</h4>
        <div style="overflow-x:auto"><table style="font-size:11px;min-width:400px">
            <thead><tr><th>Año</th><th>Ingresos (M)</th><th>Bº neto (M)</th><th>FCF (M)</th><th>Margen neto</th></tr></thead>
            <tbody>${years.map((y, i) => {
                const rev = fd.revenue?.[i],
                    ni = fd.net_income?.[i],
                    fcf = fd.fcf?.[i];
                const margin = (rev && ni != null) ? ((ni / rev) * 100).toFixed(1) + '%' : '—';
                return `<tr><td>${y}</td><td>${rev != null ? rev.toLocaleString('es-ES') : '—'}</td><td>${ni != null ? ni.toLocaleString('es-ES') : '—'}</td><td>${fcf != null ? fcf.toLocaleString('es-ES') : '—'}</td><td>${margin}</td></tr>`;
            }).join('')}</tbody>
        </table></div>
    </div>` : `<div class="card" style="margin-bottom:12px"><h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">2️⃣ Evolución financiera</h4>${_a360NoData()}</div>`;

    // ── 3. Estabilidad y calidad ──
    const dcfScore = scores.dcf_quality;
    const mod3 = `<div class="card" style="margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:4px">3️⃣ Estabilidad y calidad del negocio</h4>
        <div style="font-size:10px;color:#94a3b8;margin-bottom:8px">Proxy basado en la estabilidad del margen de flujo de caja libre — no es una valoración cualitativa real del "foso competitivo" (esa no existe como dato cuantificable en ninguna fuente gratuita).</div>
        ${dcfScore != null ? `<div style="font-size:22px;font-weight:800;color:${dcfScore >= 70 ? '#16a34a' : dcfScore >= 40 ? '#f59e0b' : '#dc2626'}">${dcfScore}/100</div>` : _a360NoData()}
    </div>`;

    // ── 4. Valoración ──
    const ddmGap = (m.DDM_fair_value != null && price) ? (((m.DDM_fair_value - price) / price) * 100) : null;
    const mod4 = `<div class="card" style="margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">4️⃣ Valoración</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px">
            <div><div style="font-size:10px;color:#64748b;font-weight:600">PER</div><div style="font-size:15px;font-weight:800">${m.PER ?? '—'}</div></div>
            <div><div style="font-size:10px;color:#64748b;font-weight:600">EV/EBITDA</div><div style="font-size:15px;font-weight:800">${m.EV_EBITDA ?? '—'}</div></div>
            <div><div style="font-size:10px;color:#64748b;font-weight:600">P/BOOK</div><div style="font-size:15px;font-weight:800">${m.P_Book ?? '—'}</div></div>
            <div><div style="font-size:10px;color:#64748b;font-weight:600">VALOR JUSTO DDM</div><div style="font-size:15px;font-weight:800">${m.DDM_fair_value ?? '—'}</div></div>
            <div><div style="font-size:10px;color:#64748b;font-weight:600">VS PRECIO ACTUAL</div><div style="font-size:15px;font-weight:800;color:${ddmGap == null ? '#64748b' : ddmGap >= 0 ? '#16a34a' : '#dc2626'}">${ddmGap != null ? (ddmGap >= 0 ? '+' : '') + ddmGap.toFixed(1) + '%' : '—'}</div></div>
        </div>
    </div>`;

    // ── 5. Matriz de riesgos ──
    const riskFlags = [];
    if (m.Deuda_EBITDA != null && m.Deuda_EBITDA > 4) riskFlags.push({ txt: `Deuda/EBITDA elevada (${m.Deuda_EBITDA}x)`, level: 'alto' });
    if (m.Deuda_Patrimonio != null && m.Deuda_Patrimonio > 2) riskFlags.push({ txt: `Deuda/Patrimonio elevada (${m.Deuda_Patrimonio}x)`, level: 'alto' });
    if (m.PER == null) riskFlags.push({ txt: 'Sin PER calculable (posibles pérdidas en el último ejercicio)', level: 'medio' });
    if (m.Payout_pct != null && m.Payout_pct > 100) riskFlags.push({ txt: `Payout por encima del 100% (${m.Payout_pct}%) — dividendo no cubierto por el beneficio actual`, level: 'alto' });
    if (m.ROE_pct != null && m.ROE_pct < 0) riskFlags.push({ txt: `ROE negativo (${m.ROE_pct}%)`, level: 'alto' });
    const mod5 = `<div class="card" style="margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">5️⃣ Matriz de riesgos</h4>
        ${riskFlags.length ? riskFlags.map(f => `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px"><span style="color:${f.level === 'alto' ? '#dc2626' : '#f59e0b'}">●</span> ${esc(f.txt)}</div>`).join('') : `<div style="font-size:12px;color:#16a34a">Sin señales de riesgo relevantes en los indicadores disponibles.</div>`}
    </div>`;

    // ── 6. Potencial de crecimiento ──
    const growthOf = (arr) => {
        const valid = (arr || []).filter(v => v != null);
        if (valid.length < 2 || valid[0] === 0) return null;
        return +(((Math.pow(valid[valid.length - 1] / valid[0], 1 / (valid.length - 1))) - 1) * 100).toFixed(1);
    };
    const revGrowth = growthOf(fd.revenue),
        niGrowth = growthOf(fd.net_income);
    const mod6 = `<div class="card" style="margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">6️⃣ Potencial de crecimiento</h4>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
            <div><div style="font-size:10px;color:#64748b;font-weight:600">CAGR INGRESOS (${years.length || '—'} años)</div><div style="font-size:16px;font-weight:800;color:${revGrowth == null ? '#64748b' : revGrowth >= 0 ? '#16a34a' : '#dc2626'}">${revGrowth != null ? revGrowth + '%' : '—'}</div></div>
            <div><div style="font-size:10px;color:#64748b;font-weight:600">CAGR BENEFICIO NETO</div><div style="font-size:16px;font-weight:800;color:${niGrowth == null ? '#64748b' : niGrowth >= 0 ? '#16a34a' : '#dc2626'}">${niGrowth != null ? niGrowth + '%' : '—'}</div></div>
        </div>
    </div>`;

    // ── 7. Fortalezas y debilidades ──
    const strengths = [],
        weaknesses = [];
    const scoreLabel = { pe: 'PER', ev_ebitda: 'EV/EBITDA', pb: 'Price/Book', ev_revenue: 'EV/Revenue', ddm: 'Descuento de dividendos', epv: 'Beneficio normalizado', weiss: 'Yield vs histórico', dcf_quality: 'Calidad del FCF' };
    Object.entries(scores).forEach(([k, v]) => {
        if (v == null) return;
        if (v >= 70) strengths.push(`${scoreLabel[k] || k}: ${v}/100`);
        else if (v < 35) weaknesses.push(`${scoreLabel[k] || k}: ${v}/100`);
    });
    const mod7 = `<div class="card" style="margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">7️⃣ Fortalezas y debilidades</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div><div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:4px">✓ Fortalezas</div>${strengths.length ? strengths.map(s => `<div style="font-size:11px;padding:2px 0">${esc(s)}</div>`).join('') : _a360NoData('Ninguna puntuación destaca por encima del umbral.')}</div>
            <div><div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:4px">✗ Debilidades</div>${weaknesses.length ? weaknesses.map(s => `<div style="font-size:11px;padding:2px 0">${esc(s)}</div>`).join('') : _a360NoData('Ninguna puntuación por debajo del umbral.')}</div>
        </div>
    </div>`;

    // ── 8. Balance de argumentos ──
    const bullPoints = [],
        bearPoints = [];
    if (ddmGap != null && ddmGap > 10) bullPoints.push(`El modelo de dividendos sugiere un ${ddmGap.toFixed(0)}% de recorrido al alza sobre el precio actual.`);
    if (ddmGap != null && ddmGap < -10) bearPoints.push(`El modelo de dividendos sugiere que cotiza un ${Math.abs(ddmGap).toFixed(0)}% por encima de su valor justo estimado.`);
    if (revGrowth != null && revGrowth > 5) bullPoints.push(`Crecimiento de ingresos sostenido (CAGR ${revGrowth}%).`);
    if (revGrowth != null && revGrowth < 0) bearPoints.push(`Ingresos en contracción en el periodo analizado (CAGR ${revGrowth}%).`);
    if (riskFlags.some(f => f.level === 'alto')) bearPoints.push('Al menos una señal de riesgo alto en balance o rentabilidad (ver matriz de riesgos).');
    if (!riskFlags.length) bullPoints.push('Sin señales de riesgo relevantes en balance o rentabilidad.');
    const mod8 = `<div class="card" style="margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">8️⃣ Balance de argumentos</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div><div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:4px">📈 A favor</div>${bullPoints.length ? bullPoints.map(s => `<div style="font-size:11px;padding:3px 0">${esc(s)}</div>`).join('') : _a360NoData()}</div>
            <div><div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:4px">📉 En contra</div>${bearPoints.length ? bearPoints.map(s => `<div style="font-size:11px;padding:3px 0">${esc(s)}</div>`).join('') : _a360NoData()}</div>
        </div>
    </div>`;

    // ── 9. Último informe de resultados ──
    const e = a.earnings;
    const mod9 = `<div class="card" style="margin-bottom:12px">
        <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px">9️⃣ Último informe de resultados</h4>
        ${!state.finnhubKey ? _a360NoData('Configura una clave gratuita de Finnhub en Ajustes para ver el último earnings report real.')
            : !e ? _a360NoData('Sin datos de resultados recientes para este ticker.')
            : `<div style="display:flex;gap:20px;flex-wrap:wrap">
                <div><div style="font-size:10px;color:#64748b;font-weight:600">PERIODO</div><div style="font-size:13px;font-weight:700">${esc(e.period || '—')}</div></div>
                <div><div style="font-size:10px;color:#64748b;font-weight:600">EPS REAL</div><div style="font-size:15px;font-weight:800">${e.actual ?? '—'}</div></div>
                <div><div style="font-size:10px;color:#64748b;font-weight:600">EPS ESTIMADO</div><div style="font-size:15px;font-weight:800">${e.estimate ?? '—'}</div></div>
                <div><div style="font-size:10px;color:#64748b;font-weight:600">SORPRESA</div><div style="font-size:15px;font-weight:800;color:${(e.surprisePercent || 0) >= 0 ? '#16a34a' : '#dc2626'}">${e.surprisePercent != null ? (e.surprisePercent >= 0 ? '+' : '') + e.surprisePercent + '%' : '—'}</div></div>
            </div>`}
    </div>`;

    return `<div style="padding:14px">
        ${searchBar}
        <div id="a360-report">
            <div style="text-align:center;margin-bottom:14px;display:none" class="a360-print-header">
                <h2>Informe de Análisis — ${esc(r.name || a.ticker)}</h2>
                <div style="font-size:11px;color:#64748b">Generado el ${new Date().toLocaleDateString('es-ES')} · Kapital Manager</div>
            </div>
            ${mod1}${mod2}${mod3}${mod4}${mod5}${mod6}${mod7}${mod8}${mod9}
            <div style="font-size:9px;color:#94a3b8;text-align:center;margin-top:10px">Informe generado con datos de mercado públicos. No constituye asesoramiento de inversión.</div>
        </div>
    </div>`;
}

// ── Imprimir informe ──

export function printAnalysis360() {
    window.print();
}