import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Read VITE_* from the monorepo root .env in local dev. Vite accepts a
// relative string here so we don't need `@types/node` for `__dirname` —
// Vercel's clean install otherwise fails the `tsc -b` step.
// On Vercel, env vars come from project settings — `envDir` is harmless.
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  // Port 8081 reserved for the customer app locally; admin runs on 8000.
  // `strictPort` makes Vite fail loudly instead of silently auto-picking.
  server: { port: 8081, host: true, strictPort: true },
  preview: { port: 8081 },
});
