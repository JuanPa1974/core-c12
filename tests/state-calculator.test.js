'use strict';

/*
 * Direct characterization tests for the calculator state machine
 * extracted in Etapa 5 (src/state/calculator-state.js): digit/decimal
 * entry, operators, chaining, =, = repeated, C, AC, sign, percent
 * (simple and contextual), IVA/margin (both directions), decimals as
 * a presentation-only preference, and division by zero — exercised
 * directly against CoreC12State, with no DOM involved at all.
 *
 * These do not replace tests/calc-engine.test.js and tests/config.test.js
 * (which drive the real calc.js through real buttons and remain the
 * source of truth for end-to-end behavior) — they add a second, DOM-free
 * layer of protection directly on the state contract.
 *
 * Loaded the same way tests/dom-shim.js loads config.js/calc.js: via
 * node:vm against the real, unmodified source files — zero npm deps.
 * The state module depends on CoreC12Core, so both are loaded into the
 * same sandbox, in the same order calc.js/index.html use.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CORE_JS_PATH = path.join(__dirname, '..', 'src', 'core', 'calculator.js');
const STATE_JS_PATH = path.join(__dirname, '..', 'src', 'state', 'calculator-state.js');
const coreSrc = fs.readFileSync(CORE_JS_PATH, 'utf8');
const stateSrc = fs.readFileSync(STATE_JS_PATH, 'utf8');

function loadCoreC12State() {
  const sandbox = {};
  sandbox.window = sandbox; // window === globalThis, as in a real browser
  vm.createContext(sandbox);
  vm.runInContext(coreSrc, sandbox, { filename: 'core/calculator.js' });
  vm.runInContext(stateSrc, sandbox, { filename: 'state/calculator-state.js' });
  return sandbox.CoreC12State;
}

const CoreC12State = loadCoreC12State();

test('state: expone createState() y su instancia expone el contrato esperado', () => {
  assert.equal(typeof CoreC12State.createState, 'function');
  const s = CoreC12State.createState();
  for (const fn of [
    'getSnapshot', 'inputDigit', 'inputDecimal', 'inputOperator', 'calculate',
    'clearLast', 'clearAll', 'toggleSign', 'percent', 'applyMargin',
    'setMarginDirection', 'applyTax', 'setTaxDirection', 'setDecimals',
  ]) {
    assert.equal(typeof s[fn], 'function', `falta el metodo ${fn}`);
  }
});

test('state: estado inicial', () => {
  const snap = CoreC12State.createState().getSnapshot();
  assert.equal(snap.displayValue, '0');
  assert.equal(snap.previousValue, null);
  assert.equal(snap.operator, null);
  assert.equal(snap.waitingForOperand, false);
  assert.equal(snap.isResult, false);
  assert.equal(snap.rawResult, null);
  assert.equal(snap.decimals, 2);
  assert.equal(snap.taxDirection, 'add');
  assert.equal(snap.marginDirection, 'forward');
  assert.equal(snap.activeMargin, null);
});

test('state: createState acepta un valor inicial explicito de decimales', () => {
  const snap = CoreC12State.createState({ decimals: 4 }).getSnapshot();
  assert.equal(snap.decimals, 4);
});

test('state: getSnapshot devuelve una copia, no el estado interno', () => {
  const s = CoreC12State.createState();
  const snap = s.getSnapshot();
  snap.displayValue = 'manipulado';
  assert.equal(s.getSnapshot().displayValue, '0');
});

test('state: entrada de digitos construye el numero tecleado', () => {
  const s = CoreC12State.createState();
  s.inputDigit('2'); s.inputDigit('3');
  assert.equal(s.getSnapshot().displayValue, '23');
});

test('state: limite de 12 digitos es un no-op silencioso (igual que el calc.js original)', () => {
  const s = CoreC12State.createState();
  for (const d of '123456789012') s.inputDigit(d);
  const before = s.getSnapshot().displayValue;
  assert.equal(s.inputDigit('9'), false);
  assert.equal(s.getSnapshot().displayValue, before);
});

test('state: punto decimal se agrega una sola vez', () => {
  const s = CoreC12State.createState();
  s.inputDigit('5');
  assert.equal(s.inputDecimal(), true);
  assert.equal(s.getSnapshot().displayValue, '5.');
  assert.equal(s.inputDecimal(), false); // ya tiene punto: no-op
});

test('state: operador + calculo basico (2 + 3 = 5)', () => {
  const s = CoreC12State.createState();
  s.inputDigit('2'); s.inputOperator('+'); s.inputDigit('3');
  assert.equal(s.calculate(), true);
  const snap = s.getSnapshot();
  assert.equal(snap.displayValue, '5');
  assert.equal(snap.isResult, true);
});

test('state: = repetido sin operador pendiente es no-op', () => {
  const s = CoreC12State.createState();
  s.inputDigit('2'); s.inputOperator('+'); s.inputDigit('3'); s.calculate();
  const before = s.getSnapshot().displayValue;
  assert.equal(s.calculate(), false);
  assert.equal(s.getSnapshot().displayValue, before);
});

test('state: operaciones encadenadas (2 + 3 + 4 = 9)', () => {
  const s = CoreC12State.createState();
  s.inputDigit('2'); s.inputOperator('+'); s.inputDigit('3'); s.inputOperator('+'); s.inputDigit('4');
  s.calculate();
  assert.equal(s.getSnapshot().displayValue, '9');
});

test('state: division por cero produce Error de forma controlada', () => {
  const s = CoreC12State.createState();
  s.inputDigit('5'); s.inputOperator('/'); s.inputDigit('0');
  assert.equal(s.calculate(), true); // hubo transicion (a Error)
  assert.equal(s.getSnapshot().displayValue, 'Error');
});

test('state: C borra el ultimo digito', () => {
  const s = CoreC12State.createState();
  s.inputDigit('1'); s.inputDigit('2');
  s.clearLast();
  assert.equal(s.getSnapshot().displayValue, '1');
});

test('state: AC resetea la operacion en curso pero conserva decimales y direcciones', () => {
  const s = CoreC12State.createState();
  s.setDecimals(3);
  s.setTaxDirection('remove');
  s.inputDigit('9'); s.inputOperator('+');
  s.clearAll();
  const snap = s.getSnapshot();
  assert.equal(snap.displayValue, '0');
  assert.equal(snap.operator, null);
  assert.equal(snap.previousValue, null);
  assert.equal(snap.decimals, 3);
  assert.equal(snap.taxDirection, 'remove');
});

test('state: reset seguro tras Error mediante AC', () => {
  const s = CoreC12State.createState();
  s.inputDigit('5'); s.inputOperator('/'); s.inputDigit('0'); s.calculate();
  assert.equal(s.getSnapshot().displayValue, 'Error');
  s.clearAll();
  assert.equal(s.getSnapshot().displayValue, '0');
});

test('state: cambio de signo sobre entrada manual', () => {
  const s = CoreC12State.createState();
  s.inputDigit('7');
  s.toggleSign();
  assert.equal(s.getSnapshot().displayValue, '-7');
});

test('state: porcentaje simple, sin operacion pendiente (50% = 0.5)', () => {
  const s = CoreC12State.createState();
  s.inputDigit('5'); s.inputDigit('0');
  s.percent();
  assert.equal(s.getSnapshot().displayValue, '0.5');
});

test('state: porcentaje contextual, con operacion pendiente (200 + 10% = 20)', () => {
  const s = CoreC12State.createState();
  s.inputDigit('2'); s.inputDigit('0'); s.inputDigit('0');
  s.inputOperator('+');
  s.inputDigit('1'); s.inputDigit('0');
  s.percent();
  assert.equal(s.getSnapshot().displayValue, '20');
});

test('state: IVA +/- bidireccional (100 +IVA21 = 121, inversa 121 -IVA21 = 100)', () => {
  const s = CoreC12State.createState();
  s.inputDigit('1'); s.inputDigit('0'); s.inputDigit('0');
  s.applyTax(21);
  assert.equal(s.getSnapshot().displayValue, '121');

  s.clearAll();
  s.setTaxDirection('remove');
  s.inputDigit('1'); s.inputDigit('2'); s.inputDigit('1');
  s.applyTax(21);
  assert.equal(s.getSnapshot().displayValue, '100');
});

test('state: margen +/- bidireccional (100 +Margen30, inversa 100 -Margen30 = 70)', () => {
  const s = CoreC12State.createState();
  s.inputDigit('1'); s.inputDigit('0'); s.inputDigit('0');
  s.applyMargin(30);
  assert.ok(Math.abs(parseFloat(s.getSnapshot().displayValue) - 142.8571429) < 1e-4);
  assert.equal(s.getSnapshot().activeMargin, 30);

  s.clearAll();
  s.setMarginDirection('reverse');
  s.inputDigit('1'); s.inputDigit('0'); s.inputDigit('0');
  s.applyMargin(30);
  assert.equal(s.getSnapshot().displayValue, '70');
});

test('state: setTaxDirection/setMarginDirection rechazan direcciones invalidas (no-op)', () => {
  const s = CoreC12State.createState();
  assert.equal(s.setTaxDirection('bogus'), false);
  assert.equal(s.setMarginDirection('bogus'), false);
  assert.equal(s.getSnapshot().taxDirection, 'add');
  assert.equal(s.getSnapshot().marginDirection, 'forward');
});

test('state: decimales solo afectan la preferencia de presentacion, nunca el valor interno', () => {
  const s = CoreC12State.createState();
  s.inputDigit('1'); s.inputDigit('0'); s.inputDigit('0');
  s.applyMargin(30);
  const rawBefore = s.getSnapshot().rawResult;
  s.setDecimals(1);
  const snap = s.getSnapshot();
  assert.equal(snap.rawResult, rawBefore); // el valor interno no cambia
  assert.equal(snap.decimals, 1);
});

test('arquitectura: src/state/calculator-state.js no depende de DOM, window, navigator, localStorage, CoreC12Config ni Capacitor', () => {
  // Misma estrategia simple usada para el core (Etapa 4): comprobación
  // por substring literal, sin linter/AST. El archivo se diseñó para no
  // necesitar ninguno de estos identificadores (usa globalThis, delega
  // toda persistencia/configuración al coordinador), así que es una
  // invariante real y estable, no una heurística frágil.
  const forbidden = ['document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'CoreC12Config', 'Capacitor'];
  for (const token of forbidden) {
    assert.ok(!stateSrc.includes(token), `src/state/calculator-state.js contiene una referencia prohibida: "${token}"`);
  }
});
