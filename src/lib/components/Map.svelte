<script lang="ts">
    import { onMount } from 'svelte';
    import { loadMap, applyState } from '$lib/map';
    import { theme } from '$lib/stores/ui';
    import type { GameState } from '$lib/types';

    type Props = { game: GameState };
    let { game }: Props = $props();

    let container = $state<HTMLDivElement | null>(null);
    let svg: SVGSVGElement | null = null;

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

<div bind:this={container} class="w-full h-full overflow-hidden rounded-md border border-border bg-bg-soft"></div>
