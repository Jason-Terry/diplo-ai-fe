# Multi-stage build for diplo-ai-fe.
# Stage 1 (builder): Deno installs npm deps and runs SvelteKit's build (Vite
#   under the hood). adapter-static emits ./build/ with index.html as fallback.
# Stage 2 (runtime): serve ./build/ via serve.ts (std/http/file-server +
#   index.html fallback for unknown paths so /account and /games/:id deep
#   links resolve to the SPA shell).
#
# Railway exposes service variables as both build args and runtime env vars,
# so VITE_API_BASE_URL / VITE_WS_BASE flow through to the bundled JS.

# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM denoland/deno:2.7.14 AS builder

WORKDIR /app

# Bring in the manifest + lockfile first so deno's cache layer is reused
# unless they actually change.
COPY deno.json package.json ./
COPY deno.lock* ./

# Pre-install npm deps into the layer cache.
RUN deno install --allow-scripts --node-modules-dir=auto || true

# Bring in the rest of the source.
COPY . .

# Build args — Railway provides service vars as ARGs automatically. Defaults
# keep `docker build` working for local sanity checks.
ARG VITE_API_BASE_URL=http://localhost:8421
ARG VITE_WS_BASE=ws://localhost:8421

# Write .env.production so Vite's loadEnv() picks these up regardless of how
# the npm: shim handles process.env.
RUN printf "VITE_API_BASE_URL=%s\nVITE_WS_BASE=%s\n" \
        "$VITE_API_BASE_URL" "$VITE_WS_BASE" > .env.production \
    && deno task build

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM denoland/deno:2.7.14 AS runtime

WORKDIR /app
COPY --from=builder /app/build ./build
COPY serve.ts ./serve.ts

# Pre-cache the std file server so the first request is instant.
RUN deno cache serve.ts

ENV PORT=8420
EXPOSE 8420

# serve.ts wraps serveDir with a 404→index.html fallback so SPA deep links
# (/account, /games/:id, ...) hit the SvelteKit router instead of 404'ing.
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "serve.ts"]
