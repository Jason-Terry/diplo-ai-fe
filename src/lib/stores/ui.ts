import { writable } from 'svelte/store';

export type Theme = 'dark' | 'parchment';

function loadTheme(): Theme {
    if (typeof localStorage === 'undefined') return 'dark';
    return (localStorage.getItem('theme') as Theme) || 'dark';
}

export const theme = writable<Theme>(loadTheme());

theme.subscribe((t) => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', t);
    if (typeof localStorage !== 'undefined') localStorage.setItem('theme', t);
});

export const loginModalOpen = writable(false);
export const signupModalOpen = writable(false);
export const aboutModalOpen = writable(false);
export const setupModalOpen = writable(false);

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
