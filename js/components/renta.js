/**
 * Componente Renta - Informe fiscal para la declaración de la Renta
 */

import { state, save, safeDateStr, compareDates, normalizeAllDates } from '../config/state.js';
import { fmtEUR, esc, toEUR, getFX } from '../utils/helpers.js';
import { retencionOrigenPct } from './dividends.js';

export function renderRenta() {
    const now = new Date();
    const ejercicio = now.getFullYear() - 1;
    const yearStr = String(ejercicio);

    const divEjercicio = [...state.dividends.filter(d => safeDateStr(d.date).startsWith(yearStr))]
        .sort((a, b) => safeDateStr(a.date).localeCompare(safeDateStr(b.date)));

    const divRows = divEjercicio.map(d => {
        const pos = state.positions.find(p => p.ticker === d.ticker);
        const currency = d.currency || pos?.currency || 'EUR';
        const brutoLocal = +((d.amount || 0) * (d.shares || 0)).toFixed(2);
        const fxAplicado = currency !== 'EUR' ? getFX(currency) : 1;
        const brutoEUR = +toEUR(brutoLocal, currency).toFixed(2);
        const gastos = +(d.fee || 0).toFixed(2);
        const retOr = retencionOrigenPct(d.ticker, currency);
        const retOrEUR = +(brutoEUR * retOr).toFixed(2);
        const retEsp = +(brutoEUR * 0.19).toFixed(2);
        const limConvenio = Math.min(retOr, 0.15);
        const deducibleOrigen = +(brutoEUR * limConvenio).toFixed(2);
        const retEspNeta = +(Math.max(0, retEsp - deducibleOrigen)).toFixed(2);
        const neto = +(brutoEUR - retOrEUR - retEspNeta - gastos).toFixed(2);
        return {
            fecha: safeDateStr(d.date),
            ticker: d.ticker,
            name: pos?.name || d.ticker,
            isin: d.isin || pos?.isin || '—',
            acciones: d.shares,
            brutoLocal, currency, fxAplicado,
            brutoEUR, gastos, retOr, retOrEUR,
            retEspTotal: retEsp, deducibleOrigen, retEspNeta, neto
        };
    });

    const totDiv = {
        bruto: divRows.reduce((s, d) => s + d.brutoEUR, 0),
        gastos: divRows.reduce((s, d) => s + d.gastos, 0),
        retOrEUR: divRows.reduce((s, d) => s + d.retOrEUR, 0),
        retEspTotal: divRows.reduce((s, d) => s + d.retEspTotal, 0),
        deducibleOrigen: divRows.reduce((s, d) => s + d.deducibleOrigen, 0),
        retEspNeta: divRows.reduce((s, d) => s + d.retEspNeta, 0),
        neto: divRows.reduce((s, d) => s + d.neto, 0),
    };

    // ── Ganancias y pérdidas patrimoniales (FIFO) ──
    const txByTicker = {};
    [...state.transactions].sort((a, b) => compareDates(a.date, b.date)).forEach(t => {
        if (!txByTicker[t.ticker]) txByTicker[t.ticker] = [];
        txByTicker[t.ticker].push(t);
    });

    const pvRows = [];
    Object.entries(txByTicker).forEach(([ticker, txs]) => {
        const pos = state.positions.find(p => p.ticker === ticker);
        const currency = pos?.currency || txs.find(t => t.currency)?.currency || 'EUR';
        const lots = [];

        txs.forEach(t => {
            if (t.type === 'BUY') {
                lots.push({
                    shares: t.shares,
                    costUnit: t.price,
                    date: t.date,
                    fxRate: t.fx_rate && t.fx_rate !== 1 ? t.fx_rate : null,
                    fee: t.commission || 0
                });
            } else if (t.type === 'SELL') {
                let sharesToSell = t.shares;
                const lotsUsed = [];
                while (sharesToSell > 0 && lots.length > 0) {
                    const lot = lots[0];
                    const take = Math.min(lot.shares, sharesToSell);
                    lotsUsed.push({ shares: take, costUnit: lot.costUnit, date: lot.date, fxRate: lot.fxRate, fee: lot.fee * (take / lot.shares) });
                    lot.shares -= take;
                    sharesToSell -= take;
                    if (lot.shares <= 0.00001) lots.shift();
                }

                if (safeDateStr(t.date).startsWith(yearStr) && lotsUsed.length) {
                    const sellFx = t.fx_rate && t.fx_rate !== 1 ? t.fx_rate : null;
                    const ventaTotalLocal = t.price * t.shares;
                    const ventaTotalEUR = sellFx
                        ? +(ventaTotalLocal / sellFx).toFixed(2)
                        : +toEUR(ventaTotalLocal, currency).toFixed(2);
                    const comisionVenta = t.commission || 0;
                    const comisionVentaEUR = sellFx ? +(comisionVenta / sellFx).toFixed(2) : +toEUR(comisionVenta, currency).toFixed(2);

                    let costeTotalEUR = 0;
                    let comisionCompraEUR = 0;
                    const fechasCompra = [];
                    lotsUsed.forEach(lu => {
                        const costeLocal = lu.costUnit * lu.shares;
                        const costeEUR = lu.fxRate
                            ? costeLocal / lu.fxRate
                            : toEUR(costeLocal, currency);
                        costeTotalEUR += costeEUR;
                        const feeEUR = lu.fxRate ? (lu.fee / lu.fxRate) : toEUR(lu.fee, currency);
                        comisionCompraEUR += feeEUR;
                        fechasCompra.push(safeDateStr(lu.date));
                    });
                    costeTotalEUR = +costeTotalEUR.toFixed(2);
                    comisionCompraEUR = +comisionCompraEUR.toFixed(2);

                    const costeConGastos = +(costeTotalEUR + comisionCompraEUR).toFixed(2);
                    const ventaConGastos = +(ventaTotalEUR - comisionVentaEUR).toFixed(2);
                    const resultado = +(ventaConGastos - costeConGastos).toFixed(2);

                    pvRows.push({
                        ticker, name: pos?.name || ticker, isin: pos?.isin || '—',
                        acciones: t.shares,
                        fechaCompra: lotsUsed.length > 1 ? `${lotsUsed.length} lotes FIFO` : (fechasCompra[0] || '—'),
                        fechasCompraDetalle: fechasCompra,
                        fechaVenta: safeDateStr(t.date),
                        precioCompraMedio: +(costeTotalEUR / t.shares).toFixed(4),
                        precioVenta: t.price,
                        costeTotal: costeTotalEUR,
                        comisionCompra: comisionCompraEUR,
                        ventaTotal: ventaTotalEUR,
                        comisionVenta: comisionVentaEUR,
                        resultado,
                        currency, fxVenta: sellFx,
                        nLotes: lotsUsed.length
                    });
                }
            }
        });
    });
    pvRows.sort((a, b) => a.fechaVenta.localeCompare(b.fechaVenta));

    const totPV = {
        coste: pvRows.reduce((s, r) => s + r.costeTotal + r.comisionCompra, 0),
        ingreso: pvRows.reduce((s, r) => s + r.ventaTotal - r.comisionVenta, 0),
        resultado: pvRows.reduce((s, r) => s + r.resultado, 0),
    };
    const plusvalias = pvRows.filter(r => r.resultado > 0).reduce((s, r) => s + r.resultado, 0);
    const minusvalias = pvRows.filter(r => r.resultado < 0).reduce((s, r) => s + r.resultado, 0);
    const saldoNeto = +(plusvalias + minusvalias).toFixed(2);

    const baseAhorro = +(totDiv.bruto + saldoNeto).toFixed(2);

    function tipoMarginalAhorro(base) {
        if (base <= 0) return '0%';
        if (base <= 6000) return '19%';
        if (base <= 50000) return '21%';
        if (base <= 200000) return '23%';
        if (base <= 300000) return '27%';
        return '28%';
    }

    function cuotaAhorro(base) {
        if (base <= 0) return 0;
        let cuota = 0;
        cuota += Math.min(base, 6000) * 0.19;
        base = Math.max(0, base - 6000);
        cuota += Math.min(base, 44000) * 0.21;
        base = Math.max(0, base - 44000);
        cuota += Math.min(base, 150000) * 0.23;
        base = Math.max(0, base - 150000);
        cuota += Math.min(base, 100000) * 0.27;
        base = Math.max(0, base - 100000);
        cuota += base * 0.28;
        return +cuota.toFixed(2);
    }
    const cuotaBruta = cuotaAhorro(baseAhorro);
    const cuotaNeta = +(Math.max(0, cuotaBruta - totDiv.deducibleOrigen - totDiv.retEspNeta)).toFixed(2);

    const fmtPct = v => (v * 100).toFixed(1) + '%';

    // ── Tablas ──
    const divTableRows = divRows.length ? divRows.map(d => `
        <tr>
            <td style="color:#64748b;white-space:nowrap">${d.fecha}</td>
            <td style="font-weight:700;color:#1d4ed8">${esc(d.ticker)}</td>
            <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</td>
            <td style="font-size:9px;color:#94a3b8">${esc(d.isin)}</td>
            <td style="text-align:right">${d.acciones}</td>
            <td style="text-align:right">${d.brutoLocal.toFixed(2)} ${d.currency}</td>
            <td style="text-align:center;font-size:10px;color:#94a3b8">${d.currency !== 'EUR' ? d.fxAplicado.toFixed(4) : '—'}</td>
            <td style="text-align:right;font-weight:600">${fmtEUR(d.brutoEUR)}</td>
            <td style="text-align:right;color:#dc2626">${d.gastos > 0 ? '−' + fmtEUR(d.gastos) : '—'}</td>
            <td style="text-align:center">${fmtPct(d.retOr)}</td>
            <td style="text-align:right;color:#dc2626">−${fmtEUR(d.retOrEUR)}</td>
            <td style="text-align:right;color:#dc2626">−${fmtEUR(d.retEspTotal)}</td>
            <td style="text-align:right;color:#059669">+${fmtEUR(d.deducibleOrigen)}</td>
            <td style="text-align:right;font-weight:700">${fmtEUR(d.neto)}</td>
        </tr>`).join('') :
        `<tr><td colspan="14" style="text-align:center;color:#94a3b8;padding:20px">Sin dividendos registrados en ${yearStr}<br><small>Regístralos en la pestaña 💰 Dividendos</small></td></tr>`;

    const pvTableRows = pvRows.length ? pvRows.map(r => `
        <tr>
            <td style="font-weight:700;color:#1d4ed8">${esc(r.ticker)}</td>
            <td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</td>
            <td style="font-size:9px;color:#94a3b8">${esc(r.isin)}</td>
            <td style="text-align:right">${r.acciones}</td>
            <td style="text-align:center;color:#64748b;font-size:10px">
                ${r.fechaCompra}${r.nLotes > 1 ? `<br><span title="${r.fechasCompraDetalle.join(', ')}" style="text-decoration:underline dotted;cursor:help">ver fechas</span>` : ''}
            </td>
            <td style="text-align:center;color:#64748b">${r.fechaVenta}</td>
            <td style="text-align:right">${r.precioCompraMedio.toFixed(4)}</td>
            <td style="text-align:right">${r.precioVenta.toFixed(4)}</td>
            <td style="text-align:right">${fmtEUR(r.costeTotal)}</td>
            <td style="text-align:right;color:#dc2626">${r.comisionCompra > 0 ? '−' + fmtEUR(r.comisionCompra) : '—'}</td>
            <td style="text-align:right">${fmtEUR(r.ventaTotal)}</td>
            <td style="text-align:right;color:#dc2626">${r.comisionVenta > 0 ? '−' + fmtEUR(r.comisionVenta) : '—'}</td>
            <td style="text-align:right;font-weight:700;color:${r.resultado >= 0 ? '#059669' : '#dc2626'}">${r.resultado >= 0 ? '+' : ''}${fmtEUR(r.resultado)}</td>
        </tr>`).join('') :
        `<tr><td colspan="13" style="text-align:center;color:#94a3b8;padding:20px">Sin ventas registradas en ${yearStr}<br><small>Regístralas en la pestaña 📝 Transacciones</small></td></tr>`;

    return `<div style="padding:16px;max-width:1100px;margin:0 auto">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px">
            <div>
                <h2 style="font-size:17px;font-weight:800;color:#1e293b;margin-bottom:2px">🧾 Informe fiscal — Ejercicio ${yearStr}</h2>
                <div style="font-size:11px;color:#94a3b8">Generado el ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} · Dividendos y ventas desglosados por operación · Método FIFO · Solo orientativo, no vinculante</div>
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn" style="font-size:12px;padding:8px 14px" onclick="window.exportRentaExcel(${ejercicio})">📊 Exportar a Excel</button>
            </div>
        </div>

        <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:11px;color:#92400e;margin-bottom:20px;line-height:1.6">
            ⚠️ <strong>Aviso:</strong> Informe orientativo basado en tus datos. Las retenciones en origen son estimaciones según convenios de doble imposición. El cálculo de coste en ventas usa el <strong>método FIFO</strong> (primera compra que entra, primera que sale) sobre tu historial de transacciones. Consulta con un asesor fiscal antes de presentar tu declaración.
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px">
            ${[
                ['Dividendos brutos', fmtEUR(totDiv.bruto), '#2563eb'],
                ['Retenciones origen', '-' + fmtEUR(totDiv.retOrEUR), '#dc2626'],
                ['Retenciones Hacienda', '-' + fmtEUR(totDiv.retEspNeta), '#dc2626'],
                ['Plusvalías', fmtEUR(plusvalias), '#059669'],
                ['Minusvalías', fmtEUR(Math.abs(minusvalias)), '#dc2626'],
                ['Base ahorro estimada', fmtEUR(Math.max(0, baseAhorro)), '#7c3aed'],
            ].map(([l, v, c]) => `<div class="card" style="padding:12px;text-align:center">
                <div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:4px">${l}</div>
                <div style="font-size:16px;font-weight:800;color:${c}">${v}</div>
            </div>`).join('')}
        </div>

        <!-- Tabla de Dividendos -->
        <div class="card" style="margin-bottom:16px">
            <h3 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:4px">📊 Dividendos cobrados en ${yearStr}</h3>
            <div style="font-size:10px;color:#94a3b8;margin-bottom:12px">Detalle por operación: fecha, empresa, ISIN, importe bruto, divisa/cambio, gastos, retenciones y neto cobrado</div>
            <div style="overflow-x:auto">
                <table style="width:100%;min-width:1000px;font-size:10px">
                    <thead><tr style="background:#f8fafc">
                        ${['Fecha', 'Ticker', 'Empresa', 'ISIN', 'Acc.', 'Bruto (local)', 'T.Cambio', 'Bruto €', 'Gastos', 'Ret.%', 'Ret.origen', 'Ret.Hacienda', 'Deducible', 'Neto €'].map(h => `<th style="padding:6px 7px;text-align:${['Acc.', 'Bruto (local)', 'Bruto €', 'Gastos', 'Ret.%', 'Ret.origen', 'Ret.Hacienda', 'Deducible', 'Neto €'].includes(h) ? 'right' : 'left'};color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;white-space:nowrap">${h}</th>`).join('')}
                    </tr></thead>
                    <tbody>${divTableRows}</tbody>
                    ${divRows.length ? `<tfoot><tr style="background:#f8fafc;font-weight:700">
                        <td colspan="7" style="padding:6px 7px">TOTAL</td>
                        <td style="padding:6px 7px;text-align:right">${fmtEUR(totDiv.bruto)}</td>
                        <td style="padding:6px 7px;text-align:right;color:#dc2626">${totDiv.gastos > 0 ? '−' + fmtEUR(totDiv.gastos) : '—'}</td>
                        <td></td>
                        <td style="padding:6px 7px;text-align:right;color:#dc2626">−${fmtEUR(totDiv.retOrEUR)}</td>
                        <td style="padding:6px 7px;text-align:right;color:#dc2626">−${fmtEUR(totDiv.retEspTotal)}</td>
                        <td style="padding:6px 7px;text-align:right;color:#059669">+${fmtEUR(totDiv.deducibleOrigen)}</td>
                        <td style="padding:6px 7px;text-align:right">${fmtEUR(totDiv.neto)}</td>
                    </tr></tfoot>` : ''}
                </table>
            </div>
            ${divRows.length ? `<div style="margin-top:14px;background:#eff6ff;border-radius:8px;padding:12px;font-size:11px">
                <div style="font-weight:700;color:#1d4ed8;margin-bottom:8px">📋 Casillas orientativas IRPF</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
                    ${[
                        ['Casilla 027', 'Dividendos íntegros (brutos)', fmtEUR(totDiv.bruto)],
                        ['Casilla 592', 'Retención soportada Hacienda', fmtEUR(totDiv.retEspTotal)],
                        ['Casilla 588', 'Deducción doble imposición internacional', fmtEUR(totDiv.deducibleOrigen)],
                    ].map(([c, l, v]) => `<div style="background:#fff;border-radius:6px;padding:8px 10px;border:1px solid #bfdbfe">
                        <div style="color:#1d4ed8;font-weight:700;font-size:10px">${c}</div>
                        <div style="color:#475569;font-size:10px;margin-bottom:2px">${l}</div>
                        <div style="color:#1e293b;font-weight:700">${v}</div>
                    </div>`).join('')}
                </div>
                <div style="margin-top:8px;color:#64748b;font-size:10px">ℹ️ Los números de casilla pueden variar según el modelo de Renta de cada año. Verifica con el borrador de la AEAT.</div>
            </div>` : ''}
        </div>

        <!-- Tabla de Ventas FIFO -->
        <div class="card" style="margin-bottom:16px">
            <h3 style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:4px">📈 Ganancias y pérdidas patrimoniales — Ventas en ${yearStr} (método FIFO)</h3>
            <div style="font-size:10px;color:#94a3b8;margin-bottom:12px">Detalle por operación: fechas de compra y venta, precios unitarios, comisiones de compra y venta, resultado neto</div>
            <div style="overflow-x:auto">
                <table style="width:100%;min-width:1000px;font-size:10px">
                    <thead><tr style="background:#f8fafc">
                        ${['Ticker', 'Empresa', 'ISIN', 'Acc.', 'F.compra', 'F.venta', 'Precio compra', 'Precio venta', 'Coste total', 'Com.compra', 'Venta total', 'Com.venta', 'Resultado'].map(h => `<th style="padding:6px 7px;text-align:${['Acc.', 'Precio compra', 'Precio venta', 'Coste total', 'Com.compra', 'Venta total', 'Com.venta', 'Resultado'].includes(h) ? 'right' : 'left'};color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;white-space:nowrap">${h}</th>`).join('')}
                    </tr></thead>
                    <tbody>${pvTableRows}</tbody>
                    ${pvRows.length ? `<tfoot><tr style="background:#f8fafc;font-weight:700">
                        <td colspan="8" style="padding:6px 7px">TOTAL</td>
                        <td style="padding:6px 7px;text-align:right">${fmtEUR(pvRows.reduce((s, r) => s + r.costeTotal, 0))}</td>
                        <td style="padding:6px 7px;text-align:right;color:#dc2626">−${fmtEUR(pvRows.reduce((s, r) => s + r.comisionCompra, 0))}</td>
                        <td style="padding:6px 7px;text-align:right">${fmtEUR(pvRows.reduce((s, r) => s + r.ventaTotal, 0))}</td>
                        <td style="padding:6px 7px;text-align:right;color:#dc2626">−${fmtEUR(pvRows.reduce((s, r) => s + r.comisionVenta, 0))}</td>
                        <td style="padding:6px 7px;text-align:right;color:${saldoNeto >= 0 ? '#059669' : '#dc2626'}">${saldoNeto >= 0 ? '+' : ''}${fmtEUR(saldoNeto)}</td>
                    </tr></tfoot>` : ''}
                </table>
            </div>
            ${pvRows.length ? `
            <div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">
                ${[
                    ['✅ Plusvalías', fmtEUR(plusvalias), '#059669', '#f0fdf4', '#bbf7d0'],
                    ['❌ Minusvalías', fmtEUR(Math.abs(minusvalias)), '#dc2626', '#fef2f2', '#fecaca'],
                    ['⚖️ Saldo neto', (saldoNeto >= 0 ? '+' : '') + fmtEUR(saldoNeto), saldoNeto >= 0 ? '#059669' : '#dc2626', '#f8fafc', '#e2e8f0'],
                ].map(([l, v, c, bg, border]) => `<div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:10px 12px">
                    <div style="font-size:10px;color:#64748b;font-weight:700;margin-bottom:3px">${l}</div>
                    <div style="font-size:15px;font-weight:800;color:${c}">${v}</div>
                </div>`).join('')}
            </div>
            <div style="margin-top:12px;background:#eff6ff;border-radius:8px;padding:12px;font-size:11px">
                <div style="font-weight:700;color:#1d4ed8;margin-bottom:8px">📋 Casillas orientativas IRPF — Ganancias y pérdidas patrimoniales</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
                    ${[
                        ['Casilla 1626', 'Valor de transmisión (ingresos)', fmtEUR(totPV.ingreso)],
                        ['Casilla 1627', 'Valor de adquisición (costes)', fmtEUR(totPV.coste)],
                        ['Casilla 1628', 'Ganancia / pérdida neta', (saldoNeto >= 0 ? '+' : '') + fmtEUR(saldoNeto)],
                    ].map(([c, l, v]) => `<div style="background:#fff;border-radius:6px;padding:8px 10px;border:1px solid #bfdbfe">
                        <div style="color:#1d4ed8;font-weight:700;font-size:10px">${c}</div>
                        <div style="color:#475569;font-size:10px;margin-bottom:2px">${l}</div>
                        <div style="color:#1e293b;font-weight:700">${v}</div>
                    </div>`).join('')}
                </div>
            </div>` : ''}
        </div>

        <!-- Resumen fiscal -->
        <div class="card" style="margin-bottom:16px;border:2px solid #7c3aed22">
            <h3 style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:12px">🧮 Resumen fiscal estimado — Base del ahorro ${yearStr}</h3>
            <div style="font-size:11px;color:#475569;line-height:2">
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #e2e8f0;padding:4px 0"><span>Dividendos brutos</span><span style="font-weight:700">${fmtEUR(totDiv.bruto)}</span></div>
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #e2e8f0;padding:4px 0"><span>Saldo neto plusvalías/minusvalías</span><span style="font-weight:700;color:${saldoNeto >= 0 ? '#059669' : '#dc2626'}">${saldoNeto >= 0 ? '+' : ''}${fmtEUR(saldoNeto)}</span></div>
                <div style="display:flex;justify-content:space-between;border-bottom:2px solid #7c3aed44;padding:4px 0;font-weight:700;color:#7c3aed"><span>Base imponible del ahorro</span><span>${fmtEUR(Math.max(0, baseAhorro))}</span></div>
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #e2e8f0;padding:4px 0"><span>Cuota íntegra estimada</span><span>${fmtEUR(cuotaBruta)}</span></div>
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #e2e8f0;padding:4px 0"><span>Retenciones Hacienda soportadas</span><span style="color:#dc2626">−${fmtEUR(totDiv.retEspNeta)}</span></div>
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #e2e8f0;padding:4px 0"><span>Deducción doble imposición (retención origen)</span><span style="color:#059669">−${fmtEUR(totDiv.deducibleOrigen)}</span></div>
                <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:800;font-size:13px;color:#1e293b"><span>Cuota diferencial estimada a ingresar</span><span style="color:${cuotaNeta > 0 ? '#dc2626' : '#059669'}">${cuotaNeta > 0 ? '' : '−'}${fmtEUR(Math.abs(cuotaNeta))}</span></div>
            </div>
            <div style="margin-top:8px;font-size:10px;color:#94a3b8">Tipo marginal aplicable estimado: ${tipoMarginalAhorro(baseAhorro)} · Tramos vigentes (Ley 35/2006 IRPF)</div>
        </div>

        <div style="background:#f8fafc;border-radius:10px;padding:14px;font-size:11px;color:#475569;line-height:1.7">
            <div style="font-weight:700;color:#1e293b;margin-bottom:6px">💡 Notas importantes para tu declaración</div>
            <ul style="margin:0;padding-left:16px">
                <li><strong>Método FIFO:</strong> en ventas parciales, el coste de adquisición se calcula consumiendo primero las compras más antiguas de cada ticker, tal como exige Hacienda.</li>
                <li><strong>Minusvalías:</strong> si tienes pérdidas en ${yearStr}, puedes compensarlas con plusvalías durante los <strong>4 ejercicios siguientes</strong>.</li>
                <li><strong>Doble imposición:</strong> la retención en origen pagada en el extranjero es deducible en España con el límite del convenio (generalmente 15%). El exceso no es recuperable vía IRPF.</li>
                <li><strong>Modelo D-6:</strong> si tienes acciones extranjeras por valor superior a 300.000€ debes presentar el modelo D-6 en enero.</li>
                <li><strong>Modelo 720:</strong> si el valor de los activos en el extranjero supera 50.000€, debes declararlo con el modelo 720.</li>
                <li><strong>Gastos de custodia:</strong> son deducibles de los rendimientos del capital mobiliario; regístralos al anotar el dividendo si tu bróker los cobra.</li>
            </ul>
        </div>
    </div>`;
}

// ── Exportar a Excel ──

export function exportRentaExcel(ejercicio) {
    const yearStr = String(ejercicio);
    const divEjercicio = state.dividends.filter(d => safeDateStr(d.date).startsWith(yearStr));

    const divRows = divEjercicio.map(d => {
        const pos = state.positions.find(p => p.ticker === d.ticker);
        const currency = d.currency || pos?.currency || 'EUR';
        const brutoLocal = +((d.amount || 0) * (d.shares || 0)).toFixed(2);
        const brutoEUR = +toEUR(brutoLocal, currency).toFixed(2);
        const retOr = retencionOrigenPct(d.ticker, currency);
        const retOrEUR = +(brutoEUR * retOr).toFixed(2);
        const retEsp = +(brutoEUR * 0.19).toFixed(2);
        const deducible = +(brutoEUR * Math.min(retOr, 0.15)).toFixed(2);
        const retEspNeta = +Math.max(0, retEsp - deducible).toFixed(2);
        return {
            'Tipo': 'Dividendo', 'Fecha': safeDateStr(d.date), 'Empresa': pos?.name || d.ticker,
            'Ticker': d.ticker, 'ISIN': pos?.isin || '', 'Unidades': d.shares,
            'Importe bruto (local)': brutoLocal, 'Divisa': currency,
            'Importe bruto (EUR)': brutoEUR, 'Gastos': d.fee || 0,
            'Retención origen (%)': +(retOr * 100).toFixed(1), 'Retención origen (€)': retOrEUR,
            'Retención Hacienda (€)': retEsp, 'Deducible doble imposición (€)': deducible,
            'Neto (€)': +(brutoEUR - retOrEUR - retEspNeta - (d.fee || 0)).toFixed(2)
        };
    });

    // Ventas FIFO
    const txByTicker = {};
    [...state.transactions].sort((a, b) => safeDateStr(a.date).localeCompare(safeDateStr(b.date))).forEach(t => {
        if (!txByTicker[t.ticker]) txByTicker[t.ticker] = [];
        txByTicker[t.ticker].push(t);
    });
    const ventaRows = [];
    Object.entries(txByTicker).forEach(([ticker, txs]) => {
        const pos = state.positions.find(p => p.ticker === ticker);
        const currency = pos?.currency || 'EUR';
        const lots = [];
        txs.forEach(t => {
            if (t.type === 'BUY') lots.push({ shares: t.shares, costUnit: t.price, date: t.date, fxRate: t.fx_rate && t.fx_rate !== 1 ? t.fx_rate : null, fee: t.commission || 0 });
            else if (t.type === 'SELL') {
                let toSell = t.shares;
                const used = [];
                while (toSell > 0 && lots.length > 0) {
                    const lot = lots[0];
                    const take = Math.min(lot.shares, toSell);
                    used.push({ shares: take, costUnit: lot.costUnit, date: lot.date, fxRate: lot.fxRate, fee: lot.fee * (take / lot.shares) });
                    lot.shares -= take;
                    toSell -= take;
                    if (lot.shares <= 0.00001) lots.shift();
                }
                if (safeDateStr(t.date).startsWith(yearStr) && used.length) {
                    const sellFx = t.fx_rate && t.fx_rate !== 1 ? t.fx_rate : null;
                    const ventaLocal = t.price * t.shares;
                    const ventaEUR = sellFx ? +(ventaLocal / sellFx).toFixed(2) : +toEUR(ventaLocal, currency).toFixed(2);
                    const comV = t.commission || 0;
                    const comVEUR = sellFx ? +(comV / sellFx).toFixed(2) : +toEUR(comV, currency).toFixed(2);
                    let costeEUR = 0,
                        comCEUR = 0;
                    const fechas = [];
                    used.forEach(u => {
                        const cl = u.costUnit * u.shares;
                        costeEUR += u.fxRate ? cl / u.fxRate : toEUR(cl, currency);
                        comCEUR += u.fxRate ? (u.fee / u.fxRate) : toEUR(u.fee, currency);
                        fechas.push(safeDateStr(u.date));
                    });
                    ventaRows.push({
                        'Tipo': 'Venta', 'Fecha compra': fechas.join(' + '), 'Fecha venta': safeDateStr(t.date),
                        'Empresa': pos?.name || ticker, 'Ticker': ticker, 'ISIN': pos?.isin || '',
                        'Unidades': t.shares, 'Precio compra medio': +(costeEUR / t.shares).toFixed(4),
                        'Precio venta': t.price, 'Coste total (EUR)': +costeEUR.toFixed(2),
                        'Comisión compra (EUR)': +comCEUR.toFixed(2), 'Importe venta (EUR)': ventaEUR,
                        'Comisión venta (EUR)': comVEUR,
                        'Resultado (EUR)': +((ventaEUR - comVEUR) - (costeEUR + comCEUR)).toFixed(2),
                        'Divisa': currency, 'Broker': t.broker || '', 'Nº lotes FIFO': used.length
                    });
                }
            }
        });
    });

    try {
        const wb = XLSX.utils.book_new();
        const wsDiv = XLSX.utils.json_to_sheet(divRows.length ? divRows : [{ 'Info': 'Sin dividendos en ' + yearStr }]);
        XLSX.utils.book_append_sheet(wb, wsDiv, 'Dividendos');
        const wsVenta = XLSX.utils.json_to_sheet(ventaRows.length ? ventaRows : [{ 'Info': 'Sin ventas en ' + yearStr }]);
        XLSX.utils.book_append_sheet(wb, wsVenta, 'Ventas FIFO');
        XLSX.writeFile(wb, `Informe_Fiscal_${yearStr}.xlsx`);
    } catch (e) {
        console.error('Error exportando Excel:', e);
        alert('No se pudo generar el Excel: ' + (e?.message || e));
    }
}