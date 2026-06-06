<script lang="ts">
    import Header from '$lib/components/Header.svelte';
    import AccountNav from '$lib/components/AccountNav.svelte';
    import { user } from '$lib/stores/user';
    import { goto } from '$app/navigation';
    import { pushToast, loginModalOpen } from '$lib/stores/ui';
    import {
        getCatalog,
        listApiKeys,
        addApiKey,
        revalidateApiKey,
        deleteApiKey,
        ApiError,
        type Catalog,
        type ApiKeyOut
    } from '$lib/api';
    import {
        ArrowLeft,
        Key,
        CheckCircle2,
        AlertTriangle,
        RefreshCcw,
        Trash2,
        Plus
    } from 'lucide-svelte';
    import { onMount } from 'svelte';

    let catalog = $state<Catalog | null>(null);
    let keys = $state<ApiKeyOut[]>([]);
    let loading = $state(true);
    let error = $state('');

    // Add-key form state
    let provider = $state('');
    let keyText = $state('');
    let label = $state('');
    let adding = $state(false);
    let addError = $state('');

    // Per-key revalidate/delete pending state
    let pendingId = $state<string | null>(null);

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
            [catalog, keys] = await Promise.all([getCatalog(), listApiKeys()]);
            if (!provider && catalog.providers.length) provider = catalog.providers[0].id;
        } catch (e: any) {
            error = e instanceof ApiError ? e.message : (e?.message || 'Failed to load');
        } finally {
            loading = false;
        }
    }

    async function submitAdd() {
        if (adding || !provider || !keyText.trim()) return;
        addError = '';
        adding = true;
        try {
            const fresh = await addApiKey(provider, keyText.trim(), label.trim() || undefined);
            // Upsert in-place: replace if same provider, else append.
            keys = [...keys.filter((k) => k.provider !== fresh.provider), fresh];
            keyText = '';
            label = '';
            pushToast('success', `${fresh.provider_label} key saved.`);
        } catch (e: any) {
            addError = e instanceof ApiError ? e.message : (e?.message || 'Could not save key');
        } finally {
            adding = false;
        }
    }

    async function revalidate(k: ApiKeyOut) {
        if (pendingId) return;
        pendingId = k.id;
        try {
            const fresh = await revalidateApiKey(k.id);
            keys = keys.map((x) => (x.id === k.id ? fresh : x));
            pushToast('success', `${k.provider_label} key is valid.`);
        } catch (e: any) {
            // Reload to get the new "valid: false" status from the server
            await refresh();
            pushToast('error', e instanceof ApiError ? e.message : (e?.message || 'Validation failed'));
        } finally {
            pendingId = null;
        }
    }

    async function remove(k: ApiKeyOut) {
        if (pendingId) return;
        if (!confirm(`Remove the ${k.provider_label} key ending in •${k.last4}?`)) return;
        pendingId = k.id;
        try {
            await deleteApiKey(k.id);
            keys = keys.filter((x) => x.id !== k.id);
            pushToast('info', `${k.provider_label} key removed.`);
        } catch (e: any) {
            pushToast('error', e instanceof ApiError ? e.message : (e?.message || 'Delete failed'));
        } finally {
            pendingId = null;
        }
    }

    // Providers the user has NOT added yet — surfaced as a helper in the add form.
    let availableProviders = $derived(
        catalog
            ? catalog.providers.filter((p) => !keys.some((k) => k.provider === p.id))
            : []
    );
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
        <div class="empty-state">Sign in to manage your models.</div>
    {:else if loading}
        <div class="empty-state">Loading…</div>
    {:else if error}
        <div class="empty-state" style="color: var(--color-danger);">{error}</div>
    {:else}
        <!-- Header / intro -->
        <section class="acc-card">
            <header class="acc-card-header">
                <Key size={16} /><h2>Models</h2>
            </header>
            <p class="acc-card-sub">
                Paste a provider API key once. Every model that key unlocks shows up
                in the dropdown when you start a game. Keys are encrypted at rest
                and never displayed back to you — only the last 4 characters so you
                can tell them apart.
            </p>
        </section>

        <!-- Existing keys -->
        {#if keys.length}
            <section class="acc-card">
                <header class="acc-card-header">
                    <h2>Your keys</h2>
                </header>
                <ul class="key-list">
                    {#each keys as k}
                        <li class="key-row">
                            <div class="key-meta">
                                <div class="key-row1">
                                    <span class="key-provider">{k.provider_label}</span>
                                    {#if k.label && k.label !== k.provider_label}
                                        <span class="key-label">{k.label}</span>
                                    {/if}
                                    {#if k.valid === true}
                                        <span class="key-status ok" title="Last check passed">
                                            <CheckCircle2 size={12} /> valid
                                        </span>
                                    {:else if k.valid === false}
                                        <span class="key-status bad" title="Provider rejected this key">
                                            <AlertTriangle size={12} /> rejected
                                        </span>
                                    {/if}
                                </div>
                                <div class="key-row2">
                                    <code>••••{k.last4}</code>
                                </div>
                            </div>
                            <div class="key-actions">
                                <button class="btn-ghost small"
                                        onclick={() => revalidate(k)}
                                        disabled={pendingId === k.id}>
                                    <RefreshCcw size={12} /> Re-check
                                </button>
                                <button class="btn-ghost small"
                                        onclick={() => remove(k)}
                                        disabled={pendingId === k.id}>
                                    <Trash2 size={12} /> Remove
                                </button>
                            </div>
                        </li>
                    {/each}
                </ul>
            </section>
        {/if}

        <!-- Add key -->
        <section class="acc-card">
            <header class="acc-card-header">
                <Plus size={16} /><h2>Add a key</h2>
            </header>
            <p class="acc-card-sub">
                {#if availableProviders.length}
                    You can add a key for {availableProviders.map((p) => p.label).join(', ')}.
                {:else}
                    You've added a key for every supported provider — replace one by
                    pasting a new key for the same provider here.
                {/if}
            </p>

            <form class="acc-form" onsubmit={(e) => { e.preventDefault(); submitAdd(); }}>
                <div class="acc-grid">
                    <div>
                        <label class="field-label" for="key-provider">Provider</label>
                        <select id="key-provider" class="field-input" bind:value={provider}>
                            {#if catalog}
                                {#each catalog.providers as p}
                                    <option value={p.id}>{p.label}</option>
                                {/each}
                            {/if}
                        </select>
                    </div>
                    <div>
                        <label class="field-label" for="key-label">Label <span class="field-hint inline">(optional)</span></label>
                        <input id="key-label" class="field-input" bind:value={label}
                               placeholder="e.g. Personal" maxlength="64" />
                    </div>
                </div>
                <div>
                    <label class="field-label" for="key-value">API key</label>
                    <input id="key-value" class="field-input" type="password"
                           autocomplete="off" bind:value={keyText}
                           placeholder="sk-ant-…" required />
                    <div class="field-hint">
                        We'll send one tiny request to {catalog?.providers.find((p) => p.id === provider)?.label || 'the provider'}
                        to confirm the key works before saving.
                    </div>
                </div>
                {#if addError}
                    <div class="field-error">{addError}</div>
                {/if}
                <div class="acc-actions">
                    <button class="btn-primary" disabled={adding || !keyText.trim()}>
                        {adding ? 'Validating…' : 'Save key'}
                    </button>
                </div>
            </form>
        </section>
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
    .acc-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        color: var(--color-fg-muted);
    }
    .acc-card-header h2 {
        font-size: 0.85rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        margin: 0;
        color: var(--color-fg);
    }
    .acc-card-sub {
        font-size: 0.85rem;
        color: var(--color-fg-muted);
        line-height: 1.5;
        margin: 4px 0 12px 0;
    }
    .acc-form { display: flex; flex-direction: column; gap: 12px; }
    .acc-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }
    .acc-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
    }
    .field-hint {
        font-size: 0.72rem;
        color: var(--color-fg-dim);
        margin-top: 4px;
    }
    .field-hint.inline { display: inline; margin-left: 4px; }
    .field-error {
        font-size: 0.78rem;
        color: var(--color-danger);
        margin-top: 4px;
    }

    .key-list { list-style: none; padding: 0; margin: 4px 0 0 0; display: flex; flex-direction: column; gap: 8px; }
    .key-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 10px 12px;
        border: 1px solid var(--color-border);
        background: var(--color-surface-soft);
        border-radius: 10px;
    }
    .key-row1 { display: flex; align-items: center; gap: 8px; }
    .key-row2 { margin-top: 2px; font-family: var(--font-mono); color: var(--color-fg-muted); font-size: 0.82rem; }
    .key-provider {
        font-weight: 700;
        color: var(--color-fg);
        font-size: 0.88rem;
    }
    .key-label { color: var(--color-fg-muted); font-size: 0.78rem; }
    .key-status {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.66rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        padding: 2px 6px;
        border-radius: 999px;
        font-weight: 700;
    }
    .key-status.ok {
        background: rgba(108, 138, 23, 0.12);
        color: var(--color-success);
        border: 1px solid rgba(108, 138, 23, 0.35);
    }
    .key-status.bad {
        background: rgba(193, 67, 47, 0.12);
        color: var(--color-danger);
        border: 1px solid rgba(193, 67, 47, 0.35);
    }
    .key-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
    }
</style>
