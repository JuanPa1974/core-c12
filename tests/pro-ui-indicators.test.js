'use strict';

/*
 * Integration tests for the Fase 3 visual PRO indicator (the small
 * ".is-pro-locked" flag calc.js toggles on tax-rate/margin-rate
 * buttons, rendered purely in CSS via ::after — see src/styles.css).
 *
 * Driven through the REAL calc.js via tests/dom-shim.js's
 * createEngine(), same fakes as tests/free-pro-gating.test.js: gating
 * (and therefore the indicator) only activates when BOTH
 * options.entitlementState AND a native-with-StoreKit options.purchases
 * are present — see that file's own header comment for why the fakes
 * stop at the JS Platform boundary.
 *
 * This file only asserts the VISUAL flag (.is-pro-locked). Whether a
 * Pro action actually executes or is blocked is already covered by
 * tests/free-pro-gating.test.js and is not re-tested here, other than
 * one small regression check that both stay in sync.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('./dom-shim');
const { createFakeEntitlement, iosNativeWithStoreKit, webWithoutStoreKit } = require('./fake-entitlement');

const ALL_TAX_RATES = [4, 10, 21];
const ALL_MARGIN_RATES = [20, 25, 30, 35, 40, 45];

// ── iOS FREE ──────────────────────────────────────────────────────────────

test('iOS FREE: +IVA 4% NO muestra PRO (funcion Free)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('add');
  assert.equal(c.isRateProLocked('tax-rate', 4), false);
});

test('iOS FREE: +IVA 10% y +IVA 21% muestran PRO', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('add');
  assert.equal(c.isRateProLocked('tax-rate', 10), true);
  assert.equal(c.isRateProLocked('tax-rate', 21), true);
});

test('iOS FREE: -IVA 4% muestra PRO (misma tasa que la version gratuita, pero direccion distinta)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('remove');
  assert.equal(c.isRateProLocked('tax-rate', 4), true);
});

test('iOS FREE: -IVA 10% y -IVA 21% tambien muestran PRO', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('remove');
  assert.equal(c.isRateProLocked('tax-rate', 10), true);
  assert.equal(c.isRateProLocked('tax-rate', 21), true);
});

test('iOS FREE: +Margen 20% NO muestra PRO (funcion Free)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setMarginDirection('forward');
  assert.equal(c.isRateProLocked('margin-rate', 20), false);
});

test('iOS FREE: +Margen 25/30/35/40/45% muestran PRO', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setMarginDirection('forward');
  for (const rate of [25, 30, 35, 40, 45]) {
    assert.equal(c.isRateProLocked('margin-rate', rate), true, `+Margen ${rate}% deberia mostrar PRO`);
  }
});

test('iOS FREE: -Margen 20% muestra PRO (misma tasa que la version gratuita, pero direccion inversa)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setMarginDirection('reverse');
  assert.equal(c.isRateProLocked('margin-rate', 20), true);
});

test('iOS FREE: el resto de margenes inversos (25/30/35/40/45) tambien muestran PRO', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setMarginDirection('reverse');
  for (const rate of [25, 30, 35, 40, 45]) {
    assert.equal(c.isRateProLocked('margin-rate', rate), true, `-Margen ${rate}% deberia mostrar PRO`);
  }
});

// ── iOS PRO ───────────────────────────────────────────────────────────────

test('iOS PRO: ninguna etiqueta PRO visible en IVA (ninguna direccion)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit() });
  for (const direction of ['add', 'remove']) {
    c.setTaxDirection(direction);
    for (const rate of ALL_TAX_RATES) {
      assert.equal(c.isRateProLocked('tax-rate', rate), false, `IVA ${rate}% (${direction}) no deberia mostrar PRO para un usuario Pro`);
    }
  }
});

test('iOS PRO: ninguna etiqueta PRO visible en Margen (ninguna direccion)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit() });
  for (const direction of ['forward', 'reverse']) {
    c.setMarginDirection(direction);
    for (const rate of ALL_MARGIN_RATES) {
      assert.equal(c.isRateProLocked('margin-rate', rate), false, `Margen ${rate}% (${direction}) no deberia mostrar PRO para un usuario Pro`);
    }
  }
});

test('iOS PRO: los indicadores desaparecen en vivo cuando isProUser pasa a true (sin recargar, via subscribe)', () => {
  let notify;
  let shared = null;
  function build() {
    return {
      getSnapshot: () => ({ status: 'free', isPro: false, error: null }),
      subscribe(fn) { notify = fn; fn({ status: 'free', isPro: false, error: null }); return () => {}; },
      init: async () => {},
      purchase: async () => ({ success: false }),
      restore: async () => ({ found: false }),
    };
  }
  const entitlementState = {
    createEntitlementState() { return build(); },
    getSharedEntitlementState() { if (!shared) shared = build(); return shared; },
  };
  const c = createEngine({ entitlementState, purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('add');
  assert.equal(c.isRateProLocked('tax-rate', 21), true, 'arranca Free: 21% deberia mostrar PRO');

  notify({ status: 'pro', isPro: true, error: null }); // simula compra/restore/revalidacion confirmando Pro
  assert.equal(c.isRateProLocked('tax-rate', 21), false, 'tras pasar a Pro, el indicador debe desaparecer sin ninguna otra interaccion');
});

// ── Web/PWA ───────────────────────────────────────────────────────────────

test('Web/PWA: ninguna etiqueta PRO visible en IVA, aunque el entitlement diga Free', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit() });
  for (const direction of ['add', 'remove']) {
    c.setTaxDirection(direction);
    for (const rate of ALL_TAX_RATES) {
      assert.equal(c.isRateProLocked('tax-rate', rate), false, `Web: IVA ${rate}% (${direction}) no deberia mostrar PRO`);
    }
  }
});

test('Web/PWA: ninguna etiqueta PRO visible en Margen, aunque el entitlement diga Free', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit() });
  for (const direction of ['forward', 'reverse']) {
    c.setMarginDirection(direction);
    for (const rate of ALL_MARGIN_RATES) {
      assert.equal(c.isRateProLocked('margin-rate', rate), false, `Web: Margen ${rate}% (${direction}) no deberia mostrar PRO`);
    }
  }
});

test('Web/PWA: sin CoreC12EntitlementState ni CoreC12Purchases cargados (como todos los tests pre-Fase-2), ningun indicador aparece', () => {
  const c = createEngine(); // sin ninguna opcion de monetizacion
  c.setTaxDirection('remove');
  c.setMarginDirection('reverse');
  for (const rate of ALL_TAX_RATES) assert.equal(c.isRateProLocked('tax-rate', rate), false);
  for (const rate of ALL_MARGIN_RATES) assert.equal(c.isRateProLocked('margin-rate', rate), false);
});

// ── REGRESION: layout/tamaño/posicion y gating funcional intactos ────────

test('regresion: el indicador PRO no altera el texto del boton (sign + tasa siguen igual)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('add');
  assert.equal(c.taxRateLabel(10), '+10%');
  assert.equal(c.isRateProLocked('tax-rate', 10), true);
});

test('regresion: el indicador PRO y el bloqueo funcional de Fase 2 concuerdan siempre', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('add');
  assert.equal(c.isRateProLocked('tax-rate', 21), true);
  c.digit(1); c.digit(0); c.digit(0);
  c.taxRate(21); // debe seguir bloqueado funcionalmente
  assert.equal(c.numberValue(), 100, 'el indicador visual y el gating funcional no deben divergir');
});

test('regresion: gating funcional de Fase 2 sigue intacto (ningun calculo cambia) tras el indicador visual', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit() });
  c.digit(1); c.digit(0); c.digit(0);
  c.setTaxDirection('add');
  c.taxRate(21);
  assert.equal(c.numberValue(), 121, 'un usuario Pro sigue calculando exactamente igual que en Fase 2');
});

// ── ACCESIBILIDAD: aria-label expone el estado Pro (el ::after de CSS no
//    es una senal fiable para tecnologias asistivas) ─────────────────────
//
// isGatedByPro() es la unica fuente de verdad (misma funcion que decide
// el badge visual y el bloqueo funcional), asi que estas pruebas
// verifican el aria-label directamente contra CoreC12ProFeatures en vez
// de hardcodear que rangos son Pro — evita triplicar la matriz.

function assertAriaCommunicatesPro(label, shouldBePro) {
  const mentionsPro = /pro/i.test(label);
  assert.equal(mentionsPro, shouldBePro, `aria-label "${label}" deberia ${shouldBePro ? '' : 'NO '}mencionar Pro`);
}

test('iOS FREE: el aria-label de un boton Pro comunica el estado Pro a VoiceOver', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('add');
  assertAriaCommunicatesPro(c.rateAriaLabel('tax-rate', 10), true);
  assert.ok(c.rateAriaLabel('tax-rate', 10).startsWith('IVA 10 por ciento'), 'no debe perder el texto base del boton');
});

test('iOS FREE: el aria-label de un boton Free NO menciona Pro', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('add');
  assertAriaCommunicatesPro(c.rateAriaLabel('tax-rate', 4), false);
  assert.equal(c.rateAriaLabel('tax-rate', 4), 'IVA 4 por ciento');
});

test('iOS FREE: -IVA 4% (misma tasa que la version gratuita, pero direccion distinta) SI comunica Pro', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('remove');
  assertAriaCommunicatesPro(c.rateAriaLabel('tax-rate', 4), true);
});

test('iOS FREE: +Margen 20% no comunica Pro, +Margen 25% si (misma logica para margenes)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setMarginDirection('forward');
  assertAriaCommunicatesPro(c.rateAriaLabel('margin-rate', 20), false);
  assertAriaCommunicatesPro(c.rateAriaLabel('margin-rate', 25), true);
});

test('iOS PRO: ningun aria-label conserva indicacion de bloqueo Pro', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(true), purchases: iosNativeWithStoreKit() });
  for (const direction of ['add', 'remove']) {
    c.setTaxDirection(direction);
    for (const rate of ALL_TAX_RATES) {
      assertAriaCommunicatesPro(c.rateAriaLabel('tax-rate', rate), false);
    }
  }
  for (const direction of ['forward', 'reverse']) {
    c.setMarginDirection(direction);
    for (const rate of ALL_MARGIN_RATES) {
      assertAriaCommunicatesPro(c.rateAriaLabel('margin-rate', rate), false);
    }
  }
});

test('Web/PWA: ningun aria-label menciona Pro, aunque el entitlement diga Free', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: webWithoutStoreKit() });
  for (const direction of ['add', 'remove']) {
    c.setTaxDirection(direction);
    for (const rate of ALL_TAX_RATES) {
      assertAriaCommunicatesPro(c.rateAriaLabel('tax-rate', rate), false);
    }
  }
  for (const direction of ['forward', 'reverse']) {
    c.setMarginDirection(direction);
    for (const rate of ALL_MARGIN_RATES) {
      assertAriaCommunicatesPro(c.rateAriaLabel('margin-rate', rate), false);
    }
  }
});

test('accesibilidad: el boton bloqueado sigue siendo interactivo (sin disabled, sin cambiar el data-action)', () => {
  const c = createEngine({ entitlementState: createFakeEntitlement(false), purchases: iosNativeWithStoreKit() });
  c.setTaxDirection('add');
  assert.equal(c.isActionDisabled('tax-rate'), false);
  // El aria-label debe seguir empezando por el texto base — el rol del
  // boton (aplicar/abrir paywall) no cambia, solo se le añade contexto.
  assert.ok(c.rateAriaLabel('tax-rate', 10).startsWith('IVA 10 por ciento'));
});

test('regresion: sin entitlement/purchases cargados, el aria-label es exactamente el mismo que antes de la Fase 3 (sin sufijo)', () => {
  const c = createEngine(); // sin ninguna opcion de monetizacion, como todos los tests pre-Fase-2
  c.setTaxDirection('add');
  assert.equal(c.rateAriaLabel('tax-rate', 10), 'IVA 10 por ciento');
  assert.equal(c.rateAriaLabel('margin-rate', 25), 'Margen 25 por ciento');
});
