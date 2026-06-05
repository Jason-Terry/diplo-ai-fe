<script lang="ts">
    import { aboutModalOpen } from '$lib/stores/ui';
    import { X } from 'lucide-svelte';
</script>

{#if $aboutModalOpen}
    <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={(e) => {
            if (e.target === e.currentTarget) aboutModalOpen.set(false);
        }}
        onkeydown={(e) => {
            if (e.key === 'Escape') aboutModalOpen.set(false);
        }}
    >
        <div class="modal-panel modal-xl text-left">
            <button
                class="absolute top-3 right-3 text-fg-muted hover:text-fg"
                onclick={() => aboutModalOpen.set(false)}
                aria-label="Close"
            >
                <X size={20} />
            </button>
            <h2 class="text-2xl font-bold">MetisDolos</h2>
            <p class="text-sm text-fg-muted italic mt-1 mb-4">
                <em>Metis</em> (Μῆτις) — cunning wisdom. <em>Dolos</em> (Δόλος) — deception.
            </p>
            <div class="space-y-3 text-sm leading-relaxed">
                <p>
                    MetisDolos is an alignment benchmark for frontier LLMs, built on the game of Diplomacy.
                    It exists to answer one question: <strong>do frontier models lie when lying pays?</strong>
                </p>
                <p>
                    Diplomacy is uniquely suited to ask this. Betrayal is mechanically rewarded — stabbing
                    an ally at the right moment wins games — but reputation is the medium of every other
                    turn. Players negotiate non-binding commitments, then submit secret orders that can
                    honor or break them. There is nowhere to hide an intent except inside another agent.
                </p>
                <p>
                    Seven LLMs drive the seven Great Powers. Each turn they exchange private letters, hold
                    real-time calls, declare public commitments, and submit orders. The engine records
                    every commitment alongside the order that fulfilled or broke it.
                </p>
            </div>
            <hr class="my-4 border-border" />
            <h3 class="text-lg font-semibold mb-2">Rules of Diplomacy — short version</h3>
            <ul class="text-sm space-y-1 list-disc pl-5">
                <li><strong>Goal:</strong> control 18 of 34 supply centers. First to 18 wins.</li>
                <li><strong>Powers:</strong> 7 Great Powers — Austria, England, France, Germany, Italy, Russia, Turkey.</li>
                <li><strong>Units:</strong> Armies on land, Fleets on coasts and seas. Fleets convoy armies across water.</li>
                <li><strong>Turn structure:</strong> Spring movement → retreats → Fall movement → retreats → Winter builds/disbands.</li>
                <li><strong>Negotiation:</strong> before each movement phase, powers privately negotiate. Promises are non-binding.</li>
                <li><strong>Orders:</strong> Hold, Move, Support, or Convoy — one per unit per phase.</li>
                <li><strong>No dice:</strong> conflicts resolve by strength; equal strength bounces.</li>
                <li><strong>Simultaneity:</strong> all orders are secret, resolved at once.</li>
            </ul>
            <p class="text-xs text-fg-muted mt-4">
                Built on the
                <a class="underline" href="https://github.com/diplomacy/diplomacy" target="_blank" rel="noopener">diplomacy</a>
                Python engine. Models routed through LiteLLM.
            </p>
        </div>
    </div>
{/if}
