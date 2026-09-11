'use strict';

/*
 * Characterization + correctness tests for the persistent configuration
 * layer (config.js) introduced in Fase 2A, and its integration with the
 * real calc.js engine.
 *
 * Every test drives the REAL config.js + calc.js through the REAL buttons
 * parsed from the REAL index.html (see dom-shim.js) — no formula or
 * validation rule is duplicated from config.js into this file.
 *
 * A fresh createEngine() call = a fresh page load (new JS state) with an
 * empty in-memory localStorage, unless a shared createFakeLocalStorage()
 * instance is passed in via { localStorage }, in which case it behaves
 * exactly like a real browser refresh: new JS state, same persisted data.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, createFakeLocalStorage } = require('./dom-shim');

// config.js runs inside a vm sandbox with its own Array/Object realm, so
// objects it returns have a different prototype than plain host objects
// even when structurally identical — assert/strict's deepEqual checks
// that too and fails cross-realm. A JSON round-trip strips the sandbox
// realm and yields a genuine host-side plain object, safe to compare.
const plain = (obj) => JSON.parse(JSON.stringify(obj));

const DEFAULTS = {
  version: 1,
  taxRates: [4, 10, 21],
  marginRates: [20, 25, 30, 35, 40, 45],
  decimals: 2,
};

// ── Fase 2A §17: defaults sin localStorage previo ───────────────────────

test('defaults: sin storage previo, config y UI reflejan los valores predeterminados', () => {
  const c = createEngine();
  assert.deepEqual(plain(c.config.getConfig()), DEFAULTS);

  assert.equal(c.taxRateLabel(4), '+4%');
  assert.equal(c.taxRateLabel(10), '+10%');
  assert.equal(c.taxRateLabel(21), '+21%');
  assert.equal(c.marginRateLabel(20), '+20%');
  assert.equal(c.marginRateLabel(25), '+25%');
  assert.equal(c.marginRateLabel(30), '+30%');
  assert.equal(c.marginRateLabel(35), '+35%');
  assert.equal(c.marginRateLabel(40), '+40%');
  assert.equal(c.marginRateLabel(45), '+45%');
  assert.equal(c.activeDecimals(), 2);
});

// ── Fase 2A §18: configuración válida persistida alimenta tasas reales ──

test('config persistida: botones y calculos usan las tasas/margenes/decimales guardados', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({
    version: 1,
    taxRates: [5, 12.5, 23],
    marginRates: [15, 22.5, 30, 37.5, 45, 60],
    decimals: 3,
  }));

  const c = createEngine({ localStorage: storage });

  assert.equal(c.taxRateLabel(5), '+5%');
  assert.equal(c.taxRateLabel(12.5), '+12,5%');
  assert.equal(c.taxRateLabel(23), '+23%');
  assert.equal(c.marginRateLabel(15), '+15%');
  assert.equal(c.marginRateLabel(22.5), '+22,5%');
  assert.equal(c.marginRateLabel(60), '+60%');
  assert.equal(c.activeDecimals(), 3);

  // El motor usa realmente las tasas configuradas, no las antiguas por defecto.
  c.digit(1); c.digit(0); c.digit(0); c.taxRate(23);
  assert.equal(c.numberValue(), 123); // 100 -> +tax 23% = 123

  const m = createEngine({ localStorage: storage });
  m.digit(1); m.digit(0); m.digit(0); m.marginRate(60);
  assert.equal(m.numberValue(), 250); // 100 / (1 - 0.60) = 250, margen no predeterminado
});

// ── Fase 2A §19: persistencia de decimales a través de un "reload" ──────

test('decimales: seleccionar 4 persiste y sobrevive a recrear la app', () => {
  const storage = createFakeLocalStorage();
  const c1 = createEngine({ localStorage: storage });
  assert.equal(c1.activeDecimals(), 2); // default

  c1.setDecimals(4);
  assert.equal(c1.config.getConfig().decimals, 4);

  const c2 = createEngine({ localStorage: storage }); // "reload"
  assert.equal(c2.activeDecimals(), 4);
});

test('decimales: AC no modifica el valor persistido', () => {
  const storage = createFakeLocalStorage();
  const c = createEngine({ localStorage: storage });
  c.setDecimals(4);
  c.allClear();
  assert.equal(c.activeDecimals(), 4);
  assert.equal(c.config.getConfig().decimals, 4);

  const reloaded = createEngine({ localStorage: storage });
  assert.equal(reloaded.activeDecimals(), 4);
});

// ── Fase 2A §20: configuración corrupta -> defaults seguros, sin crash ──

function assertStartsWithDefaults(storage, label) {
  const c = createEngine({ localStorage: storage });
  assert.deepEqual(plain(c.config.getConfig()), DEFAULTS, label + ': config debe caer a defaults');
  assert.equal(c.taxRateLabel(4), '+4%', label + ': UI debe reflejar defaults');
  assert.equal(c.activeDecimals(), 2, label + ': decimales deben caer a 2');
}

test('corrupcion: JSON invalido -> defaults, sin crash', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', '{esto no es json valido');
  assertStartsWithDefaults(storage, 'JSON invalido');
});

test('corrupcion: version desconocida -> defaults', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, version: 2 }));
  assertStartsWithDefaults(storage, 'version desconocida');
});

test('corrupcion: taxRates con longitud incorrecta -> defaults', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, taxRates: [4, 10] }));
  assertStartsWithDefaults(storage, 'taxRates longitud incorrecta');
});

test('corrupcion: marginRates con longitud incorrecta -> defaults', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, marginRates: [20, 25, 30, 35, 40] }));
  assertStartsWithDefaults(storage, 'marginRates longitud incorrecta');
});

test('corrupcion: tasa fiscal > 100 -> defaults (config completa descartada)', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, taxRates: [4, 10, 101] }));
  assertStartsWithDefaults(storage, 'tasa fiscal > 100');
});

test('corrupcion: margen > 90 -> defaults', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, marginRates: [20, 25, 30, 35, 40, 91] }));
  assertStartsWithDefaults(storage, 'margen > 90');
});

test('corrupcion: margen = 0 -> defaults (minimo es 1)', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, marginRates: [0, 25, 30, 35, 40, 45] }));
  assertStartsWithDefaults(storage, 'margen = 0');
});

test('corrupcion: tasas fiscales duplicadas -> defaults', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, taxRates: [4, 4, 21] }));
  assertStartsWithDefaults(storage, 'tasas fiscales duplicadas');
});

test('corrupcion: margenes duplicados -> defaults', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, marginRates: [20, 20, 30, 35, 40, 45] }));
  assertStartsWithDefaults(storage, 'margenes duplicados');
});

test('corrupcion: mas de un decimal en una tasa -> defaults', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, taxRates: [4, 10, 7.55] }));
  assertStartsWithDefaults(storage, 'mas de un decimal');
});

test('corrupcion: decimals = 5 (fuera de 1-4) -> defaults', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, decimals: 5 }));
  assertStartsWithDefaults(storage, 'decimals = 5');
});

test('corrupcion: NaN/Infinity en una tasa -> invalido (probado a nivel de funcion, JSON no puede serializarlos)', () => {
  const c = createEngine();
  // JSON.stringify(NaN) produce "null", por lo que este caso no puede
  // pasar por localStorage real y se prueba directamente contra la API
  // de validacion, que es donde realmente se evalua cada valor.
  assert.equal(c.config.validateTaxRates([4, 10, NaN]), false);
  assert.equal(c.config.validateTaxRates([4, 10, Infinity]), false);
  assert.equal(c.config.validateMarginRates([20, 25, 30, 35, 40, NaN]), false);
  assert.equal(c.config.validateMarginRates([20, 25, 30, 35, 40, Infinity]), false);
});

// ── Fase 2A §21: orden personalizado se conserva, sin ordenar ───────────

test('orden personalizado: taxRates y marginRates conservan el orden guardado', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({
    version: 1,
    taxRates: [21, 4, 10],
    marginRates: [45, 20, 35, 25, 40, 30],
    decimals: 2,
  }));

  const c = createEngine({ localStorage: storage });
  assert.deepEqual(c.taxRatesInOrder(), [21, 4, 10]);
  assert.deepEqual(c.marginRatesInOrder(), [45, 20, 35, 25, 40, 30]);
});

// ── Fase 2A §22: localStorage indisponible ──────────────────────────────

test('storage indisponible: lectura que lanza excepcion -> arranca con defaults, sin crash', () => {
  const storage = createFakeLocalStorage();
  storage.setItem('core-c12.settings.v1', JSON.stringify({ ...DEFAULTS, decimals: 4 }));
  storage._setBrokenRead(true);

  const c = createEngine({ localStorage: storage });
  assert.deepEqual(plain(c.config.getConfig()), DEFAULTS);
  assert.equal(c.activeDecimals(), 2);

  // Y la calculadora sigue siendo funcional
  c.digit(1); c.operator('+'); c.digit(2); c.equals();
  assert.equal(c.numberValue(), 3);
});

test('storage indisponible: escritura que lanza excepcion -> el cambio se usa en memoria sin crash', () => {
  const storage = createFakeLocalStorage();
  const c = createEngine({ localStorage: storage });
  // El propio init() ya persistio los defaults con exito (storage aun sana).
  const beforeBreak = storage._raw('core-c12.settings.v1');

  storage._setBrokenWrite(true);

  assert.doesNotThrow(() => c.setDecimals(4));
  assert.equal(c.activeDecimals(), 4); // aplicado en memoria pese al fallo de escritura
  assert.equal(c.config.getConfig().decimals, 4);

  // La escritura fallo de verdad: lo persistido no cambio respecto a antes.
  assert.equal(storage._raw('core-c12.settings.v1'), beforeBreak);
});

// ── Fase 2A §23: +IVA/-IVA y +M/-M nunca persisten ──────────────────────

test('modos no persistidos: -IVA/-M no sobreviven a un reload, pero tasas/margenes/decimales si', () => {
  const storage = createFakeLocalStorage();
  const c1 = createEngine({ localStorage: storage });
  c1.setDecimals(4);
  c1.setTaxDirection('remove');
  c1.setMarginDirection('reverse');
  assert.equal(c1.activeTaxDirection(), 'remove');
  assert.equal(c1.activeMarginDirection(), 'reverse');

  const c2 = createEngine({ localStorage: storage }); // "reload"
  assert.equal(c2.activeTaxDirection(), 'add');       // siempre arranca en +IVA
  assert.equal(c2.activeMarginDirection(), 'forward'); // siempre arranca en +M
  assert.equal(c2.activeDecimals(), 4);                // esto si persiste
});
