import { API_BASE_URL, WS_BASE } from './config';
import type { GameState, GameSummary, User } from './types';

/** All authenticated API calls go through this wrapper so cookies travel. */
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
        ...init
    });
    if (!res.ok) {
        let detail: string;
        try {
            const body = await res.json();
            detail = body?.detail || res.statusText;
        } catch {
            detail = res.statusText;
        }
        throw new ApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// ---------- Games ----------

export function listGames(): Promise<{ games: GameSummary[] }> {
    return api('/api/games');
}

/** BYOK game-create — fire either by preset (free-trial uses the special
 *  `__free_trial__` preset_id) or by raw per-power slots. The BE rejects
 *  any slots that reference a model the user doesn't have a key for, or
 *  a persona id they don't own. */
export function createGame(
    body:
        | { preset_id: string }
        | { slots: Record<string, { model_id: string; persona_id: string }> }
): Promise<{ game_id: string; status: string }> {
    return api('/api/games', { method: 'POST', body: JSON.stringify(body) });
}

export function getGameState(gameId: string): Promise<GameState> {
    return api(`/api/games/${gameId}/state`);
}

export function runNegotiate(gameId: string): Promise<unknown> {
    return api(`/api/games/${gameId}/phase/negotiate`, { method: 'POST' });
}

export function runOrders(gameId: string): Promise<unknown> {
    return api(`/api/games/${gameId}/phase/orders`, { method: 'POST' });
}

export function runAdjudicate(gameId: string): Promise<unknown> {
    return api(`/api/games/${gameId}/phase/adjudicate`, { method: 'POST' });
}

/** Invalidate a broken free-trial game and spin up a fresh one with the
 *  same config. Counts against the user's refunds_used quota. The BE
 *  returns 429 once the quota is exhausted — surface that as the
 *  contact-us state in the modal. */
export function refundGame(gameId: string): Promise<{
    new_game_id: string;
    refunds_used: number;
    refunds_limit: number;
}> {
    return api(`/api/games/${gameId}/refund`, { method: 'POST' });
}

/** Owner-only: update visibility (private / shared / public). */
export function setGameVisibility(
    gameId: string,
    visibility: 'private' | 'shared' | 'public'
): Promise<{ game_id: string; visibility: string }> {
    return api(`/api/games/${gameId}/visibility`, {
        method: 'POST',
        body: JSON.stringify({ visibility })
    });
}

/** Logged-in users only: list of all public games. */
export function listPublicGames(): Promise<{ games: GameSummary[] }> {
    return api('/api/games/public');
}

// ---------- Policies ----------

export function listPolicies(): Promise<{
    policies: Record<string, { label: string; summary?: string }>;
    negotiation_rounds: number;
    calls_enabled: boolean;
}> {
    return api('/api/policies');
}

// ---------- Auth ----------

export function authMe(): Promise<User> {
    return api('/api/auth/me');
}

export function authLogin(email: string, password: string): Promise<User> {
    return api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
}

export function authRegister(body: {
    username: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
}): Promise<User> {
    return api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
}

export function authLogout(): Promise<{ ok: boolean }> {
    return api('/api/auth/logout', { method: 'POST' });
}

export function authResendVerification(): Promise<{ status: string }> {
    return api('/api/auth/resend-verification', { method: 'POST' });
}

export function authForgotPassword(email: string): Promise<{ status: string }> {
    return api('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
    });
}

export function authResetPassword(token: string, password: string): Promise<User> {
    return api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
    });
}

export function authUpdateProfile(patch: {
    first_name?: string;
    last_name?: string;
    username?: string;
}): Promise<User> {
    return api('/api/auth/me', { method: 'PUT', body: JSON.stringify(patch) });
}

export function authChangePassword(
    current_password: string,
    new_password: string
): Promise<User> {
    return api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password, new_password })
    });
}

/** Full-page navigation to the BE OAuth start endpoint. Returns nothing
 *  (we never come back to JS land — the BE 302s to GitHub). */
export function authGithubStartUrl(next: string = '/'): string {
    const q = new URLSearchParams({ next }).toString();
    return `${API_BASE_URL}/api/auth/github/start?${q}`;
}

// ---------- Account: catalog + API keys ----------

export interface CatalogProvider {
    id: string;
    label: string;
    models: Array<{ id: string; label: string; tier: string }>;
}
export interface CatalogModel {
    id: string;
    label: string;
    tier: string;
    provider: string;
    provider_label: string;
}
export interface Catalog {
    providers: CatalogProvider[];
    available_models: CatalogModel[];
}
export interface ApiKeyOut {
    id: string;
    provider: string;
    provider_label: string;
    label: string;
    last4: string;
    created_at: number;
    last_validated_at: number | null;
    valid: boolean | null;
}

export function getCatalog(): Promise<Catalog> {
    return api('/api/account/catalog');
}

export function listApiKeys(): Promise<ApiKeyOut[]> {
    return api('/api/account/api-keys');
}

export function addApiKey(provider: string, key: string, label?: string): Promise<ApiKeyOut> {
    return api('/api/account/api-keys', {
        method: 'POST',
        body: JSON.stringify({ provider, key, ...(label ? { label } : {}) })
    });
}

export function revalidateApiKey(id: string): Promise<ApiKeyOut> {
    return api(`/api/account/api-keys/${id}/validate`, { method: 'POST' });
}

export function deleteApiKey(id: string): Promise<void> {
    return api(`/api/account/api-keys/${id}`, { method: 'DELETE' });
}

// ---------- Account: personas ----------

export interface Persona {
    id: string;
    label: string;
    summary: string;
    rules: string[];
    created_at: number;
    updated_at: number;
}

export interface PersonaTemplate {
    id: string;
    label: string;
    summary: string;
    rules: string[];
}

export function listPersonaTemplates(): Promise<{ templates: PersonaTemplate[] }> {
    return api('/api/account/persona-templates');
}

export function listPersonas(): Promise<Persona[]> {
    return api('/api/account/personas');
}

export function createPersona(
    body: { label: string; summary?: string; rules?: string[] }
): Promise<Persona> {
    return api('/api/account/personas', {
        method: 'POST',
        body: JSON.stringify({
            label: body.label,
            summary: body.summary ?? '',
            rules: body.rules ?? []
        })
    });
}

export function updatePersona(
    id: string,
    body: { label: string; summary?: string; rules?: string[] }
): Promise<Persona> {
    return api(`/api/account/personas/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
            label: body.label,
            summary: body.summary ?? '',
            rules: body.rules ?? []
        })
    });
}

export function deletePersona(id: string): Promise<void> {
    return api(`/api/account/personas/${id}`, { method: 'DELETE' });
}

// ---------- Account: presets ----------

export const FREE_TRIAL_PRESET_ID = '__free_trial__';

export interface PresetSlot {
    model_id: string;
    persona_id: string;
}
export interface Preset {
    id: string;
    label: string;
    summary: string;
    slots: Record<string, PresetSlot>;
    created_at: number;
    is_free_trial: boolean;
    free_trial_used: boolean;
}

export function listPresets(): Promise<Preset[]> {
    return api('/api/account/presets');
}

export function createPreset(
    body: { label: string; summary?: string; slots: Record<string, PresetSlot> }
): Promise<Preset> {
    return api('/api/account/presets', {
        method: 'POST',
        body: JSON.stringify({
            label: body.label,
            summary: body.summary ?? '',
            slots: body.slots
        })
    });
}

export function updatePreset(
    id: string,
    body: { label: string; summary?: string; slots: Record<string, PresetSlot> }
): Promise<Preset> {
    return api(`/api/account/presets/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
            label: body.label,
            summary: body.summary ?? '',
            slots: body.slots
        })
    });
}

export function deletePreset(id: string): Promise<void> {
    return api(`/api/account/presets/${id}`, { method: 'DELETE' });
}

// ---------- WebSocket ----------

export function gameSocket(gameId: string): WebSocket {
    return new WebSocket(`${WS_BASE}/ws/games/${gameId}`);
}
