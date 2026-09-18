import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Keeps the API same-origin in development, so no token ever rides a
    // cross-site request and the browser never learns the API host.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
});
