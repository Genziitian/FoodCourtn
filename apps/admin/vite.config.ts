import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '../..'),
  // Admin app runs on 8000; customer on 8080. `strictPort` so a port-bump
  // doesn't silently break VITE_ADMIN_URL refs elsewhere.
  server: { port: 8000, host: true, strictPort: true },
  preview: { port: 8000 },
});
