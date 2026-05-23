import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        // SPA mode: prerender the shell, route everything else client-side.
        // The static file server falls back to index.html for unknown paths
        // so /games/:id deep-links work.
        adapter: adapter({
            fallback: 'index.html'
        }),
        // Build-time env: VITE_API_BASE_URL / VITE_WS_BASE are inlined; no
        // server-side env at runtime since we're fully static.
    }
};

export default config;
