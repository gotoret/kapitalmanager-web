/**
 * Utilidades para importación de datos de brokers
 */

import { state, uid, save, safeDateStr, compareDates } from '../config/state.js';
import { 
    parseNum, normalizeText, normalizeHeader, excelDateToISO,
    detectCurrencyFromTicker, guessSectorFromNameOrTicker,
    normalizeQuotedPrice, esc
} from './helpers.js';
import { openModal, closeModal } from './dom.utils.js';
import { buildDivInfo, renderHeader } from '../components/header.js';
import { refreshDividendYields } from '../services/yahoo.service.js';
import { CURRENCIES, SECTORS } from '../config/constants.js';

// ── CSV parser ──

export function csvToRows(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
    if (!lines.length) return [];
    const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';

    const parseLine = (line) => {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === delim && !inQuotes) {
                out.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out.map(x => x.trim());
    };

    return lines.map(parseLine);
}

// ── Auto-mapping de columnas ──

export function autoMapImportColumns(headers) {
    const h = headers.map(normalizeHeader);
    const find = (...alts) => {
        const norm = alts.map(normalizeHeader);
        const idx = h.findIndex(x => norm.includes(x));
        return idx >= 0 ? headers[idx] : '';
    };

    return {
        date: find('date', 'fecha', 'trade_date', 'date_time', 'datetime', 'fecha_hora'),
        ticker: find('symbol', 'ticker', 'codigo', 'instrument', 'producto', 'underlying_symbol'),
        name: find('description', 'company', 'name', 'nombre', 'instrument_description'),
        type: find('type', 'action', 'transaction_type', 'buy_sell', 'side', 'tipo'),
        shares: find('quantity', 'qty', 'shares', 'units', 'cantidad', 'position'),
        price: find('price', 't_price', 'trade_price', 'fill_price', 'precio'),
        commission: find('commission', 'comm_fee', 'fee', 'fees', 'comision', 'broker_fee'),
        currency: find('currency', 'divisa', 'curr'),
        total: find('proceeds', 'amount', 'net_amount', 'gross_amount', 'importe', 'total')
    };
}

export function rowToObject(headers, row) {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
}

export function normalizeImportType(v) {
    const s = normalizeText(v);
    if (['buy', 'compra', 'bought', 'purchase'].includes(s)) return 'BUY';
    if (['sell', 'venta', 'sold'].includes(s)) return 'SELL';
    if (['dividend', 'dividendo'].includes(s)) return 'DIVIDEND';
    return '';
}

// ── Importar broker ──

export function openImportBroker() {
    const overlay = document.getElementById('modal-overlay');
    const box = document.getElementById('modal-box');
    if (!overlay || !box) return;

    overlay.style.display = 'flex';
    box.innerHTML = `
        <h3>📥 Importar extracto de broker</h3>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 12px;font-size:12px;color:#1e3a8a;margin-bottom:14px;line-height:1.5">
            Sube un archivo CSV, XLS o XLSX de tu broker. El sistema intentará detectar automáticamente fecha, ticker, tipo, acciones, precio, comisión y divisa.
        </div>
        <div class="field">
            <label>Archivo</label>
            <input id="import-file" type="file" class="inp" accept=".csv,.xls,.xlsx,.txt">
        </div>
        <div class="grid2">
            <div class="field">
                <label>Broker / formato</label>
                <select id="import-broker" class="inp">
                    <option value="auto">Auto detectar</option>
                    <option value="ibkr">Interactive Brokers</option>
                    <option value="generic">CSV / Excel genérico</option>
                </select>
            </div>
            <div class="field">
                <label>Modo</label>
                <select id="import-mode" class="inp">
                    <option value="merge">Añadir a cartera actual</option>
                    <option value="replace">Sustituir cartera actual</option>
                </select>
            </div>
        </div>
        <div id="import-status" style="font-size:12px;color:#64748b;margin:8px 0 12px"></div>
        <div id="import-map-wrap" style="display:none"></div>
        <div id="import-preview-wrap" style="display:none"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
            <button class="btn-gray" onclick="window.closeModal()">Cancelar</button>
            <button class="btn" onclick="window.parseImportFile()">Analizar</button>
            <button class="btn" onclick="window.confirmImportBroker()">Importar</button>
        </div>
    `;
}

// ── Parsear archivo de importación ──

export async function parseImportFile() {
    try {
        const fileInp = document.getElementById('import-file');
        const status = document.getElementById('import-status');
        const mapWrap = document.getElementById('import-map-wrap');
        const prevWrap = document.getElementById('import-preview-wrap');
        const brokerMode = document.getElementById('import-broker')?.value || 'auto';

        if (!fileInp?.files?.length) {
            alert('Selecciona un archivo');
            return;
        }

        const file = fileInp.files[0];
        state.importFileName = file.name || '';

        if (status) status.innerHTML = `<span class="spinner"></span> Leyendo archivo...`;

        let rows = [];

        if (/\.(csv|txt)$/i.test(file.name)) {
            const text = await file.text();
            rows = csvToRows(text);
        } else if (/\.(xls|xlsx)$/i.test(file.name)) {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });

            // Detectar exportación de Kapital Manager
            if (wb.SheetNames.includes('_BACKUP')) {
                const bakSheet = wb.Sheets['_BACKUP'];
                const bakRows = XLSX.utils.sheet_to_json(bakSheet, { header: 1, raw: false, defval: '' });
                const dataRows = bakRows.slice(1).filter(r => r[0]);
                dataRows.sort((a, b) => (parseInt(a[1]) || 0) - (parseInt(b[1]) || 0));
                const jsonStr = dataRows.map(r => r[0]).join('') || bakRows[1]?.[0] || bakRows[0]?.[1] || '';
                try {
                    const backup = JSON.parse(jsonStr);
                    if (!backup?.positions) throw new Error('JSON sin positions');

                    const mode = document.getElementById('import-mode')?.value || 'merge';
                    const nPos = backup.positions.length;
                    const nTx = backup.transactions?.length || 0;
                    const nDiv = backup.dividends?.length || 0;

                    if (!confirm(`📦 Backup de Kapital Manager detectado\n\n• ${nPos} posiciones\n• ${nTx} transacciones\n• ${nDiv} dividendos cobrados\nFecha: ${(backup._exportDate || '').slice(0, 10)}\n\n${mode === 'replace' ? '⚠️ Se sustituirá la cartera actual.\n' : 'Se añadirá a la cartera actual.\n'}\n¿Restaurar?`)) return;

                    if (mode === 'replace') {
                        state.positions = backup.positions || [];
                        state.transactions = backup.transactions || [];
                        state.dividends = backup.dividends || [];
                        state.dividendCashUsed = backup.dividendCashUsed || [];
                        state.goalConfig = backup.goalConfig || state.goalConfig;
                        state.alerts = backup.alerts || state.alerts;
                        state.goals = backup.goals || state.goals;
                        state.yieldCache = backup.yieldCache || {};
                        if (backup.fxCache) state.fxCache = backup.fxCache;
                    } else {
                        const existingTickers = new Set(state.positions.map(p => p.ticker));
                        (backup.positions || []).forEach(p => { if (!existingTickers.has(p.ticker)) state.positions.push(p); });
                        // ... resto del merge
                    }

                    buildDivInfo();
                    save();
                    renderHeader();
                    import('../components/tabs.js').then(m => m.renderActiveTab());
                    closeModal();
                    refreshDividendYields();
                    alert(`✅ Backup restaurado: ${nPos} posiciones, ${nTx} transacciones, ${nDiv} dividendos cobrados`);
                    return;
                } catch (e) {
                    console.warn('Error parseando _BACKUP JSON:', e);
                }
            }

            // Detectar exportación de Kapital Manager (formato normal)
            const isKapitalExport = wb.SheetNames.includes('Transacciones') && wb.SheetNames.includes('Cartera');

            if (isKapitalExport) {
                // ... procesar exportación
                return;
            }

            const sheet = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        } else {
            alert('Formato no soportado todavía. Usa CSV, XLS o XLSX');
            return;
        }

        if (!rows.length || rows.length < 2) {
            alert('No se encontraron filas válidas');
            return;
        }

        const headers = rows[0].map(h => String(h || '').trim());
        const dataRows = rows.slice(1).filter(r => r.some(v => String(v || '').trim() !== ''));
        state.importHeaders = headers;

        let mapping = autoMapImportColumns(headers);

        if (brokerMode === 'ibkr') {
            mapping = {
                date: headers.find(h => ['Date/Time', 'Date', 'TradeDate', 'Fecha'].includes(String(h).trim())) || mapping.date,
                ticker: headers.find(h => ['Symbol', 'Ticker', 'Underlying Symbol'].includes(String(h).trim())) || mapping.ticker,
                name: headers.find(h => ['Description', 'Company', 'Name'].includes(String(h).trim())) || mapping.name,
                type: headers.find(h => ['Buy/Sell', 'Type', 'Action', 'Transaction Type'].includes(String(h).trim())) || mapping.type,
                shares: headers.find(h => ['Quantity', 'Qty', 'Shares'].includes(String(h).trim())) || mapping.shares,
                price: headers.find(h => ['T. Price', 'Price', 'Trade Price'].includes(String(h).trim())) || mapping.price,
                commission: headers.find(h => ['Comm/Fee', 'Commission', 'Fee'].includes(String(h).trim())) || mapping.commission,
                currency: headers.find(h => ['Currency', 'Curr'].includes(String(h).trim())) || mapping.currency,
                total: headers.find(h => ['Proceeds', 'Amount', 'Net Amount'].includes(String(h).trim())) || mapping.total
            };
        }

        state.importMap = mapping;

        renderImportMapping();
        buildImportPreview(dataRows);

        if (status) status.textContent = `Archivo cargado: ${file.name}. Filas detectadas: ${dataRows.length}`;
        if (mapWrap) mapWrap.style.display = 'block';
        if (prevWrap) prevWrap.style.display = 'block';

    } catch (e) {
        console.error('Error parseando importación:', e);
        alert('No se pudo analizar el archivo');
    }
}

// ── Renderizar mapeo ──

function renderImportMapping() {
    const wrap = document.getElementById('import-map-wrap');
    if (!wrap || !state.importHeaders?.length || !state.importMap) return;

    const mkSelect = (id, val) => `
        <select id="${id}" class="inp">
            <option value="">-- No usar --</option>
            ${state.importHeaders.map(h => `<option value="${esc(h)}" ${h === val ? 'selected' : ''}>${esc(h)}</option>`).join('')}
        </select>
    `;

    wrap.innerHTML = `
        <div class="card" style="padding:12px;margin-bottom:12px">
            <div style="font-weight:700;font-size:12px;color:#1d4ed8;margin-bottom:10px">Mapeo de columnas</div>
            <div class="grid2">
                <div class="field"><label>Fecha</label>${mkSelect('map-date', state.importMap.date)}</div>
                <div class="field"><label>Ticker</label>${mkSelect('map-ticker', state.importMap.ticker)}</div>
                <div class="field"><label>Nombre</label>${mkSelect('map-name', state.importMap.name)}</div>
                <div class="field"><label>Tipo</label>${mkSelect('map-type', state.importMap.type)}</div>
                <div class="field"><label>Acciones</label>${mkSelect('map-shares', state.importMap.shares)}</div>
                <div class="field"><label>Precio</label>${mkSelect('map-price', state.importMap.price)}</div>
                <div class="field"><label>Comisión</label>${mkSelect('map-commission', state.importMap.commission)}</div>
                <div class="field"><label>Divisa</label>${mkSelect('map-currency', state.importMap.currency)}</div>
                <div class="field"><label>Total</label>${mkSelect('map-total', state.importMap.total)}</div>
            </div>
            <div style="margin-top:8px">
                <button class="btn-sm" onclick="window.rebuildImportPreview()">Actualizar vista previa</button>
            </div>
        </div>
    `;
}

// ── Obtener mapeo actual ──

function getCurrentImportMap() {
    return {
        date: document.getElementById('map-date')?.value || '',
        ticker: document.getElementById('map-ticker')?.value || '',
        name: document.getElementById('map-name')?.value || '',
        type: document.getElementById('map-type')?.value || '',
        shares: document.getElementById('map-shares')?.value || '',
        price: document.getElementById('map-price')?.value || '',
        commission: document.getElementById('map-commission')?.value || '',
        currency: document.getElementById('map-currency')?.value || '',
        total: document.getElementById('map-total')?.value || ''
    };
}

// ── Reconstruir vista previa ──

export async function rebuildImportPreview() {
    const fileInp = document.getElementById('import-file');
    if (!fileInp?.files?.length) return;
    const file = fileInp.files[0];

    let rows = [];
    if (/\.(csv|txt)$/i.test(file.name)) {
        const text = await file.text();
        rows = csvToRows(text);
    } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    }

    buildImportPreview(rows.slice(1).filter(r => r.some(v => String(v || '').trim() !== '')));
}

// ── Construir vista previa ──

function buildImportPreview(dataRows) {
    const wrap = document.getElementById('import-preview-wrap');
    if (!wrap) return;

    const map = getCurrentImportMap();
    const rawObjects = dataRows.map(r => rowToObject(state.importHeaders, r));
    const preview = [];

    rawObjects.forEach(obj => {
        const type = normalizeImportType(obj[map.type] || '');
        const ticker = String(obj[map.ticker] || '').trim().toUpperCase();
        const name = String(obj[map.name] || '').trim() || ticker;
        const date = excelDateToISO(obj[map.date]) || new Date().toISOString().slice(0, 10);
        const shares = parseNum(obj[map.shares]);
        const price = parseNum(obj[map.price]);
        const commission = parseNum(obj[map.commission]);
        const total = parseNum(obj[map.total]);
        const currency = String(obj[map.currency] || '').trim().toUpperCase() || detectCurrencyFromTicker(ticker);
        const sector = guessSectorFromNameOrTicker(ticker, name);

        if (!ticker || !type || !shares) return;

        preview.push({
            id: uid(),
            date,
            ticker,
            name,
            type,
            shares: Math.abs(shares),
            price: normalizeQuotedPrice(price, ticker, currency),
            commission: Math.abs(commission),
            total,
            currency,
            sector,
            source: state.importFileName
        });
    });

    state.importPreview = preview;

    const rowsHtml = preview.slice(0, 50).map(r => `
        <tr>
            <td style="color:#64748b">${esc(r.date)}</td>
            <td style="color:#1d4ed8;font-weight:700">${esc(r.ticker)}</td>
            <td>${esc(r.type)}</td>
            <td style="text-align:right">${r.shares}</td>
            <td style="text-align:right">${r.price ? fmtEUR(r.price) : '-'}</td>
            <td style="text-align:right">${r.commission ? fmtEUR(r.commission) : '-'}</td>
            <td>${esc(r.currency)}</td>
            <td>${esc(r.sector || '')}</td>
        </tr>
    `).join('');

    wrap.innerHTML = `
        <div class="card" style="padding:12px">
            <div style="font-weight:700;font-size:12px;color:#1d4ed8;margin-bottom:10px">
                Vista previa (${preview.length} transacciones válidas)
            </div>
            <div style="overflow:auto;max-height:280px">
                <table style="min-width:760px">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Ticker</th>
                            <th>Tipo</th>
                            <th style="text-align:right">Acciones</th>
                            <th style="text-align:right">Precio</th>
                            <th style="text-align:right">Comisión</th>
                            <th>Divisa</th>
                            <th>Sector</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:20px">No hay filas válidas</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ── Aplicar transacciones importadas ──

function applyImportedTransactionsToPortfolio(transactions, replaceMode = false) {
    const txs = [...transactions].sort((a, b) => compareDates(a.date, b.date));

    if (replaceMode) {
        state.positions = [];
        state.transactions = [];
    }

    const posMap = {};
    state.positions.forEach(p => { posMap[p.ticker] = { ...p }; });

    txs.forEach(t => {
        state.transactions.push({
            id: t.id || uid(),
            date: t.date || new Date().toISOString(),
            ticker: t.ticker,
            type: t.type,
            shares: t.shares,
            price: t.price,
            currency: t.currency,
            commission: t.commission || 0,
            notes: `Importado: ${t.source || 'extracto'}`
        });

        if (t.type === 'DIVIDEND') return;

        if (!posMap[t.ticker]) {
            posMap[t.ticker] = {
                ticker: t.ticker,
                name: t.name || t.ticker,
                shares: 0,
                avg_cost: 0,
                currency: t.currency || detectCurrencyFromTicker(t.ticker),
                fx_rate: 1,
                sector: t.sector || guessSectorFromNameOrTicker(t.ticker, t.name),
                date: t.date || new Date().toISOString().slice(0, 10)
            };
        }

        const current = posMap[t.ticker];
        const feePerShare = t.shares > 0 ? (t.commission || 0) / t.shares : 0;

        if (t.type === 'BUY') {
            const buyUnitCost = (t.price || 0) + feePerShare;
            const newShares = current.shares + t.shares;
            current.avg_cost = newShares > 0 ? (current.shares * current.avg_cost + t.shares * buyUnitCost) / newShares : buyUnitCost;
            current.shares = newShares;
            current.name = current.name || t.name || t.ticker;
            current.currency = current.currency || t.currency || detectCurrencyFromTicker(t.ticker);
            current.sector = current.sector || t.sector || guessSectorFromNameOrTicker(t.ticker, t.name);
            current.date = current.date || t.date;
        }
        if (t.type === 'SELL') current.shares = Math.max(0, current.shares - t.shares);

        posMap[t.ticker] = current;
    });

    state.positions = Object.values(posMap)
        .filter(p => p.shares > 0)
        .map(p => ({
            ticker: String(p.ticker || '').toUpperCase(),
            name: p.name || p.ticker,
            shares: +p.shares || 0,
            avg_cost: +p.avg_cost || 0,
            currency: p.currency || 'EUR',
            sector: p.sector || '',
            date: p.date || new Date().toISOString().slice(0, 10),
            fx_rate: p.fx_rate || 1
        }));
}

// ── Deduplicar transacciones ──

function dedupeImportedTransactions(txs) {
    if (!state.transactions || !state.transactions.length) return txs;
    const existingKeys = new Set(
        state.transactions.map(t => [
            safeDateStr(t.date),
            String(t.ticker || '').toUpperCase(),
            String(t.type || '').toUpperCase(),
            Math.round(parseFloat(t.shares || 0) * 100) / 100,
            Math.round(parseFloat(t.price || 0) * 100) / 100
        ].join('|'))
    );
    return txs.filter(t => !existingKeys.has([
        safeDateStr(t.date),
        String(t.ticker || '').toUpperCase(),
        String(t.type || '').toUpperCase(),
        Math.round(parseFloat(t.shares || 0) * 100) / 100,
        Math.round(parseFloat(t.price || 0) * 100) / 100
    ].join('|')));
}

// ── Confirmar importación ──

export function confirmImportBroker() {
    if (!state.importPreview?.length) {
        alert('Primero analiza un archivo y genera la vista previa');
        return;
    }
    const mode = document.getElementById('import-mode')?.value || 'merge';
    let txs = dedupeImportedTransactions(state.importPreview);
    if (!txs.length) {
        const force = confirm('Todas las filas parecen duplicadas. ¿Quieres importarlas igualmente?');
        if (!force) return;
        txs = [...state.importPreview];
    }
    if (mode === 'replace') {
        if (!confirm('Se sustituirá la cartera actual por la importada. ¿Continuar?')) return;
    }
    try {
        applyImportedTransactionsToPortfolio(txs, mode === 'replace');
    } catch (e) {
        console.error('Error importando:', e);
        alert('Error al procesar las transacciones: ' + e.message);
        return;
    }
    buildDivInfo();
    save();
    renderHeader();
    import('../components/tabs.js').then(m => m.renderActiveTab());
    closeModal();
    refreshDividendYields();
    alert(`✅ Importación completada: ${txs.length} transacciones añadidas y cartera actualizada`);
}