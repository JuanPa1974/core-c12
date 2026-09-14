'use strict';

/*
 * Direct characterization tests for the Fase 2 Free/Pro matrix
 * (src/state/pro-features.js) — the single source of truth for which
 * (rate, direction) combination is free and which requires Core C12
 * Pro. Loaded via node:vm against the real, unmodified source file —
 * zero npm deps, same mechanism as tests/state-calculator.test.js.
 *
 * This file only tests classification. Whether the current user is
 * actually allowed to use a Pro combination lives in
 * src/state/entitlement-state.js (tested in tests/state-entitlement.test.js);
 * whether a blocked click leaves the calculator untouched and emits
 * the paywall intent lives in tests/free-pro-gating.test.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PRO_FEATURES_JS_PATH = path.join(__dirname, '..', 'src', 'state', 'pro-features.js');
const proFeaturesSrc = fs.readFileSync(PRO_FEATURES_JS_PATH, 'utf8');

function loadCoreC12ProFeatures() {
  const sandbox = {};
  sandbox.window = sandbox; // window === globalThis, as in a real browser
  vm.createContext(sandbox);
  vm.runInContext(proFeaturesSrc, sandbox, { filename: 'state/pro-features.js' });
  return sandbox.CoreC12ProFeatures;
}

const CoreC12ProFeatures = loadCoreC12ProFeatures();

test('pro-features: expone exactamente el contrato esperado', () => {
  for (const fn of ['isFreeTax', 'isFreeMargin', 'isProTax', 'isProMargin']) {
    assert.equal(typeof CoreC12ProFeatures[fn], 'function', `falta ${fn}`);
  }
});

test('pro-features IVA: +IVA 4% es gratis, todo lo demas de IVA es Pro', () => {
  assert.equal(CoreC12ProFeatures.isFreeTax(4, 'add'), true);
  assert.equal(CoreC12ProFeatures.isProTax(4, 'add'), false);

  assert.equal(CoreC12ProFeatures.isProTax(10, 'add'), true);
  assert.equal(CoreC12ProFeatures.isProTax(21, 'add'), true);
  // -IVA 4% NO es gratis solo por compartir la tasa: la direccion tambien
  // debe coincidir (regla explicita de la Fase 2).
  assert.equal(CoreC12ProFeatures.isProTax(4, 'remove'), true);
  assert.equal(CoreC12ProFeatures.isProTax(10, 'remove'), true);
  assert.equal(CoreC12ProFeatures.isProTax(21, 'remove'), true);
});

test('pro-features MARGEN: +Margen 20% es gratis, todo lo demas de margen es Pro', () => {
  assert.equal(CoreC12ProFeatures.isFreeMargin(20, 'forward'), true);
  assert.equal(CoreC12ProFeatures.isProMargin(20, 'forward'), false);

  for (const rate of [25, 30, 35, 40, 45]) {
    assert.equal(CoreC12ProFeatures.isProMargin(rate, 'forward'), true, `+Margen ${rate}% deberia ser Pro`);
  }
  // -Margen 20% (inverso) NO es gratis solo por compartir la tasa.
  for (const rate of [20, 25, 30, 35, 40, 45]) {
    assert.equal(CoreC12ProFeatures.isProMargin(rate, 'reverse'), true, `-Margen ${rate}% deberia ser Pro`);
  }
});

test('pro-features: una tasa/direccion desconocida (fuera de catalogo) tambien es Pro por defecto', () => {
  assert.equal(CoreC12ProFeatures.isProTax(15, 'add'), true);
  assert.equal(CoreC12ProFeatures.isProMargin(50, 'forward'), true);
});

test('arquitectura: src/state/pro-features.js es puro — sin DOM, StoreKit, Capacitor ni entitlement', () => {
  const forbidden = [
    'document.', 'window.', 'navigator.', 'localStorage',
    '@capacitor/', 'Capacitor.', 'registerPlugin', 'CoreC12EntitlementState', 'CoreC12Preferences',
  ];
  for (const token of forbidden) {
    assert.ok(!proFeaturesSrc.includes(token), `src/state/pro-features.js no debe referenciar: "${token}"`);
  }
});
