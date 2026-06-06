<script lang="ts">
    import { forgotPasswordModalOpen, loginModalOpen, pushToast } from '$lib/stores/ui';
    import { authForgotPassword } from '$lib/api';
    import { X } from 'lucide-svelte';

    let email = $state('');
    let error = $state('');
    let submitting = $state(false);

    async function submit() {
        if (submitting) return;
        error = '';
        submitting = true;
        try {
            await authForgotPassword(email);
            forgotPasswordModalOpen.set(false);
            email = '';
            // BE returns success even for unknown emails so we always show the
            // same neutral message — no email-enumeration leak.
            pushToast(
                'success',
                'If that email is registered, the reset link is on its way.',
                6000
            );
        } catch (e: any) {
            error = e?.message || 'Something went wrong';
        } finally {
            submitting = false;
        }
    }

    function close() {
        forgotPasswordModalOpen.set(false);
        error = '';
    }

    function backToLogin() {
        forgotPasswordModalOpen.set(false);
        loginModalOpen.set(true);
    }
</script>

{#if $forgotPasswordModalOpen}
    <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-title"
        tabindex="-1"
        onclick={(e) => { if (e.target === e.currentTarget) close(); }}
        onkeydown={(e) => { if (e.key === 'Escape') close(); }}
    >
        <div class="modal-panel">
            <button class="modal-close" onclick={close} aria-label="Close">
                <X size={20} />
            </button>
            <h2 id="forgot-title">Reset password</h2>
            <p class="modal-sub">
                We'll send you a link to choose a new password.
            </p>
            <form
                onsubmit={(e) => { e.preventDefault(); submit(); }}
                style="display: flex; flex-direction: column; gap: 12px;"
            >
                <div>
                    <label class="field-label" for="forgot-email">Email</label>
                    <input
                        id="forgot-email"
                        class="field-input"
                        type="email"
                        autocomplete="email"
                        bind:value={email}
                        required
                    />
                </div>
                {#if error}
                    <div style="color: var(--color-danger); font-size: 0.85rem;">{error}</div>
                {/if}
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                    <button type="button" class="about-link" onclick={backToLogin}>
                        Back to sign in
                    </button>
                    <button class="btn-primary" disabled={submitting}>
                        {submitting ? 'Sending…' : 'Send reset link'}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
