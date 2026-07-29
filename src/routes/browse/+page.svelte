<script lang="ts">
    /**
     * /browse — public games the owner has marked visibility='public'.
     * Open to everyone, no account needed.
     */
    import Header from '$lib/components/Header.svelte';
    import { listPublicGames, ApiError } from '$lib/api';
    import type { GameSummary } from '$lib/types';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { ArrowLeft, Globe } from 'lucide-svelte';

    let games = $state<GameSummary[]>([]);
    let loading = $state(true);
    let error = $state('');

    type StatusFilter = 'all' | 'live' | 'finished';
    let statusFilter = $state<StatusFilter>('all');

    function isFinished(g: GameSummary): boolean {
        return !!g.is_complete || ['complete', 'stalled', 'errored', 'abandoned'].includes(g.terminal_status);
    }

    let visibleGames = $derived(
        games.filter((g) => {
            if (statusFilter === 'live') return !isFinished(g);
            if (statusFilter === 'finished') return isFinished(g);
            return true;
        })
    );
    let liveCount = $derived(games.filter((g) => !isFinished(g)).length);
    let finishedCount = $derived(games.length - liveCount);

    async function refresh() {
        try {
            const data = await listPublicGames();
            games = data.games || [];
        } catch (e: any) {
            error = e instanceof ApiError ? e.message : (e?.message || 'Failed to load');
        } finally {
            loading = false;
        }
    }

    onMount(refresh);

    function relativeTime(unix: number): string {
        if (!unix) return '';
        const diff = Date.now() / 1000 - unix;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }
</script>

<svelte:head><title>Browse · MetisDolos</title></svelte:head>

<Header>
    {#snippet actions()}
        <button class="btn-ghost small" onclick={() => goto('/leaderboard')}>Leaderboard</button>
        <button class="btn-ghost small" onclick={() => goto('/')}>
            <ArrowLeft size={12} /> Home
        </button>
    {/snippet}
</Header>

<main class="browse-page">
    <header class="browse-header">
        <Globe size={20} />
        <div>
            <h1>Public games</h1>
            <p class="sub">Anyone can spectate — no account needed. The owner controls visibility.</p>
        </div>
    </header>

    {#if games.length}
        <div class="filter-row" role="group" aria-label="Filter games by status">
            <button class="filter-chip" class:active={statusFilter === 'all'} onclick={() => (statusFilter = 'all')}>
                All ({games.length})
            </button>
            <button class="filter-chip" class:active={statusFilter === 'live'} onclick={() => (statusFilter = 'live')}>
                In progress ({liveCount})
            </button>
            <button class="filter-chip" class:active={statusFilter === 'finished'} onclick={() => (statusFilter = 'finished')}>
                Finished ({finishedCount})
            </button>
        </div>
    {/if}

    {#if loading}
        <div class="empty-state">Loading…</div>
    {:else if error}
        <div class="empty-state" style="color: var(--color-danger);">{error}</div>
    {:else if !games.length}
        <div class="empty-state">
            <p>No public games yet.</p>
            <p class="hint">Start a game and switch it to <strong>Public</strong> in the share menu.</p>
        </div>
    {:else if !visibleGames.length}
        <div class="empty-state">
            <p>No {statusFilter === 'live' ? 'in-progress' : 'finished'} public games right now.</p>
        </div>
    {:else}
        <div class="games-list">
            {#each visibleGames as g}
                <a class="game-row" href={isFinished(g) ? `/games/${g.game_id}/results` : `/games/${g.game_id}`}>
                    <div class="game-row-meta">
                        <div class="game-id">#{g.game_id}</div>
                        <div class="game-sub">
                            {g.turns || 0} turns
                            {#if g.winner}· winner: {g.winner}{/if}
                            {#if g.updated_at}· {relativeTime(g.updated_at)}{/if}
                        </div>
                    </div>
                    <div class="game-status" data-status={g.terminal_status ?? 'active'}>
                        {g.terminal_status === 'active' ? 'in progress' : g.terminal_status}
                    </div>
                </a>
            {/each}
        </div>
    {/if}
</main>

<style>
    .browse-page {
        max-width: 56rem;
        margin: 0 auto;
        padding: 1.5rem 1.5rem 4rem;
        overflow-y: auto;
        height: calc(100vh - 64px);
    }
    .browse-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
        color: var(--color-fg);
    }
    .browse-header h1 {
        margin: 0;
        font-family: var(--font-serif);
        font-size: 1.4rem;
    }
    .browse-header .sub {
        margin: 0.25rem 0 0;
        font-size: 0.82rem;
        color: var(--color-fg-muted);
    }
    .filter-row {
        display: flex;
        gap: 6px;
        margin-bottom: 1rem;
    }
    .filter-chip {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 5px 12px;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-fg-muted);
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
    }
    .filter-chip:hover {
        border-color: var(--color-accent);
    }
    .filter-chip.active {
        color: var(--color-fg);
        border-color: var(--color-accent);
        background: var(--color-surface-soft);
    }
    .empty-state {
        padding: 2rem;
        text-align: center;
        color: var(--color-fg-muted);
    }
    .empty-state .hint {
        font-size: 0.8rem;
        margin-top: 0.5rem;
    }
    .games-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .game-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-surface-soft);
        text-decoration: none;
        color: inherit;
        transition: border-color 0.15s, background 0.15s;
    }
    .game-row:hover {
        border-color: var(--color-accent);
    }
    .game-id {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--color-fg);
    }
    .game-sub {
        font-size: 0.72rem;
        color: var(--color-fg-muted);
        margin-top: 2px;
    }
    .game-status {
        font-size: 0.66rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        color: var(--color-fg-muted);
        background: var(--color-surface);
    }
    .game-status[data-status='complete'] {
        color: var(--color-warn);
        border-color: var(--color-warn);
    }
    .game-status[data-status='errored'],
    .game-status[data-status='abandoned'],
    .game-status[data-status='stalled'] {
        color: var(--color-danger);
        border-color: var(--color-danger);
    }
</style>
