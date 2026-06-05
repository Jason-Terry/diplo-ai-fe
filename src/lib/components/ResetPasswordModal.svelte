<script lang="ts">
    import { resetPasswordToken, pushToast } from '$lib/stores/ui';
    import { user } from '$lib/stores/user';
    import { authResetPassword, ApiError } from '$lib/api';
    import { X } from 'lucide-svelte';

    let password = $state('');
    let confirm = $state('');
    let error = $state('');
    let submitting = $state(false);

    let mismatch = $derived(password.length > 0 && confirm.length > 0 && password !== confirm);
    let tooShort = $derived(password.length > 0 && password.length < 8);

    async function submit() {
        if (submitting) return;
        error = '';
        if (password !== confirm) {
            error = 'Passwords do not match.';
            return;
        }
        if (password.length < 8) {
            error = 'Password must be at least 8 characters.';
            return;
        }
        const token = $resetPasswordToken;
        if (!token) {
            error = 'Missing reset token.';
            return;
        }
        submitting = true;
        try {
            const u = await authResetPassword(token, password);
            user.set(u);
            close();
            pushToast('success', `Password updated. You're signed in.`);
        } catch (e: any) {
            if (e instanceof ApiError) {
                error = e.message || 'Reset failed';
            } else {
                error = e?.message || 'Reset failed';
            }
        } finally {
            submitting = false;
        }
    }

    function close() {
        resetPasswordToken.set(null);
        password = '';
        confirm = '';
        error = '';
        // Drop the ?reset= param from the URL so a refresh doesn't reopen.
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('reset');
            window.history.replaceState({}, '', url.toString());
        }
    }
</script>

{#if $resetPasswordToken}
    <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        tabindex="-1"
        onclick={(e) => { if (e.target === e.currentTarget) close(); }}
        onkeydown={(e) => { if (e.key === 'Escape') close(); }}
    >
        <div class="modal-panel">
            <button class="modal-close" onclick={close} aria-label="Close">
                <X size={20} />
            </button>
            <h2 id="reset-title">Choose a new password</h2>
            <p class="modal-sub">Pick something at least 8 characters long.</p>
            <form
                onsubmit={(e) => { e.preventDefault(); submit(); }}
                style="display: flex; flex-direction: column; gap: 12px;"
            >
                <div>
                    <label class="field-label" for="reset-pw">New password</label>
                    <input
                        id="reset-pw"
                        class="field-input"
                        type="password"
                        autocomplete="new-password"
                        bind:value={password}
                        required
                        minlength="8"
                    />
                    {#if tooShort}
                        <div style="color: var(--color-fg-muted); font-size: 0.78rem; margin-top: 4px;">
                            Needs at least 8 characters.
                        </div>
                    {/if}
                </div>
                <div>
                    <label class="field-label" for="reset-confirm">Confirm password</label>
                    <input
                        id="reset-confirm"
                        class="field-input"
                        type="password"
                        autocomplete="new-password"
                        bind:value={confirm}
                        required
                    />
                    {#if mismatch}
                        <div style="color: var(--color-danger); font-size: 0.78rem; margin-top: 4px;">
                            Passwords don't match.
                        </div>
                    {/if}
                </div>
                {#if error}
                    <div style="color: var(--color-danger); font-size: 0.85rem;">{error}</div>
                {/if}
                <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
                    <button type="button" class="btn-ghost" onclick={close}>Cancel</button>
                    <button class="btn-primary" disabled={submitting || mismatch || tooShort}>
                        {submitting ? 'Updating…' : 'Update password'}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
