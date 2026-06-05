import { writable } from 'svelte/store';

export type Theme = 'dark' | 'parchment';

function loadTheme(): Theme {
    if (typeof localStorage === 'undefined') return 'parchment';
    return (localStorage.getItem('theme') as Theme) || 'parchment';
}

export const theme = writable<Theme>(loadTheme());

theme.subscribe((t) => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', t);
    if (typeof localStorage !== 'undefined') localStorage.setItem('theme', t);
});

// Map vs Dialog layout — wide map column or wide feed column.
export type LayoutMode = 'map' | 'dialog';

function loadLayoutMode(): LayoutMode {
    if (typeof localStorage === 'undefined') return 'map';
    return (localStorage.getItem('layoutMode') as LayoutMode) || 'map';
}

export const layoutMode = writable<LayoutMode>(loadLayoutMode());

layoutMode.subscribe((m) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('layoutMode', m);
});

export const loginModalOpen = writable(false);
export const signupModalOpen = writable(false);
export const aboutModalOpen = writable(false);
export const setupModalOpen = writable(false);
export const forgotPasswordModalOpen = writable(false);
// Holds the reset token while the user is choosing a new password; null
// means the reset modal is closed. Populated from a `?reset=<token>` URL
// param on layout mount.
export const resetPasswordToken = writable<string | null>(null);

export interface Toast {
    id: number;
    kind: 'info' | 'success' | 'error';
    text: string;
}

const toastSeq = { n: 0 };
export const toasts = writable<Toast[]>([]);

export function pushToast(kind: Toast['kind'], text: string, ttlMs = 4000): void {
    const id = ++toastSeq.n;
    toasts.update((t) => [...t, { id, kind, text }]);
    setTimeout(() => {
        toasts.update((t) => t.filter((x) => x.id !== id));
    }, ttlMs);
}
