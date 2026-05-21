<script lang="ts">
    import { loginModalOpen, signupModalOpen, pushToast } from '$lib/stores/ui';
    import { user } from '$lib/stores/user';
    import { authLogin } from '$lib/api';
    import { X } from 'lucide-svelte';

    let email = $state('');
    let password = $state('');
    let error = $state('');
    let submitting = $state(false);

    async function submit() {
        if (submitting) return;
        error = '';
        submitting = true;
        try {
            const u = await authLogin(email, password);
            user.set(u);
            loginModalOpen.set(false);
            email = '';
            password = '';
            pushToast('success', `Welcome back, ${u.first_name}.`);
        } catch (e: any) {
            error = e?.message || 'Sign-in failed';
        } finally {
            submitting = false;
        }
    }

    function close() {
        loginModalOpen.set(false);
        error = '';
    }

    function switchToSignup() {
        loginModalOpen.set(false);
        signupModalOpen.set(true);
    }
</script>

{#if $loginModalOpen}
    <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        tabindex="-1"
        onclick={(e) => {
            if (e.target === e.currentTarget) close();
        }}
        onkeydown={(e) => {
            if (e.key === 'Escape') close();
        }}
    >
        <div class="modal-panel">
            <button
                class="absolute top-3 right-3 text-fg-muted hover:text-fg"
                onclick={close}
                aria-label="Close"
            >
                <X size={20} />
            </button>
            <h2 id="login-title" class="text-xl font-bold mb-4">Sign in</h2>
            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
                class="flex flex-col gap-3"
            >
                <div>
                    <label class="field-label" for="login-email">Email</label>
                    <input
                        id="login-email"
                        class="field-input"
                        type="email"
                        autocomplete="email"
                        bind:value={email}
                        required
                    />
                </div>
                <div>
                    <label class="field-label" for="login-pw">Password</label>
                    <input
                        id="login-pw"
                        class="field-input"
                        type="password"
                        autocomplete="current-password"
                        bind:value={password}
                        required
                    />
                </div>
                {#if error}
                    <div class="text-danger text-sm">{error}</div>
                {/if}
                <div class="flex justify-between items-center mt-2">
                    <button type="button" class="text-sm text-fg-muted hover:text-fg" onclick={switchToSignup}>
                        Need an account?
                    </button>
                    <button class="btn-primary" disabled={submitting}>
                        {submitting ? 'Signing in…' : 'Sign in'}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
