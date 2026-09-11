# Core C12 — tests de caracterización

**Qué protegen:** el motor de cálculo real (`calc.js`) — operaciones
básicas, IVA bidireccional (+IVA/−IVA, 3 tasas), margen comercial
bidireccional (+M: `precio = costo / (1 - margen)`, −M: `costo = precio ×
(1 - margen)`), encadenamiento de operaciones, casos límite (división por
cero, operadores consecutivos, `=` repetido, doble punto decimal, cambio
de signo), que el selector de decimales solo afecta la presentación nunca
el cálculo interno — y, desde Fase 2A, la capa de configuración persistente
(`config.js`): defaults, validación, carga/guardado seguro en
`localStorage`, y su conexión con las tasas/márgenes/decimales reales.

**Configuración persistente (`config.js`, Fase 2A):** clave de storage
`core-c12.settings.v1`, esquema `{ version, taxRates, marginRates,
decimals }`, defaults `taxRates: [4,10,21]`, `marginRates:
[20,25,30,35,40,45]`, `decimals: 2`. **Persisten** tasas fiscales, márgenes
y decimales — sobreviven a refresh, cierre/reapertura y AC. **NO
persisten** el resultado/operación en curso, el historial/traza, ni
`taxDirection`/`marginDirection` (`+IVA`/`+M` siempre al recargar). Validación
todo-o-nada: cualquier campo fuera de rango, duplicado, con más de 1
decimal, o una versión desconocida, descarta el objeto completo y cae a
defaults — nunca mezcla campos válidos con inválidos. Un `localStorage`
ausente o que lanza excepción al leer/escribir nunca rompe el arranque ni
un cálculo: la app sigue funcionando en memoria.

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
`classList`, `dataset`, `closest`), y carga `config.js` y `calc.js` sin
tocarlos, en ese orden, dentro de un contexto `vm` de Node (con `window`
apuntando al propio sandbox, como en un navegador real). Dispara
`DOMContentLoaded` para que corra `init()`, exactamente como en un
navegador. Los tests simulan clics reales sobre esos botones reales y leen
el texto realmente renderizado en pantalla — ninguna fórmula ni regla de
validación está duplicada en los tests.

Para probar persistencia, `createEngine({ localStorage })` acepta una
instancia de `createFakeLocalStorage()` (con `_setBrokenRead`/
`_setBrokenWrite` para simular storage bloqueado). Pasar la MISMA
instancia a dos `createEngine()` simula un refresh real: estado JS nuevo,
misma `localStorage` persistida.

Cero dependencias npm: solo `node:test`, `node:assert`, `node:fs`,
`node:path`, `node:vm` (todos nativos de Node).

**Cómo ejecutarlos** (desde la raíz del proyecto):

```
node --test
```

(equivalente explícito: `node --test tests/calc-engine.test.js tests/config.test.js`)

**Nota de caracterización (Fase 0.10):** `1,73 → −IVA21` da `1,43`, no
`1,00`. Es el resultado matemáticamente correcto de aplicar el IVA inverso
sobre un valor *ya redondeado a 2 decimales* al re-teclearlo manualmente —
no es un bug. Si se continúa la cadena en vivo desde el resultado sin
redondear (sin volver a teclear), la reversión sí converge mucho más cerca
del costo original. Documentado aquí para que la futura Fase de margen
inverso no lo confunda con una regresión del motor actual.
