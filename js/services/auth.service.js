/**
 * Servicio de autenticación: login, registro, Google, logout
 */

import { state } from '../config/state.js';
import { supabaseClient, withAuthRetry, formatSupabaseError, loadCloudData } from './supabase.service.js';
import { updateLoginStatus } from '../app.js';
import { buildDivInfo, renderHeader } from '../components/header.js';
import { renderTabs, renderActiveTab } from '../components/tabs.js';

export async function doRegister() {
    const email = document.getElementById('login-user')?.value.trim().toLowerCase();
    const password = document.getElementById('login-pass')?.value;

    if (!email || !password) {
        alert('Introduce email y contraseña');
        return;
    }
    if (password.length < 6) {
        alert('La contraseña debe tener al menos 6 caracteres');
        return;
    }

    const btn = document.querySelector('button[onclick="window.doRegister()"]');
    const btnLabel = btn?.textContent;
    if (btn) btn.disabled = true;

    try {
        const { data, error } = await withAuthRetry(
            () => supabaseClient.auth.signUp({ email, password }),
            { onRetry: (n, total) => { if (btn) btn.textContent = `Reintentando (${n}/${total})...`; } }
        );

        if (error) {
            console.error('doRegister: error de Supabase →', error);
            alert('Error al crear la cuenta: ' + formatSupabaseError(error));
            return;
        }

        if (data.session) {
            state.authUser = data.user?.email || null;
            state.authUserId = data.user?.id || null;
            updateLoginStatus();
        } else {
            alert('Cuenta creada. Revisa tu correo electrónico para confirmar la cuenta y luego inicia sesión.');
        }
    } catch (e) {
        console.error('doRegister: excepción no controlada →', e);
        alert('Fallo de conexión al crear la cuenta: ' + (e?.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
    }
}

export async function doLoginGoogle() {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.href.split('#')[0].split('?')[0] }
        });
        if (error) {
            console.error('doLoginGoogle: error de Supabase →', error);
            alert('Error al iniciar sesión con Google: ' + formatSupabaseError(error));
        }
    } catch (e) {
        console.error('doLoginGoogle: excepción no controlada →', e);
        alert('Fallo de conexión al iniciar sesión con Google: ' + (e?.message || e));
    }
}

// Detectar sesión al volver del redirect de Google
if (typeof supabaseClient !== "undefined" && supabaseClient?.auth?.onAuthStateChange) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
            state.authUser = session.user.email || null;
            state.authUserId = session.user.id || null;
            updateLoginStatus();
        }
    });
}

export async function doLogin() {
    const email = document.getElementById('login-user')?.value.trim().toLowerCase();
    const password = document.getElementById('login-pass')?.value;

    if (!email || !password) {
        alert('Introduce email y contraseña');
        return;
    }

    const btn = document.querySelector('button[onclick="window.doLogin()"]');
    const btnLabel = btn?.textContent;
    if (btn) btn.disabled = true;

    try {
        const { data, error } = await withAuthRetry(
            () => supabaseClient.auth.signInWithPassword({ email, password }),
            { onRetry: (n, total) => { if (btn) btn.textContent = `Reintentando (${n}/${total})...`; } }
        );

        if (error) {
            console.error('doLogin: error de Supabase →', error);
            alert('Error al iniciar sesión: ' + formatSupabaseError(error));
            return;
        }

        state.authUser = data.user?.email || null;
        state.authUserId = data.user?.id || null;
        updateLoginStatus();
    } catch (e) {
        console.error('doLogin: excepción no controlada →', e);
        alert('Fallo de conexión al iniciar sesión: ' + (e?.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
    }
}

export async function doLogout() {
    await supabaseClient.auth.signOut();
    state.authUser = null;
    state.authUserId = null;
    state._appStarted = false;
    state.positions = [];
    state.alerts = [];
    state.dividends = [];
    state.dividendCashUsed = [];
    state.transactions = [];
    state.priceCache = {};
    state.selectedTicker = null;
    updateLoginStatus();
}

export async function loadMe() {
    const { data } = await supabaseClient.auth.getUser();
    const user = data?.user || null;
    state.authUser = user?.email || null;
    state.authUserId = user?.id || null;
    updateLoginStatus();
}

export async function checkPlanAccess() {
    if (!state.authUserId) return false;
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', state.authUserId).maybeSingle();

    if (error) {
        console.error('checkPlanAccess: error leyendo profiles →', error.message, error);
        alert('No se pudo comprobar tu plan (' + error.message + '). Revisa la consola y los permisos (RLS) de la tabla "profiles" en Supabase.');
        return false;
    }

    let row = data;
    if (!row) {
        const now = new Date();
        const trial_end = new Date(now.getTime() + 7 * 86400000).toISOString();
        const newProfile = { id: state.authUserId, email: state.authUser, plan: 'free', status: 'trial', trial_start: now.toISOString(), trial_end, max_positions: 5 };
        const { error: upErr } = await supabaseClient.from('profiles').upsert(newProfile);
        if (upErr) {
            console.error('checkPlanAccess: error creando profile →', upErr.message, upErr);
            alert('No se pudo crear tu perfil (' + upErr.message + '). Revisa los permisos (RLS) de la tabla "profiles" en Supabase.');
            return false;
        }
        row = newProfile;
    }

    const plan = row.plan || 'free';
    const trialActive = plan === 'free' && row.trial_end && new Date(row.trial_end) > new Date();
    if (plan === 'premium') { state.planMaxPositions = Infinity; return true; }
    if (plan === 'pro') { state.planMaxPositions = 15; return true; }
    if (trialActive) { state.planMaxPositions = 5; return true; }

    location.href = 'index.html';
    return false;
}