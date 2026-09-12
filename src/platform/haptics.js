/* =============================================================
   CORE C12 — Plataforma: háptica nativa
   Etapa 6 — Migración a arquitectura por capas.

   Traduce intenciones semánticas de feedback (light/medium/error) a
   la API oficial de @capacitor/haptics. Ninguna fórmula, estado ni
   configuración comercial pasa por aquí — solo la decisión de CÓMO
   producir una vibración, nunca CUÁNDO ni PARA QUÉ acción (eso lo
   decide la UI que llama a esta capa).

   Regla obligatoria: en Web/PWA esto debe ser un no-op seguro. Se usa
   Capacitor.isNativePlatform() para detectarlo — si no estamos en
   plataforma nativa, se retorna de inmediato sin intentar ninguna
   vibración (tampoco navigator.vibrate como sustituto: el STACK_MASTER
   no aprueba háptica web).

   Toda llamada es "best effort" y fire-and-forget: nunca bloquea el
   cálculo ni el render, y ningún fallo del plugin (rechazo de la
   Promise, plataforma no soportada) se propaga como excepción — se
   ignora en silencio, exactamente igual que el resto de capacidades
   secundarias de Core C12 (ver STACK_MASTER, fallos de plataforma).

   La calibración exacta de intensidades queda pendiente de QA físico
   (Etapa 7+) — esta es una política V1 conservadora, no definitiva.
   ============================================================= */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

function safeInvoke(action) {
  if (!isNative()) return;
  try {
    const result = action();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {}); // best effort: nunca propagar el rechazo
    }
  } catch (e) {
    // best effort: nunca propagar una excepción síncrona del plugin
  }
}

// LIGHT — dígitos, punto decimal, cambio de signo, porcentaje, C.
export function light() {
  safeInvoke(() => Haptics.impact({ style: ImpactStyle.Light }));
}

// MEDIUM — operadores, =, IVA, Margen, cambio de dirección, AC.
export function medium() {
  safeInvoke(() => Haptics.impact({ style: ImpactStyle.Medium }));
}

// Preparado para un futuro evento de error ya caracterizado en la UI.
// Deliberadamente NO invocado desde ningún punto de la aplicación en
// esta etapa (ver informe de la Etapa 6: no se inventa nueva UX).
export function error() {
  safeInvoke(() => Haptics.notification({ type: NotificationType.Error }));
}

globalThis.CoreC12Haptics = { light, medium, error };
