# Tareas — Sprint 7

Checklist de planificación — ninguna tarea está ejecutada todavía. Se tilda
cada una al completarla, con la misma disciplina de Sprints 1-6: implementar
tal cual `plan.md` (o anotar el desvío real si lo hay) y verificar en código
real (no solo dar por buena la tarea al escribirla).

- [x] S7-1 — Migración de schema: `PaqueteOrigen.loteId`/`BandejaOrigen.loteId`
  (`String?`, FK a `Lote`, `onDelete: Restrict`), modelo nuevo
  `RegistroConsolidacion` + enum `TipoConsolidacion`
  (`PAQUETE_MIXTO`/`BANDEJA`), `Paquete.registroConsolidacionId`/
  `BandejaSuelta.registroConsolidacionId` (`String?`, FK a
  `RegistroConsolidacion`, `onDelete: SetNull`), relaciones inversas
  `paqueteOrigenes`/`bandejaOrigenes` en `Lote` y `registrosConsolidacion`
  en `Usuario` (agregada desde el primer intento, sin repetir el error de
  Sprint 0) — migración `20260812230018_consolidacion_residuos`, aplicada
  contra Neon real (`npx prisma migrate dev --name consolidacion_residuos`).
  Implementado tal cual `plan.md`, sin desvíos.

  **Desvío operativo real, no de código, mismo tipo que S6-1:** había un
  `npm run dev` corriendo en el puerto 3000 (PID 488) antes de correr la
  migración — riesgo real de `EPERM` al regenerar el Prisma Client en
  Windows (lo que pasó en S6-1). Se le pidió confirmación al Product Owner
  antes de tocar el proceso; lo cerró desde su otra terminal, y la
  migración corrió sin ningún error esta vez.

  SQL generado revisado línea por línea: `CREATE TYPE`, 4×`ALTER TABLE ...
  ADD COLUMN` (todas nullable), `CREATE TABLE`, 2×`CREATE INDEX`,
  5×`ADD CONSTRAINT` (FK) — ninguna sentencia destructiva, confirma
  exactamente el diseño de `plan.md`.

  Verificado `npx prisma validate` (válido) y `npm run typecheck` (sin
  errores) con el Prisma Client ya regenerado. `npm run lint` limpio y
  `npm test` — 240/240 en verde, sin roturas (esperado: ningún código real
  consume los campos nuevos todavía). Confirmado además con un script
  temporal (`_tmp_verificacion_s7_1.ts`, borrado al terminar) contra Neon
  real: `RegistroConsolidacion` existe y es consultable (`count() = 0`),
  `Paquete.registroConsolidacionId`/`BandejaSuelta.registroConsolidacionId`/
  `PaqueteOrigen.loteId`/`BandejaOrigen.loteId` son columnas reales
  consultables — y se confirmó en vivo la limitación conocida de R5
  (`spec.md`): un `PaqueteOrigen` real preexistente (de antes de este
  sprint) quedó con `loteId = null`, tal cual documentado.

- [x] S7-2 — `lib/constants.ts`: `UNIDADES_POR_BANDEJA = 30`, con el mismo
  estilo de comentario que `UNIDADES_POR_PAQUETE` (para qué sirve, quién la
  usa). Sin cambio de comportamiento en ningún código existente. Implementado
  tal cual `plan.md`, sin desvíos.

  Verificado `npm run typecheck && npm run lint && npm test` — 240/240 en
  verde, sin roturas.

- [x] S7-3 — `server/services/consolidacion.ts` (nuevo):
  `calcularConsolidacion(origenes, unidadDestino)` tal cual el pseudocódigo
  de `plan.md` (relleno secuencial, agota un origen antes de pasar al
  siguiente, función pura sin Prisma). **Desvío real respecto al
  pseudocódigo de `plan.md`:** se eliminó el `if (tomar <= 0) break;`
  defensivo — dado el invariante real del algoritmo
  (`acumuladoUnidadActual` siempre en `[0, unidadDestino)`, con
  `unidadDestino` siempre positivo en este proyecto: 180 o 30), esa rama es
  matemáticamente inalcanzable y hubiera quedado sin cobertura real, mismo
  criterio que el hallazgo de S6-14 con `reconstruirSaldo()` ("no validar
  escenarios que no pueden pasar", `CLAUDE.md`) — documentado con un
  comentario explicando el invariante en vez de dejar una guarda muerta.

  Tests unitarios nuevos en `tests/unit/services/consolidacion.test.ts` (9
  casos): origen único múltiplo exacto de `unidadDestino`; origen único con
  sobrante; dos orígenes donde el segundo completa la unidad que el primero
  dejó a medias; un origen con `disponible: 0`; lista de orígenes vacía;
  orígenes cuyo total combinado no llega a `unidadDestino`; un origen que
  por sí solo alcanza para 2+ unidades completas; distinto lote del mismo
  galpón tratado como origen separado (caso adicional no listado
  explícitamente en `plan.md`, agregado porque es la distinción real que
  justifica todo el hallazgo de `loteId` de este sprint); `unidadDestino`
  distinto (30 vs. 180) con el mismo set de orígenes da resultados
  distintos.

  Verificado `npm run typecheck && npm run lint && npm test` — 249/249 en
  verde (9 tests nuevos sobre los 240 heredados de S7-2). Cobertura
  confirmada con `npx vitest run --coverage --coverage.all
  --coverage.include="src/server/services/consolidacion.ts"` (el reporter
  de texto por defecto omite de la tabla los archivos 100% cubiertos, así
  que hubo que forzar el include puntual para verlo explícito): **100%
  statements (16/16), 100% branches (2/2), 100% funciones (1/1)** — por
  encima del umbral ≥90% del proyecto. `coverage/` generado borrado al
  terminar.

- [x] S7-4 — `lib/zod/consolidacion.ts` (nuevo):
  `consolidarSueltosSchema` (`id`, `origenes` con `.refine` anti-duplicados,
  `creadoEnCliente`, `pesos`) tal cual el diseño de `plan.md`, sin desvíos.

  Tests nuevos en `tests/unit/lib/zod-consolidacion.test.ts` (13 casos):
  payload válido con un origen; payload válido con múltiples orígenes y
  múltiples pesos; `id` inválido rechazado; `origenes` vacío rechazado;
  `galponId`/`loteId` inválidos rechazados (cada uno con su mensaje
  personalizado); `origenes` con el mismo galpón+lote repetido dos veces
  rechazado (confirma el `.refine`); mismo galpón con distinto lote SÍ
  aceptado (no es un duplicado real); `creadoEnCliente` inválido rechazado;
  `pesos` vacío rechazado; un peso ≤0 rechazado (0 y negativo); un peso que
  excede 999.999 rechazado.

  Verificado `npm run typecheck && npm run lint && npm test` — 261/261 en
  verde (12 tests nuevos sobre los 249 heredados de S7-3).

- [x] S7-5 — `server/repositories/inventario.ts` (amplía):
  `listarInventarioSueltosConSaldo()` tal cual el diseño de `plan.md` (sin
  paginar, `include` de galpón/lote, orden por nombre de galpón y código de
  lote). Implementado sin desvíos.

  Sin tests nuevos (mismo criterio ya establecido del proyecto — no hay
  tests de repository, ver `memory/convenciones.md`/ADR-000).

  Verificado `npm run typecheck && npm run lint && npm test` — 261/261 en
  verde, sin roturas.

- [x] S7-6 — `server/repositories/consolidacion.ts` (nuevo):
  `consolidarSueltos()` (sexta transacción interactiva del proyecto — crea
  `RegistroConsolidacion` con `id` de cliente, agrega el saldo necesario
  por origen distinto, guard todo-o-nada vía `updateMany` + comparación de
  conteo, `MovimientoSueltos` `CONSOLIDACION_SALIDA` por origen distinto,
  crea las N unidades de destino con sus orígenes anidados) y
  `buscarRegistroConsolidacionConUnidadesPorId()`, tal cual el pseudocódigo
  de `plan.md`. Error custom exportado: `SaldoInsuficienteConsolidacionError`.
  Mismo criterio de ADR-000 que `registrarRecoleccion`/`revertirRecoleccion`:
  el archivo define su propio tipo `PorcionOrigen` local en vez de importar
  el de `server/services/consolidacion.ts` — confirmado con `grep` que
  ningún repository del proyecto importa nada de `server/services/`, ni
  siquiera un tipo, y este archivo mantiene esa regla. Sin desvíos respecto
  al diseño de `plan.md`.

  Sin tests nuevos en esta tarea (mismo criterio que S6-6/S6-7 — se
  verifican con los tests de integración de la action y, el caso de
  carrera real, contra Neon).

  Verificado `npm run typecheck && npm run lint && npm test` — 261/261 en
  verde, sin roturas.

- [x] S7-7 — `server/actions/consolidacion.ts` (nuevo):
  `consolidarPaqueteMixtoAction`/`consolidarBandejaAction` vía `withAuth`
  (sin `rol`), ambas delegando en una función interna compartida
  `ejecutarConsolidacion(input, ctx, tipo)` tal cual el diseño de
  `plan.md` — relee `InventarioSueltos` fresco (nunca confía en el saldo
  que mandó el cliente), recalcula `calcularConsolidacion()` server-side,
  rechaza si no hay ninguna unidad completa posible o si `pesos.length` no
  coincide con lo recalculado, traduce
  `SaldoInsuficienteConsolidacionError` y la rama de `P2002` (idempotencia:
  compara `cantidadUnidadesFormadas` contra el reintento). Implementado tal
  cual el diseño de `plan.md`, sin desvíos.

  Tests de integración de esta action quedan en S7-11 (mismo criterio
  flexible que Sprints 5-6: escribir la action y sus tests de integración
  puede quedar en tareas separadas si el checklist lo distingue
  explícitamente).

  Verificado `npm run typecheck && npm run lint && npm test` — 261/261 en
  verde, y `npm run build` limpio (sin fugas de import de servidor a
  cliente).

- [x] S7-8 — `components/domain/consolidacion/saldos-tabla.tsx` (nuevo):
  tabla de solo lectura (galpón, lote, sueltos) envuelta en
  `<TableScrollArea>`, estado vacío explícito si no hay filas ("Todavía no
  hay sueltos registrados.", mismo estilo que el estado vacío ya usado en
  `BitacoraMuro`). Sin paginación. Implementado tal cual `plan.md`, sin
  desvíos.

  Verificado `npm run typecheck && npm run lint && npm test` — 261/261 en
  verde, y `npm run build` limpio.

- [x] S7-9 — `components/domain/consolidacion/consolidar-sueltos-dialog.tsx`
  (nuevo): componente único parametrizado por `tipo`/`unidadDestino`/
  `etiquetaUnidad`/`titulo`/`saldos`, tal cual el diseño de `plan.md` —
  filas de origen seleccionables sin `Checkbox` nuevo (`aria-pressed` +
  estilo, más un ícono `Check` como indicio visual adicional a
  color/borde), vista previa reactiva vía `calcularConsolidacionPreview`
  (duplicado a propósito del servicio real, mismo criterio documentado que
  `calcularEmpaquePreview`), N campos de peso redimensionados en el mismo
  evento que la selección, `id` generado una sola vez por apertura,
  `formAction(payload)` dentro de `startTransition()` (arreglos de longitud
  variable, mismo motivo que `RegistrarRecoleccionDialog`), botón
  deshabilitado hasta `unidades.length > 0` + todos los pesos válidos.

  **Desvíos reales respecto al diseño de `plan.md` (ninguno de negocio, solo
  detalle de implementación no anticipado en el pseudocódigo):**
  - El botón de confirmar se llama "Guardar", no "Confirmar" — mismo
    rótulo que usan todos los demás dialogs de formulario del proyecto
    (`RegistrarRecoleccionDialog`, `AjustarInventarioSueltosDialog`), para
    no introducir un texto distinto sin motivo.
  - Se agregaron dos props no explícitas en `plan.md`: `descripcion`
    (texto de `DialogDescription`, distinto por wizard — evitaba tener que
    derivar gramática de género "un paquete"/"una bandeja" a mano dentro
    del componente compartido) e `icon`/`variantTrigger` (para que
    "Paquete Mixto" pueda ser el CTA primario de la pantalla —
    `variant="default"` — y "Armar Bandeja" quede `variant="outline"`,
    respetando la regla de un solo acento de marca por pantalla, 60-30-10,
    documentada en `memory/estado-proyecto.md`).
  - Nueva clase `.origen-seleccionado` agregada a `globals.css` (borde +
    fondo `--primary` para la fila de origen marcada) — obligatorio por
    `memory/convenciones.md` ("ninguna receta de color/borde con
    semántica de estado se escribe suelta en un `.tsx`"), no estaba
    detallado en `plan.md` pero se sigue la regla de siempre.
  - Los orígenes con `disponible === 0` se filtran de la lista
    seleccionable dentro del wizard (no tiene sentido elegir un origen sin
    saldo) — la pantalla de saldos (`SaldosTabla`, S7-8) sigue mostrando
    esas filas igual, sin filtrar, es solo el wizard el que las oculta.

  Verificado `npm run typecheck && npm run lint && npm test` — 261/261 en
  verde, y `npm run build` limpio.

- [x] S7-10 — `app/(app)/consolidacion/page.tsx` (nuevo): fetch de
  `listarInventarioSueltosConSaldo()`, `PageHeader` con los dos
  `ConsolidarSueltosDialog` (Bandeja y Paquete Mixto) en `actions`,
  `SaldosTabla` debajo. Sin guard de rol, sin entrada en
  `server/auth/rbac.ts` (`RUTAS_POR_ROL`).
  `components/layout/nav-items.ts`: agrega la entrada "Consolidación" →
  `/consolidacion`.

  **Desvío real respecto a `plan.md`:** el ícono del ítem de navegación es
  `Combine` (tal cual `plan.md` ya proponía), pero los dos triggers de
  wizard dentro de la pantalla usan íconos propios y distintos entre sí
  (`Package` para Paquete Mixto — `variant="default"`, el CTA primario de
  la pantalla; `Rows3` para Armar Bandeja — `variant="outline"`), no
  detallado en el pseudocódigo original de `plan.md` pero consistente con
  las props `icon`/`variantTrigger` agregadas en S7-9.

  Verificado `npm run typecheck && npm run lint && npm test` — 261/261 en
  verde, y `npm run build` limpio — `/consolidacion` aparece listada en la
  salida del build junto al resto de rutas dinámicas.

- [x] S7-11 — `tests/integration/actions/consolidacion.test.ts` (nuevo, 13
  tests): repositories mockeados, mismo patrón que
  `tests/integration/actions/recoleccion.test.ts`/`inventario.test.ts`.
  **Desvío real respecto al checklist original:** no se duplicó el suite
  completo para las dos actions — `consolidarPaqueteMixtoAction` lleva la
  cobertura completa (10 tests: sin saldo suficiente, saldo desactualizado
  del cliente, `SaldoInsuficienteConsolidacionError` traducida, caso feliz
  un solo origen que aporta a 2 unidades, caso feliz múltiples orígenes que
  completan 1 unidad, OPERARIO sin restricción de rol, y las cuatro ramas
  de idempotencia) porque ambas actions comparten la función interna
  `ejecutarConsolidacion`; `consolidarBandejaAction` solo lleva 3 tests
  focalizados en lo que le es propio (`unidadDestino=30` en vez de 180,
  `tipo: "BANDEJA"` pasado al repository, `accion:
  "CONSOLIDAR_BANDEJA"` en `AuditLog`, OPERARIO sin restricción) — mismo
  criterio flexible que ya preveía este ítem del checklist ("o la función
  interna compartida si el diseño final lo permite sin duplicar casos").

  **Bug real encontrado y corregido en el camino** (no en Neon, en el
  propio texto de un mensaje de error): el test "rechaza si no hay saldo
  suficiente para formar ni una bandeja completa" falló al primer intento —
  `server/actions/consolidacion.ts` armaba el mensaje concatenando
  `"completo" + "a"` para el caso `BANDEJA`, dando literalmente
  `"...bandeja completoa..."` en vez de `"...bandeja completa..."`.
  Corregido cambiando la base de `"completo"` a `"complet"` + `"o"/"a"`
  según género (`generoFemenino = tipo === "BANDEJA"`), con un comentario
  explicando la concordancia. Sin este test de integración, el bug hubiera
  llegado intacto hasta la verificación clic a clic (S7-15).

  Verificado `npm run typecheck && npm run lint && npm test` — 274/274 en
  verde (13 tests nuevos sobre los 261 heredados de S7-10), y
  `npm run build` limpio.

- [x] S7-12 — Tests de carrera reales contra Neon, script temporal
  (`_tmp_verificacion_s7_12.ts`, ejecutado con `npx tsx` contra la conexión
  pooled `DATABASE_URL`, mismo criterio que S6-13 — importa y ejercita el
  código real de `consolidarSueltos`, no mocks, no reimplementación de la
  lógica, contra un Usuario/2 Galpones/2 Lotes temporales, borrado al
  terminar). Los tres casos de H5, todos verificados con
  `Promise.allSettled`/llamadas secuenciales reales + asserts releyendo la
  base después:
  1. **Guard de saldo bajo concurrencia real** (`InventarioSueltos`=200,
     dos consolidaciones simultáneas, cada una necesitando 180 del mismo
     origen): exactamente una tuvo éxito (`instanceof
     SaldoInsuficienteConsolidacionError` confirmado en la rechazada),
     saldo final quedó en 20 (nunca negativo), 1 solo `Paquete` creado, 1
     solo `MovimientoSueltos` `CONSOLIDACION_SALIDA`.
  2. **Idempotencia real**: reenviar el mismo `id` de
     `RegistroConsolidacion` que ya tuvo éxito rechazó con `P2002` real de
     Postgres (`error.code === "P2002"`), el saldo y la cantidad de
     `Paquete` quedaron exactamente iguales que antes del reintento,
     `buscarRegistroConsolidacionConUnidadesPorId` confirmó
     `cantidadUnidadesFormadas: 1` sin duplicar nada.
  3. **Un origen aportando a 2 unidades bajo el guard agregado**
     (`InventarioSueltos`=400, 2 unidades de 180 del mismo galpón/lote):
     saldo final quedó en 40 (400−360), **1 solo** `MovimientoSueltos`
     `CONSOLIDACION_SALIDA` con `cantidad: 360` (no dos de 180) — confirma
     con datos reales de Neon, no solo el test unitario de S7-3, que el
     `updateMany` agrega correctamente antes de descontar.

  **Sin bugs de código encontrados en esta tarea** — los tres casos
  pasaron a la primera ejecución del script (el único bug real del sprint
  hasta ahora, la concordancia de género del mensaje de error, ya se había
  encontrado y corregido en S7-11). Datos de prueba borrados al terminar y
  reconfirmados en 0 con una consulta separada
  (`_tmp_check_cleanup_s7_12.ts`, también borrado) antes de dar la tarea
  por completa.

  Sin cambios de código de producción en esta tarea — `npm run typecheck
  && npm run lint && npm test` seguía en 274/274 (verificado antes de
  iniciar esta tarea, en S7-11; no hacía falta repetirlo sin cambios de
  código real).

- [x] S7-13 — `npx vitest run --coverage`.
  `server/services/consolidacion.ts` confirmado en **100%/100%**
  statements/branches (16/16, 2/2) — sin cambios desde S7-3, ninguna tarea
  posterior tocó ese archivo.

  **Hallazgo real no anticipado en el checklist original** (no en el
  service, en la Server Action): el reporter por defecto reveló que
  `server/actions/consolidacion.ts` estaba en 100% statements pero
  **92.3% branches** (líneas 49 y 111 sin cubrir) al forzar
  `--coverage.all --coverage.include`. Dos ramas reales, no defensivas:
  - Línea 49 (`saldoPorClave.get(...) ?? 0`): un origen elegido en el
    cliente que ya no aparece en absoluto en el saldo fresco releído
    (otra operación lo consumió del todo entre medio) — caso de negocio
    real (saldo desactualizado), no un fallback imposible.
  - Línea 111 (`tipo === "PAQUETE_MIXTO" ? existente.paquetes :
    existente.bandejas`): la rama `existente.bandejas` del reintento
    idempotente nunca se había ejercitado — el suite de S7-11 solo cubría
    la idempotencia de `consolidarPaqueteMixtoAction`.

  **Corregido con 2 tests reales nuevos** (no un caso artificial): "trata
  como disponible=0 un origen elegido que ya no tiene fila en
  InventarioSueltos" (cubre línea 49) y "reintento con el mismo id
  devuelve la bandeja ya existente, sin duplicar nada" (cubre línea 111,
  el análogo de bandeja al test de idempotencia que Paquete Mixto ya
  tenía). `server/actions/consolidacion.ts` recobertura: **100%/100%**
  (35/35 statements, 26/26 branches).

  `coverage/` (generado, gitignored) borrado al terminar, mismo criterio
  que S5-11/S6-14.

  Verificado `npm run typecheck && npm run lint && npm test` — 276/276 en
  verde (2 tests nuevos sobre los 274 heredados de S7-12), y `npm run
  build` limpio.

- [x] S7-14 — Verificación en vivo contra Neon real, script temporal
  (`_tmp_verificacion_s7_14.ts`, borrado al terminar, llama a los
  repositories/services reales directamente, no a las Server Actions —
  mismo criterio que S5-12/S6-15). Setup: 1 Usuario, 4 Galpones/4 Lotes
  temporales, cada origen "sembrado" con `InventarioSueltos` +
  `MovimientoSueltos` tipo `RECOLECCION` reales (no solo un `create`
  suelto de `InventarioSueltos` — necesario para que `reconstruirSaldo()`
  del caso 4 tenga con qué reproducir el saldo). Los cinco casos, todos
  con asserts releyendo la fila real de Neon:
  1. **Paquete Mixto, dos orígenes** (A=120, B=90 → 1 paquete de 180 + 30
     sueltos sin consolidar): `RegistroConsolidacion` real
     (`cantidadUnidadesFormadas: 1`), 1 `Paquete` `tipo: "MIXTO"` con 2
     `PaqueteOrigen` reales (`loteId` no nulo en ninguno de los dos —
     confirma el hallazgo de schema de este sprint), `InventarioSueltos`
     A→0/B→30, 2 `MovimientoSueltos` `CONSOLIDACION_SALIDA` (uno por
     origen).
  2. **Armar Bandeja, un origen para 2 bandejas** (C=75 → 2 bandejas de 30
     + 15 sueltos): 2 `BandejaSuelta` reales, cada una con exactamente 1
     `BandejaOrigen` propio, **1 solo** `MovimientoSueltos`
     `CONSOLIDACION_SALIDA` de 60 (no dos de 30 — confirma el guard
     agregado con datos reales, mismo hallazgo que S7-12 pero ahora
     también para Bandeja), `InventarioSueltos` C→15.
  3. **Saldo insuficiente para ninguna unidad** (D=50 < 180): el script
     replica la guard real de la Server Action (`calcularConsolidacion()`
     da `unidades: []`, así que ni siquiera se llama a
     `consolidarSueltos()`) — confirmado que `InventarioSueltos` D siguió
     en 50 y que no se creó ningún `MovimientoSueltos`
     `CONSOLIDACION_SALIDA` para D.
  4. **`reconstruirSaldo()` real** sobre el historial completo de
     `MovimientoSueltos` (RECOLECCION del seed + CONSOLIDACION_SALIDA de
     la consolidación real) de los tres orígenes que participaron (A, B
     del caso 1; C del caso 2) reprodujo exactamente `0`, `30` y `15`
     respectivamente — coincide con `InventarioSueltos.cantidad` real en
     los tres.
  5. **`AuditLog` real**, llamado a mano con los mismos parámetros que
     pondría cada Server Action — una fila real
     `CONSOLIDAR_PAQUETE_MIXTO`/`RegistroConsolidacion` y una
     `CONSOLIDAR_BANDEJA`/`RegistroConsolidacion`, ambas releídas de Neon
     y confirmadas. De paso, `buscarRegistroConsolidacionConUnidadesPorId`
     (la lectura que usa la rama de idempotencia real de la action) también
     se ejercitó contra el registro real del caso 1, confirmando que trae
     el `Paquete` correcto.

  **Sin bugs de código encontrados** — los cinco casos pasaron a la
  primera ejecución del script. Datos de prueba (1 usuario, 4 galpones, 4
  lotes, y todo lo dependiente — `InventarioSueltos`, `MovimientoSueltos`,
  `RegistroConsolidacion`, `Paquete`/`PaqueteOrigen`,
  `BandejaSuelta`/`BandejaOrigen`, `AuditLog`) borrados al terminar y
  reconfirmados en 0 con una consulta separada antes de borrar el script.

  Sin cambios de código de producción en esta tarea —
  `npm run typecheck && npm run lint && npm test` seguía en 276/276
  (última verificación real en S7-13, sin código nuevo desde entonces).

- [x] S7-15 — Verificación clic a clic en navegador real por el Product
  Owner contra `npm run dev`, con usuarios temporales (mismo patrón que
  S6-16: creados con un script). Checklist confirmado por el Product
  Owner: pantalla `/consolidacion` visible para GERENTE y OPERARIO por
  igual; saldos reales mostrados correctamente; selección de orígenes
  reactiva; vista previa correcta; guardado exitoso con toast y tabla de
  saldos actualizada sin recargar; los dos wizards (Paquete Mixto, Armar
  Bandeja) probados por separado — dado por bueno explícitamente por el
  Product Owner al cierre de esta tarea.

  Dos correcciones reales encontradas y aplicadas probando en vivo (mismo
  criterio que S6-16, donde el diseño original del ajuste manual cambió
  tras la prueba real — acá se documentan con el mismo detalle, no se
  callan ni se dejan para después):

  1. **Bug real de RSC** ("Only plain objects can be passed to Client
     Components from Server Components"): `app/(app)/consolidacion/page.tsx`
     pasaba el componente de ícono (`Package`/`Rows3`, una referencia de
     función) como prop `icon` a `ConsolidarSueltosDialog` — un Server
     Component no puede pasar una referencia de función/clase a un Client
     Component, solo objetos planos serializables. Corregido quitando la
     prop `icon` del todo: `ConsolidarSueltosDialog` (que sí es
     `"use client"`) resuelve su propio ícono a partir de `tipo`
     (`Package` para `PAQUETE_MIXTO`, `Rows3` para `BANDEJA`), un string
     plano que sí cruza el límite sin problema. Verificado con
     `npm run build` limpio y la pantalla real cargando sin el error.

  2. **Corrección real de diseño, UX** (el Product Owner probó el wizard
     automático y pidió cambiarlo): el diseño original de este sprint
     (`spec.md`, decisión de negocio #1) hacía que seleccionar los
     orígenes armara **de una** todas las unidades que el saldo permitía,
     sin control manual. Corregido de punta a punta — detalle completo en
     `spec.md` (sección "Decisiones de negocio confirmadas", corrección
     post-S7-15) y en `plan.md` no se reescribió (mismo criterio que el
     resto del proyecto: el plan original queda como registro histórico):
     - `server/actions/consolidacion.ts`: la guard de `pesos.length` pasa
       de exigir igualdad exacta contra el techo (`calcularConsolidacion()`)
       a solo rechazar si se piden MÁS unidades que el techo — pedir menos
       ahora es válido, y solo se consolidan las primeras
       `input.pesos.length` unidades del techo (`porcionesMax.slice(0,
       input.pesos.length)`), `totalConsolidado` se recalcula sobre lo
       realmente consolidado, no sobre el techo completo.
     - `components/domain/consolidacion/consolidar-sueltos-dialog.tsx`:
       estado nuevo `cantidadAConsolidar` (arranca en 0, se auto-sube a 1
       apenas hay techo ≥1 al seleccionar un origen, se recorta solo si el
       techo baja por selección), tres controles nuevos ("+ Agregar
       {unidad}", "Agregar todas (N)", "Quitar") que ajustan
       `cantidadAConsolidar` dentro de `[0, techo]` y redimensionan
       `pesos` en el mismo evento (mismo criterio reactivo que
       `RegistrarRecoleccionDialog`).
     - `server/services/consolidacion.ts`/`server/repositories/consolidacion.ts`:
       **sin cambios** — `calcularConsolidacion()` siempre calculó el
       techo completo (nunca decidía cuánto consolidar), y
       `consolidarSueltos()` ya aceptaba cualquier arreglo de `unidades`
       que le pasaran, sin asumir que fuera el máximo. Todo el cambio de
       negocio quedó contenido en la capa de action + UI.
     - Tests actualizados: `tests/integration/actions/consolidacion.test.ts`
       — el test que rechazaba cualquier descoincidencia de `pesos.length`
       se reescribió para el caso real (rechaza solo si se pide MÁS del
       techo, con el mensaje nuevo), más un test nuevo confirmando que
       pedir MENOS del techo es válido y solo consolida esas unidades. 277
       tests en verde (1 test reescrito + 1 nuevo sobre los 276 heredados
       de S7-13/S7-14).

     Verificado `npm run typecheck && npm run lint && npm test` (277/277)
     y `npm run build` limpio después de ambas correcciones.

  **Hallazgo no-bug, sin relación con este sprint** (mismo tipo de caso
  que ya apareció una vez en S6-16, `/login`): un warning de hidratación
  de React apareció en `/consolidacion` ("A tree hydrated but some
  attributes of the server rendered HTML didn't match the client
  properties"), señalando el atributo `cz-shortcut-listen="true"` en
  `<body>`. Confirmado que no es una regresión de este sprint (`git
  status`/`git diff` sin cambios en `src/app/layout.tsx` en toda la
  sesión) — ese atributo lo inyecta **ColorZilla**, una extensión de
  Chrome, directo sobre el DOM antes de que React termine de hidratar; es
  la extensión modificando el HTML, no la app. No afecta ninguna
  funcionalidad, no bloquea nada de este sprint, no requiere fix.

  **Dato real generado durante la prueba, dejado a propósito, no
  limpiado:** el Product Owner armó 1 Bandeja real (`RegistroConsolidacion`
  tipo `BANDEJA`, 1 `BandejaSuelta` con su `BandejaOrigen`, 1
  `MovimientoSueltos` `CONSOLIDACION_SALIDA` de 30, 1 `AuditLog`
  `CONSOLIDAR_BANDEJA`) contra un galpón/lote **reales del seed** (no de
  prueba) — primera prueba end-to-end genuina de la feature completa, se
  deja intacta como evidencia, mismo criterio que el proyecto ya usa para
  no borrar historial real con efecto en cascada.

  **Limpieza de datos de prueba** (galpón/lotes VERIF-S7-15-\* y usuarios
  temporales), hecha con un script temporal tras la confirmación del
  Product Owner de que terminó de probar:
  - Borrado limpio: 2 `RegistroRecoleccion` de prueba (sin `Paquete`
    hijos) + su `AuditLog`, `MovimientoSueltos`/`InventarioSueltos`/
    `HistorialUbicacionLote` del galpón/lotes de prueba, el galpón y los
    2 lotes de prueba, el Usuario Operario de prueba (sin ninguna
    referencia real, confirmado antes de borrar).
  - **No se pudo borrar** el Usuario Gerente de prueba — queda referenciado
    (`onDelete: Restrict`) por la Bandeja real de arriba
    (`RegistroConsolidacion.usuarioId`) y por su fila de `AuditLog`. Se
    desactivó (`estado: INACTIVO`) en su lugar, mismo criterio exacto que
    Sprint 4 usó con un galpón de prueba que tampoco se pudo borrar por
    tener historial real encima.
  - Confirmado con una consulta separada antes de dar la limpieza por
    completa: 0 galpones/lotes `VERIF-S7-15-*` restantes, 0 Usuario
    Operario de prueba restante, Usuario Gerente de prueba en `INACTIVO`,
    y la consolidación real (contra el galpón demo) sigue intacta.

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` en verde (277/277).
- [x] `npx vitest run --coverage` ≥90% en `server/services/consolidacion.ts`
  (100%/100%, ver S7-13).
- [x] `npx prisma validate` en verde, migración `consolidacion_residuos`
  aplicada contra Neon real (ver S7-1).
- [x] `npm run build` en verde.
- [x] El caso de carrera de S7-12 (guard de saldo bajo concurrencia real)
  confirmado contra Neon real, no solo con mocks.
- [x] El caso "un origen aporta a más de una unidad" verificado tanto en
  test unitario (S7-3) como contra Neon real (S7-12/S7-14).
- [x] `memory/estado-proyecto.md` actualizado: registro de cierre de
  Sprint 7, con la deuda explícita de "sin reversión para Consolidación"
  documentada como pendiente para un sprint futuro si el Product Owner la
  pide (no resuelta en este sprint, ver `spec.md`, R4).
- [x] `specs/roadmap-completo.md` actualizado: Sprint 7 marcado completado,
  progreso `8 de 16 sprints` (50%), R1 — Operación básica marcado
  completo (8/8) — confirmado por el Product Owner.
