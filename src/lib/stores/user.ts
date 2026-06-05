import { writable } from 'svelte/store';
import { authMe, ApiError } from '../api';
import type { User } from '../types';

export const user = writable<User | null>(null);
export const userLoaded = writable(false);

/** Called once on app boot. 401 just means "not signed in", which is fine. */
export async function bootAuth(): Promise<void> {
    try {
        const me = await authMe();
        user.set(me);
    } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401) {
            console.error('authMe failed:', e);
        }
        user.set(null);
    } finally {
        userLoaded.set(true);
    }
}
