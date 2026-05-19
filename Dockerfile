# Multi-stage build for diplo-ai-fe.
# Stage 1 (builder): Deno + Vite produce a static dist/.
# Stage 2 (runtime): same Deno image serves dist/ via the std file_server.
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

# Pre-fetch npm:vite + transitive deps into the layer cache.
RUN deno install --node-modules-dir=auto --allow-scripts npm:vite || true

# Now bring in the rest of the source.
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
COPY --from=builder /app/dist ./dist

# Pre-cache the std file server so the first request is instant.
RUN deno cache jsr:@std/http/file-server

ENV PORT=8420
EXPOSE 8420

# `sh -c` so $PORT expands at runtime, not build time.
CMD ["sh", "-c", "deno run --allow-net --allow-read jsr:@std/http/file-server ./dist --port ${PORT} --host 0.0.0.0"]
