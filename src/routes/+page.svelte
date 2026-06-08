<script lang="ts">
    import Header from '$lib/components/Header.svelte';
    import { listGames, authResendVerification, ApiError } from '$lib/api';
    import type { GameSummary } from '$lib/types';
    import { user } from '$lib/stores/user';
    import { loginModalOpen, setupModalOpen, pushToast, aboutModalOpen } from '$lib/stores/ui';
    import { onMount } from 'svelte';
    import { ArrowRight, Mail } from 'lucide-svelte';

    let games = $state<GameSummary[]>([]);
    let loading = $state(true);
    let error = $state('');

    async function refresh() {
        // Listing is auth-only now — show an empty roster for logged-out
        // visitors rather than firing a request we know will 401.
        if (!$user) {
            games = [];
            loading = false;
            return;
        }
        try {
            const data = await listGames();
            games = (data.games || []).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
        } catch (e: any) {
            // 401/403 means a stale cookie or unverified email — treat as
            // "no games to show" rather than a hard error banner.
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
                games = [];
            } else {
                error = e?.message || 'Failed to load games';
            }
        } finally {
            loading = false;
        }
    }

    onMount(refresh);
    // Refetch when the user logs in/out — bootAuth() resolves after first
    // mount so onMount alone misses the just-logged-in case.
    $effect(() => {
        void $user;
        refresh();
    });

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

    // Map BE lifecycle state to a UI label. Falls back to is_complete for
    // pre-migration rows that haven't been re-persisted yet.
    function statusLabel(g: GameSummary): string {
        const s = g.terminal_status ?? (g.is_complete ? 'complete' : 'active');
        if (s === 'active') return 'in progress';
        return s;
    }

    function relativeTime(unix: number): string {
        if (!unix) return '';
        const diff = Date.now() / 1000 - unix;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }
</script>

<Header />

<main class="landing">
    <section class="landing-hero">
        <div class="hero-card">
            <span class="hero-eyebrow">A research sandbox</span>
            <h2 class="hero-title">Seven AIs walk into <span class="hero-italic">a war</span>.</h2>
            <p class="hero-blurb">
                Pick a model and a personality for each Great Power. They negotiate
                in private, commit in public, then betray each other on the way to
                eighteen supply centers. You watch.
            </p>
            <button class="btn-primary hero-cta" onclick={newGame}>
                Begin a Game <ArrowRight size={16} />
            </button>
            <button class="btn-ghost hero-secondary" onclick={() => aboutModalOpen.set(true)}>
                Learn the rules first
            </button>
            <p class="hero-tagline">
                First game's on us. After that, bring your own LLM key —
                Anthropic, OpenAI, or Google.
            </p>
        </div>
    </section>

    {#if $user && !$user.email_verified}
        <div class="verify-banner">
            <div class="verify-msg">
                <Mail size={16} />
                <span>Verify your email so you can create games.</span>
            </div>
            <button class="btn-ghost small" onclick={resendVerify}>Resend</button>
        </div>
    {/if}

    <section class="games-section">
        <header class="games-header">
            <h3>Recent games</h3>
            <span class="games-hint">Click a row to spectate</span>
        </header>
        {#if loading}
            <div class="empty-state">Loading games…</div>
        {:else if error}
            <div class="empty-state" style="color: var(--color-danger);">{error}</div>
        {:else if !games.length}
            <div class="empty-state">
                No games yet. <em>Start one above.</em>
            </div>
        {:else}
            <div class="games-list">
                {#each games as g}
                    <a class="game-row" href="/games/{g.game_id}">
                        <div class="game-row-meta">
                            <div class="game-id">{g.game_id}</div>
                            <div class="game-sub">
                                {g.turns || 0} turns
                                {#if g.winner}· winner: {g.winner}{/if}
                                {#if g.updated_at}· {relativeTime(g.updated_at)}{/if}
                            </div>
                        </div>
                        <div class="game-status" data-status={g.terminal_status ?? (g.is_complete ? 'complete' : 'active')}>
                            {statusLabel(g)}
                        </div>
                    </a>
                {/each}
            </div>
        {/if}
    </section>
</main>

<style>
    .landing {
        max-width: 56rem;
        margin: 0 auto;
        padding: 2rem 1.5rem 4rem;
        overflow-y: auto;
        height: calc(100vh - 64px);
    }
    .landing-hero {
        display: flex;
        justify-content: center;
        padding: 2rem 0 2.5rem;
    }
    .hero-tagline {
        margin: 1rem 0 0;
        font-size: 0.8rem;
        color: var(--color-fg-muted);
        max-width: 32rem;
        line-height: 1.5;
    }
    .verify-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        margin-bottom: 1rem;
        border-radius: 8px;
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
    .games-section {
        margin-top: 1rem;
    }
    .games-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 0.75rem;
    }
    .games-header h3 {
        font-family: var(--font-serif);
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-fg);
        letter-spacing: 0.02em;
    }
    .games-hint {
        font-size: 0.78rem;
        color: var(--color-fg-muted);
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
        gap: 1rem;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        text-decoration: none;
        color: inherit;
        transition: border-color 0.15s, background 0.15s, transform 0.1s;
    }
    .game-row:hover {
        border-color: var(--color-accent);
        background: var(--color-surface-strong);
        transform: translateX(2px);
    }
    .game-row-meta { min-width: 0; }
    .game-id {
        font-family: var(--font-mono);
        font-size: 0.82rem;
        color: var(--color-fg);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
        background: var(--color-surface-soft);
        flex-shrink: 0;
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
