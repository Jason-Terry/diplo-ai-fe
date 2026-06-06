<script lang="ts">
    import Header from '$lib/components/Header.svelte';
    import AccountNav from '$lib/components/AccountNav.svelte';
    import { user } from '$lib/stores/user';
    import { goto } from '$app/navigation';
    import { pushToast, loginModalOpen } from '$lib/stores/ui';
    import {
        listPersonas,
        listPersonaTemplates,
        createPersona,
        updatePersona,
        deletePersona,
        ApiError,
        type Persona,
        type PersonaTemplate
    } from '$lib/api';
    import {
        ArrowLeft,
        Drama,
        Plus,
        Pencil,
        Trash2,
        Save,
        X as XIcon,
        Copy
    } from 'lucide-svelte';
    import { onMount } from 'svelte';

    let personas = $state<Persona[]>([]);
    let templates = $state<PersonaTemplate[]>([]);
    let loading = $state(true);
    let error = $state('');

    // Editor state. editing.id == null means "creating new".
    type Editor = { id: string | null; label: string; summary: string; rulesText: string };
    let editor = $state<Editor | null>(null);
    let saving = $state(false);
    let saveError = $state('');

    let templatePickerOpen = $state(false);

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
            const [p, t] = await Promise.all([listPersonas(), listPersonaTemplates()]);
            personas = p;
            templates = t.templates;
        } catch (e: any) {
            error = e instanceof ApiError ? e.message : (e?.message || 'Failed to load');
        } finally {
            loading = false;
        }
    }

    function startCreate() {
        editor = { id: null, label: '', summary: '', rulesText: '' };
        saveError = '';
        templatePickerOpen = false;
    }

    function startEdit(p: Persona) {
        editor = {
            id: p.id,
            label: p.label,
            summary: p.summary,
            rulesText: (p.rules || []).join('\n')
        };
        saveError = '';
        templatePickerOpen = false;
    }

    function cancelEdit() {
        editor = null;
        saveError = '';
    }

    function applyTemplate(t: PersonaTemplate) {
        editor = {
            id: null,
            label: t.label,
            summary: t.summary,
            rulesText: (t.rules || []).join('\n')
        };
        templatePickerOpen = false;
        saveError = '';
    }

    async function save() {
        if (!editor || saving) return;
        const label = editor.label.trim();
        if (!label) { saveError = 'Label is required.'; return; }
        const rules = editor.rulesText.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
        const body = { label, summary: editor.summary.trim(), rules };
        saving = true;
        saveError = '';
        try {
            const result = editor.id
                ? await updatePersona(editor.id, body)
                : await createPersona(body);
            if (editor.id) {
                personas = personas.map((p) => (p.id === result.id ? result : p));
            } else {
                personas = [...personas, result];
            }
            editor = null;
            pushToast('success', `Persona ${editor === null ? 'saved' : 'saved'}.`);
        } catch (e: any) {
            saveError = e instanceof ApiError ? e.message : (e?.message || 'Save failed');
        } finally {
            saving = false;
        }
    }

    async function remove(p: Persona) {
        if (!confirm(`Delete the persona "${p.label}"? This can't be undone.`)) return;
        try {
            await deletePersona(p.id);
            personas = personas.filter((x) => x.id !== p.id);
            if (editor?.id === p.id) editor = null;
            pushToast('info', `Persona "${p.label}" deleted.`);
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
        <div class="empty-state">Sign in to manage your personas.</div>
    {:else if loading}
        <div class="empty-state">Loading…</div>
    {:else if error}
        <div class="empty-state" style="color: var(--color-danger);">{error}</div>
    {:else}
        <section class="acc-card">
            <header class="acc-card-header">
                <Drama size={16} /><h2>Personas</h2>
            </header>
            <p class="acc-card-sub">
                A persona is a personality you can apply to a power when you start a
                game. Each one has a label, an optional summary, and a list of rules
                that get injected into the agent's system prompt, one per line. Start
                from a template if you want a head start.
            </p>
            {#if !editor}
                <div class="acc-actions">
                    <div class="template-wrap">
                        <button class="btn-ghost small"
                                onclick={() => (templatePickerOpen = !templatePickerOpen)}>
                            <Copy size={12} /> Clone from template
                        </button>
                        {#if templatePickerOpen}
                            <div class="template-menu" role="menu">
                                {#each templates as t}
                                    <button class="template-item" onclick={() => applyTemplate(t)}>
                                        <div class="template-label">{t.label}</div>
                                        {#if t.summary}
                                            <div class="template-summary">{t.summary}</div>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <button class="btn-primary" onclick={startCreate}>
                        <Plus size={14} /> New persona
                    </button>
                </div>
            {/if}
        </section>

        <!-- Editor -->
        {#if editor}
            <section class="acc-card">
                <header class="acc-card-header">
                    <Pencil size={16} />
                    <h2>{editor.id ? 'Edit persona' : 'New persona'}</h2>
                </header>
                <form class="acc-form" onsubmit={(e) => { e.preventDefault(); save(); }}>
                    <div>
                        <label class="field-label" for="p-label">Label</label>
                        <input id="p-label" class="field-input" maxlength="64"
                               bind:value={editor.label} required />
                    </div>
                    <div>
                        <label class="field-label" for="p-summary">Summary <span class="field-hint inline">(optional)</span></label>
                        <input id="p-summary" class="field-input" maxlength="240"
                               bind:value={editor.summary}
                               placeholder="One sentence shown next to this persona in the setup modal." />
                    </div>
                    <div>
                        <label class="field-label" for="p-rules">Rules <span class="field-hint inline">(one per line)</span></label>
                        <textarea id="p-rules" class="field-input field-textarea"
                                  rows="8"
                                  bind:value={editor.rulesText}
                                  placeholder={'e.g.\nNever attack a neighbour without warning.\nKeep one binding ally at all times.\nLie sparingly. Broken promises cost trust.'}></textarea>
                    </div>
                    {#if saveError}
                        <div class="field-error">{saveError}</div>
                    {/if}
                    <div class="acc-actions">
                        <button type="button" class="btn-ghost" onclick={cancelEdit}>
                            <XIcon size={12} /> Cancel
                        </button>
                        <button class="btn-primary" disabled={saving || !editor.label.trim()}>
                            <Save size={14} /> {saving ? 'Saving…' : 'Save persona'}
                        </button>
                    </div>
                </form>
            </section>
        {/if}

        <!-- List -->
        {#if personas.length}
            <section class="acc-card">
                <header class="acc-card-header">
                    <h2>Your personas</h2>
                </header>
                <ul class="persona-list">
                    {#each personas as p}
                        <li class="persona-row">
                            <div class="persona-meta">
                                <div class="persona-label">{p.label}</div>
                                {#if p.summary}
                                    <div class="persona-summary">{p.summary}</div>
                                {/if}
                                {#if p.rules.length}
                                    <div class="persona-rules-count">{p.rules.length} rule{p.rules.length === 1 ? '' : 's'}</div>
                                {/if}
                            </div>
                            <div class="persona-actions">
                                <button class="btn-ghost small" onclick={() => startEdit(p)}>
                                    <Pencil size={12} /> Edit
                                </button>
                                <button class="btn-ghost small" onclick={() => remove(p)}>
                                    <Trash2 size={12} /> Delete
                                </button>
                            </div>
                        </li>
                    {/each}
                </ul>
            </section>
        {:else}
            <div class="empty-state">
                No personas yet. Use <em>Clone from template</em> or <em>New persona</em>.
            </div>
        {/if}
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
    .field-textarea {
        font-family: var(--font-mono);
        font-size: 0.82rem;
        resize: vertical;
        min-height: 140px;
        line-height: 1.55;
    }
    .acc-actions {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-top: 4px;
        flex-wrap: wrap;
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

    .template-wrap { position: relative; }
    .template-menu {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 20;
        min-width: 260px;
        max-height: 280px;
        overflow-y: auto;
        background: var(--color-bg-elev);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        box-shadow: var(--shadow-elev);
        padding: 4px;
    }
    .template-item {
        display: block;
        width: 100%;
        text-align: left;
        background: transparent;
        border: none;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        color: var(--color-fg);
        transition: background 0.12s;
    }
    .template-item:hover { background: var(--color-surface-strong); }
    .template-label {
        font-weight: 700;
        font-size: 0.84rem;
        color: var(--color-fg);
    }
    .template-summary {
        font-size: 0.74rem;
        color: var(--color-fg-muted);
        margin-top: 2px;
        line-height: 1.4;
    }

    .persona-list {
        list-style: none;
        padding: 0;
        margin: 4px 0 0 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .persona-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 10px 12px;
        border: 1px solid var(--color-border);
        background: var(--color-surface-soft);
        border-radius: 10px;
    }
    .persona-label {
        font-weight: 700;
        font-size: 0.92rem;
        color: var(--color-fg);
    }
    .persona-summary {
        margin-top: 2px;
        font-size: 0.78rem;
        color: var(--color-fg-muted);
        line-height: 1.5;
    }
    .persona-rules-count {
        margin-top: 4px;
        font-size: 0.66rem;
        color: var(--color-fg-dim);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 700;
    }
    .persona-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
    }
</style>
