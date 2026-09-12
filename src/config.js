/* =============================================================
   CORE C12 — Configuración persistente
   Versión de esquema: 1
   Clave de almacenamiento: core-c12.settings.v1

   Responsabilidad única: defaults, validación, y orquestación de
   carga/guardado. Sin dependencia del DOM. El acceso concreto al
   almacenamiento persistente vive exclusivamente en
   storage/preferences.js (globalThis.CoreC12Preferences) — este
   archivo nunca toca ese almacenamiento directamente, solo le pide
   leer/escribir mediante una clave. calc.js consume esta capa a
   través de window.CoreC12Config.

   Persistencia todo-o-nada: si cualquier campo almacenado es
   inválido (JSON corrupto, versión desconocida, o cualquier valor
   fuera de rango), se descarta el objeto COMPLETO y se cae a
   defaults. No se mezclan campos válidos con inválidos: un estado
   híbrido sería impredecible y más difícil de depurar que perder
   una configuración corrupta por completo.

   El almacenamiento subyacente puede no estar disponible, o lanzar
   excepción al leer o escribir (modo privado, cuota excedida,
   política del navegador) — storage/preferences.js ya absorbe eso
   de forma segura. Ninguna función de este archivo propaga una
   excepción por ese motivo: la persistencia es una mejora, nunca un
   punto único de fallo. Si falla, Core C12 sigue funcionando en
   memoria.
   ============================================================= */

(function () {
  'use strict';

  var STORAGE_KEY = 'core-c12.settings.v1';
  var SCHEMA_VERSION = 1;

  // Única fuente de verdad de los valores predeterminados.
  // Reutilizada por RESTABLECER en una fase futura (Fase 2B).
  var DEFAULTS = Object.freeze({
    version:     SCHEMA_VERSION,
    taxRates:    Object.freeze([4, 10, 21]),
    marginRates: Object.freeze([20, 25, 30, 35, 40, 45]),
    decimals:    2,
  });

  var TAX_RATE_COUNT    = 3;
  var TAX_RATE_MIN      = 0;
  var TAX_RATE_MAX      = 100;
  var MARGIN_RATE_COUNT = 6;
  var MARGIN_RATE_MIN   = 1;
  var MARGIN_RATE_MAX   = 90;
  var ALLOWED_DECIMALS  = [1, 2, 3, 4];

  // Configuración válida vigente en memoria — fuente de verdad en runtime.
  // Se mantiene sincronizada con el almacenamiento persistente cuando esa
  // escritura es posible.
  var currentConfig = null;


  /* ─────────────────────────────────────────────
     DEFAULTS
     ───────────────────────────────────────────── */

  function getDefaults() {
    // Copia nueva en cada llamada: nunca se expone (ni se permite mutar)
    // el objeto congelado interno.
    return {
      version:     DEFAULTS.version,
      taxRates:    DEFAULTS.taxRates.slice(),
      marginRates: DEFAULTS.marginRates.slice(),
      decimals:    DEFAULTS.decimals,
    };
  }


  /* ─────────────────────────────────────────────
     VALIDACIÓN
     ───────────────────────────────────────────── */

  // Máximo 1 decimal, verificado sobre la representación en texto para
  // evitar los falsos positivos/negativos típicos de comparar floats.
  function hasAtMostOneDecimalDigit(n) {
    var str = String(n);
    var dot = str.indexOf('.');
    if (dot === -1) return true;
    return (str.length - dot - 1) <= 1;
  }

  function isValidRate(n, min, max) {
    return typeof n === 'number'
      && Number.isFinite(n)
      && n >= min
      && n <= max
      && hasAtMostOneDecimalDigit(n);
  }

  function hasDuplicates(arr) {
    return new Set(arr).size !== arr.length;
  }

  // 3 posiciones, 0-100, máx. 1 decimal, sin duplicados. Orden NO se altera.
  function validateTaxRates(rates) {
    if (!Array.isArray(rates)) return false;
    if (rates.length !== TAX_RATE_COUNT) return false;
    if (!rates.every(function (r) { return isValidRate(r, TAX_RATE_MIN, TAX_RATE_MAX); })) return false;
    if (hasDuplicates(rates)) return false;
    return true;
  }

  // 6 posiciones, 1-90, máx. 1 decimal, sin duplicados. Orden NO se altera.
  function validateMarginRates(rates) {
    if (!Array.isArray(rates)) return false;
    if (rates.length !== MARGIN_RATE_COUNT) return false;
    if (!rates.every(function (r) { return isValidRate(r, MARGIN_RATE_MIN, MARGIN_RATE_MAX); })) return false;
    if (hasDuplicates(rates)) return false;
    return true;
  }

  function validateDecimals(n) {
    return typeof n === 'number' && Number.isInteger(n) && ALLOWED_DECIMALS.indexOf(n) !== -1;
  }

  // Valida el objeto de configuración COMPLETO. Todo o nada: si cualquier
  // campo es inválido, el objeto entero se considera inválido (ver cabecera).
  function validateConfig(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { valid: false };
    }
    if (obj.version !== SCHEMA_VERSION) return { valid: false };
    if (!validateTaxRates(obj.taxRates)) return { valid: false };
    if (!validateMarginRates(obj.marginRates)) return { valid: false };
    if (!validateDecimals(obj.decimals)) return { valid: false };

    return {
      valid: true,
      config: {
        version:     SCHEMA_VERSION,
        taxRates:    obj.taxRates.slice(),
        marginRates: obj.marginRates.slice(),
        decimals:    obj.decimals,
      },
    };
  }


  /* ─────────────────────────────────────────────
     CARGA Y GUARDADO
     ───────────────────────────────────────────── */

  // Lee y valida lo almacenado. Si falta, está corrupto, tiene una
  // versión distinta o cualquier campo es inválido, cae a defaults
  // (sin escribirlos todavía — no reescribe una configuración corrupta
  // preexistente por su cuenta; write-back solo ocurre vía update*/save).
  function loadConfig() {
    var raw = CoreC12Preferences.read(STORAGE_KEY);

    if (raw !== null) {
      var parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        parsed = null;
      }
      if (parsed !== null) {
        var result = validateConfig(parsed);
        if (result.valid) {
          currentConfig = result.config;
          return currentConfig;
        }
      }
    }

    currentConfig = getDefaults();
    return currentConfig;
  }

  function getConfig() {
    if (!currentConfig) currentConfig = loadConfig();
    // Copia defensiva: el llamador nunca debe poder mutar el estado interno.
    return {
      version:     currentConfig.version,
      taxRates:    currentConfig.taxRates.slice(),
      marginRates: currentConfig.marginRates.slice(),
      decimals:    currentConfig.decimals,
    };
  }

  // Valida y persiste un objeto de configuración completo. Si es válido,
  // actualiza SIEMPRE la copia en memoria — incluso si la escritura en el
  // almacenamiento persistente falla, porque la persistencia nunca debe
  // bloquear el uso normal de la app (ver cabecera). Devuelve si la config
  // es válida y quedó aplicada en memoria (no si además se guardó en disco).
  function saveConfig(config) {
    var result = validateConfig(config);
    if (!result.valid) return false;
    currentConfig = result.config;
    CoreC12Preferences.write(STORAGE_KEY, JSON.stringify(currentConfig));
    return true;
  }

  function updateTaxRates(rates) {
    var base = currentConfig || getDefaults();
    return saveConfig({
      version:     SCHEMA_VERSION,
      taxRates:    rates,
      marginRates: base.marginRates,
      decimals:    base.decimals,
    });
  }

  function updateMarginRates(rates) {
    var base = currentConfig || getDefaults();
    return saveConfig({
      version:     SCHEMA_VERSION,
      taxRates:    base.taxRates,
      marginRates: rates,
      decimals:    base.decimals,
    });
  }

  function updateDecimals(n) {
    var base = currentConfig || getDefaults();
    return saveConfig({
      version:     SCHEMA_VERSION,
      taxRates:    base.taxRates,
      marginRates: base.marginRates,
      decimals:    n,
    });
  }


  /* ─────────────────────────────────────────────
     PRESENTACIÓN DE PORCENTAJES
     Máx. 1 decimal, coma europea, sin ceros de relleno:
     20 -> "20%"   32.5 -> "32,5%"   (nunca "20,0%")
     El signo (+/-) es responsabilidad de quien llama (calc.js).
     ───────────────────────────────────────────── */

  function formatRate(rate) {
    return String(rate).replace('.', ',') + '%';
  }


  window.CoreC12Config = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    // Límites de rango expuestos de solo lectura — para que la UI de edición
    // (Fase 2B) pueda componer mensajes de validación (p. ej. "RANGO 1–90")
    // sin duplicar estos números como regla propia.
    TAX_RATE_MIN: TAX_RATE_MIN,
    TAX_RATE_MAX: TAX_RATE_MAX,
    MARGIN_RATE_MIN: MARGIN_RATE_MIN,
    MARGIN_RATE_MAX: MARGIN_RATE_MAX,
    getDefaults: getDefaults,
    loadConfig: loadConfig,
    getConfig: getConfig,
    saveConfig: saveConfig,
    updateTaxRates: updateTaxRates,
    updateMarginRates: updateMarginRates,
    updateDecimals: updateDecimals,
    validateConfig: validateConfig,
    validateTaxRates: validateTaxRates,
    validateMarginRates: validateMarginRates,
    validateDecimals: validateDecimals,
    formatRate: formatRate,
  };

})();
