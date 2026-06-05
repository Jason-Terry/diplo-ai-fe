<script lang="ts">
    // Three-step stepper: Negotiate · Orders · Resolve. The current step
    // pulses; done steps are filled; skipped (non-Movement turn) gets a
    // strikethrough and reduced opacity.

    type Step = 'idle' | 'negotiate' | 'orders' | 'resolve' | 'done';

    type Props = {
        step: Step;
        // 'M' = Movement (negotiation enabled); 'R' / 'A' = no negotiation
        turnType?: 'M' | 'R' | 'A' | null;
    };

    let { step, turnType = 'M' }: Props = $props();

    const ORDER: Array<Exclude<Step, 'idle' | 'done'>> = ['negotiate', 'orders', 'resolve'];

    function stateFor(key: Exclude<Step, 'idle' | 'done'>): string {
        if (key === 'negotiate' && turnType !== 'M' && step !== 'idle') return 'skipped';
        if (step === 'done') return 'done';
        if (step === 'idle') return '';
        const cur = ORDER.indexOf(step as any);
        const idx = ORDER.indexOf(key);
        if (idx < cur) return 'done';
        if (idx === cur) return 'current';
        return '';
    }
</script>

<ol class="phase-stepper">
    {#each ORDER as key}
        <li class="step {stateFor(key)}" data-step={key}>
            <span class="step-dot"></span>
            <span class="step-label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
        </li>
    {/each}
</ol>
