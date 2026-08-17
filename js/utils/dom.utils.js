/**
 * Funciones de utilidad para DOM y modales
 */

import { state } from '../config/state.js';
import { fetchYahooSearch } from '../services/yahoo.service.js';

// Modal
export function openModal(html) {
    document.getElementById('modal-box').innerHTML = html;
    document.getElementById('modal-overlay').style.display = 'flex';
}

export function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

// Autocomplete para tickers
let acTimeout = null;
let acResults = [];
let acIdx = -1;

function closeAcList(inputId) {
    const list = document.getElementById('ac-list-' + inputId);
    if (list) list.remove();
    acIdx = -1;
}

function highlightAc(inputId) {
    const items = document.querySelectorAll(`#ac-list-${inputId} .ac-item`);
    items.forEach((el, i) => el.classList.toggle('selected', i === acIdx));
}

function selectAc(inputId, idx, onSelect) {
    const r = acResults[idx];
    if (!r) return;
    const input = document.getElementById(inputId);
    if (input) input.value = r.ticker;
    closeAcList(inputId);
    if (onSelect) onSelect(r);
}

async function doSearch(q, inputId, onSelect) {
    const results = await fetchYahooSearch(q);
    acResults = results;
    acIdx = -1;
    const existing = document.getElementById('ac-list-' + inputId);
    if (existing) existing.remove();
    if (!results.length) return;

    const input = document.getElementById(inputId);
    if (!input) return;

    const list = document.createElement('div');
    list.id = 'ac-list-' + inputId;
    list.className = 'ac-list';
    results.forEach((r, i) => {
        const item = document.createElement('div');
        item.className = 'ac-item';
        item.innerHTML = `<span class="ac-ticker">${esc(r.ticker)}</span><span class="ac-name">${esc(r.name)}</span><span class="ac-exch">${esc(r.exchange)}</span>`;
        item.addEventListener('mousedown', e => { e.preventDefault(); selectAc(inputId, i, onSelect); });
        list.appendChild(item);
    });
    input.parentElement.appendChild(list);
}

export function setupAutocomplete(inputId, onSelect) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const wrap = input.parentElement;
    wrap.style.position = 'relative';

    input.addEventListener('input', () => {
        clearTimeout(acTimeout);
        const q = input.value.trim();
        closeAcList(inputId);
        if (q.length < 2) return;
        acTimeout = setTimeout(() => doSearch(q, inputId, onSelect), 350);
    });

    input.addEventListener('keydown', e => {
        const list = document.getElementById('ac-list-' + inputId);
        if (!list) return;
        if (e.key === 'ArrowDown') { acIdx = Math.min(acIdx + 1, acResults.length - 1); highlightAc(inputId); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { acIdx = Math.max(acIdx - 1, 0); highlightAc(inputId); e.preventDefault(); }
        else if (e.key === 'Enter' && acIdx >= 0) { selectAc(inputId, acIdx, onSelect); e.preventDefault(); }
        else if (e.key === 'Escape') closeAcList(inputId);
    });

    document.addEventListener('click', e => { if (!wrap.contains(e.target)) closeAcList(inputId); }, { once: false });
}

// Tooltip para gráficos de dividendos
export function divChartTip(e, wrapId, text) {
    const tip = document.getElementById('div-chart-tip');
    const wrap = document.getElementById(wrapId);
    if (!tip || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    tip.textContent = text;
    tip.style.display = 'block';
    const cx = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const cy = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;
    tip.style.left = Math.min(Math.max(0, cx + 8), rect.width - 150) + 'px';
    tip.style.top = Math.max(0, cy - 32) + 'px';
}

export function divChartTipHide() {
    const tip = document.getElementById('div-chart-tip');
    if (tip) tip.style.display = 'none';
}