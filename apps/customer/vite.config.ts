import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Read VITE_* from the monorepo root .env (one shared file across all 3 apps)
  envDir: path.resolve(__dirname, '../..'),
  // Default Vite port (5173) and our previous fallback (5180) collided with
  // other projects on this machine. Port 8081 is reserved for the customer
  // app; admin runs on 8000. `strictPort` makes Vite fail loudly instead of
  // silently auto-picking another port.
  server: { port: 8081, host: true, strictPort: true },
  preview: { port: 8081 },
});
