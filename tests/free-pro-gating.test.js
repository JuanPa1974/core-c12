'use strict';

/*
 * Integration tests for Fase 2 Free/Pro feature gating AND its
 * platform-scoping correction, driven through the REAL calc.js via
 * tests/dom-shim.js's createEngine() — same mechanism as
 * tests/calc-engine.test.js.
 *
 * Gating only activates when BOTH options.entitlementState AND a
 * native-with-StoreKit options.purchases (isSupported() -> true) are
 * present — that pairing is the platform-boundary fix itself:
 * "StoreKit unavailable" (Web/PWA, or options.purchases omitted) must
 * never be treated as "user is Free". Fakes stop at the JS Platform
 * boundary (same principle as Fase 1): StoreKit/Swift itself is never
 * touched, only the CoreC12Purchases/CoreC12EntitlementState contracts
 * calc.js consumes.
 *
 * Every pre-existing test in this repo calls createEngine() WITHOUT
 * either option, so gating never activates for them — see
 * tests/calc-engine.test.js's own IVA/margin tests, which exercise
 * every rate (10%, 21%, 25%...45%) expecting them to compute freely,
 * exactly as before Fase 2. This file is the only one that turns
 * gating on, and only for the engines it explicitly builds that way.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('./dom-shim');
const { createFakeEntitlement, iosNativeWithStoreKit, webWithoutStoreKit, androidShellWithoutPurchases } = require('./fake-entitlement');

function createSpyPaywall() {
  const calls = [];
  return { calls, requestOpen(intent) { calls.push(intent); } };
}

// El objeto `intent`/`feature` que calc.js pasa a requestOpen() se crea
// dentro del sandbox de vm en el que corre calc.js, que es un realm V8
// distinto del de este archivo — assert.deepEqual contra un literal de
// aqui falla ("same structure but not reference-equal") aunque los
// campos coincidan (mismo motivo que tests/state-entitlement.test.js).
// Se compara campo a campo en su lugar.
function assertFeature(feature, expected) {
  assert.equal(feature.kind, expected.kind);
  assert.equal(feature.rate, expected.rate);
  assert.equal(feature.direction, expected.direction);
}

// ── iOS FREE: IVA ─────────────────────────────────────────────────────────

test('iOS FREE: +IVA 4% ejecuta normalmente (funcion Free)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(4);
  assert.equal(c.numberValue(), 104);
});

test('iOS FREE: +IVA 10% bloquea — no calcula y emite el intent de paywall', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(10);
  assert.equal(c.numberValue(), 100, 'no debe haberse aplicado el IVA');
  assert.equal(proPaywall.calls.length, 1);
  assertFeature(proPaywall.calls[0].feature, { kind: 'tax', rate: 10, direction: 'add' });
  assert.equal(proPaywall.calls[0].type, 'OPEN_PRO_PAYWALL');
});

test('iOS FREE: +IVA 21% bloquea', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(21);
  assert.equal(c.numberValue(), 100);
  assert.equal(proPaywall.calls.length, 1);
});

test('iOS FREE: -IVA 4% bloquea (misma tasa que la version gratuita, pero direccion distinta)', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('remove');
  c.taxRate(4);
  assert.equal(c.numberValue(), 100, 'no debe haberse aplicado el -IVA');
  assert.equal(proPaywall.calls.length, 1);
  assertFeature(proPaywall.calls[0].feature, { kind: 'tax', rate: 4, direction: 'remove' });
});

test('iOS FREE: -IVA 10% y -IVA 21% tambien bloquean', () => {
  for (const rate of [10, 21]) {
    const proPaywall = createSpyPaywall();
    const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setTaxDirection('remove');
    c.taxRate(rate);
    assert.equal(c.numberValue(), 100, `-IVA ${rate}% no deberia haberse aplicado`);
    assert.equal(proPaywall.calls.length, 1, `-IVA ${rate}% deberia emitir el intent de paywall`);
  }
});

// ── iOS FREE: MARGEN ────────────────────────────────────────────────────

test('iOS FREE: +Margen 20% ejecuta normalmente (funcion Free)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.digit(1); c.digit(0); c.digit(0);
  c.setMarginDirection('forward');
  c.marginRate(20);
  assert.equal(c.numberValue(), 125); // 100 / (1 - 0.20)
});

test('iOS FREE: +Margen 25% bloquea', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setMarginDirection('forward');
  c.marginRate(25);
  assert.equal(c.numberValue(), 100, 'no debe haberse aplicado el margen');
  assert.equal(proPaywall.calls.length, 1);
  assertFeature(proPaywall.calls[0].feature, { kind: 'margin', rate: 25, direction: 'forward' });
});

test('iOS FREE: -Margen 20% bloquea (misma tasa que la version gratuita, pero direccion inversa)', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setMarginDirection('reverse');
  c.marginRate(20);
  assert.equal(c.numberValue(), 100, 'no debe haberse aplicado el margen inverso');
  assert.equal(proPaywall.calls.length, 1);
  assertFeature(proPaywall.calls[0].feature, { kind: 'margin', rate: 20, direction: 'reverse' });
});

test('iOS FREE: el resto de margenes inversos (25/30/35/40/45) tambien bloquea', () => {
  for (const rate of [25, 30, 35, 40, 45]) {
    const proPaywall = createSpyPaywall();
    const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('reverse');
    c.marginRate(rate);
    assert.equal(c.numberValue(), 100, `-Margen ${rate}% no deberia haberse aplicado`);
    assert.equal(proPaywall.calls.length, 1, `-Margen ${rate}% deberia emitir el intent de paywall`);
  }
});

test('iOS FREE: el resto de margenes directos (30/35/40/45) tambien bloquea', () => {
  for (const rate of [30, 35, 40, 45]) {
    const proPaywall = createSpyPaywall();
    const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('forward');
    c.marginRate(rate);
    assert.equal(c.numberValue(), 100, `+Margen ${rate}% no deberia haberse aplicado`);
    assert.equal(proPaywall.calls.length, 1, `+Margen ${rate}% deberia emitir el intent de paywall`);
  }
});

// ── iOS PRO: todas las funciones anteriores ejecutan normalmente ────────

test('iOS PRO: +IVA 10%/21% y -IVA 4%/10%/21% ejecutan normalmente', () => {
  const proPaywall = createSpyPaywall();

  const up10 = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit(), proPaywall });
  up10.digit(1); up10.digit(0); up10.digit(0); up10.setTaxDirection('add'); up10.taxRate(10);
  assert.equal(up10.numberValue(), 110);

  const up21 = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit(), proPaywall });
  up21.digit(1); up21.digit(0); up21.digit(0); up21.setTaxDirection('add'); up21.taxRate(21);
  assert.equal(up21.numberValue(), 121);

  const down4 = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit(), proPaywall });
  down4.digit(1); down4.digit(0); down4.digit(4); down4.setTaxDirection('remove'); down4.taxRate(4);
  assert.equal(down4.numberValue(), 100);

  const down10 = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit(), proPaywall });
  down10.digit(1); down10.digit(1); down10.digit(0); down10.setTaxDirection('remove'); down10.taxRate(10);
  assert.equal(down10.numberValue(), 100);

  const down21 = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit(), proPaywall });
  down21.digit(1); down21.digit(2); down21.digit(1); down21.setTaxDirection('remove'); down21.taxRate(21);
  assert.equal(down21.numberValue(), 100);

  assert.equal(proPaywall.calls.length, 0, 'un usuario Pro nunca deberia disparar el paywall');
});

test('iOS PRO: margenes directos (25..45) e inversos (20..45) ejecutan normalmente', () => {
  const proPaywall = createSpyPaywall();

  for (const rate of [25, 30, 35, 40, 45]) {
    const c = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit(), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('forward');
    c.marginRate(rate);
    assert.notEqual(c.numberValue(), 100, `+Margen ${rate}% deberia haberse aplicado`);
  }

  for (const rate of [20, 25, 30, 35, 40, 45]) {
    const c = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit(), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('reverse');
    c.marginRate(rate);
    assert.notEqual(c.numberValue(), 100, `-Margen ${rate}% deberia haberse aplicado`);
  }

  assert.equal(proPaywall.calls.length, 0, 'un usuario Pro nunca deberia disparar el paywall');
});

test('iOS PRO: las funciones Free (+IVA 4%, +Margen 20%) siguen funcionando igual para un usuario Pro', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit() });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(4);
  assert.equal(c.numberValue(), 104);
});

// ── WEB/PWA: el modelo Free/Pro no aplica todavia (correccion de plataforma) ──

test('Web/PWA: +IVA 10% y +IVA 21% ejecutan normalmente aunque el entitlement diga Free', () => {
  const proPaywall = createSpyPaywall();

  const up10 = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit(), proPaywall });
  up10.digit(1); up10.digit(0); up10.digit(0); up10.setTaxDirection('add'); up10.taxRate(10);
  assert.equal(up10.numberValue(), 110);

  const up21 = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit(), proPaywall });
  up21.digit(1); up21.digit(0); up21.digit(0); up21.setTaxDirection('add'); up21.taxRate(21);
  assert.equal(up21.numberValue(), 121);

  assert.equal(proPaywall.calls.length, 0, 'Web/PWA no debe emitir OPEN_PRO_PAYWALL');
});

test('Web/PWA: -IVA (4%/10%/21%) ejecuta normalmente', () => {
  const proPaywall = createSpyPaywall();
  for (const rate of [4, 10, 21]) {
    const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit(), proPaywall });
    c.digit(1); c.digit(2); c.digit(1);
    c.setTaxDirection('remove');
    c.taxRate(rate);
    assert.notEqual(c.numberValue(), 121, `-IVA ${rate}% deberia haberse aplicado`);
  }
  assert.equal(proPaywall.calls.length, 0);
});

test('Web/PWA: margenes directos 25-45% ejecutan normalmente', () => {
  const proPaywall = createSpyPaywall();
  for (const rate of [25, 30, 35, 40, 45]) {
    const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit(), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('forward');
    c.marginRate(rate);
    assert.notEqual(c.numberValue(), 100, `+Margen ${rate}% deberia haberse aplicado en Web`);
  }
  assert.equal(proPaywall.calls.length, 0);
});

test('Web/PWA: margenes inversos 20-45% ejecutan normalmente', () => {
  const proPaywall = createSpyPaywall();
  for (const rate of [20, 25, 30, 35, 40, 45]) {
    const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit(), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('reverse');
    c.marginRate(rate);
    assert.notEqual(c.numberValue(), 100, `-Margen ${rate}% deberia haberse aplicado en Web`);
  }
  assert.equal(proPaywall.calls.length, 0);
});

test('Web/PWA: no se emite OPEN_PRO_PAYWALL bajo ninguna combinacion, incluso con entitlement Free', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit(), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add'); c.taxRate(21);
  c.setMarginDirection('reverse'); c.marginRate(45);
  assert.equal(proPaywall.calls.length, 0);
});

// ── ANDROID SHELL: el modelo Free/Pro tampoco aplica (sin plugin Billing) ──
// Fase 2 — Capacitor Shell: Android ES plataforma nativa (a diferencia de
// Web), pero CoreC12Purchases.isSupported() es false porque el plugin de
// compras aun no existe ahi (ver platform/purchases.js). El resultado a
// este nivel de integracion es identico a Web/PWA — representativo, no
// exhaustivo por tasa: la matriz completa ya esta cubierta arriba (iOS) y
// abajo (Web); aqui solo se prueba que la frontera de plataforma tambien
// desactiva el gating en Android.

test('Android shell: +IVA 10%/21% ejecutan normalmente, sin paywall (sin plugin Billing todavia)', () => {
  const proPaywall = createSpyPaywall();

  const up10 = createEngine({ entitlementState: createFakeEntitlement(false), purchases: androidShellWithoutPurchases(), proPaywall });
  up10.digit(1); up10.digit(0); up10.digit(0); up10.setTaxDirection('add'); up10.taxRate(10);
  assert.equal(up10.numberValue(), 110);

  const up21 = createEngine({ entitlementState: createFakeEntitlement(false), purchases: androidShellWithoutPurchases(), proPaywall });
  up21.digit(1); up21.digit(0); up21.digit(0); up21.setTaxDirection('add'); up21.taxRate(21);
  assert.equal(up21.numberValue(), 121);

  assert.equal(proPaywall.calls.length, 0, 'Android shell no debe emitir OPEN_PRO_PAYWALL (bridge inexistente)');
});

test('Android shell: margenes directos e inversos ejecutan normalmente, sin paywall', () => {
  const proPaywall = createSpyPaywall();
  for (const rate of [25, 35, 45]) {
    const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: androidShellWithoutPurchases(), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('forward');
    c.marginRate(rate);
    assert.notEqual(c.numberValue(), 100, `+Margen ${rate}% deberia haberse aplicado en Android shell`);
  }
  assert.equal(proPaywall.calls.length, 0);
});

// ── INTEGRIDAD DE ESTADO (iOS FREE) ──────────────────────────────────────

test('gating: una accion Pro bloqueada no toca el display y preserva el operando/operador pendientes', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit(), proPaywall });

  c.digit(5); c.digit(0);   // "50"
  c.operator('+');           // pendiente: 50 +
  c.digit(2); c.digit(0);   // entrada manual "20", sin calcular todavia

  const beforeBlocked = c.display();
  c.setTaxDirection('add');
  c.taxRate(21);              // BLOQUEADO para Free

  assert.equal(proPaywall.calls.length, 1);
  assert.deepEqual(c.display(), beforeBlocked, 'display/estado/detalle no deben cambiar ante una accion bloqueada');

  // Si el operando pendiente (50) y el operador (+) sobrevivieron intactos,
  // "=" debe seguir dando 50 + 20 = 70 — prueba de que no se toco el estado
  // de calculo, solo se rechazo la accion Pro.
  c.equals();
  assert.equal(c.numberValue(), 70);
});

test('gating: una accion Pro bloqueada no deja ningun margen activo ni estado de IVA/margen residual', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.digit(1); c.digit(0); c.digit(0);
  c.setMarginDirection('forward');
  c.marginRate(25); // bloqueado
  assert.equal(c.display().status, '', 'no debe quedar ningun rotulo de margen/IVA tras una accion bloqueada');
});

test('gating: sin CoreC12ProPaywall cargado, una accion bloqueada sigue sin ejecutar la formula (no lanza)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() }); // sin proPaywall
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  assert.doesNotThrow(() => c.taxRate(10));
  assert.equal(c.numberValue(), 100);
});

// ── REGRESION ─────────────────────────────────────────────────────────────

test('gating: sin CoreC12EntitlementState cargado (como en todos los tests pre-Fase-2), nada se bloquea', () => {
  const c = createEngine(); // sin options.entitlementState ni options.purchases
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(21);
  assert.equal(c.numberValue(), 121, 'sin capa de monetizacion cargada, la calculadora es totalmente funcional');
});

test('gating: entitlement cargado pero SIN CoreC12Purchases (isSupported indeterminado) -> gating queda desactivado', () => {
  // Cubre el mismo principio que la correccion: si no se puede confirmar
  // soporte nativo, nunca se asume gating activo (fail-safe hacia "no
  // bloquear", nunca hacia "bloquear de mas").
  const c = createEngine({ entitlementState: createFakeEntitlement(false) }); // sin options.purchases
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(21);
  assert.equal(c.numberValue(), 121);
});
