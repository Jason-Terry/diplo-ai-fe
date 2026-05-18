# diplo-ai-fe

Frontend for **Diplomacy AI** — vanilla JS + CSS, no framework. Loads the
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

The `dist/` output is what gets deployed to Railway (static host).

## Layout

```
index.html               app shell + modals (setup, about, unit history)
css/style.css            dark + parchment themes
js/
  config.js              API_BASE_URL / WS_BASE — only env-aware file
  app.js                 state machine, WebSocket client, tabs, SVG map
data/
  map.svg                standard Diplomacy SVG (we toggle the hidden
                         province layer and recolor in JS)
  map_layout.json        province metadata
```
