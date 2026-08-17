/**
 * Componente Radar - Screener de acciones
 */

import { state, save, ls } from '../config/state.js';
import { 
    fmtEUR, fmtNum, fmtMcap, esc, sleep, toEUR,
    detectCurrencyFromTicker, guessSectorFromNameOrTicker
} from '../utils/helpers.js';
import { logoImg } from '../utils/chart.utils.js';
import { 
    RADAR_TICKERS, RADAR_SECTORS, RADAR_REGIONS, 
    RADAR_CURRENCIES, RADAR_PERSISTED_KEYS, TICKER_SECTOR
} from '../config/constants.js';
import { fetchWithProxyFull, fetchWithProxy, fetchRadarQuotesFMP } from '../services/yahoo.service.js';
import { fetchFundamentals } from '../services/fmp.service.js';
import { openAddAlert } from './alerts.js';
import { renderHeader } from './header.js';

// ── Estado del radar ──

if (!state.radar) {
    state.radar = {
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
    };
}

// ── Funciones de filtro ──

export function setRadarFilter(key, val) {
    state.radar[key] = val;
    if (RADAR_PERSISTED_KEYS[key]) ls.set(RADAR_PERSISTED_KEYS[key], val);
    import('./tabs.js').then(m => m.renderActiveTab());
}

// ── Guardar preset ──

export function saveRadarPreset() {
    const name = prompt('Nombre para esta combinación de filtros (ej. "Dividendo alto y estable"):');
    if (!name?.trim()) return;
    const { _results, _loading, _searched, _error, _progress, ...filters } = state.radar;
    const presets = ls.get('km_radar_presets', []);
    presets.push({ name: name.trim(), filters });
    ls.set('km_radar_presets', presets);
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function loadRadarPreset(i) {
    const presets = ls.get('km_radar_presets', []);
    const preset = presets[i];
    if (!preset) return;
    state.radar = { ...state.radar, ...preset.filters, _results: [], _loading: false, _searched: false, _error: '', _progress: null };
    import('./tabs.js').then(m => m.renderActiveTab());
}

export function deleteRadarPreset(i) {
    const presets = ls.get('km_radar_presets', []);
    presets.splice(i, 1);
    ls.set('km_radar_presets', presets);
    import('./tabs.js').then(m => m.renderActiveTab());
}

// ── Render principal ──

export function renderRadar() {
    const r = state.radar;

    const inp = (key, placeholder, label, suffix = '') => `
        <div style="display:flex;flex-direction:column;gap:3px">
            <label style="font-size:10px;color:#64748b;font-weight:600">${label}</label>
            <div style="display:flex;align-items:center;gap:4px">
                <input type="number" value="${r[key] || ''}" placeholder="${placeholder}"
                    oninput="window.setRadarFilter('${key}',this.value)"
                    style="width:80px;padding:5px 7px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;background:#fff"/>
                ${suffix ? `<span style="font-size:10px;color:#94a3b8">${suffix}</span>` : ''}
            </div>
        </div>`;

    const sel = (key, options, label) => `
        <div style="display:flex;flex-direction:column;gap:3px">
            <label style="font-size:10px;color:#64748b;font-weight:600">${label}</label>
            <select onchange="window.setRadarFilter('${key}',this.value)"
                style="padding:5px 7px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;background:#fff;min-width:110px">
                ${options.map(o => `<option value="${o}" ${r[key] === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
        </div>`;

    const group = (emoji, title, color, fields) => `
        <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px">
            <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:10px">${emoji} ${title}</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px">${fields}</div>
        </div>`;

    let resultsHtml = '';
    if (r._loading) {
        resultsHtml = `<div style="text-align:center;padding:30px;color:#64748b">
            <div style="font-size:24px;margin-bottom:8px">⏳</div>
            <div style="font-size:13px;font-weight:600">${r._progress || 'Buscando empresas...'}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px">Consultando Yahoo Finance para cada ticker de la región</div>
        </div>`;
    } else if (r._searched) {
        if (r._error) {
            resultsHtml += `<div style="padding:10px 12px;background:#fef3c7;border-radius:8px;font-size:11px;color:#92400e;margin-bottom:10px">⚠️ ${r._error}</div>`;
        }
        const visibleResults = r.hideOwned !== false
            ? r._results.filter(q => !state.positions.some(p => p.ticker === q.symbol))
            : r._results;
        const withoutRatios = visibleResults.filter(q => q.returnOnEquity == null && q.profitMargins == null && q.priceToBook == null).length;
        if (withoutRatios > 0 && visibleResults.length) {
            resultsHtml += `<div style="padding:10px 12px;background:#eff6ff;border-radius:8px;font-size:11px;color:#1e40af;margin-bottom:10px">ℹ️ ${withoutRatios} de ${visibleResults.length} empresas muestran precio y PER, pero sin ROE/P·B/margen — tu plan de datos no trae esos ratios detallados para esos tickers concretos.</div>`;
        }
        if (!visibleResults.length) {
            resultsHtml += `<div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px">😔 Ninguna empresa cumple los filtros. Amplía los criterios.</div>`;
        } else {
            const rows = visibleResults.map(q => {
                const ticker = q.symbol || '';
                const name = q.shortName || q.longName || ticker;
                const price = q.regularMarketPrice != null ? fmtNum(q.regularMarketPrice) : '—';
                const mcap = q.marketCap ? fmtMcap(q.marketCap) : '—';
                const pe = q.trailingPE != null ? (+q.trailingPE).toFixed(1) + 'x' : '—';
                const pb = q.priceToBook != null ? (+q.priceToBook).toFixed(2) + 'x' : '—';
                const yldRaw = q.trailingAnnualDividendYield;
                const yldPct = yldRaw != null ? (yldRaw < 1 ? yldRaw * 100 : yldRaw) : null;
                const yld = yldPct != null ? yldPct.toFixed(2) + '%' : '—';
                const roeRaw = q.returnOnEquity;
                const roePct = roeRaw != null ? (Math.abs(roeRaw) < 3 ? roeRaw * 100 : roeRaw) : null;
                const roe = roePct != null ? roePct.toFixed(1) + '%' : '—';
                const mgRaw = q.profitMargins;
                const mgPct = mgRaw != null ? (Math.abs(mgRaw) < 3 ? mgRaw * 100 : mgRaw) : null;
                const margin = mgPct != null ? mgPct.toFixed(1) + '%' : '—';
                const deuda = q.debtToEquity != null ? (+q.debtToEquity).toFixed(1) + 'x' : '—';
                const inPortfolio = state.positions.some(p => p.ticker === ticker);
                const yldColor = yldPct > 5 ? '#16a34a' : yldPct > 2 ? '#b45309' : '#475569';
                return `<tr style="cursor:pointer" onclick="document.getElementById('val-ticker-radar')&&(document.getElementById('val-ticker-radar').value='${ticker}')">
                    <td><div style="display:flex;align-items:center;gap:6px">
                        ${logoImg(ticker, name, 22)}
                        <div>
                            <div style="font-size:12px;font-weight:700;color:#1d4ed8">${esc(ticker)}${inPortfolio ? ` <span style="font-size:9px;background:#dbeafe;color:#1d4ed8;padding:1px 4px;border-radius:4px">✓ cartera</span>` : ''}</div>
                            <div style="font-size:10px;color:#64748b;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</div>
                        </div>
                    </div></td>
                    <td style="font-size:11px;color:#475569">${esc(q.sector || '—')}</td>
                    <td style="font-weight:600">${price}</td>
                    <td style="font-size:11px">${mcap}</td>
                    <td style="font-size:11px">${pe}</td>
                    <td style="font-size:11px">${pb}</td>
                    <td style="font-size:11px;font-weight:600;color:${yldColor}">${yld}</td>
                    <td style="font-size:11px">${roe}</td>
                    <td style="font-size:11px">${margin}</td>
                    <td style="font-size:11px;color:#7c3aed">${deuda}</td>
                    <td><button onclick="event.stopPropagation();window.openAlertFromRadar('${esc(ticker)}','${esc(name)}',${q.regularMarketPrice || 0})"
                        style="font-size:10px;padding:3px 7px;background:#f59e0b;color:#fff;border:none;border-radius:5px;cursor:pointer">🔔 Alerta</button></td>
                </tr>`;
            }).join('');
            resultsHtml += `<div style="overflow-x:auto">
                <table style="min-width:700px;font-size:12px">
                    <thead><tr style="background:#f8fafc">
                        ${['Empresa', 'Sector', 'Precio', 'M.Cap', 'P/E', 'P/B', 'Yield', 'ROE', 'Mg.Neto', 'D/EBITDA', ''].map(h => `<th style="font-size:10px;padding:6px 8px;text-align:left;white-space:nowrap">${h}</th>`).join('')}
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:8px;text-align:right">${visibleResults.length} resultado${visibleResults.length !== 1 ? 's' : ''} · Fuente: Yahoo Finance${r.hideOwned !== false && r._results.length !== visibleResults.length ? ` (${r._results.length - visibleResults.length} de tu cartera ocultas)` : ''}</div>`;
        }
    }

    const presets = ls.get('km_radar_presets', []);
    const presetsHtml = presets.length ? `<div style="display:flex;gap:6px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <span style="font-size:10px;color:#94a3b8;font-weight:600">GUARDADOS:</span>
        ${presets.map((p, i) => `
            <span style="display:flex;align-items:center;gap:4px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:3px 4px 3px 12px;font-size:11px">
                <button onclick="window.loadRadarPreset(${i})" style="background:none;border:none;color:#1d4ed8;font-weight:600;cursor:pointer;padding:0">${esc(p.name)}</button>
                <button onclick="window.deleteRadarPreset(${i})" title="Eliminar" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:12px;padding:2px 4px">✕</button>
            </span>`).join('')}
    </div>` : '';

    return `<div style="padding:14px">
        <h3 style="font-size:14px;font-weight:700;color:#1d4ed8;margin-bottom:12px">🔭 Radar — Screener de acciones</h3>

        ${group('🌍', 'Universo', '#1d4ed8',
            sel('region', RADAR_REGIONS, 'Región') +
            sel('sector', RADAR_SECTORS, 'Sector') +
            sel('currency', RADAR_CURRENCIES, 'Divisa')
        )}

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:10px">

            ${group('💰', 'Valoración', '#b45309',
                inp('per_max', '25', 'P/E máx', 'x') +
                inp('evEbitda_max', '15', 'EV/EBITDA máx', 'x') +
                inp('pb_max', '3', 'P/B máx', 'x') +
                inp('yield_min', '2', 'Yield mín', '%')
            )}

            ${group('🏆', 'Calidad', '#16a34a',
                inp('margin_min', '5', 'Margen neto mín', '%') +
                inp('roe_min', '10', 'ROE mín', '%') +
                inp('roic_min', '8', 'ROIC mín', '%')
            )}

            ${group('🏦', 'Balance', '#7c3aed',
                inp('debtEbitda_max', '3', 'Deuda/EBITDA máx', 'x') +
                inp('coverage_min', '3', 'Cobertura int. mín', 'x') +
                inp('currentRatio_min', '1', 'Ratio corriente mín', 'x')
            )}

            ${group('📈', 'Crecimiento', '#0891b2',
                inp('revGrowth_min', '5', 'Crec. ingresos mín', '%') +
                inp('epsGrowth_min', '5', 'Crec. BPA mín', '%') +
                `<div style="display:flex;flex-direction:column;gap:3px">
                    <label style="font-size:10px;color:#94a3b8;font-weight:600">Crec. dividendo mín</label>
                    <div style="width:80px;padding:5px 7px;border:1px dashed #cbd5e1;border-radius:6px;font-size:10px;color:#94a3b8" title="No disponible con las fuentes de datos gratuitas actuales">No disp.</div>
                </div>`
            )}

            ${group('💸', 'Dividendo', '#dc2626',
                inp('divYield_min', '2', 'Yield mín', '%') +
                inp('divYears_min', '5', 'Años pagando mín', '') +
                inp('payout_max', '80', 'Payout máx', '%')
            )}

            ${group('📏', 'Tamaño', '#475569',
                inp('mcap_min', '100', 'Cap. mín', 'M€') +
                inp('mcap_max', '', 'Cap. máx', 'M€')
            )}
        </div>

        <div style="display:flex;gap:10px;align-items:center;margin-top:14px;flex-wrap:wrap">
            <button onclick="window.runRadarSearch()"
                style="padding:10px 24px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
                🔍 Buscar empresas
            </button>
            <button onclick="state.radar={...state.radar,region:'Todos',sector:'Todos',currency:'Todas',per_max:'',evEbitda_max:'',pb_max:'',yield_min:'',margin_min:'',roe_min:'',roic_min:'',debtEbitda_max:'',coverage_min:'',currentRatio_min:'',revGrowth_min:'',epsGrowth_min:'',divGrowth_min:'',divYield_min:'',divYears_min:'',payout_max:'',mcap_min:'',mcap_max:''};window.renderActiveTab()"
                style="padding:10px 16px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;cursor:pointer">
                ✕ Limpiar filtros
            </button>
            <button onclick="window.saveRadarPreset()"
                style="padding:10px 16px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;cursor:pointer">
                💾 Guardar filtros
            </button>
            <label style="font-size:11px;color:#475569;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px">
                <input type="checkbox" ${r.hideOwned !== false ? 'checked' : ''} onchange="window.setRadarFilter('hideOwned',this.checked)" style="width:13px;height:13px">
                Ocultar las que ya tengo en cartera
            </label>
            ${r._searched && !r._loading ? `<span style="font-size:11px;color:#94a3b8">${r._results.length} resultado${r._results.length !== 1 ? 's' : ''}</span>` : ''}
        </div>

        ${presetsHtml}

        ${r._loading || r._searched ? `<div style="margin-top:14px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px">${resultsHtml}</div>` : ''}
    </div>`;
}

// ── Búsqueda en el radar ──

export async function runRadarSearch() {
    const r = state.radar;
    r._loading = true;
    r._searched = false;
    r._error = '';
    r._results = [];
    r._progress = null;
    import('./tabs.js').then(m => m.renderActiveTab());

    let tickers = r.region === 'Todos'
        ? RADAR_TICKERS['Global']
        : (RADAR_TICKERS[r.region] || RADAR_TICKERS['Global']);

    const tickersToFetch = tickers.slice(0, 150);
    state.radar._progress = 'Preparando datos...';
    import('./tabs.js').then(m => m.renderActiveTab());

    const allQuotes = [];
    const coveredByFmp = new Set();

    // Fuente principal: FMP en lotes
    if (state.fmpKey) {
        state.radar._progress = 'Descargando datos (Financial Modeling Prep)...';
        import('./tabs.js').then(m => m.renderActiveTab());
        const fmpQuotes = await fetchRadarQuotesFMP(tickersToFetch);
        if (fmpQuotes) {
            Object.values(fmpQuotes).forEach(q => { allQuotes.push(q);
                coveredByFmp.add(q.symbol); });
        }
    }

    // Tickers no cubiertos por FMP
    tickersToFetch.forEach(ticker => {
        if (coveredByFmp.has(ticker)) return;
        const cached = state.priceCache[ticker];
        if (cached) {
            const div = state.yieldCache[ticker];
            allQuotes.push({
                symbol: ticker,
                shortName: state.positions.find(p => p.ticker === ticker)?.name || ticker,
                regularMarketPrice: cached,
                marketCap: null,
                currency: ticker.endsWith('.MC') ? 'EUR' : ticker.endsWith('.L') ? 'GBP' : 'USD',
                exchange: '',
                sector: TICKER_SECTOR[ticker] || state.positions.find(p => p.ticker === ticker)?.sector || null,
                trailingPE: null, forwardPE: null, priceToBook: null,
                trailingAnnualDividendYield: div?.yield ?? null,
                returnOnEquity: null, profitMargins: null,
                debtToEquity: null, payoutRatio: null,
                _fromCache: true
            });
        }
    });

    // Fetch de tickers faltantes
    const missing = tickersToFetch.filter(t => !coveredByFmp.has(t) && !state.priceCache[t]);
    const GROUP = 4;
    for (let i = 0; i < missing.length; i += GROUP) {
        const group = missing.slice(i, i + GROUP);
        state.radar._progress = `Descargando datos... ${Math.min(i + GROUP, missing.length)}/${missing.length}`;
        import('./tabs.js').then(m => m.renderActiveTab());
        const settled = await Promise.allSettled(group.map(async ticker => {
            const meta = await fetchWithProxyFull(PROXIES, ticker);
            if (!meta?.regularMarketPrice) return null;
            const div = state.yieldCache[ticker];
            return {
                symbol: ticker,
                shortName: meta.shortName || meta.longName || ticker,
                regularMarketPrice: meta.regularMarketPrice,
                marketCap: meta.marketCap || null,
                currency: meta.currency || (ticker.endsWith('.MC') ? 'EUR' : ticker.endsWith('.L') ? 'GBP' : 'USD'),
                exchange: meta.exchangeName || '',
                sector: TICKER_SECTOR[ticker] || null,
                trailingPE: meta.trailingPE ?? null,
                forwardPE: meta.forwardPE ?? null,
                priceToBook: null,
                trailingAnnualDividendYield: div?.yield ?? null,
                returnOnEquity: null, profitMargins: null,
                debtToEquity: null, payoutRatio: null,
            };
        }));
        settled.forEach(s => { if (s.status === 'fulfilled' && s.value) allQuotes.push(s.value); });
        if (i + GROUP < missing.length) await sleep(350);
    }
    state.radar._progress = null;

    // Enriquecer con datos fundamentales
    state.radar._progress = 'Enriqueciendo datos fundamentales...';
    import('./tabs.js').then(m => m.renderActiveTab());

    const ENRICH_GROUP = 5;
    for (let i = 0; i < allQuotes.length; i += ENRICH_GROUP) {
        const group = allQuotes.slice(i, i + ENRICH_GROUP);
        state.radar._progress = `Enriqueciendo datos fundamentales... ${Math.min(i + ENRICH_GROUP, allQuotes.length)}/${allQuotes.length}`;
        import('./tabs.js').then(m => m.renderActiveTab());
        await Promise.allSettled(group.map(async q => {
            let filledByFmp = false;
            if (state.fmpKey) {
                try {
                    const res = await fetch(`https://financialmodelingprep.com/api/v3/ratios/${encodeURIComponent(q.symbol)}?limit=1&apikey=${state.fmpKey}`, { signal: AbortSignal.timeout(8000) });
                    if (res.ok) {
                        const arr = await res.json();
                        const rt = Array.isArray(arr) ? arr[0] : null;
                        if (rt) {
                            if (rt.netProfitMargin != null) q.profitMargins = +(rt.netProfitMargin * 100).toFixed(1);
                            if (rt.returnOnEquity != null) q.returnOnEquity = +(rt.returnOnEquity * 100).toFixed(1);
                            if (rt.priceToBookRatio != null) q.priceToBook = +rt.priceToBookRatio.toFixed(2);
                            if (rt.debtEquityRatio != null) q.debtToEquity = +(rt.debtEquityRatio * 100).toFixed(1);
                            if (rt.payoutRatio != null) q.payoutRatio = +(rt.payoutRatio * 100).toFixed(1);
                            if (!q.trailingPE && rt.priceEarningsRatio != null) q.trailingPE = +rt.priceEarningsRatio.toFixed(1);
                            if (rt.dividendYield != null && !q.trailingAnnualDividendYield) q.trailingAnnualDividendYield = rt.dividendYield;
                            filledByFmp = q.profitMargins != null || q.returnOnEquity != null || q.priceToBook != null;
                        }
                    }
                } catch (e) { /* se cae al respaldo */ }
            }
            if (!filledByFmp) {
                // Intentar enriquecer con Yahoo TS
                try {
                    const { _fetchYahooTimeSeries } = await import('../services/yahoo.service.js');
                    const tsData = await _fetchYahooTimeSeries(q.symbol);
                    if (tsData && !tsData._failed) {
                        const lastIdx = tsData.years.length - 1;
                        if (lastIdx >= 0) {
                            if (tsData.net_margin && tsData.net_margin[lastIdx] != null) q.profitMargins = tsData.net_margin[lastIdx];
                            if (tsData.roe && tsData.roe[lastIdx] != null) q.returnOnEquity = tsData.roe[lastIdx];
                            if (tsData.net_debt && tsData.ebitda_arr && tsData.net_debt[lastIdx] != null && tsData.ebitda_arr[lastIdx] != null) {
                                q.debtToEquity = +(tsData.net_debt[lastIdx] / tsData.ebitda_arr[lastIdx]).toFixed(2);
                            }
                            if (tsData.pe_hist && tsData.pe_hist[lastIdx] != null) q.trailingPE = tsData.pe_hist[lastIdx];
                        }
                    }
                } catch (e) { /* ignorar */ }
            }

            if (!q.trailingAnnualDividendYield) {
                const cached = state.yieldCache[q.symbol];
                if (cached?.yield) q.trailingAnnualDividendYield = cached.yield;
            }
        }));
        if (i + ENRICH_GROUP < allQuotes.length) await sleep(300);
    }

    state.radar._progress = null;

    // Asignar sectores
    allQuotes.forEach(q => {
        if (!q.sector) q.sector = TICKER_SECTOR[q.symbol] || null;
    });

    if (!allQuotes.length) {
        r._results = _radarFilterLocal();
        r._error = state.fmpKey
            ? 'No hay datos disponibles ahora mismo (proxies saturados). Mostrando tu cartera filtrada. Prueba de nuevo en unos minutos.'
            : 'No hay datos disponibles ahora mismo. Mostrando tu cartera filtrada. Configura una clave gratuita de Financial Modeling Prep en la pestaña Valoración para que el Radar sea mucho más fiable.';
        r._loading = false;
        r._searched = true;
        import('./tabs.js').then(m => m.renderActiveTab());
        return;
    }

    const fromCache = allQuotes.filter(q => q._fromCache).length;
    if (fromCache > 0 && fromCache === allQuotes.length) {
        r._error = `Datos desde caché local (${fromCache} empresas). Los precios pueden no ser tiempo real — pulsa Actualizar primero para mejores resultados.`;
    } else if (fromCache > 0) {
        r._error = `${fromCache} empresas desde caché local, ${allQuotes.length - fromCache} en tiempo real.`;
    }

    // Aplicar filtros
    let results = allQuotes.filter(q => {
        if (!q.regularMarketPrice) return false;
        if (r.region && r.region !== 'Todos') {
            const t = q.symbol || '';
            const isSpain = t.endsWith('.MC') || t.endsWith('.MAD');
            const isUK = t.endsWith('.L');
            const isEurope = t.endsWith('.PA') || t.endsWith('.DE') || t.endsWith('.AS') || t.endsWith('.MI') || t.endsWith('.VX') || t.endsWith('.BR') || t.endsWith('.LS') || t.endsWith('.ST') || t.endsWith('.HE') || t.endsWith('.OL') || t.endsWith('.CO');
            const isAsia = t.endsWith('.T') || t.endsWith('.HK') || t.endsWith('.KS') || t.endsWith('.SS') || t.endsWith('.SZ');
            const isUS = !isSpain && !isUK && !isEurope && !isAsia;
            if (r.region === 'España' && !isSpain) return false;
            if (r.region === 'EE.UU.' && !isUS) return false;
            if (r.region === 'Reino Unido' && !isUK) return false;
            if (r.region === 'Asia' && !isAsia) return false;
            if (r.region === 'Europa' && !isSpain && !isUK && !isEurope) return false;
        }
        if (r.sector && r.sector !== 'Todos' && q.sector && q.sector !== r.sector) return false;
        if (r.currency && r.currency !== 'Todas' && q.currency !== r.currency) return false;
        if (r.per_max && q.trailingPE != null && q.trailingPE > +r.per_max) return false;
        if (r.pb_max && q.priceToBook != null && q.priceToBook > +r.pb_max) return false;
        if (r.margin_min && q.profitMargins != null && q.profitMargins < +r.margin_min) return false;
        if (r.roe_min && q.returnOnEquity != null && q.returnOnEquity < +r.roe_min) return false;
        if (r.debtEbitda_max && q.debtToEquity != null && q.debtToEquity > +r.debtEbitda_max) return false;
        const yld = (q.trailingAnnualDividendYield || 0) * 100;
        if (r.yield_min && yld < +r.yield_min) return false;
        if (r.divYield_min && yld < +r.divYield_min) return false;
        if (r.payout_max && q.payoutRatio != null && q.payoutRatio * 100 > +r.payout_max) return false;
        if (r.mcap_min && q.marketCap && q.marketCap < +r.mcap_min * 1e6) return false;
        if (r.mcap_max && q.marketCap && q.marketCap > +r.mcap_max * 1e6) return false;
        if (r.revGrowth_min && q.revGrowth != null && q.revGrowth < +r.revGrowth_min) return false;
        if (r.epsGrowth_min && q.epsGrowth != null && q.epsGrowth < +r.epsGrowth_min) return false;
        return true;
    });

    results.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

    r._results = results;
    r._loading = false;
    r._searched = true;
    if (!results.length) r._error = 'Ninguna empresa cumple los filtros en la región seleccionada. Amplía los criterios.';
    import('./tabs.js').then(m => m.renderActiveTab());
}

// ── Filtro local (cartera) ──

function _radarFilterLocal() {
    const r = state.radar;
    return state.positions.filter(p => {
        const di = state.divInfo?.find(d => d.ticker === p.ticker);
        const yld = (di?.div_yield || 0) * 100;
        if (r.region && r.region !== 'Todos') {
            const EX = { '.MC': 'España', '.L': 'Reino Unido', '.PA': 'Europa', '.DE': 'Europa', '.AS': 'Europa', '.MI': 'Europa' };
            const s = Object.keys(EX).find(k => p.ticker.endsWith(k));
            const reg = s ? EX[s] : 'EE.UU.';
            if (r.region === 'Europa' && !['España', 'Europa', 'Reino Unido'].includes(reg)) return false;
            if (r.region !== 'Europa' && r.region !== 'Global' && r.region !== 'Todos' && reg !== r.region) return false;
        }
        if (r.sector && r.sector !== 'Todos' && p.sector !== r.sector) return false;
        if (r.currency && r.currency !== 'Todas' && p.currency !== r.currency) return false;
        if (r.yield_min && yld < +r.yield_min) return false;
        if (r.divYield_min && yld < +r.divYield_min) return false;
        return true;
    }).map(p => {
        const di = state.divInfo?.find(d => d.ticker === p.ticker);
        return {
            symbol: p.ticker,
            shortName: p.name,
            sector: p.sector,
            currency: p.currency,
            exchange: p.ticker.endsWith('.MC') ? 'MCE' : p.ticker.endsWith('.L') ? 'LSE' : 'NYQ',
            regularMarketPrice: state.priceCache[p.ticker] || p.avg_cost,
            marketCap: (state.priceCache[p.ticker] || p.avg_cost) * p.shares,
            trailingAnnualDividendYield: di?.div_yield || 0,
            trailingPE: null,
            priceToBook: null,
            returnOnEquity: null,
            profitMargins: null,
            _fromPortfolio: true
        };
    });
}

// ── Abrir alerta desde radar ──

export function openAlertFromRadar(ticker, name, price) {
    state.activeTab = 1;
    import('./tabs.js').then(m => {
        m.renderActiveTab();
        setTimeout(() => openAddAlert(ticker, name, price), 150);
    });
}