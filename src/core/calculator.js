/* =============================================================
   CORE C12 — Núcleo matemático puro
   Extraído de calc.js (Etapa 4 — Migración a arquitectura por capas).
   Regla de margen directo (+M):  precio = costo / (1 - margen)
   Regla de margen inverso (−M):  costo  = precio × (1 - margen)
   Regla de IVA directo  (+IVA):  resultado = valor × (1 + tasa)
   Regla de IVA inverso  (−IVA):  resultado = valor / (1 + tasa)

   Sin acceso al árbol de la página, a APIs del navegador ni a
   almacenamiento persistente o de plataforma nativa. Solo números,
   operadores, tasas y parámetros matemáticos — ninguna dependencia
   externa. Se expone mediante el objeto global del propio lenguaje
   (no una API de navegador) para que calc.js pueda seguir cargándose
   como script clásico síncrono, igual que ya hace con su otra
   dependencia de configuración — evitando así un import estático que
   forzaría el arranque de calc.js a ser asíncrono.
   ============================================================= */

'use strict';

// Aritmética básica — devuelve null si división por cero.
function compute(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : a / b;
    default:  return b;
  }
}

// IVA bidireccional. +IVA: valor × (1 + tasa). −IVA: valor ÷ (1 + tasa).
function applyTaxRate(value, rate, direction) {
  const factor = rate / 100;
  return direction === 'add'
    ? value * (1 + factor)
    : value / (1 + factor);
}

// Margen comercial bidireccional.
// forward (costo → PVP): precio = costo / (1 - margen)
// reverse (PVP → costo): costo  = precio × (1 - margen)
function applyMarginRate(value, rate, direction) {
  return direction === 'forward'
    ? value / (1 - (rate / 100))
    : value * (1 - (rate / 100));
}

// % relativo a un valor base (p.ej. 10% de 200 = 20).
function percentOfBase(base, percent) {
  return (base * percent) / 100;
}

// % como fracción decimal (p.ej. 25 → 0.25).
function percentAsDecimal(percent) {
  return percent / 100;
}

// Elimina ruido de coma flotante y trailing zeros (uso interno).
function formatResult(num) {
  if (!isFinite(num)) return 'Error';
  return String(parseFloat(num.toPrecision(10)));
}

globalThis.CoreC12Core = {
  compute,
  applyTaxRate,
  applyMarginRate,
  percentOfBase,
  percentAsDecimal,
  formatResult,
};
