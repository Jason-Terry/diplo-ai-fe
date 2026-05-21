<script lang="ts">
    import ThemeToggle from './ThemeToggle.svelte';
    import UserMenu from './UserMenu.svelte';
    import { aboutModalOpen } from '$lib/stores/ui';
    import { Info } from 'lucide-svelte';

    type Props = { gameId?: string | null };
    let { gameId = null }: Props = $props();
</script>

<header
    class="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-bg-elev"
>
    <div class="flex items-center gap-2">
        <ThemeToggle />
        <button
            class="icon-btn"
            onclick={() => aboutModalOpen.set(true)}
            title="About MetisDolos"
            aria-label="About"
        >
            <Info size={18} />
        </button>
        <a href="/" class="font-bold text-xl tracking-tight hover:opacity-80">MetisDolos</a>
        {#if gameId}
            <span class="ml-2 text-xs text-fg-muted font-mono">/{gameId.slice(0, 12)}</span>
        {/if}
    </div>

    <div class="flex items-center gap-3">
        <slot />
        <UserMenu />
    </div>
</header>
