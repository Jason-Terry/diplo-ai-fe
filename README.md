# diplo-ai-fe

Frontend for **MetisDolos** — vanilla JS + CSS, no framework. Loads the
Diplomacy SVG map, drives the FastAPI backend, streams live agent activity
over a WebSocket.

Backend lives in [`diplo-ai-be`](https://github.com/Jason-Terry/diplo-ai-be).
Canonical terminology in the backend's `docs/glossary.md`.

## Setup

Install Deno once (`brew install deno` on macOS, or
`curl -fsSL https://deno.land/install.sh | sh`). No Node, npm, or Bun
required — Deno resolves Vite via `npm:` specifiers.

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
`VITE_WS_BASE` (Vite inlines them at build time). When those are unset,
`js/config.js` falls back to localhost.

## Build

```bash
deno task build          # static assets → dist/
deno task preview        # serve dist/ on :8420 for smoke-testing
```

## Deploy (Railway)

The repo deploys as-is from `main`:

1. **New Project → Deploy from GitHub repo → `Jason-Terry/diplo-ai-fe`**
2. Railway reads `railway.json` and builds with `Dockerfile`. Stage 1 runs
   `deno task build`; stage 2 serves `dist/` via `jsr:@std/http/file-server`.
3. **Environment variables** to set in the service's **Variables** tab
   (these are baked into the build, so changing them re-triggers a deploy):
   - `VITE_API_BASE_URL` — the deployed BE URL,
     e.g. `https://diplo-ai-be-production.up.railway.app`
   - `VITE_WS_BASE` — same host with `wss://` scheme,
     e.g. `wss://diplo-ai-be-production.up.railway.app`
4. **Networking → Generate Domain** to get the FE's public URL.
5. Add that FE URL to the BE service's `CORS_ALLOWED_ORIGINS` so the BE
   accepts cross-origin requests from it.

Healthcheck hits `/` — the file server serves `index.html`.

## Layout

```
index.html               app shell + modals (setup, about, unit history)
css/style.css            dark + parchment themes (bundled by Vite)
js/
  config.js              env-aware module entry — Vite inlines
                         import.meta.env.VITE_* at build time
public/                  copied verbatim into dist/ — anything here is
                         served as a static asset at the same path
  js/app.js              state machine, WebSocket client, tabs, SVG map
  data/map.svg           standard Diplomacy SVG (we toggle the hidden
                         province layer and recolor in JS)
  data/map_layout.json   province metadata
deno.json                tasks: dev / build / preview + npm:vite import map
vite.config.js           port 8420 fixed
Dockerfile               multi-stage build (Deno+Vite → Deno file_server)
railway.json             Railway build/deploy config
```
