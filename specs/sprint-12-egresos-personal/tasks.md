# Tareas — Sprint 12

Checklist de ejecución, misma disciplina de Sprints 1-11: implementar tal
cual `plan.md` (o anotar el desvío real si aparece uno durante la
ejecución) y verificar en código real (no solo dar por buena la tarea al
escribirla). Orden tal cual "Orden de ejecución" de `plan.md` — hay
dependencias reales entre tareas, no saltear el orden sin motivo.

**Ninguna tarea está ejecutada todavía** — este archivo se llena (`[x]`,
con el resultado real y cualquier desvío) a medida que se ejecuta cada
tarea, tal como quedaron documentadas las de `specs/sprint-11-creditos-cobranza/tasks.md`.

- [x] S12-1 — Migración de schema: `Egreso` gana `creadoEn`, `revertido`,
  `revertidoEn` + índice `[creadoEn, revertido]`; `SueldoMovimiento` gana
  `revertido`, `revertidoEn` + índice `[empleadoId, fecha, revertido]`
  (reemplaza `[empleadoId, fecha]`). Implementado sin desvíos de diseño —
  migración `20260818155646_egreso_sueldo_ventana_gracia`, confirmada no
  destructiva (`ADD COLUMN ... DEFAULT` + 1 `DROP INDEX`/2 `CREATE INDEX`,
  sin filas existentes en ninguno de los dos modelos todavía).

  **Desvío real, no de diseño:** `npx prisma migrate dev` aplicó la
  migración contra Neon y generó el cliente, pero `prisma generate` falló
  con `EPERM` (Windows) al no poder reemplazar
  `query_engine-windows.dll.node` — un `npm run dev` seguía corriendo en
  el puerto 3000 (PID 12976) con el motor de Prisma cargado. Confirmado
  con el Product Owner, se terminó ese proceso (`taskkill /PID 12976 /F`)
  y se reintentó `npx prisma generate` con éxito.

  Verificado `npx prisma validate` (en verde, dos veces: antes y después
  de matar el proceso) y `npm run typecheck` (sin errores) tras
  regenerar el cliente.

- [x] S12-2 — `server/services/egreso.ts` (nuevo): `puedeRevertirEgreso`
  tal cual `plan.md`, sin desvíos. Tests en `tests/unit/services/egreso.test.ts`
  (5 casos): ya revertido; dentro de la ventana (5 min); exactamente en
  el límite de 10 min; pasado el límite (10 min y 1 seg); un caso extra
  documentando explícitamente que la función ni siquiera recibe `fecha`
  como parámetro — solo `creadoEn` puede afectar el resultado, editar
  `fecha` (decisión 1) nunca reabre ni cierra la ventana.

  Verificado `npm run typecheck && npm run lint && npm test` — **465/465
  en verde** (5 nuevos sobre los 460 heredados de Sprint 11). Coverage de
  `server/services/egreso.ts` con `npx vitest run --coverage
  --coverage.all --coverage.include="src/server/services/egreso.ts"`:
  **100% statements (6/6), 100% branches (4/4), 100% funciones (1/1),
  100% líneas (6/6)**. `coverage/` borrado al terminar.

- [x] S12-3 — `server/services/sueldo-movimiento.ts` (nuevo):
  `puedeRevertirSueldoMovimiento`, `calcularRangoMesCalendario`,
  `calcularNetoMensual` tal cual `plan.md`, sin desvíos. Tests en
  `tests/unit/services/sueldo-movimiento.test.ts` (11 casos): ventana de
  gracia (mismos 4 casos que S12-2, anclada a `fecha`);
  `calcularRangoMesCalendario` para un mes cualquiera, cruce de
  diciembre→enero del año siguiente, y enero sin retroceder al año
  anterior; `calcularNetoMensual` con los 4 tipos combinados (signo
  correcto), lista vacía (sin dividir por cero), un tipo ausente ese mes
  (queda en 0, no `undefined`/`NaN`), y varios movimientos del mismo tipo
  sumados (neto puede dar negativo, caso válido — un mes solo de
  adelantos antes de cargar el sueldo base).

  Verificado `npm run typecheck && npm run lint && npm test` — **476/476
  en verde** (11 nuevos sobre los 465 heredados de S12-2). Coverage de
  `server/services/sueldo-movimiento.ts`: **100% statements (18/18),
  100% branches (8/8), 100% funciones (6/6), 100% líneas (16/16)**.
  `coverage/` borrado al terminar.

- [x] S12-4 — `lib/zod/egreso.ts` (nuevo): `crearEgresoSchema`,
  `editarEgresoSchema`, `revertirEgresoSchema` tal cual `plan.md`, sin
  desvíos. Tests en `tests/unit/lib/zod-egreso.test.ts` (12 casos):
  payload válido; monto cero rechazado; monto negativo rechazado;
  descripción vacía (solo espacios) rechazada; categoría fuera de los 5
  valores reales rechazada; fecha hoy exacto aceptada (mismo criterio de
  huso horario que `zod-lote.test.ts`, `vi.useFakeTimers`); fecha futura
  rechazada con el mensaje exacto; id con formato inválido rechazado;
  `editarEgresoSchema` con los mismos campos (payload válido y fecha
  futura rechazada); `revertirEgresoSchema` con id válido e inválido.

  Verificado `npm run typecheck && npm run lint && npm test` — **488/488
  en verde** (12 nuevos sobre los 476 heredados de S12-3).

- [x] S12-5 — `lib/zod/empleado.ts` (nuevo): `crearEmpleadoSchema`,
  `editarEmpleadoSchema`, `cambiarEstadoEmpleadoSchema` tal cual
  `plan.md`. **Un desvío chico respecto al helper `opcional()`:** en vez
  de extraerlo a `lib/zod/comun.ts`, se duplicó localmente igual que ya
  hacen `usuario.ts` y `cliente.ts` (tercera copia idéntica) — se siguió
  el precedente real del proyecto (`opcional()` nunca se extrajo pese a
  ya tener 2 copias desde Sprint 8/9), a diferencia de `hoyEnLima()` que
  sí se extrajo en Sprint 11 al tener un segundo consumidor. No es una
  decisión nueva, es coherencia con cómo ya está el código.

  Tests en `tests/unit/lib/zod-empleado.test.ts` (9 casos): payload
  válido con y sin celular/cargo; celular/cargo con string vacío se
  normalizan a `undefined` (no error); nombre vacío rechazado (crear y
  editar); id con formato inválido rechazado; un `usuarioId` forzado en
  el payload se descarta en silencio (Zod `strip` por defecto, decisión
  5: nunca llega al `data` parseado); `cambiarEstadoEmpleadoSchema` con
  ambos valores reales y uno inventado rechazado.

  Verificado junto con S12-6 (ambas se implementaron y corrieron en la
  misma tanda) — ver el conteo final en S12-6.

- [x] S12-6 — `lib/zod/sueldo-movimiento.ts` (nuevo):
  `crearSueldoMovimientoSchema`, `revertirSueldoMovimientoSchema` tal
  cual `plan.md`, sin desvíos (mismo `opcional()` local que S12-5, tercer
  archivo con la misma copia). Sin campo `fecha` en el schema de crear,
  confirmado — `SueldoMovimiento.fecha` la pone el servidor siempre.

  Tests en `tests/unit/lib/zod-sueldo-movimiento.test.ts` (12 casos):
  payload válido con y sin descripción; descripción con string vacío se
  normaliza a `undefined`; monto cero o negativo rechazado; tipo fuera de
  los 4 valores reales rechazado; los 4 tipos reales aceptados
  individualmente; `empleadoId`/`id` con formato inválido rechazados;
  `revertirSueldoMovimientoSchema` con id válido e inválido.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **509/509 en verde** (21 nuevos entre S12-5 y S12-6, sobre los 488
  heredados de S12-4).

- [x] S12-7 — `server/repositories/egreso.ts` (nuevo): `crearEgreso`,
  `editarEgreso`, `EgresoRevertidoError`, `revertirEgreso`,
  `EgresoYaRevertidoError`, `listarEgresos`, `contarEgresos`,
  `buscarEgresoPorId` tal cual `plan.md`, sin desvíos. `editarEgreso`/
  `revertirEgreso` usan `updateMany` condicional (guard `revertido:
  false`) igual que `revertirMortalidad` — ninguna necesita
  `$transaction` (una sola tabla afectada, Egreso no descuenta ningún
  contador). Sin tests (repository sin tests, mismo criterio del
  proyecto) — verificación real en S12-21.

  Verificado `npm run typecheck && npm run lint` — sin errores
  atribuibles a este archivo.

- [x] S12-8 — `server/repositories/empleado.ts` (nuevo): `crearEmpleado`,
  `editarEmpleado`, `cambiarEstadoEmpleado`, `listarEmpleados`,
  `contarEmpleados`, `buscarEmpleadoPorId`, `listarEmpleadosActivos` tal
  cual `plan.md`, sin desvíos. `editarEmpleado`/`cambiarEstadoEmpleado`
  usan `update` directo (no `updateMany`/guard) — a diferencia de Egreso,
  no hay ningún estado "revertido" que proteger. Sin tests (repository
  sin tests, mismo criterio del proyecto).

  Verificado `npm run typecheck && npm run lint` — sin errores
  atribuibles a este archivo.

- [x] S12-9 — `server/repositories/sueldo-movimiento.ts` (nuevo):
  `crearSueldoMovimiento`, `SueldoMovimientoYaRevertidoError`,
  `revertirSueldoMovimiento`, `listarSueldoMovimientosPorEmpleado`,
  `listarSueldoMovimientosEnRango`, `buscarSueldoMovimientoPorId` tal
  cual `plan.md`, sin desvíos. `listarSueldoMovimientosEnRango` filtra
  `revertido: false` y usa `fecha: { gte, lt }` (límite exclusivo,
  coherente con `calcularRangoMesCalendario` de S12-3). Sin tests
  (repository sin tests, mismo criterio del proyecto) — verificación
  real en S12-21.

  Verificado `npm run typecheck && npm run lint` — sin errores
  atribuibles a este archivo.

- [x] S12-10 — `server/actions/egreso.ts` (nuevo): `crearEgresoAction`,
  `editarEgresoAction`, `revertirEgresoAction` — rol `GERENTE` en las
  tres, catch de `P2002` en la de crear (idempotencia, mismo patrón
  `esErrorDeUnicidad` local que `mortalidad.ts`/`credito.ts`, no un
  helper compartido — el pseudocódigo de `plan.md` usaba nombres
  genéricos `esErrorP2002`/`serializar`/`coincideConPayload` que no
  existen como helpers reales en el proyecto; se siguió el estilo real
  de los archivos ya existentes), traducción de
  `EgresoRevertidoError`/`EgresoYaRevertidoError` a mensajes explícitos.
  Sin desvíos de diseño.

  **Hallazgo no atribuible a este archivo, encontrado al correr
  `npm run typecheck`:** `.next/dev/types/routes.d.ts` y `validator.ts`
  quedaron corruptos (contenido truncado a mitad de escritura) —
  consecuencia del `taskkill /F` sobre el `npm run dev` en S12-1, que
  cortó a Next.js mientras regeneraba esos tipos. `.next/` es un
  artefacto de build ignorado por git (confirmado en `.gitignore` antes
  de tocar nada) — se borró la carpeta completa y se regeneró sola al
  correr `typecheck` de nuevo, sin pérdida de nada real.

  Verificado `npm run typecheck && npm run lint` — sin errores
  atribuibles a este archivo, tras limpiar `.next/`.

- [x] S12-11 — `server/actions/empleado.ts` (nuevo): `crearEmpleadoAction`,
  `editarEmpleadoAction`, `cambiarEstadoEmpleadoAction` — rol `GERENTE`
  en las tres, catch de `P2002` en la de crear. `cambiarEstadoEmpleadoAction`
  sigue el mismo patrón de no-op que `cambiarEstadoUsuarioAction`
  (si `input.estado === existente.estado`, responde éxito sin tocar la
  base) pero sin ninguna guard de negocio — a diferencia de Usuario, acá
  no hay regla de "último Gerente activo" ni `SesionActiva` que revocar
  (confirmado con el Product Owner en esta misma sesión: Empleado sigue
  desacoplado de Usuario, decisión 5 tal cual). Sin desvíos de diseño.

  Verificado `npm run typecheck && npm run lint` — sin errores
  atribuibles a este archivo.

- [x] S12-12 — `server/actions/sueldo-movimiento.ts` (nuevo):
  `crearSueldoMovimientoAction` (chequeo previo de `Empleado.estado ===
  "ACTIVO"` antes de cualquier `create`, catch de `P2002`),
  `revertirSueldoMovimientoAction` (ancla el guard a `fecha`, no a
  `creadoEn` — `SueldoMovimiento` no tiene ese campo, decisión 2) — rol
  `GERENTE` en ambas. Sin desvíos de diseño.

  Con esto quedan cerradas las 7 Server Actions nuevas del sprint (S12-10
  a S12-12). Verificado `npm run typecheck && npm run lint && npm test`
  — **509/509 en verde**, sin regresión sobre lo heredado de S12-9.

- [x] S12-13 — `globals.css`: `.badge-categoria-egreso-alimentos`
  (emerald), `-insumos-vacunas` (cyan), `-servicios` (sky),
  `-mantenimiento` (fuchsia), `-varios` (pink) — 5 tonos sin relación con
  los ya usados en otras pantallas, clasificación sin semántica de
  bueno/malo (mismo criterio que `.badge-categoria-*` de Bitácora).
  `.badge-tipo-sueldo-base` (blue), `-bono` (green), `-adelanto`
  (orange), `-descuento` (red) — con semántica real de signo (BONO/
  SUELDO_BASE suman al neto, ADELANTO/DESCUENTO restan, mismo criterio
  que `.badge-tipo-muerte`/`.badge-tipo-descarte`); **a propósito sin
  amber para ninguno de los 4** — `/personal/[empleadoId]` ya muestra el
  badge de estado del propio Empleado en amber, usarlo también acá
  confundiría "empleado activo" con "es un adelanto". Todas con `!`
  (se usan junto a `<Badge variant="outline">`).

  **Bug real reintroducido y corregido en el momento, mismo exacto de
  Sprint 3:** el primer comentario nuevo escrito
  (`.badge-categoria-*/.badge-tipo-cliente-*: ...`) contenía la secuencia
  literal `-*/`, que cierra un comentario CSS antes de tiempo —
  confirmado con `npm run build` (Turbopack reportó
  `Unexpected token Delim('*')` señalando exactamente esa línea).
  Corregido reescribiendo la frase sin la secuencia `*/` (mismo tipo de
  error, mismo fix, que el documentado en `memory/estado-proyecto.md`
  para el badge Activo/Inactivo de Sprint 3) y verificado con un segundo
  `npm run build` limpio, sin warnings de CSS. **Lección reafirmada:**
  ningún comentario CSS de este proyecto puede contener `*/` literal, ni
  por accidente listando nombres de clases con guiones seguidos de
  `.otra-clase`.

  Verificado `npm run build` (limpio), `npm run typecheck && npm run
  lint && npm test` — **509/509 en verde**, sin regresión.

- [x] S12-14 — UI de Egresos: `banner-caja-separada.tsx`,
  `egreso-form-dialog.tsx` (crear+editar en un solo componente, `id`
  generado una vez por apertura del diálogo, `<Select>` de categoría
  controlado con `children` explícito en `<SelectValue>` — mismo fix que
  el bug real de Sprint 3), `egresos-tabla.tsx`, `egreso-filtros.tsx`,
  `revertir-egreso-boton.tsx` (countdown real anclado a `creadoEn`, nunca
  a `fecha`) tal cual `plan.md`, sin desvíos.

  **Desvío chico no anticipado en `plan.md`:** se agregó
  `formatearFecha()` a `lib/fecha.ts` (fecha-calendario en `timeZone:
  "UTC"`, nunca `"America/Lima"`) — `plan.md` no lo había previsto como
  archivo a modificar. Necesario para mostrar `Egreso.fecha` en
  `EgresosTabla` sin repetir el bug de un día de desfase que Sprint 11
  encontró y documentó para `Credito.fechaLimite` (medianoche UTC
  formateada en Lima resta un día). `formatearFechaHora()` existente
  sigue siendo solo para instantes reales con hora — sin cambios ahí.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **509/509 en verde**, sin regresión.

- [x] S12-15 — `app/(app)/egresos/page.tsx` (nuevo): `PageHeader` +
  banner + filtros + tabla + paginación, tal cual `plan.md`, sin
  desvíos. Sin guard de rol dentro del componente (vive en
  `server/auth/rbac.ts`, todavía pendiente de S12-18 en este punto de la
  ejecución — mismo criterio que `/usuarios`/`/galpones`/`/lotes`).
  `egreso.monto` (Decimal) convertido a `number` antes de pasarlo a
  `EgresosTabla`, mismo patrón que el resto del proyecto.

  Verificado `npm run typecheck && npm run lint && npm run build` (ruta
  `/egresos` aparece listada en la salida de `next build`, compilando
  como el resto de rutas dinámicas del Shell) y `npm test` — **509/509
  en verde**, sin regresión.

- [x] S12-16 — UI de Personal: `empleado-form-dialog.tsx` (crear+editar
  en un solo componente, sin campo `usuarioId`), `empleados-tabla.tsx`
  (link "Ver detalle" a `/personal/[id]` con `buttonVariants` +
  `next/link`, mismo patrón que `PaginaLink` de `DataTablePagination` —
  toggle Dar de baja/Reactivar calcado de `UsuariosTabla`),
  `sueldo-movimiento-form-dialog.tsx` (sin `<Select>` de empleado, recibe
  `empleadoId` fijo del detalle), `sueldo-movimientos-tabla.tsx` (signo
  visual +/− por tipo, refuerza `calcularNetoMensual`; estado vacío "sin
  movimientos" cuando la lista viene vacía),
  `revertir-sueldo-movimiento-boton.tsx` (countdown anclado a `fecha`),
  `neto-mensual-card.tsx` (selectores de mes/año navegan por
  `searchParams`, el desglose llega ya calculado como prop desde el
  Server Component padre) — todos sin desvíos de diseño.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **509/509 en verde**, sin regresión.

- [x] S12-17 — `app/(app)/personal/page.tsx` (nuevo) y
  `app/(app)/personal/[empleadoId]/page.tsx` (nuevo), `params`/
  `searchParams` `await` (Next 16). `empleado` no encontrado en la ruta
  de detalle responde `notFound()`, mismo criterio que el resto del
  proyecto para un id inexistente en la URL.

  **Dos desvíos chicos no anticipados en `plan.md`:**
  1. El filtro de estado de `/personal` (`plan.md` decía "filtro simple
     de estado", sin especificar el mecanismo) se implementó como 3
     links planos (Todos/Activos/Inactivos), Server Component puro sin
     JS — no un `<Select>` cliente, porque solo son 2 valores y no
     amerita la infraestructura colapsable de `EgresoFiltros`.
  2. Se extrajo `empleado-estado-boton.tsx` (nuevo, no listado en
     `plan.md`) desde la lógica que iba a quedar duplicada dentro de
     `EmpleadoFila` (`empleados-tabla.tsx`) — el detalle de
     `/personal/[empleadoId]` también necesita el mismo botón "Dar de
     baja/Reactivar" en el header, y a diferencia de `opcional()`
     (duplicado a propósito por ser trivial) este botón tiene lógica
     real (Server Action + transición + toast) que sí valía la pena no
     repetir dos veces. `EmpleadosTabla`/`EmpleadoFila` se simplificaron
     para usarlo (dejaron de necesitar `"use client"` — ya no llaman
     ningún hook directamente, solo componen componentes cliente).

  Verificado `npm run typecheck && npm run lint && npm run build`
  (`/personal` y `/personal/[empleadoId]` aparecen en la salida de
  `next build`) y `npm test` — **509/509 en verde**, sin regresión.

- [x] S12-18 — `server/auth/rbac.ts` (modifica): + `/egresos` →
  `["GERENTE"]`, `/personal` → `["GERENTE"]`. `components/layout/nav-items.ts`
  (modifica): + "Egresos" (`Wallet`), "Personal" (`IdCard`) — sin
  desvíos. Con esto, ambas rutas quedan realmente restringidas a
  GERENTE (antes de esta tarea estaban técnicamente abiertas a
  cualquier autenticado, ver nota de S12-15).

  Verificado `npm run typecheck && npm run lint && npm run build`
  (`next build` limpio, mismas 19 rutas de antes, ninguna rota por el
  cambio de `rbac.ts`) y `npm test` — **509/509 en verde**, sin
  regresión. La verificación real de 403 para un Operario queda para
  S12-21/S12-22 (contra Neon real y clic a clic).

- [x] S12-19 — Tests de integración (repositories mockeados, servicios
  reales — mismo criterio que `credito.test.ts`) de las 7 Server Actions
  nuevas:
  - `tests/integration/actions/egreso.test.ts` (16 casos): rol (403 para
    Operario en las 3), creación + AuditLog, idempotencia completa
    (reintento igual/distinto/no-existe-al-releer/otro-error-Prisma),
    edición + AuditLog, edición rechazada si no existe o si
    `EgresoRevertidoError`, anulación + AuditLog, anulación rechazada si
    no existe, **guard real de ventana de gracia sin mockear el
    service** (pasada la ventana, ya revertido), y traducción de
    `EgresoYaRevertidoError` (carrera que pasó el chequeo previo).
  - `tests/integration/actions/empleado.test.ts` (14 casos): rol (403
    para Operario en las 3), creación + AuditLog (con y sin
    celular/cargo opcionales), idempotencia completa, edición + AuditLog,
    edición rechazada si no existe, cambio de estado (baja/reactivación)
    + AuditLog, **no-op idempotente si el estado pedido ya es el
    actual** (no llama al repository), rechazo si no existe.
  - `tests/integration/actions/sueldo-movimiento.test.ts` (14 casos): rol
    (403 para Operario en las 2), rechazo si el empleado no existe,
    **rechazo real si el empleado está INACTIVO forzando el payload
    directo** (decisión 6), creación + AuditLog, idempotencia completa,
    reversión + AuditLog, **guard real de ventana de gracia sin mockear
    el service**, traducción de `SueldoMovimientoYaRevertidoError`.

  Sin desvíos de diseño. **Un ajuste real durante la escritura, no un
  bug de las actions:** el primer intento de `egreso.test.ts` usaba
  `fecha: "2026-01-01"` con `AHORA = "2026-01-01T00:10:00.000Z"` — a esa
  hora, "hoy en Lima" (D5, UTC-5) todavía es 2025-12-31, así que
  `crearEgresoSchema`/`editarEgresoSchema` rechazaban esa fecha como
  futura (comportamiento CORRECTO del schema, ver zod-egreso.test.ts) y
  los tests fallaban por una fecha de prueba mal elegida, no por un bug
  real. Corregido usando `"2025-06-15"` (claramente pasada sin importar
  el borde de huso horario) en los payloads y en el `fecha` por defecto
  de `egresoExistente()`, para que además el chequeo de idempotencia
  compare exactamente lo que Zod coerciona.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **553/553 en verde** (44 nuevos: 16 + 14 + 14, sobre los 509 heredados
  de S12-18).

- [x] S12-20 — `npx vitest run --coverage --coverage.all
  --coverage.include="src/server/services/egreso.ts"
  --coverage.include="src/server/services/sueldo-movimiento.ts"` —
  **100% statements (24/24), 100% branches (12/12), 100% funciones
  (7/7), 100% líneas (22/22)** combinado entre ambos archivos, muy por
  encima del umbral de ≥90% del DoD. `coverage/` borrado al terminar.

## Corrección de diseño real, en plena ejecución (post-S12-20, antes de S12-21)
A pedido explícito del Product Owner, después de ver la UI en uso:
1. **H2 (el banner "no afecta la caja de ventas") se sacó de las tres
   pantallas** (`/egresos`, `/personal`, `/personal/[empleadoId]`) —
   `components/domain/egresos/banner-caja-separada.tsx` se borró del
   proyecto (sin otro consumidor). `spec.md` actualizado (Sprint Goal,
   H2, "Alcance de este sprint", "Criterio de aceptación general) para
   reflejar que el aislamiento real entre Egresos/Personal y la caja de
   Ventas/Créditos sigue intacto a nivel de código — lo único que
   cambió es la comunicación visual explícita de ese hecho.
2. Recortada la frase final de la descripción de `EgresoFormDialog` en
   modo crear: "Registro contable interno — no afecta la caja de
   Ventas." → "Registro contable interno."
3. Recortada la frase final de la descripción de `EmpleadoFormDialog` en
   modo crear: "Queda ACTIVO de inmediato — sin cuenta de acceso al
   sistema." → "Queda ACTIVO de inmediato."
4. **Nuevo, no anticipado en `plan.md`:** `/personal/[empleadoId]/page.tsx`
   gana un link "Volver a Personal" (`ArrowLeft` + `buttonVariants`,
   mismo patrón que "Ver detalle" de `EmpleadosTabla`) arriba de
   `PageHeader` — el detalle de un empleado no tenía forma de volver al
   listado sin usar el botón "Atrás" del navegador.

Verificado `npm run typecheck && npm run lint && npm run build` (build
limpio, mismas 19 rutas) y `npm test` — **553/553 en verde**, sin
regresión (ningún test dependía del banner ni de las frases recortadas).

- [x] S12-21 — Verificación en vivo contra Neon real
  (`verificar-sprint12-temp.ts`, script temporal en la raíz del repo,
  corrido con `npx tsx`, datos de prueba — 1 Usuario GERENTE temporal, 1
  Egreso adicional, 1 Empleado, sus SueldoMovimiento — borrados al
  terminar, mismo criterio que Sprints 1-11). Llama a los
  repositories/services reales tal cual quedaron implementados en
  S12-7/S12-9/S12-2/S12-3 (no a las Server Actions — esas requieren
  contexto de sesión de Next, fuera del alcance de un script standalone;
  su comportamiento de rol/guard queda cubierto por los tests de
  integración de S12-19 con mocks, y se vuelve a confirmar de punta a
  punta en S12-22 contra la UI real).

  20 verificaciones, **19/19 con resultado correcto, 1 con una
  expectativa mal armada en el propio script (no un bug de código)**:
  - [1]-[8] Egreso: alta, edición sin límite de tiempo, idempotencia
    real (`P2002` genuino de Neon, no simulado), guard de ventana de
    gracia recién creado (`permitido: true`), anulación real, edición
    rechazada sobre uno ya anulado (`EgresoRevertidoError` real),
    anulación doble rechazada (`EgresoYaRevertidoError` real), y **guard
    rechazado con datos reales tras backdatear `creadoEn` 11 minutos
    contra la base** (no simulado con `vi.useFakeTimers` como en los
    tests unitarios — la primera vez que este guard corre contra un
    reloj real).
  - [9]-[11] Empleado: alta, baja (desaparece de
    `listarEmpleadosActivos()` real), reactivación (reaparece).
  - [12]-[17] SueldoMovimiento: alta, guard de ventana recién creado,
    reversión real, reversión doble rechazada
    (`SueldoMovimientoYaRevertidoError` real), idempotencia real
    (`P2002` genuino), guard rechazado tras backdatear `fecha` 11
    minutos contra la base.
  - [18]-[19] Neto mensual real: **el script esperaba 3 movimientos sin
    contar el `BONO` backdateado del punto [17], y la base devolvió 4**
    — no es un bug: ese `BONO` se backdateó solo 11 minutos (para
    probar la ventana de gracia de reversión) y **nunca se revirtió**,
    así que sigue siendo del mes calendario actual y `calcularNetoMensual()`
    lo sumó correctamente (`bonos: 130` = 100 + 30, `neto: 1130` = 1200
    + 130 − 200 − 0). La expectativa impresa en el script no contemplaba
    ese movimiento extra — recalculado a mano, el resultado real es
    exactamente el esperado. Ningún cambio de código hizo falta.
  - [20] Confirmado que el repository de `Empleado` en sí no bloquea un
    `SueldoMovimiento` contra un `INACTIVO` (diseño intencional, R2 de
    spec.md — el guard vive en la Server Action, best-effort, no
    atómico) — el empleado quedó `INACTIVO` en la base tal cual se
    esperaba, y se reactivó antes de la limpieza para dejar todo
    consistente.

  Script borrado al terminar (`rm verificar-sprint12-temp.ts`),
  confirmado por su propio log de limpieza ("Datos de prueba borrados.
  Fin.") sin errores previos.

- [x] S12-22 — Verificación clic a clic con la extensión Claude in
  Chrome, contra `npm run dev` local (`localhost:3000`, mismo Neon
  compartido — R1). Usó la sesión ya logueada del Gerente real en el
  navegador para el recorrido visual (sin login manual), y un Usuario
  GERENTE/OPERARIO temporal (`test.s12.gerente`/`test.s12.operario`,
  creados con `npx tsx` + `bcrypt`, password conocida) solo para el
  chequeo de rol vía `curl`+cookie jar — mismo criterio que Sprint 2/3
  (nunca loguear con la cuenta sembrada real, y no cerrar la sesión real
  del navegador para no interrumpirla). Todos los datos y usuarios de
  prueba borrados al terminar con scripts temporales (`npx tsx`), estos
  también borrados después.

  - `/egresos`: alta (con `<Select>` de categoría — "Insumos y
    vacunas" quedó bien seleccionado y con la etiqueta legible, no el
    enum crudo, confirmando que el fix de Sprint 3 sigue vigente),
    edición (monto S/45.90 → S/60.00, reflejado tras el
    `router.refresh()`), anulación dentro de la ventana (countdown
    visible "Anular (9:59)" → fila queda gris con tachado y badge
    "Anulado", sin más acciones), filtro por categoría (URL
    `?categoria=ALIMENTOS`, tabla filtrada correctamente). Un Egreso
    real ya cargado por el Product Owner (`Alimento Balanceado`, fuera
    de la ventana de gracia) se dejó intacto, sin tocarlo.
  - `/personal`: alta de Empleado (sin ningún campo de `usuarioId`,
    confirmado — decisión 5), filtro por estado (`Todos`/`Activos`/
    `Inactivos`, URL `?estado=INACTIVO` filtrando correctamente). Un
    Empleado real ya cargado (`Luis Angel Tantalean Letona`) se dejó
    intacto.
  - `/personal/[empleadoId]`: **botón "Volver a Personal" navega
    correctamente** (el agregado post-S12-20); registro de movimiento
    `SUELDO_BASE` (S/1200) y `BONO` (S/150) — desglose y Neto
    recalculados en vivo (S/1350.00 = 1200+150); reversión del `BONO`
    con countdown ("Deshacer (9:58)") — fila queda gris/tachada con
    badge "Revertido", **y el desglose de neto mensual se recalcula
    excluyéndolo en tiempo real** (vuelve a S/1200.00, sin recargar
    manualmente); badges de tipo con los colores diseñados (Sueldo base
    azul, Bono verde); al dar de baja al empleado, **el botón
    "Registrar movimiento" desaparece de la pantalla** (guard de
    decisión 6 a nivel UI).
  - **403 real para Operario**, verificado con `curl`+cookie jar contra
    un Usuario OPERARIO temporal real (login `302`, `/egresos` → `403`,
    `/personal` → `403`), con un chequeo de control adicional confirmando
    que la misma sesión sí devuelve `200` en `/pos` (ruta abierta) — la
    sesión era válida, el 403 es el guard de rol real, no una sesión
    rota.
  - Sidebar confirmado con las entradas "Egresos"/"Personal" visibles y
    resaltando la activa.
  - **Sin banner** en ninguna de las tres pantallas — confirmado
    visualmente que el corte de H2 (post-S12-20) se ve reflejado en la
    UI real, no solo en el código.

  **Un hallazgo transitorio, no un bug:** tras editar el Egreso y tras
  registrar cada movimiento de sueldo, la tabla tardó ~1-2s en reflejar
  el cambio (mismo comportamiento normal de `router.refresh()` en Next —
  el toast de éxito aparece antes que el re-render del Server
  Component). Confirmado con un segundo screenshot tras esperar: el dato
  correcto siempre llegó. No amerita ningún cambio de código.

  Cerrado tab del navegador al terminar. Repo confirmado sin archivos
  temporales sueltos (`git status` solo muestra los archivos legítimos
  del sprint).

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` en verde —
  **553/553 tests** (44 nuevos sobre los 509 heredados de Sprint 11).
- [x] `npm run build` en verde (19 rutas, incluidas `/egresos`,
  `/personal` y `/personal/[empleadoId]`).
- [x] `npx prisma validate` en verde.
- [x] `memory/estado-proyecto.md` actualizado con el cierre de Sprint 12
  (mismo formato que el cierre de Sprints 8-11): resumen, migración de
  schema, decisiones de negocio, la aclaración de terminología
  Empleado/Operario, la corrección real del banner en plena ejecución,
  el historial de Precio por Kilo agregado fuera de alcance, el bug de
  comentario CSS (mismo que Sprint 3), la verificación en vivo con el
  hallazgo de mi propio script (no un bug), y el link a
  `specs/sprint-12-egresos-personal/`. También actualizados el resumen
  ejecutivo ("13 de 16 completados") y "Cómo continuar desde acá" (punto
  0 ahora apunta a Sprint 13).
- [x] `specs/roadmap-completo.md`: Sprint 12 marcado `✅ COMPLETADO`, con
  el mismo resumen de una línea que llevan los Sprints 3-11.
