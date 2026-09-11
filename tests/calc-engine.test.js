'use strict';

/*
 * Characterization tests for the CORE C12 calculation engine (calc.js).
 * Baseline commit: 0e732090fdab78a346ec111723edb82928be7361
 * (verified byte-for-byte identical to https://core-c12.netlify.app/ — see tests/README.md)
 *
 * These tests freeze how the engine behaves TODAY. They do not judge
 * whether that behavior is "correct" for Core C12 V2 — they exist so any
 * future change that silently alters production math is caught immediately.
 *
 * Every test drives the REAL calc.js through the REAL buttons parsed out of
 * the REAL index.html (see dom-shim.js) and reads back the REAL rendered
 * display text — no formula is duplicated from calc.js into the test file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('./dom-shim');

// ── A. Operaciones básicas ──────────────────────────────────────────────

test('basicas: 1 + 2 = 3', () => {
  const c = createEngine();
  c.digit(1); c.operator('+'); c.digit(2); c.equals();
  assert.equal(c.numberValue(), 3);
});

test('basicas: 10 - 4 = 6', () => {
  const c = createEngine();
  c.digit(1); c.digit(0); c.operator('-'); c.digit(4); c.equals();
  assert.equal(c.numberValue(), 6);
});

test('basicas: 5 x 4 = 20', () => {
  const c = createEngine();
  c.digit(5); c.operator('*'); c.digit(4); c.equals();
  assert.equal(c.numberValue(), 20);
});

test('basicas: 20 / 5 = 4', () => {
  const c = createEngine();
  c.digit(2); c.digit(0); c.operator('/'); c.digit(5); c.equals();
  assert.equal(c.numberValue(), 4);
});

test('basicas: 0.1 + 0.2 se normaliza a 0.3 (sin ruido de coma flotante visible)', () => {
  const c = createEngine();
  c.digit(0); c.decimalPoint(); c.digit(1);
  c.operator('+');
  c.digit(0); c.decimalPoint(); c.digit(2);
  c.equals();
  assert.equal(c.numberValue(), 0.3);
  assert.equal(c.display().number, '0,30'); // default decimals = 2
});

// ── B. División entre cero ──────────────────────────────────────────────

test('division por cero: 10 / 0 -> Error (no Infinity, no NaN visible, no crash)', () => {
  const c = createEngine();
  c.digit(1); c.digit(0); c.operator('/'); c.digit(0); c.equals();
  assert.equal(c.display().number, 'Error');
});

// ── C/D/E. IVA 21% / 10% / 4% ───────────────────────────────────────────

test('IVA 21%: 100 -> +IVA21 = 121, 121 -> -IVA21 = 100', () => {
  const up = createEngine();
  up.digit(1); up.digit(0); up.digit(0); up.ivaAdd(21);
  assert.equal(up.numberValue(), 121);

  const down = createEngine();
  down.digit(1); down.digit(2); down.digit(1); down.ivaSub(21);
  assert.equal(down.numberValue(), 100);
});

test('IVA 10%: 100 -> +IVA10 = 110, 110 -> -IVA10 = 100', () => {
  const up = createEngine();
  up.digit(1); up.digit(0); up.digit(0); up.ivaAdd(10);
  assert.equal(up.numberValue(), 110);

  const down = createEngine();
  down.digit(1); down.digit(1); down.digit(0); down.ivaSub(10);
  assert.equal(down.numberValue(), 100);
});

test('IVA 4%: 100 -> +IVA4 = 104, 104 -> -IVA4 = 100', () => {
  const up = createEngine();
  up.digit(1); up.digit(0); up.digit(0); up.ivaAdd(4);
  assert.equal(up.numberValue(), 104);

  const down = createEngine();
  down.digit(1); down.digit(0); down.digit(4); down.ivaSub(4);
  assert.equal(down.numberValue(), 100);
});

// ── FASE 0.8: margen comercial — precio = costo / (1 - margen) ─────────

const MARGIN_CASES = [
  { rate: 20, expected2dp: '125,00' },
  { rate: 25, expected2dp: '133,33' },
  { rate: 30, expected2dp: '142,86' },
  { rate: 35, expected2dp: '153,85' },
  { rate: 40, expected2dp: '166,67' },
  { rate: 45, expected2dp: '181,82' },
];

for (const { rate, expected2dp } of MARGIN_CASES) {
  test(`margen: 100 -> M${rate} = ${expected2dp} (costo / (1 - margen), no markup)`, () => {
    const c = createEngine();
    c.digit(1); c.digit(0); c.digit(0); c.margin(rate);
    assert.equal(c.display().number, expected2dp);
  });
}

// ── FASE 0.9: caso comercial crítico — 1.00 -> M30 -> +IVA21 ───────────

test('caso critico: 1,00 -> M30 -> +IVA21 = 1,73 (encadenado, en vivo)', () => {
  const c = createEngine();
  c.digit(1);
  c.margin(30);
  assert.equal(c.display().number, '1,43'); // 1/0.7 = 1.428571... a 2 decimales
  c.ivaAdd(21);
  assert.equal(c.display().number, '1,73');
  assert.ok(c.display().detail.length > 0, 'la traza de detalle debe reflejar el encadenamiento');
});

// ── FASE 0.10: IVA inverso sobre un PVP re-tecleado manualmente ────────

test('IVA inverso sobre PVP: 1,73 (re-tecleado) -> -IVA21 = 1,43', () => {
  const c = createEngine();
  c.digit(1); c.decimalPoint(); c.digit(7); c.digit(3);
  c.ivaSub(21);
  assert.equal(c.display().number, '1,43');
  // Nota de caracterización: NO recupera el costo original de 1,00.
  // Es la consecuencia esperada de redondear a 2 decimales antes de re-teclear
  // (ver tests/README.md). Documentado aquí para que la Fase futura de
  // margen inverso no lo interprete como una regresión.
});

// ── FASE 0.11: precisión — el selector de decimales es solo visual ─────

test('precision: el selector de decimales cambia la presentacion, no el calculo interno', () => {
  const c = createEngine();
  c.digit(1); c.digit(0); c.digit(0); c.margin(30);

  assert.equal(c.display().number, '142,86'); // decimales=2 (default)

  c.setDecimals(4);
  assert.equal(c.display().number, '142,8571'); // mismo resultado interno, mas digitos revelados

  c.setDecimals(2);
  assert.equal(c.display().number, '142,86'); // vuelve exactamente al mismo valor: no hay perdida ni deriva
});

// ── FASE 0.12: operaciones encadenadas ──────────────────────────────────

test('encadenamiento: 2 + 3 x 4 = 20 (calculadora secuencial, sin precedencia matematica)', () => {
  const c = createEngine();
  c.digit(2); c.operator('+'); c.digit(3); c.operator('*'); c.digit(4); c.equals();
  assert.equal(c.numberValue(), 20); // (2+3)*4, NO 2+(3*4)=14
});

test('encadenamiento: 100 -> M30 -> +IVA21 = 1,73 equivalente en escala 100', () => {
  const c = createEngine();
  c.digit(1); c.digit(0); c.digit(0); c.margin(30); c.ivaAdd(21);
  assert.equal(c.display().number, '172,86'); // 142.857... * 1.21 = 172.857...
});

// ── FASE 0.13: operadores consecutivos ──────────────────────────────────

test('operadores consecutivos: 2 + x 3 = -> el segundo operador reemplaza al primero (= 6, no 5)', () => {
  const c = createEngine();
  c.digit(2); c.operator('+'); c.operator('*'); c.digit(3); c.equals();
  assert.equal(c.numberValue(), 6); // 2 * 3, la suma pendiente fue descartada silenciosamente
});

// ── FASE 0.14: igual repetido ────────────────────────────────────────────

test('igual repetido: 2 + 3 = = -> el segundo "=" no repite la operacion', () => {
  const c = createEngine();
  c.digit(2); c.operator('+'); c.digit(3); c.equals();
  assert.equal(c.numberValue(), 5);
  c.equals(); // segunda pulsacion: no-op segun el codigo actual (operator ya es null)
  assert.equal(c.numberValue(), 5);
});

// ── FASE 0.15: punto decimal ─────────────────────────────────────────────

test('punto decimal: .5 y 0.5 se interpretan igual', () => {
  const leading = createEngine();
  leading.decimalPoint(); leading.digit(5);
  assert.equal(leading.display().number, '0,5');

  const explicit = createEngine();
  explicit.digit(0); explicit.decimalPoint(); explicit.digit(5);
  assert.equal(explicit.display().number, '0,5');
});

test('punto decimal: un segundo punto decimal es ignorado', () => {
  const c = createEngine();
  c.decimalPoint(); c.digit(5); c.decimalPoint(); c.digit(9);
  assert.equal(c.display().number, '0,59'); // el segundo "." no se inserta
});

// ── FASE 0.16: cambio de signo ───────────────────────────────────────────

test('cambio de signo: 5 -> +/- = -5', () => {
  const c = createEngine();
  c.digit(5); c.sign();
  assert.equal(c.numberValue(), -5);
  assert.equal(c.display().number, '-5');
});

test('cambio de signo: 0 -> +/- se mantiene en 0 (no aparece -0)', () => {
  const c = createEngine();
  c.sign();
  assert.equal(c.display().number, '0');
});
