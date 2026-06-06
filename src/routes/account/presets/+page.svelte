<script lang="ts">
    import Header from '$lib/components/Header.svelte';
    import AccountNav from '$lib/components/AccountNav.svelte';
    import { user } from '$lib/stores/user';
    import { goto } from '$app/navigation';
    import { pushToast, loginModalOpen } from '$lib/stores/ui';
    import {
        listPresets,
        deletePreset,
        listPersonas,
        getCatalog,
        ApiError,
        FREE_TRIAL_PRESET_ID,
        type Preset,
        type Persona,
        type Catalog
    } from '$lib/api';
    import { ArrowLeft, Sparkles, Trash2, Gift } from 'lucide-svelte';
    import { onMount } from 'svelte';

    const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'] as const;

    let presets = $state<Preset[]>([]);
    let personas = $state<Persona[]>([]);
    let catalog = $state<Catalog | null>(null);
    let loading = $state(true);
    let error = $state('');

    onMount(async () => {
        if (!$user) {
            loginModalOpen.set(true);
            loading = false;
            return;
        }
        await refresh();
    });

    async function refresh() {
        loading = true;
        error = '';
        try {
            [presets, personas, catalog] = await Promise.all([
                listPresets(),
                listPersonas(),
                getCatalog()
            ]);
        } catch (e: any) {
            error = e instanceof ApiError ? e.message : (e?.message || 'Failed to load');
        } finally {
            loading = false;
        }
    }

    function modelLabel(model_id: string): string {
        if (!catalog) return model_id;
        const found = [
            ...catalog.available_models,
            ...catalog.providers.flatMap((p) => p.models.map((m) => ({ ...m, provider_label: p.label })))
        ].find((m) => m.id === model_id);
        return found?.label || model_id;
    }
    function personaLabel(persona_id: string): string {
        if (persona_id === 'WILDCARD') return 'Wildcard (free trial)';
        return personas.find((p) => p.id === persona_id)?.label || persona_id;
    }

    async function remove(p: Preset) {
        if (!confirm(`Delete the preset "${p.label}"?`)) return;
        try {
            await deletePreset(p.id);
            presets = presets.filter((x) => x.id !== p.id);
            pushToast('info', `Preset "${p.label}" deleted.`);
        } catch (e: any) {
            pushToast('error', e instanceof ApiError ? e.message : (e?.message || 'Delete failed'));
        }
    }
</script>

<Header />

<main class="account-page">
    <div class="account-back">
        <button class="btn-ghost small" onclick={() => goto('/')}>
            <ArrowLeft size={12} /> Home
        </button>
    </div>

    <h1 class="account-title">Account settings</h1>

    <AccountNav />

    {#if !$user}
        <div class="empty-state">Sign in to manage your presets.</div>
    {:else if loading}
        <div class="empty-state">Loading…</div>
    {:else if error}
        <div class="empty-state" style="color: var(--color-danger);">{error}</div>
    {:else}
        <section class="acc-card">
            <header class="acc-card-header">
                <Sparkles size={16} /><h2>Presets</h2>
            </header>
            <p class="acc-card-sub">
                A preset fills all seven powers at once. Save one from the Begin Game
                screen after you've built a roster you like.
            </p>
        </section>

        {#each presets as p}
            <section class="acc-card" class:trial={p.is_free_trial}>
                <header class="acc-card-header">
                    {#if p.is_free_trial}<Gift size={16} />{:else}<Sparkles size={16} />{/if}
                    <h2>{p.label}</h2>
                    {#if p.is_free_trial}
                        <span class="trial-pill" class:used={p.free_trial_used}>
                            {p.free_trial_used ? 'used' : '1 free game'}
                        </span>
                    {/if}
                </header>
                {#if p.summary}
                    <p class="acc-card-sub">{p.summary}</p>
                {/if}
                <ul class="preset-slots">
                    {#each POWERS as power}
                        {@const s = p.slots[power]}
                        <li class="preset-slot" style="--power-color: var(--power-{power.toLowerCase()})">
                            <span class="preset-power">{power}</span>
                            <span class="preset-model">{s ? modelLabel(s.model_id) : '—'}</span>
                            <span class="preset-persona">{s ? personaLabel(s.persona_id) : '—'}</span>
                        </li>
                    {/each}
                </ul>
                {#if !p.is_free_trial}
                    <div class="acc-actions">
                        <button class="btn-ghost small" onclick={() => remove(p)}>
                            <Trash2 size={12} /> Delete
                        </button>
                    </div>
                {/if}
            </section>
        {/each}
    {/if}
</main>

<style>
    .account-page {
        max-width: 44rem;
        margin: 0 auto;
        padding: 2rem 1.5rem 4rem;
        height: calc(100vh - 64px);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .account-back { display: flex; }
    .account-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 700;
        font-size: 1.6rem;
        color: var(--color-fg);
        margin: 0.25rem 0 0.5rem;
    }
    .acc-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        padding: 1.25rem 1.5rem;
        box-shadow: var(--shadow-card);
    }
    .acc-card.trial { border-color: var(--color-warn); }
    .acc-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        color: var(--color-fg-muted);
    }
    .acc-card-header h2 {
        font-size: 0.95rem;
        font-weight: 700;
        margin: 0;
        color: var(--color-fg);
    }
    .acc-card-sub {
        font-size: 0.85rem;
        color: var(--color-fg-muted);
        line-height: 1.5;
        margin: 4px 0 12px 0;
    }
    .trial-pill {
        margin-left: auto;
        font-size: 0.62rem;
        background: var(--color-warn);
        color: white;
        padding: 1px 8px;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 700;
    }
    .trial-pill.used { background: var(--color-surface-strong); color: var(--color-fg-dim); }
    .preset-slots {
        list-style: none;
        padding: 0;
        margin: 8px 0 0;
        display: grid;
        grid-template-columns: 100px 1fr 1fr;
        gap: 4px 12px;
    }
    .preset-slot {
        display: contents;
    }
    .preset-power {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 700;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        color: var(--power-color, var(--color-fg-muted));
    }
    .preset-model, .preset-persona {
        font-size: 0.78rem;
        color: var(--color-fg-muted);
    }
    .acc-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
