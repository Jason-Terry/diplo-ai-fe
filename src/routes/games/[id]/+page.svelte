<script lang="ts">
    import Header from '$lib/components/Header.svelte';
    import Map from '$lib/components/Map.svelte';
    import DialogPanel from '$lib/components/DialogPanel.svelte';
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
    // Variable name avoids "state" — Svelte 5's $state rune shadows it.
    let game = $state<GameState | null>(null);
    let loading = $state(true);
    let busy = $state(false);
    let error = $state('');
    let ws: WebSocket | null = null;
    let liveLog = $state<string[]>([]);

    async function load() {
        loading = true;
        error = '';
        try {
            game = await getGameState(gameId);
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
                const t = data.type || 'event';
                const tag = data.power ? `[${data.power}] ` : '';
                const txt = data.content || data.text || data.error || '';
                liveLog = [...liveLog.slice(-200), `${t} ${tag}${typeof txt === 'string' ? txt.slice(0, 200) : ''}`];
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
        if (!game || busy) return;
        busy = true;
        try {
            if (game.phase_step === 'negotiate') await runNegotiate(gameId);
            else if (game.phase_step === 'orders') await runOrders(gameId);
            else if (game.phase_step === 'adjudicate') await runAdjudicate(gameId);
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
        if (!game) return '…';
        if (game.is_complete) return 'Game over';
        const t = game.turn.type;
        switch (game.phase_step) {
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
        if (!game) return 'Working…';
        switch (game.phase_step) {
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
    {#if game && !game.is_complete}
        <div class="phase-chip">
            <span class="phase-season">{game.turn.season}</span>
            <span class="phase-year">{game.turn.year}</span>
            <span class="phase-sep">·</span>
            <span class="phase-phase">{game.turn.phase}</span>
        </div>
        <button class="btn-ghost text-sm" onclick={() => goto('/')}>
            <ArrowLeft size={14} class="inline" /> Games
        </button>
        <button class="btn-primary text-sm py-1.5" onclick={nextAction} disabled={busy || game.phase_step === 'complete'}>
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
    {:else if game}
        <div
            class="grid grid-cols-1 md:grid-cols-[220px_1fr_360px] gap-4"
            style="height: calc(100vh - 120px); min-height: 600px;"
        >
            <!-- Roster -->
            <aside class="roster">
                <h2 class="roster-title">
                    <span class="roster-dot"></span> POWERS
                </h2>
                <ul class="roster-list">
                    {#each Object.entries(game.powers) as [name, p]}
                        <li
                            class="roster-item"
                            style="--power-color: var(--power-{name.toLowerCase()});"
                            class:eliminated={p.status === 'eliminated'}
                        >
                            <div class="roster-power">
                                <div class="roster-name">{name}</div>
                                {#if game.agents_config?.[name]}
                                    <div class="roster-meta">
                                        {game.agents_config[name].provider.split('/').pop()} · {game.agents_config[name].policy}
                                    </div>
                                {/if}
                            </div>
                            <div class="roster-stats">
                                <div class="roster-sc"><b>{p.centers}</b> SC</div>
                                <div class="roster-units">{p.units} units</div>
                            </div>
                        </li>
                    {/each}
                </ul>
            </aside>

            <!-- Map -->
            <section class="min-h-[400px]">
                <Map {game} />
            </section>

            <!-- Dialog / live feed -->
            <DialogPanel {game} {liveLog} />
        </div>
    {/if}
</main>
