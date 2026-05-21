<script lang="ts">
    import Header from '$lib/components/Header.svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import {
        getGameState,
        runNegotiate,
        runOrders,
        runAdjudicate,
        gameSocket,
        ApiError
    } from '$lib/api';
    import type { GameState } from '$lib/types';
    import { onMount, onDestroy } from 'svelte';
    import { ArrowLeft } from 'lucide-svelte';

    let gameId = $derived(page.params.id);
    let state = $state<GameState | null>(null);
    let loading = $state(true);
    let busy = $state(false);
    let error = $state('');
    let ws: WebSocket | null = null;
    let liveLog = $state<string[]>([]);

    async function load() {
        loading = true;
        error = '';
        try {
            state = await getGameState(gameId);
        } catch (e: any) {
            if (e instanceof ApiError && e.status === 404) {
                error = 'Game not found.';
            } else {
                error = e?.message || 'Failed to load game';
            }
        } finally {
            loading = false;
        }
    }

    function connect() {
        ws?.close();
        ws = gameSocket(gameId);
        ws.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                // Render a tight one-line summary in the live log for now.
                const t = data.type || 'event';
                const tag = data.power ? `[${data.power}] ` : '';
                const txt = data.content || data.text || data.error || '';
                liveLog = [...liveLog.slice(-200), `${t} ${tag}${typeof txt === 'string' ? txt.slice(0, 200) : ''}`];
                // Refresh state on big transitions
                if (['adjudicated', 'phase_end', 'orders_set'].includes(t)) {
                    load();
                }
            } catch {
                // ignore non-JSON frames
            }
        };
        ws.onclose = () => {
            if (gameId) setTimeout(connect, 1000);
        };
    }

    onMount(async () => {
        await load();
        connect();
    });

    onDestroy(() => {
        ws?.close();
        ws = null;
    });

    async function nextAction() {
        if (!state || busy) return;
        busy = true;
        try {
            if (state.phase_step === 'negotiate') await runNegotiate(gameId);
            else if (state.phase_step === 'orders') await runOrders(gameId);
            else if (state.phase_step === 'adjudicate') await runAdjudicate(gameId);
            await load();
        } catch (e: any) {
            if (e instanceof ApiError && e.status === 403) {
                error = 'You need to be the owner (or verified) to act on this game.';
            } else {
                error = e?.message || 'Action failed';
            }
        } finally {
            busy = false;
        }
    }

    function nextActionLabel(): string {
        if (!state) return '…';
        if (state.is_complete) return 'Game over';
        const t = state.turn.type;
        switch (state.phase_step) {
            case 'negotiate':
                return 'Run Negotiations';
            case 'orders':
                return t === 'A' ? 'Submit Builds/Disbands' : t === 'R' ? 'Submit Retreats' : 'Submit Orders';
            case 'adjudicate':
                return 'Resolve Turn';
            case 'complete':
                return 'Game over';
        }
    }

    function nextActionBusyLabel(): string {
        if (!state) return 'Working…';
        switch (state.phase_step) {
            case 'negotiate':
                return 'Agents negotiating…';
            case 'orders':
                return 'Agents submitting orders…';
            case 'adjudicate':
                return 'Resolving…';
            default:
                return 'Working…';
        }
    }
</script>

<Header gameId={gameId}>
    {#if state && !state.is_complete}
        <div class="flex items-center gap-2 text-sm text-fg-muted">
            <span class="text-fg font-semibold">{state.turn.season} {state.turn.year}</span>
            <span>·</span>
            <span>{state.turn.phase}</span>
        </div>
        <button class="btn-ghost text-sm" onclick={() => goto('/')}>
            <ArrowLeft size={14} class="inline" /> Games
        </button>
        <button class="btn-primary text-sm py-1.5" onclick={nextAction} disabled={busy || state.phase_step === 'complete'}>
            {busy ? nextActionBusyLabel() : nextActionLabel()}
        </button>
    {/if}
</Header>

<main class="max-w-6xl mx-auto p-4">
    {#if loading}
        <div class="empty-state">Loading game…</div>
    {:else if error}
        <div class="empty-state text-danger">
            {error}
            <div class="mt-3">
                <button class="btn-ghost text-sm" onclick={() => goto('/')}>← Back to games</button>
            </div>
        </div>
    {:else if state}
        <div class="grid grid-cols-1 md:grid-cols-[260px_1fr_320px] gap-4">
            <!-- Roster -->
            <aside class="rounded-md border border-border bg-bg-elev p-3 self-start">
                <h2 class="text-sm font-semibold tracking-wider text-fg-muted uppercase mb-2">Powers</h2>
                <ul class="flex flex-col gap-2">
                    {#each Object.entries(state.powers) as [name, p]}
                        <li
                            class="flex items-center justify-between rounded-md p-2 border border-border"
                            class:opacity-50={p.status === 'eliminated'}
                        >
                            <div>
                                <div class="font-bold text-sm">{name}</div>
                                {#if state.agents_config?.[name]}
                                    <div class="text-xs text-fg-muted">
                                        {state.agents_config[name].provider.split('/').pop()} · {state.agents_config[name].policy}
                                    </div>
                                {/if}
                            </div>
                            <div class="text-right text-xs">
                                <div class="font-bold">{p.centers} SC</div>
                                <div class="text-fg-muted">{p.units} units</div>
                            </div>
                        </li>
                    {/each}
                </ul>
            </aside>

            <!-- Map placeholder (full SVG port pending) -->
            <section class="rounded-md border border-border bg-bg-elev p-3 min-h-[400px]">
                <div class="text-sm text-fg-muted">
                    Map render coming in the next pass. Units this phase:
                </div>
                <pre class="mt-2 text-xs whitespace-pre-wrap font-mono">{state.units
                    .map((u) => `${u.power} ${u.raw}`)
                    .join('\n')}</pre>
            </section>

            <!-- Live activity -->
            <aside class="rounded-md border border-border bg-bg-elev p-3 self-start">
                <h2 class="text-sm font-semibold tracking-wider text-fg-muted uppercase mb-2">
                    Live
                </h2>
                {#if liveLog.length === 0}
                    <div class="text-xs text-fg-muted italic">
                        No activity yet. Click an action to begin.
                    </div>
                {:else}
                    <ul class="text-xs font-mono space-y-1 max-h-96 overflow-y-auto">
                        {#each liveLog.slice().reverse() as line, i}
                            <li class="text-fg-muted break-words">{line}</li>
                        {/each}
                    </ul>
                {/if}
            </aside>
        </div>
    {/if}
</main>
