# Tareas — Sprint 10

Checklist de planificación — ninguna tarea está ejecutada todavía. Se tilda
cada una al completarla, con la misma disciplina de Sprints 1-9: implementar
tal cual `plan.md` (o anotar el desvío real si lo hay) y verificar en código
real (no solo dar por buena la tarea al escribirla). Orden tal cual "Orden
de ejecución" de `plan.md` — hay dependencias reales entre tareas, no se
debe saltear el orden sin motivo.

- [x] S10-1 — Migración de schema: `enum EstadoBandeja` gana `ROTO`,
  `enum TipoMovimientoSueltos` gana `ROTURA_BANDEJA_ENTRADA`, nuevo
  `model RoturaBandeja` (`bandejaId String @unique`, `pesoExtraido`,
  `unidadesExtraidas`, `unidadesDevueltas`, `creadoEn`), `BandejaSuelta`
  gana el campo inverso `rotura RoturaBandeja?`. Implementado tal cual
  `plan.md`, sin desvíos.

  `npx prisma migrate dev --name rotura_bandeja_y_venta_sueltos` — aplicada
  contra Neon real: `20260814161310_rotura_bandeja_y_venta_sueltos`. SQL
  generado releído y confirmado no destructivo (los dos `ALTER TYPE ... ADD
  VALUE` van antes del `CREATE TABLE`/`FOREIGN KEY` de `RoturaBandeja`,
  mismo orden anticipado en `plan.md`).

  **Desvío operativo real, no de diseño:** `npx prisma generate` falló la
  primera vez con `EPERM` (Windows) al renombrar el `.dll.node` del motor
  de Prisma — un proceso `node.exe` (PID 2180) de una sesión anterior seguía
  escuchando en el puerto 3000 con el cliente viejo cargado en memoria,
  mismo patrón ya documentado en Sprint 1
  (`memory/estado-proyecto.md`, "Herramientas y configuración del entorno").
  Confirmado con el Product Owner antes de matarlo, `taskkill /PID 2180 /F`,
  reintentado `npx prisma generate` con éxito.

  Verificado `npx prisma validate` — "The schema at prisma\schema.prisma is
  valid". `npm run typecheck` corrido a propósito para confirmar el efecto
  esperado: falla en `server/services/inventario.ts` porque
  `Record<TipoMovimientoSueltos, ...>` exhaustivo (Sprint 6) ahora exige
  clasificar `ROTURA_BANDEJA_ENTRADA` — exactamente el error de compilación
  que `plan.md` anticipaba como dependencia real de S10-3, no una rotura
  inesperada. Queda en rojo a propósito hasta S10-3.

- [x] S10-2 — `server/services/rotura.ts` (nuevo): `repartirDevolucion()` +
  `InconsistenciaOrigenesError` tal cual `plan.md` (función pura, sin
  Prisma, con agregación por clave). Implementado sin desvíos.

  Tests unitarios en `tests/unit/services/rotura.test.ts` (8 casos): origen
  único con `loteId` (`PURO`, trivial 100%); tres orígenes con `loteId`
  (`MIXTO`, suma exacta 180); mismo algoritmo con `totalExtraido: 30`
  (Bandeja, dos orígenes); dos filas de origen con la misma clave
  galpón/lote (agregación); un origen sin `loteId` entre varios; todos los
  orígenes sin `loteId`; lista vacía con `totalExtraido: 0` (caso
  defensivo); invariante de suma violada lanza `InconsistenciaOrigenesError`.

  Verificado `npx vitest run --coverage --coverage.all
  --coverage.include="src/server/services/rotura.ts"`: **100% statements
  (14/14), 100% branches (6/6), 100% funciones (2/2), 100% líneas
  (13/13)**. `coverage/` generado borrado al terminar.

- [x] S10-3 — `server/services/inventario.ts` (modifica): agrega
  `ROTURA_BANDEJA_ENTRADA: "ENTRADA"` al `Record` exhaustivo de
  `CLASIFICACION`, sin desvíos — este era exactamente el error de
  compilación que S10-1 dejó pendiente a propósito
  (`Property 'ROTURA_BANDEJA_ENTRADA' is missing in type ...`).

  Test nuevo en `tests/unit/services/inventario.test.ts`
  ("suma ROTURA_BANDEJA_ENTRADA como entrada (Sprint 10)") que confirma la
  clasificación del valor nuevo.

  Verificado `npm run typecheck && npm run lint && npm test` — **378/378
  en verde** (9 tests nuevos sobre los 369 heredados de Sprint 9: 8 de
  S10-2 + 1 de S10-3), sin roturas. `npx prisma validate` en verde.

- [x] S10-4 — `lib/zod/rotura.ts` (nuevo): `romperPaqueteSchema`,
  `romperBandejaSchema` tal cual `plan.md` (sin id de cliente — protegidos
  por la unicidad natural de `paqueteId`/`bandejaId`). Implementado sin
  desvíos.

  Tests en `tests/unit/lib/zod-rotura.test.ts` (10 casos, 5 por schema):
  payload válido; `pesoExtraido` cero rechazado; `pesoExtraido` negativo
  rechazado; `pesoExtraido` fuera de rango rechazado; `paqueteId`/
  `bandejaId` con formato inválido rechazado.

- [x] S10-5 — `lib/zod/venta.ts` (modifica): `cerrarVentaSchema.items` pasa
  a unión discriminada (`itemPaqueteOBandeja` | `itemSuelto`) tal cual
  `plan.md`, sin desvíos.

  Tests nuevos en `tests/unit/lib/zod-venta.test.ts` (7 casos): ítem SUELTO
  válido; carrito mixto (PAQUETE + BANDEJA + SUELTO) válido en conjunto;
  `cantidadUnidades` cero rechazado; `cantidadUnidades` negativa rechazada;
  `cantidadUnidades` no entera rechazada; `pesoKg` de un ítem SUELTO cero o
  negativo rechazado; `galponId`/`loteId` con formato inválido rechazado.
  **Actualizados los dos tests existentes de Sprint 9** que asumían que
  `SUELTO` estaba fuera del enum — el que probaba explícitamente ese
  rechazo se reescribió para probar un tipo verdaderamente inválido
  (`"OTRO"`), y el que enumeraba "los 2 tipos reales de este sprint" se
  renombró a "los 2 tipos con id" (PAQUETE/BANDEJA) para no afirmar que
  SUELTO sigue sin poder enviarse — coherente con `plan.md`.

  Verificado `npm test` — **395/395 en verde** (17 tests nuevos sobre los
  378 heredados de S10-1..S10-3: 10 de S10-4 + 7 de S10-5) y `npm run lint`
  limpio.

  **`npm run typecheck` queda en rojo a propósito, mismo patrón que S10-1:**
  `server/actions/venta.ts` todavía asume la forma vieja de `items`
  (`item.id` para todo ítem) — la unión discriminada nueva ya no tiene `id`
  en la rama `SUELTO`. Es exactamente la dependencia que `plan.md` anticipa
  ("Orden de ejecución", tarea 9 depende de 5 y 7) — se resuelve en S10-7
  (`server/repositories/venta.ts`) y S10-9 (`server/actions/venta.ts`), no
  antes.

- [x] S10-6 — `server/repositories/rotura.ts` (nuevo): `romperPaquete`,
  `romperBandeja` (transacciones interactivas, ancla primero + guard
  después, mismo criterio que `cerrarVenta` de Sprint 9), `PaqueteNoDisponibleError`,
  `BandejaNoDisponibleError`, y las lecturas de apoyo
  (`buscarRoturaPaquetePorPaqueteId`, `buscarPaqueteOrigenesPorPaqueteId`,
  `buscarPaquetePorId`, y sus tres equivalentes de Bandeja) tal cual
  `plan.md`, sin desvíos. Sin id de cliente — `paqueteId`/`bandejaId`
  `@unique` ya protegen el `create` (ver comentario en el propio archivo).

  Sin tests nuevos (repository sin tests, mismo criterio del proyecto) — la
  verificación real de la transacción (incluida la carrera concurrente
  forzada) queda en S10-15.

  Verificado `npm run typecheck` — el archivo compila limpio por sí solo
  (ningún error reportado en `server/repositories/rotura.ts`); los únicos
  errores restantes del proyecto siguen siendo los ya anticipados en
  `server/actions/venta.ts` (S10-9). `npm run lint` limpio, `npm test`
  395/395 sin roturas.

- [x] S10-7 — `server/repositories/venta.ts` (modifica): `cerrarVenta` gana
  el guard de `InventarioSueltos` agregado por clave (`SaldoSueltosInsuficienteError`),
  el `create` de `MovimientoSueltos` tipo `VENTA_SUELTO` por origen
  distinto, y el `detalles.create` mapea el caso `SUELTO` con
  `galponId`/`loteId`/`cantidadUnidades` poblados. Agrega
  `buscarSaldosSueltosPorClaves` (diagnóstico best-effort) tal cual
  `plan.md`, sin desvíos. Los tres guards (Paquete, Bandeja, Sueltos) quedan
  en el mismo orden en que aparecen en el carrito, todos después del ancla
  (`Venta.create`), sin que el orden entre ellos afecte la corrección.

  Sin tests nuevos (repository sin tests) — verificación real en S10-15.

  Verificado `npm run typecheck` — sin errores nuevos atribuibles a este
  archivo (mismos 6 errores ya anticipados en `server/actions/venta.ts`,
  que todavía asume la forma vieja de `items`). `npm run lint` limpio,
  `npm test` 395/395 sin roturas.

  **`npm run typecheck` sigue en rojo, exactamente como se anticipó en
  S10-5:** `server/actions/venta.ts` es la última pieza que falta (S10-9) —
  ninguno de los errores reportados pertenece a `server/repositories/rotura.ts`
  ni a `server/repositories/venta.ts`, confirmando que ambas tareas quedaron
  bien encapsuladas.

- [x] S10-8 — `server/actions/rotura.ts` (nuevo): `romperPaqueteAction`,
  `romperBandejaAction` tal cual `plan.md` — chequeo previo de existencia/
  estado del Paquete/Bandeja, `catch` que distingue `PaqueteNoDisponibleError`/
  `BandejaNoDisponibleError` (guard real fallido) de `P2002` (comparación de
  `pesoExtraido` para distinguir reintento idempotente propio de carrera
  real con mensaje distinto, ver "Diseño de idempotencia" en `plan.md`). Sin
  `rol` en ninguna — abiertas a GERENTE y OPERARIO. Implementado sin
  desvíos.

  Sin tests nuevos (Server Action con repositories mockeados va en S10-13,
  mismo orden de `plan.md`). Verificado `npm run typecheck` — sin ningún
  error atribuible a este archivo.

## Corrección de diseño real, en plena ejecución (post S10-8)
S10-9 a S10-12 se ejecutaron primero tal cual el `plan.md` original
(extender `cerrarVenta`/`/pos` para vender sueltos por unidad, con Romper
Paquete/Bandeja integrado en `/pos`), quedaron en verde
(`typecheck`/`lint`/`test`/`build`), y **se revirtieron por completo**
después de debatir el flujo real con el Product Owner. Ver
"Corrección de diseño real, en plena ejecución" en `spec.md` para el
razonamiento completo — resumen:

1. La granja no vende huevo por unidad (solo Paquete/Bandeja) — "Venta de
   sueltos por unidad" no era una historia real.
2. El único destino real de un suelto liberado por una rotura es
   re-armarse en Paquete/Bandeja vía los wizards de `/consolidacion`
   (Sprint 7) — Romper no tenía motivo de negocio para vivir en `/pos`.

**Revertido por completo** (de vuelta al estado exacto de Sprint 9, sin
ningún cambio): `lib/zod/venta.ts`, `server/repositories/venta.ts`,
`server/actions/venta.ts`, `lib/pdf/comprobante.ts`,
`components/domain/pos/comprobante-dialog.tsx`,
`components/domain/pos/pos-carrito.tsx`,
`components/domain/pos/pos-workspace.tsx`,
`components/domain/pos/pos-selector-items.tsx`,
`app/(app)/pos/page.tsx`, `tests/unit/lib/zod-venta.test.ts`,
`tests/integration/actions/venta.test.ts`. Eliminado por completo:
`components/domain/pos/item-suelto-dialog.tsx`.

**Reubicado** (mismo contenido, movidos de `components/domain/pos/` a
`components/domain/consolidacion/`, con los comentarios internos
actualizados para explicar por qué viven ahí): `romper-paquete-dialog.tsx`,
`romper-bandeja-dialog.tsx`.

**Nuevo, para la ubicación corregida:**
`components/domain/consolidacion/romper-inventario-section.tsx`
(listado de Paquete/BandejaSuelta `DISPONIBLE` con acción "Romper", mismo
patrón de recorte+búsqueda que `PosSelectorItems` pero sin "Agregar" — no
hay carrito en esta pantalla). `app/(app)/consolidacion/page.tsx`
modificado para traer `listarPaquetesDisponibles()`/
`listarBandejasDisponibles()` (reusadas de `server/repositories/venta.ts`,
sin cambios) y renderizar la sección nueva debajo de `SaldosTabla`.

**Lo que NO se tocó ni se revirtió — sigue siendo exactamente correcto sin
cambios:** `server/services/rotura.ts`, `server/repositories/rotura.ts`,
`server/actions/rotura.ts`, `lib/zod/rotura.ts`, y toda la migración de
schema (S10-1 a S10-8). La arquitectura en capas hizo que mover la
feature completa de pantalla fuera, literalmente, solo un cambio de UI —
ninguna de las cuatro capas de servidor de `rotura` necesitó una sola
línea distinta.

Verificado después de la reversión + reubicación completa:
`npm run typecheck` — **limpio, sin ningún error en todo el proyecto**.
`npm run lint` — limpio. `npm test` — **388/388 en verde** (los 395 de
S10-12 menos los 7 tests de `SUELTO` en `zod-venta.test.ts` que dejaron de
aplicar). `npm run build` — verde, `/consolidacion` y `/pos` ambas
listadas entre las rutas dinámicas.

- [x] S10-9 (revertida) — Ver "Corrección de diseño" arriba.
  `server/actions/venta.ts`/`server/repositories/venta.ts`/
  `lib/zod/venta.ts` quedan **sin ningún cambio este sprint**, de vuelta
  al estado exacto de Sprint 9.

- [x] S10-10 (reubicada) — `components/domain/consolidacion/romper-paquete-dialog.tsx`,
  `romper-bandeja-dialog.tsx` (movidos desde `components/domain/pos/`,
  mismo contenido funcional: captura de `pesoExtraido` D1,
  `<form action={formAction}>` con FormData, toast con el resultado
  incluido el aviso de `unidadesSinLote > 0`, `router.refresh()` al tener
  éxito). El botón "Romper" ya NO vive en `pos-selector-items.tsx` (revertido) —
  vive en `romper-inventario-section.tsx` (S10-11).

- [x] S10-11 (reubicada + rediseñada) — `components/domain/consolidacion/romper-inventario-section.tsx`
  (nuevo): dos listados (Paquetes/Bandejas `DISPONIBLE`) con "Romper" por
  fila, mismo patrón de recorte+búsqueda por peso que `PosSelectorItems`
  (Sprint 9). `item-suelto-dialog.tsx` **eliminado** — ya no existe
  "vender sueltos por unidad". `pos-carrito.tsx`/`pos-workspace.tsx`
  revertidos a la forma exacta de Sprint 9 (`ItemCarrito` vuelve a ser
  `{ tipo: "PAQUETE" | "BANDEJA"; id: string; pesoKg: number }`, sin
  `lineaId`/`claveLinea`/`SaldoSuelto`).

- [x] S10-12 (revertida + reemplazada) — `app/(app)/pos/page.tsx`
  revertido a la forma exacta de Sprint 9 (sin `listarInventarioSueltosConSaldo()`,
  sin `saldosSueltos`). En su lugar, `app/(app)/consolidacion/page.tsx`
  gana `listarPaquetesDisponibles()`/`listarBandejasDisponibles()` en el
  `Promise.all` (junto a `listarInventarioSueltosConSaldo()` ya
  existente), convierte `Decimal→number` (mismo criterio que Sprint 9), y
  renderiza `<RomperInventarioSection>` debajo de `<SaldosTabla>` con un
  `<h2>Romper inventario</h2>` + descripción corta. Sin cambios de rol en
  ninguna de las dos páginas.

- [x] S10-13 — `tests/integration/actions/rotura.test.ts` (nuevo, 16
  casos): repositories mockeados, mismo patrón que
  `tests/integration/actions/venta.test.ts` de Sprint 9. Casos por acción
  (Paquete y Bandeja): rotura exitosa `PURO`/`MIXTO` (dos orígenes reales
  pasados sin alterar al repository) y `AuditLog` `ROMPER` real; OPERARIO
  puede romper (sin restricción de rol); rotura con un origen sin `loteId`
  → `unidadesSinLote` correcto en la respuesta; ítem inexistente →
  rechazado antes de tocar el resto; ítem no `DISPONIBLE` (pre-chequeo) →
  rechazado; `PaqueteNoDisponibleError`/`BandejaNoDisponibleError` del
  repository (carrera que pasó el pre-chequeo) → traducido a `AccionError`;
  `P2002` con mismo `pesoExtraido` → éxito idempotente; `P2002` con
  `pesoExtraido` distinto → `AccionError` de carrera/datos diferentes;
  `P2002` pero el registro ya no existe al releer → propaga el error
  original; error no-P2002 se propaga sin pasar por la rama idempotente.

  `tests/integration/actions/venta.test.ts` **no necesitó tests nuevos**
  (sin cambios de código en `server/actions/venta.ts` este sprint, tras la
  corrección de diseño).

  Verificado `npx vitest run tests/integration/actions/rotura.test.ts` —
  **16/16 en verde** en la primera pasada.

- [x] S10-14 — `npx vitest run --coverage`.
  `server/services/rotura.ts` confirmado en **100%/100%/100%/100%** (sin
  cambios desde S10-2). `server/actions/rotura.ts`, forzado con
  `--coverage.all --coverage.include`: **90.9%/84.61%/100%/92.85%** en la
  primera pasada.

  **Hallazgo real de cobertura, mismo patrón recurrente que S7-13/S8-15/
  S9-15:** las tres ramas de error de la rama idempotencia/carrera real de
  `romperBandejaAction` (propagar un error no-`P2002`, `P2002` con el
  registro ya no encontrado al releer, `pesoExtraido` distinto → carrera
  real) y la rama "la bandeja no existe" eran un mirror exacto de
  `romperPaqueteAction`, pero ningún test las ejercitaba específicamente
  para Bandeja — los tests de S10-13 solo habían cubierto esas 4 ramas del
  lado de Paquete.

  **Corregido con 4 tests reales nuevos** (no casos artificiales) en
  `tests/integration/actions/rotura.test.ts`: "la bandeja no existe";
  carrera real con `pesoExtraido` distinto para Bandeja; `P2002` pero no
  existe al releer para Bandeja; error no-`P2002` se propaga para Bandeja.
  Recobertura: **100%/100%/100%/100%** en `server/actions/rotura.ts`.

  `coverage/` generado borrado al terminar (dos veces — antes y después de
  agregar los tests, mismo criterio que S5-11/S6-14/S7-13/S8-15/S9-15).

  Verificado `npm run typecheck && npm run lint && npm test` — **408/408
  en verde** (20 tests nuevos sobre los 388 heredados de la corrección de
  diseño: 16 de S10-13 + 4 de este hallazgo de cobertura).

- [x] S10-15 — Verificación en vivo contra Neon real, script temporal
  (`_tmp_verif_s10_15.ts`, `npx tsx --env-file=.env`, borrado al terminar,
  mismo criterio de nombre reconocible que S5-12/S6-15/S7-14/S8-16/S9-16).
  Llamó a `romperPaquete()`/`romperBandeja()` (`server/repositories/rotura.ts`)
  directamente, no a las Server Actions (mismo criterio que S8-16/S9-16).
  **30/30 asserts en verde, sin ningún bug real encontrado:**
  1. Alta de datos de prueba (Usuario, 2 Galpón, 2 Lote, todos temporales):
     un Paquete `PURO` (un origen, Galpón A/Lote 1), un Paquete `MIXTO`
     (dos orígenes reales, 120 de A/Lote1 + 60 de B/Lote2), un Paquete
     cuyo único `PaqueteOrigen` tiene `loteId` null (simulando una fila
     pre-Sprint-7), un Paquete extra para la carrera, una Bandeja con dos
     orígenes (18 de A/Lote1 + 12 de B/Lote2), una Bandeja extra para la
     carrera — todos `DISPONIBLE`.
  2. `romperPaquete()` sobre el `PURO`: `RoturaPaquete` real
     (`unidadesExtraidas: 180`, `unidadesDevueltas: 180`), Paquete pasó a
     `ROTO`, `InventarioSueltos(A,Lote1)` incrementado en exactamente 180,
     1 `MovimientoSueltos` `ROTURA_PAQUETE_ENTRADA` real.
  3. `romperPaquete()` sobre el `MIXTO`: `InventarioSueltos(A,Lote1)` +120,
     `InventarioSueltos(B,Lote2)` +60, 2 `MovimientoSueltos` distintos.
  4. `romperPaquete()` sobre el Paquete con `loteId` null:
     `unidadesDevueltas: 0`, `unidadesSinLote: 180` en la respuesta, CERO
     `MovimientoSueltos` creados para ese origen (nada acreditado en
     silencio), `InventarioSueltos(A,Lote1)` sin cambios.
  5. `romperBandeja()` con dos orígenes: `RoturaBandeja` real
     (`unidadesExtraidas: 30`, `unidadesDevueltas: 30`), Bandeja pasó a
     `ROTO`, 2 `MovimientoSueltos` `ROTURA_BANDEJA_ENTRADA` reales.
  6. **Carrera real forzada** (`Promise.allSettled`, dos `romperPaquete()`
     concurrentes sobre el MISMO Paquete `DISPONIBLE`, pesos distintos a
     propósito): exactamente 1 `fulfilled` y 1 `rejected`; el Paquete
     quedó `ROTO` una sola vez, exactamente 1 `RoturaPaquete` real.
     **Repetido idéntico para `romperBandeja()`**: mismo resultado.
  7. Idempotencia real: reintentar `romperPaquete()` sobre el `PURO` ya
     roto, con el MISMO `pesoExtraido` (11.65) → `P2002` real de
     Postgres capturado; `RoturaPaquete` sigue en 1 fila,
     `InventarioSueltos(A,Lote1)` no se volvió a incrementar.
  8. Datos de prueba borrados al terminar (`MovimientoSueltos`,
     `InventarioSueltos`, `Paquete` — cascada real sobre `PaqueteOrigen`/
     `RoturaPaquete` —, `BandejaSuelta` — cascada sobre `BandejaOrigen`/
     `RoturaBandeja` —, `Lote`, `Galpon`, `Usuario`) y reconfirmados en 0
     con consultas separadas por tabla.

- [x] S10-16 — Verificación clic a clic en navegador real, con la
  extensión Claude in Chrome conectada contra `npm run dev` local (mismo
  Neon compartido, R1). Datos de prueba temporales creados con un script
  (`_tmp_setup_s10_16.ts`): usuario `verif.s10.browser` (GERENTE, password
  conocida para loguearse), 2 Galpón/2 Lote temporales, un Paquete `MIXTO`
  (120/60), un Paquete con un origen sin `loteId`, una Bandeja con dos
  orígenes (18/12) — todos `DISPONIBLE`. **Sin hallazgos de bugs.**

  Checklist confirmado, todo en `/consolidacion`:
  - "Listado de inventario" (título corregido a pedido del Product Owner,
    sin descripción adicional — el botón "Romper" ya explica su propio
    propósito en el `<Dialog>`) muestra los Paquetes/Bandejas de prueba
    junto a inventario real preexistente de Sprint 9 (dos Bandejas
    3.300/3.200 kg, dejadas intactas a propósito, sin tocarlas).
  - Botón "Romper" visible en cada fila; el diálogo muestra el peso
    original y pide el peso leído en báscula (D1).
  - Romper el Paquete `MIXTO` (11.800 kg): `SaldosTabla` se actualizó SIN
    recargar manualmente, con dos filas nuevas exactas (Galpón A/Lote1:
    120, Galpón B/Lote2: 60 — coincide con `PaqueteOrigen` real); el
    Paquete desapareció del listado.
  - Romper el Paquete con origen sin `loteId` (11.600 kg): **dos toasts
    reales** — éxito ("Se acreditaron 0 de 180 unidades...") + aviso
    ámbar ("180 unidades quedaron sin acreditar automáticamente — un
    Gerente puede acreditarlas desde 'Ajustar inventario'").
    `SaldosTabla` sin cambios para ese origen (nada acreditado en
    silencio, confirmado visualmente).
  - Romper la Bandeja (1.950 kg): `SaldosTabla` actualizada de 120→138
    (+18) y 60→72 (+12), exacto; la Bandeja desapareció del listado, las
    dos Bandejas reales preexistentes (3.300/3.200 kg) quedaron intactas.
  - **H4, segundo Gherkin confirmado sin salir de la pantalla:** abierto
    "Armar Bandeja" inmediatamente después — el wizard ya lista los dos
    orígenes liberados por las roturas (138 y 72 sueltos) como
    seleccionables, sin ninguna navegación entre romper y armar.
  - `/pos` confirmado sin ningún cambio respecto a Sprint 9: sin botón
    "Romper", sin sección de sueltos, mismo layout exacto (Cliente,
    Paquetes/Bandejas disponibles, Carrito, Descuento, Método de pago).
  - Consola del navegador revisada: el único mensaje es un hydration
    mismatch por `cz-shortcut-listen` (artefacto real de una extensión de
    navegador — ColorZilla — modificando el `<body>` antes de que React
    hidrate, explícitamente descrito así en el propio texto del warning de
    React) — no es un bug de código de este sprint.
  - Acceso confirmado como GERENTE (el usuario de prueba); no se probó
    explícitamente con un OPERARIO en el navegador esta vez — la ausencia
    de restricción de rol ya está confirmada por los tests de integración
    de S10-13 (`server/actions/rotura.ts` sin `rol` en `withAuth`, y un
    test real con sesión OPERARIO por cada acción).

  Datos de prueba limpiados con `_tmp_cleanup_s10_16.ts` y reconfirmados
  en 0 (`MovimientoSueltos`, `InventarioSueltos`, `Paquete`,
  `BandejaSuelta`, `Lote`, `Galpon`, `Usuario`). Ambos scripts temporales
  borrados al terminar. Servidor `npm run dev` y pestaña del navegador
  cerrados al finalizar.

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` en verde (408/408).
- [x] `npx vitest run --coverage` ≥90% en `server/services/rotura.ts`
  (100%/100%/100%/100%, S10-14).
- [x] `npx prisma validate` en verde, migración
  `rotura_bandeja_y_venta_sueltos` aplicada contra Neon real (S10-1).
- [x] `npm run build` en verde (`/consolidacion`, `/pos` listadas).
- [x] Guard anti-doble-rotura verificado bajo carrera real concurrente
  forzada contra Neon, para Paquete Y Bandeja (S10-15, paso 6).
- [x] `repartirDevolucion()` verificado con el caso real de un origen sin
  `loteId` (S10-15, paso 4) — remanente correcto, sin acreditar en
  silencio.
- [x] Idempotencia real confirmada contra Neon para ambas roturas (S10-15,
  paso 7).
- [x] `AuditLog` con filas reales `ROMPER` sobre `RoturaPaquete`/
  `RoturaBandeja`, verificadas contra Neon — confirmado con una consulta
  directa tras S10-16: 3 filas reales (`RoturaBandeja`×1, `RoturaPaquete`×2,
  todas `accion: "ROMPER"`), atribuidas a la cuenta real `gerente` que ya
  estaba logueada en la sesión del navegador (no la cuenta temporal
  `verif.s10.browser`, que terminó sin usarse para ninguna mutación real —
  por eso se pudo borrar sin chocar contra el `onDelete: Restrict` de
  `AuditLog.usuarioId`). Esas 3 filas quedan en la base con `entidadId`
  apuntando a entidades de prueba ya borradas — comportamiento aceptado
  del proyecto (log de auditoría inmutable, mismo criterio que Sprint 9 no
  purgó las filas de `AuditLog` que dejó su propia verificación en vivo).
- [x] Verificación clic a clic en navegador real completa (S10-16),
  incluida la confirmación de que `/pos` no cambió respecto a Sprint 9.
- [x] `memory/estado-proyecto.md` actualizado: registro de cierre de
  Sprint 10, incluida la migración no anticipada en el brief original, la
  decisión de negocio de incluir Bandeja además de Paquete, **y la
  corrección de diseño real en plena ejecución** (venta de sueltos
  revertida por completo, Romper reubicado de `/pos` a `/consolidacion`) —
  mismo criterio de "documentar el desvío real" que Sprint 7/9 ya
  establecieron, no un cierre que aparente que el sprint salió lineal.
- [x] `specs/roadmap-completo.md` actualizado: Sprint 10 marcado
  ✅ COMPLETADO, progreso `11 de 16 sprints (69%)`, tabla de releases
  actualizada (R2 — Finanzas 3/4).
