import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      // public/manifest.webmanifest is already the approved, functional
      // manifest (linked from index.html) — the plugin must not generate
      // or inject a second one.
      manifest: false,
      strategies: 'generateSW',
      // registerType 'autoUpdate' reproduces the legacy service-worker.js
      // behavior: it called self.skipWaiting() unconditionally on install
      // and self.clients.claim() on activate, i.e. silent self-update with
      // no user-facing prompt. This is the standard-config equivalent of
      // that exact behavior, not a new UX decision.
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
});
