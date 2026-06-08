<script lang="ts">
    /**
     * Refund-and-retry modal for broken free-trial games. Two states:
     *   - Under the refund cap: confirms "this will INVALIDATE this game"
     *     and offers to spin up a new one with the same settings.
     *   - At the cap: switches to a GitHub-issues link (we can't keep
     *     handing out free games forever).
     *
     * The parent decides when to open it (manual button + auto-show on
     * terminal_status === 'errored'). The component never opens itself.
     */
    import { X, AlertTriangle, ExternalLink } from 'lucide-svelte';
    import { ApiError, refundGame } from '$lib/api';
    import { user } from '$lib/stores/user';
    import { pushToast } from '$lib/stores/ui';
    import { goto } from '$app/navigation';

    let {
        open = $bindable(false),
        gameId,
        reason = 'manual'
    }: {
        open?: boolean;
        gameId: string;
        /** "manual" = user clicked the button (show "are you sure" emphasis).
         *  "auto"   = system flagged the game broken (skip the confirmation
         *             tone, lead with sympathy). */
        reason?: 'manual' | 'auto';
    } = $props();

    let submitting = $state(false);

    // Read the cap straight off the user store so the copy adapts without
    // needing the parent to plumb it through.
    let refundsUsed = $derived($user?.refunds_used ?? 0);
    let refundsLimit = $derived($user?.refunds_limit ?? 3);
    let atLimit = $derived(refundsUsed >= refundsLimit && !$user?.is_admin);

    const ISSUES_URL = 'https://github.com/Jason-Terry/diplo-ai-be/issues';

    function close() {
        if (submitting) return;
        open = false;
    }

    async function tryAgain() {
        if (submitting) return;
        submitting = true;
        try {
            const r = await refundGame(gameId);
            // Reflect the new counter immediately so a follow-up open of
            // this modal renders the right state without waiting for the
            // next /me round-trip.
            user.update((u) =>
                u ? { ...u, refunds_used: r.refunds_used, refunds_limit: r.refunds_limit } : u
            );
            open = false;
            await goto(`/games/${r.new_game_id}`);
        } catch (e: any) {
            if (e instanceof ApiError && e.status === 429) {
                // The BE just told us we're past the cap — re-render in
                // contact-us mode by bumping the local counter.
                user.update((u) =>
                    u ? { ...u, refunds_used: (u.refunds_limit ?? 3) } : u
                );
            } else {
                pushToast('error', e?.message || 'Refund failed');
            }
        } finally {
            submitting = false;
        }
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
        <div class="modal-panel refund-panel">
            <button class="modal-close" onclick={close} aria-label="Close" disabled={submitting}>
                <X size={20} />
            </button>

            <div class="refund-icon" class:atlimit={atLimit}>
                <AlertTriangle size={32} />
            </div>

            {#if atLimit}
                <h2>We seem to be having some real issues</h2>
                <p class="refund-body">
                    You've used all {refundsLimit} of your free retries. Please report what
                    happened on GitHub and we'll dig in.
                </p>
                <div class="refund-actions">
                    <a
                        class="btn-primary"
                        href={ISSUES_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Open a GitHub issue <ExternalLink size={14} />
                    </a>
                    <button class="btn-ghost" onclick={close}>Close</button>
                </div>
            {:else}
                <h2>This game seems to be having some issues</h2>
                <p class="refund-body">
                    If you'd like to try again, we'll spin up a fresh game with the same
                    settings — on us.
                </p>
                {#if reason === 'manual'}
                    <p class="refund-warn">
                        <strong>Heads up:</strong> this will <strong>invalidate</strong> the
                        current game. It will disappear from your games list and can't be
                        recovered.
                    </p>
                {/if}
                <p class="refund-meta">
                    Retry {refundsUsed + 1} of {refundsLimit}.
                </p>
                <div class="refund-actions">
                    <button class="btn-primary" onclick={tryAgain} disabled={submitting}>
                        {submitting ? 'Starting…' : 'Try again'}
                    </button>
                    <button class="btn-ghost" onclick={close} disabled={submitting}>
                        Cancel
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .refund-panel {
        max-width: 28rem;
        padding: 2rem 1.75rem 1.5rem;
    }
    .refund-icon {
        display: flex;
        justify-content: center;
        color: var(--color-warn);
        margin-bottom: 0.75rem;
    }
    .refund-icon.atlimit {
        color: var(--color-danger);
    }
    .refund-body {
        margin: 0 0 0.75rem;
        font-size: 0.95rem;
        line-height: 1.5;
        color: var(--color-fg);
    }
    .refund-warn {
        margin: 0 0 0.75rem;
        font-size: 0.85rem;
        line-height: 1.5;
        color: var(--color-fg-muted);
        padding: 0.5rem 0.75rem;
        background: var(--color-surface-soft);
        border-left: 3px solid var(--color-warn);
        border-radius: 0 4px 4px 0;
    }
    .refund-meta {
        margin: 0 0 1.25rem;
        font-size: 0.78rem;
        color: var(--color-fg-dim);
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }
    .refund-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
    }
</style>
