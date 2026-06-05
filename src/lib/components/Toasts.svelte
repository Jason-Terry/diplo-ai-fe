<script lang="ts">
    import { toasts } from '$lib/stores/ui';
</script>

<div class="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
    {#each $toasts as t (t.id)}
        <div
            class="px-4 py-2 rounded-md shadow-lg text-sm border bg-bg-elev"
            class:border-accent={t.kind === 'success'}
            class:border-danger={t.kind === 'error'}
            class:border-border={t.kind === 'info'}
        >
            {t.text}
        </div>
    {/each}
</div>
