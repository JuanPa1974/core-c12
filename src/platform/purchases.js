/* =============================================================
   CORE C12 — Plataforma: compras (Core C12 Pro / StoreKit 2)
   Fase 1 — arquitectura productiva de Free/Pro.

   Envoltorio delgado y definitivo sobre el plugin nativo
   CoreC12PurchasesPlugin (Swift/StoreKit 2), validado en el spike
   técnico (ver docs/architecture/STOREKIT2_SPIKE.md). Aísla a
   src/state/entitlement-state.js — y a cualquier UI futura — del
   bridge nativo: nadie fuera de este archivo debe importar
   @capacitor/core para hablar con StoreKit.

   Ninguna decisión comercial vive aquí (qué es Free/Pro, cuándo
   mostrar el paywall): eso pertenece a fases posteriores. Este
   archivo solo transporta lo que StoreKit 2 ya decidió.

   Web/PWA: StoreKit no existe en esa plataforma y la monetización
   Web queda deliberadamente sin decidir (ver STOREKIT2_SPIKE.md). Por
   eso, igual que src/platform/haptics.js, cada función degrada de
   forma controlada fuera de plataforma nativa: nunca intenta el
   bridge, nunca lanza ni rechaza por esa sola razón — devuelve un
   resultado "no disponible" que el estado de monetización interpreta
   como Free, sin tratarlo como fallo.

   Un fallo real en plataforma nativa (StoreKit no responde, error de
   red, producto no disponible) sí se propaga como Promise rechazada
   — eso es lo que permite a entitlement-state.js distinguir "no
   aplica aquí" (Web) de "algo falló de verdad" (nativo).

   Android (Fase 2 — Capacitor Shell): isNativePlatform() por sí solo
   NO basta como frontera — es true también en Android, pero el plugin
   nativo CoreC12Purchases (Swift/StoreKit 2) solo existe en iOS. Sin
   distinguir la plataforma concreta, cualquier llamada en el shell
   Android intentaría un bridge inexistente. Por eso la frontera
   pregunta Capacitor.getPlatform() === 'ios', no isNativePlatform().
   Cuando una fase posterior añada Google Play Billing, esta función
   pasará a reconocer también 'android' — y una desconexión transitoria
   de Play Billing en ese momento deberá seguir propagándose como
   fallo real (igual que ya hace StoreKit arriba), nunca degradar
   silenciosamente a "no soportado".
   ============================================================= */

import { Capacitor, registerPlugin } from '@capacitor/core';

const nativePurchases = registerPlugin('CoreC12Purchases');

function isPurchasesPlatformSupported() {
  try {
    return Capacitor.getPlatform() === 'ios';
  } catch (e) {
    return false;
  }
}

// Expuesto para que capas superiores (estado, UI) puedan decidir si
// tiene sentido siquiera ofrecer compra/restore en esta plataforma.
export function isSupported() {
  return isPurchasesPlatformSupported();
}

export async function getProduct() {
  if (!isPurchasesPlatformSupported()) return { available: false };
  const product = await nativePurchases.getProduct();
  return { available: true, ...product };
}

export async function purchase() {
  if (!isPurchasesPlatformSupported()) return { status: 'unavailable', isPro: false };
  return nativePurchases.purchase();
}

export async function getEntitlement() {
  if (!isPurchasesPlatformSupported()) return { isPro: false };
  return nativePurchases.getEntitlement();
}

export async function restorePurchases() {
  if (!isPurchasesPlatformSupported()) return { isPro: false, status: 'unavailable' };
  return nativePurchases.restorePurchases();
}

globalThis.CoreC12Purchases = {
  isSupported,
  getProduct,
  purchase,
  getEntitlement,
  restorePurchases
};
