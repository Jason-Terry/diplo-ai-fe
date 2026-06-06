<script lang="ts">
    import Header from '$lib/components/Header.svelte';
    import AccountNav from '$lib/components/AccountNav.svelte';
    import { user } from '$lib/stores/user';
    import { goto } from '$app/navigation';
    import { pushToast, loginModalOpen } from '$lib/stores/ui';
    import {
        authUpdateProfile,
        authChangePassword,
        authGithubStartUrl,
        authResendVerification,
        ApiError
    } from '$lib/api';
    import { ArrowLeft, Mail, Github, Key, User as UserIcon, ShieldAlert } from 'lucide-svelte';
    import { onMount } from 'svelte';

    // Profile form state — initialised when $user is known.
    let firstName = $state('');
    let lastName = $state('');
    let username = $state('');
    let profileSaving = $state(false);
    let profileError = $state('');

    // Change-password form state.
    let currentPw = $state('');
    let newPw = $state('');
    let confirmPw = $state('');
    let pwSaving = $state(false);
    let pwError = $state('');

    // Hydrate from user store when it lands.
    $effect(() => {
        if ($user) {
            firstName = $user.first_name || '';
            lastName = $user.last_name || '';
            username = $user.username || '';
        }
    });

    onMount(() => {
        // If unauth on mount, kick the login modal open and stay on /account
        // so the user lands here after signing in.
        if (!$user) loginModalOpen.set(true);
    });

    let dirty = $derived(
        !!$user && (
            firstName.trim() !== ($user.first_name || '') ||
            lastName.trim() !== ($user.last_name || '') ||
            username.trim() !== ($user.username || '')
        )
    );

    async function saveProfile() {
        if (!$user || profileSaving) return;
        profileError = '';
        profileSaving = true;
        try {
            const patch: { first_name?: string; last_name?: string; username?: string } = {};
            if (firstName.trim() !== ($user.first_name || '')) patch.first_name = firstName.trim();
            if (lastName.trim() !== ($user.last_name || '')) patch.last_name = lastName.trim();
            if (username.trim() !== ($user.username || '')) patch.username = username.trim();
            const fresh = await authUpdateProfile(patch);
            user.set(fresh);
            pushToast('success', 'Profile updated.');
        } catch (e: any) {
            profileError = e instanceof ApiError ? e.message : (e?.message || 'Update failed');
        } finally {
            profileSaving = false;
        }
    }

    let pwMismatch = $derived(newPw.length > 0 && confirmPw.length > 0 && newPw !== confirmPw);
    let pwTooShort = $derived(newPw.length > 0 && newPw.length < 8);

    async function changePw() {
        if (!$user || pwSaving) return;
        pwError = '';
        if (newPw !== confirmPw) { pwError = "New passwords don't match."; return; }
        if (newPw.length < 8) { pwError = 'New password must be at least 8 characters.'; return; }
        if (newPw === currentPw) { pwError = 'New password must differ from the current one.'; return; }
        pwSaving = true;
        try {
            const fresh = await authChangePassword(currentPw, newPw);
            user.set(fresh);
            currentPw = ''; newPw = ''; confirmPw = '';
            pushToast('success', 'Password changed.');
        } catch (e: any) {
            pwError = e instanceof ApiError ? e.message : (e?.message || 'Could not change password');
        } finally {
            pwSaving = false;
        }
    }

    async function resendVerify() {
        try {
            await authResendVerification();
            pushToast('success', 'Verification email sent. Check your inbox.');
        } catch (e: any) {
            pushToast('error', e?.message || 'Failed to resend');
        }
    }
</script>

<Header />

<main class="account-page">
    <div class="account-back">
        <button class="btn-ghost small" onclick={() => goto('/')}>
            <ArrowLeft size={12} /> Home
        </button>
    </div>

    <h1 class="account-title">Account settings</h1>

    <AccountNav />

    {#if !$user}
        <div class="empty-state">
            Sign in to manage your account.
        </div>
    {:else}
        {#if !$user.email_verified}
            <div class="verify-banner">
                <div class="verify-msg">
                    <Mail size={16} />
                    <span>Your email isn't verified yet — verify it to create games.</span>
                </div>
                <button class="btn-ghost small" onclick={resendVerify}>Resend</button>
            </div>
        {/if}

        <!-- Profile -->
        <section class="acc-card">
            <header class="acc-card-header">
                <UserIcon size={16} /><h2>Profile</h2>
            </header>
            <p class="acc-card-sub">Your name and the handle people see on the leaderboards.</p>
            <form class="acc-form" onsubmit={(e) => { e.preventDefault(); saveProfile(); }}>
                <div class="acc-grid">
                    <div>
                        <label class="field-label" for="acc-first">First name</label>
                        <input id="acc-first" class="field-input" bind:value={firstName} maxlength="64" />
                    </div>
                    <div>
                        <label class="field-label" for="acc-last">Last name</label>
                        <input id="acc-last" class="field-input" bind:value={lastName} maxlength="64" />
                    </div>
                </div>
                <div>
                    <label class="field-label" for="acc-uname">Username</label>
                    <input id="acc-uname" class="field-input" bind:value={username} maxlength="32" />
                    <div class="field-hint">Letters, numbers, dashes and underscores only.</div>
                </div>
                <div>
                    <label class="field-label" for="acc-email">Email</label>
                    <input id="acc-email" class="field-input" value={$user.email} disabled />
                    <div class="field-hint">Email changes aren't supported yet.</div>
                </div>
                {#if profileError}
                    <div class="field-error">{profileError}</div>
                {/if}
                <div class="acc-actions">
                    <button class="btn-primary" disabled={!dirty || profileSaving}>
                        {profileSaving ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </form>
        </section>

        <!-- Password -->
        {#if $user.has_password}
            <section class="acc-card">
                <header class="acc-card-header">
                    <Key size={16} /><h2>Change password</h2>
                </header>
                <p class="acc-card-sub">Your current password is required to change it.</p>
                <form class="acc-form" onsubmit={(e) => { e.preventDefault(); changePw(); }}>
                    <div>
                        <label class="field-label" for="acc-curpw">Current password</label>
                        <input id="acc-curpw" class="field-input" type="password"
                               autocomplete="current-password" bind:value={currentPw} required />
                    </div>
                    <div>
                        <label class="field-label" for="acc-newpw">New password</label>
                        <input id="acc-newpw" class="field-input" type="password"
                               autocomplete="new-password" bind:value={newPw} required minlength="8" />
                        {#if pwTooShort}
                            <div class="field-hint">Needs at least 8 characters.</div>
                        {/if}
                    </div>
                    <div>
                        <label class="field-label" for="acc-confpw">Confirm new password</label>
                        <input id="acc-confpw" class="field-input" type="password"
                               autocomplete="new-password" bind:value={confirmPw} required />
                        {#if pwMismatch}
                            <div class="field-error">Passwords don't match.</div>
                        {/if}
                    </div>
                    {#if pwError}
                        <div class="field-error">{pwError}</div>
                    {/if}
                    <div class="acc-actions">
                        <button class="btn-primary" disabled={pwSaving || pwMismatch || pwTooShort || !currentPw}>
                            {pwSaving ? 'Updating…' : 'Update password'}
                        </button>
                    </div>
                </form>
            </section>
        {:else}
            <section class="acc-card">
                <header class="acc-card-header">
                    <ShieldAlert size={16} /><h2>No local password</h2>
                </header>
                <p class="acc-card-sub">
                    You signed up via GitHub, so there's no password to change. You can
                    set one through "Forgot password" on the sign-in screen — that will
                    let you log in with email + password in addition to GitHub.
                </p>
            </section>
        {/if}

        <!-- GitHub -->
        <section class="acc-card">
            <header class="acc-card-header">
                <Github size={16} /><h2>GitHub</h2>
            </header>
            {#if $user.github_login}
                <p class="acc-card-sub">
                    Connected as <strong>@{$user.github_login}</strong>. You can sign in with GitHub
                    on any device.
                </p>
            {:else}
                <p class="acc-card-sub">
                    Link your GitHub account to sign in with one click on any device.
                </p>
                <div class="acc-actions">
                    <a class="btn-ghost" href={authGithubStartUrl('/account')}>
                        <Github size={14} /> Connect GitHub
                    </a>
                </div>
            {/if}
        </section>

    {/if}
</main>

<style>
    .account-page {
        max-width: 44rem;
        margin: 0 auto;
        padding: 2rem 1.5rem 4rem;
        height: calc(100vh - 64px);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .account-back { display: flex; }
    .account-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 700;
        font-size: 1.6rem;
        color: var(--color-fg);
        margin: 0.25rem 0 0.5rem;
    }
    .acc-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        padding: 1.25rem 1.5rem;
        box-shadow: var(--shadow-card);
    }
    .acc-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        color: var(--color-fg-muted);
    }
    .acc-card-header h2 {
        font-size: 0.85rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        margin: 0;
        color: var(--color-fg);
    }
    .acc-card-sub {
        font-size: 0.85rem;
        color: var(--color-fg-muted);
        line-height: 1.5;
        margin: 4px 0 12px 0;
    }
    .acc-form { display: flex; flex-direction: column; gap: 12px; }
    .acc-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }
    .acc-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
    }
    .field-hint {
        font-size: 0.72rem;
        color: var(--color-fg-dim);
        margin-top: 4px;
    }
    .field-error {
        font-size: 0.78rem;
        color: var(--color-danger);
        margin-top: 4px;
    }
    .verify-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid var(--color-danger);
        background: var(--color-surface-soft);
    }
    .verify-msg {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        color: var(--color-fg);
    }
</style>
