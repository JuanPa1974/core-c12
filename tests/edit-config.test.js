'use strict';

/*
 * Tests for the Fase 2B editable tax/margin configuration UI (calc.js +
 * config.js, index.html edit-mode controls).
 *
 * Every test drives the REAL calc.js through the REAL buttons parsed from
 * the REAL index.html (see dom-shim.js) and reads back the REAL rendered
 * display/label text — no validation rule, range, default, or persistence
 * logic is duplicated from config.js/calc.js into this file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, createFakeLocalStorage } = require('./dom-shim');

const plain = (obj) => JSON.parse(JSON.stringify(obj));

// ── A. IVA — flujo completo de edición y persistencia ───────────────────

test('IVA: entrar, seleccionar posicion 3, editar 21 a 22, guardar con =, UI y config reflejan el cambio', () => {
  const c = createEngine();

  c.editTax();
  assert.equal(c.elementText('tax-block-label'), 'EDITAR IVA');
  assert.equal(c.elementHidden('tax-edit-actions'), false);
  // Rotulos planos (sin signo) apenas se entra en edicion, antes de elegir posicion
  assert.equal(c.taxRateLabel(4), '4%');
  assert.equal(c.taxRateLabel(10), '10%');
  assert.equal(c.taxRateLabel(21), '21%');

  c.taxRate(21); // selecciona la posicion cuyo valor actual es 21 (la 3ra)
  assert.equal(c.elementText('display-status'), 'EDITAR IVA 3');
  assert.equal(c.numberValue(), 21); // buffer precargado con el valor actual

  c.digit(2); c.digit(2); // primer digito reemplaza el buffer fresco: "21" -> "2" -> "22"
  assert.equal(c.numberValue(), 22);

  c.equals();
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 22]);
  assert.equal(c.taxRateLabel(22), '22%'); // sin signo: aun en edicion
});

test('IVA: el valor editado persiste tras recrear la app', () => {
  const storage = createFakeLocalStorage();
  const c = createEngine({ localStorage: storage });

  c.editTax();
  c.taxRate(21);
  c.digit(2); c.digit(2);
  c.equals();
  c.editDoneTax();

  const reloaded = createEngine({ localStorage: storage });
  assert.deepEqual(plain(reloaded.config.getConfig()).taxRates, [4, 10, 22]);
  assert.equal(reloaded.taxRateLabel(22), '+22%');
});

// ── B. IVA — validaciones ────────────────────────────────────────────────

test('IVA: decimal valido 7.5 se guarda', () => {
  const c = createEngine();
  c.editTax();
  c.taxRate(4);
  c.digit(7); c.decimalPoint(); c.digit(5);
  c.equals();
  assert.deepEqual(c.taxRatesInOrder(), [7.5, 10, 21]);
});

test('IVA: 0 es valido', () => {
  const c = createEngine();
  c.editTax();
  c.taxRate(4);
  c.digit(0);
  c.equals();
  assert.deepEqual(c.taxRatesInOrder(), [0, 10, 21]);
});

test('IVA: 100 es valido', () => {
  const c = createEngine();
  c.editTax();
  c.taxRate(4);
  c.digit(1); c.digit(0); c.digit(0);
  c.equals();
  assert.deepEqual(c.taxRatesInOrder(), [100, 10, 21]);
});

test('IVA: 101 rechazado por rango, sin guardar y sin salir de edicion', () => {
  const c = createEngine();
  c.editTax();
  c.taxRate(4);
  c.digit(1); c.digit(0); c.digit(1);
  c.equals();
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 21]);
  assert.match(c.elementText('display-detail'), /RANGO/);
  assert.equal(c.elementHidden('tax-edit-actions'), false);
});

test('IVA: 7.55 rechazado (mas de 1 decimal), sin guardar', () => {
  const c = createEngine();
  c.editTax();
  c.taxRate(4);
  c.digit(7); c.decimalPoint(); c.digit(5); c.digit(5);
  c.equals();
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 21]);
  assert.match(c.elementText('display-detail'), /RANGO/);
});

test('IVA: duplicado rechazado, sin guardar', () => {
  const c = createEngine();
  c.editTax();
  c.taxRate(4); // posicion 1 (valor 4)
  c.digit(1); c.digit(0); // "10", ya usado en la posicion 2
  c.equals();
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 21]);
  assert.equal(c.elementText('display-detail'), 'DUPLICADO');
});

test('IVA: AC cancela el cambio no confirmado y mantiene el modo edicion del modulo', () => {
  const c = createEngine();
  c.editTax();
  c.taxRate(21);
  c.digit(9); c.digit(9); // buffer "99", nunca confirmado
  c.allClear();
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 21]); // sin cambios persistidos
  assert.equal(c.elementHidden('tax-edit-actions'), false); // sigue en edicion de IVA
  assert.equal(c.elementText('tax-block-label'), 'EDITAR IVA');
});

test('IVA: LISTO sale del modo edicion y conserva la configuracion guardada', () => {
  const c = createEngine();
  c.editTax();
  c.taxRate(21); c.digit(2); c.digit(2); c.equals(); // 21 -> 22
  c.editDoneTax();

  assert.equal(c.elementHidden('tax-edit-actions'), true);
  assert.equal(c.elementText('tax-block-label'), 'IVA');
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 22]);

  // operacion normal de calculadora vuelve a funcionar con el valor nuevo
  c.digit(1); c.digit(0); c.digit(0); c.taxRate(22);
  assert.equal(c.numberValue(), 122);
});

test('IVA: RESTABLECER (confirmacion en dos toques) vuelve a 4/10/21', () => {
  const storage = createFakeLocalStorage();
  const c = createEngine({ localStorage: storage });

  c.editTax();
  c.taxRate(21); c.digit(9); c.digit(9); c.equals(); // 21 -> 99
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 99]);

  c.resetTaxRates(); // primer toque: solo pide confirmacion
  assert.equal(c.elementText('tax-reset-label'), '¿CONFIRMAR?');
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 99]);

  c.resetTaxRates(); // segundo toque: confirma
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 21]);
  assert.equal(c.elementText('tax-reset-label'), 'RESTABLECER');

  const reloaded = createEngine({ localStorage: storage });
  assert.deepEqual(plain(reloaded.config.getConfig()).taxRates, [4, 10, 21]);
});

// ── C. MARGEN — flujo completo de edición y persistencia ────────────────

test('MARGEN: 30 a 32.5, UI y config reflejan el cambio', () => {
  const c = createEngine();
  c.editMargin();
  assert.equal(c.elementText('margin-block-label'), 'EDITAR MÁRGENES');
  // Rotulos planos (sin signo) apenas se entra en edicion, antes de elegir posicion
  assert.equal(c.marginRateLabel(20), '20%');
  assert.equal(c.marginRateLabel(30), '30%');

  c.marginRate(30); // posicion 3
  assert.equal(c.elementText('display-status'), 'EDITAR MARGEN 3');
  c.digit(3); c.digit(2); c.decimalPoint(); c.digit(5);
  c.equals();

  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 32.5, 35, 40, 45]);
});

test('MARGEN: el valor editado persiste tras recrear la app', () => {
  const storage = createFakeLocalStorage();
  const c = createEngine({ localStorage: storage });

  c.editMargin();
  c.marginRate(30);
  c.digit(3); c.digit(2); c.decimalPoint(); c.digit(5);
  c.equals();
  c.editDoneMargin();

  const reloaded = createEngine({ localStorage: storage });
  assert.deepEqual(plain(reloaded.config.getConfig()).marginRates, [20, 25, 32.5, 35, 40, 45]);
});

// ── D. MARGEN — validaciones ─────────────────────────────────────────────

test('MARGEN: 1 es valido', () => {
  const c = createEngine();
  c.editMargin();
  c.marginRate(20);
  c.digit(1);
  c.equals();
  assert.deepEqual(c.marginRatesInOrder(), [1, 25, 30, 35, 40, 45]);
});

test('MARGEN: 90 es valido', () => {
  const c = createEngine();
  c.editMargin();
  c.marginRate(20);
  c.digit(9); c.digit(0);
  c.equals();
  assert.deepEqual(c.marginRatesInOrder(), [90, 25, 30, 35, 40, 45]);
});

test('MARGEN: 0 rechazado (minimo es 1)', () => {
  const c = createEngine();
  c.editMargin();
  c.marginRate(20);
  c.digit(0);
  c.equals();
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 30, 35, 40, 45]);
  assert.match(c.elementText('display-detail'), /RANGO/);
});

test('MARGEN: 91 rechazado', () => {
  const c = createEngine();
  c.editMargin();
  c.marginRate(20);
  c.digit(9); c.digit(1);
  c.equals();
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 30, 35, 40, 45]);
  assert.match(c.elementText('display-detail'), /RANGO/);
});

test('MARGEN: mas de 1 decimal rechazado (32.55)', () => {
  const c = createEngine();
  c.editMargin();
  c.marginRate(30);
  c.digit(3); c.digit(2); c.decimalPoint(); c.digit(5); c.digit(5);
  c.equals();
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 30, 35, 40, 45]);
  assert.match(c.elementText('display-detail'), /RANGO/);
});

test('MARGEN: duplicado rechazado', () => {
  const c = createEngine();
  c.editMargin();
  c.marginRate(20); // posicion 1
  c.digit(2); c.digit(5); // "25", ya usado en la posicion 2
  c.equals();
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 30, 35, 40, 45]);
  assert.equal(c.elementText('display-detail'), 'DUPLICADO');
});

test('MARGEN: AC cancela el cambio no confirmado', () => {
  const c = createEngine();
  c.editMargin();
  c.marginRate(30);
  c.digit(1); // buffer "1", nunca confirmado
  c.allClear();
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 30, 35, 40, 45]);
  assert.equal(c.elementHidden('margin-edit-actions'), false);
});

test('MARGEN: LISTO sale del modo edicion y conserva la configuracion guardada', () => {
  const c = createEngine();
  c.editMargin();
  c.marginRate(30); c.digit(3); c.digit(2); c.decimalPoint(); c.digit(5); c.equals();
  c.editDoneMargin();

  assert.equal(c.elementHidden('margin-edit-actions'), true);
  assert.equal(c.elementText('margin-block-label'), 'MARGEN');
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 32.5, 35, 40, 45]);
});

test('MARGEN: RESTABLECER (confirmacion en dos toques) vuelve a los defaults', () => {
  const storage = createFakeLocalStorage();
  const c = createEngine({ localStorage: storage });

  c.editMargin();
  c.marginRate(30); c.digit(6); c.digit(0); c.equals(); // 30 -> 60
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 60, 35, 40, 45]);

  c.resetMarginRates();
  assert.equal(c.elementText('margin-reset-label'), '¿CONFIRMAR?');
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 60, 35, 40, 45]);

  c.resetMarginRates();
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 30, 35, 40, 45]);

  const reloaded = createEngine({ localStorage: storage });
  assert.deepEqual(plain(reloaded.config.getConfig()).marginRates, [20, 25, 30, 35, 40, 45]);
});

// ── E. Buffer de edicion — comportamiento de C (compartido IVA/margen) ──

test('buffer de edicion: C borra el ultimo caracter (32.5 -> 32. -> 32 -> 3)', () => {
  const c = createEngine();
  c.editMargin();
  c.marginRate(30); // buffer fresco "30"
  c.digit(3); c.digit(2); c.decimalPoint(); c.digit(5); // "3" -> "32" -> "32." -> "32.5"
  assert.equal(c.display().number, '32,5');

  c.clear();
  assert.equal(c.display().number, '32,');

  c.clear();
  assert.equal(c.display().number, '32');

  c.clear();
  assert.equal(c.display().number, '3');
});

// ── F. Aislamiento entre modulos ─────────────────────────────────────────

test('aislamiento: restablecer IVA no modifica margen', () => {
  const c = createEngine();
  c.editMargin(); c.marginRate(30); c.digit(8); c.digit(9); c.equals(); c.editDoneMargin(); // margen[2] = 89

  c.editTax();
  c.resetTaxRates(); c.resetTaxRates();

  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 21]);
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 89, 35, 40, 45]);
});

test('aislamiento: restablecer margen no modifica IVA', () => {
  const c = createEngine();
  c.editTax(); c.taxRate(21); c.digit(9); c.digit(9); c.equals(); c.editDoneTax(); // iva[2] = 99

  c.editMargin();
  c.resetMarginRates(); c.resetMarginRates();

  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 30, 35, 40, 45]);
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 99]);
});

test('aislamiento: editar IVA no modifica margen', () => {
  const c = createEngine();
  c.editTax(); c.taxRate(4); c.digit(5); c.equals(); c.editDoneTax();

  assert.deepEqual(c.taxRatesInOrder(), [5, 10, 21]);
  assert.deepEqual(c.marginRatesInOrder(), [20, 25, 30, 35, 40, 45]);
});

test('aislamiento: editar margen no modifica IVA', () => {
  const c = createEngine();
  c.editMargin(); c.marginRate(20); c.digit(1); c.digit(5); c.equals(); c.editDoneMargin();

  assert.deepEqual(c.marginRatesInOrder(), [15, 25, 30, 35, 40, 45]);
  assert.deepEqual(c.taxRatesInOrder(), [4, 10, 21]);
});

// ── G. El motor usa realmente los valores configurados, no solo la etiqueta ──

test('calculo tras configurar IVA: 21 -> 23, luego 100 -> +IVA23 = 123', () => {
  const c = createEngine();
  c.editTax(); c.taxRate(21); c.digit(2); c.digit(3); c.equals(); c.editDoneTax();

  c.digit(1); c.digit(0); c.digit(0); c.taxRate(23);
  assert.equal(c.numberValue(), 123);
});

test('calculo tras configurar MARGEN: 30 -> 32.5, el motor usa el nuevo valor real', () => {
  const c = createEngine();
  c.editMargin(); c.marginRate(30); c.digit(3); c.digit(2); c.decimalPoint(); c.digit(5); c.equals(); c.editDoneMargin();

  c.digit(1); c.digit(0); c.digit(0); c.marginRate(32.5);
  // +M32.5 (forward, default): 100 / (1 - 0.325) = 148.148... -> 148,15 a 2 decimales
  assert.equal(c.display().number, '148,15');
});

// ── H. editMode bloquea el resto de la calculadora ───────────────────────

test('editMode: deshabilita direccion, operadores basicos y el modulo contrario; digitos/C/AC/= sin posicion son no-op', () => {
  const c = createEngine();
  c.digit(5);
  c.editTax();

  assert.equal(c.isActionDisabled('tax-direction'), true);
  assert.equal(c.isActionDisabled('margin-direction'), true);
  assert.equal(c.isActionDisabled('operator'), true);
  assert.equal(c.isActionDisabled('sign'), true);
  assert.equal(c.isActionDisabled('percent'), true);
  assert.equal(c.isActionDisabled('set-decimals'), true);
  assert.equal(c.isRateDisabled('margin-rate', 20), true); // modulo contrario, bloqueado por completo
  assert.equal(c.isRateDisabled('tax-rate', 4), false);    // propio modulo, aun sin posicion seleccionada

  c.operator('+'); c.digit(3); c.equals(); // sin posicion activa: todo no-op
  c.editDoneTax();
  assert.equal(c.numberValue(), 5); // el valor previo a editar sigue intacto

  c.editTax();
  c.taxRate(4); // selecciona posicion
  assert.equal(c.isRateDisabled('tax-rate', 4), true); // ya en edicion de una posicion concreta
  assert.equal(c.isActionDisabled('edit-margin'), true);
});

// ── I. Todos los tests legacy (71) deben seguir intactos ─────────────────
// Verificado por separado en calc-engine.test.js y config.test.js, no
// duplicado aqui — ver tests/README.md.
