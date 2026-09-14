'use strict';

/*
 * Integration tests for the Fase 4 paywall (src/paywall.js), driven
 * through the REAL calc.js + paywall.js via tests/dom-shim.js's
 * createEngine({ loadPaywall: true }) — same mechanism as
 * tests/free-pro-gating.test.js, one level further: instead of a
 * spy for CoreC12ProPaywall, the real module is loaded so open, close,
 * purchase and restore all run for real against a fake entitlement.
 *
 * Fakes stop at the JS Platform boundary (Fase 1 principle):
 * StoreKit/Swift is never touched, only the CoreC12Purchases /
 * CoreC12EntitlementState contracts src/paywall.js and src/calc.js
 * consume.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('./dom-shim');
const { createFakeEntitlement, iosNativeWithStoreKit, webWithoutStoreKit } = require('./fake-entitlement');

const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function tick() { return new Promise((resolve) => setTimeout(resolve, 0)); }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Fake mas completo que el de tests/fake-entitlement.js: permite
// scriptar purchase()/restore() (incluyendo promesas diferidas, para
// observar el estado "purchasing"/"restoring" intermedio) y simula la
// notificacion real de entitlement-state.js — una compra/restore que
// resuelve isPro:true tambien avisa a los subscribers (calc.js), tal
// como hace el modulo real, para poder probar de extremo a extremo
// que los indicadores PRO reaccionan a una compra hecha desde AQUI.
function createScriptableEntitlement(initialIsPro) {
  let snapshot = { status: initialIsPro ? 'pro' : 'free', isPro: initialIsPro, error: null };
  let listeners = [];
  let shared = null;
  let purchaseImpl = async () => ({ success: false });
  let restoreImpl = async () => ({ found: false });

  function setSnapshot(next) {
    snapshot = next;
    listeners.forEach((fn) => fn(snapshot));
  }

  function build() {
    return {
      getSnapshot: () => snapshot,
      subscribe(fn) {
        listeners.push(fn);
        fn(snapshot);
        return () => { listeners = listeners.filter((l) => l !== fn); };
      },
      init: async () => {},
      purchase: (...args) => purchaseImpl(...args),
      restore: (...args) => restoreImpl(...args),
    };
  }

  return {
    createEntitlementState() { return build(); },
    getSharedEntitlementState() { if (!shared) shared = build(); return shared; },
    setPurchaseImpl(fn) { purchaseImpl = fn; },
    setRestoreImpl(fn) { restoreImpl = fn; },
    forceSnapshot(next) { setSnapshot(next); },
  };
}

function nativeWithProduct(displayPrice) {
  return {
    isSupported: () => true,
    getProduct: async () => ({ available: true, id: 'com.andaralab.corec12.pro', displayPrice }),
  };
}
function nativeWithoutProduct() {
  return {
    isSupported: () => true,
    getProduct: async () => { throw new Error('PRODUCT_UNAVAILABLE'); },
  };
}

// ── ACCESIBILIDAD DEL MODAL (markup estatico) ────────────────────────────

test('accesibilidad: el dialogo declara role/aria-modal/aria-labelledby/aria-describedby', () => {
  assert.match(INDEX_HTML, /id="paywall-dialog"[^>]*role="dialog"/s);
  assert.match(INDEX_HTML, /id="paywall-dialog"[^>]*aria-modal="true"/s);
  assert.match(INDEX_HTML, /id="paywall-dialog"[^>]*aria-labelledby="paywall-title"/s);
  assert.match(INDEX_HTML, /id="paywall-dialog"[^>]*aria-describedby="paywall-desc"/s);
});

test('accesibilidad: el boton de cerrar tiene un nombre accesible claro', () => {
  assert.match(INDEX_HTML, /data-action="paywall-close"[^>]*aria-label="Cerrar Core C12 Pro"/s);
});

// ── OPEN ──────────────────────────────────────────────────────────────────

test('OPEN: una accion Pro bloqueada abre el paywall', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add');
  assert.equal(c.isPaywallOpen(), false);
  c.taxRate(10);
  assert.equal(c.isPaywallOpen(), true);
});

test('OPEN: una accion Free NO abre el paywall', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add');
  c.taxRate(4);
  assert.equal(c.isPaywallOpen(), false);
});

test('OPEN: un usuario Pro no dispara el paywall (nada esta bloqueado)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add');
  c.taxRate(21);
  assert.equal(c.isPaywallOpen(), false);
});

test('OPEN: preserva el estado de la calculadora (display, operando y operador pendientes intactos)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.digit(5); c.digit(0); c.operator('+'); c.digit(2); c.digit(0);
  const before = c.display();
  c.setTaxDirection('add');
  c.taxRate(21);
  assert.deepEqual(c.display(), before);
  assert.equal(c.isPaywallOpen(), true);
});

test('OPEN: mueve el foco al dialogo', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add');
  c.taxRate(10);
  assert.equal(c.activeElementId(), 'paywall-dialog');
});

test('OPEN: .app queda inert mientras el paywall esta abierto', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  assert.equal(c.isAppInert(), false);
  c.setTaxDirection('add');
  c.taxRate(10);
  assert.equal(c.isAppInert(), true);
});

// ── CLOSE ─────────────────────────────────────────────────────────────────

test('CLOSE: la X cierra el paywall', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallClose();
  assert.equal(c.isPaywallOpen(), false);
});

test('CLOSE: devuelve el foco exactamente al boton Pro que abrio el paywall', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add');
  c.taxRate(10);
  c.clickPaywallClose();
  assert.deepEqual(c.activeElementDataset(), { action: 'tax-rate', rate: '10' });
});

test('CLOSE: no altera el estado de la calculadora', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.digit(5); c.digit(0); c.operator('+'); c.digit(2); c.digit(0);
  const before = c.display();
  c.setTaxDirection('add'); c.taxRate(21);
  c.clickPaywallClose();
  assert.deepEqual(c.display(), before);
});

test('CLOSE: .app deja de ser inert al cerrar', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallClose();
  assert.equal(c.isAppInert(), false);
});

test('CLOSE: un clic en el backdrop (fuera del dialogo) cierra si no hay operacion en curso', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallBackdrop();
  assert.equal(c.isPaywallOpen(), false);
});

test('CLOSE: Escape cierra si no hay operacion en curso', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add'); c.taxRate(10);
  c.pressEscape();
  assert.equal(c.isPaywallOpen(), false);
});

test('CLOSE: ni el backdrop ni Escape cierran mientras hay una compra en curso', async () => {
  const fake = createScriptableEntitlement(false);
  let resolvePurchase;
  fake.setPurchaseImpl(() => new Promise((res) => { resolvePurchase = res; }));
  const c = createEngine({ entitlementState: fake, purchases: iosNativeWithStoreKit(), loadPaywall: true });

  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallPurchase();
  assert.equal(c.paywallCtaDisabled(), true, 'deberia estar en curso');

  c.clickPaywallBackdrop();
  c.pressEscape();
  assert.equal(c.isPaywallOpen(), true, 'no debe cerrarse mientras hay una compra en curso');

  resolvePurchase({ success: false });
  await tick();
});

// ── PRICE ─────────────────────────────────────────────────────────────────

test('PRICE: displayPrice disponible se refleja en el CTA', async () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: nativeWithProduct('$4.99'), loadPaywall: true });
  c.setTaxDirection('add');
  c.taxRate(10);
  await tick();
  assert.equal(c.paywallCtaText(), 'Desbloquear por $4.99');
});

test('PRICE: producto no disponible mantiene el CTA neutro, sin precio inventado, y el paywall sigue siendo usable', async () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: nativeWithoutProduct(), loadPaywall: true });
  c.setTaxDirection('add');
  c.taxRate(10);
  await tick();
  assert.equal(c.paywallCtaText(), 'Desbloquear Core C12 Pro');
  assert.doesNotThrow(() => c.clickPaywallClose());
  assert.equal(c.isPaywallOpen(), false);
});

// ── PURCHASE ──────────────────────────────────────────────────────────────

test('PURCHASE: estado "purchasing" — CTA muestra Procesando… y ambos botones se deshabilitan', () => {
  const fake = createScriptableEntitlement(false);
  fake.setPurchaseImpl(() => new Promise(() => {})); // nunca resuelve, solo para observar el estado intermedio
  const c = createEngine({ entitlementState: fake, purchases: iosNativeWithStoreKit(), loadPaywall: true });

  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallPurchase();

  assert.equal(c.paywallCtaText(), 'Procesando…');
  assert.equal(c.paywallCtaDisabled(), true);
  assert.equal(c.paywallRestoreDisabled(), true);
});

test('PURCHASE success: cierra el paywall y actualiza isPro (los indicadores PRO desaparecen)', async () => {
  const fake = createScriptableEntitlement(false);
  fake.setPurchaseImpl(async () => {
    fake.forceSnapshot({ status: 'pro', isPro: true, error: null });
    return { success: true };
  });
  const c = createEngine({ entitlementState: fake, purchases: iosNativeWithStoreKit(), loadPaywall: true });

  c.setTaxDirection('add');
  assert.equal(c.isRateProLocked('tax-rate', 10), true);
  c.taxRate(10);
  c.clickPaywallPurchase();
  await tick();

  assert.equal(c.isPaywallOpen(), false);
  assert.equal(c.isRateProLocked('tax-rate', 10), false, 'el indicador PRO debe desaparecer tras la compra, sin recargar');

  // La funcion que origino la apertura ahora debe ejecutar con normalidad.
  c.digit(1); c.digit(0); c.digit(0);
  c.taxRate(10);
  assert.equal(c.numberValue(), 110);
});

test('PURCHASE cancellation: vuelve a Free sin error alarmante, CTA disponible, paywall puede seguir abierto', async () => {
  const fake = createScriptableEntitlement(false);
  fake.setPurchaseImpl(async () => ({ success: false, cancelled: true }));
  const c = createEngine({ entitlementState: fake, purchases: iosNativeWithStoreKit(), loadPaywall: true });

  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallPurchase();
  await tick();

  assert.equal(c.isPaywallOpen(), true);
  assert.equal(c.paywallMessage(), '', 'una cancelacion no debe mostrar un mensaje de error');
  assert.equal(c.paywallCtaDisabled(), false);
  assert.equal(c.paywallCtaText(), 'Desbloquear Core C12 Pro');
});

test('PURCHASE error: muestra un mensaje breve y visible, sin alert nativo', async () => {
  const fake = createScriptableEntitlement(false);
  fake.setPurchaseImpl(async () => ({ success: false }));
  const c = createEngine({ entitlementState: fake, purchases: iosNativeWithStoreKit(), loadPaywall: true });

  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallPurchase();
  await tick();

  assert.equal(c.isPaywallOpen(), true);
  assert.equal(c.paywallMessage(), 'No se pudo completar la compra. Inténtalo de nuevo.');
});

// ── RESTORE ───────────────────────────────────────────────────────────────

test('RESTORE: estado "restoring" — boton muestra Restaurando… y ambos se deshabilitan', () => {
  const fake = createScriptableEntitlement(false);
  fake.setRestoreImpl(() => new Promise(() => {}));
  const c = createEngine({ entitlementState: fake, purchases: iosNativeWithStoreKit(), loadPaywall: true });

  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallRestore();

  assert.equal(c.paywallRestoreText(), 'Restaurando…');
  assert.equal(c.paywallRestoreDisabled(), true);
  assert.equal(c.paywallCtaDisabled(), true);
});

test('RESTORE success: pasa a Pro y cierra el paywall (tras el mensaje de confirmacion)', async () => {
  const fake = createScriptableEntitlement(false);
  fake.setRestoreImpl(async () => {
    fake.forceSnapshot({ status: 'pro', isPro: true, error: null });
    return { found: true };
  });
  const c = createEngine({ entitlementState: fake, purchases: iosNativeWithStoreKit(), loadPaywall: true });

  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallRestore();
  await tick();

  assert.equal(c.paywallMessage(), 'Core C12 Pro restaurado correctamente.');
  assert.equal(c.isRateProLocked('tax-rate', 10), false);

  await wait(950); // el cierre tras un restore exitoso se retrasa brevemente para que se pueda leer/escuchar
  assert.equal(c.isPaywallOpen(), false);
});

test('RESTORE sin compra previa: mensaje correcto, el paywall permanece abierto', async () => {
  const fake = createScriptableEntitlement(false);
  fake.setRestoreImpl(async () => ({ found: false }));
  const c = createEngine({ entitlementState: fake, purchases: iosNativeWithStoreKit(), loadPaywall: true });

  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallRestore();
  await tick();

  assert.equal(c.paywallMessage(), 'No encontramos una compra anterior de Core C12 Pro.');
  assert.equal(c.isPaywallOpen(), true);
});

test('RESTORE error: mensaje correcto, el paywall permanece abierto', async () => {
  const fake = createScriptableEntitlement(false);
  fake.setRestoreImpl(async () => ({ found: false, error: true }));
  const c = createEngine({ entitlementState: fake, purchases: iosNativeWithStoreKit(), loadPaywall: true });

  c.setTaxDirection('add'); c.taxRate(10);
  c.clickPaywallRestore();
  await tick();

  assert.equal(c.paywallMessage(), 'No se pudo restaurar la compra. Inténtalo de nuevo.');
  assert.equal(c.isPaywallOpen(), true);
});

// ── PLATFORM ──────────────────────────────────────────────────────────────

test('PLATFORM: en Web/PWA el paywall nunca abre, incluso pulsando una tasa que en iOS seria Pro', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit(), loadPaywall: true });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(21);
  assert.equal(c.isPaywallOpen(), false);
  assert.equal(c.numberValue(), 121, 'en Web la funcion ejecuta con normalidad (gating desactivado)');
});

// ── REGRESION ─────────────────────────────────────────────────────────────

test('REGRESION: el gating de Fase 2 y los indicadores de Fase 3 siguen intactos con el paywall cargado', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), loadPaywall: true });
  c.setTaxDirection('add');
  assert.equal(c.isRateProLocked('tax-rate', 10), true);

  c.digit(1); c.digit(0); c.digit(0);
  c.taxRate(4); // Free: debe ejecutar con normalidad
  assert.equal(c.numberValue(), 104);
  assert.equal(c.isPaywallOpen(), false);
});
