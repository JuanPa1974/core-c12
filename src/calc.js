/* =============================================================
   CORE C12 — Lógica de calculadora
   Versión: 2.1 — configuración persistente (tasas, márgenes, decimales)
   Regla de margen directo (+M):  precio = costo / (1 - margen)
   Regla de margen inverso (−M):  costo  = precio × (1 - margen)
   Regla de IVA directo  (+IVA):  resultado = valor × (1 + tasa)
   Regla de IVA inverso  (−IVA):  resultado = valor / (1 + tasa)
   Requiere cargados antes: core/calculator.js (globalThis.CoreC12Core),
   state/calculator-state.js (globalThis.CoreC12State) y config.js
   (window.CoreC12Config).

   calc.js coordina UI: referencias DOM, eventos, render, y solicita
   acciones a CoreC12State (máquina de estado funcional, Etapa 5). El
   modo de edición de tasas/márgenes (Fase 2B) permanece íntegro aquí
   como estado local de coordinación — ver informe de la Etapa 5
   (EDIT STATE DEFERRED): sus funciones están saturadas de DOM directo
   y llamadas a CoreC12Config en casi cada línea, así que extraer solo
   sus variables sin extraer también su render habría dividido una
   única transición atómica entre dos archivos sin reducir el riesgo.
   ============================================================= */

(function () {
  'use strict';


  /* ─────────────────────────────────────────────
     ESTADO LOCAL DE EDICIÓN (Fase 2B — EDIT STATE DEFERRED)
     La máquina de cálculo (dígitos, operadores, IVA, margen, decimales)
     vive en CoreC12State (src/state/calculator-state.js). Este objeto
     conserva únicamente el estado del modo de edición de tasas, que
     permanece coordinado aquí junto a su render y su persistencia.
     ───────────────────────────────────────────── */

  const editState = {
    editMode:               null,  // null | 'tax' | 'margin'
    editingIndex:            null,  // null | posición seleccionada (0-2 IVA, 0-5 margen)
    editBuffer:              '',    // string en construcción para la nueva tasa
    editBufferFresh:         false, // true: el próximo dígito reemplaza el buffer (recién seleccionado)
    editError:               '',    // mensaje de validación breve, se limpia al reanudar tecleo
    editResetConfirmPending: false, // true tras el primer toque en RESTABLECER (confirmación en 2 toques)
  };

  // Máquina de estado funcional (creada en init(), tras leer configuración).
  let calcState = null;


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
    calcState = CoreC12State.createState({ decimals: config.decimals });
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
        if (editState.editMode === 'margin') selectEditPosition('margin', rateButtonIndex(btn, 'margin-rate'), btn);
        else if (editState.editMode === null) applyMargin(rateNum, btn);
        break;
      case 'margin-direction': setMarginDirection(btn.dataset.direction); break;
      case 'tax-rate':
        // Edición margen activa -> IVA queda bloqueado por completo (no-op)
        if (editState.editMode === 'tax') selectEditPosition('tax', rateButtonIndex(btn, 'tax-rate'), btn);
        else if (editState.editMode === null) applyTax(rateNum);
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
    if (editState.editMode !== null) { editInputDigit(digit); return; }
    if (!calcState.inputDigit(digit)) return;
    clearActiveMarginButton();
    updateDisplay();
  }

  function inputDecimal() {
    if (editState.editMode !== null) { editInputDecimal(); return; }
    if (!calcState.inputDecimal()) return;
    updateDisplay();
  }


  /* ─────────────────────────────────────────────
     OPERACIONES BÁSICAS
     ───────────────────────────────────────────── */

  function inputOperator(op) {
    if (editState.editMode !== null) return;
    if (!calcState.inputOperator(op)) return;
    updateDisplay();
  }

  function calculate() {
    if (editState.editMode !== null) { editConfirmPosition(); return; }
    if (!calcState.calculate()) return;
    updateDisplay();
  }


  /* ─────────────────────────────────────────────
     CONTROL: C y AC
     ───────────────────────────────────────────── */

  // C — borrar último dígito (o limpiar resultado)
  function clearLast() {
    if (editState.editMode !== null) { editBackspace(); return; }
    calcState.clearLast();
    updateDisplay();
  }

  // AC — reset total (decimals se conserva)
  function clearAll() {
    if (editState.editMode !== null) { editCancelPosition(); return; }
    calcState.clearAll();
    clearActiveMarginButton();
    updateDisplay();
  }


  /* ─────────────────────────────────────────────
     TRANSFORMACIONES: +/− y %
     ───────────────────────────────────────────── */

  function toggleSign() {
    if (editState.editMode !== null) return;
    if (!calcState.toggleSign()) return;
    updateDisplay();
  }

  function inputPercent() {
    if (editState.editMode !== null) return;
    if (!calcState.percent()) return;
    updateDisplay();
  }


  /* ─────────────────────────────────────────
     MARGEN COMERCIAL — bidireccional
     +M (forward): precio = costo / (1 - margen)
     −M (reverse): costo  = precio × (1 - margen)

     El selector +M/−M (setMarginDirection) SOLO cambia la dirección.
     No calcula nada y no toca el display. El cálculo ocurre al pulsar
     una tasa (applyMargin), que lee la dirección activa en ese momento.
     ───────────────────────────────────────── */

  function applyMargin(rate, btn) {
    if (!calcState.applyMargin(rate)) return;
    setActiveMarginButton(btn);
    updateDisplay();
  }

  // Cambia el modo +M/−M. No calcula, no altera el display.
  function setMarginDirection(direction) {
    if (editState.editMode !== null) return;
    if (!calcState.setMarginDirection(direction)) return;
    renderMarginDirectionButtons();
    renderMarginRateLabels();
  }


  /* ─────────────────────────────────────────
     IVA — bidireccional (motor fiscal porcentual genérico)
     +IVA (add):    resultado = valor × (1 + tasa)
     −IVA (remove): resultado = valor ÷ (1 + tasa)

     El selector +IVA/−IVA (setTaxDirection) SOLO cambia la dirección.
     No calcula nada y no toca el display. El cálculo ocurre al pulsar
     una tasa (applyTax), que lee la dirección activa en ese momento.
     ───────────────────────────────────────── */

  function applyTax(rate) {
    if (!calcState.applyTax(rate)) return;
    updateDisplay();
  }

  // Cambia el modo +IVA/−IVA. No calcula, no altera el display.
  function setTaxDirection(direction) {
    if (editState.editMode !== null) return;
    if (!calcState.setTaxDirection(direction)) return;
    renderTaxDirectionButtons();
    renderTaxRateLabels();
  }


  /* ─────────────────────────────────────────────
     SELECTOR DE DECIMALES
     ───────────────────────────────────────────── */

  function setDecimals(n) {
    if (editState.editMode !== null) return;
    calcState.setDecimals(n);
    CoreC12Config.updateDecimals(n); // persiste; no-op seguro si el almacenamiento falla

    // Marcar botón activo
    document.querySelectorAll('[data-action="set-decimals"]').forEach(btn => {
      const active = parseInt(btn.dataset.decimals, 10) === n;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    // Re-renderizar: si hay resultado activo, el número cambia según el selector
    updateDisplay();
  }


  /* ─────────────────────────────────────────────
     UTILIDADES DE PRESENTACIÓN
     ───────────────────────────────────────────── */

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


  /* ─────────────────────────────────────────────
     ACTUALIZACIÓN DEL DISPLAY
     Doble ruta: entrada manual vs. resultado calculado
     ───────────────────────────────────────────── */

  function updateDisplay() {
    if (editState.editMode !== null) { renderEditDisplay(); return; }

    const snap = calcState.getSnapshot();

    // ── Número principal ──
    let shown;
    if (snap.displayValue === 'Error') {
      shown = 'Error';
    } else if (snap.isResult && snap.rawResult !== null) {
      // Resultado calculado → aplicar selector de decimales
      shown = snap.rawResult.toFixed(snap.decimals);
    } else {
      // Entrada manual → mostrar exactamente lo tecleado
      shown = snap.displayValue;
    }
    elNumber.textContent = formatDisplayNumber(shown);

    // ── Línea 1: estado abreviado ──
    const parts      = [snap.marginStatus, snap.ivaStatus].filter(Boolean);
    const statusText = parts.join(' · ');
    elStatus.textContent = statusText;
    elStatus.classList.toggle('is-visible', statusText.length > 0);

    // ── Línea 2: detalle de operación ──
    elDetail.textContent = snap.detailText;
    elDetail.classList.toggle('is-visible', snap.detailText.length > 0);
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
     Solo presentación: reflejan la dirección activa en CoreC12State
     sobre los botones reales. No calculan, no leen ni escriben el display.
     ───────────────────────────────────────────── */

  function renderTaxDirectionButtons() {
    const taxDirection = calcState.getSnapshot().taxDirection;
    document.querySelectorAll('.btn--tax-direction').forEach(btn => {
      const active = btn.dataset.direction === taxDirection;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function renderTaxRateLabels() {
    const sign = calcState.getSnapshot().taxDirection === 'add' ? '+' : '−';
    document.querySelectorAll('[data-action="tax-rate"]').forEach((btn, i) => {
      btn.textContent = sign + CoreC12Config.formatRate(btn.dataset.rate);
      btn.setAttribute('aria-label', rateAriaLabel('tax', i, btn.dataset.rate, false));
    });
  }

  function renderMarginDirectionButtons() {
    const marginDirection = calcState.getSnapshot().marginDirection;
    document.querySelectorAll('.btn--margin-direction').forEach(btn => {
      const active = btn.dataset.direction === marginDirection;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function renderMarginRateLabels() {
    const sign = calcState.getSnapshot().marginDirection === 'forward' ? '+' : '−';
    document.querySelectorAll('[data-action="margin-rate"]').forEach((btn, i) => {
      btn.textContent = sign + CoreC12Config.formatRate(btn.dataset.rate);
      btn.setAttribute('aria-label', rateAriaLabel('margin', i, btn.dataset.rate, false));
    });
  }


  /* ─────────────────────────────────────────
     EDICIÓN CONFIGURABLE DE IVA / MARGEN — Fase 2B (EDIT STATE DEFERRED)
     Reutiliza el teclado numérico existente (0-9, ., C, AC, =) y la API
     de configuración ya disponible (CoreC12Config) — sin lógica paralela
     de validación, defaults, rangos ni persistencia. Todo ocurre en la
     misma pantalla: no se crea vista, modal ni teclado nuevos.
     ───────────────────────────────────────── */

  function enterEditMode(mode) {
    if (editState.editMode !== null) return; // ya en edición: ignorar re-entrada
    editState.editMode = mode;
    resetEditPositionState();
    renderEditChrome();
    updateDisplay();
  }

  function exitEditMode() {
    if (editState.editMode === null) return;
    const mode = editState.editMode;
    editState.editMode = null;
    resetEditPositionState();
    renderEditChrome();
    if (mode === 'tax') { renderTaxRateLabels(); setActiveTaxEditButton(null); }
    else { renderMarginRateLabels(); }
    syncActiveMarginButtonFromState();
    updateDisplay();
  }

  // Limpia posición/buffer/error/confirmación de reset. Usado al entrar,
  // cancelar (AC), guardar (=) o salir (LISTO) del modo edición.
  function resetEditPositionState() {
    editState.editingIndex            = null;
    editState.editBuffer              = '';
    editState.editBufferFresh         = false;
    editState.editError               = '';
    editState.editResetConfirmPending = false;
  }

  // Selecciona una posición dentro del módulo en edición: carga su valor
  // actual en el buffer (el primer dígito tecleado lo reemplaza por
  // completo, como el resto de la calculadora tras un operador).
  function selectEditPosition(mode, index, btn) {
    if (editState.editMode !== mode || editState.editingIndex !== null) return;

    const config = CoreC12Config.getConfig();
    const rates  = mode === 'tax' ? config.taxRates : config.marginRates;
    if (index < 0 || index >= rates.length) return;

    editState.editingIndex            = index;
    editState.editBuffer              = String(rates[index]);
    editState.editBufferFresh         = true;
    editState.editError               = '';
    editState.editResetConfirmPending = false;

    if (mode === 'tax') setActiveTaxEditButton(btn); else setActiveMarginButton(btn);
    renderEditChrome();
    updateDisplay();
  }

  function editInputDigit(digit) {
    if (editState.editingIndex === null) return; // sin posición seleccionada: no-op
    editState.editBuffer      = editState.editBufferFresh ? digit : editState.editBuffer + digit;
    editState.editBufferFresh = false;
    editState.editError       = '';
    updateDisplay();
  }

  function editInputDecimal() {
    if (editState.editingIndex === null) return;
    if (editState.editBufferFresh) {
      editState.editBuffer      = '0.';
      editState.editBufferFresh = false;
    } else if (!editState.editBuffer.includes('.')) {
      editState.editBuffer += '.';
    }
    editState.editError = '';
    updateDisplay();
  }

  // C — borra el último carácter del buffer de edición (no toca el resto de la app)
  function editBackspace() {
    if (editState.editingIndex === null) return;
    editState.editBuffer = editState.editBuffer.length > 1 ? editState.editBuffer.slice(0, -1) : '';
    editState.editBufferFresh = false;
    editState.editError = '';
    updateDisplay();
  }

  // AC — cancela la posición en edición (sin guardar) y permanece en el módulo
  function editCancelPosition() {
    if (editState.editingIndex === null) return; // nada que cancelar: no-op
    resetEditPositionState();
    if (editState.editMode === 'tax') setActiveTaxEditButton(null); else syncActiveMarginButtonFromState();
    renderEditChrome();
    updateDisplay();
  }

  // = — valida y guarda la posición en edición usando exclusivamente las
  // reglas y la persistencia ya existentes en config.js (validateTaxRates/
  // validateMarginRates/updateTaxRates/updateMarginRates). Nunca reescribe
  // rangos, límite de decimales o duplicados: solo interpreta el resultado
  // de esa validación para elegir el mensaje breve a mostrar.
  function editConfirmPosition() {
    if (editState.editingIndex === null) return; // nada que confirmar: no-op

    const mode      = editState.editMode;
    const candidate = editState.editBuffer === '' ? NaN : Number(editState.editBuffer);

    if (!Number.isFinite(candidate)) { setEditError('VALOR INVÁLIDO'); return; }

    const config       = CoreC12Config.getConfig();
    const currentRates = mode === 'tax' ? config.taxRates : config.marginRates;
    const isDuplicate   = currentRates.some((r, i) => i !== editState.editingIndex && r === candidate);

    if (isDuplicate) { setEditError('DUPLICADO'); return; }

    const proposed = currentRates.slice();
    proposed[editState.editingIndex] = candidate;

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
    editState.editError = message;
    updateDisplay();
  }

  // RESTABLECER — confirmación en dos toques sobre el propio botón.
  // Usa getDefaults() como única fuente de los valores predeterminados.
  function handleResetRates(mode) {
    if (editState.editMode !== mode) return;

    if (!editState.editResetConfirmPending) {
      editState.editResetConfirmPending = true;
      renderEditChrome();
      return;
    }

    editState.editResetConfirmPending = false;
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

  // Restaura el resaltado normal de margen (activeMargin en CoreC12State)
  // tras salir de edición o cancelar/guardar una posición — reutiliza las
  // mismas funciones que ya gestionan ese resaltado fuera de edición.
  function syncActiveMarginButtonFromState() {
    clearActiveMarginButton();
    const activeMargin = calcState.getSnapshot().activeMargin;
    if (activeMargin === null) return;
    document.querySelectorAll('[data-action="margin-rate"]').forEach(btn => {
      if (Number(btn.dataset.rate) === activeMargin) setActiveMarginButton(btn);
    });
  }

  // Rótulos sin signo ("21%") mientras el módulo está en edición — el
  // signo +/− solo aplica a la calculadora, no a la edición de tasas.
  function renderEditRateLabels(mode) {
    const action = mode === 'tax' ? 'tax-rate' : 'margin-rate';
    document.querySelectorAll('[data-action="' + action + '"]').forEach((btn, i) => {
      btn.textContent = CoreC12Config.formatRate(btn.dataset.rate);
      btn.setAttribute('aria-label', rateAriaLabel(mode, i, btn.dataset.rate, true));
    });
  }

  // Texto accesible de un botón de tasa — normal ("IVA 21 por ciento") o en
  // edición ("Editar IVA posición 3, valor actual 21 por ciento"). Se
  // recalcula en el mismo punto que el texto visible para que nunca queden
  // desincronizados entre sí.
  function rateAriaLabel(mode, index, rate, editing) {
    const noun   = mode === 'tax' ? 'IVA' : 'margen';
    const spoken = CoreC12Config.formatRate(rate).replace('%', ' por ciento');
    return editing
      ? 'Editar ' + noun + ' posición ' + (index + 1) + ', valor actual ' + spoken
      : (mode === 'tax' ? 'IVA ' : 'Margen ') + spoken;
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
    const taxEditing    = editState.editMode === 'tax';
    const marginEditing = editState.editMode === 'margin';
    const anyEditing    = editState.editMode !== null;

    elTaxLabel.textContent    = taxEditing    ? 'EDITAR IVA'      : 'IVA';
    elMarginLabel.textContent = marginEditing ? 'EDITAR MÁRGENES' : 'MARGEN';

    elTaxEditActions.hidden    = !taxEditing;
    elMarginEditActions.hidden = !marginEditing;

    elTaxResetLabel.textContent    = (taxEditing    && editState.editResetConfirmPending) ? '¿CONFIRMAR?' : 'RESTABLECER';
    elMarginResetLabel.textContent = (marginEditing && editState.editResetConfirmPending) ? '¿CONFIRMAR?' : 'RESTABLECER';

    document.querySelectorAll('[data-action="reset-tax"]').forEach(btn => {
      btn.classList.toggle('is-confirming', taxEditing && editState.editResetConfirmPending);
    });
    document.querySelectorAll('[data-action="reset-margin"]').forEach(btn => {
      btn.classList.toggle('is-confirming', marginEditing && editState.editResetConfirmPending);
    });

    // Rótulos de tasa: planos en el módulo que se edita, con signo en el resto
    if (taxEditing)    renderEditRateLabels('tax');    else renderTaxRateLabels();
    if (marginEditing) renderEditRateLabels('margin'); else renderMarginRateLabels();

    const taxRateDisabled    = marginEditing || (taxEditing    && editState.editingIndex !== null);
    const marginRateDisabled = taxEditing    || (marginEditing && editState.editingIndex !== null);

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

  // Línea de display mientras editState.editMode !== null: sustituye por
  // completo la ruta normal de updateDisplay (ver el early-return al inicio).
  function renderEditDisplay() {
    if (editState.editingIndex !== null) {
      elNumber.textContent = formatDisplayNumber(editState.editBuffer);

      const posLabel = editState.editMode === 'tax' ? 'EDITAR IVA ' : 'EDITAR MARGEN ';
      elStatus.textContent = posLabel + (editState.editingIndex + 1);
      elStatus.classList.toggle('is-visible', true);

      elDetail.textContent = editState.editError;
      elDetail.classList.toggle('is-visible', editState.editError.length > 0);
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
