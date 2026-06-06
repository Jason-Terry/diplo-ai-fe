<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { bootAuth } from '$lib/stores/user';
    import { theme, pushToast } from '$lib/stores/ui';
    import LoginModal from '$lib/components/LoginModal.svelte';
    import SignupModal from '$lib/components/SignupModal.svelte';
    import AboutModal from '$lib/components/AboutModal.svelte';
    import SetupModal from '$lib/components/SetupModal.svelte';
    import ForgotPasswordModal from '$lib/components/ForgotPasswordModal.svelte';
    import ResetPasswordModal from '$lib/components/ResetPasswordModal.svelte';
    import Toasts from '$lib/components/Toasts.svelte';
    import { resetPasswordToken } from '$lib/stores/ui';

    let { children } = $props();

    onMount(() => {
        // Apply persisted theme on first paint
        document.documentElement.setAttribute('data-theme', $theme);
        bootAuth();

        // Handle the BE's email-verify redirect: /?verify=ok|expired|invalid
        const params = new URLSearchParams(window.location.search);

        // Password-reset link landed us here with ?reset=<token>. Hand off
        // to the reset modal and let it scrub the URL when done.
        const resetToken = params.get('reset');
        if (resetToken) {
            resetPasswordToken.set(resetToken);
        }

        const verify = params.get('verify');
        if (verify) {
            const messages: Record<string, [string, 'success' | 'error']> = {
                ok: ['Email verified. You can now create games.', 'success'],
                expired: ['That verification link has expired.', 'error'],
                invalid: ['That verification link is invalid.', 'error'],
                missing: ['Missing verification token.', 'error']
            };
            const [msg, kind] = messages[verify] ?? ['Unknown verify status', 'error'];
            pushToast(kind, msg, 6000);
            // Clean the URL
            const url = new URL(window.location.href);
            url.searchParams.delete('verify');
            window.history.replaceState({}, '', url.toString());
        }

        // GitHub SSO round-trip — BE redirects with ?sso=<status>.
        const sso = params.get('sso');
        if (sso) {
            const ssoMessages: Record<string, [string, 'success' | 'error']> = {
                ok: ['Signed in with GitHub.', 'success'],
                invalid_state: ['GitHub sign-in failed (state mismatch). Try again.', 'error'],
                exchange_failed: ['GitHub sign-in failed during token exchange.', 'error'],
                missing_email: ["GitHub didn't return a verified email — add one to your GitHub account and try again.", 'error'],
                not_configured: ['GitHub sign-in is not configured on this server.', 'error']
            };
            const [msg, kind] = ssoMessages[sso] ?? ['Unknown GitHub sign-in status', 'error'];
            pushToast(kind, msg, 6000);
            if (sso === 'ok') bootAuth();
            const url = new URL(window.location.href);
            url.searchParams.delete('sso');
            window.history.replaceState({}, '', url.toString());
        }
    });
</script>

{@render children()}

<LoginModal />
<SignupModal />
<AboutModal />
<SetupModal />
<ForgotPasswordModal />
<ResetPasswordModal />
<Toasts />
