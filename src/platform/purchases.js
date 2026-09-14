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
   ============================================================= */

import { Capacitor, registerPlugin } from '@capacitor/core';

const nativePurchases = registerPlugin('CoreC12Purchases');

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

// Expuesto para que capas superiores (estado, UI) puedan decidir si
// tiene sentido siquiera ofrecer compra/restore en esta plataforma.
export function isSupported() {
  return isNative();
}

export async function getProduct() {
  if (!isNative()) return { available: false };
  const product = await nativePurchases.getProduct();
  return { available: true, ...product };
}

export async function purchase() {
  if (!isNative()) return { status: 'unavailable', isPro: false };
  return nativePurchases.purchase();
}

export async function getEntitlement() {
  if (!isNative()) return { isPro: false };
  return nativePurchases.getEntitlement();
}

export async function restorePurchases() {
  if (!isNative()) return { isPro: false, status: 'unavailable' };
  return nativePurchases.restorePurchases();
}

globalThis.CoreC12Purchases = {
  isSupported,
  getProduct,
  purchase,
  getEntitlement,
  restorePurchases
};
