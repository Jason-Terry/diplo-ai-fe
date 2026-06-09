<script lang="ts">
    /**
     * Post-game results screen. Lives at /games/[id]/results — permanent
     * linkable URL once a game completes. The game viewer redirects (via
     * a CTA banner) when terminal_status === 'complete'.
     *
     * Pulls the live state for the game and derives:
     *  - outcome banner (winner or draw)
     *  - final standings table
     *  - per-power bill (tokens + cost)
     *  - trust: commitments-kept rate per power
     *  - activity: messages, calls, notes counts per power
     */
    import Header from '$lib/components/Header.svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { getGameState, ApiError } from '$lib/api';
    import type { GameState, Commitment, PowerUsage } from '$lib/types';
    import { POWERS } from '$lib/feed';
    import { onMount } from 'svelte';
    import { ArrowLeft, Trophy, Handshake, Wallet, Activity, Skull } from 'lucide-svelte';

    let gameId = $derived(page.params.id as string);
    let game = $state<GameState | null>(null);
    let loading = $state(true);
    let error = $state('');

    onMount(async () => {
        try {
            game = await getGameState(gameId);
        } catch (e: any) {
            error = e instanceof ApiError ? e.message : (e?.message || 'Failed to load game');
        } finally {
            loading = false;
        }
    });

    // ─── Derived stats ────────────────────────────────────────────────────

    /** Headline outcome: solo / draw / unfinished. */
    let outcome = $derived.by(() => {
        if (!game) return { kind: 'loading', label: '', detail: '' };
        if (game.winner) {
            return { kind: 'solo', label: `Solo victory: ${game.winner}`, detail: '' };
        }
        if (game.is_complete) {
            // No winner but complete → draw.
            return { kind: 'draw', label: 'Draw', detail: 'Game ended without a solo winner.' };
        }
        if (game.terminal_status === 'errored') {
            return { kind: 'errored', label: 'Game errored', detail: 'Halted by repeated failures.' };
        }
        return { kind: 'unfinished', label: 'Game not yet complete', detail: '' };
    });

    /** Final standings rows, sorted by SC desc with eliminated powers last. */
    let rows = $derived.by(() => {
        if (!game) return [];
        return POWERS.map((power) => {
            const p = game!.powers[power] || { centers: 0, units: 0, status: 'eliminated' as const };
            const cfg: any = game!.agents_config?.[power] || {};
            const usage: PowerUsage = game!.usage_by_power?.[power] || {
                input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0,
            };
            // BE persists agents_config under either {provider, policy} (legacy)
            // or {model, persona: {label}} (BYOK). Read both shapes.
            const modelRaw: string = cfg.model || cfg.provider || '';
            const modelLabel = modelRaw.split('/').pop()?.replace(/-\d{8}$/, '') || '—';
            const personaLabel: string =
                (cfg.persona && (cfg.persona.label || cfg.persona)) || cfg.policy || '—';
            return {
                power,
                model: modelLabel,
                persona: typeof personaLabel === 'string' ? personaLabel : '—',
                centers: p.centers || 0,
                status: p.status as 'active' | 'eliminated',
                isWinner: game!.winner === power,
                usage,
            };
        }).sort((a, b) => {
            if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
            if ((a.status === 'eliminated') !== (b.status === 'eliminated')) {
                return a.status === 'eliminated' ? 1 : -1;
            }
            return b.centers - a.centers;
        });
    });

    /** Per-power commitments stats. Unresolved (kept === null) are not
     *  counted in either numerator or denominator — they're shown as a
     *  separate "open" count if you want it later. */
    let trustRows = $derived.by(() => {
        if (!game) return [];
        const history = (game.commitments_history as Commitment[]) || [];
        const tally: Record<string, { kept: number; broken: number; open: number }> = {};
        for (const p of POWERS) tally[p] = { kept: 0, broken: 0, open: 0 };
        for (const c of history) {
            const t = tally[c.power];
            if (!t) continue;
            if (c.kept === true) t.kept += 1;
            else if (c.kept === false) t.broken += 1;
            else t.open += 1;
        }
        return POWERS
            .map((power) => {
                const t = tally[power];
                const resolved = t.kept + t.broken;
                const rate = resolved > 0 ? t.kept / resolved : null;
                return { power, kept: t.kept, broken: t.broken, resolved, rate };
            })
            .filter((r) => r.resolved + tally[r.power].open > 0); // hide powers with no commitments
    });

    /** Activity counts per power. Messages SENT and notes saved are easy;
     *  calls initiated comes from the calls/calls_history arrays. */
    let activityRows = $derived.by(() => {
        if (!game) return [];
        const msgs = game.messages || [];
        const calls = ((game.calls_history as any[]) || []).concat((game.calls as any[]) || []);
        const notes = game.notes || {};
        return POWERS.map((power) => {
            const sent = msgs.filter((m) => m.from === power).length;
            const initiated = calls.filter((c) => c?.initiator === power).length;
            const noteCount = (notes[power] || []).length;
            return { power, sent, initiated, notes: noteCount };
        }).filter((r) => r.sent + r.initiated + r.notes > 0);
    });

    /** Game-wide spend totals. */
    let billTotals = $derived.by(() => {
        if (!game) return { tokens: 0, cost: 0 };
        const u = game.usage_by_power || {};
        let tokens = 0;
        let cost = 0;
        for (const power of Object.keys(u)) {
            tokens += u[power].total_tokens || 0;
            cost += u[power].cost_usd || 0;
        }
        return { tokens, cost };
    });

    // ─── Formatting helpers ──────────────────────────────────────────────

    function fmtTokens(n: number): string {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
        return String(n);
    }
    function fmtCost(c: number): string {
        if (c <= 0) return '$0.00';
        if (c < 0.01) return '<$0.01';
        if (c < 1) return `$${c.toFixed(3)}`;
        return `$${c.toFixed(2)}`;
    }
    function fmtPct(x: number | null): string {
        if (x === null) return '—';
        return `${Math.round(x * 100)}%`;
    }
</script>

<Header gameId={gameId}>
    {#snippet actions()}
        <button class="btn-ghost small" onclick={() => goto('/')}>
            <ArrowLeft size={12} /> Games
        </button>
    {/snippet}
</Header>

{#if loading}
    <main class="centered-state"><div class="empty-state">Loading results…</div></main>
{:else if error}
    <main class="centered-state">
        <div class="empty-state" style="color: var(--color-danger);">{error}</div>
    </main>
{:else if game}
    <main class="results-page">
        <!-- ─── Outcome banner ─────────────────────────────────── -->
        <section class="result-outcome" data-kind={outcome.kind}>
            <div class="outcome-icon">
                {#if outcome.kind === 'solo'}<Trophy size={32} />
                {:else if outcome.kind === 'draw'}<Handshake size={32} />
                {:else if outcome.kind === 'errored'}<Skull size={32} />
                {/if}
            </div>
            <div class="outcome-text">
                <h1>{outcome.label}</h1>
                <p class="outcome-meta">
                    {#if game.turn}Ended {game.turn.season} {game.turn.year}{/if}
                    {#if game.free_trial} · free trial{/if}
                </p>
                {#if outcome.detail}<p class="outcome-detail">{outcome.detail}</p>{/if}
            </div>
        </section>

        <!-- ─── Final standings ────────────────────────────────── -->
        <section class="result-card">
            <h2 class="result-heading">Final standings</h2>
            <div class="standings">
                <div class="standings-head">
                    <span>Power</span>
                    <span>Model</span>
                    <span>Persona</span>
                    <span class="num">Centers</span>
                    <span>Status</span>
                </div>
                {#each rows as r}
                    <div class="standings-row" class:eliminated={r.status === 'eliminated'} class:winner={r.isWinner} style="--power-color: var(--power-{r.power.toLowerCase()})">
                        <span class="power-name">
                            <span class="power-dot" style="background: var(--power-{r.power.toLowerCase()})"></span>
                            {r.power}
                        </span>
                        <span class="cell-model">{r.model}</span>
                        <span class="cell-persona">{r.persona}</span>
                        <span class="num">{r.centers}</span>
                        <span class="cell-status">
                            {#if r.isWinner}WINNER
                            {:else if r.status === 'eliminated'}eliminated
                            {:else}alive
                            {/if}
                        </span>
                    </div>
                {/each}
            </div>
        </section>

        <!-- ─── The Bill ──────────────────────────────────────── -->
        <section class="result-card">
            <h2 class="result-heading">
                <Wallet size={16} /> The bill
                <span class="result-heading-meta">
                    {fmtTokens(billTotals.tokens)} tokens ·
                    {#if game.free_trial}on us{:else}{fmtCost(billTotals.cost)}{/if}
                </span>
            </h2>
            <div class="bill">
                {#each rows as r}
                    {@const tokens = r.usage.total_tokens || 0}
                    {@const cost = r.usage.cost_usd || 0}
                    <div class="bill-row" style="--power-color: var(--power-{r.power.toLowerCase()})">
                        <span class="power-name">
                            <span class="power-dot" style="background: var(--power-{r.power.toLowerCase()})"></span>
                            {r.power}
                        </span>
                        <span class="bill-meta">
                            {fmtTokens(tokens)} tok
                            <span class="bill-split">({fmtTokens(r.usage.input_tokens || 0)} in · {fmtTokens(r.usage.output_tokens || 0)} out)</span>
                        </span>
                        <span class="num bill-cost">
                            {#if game.free_trial}—{:else}{fmtCost(cost)}{/if}
                        </span>
                    </div>
                {/each}
            </div>
        </section>

        <!-- ─── Trust ─────────────────────────────────────────── -->
        {#if trustRows.length}
            <section class="result-card">
                <h2 class="result-heading">
                    Trust <span class="result-heading-meta">commitments declared vs kept</span>
                </h2>
                <div class="trust">
                    {#each trustRows as r}
                        <div class="trust-row" style="--power-color: var(--power-{r.power.toLowerCase()})">
                            <span class="power-name">
                                <span class="power-dot" style="background: var(--power-{r.power.toLowerCase()})"></span>
                                {r.power}
                            </span>
                            <div class="trust-bar-wrap">
                                <div class="trust-bar">
                                    <div class="trust-fill" style="width: {(r.rate ?? 0) * 100}%"></div>
                                </div>
                            </div>
                            <span class="trust-counts">{r.kept} / {r.resolved}</span>
                            <span class="num trust-rate">{fmtPct(r.rate)}</span>
                        </div>
                    {/each}
                </div>
            </section>
        {/if}

        <!-- ─── Activity ──────────────────────────────────────── -->
        {#if activityRows.length}
            <section class="result-card">
                <h2 class="result-heading">
                    <Activity size={16} /> Activity
                    <span class="result-heading-meta">over the course of the game</span>
                </h2>
                <div class="activity">
                    <div class="activity-head">
                        <span>Power</span>
                        <span class="num">Messages</span>
                        <span class="num">Calls</span>
                        <span class="num">Notes</span>
                    </div>
                    {#each activityRows as r}
                        <div class="activity-row" style="--power-color: var(--power-{r.power.toLowerCase()})">
                            <span class="power-name">
                                <span class="power-dot" style="background: var(--power-{r.power.toLowerCase()})"></span>
                                {r.power}
                            </span>
                            <span class="num">{r.sent}</span>
                            <span class="num">{r.initiated}</span>
                            <span class="num">{r.notes}</span>
                        </div>
                    {/each}
                </div>
            </section>
        {/if}
    </main>
{/if}

<style>
    .results-page {
        max-width: 56rem;
        margin: 0 auto;
        padding: 1.5rem 1.5rem 4rem;
        overflow-y: auto;
        height: calc(100vh - 64px);
    }
    .result-outcome {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.25rem 1.5rem;
        margin-bottom: 1.25rem;
        background: var(--color-surface-soft);
        border: 1px solid var(--color-border);
        border-radius: 8px;
    }
    .result-outcome[data-kind='solo'] .outcome-icon {
        color: var(--color-warn);
    }
    .result-outcome[data-kind='draw'] .outcome-icon {
        color: var(--color-accent);
    }
    .result-outcome[data-kind='errored'] .outcome-icon {
        color: var(--color-danger);
    }
    .outcome-text h1 {
        margin: 0;
        font-family: var(--font-serif);
        font-size: 1.5rem;
        color: var(--color-fg);
    }
    .outcome-meta {
        margin: 0.25rem 0 0;
        font-size: 0.78rem;
        color: var(--color-fg-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }
    .outcome-detail {
        margin: 0.5rem 0 0;
        font-size: 0.85rem;
        color: var(--color-fg-muted);
    }

    .result-card {
        background: var(--color-surface-soft);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 1rem 1.25rem 1.25rem;
        margin-bottom: 1rem;
    }
    .result-heading {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0 0 0.75rem;
        font-family: var(--font-serif);
        font-size: 1rem;
        color: var(--color-fg);
    }
    .result-heading-meta {
        margin-left: auto;
        font-family: var(--font-sans);
        font-size: 0.78rem;
        font-weight: 400;
        color: var(--color-fg-muted);
        text-transform: none;
        letter-spacing: 0;
    }

    .standings, .bill, .trust, .activity {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .standings-head, .activity-head {
        display: grid;
        font-size: 0.66rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--color-fg-dim);
        padding: 4px 8px;
    }
    .standings-head {
        grid-template-columns: 1.2fr 1.4fr 1.2fr 0.6fr 0.8fr;
    }
    .activity-head {
        grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr;
    }
    .standings-row, .activity-row, .bill-row, .trust-row {
        display: grid;
        align-items: center;
        padding: 8px 8px;
        border-radius: 4px;
        font-size: 0.82rem;
        border-left: 3px solid var(--power-color);
        background: var(--color-surface);
    }
    .standings-row {
        grid-template-columns: 1.2fr 1.4fr 1.2fr 0.6fr 0.8fr;
    }
    .bill-row {
        grid-template-columns: 1.2fr 2.2fr 0.8fr;
    }
    .trust-row {
        grid-template-columns: 1.2fr 2fr 0.8fr 0.6fr;
        gap: 8px;
    }
    .activity-row {
        grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr;
    }
    .standings-row.eliminated {
        opacity: 0.55;
    }
    .standings-row.winner {
        background: linear-gradient(90deg,
            color-mix(in srgb, var(--power-color) 18%, transparent),
            var(--color-surface) 60%);
    }
    .standings-row.winner .cell-status {
        color: var(--color-warn);
        font-weight: 700;
        letter-spacing: 0.08em;
    }
    .power-name {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 0.78rem;
        letter-spacing: 0.04em;
        color: var(--color-fg);
    }
    .power-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 999px;
    }
    .num {
        font-variant-numeric: tabular-nums;
        text-align: right;
    }
    .cell-model, .cell-persona {
        font-size: 0.78rem;
        color: var(--color-fg-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .cell-status {
        font-size: 0.72rem;
        color: var(--color-fg-dim);
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }
    .bill-meta {
        font-size: 0.78rem;
        color: var(--color-fg-muted);
        font-variant-numeric: tabular-nums;
    }
    .bill-split {
        color: var(--color-fg-dim);
        font-size: 0.7rem;
    }
    .bill-cost {
        font-weight: 700;
        color: var(--color-fg);
    }
    .trust-bar-wrap {
        display: flex;
        align-items: center;
    }
    .trust-bar {
        position: relative;
        width: 100%;
        height: 8px;
        background: var(--color-border);
        border-radius: 999px;
        overflow: hidden;
    }
    .trust-fill {
        height: 100%;
        background: var(--power-color);
        transition: width 0.4s ease;
    }
    .trust-counts {
        font-size: 0.78rem;
        color: var(--color-fg-muted);
        font-variant-numeric: tabular-nums;
    }
    .trust-rate {
        font-weight: 700;
        color: var(--color-fg);
    }
</style>
