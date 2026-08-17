/**
 * Componente Objetivos - Renderiza y gestiona objetivos financieros
 */

import { state, save } from '../config/state.js';
import { posValEUR, posInvEUR, fmtEUR } from '../utils/helpers.js';

export function renderGoals() {
    const gc = state.goalConfig || {};
    const curVal = state.positions.reduce((s, p) => s + posValEUR(p), 0);
    const goal = parseFloat((document.getElementById('g-goal') || {}).value ?? gc.goal ?? 100000);
    const pg = parseFloat((document.getElementById('g-pg') || {}).value ?? gc.pg ?? 7);
    const dg = parseFloat((document.getElementById('g-dg') || {}).value ?? gc.dg ?? 3);
    const contrib = parseFloat((document.getElementById('g-contrib') || {}).value ?? gc.contrib ?? 5000);
    const yrs = parseInt((document.getElementById('g-yrs') || {}).value ?? gc.yrs ?? 10);
    const dy = parseFloat((document.getElementById('g-dy') || {}).value ?? gc.dy ?? 4);
    const reinvest = (document.getElementById('g-reinvest') || { checked: gc.reinvest !== false }).checked;
    const pct = goal > 0 ? Math.min(curVal / goal * 100, 100) : 0;
    const bc = pct >= 100 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#3b82f6';
    const projTable = state._projData ? `<div style="overflow-x:auto"><table style="min-width:500px">
        <thead><tr>${['Año', 'Valor total', 'Capital aportado', 'Divid. acumulados', 'Objetivo'].map(h => `<th style="text-align:right">${h}</th>`).join('')}</tr></thead>
        <tbody>${state._projData.map((r, i) => `<tr>
            <td style="text-align:right;color:#64748b">${r.y === 0 ? 'Hoy' : 'Año ' + r.y}</td>
            <td style="text-align:right;font-weight:700;color:${r.total >= r.goal ? '#16a34a' : '#1e293b'}">${fmtEUR(r.total)}</td>
            <td style="text-align:right;color:#64748b">${fmtEUR(r.aport)}</td>
            <td style="text-align:right;color:#b45309">${fmtEUR(r.divAcc)}</td>
            <td style="text-align:right;color:#ef4444">${fmtEUR(r.goal)}</td>
        </tr>`).join('')}</tbody>
    </table></div>` : `<div style="text-align:center;color:#94a3b8;padding:24px;font-size:13px">Configura los parámetros y haz clic en Calcular</div>`;

    return `<div style="padding:14px;display:flex;flex-direction:column;gap:14px">
        <div style="display:grid;grid-template-columns:minmax(280px,300px) 1fr;gap:12px">
            <div class="card">
                <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:12px">🎯 Objetivo de cartera</h4>
                <div class="field"><label>Objetivo (€)</label><input id="g-goal" type="number" class="inp" value="${goal}" min="0" step="1000" oninput="window.saveGoalConfig();window.renderActiveTab()"></div>
                <div style="font-size:11px;color:#64748b;margin-top:8px">${pct < 100 ? `Faltan ${fmtEUR(Math.max(goal - curVal, 0))} para el objetivo` : '✅ ¡Objetivo alcanzado!'}</div>
            </div>
            <div class="card" style="display:flex;flex-direction:column;justify-content:center">
                <div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:10px">Valor actual: ${fmtEUR(curVal)}  ·  Objetivo: ${fmtEUR(goal)}  ·  Progreso: ${pct.toFixed(2)}%</div>
                <div class="progress-bar-wrap"><div class="progress-bar-fill" style="background:${bc};width:${pct.toFixed(1)}%"></div><div class="progress-bar-label">${pct.toFixed(1)}%</div></div>
            </div>
        </div>
        <div class="card">
            <h4 style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:12px">📈 Proyección de cartera</h4>
            <div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px;align-items:flex-end">
                ${[
                    ['Crec. div. (%/año)', 'g-dg', dg, 0, 30],
                    ['Revalor. (%/año)', 'g-pg', pg, 0, 30],
                    ['Aport. anual (€)', 'g-contrib', contrib, 0, 500000],
                    ['Años', 'g-yrs', yrs, 1, 50],
                    ['Yield div. (%)', 'g-dy', dy, 0, 30]
                ].map(([lbl, id, val, mn, mx]) => `
                    <div><div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:4px">${lbl}</div>
                    <input type="number" id="${id}" class="inp-sm" value="${val}" min="${mn}" max="${mx}" style="width:100px"></div>`).join('')}
                <label style="font-size:11px;color:#475569;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px">
                    <input type="checkbox" id="g-reinvest" ${reinvest ? 'checked' : ''} style="width:13px;height:13px"> Reinvertir dividendos
                </label>
                <button class="btn" onclick="window.calcProjection()">📊 Calcular</button>
            </div>
            ${projTable}
        </div>
    </div>`;
}

export function saveGoalConfig() {
    state.goalConfig = {
        goal: parseFloat(document.getElementById('g-goal')?.value || 100000),
        pg: parseFloat(document.getElementById('g-pg')?.value ?? state.goalConfig?.pg ?? 7),
        dg: parseFloat(document.getElementById('g-dg')?.value ?? state.goalConfig?.dg ?? 3),
        contrib: parseFloat(document.getElementById('g-contrib')?.value ?? state.goalConfig?.contrib ?? 5000),
        yrs: parseInt(document.getElementById('g-yrs')?.value ?? state.goalConfig?.yrs ?? 10),
        dy: parseFloat(document.getElementById('g-dy')?.value ?? state.goalConfig?.dy ?? 4),
        reinvest: document.getElementById('g-reinvest')?.checked !== false
    };
    save();
}

export function calcProjection() {
    saveGoalConfig();
    const goal = parseFloat(document.getElementById('g-goal')?.value || 100000);
    const pg = parseFloat(document.getElementById('g-pg')?.value || 7) / 100;
    const dg = parseFloat(document.getElementById('g-dg')?.value || 3) / 100;
    const contrib = parseFloat(document.getElementById('g-contrib')?.value || 5000);
    const yrs = parseInt(document.getElementById('g-yrs')?.value || 10);
    const dy = parseFloat(document.getElementById('g-dy')?.value || 4) / 100;
    const reinvest = document.getElementById('g-reinvest')?.checked !== false;
    const curVal = state.positions.reduce((s, p) => s + posValEUR(p), 0);
    let v = curVal,
        da = 0,
        rows = [{ y: 0, total: v, aport: v, divAcc: 0, goal }];
    for (let y = 1; y <= yrs; y++) {
        const ann = v * dy;
        da += ann * (1 + dg * y);
        v = reinvest ? v * (1 + pg) + (ann * (1 + dg * y)) : v * (1 + pg);
        v += contrib;
        rows.push({ y, total: v, aport: curVal + contrib * y, divAcc: da, goal });
    }
    state._projData = rows;
    import('./tabs.js').then(m => m.renderActiveTab());
}