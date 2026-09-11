/* =============================================================
   CORE C12 — Lógica de calculadora
   Versión: 2.0 — IVA y margen bidireccionales
   Regla de margen directo (+M):  precio = costo / (1 - margen)
   Regla de margen inverso (−M):  costo  = precio × (1 - margen)
   Regla de IVA directo  (+IVA):  resultado = valor × (1 + tasa)
   Regla de IVA inverso  (−IVA):  resultado = valor / (1 + tasa)
   ============================================================= */

(function () {
  'use strict';


  /* ─────────────────────────────────────────────
     ESTADO CENTRAL
     ───────────────────────────────────────────── */

  const state = {
    displayValue:      '0',    // string activo (entrada manual o formatResult)
    previousValue:     null,   // número almacenado para operación en curso
    operator:          null,   // '+' | '-' | '*' | '/'
    waitingForOperand: false,  // true = próximo dígito reemplaza el display
    activeMargin:      null,   // último margen pulsado (número: 20–45)
    marginStatus:      null,   // texto "+MARGEN 30%" / "−MARGEN 30%" o null
    ivaStatus:         null,   // texto "+IVA 21%" / "−IVA 21%" o null

    // Modo de dirección — persisten durante la sesión, AC no los toca (Fase 1)
    taxDirection:      'add',      // 'add' (+IVA, añadir) | 'remove' (−IVA, quitar)
    marginDirection:   'forward',  // 'forward' (+M, costo→PVP) | 'reverse' (−M, PVP→costo)

    // Selector de decimales
    decimals:          2,      // 1 | 2 | 3 | 4 — solo afecta visualización

    // Modo resultado vs. entrada manual
    isResult:          false,  // true = valor viene de cálculo → aplicar toFixed
    rawResult:         null,   // número puro sin formatear para re-renderizar

    // Línea de detalle (trace de la operación)
    detailText:        '',
  };


  /* ─────────────────────────────────────────────
     REFERENCIAS AL DOM
     ───────────────────────────────────────────── */

  const elNumber = document.getElementById('display-number');
  const elStatus = document.getElementById('display-status');
  const elDetail = document.getElementById('display-detail');


  /* ─────────────────────────────────────────────
     INICIALIZACIÓN
     ───────────────────────────────────────────── */

  function init() {
    document.querySelector('.app').addEventListener('click', handleClick);
    // Renderiza selectores de dirección y rótulos de tasa según el estado inicial
    renderTaxDirectionButtons();
    renderTaxRateLabels();
    renderMarginDirectionButtons();
    renderMarginRateLabels();
    // Marca el botón de decimales por defecto y renderiza
    setDecimals(state.decimals);
  }


  /* ─────────────────────────────────────────────
     DESPACHADOR DE EVENTOS (event delegation)
     ───────────────────────────────────────────── */

  function handleClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const { action, value, rate } = btn.dataset;
    const rateNum = rate !== undefined ? parseFloat(rate) : null;

    switch (action) {
      case 'digit':            inputDigit(value);                             break;
      case 'decimal':          inputDecimal();                                break;
      case 'operator':         inputOperator(value);                         break;
      case 'equals':           calculate();                                   break;
      case 'clear':            clearLast();                                   break;
      case 'all-clear':        clearAll();                                    break;
      case 'sign':             toggleSign();                                  break;
      case 'percent':          inputPercent();                                break;
      case 'margin-rate':      applyMargin(rateNum, btn);                break;
      case 'margin-direction': setMarginDirection(btn.dataset.direction); break;
      case 'tax-rate':         applyTax(rateNum);                        break;
      case 'tax-direction':    setTaxDirection(btn.dataset.direction);    break;
      // data-decimals, no data-rate
      case 'set-decimals': setDecimals(parseInt(btn.dataset.decimals, 10)); break;
    }
  }


  /* ─────────────────────────────────────────────
     ENTRADA NUMÉRICA
     ───────────────────────────────────────────── */

  function inputDigit(digit) {
    if (state.waitingForOperand) {
      state.displayValue      = digit;
      state.waitingForOperand = false;
    } else {
      const digitCount = state.displayValue.replace(/[^0-9]/g, '').length;
      if (digitCount >= 12) return;

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
    clearActiveMarginButton();

    updateDisplay();
  }

  function inputDecimal() {
    if (state.waitingForOperand) {
      state.displayValue      = '0.';
      state.waitingForOperand = false;
      state.isResult          = false;
      state.rawResult         = null;
      // detailText: sin cambio (spec)
      updateDisplay();
      return;
    }

    if (!state.displayValue.includes('.')) {
      state.displayValue += '.';
      updateDisplay();
    }
  }


  /* ─────────────────────────────────────────────
     OPERACIONES BÁSICAS
     ───────────────────────────────────────────── */

  function inputOperator(op) {
    if (state.displayValue === 'Error') return;

    const current = parseFloat(state.displayValue);
    let traceFirst;

    // Encadenamiento: calcular resultado intermedio antes de seguir
    if (state.operator !== null && !state.waitingForOperand) {
      const result = compute(state.previousValue, current, state.operator);
      if (result === null) { handleError(); return; }
      state.displayValue  = formatResult(result);
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

    updateDisplay();
  }

  function calculate() {
    if (state.operator === null || state.previousValue === null) return;
    if (state.displayValue === 'Error') return;

    const current = parseFloat(state.displayValue);
    const op      = state.operator;
    const prev    = state.previousValue;
    const result  = compute(prev, current, op);

    if (result === null) { handleError(); return; }

    // Traza completa: "200 + 50 ="
    const prevStr = String(parseFloat(prev.toPrecision(8)));
    state.detailText = prevStr + ' ' + opSymbol(op) + ' ' + state.displayValue + ' =';

    state.rawResult         = result;
    state.isResult          = true;
    state.displayValue      = formatResult(result);
    state.previousValue     = null;
    state.operator          = null;
    state.waitingForOperand = true;

    updateDisplay();
  }

  // Aritmética pura — devuelve null si división por cero
  function compute(a, b, op) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? null : a / b;
      default:  return b;
    }
  }


  /* ─────────────────────────────────────────────
     CONTROL: C y AC
     ───────────────────────────────────────────── */

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
    updateDisplay();
  }

  // AC — reset total (decimals se conserva)
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

    clearActiveMarginButton();
    updateDisplay();
  }


  /* ─────────────────────────────────────────────
     TRANSFORMACIONES: +/− y %
     ───────────────────────────────────────────── */

  function toggleSign() {
    if (state.displayValue === '0' || state.displayValue === 'Error') return;

    if (state.isResult && state.rawResult !== null) {
      state.rawResult    = -state.rawResult;
      state.displayValue = formatResult(state.rawResult);
    } else {
      state.displayValue = state.displayValue.startsWith('-')
        ? state.displayValue.slice(1)
        : '-' + state.displayValue;
    }
    updateDisplay();
  }

  function inputPercent() {
    if (state.displayValue === 'Error') return;

    const num          = parseFloat(state.displayValue);
    const hasPendingOp = state.previousValue !== null && state.operator !== null;
    let result;

    if (hasPendingOp) {
      // % relativo: 200 + 10% → 10% de 200 = 20
      result = (state.previousValue * num) / 100;
      const prevStr = String(parseFloat(state.previousValue.toPrecision(8)));
      state.detailText = prevStr + ' ' + opSymbol(state.operator) + ' ' + state.displayValue + '%';
    } else {
      result = num / 100;
      state.detailText = state.displayValue + '%';
    }

    state.rawResult         = result;
    state.isResult          = true;
    state.displayValue      = formatResult(result);
    state.waitingForOperand = true;

    updateDisplay();
  }


  /* ─────────────────────────────────────────
     MARGEN COMERCIAL — bidireccional
     +M (forward): precio = costo / (1 - margen)
     −M (reverse): costo  = precio × (1 - margen)

     El selector +M/−M (setMarginDirection) SOLO cambia state.marginDirection.
     No calcula nada y no toca el display. El cálculo ocurre al pulsar
     una tasa (applyMargin), que lee la dirección activa en ese momento.
     ───────────────────────────────────────── */

  function applyMargin(rate, btn) {
    if (state.displayValue === 'Error') return;

    // Capturar el valor visible antes de calcular (para la traza)
    const inputStr = (state.isResult && state.rawResult !== null)
      ? state.rawResult.toFixed(state.decimals)
      : state.displayValue;

    const value     = parseFloat(state.displayValue);
    const direction = state.marginDirection;
    const result    = direction === 'forward'
      ? value / (1 - (rate / 100))   // costo → PVP
      : value * (1 - (rate / 100));  // PVP → costo

    const sign  = direction === 'forward' ? '+' : '\u2212';
    const label = sign + 'MARGEN ' + rate + '%';

    state.rawResult         = result;
    state.isResult          = true;
    state.displayValue      = formatResult(result);
    state.activeMargin      = rate;
    state.marginStatus      = label;
    state.ivaStatus         = null;          // margen nuevo limpia IVA anterior
    state.waitingForOperand = true;
    state.detailText        = inputStr + ' \u2192 ' + sign + 'margen ' + rate + '%';

    setActiveMarginButton(btn);
    updateDisplay();
  }

  // Cambia el modo +M/−M. No calcula, no altera el display.
  function setMarginDirection(direction) {
    if (direction !== 'forward' && direction !== 'reverse') return;
    state.marginDirection = direction;
    renderMarginDirectionButtons();
    renderMarginRateLabels();
  }


  /* ─────────────────────────────────────────
     IVA — bidireccional (motor fiscal porcentual genérico)
     +IVA (add):    resultado = valor × (1 + tasa)
     −IVA (remove): resultado = valor ÷ (1 + tasa)

     El selector +IVA/−IVA (setTaxDirection) SOLO cambia state.taxDirection.
     No calcula nada y no toca el display. El cálculo ocurre al pulsar
     una tasa (applyTax), que lee la dirección activa en ese momento.
     ───────────────────────────────────────── */

  function applyTax(rate) {
    if (state.displayValue === 'Error') return;

    const value     = parseFloat(state.displayValue);
    const factor    = rate / 100;
    const direction = state.taxDirection;
    const label     = direction === 'add'
      ? '+IVA ' + rate + '%'
      : '\u2212IVA ' + rate + '%';

    const result = direction === 'add'
      ? value * (1 + factor)
      : value / (1 + factor);

    // Encadenar al trace existente si lo hay
    state.detailText = state.detailText
      ? state.detailText + ' \u2192 ' + label
      : label;

    state.rawResult         = result;
    state.isResult          = true;
    state.displayValue      = formatResult(result);
    state.ivaStatus         = label;
    state.waitingForOperand = true;

    updateDisplay();
  }

  // Cambia el modo +IVA/−IVA. No calcula, no altera el display.
  function setTaxDirection(direction) {
    if (direction !== 'add' && direction !== 'remove') return;
    state.taxDirection = direction;
    renderTaxDirectionButtons();
    renderTaxRateLabels();
  }


  /* ─────────────────────────────────────────────
     ERROR
     ───────────────────────────────────────────── */

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

    updateDisplay();
  }


  /* ─────────────────────────────────────────────
     SELECTOR DE DECIMALES
     ───────────────────────────────────────────── */

  function setDecimals(n) {
    state.decimals = n;

    // Marcar botón activo
    document.querySelectorAll('[data-action="set-decimals"]').forEach(btn => {
      btn.classList.toggle('is-active', parseInt(btn.dataset.decimals, 10) === n);
    });

    // Re-renderizar: si hay resultado activo, el número cambia según el selector
    updateDisplay();
  }


  /* ─────────────────────────────────────────────
     UTILIDADES
     ───────────────────────────────────────────── */

  // Elimina ruido de coma flotante y trailing zeros (uso interno)
  function formatResult(num) {
    if (!isFinite(num)) return 'Error';
    return String(parseFloat(num.toPrecision(10)));
  }

  // Formato visual español/europeo. No altera el valor interno ni la entrada.
  function formatDisplayNumber(rawValue) {
    const value = String(rawValue);
    if (value === 'Error') return value;

    // Mantener seguro cualquier formato inesperado sin afectar cálculos.
    if (!/^-?\d*\.?\d*$/.test(value)) return value;

    const isNegative = value.startsWith('-');
    const unsigned   = isNegative ? value.slice(1) : value;
    const hasDecimal = unsigned.includes('.');
    const parts      = unsigned.split('.');
    const integerRaw = parts[0] || '0';
    const fraction   = parts[1] || '';
    const grouped    = groupThousands(integerRaw);

    return (isNegative ? '-' : '') + grouped + (hasDecimal ? ',' + fraction : '');
  }

  function groupThousands(integerPart) {
    return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Símbolo tipográfico del operador (para trazas)
  function opSymbol(op) {
    return { '+': '+', '-': '\u2212', '*': '\u00D7', '/': '\u00F7' }[op] || op;
  }


  /* ─────────────────────────────────────────────
     ACTUALIZACIÓN DEL DISPLAY
     Doble ruta: entrada manual vs. resultado calculado
     ───────────────────────────────────────────── */

  function updateDisplay() {
    // ── Número principal ──
    let shown;
    if (state.displayValue === 'Error') {
      shown = 'Error';
    } else if (state.isResult && state.rawResult !== null) {
      // Resultado calculado → aplicar selector de decimales
      shown = state.rawResult.toFixed(state.decimals);
    } else {
      // Entrada manual → mostrar exactamente lo tecleado
      shown = state.displayValue;
    }
    elNumber.textContent = formatDisplayNumber(shown);

    // ── Línea 1: estado abreviado ──
    const parts      = [state.marginStatus, state.ivaStatus].filter(Boolean);
    const statusText = parts.join(' \u00B7 ');
    elStatus.textContent = statusText;
    elStatus.classList.toggle('is-visible', statusText.length > 0);

    // ── Línea 2: detalle de operación ──
    elDetail.textContent = state.detailText;
    elDetail.classList.toggle('is-visible', state.detailText.length > 0);
  }


  /* ─────────────────────────────────────────────
     GESTIÓN DEL BOTÓN DE MARGEN ACTIVO
     ───────────────────────────────────────────── */

  function setActiveMarginButton(activeBtn) {
    document.querySelectorAll('.btn--margin').forEach(btn => {
      btn.classList.remove('is-active');
    });
    activeBtn.classList.add('is-active');
  }

  function clearActiveMarginButton() {
    document.querySelectorAll('.btn--margin').forEach(btn => {
      btn.classList.remove('is-active');
    });
  }


  /* ─────────────────────────────────────────────
     RÓTULOS Y SELECTORES DE DIRECCIÓN (+IVA/−IVA, +M/−M)
     Solo presentación: reflejan state.taxDirection / state.marginDirection
     sobre los botones reales. No calculan, no leen ni escriben el display.
     ───────────────────────────────────────────── */

  function renderTaxDirectionButtons() {
    document.querySelectorAll('.btn--tax-direction').forEach(btn => {
      const active = btn.dataset.direction === state.taxDirection;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function renderTaxRateLabels() {
    const sign = state.taxDirection === 'add' ? '+' : '−';
    document.querySelectorAll('[data-action="tax-rate"]').forEach(btn => {
      btn.textContent = sign + btn.dataset.rate + '%';
    });
  }

  function renderMarginDirectionButtons() {
    document.querySelectorAll('.btn--margin-direction').forEach(btn => {
      const active = btn.dataset.direction === state.marginDirection;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function renderMarginRateLabels() {
    const sign = state.marginDirection === 'forward' ? '+' : '−';
    document.querySelectorAll('[data-action="margin-rate"]').forEach(btn => {
      btn.textContent = sign + btn.dataset.rate + '%';
    });
  }


  /* ─────────────────────────────────────────────
     ARRANQUE
     ───────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', init);

})();
