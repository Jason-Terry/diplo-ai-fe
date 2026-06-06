// Static-asset server for the built SPA shell.
//
// adapter-static emits ./build/ with index.html as the fallback page for
// dynamic routes (e.g. /account, /games/:id). The default jsr:@std/http
// file-server CLI does NOT fall back to index.html for unknown paths —
// the `--single-page-app` flag the Dockerfile previously passed was a
// silent no-op. This script serves ./build/ and, on a 404, returns the
// SPA shell with a 200 so the client-side router can take over.

import { serveDir } from "jsr:@std/http@^1.1/file-server";

const ROOT = "./build";
const FALLBACK = `${ROOT}/index.html`;
const PORT = Number(Deno.env.get("PORT") ?? 8420);
const HOSTNAME = "0.0.0.0";

// Precompute the fallback so each 404 doesn't re-read from disk.
const fallbackBytes = await Deno.readFile(FALLBACK);
const fallbackHeaders = new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache, must-revalidate",
});

Deno.serve({ port: PORT, hostname: HOSTNAME }, async (req) => {
    const res = await serveDir(req, { fsRoot: ROOT, quiet: true });
    if (res.status !== 404) return res;

    // Static asset paths (hashed JS/CSS, /favicon, /data/*.svg, …) genuinely
    // shouldn't fall back to HTML — that would break HMR cache busting and
    // confuse the browser into parsing HTML as JS. Only HTML-accepting
    // navigations get the SPA shell.
    const accepts = req.headers.get("accept") ?? "";
    if (!accepts.includes("text/html")) return res;

    return new Response(fallbackBytes, { status: 200, headers: fallbackHeaders });
});

console.log(`Listening on http://${HOSTNAME}:${PORT}`);
