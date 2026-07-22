/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is done by hand in main.tsx (register + explicit update() call + a
      // controllerchange listener that reloads once the new worker takes over) — the
      // plugin's own injected register script doesn't check for updates proactively,
      // so a plain page reload after a rebuild isn't guaranteed to pick up the new build.
      injectRegister: false,
      manifest: {
        name: 'SkillVault',
        short_name: 'SkillVault',
        display: 'standalone',
        start_url: '/',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // vite-plugin-pwa only sets these two automatically when injectRegister is 'auto'
        // (the default). Since registration is hand-rolled in main.tsx instead
        // (injectRegister: false, above), they need to be set explicitly here — without
        // clientsClaim, a newly activated worker never takes control of an already-open
        // tab, so the controllerchange listener in main.tsx would never fire.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg}'],
        runtimeCaching: [
          {
            // CatalogPage renders from GET /api/items and GET /api/categories together
            // (it groups items by category name) — both must be cached for the offline
            // catalog view to actually render, not just the items list on its own.
            urlPattern: ({ url }) => url.pathname === '/api/items' || url.pathname === '/api/categories',
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'skillvault-items-cache',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
