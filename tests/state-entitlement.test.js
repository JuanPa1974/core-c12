'use strict';

/*
 * Direct characterization tests for the Fase 1 monetization state
 * machine (src/state/entitlement-state.js): loading/free/pro/
 * purchasing/restoring/error, cancellation handling, the local cache
 * (isPro/verifiedAt) as a non-authoritative accelerator, and the
 * offline "Pro previamente validado sigue siendo Pro" requirement.
 *
 * Loaded via node:vm against the real, unmodified source file — zero
 * npm deps, same mechanism as tests/state-calculator.test.js — with a
 * fake Platform and a fake Storage injected through createEntitlementState's
 * options. Per the Fase 1 instructions, StoreKit/Swift is never mocked
 * beyond this JS Platform boundary: these fakes implement exactly the
 * contract documented in src/platform/purchases.js, nothing deeper.
 *
 * Objects returned from code executed via vm.runInContext live in a
 * separate V8 realm, so assert.deepEqual/deepStrictEqual against a
 * plain object literal from this file fails ("same structure but not
 * reference-equal") even when every field matches — the same reason
 * tests/state-calculator.test.js never does this either. Snapshots and
 * results are asserted field-by-field with assert.equal instead.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ENTITLEMENT_JS_PATH = path.join(__dirname, '..', 'src', 'state', 'entitlement-state.js');
const entitlementSrc = fs.readFileSync(ENTITLEMENT_JS_PATH, 'utf8');

function loadCoreC12EntitlementState() {
  const sandbox = {};
  sandbox.window = sandbox; // window === globalThis, as in a real browser
  vm.createContext(sandbox);
  vm.runInContext(entitlementSrc, sandbox, { filename: 'state/entitlement-state.js' });
  return sandbox.CoreC12EntitlementState;
}

const CoreC12EntitlementState = loadCoreC12EntitlementState();

function createFakePlatform(overrides) {
  return Object.assign({
    isSupported: () => true,
    getProduct: async () => ({ available: true, id: 'com.andaralab.corec12.pro' }),
    purchase: async () => ({ status: 'verified', isPro: true, transactionId: 'tx-1' }),
    getEntitlement: async () => ({ isPro: false }),
    restorePurchases: async () => ({ isPro: false }),
  }, overrides);
}

function createFakeStorage() {
  const store = new Map();
  return {
    isAvailable: () => true,
    read: (key) => (store.has(key) ? store.get(key) : null),
    write: (key, value) => { store.set(key, String(value)); return true; },
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// Ver nota de cabecera: nunca deepEqual contra un objeto vm-realm.
function assertSnapshot(snapshot, expected) {
  assert.equal(snapshot.status, expected.status);
  assert.equal(snapshot.isPro, expected.isPro);
  assert.equal(snapshot.error, expected.error === undefined ? null : expected.error);
}

test('entitlement: expone exactamente el contrato esperado', () => {
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform(),
    storage: createFakeStorage(),
  });
  for (const fn of ['getSnapshot', 'subscribe', 'init', 'purchase', 'restore']) {
    assert.equal(typeof es[fn], 'function', `falta ${fn}`);
  }
});

test('entitlement: estado inicial (antes de init) es loading, sin Pro y sin error', () => {
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform(),
    storage: createFakeStorage(),
  });
  assertSnapshot(es.getSnapshot(), { status: 'loading', isPro: false });
});

test('entitlement: sin cache y StoreKit confirma isPro:false -> tras init(), estado free', async () => {
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ getEntitlement: async () => ({ isPro: false }) }),
    storage: createFakeStorage(),
  });
  await es.init();
  assertSnapshot(es.getSnapshot(), { status: 'free', isPro: false });
});

test('entitlement: sin cache y StoreKit confirma isPro:true -> tras init(), estado pro y cache escrita', async () => {
  const storage = createFakeStorage();
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ getEntitlement: async () => ({ isPro: true, transactionId: 'tx-9' }) }),
    storage,
  });
  await es.init();
  assertSnapshot(es.getSnapshot(), { status: 'pro', isPro: true });

  const cached = JSON.parse(storage.read('core-c12.entitlement.v1'));
  assert.equal(cached.isPro, true);
  assert.equal(typeof cached.verifiedAt, 'string');
});

test('entitlement: cache dice Pro -> arranque optimista en "pro" ANTES de que StoreKit responda (sin parpadeo Free->Pro)', async () => {
  const storage = createFakeStorage();
  storage.write('core-c12.entitlement.v1', JSON.stringify({ version: 1, isPro: true, verifiedAt: 'x' }));

  const gate = deferred();
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ getEntitlement: () => gate.promise }),
    storage,
  });

  const initPromise = es.init();
  // Antes de que la revalidacion asincrona resuelva, ya debe verse Pro.
  assertSnapshot(es.getSnapshot(), { status: 'pro', isPro: true });

  gate.resolve({ isPro: true });
  await initPromise;
  assert.equal(es.getSnapshot().status, 'pro');
});

test('entitlement OFFLINE: cache dice Pro y la revalidacion falla (sin conexion) -> sigue Pro, sin pasar por error', async () => {
  const storage = createFakeStorage();
  storage.write('core-c12.entitlement.v1', JSON.stringify({ version: 1, isPro: true, verifiedAt: 'x' }));

  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ getEntitlement: async () => { throw new Error('offline'); } }),
    storage,
  });

  await es.init();
  assertSnapshot(es.getSnapshot(), { status: 'pro', isPro: true });
});

test('entitlement: primera instalacion sin cache y sin conexion -> permanece free (no error)', async () => {
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ getEntitlement: async () => { throw new Error('offline'); } }),
    storage: createFakeStorage(),
  });
  await es.init();
  assertSnapshot(es.getSnapshot(), { status: 'free', isPro: false });
});

test('entitlement: purchase() transiciona a "purchasing" antes de resolver, y a "pro" tras una compra verified', async () => {
  const storage = createFakeStorage();
  const gate = deferred();
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ purchase: () => gate.promise }),
    storage,
  });
  await es.init(); // free (sin cache)

  const purchasePromise = es.purchase();
  assert.equal(es.getSnapshot().status, 'purchasing');

  gate.resolve({ status: 'verified', isPro: true, transactionId: 'tx-1' });
  const result = await purchasePromise;

  assert.equal(result.success, true);
  assertSnapshot(es.getSnapshot(), { status: 'pro', isPro: true });
  assert.equal(JSON.parse(storage.read('core-c12.entitlement.v1')).isPro, true);
});

test('entitlement CANCELACION: userCancelled no es un error -> vuelve a free y no marca Pro en cache', async () => {
  const storage = createFakeStorage();
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ purchase: async () => ({ status: 'cancelled', isPro: false }) }),
    storage,
  });
  await es.init(); // init() ya confirma y cachea 'free' (isPro:false) via getEntitlement()
  const cacheAfterInit = storage.read('core-c12.entitlement.v1');

  const result = await es.purchase();
  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
  assertSnapshot(es.getSnapshot(), { status: 'free', isPro: false });
  // La cancelacion no debe volver a escribir cache: el contenido (incluido
  // verifiedAt) sigue siendo exactamente el que dejo init().
  assert.equal(storage.read('core-c12.entitlement.v1'), cacheAfterInit);
});

test('entitlement SEGURIDAD: un resultado "unverified" nunca concede Pro -> estado error, no pro', async () => {
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ purchase: async () => ({ status: 'unverified', isPro: false, error: 'no se pudo verificar' }) }),
    storage: createFakeStorage(),
  });
  await es.init();

  const result = await es.purchase();
  assert.equal(result.success, false);
  const snapshot = es.getSnapshot();
  assert.equal(snapshot.status, 'error');
  assert.equal(snapshot.isPro, false);
  assert.equal(snapshot.error.code, 'unverified');
});

test('entitlement ERROR: purchase() que rechaza (fallo real de StoreKit) -> estado error con mensaje, sin conceder Pro', async () => {
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ purchase: async () => { const e = new Error('Producto no disponible'); e.code = 'PRODUCT_UNAVAILABLE'; throw e; } }),
    storage: createFakeStorage(),
  });
  await es.init();

  const result = await es.purchase();
  assert.equal(result.success, false);
  const snapshot = es.getSnapshot();
  assert.equal(snapshot.status, 'error');
  assert.equal(snapshot.isPro, false);
  assert.equal(snapshot.error.code, 'PRODUCT_UNAVAILABLE');
});

test('entitlement: purchase() es no-op si ya es Pro', async () => {
  const storage = createFakeStorage();
  storage.write('core-c12.entitlement.v1', JSON.stringify({ version: 1, isPro: true, verifiedAt: 'x' }));
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ getEntitlement: async () => ({ isPro: true }) }),
    storage,
  });
  await es.init();

  const result = await es.purchase();
  assert.equal(result.success, true);
  assert.equal(result.alreadyPro, true);
  assert.equal(es.getSnapshot().status, 'pro');
});

test('entitlement: purchase()/restore() se ignoran si ya hay una operacion en curso (sin doble compra)', async () => {
  const gate = deferred();
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ purchase: () => gate.promise }),
    storage: createFakeStorage(),
  });
  await es.init();

  const first = es.purchase();
  const second = es.purchase();
  const third = es.restore();

  assert.equal((await second).ignored, true);
  assert.equal((await third).ignored, true);

  gate.resolve({ status: 'verified', isPro: true });
  await first;
  assert.equal(es.getSnapshot().status, 'pro');
});

test('entitlement: restore() transiciona a "restoring" y encuentra una compra -> estado pro, cache actualizada', async () => {
  const storage = createFakeStorage();
  const gate = deferred();
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ restorePurchases: () => gate.promise }),
    storage,
  });
  await es.init();

  const restorePromise = es.restore();
  assert.equal(es.getSnapshot().status, 'restoring');

  gate.resolve({ isPro: true, transactionId: 'tx-restored' });
  const result = await restorePromise;

  assert.equal(result.found, true);
  assertSnapshot(es.getSnapshot(), { status: 'pro', isPro: true });
  assert.equal(JSON.parse(storage.read('core-c12.entitlement.v1')).isPro, true);
});

test('entitlement: restore() sin compra encontrada -> estado free, sin mensaje de error', async () => {
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ restorePurchases: async () => ({ isPro: false }) }),
    storage: createFakeStorage(),
  });
  await es.init();

  const result = await es.restore();
  assert.equal(result.found, false);
  assertSnapshot(es.getSnapshot(), { status: 'free', isPro: false });
});

test('entitlement: restore() que rechaza (fallo de red) mientras ya era Pro -> no degrada isPro, aunque el estado pase a error', async () => {
  const storage = createFakeStorage();
  storage.write('core-c12.entitlement.v1', JSON.stringify({ version: 1, isPro: true, verifiedAt: 'x' }));
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({
      getEntitlement: async () => ({ isPro: true }),
      restorePurchases: async () => { throw new Error('sin conexion'); },
    }),
    storage,
  });
  await es.init();
  assert.equal(es.getSnapshot().status, 'pro');

  const result = await es.restore();
  assert.equal(result.found, false);
  const snapshot = es.getSnapshot();
  assert.equal(snapshot.status, 'error');
  assert.equal(snapshot.isPro, true, 'un Pro ya conocido no debe perderse solo porque el restore explicito fallo');
});

test('entitlement: subscribe() recibe cada transicion y unsubscribe() detiene las notificaciones', async () => {
  const snapshots = [];
  const es = CoreC12EntitlementState.createEntitlementState({
    platform: createFakePlatform({ getEntitlement: async () => ({ isPro: false }) }),
    storage: createFakeStorage(),
  });
  const unsubscribe = es.subscribe((snapshot) => snapshots.push(snapshot.status));

  await es.init();
  // Dos notificaciones: el arranque optimista desde cache (free, sin
  // cache) y la revalidacion confirmada contra Platform (free otra vez).
  assert.deepEqual(snapshots, ['free', 'free']);

  const countAfterInit = snapshots.length;
  unsubscribe();
  await es.purchase();
  assert.equal(snapshots.length, countAfterInit, 'tras unsubscribe no deben llegar mas notificaciones');
});

test('arquitectura: src/state/entitlement-state.js no depende de DOM, window, navigator, localStorage, CoreC12Config ni Capacitor', () => {
  const forbidden = [
    'document.', 'window.', 'navigator.', 'localStorage',
    'CoreC12Config', '@capacitor/', 'Capacitor.', 'registerPlugin',
  ];
  for (const token of forbidden) {
    assert.ok(!entitlementSrc.includes(token), `src/state/entitlement-state.js no debe referenciar: "${token}"`);
  }
});
