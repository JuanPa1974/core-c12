# SESSION_HANDOFF_ANDROID — CORE C12

**Fecha de cierre:** 2026-09-14
**Rama:** `feature/core-c12-android`
**SHA completo del último commit de implementación:** `b22b42103a590d95772001a48b04298a3c07ae7c`
**Base (`main`):** `05df89080afb70a90d0df857cf1a93bd09317fd4` — intacta, sin push, sin merge en ningún momento de Phase 0-3.

Este documento es el punto de entrada para retomar el trabajo Android de Core C12 en otra sesión, sin repetir instalaciones ni recrear la rama.

---

## 1. ESTADO POR FASE

| Fase | Resultado | Commit |
|---|---|---|
| Phase 0 | Preflight — base aprobada, 279/279 tests | (ninguno, solo verificación) |
| Phase 1 | Entorno Android preparado (Android Studio, JDK 21, SDK, AVD) | (ninguno, solo entorno — sin cambios versionados) |
| Phase 2 | Capacitor Shell Android creado, sin Billing, sin gating | `50753c2b3088c0f18b7272d79eeb3e66443f2223` |
| Phase 3 | Spike local de Google Play Billing 9.1.0 (debug only) | `b22b42103a590d95772001a48b04298a3c07ae7c` |

Documentación técnica asociada: `docs/architecture/ANDROID_BILLING_SPIKE.md` (contrato completo del plugin, estados, política de verificación/acknowledgment, fuentes oficiales, pruebas realizadas — no se repite aquí).

---

## 2. STACK Y HERRAMIENTAS (ubicaciones descritas de forma portable)

| Componente | Versión | Ubicación (relativa al `$HOME` del equipo que preparó el entorno) |
|---|---|---|
| Node.js | 24.21.0 | gestionado por nvm |
| npm | 11.19.0 | — |
| Android Studio | Quail 4 (2026.1.4.7) | `/Applications/Android Studio.app` |
| JDK | 21.0.12.1 (Homebrew, formula `openjdk@21`, keg-only — **no** registrado en `/Library/Java/JavaVirtualMachines`) | `$(brew --prefix)/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` |
| Android SDK | Platform 36, Build-Tools 35.0.0, Platform-Tools, Emulator | `$HOME/Library/Android/sdk` (ubicación estándar; también exportable como `$ANDROID_HOME`/`$ANDROID_SDK_ROOT`) |
| Capacitor Core/CLI/iOS/Android | 8.5.2 | `package.json` del repositorio |
| Billing Library | 9.1.0 | `android/app/build.gradle` |
| Gradle Wrapper | 8.14.3 | `android/gradle/wrapper/` (versionado, no requiere instalación global) |
| AGP | 8.13.0 | `android/build.gradle` |

**AVD aprobado:** `medium_phone` — perfil de dispositivo genérico "Medium Phone" (sustituto de Pixel aprobado expresamente en Phase 1 tras una incompatibilidad comprobada de `avdmanager` con la imagen de sistema más reciente — ver el informe de cierre de Phase 1), Android 16 / API 36, `arm64-v8a`, con Google Play. Ya existe en `$HOME/.android/avd/medium_phone.avd` — no es necesario recrearlo.

Ninguna de estas herramientas requiere reinstalación: JDK, SDK, Android Studio y el AVD ya están presentes en el equipo que ejecutó las Phases 1-3. Solo hace falta exportar las variables de entorno (sección 3) en cada sesión nueva de terminal, ya que la instalación de JDK fue deliberadamente acotada (sin registro global) para no alterar otras instalaciones Java del equipo.

---

## 3. COMANDOS PARA RETOMAR

```bash
# Variables de entorno (cada sesión nueva de terminal — nada de esto se persistió globalmente)
export JAVA_HOME="$(brew --prefix)/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export PATH="$ANDROID_SDK_ROOT/platform-tools:$PATH"

cd /Volumes/WORKSPACE/01_PROYECTOS/APP_WEB/Core_C12
git checkout feature/core-c12-android   # ya existe local y remota tras este cierre

# Tests JS (284/284 esperado)
npm test

# Tests Java del spike de Billing (47/47 esperado)
cd android
./gradlew :app:testDebugUnitTest --no-daemon

# Build debug
./gradlew :app:assembleDebug --no-daemon
# APK resultante: android/app/build/outputs/apk/debug/app-debug.apk

# Build release (sin firma de producción — nunca se creó una)
./gradlew :app:assembleRelease --no-daemon
# APK resultante: android/app/build/outputs/apk/release/app-release-unsigned.apk (literalmente sin firmar)

# Emulador
emulator -avd medium_phone -no-audio -no-boot-anim &
adb wait-for-device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.andaralab.corec12/.MainActivity
```

---

## 4. COMPORTAMIENTO ACTUAL DEL ANDROID SHELL (temporal, no de distribución)

- **Todas las funciones de la calculadora están disponibles en Android**, sin paywall ni badges Pro — `src/platform/purchases.js` (`isSupported()`) sigue limitado a `'ios'`; el shell Android nunca invoca el bridge de compras desde la UI productiva. Esto es deliberado y temporal, exclusivamente para validar el shell — **no es una decisión de distribución**.
- **`CoreC12PurchasesPlugin` (el spike de Billing) se registra únicamente en builds debug** — `MainActivity.onCreate()` comprueba `BuildConfig.DEBUG` antes de `registerPlugin(...)`, verificado contra el `BuildConfig.java` generado de la variante release (`DEBUG=false`) y contra la ausencia del socket de depuración del WebView en esa variante.
- **La clave pública de licencias de Play Console sigue vacía** — `android/app/build.gradle` → `buildConfigField "String", "PLAY_LICENSING_PUBLIC_KEY_BASE64", "\"\""`. Mientras esté vacía, toda compra `PURCHASED` se clasifica `CONFIG_INCOMPLETE` (nunca se omite la verificación silenciosamente, nunca se concede Pro sin evidencia).

---

## 5. RESULTADOS DE VALIDACIÓN — REPORTADOS vs. COMPROBADOS EN ESTE CIERRE

Este cierre de sesión (Phase "cierre y respaldo") **no volvió a ejecutar la suite completa de tests ni a recompilar** — no era necesario, ya que solo se añadió documentación. Los siguientes resultados son los **reportados al final de Phase 3** y no se han vuelto a comprobar en este cierre:

- Tests JS: 284/284 PASS (reportado en Phase 3; no re-ejecutado en este cierre).
- Tests Java del spike: 47/47 PASS (reportado en Phase 3; no re-ejecutado en este cierre).
- Builds debug y release: compilados correctamente (reportado en Phase 3).

Lo único verificado *en este cierre* es el estado de Git (rama, SHA, working tree, integridad de `main` e `ios/`) — ver el informe de cierre de esta sesión para el detalle exacto de qué se comprobó y cuándo.

**Resultado observado de la conexión real a Billing (Phase 3, emulador `medium_phone`):** `BILLING_UNAVAILABLE` — logcat: *"In-app billing API version 3 is not supported on this device"*. Este es el resultado real observado, reproducible en esa sesión. Es **consistente** con la ausencia deliberada de una cuenta de Google iniciada en ese AVD (no se introdujeron cuentas ni credenciales, por instrucción explícita de Phase 3), pero **esa no fue aislada ni confirmada como la única causa posible** — no se descartaron otras causas (p. ej. una limitación del propio servicio de Play Store en esa imagen de sistema concreta). Cualquier sesión futura que retome este punto debería tratar la causa como no concluyente hasta investigarla explícitamente (por ejemplo, iniciando sesión con una cuenta de prueba una vez haya license testers configurados en Play Console).

**Sobre los APK de esta sesión:** `android/app/build/outputs/apk/debug/app-debug.apk` es un build debug estándar. `android/app/build/outputs/apk/release/app-release-unsigned.apk` es un build release **literalmente sin firmar** (no instalable tal cual). Durante la validación de Phase 3 se firmó una copia temporal de este último con el keystore debug estándar del equipo (`~/.android/debug.keystore`) **únicamente para poder instalarla y confirmar en tiempo real que el plugin de Billing no se registra en release** — esa copia firmada se eliminó inmediatamente después de esa comprobación y no existe en disco al cierre de esta sesión. Ningún APK de esta sesión, firmado o sin firmar, es un artefacto de release de producción: no existe ninguna clave de firma de producción en este proyecto.

---

## 6. VALIDACIÓN REAL DE COMPRAS: AUSENTE

**No se ha validado ninguna compra real de Google Play, ni el flujo de Billing de extremo a extremo.** Todo lo relativo a Billing hasta este punto es local: compilación real contra la Billing Library, y pruebas unitarias con datos/claves sintéticos. Ver `docs/architecture/ANDROID_BILLING_SPIKE.md` sección 13 para el detalle completo de lo pendiente.

---

## 7. PENDIENTES REGISTRADOS (de fases anteriores, sin resolver)

- **Play Console:** producto `com.andaralab.corec12.pro` sin configurar, sin clave pública de licencias real, sin license testers, sin pista de pruebas publicada.
- **Acknowledgment real:** el plazo de 3 días de Google sin backend propio no está garantizado si la app no vuelve a abrirse a tiempo — límite documentado, no resuelto.
- **SystemBars (Capacitor):** inyección fallida de variables CSS de safe-area por el propio plugin nativo de `@capacitor/android` — sin impacto observado en el emulador usado, sin corregir (no es código de la app). Ver el informe de cierre de Phase 2 para el diagnóstico completo.
- **Haptics físicos:** no verificables en emulador — QA pendiente en dispositivo físico.
- **Regresión nativa iOS:** los cambios compartidos de Phase 2 (`src/platform/purchases.js`, `src/register-sw.js`) se validaron mediante tests y en un navegador real, pero **no se re-ejercitaron en un simulador/dispositivo iOS real** en ninguna fase — `ios/` no se ha tocado ni sincronizado desde la base aprobada.
- **Actualización del Service Worker entre versiones:** el comportamiento de `registerType:'autoUpdate'` se validó en un único ciclo de build/reload en Phase 2 (activación automática, control inmediato en la siguiente carga) — no se ha ejercitado un escenario de *actualización* real (build A ya instalado → build B desplegado → verificar que el cliente detecta y aplica la actualización sin intervención) en ninguna fase.

---

## 8. PRÓXIMO PASO (sujeto a decisión del usuario — no ejecutado aquí)

Las opciones razonables para continuar son, sin orden de prioridad implícito:

1. Configurar el producto y la clave pública en Play Console para poder validar una compra real con un license tester.
2. Activar el gating productivo en Android (`isSupported()` reconociendo `'android'`) una vez el spike de Billing esté validado en tienda.
3. Resolver el diseño de iconos/splash definitivos y la firma de release, pendientes desde Phase 2.

Esta sesión de cierre no eligió ni inició ninguna de estas opciones — queda explícitamente para quien retome el trabajo.

---

## 9. CÓMO RETOMAR SIN REPETIR TRABAJO

1. `git checkout feature/core-c12-android` — la rama ya existe local y remotamente tras este cierre; no crear una rama nueva.
2. Exportar las variables de entorno de la sección 3 — no reinstalar JDK, SDK, Android Studio ni recrear el AVD.
3. Leer `docs/architecture/ANDROID_BILLING_SPIKE.md` antes de tocar código de Billing — documenta el contrato completo y las decisiones ya tomadas (por qué RSA/SHA1 local, por qué exactamente una oferta, por qué debug-only, etc.).
4. Si van a pasar varios días, re-ejecutar `npm test` y `./gradlew :app:testDebugUnitTest` una vez al retomar, ya que esta sesión de cierre no los volvió a correr (sección 5).
