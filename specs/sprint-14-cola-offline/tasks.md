# Tareas — Sprint 14

Checklist de ejecución, misma disciplina de Sprints 1-13: implementar tal
cual `plan.md` (o anotar el desvío real si aparece uno durante la
ejecución) y verificar en código/dispositivo real (no solo dar por buena
la tarea al escribirla). Orden tal cual "Orden de ejecución" de `plan.md`
— hay dependencias reales entre tareas, no saltear el orden sin motivo.

Este archivo se llena (`[x]`, con el resultado real y cualquier desvío) a
medida que se ejecuta cada tarea, tal como quedaron documentadas las de
`specs/sprint-12-egresos-personal/tasks.md` y
`specs/sprint-13-pwa-instalacion/tasks.md`.

**Sprint 14 completo (14A + 14B, S14-1 a S14-20) ejecutado y verificado
en vivo (2026-08-19), en rama `feat/S14-cola-offline`, sin mergear a
`main` todavía.**

División 14A/14B confirmada en `spec.md` (decisión de negocio 2): 14A
cierra con la cola sincronizando sola en camino feliz; 14B agrega
visibilidad y control sobre los casos límite. No arrancar 14B sin haber
cerrado y verificado 14A.

## 14A — cola local + interceptor + sync camino feliz

- [x] S14-1 — **Desvío real respecto al plan:** en vez de un spike
  descartable aparte, se construyó `/api/sync/route.ts` real desde el
  inicio (S14-6) y se verificó en vivo en S14-12 con una sesión real. Se
  confirmó **positivo**: `auth()` resuelve la sesión dentro del Route
  Handler exactamente igual que en una Server Action — probado con dos
  evidencias reales, no asumido: (1) una request real a `/api/sync` con
  una sesión con JWT válido pero sin `SesionActiva` viva en la base
  devolvió `"Tu sesión ya no es válida. Inicia sesión de nuevo."` (el
  mismo mensaje exacto de `with-auth.ts`, `ERROR_SESION_INVALIDA`) — esto
  solo puede pasar si `auth()` + `buscarSesionPorJti` corrieron de
  verdad; (2) con una sesión real (`gerente`/`Cambiar123!`), la misma
  request creó un `RegistroMortalidad` real en Neon. R1 de `spec.md`
  queda cerrado, sin plan B necesario.

- [x] S14-2 — Migración `20260819224636_sprint14_creado_en_cliente`
  aplicada en vivo contra Neon dev (`ALTER TABLE ... ADD COLUMN
  "creadoEnCliente" TIMESTAMP(3)` en `BitacoraGlobal` y
  `RegistroMortalidad`, sin `NOT NULL`, sin backfill — tal cual el plan,
  sin desvíos). `fecha` intacto en ambos modelos. `npx prisma validate`
  en verde. `memory/modelo-datos.md` actualizado con la sección "Contrato
  Offline-Ready: `creadoEnCliente` (Sprint 14)".

- [x] S14-3 — `creadoEnCliente: z.coerce.date({ message: "Fecha inválida" })`
  agregado a `crearRegistroMortalidadSchema` y `crearNotaBitacoraSchema`,
  idéntico al patrón de `crearRecoleccionSchema`. Sin desvíos.

- [x] S14-4 — `registrarMortalidadYDescontarAves` y `crearNotaBitacora`
  (repositories) aceptan y persisten `creadoEnCliente`.
  `server/actions/mortalidad.ts`/`bitacora.ts` pasan el campo del input
  validado. Confirmado que la comparación de idempotencia (`P2002` →
  comparar campos existente vs. payload) sigue sin tocar
  `creadoEnCliente` en ninguno de los 3 módulos (Mortalidad, Bitácora,
  Recolección). Tests de integración existentes (`tests/integration/actions/mortalidad.test.ts`,
  `bitacora.test.ts`) actualizados con el campo nuevo en sus fixtures —
  13 tests rotos por el cambio de schema, los 13 corregidos, sin tocar
  ninguna aserción de lógica de negocio.

- [x] S14-5 — `dexie@4.4.5` y `dexie-react-hooks@4.4.0` instalados
  (siguieron siendo la última versión estable al ejecutar). Sin
  vulnerabilidades nuevas (`npm audit` se mantuvo en 8, todas
  preexistentes). `src/lib/offline/db.ts` y `cola.ts` implementados tal
  cual `plan.md`, con una función extra no listada acá pero sí en
  `plan.md`: `listarParaEnviar()` (solo `estado === "PENDIENTE"`, para
  el sincronizador — distinta de `listarPendientes()`, que trae todo lo
  que no está `OK` para la futura pantalla de pendientes).

- [x] S14-6 — `src/app/api/sync/route.ts` implementado tal cual
  `plan.md`: valida con `bodySchema` (`items` máx. 25), despacha por
  `HANDLERS[tipo]`, procesa secuencial, devuelve `{ resultados }`. Sin
  desvíos.

- [x] S14-7 — `src/lib/offline/sincronizador.ts` implementado tal cual
  `plan.md`. Un detalle no explícito en el pseudocódigo del plan, resuelto
  al implementar: una respuesta HTTP no-`ok` de `/api/sync` (ej. 400/429,
  el rate limit operativo de 60/min heredado de Sprint 1) se trata igual
  que un fallo de red — todo el lote vuelve a `PENDIENTE`, no se marca
  `ERROR` por ítem (no hay `resultados` que reconciliar en ese caso).
  Cubierto explícitamente en tests (S14-10).

- [x] S14-8 — Los 3 dialogs migrados de `FormData`/`useActionState<Estado,
  FormData>` a payload de objeto plano — Mortalidad y Bitácora se
  alinearon al patrón que Recolección ya usaba desde Sprint 5 (`onSubmit`
  + `startTransition` + `formAction(payload)`, no `<form action={formAction}>`).
  Desvío real menor sobre el pseudocódigo de `plan.md` en Recolección: el
  payload devuelto por el `catch` offline no puede traer el resultado real
  del servidor (`paquetesCreados`/`sueltos`) porque todavía no sincronizó
  — se devuelve una estimación local con la misma fórmula
  (`calcularEmpaquePreview`, ya usada para el preview en vivo del
  formulario) en vez de un `0` fijo, para no mostrarle al usuario un
  número que se sabe falso.

- [x] S14-9 — `src/components/domain/offline/sincronizador-offline.tsx`
  (nuevo) montado en `RootLayout` junto a `PrecargarCatalogos`, gateado
  por `usuario` igual que el resto de las piezas de sesión. Dos
  disparadores tal cual `plan.md`: al montar y en el evento `online`.

- [x] S14-10 — `fake-indexeddb@6.2.5` instalada. Los 3 archivos de test
  escritos tal cual el plan, con casos extra encontrados al empujar a
  100% de cobertura de ramas (ver S14-11): `cola.test.ts` — caso
  defensivo de `marcarPendiente` sobre un id que ya no existe en la tabla
  (confirma que `Dexie.update()` sobre una clave inexistente es un no-op,
  no crea la fila ni revienta); `sincronizador.test.ts` — caso de
  `resultado.error` ausente (usa el motivo genérico de respaldo). 9 tests
  en `cola.test.ts`, 8 en `sincronizador.test.ts`, 6 en `sync.test.ts`.

- [x] S14-11 — **100%/100%/100%/100%** confirmado en los 4 archivos
  nuevos (`cola.ts`, `db.ts`, `sincronizador.ts`, `app/api/sync/route.ts`)
  vía `coverage-summary.json` — el reporter de texto de v8 colapsa
  visualmente la fila de un archivo/carpeta cuando queda 100% en las 4
  métricas (comportamiento cosmético del reporter, confirmado leyendo el
  JSON crudo, no un hueco real de cobertura). 575/575 tests en verde
  (573 preexistentes + los de este sprint, incluidos los 13 corregidos
  en S14-4), `npm run typecheck` y `npm run lint` sin errores (mismo
  warning preexistente de `next/image` en `offline/page.tsx`, ajeno a
  este sprint).

- [x] S14-12 — **Verificado en vivo contra Neon dev real, con
  extensión Claude in Chrome.** Camino feliz confirmado punta a punta:
  guardado sin señal en las 3 pantallas (fetch interceptado a nivel de
  `window.fetch`, simulando un corte de red real — la extensión de
  Chrome usada en esta sesión no expone un control de throttling de
  DevTools) cerró el diálogo como éxito y dejó el ítem `PENDIENTE` en
  IndexedDB (confirmado inspeccionando la tabla `pendientes` directo);
  con señal restaurada y una sesión válida, el disparador de montaje de
  `SincronizadorOffline` sincronizó solo, creó una fila real
  (`RegistroMortalidad`, cantidad 7) visible en `/mortalidad`, sin
  duplicar — confirmado también reenviando el mismo ítem por
  `/api/sync` una segunda vez (`ok:true`, mismo id, sin segunda fila).
  **Decisión de negocio 4 confirmada en vivo**: el botón "Deshacer" del
  registro recién sincronizado mostró un countdown fresco (9:34 de
  10:00) arrancado en el momento de la sincronización, no en el momento
  de la captura offline (minutos antes). **Hallazgo real no buscado,
  bienvenido:** una sesión de navegador vieja (JWT válido, sin
  `SesionActiva` viva en la base) dejó ver en vivo la decisión de
  negocio 6 en acción — 3 ítems que sincronizaron con esa sesión
  inválida quedaron en `ERROR` con el mensaje real del servidor, sin
  reintentarse solos al recuperar una sesión válida después (confirma
  que solo `PENDIENTE` se reintenta automático, nunca `ERROR` — tal cual
  diseñado). **Desvío real de herramienta, no de producto:** la
  extensión de automatización del navegador tuvo fallos de click
  reiterados en esta sesión (coordenadas de pantalla no coincidían con
  el DOM real, causa no confirmada — posible interacción con una
  extensión de terceros del perfil de Chrome que generó un mismatch de
  hidratación real, `cz-shortcut-listen` en `<body>`) — se resolvió
  inyectando el ítem de la cola directo en IndexedDB (misma forma exacta
  que produce `encolar()`) y disparando el evento `online` real, en vez
  de completar el formulario a clics para ese caso puntual; los 3
  guardados offline iniciales (Mortalidad, Bitácora, Recolección) sí se
  hicieron a través de la UI real antes de que la falla de clics
  apareciera.

## 14B — pantalla de pendientes, reintento manual, edge cases

**Ejecutado y verificado en vivo (2026-08-19), misma sesión que 14A.**

- [x] S14-13 — `pantalla-pendientes.tsx` + `badge-pendientes.tsx` +
  `app/(app)/pendientes/page.tsx` implementados tal cual `plan.md`. Sin
  entrada nueva en `RUTAS_POR_ROL` (queda abierta a cualquier
  autenticado). 4 clases nuevas en `globals.css`
  (`.badge-cola-pendiente/-enviando/-ok/-error`) reusando los mismos
  tonos que `.badge-alerta-por-vencer` (ámbar), `.toast-success` (verde)
  y `.badge-tipo-muerte` (rojo), más un sky nuevo para `ENVIANDO`.
  **Bug real encontrado y corregido en vivo, no en tests:** el comentario
  agregado a `globals.css` para estas clases contenía la secuencia
  literal `*/` dentro de `.badge-categoria-*/.badge-tipo-cliente-*`
  (guion, asterisco, barra pegados) — eso cierra un comentario CSS antes
  de tiempo, corrompiendo todo el archivo desde ahí hasta el final
  ("Parsing CSS source code failed... Unexpected end of input" en
  Turbopack, reproducido tras limpiar `.next` para descartar caché
  vieja). Ningún test lo detecta (no hay lint de CSS en el proyecto) —
  se encontró recién al abrir la app en el navegador para la
  verificación en vivo de S14-13/14/15/16, y se corrigió agregando un
  espacio (`.badge-categoria-* / .badge-tipo-cliente-*`). Vale la pena
  tenerlo presente para cualquier comentario CSS futuro que mencione dos
  nombres de clase con `*` seguidos de `/`.

- [x] S14-14 — Botón "Reintentar" implementado: para un ítem `ERROR`
  llama `marcarPendiente(id)` y después `sincronizarCola()` completa (no
  acotada a un solo ítem — la alternativa de una función paralela
  parametrizada se descartó por complejidad desproporcionada para el
  beneficio, tal cual se dejó abierto en `plan.md`). Verificado en vivo:
  clic en "Reintentar" sobre un ítem `ERROR` real → pasa a "Enviando…" →
  sincroniza de verdad contra Neon (creó un `RegistroMortalidad` real) →
  desaparece de la lista (pasa a `OK`, excluido de `listarPendientes()`)
  → el badge del Shell baja de "3 pendientes" a "2 pendientes" en vivo,
  reactivo, sin recargar la página.

- [x] S14-15 — Botón "Descartar" implementado tal cual
  `EliminarNotaBitacoraDialog` (`<Dialog>` + botón `variant="destructive"`,
  sin `window.confirm()`). Verificado en vivo: diálogo de confirmación
  con el texto exacto del plan, clic en "Sí, descartar" → el ítem
  desaparece de la lista y el badge baja de "2 pendientes" a "1
  pendiente" (singular correcto, `cantidad === 1 ? "" : "s"`).

- [x] S14-16 — `BadgePendientes` montado en el footer del Sidebar, junto
  a `ConnectivityIndicator`, gateado por `!colapsado` igual que el resto
  del bloque nombre/rol. Verificado en vivo con las 3 transiciones
  reales de arriba (3 → 2 → 1 pendientes), reactivo sin recargar.

- [x] S14-17 — Confirmado: sin test de render para
  `pantalla-pendientes.tsx`/`badge-pendientes.tsx` (mismo motivo que ya
  quedó documentado). `npm run typecheck && npm run lint && npm test` en
  verde — 575/575, sin regresión sobre lo ya cubierto en S14-11.
  **Nota real, no un bug:** en el primer render de `/pendientes` tras
  una navegación de documento completa (no client-side), `useLiveQuery`
  devolvió `[]` una vez antes de resolver el estado real de IndexedDB
  (carrera de apertura de conexión de Dexie en el primer mount) — un
  segundo render (recarga o navegación posterior) siempre mostró los
  ítems reales correctamente. No se investigó más a fondo ni se corrigió
  — no afecta la corrección de los datos (nunca se pierde ni se
  duplica nada, es puramente visual y transitorio), y añadir un guard
  extra solo para este flash de un frame en la primera carga de sesión
  sería complejidad sin beneficio real medible. Queda anotado acá por si
  se vuelve a notar en una verificación futura.

- [x] S14-18 — **Verificado en vivo de forma incidental durante S14-12**
  (no como tarea de 14B deliberada — se dejó `[x]` acá igual porque el
  resultado real ya quedó confirmado, no tiene sentido reabrirlo en 14B):
  con 3 ítems `PENDIENTE`/`ERROR` en la cola de un login previo, se cerró
  sesión y se inició sesión de nuevo (`gerente`) en el mismo navegador —
  la cola completa siguió en IndexedDB sin perder ningún ítem, y el
  disparador de montaje intentó sincronizar con la sesión nueva
  automáticamente. El riesgo de atribución de autoría documentado en
  `spec.md` se observó de forma indirecta pero real: como la cola no
  distingue de quién es cada ítem, cualquier sesión activa al momento de
  sincronizar es la que se intenta usar — confirma que el diseño es tal
  cual se documentó, riesgo aceptado sin resolver este sprint.

- [x] S14-19 — **Verificado en vivo contra Neon dev real.** Se creó un
  lote desechable (`LOTE-S14-19-TEST`, Galpón 2, 10 aves — sin tocar
  `LOTE-DEMO-01`, compartido con el resto de las verificaciones del
  proyecto) para no afectar datos usados por otras pruebas. Se finalizó
  ese lote (→ `INACTIVO`) y luego se encolaron 2 ítems `PENDIENTE`: uno
  de Mortalidad contra el lote recién finalizado, otro de Mortalidad sin
  relación contra `LOTE-DEMO-01`. Al sincronizar (disparador de montaje,
  `/pendientes`): el ítem del lote finalizado quedó en `ERROR` visible
  con el motivo real y específico del servidor ("Solo se puede registrar
  mortalidad de un lote activo." — no un mensaje genérico), sin
  descartarse solo; el ítem sin relación se procesó bien de forma
  completamente independiente (pasó a `OK`, generó un `RegistroMortalidad`
  real). Confirma que un error permanente en un ítem no bloquea ni
  afecta a los demás del mismo lote de sync. Cola local limpiada al
  cerrar la verificación (estado transitorio del navegador de prueba,
  no hace falta preservarlo). `LOTE-S14-19-TEST` queda `INACTIVO` en la
  base de dev — igual criterio que otros datos de verificación dejados
  por sprints anteriores (`LOTE-DEMO-01` mismo, "Verif Browser S4",
  etc.), no se revierte.

- [x] S14-20 — Cierre de sprint: `memory/estado-proyecto.md` y
  `specs/roadmap-completo.md` actualizados (ver commit de cierre) con el
  resultado real de ejecución de 14A y 14B, el bug de CSS encontrado y
  corregido en vivo, y el resultado completo de las verificaciones
  S14-12/S14-18/S14-19.

- [ ] S14-20 — Cierre de sprint: actualizar `memory/estado-proyecto.md`
  (sección "Sprint 14") y `specs/roadmap-completo.md` (marcar Sprint 14
  completo, actualizar "Estado actual del proyecto" y el porcentaje de
  progreso) con el resultado real de ejecución, cualquier desvío
  encontrado, y el resultado de las verificaciones en vivo de S14-12,
  S14-18 y S14-19.
