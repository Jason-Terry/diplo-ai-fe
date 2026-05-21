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

export function createGame(
    agentsConfig: Record<string, { provider: string; policy: string }>
): Promise<{ game_id: string; status: string }> {
    return api('/api/games', {
        method: 'POST',
        body: JSON.stringify({ agents_config: agentsConfig })
    });
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

// ---------- WebSocket ----------

export function gameSocket(gameId: string): WebSocket {
    return new WebSocket(`${WS_BASE}/ws/games/${gameId}`);
}
