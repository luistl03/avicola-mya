# Tareas — Sprint 13

Checklist de ejecución, misma disciplina de Sprints 1-12: implementar tal
cual `plan.md` (o anotar el desvío real si aparece uno durante la
ejecución) y verificar en código/dispositivo real (no solo dar por buena
la tarea al escribirla). Orden tal cual "Orden de ejecución" de `plan.md`
— hay dependencias reales entre tareas, no saltear el orden sin motivo.

**Ninguna tarea está ejecutada todavía** — este archivo se llena (`[x]`,
con el resultado real y cualquier desvío) a medida que se ejecuta cada
tarea, tal como quedaron documentadas las de
`specs/sprint-12-egresos-personal/tasks.md`.

- [x] S13-1 — `memory/decisiones-tecnicas.md`: agregada D7 (Serwist vía
  `@serwist/turbopack`) al final del archivo, sin tocar D1-D6 (título del
  documento actualizado de "D1–D6" a "D1–D7"). `memory/stack-tecnologico.md`:
  sección "Offline / PWA" actualizada — Serwist reemplaza "next-pwa o
  Serwist", con nota de por qué; Dexie/Web Push quedan marcados
  explícitamente "sin instalar todavía" (Sprint 14/16) para que no se
  confundan con dependencias ya presentes. Sin desvíos de diseño.

  **Colores confirmados leyendo `globals.css` real (no asumidos):**
  `--background: oklch(1 0 0)` (light) = `#ffffff` puro; `--primary:
  oklch(0.743 0.167 62.74)` (light) = `#f4900f`, coincide con el valor ya
  documentado en `memory/estado-proyecto.md` ("Paleta de color"). Son los
  valores de light mode — el manifest usa un único par estático, sin
  variante dark (mejora incremental fuera de alcance, no bloquea
  instalabilidad). `plan.md` actualizado con esta confirmación (ya no dice
  "se confirma en el momento").

- [x] S13-2 — Instaladas `serwist@9.5.12` (dependency), `@serwist/turbopack@9.5.12`,
  `esbuild@0.28.2`, `sharp@0.35.3` (devDependencies), todas con versión
  fijada explícita tras confirmar contra `npm view` que 9.5.12 es la
  última versión **estable** (el dist-tag `latest` resuelve ahí — la
  preview `10.0.0-preview.14` no se instaló) y que los peerDependencies
  (`next >=14.0.0`, `react >=18.0.0`, `esbuild >=0.25.0 <1.0.0`) están
  satisfechos por el proyecto real (Next 16.2.12, React 19.2.4). `sharp`
  requiere Node ≥20.9.0 — Node local es v24.18.0, cumple.

  **Desvío real, dos hallazgos durante la instalación, ninguno de diseño:**
  1. **npm 11 (`allow-scripts`) bloqueó los postinstall de `esbuild` y
     `@swc/core`** (dependencia real de `@serwist/turbopack`, no
     instalada explícitamente por este sprint) — sin ese script,
     `@swc/core` quedó con su binding de plataforma
     (`@swc/core-win32-x64-msvc`) pero sin el paquete principal.
     Corregido con `npm approve-scripts esbuild @swc/core` (aprobación
     puntual por paquete, no `--all`) + reinstalar — quedó registrado en
     `package.json` (`"allowScripts": { "@swc/core@1.15.46": true,
     "esbuild@0.28.2": true }`). Los 6 paquetes pendientes preexistentes
     (Prisma, `core-js`, `sharp@0.34.5` de `next`, `unrs-resolver`) se
     dejaron intactos — no son de este sprint.
  2. **Mismo bug `EPERM` que S12-1:** el reintento de `npm install`
     disparó `prisma generate`, que falló porque un `npm run dev` seguía
     corriendo en el puerto 3000 (PID distinto al de Sprint 12).
     Confirmado con el Product Owner, se terminó el proceso
     (`taskkill /PID 32824 /F`) y el reintento de `npm install` completó
     limpio.

  **Verificado, no solo instalado:** `@swc/core` cargó su binding nativo
  real (`require(".../@serwist/turbopack/node_modules/@swc/core")`,
  `transform` es function) — quedó anidado dentro de
  `node_modules/@serwist/turbopack/` en vez de en la raíz (npm lo separó
  porque ya había otros paquetes `@swc/*` de una fuente distinta —el
  propio toolchain de Next— en el nivel superior), comportamiento normal
  de resolución de dependencias, no un error. `sharp@0.35.3` cargó su
  binding nativo (`sharp.versions.sharp === "0.35.3"`) sin problema — es
  una instalación separada de `sharp@0.34.5` (dependencia transitiva de
  `next`, preexistente, sin relación con el `sharp` de este sprint).

  **8 vulnerabilidades de `npm audit` (1 moderate, 7 high), todas
  preexistentes, ninguna introducida por este sprint** — confirmado con
  `npm ls hono nanoid sharp`: vienen de `next` (`postcss`/`nanoid`/
  `sharp@0.34.5` viejo), `@tailwindcss/postcss` (`nanoid`), el SDK de MCP
  que usa `shadcn` (`hono`), y Prisma (`deepmerge-ts`/`@prisma/config`).
  El conteo de vulnerabilidades no cambió entre el primer y el segundo
  `npm install` de esta tarea. Fuera de alcance corregirlas acá.

  Verificado `npx prisma validate` (en verde), `npm run typecheck`, `npm
  run lint` y `npm test` — **553/553 en verde**, sin regresión.

- [x] S13-3 — `scripts/generar-iconos-pwa.ts` (nuevo): genera
  `public/icons/icon-192.png`, `icon-512.png`, `icon-192-maskable.png`,
  `icon-512-maskable.png` y `public/apple-touch-icon.png` a partir de
  `avicolamya-isotipo.png`.

  **Desvío real de diseño respecto al pseudocódigo de `plan.md`, no un
  bug — confirmado antes de escribir el script, no asumido:**
  `avicolamya-isotipo.png` es un PNG de 500x500 **sin canal alfa**
  (`hasAlpha: false`, `channels: 3`), con fondo blanco horneado hasta
  casi el borde — `sharp(...).trim()` midió el bounding box real del
  símbolo en 470x441 sobre el lienzo de 500x500 (~94%/88%), muy por
  encima del margen del 10% que exige la safe zone maskable (80% central).
  El pseudocódigo original de `plan.md` asumía un recorte transparente
  para componer sobre un fondo `--primary` (naranja) — sin canal alfa,
  esa composición hubiera dejado un cuadrado blanco visible dentro del
  naranja, no un ícono limpio. **Corregido:** los maskable recortan el
  símbolo a su bounding box real (`trim()`), lo reescalan dentro de un
  cuadro del 80% del lienzo final, y lo centran sobre fondo **blanco**
  (`#ffffff`, el mismo `--background`/color horneado del propio isotipo
  confirmado en S13-1) en vez de naranja — sin ninguna costura de color
  entre el símbolo y el margen, porque ambos son literalmente el mismo
  blanco. Los íconos "any" (192/512) y el `apple-touch-icon` (180x180) se
  reescalan directo, sin composición — mismo criterio que ya usa el
  favicon/Sidebar del proyecto con este mismo asset.

  Verificado, no solo generado: los 5 archivos existen con las dimensiones
  correctas (`sharp().metadata()` por archivo); los maskable quedaron con
  `hasAlpha: true` (sharp promovió el canal al componer) pero **totalmente
  opacos** — muestreado el píxel de la esquina (255,255,255,255) y del
  centro (237,237,235,255, parte del propio símbolo), alfa 255 en ambos,
  sin transparencia accidental. Los 5 PNG revisados visualmente (`Read` de
  cada imagen): el isotipo real es una gallina sobre un nido de huevos
  (blanco/naranja/rojo, estilo de marca) — se ve nítido y sin artefactos
  en las 4 combinaciones de tamaño/variante, sin ninguna costura de color
  visible en los maskable. No hizo falta ningún ajuste adicional de
  padding/color — el resultado convence tal cual, sin necesitar reabrir
  esta tarea (ver contingencia prevista en R2, `spec.md`).

- [x] S13-4 — `src/app/manifest.ts` (nuevo): convención nativa de Next
  (`MetadataRoute.Manifest`), sin desvíos respecto a `plan.md` — `name`/
  `short_name`/`description`, `start_url: "/"`, `display: "standalone"`,
  `background_color: "#ffffff"`, `theme_color: "#f4900f"` (confirmados en
  S13-1), 4 iconos (192/512 "any" + 192/512 "maskable", generados en
  S13-3).

  Verificado `npm run typecheck` (sin errores) y, contra `npm run dev`
  real: Next compiló sin errores y registró la ruta
  `/manifest.webmanifest` — pero **respondió `307 → /login`**, no `200`,
  al pedirla sin sesión. **Esto es el comportamiento esperado en este
  punto del sprint, no un bug de esta tarea:** `src/proxy.ts` todavía no
  está corregido (H6 es S13-6, más adelante en el orden de ejecución) —
  confirma en vivo, antes de tiempo, exactamente el bug que motivó H6 en
  `spec.md`. La verificación real de `200` queda para S13-6/S13-7, no se
  fuerza acá. Servidor de desarrollo (proceso propio, iniciado solo para
  esta verificación) detenido al terminar.

  Verificado `npm run lint && npm test` — **553/553 en verde**, sin
  regresión.

- [x] S13-5 — `src/app/sw.ts`, `src/app/serwist/[path]/route.ts`,
  `next.config.ts` (`withSerwist`).

  **Investigación previa real, no asumida:** antes de escribir código, leí
  el código fuente instalado de `serwist@9.5.12` (`Serwist.ts`,
  `Strategy.ts`, `types.ts`), `@serwist/build` (schemas de
  `injectManifestOptions`) y `@serwist/turbopack` (`index.ts`,
  `index.schema.ts`, `lib/validate.ts`, `index.worker.ts`). Cinco
  desvíos reales confirmados respecto al pseudocódigo de `plan.md` (texto
  completo del porqué de cada uno en `plan.md`):
  1. `createSerwistRoute` no tiene opción `revision` (rechazada por
     `z.strictObject`) ni exporta `HEAD` — solo `dynamic`,
     `dynamicParams`, `revalidate`, `generateStaticParams`, `GET`.
  2. `useNativeEsbuild: true` fijado explícito — el default depende de la
     plataforma (win32 nativo, resto `esbuild-wasm`, no instalado).
  3. `swSrc: "src/app/sw.ts"` (relativo a `cwd` = raíz del repo, no
     `app/`).
  4. Se eliminó la regla `PANTALLAS_DE_CAMPO` propia — `defaultCache`
     (`@serwist/turbopack/worker`) ya trae `NetworkFirst` a 24h para
     HTML/RSC/RSC-prefetch de cualquier página same-origin, resolviendo
     sola el riesgo R1 (RSC vs. documento).
  5. **Hallazgo de seguridad real:** sin un `handlerDidError` propio en
     la regla `NetworkOnly` de POST, el `PrecacheFallbackPlugin` de
     `fallbacks` se adjunta automáticamente a ella también (confirmado
     leyendo el constructor de `Serwist`) — una Server Action fallida por
     falta de red devolvería `/offline` en vez de un error de red real.
     Corregido con `plugins: [{ handlerDidError: async () => undefined }]`.

  Código real en los tres archivos (sin pseudocódigo intermedio — se
  escribió directo con la API confirmada). `next.config.ts` envuelto con
  `withSerwist(nextConfig)`.

  **Verificado con `npm run build` real (no `npm run dev`** — confirmado
  leyendo `defaultCache` que en dev **todo** el array se reemplaza por
  `NetworkOnly`, el caché real solo existe en producción):
  - `npm run typecheck` — sin errores.
  - `npm run build` — compiló limpio: `(serwist) Using esbuild to bundle
    the service worker`, `54 precache entries (2797.61 KiB)`,
    `/manifest.webmanifest` listada como ruta estática (○),
    `/serwist/[path]` con SSG (●) pre-renderizando `/serwist/sw.js` y
    `/serwist/sw.js.map` vía `generateStaticParams` — confirma que
    `useNativeEsbuild: true` funcionó y que la referencia a
    `additionalPrecacheEntries: [{ url: "/offline", ... }]` no rompe el
    build aunque esa ruta todavía no exista (S13-7 es la siguiente tarea).
  - `npm run start` real + `curl -I http://localhost:3000/serwist/sw.js`
    y `curl -o /dev/null -w "%{http_code}" http://localhost:3000/manifest.webmanifest`
    sin cookie: ambos **`307 → /login`** — esperado en este punto (H6
    pendiente, S13-6), confirma que la ruta existe y responde (no 404),
    solo bloqueada por el guard todavía. Servidores de dev/start (propios,
    iniciados solo para esta verificación) detenidos al terminar cada
    prueba.

  Verificado `npm run lint && npm test` — **553/553 en verde**, sin
  regresión.

- [x] S13-6 — `src/proxy.ts`: matcher corregido — agregadas las
  exclusiones `serwist` (prefijo de ruta, sin extensión) y `webmanifest`
  (extensión) al negative lookahead existente, sin tocar el resto del
  guard. Sin desvíos de diseño respecto a `plan.md`.

  **Verificación obligatoria (H6), con `npm run dev` real, sin ninguna
  cookie de sesión:**
  - `curl http://localhost:3000/manifest.webmanifest` → **`200`**, con el
    JSON real del manifest (nombre, colores, 4 iconos) — antes de esta
    tarea daba `307 → /login` (confirmado en S13-4/S13-5).
  - `curl -I http://localhost:3000/serwist/sw.js` → **`200`**,
    `content-type: application/javascript`, **`service-worker-allowed: /`**
    presente (crítico: sin este header, el scope del SW quedaría limitado
    a `/serwist/` en vez de controlar toda la app) — contenido real
    verificado (`head -c 400`, JS real de `serwist/dist/chunks/...`, no un
    placeholder vacío).
  - **Controles negativos, confirmando que el fix no abrió nada de más:**
    `/login` sigue `200` (pública, sin cambios) y `/mortalidad` sigue
    `307 → /login` sin sesión (protegida, sin cambios) — el guard de
    sesión real sigue intacto para cualquier ruta que no sea manifest/SW.

  Servidor de desarrollo (propio, iniciado solo para esta verificación)
  detenido al terminar. Verificado `npm run typecheck && npm run lint &&
  npm test` — **553/553 en verde**, sin regresión.

- [x] S13-7 — `src/app/offline/page.tsx` (nuevo): Server Component
  estático (sin fetch a Prisma), `<PageHeader title="Sin conexión">` +
  ícono `WifiOff` (lucide-react) + texto explicando que Mortalidad/
  Bitácora/Recolección sí funcionan sin señal + 3 links (`buttonVariants`
  + `next/link`, mismo patrón que "Ver detalle" de `EmpleadosTabla`) a
  esas rutas. Ya estaba referenciada en `fallbacks`/`additionalPrecacheEntries`
  desde S13-5 (no hizo falta ajustar esos archivos) — esta tarea solo creó
  la página que faltaba.

  **Verificado con `npm run build` + `npm run start` reales, no solo
  creado:**
  - `/offline` aparece en la salida de `next build` (ruta dinámica `ƒ`,
    igual que el resto — `RootLayout` fuerza render dinámico en toda la
    app por el `await auth()`/`await cookies()` de la raíz, no es
    específico de esta página).
  - `curl http://localhost:3000/offline` sin cookie → `307 → /login`
    (comportamiento esperado y correcto: es el mismo guard que cualquier
    ruta protegida — el camino real de esta página es el fallback offline
    del Service Worker, que se sirve directo desde Cache Storage y nunca
    llega a este servidor, así que nunca pasa por `proxy.ts` en ese caso).
  - **Confirmado el encadenamiento completo leyendo el `sw.js` compilado
    real:** contiene la entrada de precache `{revision:"dev",url:"/offline"}`
    (el fallback `VERCEL_GIT_COMMIT_SHA ?? "dev"` de S13-5, funcionando
    tal cual se diseñó) y el registro del `matcher` del fallback — la
    página, el precache y el fallback quedan conectados de punta a punta,
    no solo por lectura de código.

  Servidores de build/start (propios, iniciados solo para esta
  verificación) detenidos al terminar. Verificado `npm run typecheck &&
  npm run lint && npm test` — **553/553 en verde**, sin regresión.

- [x] S13-8 — `src/lib/constants.ts`: agregada `INSTALL_PROMPT_COOLDOWN_DIAS = 30`.

  **Desvío real respecto a `plan.md` original, no un bug:** no se agregó
  `RUNTIME_CACHE_MAX_AGE_SEGUNDOS` — desde que S13-5 reemplazó la regla
  `NetworkFirst` propia por `defaultCache` (que ya hardcodea 24h
  internamente en la librería, sin punto de configuración externo), no
  queda ningún código de este proyecto que fuera a importar esa
  constante. El valor de la decisión 6 (24h) se sigue cumpliendo — lo
  aplica `defaultCache`, documentado en el comentario de `src/app/sw.ts` —
  pero una constante sin ningún consumidor real habría sido documentación
  suelta, no una fuente de verdad compartida (mismo principio que el
  resto del proyecto evita: no crear abstracciones sin uso real). `plan.md`
  actualizado en las tres secciones que todavía mencionaban esta
  constante (punto de partida, diseño de `lib/constants.ts`, estructura
  de archivos esperada).

  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde**, sin regresión.

- [x] S13-9 — `src/components/domain/pwa/connectivity-indicator.tsx`
  (nuevo).

  **Desvío real, encontrado por el propio linter, no un bug de diseño:**
  el pseudocódigo original de `plan.md` (`useState` + `setOnline` dentro
  de un `useEffect`) dispara `react-hooks/set-state-in-effect` en
  `npm run lint` real — mismo tipo de hallazgo que ya documentó Sprint 4
  para `BitacoraMuro`. Reescrito con `useSyncExternalStore`
  (`suscribirse`/`obtenerSnapshot`/`obtenerSnapshotServidor`), el patrón
  que React recomienda para suscribirse a estado externo del navegador —
  sin `useEffect` ni `useState`. `plan.md` actualizado con el hallazgo y
  el pseudocódigo original tachado como registro histórico.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde** (componente todavía no montado en ningún lado —
  eso es S13-14 — pero exportado y sin errores de tipos/lint).

- [x] S13-10 — `src/components/domain/pwa/precargar-catalogos.tsx`
  (nuevo), tal cual `plan.md`, sin desvíos — a diferencia de S13-9, no
  llama `setState` en ningún momento (solo dispara `fetch` de efecto
  secundario, sin estado ni render propio), así que no disparó el lint
  `react-hooks/set-state-in-effect`.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde** (componente todavía no montado — eso es S13-13 —
  pero exportado y sin errores).

- [x] S13-11 — `src/components/domain/pwa/install-prompt-android.tsx` +
  `install-app-button.tsx` (nuevos) — depende de S13-8.

  **Dos desvíos reales respecto al pseudocódigo de `plan.md`, resueltos
  sin esperar la verificación en dispositivo real:**
  1. La nota de diseño pendiente sobre `useSyncExternalStore` con
     suscripción no-op se resolvió con un store mínimo real (`Set<Escucha>`,
     `suscribirseAInstalacion`/`obtenerInstalacionDisponible`/
     `establecerEvento`) — mismo patrón que `connectivity-indicator.tsx`
     (S13-9), notifica a los suscriptores en el momento exacto en que el
     evento se captura o se limpia, no en el próximo render por otra
     razón. Ya no queda ninguna nota pendiente para S13-20 (verificación
     Android real) sobre este punto — solo confirmar que se ve/comporta
     bien, no que el mecanismo de re-render funcione.
  2. **Bug real encontrado al revisar el pseudocódigo antes de copiarlo:**
     el listener de `appinstalled` nunca se removía en el cleanup del
     efecto (función inline sin referencia guardada) — corregido
     guardando la referencia y removiendo ambos listeners.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde** (componentes todavía no montados — eso es
  S13-13/S13-14 — pero exportados y sin errores).

- [x] S13-12 — `src/components/domain/pwa/ios-install-banner.tsx` +
  `ios-install-button.tsx` (nuevos) — independiente.

  **Desvío real respecto a `plan.md`, anticipado antes de escribir código
  gracias a S13-9/S13-11 (no hizo falta que el linter lo volviera a
  encontrar):** el pseudocódigo original llamaba `setMostrar(true)`
  directo dentro de un `useEffect` — mismo patrón que ya había disparado
  `react-hooks/set-state-in-effect` en S13-9. Reescrito desde el
  principio con `useSyncExternalStore` (dos mecanismos distintos: una
  suscripción no-op para `puedeInstalarEnIos()`, valor estable durante la
  sesión; un store real compartido — `suscribirseABannerIos`/
  `reabrirBannerIos` — para `obtenerBannerVisible()`, que sí cambia
  cuando el banner se cierra o se reabre desde el botón manual).

  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde**, sin ningún error de lint esta vez (componentes
  todavía no montados — eso es S13-13/S13-14 — pero exportados y sin
  errores).

- [x] S13-13 — `src/app/layout.tsx`: metadata `appleWebApp` + `apple`
  icon, `<SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>`
  envolviendo `PrecargarCatalogos`/`InstallPromptAndroid`/`IosInstallBanner`
  junto a `IdleTimer` en la rama `usuario` — depende de S13-9 a S13-12,
  sin desvíos de diseño respecto a `plan.md`.

  **Verificado en el navegador real (Claude in Chrome), no solo por
  build** — login con un Usuario GERENTE temporal (`test.s13.gerente`,
  creado con `npx tsx` + bcrypt, mismo criterio que Sprints 2/3/12: nunca
  tocar la cuenta sembrada real, que además comparte base con producción,
  R5 `spec.md`) contra `npm run build && npm run start` real:

  1. **Hallazgo real de entorno, no de código:** `npm run start` sin más
     rompió el login con `UntrustedHost` de Auth.js (`errors.authjs.dev#untrustedhost`)
     — un guard de producción que nunca se había disparado antes porque
     ningún sprint anterior corrió `next start` en local (siempre
     `next dev`, o producción real en Vercel, que auto-detecta el host
     confiable). Resuelto arrancando el server con `AUTH_TRUST_HOST=1`
     (env var puntual para esta sesión, sin tocar `.env` — Vercel no lo
     necesita, lo auto-detecta). **Este mismo prefijo hace falta para
     cualquier verificación de S13-16 en adelante que use `npm run start`.**
  2. **Service Worker confirmado registrado y activo**
     (`navigator.serviceWorker.getRegistrations()`): `scope:
     "http://localhost:3000/"` (toda la app, no solo `/serwist/` — confirma
     que el header `Service-Worker-Allowed: /` de S13-6 funcionó de
     verdad), `active.scriptURL: ".../serwist/sw.js"`.
  3. **`PrecargarCatalogos` confirmado funcionando**: el cache `others`
     contiene `/`, `/mortalidad`, `/bitacora`, `/recoleccion` — los
     `fetch()` explícitos sí cachearon las 3 pantallas de campo (decisión
     1), vía la regla catch-all de `defaultCache` (un `fetch()` plano no
     trae los headers que matchean las reglas "pages"/"pages-rsc"
     específicas, cae al fallback genérico — funcionalmente correcto
     igual, mismo resultado NetworkFirst).
  4. **Hallazgo real a resolver en S13-14, no en esta tarea:** el cache
     `pages-rsc-prefetch` (parte de `defaultCache`, no de
     `PrecargarCatalogos`) contiene el prefetch RSC de **todas** las
     rutas del Sidebar, incluidas pantallas de gestión
     (`/usuarios`, `/creditos`, `/clientes`, `/galpones`, etc.) — no por
     ningún código de este sprint, sino por el prefetch automático de
     `<Link>` de Next (cualquier link visible en viewport se prefetchea
     solo, y el Service Worker ya intercepta y cachea esa respuesta). Esto
     roza la decisión de negocio 1 ("ninguna pantalla de gestión se
     precarga") — es una entrada liviana de prefetch, no el documento HTML
     completo, pero sigue siendo caché sin que el usuario haya visitado
     esas pantallas. **Ajuste real propuesto para S13-14** (que ya toca
     `sidebar.tsx`): `prefetch={false}` en el `<Link>` de
     `SidebarMenuButton` para cualquier ruta que no sea una de las 3
     pantallas de campo. La verificación final de "ninguna pantalla de
     gestión cacheada sin visitar" (S13-19) confirma si alcanza con eso.
  - Sin errores ni warnings en consola del navegador (confirmado con
    `read_console_messages`, página recargada para capturar desde el load).
  - Captura visual: dashboard renderiza correctamente, Sidebar con
    "Test Sprint 13 / Gerente", sin bugs visuales — footer todavía sin
    `ConnectivityIndicator`/botones de instalación (eso es S13-14).

  Sesión cerrada desde la UI (botón "Cerrar sesión"), tab cerrado,
  servidor de producción detenido, usuario temporal y ambos scripts
  (`verificar-sprint13-temp.ts`/`limpiar-s13-temp.ts`) borrados al
  terminar — confirmado `git status` limpio, sin restos.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde**, sin regresión.

- [x] S13-14 — `src/components/layout/sidebar.tsx`: footer gana
  `ConnectivityIndicator` + `InstallAppButton` + `IosInstallButton`
  (`className="w-full"` agregado a ambos botones, mismo patrón que
  `LogoutButton` en este mismo footer — ajuste chico de consistencia
  visual no listado en `plan.md`). `<Link href={item.href} />` de
  `SidebarMenuButton` gana `prefetch={esPantallaDeCampo}` (acotado a
  `/mortalidad`/`/bitacora`/`/recoleccion`, lista importada de
  `precargar-catalogos.tsx` — exportada de ahí en esta misma tarea para
  no duplicar la lista en dos componentes).

  **Verificado en el navegador real (Claude in Chrome), con un segundo
  usuario GERENTE temporal (`test.s13.gerente2`, mismo criterio de
  siempre) contra `AUTH_TRUST_HOST=1 npm run start`:**
  - **Hallazgo real, corregido en la misma tarea:** después del fix de
    `sidebar.tsx`, `/creditos` (gestión) seguía apareciendo en
    `pages-rsc-prefetch` — no por el Sidebar, sino por un `<Link
    href="/creditos">` propio de `src/app/page.tsx` (tarjeta "Créditos
    vencidos" del dashboard, siempre renderizada, prefetch por defecto).
    Corregido agregando `prefetch={false}` a ese Link también. **No se
    auditó el resto de la app en busca de Links similares** (fuera de
    alcance de esta tarea puntual) — queda como parte explícita de la
    verificación de S13-19.
  - **Hallazgo real de comportamiento normal de Service Worker, no un
    bug:** la primera carga inmediatamente después de un registro nuevo
    del SW no queda controlada por él (`navigator.serviceWorker.controller`
    es `null` en ese primer load, aunque el SW ya esté `active` — ciclo
    de vida estándar, `clientsClaim` recién aplica desde la próxima
    navegación) — los `fetch()` de `PrecargarCatalogos` en esa primera
    carga van directo a red, sin cachear. Confirmado que la **segunda**
    navegación en adelante sí queda controlada y cachea correctamente.
  - **Verificación final limpia** (caches y SW borrados a mano antes de
    la prueba, para descartar caché de una sesión anterior): tras login +
    una navegación real, el cache `others` contiene exactamente `/`,
    `/manifest.webmanifest`, `/bitacora`, `/mortalidad`, `/recoleccion` —
    **ninguna pantalla de gestión** — confirmando que el ajuste de esta
    tarea + el de `page.tsx` resuelven el hallazgo de S13-13.
  - **Footer confirmado visualmente:** punto verde (`ConnectivityIndicator`,
    online), botón "Instalar app" visible (el store de S13-11
    funcionando de verdad — apareció porque `beforeinstallprompt` se
    capturó), sin "Cómo instalar" (correcto, Chrome de escritorio, no
    iOS) — todo en el diseño previsto, sin ajustes visuales adicionales.

  Sesión cerrada desde la UI, tab cerrado, servidor detenido, usuario
  temporal y ambos scripts borrados al terminar — `git status` confirmado
  limpio.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde**, sin regresión.

- [x] S13-15 — `npm run typecheck && npm run lint && npm run build` —
  todos en verde. Confirmado con `grep -i webpack` sobre el log completo
  del build que no aparece ninguna mención (Turbopack de punta a punta,
  "▲ Next.js 16.2.12 (Turbopack)"). `/offline` presente en la salida de
  rutas de `next build`, junto con `/manifest.webmanifest` (○ estática) y
  `/serwist/[path]` (● SSG, `sw.js`/`sw.js.map`) — mismas 19 rutas de
  gestión/operación de Sprint 12 intactas, ninguna rota por los cambios
  de este sprint. `npm test` — **553/553 en verde**, sin regresión sobre
  los heredados de Sprint 12 (ningún test nuevo — no hay `services`/
  `repositories`/Zod nuevos este sprint, ver R4/DoD de `spec.md`/`plan.md`).

- [x] S13-16 — **Hallazgo real que invalida el plan original de esta
  tarea:** `npx lighthouse` (v13.4.1, la versión que instala `npx` hoy)
  **ya no tiene categoría "pwa"** — confirmado con
  `npx lighthouse --list-all-audits`, sin un solo audit relacionado a
  instalabilidad/manifest/service-worker/maskable-icon en toda la lista;
  Google la deprecó por completo, no solo la reagrupó. `--only-categories`
  hoy solo acepta `accessibility, best-practices, performance, seo,
  agentic-browsing`. El plan original ("Chrome DevTools → Lighthouse →
  PWA") apunta a algo que ya no existe en esta versión de la herramienta
  — no es un problema de configuración de este proyecto.

  **Verificación sustituta real, más autoritativa que un score sintético:**
  la señal que de verdad importa (¿Chrome considera la app instalable?)
  ya quedó confirmada de la forma más directa posible en S13-14: el
  navegador mismo disparó `beforeinstallprompt` en la sesión real — ese
  evento **solo** lo dispara Chrome cuando sus propios criterios internos
  de instalabilidad (manifest válido, SW activo con fetch handler,
  iconos 192/512 + maskable) ya se cumplieron. No hace falta un score de
  Lighthouse para confirmar algo que el navegador ya confirmó en vivo.
  Checklist consolidado de lo ya verificado en tareas anteriores (no
  repetido acá, solo referenciado):
  - Manifest válido y servido con `200` (S13-4, S13-6).
  - 4 iconos (192/512 any + maskable) generados y confirmados
    visualmente (S13-3).
  - Service Worker registrado y `active`, scope `"/"` completo (S13-5,
    S13-13).
  - `beforeinstallprompt` disparado por Chrome real, prompt propio
    visible en pantalla (S13-14).

  **Chequeo complementario real, con un usuario GERENTE temporal
  (`test.s13.lighthouse`, borrado al terminar) + login vía `curl` con
  cookie jar (mismo criterio que Sprint 2/3 para RBAC) para pasar la
  cookie de sesión real a `npx lighthouse --extra-headers`:** corridas
  las categorías que sí quedan disponibles contra la página autenticada
  (`/`) — **`accessibility: 100`, `best-practices: 100`, `seo: 100`,
  cero audits fallidos**. No es lo que buscaba esta tarea originalmente,
  pero confirma que nada de lo agregado este sprint (SW, manifest,
  componentes flotantes) degradó ninguna de esas tres categorías.

  **Nota real de entorno, no bloqueante:** `npx lighthouse` en Windows
  crashea con `EPERM` al limpiar su directorio temporal de Chrome
  DESPUÉS de escribir el reporte (bug conocido de `chrome-launcher` en
  Windows, ajeno a este proyecto) — el reporte JSON se genera igual antes
  del crash, se leyó desde ahí. Reintentar si hace falta correr Lighthouse
  de nuevo en sprints futuros, no asumir que el crash significa que la
  auditoría falló.

  Servidor detenido, usuario temporal y scripts borrados al terminar —
  `git status` confirmado limpio.

- [x] S13-17 — Verificación en vivo de offline para las 3 pantallas de
  campo (R1, `spec.md`). **Desvío real de método:** en vez de DevTools →
  Network → Offline (throttling), se apagó el proceso `npm run start`
  por completo mientras el navegador seguía abierto — falla de red real
  (conexión rechazada), no simulada; equivalente para probar lo que
  importa (¿el SW sirve desde caché cuando la red falla?) y sin depender
  de manipular la UI de DevTools.

  **Hallazgo real confirmado, exactamente el riesgo que anticipaba R1:**
  con el servidor apagado, la recarga dura de `/mortalidad` funcionó
  perfecto (datos reales renderizados), pero la navegación interna del
  Sidebar a `/bitacora` se quedaba colgada sin navegar. Causa raíz
  confirmada revisando Cache Storage en vivo: solo existía la caché
  `others` (documento HTML completo, la que llena `PrecargarCatalogos`)
  — **no existía ninguna entrada en `pages-rsc`** (el formato que Next
  usa para la navegación interna vía `<Link>`, header `RSC: 1`), así que
  un clic sin señal intentaba red, fallaba, y no tenía nada cacheado de
  ese formato para servir de respaldo.

  **Corregido en `precargar-catalogos.tsx`:** agregado un segundo
  `fetch()` por pantalla de campo, con header `RSC: 1`, que calienta
  también la caché `pages-rsc` — sin tocar `app/sw.ts` (el riesgo no
  era de la regla de caché en sí, `defaultCache` ya la tenía bien
  definida, sino de qué se estaba precargando).

  **Verificado de nuevo tras el fix, ciclo completo repetido desde cero**
  (caché borrada, SW desregistrado, dos navegaciones para que el SW
  tomara control, servidor apagado otra vez): confirmado con Cache
  Storage que `pages-rsc` ya contenía las 3 pantallas, y navegación
  interna real (`.click()` disparado vía JS — ver nota de tooling abajo)
  a `/bitacora` y `/recoleccion` renderizó cada una completa con datos
  reales, sin recarga de página (Sidebar actualizó el ítem activo sin
  parpadeo).

  **Fallback `/offline` confirmado en ambos modos** (H3, último
  escenario): `/usuarios` (nunca visitada) vía navegación interna Y
  `/clientes` vía URL directa mostraron la página `/offline` diseñada en
  S13-7 — ícono, texto, y los 3 links a pantallas de campo, dentro del
  Shell completo (Sidebar visible).

  **Hallazgo de tooling, no de la app:** el `computer` tool (clic
  simulado por coordenadas/ref) no registraba el clic sobre los `<Link>`
  del Sidebar en este entorno automatizado — cero requests de red
  disparadas, sin error visible. Confirmado que es un artefacto del
  método de clic simulado, no un bug real, disparando el mismo link con
  `elemento.click()` vía `javascript_tool`, que sí navegó
  correctamente. Se usó ese método para el resto de la verificación de
  esta tarea. Anotado para sesiones futuras de este sprint que necesiten
  interactuar con el Sidebar en el navegador.

  Sesión cerrada, tab cerrado, servidor detenido, usuario temporal y
  scripts borrados al terminar — `git status` confirmado limpio.
  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde**, sin regresión.

- [x] S13-18 — Combinada con la evidencia ya recolectada en S13-13 y
  S13-17 (no repetida a propósito, mismo criterio que S12-6 combinó
  verificación con la tarea anterior cuando ya quedaba cubierta en la
  misma tanda). Confirmado dos veces, en sesiones separadas con Cache
  Storage inspeccionado en vivo: tras login + una navegación real
  (necesaria para que el SW tome control del cliente, hallazgo de
  S13-14), el cache `others` contiene `/mortalidad`, `/bitacora`,
  `/recoleccion` (+ `/` y `/manifest.webmanifest`) sin que el usuario
  haya visitado esas 3 rutas a mano — y, desde el fix de S13-17, el
  cache `pages-rsc` también las contiene. Ninguna pantalla de gestión
  apareció en ninguna de las dos corridas (ver también S13-19 más abajo,
  la verificación dedicada a ese punto específico).

- [x] S13-19 — Auditoría completa de código + verificación en vivo.

  **Auditoría de código** (`grep` de `<Link` sobre `src/app` y
  `src/components`, revisando cada `href` que apunte a una ruta de
  gestión): 3 casos reales encontrados en total entre esta tarea y
  S13-14 —
  1. `src/app/page.tsx` (tarjeta "Créditos vencidos" del dashboard) —
     corregido en S13-14.
  2. `src/app/(app)/personal/[empleadoId]/page.tsx` ("Volver a
     Personal") — corregido en esta tarea con `prefetch={false}`. Menor
     impacto que el caso 1 (el usuario ya está dentro del módulo
     Personal cuando ve este link, no es una precarga "desde afuera" de
     gestión), pero corregido igual por consistencia con la letra de la
     decisión de negocio 1.
  3. `src/app/(app)/pos/page.tsx` (link a `/precio-kilo`) — revisado y
     **sin cambios**: es un `<a href>` nativo, no `<Link>` de Next
     (confirmado revisando los imports del archivo, sin alias) — nunca
     dispara prefetch, no hay nada que corregir.

  Los demás `<Link>` encontrados (`personal/page.tsx` con filtros
  `?estado=`, `empleados-tabla.tsx` con "Ver detalle" a
  `/personal/[id]`, `data-table-pagination.tsx` genérico con `?page=N`)
  son todos **auto-referenciales**: enlazan variantes de la misma
  pantalla de gestión que el usuario ya está viendo, no cruzan hacia una
  pantalla de gestión nueva desde afuera — fuera del espíritu de la
  decisión de negocio 1, no se tocaron.

  **Verificación en vivo** (usuario GERENTE temporal `test.s13.audit`,
  mismo criterio de siempre; caché/SW borrados a mano, dos navegaciones
  para que el SW tome control, 8s de espera adicional para darle tiempo
  a cualquier prefetch automático de Next): dump completo de las 5
  cachés existentes (63 rutas únicas) filtrado contra las 11 rutas de
  gestión conocidas (Usuarios, Galpones, Lotes, Clientes, Precio por
  Kilo, POS, Ventas, Créditos, Egresos, Personal, Consolidación) —
  **cero coincidencias**. Confirmado también el otro lado: visitar
  `/usuarios` a mano sí la agrega a caché después — comportamiento
  esperado de cualquier navegador, no precarga proactiva.

  **Hallazgo tangencial, no de este sprint, no perseguido más allá de
  anotarlo:** al abrir una pestaña nueva con sesión de un usuario ya
  borrado de sprints/tareas anteriores, la app mostró el dashboard con
  datos reales antes de forzar logout — sugiere que el guard de sesión
  de `proxy.ts` no revalida contra la tabla `Usuario` en cada request
  (solo el JWT). Preexistente al proyecto, no relacionado con PWA/Service
  Worker, fuera de alcance de este sprint — no se investigó más a fondo.

  Sesión cerrada, tab cerrado, servidor detenido, usuario temporal y
  script borrados al terminar — confirmado además con una query aparte
  que no queda ningún `test.s13.*` suelto en la base. Verificado
  `npm run typecheck && npm run lint && npm test` — **553/553 en
  verde**, sin regresión.

- [ ] S13-20 — Verificación en dispositivo Android real (a cargo del
  Product Owner, R3 `spec.md`): prompt de instalación aparece una vez tras
  el login, "Ahora no" respeta el cooldown de 30 días, el botón manual
  "Instalar app" del Sidebar dispara el mismo prompt a demanda, la app
  instalada abre en modo standalone con el color de tema `--primary`
  correcto en la barra de estado.

  **Bug real encontrado y corregido en plena verificación** (Product
  Owner probando en su Android real, vía preview de Vercel — primera vez
  que se prueba contra un dispositivo real distinto del desktop de
  S13-14): el menú nativo de Chrome (⋮ → "Instalar y crear acceso
  directo") sí aparecía — confirma que el manifest/SW/íconos cumplen los
  criterios reales de instalabilidad — pero el banner propio de la app y
  el botón "Instalar app" del Sidebar **nunca aparecían**. Causa raíz:
  condición de carrera real y conocida con `beforeinstallprompt` — el
  listener de `install-prompt-android.tsx` se agregaba recién dentro de
  un `useEffect`, que corre después de que React hidrata; en un celular
  real (hidratación más lenta que en el desktop donde se verificó
  S13-14), Chrome puede disparar el evento ANTES de que ese `useEffect`
  llegue a ejecutarse — y `beforeinstallprompt` no se vuelve a disparar
  una segunda vez, así que el evento se perdía para siempre.

  **Corregido:** agregado un script inline con `next/script`
  `strategy="beforeInteractive"` en `src/app/layout.tsx` — corre antes de
  que cargue cualquier bundle de React (confirmado inspeccionando el HTML
  real: es el primer `<script>` dentro de `<body>`), captura el evento en
  `window.__bipEvento` sin importar cuándo Chrome lo dispare, y avisa con
  un evento custom (`bip-capturado`). `install-prompt-android.tsx` ya no
  agrega su propio listener de `beforeinstallprompt` (misma carrera) —
  ahora consume `window.__bipEvento`, tanto si ya llegó antes del mount
  (chequeo directo) como si llega después (escuchando `bip-capturado`).
  Sin gate de sesión en el script (capturar el evento es inofensivo para
  un usuario no logueado; la decisión de negocio 3 — mostrar solo tras el
  login — la sigue aplicando el componente de React, no el script).

  Verificado `npm run typecheck && npm run lint && npm run build` en
  verde, y que el script aparece efectivamente como el primer `<script>`
  de `<body>` en el HTML real (`curl` contra `npm run start`, antes de
  cualquier chunk de React). **Pendiente confirmar en el dispositivo
  Android real que el fix realmente resuelve el problema** — el hallazgo
  se corrigió a nivel de código, pero la verificación completa de esta
  tarea (incluida esta corrección) sigue abierta hasta que el Product
  Owner reintente contra el preview actualizado.

  **Hallazgo real de proceso, no de código:** el primer reintento del
  Product Owner siguió sin mostrar nada — resultó que estaba probando
  contra `avicola-mya.vercel.app` (producción, sin Sprint 13 todavía) en
  vez de la preview de la rama. Causa: nunca se había abierto el PR (no
  hay forma de generar la URL de preview de Vercel sin uno, confirmado
  con la API de GitHub — cero PRs, cero deployments para la rama). El
  proyecto nunca había usado este flujo de preview-antes-de-mergear en
  sprints anteriores (siempre commit directo a `main`) — se introdujo
  recién en este sprint por la necesidad de HTTPS para probar en
  dispositivo real, y no quedó suficientemente claro para el Product
  Owner en el momento. Resuelto abriendo el PR manualmente
  (`gh` no está instalado en esta máquina) y confirmando la URL real de
  preview que comentó el bot de Vercel.

  **Con la URL correcta, el fix de la carrera sí funcionó**: apareció el
  banner propio, el botón "Instalar app" del Sidebar, el diálogo real de
  instalación de Chrome con el ícono/nombre correctos, y la instalación
  se completó (tardó un poco — normal, el precache son ~2.7MB en la
  primera instalación). **S13-20 queda funcionalmente confirmado** en
  esta parte — instalación real completa en Android, con el ícono y el
  nombre correctos.

  **Dos ajustes de pulido pedidos por el Product Owner, ya corregidos:**
  1. El punto de conectividad se veía "huérfano" en su propia fila, entre
     el rol y "Cerrar sesión" — reubicado en línea junto a la etiqueta de
     rol ("Gerente ●"), no en una fila propia
     (`connectivity-indicator.tsx` pasa de `div` a `span inline-flex`,
     `sidebar.tsx` lo compone junto al `ROL_LABEL`).
  2. El texto del banner de instalación usaba voseo ("Instalá") en vez de
     español neutro — corregido en las 5 frases que lo tenían
     (`install-prompt-android.tsx`: "Instalá" → "Instala";
     `ios-install-banner.tsx`: "Instalá"/"Tocá"/"Elegí"/"Confirmá" →
     "Instala"/"Toca"/"Elige"/"Confirma"). El resto de la copia de
     Sprint 13 (botones, `/offline`) ya estaba en forma neutra, no hizo
     falta tocarla.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde**, sin regresión.

  **Tercer hallazgo real, mismo ciclo de verificación:** con la app ya
  instalada, el Product Owner volvió a abrir la URL de preview en una
  pestaña normal del navegador (no la app instalada) y el banner/botón
  de instalar seguían apareciendo, como si nunca se hubiera instalado.
  Causa: `eventoCapturado`/`window.__bipEvento` son memoria en RAM de la
  página, se resetean en cada carga nueva — y Chrome no garantiza
  suprimir `beforeinstallprompt` en una pestaña normal solo porque la PWA
  ya esté instalada (sin `getInstalledRelatedApps()` configurado, que
  necesitaría listar la app en Play Store, fuera de alcance). **Corregido**
  con un flag nuevo persistido en `localStorage`
  (`pwa-instalada`, `install-prompt-android.tsx`): se guarda "1" en el
  handler real de `appinstalled` y gana por sobre cualquier evento
  capturado después — `obtenerInstalacionDisponible()` (consumida tanto
  por el banner como por `InstallAppButton`) chequea este flag primero.
  **Limitación real, no resuelta ni resoluble sin más infraestructura:**
  este flag no es retroactivo — la instalación que el Product Owner ya
  hizo antes de este fix no lo dejó seteado (el código de ese momento no
  lo guardaba todavía), así que es esperable que el banner/botón
  aparezcan una vez más hasta el próximo `appinstalled` real; de ahí en
  adelante debería quedar suprimido de verdad. Verificado
  `npm run typecheck && npm run lint && npm test` — **553/553 en verde**.

  **Pendiente todavía:** confirmar visualmente en el dispositivo real el
  reacomodo del punto de conectividad, el texto corregido, y que el flag
  de "ya instalada" efectivamente suprime el banner/botón en la próxima
  instalación — más el resto de los criterios de esta tarea (cooldown de
  "Ahora no", botón manual a demanda, modo standalone, color de tema en
  la barra de estado).

- [ ] S13-21 — Verificación en iPhone real (a cargo del Product Owner, R3
  `spec.md`): banner de tutorial de iOS aparece una vez con los 3 pasos
  correctos, no reaparece solo después de cerrado, el botón manual "Cómo
  instalar" del Sidebar lo reabre, ninguno de los dos aparece si la app ya
  está instalada (`display-mode: standalone`).

- [ ] S13-22 — Verificación de que un intento de guardar (Mortalidad,
  Bitácora o Recolección) sin señal falla explícito, sin perder ni
  duplicar nada y sin ningún comportamiento de cola/reintento silencioso
  (eso es Sprint 14) — confirmar con DevTools → Network → Offline,
  intentando un alta real.

## Verificación final del sprint
- [ ] `npm run typecheck && npm run lint && npm run build` en verde.
- [ ] `npm test` en verde, sin regresión sobre los 553 tests heredados de
  Sprint 12.
- [ ] `memory/estado-proyecto.md` actualizado con el cierre de Sprint 13
  (mismo formato que Sprints 8-12): resumen, D7 agregada, hallazgos reales
  encontrados durante la implementación de `@serwist/turbopack` (si hubo
  diferencias con el pseudocódigo de `plan.md`), resultado real de
  Lighthouse, confirmación de dispositivos reales (Android/iPhone) por el
  Product Owner, y el link a `specs/sprint-13-pwa-instalacion/`. También
  actualizar el resumen ejecutivo ("14 de 16 completados") y "Cómo
  continuar desde acá" (apuntando a Sprint 14 — Cola offline y
  sincronización, recordando que viene marcado ALTO RIESGO y dividir en
  14A/14B).
- [ ] `specs/roadmap-completo.md`: Sprint 13 marcado `✅ COMPLETADO`, con
  el mismo resumen de una línea que llevan los Sprints 3-12.
