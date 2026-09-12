/* =============================================================
   CORE C12 — Máquina de estado de la calculadora
   Extraída de calc.js (Etapa 5 — Migración a arquitectura por capas).

   Gestiona: valor interno/entrada, operando pendiente, operador,
   encadenamiento, resultado interno, dirección IVA/margen, margen
   activo, decimales seleccionados (solo preferencia de presentación:
   nunca trunca el valor interno) y las trazas de operación.

   NO conoce el árbol de la página, APIs del navegador, almacenamiento
   persistente ni configuración de plataforma nativa — solo números,
   strings y las fórmulas del core matemático (CoreC12Core). El modo
   de edición de tasas/márgenes permanece deliberadamente en calc.js
   (ver informe de la Etapa 5: EDIT STATE DEFERRED), por lo que esta
   máquina no conoce editMode en absoluto.

   Cada acción devuelve `true` si mutó el estado (la UI debe
   re-renderizar) o `false` si fue un no-op silencioso — exactamente
   los mismos casos que ya existían en el calc.js original (límite de
   12 dígitos, display en 'Error', división por cero, dirección
   inválida, etc.), para no introducir ni eliminar ningún re-render.

   Se expone mediante el objeto global del propio lenguaje (no una
   API de navegador), igual que core/calculator.js, para que calc.js
   pueda seguir cargándose como script clásico síncrono.
   ============================================================= */

'use strict';

function createState(options = {}) {
  const state = {
    displayValue:      '0',
    previousValue:     null,
    operator:          null,
    waitingForOperand: false,
    activeMargin:      null,
    marginStatus:      null,
    ivaStatus:         null,

    taxDirection:      'add',
    marginDirection:   'forward',

    decimals: options.decimals !== undefined ? options.decimals : 2,

    isResult:  false,
    rawResult: null,

    detailText: '',
  };

  // Símbolo tipográfico del operador (para trazas) — uso interno.
  function opSymbol(op) {
    return { '+': '+', '-': '−', '*': '×', '/': '÷' }[op] || op;
  }

  function getSnapshot() {
    return { ...state };
  }

  function handleError() {
    state.displayValue      = 'Error';
    state.previousValue     = null;
    state.operator          = null;
    state.waitingForOperand = true;
    state.marginStatus      = null;
    state.ivaStatus         = null;
    state.isResult          = false;
    state.rawResult         = null;
    state.detailText        = '';
  }

  function inputDigit(digit) {
    if (state.waitingForOperand) {
      state.displayValue      = digit;
      state.waitingForOperand = false;
    } else {
      const digitCount = state.displayValue.replace(/[^0-9]/g, '').length;
      if (digitCount >= 12) return false;

      state.displayValue = state.displayValue === '0'
        ? digit
        : state.displayValue + digit;
    }

    // Entrada manual: limpiar todo el contexto de resultado
    state.isResult     = false;
    state.rawResult    = null;
    state.detailText   = '';
    state.activeMargin = null;
    state.marginStatus = null;
    state.ivaStatus    = null;

    return true;
  }

  function inputDecimal() {
    if (state.waitingForOperand) {
      state.displayValue      = '0.';
      state.waitingForOperand = false;
      state.isResult          = false;
      state.rawResult         = null;
      // detailText: sin cambio (spec)
      return true;
    }

    if (!state.displayValue.includes('.')) {
      state.displayValue += '.';
      return true;
    }

    return false;
  }

  function inputOperator(op) {
    if (state.displayValue === 'Error') return false;

    const current = parseFloat(state.displayValue);
    let traceFirst;

    // Encadenamiento: calcular resultado intermedio antes de seguir
    if (state.operator !== null && !state.waitingForOperand) {
      const result = CoreC12Core.compute(state.previousValue, current, state.operator);
      if (result === null) { handleError(); return true; }
      state.displayValue  = CoreC12Core.formatResult(result);
      state.previousValue = result;
      traceFirst          = state.displayValue;   // resultado intermedio
    } else {
      state.previousValue = current;
      // Si el display muestra un resultado formateado, usarlo para el trace
      traceFirst = (state.isResult && state.rawResult !== null)
        ? state.rawResult.toFixed(state.decimals)
        : state.displayValue;
    }

    state.operator          = op;
    state.waitingForOperand = true;
    state.isResult          = false;
    state.rawResult         = null;
    state.marginStatus      = null;
    state.ivaStatus         = null;
    // Traza parcial — visible momentáneamente hasta que el usuario pulse un dígito
    state.detailText        = traceFirst + ' ' + opSymbol(op);

    return true;
  }

  function calculate() {
    if (state.operator === null || state.previousValue === null) return false;
    if (state.displayValue === 'Error') return false;

    const current = parseFloat(state.displayValue);
    const op      = state.operator;
    const prev    = state.previousValue;
    const result  = CoreC12Core.compute(prev, current, op);

    if (result === null) { handleError(); return true; }

    // Traza completa: "200 + 50 ="
    const prevStr = String(parseFloat(prev.toPrecision(8)));
    state.detailText = prevStr + ' ' + opSymbol(op) + ' ' + state.displayValue + ' =';

    state.rawResult         = result;
    state.isResult          = true;
    state.displayValue      = CoreC12Core.formatResult(result);
    state.previousValue     = null;
    state.operator          = null;
    state.waitingForOperand = true;

    return true;
  }

  // C — borrar último dígito (o limpiar resultado)
  function clearLast() {
    if (state.waitingForOperand || state.displayValue === 'Error') {
      state.displayValue      = '0';
      state.waitingForOperand = false;
      state.isResult          = false;
      state.rawResult         = null;
      // detailText: sin cambio (spec: clearLast no inventa trazas)
    } else if (state.displayValue.length > 1) {
      state.displayValue = state.displayValue.slice(0, -1);
      if (state.displayValue === '-') state.displayValue = '0';
    } else {
      state.displayValue = '0';
    }
    return true;
  }

  // AC — reset total (decimals/taxDirection/marginDirection se conservan)
  function clearAll() {
    state.displayValue      = '0';
    state.previousValue     = null;
    state.operator          = null;
    state.waitingForOperand = false;
    state.activeMargin      = null;
    state.marginStatus      = null;
    state.ivaStatus         = null;
    state.isResult          = false;
    state.rawResult         = null;
    state.detailText        = '';
    // state.decimals, state.taxDirection, state.marginDirection: NO se resetean
    // (persisten durante la sesión hasta que el usuario los cambie manualmente)

    return true;
  }

  function toggleSign() {
    if (state.displayValue === '0' || state.displayValue === 'Error') return false;

    if (state.isResult && state.rawResult !== null) {
      state.rawResult    = -state.rawResult;
      state.displayValue = CoreC12Core.formatResult(state.rawResult);
    } else {
      state.displayValue = state.displayValue.startsWith('-')
        ? state.displayValue.slice(1)
        : '-' + state.displayValue;
    }
    return true;
  }

  function percent() {
    if (state.displayValue === 'Error') return false;

    const num          = parseFloat(state.displayValue);
    const hasPendingOp = state.previousValue !== null && state.operator !== null;
    let result;

    if (hasPendingOp) {
      // % relativo: 200 + 10% → 10% de 200 = 20
      result = CoreC12Core.percentOfBase(state.previousValue, num);
      const prevStr = String(parseFloat(state.previousValue.toPrecision(8)));
      state.detailText = prevStr + ' ' + opSymbol(state.operator) + ' ' + state.displayValue + '%';
    } else {
      result = CoreC12Core.percentAsDecimal(num);
      state.detailText = state.displayValue + '%';
    }

    state.rawResult         = result;
    state.isResult          = true;
    state.displayValue      = CoreC12Core.formatResult(result);
    state.waitingForOperand = true;

    return true;
  }

  function applyMargin(rate) {
    if (state.displayValue === 'Error') return false;

    // Capturar el valor visible antes de calcular (para la traza)
    const inputStr = (state.isResult && state.rawResult !== null)
      ? state.rawResult.toFixed(state.decimals)
      : state.displayValue;

    const value     = parseFloat(state.displayValue);
    const direction = state.marginDirection;
    const result    = CoreC12Core.applyMarginRate(value, rate, direction);

    const sign  = direction === 'forward' ? '+' : '−';
    const label = sign + 'MARGEN ' + rate + '%';

    state.rawResult         = result;
    state.isResult          = true;
    state.displayValue      = CoreC12Core.formatResult(result);
    state.activeMargin      = rate;
    state.marginStatus      = label;
    state.ivaStatus         = null;          // margen nuevo limpia IVA anterior
    state.waitingForOperand = true;
    state.detailText        = inputStr + ' → ' + sign + 'margen ' + rate + '%';

    return true;
  }

  // Cambia el modo +M/−M. No calcula.
  function setMarginDirection(direction) {
    if (direction !== 'forward' && direction !== 'reverse') return false;
    state.marginDirection = direction;
    return true;
  }

  function applyTax(rate) {
    if (state.displayValue === 'Error') return false;

    const value     = parseFloat(state.displayValue);
    const direction = state.taxDirection;
    const label     = direction === 'add'
      ? '+IVA ' + rate + '%'
      : '−IVA ' + rate + '%';

    const result = CoreC12Core.applyTaxRate(value, rate, direction);

    // Encadenar al trace existente si lo hay
    state.detailText = state.detailText
      ? state.detailText + ' → ' + label
      : label;

    state.rawResult         = result;
    state.isResult          = true;
    state.displayValue      = CoreC12Core.formatResult(result);
    state.ivaStatus         = label;
    state.waitingForOperand = true;

    return true;
  }

  // Cambia el modo +IVA/−IVA. No calcula.
  function setTaxDirection(direction) {
    if (direction !== 'add' && direction !== 'remove') return false;
    state.taxDirection = direction;
    return true;
  }

  // Los decimales solo afectan la visualización — nunca el valor interno
  // (rawResult/displayValue no se tocan aquí).
  function setDecimals(n) {
    state.decimals = n;
    return true;
  }

  return {
    getSnapshot,
    inputDigit,
    inputDecimal,
    inputOperator,
    calculate,
    clearLast,
    clearAll,
    toggleSign,
    percent,
    applyMargin,
    setMarginDirection,
    applyTax,
    setTaxDirection,
    setDecimals,
  };
}

globalThis.CoreC12State = { createState };
