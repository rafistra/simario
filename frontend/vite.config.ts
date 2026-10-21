/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@seed': fileURLToPath(new URL('../docs/seed', import.meta.url)),
      '@vectors': fileURLToPath(new URL('../shared/test-vectors', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
    // Backend services from docker-compose.yml, served on the same origin (session cookie, CSRF).
    proxy: {
      // Keep the browser's Host (localhost:5173): Django builds the OIDC redirect URI from it and
      // checks it against the Origin header for CSRF.
      '/api': { target: 'http://127.0.0.1:8100', changeOrigin: false },
      '/oidc': { target: 'http://127.0.0.1:8100', changeOrigin: false },
      '/storage': {
        target: 'http://127.0.0.1:9100',
        rewrite: (path) => path.replace(/^\/storage/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
