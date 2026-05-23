<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { bootAuth } from '$lib/stores/user';
    import { theme, pushToast } from '$lib/stores/ui';
    import LoginModal from '$lib/components/LoginModal.svelte';
    import SignupModal from '$lib/components/SignupModal.svelte';
    import AboutModal from '$lib/components/AboutModal.svelte';
    import SetupModal from '$lib/components/SetupModal.svelte';
    import Toasts from '$lib/components/Toasts.svelte';

    let { children } = $props();

    onMount(() => {
        // Apply persisted theme on first paint
        document.documentElement.setAttribute('data-theme', $theme);
        bootAuth();

        // Handle the BE's email-verify redirect: /?verify=ok|expired|invalid
        const params = new URLSearchParams(window.location.search);
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
    });
</script>

{@render children()}

<LoginModal />
<SignupModal />
<AboutModal />
<SetupModal />
<Toasts />
