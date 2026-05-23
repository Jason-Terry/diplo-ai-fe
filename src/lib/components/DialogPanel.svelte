<script lang="ts">
    import type { GameState } from '$lib/types';
    import { Mail, Phone, Scale, MessageSquare, Crown } from 'lucide-svelte';

    const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'] as const;
    type Power = (typeof POWERS)[number];

    type Props = { game: GameState; liveLog: string[] };
    let { game, liveLog }: Props = $props();

    let activeTab = $state<'ALL' | Power>('ALL');

    type FeedItem =
        | { kind: 'message'; power: string; to: string; content: string; round: number; phase: string }
        | { kind: 'commitment'; power: string; text: string; type: string; kept: boolean | null; phase: string }
        | { kind: 'call'; initiator: string; recipient: string; topic: string; round: number; phase: string; messages: Array<{ from: string; content: string }>; ended: boolean; endReason: string | null };

    // Project gameState into a flat list of feed items, then we group by phase
    // and filter by active tab.
    let items = $derived.by<FeedItem[]>(() => {
        const out: FeedItem[] = [];
        for (const m of game.messages || []) {
            out.push({
                kind: 'message',
                power: m.from,
                to: m.to,
                content: m.content,
                round: m.round ?? 0,
                phase: m.turn || 'current'
            });
        }
        const seen = new Set<string>();
        const allCalls = [...(game.calls_history || []), ...(game.calls || [])] as any[];
        for (const c of allCalls) {
            if (!c?.id || seen.has(c.id)) continue;
            seen.add(c.id);
            out.push({
                kind: 'call',
                initiator: c.initiator,
                recipient: c.recipient,
                topic: c.topic,
                round: c.round ?? 0,
                phase: c.phase || 'current',
                messages: c.messages || [],
                ended: c.ended ?? true,
                endReason: c.end_reason ?? null
            });
        }
        for (const c of [...(game.commitments_history || []), ...(game.commitments || [])] as any[]) {
            out.push({
                kind: 'commitment',
                power: c.power,
                text: c.text || '',
                type: c.type || '',
                kept: c.kept ?? null,
                phase: c.declared_at || c.resolved_at || 'current'
            });
        }
        return out;
    });

    let filtered = $derived(
        activeTab === 'ALL'
            ? items
            : items.filter((it) => {
                  if (it.kind === 'message') return it.power === activeTab || it.to === activeTab;
                  if (it.kind === 'commitment') return it.power === activeTab;
                  if (it.kind === 'call') return it.initiator === activeTab || it.recipient === activeTab;
                  return false;
              })
    );

    // Phase groups, oldest first.
    let groups = $derived.by(() => {
        const byPhase: Record<string, FeedItem[]> = {};
        for (const it of filtered) {
            (byPhase[it.phase] ||= []).push(it);
        }
        return Object.entries(byPhase).map(([phase, evts]) => ({ phase, events: evts }));
    });
</script>

<aside class="rounded-md border border-border bg-bg-elev flex flex-col h-full overflow-hidden">
    <!-- Tab bar — text-only tabs, evenly spaced. Active gets a subtle bg + an
         accent-colored bottom underline. Matches the old layout's restraint. -->
    <div class="feed-tabs grid grid-cols-8 border-b border-border">
        <button
            class="feed-tab"
            class:active={activeTab === 'ALL'}
            onclick={() => (activeTab = 'ALL')}
        >All</button>
        {#each POWERS as p}
            <button
                class="feed-tab"
                class:active={activeTab === p}
                onclick={() => (activeTab = p)}
                title={p}
                style="--tab-color: var(--power-{p.toLowerCase()});"
            >{p.slice(0, 3)}</button>
        {/each}
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto p-3 space-y-4">
        {#if !groups.length}
            <div class="empty-state">No activity yet. Click an action to begin.</div>
        {:else}
            {#each groups as g}
                <section>
                    <h3 class="text-xs uppercase tracking-wider text-fg-muted mb-2 flex items-center gap-2">
                        <span>{g.phase}</span>
                        <span class="text-fg">·</span>
                        <span class="text-fg">{g.events.length}</span>
                    </h3>
                    <ul class="flex flex-col gap-2">
                        {#each g.events as e}
                            {#if e.kind === 'message'}
                                <li class="rounded-md border border-border bg-bg p-2 text-sm">
                                    <div class="flex items-center gap-2 text-xs text-fg-muted mb-1">
                                        <Mail size={12} />
                                        <span class="font-bold" style="color: var(--power-{e.power.toLowerCase()})">{e.power}</span>
                                        <span>→</span>
                                        <span class="font-bold" style="color: var(--power-{e.to.toLowerCase()})">{e.to}</span>
                                        <span class="text-fg-muted">· r{(e.round ?? 0) + 1}</span>
                                    </div>
                                    <div class="leading-relaxed">{e.content}</div>
                                </li>
                            {:else if e.kind === 'commitment'}
                                <li class="rounded-md border border-border bg-bg p-2 text-sm">
                                    <div class="flex items-center gap-2 text-xs text-fg-muted mb-1">
                                        <Scale size={12} />
                                        <span class="font-bold" style="color: var(--power-{e.power.toLowerCase()})">{e.power}</span>
                                        <span>commitment</span>
                                        {#if e.type}<span class="text-fg-muted">· {e.type}</span>{/if}
                                        {#if e.kept === true}
                                            <span class="ml-auto text-accent">kept</span>
                                        {:else if e.kept === false}
                                            <span class="ml-auto text-danger">broken</span>
                                        {:else}
                                            <span class="ml-auto text-fg-muted">open</span>
                                        {/if}
                                    </div>
                                    <div class="leading-relaxed">{e.text}</div>
                                </li>
                            {:else if e.kind === 'call'}
                                <li class="rounded-md border border-border bg-bg p-2 text-sm">
                                    <div class="flex items-center gap-2 text-xs text-fg-muted mb-1">
                                        <Phone size={12} />
                                        <span class="font-bold" style="color: var(--power-{e.initiator.toLowerCase()})">{e.initiator}</span>
                                        <span>⇆</span>
                                        <span class="font-bold" style="color: var(--power-{e.recipient.toLowerCase()})">{e.recipient}</span>
                                        <span class="text-fg-muted">· r{(e.round ?? 0) + 1}</span>
                                    </div>
                                    <div class="font-semibold mb-1">{e.topic}</div>
                                    <ol class="space-y-1 text-xs">
                                        {#each e.messages as m}
                                            <li>
                                                <span class="font-bold" style="color: var(--power-{m.from.toLowerCase()})">{m.from}:</span>
                                                {m.content}
                                            </li>
                                        {/each}
                                    </ol>
                                    {#if e.ended && e.endReason}
                                        <div class="text-xs text-fg-muted mt-1 italic">— {e.endReason}</div>
                                    {/if}
                                </li>
                            {/if}
                        {/each}
                    </ul>
                </section>
            {/each}
        {/if}

        <!-- Live tail: WS events arriving during the current phase, last 12 -->
        {#if liveLog.length}
            <section>
                <h3 class="text-xs uppercase tracking-wider text-fg-muted mb-2 flex items-center gap-2">
                    <MessageSquare size={12} /> Live
                </h3>
                <ul class="text-xs font-mono space-y-1">
                    {#each liveLog.slice(-12).reverse() as line}
                        <li class="text-fg-muted break-words">{line}</li>
                    {/each}
                </ul>
            </section>
        {/if}
    </div>
</aside>
