// Diplomacy AI — frontend config.
//
// Vite exposes build-time env via import.meta.env.VITE_*. When this file is
// served by Vite (deno task dev or built dist/), those values get inlined.
// When served plain (e.g. python -m http.server), import.meta.env is empty
// and we fall back to localhost:8421 for the BE.
//
// Loaded as <script type="module">, so it runs before the deferred app.js.

const env = (import.meta.env || {});
window.API_BASE_URL = env.VITE_API_BASE_URL || 'http://localhost:8421';
window.WS_BASE      = env.VITE_WS_BASE      || 'ws://localhost:8421';
