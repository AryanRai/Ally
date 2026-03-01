import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Web build config — produces a static SPA that can be deployed
 * to Vercel / any static host. Same React app as Electron,
 * but VITE_WEB_MODE=true triggers full-screen + Supabase transport.
 */
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
    'import.meta.env.VITE_WEB_MODE': JSON.stringify('true'),
  },
  optimizeDeps: {
    include: ['uuid'],
  },
});
