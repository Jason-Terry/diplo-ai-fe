<script lang="ts">
    import ThemeToggle from './ThemeToggle.svelte';
    import LayoutToggle from './LayoutToggle.svelte';
    import UserMenu from './UserMenu.svelte';
    import { aboutModalOpen } from '$lib/stores/ui';
    import { Info } from 'lucide-svelte';

    type Props = {
        gameId?: string | null;
        showLayoutToggle?: boolean;
        center?: import('svelte').Snippet;
        actions?: import('svelte').Snippet;
    };
    let {
        gameId = null,
        showLayoutToggle = false,
        center,
        actions
    }: Props = $props();
</script>

<header class="app-header">
    <div class="brand">
        <button
            class="logo-btn"
            onclick={() => aboutModalOpen.set(true)}
            title="About this project"
            aria-label="About"
        >
            <Info size={15} />
        </button>
        <a href="/" class="no-underline" style="text-decoration: none;">
            <h1>Metis<span class="brand-accent">Dolos</span></h1>
        </a>
        <button class="about-link" onclick={() => aboutModalOpen.set(true)}>What is this?</button>
        {#if gameId}
            <span class="ml-2 text-xs text-fg-muted font-mono">#{gameId}</span>
        {/if}
    </div>

    <div class="phase-tracker">
        {#if center}
            {@render center()}
        {/if}
    </div>

    <div class="controls">
        {#if actions}
            {@render actions()}
        {/if}
        {#if showLayoutToggle}
            <LayoutToggle />
        {/if}
        <ThemeToggle />
        <UserMenu />
    </div>
</header>
