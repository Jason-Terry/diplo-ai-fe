<script lang="ts">
    import { X } from 'lucide-svelte';
    import type { GameState } from '$lib/types';

    type HistoryEntry =
        | { phase: string; kind: 'born'; location: string }
        | { phase: string; kind: 'ordered'; order: string }
        | { phase: string; kind: 'moved'; from: string; to: string }
        | { phase: string; kind: 'held'; location: string }
        | { phase: string; kind: 'dissolved'; from: string };

    interface UnitDoc {
        id: string;
        power: string;
        type: 'Army' | 'Fleet';
        born_at: string;
        born_at_location: string;
        current_location: string;
        dissolved_at: string | null;
        dissolved_reason: string | null;
        history: HistoryEntry[];
    }

    // Sourced from data/map_layout.json. Inlined here so the modal stays
    // self-contained and doesn't need a network round-trip to render a name.
    const PROVINCE_NAMES: Record<string, string> = {
        NAO: 'North Atlantic Ocean', NWG: 'Norwegian Sea', BAR: 'Barents Sea',
        NTH: 'North Sea', SKA: 'Skagerrak', HEL: 'Heligoland Bight', BAL: 'Baltic Sea',
        BOT: 'Gulf of Bothnia', IRI: 'Irish Sea', ENG: 'English Channel',
        MAO: 'Mid-Atlantic Ocean', WES: 'Western Mediterranean', GOL: 'Gulf of Lyon',
        TYS: 'Tyrrhenian Sea', ION: 'Ionian Sea', ADR: 'Adriatic Sea',
        AEG: 'Aegean Sea', EAS: 'Eastern Mediterranean', BLA: 'Black Sea',
        CLY: 'Clyde', EDI: 'Edinburgh', YOR: 'Yorkshire', LVP: 'Liverpool',
        WAL: 'Wales', LON: 'London',
        NWY: 'Norway', SWE: 'Sweden', FIN: 'Finland', STP: 'St. Petersburg', DEN: 'Denmark',
        HOL: 'Holland', BEL: 'Belgium', PIC: 'Picardy', BRE: 'Brest', PAR: 'Paris',
        BUR: 'Burgundy', GAS: 'Gascony', MAR: 'Marseilles', SPA: 'Spain', POR: 'Portugal',
        NAF: 'North Africa', TUN: 'Tunis',
        KIE: 'Kiel', RUH: 'Ruhr', MUN: 'Munich', BER: 'Berlin', PRU: 'Prussia',
        SIL: 'Silesia', BOH: 'Bohemia',
        LVN: 'Livonia', MOS: 'Moscow', WAR: 'Warsaw', UKR: 'Ukraine', SEV: 'Sevastopol',
        ARM: 'Armenia',
        GAL: 'Galicia', VIE: 'Vienna', TYR: 'Tyrolia', BUD: 'Budapest', TRI: 'Trieste',
        PIE: 'Piedmont', VEN: 'Venice', TUS: 'Tuscany', ROM: 'Rome', APU: 'Apulia', NAP: 'Naples',
        SER: 'Serbia', RUM: 'Rumania', BUL: 'Bulgaria', ALB: 'Albania', GRE: 'Greece',
        CON: 'Constantinople', ANK: 'Ankara', SMY: 'Smyrna', SYR: 'Syria'
    };
    function provName(code: string | undefined): string {
        if (!code) return '';
        // Strip coast suffixes (e.g. STP/SC -> STP)
        const base = code.split('/')[0].toUpperCase();
        return PROVINCE_NAMES[base] || code;
    }

    type Props = {
        unitId: string | null;
        game: GameState;
        onclose: () => void;
    };
    let { unitId, game, onclose }: Props = $props();

    let unit = $derived<UnitDoc | null>(
        unitId ? ((game.units_registry as Record<string, UnitDoc>)?.[unitId] ?? null) : null
    );
</script>

{#if unit}
    <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unit-modal-title"
        tabindex="-1"
        onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
        onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
    >
        <div class="modal-panel modal-lg unit-modal">
            <button class="modal-close" onclick={onclose} aria-label="Close">
                <X size={20} />
            </button>

            <h2 id="unit-modal-title" class="unit-modal-title">
                <span class="unit-pip" style="background: var(--power-{unit.power.toLowerCase()})"></span>
                {unit.type} ({unit.power})
            </h2>

            <p class="modal-sub">
                Born at {provName(unit.born_at_location)} during {unit.born_at}.
            </p>

            {#if unit.dissolved_at}
                <div class="unit-status dissolved">
                    Dissolved at {unit.dissolved_at}: {unit.dissolved_reason || 'unknown'}
                </div>
            {:else}
                <div class="unit-status active">
                    Currently at {provName(unit.current_location)}.
                </div>
            {/if}

            {#if unit.history && unit.history.length}
                <table class="unit-history-table">
                    <thead>
                        <tr><th>Phase</th><th>Event</th><th>Detail</th></tr>
                    </thead>
                    <tbody>
                        {#each unit.history as h}
                            <tr>
                                <td class="phase-cell">{h.phase}</td>
                                <td class="kind-cell {h.kind}">{h.kind}</td>
                                <td>
                                    {#if h.kind === 'born'}
                                        built at {provName(h.location)}
                                    {:else if h.kind === 'ordered'}
                                        <code>{h.order}</code>
                                    {:else if h.kind === 'moved'}
                                        {provName(h.from)} → {provName(h.to)}
                                    {:else if h.kind === 'held'}
                                        held at {provName(h.location)}
                                    {:else if h.kind === 'dissolved'}
                                        lost at {provName(h.from)}
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {:else}
                <div class="muted">No actions recorded yet.</div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .unit-modal { max-height: 80vh; overflow-y: auto; }
    .unit-modal-title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 4px;
    }
    .unit-pip {
        display: inline-block;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.4);
    }
    .unit-status {
        margin: 8px 0 12px 0;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 0.85rem;
    }
    .unit-status.active {
        background: rgba(108, 138, 23, 0.12);
        color: var(--color-success);
        border: 1px solid rgba(108, 138, 23, 0.35);
    }
    .unit-status.dissolved {
        background: rgba(193, 67, 47, 0.12);
        color: var(--color-danger);
        border: 1px solid rgba(193, 67, 47, 0.35);
    }
    .unit-history-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
        margin-top: 8px;
    }
    .unit-history-table thead {
        color: var(--color-fg-muted);
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.1em;
    }
    .unit-history-table th,
    .unit-history-table td {
        padding: 6px 10px;
        text-align: left;
        border-bottom: 1px solid var(--color-border);
    }
    .phase-cell {
        font-family: var(--font-mono);
        font-size: 0.78rem;
        color: var(--color-fg-dim);
        white-space: nowrap;
    }
    .kind-cell {
        text-transform: uppercase;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.05em;
    }
    .kind-cell.moved { color: var(--color-accent); }
    .kind-cell.held { color: var(--color-fg-dim); }
    .kind-cell.dissolved { color: var(--color-danger); }
    .kind-cell.born { color: var(--color-success); }
    .kind-cell.ordered { color: var(--color-warn); }
    .unit-history-table code {
        font-family: var(--font-mono);
        background: var(--color-surface-soft);
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 0.78rem;
    }
    .muted { color: var(--color-fg-dim); font-size: 0.85rem; font-style: italic; margin-top: 4px; }
</style>
