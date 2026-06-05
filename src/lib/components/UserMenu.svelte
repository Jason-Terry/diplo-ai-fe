<script lang="ts">
    import { user } from '$lib/stores/user';
    import { loginModalOpen, signupModalOpen, pushToast } from '$lib/stores/ui';
    import { authLogout } from '$lib/api';
    import { LogOut } from 'lucide-svelte';

    async function logout() {
        try {
            await authLogout();
            user.set(null);
            pushToast('info', 'Signed out');
        } catch (e) {
            pushToast('error', 'Logout failed');
        }
    }
</script>

{#if $user}
    <div class="flex items-center gap-2">
        <span class="text-sm text-fg-muted">
            <span class="font-medium text-fg">@{$user.username}</span>
            {#if !$user.email_verified}
                <span class="ml-1 text-xs text-danger" title="Email not verified">●</span>
            {/if}
        </span>
        <button class="icon-btn" onclick={logout} title="Sign out" aria-label="Sign out">
            <LogOut size={16} />
        </button>
    </div>
{:else}
    <div class="flex items-center gap-2">
        <button class="btn-ghost text-sm" onclick={() => loginModalOpen.set(true)}>Sign in</button>
        <button class="btn-primary text-sm py-1.5" onclick={() => signupModalOpen.set(true)}>
            Sign up
        </button>
    </div>
{/if}
