# STACK_MASTER — CORE C12

**Producto:** Core C12  
**Marca / autoría:** AndaraLab  
**Firma visible obligatoria:** “Desarrollado por AndaraLab”  
**Identificador técnico:** `com.andaralab.corec12`  
**Estado:** APROBADO  
**Versión del documento:** 1.0  
**Fecha:** 12/09/2026  

---

# 1. PROPÓSITO

Este documento constituye la fuente oficial de verdad técnica para la evolución de Core C12 desde su actual aplicación web hacia un producto multiplataforma distribuible como:

- Web
- PWA
- iPhone
- iPad
- Android
- Apple App Store
- Google Play Store

Toda implementación posterior deberá respetar las decisiones aquí documentadas.

Claude Code, Antigravity o cualquier otro agente técnico no podrán redefinir el stack, introducir frameworks alternativos ni modificar decisiones arquitectónicas aprobadas sin autorización expresa.

---

# 2. PRINCIPIOS RECTORES

La arquitectura de Core C12 deberá optimizar simultáneamente:

1. máxima reutilización del producto web existente
2. mínima duplicación de código
3. funcionamiento offline
4. alta fiabilidad
5. precisión matemática
6. experiencia móvil profesional
7. velocidad de interacción
8. facilidad de mantenimiento
9. bajo coste operativo
10. simplicidad arquitectónica
11. publicación profesional en marketplaces
12. privacidad por diseño

Regla principal:

> No introducir complejidad técnica que no aporte valor real al usuario de Core C12.

---

# 3. SITUACIÓN TÉCNICA DE PARTIDA

La auditoría inicial confirmó que Core C12 es actualmente una aplicación:

- HTML5
- CSS3
- JavaScript Vanilla
- sin framework frontend
- sin TypeScript
- sin bundler
- sin package manager
- sin backend
- sin base de datos
- sin autenticación
- sin servicios cloud requeridos
- sin analytics
- sin tracking

Componentes principales detectados:

- `index.html`
- `styles.css`
- `calc.js`
- `config.js`
- `manifest.webmanifest`
- `service-worker.js`

La aplicación dispone de una PWA funcional y funcionamiento offline.

Existe una suite inicial de:

**116 tests**

que constituye el baseline funcional obligatorio de la migración.

---

# 4. DECISIÓN ARQUITECTÓNICA PRINCIPAL

## APROBADO

Core C12 utilizará:

**Capacitor 8.x**

como capa multiplataforma nativa para:

- iOS
- iPadOS
- Android

manteniendo:

**HTML + CSS + JavaScript**

como base principal del producto.

Arquitectura:

Core C12 Web
→ Vite
→ `dist/`
→ Capacitor
→ iOS / Android

---

# 5. TECNOLOGÍAS DESCARTADAS PARA V1

## React Native + Expo

**DESCARTADO V1**

Motivo:

La reconstrucción de la UI existente no aporta un beneficio proporcional al coste y riesgo de reescritura.

---

## Flutter

**DESCARTADO V1**

Motivo:

Obligaría a sustituir la implementación HTML/CSS/JavaScript por Dart + Flutter y reduciría significativamente la reutilización del producto actual.

---

## Desarrollo nativo independiente

Swift/SwiftUI + Kotlin/Compose:

**DESCARTADO V1**

Motivo:

Generaría tres implementaciones independientes:

- Web
- iOS
- Android

con duplicación de lógica, QA y mantenimiento.

---

## PWA como única solución móvil

**DESCARTADA COMO SOLUCIÓN ÚNICA**

La PWA continuará existiendo como canal Web, pero no sustituye los requisitos de publicación en:

- App Store
- Google Play

---

# 6. STACK OFICIAL

## Frontend

- HTML5
- CSS3
- JavaScript Vanilla
- sin framework frontend

### No utilizar V1

- React
- Vue
- Angular
- Svelte
- TypeScript

salvo futura decisión arquitectónica aprobada.

---

# 7. RUNTIME

## Node.js

**Node.js 24 LTS**

Estado:

**APROBADO**

No utilizar Node Current como runtime principal del proyecto.

El repositorio deberá declarar la versión mediante:

- `.nvmrc`
- `package.json`

---

# 8. GESTOR DE PAQUETES

## npm

**APROBADO**

Será el único gestor de paquetes oficial.

No utilizar:

- Yarn
- pnpm
- Bun

en V1.

---

# 9. GESTIÓN LOCAL DE NODE

## nvm

**APROBADO**

Se utilizará para gestionar las versiones de Node en el entorno local.

Objetivo:

Mac
→ nvm
→ Node 24 LTS
→ npm
→ Core C12

---

# 10. BUILD SYSTEM

## Vite 8.x

**APROBADO**

Core C12 utilizará Vite como:

- servidor de desarrollo
- sistema de build
- herramienta de preview
- generador del artefacto de producción

Salida oficial:

`dist/`

---

# 11. ARTEFACTO ÚNICO

`dist/` será el único artefacto web generado.

Será utilizado por:

- Web
- PWA
- Capacitor iOS
- Capacitor Android

Arquitectura:

SOURCE
→ Vite
→ `dist/`
→ Web / Capacitor

---

# 12. REGLA DE `dist/`

`dist/` es un artefacto generado.

## PROHIBIDO

- editar manualmente archivos en `dist/`
- corregir HTML compilado
- modificar CSS compilado
- modificar JS compilado
- introducir funcionalidades directamente

Todo cambio deberá seguir:

SOURCE
→ BUILD
→ DIST

`dist/` no será fuente de verdad.

---

# 13. ESTRUCTURA OBJETIVO DEL REPOSITORIO

Estructura conceptual:

Core_C12/
│
├── index.html
├── package.json
├── package-lock.json
├── .nvmrc
├── vite.config.js
├── capacitor.config.*
│
├── src/
│   ├── core/
│   ├── state/
│   ├── storage/
│   ├── platform/
│   ├── ui/
│   └── styles.css
│
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   ├── assets/
│   └── recursos estáticos
│
├── tests/
├── e2e/
│
├── dist/
│
├── ios/
├── android/
│
└── documentación/

---

# 14. CONTROL DE VERSIONADO DEL REPOSITORIO

## Versionar

- `package.json`
- `package-lock.json`
- `.nvmrc`
- configuraciones Vite
- configuraciones Capacitor
- `src/`
- `public/`
- `tests/`
- `e2e/`
- `ios/`
- `android/`

## No versionar

- `node_modules/`
- `dist/`
- `.vite/`
- artefactos temporales

---

# 15. ARQUITECTURA DE FUENTE ÚNICA

Core C12 tendrá una única fuente funcional.

Web, iPhone, iPad y Android NO tendrán implementaciones diferentes de la calculadora.

Arquitectura:

FUENTE ÚNICA
HTML + CSS + JavaScript
        ↓
      Vite
        ↓
      dist/
     /     \
   Web    Capacitor
           /     \
         iOS    Android

---

# 16. CAPAS INTERNAS

Core C12 se organizará conceptualmente en:

1. CORE
2. STATE
3. STORAGE
4. PLATFORM
5. UI

---

# 17. CORE

Responsabilidad:

- operaciones básicas
- porcentaje
- IVA
- márgenes
- reglas matemáticas
- precisión
- comportamiento funcional matemático

## PROHIBIDO EN CORE

El core no podrá utilizar:

- `document`
- `window`
- DOM
- Capacitor
- Haptics
- `localStorage`
- APIs iOS
- APIs Android

El core deberá ser completamente independiente de plataforma.

---

# 18. STATE

Responsabilidad:

- valor numérico interno
- operandos
- operador activo
- operaciones encadenadas
- C
- AC
- cambio de signo
- modo IVA
- modo margen
- estado de edición
- resultado interno
- decimales seleccionados

Implementación:

**Vanilla JavaScript**

No utilizar:

- Redux
- Zustand
- RxJS
- frameworks de estado

---

# 19. STORAGE

Responsabilidad:

- cargar preferencias
- validar preferencias
- guardar preferencias
- restaurar defaults ante fallo

Persistencia V1:

**localStorage**

No utilizar V1:

- SQLite
- IndexedDB como requisito
- Firebase
- Supabase
- almacenamiento cloud

---

# 20. PLATFORM

Responsabilidad:

Aislar capacidades específicas del dispositivo.

V1 comenzará con:

## Haptics

Plugin oficial:

`@capacitor/haptics`

La lógica matemática nunca deberá depender de esta capa.

---

# 21. UI

Responsabilidad:

- eventos de usuario
- botones
- touch
- actualización del display
- clases visuales
- tasas visibles
- márgenes visibles
- interacción
- coordinación con estado
- solicitud de háptica

## PROHIBIDO

La UI no implementará directamente fórmulas de:

- IVA
- margen
- porcentaje
- operaciones matemáticas

---

# 22. DIRECCIÓN DE DEPENDENCIAS

Arquitectura:

UI
│
├── STATE
│     └── CORE
│
├── STORAGE
│
└── PLATFORM

Reglas:

- `core` no depende de ninguna capa
- `state` puede depender de `core`
- `storage` no realiza lógica matemática
- `platform` no realiza lógica matemática
- `ui` coordina pero no duplica reglas comerciales

Las dependencias no podrán invertirse.

---

# 23. CONTRATO MATEMÁTICO

## Representación

Core C12 V1 continuará utilizando:

**JavaScript `Number`**

No se incorporará inicialmente:

- decimal.js
- big.js
- otra librería decimal

---

# 24. VALOR INTERNO VS DISPLAY

Regla crítica:

> El display nunca será la fuente de verdad matemática.

Arquitectura:

VALOR INTERNO
→ cálculo
→ formateo
→ DISPLAY

Ejemplo:

Valor interno:

12.3456789

Display con 2 decimales:

12,35

El siguiente cálculo utilizará:

12.3456789

y NO:

12.35

---

# 25. DECIMALES

Opciones:

- 1
- 2
- 3
- 4

Afectan exclusivamente:

**visualización**

Nunca deberán modificar:

- valor interno
- precisión interna
- cálculos posteriores

---

# 26. FÓRMULAS BASELINE

Durante la migración arquitectónica las fórmulas actuales permanecerán congeladas.

## IVA

Añadir IVA:

base × (1 + tasa)

Retirar IVA:

total ÷ (1 + tasa)

---

## Margen

Precio de venta:

costo ÷ (1 - margen)

Operación inversa:

precio × (1 - margen)

---

# 27. POLÍTICA DE CAMBIOS MATEMÁTICOS

Durante la migración:

**PROHIBIDO modificar fórmulas o política de redondeo sin aprobación expresa.**

Primero:

- migrar
- conseguir paridad
- validar tests

Después podrá realizarse una auditoría matemática independiente.

---

# 28. CAPACITOR

Versión:

**Capacitor 8.x**

Paquetes base:

- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/ios`
- `@capacitor/android`

Configuración:

`webDir = dist`

---

# 29. POLÍTICA DE PLUGINS

No instalar plugins Capacitor sin necesidad funcional aprobada.

V1 incorpora:

`@capacitor/haptics`

Otros plugins:

**NO instalar inicialmente.**

---

# 30. HÁPTICA

Estado:

**OBLIGATORIA V1**

Objetivo:

Generar feedback físico al pulsar teclas y reforzar la sensación de calculadora profesional.

Principio:

La háptica será un efecto secundario.

Nunca podrá:

- retrasar cálculo
- bloquear UI
- impedir operaciones
- provocar fallo de la calculadora

Si Haptics falla:

Core C12 continúa funcionando.

---

# 31. POLÍTICA HÁPTICA INICIAL

Conceptualmente:

- dígitos → ligero
- decimal → ligero
- operaciones → ligero/medio
- IVA → ligero/medio
- margen → ligero/medio
- `=` → medio
- acciones relevantes → medio
- error funcional real → feedback de error

La calibración definitiva deberá realizarse sobre hardware físico.

Estado exacto de intensidades:

**PENDIENTE DE QA UX**

---

# 32. iOS / iPadOS

Stack aprobado:

- Xcode 26.x estable
- SDK iOS/iPadOS 26+
- Deployment Target mínimo: iOS/iPadOS 15
- WKWebView
- Swift Package Manager

CocoaPods:

**NO instalar inicialmente**

Solo se utilizará si una futura dependencia lo requiere.

---

# 33. ANDROID

Stack aprobado:

- Android Studio estable
- Android SDK
- `compileSdk 36`
- `targetSdk 36`
- `minSdk 24`
- Android Emulator
- JDK gestionado por Android Studio
- Gradle gestionado por el proyecto Capacitor

Artefacto de producción:

**Android App Bundle `.aab`**

---

# 34. SWIFT Y KOTLIN

Swift y Kotlin NO serán lenguajes principales de desarrollo de Core C12.

Solo se utilizarán cuando:

- una integración nativa específica lo requiera
- exista justificación técnica
- la decisión haya sido aprobada

No duplicarán lógica comercial.

---

# 35. SHELL NATIVO

Los proyectos:

- `ios/`
- `android/`

serán shells mínimos.

Gestionarán:

- arranque
- WebView
- firma
- iconos
- launch screen
- orientación
- safe areas
- system bars
- Haptics
- configuración de plataforma
- permisos aprobados

No contendrán:

- fórmulas comerciales
- segunda implementación de calculadora
- estado comercial duplicado
- segunda UI

---

# 36. CONTENIDO MOBILE

Las aplicaciones móviles cargarán:

**`dist/` local empaquetado**

No cargarán la web pública de Netlify como interfaz principal.

Arquitectura:

App instalada
→ assets locales
→ Core C12

Esto garantiza funcionamiento offline desde la instalación.

---

# 37. ORIENTACIÓN

Core C12 soportará:

- landscape
- portrait

Landscape:

**experiencia prioritaria**

Portrait:

**funcional y soportada**

No bloquear exclusivamente landscape.

---

# 38. SAFE AREAS

Obligatorio respetar:

- notch
- Dynamic Island
- home indicator
- status bar
- Android system bars
- cutouts
- tablets
- diferentes relaciones de pantalla

---

# 39. MODO INMERSIVO

Ocultar completamente barras del sistema:

**PENDIENTE DE VALIDACIÓN UX**

No activar automáticamente.

Debe probarse físicamente antes de decidir.

---

# 40. LAUNCH SCREEN

Obligatorio.

Debe ser:

- rápido
- limpio
- coherente con Core C12
- sin publicidad
- sin animaciones pesadas
- sin retardos artificiales

Objetivo:

cubrir únicamente la inicialización de la aplicación.

---

# 41. PWA

La PWA se mantiene como canal oficial Web.

Estado:

**OBLIGATORIA**

Debe conservar:

- instalación
- manifest
- iconos
- standalone
- offline

---

# 42. SERVICE WORKER

El Service Worker manual actual será sustituido controladamente.

Nueva estrategia:

- Vite PWA
- Workbox
- `generateSW`

Objetivo:

precache automático basado en el `dist/` real.

---

# 43. OFFLINE WEB

Web/PWA:

offline mediante:

**Service Worker + Workbox**

---

# 44. OFFLINE MOBILE

iOS/Android:

offline mediante:

**assets empaquetados localmente por Capacitor**

La versión móvil NO dependerá del Service Worker para funcionar.

---

# 45. ACTUALIZACIONES

## Web

Nuevo build Vite:

→ nuevo `dist/`
→ despliegue Web/PWA

## iOS

build
→ App Store Connect
→ TestFlight
→ App Store

## Android

build
→ `.aab`
→ Play Console
→ testing
→ Google Play

No utilizar actualizaciones remotas de código para evitar los marketplaces.

---

# 46. PRIVACIDAD

Core C12 V1 será:

**privacy-first**

No incorporará:

- cuentas
- login
- tracking
- publicidad
- analytics
- backend
- sincronización cloud
- datos personales
- SDK publicitarios

---

# 47. DATOS

Las únicas persistencias previstas serán preferencias funcionales locales:

- tasas
- márgenes
- decimales
- otras preferencias aprobadas

No serán transmitidas a AndaraLab.

---

# 48. PERMISOS

Core C12 V1 no solicitará innecesariamente:

- cámara
- micrófono
- ubicación
- contactos
- fotografías
- archivos
- Bluetooth
- calendario
- notificaciones

Todo permiso futuro requerirá aprobación funcional previa.

---

# 49. SECRETOS

PROHIBIDO incluir en frontend:

- passwords
- tokens privados
- claves API secretas
- private keys
- credenciales

Todo contenido de `dist/` se considerará inspeccionable públicamente.

---

# 50. CONFIGURACIÓN DEL PRODUCTO

Separar:

## Product Config

Incluye:

- tasas oficiales por defecto
- márgenes por defecto
- decimales por defecto
- reglas
- límites

Será versionada mediante Git.

---

# 51. PREFERENCIAS

Incluyen valores modificados por el usuario.

Persistencia:

`localStorage`

Si son inválidas:

→ descartar
→ usar defaults
→ continuar funcionando

---

# 52. CONFIGURACIÓN TÉCNICA

Separada de negocio.

Ejemplos:

- `vite.config.js`
- `capacitor.config.*`
- `package.json`

Nunca almacenar aquí estado comercial del usuario.

---

# 53. VARIABLES DE ENTORNO

V1:

**NO necesarias**

No introducir `.env` simplemente porque Vite lo permita.

Si posteriormente aparece una necesidad real:

→ revisar arquitectura
→ aprobar
→ implementar

---

# 54. CONFIGURACIÓN REMOTA

No utilizar V1:

- Firebase Remote Config
- remote feature flags
- tasas descargadas remotamente
- configuración cloud

Core C12 debe seguir siendo autónomo.

---

# 55. RESILIENCIA

Core C12 utilizará arquitectura:

**fail-safe**

Prioridades:

1. cálculo
2. display
3. entrada de usuario
4. preferencias
5. capacidades secundarias

---

# 56. ERRORES MATEMÁTICOS

Casos inválidos deberán convertirse en estados controlados.

Nunca deberán generar:

- bloqueo de app
- error JS visible
- stack trace al usuario

---

# 57. FALLOS DE STORAGE

Si almacenamiento:

- falla
- está corrupto
- tiene formato inválido
- no puede leerse

Core C12 deberá:

→ utilizar defaults
→ seguir operativo

---

# 58. FALLOS DE PLATAFORMA

Ejemplo Haptics:

falla
→ ignorar
→ cálculo continúa

Las capacidades secundarias nunca podrán inutilizar la calculadora.

---

# 59. ARRANQUE

Secuencia:

cargar aplicación
→ leer preferencias
→ validar
→ defaults si falla
→ inicializar estado
→ render
→ lista para calcular

No depender de:

- API
- autenticación
- servidor
- sincronización
- configuración remota

---

# 60. LOGGING

Desarrollo:

**permitido**

Producción:

**mínimo**

No incluir inicialmente:

- plataforma externa de logs
- crash reporting externo

---

# 61. TESTING UNITARIO / CORE

Runner oficial:

**`node:test`**

Los 116 tests existentes constituyen:

**baseline obligatorio**

Durante la migración:

**116/116 deben continuar pasando.**

---

# 62. POLÍTICA DE TESTS

Un test existente no se modificará automáticamente para hacer pasar una regresión.

Ante fallo:

1. identificar causa
2. revisar especificación
3. corregir implementación
4. modificar test únicamente si existe cambio funcional aprobado

---

# 63. E2E

Herramienta:

**Playwright**

Cobertura:

- Chromium
- WebKit
- Firefox
- mobile emulation
- tablet emulation

---

# 64. E2E FUNCIONAL

Cubrir al menos:

- entrada numérica
- operaciones
- porcentaje
- cambio de signo
- C
- AC
- =
- +IVA
- -IVA
- +Margen
- -Margen
- decimales
- edición de tasas
- persistencia
- reload
- portrait
- landscape
- offline PWA

---

# 65. QA iOS

Obligatorio:

- Xcode Simulator
- iPhone físico
- iPad Simulator
- iPad físico cuando sea razonablemente posible antes de releases relevantes

Validar:

- touch
- safe areas
- orientación
- offline
- rendimiento
- háptica
- launch
- persistencia

---

# 66. QA ANDROID

Obligatorio:

- Android Emulator
- dispositivo Android físico antes de producción

Validar:

- touch
- WebView
- safe areas/system bars
- orientación
- offline
- háptica
- rendimiento
- persistencia

---

# 67. HÁPTICA Y QA

La háptica deberá validarse obligatoriamente en hardware físico.

No considerar simuladores suficientes para aprobarla.

---

# 68. PIRÁMIDE DE TESTING

QA físico
↑
Native Smoke QA
↑
Playwright E2E
↑
node:test / Core

La mayor cantidad de reglas matemáticas deberá probarse sin depender de navegador ni dispositivo.

---

# 69. GATE DE RELEASE

Un release no podrá aprobarse sin:

tests
+
build
+
E2E
+
PWA
+
iOS
+
Android
+
QA físico

---

# 70. VERSIONADO

Core C12 utilizará:

**Semantic Versioning**

Formato:

`MAJOR.MINOR.PATCH`

Ejemplos:

- `1.0.0`
- `1.1.0`
- `1.1.1`
- `2.0.0`

---

# 71. VERSIÓN MULTIPLATAFORMA

La misma versión funcional representará:

- Web
- iOS
- Android

Ejemplo:

Core C12 1.0.0
├── Web 1.0.0
├── iOS 1.0.0
└── Android 1.0.0

---

# 72. BUILD NUMBERS

Separados de la versión comercial.

iOS:

- Marketing Version: `1.0.0`
- Build Number: incremental

Android:

- `versionName`: `1.0.0`
- `versionCode`: incremental

---

# 73. GIT

Repositorio oficial:

**GitHub**

Rama estable:

**`main`**

No introducir Git Flow complejo en V1.

---

# 74. TAGS

Releases aprobados:

- `v1.0.0`
- `v1.1.0`
- `v1.1.1`

---

# 75. CI

Herramienta:

**GitHub Actions**

Responsabilidades:

- instalar dependencias
- ejecutar tests
- build
- Playwright E2E

Flujo conceptual:

npm ci
→ node tests
→ Vite build
→ Playwright
→ resultado CI

---

# 76. WEB HOSTING

Plataforma prevista:

**Netlify**

Estado:

**MANTENER, previa verificación de la configuración real actualmente existente.**

Flujo:

GitHub
→ main
→ Netlify
→ Vite build
→ `dist/`

---

# 77. RELEASE iOS V1

Proceso manual:

Core C12
→ build
→ Capacitor sync
→ Xcode
→ TestFlight
→ App Store

No automatizar publicación inicialmente.

---

# 78. RELEASE ANDROID V1

Proceso manual:

Core C12
→ build
→ Capacitor sync
→ Android Studio
→ AAB
→ Play testing
→ Google Play

No automatizar publicación inicialmente.

---

# 79. HERRAMIENTAS DESCARTADAS V1

No utilizar inicialmente:

- Jenkins
- Docker
- Kubernetes
- Fastlane
- servicios externos de CI de pago
- build cloud de pago
- publicación automática en stores

---

# 80. IDENTIDAD TÉCNICA

Producto:

**Core C12**

Repositorio:

`core-c12`

Identificador:

`com.andaralab.corec12`

Este identificador será utilizado por:

- Capacitor
- Bundle ID iOS
- Application ID Android

---

# 81. PERMANENCIA DEL IDENTIFICADOR

Una vez publicado:

`com.andaralab.corec12`

será considerado permanente.

No vincularlo a:

- versión
- fecha
- desarrollador individual

---

# 82. FIRMA DE MARCA

Nombre del producto:

**Core C12**

Firma:

**“Desarrollado por AndaraLab”**

No convertir AndaraLab en parte del naming de producto.

---

# 83. TOOLCHAIN LOCAL

Entorno principal:

- VS Code
- Claude Code

Runtime/toolchain:

- nvm
- Node 24 LTS
- npm
- Vite
- Playwright
- Capacitor

Nativo:

- Xcode
- Android Studio

---

# 84. ROL DE XCODE Y ANDROID STUDIO

No serán editores principales del producto.

Se utilizarán principalmente para:

- build nativo
- simuladores
- emuladores
- dispositivo físico
- firma
- configuración de plataforma
- distribución
- diagnóstico nativo

El desarrollo funcional principal seguirá ocurriendo sobre la fuente única.

---

# 85. POLÍTICA DE DEPENDENCIAS

Todas las dependencias JavaScript deberán ser locales al proyecto.

PROHIBIDO depender de instalaciones npm globales de:

- Vite
- Capacitor CLI
- Playwright
- plugins

---

# 86. `package-lock.json`

Debe mantenerse versionado.

No eliminarlo ni regenerarlo sin razón técnica.

Objetivo:

instalaciones reproducibles.

---

# 87. INSTALACIÓN

Desarrollo:

`npm install`

cuando sea necesario modificar dependencias.

CI / reproducción:

`npm ci`

---

# 88. UPGRADES

PROHIBIDO:

- actualizar indiscriminadamente
- cambiar major version sin aprobación
- ejecutar upgrades masivos sin QA

Proceso:

evaluar
→ actualizar
→ tests
→ build
→ QA
→ aprobar

---

# 89. SCRIPTS OFICIALES

El proyecto deberá disponer de comandos equivalentes a:

- desarrollo
- unit tests
- build
- preview
- E2E
- validación total
- Capacitor sync
- abrir iOS
- abrir Android

Ejemplos conceptuales:

`npm run dev`

`npm test`

`npm run build`

`npm run preview`

`npm run test:e2e`

`npm run test:all`

`npm run mobile:ios`

`npm run mobile:android`

Los nombres exactos deberán mantenerse simples y coherentes.

---

# 90. REGLA BUILD → SYNC

PROHIBIDO sincronizar Capacitor con un `dist/` obsoleto.

Flujo obligatorio:

SOURCE
→ TEST
→ BUILD
→ DIST
→ CAPACITOR SYNC

---

# 91. TEST:ALL

Debe existir un criterio único equivalente a:

“¿Core C12 está técnicamente sano?”

Debe incluir:

- unit tests
- build
- E2E

El mismo criterio deberá utilizarse:

- localmente
- por Claude Code
- en CI

---

# 92. SCRIPTS Y GIT

Los scripts del proyecto NO deberán:

- hacer commits automáticamente
- hacer push automáticamente
- publicar stores
- cambiar versión sin autorización
- instalar dependencias ocultamente

---

# 93. ENVIRONMENT READINESS GATE

Antes de iniciar la migración:

OBLIGATORIO verificar:

- Git limpio
- rama correcta
- baseline tests
- Node 24
- npm
- nvm
- toolchain web
- Xcode
- Android Studio

---

# 94. BASELINE ANTES DE CAMBIAR

Secuencia obligatoria:

Repositorio limpio
→ 116/116 tests
→ Web actual funcional
→ baseline registrado
→ iniciar migración

---

# 95. PLAN DE MIGRACIÓN

La migración deberá realizarse por etapas independientes.

PROHIBIDO realizar simultáneamente:

- Vite
- refactor core
- Capacitor
- nueva PWA
- cambios visuales
- cambios matemáticos

---

# 96. MIGRACIÓN — ETAPA 1

Introducir:

- Node/npm
- package.json
- `.nvmrc`
- Vite

Objetivo:

conseguir paridad completa con la aplicación actual.

No cambiar comportamiento.

---

# 97. MIGRACIÓN — ETAPA 2

Reorganizar:

- `src/`
- `public/`
- `dist/`

Objetivo:

estructura Source → Build.

Sin cambio funcional.

---

# 98. MIGRACIÓN — ETAPA 3

Migrar PWA a:

- Vite PWA
- Workbox
- `generateSW`

Objetivo:

preservar instalación y offline.

---

# 99. MIGRACIÓN — ETAPA 4

Extraer progresivamente:

**core matemático**

del actual `calc.js`.

Objetivo:

core independiente del DOM.

Todos los tests deben permanecer verdes.

---

# 100. MIGRACIÓN — ETAPA 5

Separar:

**state**

de:

**UI / DOM**

Objetivo:

máquina de estado independiente del render.

---

# 101. MIGRACIÓN — ETAPA 6

Crear:

`platform/haptics`

e integrar:

`@capacitor/haptics`

Sin introducir llamadas nativas dentro del core.

---

# 102. MIGRACIÓN — ETAPA 7

Inicializar:

**Capacitor 8**

Configurar:

`webDir = dist`

Añadir:

- iOS
- Android

---

# 103. MIGRACIÓN — ETAPA 8

Validar primero:

- iOS/iPadOS

y posteriormente:

- Android

Sin duplicar lógica.

---

# 104. MIGRACIÓN — ETAPA 9

Completar:

- Playwright
- QA físico
- GitHub Actions
- release gates
- preparación stores

---

# 105. CHECKPOINTS

Cada etapa relevante de migración deberá disponer de un checkpoint claro en Git.

Objetivo:

rollback seguro.

---

# 106. COMMITS

Los commits deberán ser:

- pequeños
- identificables
- coherentes
- asociados preferentemente a una sola modificación conceptual

Evitar mega-commits que mezclen múltiples migraciones.

---

# 107. APP STORE

Antes de publicación:

- revisar requisitos oficiales vigentes
- construir con toolchain compatible
- validar privacidad
- completar metadata
- validar TestFlight
- QA físico

No asumir que requisitos técnicos históricos continúan vigentes.

---

# 108. GOOGLE PLAY

Antes de publicación:

- revisar requisitos oficiales vigentes
- target API vigente
- AAB
- testing requerido
- Data Safety
- política de privacidad
- QA físico

---

# 109. PRIVACY POLICY

Core C12 deberá disponer de una política de privacidad pública.

Mientras la arquitectura V1 permanezca sin recopilación:

deberá reflejar correctamente:

- sin cuentas
- sin tracking
- sin publicidad
- sin recopilación remota de datos personales

---

# 110. APP PRIVACY / DATA SAFETY

Obligatorio completar:

- Apple App Privacy
- Google Play Data Safety

según el comportamiento real de la versión publicada.

Nunca declarar menos recopilación de la que realmente realicen futuras dependencias.

---

# 111. COSTE OPERATIVO

Prioridad:

**mínimo coste recurrente**

Infraestructura V1 prevista:

- backend: €0
- base de datos: €0
- analytics: €0
- cloud sync: €0
- CI externo: €0 previsto

Costes de marketplace y cuentas se tratarán como costes de distribución.

---

# 112. GOVERNANCE

Claude Code no podrá:

- cambiar framework
- introducir React
- introducir TypeScript
- cambiar npm
- cambiar Node major
- modificar arquitectura
- instalar dependencias no aprobadas
- cambiar fórmulas
- cambiar sistema de estado
- sustituir Capacitor
- incorporar backend

sin una decisión previa aprobada.

---

# 113. REGLA ANTE DECISIÓN NO CONTEMPLADA

Si durante implementación aparece una necesidad arquitectónica no cubierta:

Claude deberá:

1. detener esa parte
2. documentar el problema
3. explicar opciones
4. no implementar una solución estructural unilateralmente
5. elevar la decisión a arquitectura

---

# 114. RESPONSABILIDADES

## ChatGPT

Responsable de:

- arquitectura
- especificaciones
- decisiones
- gobernanza
- QA conceptual
- validación de cambios estratégicos
- mantenimiento del STACK_MASTER

---

## Claude Code

Responsable de:

- implementación
- refactor controlado
- configuración técnica
- tests
- builds
- cambios de código autorizados

Debe trabajar bajo el STACK_MASTER.

---

## Xcode

Responsable de:

- target iOS/iPadOS
- simuladores
- firma
- dispositivo físico
- build
- TestFlight
- App Store

---

## Android Studio

Responsable de:

- Android target
- SDK
- emuladores
- Gradle
- dispositivo físico
- AAB
- Play testing
- Google Play

---

## GitHub

Responsable de:

- repositorio
- historial
- tags
- CI mediante Actions

---

## Netlify

Responsable de:

- hosting de la versión Web/PWA

previa validación de la configuración existente.

---

# 115. DECISIONES PENDIENTES

Las siguientes decisiones permanecen deliberadamente abiertas:

## P-01 — Cuenta Apple

Determinar:

- cuenta personal
- organización AndaraLab

---

## P-02 — Cuenta Google Play

Determinar:

- personal
- organización

---

## P-03 — System UI

Determinar mediante QA físico si Core C12 utilizará:

- barras de sistema visibles
- integración edge-to-edge
- modo inmersivo

---

## P-04 — Calibración háptica

Determinar en dispositivos físicos:

- intensidad
- diferenciación por botón
- frecuencia de feedback

La existencia de háptica V1 ya está APROBADA.

---

## P-05 — Dispositivo Android físico

Seleccionar dispositivo real para QA Android antes de producción.

---

# 116. DEFINITION OF DONE — MIGRACIÓN MOBILE

La migración técnica no se considerará completada hasta que:

- fuente única funcionando
- Vite operativo
- `dist/` reproducible
- PWA operativa
- offline Web operativo
- core separado
- state separado
- storage aislado
- Haptics integrado
- Capacitor operativo
- iOS funcionando
- iPad funcionando
- Android funcionando
- 116 tests baseline preservados o ampliados justificadamente
- Playwright funcionando
- CI funcionando
- QA físico iOS aprobado
- QA físico Android aprobado
- privacidad documentada
- versión definida
- App Store preparada
- Google Play preparado

---

# 117. REGLA FINAL

La arquitectura de Core C12 deberá mantenerse siempre orientada a:

> máxima reutilización  
> + máxima estabilidad  
> + excelente experiencia móvil  
> + funcionamiento offline  
> + publicación profesional  
> + mínimo mantenimiento  
> + mínimo coste razonable  
> + mínima complejidad técnica

Cualquier nueva decisión deberá demostrar que mejora al menos uno de estos objetivos sin deteriorar injustificadamente los demás.

---

# 118. ESTADO DEL STACK_MASTER

**STACK_MASTER — CORE C12 v1.0**

Estado:

**APROBADO**

Fecha:

**12/09/2026**

Este documento sustituye decisiones técnicas parciales previas cuando exista contradicción y será utilizado como referencia para generar las instrucciones de implementación de Claude Code.

FIN DEL DOCUMENTO