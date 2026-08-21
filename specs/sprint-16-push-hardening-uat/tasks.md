# Tareas — Sprint 16

Checklist de ejecución, misma disciplina de Sprints 1-15: implementar tal
cual `plan.md` (o anotar el desvío real si aparece uno durante la
ejecución) y verificar en código/base de datos/navegador real (no solo dar
por buena la tarea al escribirla). Orden tal cual "Orden de ejecución" de
`plan.md` — hay dependencias reales entre tareas, no saltear el orden sin
motivo.

**Rama creada:** `feat/S16-push-hardening-uat`, desde el estado real de
`feat/S15-dashboard-reportes` (Sprint 15 todavía sin mergear a `main` al
momento de empezar a ejecutar — decisión explícita del Product Owner:
Sprint 16 continúa sobre esa misma rama en vez de esperar el merge, y 2
cambios sueltos ya pendientes en esa rama (`creditos/page.tsx`,
`ventas/page.tsx` — quitan `description` del `PageHeader`) viajan y se
commitean junto con el resto de Sprint 16).

## 16A — Base: decisiones técnicas, claves, migración, capas puras

- [x] S16-1 — **D12** (Playwright contra Neon dev real) y **D13**
  (`web-push`) agregadas a `memory/decisiones-tecnicas.md` (sin reescribir
  D1-D11). `stack-tecnologico.md` actualizado (Web Push real, Playwright
  confirmado). Sin desvíos.

- [x] S16-2 — `npm install web-push` + `npm install -D @types/web-push`.
  `npm audit`: 9 vulnerabilidades, ninguna nueva de `web-push` (confirmado
  con `npm ls web-push`: sin sub-dependencias vulnerables en el árbol; las
  9 ya existían por `next`/`prisma`/`exceljs`/`hono`/`deepmerge-ts`/`sharp`,
  mismo criterio de verificación que S15-2). Claves VAPID generadas
  (`npx web-push generate-vapid-keys`) y `CRON_SECRET` propio (32 bytes
  aleatorios) cargados en `.env` local. **Pendiente, requiere acción del
  Product Owner:** cargar las mismas 5 env vars en Vercel (Production +
  Preview) antes del deploy de este sprint — no se hace desde acá, toca
  configuración compartida de producción.

- [x] S16-3 — Migración `Credito.notificacionVencidoEnviada Boolean
  @default(false)` (`20260820223228_sprint16_credito_notificacion_vencido`),
  aplicada en vivo contra Neon dev. **Hallazgo operativo, mismo que S15-26:**
  `npx prisma generate` falló con `EPERM` (DLL del motor de Prisma
  bloqueada) por 4 procesos `node` de un `npm run dev` de este mismo
  proyecto todavía corriendo — confirmado con
  `Get-CimInstance Win32_Process` antes de matarlos (no se asumió),
  confirmado con el Product Owner antes de terminarlos. `prisma generate`
  reintentado con éxito después. `memory/modelo-datos.md` actualizado
  (sección nueva "Idempotencia del cron").

- [x] S16-4 — `lib/webPush.ts` (`enviarNotificacionPush`, con guard si
  VAPID no está configurado — mismo criterio que `lib/rate-limit.ts` sin
  Upstash) + `lib/zod/pushSubscription.ts` (`suscribirPushSchema`,
  `eliminarSuscripcionPushSchema`). Sin desvíos.

- [x] S16-5 — `server/services/credito.ts`: `creditosParaNotificar`,
  `construirMensajePush` + 7 tests unitarios nuevos en
  `tests/unit/services/credito.test.ts` (lista vacía, cruza hoy, sigue
  VENCIDO_RECIENTE a 5 días, POR_VENCER, VENCIDO_CRITICO, mezcla de los
  tres, mensaje con nombre/saldo formateado, redondeo a 2 decimales).
  **Cobertura 100%/100%/100%/100%** confirmada en `server/services/credito.ts`
  completo (23/23 tests, heredados + nuevos). `npx tsc --noEmit` limpio.

## 16B — Repositories y Server Actions de suscripción

- [x] S16-6 — `server/repositories/pushSubscription.ts` completo
  (`crearOActualizarSuscripcionPush`, `eliminarSuscripcionPushDeUsuario`,
  `listarSuscripcionesPushDeGerentesActivos`,
  `eliminarSuscripcionPushPorId`). Sin desvíos.

- [x] S16-7 — `server/repositories/credito.ts`: agrega
  `listarCreditosPendientesSinNotificar`, `marcarCreditosComoNotificados`.
  Sin desvíos.

- [x] S16-8 — `server/actions/pushSubscription.ts`: `suscribirPush`,
  `eliminarSuscripcionPush`, ambas vía `withAuth` con rol GERENTE. 6 tests
  de integración nuevos en
  `tests/integration/actions/pushSubscription.test.ts` (mock de
  repository, mismo patrón que `credito.test.ts`): suscripción nueva con
  AuditLog, Operario rechazado en ambas actions (403), endpoint inválido
  rechazado por Zod, eliminar la propia suscripción, endpoint ajeno como
  no-op silencioso. **Desvío real de la primera corrida (no de diseño):**
  faltaba `vi.useFakeTimers()`/`vi.setSystemTime(AHORA)` en el `beforeEach`
  — sin eso, `estaExpiradaPorInactividad` comparaba la sesión simulada
  (2026-01-01) contra el reloj real del sistema y la rechazaba como
  expirada antes de llegar a la verificación de rol. Corregido, mismo
  patrón que ya usa `credito.test.ts`.

  `npm run typecheck && npm run lint` en verde tras 16A+16B.
  `npm test`: 636/636 en verde (622 heredados de Sprint 15 + 14 nuevos),
  sin regresión.

## 16C — Service Worker, UI de suscripción, cron

- [x] S16-9 — `src/app/sw.ts`: agrega `self.addEventListener("push", ...)`
  y `self.addEventListener("notificationclick", ...)`. **Desvío real (no
  de diseño):** el tsconfig del proyecto solo carga la lib `"dom"` (no
  `"webworker"` — chocan por definiciones de `Event`/`MessageEvent`
  incompatibles), así que `PushEvent`/`NotificationEvent` y los miembros
  reales de `self` (`addEventListener`, `registration`, `clients`) no
  existen en el `WorkerGlobalScope` que ya declaraba este archivo desde
  Sprint 13 (una interfaz propia, no la del navegador). Corregido
  declarando mínimamente esos tipos dentro del mismo `declare global` (sin
  `any`, sin traer la lib completa) — confirmado contra `lib.webworker.d.ts`
  real de TypeScript antes de escribirlos, no adivinado. Ícono corregido a
  `/icons/icon-192.png` (no `/icon-192.png` — confirmado contra
  `manifest.ts` real de Sprint 13, que usa esa carpeta).

- [x] S16-10 — `components/domain/creditos/suscripcion-push-toggle.tsx`
  (Client Component: lee `pushManager.getSubscription()`, activa/desactiva,
  llama a `suscribirPush`/`eliminarSuscripcionPush`) + integración
  condicional (`session.user.rol === "GERENTE"`) en
  `src/app/(app)/creditos/page.tsx`. **Dos desvíos reales, ambos
  encontrados por el linter/compilador antes de llegar al navegador:** (1)
  `Uint8Array.from(...)` en `urlBase64ToUint8Array` infiere
  `Uint8Array<ArrayBufferLike>`, incompatible con el `BufferSource` que
  pide `applicationServerKey` — corregido construyendo el array con
  `new Uint8Array(length)` (backing `ArrayBuffer` real, no
  `ArrayBufferLike`). (2) `setEstado` síncrono dentro del cuerpo de un
  `useEffect` (regla `react-hooks/set-state-in-effect`) — corregido
  moviendo el chequeo de soporte del navegador a un inicializador perezoso
  de `useState` (SSR-safe con `typeof navigator/window`), el `useEffect`
  ahora solo dispara el chequeo async cuando el estado ya es "cargando".

- [x] S16-11 — `src/app/api/cron/creditos-vencidos/route.ts` (verifica
  `CRON_SECRET`, orquesta repositories + `creditosParaNotificar` +
  `enviarNotificacionPush`, limpia suscripciones inválidas, marca
  notificados). Sin desvíos.

- [x] S16-12 — `src/proxy.ts`: `esRutaPublica` incluye
  `pathname.startsWith("/api/cron")`. 2 tests nuevos en
  `tests/integration/rbac/proxy-guard.test.ts` (sin sesión no redirige;
  con sesión de cualquier rol tampoco bloquea por rol).

- [x] S16-13 — `vercel.json` con el cron diario (`0 13 * * *`, 08:00 Lima).

  `npm run typecheck && npm run lint` en verde. `npm test`: 638/638
  (heredados + `webPush.test.ts` nuevo con 6 tests que mockean `web-push`
  para cubrir 404/410/error-transitorio/sin-VAPID — ver justificación del
  desvío en S16-14 abajo).

- [x] S16-14 — Verificación en vivo contra Neon dev real (`npm run dev` +
  navegador Chrome real vía la extensión, más `curl`):
  - `curl` sin `CRON_SECRET`, con uno incorrecto, y con el correcto → `401`,
    `401`, `200` — confirmado.
  - Crédito de prueba real (cliente + venta + crédito, `fechaLimite` =
    ayer) + una `PushSubscription` de prueba → primera invocación del cron
    `{"notificados":1}`, segunda invocación el mismo día
    `{"notificados":0}` (idempotencia confirmada) → `Credito.notificacionVencidoEnviada`
    confirmado `true` en la base tras la primera.
  - Confirmado en el navegador real: `/creditos` como Gerente muestra
    "Activar notificaciones"; al hacer clic dispara el permiso real de
    notificaciones del navegador. Logueado como un Operario de prueba
    (temporal, borrado al terminar), el control NO aparece en `/creditos`
    (confirmado con `get_page_text`, sin el texto "Activar notificaciones"
    en ningún lado de la página).
  - **Limitación real de la herramienta, no un bug:** el prompt nativo de
    permiso de notificaciones del navegador (`Notification.requestPermission()`)
    es un diálogo de Chrome fuera del DOM de la página — la extensión
    Claude in Chrome no puede interactuar con diálogos nativos del
    navegador (mismo tipo de límite que ya documentó
    `memory/estado-proyecto.md` para alertas/confirms de JS). El flujo
    quedó confirmado hasta ahí (pide el permiso real); completar
    "conceder el permiso → recibir el push real" requiere que una persona
    lo haga a mano — **pendiente de que el Product Owner lo confirme una
    vez, idealmente durante el UAT (H7)**.
  - **Limpieza de suscripción 404/410 (H3): no se pudo reproducir en vivo
    con infraestructura real.** Investigado a fondo antes de rendirse:
    `web-push` siempre usa el módulo `https` de Node sin importar el
    protocolo del endpoint (confirmado leyendo su código fuente), así que
    ningún endpoint local (`http://localhost:3000/...`) puede simular un
    404/410 real de un servicio de push (FCM/Mozilla) — se probaron 3
    variantes (DNS inexistente, redirect 307 del propio proxy, error TLS
    contra `http://` local) y las tres, correctamente, dejaron la
    suscripción intacta (no son 404/410). **Cubierto en cambio con
    `tests/unit/lib/webPush.test.ts` (6 tests, mock de `web-push` con un
    `WebPushError` de `statusCode` 404/410/500/sin-código)** — más
    confiable que depender de un servicio de push real para un test
    determinístico.
  - Datos de prueba (cliente, venta, crédito, suscripciones falsas,
    usuarios `e2e.s16.gerente`/`e2e.s16.operario`) borrados al terminar —
    script temporal descartado, mismo criterio de siempre.

- [x] S16-14b — **Verificación en vivo contra producción real (Vercel +
  Neon), no planeada en `plan.md` original** — el permiso nativo del
  navegador y el envío real de un push (pendientes al cierre de S16-14 por
  la limitación de la extensión con diálogos nativos) solo se podían
  confirmar en un dispositivo real, así que el Product Owner pidió saltar
  Preview/PR y mergear esta rama directo a `main` para probar contra
  producción (`git merge --ff-only`, confirmado explícitamente antes de
  hacerlo — desvío real respecto al flujo Preview→PR→main que documenta
  `convenciones.md`, decisión puntual del Product Owner, no un cambio de
  proceso general). Env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `CRON_SECRET`, más las heredadas) cargadas en Vercel
  Production por el Product Owner siguiendo instrucciones paso a paso.

  **Dos bugs reales encontrados y corregidos, ninguno de los dos
  relacionado con Push — los expuso recién esta primera verificación real
  contra Vercel, nunca antes disparados en local:**

  1. **`ServiceWorker script evaluation failed` en producción** — el botón
     "Activar notificaciones" no aparecía porque el Service Worker entero
     no lograba registrarse. Causa raíz: `src/app/serwist/[path]/route.ts`
     (Sprint 13) declaraba `apple-touch-icon.png` a mano en
     `additionalPrecacheEntries` con `revision: VERCEL_GIT_COMMIT_SHA`,
     duplicando la entrada que Serwist ya genera solo (con el hash de
     contenido real del archivo) para todo lo que vive en `public/`. Dos
     revisiones distintas para la misma URL es un conflicto que Serwist
     rechaza al construirse (`add-to-cache-list-conflicting-entries`) —
     nunca se disparaba en local porque ahí `VERCEL_GIT_COMMIT_SHA` no
     existe y cae a un valor fijo; en Vercel cambia en cada deploy, así
     que el conflicto es inevitable en producción real. Diagnosticado
     ejecutando el bundle minificado real descargado de Vercel dentro de
     un mock de `ServiceWorkerGlobalScope` armado con el módulo `vm` de
     Node (sin eso, el único síntoma visible era el mensaje genérico del
     navegador, sin causa). Corregido quitando la entrada duplicada
     (`e3e5e7f`) — bug real de Sprint 13, dormido hasta esta verificación.
  2. **Push seguía fallando ("VAPID no configurado") tras cargar las 5 env
     vars** — las 5 aparecían correctamente nombradas y en el scope
     correcto (Production) en el dashboard de Vercel. Causa raíz:
     `VAPID_SUBJECT` se había guardado como campo "Note" (documentación
     interna de Vercel, nunca llega a `process.env`) en vez de "Value" —
     detectado por un ícono distinto (📄 vs 🔒) junto a esa variable en un
     screenshot del dashboard. Corregido por el Product Owner
     (recargada como Value, `28919ba` forzó el redeploy).

  **Confirmado end-to-end contra infraestructura real** (`curl` directo a
  `/api/cron/creditos-vencidos` en producción, con un crédito y
  suscripciones de prueba reales, reseteando
  `notificacionVencidoEnviada` entre corridas para reenviar a propósito):
  3/3 suscripciones activas del Product Owner recibieron el push real
  (`ok:true`) en su celular (confirmado visualmente por él, "YA ESTÁ") —
  2 suscripciones viejas de pruebas anteriores, ya expiradas, se
  auto-limpiaron solas vía 410 (confirma H3 con infraestructura real, no
  solo con los mocks de `webPush.test.ts`).

  **Cierre:** instrumentación de debug temporal (`debug`/`motivo`,
  agregada en `e9e21e6` para diagnosticar el problema de VAPID_SUBJECT)
  revertida (`5fbdae1`) una vez confirmada la entrega real. Cliente
  "PRUEBA PUSH — borrar" y su Venta/Crédito de prueba borrados de Neon
  (producción — mismo entorno que dev, ver riesgo ya documentado en
  `memory/decisiones-tecnicas.md`).

## 16D — Playwright: 5 flujos críticos

- [x] S16-15 — `npm install -D @playwright/test`, `npx playwright install
  --with-deps chromium` (Chrome for Testing 151.0.7922.34). `npm audit`:
  9 vulnerabilidades, ninguna nueva de `@playwright/test`.
  `playwright.config.ts` (`baseURL: localhost:3000`, `testDir:
  tests/e2e`, `fullyParallel: false`, `workers: 1`, `webServer` con
  `reuseExistingServer: true`). `tests/e2e/helpers.ts` (`prisma` propio,
  `crearUsuarioPrueba`/`borrarUsuarioPrueba`, `login`). **Hallazgo real,
  no de diseño:** `borrarUsuarioPrueba` inicialmente no borraba
  `AuditLog` antes de `Usuario.delete()` — `AuditLog.usuarioId` es
  `onDelete: Restrict`, cualquier mutación real vía `withAuth` (cerrar
  una venta, registrar un abono) deja una fila ahí y bloquea el borrado.
  Encontrado con 3 usuarios de prueba huérfanos reales, corregido
  agregando `auditLog.deleteMany` antes del `usuario.delete` en el
  helper — mismo criterio aplica a `HistorialAbonos.usuarioId`, también
  `Restrict` (encontrado por separado en S16-17).

- [x] S16-16 — `tests/e2e/login.spec.ts` (3 tests: credenciales
  válidas/inválidas de un Usuario de prueba dedicado, ruta protegida sin
  sesión redirige). **Desvío real:** `getByLabel("Contraseña")` sin
  `{exact: true}` matcheaba también el botón "Mostrar contraseña" (su
  `aria-label` contiene "contraseña" como substring, y `getByLabel` hace
  match por substring por defecto) — corregido con `exact: true` en
  usuario/contraseña. 3/3 en verde, sin datos huérfanos.

- [x] S16-17 — `tests/e2e/pos-venta-contado.spec.ts` (`Paquete` DISPONIBLE
  creado directo por Prisma, sin pasar por Recolección/Consolidación —
  no es el objetivo de este flujo). **Desvío real:** el título "Venta
  cerrada" aparece dos veces en pantalla (el toast Y el `<DialogTitle>`
  del comprobante) — corregido acotando el locator a
  `[data-slot="dialog-content"]`. Confirma `Paquete.estado` pasa a
  `VENDIDO`. 1/1 en verde.

- [x] S16-18 — `tests/e2e/pos-venta-credito-abono.spec.ts` (venta a
  crédito + abono desde "Estado de cuenta por cliente" en `/creditos`).
  **Hallazgo real grave, ya corregido:** la primera versión (sin acotar
  el botón "Registrar abono" a la fila del cliente de prueba) hizo clic
  por error en el botón del panel de Alertas — **2 corridas registraron
  2 abonos falsos de S/35.55 contra el crédito real de una clienta
  sembrada en Neon dev (Nancy Marlene Quiroz Ninaquispe)**. Detectado al
  verificar usuarios de prueba huérfanos (bloqueados por
  `HistorialAbonos.usuarioId`, también `onDelete: Restrict`), revertido
  a mano (`HistorialAbonos` falsos borrados, `Credito.montoPagado`
  restaurado a 0) y confirmado en el navegador real (saldo vuelto a
  S/96.00). Corregido acotando el locator a la fila `<li>` que contiene
  el `montoTotal` exacto del crédito de prueba — no vuelve a tocar
  ningún crédito ajeno, verificado con 3 corridas limpias después del
  fix. 1/1 en verde, sin huérfanos.

- [x] S16-19 — `tests/e2e/mortalidad-offline.spec.ts`
  (`context.setOffline(true)`, registra mortalidad, cola confirmada vía
  `page.evaluate` sobre IndexedDB directo — navegar a `/pendientes`
  estando offline falla de verdad, no es una de las 3 pantallas de campo
  cacheadas — `setOffline(false)`, confirma sincronización real contra
  Neon). **Dos hallazgos reales:** (1) el Lote de prueba necesita una
  `HistorialUbicacionLote` real (galpón asignado) — `registrarMortalidad`
  rechaza con "El lote no tiene una ubicación registrada." si no la
  tiene, la primera versión del seed no lo contemplaba. (2)
  `page.on("response")` de Playwright no ve la respuesta de `/api/sync`
  porque `app/sw.ts` la intercepta con una regla `NetworkOnly` — el
  fetch real ocurre en el contexto del Service Worker, invisible al
  dominio de red de Playwright (límite conocido de la herramienta, no un
  bug). Confirmado con logs del propio servidor de desarrollo
  (`POST /api/sync 200`) en vez de depender del listener de red del
  test. La verificación final usa un reintento corto (hasta 5s) sobre la
  consulta a Prisma en vez de una sola lectura inmediata — dos
  disparadores de `sincronizarCola()` (evento "online" + "recién
  montado") pueden competir por unos cientos de ms sin que eso indique
  ningún problema real. 3/3 corridas en verde, sin huérfanos.

- [x] S16-20 — `tests/e2e/lote-alta-mudanza.spec.ts` (alta de lote en un
  galpón de prueba propio con capacidad generosa — no depender de la
  ocupación real de Galpón 1/2 sembrados, que tenían apenas 19 y 1 aves
  de margen libre — mudanza a otro galpón, confirma
  `HistorialUbicacionLote` con la fila vieja cerrada y la nueva abierta).
  **Hallazgo real, mismo tipo D5 que ya documentan varias partes del
  proyecto:** la primera versión llenaba "Fecha de ingreso" con
  `new Date().toISOString()` (UTC crudo) — cerca de la medianoche UTC,
  "hoy" en UTC ya es "mañana" en Lima (UTC-5), y el `max` del propio
  `<input type="date">` (calculado en Lima) rechazó la fecha con un
  tooltip nativo del navegador, sin que ningún error de la app apareciera
  en pantalla. Corregido calculando la fecha con
  `toLocaleDateString("en-CA", { timeZone: "America/Lima" })`, mismo
  truco que ya usa el propio `LoteFormDialog`. 1/1 en verde.

- [x] S16-21 — `npx playwright test` (los 5 specs, 7 tests) corrido junto
  tres veces (dos individuales de estabilidad por spec + una corrida
  conjunta final) — **7/7 en verde, 1.1 min total**. Verificación de
  limpieza final contra Neon dev real (no solo por spec): 0 usuarios,
  clientes, lotes, galpones y paquetes con prefijo `E2E`/`E2E Playwright`
  restantes — y **re-confirmado explícitamente que el crédito real de
  Nancy Marlene Quiroz Ninaquispe (el que se vio afectado durante el
  desarrollo de S16-18) sigue en su estado original** (`montoPagado: 0`,
  sin abonos). `npm run typecheck && npm run lint && npm test` en verde
  (644 tests, sin regresión — vitest no recoge `tests/e2e/*.spec.ts`,
  confirmado explícitamente).

  **Resumen de los 4 hallazgos reales encontrados durante 16D** (ninguno
  es un bug del producto — los 4 fueron errores de diseño de los propios
  tests, corregidos): (1) `AuditLog`/`HistorialAbonos` con
  `onDelete: Restrict` bloqueaban borrar usuarios de prueba si habían
  hecho alguna mutación real — corregido en `helpers.ts`. (2)
  `getByLabel` hace match por substring por defecto — "Contraseña"
  matcheaba también el botón "Mostrar contraseña". (3) **el más serio**:
  un locator sin acotar ("Registrar abono") clickeó por error el crédito
  real de una clienta sembrada en dos corridas seguidas, registrando
  abonos falsos — detectado por los usuarios huérfanos que dejó, revertido
  a mano, y corregido acotando todo locator ambiguo a la fila exacta del
  dato de prueba (mismo criterio aplicado preventivamente en el spec de
  Lotes). (4) fechas UTC crudas vs. América/Lima (D5) en dos lugares
  distintos (`listarDiasDelRango` en Sprint 15, y el formulario de Lote
  acá) — mismo tipo de error, ya con precedente documentado en el
  proyecto antes de este sprint.

## 16E — Auditoría de performance

- [x] S16-22 — Revisión de `server/repositories/*.ts` completo: 7
  archivos con `include` anidado (`credito.ts`, `egreso.ts`, `venta.ts`,
  `lote.ts`, `bitacora.ts`, `precioKilo.ts`, `galpon.ts`). Los 5 primeros
  son includes de un solo nivel sobre FK indexada (bajo riesgo,
  descartados). Confirmados como candidatos reales: `listarLotesConUbicacion`,
  `listarGalponesConOcupacion` (los dos "Galpones/Lotes con joins
  anidados" del roadmap) y `listarVentas` (3 relaciones + count). Se
  agregaron a la auditoría, además, las 4 queries de mayor FRECUENCIA
  real del proyecto (dashboard + `/reportes`, cargan en cada visita):
  `sumarMortalidadEnRango`, `sumarProduccionEnRango`,
  `listarEgresosEnRango`, `listarCreditosPendientesConFechaLimiteEnRango`.

- [x] S16-23 — `EXPLAIN ANALYZE` de las 7 queries contra Neon dev real
  (script temporal con `PrismaClient({log:[{emit:"event",level:"query"}]})`
  para capturar el SQL + parámetros reales que genera Prisma, sustituidos
  en la query antes de correr `EXPLAIN ANALYZE` — descartado al
  terminar). Resultado completo documentado en `memory/estado-proyecto.md`,
  sección "Sprint 16": las 7 muestran `Seq Scan`, confirmado que es la
  decisión correcta del planner al volumen actual (pocas filas por
  tabla) — cada una ya tiene el índice real que necesitaría a mayor
  volumen, confirmado en vivo con `RegistroRecoleccion` (más filas que
  el resto) ya usando su propio índice real
  (`RegistroRecoleccion_creadoEn_revertido_idx`) en vez de `Seq Scan`.

- [x] S16-24 — **Sin hallazgos que corregir** — no se encontró ningún
  caso nuevo del patrón real de Sprint 15 (filtro de fecha sin índice
  aplicable). El índice de `RegistroMortalidad` de S15-26 sigue vigente
  y siendo la fuente de verdad para ese caso. Sin deuda técnica nueva
  documentada, sin migración nueva en esta sección.

## 16F — UAT y manual de usuario

- [x] S16-27 (adelantada, antes de S16-25/26) — `docs/manual-usuario.md`
  escrito: una sección por rol (Gerente/Operario) más una compartida,
  con **7 capturas reales** de la app corriendo en local
  (`docs/img/*.jpg`: login, dashboard, créditos, reportes, lotes, pos,
  mortalidad) tomadas con la extensión Claude in Chrome contra una
  sesión Gerente real — no maquetas. Cubre las pantallas principales de
  ambos roles, el flujo completo de POS, la cola offline, y las
  notificaciones push nuevas de este sprint. **Desvío real respecto al
  plan original:** `plan.md` proponía escribirlo DESPUÉS del UAT (H7,
  "incorporando cualquier confusión real que el Gerente/Operario haya
  mostrado durante la sesión") — se adelantó una primera versión
  completa ahora porque es trabajo que no depende de la participación
  del Product Owner, y se revisa/corrige después de S16-26 con lo que
  salga real del UAT, sin haber esperado ocioso hasta entonces.

- [ ] S16-25 — Coordinar con el Product Owner la sesión de UAT (Gerente +
  Operario) siguiendo el "Guion de UAT" de `plan.md`. **Pendiente de
  agenda real con el Product Owner** — no se puede simular ni adelantar,
  necesita la participación del Gerente y el Operario reales.

- [ ] S16-26 — Ejecutar la sesión de UAT. Documentar cada hallazgo real
  (bug, confusión de UX, pedido de cambio) en `memory/estado-proyecto.md`.
  Revisar `docs/manual-usuario.md` contra los hallazgos reales (S16-27
  ya adelantó una versión completa, esto es la revisión con feedback
  real). **S13-21 (iPhone) NO se agenda como parte de esta sesión** —
  decisión explícita del Product Owner (sin dispositivo disponible por
  ahora, ver spec.md decisión 4 actualizada).

## 16G — Cierre

- [ ] S16-28 — `npm run typecheck && npm run lint && npm test` en verde,
  sin regresión sobre los tests heredados de Sprint 15. Cobertura ≥90% en
  las funciones nuevas de `server/services/credito.ts` confirmada vía
  `coverage-summary.json`.

- [ ] S16-29 — Cierre de sprint: este archivo actualizado con el resultado
  real de cada tarea y cualquier desvío/hallazgo encontrado durante la
  ejecución (mismo criterio que Sprints 1-15). `memory/estado-proyecto.md`
  actualizado con el resumen ejecutivo de cierre de Sprint 16 — último
  sprint del roadmap (Release 4 — Inteligencia).
