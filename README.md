# diplo-ai-fe

Frontend for **Diplomacy AI** — vanilla JS + CSS, no framework. Loads the
Diplomacy SVG map, drives the FastAPI backend, streams live agent activity
over a WebSocket.

Backend lives in [`diplo-ai-be`](https://github.com/Jason-Terry/diplo-ai-be).
Canonical terminology in the backend's `docs/glossary.md`.

## Run (current plain-static dev)

The frontend is not yet wrapped in Vite + Deno. For now, serve it as a static
directory and point it at a local backend.

```bash
# In one terminal: backend
cd ../diplo-ai-be
poe dev                  # uvicorn :8000

# In another terminal: frontend
cd ../diplo-ai-fe
python3 -m http.server 5173    # any static server works
```

Open `http://localhost:5173`. The FE talks to `http://localhost:8000` for
HTTP and `ws://localhost:8000/ws/game` for the live stream — set in
`js/config.js`.

## Vite + Deno (planned)

Once scaffolding lands:

```bash
deno task dev            # Vite dev server on :5173 (HMR)
deno task build          # static assets to dist/
```

Vite replaces `import.meta.env.VITE_API_BASE_URL` at build time, so deploys
get the right Railway URLs baked in.

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
