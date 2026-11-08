import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

// Dev: web :5173 → api :3000. E2E (A-17): WEB_PORT=5174, API_PROXY_TARGET=http://localhost:3100.
const port = Number(process.env.WEB_PORT ?? 5173);
const proxy = {
  '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Workspace packages are consumed from TypeScript sources (no `dist` needed).
    conditions: ['@bga/source', ...defaultClientConditions],
  },
  server: { port, strictPort: true, proxy },
  preview: { port, strictPort: true, proxy },
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks keep the entry chunk < 500 kB; konva/react-konva stay in the lazy table chunk.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              priority: 30,
            },
            { name: 'vendor-mui', test: /node_modules[\\/](@mui|@emotion)[\\/]/, priority: 20 },
            {
              name: 'vendor-konva',
              test: /node_modules[\\/](konva|react-konva)[\\/]/,
              priority: 20,
            },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
