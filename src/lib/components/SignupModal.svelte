<script lang="ts">
    import { loginModalOpen, signupModalOpen, pushToast } from '$lib/stores/ui';
    import { user } from '$lib/stores/user';
    import { authRegister } from '$lib/api';
    import { X } from 'lucide-svelte';

    let first_name = $state('');
    let last_name = $state('');
    let username = $state('');
    let email = $state('');
    let password = $state('');
    let error = $state('');
    let submitting = $state(false);

    async function submit() {
        if (submitting) return;
        error = '';
        submitting = true;
        try {
            const u = await authRegister({ first_name, last_name, username, email, password });
            user.set(u);
            signupModalOpen.set(false);
            first_name = last_name = username = email = password = '';
            pushToast('success', 'Account created. Check your email to verify.');
        } catch (e: any) {
            error = e?.message || 'Sign-up failed';
        } finally {
            submitting = false;
        }
    }

    function close() {
        signupModalOpen.set(false);
        error = '';
    }

    function switchToLogin() {
        signupModalOpen.set(false);
        loginModalOpen.set(true);
    }
</script>

{#if $signupModalOpen}
    <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
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
            <h2 class="text-xl font-bold mb-2">Create an account</h2>
            <p class="text-sm text-fg-muted mb-4">
                We'll send you a verification link before you can start games.
            </p>
            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
                class="flex flex-col gap-3"
            >
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="field-label" for="su-fn">First name</label>
                        <input
                            id="su-fn"
                            class="field-input"
                            autocomplete="given-name"
                            bind:value={first_name}
                            required
                        />
                    </div>
                    <div>
                        <label class="field-label" for="su-ln">Last name</label>
                        <input
                            id="su-ln"
                            class="field-input"
                            autocomplete="family-name"
                            bind:value={last_name}
                            required
                        />
                    </div>
                </div>
                <div>
                    <label class="field-label" for="su-un">Username</label>
                    <input
                        id="su-un"
                        class="field-input"
                        autocomplete="username"
                        minlength="2"
                        maxlength="32"
                        bind:value={username}
                        required
                    />
                </div>
                <div>
                    <label class="field-label" for="su-em">Email</label>
                    <input
                        id="su-em"
                        class="field-input"
                        type="email"
                        autocomplete="email"
                        bind:value={email}
                        required
                    />
                </div>
                <div>
                    <label class="field-label" for="su-pw">Password (8+ chars)</label>
                    <input
                        id="su-pw"
                        class="field-input"
                        type="password"
                        autocomplete="new-password"
                        minlength="8"
                        bind:value={password}
                        required
                    />
                </div>
                {#if error}
                    <div class="text-danger text-sm">{error}</div>
                {/if}
                <div class="flex justify-between items-center mt-2">
                    <button type="button" class="text-sm text-fg-muted hover:text-fg" onclick={switchToLogin}>
                        Already have one?
                    </button>
                    <button class="btn-primary" disabled={submitting}>
                        {submitting ? 'Creating…' : 'Sign up'}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
