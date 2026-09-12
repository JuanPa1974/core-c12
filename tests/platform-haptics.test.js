'use strict';

/*
 * Tests for the Etapa 6 haptics platform layer (src/platform/haptics.js)
 * and its integration point in calc.js.
 *
 * Two layers of protection:
 *
 * 1. Direct tests against the real haptics.js module and the real
 *    @capacitor/core / @capacitor/haptics packages (loaded via a plain
 *    dynamic import — haptics.js has real npm imports, so it cannot be
 *    parsed as a classic vm script the way core/state/storage are).
 *    Capacitor and Haptics export plain mutable objects, so a temporary
 *    monkey-patch of one method is enough to observe calls / simulate a
 *    native platform or a throwing/rejecting plugin — no mocking
 *    framework, per the "no sobrearquitectar" instruction.
 *
 * 2. Classification tests driving the REAL calc.js through the REAL
 *    buttons (tests/dom-shim.js), with a spy CoreC12Haptics injected via
 *    options.haptics, to verify which actions request which intensity —
 *    without exporting calc.js's internal classification function.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('./dom-shim');

const ROOT = path.resolve(__dirname, '..');
const HAPTICS_JS_PATH = path.join(ROOT, 'src', 'platform', 'haptics.js');
const coreSrc = fs.readFileSync(path.join(ROOT, 'src', 'core', 'calculator.js'), 'utf8');
const stateSrc = fs.readFileSync(path.join(ROOT, 'src', 'state', 'calculator-state.js'), 'utf8');
const storageSrc = fs.readFileSync(path.join(ROOT, 'src', 'storage', 'preferences.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
const calcSrc = fs.readFileSync(path.join(ROOT, 'src', 'calc.js'), 'utf8');
const platformSrc = fs.readFileSync(HAPTICS_JS_PATH, 'utf8');

function loadHapticsPlatform() {
  return import('../src/platform/haptics.js');
}
function loadCapacitorCore() {
  return import('@capacitor/core');
}
function loadCapacitorHaptics() {
  return import('@capacitor/haptics');
}
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('platform/haptics: expone light/medium/error y se publica en globalThis.CoreC12Haptics', async () => {
  const mod = await loadHapticsPlatform();
  assert.equal(typeof mod.light, 'function');
  assert.equal(typeof mod.medium, 'function');
  assert.equal(typeof mod.error, 'function');
  assert.equal(typeof globalThis.CoreC12Haptics, 'object');
  assert.equal(globalThis.CoreC12Haptics.light, mod.light);
});

test('platform/haptics: en este entorno (sin bridge nativo) Capacitor.isNativePlatform() es false', async () => {
  const { Capacitor } = await loadCapacitorCore();
  assert.equal(Capacitor.isNativePlatform(), false);
});

test('platform/haptics: Web/no-nativo -> light/medium/error nunca intentan Haptics.impact ni Haptics.notification', async () => {
  const mod = await loadHapticsPlatform();
  const { Haptics } = await loadCapacitorHaptics();

  let impactCalls = 0;
  let notificationCalls = 0;
  const origImpact = Haptics.impact;
  const origNotification = Haptics.notification;
  Haptics.impact = (...args) => { impactCalls++; return origImpact.apply(Haptics, args); };
  Haptics.notification = (...args) => { notificationCalls++; return origNotification.apply(Haptics, args); };

  try {
    mod.light();
    mod.medium();
    mod.error();
    await tick();
    assert.equal(impactCalls, 0, 'no debe intentar impacto nativo en Web/PWA');
    assert.equal(notificationCalls, 0, 'no debe intentar notification nativa en Web/PWA');
  } finally {
    Haptics.impact = origImpact;
    Haptics.notification = origNotification;
  }
});

test('platform/haptics: si el plugin lanza sincronamente en plataforma nativa simulada, no se propaga', async () => {
  const mod = await loadHapticsPlatform();
  const { Capacitor } = await loadCapacitorCore();
  const { Haptics } = await loadCapacitorHaptics();

  const origIsNative = Capacitor.isNativePlatform;
  const origImpact = Haptics.impact;
  Capacitor.isNativePlatform = () => true;
  Haptics.impact = () => { throw new Error('fallo sincronico simulado del plugin'); };

  try {
    assert.doesNotThrow(() => mod.light());
  } finally {
    Capacitor.isNativePlatform = origIsNative;
    Haptics.impact = origImpact;
  }
});

test('platform/haptics: si el plugin rechaza la Promise en plataforma nativa simulada, no se propaga (sin unhandledRejection)', async () => {
  const mod = await loadHapticsPlatform();
  const { Capacitor } = await loadCapacitorCore();
  const { Haptics } = await loadCapacitorHaptics();

  const origIsNative = Capacitor.isNativePlatform;
  const origImpact = Haptics.impact;
  Capacitor.isNativePlatform = () => true;
  Haptics.impact = () => Promise.reject(new Error('fallo asincronico simulado del plugin'));

  let unhandled = false;
  const onUnhandled = () => { unhandled = true; };
  process.on('unhandledRejection', onUnhandled);

  try {
    mod.medium();
    await tick();
    await tick();
    assert.equal(unhandled, false, 'un rechazo del plugin no debe escapar como unhandledRejection');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
    Capacitor.isNativePlatform = origIsNative;
    Haptics.impact = origImpact;
  }
});

test('platform/haptics: light()/medium() no devuelven un resultado que altere state ni calculos (fire-and-forget)', async () => {
  const mod = await loadHapticsPlatform();
  assert.equal(mod.light(), undefined);
  assert.equal(mod.medium(), undefined);
});

// ── Clasificación semántica real, a través de calc.js (sin exportar la
//    función interna) ──────────────────────────────────────────────────

function createSpyHaptics() {
  const calls = [];
  return {
    calls,
    light() { calls.push('light'); },
    medium() { calls.push('medium'); },
    error() { calls.push('error'); },
  };
}

test('clasificacion haptica: digitos, decimal, signo, porcentaje y C piden LIGHT', () => {
  const haptics = createSpyHaptics();
  const engine = createEngine({ haptics });

  engine.digit(5);
  engine.decimalPoint();
  engine.sign();
  engine.percent();
  engine.clear();

  assert.deepEqual(haptics.calls, ['light', 'light', 'light', 'light', 'light']);
});

test('clasificacion haptica: operador, =, AC y cambio de direccion piden MEDIUM', () => {
  const haptics = createSpyHaptics();
  const engine = createEngine({ haptics });

  engine.digit(2);
  engine.operator('+');
  engine.digit(3);
  engine.equals();
  engine.allClear();
  engine.setTaxDirection('remove');
  engine.setMarginDirection('reverse');

  const nonLightCalls = haptics.calls.filter((c) => c !== 'light');
  assert.deepEqual(nonLightCalls, ['medium', 'medium', 'medium', 'medium', 'medium']);
});

test('clasificacion haptica: aplicar IVA/Margen (calculadora) pide MEDIUM', () => {
  const haptics = createSpyHaptics();
  const engine = createEngine({ haptics });

  engine.digit(1); engine.digit(0); engine.digit(0);
  haptics.calls.length = 0; // descartar las de los digitos
  engine.taxRate(21);
  assert.deepEqual(haptics.calls, ['medium']);

  haptics.calls.length = 0;
  engine.marginRate(30);
  assert.deepEqual(haptics.calls, ['medium']);
});

test('clasificacion haptica: seleccionar posicion en modo edicion (mismo data-action) NO pide MEDIUM', () => {
  const haptics = createSpyHaptics();
  const engine = createEngine({ haptics });

  engine.editTax();
  haptics.calls.length = 0; // descartar cualquier llamada de entrar en edicion
  engine.taxRate(4); // en modo edicion, esto SELECCIONA la posicion, no aplica IVA
  assert.deepEqual(haptics.calls, [], 'seleccionar posicion a editar no es una accion comercial y no debe pedir MEDIUM');
});

test('clasificacion haptica: sin CoreC12Haptics cargado (como en los otros 161 tests), calc.js sigue funcionando exactamente igual', () => {
  const engine = createEngine(); // sin options.haptics: CoreC12Haptics queda undefined en el sandbox
  engine.digit(2); engine.operator('+'); engine.digit(3); engine.equals();
  assert.equal(engine.elementText('display-number'), '5,00');
});

test('arquitectura: src/core y src/state no importan @capacitor/*; solo src/platform lo hace', () => {
  const forbidden = ['@capacitor/', 'Capacitor.isNativePlatform', 'Haptics.impact'];
  for (const token of forbidden) {
    assert.ok(!coreSrc.includes(token), `src/core/calculator.js no debe referenciar: "${token}"`);
    assert.ok(!stateSrc.includes(token), `src/state/calculator-state.js no debe referenciar: "${token}"`);
    assert.ok(!storageSrc.includes(token), `src/storage/preferences.js no debe referenciar: "${token}"`);
    assert.ok(!configSrc.includes(token), `src/config.js no debe referenciar: "${token}"`);
  }
  assert.ok(platformSrc.includes('@capacitor/core'), 'src/platform/haptics.js deberia ser el unico lugar que importa @capacitor/core');
  assert.ok(platformSrc.includes('@capacitor/haptics'), 'src/platform/haptics.js deberia ser el unico lugar que importa @capacitor/haptics');
  // calc.js puede REFERENCIAR el global CoreC12Haptics (no importar Capacitor directamente).
  assert.ok(!calcSrc.includes('@capacitor/'), 'src/calc.js no debe importar paquetes de Capacitor directamente — solo usar el global CoreC12Haptics');
});
