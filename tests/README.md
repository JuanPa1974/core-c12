# Core C12 — tests de caracterización

**Qué protegen:** el motor de cálculo real (`calc.js`) tal como funciona en
producción hoy — operaciones básicas, IVA (4/10/21%, ambas direcciones),
margen comercial (`precio = costo / (1 - margen)`), encadenamiento de
operaciones, casos límite (división por cero, operadores consecutivos,
`=` repetido, doble punto decimal, cambio de signo) y que el selector de
decimales solo afecta la presentación, nunca el cálculo interno.

Son tests de **caracterización**, no de especificación: congelan el
comportamiento actual verificado contra producción, no juzgan si ese
comportamiento es el deseado para Core C12 V2.

**Baseline que caracterizan:** commit `0e732090fdab78a346ec111723edb82928be7361`
(tag local `baseline/core-c12-production-2026-09-11`), confirmado
byte-a-byte idéntico a `https://core-c12.netlify.app/` el 2026-09-11.

**Cómo se prueba el código real sin modificarlo:** `dom-shim.js` parsea el
`index.html` real para descubrir los botones (`data-action`, `data-rate`,
`data-value`, `data-decimals`) y los tres elementos de display, construye un
`document` mínimo con solo las APIs que `calc.js` usa realmente
(`getElementById`, `querySelector`, `querySelectorAll`, `addEventListener`,
`classList`, `dataset`, `closest`), y carga `calc.js` sin tocarlo dentro de
un contexto `vm` de Node. Dispara `DOMContentLoaded` para que corra su
propio `init()`, exactamente como en un navegador. Los tests simulan clics
reales sobre esos botones reales y leen el texto realmente renderizado en
pantalla — ninguna fórmula de `calc.js` está duplicada en los tests.

Cero dependencias npm: solo `node:test`, `node:assert`, `node:fs`,
`node:path`, `node:vm` (todos nativos de Node).

**Cómo ejecutarlos** (desde la raíz del proyecto):

```
node --test
```

(equivalente explícito: `node --test tests/calc-engine.test.js`)

**Nota de caracterización (Fase 0.10):** `1,73 → −IVA21` da `1,43`, no
`1,00`. Es el resultado matemáticamente correcto de aplicar el IVA inverso
sobre un valor *ya redondeado a 2 decimales* al re-teclearlo manualmente —
no es un bug. Si se continúa la cadena en vivo desde el resultado sin
redondear (sin volver a teclear), la reversión sí converge mucho más cerca
del costo original. Documentado aquí para que la futura Fase de margen
inverso no lo confunda con una regresión del motor actual.
