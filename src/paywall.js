/* =============================================================
   CORE C12 — Paywall Pro (Fase 4)

   Overlay sobre la calculadora actual — nunca navegación a otra
   pantalla. Se abre exclusivamente a través del hook que calc.js ya
   invoca cuando una acción Pro queda bloqueada (Fase 2/3):
   CoreC12ProPaywall.requestOpen({ type, feature, sourceElement }).
   Este archivo es quien por fin implementa ese hook — hasta ahora
   era un no-op seguro.

   Consume la MISMA instancia productiva de entitlement que calc.js
   (CoreC12EntitlementState.getSharedEntitlementState(), Fase 4): una
   compra o un restore hechos aquí deben reflejarse de inmediato en
   los indicadores PRO que calc.js ya pintó, sin recargar la app.

   Ninguna decisión comercial vive aquí: qué es Free/Pro sigue en
   pro-features.js, y si el gating está activo lo decide calc.js
   (Web/PWA nunca llega a invocar requestOpen — ver la corrección de
   plataforma de Fase 2). Este módulo solo sabe abrir, comprar,
   restaurar y cerrar.
   ============================================================= */

(function () {
  'use strict';

  const elPaywall = document.getElementById('pro-paywall');
  const elDialog  = document.getElementById('paywall-dialog');
  const elMessage = document.getElementById('paywall-message');

  // Markup ausente (no debería ocurrir en producción): no-op seguro,
  // igual que el resto de capas cuando falta su dependencia.
  if (!elPaywall || !elDialog || !elMessage) return;

  const DEFAULT_CTA_TEXT     = 'Desbloquear Core C12 Pro';
  const DEFAULT_RESTORE_TEXT = 'Restaurar compra';

  let isOpen = false;
  let busy = false;          // true durante purchasing/restoring
  let openToken = 0;         // invalida una respuesta de precio que llega tarde
  let lastFocusedElement = null;

  function ctaButton() {
    return document.querySelector('[data-action="paywall-purchase"]');
  }
  function restoreButton() {
    return document.querySelector('[data-action="paywall-restore"]');
  }

  function entitlement() {
    return (typeof CoreC12EntitlementState !== 'undefined')
      ? CoreC12EntitlementState.getSharedEntitlementState()
      : null;
  }

  function setMessage(text) {
    elMessage.textContent = text || '';
  }

  // Evitar doble tap: durante purchasing/restoring ambos botones
  // quedan deshabilitados (disabled real — a diferencia del indicador
  // PRO de la calculadora, este es un control propio del paywall sin
  // ningún rol que preservar detrás del bloqueo).
  function setBusy(next) {
    busy = next;
    const cta = ctaButton();
    const restore = restoreButton();
    if (cta) cta.disabled = busy;
    if (restore) restore.disabled = busy;
  }

  function resetButtons() {
    const cta = ctaButton();
    const restore = restoreButton();
    if (cta) cta.textContent = DEFAULT_CTA_TEXT;
    if (restore) restore.textContent = DEFAULT_RESTORE_TEXT;
  }

  // getProduct().displayPrice cuando esté disponible; nunca se inventa
  // un precio si el producto no carga — el CTA se queda con el texto
  // neutro por defecto y el paywall sigue abriendo con normalidad.
  function loadPrice(token) {
    if (typeof CoreC12Purchases === 'undefined' || typeof CoreC12Purchases.getProduct !== 'function') return;
    CoreC12Purchases.getProduct().then((product) => {
      if (token !== openToken) return; // el paywall se cerró/reabrió mientras tanto
      if (product && product.available && product.displayPrice) {
        const cta = ctaButton();
        if (cta) cta.textContent = 'Desbloquear por ' + product.displayPrice;
      }
    }).catch(() => {
      // Sin producto: se conserva el texto neutro. No es un error que
      // deba mostrarse — el paywall sigue siendo perfectamente usable.
    });
  }

  function open(intent) {
    if (isOpen) return;
    isOpen = true;
    openToken += 1;
    lastFocusedElement = (intent && intent.sourceElement) || document.activeElement || null;

    setMessage('');
    resetButtons();
    setBusy(false);

    elPaywall.hidden = false;
    const app = document.querySelector('.app');
    if (app) app.inert = true; // evita interacción accidental con la calculadora de fondo

    loadPrice(openToken);

    if (typeof elDialog.focus === 'function') elDialog.focus();
  }

  function close() {
    if (!isOpen) return;
    if (busy) return; // nunca cerrar mientras hay una compra/restore en curso

    isOpen = false;
    openToken += 1; // cualquier precio que llegue tarde ya no se aplica

    elPaywall.hidden = true;
    const app = document.querySelector('.app');
    if (app) app.inert = false;

    const toFocus = lastFocusedElement;
    lastFocusedElement = null;
    if (toFocus && typeof toFocus.focus === 'function') toFocus.focus();
  }

  async function handlePurchase() {
    if (!isOpen || busy) return;
    const state = entitlement();
    if (!state) return;

    setBusy(true);
    setMessage('');
    const cta = ctaButton();
    if (cta) cta.textContent = 'Procesando…';

    let result;
    try {
      result = await state.purchase();
    } catch (e) {
      result = { success: false };
    }

    setBusy(false);
    const ctaAfter = ctaButton();
    if (ctaAfter) ctaAfter.textContent = DEFAULT_CTA_TEXT;

    if (result && result.success) {
      // isPro/caché/badges/aria-labels ya los actualiza el subscribe()
      // de calc.js sobre la misma instancia compartida — aquí solo
      // cerramos. El estado de la calculadora nunca se toca.
      close();
      return;
    }
    if (result && result.cancelled) {
      // userCancelled: no es un error. Sigue Free, CTA vuelve a estar
      // disponible, el paywall permanece abierto sin mensaje alarmante.
      return;
    }
    setMessage('No se pudo completar la compra. Inténtalo de nuevo.');
  }

  async function handleRestore() {
    if (!isOpen || busy) return;
    const state = entitlement();
    if (!state) return;

    setBusy(true);
    setMessage('');
    const restore = restoreButton();
    if (restore) restore.textContent = 'Restaurando…';

    let result;
    try {
      result = await state.restore();
    } catch (e) {
      result = { found: false, error: true };
    }

    setBusy(false);
    const restoreAfter = restoreButton();
    if (restoreAfter) restoreAfter.textContent = DEFAULT_RESTORE_TEXT;

    if (result && result.found) {
      setMessage('Core C12 Pro restaurado correctamente.');
      setTimeout(close, 900); // deja un instante para leer/escuchar la confirmación
      return;
    }
    if (result && result.error) {
      setMessage('No se pudo restaurar la compra. Inténtalo de nuevo.');
      return;
    }
    setMessage('No encontramos una compra anterior de Core C12 Pro.');
  }

  // El propio #pro-paywall actúa de backdrop: un clic exactamente
  // sobre él (nunca sobre .paywall__dialog ni sus hijos) cierra el
  // paywall, salvo que haya una operación en curso.
  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    const target = e.target;
    if (target && target.id === 'pro-paywall') { close(); return; }

    const btn = target && typeof target.closest === 'function' ? target.closest('[data-action]') : null;
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'paywall-close':    close();          break;
      case 'paywall-purchase': handlePurchase();  break;
      case 'paywall-restore':  handleRestore();   break;
    }
  });

  // Escape (soporte teclado/web): mismo criterio conservador que el
  // backdrop — nunca cierra mientras hay una compra/restore en curso.
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape' || e.key === 'Esc') close();
  });

  globalThis.CoreC12ProPaywall = { requestOpen: open };
})();
