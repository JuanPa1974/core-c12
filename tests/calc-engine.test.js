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

/* ════════════════════════════════════════════════════════════════════
   FASE 1 — MOTOR BIDIRECCIONAL IVA + MARGEN (Core C12 V2)
   Selectores +IVA/−IVA y +M/−M: solo cambian modo, no calculan.
   El cálculo ocurre al pulsar una tasa, leyendo la dirección activa.
   ════════════════════════════════════════════════════════════════════ */

// ── Selector IVA: estado inicial, permanencia, no-efecto-lateral ───────

test('selector IVA: arranca en +IVA', () => {
  const c = createEngine();
  assert.equal(c.activeTaxDirection(), 'add');
});

test('selector IVA: cambiar a -IVA no modifica el display numerico', () => {
  const c = createEngine();
  c.digit(1); c.digit(0); c.digit(0);
  const before = c.display().number;
  c.setTaxDirection('remove');
  assert.equal(c.display().number, before);
  assert.equal(c.activeTaxDirection(), 'remove');
});

test('selector IVA: permanece tras AC durante la sesion', () => {
  const c = createEngine();
  c.setTaxDirection('remove');
  c.allClear();
  assert.equal(c.activeTaxDirection(), 'remove');
});

test('selector IVA: rotulacion dinamica de las 3 tasas cambia de signo con la direccion', () => {
  const c = createEngine();
  assert.equal(c.taxRateLabel(4), '+4%');
  assert.equal(c.taxRateLabel(10), '+10%');
  assert.equal(c.taxRateLabel(21), '+21%');
  c.setTaxDirection('remove');
  assert.equal(c.taxRateLabel(4), '−4%');
  assert.equal(c.taxRateLabel(10), '−10%');
  assert.equal(c.taxRateLabel(21), '−21%');
});

// ── Motor IVA a traves de la interaccion real de dos pasos ─────────────

test('IVA via selector+tasa: +IVA21/10/4 y -IVA21/10/4 dan los mismos resultados que el motor original', () => {
  const up21 = createEngine();
  up21.setTaxDirection('add'); up21.digit(1); up21.digit(0); up21.digit(0); up21.taxRate(21);
  assert.equal(up21.numberValue(), 121);

  const down21 = createEngine();
  down21.setTaxDirection('remove'); down21.digit(1); down21.digit(2); down21.digit(1); down21.taxRate(21);
  assert.equal(down21.numberValue(), 100);

  const up10 = createEngine();
  up10.setTaxDirection('add'); up10.digit(1); up10.digit(0); up10.digit(0); up10.taxRate(10);
  assert.equal(up10.numberValue(), 110);

  const down10 = createEngine();
  down10.setTaxDirection('remove'); down10.digit(1); down10.digit(1); down10.digit(0); down10.taxRate(10);
  assert.equal(down10.numberValue(), 100);

  const up4 = createEngine();
  up4.setTaxDirection('add'); up4.digit(1); up4.digit(0); up4.digit(0); up4.taxRate(4);
  assert.equal(up4.numberValue(), 104);

  const down4 = createEngine();
  down4.setTaxDirection('remove'); down4.digit(1); down4.digit(0); down4.digit(4); down4.taxRate(4);
  assert.equal(down4.numberValue(), 100);
});

// ── Selector MARGEN: estado inicial, permanencia ────────────────────────

test('selector margen: arranca en +M', () => {
  const c = createEngine();
  assert.equal(c.activeMarginDirection(), 'forward');
});

test('selector margen: permanece tras AC durante la sesion', () => {
  const c = createEngine();
  c.setMarginDirection('reverse');
  c.allClear();
  assert.equal(c.activeMarginDirection(), 'reverse');
});

test('selector margen: rotulacion dinamica de las 6 tasas cambia de signo con la direccion', () => {
  const c = createEngine();
  assert.equal(c.marginRateLabel(20), '+20%');
  assert.equal(c.marginRateLabel(45), '+45%');
  c.setMarginDirection('reverse');
  assert.equal(c.marginRateLabel(20), '−20%');
  assert.equal(c.marginRateLabel(45), '−45%');
});

// ── +M: precio = costo / (1 - margen) — igual que el motor original ────

const MARGIN_FORWARD_CASES = [
  { rate: 20, expected2dp: '125,00' },
  { rate: 25, expected2dp: '133,33' },
  { rate: 30, expected2dp: '142,86' },
  { rate: 35, expected2dp: '153,85' },
  { rate: 40, expected2dp: '166,67' },
  { rate: 45, expected2dp: '181,82' },
];

for (const { rate, expected2dp } of MARGIN_FORWARD_CASES) {
  test(`+M via selector: 100 -> +M${rate} = ${expected2dp}`, () => {
    const c = createEngine();
    c.setMarginDirection('forward');
    c.digit(1); c.digit(0); c.digit(0); c.marginRate(rate);
    assert.equal(c.display().number, expected2dp);
  });
}

// ── −M: costo = precio_sin_impuesto × (1 - margen) — margen inverso ────

const MARGIN_REVERSE_CASES = [
  { rate: 20, expected: 80 },
  { rate: 25, expected: 75 },
  { rate: 30, expected: 70 },
  { rate: 35, expected: 65 },
  { rate: 40, expected: 60 },
  { rate: 45, expected: 55 },
];

for (const { rate, expected } of MARGIN_REVERSE_CASES) {
  test(`-M via selector: 100 -> -M${rate} = ${expected}`, () => {
    const c = createEngine();
    c.setMarginDirection('reverse');
    c.digit(1); c.digit(0); c.digit(0); c.marginRate(rate);
    assert.equal(c.numberValue(), expected);
  });
}

// ── Independencia de selectores IVA / MARGEN ────────────────────────────

test('independencia: seleccionar -IVA no afecta el modo de margen (se mantiene +M)', () => {
  const c = createEngine();
  c.setTaxDirection('remove');
  assert.equal(c.activeTaxDirection(), 'remove');
  assert.equal(c.activeMarginDirection(), 'forward');
});

test('independencia: seleccionar -M no afecta el modo de IVA (se mantiene +IVA)', () => {
  const c = createEngine();
  c.setMarginDirection('reverse');
  assert.equal(c.activeMarginDirection(), 'reverse');
  assert.equal(c.activeTaxDirection(), 'add');
});

test('independencia: +IVA y -M simultaneos son un estado valido', () => {
  const c = createEngine();
  c.setMarginDirection('reverse');
  assert.equal(c.activeTaxDirection(), 'add');
  assert.equal(c.activeMarginDirection(), 'reverse');
});

// ── Flujo comercial critico: PVP -> -IVA -> -M -> costo ─────────────────

test('caso comercial critico: 1,73 -> -IVA21 -> -M30 = 1,00 (PVP a costo)', () => {
  const c = createEngine();
  c.digit(1); c.decimalPoint(); c.digit(7); c.digit(3);
  c.setTaxDirection('remove');
  c.taxRate(21);
  assert.equal(c.display().number, '1,43'); // 1,73 / 1,21 = 1,429752... a 2 decimales
  c.setMarginDirection('reverse');
  c.marginRate(30);
  assert.equal(c.display().number, '1,00'); // 1,429752... * 0,70 = 1,000826... a 2 decimales
});

// ── Flujo comercial inverso complementario: costo -> +M -> +IVA -> PVP ──

test('caso comercial inverso: 1,00 -> +M30 -> +IVA21 = 1,73 (costo a PVP)', () => {
  const c = createEngine();
  c.setMarginDirection('forward');
  c.setTaxDirection('add');
  c.digit(1);
  c.marginRate(30);
  assert.equal(c.display().number, '1,43'); // 1 / 0,70 = 1,428571... a 2 decimales
  c.taxRate(21);
  assert.equal(c.display().number, '1,73');
});
