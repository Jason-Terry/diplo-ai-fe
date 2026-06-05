// Build-time env (Vite inlines import.meta.env.VITE_* at build).
// Local dev (deno task dev) defaults to localhost:8421 when unset.

export const API_BASE_URL: string =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:8421';

export const WS_BASE: string =
    import.meta.env.VITE_WS_BASE || 'ws://localhost:8421';
