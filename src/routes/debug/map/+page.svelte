<script lang="ts">
    // Visual probe: render the map with a synthetic unit in EVERY province
    // so we can eyeball positioning all at once. Land provinces get an Army
    // pip, seas get a Fleet pip. Power color cycles so adjacent units
    // visually separate.
    //
    // NOTE: This page makes up its own GameState — no BE call required.
    // Run locally with `npm run dev` and open /debug/map.

    import MapView from '$lib/components/Map.svelte';
    import UnitHistoryModal from '$lib/components/UnitHistoryModal.svelte';
    import { KNOWN_PROVINCES, SEA_PROVINCES } from '$lib/map';
    import type { GameState, Unit } from '$lib/types';
    import { theme } from '$lib/stores/ui';
    import { onMount } from 'svelte';

    const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'] as const;

    let activeUnitId = $state<string | null>(null);

    // Override the default Army-on-land / Fleet-on-sea so we can probe how
    // fleets sit on specific coastal land provinces. Naples is coastal so
    // either a fleet or an army can live there — force fleet here to test.
    const FORCE_FLEET: ReadonlySet<string> = new Set(['NAP']);

    // Synthetic "last phase" moves used to exercise the transit-arrow
    // renderer. Each tuple lands a unit at `to` after coming from `from`.
    // The source province ends up empty (the unit moved away) so we don't
    // double-pip the from/to provinces.
    const SYNTH_TRANSITS: Array<{ to: string; from: string }> = [
        // Short land hop
        { from: 'MUN', to: 'TYR' },
        // Mid-distance
        { from: 'WAR', to: 'GAL' },
        // Sea crossing (fleet route across English Channel)
        { from: 'LON', to: 'ENG' },
        // Long arc through the Tyrrhenian (Italian fleet from Rome)
        { from: 'ROM', to: 'TYS' },
        // North-leg sea hop
        { from: 'STP', to: 'BAR' },
        // Diagonal
        { from: 'CON', to: 'BUL' }
    ];
    // Must contain the literal "MOVEMENT" — drawTransits filters to
    // Movement-phase moves only (retreats also emit `moved` events).
    const SYNTH_LAST_PHASE = 'SPRING 1901 MOVEMENT';

    // Build the synthetic game state once. ONE unit per province (all 75),
    // power cycles so adjacent units don't blend into a single color.
    // Transits are layered on top by attaching a `moved` history entry to
    // the destination province's unit — both source and destination remain
    // populated so the position probe stays exhaustive (this isn't a
    // semantically-valid Diplomacy state, it's a visual harness).
    const fakeGame: GameState = (() => {
        const units: Unit[] = [];

        KNOWN_PROVINCES.forEach((abbr, i) => {
            const power = POWERS[i % POWERS.length];
            const isSea = SEA_PROVINCES.has(abbr) || FORCE_FLEET.has(abbr);
            units.push({
                id: `dbg-${abbr}`,
                type: isSea ? 'Fleet' : 'Army',
                power,
                location: abbr,
                raw: `${isSea ? 'F' : 'A'} ${abbr}`
            } as Unit);
        });

        // Attach synthetic history to the destination unit of each transit so
        // the arrow renderer has a `moved` event to find. We also give every
        // OTHER unit a minimal "born" entry so clicking opens a non-empty
        // history modal (useful for verifying click targets across the map).
        const units_registry: Record<string, { history: Array<{ phase: string; kind: string; from?: string; to?: string; location?: string }>; born_at: string; born_at_location: string; current_location: string; power: string; type: string; id: string; dissolved_at: string | null; dissolved_reason: string | null }> = {};
        units.forEach((u) => {
            units_registry[u.id] = {
                id: u.id,
                power: u.power,
                type: u.type,
                born_at: 'DEBUG SETUP',
                born_at_location: u.location,
                current_location: u.location,
                dissolved_at: null,
                dissolved_reason: null,
                history: [{ phase: 'DEBUG SETUP', kind: 'born', location: u.location }]
            };
        });
        SYNTH_TRANSITS.forEach((t) => {
            const destId = `dbg-${t.to}`;
            if (units_registry[destId]) {
                units_registry[destId].history.push({
                    phase: SYNTH_LAST_PHASE,
                    kind: 'moved',
                    from: t.from,
                    to: t.to
                });
            }
        });

        return {
            game_id: '__debug__',
            turn: { year: 1901, season: 'Spring', phase: 'Movement', type: 'M' },
            phase_step: 'negotiate',
            powers: Object.fromEntries(
                POWERS.map((p) => [p, { status: 'active', controller: 'debug', centers: 0, units: 0, home_centers: [] }])
            ) as any,
            units,
            dislodged: [],
            supply_centers: {},
            orderable: {} as any,
            adjustments: {} as any,
            messages: [],
            last_results: {},
            notes: {} as any,
            commitments: [],
            commitments_history: [],
            last_phase: SYNTH_LAST_PHASE,
            last_phase_orders: {} as any,
            calls: [],
            calls_history: [],
            units_registry: units_registry as any,
            winner: null,
            is_complete: false,
            agents_config: {} as any,
            initialized: true,
            negotiation_rounds: 0
        };
    })();

    onMount(() => {
        // Force parchment for the screenshot pass — the printed cartography
        // reads way better against cream than against the dark walnut.
        if ($theme !== 'parchment') theme.set('parchment');
    });
</script>

<main class="debug-page">
    <header class="debug-header">
        <h1>Map position probe</h1>
        <p>
            One synthetic unit per province ({KNOWN_PROVINCES.length} total). Land = Army, sea = Fleet.
            Click any unit to confirm its hit area; hover for the province name.
            Anything sitting near a border, on top of a label, or off in a corner is
            a candidate for <code>PROVINCE_CENTER_OVERRIDES</code> in <code>src/lib/map.ts</code>.
        </p>
        <div class="legend">
            {#each POWERS as p, i}
                <span class="legend-pip" style="background: var(--power-{p.toLowerCase()})">{p[0]}</span>
            {/each}
        </div>
    </header>

    <div class="map-wrap">
        <section class="map-frame">
            <MapView game={fakeGame} onunitclick={(id) => (activeUnitId = id)} />
        </section>
    </div>

    <footer class="debug-footer">
        {#if activeUnitId}
            <span>Last click: <code>{activeUnitId}</code> ({activeUnitId.replace('dbg-', '')})</span>
        {:else}
            <span>Click a unit to confirm its hit area, or open the history modal.</span>
        {/if}
    </footer>
</main>

<UnitHistoryModal
    unitId={activeUnitId}
    game={fakeGame}
    onclose={() => (activeUnitId = null)}
/>

<style>
    /* Page fills the viewport and never scrolls — the map card resizes to
       fit whatever's left after the header + footer claim their space. */
    .debug-page {
        height: 100vh;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        box-sizing: border-box;
        overflow: hidden;
    }
    .debug-header { flex: 0 0 auto; }
    .debug-header h1 {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 700;
        font-size: 1.2rem;
        margin: 0;
        color: var(--color-fg);
    }
    .debug-header p {
        font-size: 0.8rem;
        line-height: 1.45;
        color: var(--color-fg-muted);
        margin: 2px 0 0;
        max-width: 80ch;
    }
    .debug-header code {
        background: var(--color-surface-soft);
        padding: 1px 5px;
        border-radius: 4px;
        font-family: var(--font-mono);
        font-size: 0.74rem;
    }
    .legend {
        display: flex;
        gap: 4px;
        margin-top: 4px;
    }
    .legend-pip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        font-weight: 700;
        font-size: 0.65rem;
        color: white;
        font-family: var(--font-sans);
        border: 1px solid rgba(0, 0, 0, 0.25);
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
    }

    /* Centered, aspect-correct card. Width is the smaller of:
         a) viewport width minus the page gutter, OR
         b) the remaining vertical space × the map aspect.
       aspect-ratio derives the height from whatever width wins.
       --chrome-h is a conservative budget for the header + footer + paddings
       — sized large enough that the card never pushes them out. */
    .map-wrap {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    .map-frame {
        --chrome-h: 200px;
        --gutter: 32px;
        --aspect: 1.35;
        width: min(
            calc(100vw - var(--gutter)),
            calc((100vh - var(--chrome-h)) * var(--aspect))
        );
        aspect-ratio: var(--aspect);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: var(--shadow-card);
    }
    .debug-footer {
        flex: 0 0 auto;
        font-size: 0.78rem;
        color: var(--color-fg-muted);
    }
    .debug-footer code {
        background: var(--color-surface-soft);
        padding: 1px 6px;
        border-radius: 4px;
        font-family: var(--font-mono);
    }
</style>
