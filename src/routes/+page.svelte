<script lang="ts">
    import Header from '$lib/components/Header.svelte';
    import { listGames } from '$lib/api';
    import type { GameSummary } from '$lib/types';
    import { user } from '$lib/stores/user';
    import { loginModalOpen, setupModalOpen, pushToast } from '$lib/stores/ui';
    import { authResendVerification } from '$lib/api';
    import { onMount } from 'svelte';
    import { Plus, Mail } from 'lucide-svelte';

    let games = $state<GameSummary[]>([]);
    let loading = $state(true);
    let error = $state('');

    async function refresh() {
        try {
            const data = await listGames();
            games = (data.games || []).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
        } catch (e: any) {
            error = e?.message || 'Failed to load games';
        } finally {
            loading = false;
        }
    }

    onMount(refresh);

    function newGame() {
        if (!$user) {
            loginModalOpen.set(true);
            return;
        }
        if (!$user.email_verified) {
            pushToast('error', 'Verify your email to create games.');
            return;
        }
        setupModalOpen.set(true);
    }

    async function resendVerify() {
        try {
            await authResendVerification();
            pushToast('success', 'Verification email sent. Check your inbox.');
        } catch (e: any) {
            pushToast('error', e?.message || 'Failed to resend');
        }
    }

    function relativeTime(unix: number): string {
        if (!unix) return '';
        const diff = (Date.now() / 1000) - unix;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }
</script>

<Header />

<main class="max-w-3xl mx-auto px-4 py-10">
    {#if $user && !$user.email_verified}
        <div class="mb-6 p-3 rounded-md border border-danger bg-bg-soft flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 text-sm">
                <Mail size={16} />
                <span>Verify your email so you can create games.</span>
            </div>
            <button class="btn-ghost text-sm py-1" onclick={resendVerify}>Resend</button>
        </div>
    {/if}

    <h1 class="text-2xl font-bold mb-1">Pick a game</h1>
    <p class="text-sm text-fg-muted mb-6">Click a row to spectate, or start a new game of your own.</p>

    <button class="btn-primary inline-flex items-center gap-2 mb-6" onclick={newGame}>
        <Plus size={18} /> New Game
    </button>

    {#if loading}
        <div class="empty-state">Loading games…</div>
    {:else if error}
        <div class="empty-state text-danger">{error}</div>
    {:else if !games.length}
        <div class="empty-state">No games yet. <em class="font-semibold">Start one above.</em></div>
    {:else}
        <div class="flex flex-col gap-2">
            {#each games as g}
                <a
                    href="/games/{g.game_id}"
                    class="flex items-center justify-between gap-4 p-3 rounded-md border border-border bg-bg-elev hover:border-accent transition-colors"
                >
                    <div class="min-w-0">
                        <div class="font-mono text-sm truncate">{g.game_id}</div>
                        <div class="text-xs text-fg-muted">
                            {g.turns || 0} turns
                            {#if g.winner} · winner: {g.winner}{/if}
                            {#if g.updated_at} · {relativeTime(g.updated_at)}{/if}
                        </div>
                    </div>
                    <div
                        class="text-xs uppercase tracking-wider px-2 py-1 rounded-full border"
                        class:border-accent={g.is_complete}
                        class:text-accent={g.is_complete}
                        class:border-border={!g.is_complete}
                        class:text-fg-muted={!g.is_complete}
                    >
                        {g.is_complete ? 'complete' : 'in-progress'}
                    </div>
                </a>
            {/each}
        </div>
    {/if}
</main>
