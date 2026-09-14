'use strict';

/*
 * Shared fakes for the JS Platform boundary used by tests that drive
 * the real calc.js (and, since Fase 4, the real paywall.js) through
 * tests/dom-shim.js — used by tests/free-pro-gating.test.js,
 * tests/pro-ui-indicators.test.js and tests/paywall.test.js.
 *
 * Per the Fase 1 principle, StoreKit/Swift itself is never mocked:
 * these fakes implement exactly the contracts documented in
 * src/platform/purchases.js (isSupported) and
 * src/state/entitlement-state.js (createEntitlementState /
 * getSharedEntitlementState), nothing deeper.
 *
 * getSharedEntitlementState() memoizes like the real one does (Fase 4:
 * calc.js and paywall.js must observe the exact same instance) — a
 * fresh createFakeEntitlement() call still gives each test its own
 * isolated fake, same as before.
 */

function createFakeEntitlement(isPro, overrides) {
  const snapshot = { status: isPro ? 'pro' : 'free', isPro, error: null };
  let shared = null;

  function build() {
    return Object.assign({
      getSnapshot: () => snapshot,
      // El entitlement-state real notifica el ajuste optimista de forma
      // sincrona dentro de init(), antes de su primer await — subscribe()
      // aqui reproduce exactamente eso: el listener recibe el snapshot ya
      // en la primera llamada, sin esperar ningun tick.
      subscribe(fn) { fn(snapshot); return () => {}; },
      init: async () => {},
      purchase: async () => ({ success: false }),
      restore: async () => ({ found: false }),
    }, overrides);
  }

  return {
    createEntitlementState() { return build(); },
    getSharedEntitlementState() {
      if (!shared) shared = build();
      return shared;
    },
  };
}

// Simula CoreC12Purchases.isSupported() sin cargar el archivo real
// (import npm real, no parseable via vm) — ver tests/dom-shim.js.
function iosNativeWithStoreKit() {
  return { isSupported: () => true };
}
function webWithoutStoreKit() {
  return { isSupported: () => false };
}

module.exports = { createFakeEntitlement, iosNativeWithStoreKit, webWithoutStoreKit };
