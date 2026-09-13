/* =============================================================
   CORE C12 — SPIKE: superficie de prueba mínima para StoreKit 2
   Rama feature/core-c12-pro-iap — NO forma parte de main.

   Panel de depuración temporal, sin ningún diseño productivo, cuyo
   único fin es disparar y observar las operaciones del spike descrito
   en src/platform/purchases-spike.js. No es el paywall definitivo.

   Eliminar junto con: el bloque #iap-spike en index.html, este
   archivo, y su <script> en index.html.
   ============================================================= */

(function () {
  'use strict';

  function setStatus(text) {
    const el = document.getElementById('iap-spike-status');
    if (el) el.textContent = text;
  }

  function bind(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', async () => {
      setStatus('...');
      try {
        const result = await handler();
        setStatus(JSON.stringify(result, null, 2));
      } catch (e) {
        setStatus('ERROR: ' + (e && e.message ? e.message : String(e)));
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const api = globalThis.CoreC12PurchasesSpike;
    if (!api) {
      setStatus('CoreC12PurchasesSpike no disponible (¿bridge no cargado?)');
      return;
    }
    bind('iap-spike-get-product', api.getProduct);
    bind('iap-spike-purchase', api.purchase);
    bind('iap-spike-entitlement', api.getEntitlement);
    bind('iap-spike-restore', api.restorePurchases);
    bind('iap-spike-refund', api.simulateRefund);
    setStatus('listo');

    // Auto-chequeo SOLO diagnóstico: getProduct() y getEntitlement() no
    // requieren ninguna hoja de compra ni interacción del usuario, así
    // que se registran en consola (visible vía `simctl launch --console`)
    // para verificar el puente JS -> nativo -> StoreKit 2 sin necesidad
    // de pulsar nada. NO reemplaza la prueba manual de compra/cancelación.
    setTimeout(async () => {
      const lines = [];
      try {
        const product = await api.getProduct();
        lines.push('getProduct OK: ' + JSON.stringify(product));
      } catch (e) {
        lines.push('getProduct ERROR: ' + (e && e.message ? e.message : String(e)));
      }
      try {
        const entitlement = await api.getEntitlement();
        lines.push('getEntitlement OK: ' + JSON.stringify(entitlement));
      } catch (e) {
        lines.push('getEntitlement ERROR: ' + (e && e.message ? e.message : String(e)));
      }
      setStatus('[AUTOCHECK]\n' + lines.join('\n'));
    }, 1500);
  });
})();
