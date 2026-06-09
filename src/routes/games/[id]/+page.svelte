<script lang="ts">
    import Header from '$lib/components/Header.svelte';
    import MapView from '$lib/components/Map.svelte';
    import DialogPanel from '$lib/components/DialogPanel.svelte';
    import PhaseStepper from '$lib/components/PhaseStepper.svelte';
    import UnitHistoryModal from '$lib/components/UnitHistoryModal.svelte';
    import RefundModal from '$lib/components/RefundModal.svelte';
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
    import { layoutMode, pushToast } from '$lib/stores/ui';
    import { onMount, onDestroy } from 'svelte';
    import { ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-svelte';
    import {
        type FeedEvent,
        type Power,
        POWERS,
        nextId,
        emptyPerPower,
        emptyNotes
    } from '$lib/feed';

    // Route guarantees this param exists; coerce to string.
    let gameId = $derived(page.params.id as string);
    let game = $state<GameState | null>(null);
    let loading = $state(true);
    let busy = $state(false);
    let error = $state('');
    let ws: WebSocket | null = null;
    // Selected unit id for the history modal (null = closed).
    let activeUnitId = $state<string | null>(null);

    // Refund modal state. `reason` controls the copy tone:
    //   manual → user clicked the button, show the "are you sure, this
    //            INVALIDATES the game" warning.
    //   auto   → system flagged the game broken (terminal_status === 'errored'),
    //            skip the confirmation tone.
    let refundOpen = $state(false);
    let refundReason = $state<'manual' | 'auto'>('manual');
    // Remember which game-id we've already auto-opened on, so flipping back
    // and forth between games doesn't suppress the modal.
    let autoShownFor: string | null = null;

    // Typed event store fed by both initial hydration and live WS frames.
    let events = $state<FeedEvent[]>([]);
    let perPower = $state<Record<Power, FeedEvent[]>>(emptyPerPower<FeedEvent>());
    let notes = $state<Record<Power, Array<{ phase: string; text: string }>>>(emptyNotes());
    let activePowers = $state<Set<string>>(new Set());

    // Live calls indexed by call id so message/end events can update them.
    type CallEvent = Extract<FeedEvent, { kind: 'call' }>;
    const liveCalls: Map<string, CallEvent> = new globalThis.Map();

    function pushAll(e: FeedEvent) { events = [...events, e]; }
    function pushPower(power: string, e: FeedEvent) {
        if (!(power in perPower)) return;
        const next = { ...perPower };
        next[power as Power] = [...next[power as Power], e];
        perPower = next;
    }

    function clearFeed() {
        events = [];
        perPower = emptyPerPower<FeedEvent>();
        notes = emptyNotes();
        activePowers = new Set();
        liveCalls.clear();
    }

    function hydrateFromState(g: GameState) {
        // Notes (per-power append-only buffer)
        const nextNotes = emptyNotes();
        for (const [power, list] of Object.entries(g.notes || {})) {
            if (power in nextNotes) {
                nextNotes[power as Power] = list || [];
            }
        }
        notes = nextNotes;

        // Replay messages
        for (const m of g.messages || []) {
            const round = (m as any).round || 0;
            pushAll({ id: nextId(), kind: 'message', power: m.from, to: m.to, content: m.content, round });
            pushPower(m.from, { id: nextId(), kind: 'message_sent', to: m.to, content: m.content, round });
            pushPower(m.to, { id: nextId(), kind: 'message_received', from: m.from, content: m.content, round });
        }

        // Replay commitments
        const allCommits = [
            ...(((g as any).commitments_history || []) as any[]),
            ...(((g as any).commitments || []) as any[])
        ];
        for (const c of allCommits) {
            const ev: FeedEvent = {
                id: nextId(), kind: 'commitment',
                power: c.power, text: c.text, type: c.type, target: c.target,
                kept: c.kept ?? null
            };
            pushAll(ev);
            pushPower(c.power, ev);
        }

        // Replay calls (history + current; dedupe by id)
        const allCalls = [
            ...(((g as any).calls_history || []) as any[]),
            ...(((g as any).calls || []) as any[])
        ];
        const seen = new Set<string>();
        for (const c of allCalls) {
            if (!c?.id || seen.has(c.id)) continue;
            seen.add(c.id);
            const ev: FeedEvent = {
                id: nextId(), kind: 'call',
                callId: c.id, initiator: c.initiator, recipient: c.recipient,
                topic: c.topic, round: c.round || 0,
                messages: c.messages || [],
                ended: c.ended ?? true,
                endReason: c.end_reason ?? null
            };
            pushAll(ev);
            pushPower(c.initiator, ev);
            pushPower(c.recipient, ev);
        }
    }

    async function load() {
        loading = true;
        error = '';
        try {
            const g = await getGameState(gameId);
            game = g;
            // Don't blow away in-memory events if we already have them from
            // a live session. Only hydrate when the feed is empty.
            const allEmpty = events.length === 0 && POWERS.every((p) => perPower[p].length === 0);
            if (allEmpty) hydrateFromState(g);
        } catch (e: any) {
            if (e instanceof ApiError && e.status === 404) error = 'Game not found.';
            else error = e?.message || 'Failed to load game';
        } finally {
            loading = false;
        }
    }

    function markActive(power: string, active: boolean) {
        const next = new Set(activePowers);
        if (active) next.add(power);
        else next.delete(power);
        activePowers = next;
    }

    function onWsFrame(data: any) {
        const t = data.type;
        const phaseLabel = game ? `${game.turn.season} ${game.turn.year}` : '';
        switch (t) {
            case 'phase_start': {
                const label = data.phase === 'negotiate' ? 'Negotiations' : 'Orders';
                const ev: FeedEvent = { id: nextId(), kind: 'phase', label: `${label} · ${phaseLabel}` };
                pushAll(ev);
                POWERS.forEach((p) => pushPower(p, ev));
                break;
            }
            case 'phase_end': {
                POWERS.forEach((p) => markActive(p, false));
                break;
            }
            case 'negotiation_round': {
                const label = `Round ${data.round + 1} of ${data.total}`;
                const ev: FeedEvent = { id: nextId(), kind: 'round_marker', label };
                pushAll(ev);
                POWERS.forEach((p) => pushPower(p, ev));
                break;
            }
            case 'stream': markActive(data.power, true); break;
            case 'thought': {
                pushPower(data.power, { id: nextId(), kind: 'thought', text: data.text, phase: data.phase });
                markActive(data.power, false);
                break;
            }
            case 'note_saved': {
                if (data.power in notes) {
                    const phaseKey = game?.turn
                        ? `${(game.turn.season || '').slice(0, 3).toUpperCase()}${game.turn.year}`
                        : '?';
                    const next = { ...notes };
                    next[data.power as Power] = [...next[data.power as Power], { phase: phaseKey, text: data.text }];
                    // Rough soft cap matching the server-side budget.
                    while (
                        next[data.power as Power].reduce((s, n) => s + n.text.length, 0) > 4000 &&
                        next[data.power as Power].length > 1
                    ) {
                        next[data.power as Power] = next[data.power as Power].slice(1);
                    }
                    notes = next;
                }
                markActive(data.power, false);
                break;
            }
            case 'message': {
                pushAll({ id: nextId(), kind: 'message', power: data.from, to: data.to, content: data.content, round: data.round });
                pushPower(data.from, { id: nextId(), kind: 'message_sent', to: data.to, content: data.content, round: data.round });
                pushPower(data.to, { id: nextId(), kind: 'message_received', from: data.from, content: data.content, round: data.round });
                break;
            }
            case 'commitment': {
                const ev: FeedEvent = {
                    id: nextId(), kind: 'commitment',
                    power: data.power, text: data.text, type: data.type, target: data.target,
                    kept: null
                };
                pushAll(ev);
                pushPower(data.power, ev);
                break;
            }
            case 'orders_set': {
                const ev: FeedEvent = {
                    id: nextId(), kind: 'order',
                    power: data.power,
                    accepted: data.accepted || [],
                    rejected: data.rejected || []
                };
                pushAll(ev);
                pushPower(data.power, ev);
                break;
            }
            case 'adjudicated': {
                // Walk existing commitments and stamp kept/broken based on results.
                const updates = (data.resolved_commitments || []) as any[];
                if (updates.length) {
                    const stamp = (list: FeedEvent[]) => list.map((ev) => {
                        if (ev.kind !== 'commitment' || ev.kept != null) return ev;
                        const match = updates.find((u) => u.power === ev.power && u.text === ev.text);
                        return match ? { ...ev, kept: match.kept } : ev;
                    });
                    events = stamp(events);
                    const next = { ...perPower };
                    for (const p of POWERS) next[p] = stamp(next[p]);
                    perPower = next;
                }
                pushAll({
                    id: nextId(), kind: 'resolved',
                    previous_phase: data.previous_phase,
                    current_phase: data.current_phase,
                    sc_changes: data.sc_changes || []
                });
                if ((data.round_summary || []).length) {
                    pushAll({
                        id: nextId(), kind: 'round_summary',
                        phase: data.previous_phase,
                        headlines: data.round_summary
                    });
                }
                load(); // refresh state for SC counts + map
                break;
            }
            case 'agent_error': {
                pushAll({ id: nextId(), kind: 'phase', label: `⚠ ${data.power}: ${data.error}` });
                if (data.power && data.power !== '?') markActive(data.power, false);
                break;
            }
            case 'call_started': {
                const ev: FeedEvent = {
                    id: nextId(), kind: 'call',
                    callId: data.id, initiator: data.initiator, recipient: data.recipient,
                    topic: data.topic, round: data.round,
                    messages: [], ended: false, endReason: null
                };
                liveCalls.set(data.id, ev);
                pushAll(ev);
                pushPower(data.initiator, ev);
                pushPower(data.recipient, ev);
                break;
            }
            case 'call_message': {
                const ev = liveCalls.get(data.call_id);
                if (!ev) break;
                ev.messages = [...ev.messages, { from: data.from, content: data.content }];
                // Trigger reactivity by replacing the event in each list.
                events = events.map((e) => (e.id === ev.id ? { ...ev } : e));
                const next = { ...perPower };
                for (const p of POWERS) next[p] = next[p].map((e) => (e.id === ev.id ? { ...ev } : e));
                perPower = next;
                liveCalls.set(data.call_id, { ...ev });
                break;
            }
            case 'call_ended': {
                const ev = liveCalls.get(data.call_id);
                if (!ev) break;
                ev.ended = true;
                ev.endReason = data.end_reason ?? null;
                events = events.map((e) => (e.id === ev.id ? { ...ev } : e));
                const next = { ...perPower };
                for (const p of POWERS) next[p] = next[p].map((e) => (e.id === ev.id ? { ...ev } : e));
                perPower = next;
                liveCalls.delete(data.call_id);
                break;
            }
            case 'game_started':
            default:
                break;
        }
    }

    function connect() {
        ws?.close();
        ws = gameSocket(gameId);
        ws.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                onWsFrame(data);
            } catch { /* ignore non-JSON */ }
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
                pushToast('error', 'You need to be the owner (and verified) to act on this game.');
            } else {
                pushToast('error', e?.message || 'Action failed');
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
            case 'negotiate': return 'Begin Negotiations';
            case 'orders':
                return t === 'A' ? 'Submit Builds / Disbands'
                    : t === 'R' ? 'Submit Retreats'
                    : 'Submit Orders';
            case 'adjudicate': return 'Resolve Turn';
            case 'complete': return 'Game over';
        }
    }

    function nextActionBusyLabel(): string {
        if (!game) return 'Working…';
        switch (game.phase_step) {
            case 'negotiate': return 'Agents negotiating…';
            case 'orders': return 'Agents submitting orders…';
            case 'adjudicate': return 'Resolving…';
            default: return 'Working…';
        }
    }

    // Map phase_step → stepper step.
    function stepperStep(): 'idle' | 'negotiate' | 'orders' | 'resolve' | 'done' {
        if (!game) return 'idle';
        if (game.is_complete) return 'done';
        switch (game.phase_step) {
            case 'negotiate': return 'negotiate';
            case 'orders': return 'orders';
            case 'adjudicate': return 'resolve';
            case 'complete': return 'done';
            default: return 'idle';
        }
    }

    // Sort + decorate roster rows for the cast-card list.
    let rosterRows = $derived.by(() => {
        if (!game) return [];
        const rows = POWERS.map((power) => {
            const p = game!.powers[power] || { centers: 0, units: 0, status: 'eliminated' as const };
            return {
                power,
                centers: p.centers || 0,
                units: p.units || 0,
                status: p.status as 'active' | 'eliminated'
            };
        });
        rows.sort((a, b) => {
            if ((a.status === 'eliminated') !== (b.status === 'eliminated')) {
                return a.status === 'eliminated' ? 1 : -1;
            }
            return b.centers - a.centers;
        });
        return rows;
    });

    let topCenters = $derived(
        rosterRows[0] && rosterRows[0].status !== 'eliminated' ? rosterRows[0].centers : 0
    );

    // ─── Cost telemetry helpers ────────────────────────────────────────────
    // Tokens "12.3k", "1.2M", "456" — compact for the cramped roster card.
    function fmtTokens(n: number): string {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
        return String(n);
    }
    // Cost "$1.23" above a dollar, "$0.045" below. Sub-cent reads as "<$0.01".
    function fmtCost(c: number): string {
        if (c <= 0) return '$0.00';
        if (c < 0.01) return '<$0.01';
        if (c < 1) return `$${c.toFixed(3)}`;
        return `$${c.toFixed(2)}`;
    }
    function powerUsage(power: string) {
        return (
            game?.usage_by_power?.[power] || {
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: 0,
                cost_usd: 0
            }
        );
    }
    let gameTotals = $derived.by(() => {
        const u = game?.usage_by_power || {};
        let tokens = 0;
        let cost = 0;
        for (const power of Object.keys(u)) {
            tokens += u[power].total_tokens || 0;
            cost += u[power].cost_usd || 0;
        }
        return { tokens, cost };
    });

    let scSegments = $derived.by(() => {
        if (!game) return { owned: [] as Array<{ power: string; centers: number }>, neutral: 0 };
        const owned = rosterRows
            .filter((r) => r.status !== 'eliminated' && r.centers > 0)
            .map((r) => ({ power: r.power as string, centers: r.centers }));
        const ownedSum = owned.reduce((s, r) => s + r.centers, 0);
        return { owned, neutral: Math.max(0, 34 - ownedSum) };
    });

    // Has any non-phase event happened yet? Drives the hero overlay.
    let hasActivity = $derived(events.some((e) => e.kind !== 'phase'));

    function handleMapClick() {
        if ($layoutMode === 'dialog') layoutMode.set('map');
    }

    // Auto-open the refund modal when the BE has marked this game broken.
    // Will start firing for real once the auto-error-detection slice lands;
    // wiring it now means we don't have to touch this file again then.
    $effect(() => {
        if (
            game &&
            game.free_trial &&
            game.terminal_status === 'errored' &&
            autoShownFor !== game.game_id
        ) {
            refundReason = 'auto';
            refundOpen = true;
            autoShownFor = game.game_id;
        }
    });

    function openRefundManual() {
        refundReason = 'manual';
        refundOpen = true;
    }

    // Show the manual button only for free-trial games that are still in
    // states where a refund makes sense. Completed and already-refunded
    // games shouldn't offer it.
    let canRefund = $derived(
        !!game &&
            game.free_trial &&
            game.terminal_status !== 'complete' &&
            game.terminal_status !== 'refunded'
    );
</script>

<Header gameId={gameId} showLayoutToggle={!!game}>
    {#snippet center()}
        {#if game && !game.is_complete}
            <div class="turn-info">
                <span class="season">{game.turn.season}</span>
                <span class="year">{game.turn.year}</span>
                <span class="separator">·</span>
                <span class="phase-name">{game.turn.phase}</span>
                {#if activePowers.size > 0}
                    <span class="thinking-chip">{activePowers.size} thinking…</span>
                {/if}
            </div>
            <PhaseStepper step={stepperStep()} turnType={game.turn.type} />
        {/if}
    {/snippet}

    {#snippet actions()}
        {#if game && game.is_complete}
            <button class="btn-primary small" onclick={() => goto(`/games/${gameId}/results`)}>
                View Results <ArrowRight size={14} />
            </button>
        {:else if game && !game.is_complete}
            <button
                class="btn-primary small"
                onclick={nextAction}
                disabled={busy || game.phase_step === 'complete'}
            >
                {busy ? nextActionBusyLabel() : nextActionLabel()}
                {#if !busy}<ArrowRight size={14} />{/if}
            </button>
        {/if}
        {#if canRefund}
            <button class="btn-ghost small" onclick={openRefundManual} title="Game stuck or broken?">
                <AlertTriangle size={12} /> Issue?
            </button>
        {/if}
        <button class="btn-ghost small" onclick={() => goto('/')}>
            <ArrowLeft size={12} /> Games
        </button>
    {/snippet}
</Header>

{#if game}
    <RefundModal bind:open={refundOpen} gameId={gameId} reason={refundReason} />
{/if}

{#if loading}
    <main class="centered-state"><div class="empty-state">Loading game…</div></main>
{:else if error}
    <main class="centered-state">
        <div class="empty-state" style="color: var(--color-danger);">
            {error}
            <div style="margin-top: 12px;">
                <button class="btn-ghost small" onclick={() => goto('/')}>← Back to games</button>
            </div>
        </div>
    </main>
{:else if game}
    <main
        class="app-layout"
        class:layout-map={$layoutMode === 'map'}
        class:layout-dialog={$layoutMode === 'dialog'}
        class:layout-idle={!hasActivity}
    >
        {#if $layoutMode === 'dialog'}
            <aside class="left-column">
                <section class="map-section" onclick={handleMapClick}>
                    <div class="map-container"><MapView game={game} onunitclick={(id) => (activeUnitId = id)} /></div>
                    <div class="map-legend">
                        {#each POWERS as p}
                            {@const power = game.powers[p] || { centers: 0 }}
                            <span class="legend-chip">
                                <span class="dot" style="background: var(--power-{p.toLowerCase()})"></span>
                                {p} <em>{power.centers}</em>
                            </span>
                        {/each}
                    </div>
                </section>
                <aside class="roster-panel panel-card">
                    <h2 class="panel-title">
                        Powers
                        <span class="panel-hint">
                        {#if gameTotals.tokens > 0}{fmtTokens(gameTotals.tokens)} tok{/if}
                    </span>
                    </h2>
                    <ul class="roster-list">
                        {#each rosterRows as r}
                            {@const cfg = game.agents_config?.[r.power] || { provider: '', policy: '' }}
                            {@const modelLabel = (cfg.provider || '').split('/').pop()?.replace(/-\d{8}$/, '') || ''}
                            {@const traits = [modelLabel, cfg.policy].filter(Boolean).join(' · ')}
                            {@const isLeader = r.status !== 'eliminated' && r.centers === topCenters && r.centers > 3}
                            <li
                                class="roster-card"
                                class:eliminated={r.status === 'eliminated'}
                                class:leader={isLeader}
                                class:agent-active={activePowers.has(r.power)}
                                style="--power-color: var(--power-{r.power.toLowerCase()});"
                                data-power={r.power}
                            >
                                <span class="roster-avatar" style="background: var(--power-{r.power.toLowerCase()})">
                                    {r.power.charAt(0)}
                                </span>
                                <div class="roster-body">
                                    <div class="roster-row1">
                                        <span class="roster-name">{r.power}</span>
                                    </div>
                                    <div class="roster-traits">{traits || '—'}</div>
                                    {#if powerUsage(r.power).total_tokens > 0}
                                        <div class="roster-cost">
                                            {fmtTokens(powerUsage(r.power).total_tokens)} tok
                                            {#if game.free_trial}
                                                <span class="cost-tag">· on us</span>
                                            {:else}
                                                · {fmtCost(powerUsage(r.power).cost_usd)}
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                                <div class="roster-sc-block">
                                    <div class="roster-sc-count">
                                        <span class="num">{r.centers}</span><span class="goal">/18</span>
                                    </div>
                                    <div class="roster-sc-bar">
                                        <div class="fill" style="width: {Math.min(100, (r.centers / 18) * 100)}%;"></div>
                                    </div>
                                </div>
                            </li>
                        {/each}
                    </ul>
                    {#if scSegments.owned.length}
                        <div class="sc-bar" aria-label="Supply center distribution">
                            {#each scSegments.owned as s}
                                <div
                                    class="seg"
                                    data-tip="{s.power} · {s.centers} SC"
                                    style="flex: {s.centers}; background: var(--power-{s.power.toLowerCase()});"
                                ></div>
                            {/each}
                            {#if scSegments.neutral > 0}
                                <div
                                    class="seg neutral"
                                    data-tip="Neutral · {scSegments.neutral} SC"
                                    style="flex: {scSegments.neutral};"
                                ></div>
                            {/if}
                            <div class="marker-18" title="18 SC to win"></div>
                        </div>
                    {/if}
                </aside>
            </aside>
        {:else}
            <aside class="roster-panel panel-card">
                <h2 class="panel-title">
                    Powers
                    <span class="panel-hint">
                        {#if gameTotals.tokens > 0}{fmtTokens(gameTotals.tokens)} tok{/if}
                    </span>
                </h2>
                <ul class="roster-list">
                    {#each rosterRows as r}
                        {@const cfg = game.agents_config?.[r.power] || { provider: '', policy: '' }}
                        {@const modelLabel = (cfg.provider || '').split('/').pop()?.replace(/-\d{8}$/, '') || ''}
                        {@const traits = [modelLabel, cfg.policy].filter(Boolean).join(' · ')}
                        {@const isLeader = r.status !== 'eliminated' && r.centers === topCenters && r.centers > 3}
                        <li
                            class="roster-card"
                            class:eliminated={r.status === 'eliminated'}
                            class:leader={isLeader}
                            class:agent-active={activePowers.has(r.power)}
                            style="--power-color: var(--power-{r.power.toLowerCase()});"
                            data-power={r.power}
                        >
                            <span class="roster-avatar" style="background: var(--power-{r.power.toLowerCase()})">
                                {r.power[0]}
                            </span>
                            <div class="roster-body">
                                <div class="roster-row1">
                                    <span class="roster-name">{r.power}</span>
                                </div>
                                <div class="roster-traits">{traits || '—'}</div>
                                {#if powerUsage(r.power).total_tokens > 0}
                                    <div class="roster-cost">
                                        {fmtTokens(powerUsage(r.power).total_tokens)} tok
                                        {#if game.free_trial}
                                            <span class="cost-tag">· on us</span>
                                        {:else}
                                            · {fmtCost(powerUsage(r.power).cost_usd)}
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                            <div class="roster-sc-block">
                                <div class="roster-sc-count">
                                    <span class="num">{r.centers}</span><span class="goal">/18</span>
                                </div>
                                <div class="roster-sc-bar">
                                    <div class="fill" style="width: {Math.min(100, (r.centers / 18) * 100)}%;"></div>
                                </div>
                            </div>
                        </li>
                    {/each}
                </ul>
                {#if scSegments.owned.length}
                    <div class="sc-bar" aria-label="Supply center distribution">
                        {#each scSegments.owned as s}
                            <div
                                class="seg"
                                data-tip="{s.power} · {s.centers} SC"
                                style="flex: {s.centers}; background: var(--power-{s.power.toLowerCase()});"
                            ></div>
                        {/each}
                        {#if scSegments.neutral > 0}
                            <div
                                class="seg neutral"
                                data-tip="Neutral · {scSegments.neutral} SC"
                                style="flex: {scSegments.neutral};"
                            ></div>
                        {/if}
                        <div class="marker-18" title="18 SC to win"></div>
                    </div>
                {/if}
            </aside>

            <section class="map-section">
                <div class="map-container"><MapView game={game} onunitclick={(id) => (activeUnitId = id)} /></div>
                <div class="map-legend">
                    {#each POWERS as p}
                        {@const power = game.powers[p] || { centers: 0 }}
                        <span class="legend-chip">
                            <span class="dot" style="background: var(--power-{p.toLowerCase()})"></span>
                            {p} <em>{power.centers}</em>
                        </span>
                    {/each}
                </div>
            </section>
        {/if}

        <DialogPanel
            events={events}
            perPower={perPower}
            notes={notes}
            activePowers={activePowers}
            compact={$layoutMode === 'map'}
        />

        {#if !hasActivity && !busy}
            <div class="hero-overlay">
                <div class="hero-card">
                    <span class="hero-eyebrow">Fresh game</span>
                    <h2 class="hero-title">{game.turn.season} {game.turn.year}, <span class="hero-italic">about to begin</span>.</h2>
                    <p class="hero-blurb">
                        The cast and map are ready. Start the first round of negotiations.
                        The agents will exchange private letters before anyone commits to a move.
                    </p>
                    <button class="btn-primary hero-cta" onclick={nextAction} disabled={busy}>
                        {busy ? nextActionBusyLabel() : nextActionLabel()}
                        {#if !busy}<ArrowRight size={16} />{/if}
                    </button>
                </div>
            </div>
        {/if}
    </main>

    <UnitHistoryModal
        unitId={activeUnitId}
        game={game}
        onclose={() => (activeUnitId = null)}
    />
{/if}

<style>
    .centered-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: calc(100vh - 64px);
        padding: 2rem;
    }
</style>
