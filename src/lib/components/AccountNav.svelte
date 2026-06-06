<script lang="ts">
    import { page } from '$app/state';
    import { User, Cpu, Drama, Sparkles } from 'lucide-svelte';

    type Item = {
        href: string;
        label: string;
        Icon: typeof User;
        soon?: boolean;
    };

    const items: Item[] = [
        { href: '/account',          label: 'Profile',  Icon: User },
        { href: '/account/models',   label: 'Models',   Icon: Cpu },
        { href: '/account/personas', label: 'Personas', Icon: Drama, soon: true },
        { href: '/account/presets',  label: 'Presets',  Icon: Sparkles, soon: true }
    ];

    function active(href: string): boolean {
        const p = page.url.pathname;
        return p === href || (href !== '/account' && p.startsWith(href + '/'));
    }
</script>

<nav class="acc-nav" aria-label="Account sections">
    {#each items as it}
        <a class="acc-nav-item" class:active={active(it.href)} class:soon={it.soon} href={it.href}>
            <it.Icon size={14} />
            <span>{it.label}</span>
            {#if it.soon}<span class="soon-pill">Soon</span>{/if}
        </a>
    {/each}
</nav>

<style>
    .acc-nav {
        display: flex;
        gap: 4px;
        background: var(--color-surface-soft);
        padding: 4px;
        border-radius: 10px;
        border: 1px solid var(--color-border);
        flex-wrap: wrap;
    }
    .acc-nav-item {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 7px;
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--color-fg-muted);
        text-decoration: none;
        transition: background 0.15s, color 0.15s;
    }
    .acc-nav-item:hover {
        background: var(--color-surface-strong);
        color: var(--color-fg);
    }
    .acc-nav-item.active {
        background: var(--color-bg-elev);
        color: var(--color-fg);
        box-shadow:
            inset 0 0 0 1px var(--color-border),
            0 1px 3px rgba(0, 0, 0, 0.08),
            inset 0 -2px 0 var(--color-accent);
    }
    .acc-nav-item.soon { opacity: 0.65; }
    .soon-pill {
        font-size: 0.6rem;
        background: var(--color-surface-strong);
        color: var(--color-fg-dim);
        padding: 1px 6px;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 700;
    }
</style>
