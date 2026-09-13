/* =============================================================
   CORE C12 — SPIKE: bridge de plataforma para StoreKit 2
   Rama feature/core-c12-pro-iap — NO forma parte de main.

   Envoltorio delgado sobre el plugin nativo CoreC12PurchasesPlugin
   (Swift/StoreKit 2). Su único propósito es demostrar viabilidad
   técnica: obtener producto, comprar, consultar entitlement,
   restaurar y (solo debug) simular un reembolso vía StoreKit Testing.

   Este archivo es deliberadamente temporal y fácilmente eliminable.
   Si el spike confirma la vía StoreKit 2 on-device, la arquitectura
   definitiva vivirá en src/platform/purchases.js (sin sufijo
   "-spike") y src/state/entitlement-state.js — este archivo no debe
   sobrevivir a ese rediseño.

   Mismo patrón que src/platform/haptics.js: no-op seguro fuera de
   plataforma nativa, sin mezclar lógica comercial aquí.
   ============================================================= */

import { Capacitor, registerPlugin } from '@capacitor/core';

const CoreC12Purchases = registerPlugin('CoreC12Purchases');

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

async function getProduct() {
  if (!isNative()) throw new Error('Solo disponible en plataforma nativa');
  return CoreC12Purchases.getProduct();
}

async function purchase() {
  if (!isNative()) throw new Error('Solo disponible en plataforma nativa');
  return CoreC12Purchases.purchase();
}

async function getEntitlement() {
  if (!isNative()) throw new Error('Solo disponible en plataforma nativa');
  return CoreC12Purchases.getEntitlement();
}

async function restorePurchases() {
  if (!isNative()) throw new Error('Solo disponible en plataforma nativa');
  return CoreC12Purchases.restorePurchases();
}

async function simulateRefund() {
  if (!isNative()) throw new Error('Solo disponible en plataforma nativa');
  return CoreC12Purchases.simulateRefund();
}

globalThis.CoreC12PurchasesSpike = {
  getProduct,
  purchase,
  getEntitlement,
  restorePurchases,
  simulateRefund
};
