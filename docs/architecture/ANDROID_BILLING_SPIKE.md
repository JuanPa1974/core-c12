# ANDROID_BILLING_SPIKE — CORE C12

**Producto:** Core C12
**Módulo:** Core C12 Pro (Google Play Billing) — spike Android
**Estado:** SPIKE LOCAL CERRADO — VALIDACIÓN DE TIENDA PENDIENTE
**Versión del documento:** 1.0
**Fecha:** 14/09/2026

---

# 1. OBJETIVO DEL SPIKE

Determinar si Google Play Billing Library 9.1.0 permite implementar la misma compra única (Core C12 Pro, non-consumable) que ya existe en iOS vía StoreKit 2 (ver `STOREKIT2_SPIKE.md`), comprobando compilación real, contrato nativo y procesamiento de compras mediante pruebas **locales** — sin backend propio, sin RevenueCat, sin Capgo.

No era objetivo de esta fase: configurar el producto en Play Console, comprar con una cuenta real, ni activar el gating productivo en Android (el shell conserva todas las funciones disponibles, sin paywall ni badges — ver `PHASE 2`).

**Nunca se declara esto como "Billing validado en tienda".** Es un spike local: compila, y su lógica de estados/verificación/persistencia está probada con datos sintéticos — la validación contra Google Play real (producto configurado, license testers, compra real) queda pendiente en su totalidad (sección 8).

---

# 2. RAMA Y BASELINE

- **Rama:** `feature/core-c12-android` (misma rama de Phase 1/2, sin crear una nueva)
- **Base:** `05df89080afb70a90d0df857cf1a93bd09317fd4` (main, sin tocar)
- **Punto de partida de esta fase:** `50753c2b3088c0f18b7272d79eeb3e66443f2223` (Phase 2 — Capacitor Shell)

`main` no ha sido modificada. `ios/` no ha sido modificado ni sincronizado. Sin merge, sin push.

---

# 3. ARQUITECTURA

Cinco responsabilidades separadas, cada una en su propia clase, bajo `android/app/src/main/java/com/andaralab/corec12/billing/`:

| Capa | Clase | Responsabilidad |
|---|---|---|
| Transporte | `BillingTransport` (interfaz) / `GooglePlayBillingTransport` | Única clase que importa `com.android.billingclient.api.*`. Envuelve conexión, consulta de catálogo, lanzamiento de compra, consulta de compras y acknowledgment. |
| Verificación | `PurchaseVerifier` | Verificación local RSA/SHA1 de `(originalJson, signature)` contra una clave pública configurada. Resultado explícito de 3 valores: `VALID` / `INVALID` / `KEY_MISSING`. |
| Procesamiento | `PurchaseProcessor` | Clasificación **pura y síncrona** de una compra en uno de 7 estados (sección 5). No conoce `BillingClient` ni `Context`. |
| Persistencia | `EntitlementStore` (+ `KeyValueStore`) | Caché nativa versionada (`v1.*`), sin JSON — ver sección 6. |
| Orquestación | `CoreC12BillingManager` | Dueño único del ciclo de vida (conectar/reconectar/primer plano), de la prevención de compras concurrentes, de los reintentos acotados de acknowledgment y de la correlación resultado↔llamada. |
| Bridge | `CoreC12PurchasesPlugin` | Plugin Capacitor (`@CapacitorPlugin(name = "CoreC12Purchases")`), registrado **solo en debug** — ver sección 4. |

Cada capa recibe sus dependencias por constructor. Los tests (sección 7) sustituyen `BillingTransport`, `KeyValueStore` y `Scheduler` (el seam de `postDelayed`/reintentos) por dobles en memoria — ninguno de los ~50 tests locales llama a Google Play real.

**Producto:** `com.andaralab.corec12.pro` (mismo ID que iOS — ver `ios/App/App/CoreC12PurchasesPlugin.swift`; catálogos y compras de Apple/Google son independientes entre sí, la identidad del producto es lo único compartido).

---

# 4. AISLAMIENTO DEL SPIKE

- `src/platform/purchases.js` (`isSupported()`) sigue limitado a iOS (`Capacitor.getPlatform() === 'ios'`) — **sin cambios en esta fase**. La UI productiva de Core C12 nunca invoca nada de este plugin.
- `CoreC12PurchasesPlugin` se registra únicamente si `BuildConfig.DEBUG` es `true` (`MainActivity.onCreate()`, antes de `super.onCreate()`). En release, `BuildConfig.DEBUG` es una constante `false` verificada en el `BuildConfig.java` generado — el compilador trata la llamada a `registerPlugin(...)` como código inalcanzable en esa variante, no solo "no ejecutado".
- El "mecanismo de diagnóstico acotado" exigido para validar en emulador (sección 8 de la fase) es **Chrome DevTools Protocol contra el socket de depuración del WebView** (`webview_devtools_remote_<pid>`, reenviado vía `adb forward`), invocando directamente `Capacitor.Plugins.CoreC12Purchases.*` desde fuera de la app — no se añadió ningún botón, pantalla ni menú de diagnóstico al HTML/JS de la calculadora. Ese socket de depuración del WebView tampoco existe en un build release (mismo mecanismo `debuggable`), así que ni siquiera este canal de diagnóstico está disponible ahí.
- No se introdujo ningún modo que simule Pro en producción: `EntitlementStore.setConfirmedEntitlement()` solo se invoca desde `PurchaseProcessor`/`CoreC12BillingManager` tras una verificación + acknowledgment reales (o ya reconocidos).

---

# 5. ESTADOS (contrato de `PurchaseProcessor` + `BridgeStatus`)

`PurchaseProcessor.Classification` (interno, puro):

| Classification | Significado | Efecto en el store |
|---|---|---|
| `PENDING` | Pago no completado todavía | Ninguno |
| `PRODUCT_MISMATCH` | Evidencia de un producto distinto al nuestro | Ninguno |
| `VERIFICATION_FAILED` | `PURCHASED` pero la firma no verifica | Ninguno — nunca Pro |
| `CONFIG_INCOMPLETE` | `PURCHASED` pero no hay clave de verificación configurada | Ninguno — nunca Pro |
| `NEEDS_ACK` | Verificada, sin reconocer | `addPendingAck()` |
| `ALREADY_ACKNOWLEDGED` | Verificada y ya reconocida (reconciliación/restore) | `setConfirmedEntitlement()` |
| `UNKNOWN_STATE` | Cualquier otro estado no reconocido | Ninguno |

`BridgeStatus` (lo que ve JS/diagnóstico, vocabulario **deliberadamente distinto** del de iOS — ver el comentario de cabecera de `BridgeStatus.java`): `PRO_CONFIRMED`, `PENDING`, `ACK_PENDING`, `CANCELLED`, `VERIFICATION_FAILED`, `CONFIG_INCOMPLETE`, `PRODUCT_UNAVAILABLE`, `BILLING_UNAVAILABLE`, `QUERY_FAILED`, `NONE`, `PURCHASE_IN_PROGRESS`.

`CONFIG_INCOMPLETE` y `VERIFICATION_FAILED` nunca colapsan en el mismo valor: el primero significa "no se puede evaluar", el segundo "se evaluó y no pasó" — confundirlos ocultaría exactamente el caso real de hoy (sin clave de Play Console todavía).

`CoreC12BillingManager` nunca resta Pro por un fallo transitorio: `getEntitlement()`/`restorePurchases()` con una consulta fallida devuelven `isPro` tal como estaba en caché, con un `status` que indica la consulta fallida (`QUERY_FAILED`), nunca `isPro:false` como si fuera autoritativo.

---

# 6. PERSISTENCIA

`EntitlementStore` usa claves planas versionadas (`v1.confirmed.isPro`, `v1.pendingAck.tokens`, `v1.pendingAck.<token>.attempts`, `v1.lastQuery.*`) sobre `SharedPreferences` — **no JSON**: `org.json` en Android es un stub de framework en JUnit puro (lanza sin Robolectric), y esta fase solo añade la dependencia oficial de Billing, ninguna librería de test adicional.

- Confirmado (`confirmed.isPro`) es **sticky**: nada en esta fase lo limpia por un fallo transitorio, por estar offline, ni por un temporizador. Solo se escribe tras una verificación + acknowledgment reales.
- Instalación nueva sin conectividad → `isPro=false` por ausencia de dato, nunca se concede por "no se pudo comprobar".
- No es una bóveda segura: `SharedPreferencesKeyValueStore` es almacenamiento privado de la app (mismo nivel que el resto de la app), no protegido por hardware — un dispositivo rooteado puede editarlo. Existe para sobrevivir muerte de proceso/reinicios offline, no para resistir a un atacante determinado.
- Ningún `purchaseToken` se escribe en logs (`Log.*`) en ningún punto del código — solo se persiste (necesario para recuperar acknowledgments pendientes), nunca se loguea.
- Caché dañada (valores no numéricos, entradas huérfanas) degrada de forma segura — probado explícitamente (`EntitlementStoreTest`), nunca lanza ni concede Pro.

---

# 7. POLÍTICA DE VERIFICACIÓN Y ACKNOWLEDGMENT

**Verificación:** RSA/SHA1 local sobre `(Purchase.getOriginalJson(), Purchase.getSignature())`, el esquema documentado de Play (`PurchaseVerifier`). Esto es verificación **en el cliente**, no equivalente a verificación en servidor — Google recomienda esta última como la autoritativa; un dispositivo rooteado/instrumentado puede burlar una verificación puramente local. Este spike nunca debe presentarse como resistente a manipulación del cliente.

**Clave pública real:** no disponible todavía (producto sin configurar en Play Console). Se define su lugar de configuración en `android/app/build.gradle` → `buildConfigField "String", "PLAY_LICENSING_PUBLIC_KEY_BASE64", "\"\""` (por defecto vacío) — un **valor público**, entera y deliberadamente distinto de la clave de firma/keystore de la app (privada, nunca en el repositorio). Mientras esté vacío, toda compra `PURCHASED` se clasifica `CONFIG_INCOMPLETE`, nunca se omite la verificación silenciosamente.

**Tests:** usan un par de claves RSA sintético generado en cada ejecución (`SyntheticSignedPurchase`, exclusivo de `src/test`), nunca la clave real de Play Console.

**Acknowledgment:**
- Nunca se llama `consumeAsync` (no existe en `BillingTransport`) — el producto nunca se consume.
- `isAcknowledged()` se comprueba antes de intentar reconocer de nuevo (`ALREADY_ACKNOWLEDGED` nunca dispara un segundo `acknowledgePurchase`).
- Si el acknowledgment falla, se reintenta acotadamente (hasta 3 veces, backoff 2s/5s/10s) mientras la app está activa (`CoreC12BillingManager`, `Scheduler`). Nunca se marca como completada una operación que no reconoció con éxito.
- Agotados los reintentos de esa sesión, el token permanece en `pendingAck` para recuperarse en el siguiente `connect()`/`onResume()` vía `queryPurchasesAsync` — **sin backend, no hay garantía de plazo** si la app deja de ejecutarse antes de que eso ocurra; ese es un límite explícito de este spike, no un bug.

---

# 8. FUENTES OFICIALES CONSULTADAS

- developer.android.com/google/play/billing/integrate
- developer.android.com/reference/com/android/billingclient/api/BillingClient.Builder (`enableAutoServiceReconnection`, añadido en 8.0)
- developer.android.com/reference/com/android/billingclient/api/PendingPurchasesParams.Builder
- developer.android.com/google/play/billing/one-time-product-multi-purchase-options-offers (API de múltiples ofertas para productos de una sola compra, 9.x)
- developer.android.com/reference/com/android/billingclient/api/ProductDetails.OneTimePurchaseOfferDetails
- developer.android.com/reference/com/android/billingclient/api/Purchase y Purchase.PurchaseState
- developer.android.com/reference/com/android/billingclient/api/BillingClient.BillingResponseCode
- Esquema clásico de verificación local de Google (`Security.verifyPurchase`, RSA/SHA1) — documentado históricamente por Google y confirmado vigente en la referencia actual de `Purchase.getSignature()`/`getOriginalJson()`.

Todo el código de `GooglePlayBillingTransport` compiló contra el jar real de `com.android.billingclient:billing:9.1.0` en el primer intento — ninguna forma/firma se adivinó sin contrastarla antes contra la documentación oficial.

---

# 9. PRUEBAS REALIZADAS (locales)

47 tests JUnit4 nuevos (`android/app/src/test/java/com/andaralab/corec12/billing/`), JVM plano, sin Robolectric, sin red, sin `BillingClient` real:

| Archivo | Tests | Cubre |
|---|---|---|
| `PurchaseVerifierTest` | 7 | Firma válida, datos alterados, firma de otra clave, bytes basura, firma vacía, clave ausente, clave malformada |
| `EntitlementStoreTest` | 9 | Confirmado, pendientes de ack (alta/lista/incrementa/borra), idempotencia, múltiples tokens, última consulta, caché dañada (2 variantes) |
| `PurchaseProcessorTest` | 12 | Las 7 clasificaciones + efectos de `applyToStore` para cada una |
| `CoreC12BillingManagerTest` | 18 | Pending, verificado+reconocido, ya reconocida, ack fallido+reintentado (éxito y agotamiento), callback duplicado, evento tardío tras timeout, cancelación, `ITEM_ALREADY_OWNED`+reconciliación, compras concurrentes, restore con/sin compra, restore con fallo de consulta (preserva entitlement previo), offline con/sin entitlement confirmado, recuperación tras "reinicio" (store compartido entre dos instancias de manager), `getProduct` disponible/no disponible |

`./gradlew :app:testDebugUnitTest` → **47/47 PASS**.

Suite JS existente: **284/284 PASS**, sin cambios (esta fase no tocó ningún archivo `src/*.js` ni `tests/*.js` — solo Android nativo).

`./gradlew :app:compileDebugJavaWithJavac` y `:app:assembleDebug` → compilan sin advertencias del código nuevo.

---

# 10. VALIDACIÓN EN EMULADOR (AVD `medium_phone`, API 36, arm64-v8a, Google Play)

| Verificación | Resultado |
|---|---|
| Plugin registrado en debug | ✅ `Capacitor.Plugins.CoreC12Purchases` accesible vía CDP |
| Conexión real de Billing | Falla con `BILLING_UNAVAILABLE` — logcat: *"In-app billing API version 3 is not supported on this device"*. Real, reproducible online y offline; consistente con no haber iniciado sesión con una cuenta de Google en este AVD (deliberado — sección 12 de la fase prohíbe introducir cuentas). No es un defecto del plugin: el plugin detecta y reporta el fallo correctamente, sin colgarse ni fabricar datos. |
| `getProduct()` | `{available:false, status:"BILLING_UNAVAILABLE"}` — sin inventar precio ni nombre |
| `getEntitlement()` | `{status:"NONE", isPro:false}` — inmediato, desde caché |
| `restorePurchases()` | `{status:"BILLING_UNAVAILABLE", isPro:false}` — nunca reporta éxito sin haber consultado |
| Cierre inesperado / bloqueo de la calculadora | Ninguno — logcat sin `FATAL`/`AndroidRuntime` en ninguna sesión |
| Gating/paywall/badges Android | Siguen desactivados (`CoreC12Purchases.isSupported() === false` desde JS, verificado vía CDP) |
| Arranque y cálculo offline | Conservados — captura de pantalla con red desactivada, cálculo `100 +IVA 21% = 121,00` correcto antes y después |
| Build release sin firma de producción | `app-release-unsigned.apk` — `BuildConfig.DEBUG=false` confirmado en el `BuildConfig.java` generado; sin socket `webview_devtools_remote` (WebView no depurable); firmado **solo localmente** con el debug keystore estándar (`~/.android/debug.keystore`) **exclusivamente para poder instalarlo y confirmar en tiempo real que no se registra el plugin** — nunca se generó ni usó una clave de firma de producción, y el APK firmado localmente no se conserva ni se distribuye. |

---

# 11. LÍMITES SIN BACKEND

- Verificación de firma local, no de servidor (sección 7) — no confundir "pasa la verificación local" con "Google confirma la compra".
- Sin backend, el acknowledgment dentro del plazo de 3 días que exige Google no está garantizado si la app no vuelve a abrirse a tiempo — solo se reintenta mientras la app está activa y se recupera en el siguiente arranque/reconexión.
- La caché nativa (`SharedPreferences`) no es inviolable; es la misma protección que el resto de la app.
- `queryPurchasesAsync` (usado por `restorePurchases`/reconciliación) puede devolver información temporalmente desactualizada respecto al estado real en los servidores de Google, y su resultado depende de qué cuenta de Google Play esté activa en el dispositivo — nunca se trata como fuente de verdad absoluta ni como prueba histórica de propiedad (se usa la consulta de compras vigentes, nunca el historial).

---

# 12. DEPENDENCIAS DE PLAY CONSOLE (pendientes)

- Registrar y configurar el producto `com.andaralab.corec12.pro` como compra única (in-app product) en Play Console, con **exactamente una** opción de compra permanente — `GooglePlayBillingTransport.pickOffer()` rechaza explícitamente un catálogo con 0 o >1 ofertas en vez de adivinar.
- Obtener y configurar la clave pública de licencias real (App integrity → Licensing) en `PLAY_LICENSING_PUBLIC_KEY_BASE64`.
- Publicar al menos una pista interna (internal testing track) y añadir license testers para poder ejercitar una compra real de prueba.
- Firma de release de producción — **no creada en esta fase**, deliberadamente.

---

# 13. VALIDACIÓN DE TIENDA PENDIENTE

**No se han validado compras reales de Google Play ni Billing de extremo a extremo.**

Pendiente explícitamente: producto real configurado, clave de licencias real, compra con license tester, verificación de firma contra la clave real de Play Console, comportamiento real de `queryPurchasesAsync`/acknowledgment contra los servidores de Google, y período real de gracia de 3 días para acknowledgment en un dispositivo/cuenta reales.

---

# 14. PASOS PENDIENTES PARA INTEGRACIÓN PRODUCTIVA

1. Configurar Play Console (sección 12) y validar una compra real con license tester.
2. Ampliar `isSupported()` (`src/platform/purchases.js`) para reconocer también `'android'`, y activar el gating productivo en `calc.js` para esa plataforma — explícitamente fuera de alcance de esta fase.
3. Decidir y documentar el manejo de reembolso/revocación en Android (StoreKit 2 lo resuelve automáticamente vía `Transaction.currentEntitlements`; Play Billing no tiene un equivalente automático directo — requiere `queryPurchasesAsync` periódico o Realtime Developer Notifications, no evaluado en este spike).
4. Evaluar si el plazo de acknowledgment de 3 días sin backend es aceptable para producción, o si se necesita algún mecanismo adicional (sección 11).
5. Diseño e implementación de iconos/splash definitivos y firma de release — pendientes desde Phase 2, sin cambios en esta fase.

---

# 15. PENDIENTES YA DOCUMENTADOS EN FASES ANTERIORES (sin tocar en esta fase)

- Hallazgo SystemBars (inyección fallida de CSS de safe-area por el propio plugin de `@capacitor/android`) — ver el informe de cierre de Phase 2. Sin impacto observado, sin corrección aplicada (no es código de la app).
- Comportamiento de actualización del service worker tras el cambio de registro en Phase 2 — validado en navegador real, sin regresión.
- Validación de `register-sw.js` en iOS nativo real (WKWebView) — sigue sin ejercitarse en un dispositivo/simulador iOS en esta fase.
- QA de vibración física — sigue sin ser verificable en emulador.

---

# 16. CONCLUSIÓN

**El spike local de Google Play Billing 9.1.0 es viable arquitectónicamente:** compila contra la Billing Library real, separa transporte/verificación/procesamiento/persistencia/bridge con una cobertura de 47 tests locales, se registra exclusivamente en debug, y se comporta de forma segura y sin cierres inesperados frente a la ausencia actual de configuración en Play Console (falla explícita, nunca datos inventados, nunca Pro sin evidencia).

**Queda cerrado como spike local.** La activación productiva del gating en Android y la validación contra Google Play real quedan como trabajo futuro explícito (secciones 13-14) — este documento no certifica ninguna de las dos.
