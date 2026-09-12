'use strict';

/*
 * Direct characterization tests for src/storage/preferences.js (Etapa
 * 5B): safe read/write, unavailable storage, throwing storage, and
 * missing keys — the same defensive contract config.js already relied
 * on before this extraction (see tests/config.test.js's own storage
 * failure cases, which continue to protect the integration).
 *
 * Loaded the same way the other extracted modules are: via node:vm
 * against the real, unmodified source file — zero npm deps.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STORAGE_JS_PATH = path.join(__dirname, '..', 'src', 'storage', 'preferences.js');
const storageSrc = fs.readFileSync(STORAGE_JS_PATH, 'utf8');

const ROOT = path.resolve(__dirname, '..');
const coreSrc = fs.readFileSync(path.join(ROOT, 'src', 'core', 'calculator.js'), 'utf8');
const stateSrc = fs.readFileSync(path.join(ROOT, 'src', 'state', 'calculator-state.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
const calcSrc = fs.readFileSync(path.join(ROOT, 'src', 'calc.js'), 'utf8');

function loadPreferences(localStorageImpl) {
  const sandbox = {};
  if (localStorageImpl !== undefined) sandbox.localStorage = localStorageImpl;
  sandbox.window = sandbox; // window === globalThis, as in a real browser
  vm.createContext(sandbox);
  vm.runInContext(storageSrc, sandbox, { filename: 'storage/preferences.js' });
  return sandbox.CoreC12Preferences;
}

function createFakeLocalStorage() {
  const store = new Map();
  let brokenRead = false;
  let brokenWrite = false;
  return {
    getItem(key) {
      if (brokenRead) throw new Error('SecurityError: localStorage blocked (simulated)');
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (brokenWrite) throw new Error('QuotaExceededError (simulated)');
      store.set(key, String(value));
    },
    _setBrokenRead(v) { brokenRead = v; },
    _setBrokenWrite(v) { brokenWrite = v; },
  };
}

test('storage: expone exactamente el contrato esperado', () => {
  const prefs = loadPreferences(createFakeLocalStorage());
  assert.equal(typeof prefs.isAvailable, 'function');
  assert.equal(typeof prefs.read, 'function');
  assert.equal(typeof prefs.write, 'function');
});

test('storage: escritura valida seguida de lectura valida devuelve el mismo valor', () => {
  const prefs = loadPreferences(createFakeLocalStorage());
  assert.equal(prefs.write('k', 'v1'), true);
  assert.equal(prefs.read('k'), 'v1');
});

test('storage: valor inexistente devuelve null', () => {
  const prefs = loadPreferences(createFakeLocalStorage());
  assert.equal(prefs.read('no-existe'), null);
});

test('storage: isAvailable es true cuando localStorage existe', () => {
  const prefs = loadPreferences(createFakeLocalStorage());
  assert.equal(prefs.isAvailable(), true);
});

test('storage: localStorage ausente (undefined) -> isAvailable false, read null, write false', () => {
  const prefs = loadPreferences(undefined);
  assert.equal(prefs.isAvailable(), false);
  assert.equal(prefs.read('k'), null);
  assert.equal(prefs.write('k', 'v'), false);
});

test('storage: localStorage === null -> isAvailable false, read null, write false', () => {
  const prefs = loadPreferences(null);
  assert.equal(prefs.isAvailable(), false);
  assert.equal(prefs.read('k'), null);
  assert.equal(prefs.write('k', 'v'), false);
});

test('storage: lectura que lanza excepcion -> read devuelve null sin propagar', () => {
  const fake = createFakeLocalStorage();
  fake._setBrokenRead(true);
  const prefs = loadPreferences(fake);
  assert.doesNotThrow(() => {
    assert.equal(prefs.read('k'), null);
  });
});

test('storage: escritura que lanza excepcion -> write devuelve false sin propagar', () => {
  const fake = createFakeLocalStorage();
  fake._setBrokenWrite(true);
  const prefs = loadPreferences(fake);
  assert.doesNotThrow(() => {
    assert.equal(prefs.write('k', 'v'), false);
  });
});

test('storage: acceder a la propiedad localStorage puede lanzar por si misma -> isAvailable/read/write siguen seguros', () => {
  const sandbox = {};
  Object.defineProperty(sandbox, 'localStorage', {
    get() { throw new Error('SecurityError: acceso bloqueado (simulado)'); },
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(storageSrc, sandbox, { filename: 'storage/preferences.js' });
  const prefs = sandbox.CoreC12Preferences;

  assert.doesNotThrow(() => {
    assert.equal(prefs.isAvailable(), false);
    assert.equal(prefs.read('k'), null);
    assert.equal(prefs.write('k', 'v'), false);
  });
});

test('arquitectura: el acceso productivo a localStorage queda confinado a src/storage/preferences.js', () => {
  // No es una comprobación ingenua de "la palabra no aparece en ningún
  // lado" (core/ y state/ ya tienen su propio test de arquitectura para
  // eso, y ahí sí es seguro porque esos archivos no necesitan la palabra
  // ni en código ni en comentarios). config.js SÍ documentaba antes su
  // relación con localStorage en prosa; se reescribió esa prosa para no
  // mencionarla literalmente, así que esta comprobación queda igual de
  // robusta: si algún día calc.js/config.js volviera a acceder a
  // localStorage directamente (no solo a mencionarlo en un comentario),
  // esta prueba lo detectaría.
  const otherProductiveFiles = {
    'src/core/calculator.js': coreSrc,
    'src/state/calculator-state.js': stateSrc,
    'src/config.js': configSrc,
    'src/calc.js': calcSrc,
  };
  for (const [name, src] of Object.entries(otherProductiveFiles)) {
    assert.ok(!src.includes('localStorage'), `${name} contiene una referencia a localStorage; debe delegar en src/storage/preferences.js`);
  }
  assert.ok(storageSrc.includes('localStorage'), 'src/storage/preferences.js deberia ser el unico lugar con acceso real a localStorage');
});
