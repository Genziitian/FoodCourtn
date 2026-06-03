import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Read VITE_* from the monorepo root .env in local dev.
// Vite accepts a relative string here, so we don't need Node types
// (which Vercel's clean install doesn't include by default and which
// would otherwise fail the `tsc -b` step in the build script).
// On Vercel, env vars come from project settings — `envDir` is harmless.
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  // Admin app runs on 8000; customer on 8081 in local dev. `strictPort` so
  // a port-bump doesn't silently break VITE_ADMIN_URL refs elsewhere.
  server: { port: 8000, host: true, strictPort: true },
  preview: { port: 8000 },
});
