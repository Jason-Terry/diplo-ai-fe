<script lang="ts">
    import { theme } from '$lib/stores/ui';
    import { Moon, Sun } from 'lucide-svelte';

    function toggle() {
        theme.update((t) => (t === 'dark' ? 'parchment' : 'dark'));
    }
</script>

<button
    class="icon-btn"
    onclick={toggle}
    title={$theme === 'dark' ? 'Switch to parchment' : 'Switch to dark'}
    aria-label="Toggle theme"
>
    {#if $theme === 'dark'}
        <Sun size={18} />
    {:else}
        <Moon size={18} />
    {/if}
</button>
