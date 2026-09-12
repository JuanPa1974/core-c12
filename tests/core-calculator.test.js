'use strict';

/*
 * Direct characterization tests for the pure math core extracted in Etapa 4
 * (src/core/calculator.js): basic arithmetic, IVA, margin, percent formulas
 * and the internal float-noise cleanup — exercised directly against the
 * module's public contract (CoreC12Core), with no DOM/state involved.
 *
 * These do not replace tests/calc-engine.test.js (which drives the real
 * calc.js through real buttons and is still the source of truth for
 * end-to-end behavior) — they add a second, narrower layer of protection
 * directly on the math contract itself, so a regression in the core shows
 * up here without needing to reproduce a full button sequence.
 *
 * Loaded the same way tests/dom-shim.js loads config.js/calc.js: via
 * node:vm against the real, unmodified source file — zero npm deps.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CORE_JS_PATH = path.join(__dirname, '..', 'src', 'core', 'calculator.js');
const coreSrc = fs.readFileSync(CORE_JS_PATH, 'utf8');

function loadCore() {
  const sandbox = {};
  sandbox.window = sandbox; // window === globalThis, as in a real browser
  vm.createContext(sandbox);
  vm.runInContext(coreSrc, sandbox, { filename: 'core/calculator.js' });
  return sandbox.CoreC12Core;
}

const Core = loadCore();

test('core: expone exactamente el contrato esperado', () => {
  assert.equal(typeof Core, 'object');
  for (const fn of ['compute', 'applyTaxRate', 'applyMarginRate', 'percentOfBase', 'percentAsDecimal', 'formatResult']) {
    assert.equal(typeof Core[fn], 'function', `falta CoreC12Core.${fn}`);
  }
});

test('core.compute: operaciones basicas', () => {
  assert.equal(Core.compute(2, 3, '+'), 5);
  assert.equal(Core.compute(5, 3, '-'), 2);
  assert.equal(Core.compute(4, 3, '*'), 12);
  assert.equal(Core.compute(10, 4, '/'), 2.5);
});

test('core.compute: division por cero devuelve null', () => {
  assert.equal(Core.compute(10, 0, '/'), null);
});

test('core.compute: operador desconocido devuelve el segundo operando (comportamiento actual)', () => {
  assert.equal(Core.compute(10, 7, '?'), 7);
});

test('core.applyTaxRate: +IVA (add) = valor x (1 + tasa)', () => {
  assert.equal(Core.applyTaxRate(100, 21, 'add'), 121);
  assert.equal(Core.applyTaxRate(100, 4, 'add'), 104);
});

test('core.applyTaxRate: -IVA (remove) = valor / (1 + tasa)', () => {
  assert.equal(Core.applyTaxRate(121, 21, 'remove'), 100);
});

test('core.applyMarginRate: +M (forward) = costo / (1 - margen)', () => {
  const result = Core.applyMarginRate(100, 30, 'forward');
  assert.ok(Math.abs(result - 142.85714285714286) < 1e-9);
});

test('core.applyMarginRate: -M (reverse) = precio x (1 - margen)', () => {
  assert.equal(Core.applyMarginRate(100, 30, 'reverse'), 70);
});

test('core.percentOfBase: porcentaje relativo a un valor base', () => {
  assert.equal(Core.percentOfBase(200, 10), 20);
});

test('core.percentAsDecimal: porcentaje como fraccion decimal', () => {
  assert.equal(Core.percentAsDecimal(25), 0.25);
});

test('core.formatResult: limpia ruido de coma flotante', () => {
  assert.equal(Core.formatResult(0.1 + 0.2), '0.3');
});

test('core.formatResult: valores no finitos devuelven "Error"', () => {
  assert.equal(Core.formatResult(Infinity), 'Error');
  assert.equal(Core.formatResult(-Infinity), 'Error');
  assert.equal(Core.formatResult(NaN), 'Error');
});

test('arquitectura: src/core/calculator.js no depende de DOM, window, navigator, localStorage ni Capacitor', () => {
  // Comprobación literal por substring — deliberadamente simple: el
  // archivo se diseñó para no necesitar ninguno de estos identificadores
  // (usa globalThis, no window, para exponer su API pública), así que
  // esto es una invariante real y estable, no una heurística frágil que
  // intente adivinar dependencias indirectas.
  const forbidden = ['document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'Capacitor'];
  for (const token of forbidden) {
    assert.ok(!coreSrc.includes(token), `src/core/calculator.js contiene una referencia prohibida: "${token}"`);
  }
});
