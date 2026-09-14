/* =============================================================
   CORE C12 — Matriz Free/Pro (Fase 2 — feature gating)

   Fuente unica de verdad de que combinacion (tasa, direccion) de IVA
   o margen es gratuita y cual requiere Core C12 Pro. Nada mas conoce
   esta regla: ni calc.js, ni entitlement-state.js, ni ningun test
   deberian repetir estos numeros por su cuenta.

   Deliberadamente independiente de StoreKit/Capacitor/entitlement:
   solo responde "esta combinacion es Pro?" a partir de dos primitivos
   (rate, direction). Quien tiene la decision de si el usuario PUEDE
   usarla (isPro) es entitlement-state.js; quien aplica esa decision
   sobre el click real es calc.js. Este archivo no decide nada sobre
   el usuario, solo clasifica la accion.

   Free (ver PROMPT Fase 2):
     +IVA 4%        (tax,    rate=4,  direction='add')
     +Margen 20%    (margin, rate=20, direction='forward')
   Todo lo demas — incluidos -IVA 4% y -Margen 20%, que a simple vista
   "se parecen" a los gratuitos — es Pro: la coincidencia debe ser
   exacta en tasa Y direccion, nunca solo en la tasa.

   Igual que src/state/calculator-state.js y src/state/entitlement-state.js:
   sin imports, expuesto en globalThis, cargable con node:vm sin deps.
   ============================================================= */

'use strict';

var FREE_TAX    = Object.freeze({ rate: 4,  direction: 'add' });
var FREE_MARGIN = Object.freeze({ rate: 20, direction: 'forward' });

function isFreeTax(rate, direction) {
  return rate === FREE_TAX.rate && direction === FREE_TAX.direction;
}

function isFreeMargin(rate, direction) {
  return rate === FREE_MARGIN.rate && direction === FREE_MARGIN.direction;
}

function isProTax(rate, direction) {
  return !isFreeTax(rate, direction);
}

function isProMargin(rate, direction) {
  return !isFreeMargin(rate, direction);
}

globalThis.CoreC12ProFeatures = {
  FREE_TAX: FREE_TAX,
  FREE_MARGIN: FREE_MARGIN,
  isFreeTax: isFreeTax,
  isFreeMargin: isFreeMargin,
  isProTax: isProTax,
  isProMargin: isProMargin,
};
