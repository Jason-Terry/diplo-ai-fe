# diplo-ai-fe

Frontend for **MetisDolos** — SvelteKit (Svelte 5) + Vite + Tailwind 4 +
Lucide, served as a static SPA. Loads the Diplomacy SVG map, drives the
FastAPI backend, streams live agent activity over a WebSocket.

Backend lives in [`diplo-ai-be`](https://github.com/Jason-Terry/diplo-ai-be).
Canonical terminology in the backend's `docs/glossary.md`.

## Setup

Install Deno once (`brew install deno` on macOS, or
`curl -fsSL https://deno.land/install.sh | sh`). No Node, npm, or Bun
required — Deno resolves the npm toolchain (Vite, SvelteKit) via `npm:`
specifiers.

```bash
cp .env.example .env     # optional — only matters at build time
```

## Run

```bash
# In one terminal: backend (see ../diplo-ai-be)
poe dev                  # uvicorn :8421

# In another terminal: frontend
deno task dev            # Vite dev server on :8420 (HMR)
```

Open `http://localhost:8420`. The FE talks to `http://localhost:8421` over
HTTP + WebSocket — URLs read from `import.meta.env.VITE_API_BASE_URL` /
`VITE_WS_BASE` (Vite inlines them at build time). `src/lib/config.ts` falls
back to localhost when they're unset.

## Build

```bash
deno task build          # static assets → build/
deno task preview        # serve build/ on :8420 for smoke-testing
deno task check          # svelte-kit sync + svelte-check (typecheck)
```

## Deploy (Railway)

The repo deploys as-is from `main`:

1. **New Project → Deploy from GitHub repo → `Jason-Terry/diplo-ai-fe`**
2. Railway reads `railway.json` and builds with `Dockerfile`. Stage 1 runs
   `deno task build`; stage 2 serves `build/` via `serve.ts` (a thin
   `jsr:@std/http/file-server` wrapper that falls back to `index.html`
   on 404s so SPA deep links like `/account` and `/games/:id` resolve).
3. **Environment variables** to set in the service's **Variables** tab
   (these are baked into the build, so changing them re-triggers a deploy):
   - `VITE_API_BASE_URL` — the deployed BE URL, e.g. `https://api.metisdolos.com`
   - `VITE_WS_BASE` — same host with `wss://` scheme, e.g. `wss://api.metisdolos.com`
4. **Networking → Generate Domain** to get the FE's public URL.
5. Add that FE URL to the BE service's `CORS_ALLOWED_ORIGINS` so the BE
   accepts cross-origin requests from it.

Healthcheck hits `/` — `serve.ts` returns `index.html`.

## Layout

```
src/
  app.html             SvelteKit shell
  app.css              Tailwind entry
  lib/
    api.ts             fetch wrapper (credentials:include) + WebSocket factory
    config.ts          VITE_API_BASE_URL / VITE_WS_BASE with localhost fallback
    types.ts           GameState / User / Persona / Preset shapes
    map.ts             imperative SVG map renderer (mutates the DOM; not reactive)
    feed.ts            FeedEvent union — message / order / commitment / call / thought
    stores/
      user.ts          user writable + bootAuth() on mount
      ui.ts            theme / layoutMode / modal state / toast dispatcher
    components/        Header, Map, DialogPanel, modals, controls
  routes/              SvelteKit file-based routing
    +layout.{ts,svelte}   prerender=true, ssr=false (SPA shell)
    +page.svelte          landing + games list
    account/              models / personas / presets pages
    games/[id]/           live game viewer
    debug/map/            map test harness
static/
  favicon.svg
  data/map.svg          Diplomacy board SVG (we toggle layers + recolor in JS)
  data/map_layout.json  province metadata
serve.ts                Deno static server with SPA fallback (runtime)
svelte.config.js        adapter-static
vite.config.ts          port 8420 fixed
Dockerfile              two-stage: Deno+Vite build → Deno static serve
railway.json            Railway build/deploy config
```
