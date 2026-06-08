<script lang="ts">
    import { setupModalOpen, pushToast } from '$lib/stores/ui';
    import {
        createGame,
        createPreset,
        getCatalog,
        listPersonas,
        listPresets,
        ApiError,
        FREE_TRIAL_PRESET_ID,
        type Catalog,
        type CatalogModel,
        type Persona,
        type Preset
    } from '$lib/api';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { X, ArrowRight, Save, Sparkles, Plus } from 'lucide-svelte';

    const POWERS = ['ENGLAND', 'FRANCE', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'] as const;
    const NEW_FROM_SCRATCH = '__scratch__';
    const FREE_WILDCARD_ID = 'WILDCARD';  // matches account.FREE_TRIAL_POLICY_KEY on BE

    let loading = $state(true);
    let loadError = $state('');

    let catalog = $state<Catalog | null>(null);
    let personas = $state<Persona[]>([]);
    let presets = $state<Preset[]>([]);

    let selectedPreset = $state<string>(NEW_FROM_SCRATCH);

    // Per-power state. Keyed by power name.
    let slots = $state<Record<string, { model_id: string; persona_id: string }>>(
        Object.fromEntries(POWERS.map((p) => [p, { model_id: '', persona_id: '' }]))
    );

    let savePresetOpen = $state(false);
    let presetLabel = $state('');
    let presetSaving = $state(false);

    let submitting = $state(false);
    let error = $state('');

    $effect(() => {
        if ($setupModalOpen) {
            // Refresh on every open so freshly-added keys / personas show up.
            loadAll();
        }
    });

    async function loadAll() {
        loading = true;
        loadError = '';
        try {
            const [c, ps, pr] = await Promise.all([getCatalog(), listPersonas(), listPresets()]);
            catalog = c;
            personas = ps;
            presets = pr;
            // Default to free trial if it's available; otherwise scratch.
            const ft = pr.find((p) => p.id === FREE_TRIAL_PRESET_ID);
            if (ft && !ft.free_trial_used) {
                selectedPreset = ft.id;
                applyPreset(ft);
            } else {
                selectedPreset = NEW_FROM_SCRATCH;
                clearSlots();
            }
        } catch (e: any) {
            loadError = e instanceof ApiError ? e.message : (e?.message || 'Failed to load');
        } finally {
            loading = false;
        }
    }

    function close() {
        setupModalOpen.set(false);
        savePresetOpen = false;
        error = '';
    }

    function clearSlots() {
        slots = Object.fromEntries(POWERS.map((p) => [p, { model_id: '', persona_id: '' }]));
    }

    function applyPreset(p: Preset) {
        const next: typeof slots = {};
        for (const power of POWERS) {
            const slot = p.slots[power];
            next[power] = slot
                ? { model_id: slot.model_id, persona_id: slot.persona_id }
                : { model_id: '', persona_id: '' };
        }
        slots = next;
    }

    function onPresetChange() {
        if (selectedPreset === NEW_FROM_SCRATCH) {
            clearSlots();
            return;
        }
        const p = presets.find((x) => x.id === selectedPreset);
        if (p) applyPreset(p);
    }

    // Free trial includes the built-in Wildcard persona that the user might
    // not have in their own list. Render an extra option so the dropdown
    // can display "Wildcard (free trial)" instead of looking empty.
    let personaOptions = $derived.by(() => {
        const out = personas.map((p) => ({ id: p.id, label: p.label, kind: 'mine' }));
        if (selectedPreset === FREE_TRIAL_PRESET_ID) {
            out.unshift({ id: FREE_WILDCARD_ID, label: 'Wildcard (free trial)', kind: 'trial' });
        }
        return out;
    });

    let availableModels = $derived<CatalogModel[]>(catalog?.available_models || []);

    let isFreeTrial = $derived(selectedPreset === FREE_TRIAL_PRESET_ID);
    let freeTrialUsed = $derived(
        !!presets.find((p) => p.id === FREE_TRIAL_PRESET_ID && p.free_trial_used)
    );
    // The BE attaches a hand-written one-liner to the free-trial preset
    // ("On us, once per account...") — surface it in the modal subtitle
    // so first-time players know what they're agreeing to.
    let freeTrialSummary = $derived(
        presets.find((p) => p.id === FREE_TRIAL_PRESET_ID)?.summary || ''
    );

    let canStart = $derived.by(() => {
        if (isFreeTrial) return !freeTrialUsed;
        return POWERS.every((p) => slots[p].model_id && slots[p].persona_id);
    });

    let missingRequirements = $derived.by(() => {
        const out: string[] = [];
        if (!isFreeTrial) {
            if (!availableModels.length) {
                out.push('You haven\'t added any API keys yet.');
            }
            if (!personas.length) {
                out.push('You haven\'t created any personas yet.');
            }
        }
        return out;
    });

    async function start() {
        if (submitting || !canStart) return;
        error = '';
        submitting = true;
        try {
            const result = isFreeTrial
                ? await createGame({ preset_id: FREE_TRIAL_PRESET_ID })
                : await createGame({ slots });
            setupModalOpen.set(false);
            pushToast('success', 'Game created');
            goto(`/games/${result.game_id}`);
        } catch (e: any) {
            error = e instanceof ApiError ? e.message : (e?.message || 'Create failed');
        } finally {
            submitting = false;
        }
    }

    async function savePreset() {
        if (presetSaving || !presetLabel.trim() || !canStart) return;
        presetSaving = true;
        try {
            const fresh = await createPreset({
                label: presetLabel.trim(),
                slots
            });
            presets = [...presets, fresh];
            selectedPreset = fresh.id;
            savePresetOpen = false;
            presetLabel = '';
            pushToast('success', `Preset "${fresh.label}" saved.`);
        } catch (e: any) {
            pushToast('error', e instanceof ApiError ? e.message : (e?.message || 'Could not save preset'));
        } finally {
            presetSaving = false;
        }
    }
</script>

{#if $setupModalOpen}
    <div class="modal-backdrop" role="dialog" aria-modal="true" tabindex="-1"
         onclick={(e) => { if (e.target === e.currentTarget) close(); }}
         onkeydown={(e) => { if (e.key === 'Escape') close(); }}>
        <div class="modal-panel modal-lg setup-modal-content">
            <button class="modal-close" onclick={close} aria-label="Close">
                <X size={20} />
            </button>
            <h2>Set the stage</h2>
            {#if !freeTrialUsed && freeTrialSummary}
                <p class="modal-sub">
                    <strong>Your first game's on us.</strong> {freeTrialSummary}
                </p>
            {:else}
                <p class="modal-sub">
                    Pick a preset to fill every slot, or set them yourself.
                    Diplo&nbsp;AI is bring-your-own-key — your tokens, your provider.
                </p>
            {/if}

            {#if loading}
                <div class="empty-state">Loading…</div>
            {:else if loadError}
                <div class="empty-state" style="color: var(--color-danger);">{loadError}</div>
            {:else if catalog}
                <!-- Preset selector -->
                <div class="preset-bar">
                    <label class="field-label" for="preset-select">
                        <Sparkles size={12} class="inline-icon" /> Preset
                    </label>
                    <select id="preset-select" class="field-input" bind:value={selectedPreset} onchange={onPresetChange}>
                        {#each presets as p}
                            <option value={p.id} disabled={p.is_free_trial && p.free_trial_used}>
                                {p.label}{p.is_free_trial && p.free_trial_used ? ' — already used' : ''}
                            </option>
                        {/each}
                        <option value={NEW_FROM_SCRATCH}>— New from scratch —</option>
                    </select>
                </div>

                {#if missingRequirements.length}
                    <div class="warn-card">
                        <p>To start a custom game, you need:</p>
                        <ul>
                            {#each missingRequirements as m}<li>{m}</li>{/each}
                        </ul>
                        <div class="acc-actions">
                            <a class="btn-ghost small" href="/account/models">
                                <Plus size={12} /> Add a model
                            </a>
                            <a class="btn-ghost small" href="/account/personas">
                                <Plus size={12} /> Add a persona
                            </a>
                        </div>
                    </div>
                {/if}

                <!-- Per-power rows -->
                <div class="slot-list">
                    {#each POWERS as power}
                        <div class="slot-row" data-power={power} style="--power-color: var(--power-{power.toLowerCase()})">
                            <span class="slot-power">{power}</span>
                            <select class="field-input"
                                    bind:value={slots[power].model_id}
                                    disabled={isFreeTrial}>
                                <option value="" disabled selected={!slots[power].model_id}>— Model —</option>
                                {#each availableModels as m}
                                    <option value={m.id}>{m.label} <span style="color: var(--color-fg-dim)">({m.provider_label})</span></option>
                                {/each}
                                {#if isFreeTrial && !availableModels.some((m) => m.id === slots[power].model_id)}
                                    <option value={slots[power].model_id}>Claude Haiku 4.5 (free trial)</option>
                                {/if}
                            </select>
                            <select class="field-input"
                                    bind:value={slots[power].persona_id}
                                    disabled={isFreeTrial}>
                                <option value="" disabled selected={!slots[power].persona_id}>— Persona —</option>
                                {#each personaOptions as p}
                                    <option value={p.id}>{p.label}</option>
                                {/each}
                            </select>
                        </div>
                    {/each}
                </div>

                <!-- Save current as preset -->
                {#if !isFreeTrial}
                    {#if savePresetOpen}
                        <div class="save-preset-form">
                            <input class="field-input" placeholder="Preset label (e.g. Opus brawl)"
                                   bind:value={presetLabel} maxlength="64" />
                            <button class="btn-ghost small" onclick={() => (savePresetOpen = false)}>Cancel</button>
                            <button class="btn-primary small" disabled={presetSaving || !presetLabel.trim() || !canStart}
                                    onclick={savePreset}>
                                {presetSaving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    {:else}
                        <div class="acc-actions">
                            <button class="btn-ghost small"
                                    disabled={!canStart}
                                    onclick={() => (savePresetOpen = true)}>
                                <Save size={12} /> Save current as preset
                            </button>
                        </div>
                    {/if}
                {/if}

                {#if error}
                    <div class="field-error">{error}</div>
                {/if}

                <div class="modal-actions">
                    <button class="btn-ghost" onclick={close}>Cancel</button>
                    <button class="btn-primary" onclick={start} disabled={submitting || !canStart}>
                        {submitting ? 'Creating…' : 'Begin the Game'}
                        {#if !submitting}<ArrowRight size={14} />{/if}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .preset-bar {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: var(--color-surface-soft);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        margin-bottom: 12px;
    }
    .preset-bar .field-label { margin: 0; white-space: nowrap; }
    .inline-icon { vertical-align: -2px; margin-right: 4px; }

    .warn-card {
        background: var(--color-surface-soft);
        border: 1px solid var(--color-danger);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 0.82rem;
        margin-bottom: 12px;
    }
    .warn-card ul { margin: 4px 0 8px 18px; color: var(--color-fg); }

    .slot-list { display: flex; flex-direction: column; gap: 8px; }
    .slot-row {
        display: grid;
        grid-template-columns: 110px 1fr 1fr;
        gap: 10px;
        align-items: center;
        background: var(--color-surface-soft);
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--color-border);
        border-left: 4px solid var(--power-color, var(--color-border));
    }
    .slot-power {
        font-weight: 700;
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        font-family: var(--font-serif);
        font-style: italic;
        color: var(--power-color, var(--color-fg));
    }

    .save-preset-form {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 8px;
        margin-top: 8px;
        padding: 8px 10px;
        background: var(--color-surface-soft);
        border: 1px solid var(--color-border);
        border-radius: 10px;
    }

    .acc-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 8px;
    }

    .field-error {
        color: var(--color-danger);
        font-size: 0.85rem;
        margin-top: 8px;
    }
</style>
