# ANDROID_BRANDING_QA — CORE C12

**Producto:** Core C12
**Módulo:** Branding Android (icono adaptativo, splash, contraste de barras) y política de orientación teléfono/tablet
**Estado:** APROBADO EN EMULADOR API 36 (teléfono y tablet) — API 24 CON FALLO PENDIENTE DE PROVEEDOR DE WEBVIEW
**Versión del documento:** 1.0
**Fecha:** 28/09/2026

---

# 1. OBJETIVO

Registrar el QA realizado sobre la implementación de branding Android (icono adaptativo derivado del master, splash "C12" sobre `#10151A` con `launchShowDuration=600ms`, corrección de contraste de barras vía `SystemBars.style=DARK`) y la política de orientación de `MainActivity` (teléfono: `sensorLandscape`; pantallas ≥600dp de ancho mínimo: sin restricción), tal como quedaron implementadas en el commit probado.

No es objetivo de este documento evaluar Billing productivo ni activar gating — ver `ANDROID_BILLING_SPIKE.md` para ese alcance, que permanece sin cambios.

---

# 2. COMMIT PROBADO

- **Rama:** `feature/core-c12-android`
- **Commit:** `0892f3a7b107d104112e0c300227691aa937a346` — `feat(android): add Core C12 branding and phone orientation policy`
- **Sincronización con remoto:** HEAD local y `origin/feature/core-c12-android` coinciden en este commit (push fast-forward ya realizado).
- `main` no ha sido modificada. `ios/App/App.xcodeproj/project.pbxproj` conserva su cambio preexistente, sin relación con este trabajo, sin tocar.

---

# 3. ENTORNOS DE PRUEBA

| Entorno | AVD | API | ABI | Play Store | Notas |
|---|---|---|---|---|---|
| Teléfono | `medium_phone` | 36 (Android 16) | arm64-v8a | Sí (`google_apis_playstore`) | Perfil "Medium Phone", ya existente de fases anteriores |
| Tablet | `Core_C12_Tablet_API36` | 36 (Android 16) | arm64-v8a | Sí (`google_apis_playstore`) | Perfil "Pixel Tablet" (`sdklib` `devices.xml`), creado en esta ronda de QA reutilizando la misma imagen de sistema ya instalada para `medium_phone` — **sin descarga de componentes**. `smallestScreenWidthDp` real: **800dp** |
| API 24 | `Core_C12_-_API_24` | 24 (Android 7.0) | arm64-v8a | No — `com.android.vending` es el stub `LicenseChecker.apk` (`google_apis`, no `google_apis_playstore`) | WebView activo: `com.google.android.webview` **53.0.2785.124** (confirmado vía traza `WebViewFactory` en el momento de carga, no solo por el paquete instalado) |

---

# 4. TELÉFONO API 36 — APROBADO

QA realizado en fases previas sobre `medium_phone`: icono adaptativo (verificado contra el recorte real de máscara del launcher), splash con marca "C12" sobre `#10151A`, `launchShowDuration=600ms` preservado, contraste de barras en modo día y noche, orientación forzada `sensorLandscape`, ciclo background/foreground, y operación aritmética real.

**El usuario confirmó arranque satisfactorio y respuesta inmediata al operar** — confirmación manual registrada explícitamente en el cuerpo del commit `0892f3a`.

Medición de tiempos de arranque en frío (una ejecución COLD y dos WARM, timestamps reales del dispositivo vía `adb shell log` + `am start -W`, sin deducir de la duración de vídeo): las dos corridas WARM ocurrieron pese a `force-stop` previo en las tres — limitación de la metodología de reinicio, documentada sin ocultar. La confirmación manual del usuario de respuesta inmediata al operar (arriba) es la evidencia de latencia de interacción; no se retiene ningún intervalo numérico de esa medición, ya que provino de capturas espaciadas y no constituye una medición fiable de latencia.

Evidencia local (no versionada — ver sección 9): `assets/app-icon/android/previews/qa-api36/`, `qa-api36-bars/`, `qa-api36-systembars/`, `qa-api36-orientation/`.

---

# 5. TABLET API 36, `sw800dp` — APROBADO

AVD creado reutilizando la imagen `system-images/android-36/google_apis_playstore/arm64-v8a` ya instalada (misma que `medium_phone`) con el perfil oficial "Pixel Tablet", verificado contra la fuente real de perfiles de dispositivo de `sdklib.jar` (no deducido de la existencia del skin).

| Verificación | Resultado |
|---|---|
| Arranque | `sys.boot_completed=1`, foco en `NexusLauncherActivity`, sin `FATAL`/`AndroidRuntime` |
| `smallestScreenWidthDp` | **800dp** — leído directamente de `Configuration.toString()` de WindowManager (`sw800dp`), no calculado |
| Orientación solicitada por `MainActivity` | `requestedOrientation=SCREEN_ORIENTATION_UNSPECIFIED` — confirmado vía `dumpsys activity` (dato real de `ActivityTaskManager`), coincide con la rama de pantalla grande de la política aprobada |
| Diseño horizontal | Calculadora completa, sin botones cortados ni superposiciones (`landscape_calculator.png`) |
| Diseño vertical | Reflow correcto (bloques IVA/MARGEN lado a lado arriba), sin cortes ni superposiciones (`portrait_calculator.png`) |
| Rotación libre | Forzada landscape↔portrait vía `wm`/`settings`, sin restricción del sistema en ningún sentido |
| Cálculo básico | `2 + 3 = 5,00` confirmado en ambas orientaciones (`landscape_2plus3.png`, `portrait_2plus3_clean.png`); verificación cruzada con una operación distinta (`0+8=8`) para descartar estado residual de pantalla |
| Contraste de barras | Iconos claros sobre fondo oscuro en ambas orientaciones, visible en todas las capturas |
| Background/foreground | Tras `HOME` y relanzamiento: `"Activity not started, its current task has been brought to the front"` — la Activity no se recreó, estado (`5,00`) persistido intacto (`portrait_after_foreground.png`) |

Evidencia local: `assets/app-icon/android/previews/qa-tablet-api36/`.

---

# 6. INCIDENCIA: INYECCIÓN DE CSS DE SAFE-AREA AL ARRANQUE

```
E/Capacitor/Console: Error injecting safe area CSS: TypeError: Cannot read properties of null (reading 'style')
```

Investigado a nivel de código real, no atribuido por sospecha:

- **Origen:** `SystemBars.java`, plugin nativo de `@capacitor/android` (`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java`, método `injectSafeAreaCSS()`). No es código de Core C12.
- **Causa:** el plugin registra un `OnApplyWindowInsetsListener` sobre la decor view, desacoplado del ciclo de vida de la página web. En el arranque, se dispara en el mismo instante en que el WebView está navegando a `https://localhost/`, momento en el que `document.documentElement` puede ser transitoriamente `null` — una carrera entre el sistema nativo de insets y la carga del documento, capturada por el propio `try/catch` del plugin (nunca fue un cierre inesperado).
- **Observado en una consulta posterior:** conectando al WebView real vía su socket DevTools en la tablet, en un momento posterior al arranque, `document.documentElement` mostraba `style="--safe-area-inset-top: 0px; --safe-area-inset-right: 0px; --safe-area-inset-bottom: 0px; --safe-area-inset-left: 0px;"` — las variables estaban presentes en esa consulta. Esto confirma que se aplicaron en algún momento posterior al fallo inicial, pero no determina exactamente cuándo se recuperaron ni demuestra un mecanismo dedicado de reintento — no se instrumentó el momento exacto de la aplicación exitosa. El listener de insets sí se reinvoca ante cambios (rotación, teclado), y en el resto de la sesión de pruebas (ambas rotaciones, ciclo background/foreground) no volvió a registrarse el error en logcat.
- **Impacto observado:** ninguno — todas las capturas de ambas orientaciones muestran el layout correcto, sin contenido oculto tras barras o cutouts.

**No se declara esta incidencia como resuelta en todos los dispositivos.** Solo se observaron las variables presentes en una consulta posterior en el entorno de esta sesión (tablet API 36); no se ha comprobado en teléfono API 36 ni en API 24, ni en hardware con geometría de insets distinta (cutouts reales, plegables). Sin corrección aplicada — es código de una dependencia de terceros, sin efecto observable en los entornos probados.

---

# 7. BILLING: NO VALIDADO

Fuera de alcance de este documento validar Billing productivo (ver `ANDROID_BILLING_SPIKE.md`). Se registra aquí únicamente una corrección de precisión sobre el entorno tablet:

- `com.android.vending` en `Core_C12_Tablet_API36` es **Play Store real** (`Phonesky.apk`, `versionCode=84532130`, `targetSdk=35`) — no el stub `LicenseChecker.apk` que sí aparece en la imagen `google_apis` de API 24.
- El aviso `BillingClient: In-app billing API version 3 is not supported on this device` persiste igualmente, pero su causa confirmada en este entorno es otra: el propio proceso `Finsky` (Play Store) registra explícitamente `com.andaralab.corec12: No account found` — no hay ninguna cuenta de Google añadida en este AVD. No se investigaron ni modificaron flujos de compra.

---

# 8. API 24 — FALLO, VALIDACIÓN CON PROVEEDOR COMPATIBLE PENDIENTE

El shell nativo abre sin error (`am start -W`: `Status: ok`, sin `FATAL`/`AndroidRuntime`), pero la calculadora no llega a renderizarse funcionalmente.

**Causas identificadas, ambas confirmadas mediante el protocolo DevTools real del WebView (no supuestas):**

1. El bridge nativo de Capacitor (`native-bridge.js`, inyectado por `Bridge.java` antes de cualquier código de la app) falla al parsear: `SyntaxError: Unexpected token (` exacto en `const convertFormData = async (formData) => {` — sintaxis ES2017 (función flecha `async`) no soportada por el motor Chrome 53 de este WebView. Al fallar el parseo, todo el bloque `<script>` del bridge, incluyendo `window.Capacitor = {...}`, no se ejecuta.
2. De forma independiente, el bundle propio de la app (`<script type="module">`) nunca llega a solicitarse por red (`performance.getEntriesByType('resource')` no lo incluye) — Chrome 53 es anterior al soporte nativo de módulos ES (Chrome 61+) y descarta la etiqueta sin ejecutarla.

**Vía de actualización del proveedor de WebView, verificada contra el catálogo público de Google:** no existe combinación `arm64-v8a` + `google_apis_playstore` para API 24 — Google solo publica esa variante como `x86` en API 24 (no ejecutable en este Mac Apple Silicon), y la primera API con imagen Play Store en `arm64-v8a` es la **28**. Sideload manual de un WebView APK queda descartado por el momento: `com.google.android.webview` ya está instalado como app de sistema y Android bloquea su actualización salvo firma coincidente, sin una fuente verificada disponible.

**Estado:** validación de API 24 con un proveedor de WebView compatible **pendiente**, sin resolver en esta ronda de QA.

Evidencia local: `assets/app-icon/android/previews/qa-api24/` (`calculadora_rota_api24.png`, `logcat_api24.txt`).

---

# 9. EVIDENCIAS LOCALES (no versionadas en Git)

Todas las capturas, vídeos y logs de esta y anteriores rondas de QA están en disco, fuera de seguimiento de Git por decisión explícita (`assets/app-icon/android/previews/` no se añade nunca a los commits):

- `assets/app-icon/android/previews/qa-api36/` — icono, splash, día/noche (teléfono)
- `assets/app-icon/android/previews/qa-api36-bars/` — investigación inicial de contraste de barras
- `assets/app-icon/android/previews/qa-api36-systembars/` — causa raíz y fix de `SystemBars.style=DARK`
- `assets/app-icon/android/previews/qa-api36-orientation/` — investigación de orientación en teléfono
- `assets/app-icon/android/previews/qa-tablet-api36/` — QA de tablet de esta ronda (sección 5)
- `assets/app-icon/android/previews/qa-api24/` — fallo de API 24 (sección 8)

Ruta absoluta base (equipo que ejecutó este QA): `/Volumes/WORKSPACE/01_PROYECTOS/APP_WEB/Core_C12/assets/app-icon/android/previews/`.

---

# 10. PENDIENTES

- **Dispositivo físico:** ningún teléfono ni tablet Android físico disponible en este entorno — todo el QA de este documento es sobre emulador.
- **Plegable:** sin AVD ni dispositivo plegable probado — el comportamiento de la política de orientación ante un cambio de `smallestScreenWidthDp` en tiempo real (plegado/desplegado) no se ha ejercitado.
- **Multiventana:** sin probar — `configChanges` incluye `screenSize`/`screenLayout`, pero no se ha verificado el comportamiento real en modo multiventana o pantalla dividida.
- **Otras versiones de Android:** API 24 con fallo pendiente de proveedor de WebView (sección 8); API 25–35 sin probar en ninguna ronda de QA.
- Pendientes ya registrados en `ANDROID_BILLING_SPIKE.md` y `SESSION_HANDOFF_ANDROID.md` (Billing de tienda, firma de release, validación iOS nativa) permanecen sin cambios y no se repiten aquí.

---

# 11. CONCLUSIÓN

El branding Android (icono, splash, contraste de barras) y la política de orientación teléfono/tablet del commit `0892f3a` quedan **aprobados en emulador API 36**, tanto en teléfono (`medium_phone`) como en tablet (`Core_C12_Tablet_API36`, `sw800dp`), con evidencia objetiva por verificación (no visual únicamente) en cada punto: orientación solicitada leída de `ActivityTaskManager`, `smallestScreenWidthDp` leído de `Configuration` real, y estado de UI confirmado por captura tras cada interacción. La incidencia de safe-area CSS queda documentada como no bloqueante, con las variables observadas presentes en una consulta posterior (sin determinar el momento exacto de recuperación ni un mecanismo de reintento confirmado), sin declararse resuelta fuera del entorno donde se comprobó. API 24 queda con un fallo real y acotado (incompatibilidad de motor JS, no del shell nativo), sin una vía de actualización verificada y aplicada en esta sesión, y sin corregir por instrucción explícita de esta ronda.
