/**
 * Servicio de conexión y operaciones con Supabase
 */

import { state, save, normalizeAllDates, safeDateStr } from '../config/state.js';

// Inicializar cliente Supabase
const SUPABASE_URL = 'https://qoezxfuxzrtzexzzplfz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_e99iPLwtmEpykURcsz63Xg_cEvzX5yR';
export const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Traducción de mensajes de error
export function translateAuthError(msg) {
    const m = String(msg || '');
    const map = [
        [/password should be at least (\d+) characters/i, (a) => `La contraseña debe tener al menos ${a[1]} caracteres`],
        [/invalid login credentials/i, 'Correo o contraseña incorrectos'],
        [/user already registered/i, 'Ya existe una cuenta con ese correo'],
        [/email not confirmed/i, 'Debes confirmar tu correo electrónico antes de iniciar sesión'],
        [/invalid email/i, 'El correo electrónico no es válido'],
        [/load failed|network error|failed to fetch|networkerror when attempting to fetch/i, 'No se pudo conectar con el servidor. Comprueba tu conexión a internet e inténtalo de nuevo.'],
        [/rate limit/i, 'Demasiados intentos. Espera un momento y vuelve a intentarlo'],
    ];
    for (const [re, replacement] of map) {
        const match = m.match(re);
        if (match) return typeof replacement === 'function' ? replacement(match) : replacement;
    }
    return m;
}

export function formatSupabaseError(error) {
    if (!error) return 'Error desconocido';
    const translated = translateAuthError(error.message);
    const extra = [];
    if (error.status) extra.push(`HTTP ${error.status}`);
    if (error.code) extra.push(`código: ${error.code}`);
    let out = translated + (extra.length ? ` (${extra.join(', ')})` : '');
    if (!translated || translated.trim().length < 3 || translated.trim() === '{}') {
        try { out += '\n\nDetalle técnico: ' + JSON.stringify(error); } catch(e) { out += '\n\nDetalle técnico no disponible'; }
    }
    return out;
}

export function isRetryableAuthError(error) {
    if (!error) return false;
    if (error.name === 'AuthRetryableFetchError') return true;
    if ([502, 503, 504].includes(error.status)) return true;
    if (/timeout|gateway/i.test(error.message || '')) return true;
    return false;
}

export async function withAuthRetry(fn, { retries = 2, delayMs = 1500, onRetry } = {}) {
    let result;
    for (let attempt = 0; attempt <= retries; attempt++) {
        result = await fn();
        if (!result.error || !isRetryableAuthError(result.error)) return result;
        if (attempt < retries) {
            onRetry?.(attempt + 1, retries);
            await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
        }
    }
    return result;
}

export async function loadCloudData() {
    if (!state.authUserId) return;
    try {
        const { data, error } = await supabaseClient
            .from('portfolios')
            .select('*')
            .eq('user_id', state.authUserId)
            .maybeSingle();

        if (error) {
            console.error('Error cargando cartera desde la nube:', error);
            return;
        }

        if (data) {
            state.positions = data.positions || [];
            state.alerts = data.alerts || [];
            state.dividends = data.dividends || [];
            state.dividendCashUsed = data.dividend_cash_used || [];
            state.goalConfig = data.goal_config || state.goalConfig;
            state.transactions = data.transactions || [];
            normalizeAllDates();
            save();
        } else {
            await saveCloud();
        }
    } catch(e) {
        console.error('Error cargando cartera:', e);
    }
}

export async function saveCloud() {
    if (!state.authUserId) return;
    const dividendsToSave = (state.dividends || []).map(d => ({
        ...d,
        date: d.date instanceof Date ? d.date.toISOString() : (d.date || new Date().toISOString())
    }));
    const payload = {
        user_id: state.authUserId,
        positions: state.positions,
        alerts: state.alerts,
        dividends: dividendsToSave,
        dividend_cash_used: state.dividendCashUsed,
        goal_config: state.goalConfig,
        transactions: state.transactions,
        updated_at: new Date().toISOString()
    };
    try {
        const { error } = await supabaseClient.from('portfolios').upsert(payload, { onConflict: 'user_id' });
        if (error) {
            const missingColMatch = /column .*"?([a-z_]+)"?.* does not exist/i.exec(error.message || '');
            if (missingColMatch) {
                console.warn(`saveCloud: falta la columna ${missingColMatch[1]} en Supabase, guardando el resto sin ella.`);
                const rest = { ...payload };
                delete rest[missingColMatch[1]];
                const { error: error2 } = await supabaseClient.from('portfolios').upsert(rest, { onConflict: 'user_id' });
                if (error2) console.error('Error guardando cartera en la nube:', error2);
            } else {
                console.error('Error guardando cartera en la nube:', error);
            }
        }
    } catch(e) { console.error('Error guardando cartera en la nube:', e); }
}