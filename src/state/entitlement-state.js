/* =============================================================
   CORE C12 — Maquina de estado de monetizacion (entitlement)
   Fase 1 — arquitectura productiva de Free/Pro.

   Coordina la capa Platform (src/platform/purchases.js, StoreKit 2
   on-device) y la capa Storage (src/storage/preferences.js) para
   exponer un unico estado de monetizacion a la UI. No conoce
   formulas comerciales, gating de funciones concretas ni paywall —
   eso es responsabilidad de fases posteriores (Fase 2/3/4).

   Igual que src/state/calculator-state.js, no importa nada: ni DOM,
   ni Capacitor, ni almacenamiento persistente directo. Referencia los
   globales productivos (CoreC12Purchases, CoreC12Preferences) salvo
   que se le inyecten explicitamente via options — el mismo mecanismo
   que calc.js usa con CoreC12Haptics, para poder probar esta maquina
   de estados sin tocar StoreKit ni el navegador real.

   FUENTE DE VERDAD: Transaction.currentEntitlements, via Platform.
   La cache local (storage) NUNCA es autoritativa: solo acelera el
   arranque y sostiene un uso razonable offline (ver STOREKIT2_SPIKE.md
   y el bloque OFFLINE del prompt de Fase 1). Por eso una revalidacion
   fallida en segundo plano (sin conexion, StoreKit no responde) jamas
   degrada un isPro=true cacheado ni produce el estado 'error': ese
   estado queda reservado para acciones explicitas del usuario
   (purchase/restore) que necesitan feedback en la UI.

   Seguridad: Pro solo se concede sobre un resultado que Platform ya
   marco como verified (ver CoreC12PurchasesPlugin.swift). Un resultado
   'unverified' nunca activa isPro, aunque Platform lo resuelva en vez
   de rechazarlo.
   ============================================================= */

'use strict';

var ENTITLEMENT_STORAGE_KEY = 'core-c12.entitlement.v1';
var ENTITLEMENT_SCHEMA_VERSION = 1;

function createEntitlementState(options) {
  options = options || {};

  var platform = options.platform
    || (typeof CoreC12Purchases !== 'undefined' ? CoreC12Purchases : undefined);
  var storage = options.storage
    || (typeof CoreC12Preferences !== 'undefined' ? CoreC12Preferences : undefined);

  // status: 'loading' | 'free' | 'purchasing' | 'pro' | 'restoring' | 'error'
  var state = {
    status: 'loading',
    isPro: false,
    error: null,
  };

  var listeners = [];

  function getSnapshot() {
    return { status: state.status, isPro: state.isPro, error: state.error };
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  function notify() {
    var snapshot = getSnapshot();
    listeners.forEach(function (fn) {
      try { fn(snapshot); } catch (e) { /* un listener roto no debe romper a los demas */ }
    });
  }

  function setState(status, patch) {
    patch = patch || {};
    state.status = status;
    state.isPro = !!patch.isPro;
    state.error = patch.error || null;
    notify();
  }

  /* ── Cache local (no autoritativa) ───────────────────────── */

  function readCache() {
    if (!storage) return null;
    var raw = storage.read(ENTITLEMENT_STORAGE_KEY);
    if (raw === null) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== ENTITLEMENT_SCHEMA_VERSION || typeof parsed.isPro !== 'boolean') {
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeCache(isPro) {
    if (!storage) return;
    storage.write(ENTITLEMENT_STORAGE_KEY, JSON.stringify({
      version: ENTITLEMENT_SCHEMA_VERSION,
      isPro: isPro,
      verifiedAt: new Date().toISOString(),
    }));
  }

  /* ── Arranque ─────────────────────────────────────────────── */

  async function init() {
    var cached = readCache();
    var cachedIsPro = !!(cached && cached.isPro);

    // Arranque optimista desde cache: evita parpadeo Free -> Pro y
    // sostiene "Pro offline" (ver cabecera) hasta que la revalidacion
    // confirme o corrija el estado.
    setState(cachedIsPro ? 'pro' : 'free', { isPro: cachedIsPro });

    if (!platform) return;

    try {
      var result = await platform.getEntitlement();
      writeCache(!!result.isPro);
      setState(result.isPro ? 'pro' : 'free', { isPro: !!result.isPro });
    } catch (e) {
      // Revalidacion fallida (offline, StoreKit no disponible): se
      // mantiene el estado ya aplicado desde cache arriba. No es un
      // fallo de usuario, es el caso "Pro offline" documentado.
    }
  }

  /* ── Compra ───────────────────────────────────────────────── */

  async function purchase() {
    if (state.status === 'purchasing' || state.status === 'restoring') {
      return { ignored: true };
    }
    if (state.status === 'pro') {
      return { success: true, alreadyPro: true };
    }
    if (!platform) {
      setState('error', { isPro: false, error: { code: 'NO_PLATFORM' } });
      return { success: false };
    }

    setState('purchasing', { isPro: false });

    try {
      var result = await platform.purchase();

      if (result.status === 'verified' && result.isPro) {
        writeCache(true);
        setState('pro', { isPro: true });
        return { success: true };
      }

      if (result.status === 'cancelled') {
        // Cancelacion explicita del usuario: NO es un error.
        setState('free', { isPro: false });
        return { success: false, cancelled: true };
      }

      // unverified / pending / unknown / unavailable: nunca se
      // concede Pro sobre una transaccion que Platform no marco como
      // verified (regla de seguridad de Fase 1).
      setState('error', { isPro: false, error: { code: result.status || 'PURCHASE_FAILED' } });
      return { success: false };
    } catch (e) {
      setState('error', { isPro: false, error: { code: e && e.code, message: e && e.message } });
      return { success: false };
    }
  }

  /* ── Restore ──────────────────────────────────────────────── */

  async function restore() {
    if (state.status === 'purchasing' || state.status === 'restoring') {
      return { ignored: true };
    }
    if (!platform) {
      setState('error', { isPro: state.isPro, error: { code: 'NO_PLATFORM' } });
      return { found: false };
    }

    var wasPro = state.isPro;
    setState('restoring', { isPro: wasPro });

    try {
      var result = await platform.restorePurchases();
      writeCache(!!result.isPro);
      setState(result.isPro ? 'pro' : 'free', { isPro: !!result.isPro });
      return { found: !!result.isPro };
    } catch (e) {
      // Fallo de restore (red, StoreKit): nunca degradar en silencio
      // un Pro ya conocido solo porque este intento fallo.
      setState('error', { isPro: wasPro, error: { code: e && e.code, message: e && e.message } });
      return { found: false, error: true };
    }
  }

  return {
    getSnapshot: getSnapshot,
    subscribe: subscribe,
    init: init,
    purchase: purchase,
    restore: restore,
  };
}

// Instancia productiva compartida (Fase 4): calc.js (gating) y
// paywall.js (compra/restore) necesitan ver exactamente el mismo
// estado de monetizacion, no dos maquinas de estado independientes —
// si no, una compra hecha desde el paywall nunca actualizaria los
// indicadores PRO que calc.js ya pinto. createEntitlementState() en
// si mismo sigue siendo una fabrica pura sin efectos colaterales
// (Fase 1: cada test crea su propia instancia aislada con fakes
// inyectados); este wrapper solo memoiza UNA instancia productiva,
// creada con los defaults reales (CoreC12Purchases/CoreC12Preferences),
// e inicializada una unica vez.
var sharedEntitlementState = null;

function getSharedEntitlementState() {
  if (!sharedEntitlementState) {
    sharedEntitlementState = createEntitlementState();
    sharedEntitlementState.init();
  }
  return sharedEntitlementState;
}

globalThis.CoreC12EntitlementState = {
  createEntitlementState: createEntitlementState,
  getSharedEntitlementState: getSharedEntitlementState,
};
