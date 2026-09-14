/* =============================================================
   CORE C12 — Registro del Service Worker (frontera Web/PWA ↔ nativo)
   Fase 2 Android — Capacitor Shell.

   El mismo dist/ generado por `npm run build` se usa como paquete
   Web/PWA y como assets empaquetados de los contenedores nativos
   (Android; en un futuro resync, también iOS) — no existe un build
   nativo separado, así que esta frontera se resuelve en tiempo de
   ejecución, no en tiempo de build.

   vite-plugin-pwa ya no auto-inyecta su script de registro
   (injectRegister:false en vite.config.mjs): este módulo llama a
   registerSW() explícitamente, y solo fuera de plataforma nativa. Un
   WebView nativo cargando el mismo dist/ nunca debe registrar ni
   depender de este service worker — usa los assets empaquetados
   directamente, sin caché ni ciclo de vida de SW de por medio.

   Mismo criterio de plataforma que src/platform/haptics.js: Capacitor
   ausente (tests, entornos sin el paquete) degrada a no-op seguro.
   ============================================================= */

import { Capacitor } from '@capacitor/core';

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

if (!isNative()) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
