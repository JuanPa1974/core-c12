# STOREKIT2_SPIKE — CORE C12

**Producto:** Core C12
**Módulo:** Core C12 Pro (IAP)
**Estado:** SPIKE CERRADO — VIABLE
**Versión del documento:** 1.0
**Fecha:** 14/09/2026

---

# 1. OBJETIVO DEL SPIKE

Determinar si StoreKit 2 permite implementar una compra única (Core C12 Pro) **on-device, sin backend propio y sin proveedores externos** (sin RevenueCat, sin Capgo), manteniendo intactos el core matemático y la lógica comercial productiva de Core C12.

No era objetivo de este spike implementar la UI Free/Pro definitiva ni el producto real en App Store Connect.

---

# 2. RAMA Y BASELINE

- **Baseline:** `main @ 5d23bb4` ("feat: add controlled native splash screen")
- **Rama de trabajo:** `feature/core-c12-pro-iap`
- **Commits del spike:**
  - `8cad9ae` — spike: add StoreKit 2 configuration and native purchases bridge
  - `d0ae3fe` — spike: register local plugin manually and avoid SKTestSession crash

`main` no ha sido modificado. Sin merge, sin push.

---

# 3. ARQUITECTURA STOREKIT 2 ON-DEVICE SIN BACKEND

Core C12 Pro se implementa como producto **NonConsumable** validado directamente en el dispositivo mediante StoreKit 2, sin servidor propio de verificación de recibos:

- La app consulta `Product` vía StoreKit 2 (`Product.products(for:)`).
- La compra se ejecuta con la API nativa de StoreKit 2 (`product.purchase()`).
- El entitlement se deriva de `Transaction.currentEntitlements`, distinguiendo explícitamente transacciones `verified` de `unverified`.
- Las revocaciones y reembolsos son reflejados automáticamente por Apple en `currentEntitlements` (transacción excluida del conjunto tras `revocationDate`), sin lógica adicional en el bridge.
- Restore de compras implementado vía `AppStore.sync()`.

**Product ID local de prueba:** `com.andaralab.corec12.pro`
Tipo: `NonConsumable` · Precio simulado: `4.99` · Definido en `ios/App/App/Configuration.storekit`.

---

# 4. BRIDGE JS ↔ SWIFT ↔ STOREKIT 2

- `ios/App/App/CoreC12PurchasesPlugin.swift` — plugin Capacitor nativo que expone a JS: `getProduct()`, `purchase()`, `getEntitlement()`, `restore()`.
- `src/platform/purchases-spike.js` / `src/iap-spike.js` — capa JS de prueba que invoca el plugin y expone un panel temporal `SPIKE StoreKit 2` para validación manual.
- Estados de compra manejados explícitamente: `purchased (verified)`, `purchased (unverified)`, `pending`, `cancelled`, `error`, producto no disponible.

## Hallazgo arquitectónico: registro del plugin local

Capacitor 8 **no auto-descubre plugins Swift definidos directamente dentro del target de la app** (solo auto-registra plugins distribuidos como paquete npm). `CoreC12PurchasesPlugin`, al vivir dentro del target `App`, no era reconocido por el runtime de Capacitor.

**Solución aplicada (mecanismo documentado, no workaround):**
- `CoreC12BridgeViewController.swift` registra el plugin manualmente en `capacitorDidLoad()`.
- `SceneDelegate.swift` se modifica mínimamente para instanciar este view controller en lugar del `CAPBridgeViewController` por defecto.

Esta solución debe mantenerse como referencia para el registro de cualquier plugin nativo local futuro en Core C12.

También se eliminó la creación temprana de `SKTestSession` en `load()`, que provocaba un `SIGABRT` fuera de un host XCTest (confirmado por traza de crash real).

---

# 5. RESULTADOS DE VALIDACIÓN

Validado manualmente en Xcode con `Configuration.storekit` activo en el Scheme (`Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration`), ejecutando con `Cmd+R` (no vía `xcrun simctl launch`, que aborta `SKTestSession`):

| Caso | Resultado |
|---|---|
| Get Product | ✅ PASS |
| Purchase (hoja nativa de compra simulada) | ✅ PASS |
| Purchase confirmation | ✅ PASS |
| Get Entitlement post-compra | ✅ PASS — `isPro = true` |
| Restore | ✅ PASS — recupera `isPro = true` |

Adicionalmente, previo a esta validación manual:

- 173/173 tests automatizados: PASS
- Builds: PASS
- Core matemático y lógica comercial productiva: intactos

---

# 6. LIMITACIÓN CONOCIDA Y DECISIÓN

**Limitación:** `Simulate Refund` no es ejecutable desde un lanzamiento normal de la app. StoreKitTest devuelve el mensaje esperado: requiere que la app se ejecute desde un target XCTest; no está disponible desde un lanzamiento normal.

**Decisión aprobada (2026-09-14):** No se crea un target XCTest específico solo para ejercitar refund/revocation.

Razones:

1. El comportamiento de revocación ya está cubierto por diseño: `getEntitlement()` se apoya en `Transaction.currentEntitlements`, y StoreKit 2 excluye automáticamente las transacciones revocadas de ese conjunto — es garantía de la plataforma, no lógica custom que el spike deba demostrar con infraestructura adicional.
2. Añadir un target XCTest solo para este caso introduce mantenimiento desproporcionado frente al objetivo del spike (validar viabilidad técnica, ya demostrada).
3. Existe una vía de validación más realista y de menor coste: sandbox de App Store Connect en TestFlight, donde se puede forzar un reembolso real y observar `Transaction.updates` en la app definitiva.

**Validación pendiente:** refund/revocation se validará en sandbox/TestFlight durante la implementación definitiva de Core C12 Pro, no en esta fase de spike.

---

# 7. CONCLUSIÓN

**StoreKit 2 on-device sin backend es viable para Core C12 B2C.**

Cumple los principios rectores del producto: sin backend, sin cuentas, sin suscripción, sin proveedores externos de pagos, offline-first y privacy-first. El spike queda cerrado; la implementación definitiva de Free/Pro se abordará en una fase posterior.
