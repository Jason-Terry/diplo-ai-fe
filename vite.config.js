import { defineConfig } from 'vite';

// Vite reads VITE_* env vars at build time and replaces import.meta.env.VITE_*
// references in source files. See js/config.js for how the FE consumes them.
export default defineConfig({
  server: {
    port: 8420,
    host: '0.0.0.0',
    strictPort: true,
  },
  preview: {
    port: 8420,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
