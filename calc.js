/* =============================================================
   CORE C12 — Lógica de calculadora
   Versión: 2.1 — configuración persistente (tasas, márgenes, decimales)
   Regla de margen directo (+M):  precio = costo / (1 - margen)
   Regla de margen inverso (−M):  costo  = precio × (1 - margen)
   Regla de IVA directo  (+IVA):  resultado = valor × (1 + tasa)
   Regla de IVA inverso  (−IVA):  resultado = valor / (1 + tasa)
   Requiere config.js cargado antes (window.CoreC12Config).
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

    // Fase 2B — edición configurable de IVA / margen (misma pantalla)
    editMode:               null,  // null | 'tax' | 'margin'
    editingIndex:            null,  // null | posición seleccionada (0-2 IVA, 0-5 margen)
    editBuffer:              '',    // string en construcción para la nueva tasa
    editBufferFresh:         false, // true: el próximo dígito reemplaza el buffer (recién seleccionado)
    editError:               '',    // mensaje de validación breve, se limpia al reanudar tecleo
    editResetConfirmPending: false, // true tras el primer toque en RESTABLECER (confirmación en 2 toques)
  };


  /* ─────────────────────────────────────────────
     REFERENCIAS AL DOM
     ───────────────────────────────────────────── */

  const elNumber = document.getElementById('display-number');
  const elStatus = document.getElementById('display-status');
  const elDetail = document.getElementById('display-detail');

  // Fase 2B — cabeceras y fila de acciones de edición
  const elTaxLabel          = document.getElementById('tax-block-label');
  const elMarginLabel       = document.getElementById('margin-block-label');
  const elTaxEditActions    = document.getElementById('tax-edit-actions');
  const elMarginEditActions = document.getElementById('margin-edit-actions');
  const elTaxResetLabel     = document.getElementById('tax-reset-label');
  const elMarginResetLabel  = document.getElementById('margin-reset-label');


  /* ─────────────────────────────────────────────
     INICIALIZACIÓN
     ───────────────────────────────────────────── */

  function init() {
    document.querySelector('.app').addEventListener('click', handleClick);

    // Configuración persistida: tasas fiscales, márgenes y decimales.
    // taxDirection/marginDirection NUNCA se leen de aquí — arrancan
    // siempre en +IVA/+M (ver setTaxDirection/setMarginDirection).
    CoreC12Config.loadConfig();
    const config = CoreC12Config.getConfig();
    applyConfiguredRates(config);

    // Renderiza selectores de dirección y rótulos de tasa según el estado inicial
    renderTaxDirectionButtons();
    renderTaxRateLabels();
    renderMarginDirectionButtons();
    renderMarginRateLabels();
    // Decimales: toma el valor configurado y marca el botón activo
    setDecimals(config.decimals);
  }

  // Alimenta las posiciones físicas de tasa desde la configuración.
  // El orden del DOM define la posición; el valor en cada posición es
  // el configurado (por defecto: 4/10/21 y 20/25/30/35/40/45).
  function applyConfiguredRates(config) {
    const taxButtons = document.querySelectorAll('[data-action="tax-rate"]');
    config.taxRates.forEach((rate, i) => {
      if (taxButtons[i]) taxButtons[i].dataset.rate = String(rate);
    });

    const marginButtons = document.querySelectorAll('[data-action="margin-rate"]');
    config.marginRates.forEach((rate, i) => {
      if (marginButtons[i]) marginButtons[i].dataset.rate = String(rate);
    });
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
      case 'margin-rate':
        // Edición IVA activa -> margen queda bloqueado por completo (no-op)
        if (state.editMode === 'margin') selectEditPosition('margin', rateButtonIndex(btn, 'margin-rate'), btn);
        else if (state.editMode === null) applyMargin(rateNum, btn);
        break;
      case 'margin-direction': setMarginDirection(btn.dataset.direction); break;
      case 'tax-rate':
        // Edición margen activa -> IVA queda bloqueado por completo (no-op)
        if (state.editMode === 'tax') selectEditPosition('tax', rateButtonIndex(btn, 'tax-rate'), btn);
        else if (state.editMode === null) applyTax(rateNum);
        break;
      case 'tax-direction':    setTaxDirection(btn.dataset.direction);    break;
      // data-decimals, no data-rate
      case 'set-decimals': setDecimals(parseInt(btn.dataset.decimals, 10)); break;

      // Fase 2B — edición configurable de IVA / margen
      case 'edit-tax':         enterEditMode('tax');       break;
      case 'edit-margin':      enterEditMode('margin');    break;
      case 'edit-done-tax':    exitEditMode();              break;
      case 'edit-done-margin': exitEditMode();              break;
      case 'reset-tax':        handleResetRates('tax');    break;
      case 'reset-margin':     handleResetRates('margin'); break;
    }
  }


  /* ─────────────────────────────────────────────
     ENTRADA NUMÉRICA
     ───────────────────────────────────────────── */

  function inputDigit(digit) {
    if (state.editMode !== null) { editInputDigit(digit); return; }

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
    if (state.editMode !== null) { editInputDecimal(); return; }

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
    if (state.editMode !== null) return;
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
    if (state.editMode !== null) { editConfirmPosition(); return; }

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
    if (state.editMode !== null) { editBackspace(); return; }

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
    if (state.editMode !== null) { editCancelPosition(); return; }

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
    if (state.editMode !== null) return;
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
    if (state.editMode !== null) return;
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
    if (state.editMode !== null) return;
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
    if (state.editMode !== null) return;
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
    if (state.editMode !== null) return;
    state.decimals = n;
    CoreC12Config.updateDecimals(n); // persiste; no-op seguro si localStorage falla

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
    if (state.editMode !== null) { renderEditDisplay(); return; }

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
      btn.textContent = sign + CoreC12Config.formatRate(btn.dataset.rate);
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
      btn.textContent = sign + CoreC12Config.formatRate(btn.dataset.rate);
    });
  }


  /* ─────────────────────────────────────────
     EDICIÓN CONFIGURABLE DE IVA / MARGEN — Fase 2B
     Reutiliza el teclado numérico existente (0-9, ., C, AC, =) y la API
     de configuración ya disponible (CoreC12Config) — sin lógica paralela
     de validación, defaults, rangos ni persistencia. Todo ocurre en la
     misma pantalla: no se crea vista, modal ni teclado nuevos.
     ───────────────────────────────────────── */

  function enterEditMode(mode) {
    if (state.editMode !== null) return; // ya en edición: ignorar re-entrada
    state.editMode = mode;
    resetEditPositionState();
    renderEditChrome();
    updateDisplay();
  }

  function exitEditMode() {
    if (state.editMode === null) return;
    const mode = state.editMode;
    state.editMode = null;
    resetEditPositionState();
    renderEditChrome();
    if (mode === 'tax') renderTaxRateLabels(); else renderMarginRateLabels();
    syncActiveMarginButtonFromState();
    updateDisplay();
  }

  // Limpia posición/buffer/error/confirmación de reset. Usado al entrar,
  // cancelar (AC), guardar (=) o salir (LISTO) del modo edición.
  function resetEditPositionState() {
    state.editingIndex            = null;
    state.editBuffer              = '';
    state.editBufferFresh         = false;
    state.editError               = '';
    state.editResetConfirmPending = false;
  }

  // Selecciona una posición dentro del módulo en edición: carga su valor
  // actual en el buffer (el primer dígito tecleado lo reemplaza por
  // completo, como el resto de la calculadora tras un operador).
  function selectEditPosition(mode, index, btn) {
    if (state.editMode !== mode || state.editingIndex !== null) return;

    const config = CoreC12Config.getConfig();
    const rates  = mode === 'tax' ? config.taxRates : config.marginRates;
    if (index < 0 || index >= rates.length) return;

    state.editingIndex            = index;
    state.editBuffer              = String(rates[index]);
    state.editBufferFresh         = true;
    state.editError               = '';
    state.editResetConfirmPending = false;

    if (mode === 'tax') setActiveTaxEditButton(btn); else setActiveMarginButton(btn);
    renderEditChrome();
    updateDisplay();
  }

  function editInputDigit(digit) {
    if (state.editingIndex === null) return; // sin posición seleccionada: no-op
    state.editBuffer      = state.editBufferFresh ? digit : state.editBuffer + digit;
    state.editBufferFresh = false;
    state.editError        = '';
    updateDisplay();
  }

  function editInputDecimal() {
    if (state.editingIndex === null) return;
    if (state.editBufferFresh) {
      state.editBuffer      = '0.';
      state.editBufferFresh = false;
    } else if (!state.editBuffer.includes('.')) {
      state.editBuffer += '.';
    }
    state.editError = '';
    updateDisplay();
  }

  // C — borra el último carácter del buffer de edición (no toca el resto de la app)
  function editBackspace() {
    if (state.editingIndex === null) return;
    state.editBuffer = state.editBuffer.length > 1 ? state.editBuffer.slice(0, -1) : '';
    state.editBufferFresh = false;
    state.editError = '';
    updateDisplay();
  }

  // AC — cancela la posición en edición (sin guardar) y permanece en el módulo
  function editCancelPosition() {
    if (state.editingIndex === null) return; // nada que cancelar: no-op
    resetEditPositionState();
    if (state.editMode === 'tax') setActiveTaxEditButton(null); else syncActiveMarginButtonFromState();
    renderEditChrome();
    updateDisplay();
  }

  // = — valida y guarda la posición en edición usando exclusivamente las
  // reglas y la persistencia ya existentes en config.js (validateTaxRates/
  // validateMarginRates/updateTaxRates/updateMarginRates). Nunca reescribe
  // rangos, límite de decimales o duplicados: solo interpreta el resultado
  // de esa validación para elegir el mensaje breve a mostrar.
  function editConfirmPosition() {
    if (state.editingIndex === null) return; // nada que confirmar: no-op

    const mode      = state.editMode;
    const candidate = state.editBuffer === '' ? NaN : Number(state.editBuffer);

    if (!Number.isFinite(candidate)) { setEditError('VALOR INVÁLIDO'); return; }

    const config       = CoreC12Config.getConfig();
    const currentRates = mode === 'tax' ? config.taxRates : config.marginRates;
    const isDuplicate   = currentRates.some((r, i) => i !== state.editingIndex && r === candidate);

    if (isDuplicate) { setEditError('DUPLICADO'); return; }

    const proposed = currentRates.slice();
    proposed[state.editingIndex] = candidate;

    const isValid = mode === 'tax'
      ? CoreC12Config.validateTaxRates(proposed)
      : CoreC12Config.validateMarginRates(proposed);

    if (!isValid) {
      const min = mode === 'tax' ? CoreC12Config.TAX_RATE_MIN : CoreC12Config.MARGIN_RATE_MIN;
      const max = mode === 'tax' ? CoreC12Config.TAX_RATE_MAX : CoreC12Config.MARGIN_RATE_MAX;
      setEditError('RANGO ' + min + '–' + max);
      return;
    }

    if (mode === 'tax') CoreC12Config.updateTaxRates(proposed);
    else CoreC12Config.updateMarginRates(proposed);

    applyConfiguredRates(CoreC12Config.getConfig());
    resetEditPositionState();
    if (mode === 'tax') { setActiveTaxEditButton(null); renderEditRateLabels('tax'); }
    else { syncActiveMarginButtonFromState(); renderEditRateLabels('margin'); }
    renderEditChrome();
    updateDisplay();
  }

  function setEditError(message) {
    state.editError = message;
    updateDisplay();
  }

  // RESTABLECER — confirmación en dos toques sobre el propio botón.
  // Usa getDefaults() como única fuente de los valores predeterminados.
  function handleResetRates(mode) {
    if (state.editMode !== mode) return;

    if (!state.editResetConfirmPending) {
      state.editResetConfirmPending = true;
      renderEditChrome();
      return;
    }

    state.editResetConfirmPending = false;
    const defaults = CoreC12Config.getDefaults();
    if (mode === 'tax') CoreC12Config.updateTaxRates(defaults.taxRates);
    else CoreC12Config.updateMarginRates(defaults.marginRates);

    applyConfiguredRates(CoreC12Config.getConfig());
    resetEditPositionState();
    if (mode === 'tax') { setActiveTaxEditButton(null); renderEditRateLabels('tax'); }
    else { syncActiveMarginButtonFromState(); renderEditRateLabels('margin'); }
    renderEditChrome();
    updateDisplay();
  }

  // Resalta la posición de IVA en edición (no existe fuera de edición:
  // a diferencia del margen, el flujo normal de IVA no fija un "último
  // botón pulsado").
  function setActiveTaxEditButton(activeBtn) {
    document.querySelectorAll('[data-action="tax-rate"]').forEach(btn => {
      btn.classList.remove('is-active');
    });
    if (activeBtn) activeBtn.classList.add('is-active');
  }

  // Restaura el resaltado normal de margen (state.activeMargin) tras salir
  // de edición o cancelar/guardar una posición — reutiliza las mismas
  // funciones que ya gestionan ese resaltado fuera de edición.
  function syncActiveMarginButtonFromState() {
    clearActiveMarginButton();
    if (state.activeMargin === null) return;
    document.querySelectorAll('[data-action="margin-rate"]').forEach(btn => {
      if (Number(btn.dataset.rate) === state.activeMargin) setActiveMarginButton(btn);
    });
  }

  // Rótulos sin signo ("21%") mientras el módulo está en edición — el
  // signo +/− solo aplica a la calculadora, no a la edición de tasas.
  function renderEditRateLabels(mode) {
    const action = mode === 'tax' ? 'tax-rate' : 'margin-rate';
    document.querySelectorAll('[data-action="' + action + '"]').forEach(btn => {
      btn.textContent = CoreC12Config.formatRate(btn.dataset.rate);
    });
  }

  function rateButtonIndex(btn, action) {
    return Array.from(document.querySelectorAll('[data-action="' + action + '"]')).indexOf(btn);
  }

  function setDisabled(selector, disabled) {
    document.querySelectorAll(selector).forEach(btn => { btn.disabled = disabled; });
  }

  // Cabeceras, fila de acciones y deshabilitado de controles — todo lo que
  // no depende del contenido del display (ver renderEditDisplay).
  function renderEditChrome() {
    const taxEditing    = state.editMode === 'tax';
    const marginEditing = state.editMode === 'margin';
    const anyEditing    = state.editMode !== null;

    elTaxLabel.textContent    = taxEditing    ? 'EDITAR IVA'      : 'IVA';
    elMarginLabel.textContent = marginEditing ? 'EDITAR MÁRGENES' : 'MARGEN';

    elTaxEditActions.hidden    = !taxEditing;
    elMarginEditActions.hidden = !marginEditing;

    elTaxResetLabel.textContent    = (taxEditing    && state.editResetConfirmPending) ? '¿CONFIRMAR?' : 'RESTABLECER';
    elMarginResetLabel.textContent = (marginEditing && state.editResetConfirmPending) ? '¿CONFIRMAR?' : 'RESTABLECER';

    document.querySelectorAll('[data-action="reset-tax"]').forEach(btn => {
      btn.classList.toggle('is-confirming', taxEditing && state.editResetConfirmPending);
    });
    document.querySelectorAll('[data-action="reset-margin"]').forEach(btn => {
      btn.classList.toggle('is-confirming', marginEditing && state.editResetConfirmPending);
    });

    // Rótulos de tasa: planos en el módulo que se edita, con signo en el resto
    if (taxEditing)    renderEditRateLabels('tax');    else renderTaxRateLabels();
    if (marginEditing) renderEditRateLabels('margin'); else renderMarginRateLabels();

    const taxRateDisabled    = marginEditing || (taxEditing    && state.editingIndex !== null);
    const marginRateDisabled = taxEditing    || (marginEditing && state.editingIndex !== null);

    setDisabled('[data-action="tax-rate"]',        taxRateDisabled);
    setDisabled('[data-action="margin-rate"]',      marginRateDisabled);
    setDisabled('[data-action="tax-direction"]',    anyEditing);
    setDisabled('[data-action="margin-direction"]', anyEditing);
    setDisabled('[data-action="operator"]',         anyEditing);
    setDisabled('[data-action="sign"]',              anyEditing);
    setDisabled('[data-action="percent"]',           anyEditing);
    setDisabled('[data-action="set-decimals"]',      anyEditing);
    setDisabled('[data-action="edit-tax"]',          anyEditing);
    setDisabled('[data-action="edit-margin"]',       anyEditing);
  }

  // Línea de display mientras editMode !== null: sustituye por completo
  // la ruta normal de updateDisplay (ver el early-return al inicio).
  function renderEditDisplay() {
    if (state.editingIndex !== null) {
      elNumber.textContent = formatDisplayNumber(state.editBuffer);

      const posLabel = state.editMode === 'tax' ? 'EDITAR IVA ' : 'EDITAR MARGEN ';
      elStatus.textContent = posLabel + (state.editingIndex + 1);
      elStatus.classList.toggle('is-visible', true);

      elDetail.textContent = state.editError;
      elDetail.classList.toggle('is-visible', state.editError.length > 0);
    } else {
      // Módulo en edición sin posición seleccionada: número principal
      // congelado (última cifra real), líneas 1 y 2 en blanco.
      elStatus.textContent = '';
      elStatus.classList.toggle('is-visible', false);
      elDetail.textContent = '';
      elDetail.classList.toggle('is-visible', false);
    }
  }


  /* ─────────────────────────────────────────────
     ARRANQUE
     ───────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', init);

})();
