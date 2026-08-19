# Tareas — Sprint 14

Checklist de ejecución, misma disciplina de Sprints 1-13: implementar tal
cual `plan.md` (o anotar el desvío real si aparece uno durante la
ejecución) y verificar en código/dispositivo real (no solo dar por buena
la tarea al escribirla). Orden tal cual "Orden de ejecución" de `plan.md`
— hay dependencias reales entre tareas, no saltear el orden sin motivo.

**Ninguna tarea está ejecutada todavía.** Este archivo se llena (`[x]`,
con el resultado real y cualquier desvío) a medida que se ejecuta cada
tarea, tal como quedaron documentadas las de
`specs/sprint-12-egresos-personal/tasks.md` y
`specs/sprint-13-pwa-instalacion/tasks.md`.

División 14A/14B confirmada en `spec.md` (decisión de negocio 2): 14A
cierra con la cola sincronizando sola en camino feliz; 14B agrega
visibilidad y control sobre los casos límite. No arrancar 14B sin haber
cerrado y verificado 14A.

## 14A — cola local + interceptor + sync camino feliz

- [ ] S14-1 — Spike: confirmar que `auth()` (`server/auth/index.ts`)
  resuelve la sesión igual dentro de un Route Handler (`app/api/sync/route.ts`
  mínimo, sin lógica de negocio todavía) que dentro de una Server Action
  — riesgo R1 de `spec.md`. Si no resolviera, documentar acá el plan B
  antes de seguir con S14-6.

- [ ] S14-2 — Migración de schema: `RegistroMortalidad.creadoEnCliente`
  y `BitacoraGlobal.creadoEnCliente` (`DateTime?`, nullable, sin backfill
  — mismo criterio que `RegistroRecoleccion.creadoEnCliente` de Sprint 5).
  `fecha` no se toca ni se renombra (ver "Divergencia de nombre" en
  `plan.md`). `npx prisma migrate dev --name sprint14_creado_en_cliente` +
  `npx prisma validate`. Actualizar `memory/modelo-datos.md` con los 2
  campos nuevos en el mismo PR.

- [ ] S14-3 — `lib/zod/mortalidad.ts` y `lib/zod/bitacora.ts`: agregar
  `creadoEnCliente: z.coerce.date()` a `crearRegistroMortalidadSchema` y
  `crearNotaBitacoraSchema`, mismo patrón que `crearRecoleccionSchema`
  (`lib/zod/recoleccion.ts`).

- [ ] S14-4 — `server/repositories/mortalidad.ts` y `bitacora.ts`:
  `registrarMortalidadYDescontarAves`/`crearNotaBitacora` (repository)
  pasan `creadoEnCliente` al `data` del `create`. `server/actions/mortalidad.ts`
  y `bitacora.ts`: pasan el campo nuevo del input validado al repository —
  la comparación de idempotencia sobre `P2002` sigue sin incluir
  `creadoEnCliente` (ver nota en `plan.md`, sección del mismo nombre).

- [ ] S14-5 — `npm install dexie@4.4.5 dexie-react-hooks@4.4.0` (versión
  estable más reciente confirmada contra `npm view` al planificar —
  reconfirmar que sigue siendo la última al ejecutar, mismo criterio que
  S13-2; peerDependencies `dexie >=4.2.0-alpha.1 <5.0.0`, `react >=16`,
  satisfechos por React 19.2.4). `src/lib/offline/db.ts`: definición de
  `dbOffline` (Dexie) + tipos `TipoColaOffline`/`EstadoColaOffline`/
  `ItemColaOffline`, tal cual `plan.md`. `src/lib/offline/cola.ts`:
  `encolar`, `listarPendientes`, `marcarEnviando`, `marcarPendiente`,
  `marcarOk`, `marcarError`, `descartar`.

- [ ] S14-6 — `src/app/api/sync/route.ts`: `POST` completo — valida el
  body con Zod (`itemSchema`/`bodySchema`, tope de 25 ítems), despacha
  cada ítem al handler correspondiente (`HANDLERS` — reutiliza
  `registrarMortalidad`/`crearNotaBitacora`/`registrarRecoleccion` tal
  cual existen, sin duplicar lógica), procesa **secuencial** (no
  `Promise.all`), devuelve `{ resultados: [{idLocal, ok, ...}] }`.

- [ ] S14-7 — `src/lib/offline/sincronizador.ts`: `sincronizarCola()` —
  lee pendientes, agrupa en lotes de 25, marca `ENVIANDO`, hace `fetch`
  a `/api/sync`, reconcilia cada resultado (`OK`/`ERROR` según
  `resultado.ok`; vuelve a `PENDIENTE` si el `fetch` mismo falla — nunca
  `ERROR` por un fallo de red, ver distinción transitorio/permanente en
  `plan.md`).

- [ ] S14-8 — Interceptor en los 3 dialogs: `registrar-mortalidad-dialog.tsx`,
  `nueva-nota-bitacora-dialog.tsx`, `registrar-recoleccion-dialog.tsx`.
  Cada uno pasa a construir un payload como objeto plano (no `FormData`,
  Mortalidad y Bitácora se alinean al patrón que Recolección ya usa) con
  `creadoEnCliente: new Date()`. El `catch` ya marcado desde Sprint 13
  reemplaza `"Sin conexión..."` por `encolar(tipo, payload)` + toast de
  éxito ("Guardado sin conexión... se enviará solo") + `onExito()` (mismo
  cierre que un guardado online exitoso) — tal cual el "Antes/Después" de
  `plan.md`.

- [ ] S14-9 — Disparadores de `sincronizarCola()`: listener del evento
  `online` (mismo mecanismo que `ConnectivityIndicator`, no uno nuevo) +
  llamada al montar el Shell autenticado (mismo criterio que
  `PrecargarCatalogos`, Sprint 13).

- [ ] S14-10 — `npm install -D fake-indexeddb` (necesaria: `vitest.config.mts`
  corre en `environment: "node"`, sin `indexedDB` global — confirmado que
  no existe ningún mock de IndexedDB en el proyecto todavía). Tests
  unitarios: `tests/unit/offline/cola.test.ts` (Dexie real contra
  `fake-indexeddb/auto`, importado solo en este archivo) cubriendo las
  transiciones de estado; `tests/unit/offline/sincronizador.test.ts`
  (mockeando `fetch` y los métodos de `cola.ts`) cubriendo: éxito
  completo, ítem con error de negocio, fallo de red a mitad de lote, más
  de 25 ítems (2+ lotes). Tests de integración
  `tests/integration/api/sync.test.ts` (mismo patrón de carpeta anidada
  que `integration/actions/`, `integration/auth/`; mockeando los 3
  handlers de `HANDLERS` vía `vi.mock`, no una BD real) cubriendo: lote
  mixto (algunos ok, algunos error, sin que uno tumbe a los demás),
  reenvío del mismo lote (idempotencia end-to-end), body inválido (400).

- [ ] S14-11 — `npx vitest run --coverage` — 100%/100% en
  `lib/offline/cola.ts`, `sincronizador.ts` y `app/api/sync/route.ts`.
  `npm run typecheck && npm run lint && npm test` en verde.

- [ ] S14-12 — Verificación en vivo contra Neon real (no solo tests):
  cortar red real (DevTools "Offline" o modo avión en dispositivo),
  guardar un registro en cada una de las 3 pantallas, confirmar que el
  diálogo se cierra como éxito y el ítem queda `PENDIENTE` (inspeccionar
  IndexedDB en DevTools), recuperar señal, confirmar sincronización
  automática sin duplicar contra Neon real (verificar en la tabla
  correspondiente, no solo confiar en el estado `OK` local). Confirmar
  también que la ventana de gracia de 10 minutos del registro
  recién sincronizado arranca desde el momento de la sincronización, no
  desde la captura offline (decisión de negocio 4, `spec.md`).

## 14B — pantalla de pendientes, reintento manual, edge cases

*(No arrancar hasta cerrar y verificar 14A completo.)*

- [ ] S14-13 — `src/components/domain/offline/pantalla-pendientes.tsx` +
  `src/app/(app)/pendientes/page.tsx`: lista reactiva de la cola local
  (`useLiveQuery` de `dexie-react-hooks`), sin restricción de rol en
  `server/auth/rbac.ts` (`RUTAS_POR_ROL` no gana una entrada nueva — la
  ruta queda abierta a cualquier autenticado, decisión de negocio 5).
  Cada fila: tipo (mismo set de íconos que los 3 dialogs), badge de
  estado (`globals.css`, receta nueva por estado — `.badge-cola-*`, sin
  pisar los tonos ya usados por otros badges de estado del proyecto),
  motivo si `ERROR`.

- [ ] S14-14 — Botón "Reintentar" por ítem (llama `sincronizarCola()`
  acotado a ese ítem — o al lote completo si acotarlo a uno solo agrega
  complejidad desproporcionada, decidir y documentar acá al implementar).

- [ ] S14-15 — Botón "Descartar" con confirmación explícita — mismo
  patrón que `EliminarNotaBitacoraDialog` (`<Dialog>` + botón
  `variant="destructive"`, nunca `window.confirm()`; confirmado que no
  existe ningún `<AlertDialog>` en `components/ui/`, no hay que buscarlo)
  → `descartar(id)` de `cola.ts`. Nunca automático, nunca sin
  confirmación (decisión de negocio 6, `spec.md`).

- [ ] S14-16 — Badge de conteo de pendientes (`PENDIENTE` + `ERROR`) en
  el Shell, mismo lugar/criterio de visibilidad que `ConnectivityIndicator`
  (footer del Sidebar) — enlaza a `/pendientes`.

- [ ] S14-17 — Sin test de render para `pantalla-pendientes.tsx`: el
  proyecto entero no tiene un solo test que renderice un componente React
  (confirmado — `vitest.config.mts` corre en `environment: "node"`, sin
  `jsdom`; `include` solo matchea `.test.ts`, ningún `.tsx`) — se
  verifica en vivo (S14-18/19), mismo criterio que el resto de los
  componentes `domain/*` del proyecto. `npm run typecheck && npm run
  lint && npm test` en verde (sin regresión sobre lo ya cubierto en
  S14-11).

- [ ] S14-18 — Verificación en vivo: con ítems `PENDIENTE` en la cola,
  cerrar sesión y volver a iniciar sesión en el mismo dispositivo/navegador
  — confirmar que la cola sigue completa en IndexedDB (DevTools) y que
  sincroniza con la sesión activa en ese momento. Dejar constancia
  explícita del riesgo de atribución de autoría (decisión de negocio,
  `spec.md`) si se observa en la verificación.

- [ ] S14-19 — Verificación en vivo: forzar un error permanente real —
  encolar un registro de Mortalidad/Recolección para un lote, finalizar
  ese lote antes de reconectar, reconectar y confirmar que el ítem queda
  en `ERROR` visible con el motivo real del servidor, sin descartarse
  solo, y que los demás ítems del mismo lote de sync sí procesan bien
  (independencia entre ítems).

- [ ] S14-20 — Cierre de sprint: actualizar `memory/estado-proyecto.md`
  (sección "Sprint 14") y `specs/roadmap-completo.md` (marcar Sprint 14
  completo, actualizar "Estado actual del proyecto" y el porcentaje de
  progreso) con el resultado real de ejecución, cualquier desvío
  encontrado, y el resultado de las verificaciones en vivo de S14-12,
  S14-18 y S14-19.
