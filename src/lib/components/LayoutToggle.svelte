<script lang="ts">
    import { layoutMode } from '$lib/stores/ui';
    import { MessageCircle, Globe } from 'lucide-svelte';

    // Show the icon for what clicking will do next: in map mode show chat
    // bubble (→ dialog), in dialog mode show globe (→ map).
    function toggle() {
        layoutMode.update((m) => (m === 'dialog' ? 'map' : 'dialog'));
    }
</script>

<button
    class="icon-btn"
    onclick={toggle}
    title={$layoutMode === 'dialog' ? 'Switch to map layout' : 'Switch to dialog layout'}
    aria-label="Toggle layout"
>
    {#if $layoutMode === 'dialog'}
        <Globe size={18} />
    {:else}
        <MessageCircle size={18} />
    {/if}
</button>
