<script lang="ts">
    import { onMount } from 'svelte';
    import { loadMap, applyState } from '$lib/map';
    import { theme } from '$lib/stores/ui';
    import type { GameState } from '$lib/types';

    type Props = {
        game: GameState;
        /** Fired when the user clicks a unit marker — receives the unit's
         *  registry id so the parent can open a history modal. */
        onunitclick?: (unitId: string) => void;
    };
    let { game, onunitclick }: Props = $props();

    let container = $state<HTMLDivElement | null>(null);
    let svg: SVGSVGElement | null = null;

    // Delegated click handler — survives applyState() wiping + redrawing
    // the .unit-marker groups every game-state update.
    function onContainerClick(e: MouseEvent) {
        const target = e.target as Element | null;
        if (!target) return;
        const group = target.closest('.unit-marker') as SVGElement | null;
        if (!group) return;
        const id = group.getAttribute('data-unit-id');
        if (!id) return;
        e.stopPropagation();
        onunitclick?.(id);
    }

    onMount(async () => {
        if (!container) return;
        svg = await loadMap(container, '/data/map.svg');
        applyState(svg, game);
    });

    // Reapply on game change (units move, SCs flip, etc.).
    $effect(() => {
        if (svg && game) applyState(svg, game);
    });

    // Reapply on theme change so layer visibility + label colors update.
    $effect(() => {
        $theme;
        if (svg) applyState(svg, game);
    });
</script>

<div
    bind:this={container}
    class="w-full h-full overflow-hidden rounded-md border border-border bg-bg-soft"
    onclick={onContainerClick}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onContainerClick(e as unknown as MouseEvent); }}
    role="application"
    tabindex="-1"
    aria-label="Game map"
></div>
