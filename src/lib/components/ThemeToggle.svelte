<script lang="ts">
    import { theme } from '$lib/stores/ui';
    import { Moon, Sun } from 'lucide-svelte';

    // Button advertises what clicking will do: in parchment mode show moon
    // (→ dark), in dark mode show sun (→ parchment).
    function toggle() {
        theme.update((t) => (t === 'dark' ? 'parchment' : 'dark'));
    }
</script>

<button
    class="icon-btn"
    onclick={toggle}
    title={$theme === 'dark' ? 'Switch to parchment theme' : 'Switch to dark theme'}
    aria-label="Toggle theme"
>
    {#if $theme === 'dark'}
        <Sun size={18} />
    {:else}
        <Moon size={18} />
    {/if}
</button>
