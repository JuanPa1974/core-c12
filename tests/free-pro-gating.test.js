'use strict';

/*
 * Integration tests for the Fase 2 Free/Pro feature gating, driven
 * through the REAL calc.js via tests/dom-shim.js's createEngine() —
 * same mechanism as tests/calc-engine.test.js — with a fake
 * CoreC12EntitlementState injected via options.entitlementState to
 * turn gating on deterministically (see dom-shim.js's own comment on
 * that option for why the fake stops at the JS Platform boundary,
 * same principle as Fase 1: StoreKit/Swift itself is never touched).
 *
 * Every pre-existing test in this repo calls createEngine() WITHOUT
 * options.entitlementState, so CoreC12EntitlementState stays undefined
 * in their sandbox and gating never activates for them — see
 * tests/calc-engine.test.js's own IVA/margin tests, which exercise
 * every rate (10%, 21%, 25%...45%) expecting them to compute freely,
 * exactly as before Fase 2. This file is the only one that turns
 * gating on, and only for the engines it explicitly builds that way.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('./dom-shim');

function createFakeEntitlement(isPro) {
  const snapshot = { status: isPro ? 'pro' : 'free', isPro, error: null };
  return {
    createEntitlementState() {
      return {
        getSnapshot: () => snapshot,
        // El entitlement-state real notifica el ajuste optimista de forma
        // sincrona dentro de init(), antes de su primer await — subscribe()
        // aqui reproduce exactamente eso: el listener recibe el snapshot ya
        // en la primera llamada, sin esperar ningun tick.
        subscribe(fn) { fn(snapshot); return () => {}; },
        init: async () => {},
        purchase: async () => ({ success: false }),
        restore: async () => ({ found: false }),
      };
    },
  };
}

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

// ── FREE: IVA ───────────────────────────────────────────────────────────

test('gating FREE: +IVA 4% ejecuta normalmente (funcion Free)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false) });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(4);
  assert.equal(c.numberValue(), 104);
});

test('gating FREE: +IVA 10% bloquea — no calcula y emite el intent de paywall', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(10);
  assert.equal(c.numberValue(), 100, 'no debe haberse aplicado el IVA');
  assert.equal(proPaywall.calls.length, 1);
  assertFeature(proPaywall.calls[0].feature, { kind: 'tax', rate: 10, direction: 'add' });
  assert.equal(proPaywall.calls[0].type, 'OPEN_PRO_PAYWALL');
});

test('gating FREE: +IVA 21% bloquea', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(21);
  assert.equal(c.numberValue(), 100);
  assert.equal(proPaywall.calls.length, 1);
});

test('gating FREE: -IVA 4% bloquea (misma tasa que la version gratuita, pero direccion distinta)', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('remove');
  c.taxRate(4);
  assert.equal(c.numberValue(), 100, 'no debe haberse aplicado el -IVA');
  assert.equal(proPaywall.calls.length, 1);
  assertFeature(proPaywall.calls[0].feature, { kind: 'tax', rate: 4, direction: 'remove' });
});

test('gating FREE: -IVA 10% y -IVA 21% tambien bloquean', () => {
  for (const rate of [10, 21]) {
    const proPaywall = createSpyPaywall();
    const c = createEngine({ entitlementState: createFakeEntitlement(false), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setTaxDirection('remove');
    c.taxRate(rate);
    assert.equal(c.numberValue(), 100, `-IVA ${rate}% no deberia haberse aplicado`);
    assert.equal(proPaywall.calls.length, 1, `-IVA ${rate}% deberia emitir el intent de paywall`);
  }
});

// ── FREE: MARGEN ────────────────────────────────────────────────────────

test('gating FREE: +Margen 20% ejecuta normalmente (funcion Free)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false) });
  c.digit(1); c.digit(0); c.digit(0);
  c.setMarginDirection('forward');
  c.marginRate(20);
  assert.equal(c.numberValue(), 125); // 100 / (1 - 0.20)
});

test('gating FREE: +Margen 25% bloquea', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setMarginDirection('forward');
  c.marginRate(25);
  assert.equal(c.numberValue(), 100, 'no debe haberse aplicado el margen');
  assert.equal(proPaywall.calls.length, 1);
  assertFeature(proPaywall.calls[0].feature, { kind: 'margin', rate: 25, direction: 'forward' });
});

test('gating FREE: -Margen 20% bloquea (misma tasa que la version gratuita, pero direccion inversa)', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), proPaywall });
  c.digit(1); c.digit(0); c.digit(0);
  c.setMarginDirection('reverse');
  c.marginRate(20);
  assert.equal(c.numberValue(), 100, 'no debe haberse aplicado el margen inverso');
  assert.equal(proPaywall.calls.length, 1);
  assertFeature(proPaywall.calls[0].feature, { kind: 'margin', rate: 20, direction: 'reverse' });
});

test('gating FREE: el resto de margenes inversos (25/30/35/40/45) tambien bloquea', () => {
  for (const rate of [25, 30, 35, 40, 45]) {
    const proPaywall = createSpyPaywall();
    const c = createEngine({ entitlementState: createFakeEntitlement(false), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('reverse');
    c.marginRate(rate);
    assert.equal(c.numberValue(), 100, `-Margen ${rate}% no deberia haberse aplicado`);
    assert.equal(proPaywall.calls.length, 1, `-Margen ${rate}% deberia emitir el intent de paywall`);
  }
});

test('gating FREE: el resto de margenes directos (30/35/40/45) tambien bloquea', () => {
  for (const rate of [30, 35, 40, 45]) {
    const proPaywall = createSpyPaywall();
    const c = createEngine({ entitlementState: createFakeEntitlement(false), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('forward');
    c.marginRate(rate);
    assert.equal(c.numberValue(), 100, `+Margen ${rate}% no deberia haberse aplicado`);
    assert.equal(proPaywall.calls.length, 1, `+Margen ${rate}% deberia emitir el intent de paywall`);
  }
});

// ── PRO: todas las funciones anteriores ejecutan normalmente ────────────

test('gating PRO: +IVA 10%/21% y -IVA 4%/10%/21% ejecutan normalmente', () => {
  const proPaywall = createSpyPaywall();

  const up10 = createEngine({ entitlementState: createFakeEntitlement(true), proPaywall });
  up10.digit(1); up10.digit(0); up10.digit(0); up10.setTaxDirection('add'); up10.taxRate(10);
  assert.equal(up10.numberValue(), 110);

  const up21 = createEngine({ entitlementState: createFakeEntitlement(true), proPaywall });
  up21.digit(1); up21.digit(0); up21.digit(0); up21.setTaxDirection('add'); up21.taxRate(21);
  assert.equal(up21.numberValue(), 121);

  const down4 = createEngine({ entitlementState: createFakeEntitlement(true), proPaywall });
  down4.digit(1); down4.digit(0); down4.digit(4); down4.setTaxDirection('remove'); down4.taxRate(4);
  assert.equal(down4.numberValue(), 100);

  const down10 = createEngine({ entitlementState: createFakeEntitlement(true), proPaywall });
  down10.digit(1); down10.digit(1); down10.digit(0); down10.setTaxDirection('remove'); down10.taxRate(10);
  assert.equal(down10.numberValue(), 100);

  const down21 = createEngine({ entitlementState: createFakeEntitlement(true), proPaywall });
  down21.digit(1); down21.digit(2); down21.digit(1); down21.setTaxDirection('remove'); down21.taxRate(21);
  assert.equal(down21.numberValue(), 100);

  assert.equal(proPaywall.calls.length, 0, 'un usuario Pro nunca deberia disparar el paywall');
});

test('gating PRO: margenes directos (25..45) e inversos (20..45) ejecutan normalmente', () => {
  const proPaywall = createSpyPaywall();

  for (const rate of [25, 30, 35, 40, 45]) {
    const c = createEngine({ entitlementState: createFakeEntitlement(true), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('forward');
    c.marginRate(rate);
    assert.notEqual(c.numberValue(), 100, `+Margen ${rate}% deberia haberse aplicado`);
  }

  for (const rate of [20, 25, 30, 35, 40, 45]) {
    const c = createEngine({ entitlementState: createFakeEntitlement(true), proPaywall });
    c.digit(1); c.digit(0); c.digit(0);
    c.setMarginDirection('reverse');
    c.marginRate(rate);
    assert.notEqual(c.numberValue(), 100, `-Margen ${rate}% deberia haberse aplicado`);
  }

  assert.equal(proPaywall.calls.length, 0, 'un usuario Pro nunca deberia disparar el paywall');
});

test('gating PRO: las funciones Free (+IVA 4%, +Margen 20%) siguen funcionando igual para un usuario Pro', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(true) });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(4);
  assert.equal(c.numberValue(), 104);
});

// ── INTEGRIDAD DE ESTADO ─────────────────────────────────────────────────

test('gating: una accion Pro bloqueada no toca el display y preserva el operando/operador pendientes', () => {
  const proPaywall = createSpyPaywall();
  const c = createEngine({ entitlementState: createFakeEntitlement(false), proPaywall });

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
  const c = createEngine({ entitlementState: createFakeEntitlement(false) });
  c.digit(1); c.digit(0); c.digit(0);
  c.setMarginDirection('forward');
  c.marginRate(25); // bloqueado
  assert.equal(c.display().status, '', 'no debe quedar ningun rotulo de margen/IVA tras una accion bloqueada');
});

test('gating: sin CoreC12ProPaywall cargado, una accion bloqueada sigue sin ejecutar la formula (no lanza)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false) }); // sin proPaywall
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  assert.doesNotThrow(() => c.taxRate(10));
  assert.equal(c.numberValue(), 100);
});

// ── REGRESION: sin entitlement cargado, el gating queda desactivado ──────

test('gating: sin CoreC12EntitlementState cargado (como en todos los tests pre-Fase-2), nada se bloquea', () => {
  const c = createEngine(); // sin options.entitlementState
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(21);
  assert.equal(c.numberValue(), 121, 'sin capa de monetizacion cargada, la calculadora es totalmente funcional');
});
