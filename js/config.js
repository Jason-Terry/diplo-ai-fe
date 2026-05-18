// Diplomacy AI — frontend config.
//
// In split-repo local dev: FE is served on :8420, BE runs on :8421. Override
// these via VITE_API_BASE_URL / VITE_WS_BASE once Vite is wired up; for now
// the values are hardcoded for local dev. Production Railway URLs will be
// stamped at build time.

window.API_BASE_URL = 'http://localhost:8421';
window.WS_BASE      = 'ws://localhost:8421';
