<script lang="ts">
    import {
        Mail,
        Phone,
        Scale,
        Flag,
        ListChecks,
        Cloud,
        ScrollText,
        Send,
        Inbox,
        ArrowRight,
        ArrowLeft,
        ArrowLeftRight,
        Check,
        X,
        CircleDashed,
        ChevronDown,
        ChevronRight
    } from 'lucide-svelte';
    import type { FeedEvent } from '$lib/feed';

    const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'] as const;
    type Power = (typeof POWERS)[number];

    type Props = {
        // Flat ordered list of feed events for the ALL tab.
        events: FeedEvent[];
        // Per-power feed events (sent/received, thoughts, etc.)
        perPower: Record<Power, FeedEvent[]>;
        // Per-power append-only notes.
        notes: Record<Power, Array<{ phase: string; text: string }>>;
        // Set of currently-thinking powers for the agent-active tab dot.
        activePowers: Set<string>;
        // Compact mode = map layout (events render as one-liners with expand);
        // full mode = dialog layout (events render expanded).
        compact: boolean;
    };
    let { events, perPower, notes, activePowers, compact }: Props = $props();

    let activeTab = $state<'ALL' | Power>('ALL');
    let expandedIds = $state<Set<number>>(new Set());
    let collapsedPhases = $state<Set<string>>(new Set());
    let scratchpadOpen = $state(true);

    // Reactive view of the current tab's event stream.
    let visibleEvents = $derived(
        activeTab === 'ALL' ? events : perPower[activeTab as Power] || []
    );

    let visibleNotes = $derived(
        activeTab === 'ALL' ? [] : notes[activeTab as Power] || []
    );

    function colorVar(p: string) { return `var(--power-${p.toLowerCase()})`; }

    function toggleEvent(id: number) {
        const next = new Set(expandedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        expandedIds = next;
    }

    // Group events into phase sections; latest phase defaults to expanded.
    type Group = { phase: string; events: FeedEvent[] };
    let groups = $derived.by<Group[]>(() => {
        const out: Group[] = [];
        let cur: Group = { phase: 'Initialization', events: [] };
        for (const e of visibleEvents) {
            if (e.kind === 'phase') {
                if (cur.events.length) out.push(cur);
                cur = { phase: e.label, events: [] };
                continue;
            }
            cur.events.push(e);
        }
        if (cur.events.length || !out.length) out.push(cur);
        return out;
    });

    function isPhaseOpen(phase: string, isLatest: boolean): boolean {
        const flipped = collapsedPhases.has(phase);
        return isLatest ? !flipped : flipped;
    }

    function togglePhase(phase: string) {
        const next = new Set(collapsedPhases);
        if (next.has(phase)) next.delete(phase);
        else next.add(phase);
        collapsedPhases = next;
    }

    const COUNTABLE = new Set([
        'message', 'message_sent', 'message_received',
        'thought', 'commitment', 'call', 'order', 'resolved'
    ]);
</script>

<aside class="feed-panel panel-card" class:compact-feed={compact}>
    <div class="feed-tabs">
        <button
            class="feed-tab"
            class:active={activeTab === 'ALL'}
            onclick={() => (activeTab = 'ALL')}
        >
            <span class="agent-dot"></span>All
        </button>
        {#each POWERS as p}
            <button
                class="feed-tab"
                class:active={activeTab === p}
                class:agent-active={activePowers.has(p)}
                onclick={() => (activeTab = p)}
                style="--tab-color: {colorVar(p)};"
            >
                <span class="agent-dot"></span>{p.slice(0, 3)}
            </button>
        {/each}
    </div>

    {#if activeTab !== 'ALL' && visibleNotes.length}
        <div class="scratchpad-pane">
            <button
                class="scratchpad-header"
                onclick={() => (scratchpadOpen = !scratchpadOpen)}
                style="border: none; width: 100%; background: var(--color-surface-soft);"
            >
                <span>Scratchpad</span>
                <span class="scratchpad-toggle">
                    {#if scratchpadOpen}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
                </span>
            </button>
            {#if scratchpadOpen}
                <div class="scratchpad-body">
                    {#each visibleNotes as n}
                        <div class="note-row">
                            <span class="note-phase">{n.phase}</span>
                            <span class="note-text">{n.text}</span>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <div class="live-stream">
        {#if !visibleEvents.length}
            <div class="empty-state">
                {activeTab === 'ALL'
                    ? 'No activity yet. Click an action to begin.'
                    : `No activity yet for ${activeTab}.`}
            </div>
        {:else}
            {#each groups as g, gi}
                {@const isLatest = gi === groups.length - 1}
                {@const open = isPhaseOpen(g.phase, isLatest)}
                {@const count = g.events.filter((e) => COUNTABLE.has(e.kind)).length}
                <div class="phase-section" class:expanded={open} class:collapsed={!open}>
                    <button
                        class="phase-section-header"
                        onclick={() => togglePhase(g.phase)}
                    >
                        <span class="phase-section-toggle">
                            {#if open}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
                        </span>
                        <span class="phase-section-label">{g.phase}</span>
                        <span class="phase-section-count">{count}</span>
                    </button>
                    {#if open}
                        <div class="phase-section-body">
                            {#each g.events as e}
                                {@const expanded = expandedIds.has(e.id)}
                                {#if e.kind === 'round_marker'}
                                    <div class="round-divider"><span>{e.label}</span></div>
                                {:else if e.kind === 'message'}
                                    <div class="event msg-event" class:expanded onclick={() => toggleEvent(e.id)}>
                                        <span class="event-icon"><Mail size={14} /></span>
                                        <span class="event-tag" style="color:{colorVar(e.power)}">{e.power}</span>
                                        <span class="event-arrow"><ArrowRight size={11} /></span>
                                        <span class="event-tag" style="color:{colorVar(e.to)}">{e.to}</span>
                                        <span class="round-tag">r{(e.round ?? 0) + 1}</span>
                                        <span class="event-summary">{e.content}</span>
                                        <div class="event-body">{e.content}</div>
                                    </div>
                                {:else if e.kind === 'message_sent'}
                                    <div class="event msg-event sent" class:expanded onclick={() => toggleEvent(e.id)}>
                                        <span class="event-icon"><Send size={14} /></span>
                                        <span class="event-arrow"><ArrowRight size={11} /></span> to
                                        <span class="event-tag" style="color:{colorVar(e.to)}">{e.to}</span>
                                        <span class="round-tag">r{(e.round ?? 0) + 1}</span>
                                        <span class="event-summary">{e.content}</span>
                                        <div class="event-body">{e.content}</div>
                                    </div>
                                {:else if e.kind === 'message_received'}
                                    <div class="event msg-event received" class:expanded onclick={() => toggleEvent(e.id)}>
                                        <span class="event-icon"><Inbox size={14} /></span>
                                        <span class="event-arrow"><ArrowLeft size={11} /></span> from
                                        <span class="event-tag" style="color:{colorVar(e.from)}">{e.from}</span>
                                        <span class="round-tag">r{(e.round ?? 0) + 1}</span>
                                        <span class="event-summary">{e.content}</span>
                                        <div class="event-body">{e.content}</div>
                                    </div>
                                {:else if e.kind === 'commitment'}
                                    <div class="event commit-event" class:expanded onclick={() => toggleEvent(e.id)}>
                                        <span class="event-icon"><Flag size={14} /></span>
                                        {#if activeTab === 'ALL'}
                                            <span class="event-tag" style="color:{colorVar(e.power)}">{e.power}</span>
                                            <span class="commit-label">commits</span>
                                        {:else}
                                            <span class="commit-label">commitment</span>
                                        {/if}
                                        {#if e.kept === true}
                                            <span class="kept" title="kept"><Check size={14} /></span>
                                        {:else if e.kept === false}
                                            <span class="broken" title="broken"><X size={14} /></span>
                                        {:else}
                                            <span class="unresolved" title="unresolved"><CircleDashed size={14} /></span>
                                        {/if}
                                        <span class="event-summary">{e.text}</span>
                                        <div class="event-body">{e.text}</div>
                                    </div>
                                {:else if e.kind === 'call'}
                                    {@const ntn = (e.messages || []).length}
                                    {@const summary = `${e.topic || 'call'} · ${ntn} turn${ntn === 1 ? '' : 's'}${e.ended ? '' : ' · live'}`}
                                    <div class="event call-event" class:expanded onclick={() => toggleEvent(e.id)}>
                                        <span class="event-icon"><Phone size={14} /></span>
                                        <span class="event-tag" style="color:{colorVar(e.initiator)}">{e.initiator}</span>
                                        <span class="event-arrow"><ArrowLeftRight size={11} /></span>
                                        <span class="event-tag" style="color:{colorVar(e.recipient)}">{e.recipient}</span>
                                        <span class="round-tag">r{(e.round ?? 0) + 1}</span>
                                        <span class="call-status-inline">
                                            {#if e.ended}
                                                <span class="call-status ended">ended</span>
                                            {:else}
                                                <span class="call-status live">live</span>
                                            {/if}
                                        </span>
                                        <span class="event-summary">{summary}</span>
                                        <div class="call-topic">{e.topic}</div>
                                        <div class="call-thread">
                                            {#each e.messages || [] as m}
                                                <div class="call-turn">
                                                    <span class="event-tag" style="color:{colorVar(m.from)}">{m.from}</span>
                                                    <span class="call-msg">{m.content}</span>
                                                </div>
                                            {:else}
                                                <div class="muted">…</div>
                                            {/each}
                                        </div>
                                        {#if e.ended && e.endReason}
                                            <div class="call-end-reason">
                                                <span class="call-end-label">End reason:</span> {e.endReason}
                                            </div>
                                        {/if}
                                    </div>
                                {:else if e.kind === 'order'}
                                    {@const nAcc = (e.accepted || []).length}
                                    {@const nRej = (e.rejected || []).length}
                                    {@const summary = `${nAcc} order${nAcc === 1 ? '' : 's'}${nRej ? ` · ${nRej} rejected` : ''}`}
                                    <div class="event order-event" class:expanded onclick={() => toggleEvent(e.id)}>
                                        <span class="event-icon"><ListChecks size={14} /></span>
                                        {#if activeTab === 'ALL'}
                                            <span class="event-tag" style="color:{colorVar(e.power)}">{e.power}</span>
                                        {/if}
                                        <span class="event-label">orders</span>
                                        <span class="event-summary">{summary}</span>
                                        <ul class="order-list">
                                            {#each e.accepted || [] as o}
                                                <li>{o}</li>
                                            {/each}
                                            {#each e.rejected || [] as r}
                                                <li class="rejected">{r.order} — {r.error}</li>
                                            {/each}
                                        </ul>
                                    </div>
                                {:else if e.kind === 'thought'}
                                    <div class="event thought-event" class:expanded onclick={() => toggleEvent(e.id)}>
                                        <span class="event-icon"><Cloud size={14} /></span>
                                        <span class="event-summary">{e.text}</span>
                                        <div class="event-body thought">{e.text}</div>
                                    </div>
                                {:else if e.kind === 'round_summary'}
                                    {@const count2 = (e.headlines || []).length}
                                    <div class="event round-summary-event" class:expanded onclick={() => toggleEvent(e.id)}>
                                        <span class="event-icon"><ScrollText size={14} /></span>
                                        <strong>Dispatch · {e.phase || ''}</strong>
                                        <span class="event-summary">{count2} event{count2 === 1 ? '' : 's'} this phase</span>
                                        <ul class="summary-headlines">
                                            {#each e.headlines || [] as h}
                                                <li>{h}</li>
                                            {/each}
                                        </ul>
                                    </div>
                                {:else if e.kind === 'resolved'}
                                    {@const nSc = (e.sc_changes || []).length}
                                    {@const summary = `${e.previous_phase} resolved · ${nSc} SC${nSc === 1 ? '' : 's'} changed`}
                                    <div class="event resolved-event" class:expanded onclick={() => toggleEvent(e.id)}>
                                        <span class="event-icon"><Scale size={14} /></span>
                                        <strong>Turn resolved</strong>
                                        <span class="event-summary">{summary}</span>
                                        <div class="event-body">{e.previous_phase} → {e.current_phase}</div>
                                        {#if (e.sc_changes || []).length}
                                            <ul class="sc-changes">
                                                {#each e.sc_changes || [] as c}
                                                    <li>
                                                        <span class="sc-name">{c.center}</span>
                                                        <span class="sc-from">{c.from || 'neutral'}</span>
                                                        <ArrowRight size={11} />
                                                        <span style="color:{colorVar(c.to)}">{c.to}</span>
                                                    </li>
                                                {/each}
                                            </ul>
                                        {:else}
                                            <div class="muted">No SCs changed.</div>
                                        {/if}
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        {/if}
    </div>
</aside>
