'use strict';

/*
 * Tests for the Fase 1 purchases platform layer (src/platform/purchases.js).
 *
 * Loaded via a plain dynamic import, same as tests/platform-haptics.test.js —
 * purchases.js has a real npm import (@capacitor/core), so it cannot be
 * parsed as a classic vm script the way core/state/storage are.
 *
 * registerPlugin('CoreC12Purchases') returns a Proxy whose method
 * properties are synthesized on every read (see @capacitor/core dist),
 * so individual plugin methods cannot be monkey-patched to return a
 * canned value the way a plain object could. Two things ARE reliably
 * testable without touching that boundary:
 *
 *   1. The Web/non-native degrade path — deterministic in this Node
 *      environment, since there is no native bridge at all here.
 *   2. That Capacitor.getPlatform() truly gates the two code paths:
 *      forcing it to return 'ios' (a plain property on the `Capacitor`
 *      object, not a Proxy — this DOES work) must make purchases.js
 *      actually attempt the native call instead of short-circuiting to
 *      the "unavailable" shape. Since no real native implementation
 *      exists in this environment, that attempt rejects — which also
 *      proves native failures propagate as rejections rather than
 *      being swallowed (the entitlement state machine depends on this).
 *
 *      Android (Fase 2 — Capacitor Shell) is native (isNativePlatform()
 *      true) but has no CoreC12Purchases bridge yet: getPlatform()
 *      returning 'android' must still degrade to the Web "unavailable"
 *      shape, exactly like Web, and must NOT attempt the bridge.
 *
 * Per the Fase 1 instructions, StoreKit/Swift itself is never mocked
 * here or anywhere else — only this Platform boundary is exercised.
 * The state machine's own tests (tests/state-entitlement.test.js) mock
 * *this* module's contract directly, one layer up.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PURCHASES_JS_PATH = path.join(ROOT, 'src', 'platform', 'purchases.js');
const purchasesSrc = fs.readFileSync(PURCHASES_JS_PATH, 'utf8');
const coreSrc = fs.readFileSync(path.join(ROOT, 'src', 'core', 'calculator.js'), 'utf8');
const stateSrc = fs.readFileSync(path.join(ROOT, 'src', 'state', 'calculator-state.js'), 'utf8');
const entitlementStateSrc = fs.readFileSync(path.join(ROOT, 'src', 'state', 'entitlement-state.js'), 'utf8');
const storageSrc = fs.readFileSync(path.join(ROOT, 'src', 'storage', 'preferences.js'), 'utf8');

function loadPurchasesPlatform() {
  return import('../src/platform/purchases.js');
}
function loadCapacitorCore() {
  return import('@capacitor/core');
}

test('platform/purchases: expone el contrato esperado y se publica en globalThis.CoreC12Purchases', async () => {
  const mod = await loadPurchasesPlatform();
  for (const fn of ['isSupported', 'getProduct', 'purchase', 'getEntitlement', 'restorePurchases']) {
    assert.equal(typeof mod[fn], 'function', `falta ${fn}`);
  }
  assert.equal(typeof globalThis.CoreC12Purchases, 'object');
  assert.equal(globalThis.CoreC12Purchases.getProduct, mod.getProduct);
});

test('platform/purchases: en este entorno (sin bridge nativo) isSupported() es false', async () => {
  const mod = await loadPurchasesPlatform();
  assert.equal(mod.isSupported(), false);
});

test('platform/purchases: Web/no-nativo -> getProduct() degrada a { available: false } sin lanzar', async () => {
  const mod = await loadPurchasesPlatform();
  const result = await mod.getProduct();
  assert.deepEqual(result, { available: false });
});

test('platform/purchases: Web/no-nativo -> purchase() degrada a { status: "unavailable", isPro: false } sin lanzar', async () => {
  const mod = await loadPurchasesPlatform();
  const result = await mod.purchase();
  assert.deepEqual(result, { status: 'unavailable', isPro: false });
});

test('platform/purchases: Web/no-nativo -> getEntitlement() degrada a { isPro: false } sin lanzar', async () => {
  const mod = await loadPurchasesPlatform();
  const result = await mod.getEntitlement();
  assert.deepEqual(result, { isPro: false });
});

test('platform/purchases: Web/no-nativo -> restorePurchases() degrada a { isPro: false, status: "unavailable" } sin lanzar', async () => {
  const mod = await loadPurchasesPlatform();
  const result = await mod.restorePurchases();
  assert.deepEqual(result, { isPro: false, status: 'unavailable' });
});

test('platform/purchases: iOS simulado (getPlatform="ios") -> isSupported() true y las 4 operaciones intentan el bridge real (y rechazan, al no existir aqui) en vez de devolver el resultado "unavailable"', async () => {
  const mod = await loadPurchasesPlatform();
  const { Capacitor } = await loadCapacitorCore();

  const origGetPlatform = Capacitor.getPlatform;
  Capacitor.getPlatform = () => 'ios';

  try {
    assert.equal(mod.isSupported(), true);
    await assert.rejects(() => mod.getProduct());
    await assert.rejects(() => mod.purchase());
    await assert.rejects(() => mod.getEntitlement());
    await assert.rejects(() => mod.restorePurchases());
  } finally {
    Capacitor.getPlatform = origGetPlatform;
  }
});

test('platform/purchases: Android shell simulado (getPlatform="android", plataforma nativa) -> isSupported() false y las 4 operaciones degradan sin intentar el bridge inexistente', async () => {
  const mod = await loadPurchasesPlatform();
  const { Capacitor } = await loadCapacitorCore();

  const origGetPlatform = Capacitor.getPlatform;
  const origIsNative = Capacitor.isNativePlatform;
  Capacitor.getPlatform = () => 'android';
  Capacitor.isNativePlatform = () => true; // Android es plataforma nativa, pero sin bridge de compras

  try {
    assert.equal(mod.isSupported(), false);
    assert.deepEqual(await mod.getProduct(), { available: false });
    assert.deepEqual(await mod.purchase(), { status: 'unavailable', isPro: false });
    assert.deepEqual(await mod.getEntitlement(), { isPro: false });
    assert.deepEqual(await mod.restorePurchases(), { isPro: false, status: 'unavailable' });
  } finally {
    Capacitor.getPlatform = origGetPlatform;
    Capacitor.isNativePlatform = origIsNative;
  }
});

test('arquitectura: src/core, src/state y src/storage no importan @capacitor/*; solo src/platform lo hace', () => {
  const forbidden = ['@capacitor/', 'Capacitor.isNativePlatform', 'registerPlugin'];
  for (const token of forbidden) {
    assert.ok(!coreSrc.includes(token), `src/core/calculator.js no debe referenciar: "${token}"`);
    assert.ok(!stateSrc.includes(token), `src/state/calculator-state.js no debe referenciar: "${token}"`);
    assert.ok(!entitlementStateSrc.includes(token), `src/state/entitlement-state.js no debe referenciar: "${token}"`);
    assert.ok(!storageSrc.includes(token), `src/storage/preferences.js no debe referenciar: "${token}"`);
  }
  assert.ok(purchasesSrc.includes('@capacitor/core'), 'src/platform/purchases.js deberia ser el lugar que importa @capacitor/core para StoreKit');
});
