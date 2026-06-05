<script lang="ts">
    import { setupModalOpen, pushToast } from '$lib/stores/ui';
    import { createGame, listPolicies, ApiError } from '$lib/api';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { X, Dices, RotateCcw, ArrowRight } from 'lucide-svelte';

    const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];
    const MODELS = [
        { value: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast)' },
        { value: 'anthropic/claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' }
    ];

    type PolicyDef = { label: string; summary?: string };
    function defaultConfig(): Record<string, { provider: string; policy: string }> {
        return Object.fromEntries(
            POWERS.map((p) => [p, { provider: MODELS[0].value, policy: 'WILDCARD' }])
        );
    }

    let policies = $state<Record<string, PolicyDef>>({ WILDCARD: { label: 'Wildcard', summary: '' } });
    let config = $state<Record<string, { provider: string; policy: string }>>(defaultConfig());
    let submitting = $state(false);
    let error = $state('');

    onMount(async () => {
        try {
            const data = await listPolicies();
            policies = data.policies || policies;
        } catch {
            // policies are nice-to-have; defaults still work
        }
    });

    function policyHint(power: string): string {
        return policies[config[power]?.policy]?.summary || '';
    }

    function randomize() {
        const ms = MODELS.map((m) => m.value);
        const ps = Object.keys(policies);
        const next: typeof config = {};
        for (const p of POWERS) {
            next[p] = {
                provider: ms[Math.floor(Math.random() * ms.length)],
                policy: ps.length ? ps[Math.floor(Math.random() * ps.length)] : 'WILDCARD'
            };
        }
        config = next;
    }

    function resetDefaults() {
        config = defaultConfig();
    }

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
        onclick={(e) => { if (e.target === e.currentTarget) setupModalOpen.set(false); }}
        onkeydown={(e) => { if (e.key === 'Escape') setupModalOpen.set(false); }}
    >
        <div class="modal-panel modal-lg setup-modal-content">
            <button class="modal-close" onclick={() => setupModalOpen.set(false)} aria-label="Close">
                <X size={20} />
            </button>
            <h2>Set the stage</h2>
            <p class="modal-sub">
                Cast each of the seven Great Powers. Mix and match models and personalities —
                then watch them lie to each other.
            </p>

            <div class="setup-actions-top">
                <button class="btn-ghost small" onclick={randomize}>
                    <Dices size={14} /> Randomize all
                </button>
                <button class="btn-ghost small" onclick={resetDefaults}>
                    <RotateCcw size={14} /> Reset to defaults
                </button>
            </div>

            <div class="power-configs">
                {#each POWERS as power}
                    <div
                        class="config-row"
                        data-power={power}
                        style="--power-color: var(--power-{power.toLowerCase()});"
                    >
                        <span class="config-power">{power}</span>
                        <select bind:value={config[power].provider}>
                            {#each MODELS as m}
                                <option value={m.value}>{m.label}</option>
                            {/each}
                        </select>
                        <select bind:value={config[power].policy}>
                            {#each Object.entries(policies) as [key, def]}
                                <option value={key}>{def.label}</option>
                            {/each}
                        </select>
                        {#if policyHint(power)}
                            <div class="policy-hint">{policyHint(power)}</div>
                        {/if}
                    </div>
                {/each}
            </div>

            {#if error}
                <div style="color: var(--color-danger); font-size: 0.85rem; margin-top: 0.5rem;">{error}</div>
            {/if}

            <div class="modal-actions">
                <button class="btn-ghost" onclick={() => setupModalOpen.set(false)}>Cancel</button>
                <button class="btn-primary" onclick={submit} disabled={submitting}>
                    {submitting ? 'Creating…' : 'Begin the Game'}
                    {#if !submitting}<ArrowRight size={14} />{/if}
                </button>
            </div>
        </div>
    </div>
{/if}
