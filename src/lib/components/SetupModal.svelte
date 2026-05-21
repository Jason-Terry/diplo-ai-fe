<script lang="ts">
    import { setupModalOpen, pushToast } from '$lib/stores/ui';
    import { user } from '$lib/stores/user';
    import { createGame, listPolicies, ApiError } from '$lib/api';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { X } from 'lucide-svelte';

    const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];
    const MODELS = [
        { value: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast)' },
        { value: 'anthropic/claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' }
    ];

    let policies = $state<Record<string, { label: string }>>({ WILDCARD: { label: 'Wildcard' } });
    let config = $state<Record<string, { provider: string; policy: string }>>({});
    let submitting = $state(false);
    let error = $state('');

    // Initialise per-power defaults
    for (const p of POWERS) {
        config[p] = { provider: MODELS[0].value, policy: 'WILDCARD' };
    }

    onMount(async () => {
        try {
            const data = await listPolicies();
            policies = data.policies || policies;
        } catch (e) {
            // policies are nice-to-have; defaults still work
        }
    });

    async function submit() {
        if (submitting) return;
        error = '';
        submitting = true;
        try {
            const { game_id } = await createGame(config);
            setupModalOpen.set(false);
            pushToast('success', 'Game created');
            goto(`/games/${game_id}`);
        } catch (e: any) {
            if (e instanceof ApiError && e.status === 401) {
                error = 'Sign in to create a game.';
            } else if (e instanceof ApiError && e.status === 403) {
                error = 'Verify your email to create games.';
            } else {
                error = e?.message || 'Create failed';
            }
        } finally {
            submitting = false;
        }
    }
</script>

{#if $setupModalOpen}
    <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={(e) => {
            if (e.target === e.currentTarget) setupModalOpen.set(false);
        }}
        onkeydown={(e) => {
            if (e.key === 'Escape') setupModalOpen.set(false);
        }}
    >
        <div class="modal-panel max-w-2xl">
            <button
                class="absolute top-3 right-3 text-fg-muted hover:text-fg"
                onclick={() => setupModalOpen.set(false)}
                aria-label="Close"
            >
                <X size={20} />
            </button>
            <h2 class="text-xl font-bold mb-2">Game Setup</h2>
            <p class="text-sm text-fg-muted mb-4">Pick a model and policy for each power.</p>
            <div class="grid grid-cols-[auto_1fr_1fr] gap-2 mb-4 items-center text-sm">
                {#each POWERS as power}
                    <div class="font-semibold">{power}</div>
                    <select class="field-input py-1" bind:value={config[power].provider}>
                        {#each MODELS as m}
                            <option value={m.value}>{m.label}</option>
                        {/each}
                    </select>
                    <select class="field-input py-1" bind:value={config[power].policy}>
                        {#each Object.entries(policies) as [key, def]}
                            <option value={key}>{def.label}</option>
                        {/each}
                    </select>
                {/each}
            </div>
            {#if error}
                <div class="text-danger text-sm mb-3">{error}</div>
            {/if}
            <div class="flex justify-end gap-2">
                <button class="btn-ghost" onclick={() => setupModalOpen.set(false)}>Cancel</button>
                <button class="btn-primary" onclick={submit} disabled={submitting}>
                    {submitting ? 'Creating…' : 'Start Simulation'}
                </button>
            </div>
        </div>
    </div>
{/if}
