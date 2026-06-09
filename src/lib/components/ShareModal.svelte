<script lang="ts">
    /**
     * Owner-only modal to change a game's share visibility.
     *
     * Three options:
     *   - Private  — only you can view
     *   - Shared   — anyone logged in with the URL can spectate
     *   - Public   — also appears on the /browse page
     *
     * The visibility change persists immediately on radio click (no save
     * button) — feels like a setting, not a form. URL is shown with a
     * copy button for the share-link workflow.
     */
    import { X, Lock, Link as LinkIcon, Globe, Copy, Check } from 'lucide-svelte';
    import { setGameVisibility, ApiError } from '$lib/api';
    import { pushToast } from '$lib/stores/ui';
    import type { GameVisibility } from '$lib/types';

    let {
        open = $bindable(false),
        gameId,
        visibility = $bindable<GameVisibility>('private')
    }: {
        open?: boolean;
        gameId: string;
        visibility?: GameVisibility;
    } = $props();

    let saving = $state(false);
    let copied = $state(false);

    let shareUrl = $derived(
        typeof window !== 'undefined' ? `${window.location.origin}/games/${gameId}` : ''
    );

    async function pick(next: GameVisibility) {
        if (saving || next === visibility) return;
        saving = true;
        const prev = visibility;
        visibility = next;
        try {
            await setGameVisibility(gameId, next);
        } catch (e: any) {
            // Roll back on failure.
            visibility = prev;
            pushToast(
                'error',
                e instanceof ApiError ? e.message : (e?.message || 'Could not update visibility')
            );
        } finally {
            saving = false;
        }
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(shareUrl);
            copied = true;
            setTimeout(() => (copied = false), 1500);
        } catch {
            pushToast('error', 'Could not copy to clipboard');
        }
    }

    function close() {
        if (saving) return;
        open = false;
    }
</script>

{#if open}
    <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={(e) => {
            if (e.target === e.currentTarget) close();
        }}
        onkeydown={(e) => {
            if (e.key === 'Escape') close();
        }}
    >
        <div class="modal-panel share-panel">
            <button class="modal-close" onclick={close} aria-label="Close" disabled={saving}>
                <X size={20} />
            </button>
            <h2>Share this game</h2>
            <p class="modal-sub">
                Spectators can watch but can't drive — only you can advance phases or
                start a refund.
            </p>

            <fieldset class="vis-options">
                <legend class="visually-hidden">Visibility</legend>

                <label class="vis-option" class:selected={visibility === 'private'}>
                    <input
                        type="radio"
                        name="visibility"
                        value="private"
                        checked={visibility === 'private'}
                        onchange={() => pick('private')}
                        disabled={saving}
                    />
                    <Lock size={16} />
                    <div class="vis-body">
                        <div class="vis-title">Private</div>
                        <div class="vis-detail">Only you can view this game.</div>
                    </div>
                </label>

                <label class="vis-option" class:selected={visibility === 'shared'}>
                    <input
                        type="radio"
                        name="visibility"
                        value="shared"
                        checked={visibility === 'shared'}
                        onchange={() => pick('shared')}
                        disabled={saving}
                    />
                    <LinkIcon size={16} />
                    <div class="vis-body">
                        <div class="vis-title">Anyone with the link</div>
                        <div class="vis-detail">
                            Logged-in users with the URL can spectate. Not listed publicly.
                        </div>
                    </div>
                </label>

                <label class="vis-option" class:selected={visibility === 'public'}>
                    <input
                        type="radio"
                        name="visibility"
                        value="public"
                        checked={visibility === 'public'}
                        onchange={() => pick('public')}
                        disabled={saving}
                    />
                    <Globe size={16} />
                    <div class="vis-body">
                        <div class="vis-title">Public</div>
                        <div class="vis-detail">
                            Anyone logged in can find it on the browse page.
                        </div>
                    </div>
                </label>
            </fieldset>

            {#if visibility !== 'private'}
                <div class="share-url">
                    <input class="share-url-input" type="text" value={shareUrl} readonly />
                    <button class="btn-ghost small" onclick={copy} aria-label="Copy share link">
                        {#if copied}<Check size={14} /> Copied{:else}<Copy size={14} /> Copy{/if}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .share-panel {
        max-width: 30rem;
        padding: 1.5rem 1.5rem 1.25rem;
    }
    .vis-options {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0 0 1rem;
        padding: 0;
        border: none;
    }
    .vis-option {
        display: grid;
        grid-template-columns: auto auto 1fr;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 0.875rem;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        background: var(--color-surface);
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
    }
    .vis-option:hover {
        border-color: var(--color-accent);
    }
    .vis-option.selected {
        border-color: var(--color-accent);
        background: var(--color-surface-soft);
    }
    .vis-option input {
        margin: 0;
    }
    .vis-body {
        min-width: 0;
    }
    .vis-title {
        font-weight: 700;
        font-size: 0.85rem;
        color: var(--color-fg);
    }
    .vis-detail {
        font-size: 0.75rem;
        color: var(--color-fg-muted);
        margin-top: 2px;
        line-height: 1.35;
    }
    .share-url {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.5rem 0.625rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 6px;
    }
    .share-url-input {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.78rem;
        color: var(--color-fg);
        outline: none;
    }
    .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
</style>
