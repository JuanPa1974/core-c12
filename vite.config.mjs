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
      // Fase 2 Android (Capacitor Shell): injectRegister:false turns off
      // the plugin's own auto-inserted registration script. The same
      // dist/ bundle now ships to Web/PWA *and* to the native shells
      // (Android, and — on a future iOS resync — iOS), so registration
      // itself must be a runtime decision, not a build-time one: see
      // src/register-sw.js, which calls virtual:pwa-register's registerSW()
      // only outside Capacitor's native platforms. No separate native
      // build/output exists — one bundle, one calculator implementation.
      injectRegister: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
});
