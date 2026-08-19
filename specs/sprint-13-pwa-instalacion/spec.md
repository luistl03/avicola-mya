# Sprint 13 — PWA e instalación

## Sprint Goal
La app se instala en el celular (Android con prompt nativo, iOS con tutorial
manual) y las tres pantallas operativas de campo (Mortalidad, Bitácora,
Recolección) abren sin señal — shell + catálogos ya en el dispositivo desde
el login. **No incluye escribir datos sin conexión** (eso es Sprint 14): si
el Operario intenta guardar un registro sin red en este sprint, la acción
falla explícito, igual que hoy.

## Contexto previo — greenfield casi total, primer sprint de infraestructura pura
A diferencia de Sprints 3-12 (todos CRUD de negocio sobre capas ya
existentes), este sprint no toca `services/`, `repositories/`, `actions/` ni
`lib/zod/` de ningún módulo de negocio — es 100% infraestructura de
frontend + una corrección de un guard ya existente. Confirmado leyendo el
repo real antes de planificar:
- **`prisma/schema.prisma`: sin cambios este sprint.** No hay ningún modelo
  nuevo que agregar para manifest/Service Worker/caché — `PushSubscription`
  ya existe desde Sprint 0 pero es de Sprint 16 (Web Push), no de este
  sprint. Confirmado, no asumido.
- **`public/`** tiene `avicolamya-imagotipo.png`/`avicolamya-isotipo.png`
  (el logo real, ya usado en `Sidebar`/`/login`) pero **cero** iconos
  maskable, **cero** `manifest`, **cero** Service Worker — greenfield
  completo.
- **`package.json`**: ninguna dependencia de PWA instalada (ni `next-pwa`,
  ni `serwist`, ni `Dexie` — ese último es Sprint 14).
- **`src/proxy.ts` (Sprint 1, matcher ajustado en Sprint 2)**: el matcher
  actual excluye `_next/static`, `_next/image` y extensiones de imagen
  (`png|jpg|jpeg|gif|webp|svg|ico`) — **no excluye `.webmanifest` ni una
  ruta sin extensión como `/serwist/*`**. Sin corregirlo, el manifest y el
  Service Worker quedarían interceptados por el guard de sesión y
  redirigidos a `/login` en vez de servirse — el mismo tipo de bug real que
  bloqueó el logo en Sprint 2 (ver `memory/estado-proyecto.md`, "Otras
  notas de Next 16" / problema #4 de Sprint 1). Ver H5 y `plan.md`.

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md`, `memory/arquitectura.md`,
`memory/modelo-datos.md` (confirmado: sin cambios este sprint),
`memory/convenciones.md` (en particular "Contrato Offline-Ready" — Mortalidad,
Recolección, Bitácora y Galpón ya lo cumplen del lado de datos; este sprint
es el primero que lo aprovecha del lado de Service Worker/caché),
`memory/decisiones-tecnicas.md` (D1-D6, ninguna cierra la librería PWA — ver
D7 nueva más abajo), `memory/definition-of-ready.md`,
`memory/estado-proyecto.md` completo (en particular la nota de cierre de
Sprint 12: "releer decisiones-tecnicas.md... cualquier supuesto de
conectividad que los módulos de gestión hayan asumido sin pensar en modo
offline" — confirmado: ningún módulo de gestión escribe fuera de línea
todavía, ese supuesto de "siempre hay red" sigue vigente para todo lo que no
sea Mortalidad/Recolección/Bitácora, y sigue vigente incluso para esas tres
en cuanto a *escribir* — solo cambia la capacidad de *abrir la pantalla*),
`specs/roadmap-completo.md` (Sprint 13 y Sprint 14, para no invadir su
alcance), `specs/sprint-12-egresos-personal/` completo (formato de
referencia). También se releyó el código real de `src/proxy.ts`,
`src/app/layout.tsx` (dónde vive hoy `IdleTimer`, mismo lugar donde van los
componentes nuevos de este sprint), `src/components/layout/sidebar.tsx`
(footer del Sidebar, donde vive el indicador de conectividad),
`src/lib/constants.ts`, `package.json`, y el contenido real de `public/`.

## Investigación técnica real hecha antes de elegir librería (no asumida)
- **`next-pwa` es incompatible con Turbopack** (confirmado vía búsqueda
  externa, no solo memoria del modelo): es un plugin de Webpack puro, no
  tiene ruta de integración con Turbopack. Next 16.2.12 usa Turbopack
  estable por defecto para `dev` y `build` (fijado en Sprint 0) — forzar
  `next-pwa` implicaría volver a Webpack solo para el build de producción
  (`next build --webpack`), reintroduciendo exactamente el problema que
  Sprint 0 evitó al aceptar Turbopack por defecto: un bundler distinto en
  dev vs. producción, con superficie real de bugs que solo aparecen en uno
  de los dos.
- **Serwist sí tiene soporte nativo de Turbopack** vía el paquete
  `@serwist/turbopack` (distinto de `@serwist/next`, que es la variante
  Webpack) — Serwist 9 backporteó soporte de Turbopack en diciembre 2025
  (confirmado por el propio mantenedor en el issue de seguimiento de
  Turbopack del repo de Serwist), paquete con publicaciones activas y
  recientes. Es la única opción real que no obliga a mezclar bundlers entre
  dev y build en este proyecto.

## D7 — Librería PWA: Serwist vía `@serwist/turbopack` ✅ NUEVA
**Decisión:** se usa **Serwist** (`serwist`, `@serwist/turbopack`,
`esbuild` como dependencia de build) en vez de `next-pwa`. Se agrega a
`memory/decisiones-tecnicas.md` como D7 durante S13-1 (no se sobreescribe
D1-D6, mismo criterio de "Historial de revisión" que ya usa ese archivo).
**Motivo:** `next-pwa` no soporta Turbopack; forzar su uso exigiría un
bundler distinto para `build` que para `dev`, contradiciendo la decisión ya
tomada en Sprint 0 de adoptar Turbopack estable. `@serwist/turbopack` es la
única librería de las dos candidatas originales (`stack-tecnologico.md`
decía "next-pwa o Serwist") con integración real y activa para Turbopack.
**Impacto:** `stack-tecnologico.md` se actualiza en S13-1, reemplazando
"next-pwa o Serwist" por "Serwist (`@serwist/turbopack`)".

## Decisiones de negocio y de arquitectura confirmadas por el Product Owner
Seis preguntas explícitas vía `AskUserQuestion` antes de cerrar esta spec —
el roadmap describe el alcance a alto nivel ("estrategias de caché",
"prompt de instalación", "indicador de conectividad") pero no resuelve
ninguno de los criterios concretos:

1. **Precarga al login: shell + las 3 pantallas de campo (Mortalidad,
   Bitácora, Recolección), nada de gestión.** Al hacer login, además del
   App Shell (JS/CSS/Sidebar), se calienta la caché con el HTML de esas
   tres pantallas — las únicas que ya cumplen el Contrato Offline-Ready del
   lado de datos (`convenciones.md`). Ninguna pantalla de gestión
   (Usuarios, Créditos, Egresos, Personal, Clientes, etc.) se precarga —
   siguen exigiendo red, tal cual hoy. Los catálogos que esas tres
   pantallas necesitan para sus `<Select>` (galpones activos, lotes
   activos) **no se precargan por separado**: como son Server Components,
   ya viajan embebidos en el HTML/RSC de la propia página — precachear la
   página los precachea a ellos también (ver "Cómo funciona la precarga"
   en `plan.md`).
2. **Caché por tipo de contenido, no una sola estrategia global:**
   - Assets estáticos (JS/CSS/fuentes/iconos, `_next/static/*`) →
     **CacheFirst**.
   - HTML de las 3 pantallas de campo (documento completo y navegación RSC
     interna, ver R1 más abajo) → **NetworkFirst** con fallback a caché.
   - Catálogos embebidos en esas páginas → cubiertos por la misma entrada
     NetworkFirst de la página (no hay endpoint separado que cachear con
     otra estrategia — ver decisión 1).
   - **Server Actions y cualquier mutación → siempre `NetworkOnly`**, nunca
     cacheadas. Si no hay red, la acción falla con el mismo error de red de
     siempre — la cola offline real que evitaría esa falla es Sprint 14,
     explícitamente fuera de alcance acá.
3. **Prompt de instalación Android: una vez, con botón manual de
   respaldo.** Aparece la primera vez que el navegador dispara
   `beforeinstallprompt` **después de loguearse** (mismo lugar que
   `IdleTimer`, dentro de la rama `usuario ? (...)` de `layout.tsx`). Si se
   cierra/rechaza, no vuelve a aparecer solo por 30 días
   (`localStorage`), pero queda un botón "Instalar app" fijo en el footer
   del Sidebar para que el Operario lo dispare cuando quiera, sin esperar
   30 días.
4. **Tutorial iOS: banner automático la primera vez, con acceso manual
   después.** Se detecta iOS Safari sin el modo standalone activo (la app
   no está instalada) tras el login — mismo criterio de "después de
   loguearse" que el prompt de Android, por consistencia (ver corolario
   más abajo) — y se muestra un banner/modal una vez con los 3 pasos
   ilustrados ("Compartir → Añadir a inicio"). Igual que en Android, queda
   un botón persistente "Cómo instalar" en el footer del Sidebar para
   volver a verlo.
5. **Indicador de conectividad: punto de estado en el footer del
   Sidebar**, junto al nombre/rol del usuario (mismo bloque que ya muestra
   `ROL_LABEL`). Verde = online, gris = sin señal — el punto está siempre
   presente; solo agrega el texto "Sin conexión" cuando está offline (no
   ocupa una franja de pantalla completa en el momento más crítico: un
   celular chico, en campo, con la menor distracción posible).
6. **Sin límite de tamaño de caché, expiración por tiempo.** Sin tope
   explícito de MB (el shell + 3 páginas + sus catálogos de esta granja
   pesan pocos MB — sin riesgo real de saturar el storage de un celular
   moderno). Cada entrada de *runtime caching* (no el precache del build)
   expira a las 24 horas (`maxAgeSeconds`, Serwist) — un Operario que no
   vuelve a loguearse en más de un día sigue teniendo la última versión
   cacheada disponible, pero no una versión arbitrariamente vieja de por
   vida.

**Corolario de diseño documentado acá, no preguntado de nuevo** (mismo
criterio que Sprint 3 con sus "corolarios de diseño"): el banner de iOS
(decisión 4) se activa "tras el login" por consistencia con el prompt de
Android (decisión 3), aunque la pregunta original no lo pedía
explícitamente para iOS — separar el criterio (uno antes del login, otro
después) habría sido una inconsistencia de UX sin ninguna razón de negocio
detrás.

## Historias de usuario

### H1 — Manifest, iconos maskable y Service Worker instalable (6 pts)
Como Operario quiero poder instalar la app en la pantalla de inicio de mi
celular Android, para abrirla como una app nativa sin pasar por el
navegador cada vez.

```gherkin
Dado que entro a la app por primera vez en Chrome Android, ya logueado
Cuando el navegador evalúa los criterios de instalabilidad (manifest válido,
  Service Worker registrado con un fetch handler, iconos 192x192 y 512x512
  presentes, al menos uno maskable)
Entonces Chrome dispara el evento beforeinstallprompt y la app queda
  marcada como instalable (confirmable en chrome://apps o el ícono nativo
  de instalación de la barra de direcciones)

Dado el evento beforeinstallprompt ya disponible
Cuando aparece el prompt propio de la app (ver H4 para el detalle de cuándo)
  y confirmo "Instalar"
Entonces la app se instala en la pantalla de inicio con el ícono real de
  Avícola M&A (no un ícono genérico de Chrome), abre en modo standalone
  (sin barra de direcciones) al tocarla

Dado que abro la app ya instalada
Cuando reviso la barra de estado/tema del dispositivo
Entonces el color de tema coincide con el naranja de marca (--primary),
  no el blanco/gris por defecto
```

### H2 — Tutorial de instalación para iOS (3 pts)
Como Operario con iPhone quiero que la app me explique cómo instalarla en
mi pantalla de inicio, porque Safari no ofrece un prompt automático como
Android.

```gherkin
Dado que entro a la app en Safari de iOS, ya logueado, sin tenerla instalada
  (fuera de modo standalone)
Cuando la app detecta iOS + Safari + no standalone
Entonces se muestra, una sola vez, un banner/modal con los 3 pasos
  ilustrados: tocar el ícono de Compartir, elegir "Añadir a inicio",
  confirmar el nombre

Dado que ya vi el banner una vez (o lo cerré)
Cuando vuelvo a entrar en otra sesión
Entonces el banner no reaparece solo, pero encuentro un botón "Cómo
  instalar" fijo en el footer del Sidebar para volver a verlo cuando quiera

Dado que la app ya está instalada (detectado vía
  navigator.standalone/display-mode: standalone)
Cuando entro de nuevo desde Safari
Entonces ni el banner automático ni el botón manual se muestran — no tiene
  sentido explicar cómo instalar algo que ya está instalado
```

### H3 — Shell offline: Mortalidad, Bitácora y Recolección abren sin señal (8 pts)
Como Operario quiero poder abrir las pantallas de Mortalidad, Bitácora y
Recolección aunque no tenga señal en el galpón, para no depender de la
cobertura del lugar exacto donde estoy parado.

```gherkin
Dado que ya hice login con señal al menos una vez (precarga disparada)
Cuando pierdo la señal por completo y abro directamente la URL de
  /mortalidad, /bitacora o /recoleccion
Entonces la pantalla carga desde caché — shell, formulario y los <Select>
  de galpón/lote ya poblados con los datos que tenían la última vez que
  hubo señal

Dado el mismo escenario sin señal
Cuando, estando ya dentro de la app (Sidebar visible), navego con un click
  del menú entre Mortalidad, Bitácora y Recolección (navegación interna
  RSC, no recarga completa del navegador)
Entonces las tres pantallas abren igual de bien que con una recarga
  completa — la navegación interna de Next también queda cubierta por la
  caché, no solo el documento HTML completo (ver R1)

Dado que intento guardar un registro de Mortalidad estando sin señal
Cuando envío el formulario
Entonces la Server Action falla con el error de red esperado (fetch
  failed) — ningún dato se pierde en silencio, pero tampoco se guarda
  localmente ni se encola: eso es explícitamente Sprint 14, no este sprint

Dado que navego sin señal a una pantalla que NO fue precargada
  (ej. /usuarios, /creditos, o cualquier pantalla de gestión)
Cuando la red falla y la página no está en caché
Entonces veo una pantalla de "sin conexión" genérica (no un error crudo del
  navegador), con un link de vuelta a las pantallas que sí funcionan sin
  señal
```

### H4 — Prompt de instalación en Android (3 pts)
(Ver decisión de negocio 3 para el criterio completo de frecuencia.)

```gherkin
Dado que hago login por primera vez con Chrome Android y
  beforeinstallprompt está disponible
Cuando el evento se dispara
Entonces veo el prompt propio de la app (no el mini-infobar nativo de
  Chrome, que se suprime a propósito con preventDefault()) con un botón
  "Instalar" y uno "Ahora no"

Dado que toco "Ahora no"
Cuando cierro y reabro la app en cualquier momento dentro de los próximos
  30 días
Entonces el prompt automático no vuelve a aparecer solo

Dado que pasaron los 30 días sin instalar
Cuando vuelvo a loguearme y el navegador todavía ofrece
  beforeinstallprompt (no se instaló mientras tanto)
Entonces el prompt automático puede volver a aparecer una vez más

Dado cualquier momento, con o sin haber rechazado antes
Cuando abro el footer del Sidebar
Entonces encuentro un botón "Instalar app" que dispara el mismo prompt
  nativo a demanda — visible solo si el navegador soporta instalación y la
  app todavía no está instalada, se oculta solo una vez instalada
```

### H5 — Indicador de conectividad en el Shell (2 pts)
(Ver decisión de negocio 5.)

```gherkin
Dado que tengo señal
Cuando miro el footer del Sidebar
Entonces veo un punto verde chico junto a mi nombre/rol, sin texto
  adicional

Dado que pierdo la señal
Cuando el navegador dispara el evento offline
Entonces el punto cambia a gris/rojo y aparece el texto "Sin conexión"
  junto a él, en tiempo real, sin recargar la página

Dado que estoy offline y recupero señal
Cuando el navegador dispara el evento online
Entonces el punto vuelve a verde y el texto desaparece, también sin
  recargar
```

### H6 — Corrección del guard de `proxy.ts` para assets PWA nuevos (2 pts)
Bug real encontrado durante la investigación de este sprint (ver "Contexto
previo" arriba) — prerequisito técnico de H1-H3, no una historia de negocio.

```gherkin
Dado que el manifest vive en /manifest.webmanifest y el Service Worker se
  sirve desde una ruta nueva (/serwist/... u otra según la integración
  final de @serwist/turbopack, ver plan.md)
Cuando un dispositivo SIN sesión (antes de loguearse, incluida la primera
  vez que Chrome evalúa instalabilidad desde /login) pide esas rutas
Entonces responden con el contenido real (manifest JSON / script del SW),
  nunca con un 302 a /login — mismo criterio que ya se corrigió para el
  logo en Sprint 1/2
```

## Alcance de este sprint
- **Sin migración de schema** — confirmado, `prisma/schema.prisma` no
  cambia.
- `memory/decisiones-tecnicas.md`: **D7 nueva** (Serwist/`@serwist/turbopack`).
- `memory/stack-tecnologico.md`: sección "Offline / PWA" actualizada.
- Dependencias nuevas: `serwist`, `@serwist/turbopack`, `esbuild` (dev),
  `sharp` (dev, generación de iconos — ver `plan.md`).
- `next.config.ts`: envuelto con `withSerwist`.
- `app/manifest.ts` (convención nativa de Next, no `public/manifest.json`
  estático) + `public/icons/` (iconos 192/512, maskable 192/512,
  `apple-touch-icon.png` 180x180).
- Service Worker: archivo fuente (`app/sw.ts` o equivalente según la guía
  final de `@serwist/turbopack`) + ruta de servicio (`app/serwist/[path]/route.ts`).
- `src/proxy.ts`: matcher corregido (H6).
- Componentes nuevos: `components/domain/pwa/connectivity-indicator.tsx`,
  `components/domain/pwa/install-prompt-android.tsx`,
  `components/domain/pwa/ios-install-banner.tsx`,
  `components/domain/pwa/precargar-catalogos.tsx` (dispara los `fetch` de
  precarga tras el login), montados desde `src/app/layout.tsx`.
- `components/layout/sidebar.tsx`: footer gana el indicador de
  conectividad + botón "Instalar app"/"Cómo instalar".
- `app/offline/page.tsx` (o equivalente): fallback genérico de navegación
  sin caché ni red.
- Sin Server Actions nuevas, sin Zod schemas nuevos, sin repositories
  nuevos — no hay ninguna mutación de negocio en este sprint (las
  preferencias de "ya vi el prompt"/"ya vi el banner" viven en
  `localStorage` del navegador, no en la base de datos).

## Fuera de alcance (explícitamente, para no invadir Sprint 14)
- **Cola de IndexedDB con Dexie.** Sprint 14 completo — este sprint no
  agrega ninguna dependencia de IndexedDB.
- **`POST /api/sync` batch idempotente.** No existe ningún endpoint de
  sincronización todavía — las Server Actions siguen siendo `NetworkOnly`,
  fallan sin red tal cual hoy.
- **Interceptar un fallo de red para encolar la operación.** Este sprint
  deja que la Server Action falle visible (mismo comportamiento actual) —
  no hay ningún intento de capturar ese fallo y guardarlo para reintentar
  después.
- **Resolución de conflictos, ventana de gracia offline
  (`creadoEnCliente` vs. `creadoEn`), pantalla de "pendientes de
  sincronizar".** Todo Sprint 14.
- **Precarga de ninguna pantalla de gestión** (Usuarios, Galpones, Lotes,
  Clientes, Precio por Kilo, POS, Ventas, Créditos, Egresos, Personal) —
  decisión de negocio 1, ninguna de esas entra al precache de este sprint.
- **Web Push / `PushSubscription`.** Sprint 16 — el modelo ya existe en el
  schema desde Sprint 0 pero este sprint no lo toca ni instala
  dependencias de Web Push (VAPID).
- **Actualización automática silenciosa del Service Worker sin avisar al
  usuario** (`skipWaiting` agresivo sin ningún aviso) — fuera de alcance
  explícito; el comportamiento de actualización se deja en el default
  razonable de Serwist (activación en el próximo `reload`, sin banner de
  "hay una versión nueva, actualizá" — esa UX es una historia nueva a
  evaluar, no contemplada acá).

## Qué hereda Sprint 14 de este sprint (para no repetirlo ahí)
- El Service Worker y su registro (`app/sw.ts`, ruta `/serwist/...`)
  **ya van a existir** — Sprint 14 no arranca de cero, agrega el
  `fetch handler` que detecta un fallo de red en una mutación y la deriva
  a la cola de Dexie, en vez de dejarla fallar (que es lo único que hace
  este sprint).
- El Contrato Offline-Ready (`convenciones.md`) ya está aplicado en
  Mortalidad/Recolección/Bitácora desde Sprint 5 — Sprint 14 no necesita
  tocar ningún schema ni Server Action de esos tres módulos para agregar
  la cola, solo la capa de transporte (interceptor + IndexedDB + sync).
- El indicador de conectividad (H5) ya existe — Sprint 14 puede
  reusarlo/extenderlo para mostrar también "N pendientes de sincronizar",
  sin construir el punto verde/gris de nuevo.
- La corrección de `proxy.ts` (H6) ya cubre cualquier ruta nueva de
  Service Worker — Sprint 14 no debería necesitar tocar el matcher de
  nuevo, salvo que agregue una ruta pública nueva (`/api/sync` sí pasa por
  el guard con sesión, a propósito — es una mutación real, no un asset).

## Riesgos y notas

### R1 — Navegación interna de Next (RSC) vs. documento HTML completo
Next App Router usa dos tipos de fetch distintos para llegar a una pantalla:
un documento HTML completo (recarga dura o entrada directa de URL) y un
fetch de "flight data" RSC (navegación interna vía `<Link>`, sin recargar
la página completa). Cachear solo el primero no garantiza que la
navegación interna del Sidebar funcione sin señal — hace falta que las
reglas de `runtimeCaching` de Serwist cubran ambos patrones de request para
las 3 pantallas de campo. Esto se verifica explícitamente en vivo
(DevTools → Network → Offline, primero con recarga dura, después con click
interno del Sidebar) antes de dar por cerrada H3 — no se asume que
funciona solo porque la recarga dura funcionó.

### R2 — Iconos maskable: no hay ningún archivo de diseño nuevo del Product Owner todavía
`avicolamya-isotipo.png`/`avicolamya-imagotipo.png` son los únicos activos
de marca reales. Un ícono maskable necesita una "safe zone" (el contenido
visible debe caber dentro de un círculo central ~80% del lienzo, porque
Android puede recortarlo a círculo/redondeado/cuadrado según el launcher).
Sin un archivo de diseño maskable dedicado del Product Owner, este sprint
genera los iconos maskable **programáticamente** (script con `sharp`
durante la ejecución: el isotipo centrado sobre un lienzo cuadrado con
relleno del color de marca, recortado a la safe zone) — es una solución
razonable, no definitiva; si el resultado visual no convence al Product
Owner al verificar en vivo, es un ajuste de asset, no de código.

### R3 — Verificación de instalabilidad real en Android/iOS: misma limitación de herramienta que sprints anteriores
`resize_window` de Claude in Chrome no cambia el viewport lógico
(confirmado repetidas veces en Sprints 1-3, ver `memory/estado-proyecto.md`)
y el evento `beforeinstallprompt`/el flujo de instalación real de Android
no se puede disparar de forma confiable desde un navegador de escritorio
automatizado. La verificación real de "se instala y abre en modo
standalone" queda, igual que la verificación mobile de sprints anteriores,
para que el Product Owner la confirme en su celular Android real (y en un
iPhone real para H2) — documentado como pendiente explícito, no como
"hecho" hasta tener esa confirmación.

### R4 — Este sprint no tiene capa de `services`/`repositories`/Zod que testear con Vitest
A diferencia de todos los sprints CRUD anteriores, no hay lógica de negocio
pura que unit-testear ni Server Actions que integration-testear — el
"Definition of Done" de este sprint se apoya en verificación manual/en vivo
(Lighthouse, DevTools Offline, dispositivos reales) en vez de
`npx vitest run --coverage`. Ver `plan.md`, "Definition of Done aplicable a
este sprint", para el criterio adaptado.

### R5 — Neon compartido entre local y producción (heredado)
Sin relevancia directa este sprint (no hay escritura de datos nueva), pero
se mantiene igual que Sprints 1-12 por si alguna verificación termina
tocando datos reales sin querer.

## Criterio de aceptación general
Dado el repo con Sprint 12 ya desplegado
Cuando un Operario entra desde Chrome Android, ya logueado, ve el prompt de
  instalación una vez, instala la app, y después pierde la señal
Entonces puede abrir Mortalidad, Bitácora y Recolección (por URL directa y
  por navegación interna del Sidebar) con sus catálogos ya cargados, ve el
  indicador de conectividad en gris con "Sin conexión", y cualquier intento
  de guardar falla explícito sin perder ni duplicar nada
Y un Operario con iPhone, ya logueado, ve el banner de instrucciones de
  iOS una vez y puede volver a abrirlo desde el footer del Sidebar
Y ninguna pantalla de gestión (Usuarios, Créditos, Egresos, etc.) quedó
  precargada — siguen exigiendo red como hasta ahora
Y `/manifest.webmanifest` y la ruta del Service Worker responden con
  contenido real incluso sin sesión iniciada (H6 verificado con `curl` sin
  cookie)
