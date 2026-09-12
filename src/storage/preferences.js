/* =============================================================
   CORE C12 — Acceso seguro a almacenamiento local
   Extraído de config.js (Etapa 5B — Migración a arquitectura por capas).

   Encapsula el único acceso productivo de Core C12 al almacenamiento
   persistente del navegador. config.js (y cualquier otra capa) nunca
   debe acceder a ese almacenamiento directamente — siempre a través
   de este módulo.

   Ninguna función de aquí propaga una excepción: la persistencia es
   una mejora, nunca un punto único de fallo. Si el almacenamiento no
   existe o lanza excepción al leer/escribir (modo privado, cuota
   excedida, política del navegador), estas funciones devuelven
   null/false de forma segura y Core C12 sigue funcionando en memoria.

   No conoce el árbol de la página, fórmulas comerciales, ni la
   máquina de estado — solo strings y claves. Se expone mediante el
   objeto global del propio lenguaje (no una API de navegador), igual
   que core/calculator.js y state/calculator-state.js.
   ============================================================= */

'use strict';

function getStorage() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    return localStorage;
  } catch (e) {
    return null; // acceder a la propiedad ya puede lanzar en algunos navegadores
  }
}

// Detección segura de si el almacenamiento está realmente disponible.
function isAvailable() {
  return getStorage() !== null;
}

function read(key) {
  var storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (e) {
    return null;
  }
}

function write(key, value) {
  var storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

globalThis.CoreC12Preferences = { isAvailable, read, write };
