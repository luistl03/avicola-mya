# Tareas — Sprint 6

Checklist de planificación — ninguna tarea está ejecutada todavía. Se
tilda cada una al completarla, con la misma disciplina de Sprints 1-5:
implementar tal cual `plan.md` (o anotar el desvío real si lo hay) y
verificar en código real (no solo dar por buena la tarea al escribirla).

- [x] S6-1 — Migración de schema: `RegistroRecoleccion.revertidoEn
  DateTime?` (`npx prisma migrate dev --name recoleccion_revertido_en`).
  No destructiva (`ADD COLUMN "revertidoEn" TIMESTAMP(3)`), mismo patrón
  que la migración de Mortalidad (Sprint 4) — migración
  `20260812164434_recoleccion_revertido_en`, aplicada contra Neon real.

  **Desvío operativo real, no de código:** `prisma generate` falló al
  final del `migrate dev` con `EPERM` (el motor de Prisma Client
  bloqueado en Windows) porque un `npm run dev` de este mismo repo seguía
  corriendo en otra terminal (confirmado con
  `Get-CimInstance Win32_Process` — la cadena completa `npm run dev` →
  `next dev` → `start-server.js` → worker de build, las cuatro
  correspondientes a este proyecto, no a otro proceso ajeno). Se le pidió
  confirmación al Product Owner antes de tocar el proceso — cerró el dev
  server desde su otra terminal, y `npx prisma generate` se reintentó con
  éxito después.

  Verificado `npx prisma validate` (válido) y `npm run typecheck` (sin
  errores) con el cliente ya regenerado. Sin tests de integración
  afectados todavía — el campo no lo usa ningún código real hasta S6-6.

- [x] S6-2 — `lib/constants.ts`: renombrar `MORTALIDAD_VENTANA_GRACIA_MIN`
  → `VENTANA_GRACIA_MIN` (mismo valor, 10). Actualizados los dos usos
  reales: `server/services/mortalidad.ts` (`puedeRevertirMortalidad`) y
  `components/domain/mortalidad/revertir-mortalidad-boton.tsx`.
  Confirmado por `grep` que ningún archivo de `tests/` referenciaba la
  constante por nombre (los tests de `puedeRevertirMortalidad` usan
  offsets de minutos numéricos directos, no importan la constante) — sin
  tests que actualizar. Sin cambio de comportamiento.

  Verificado `npm run typecheck && npm run lint && npm test` — 197/197
  en verde (sin tests nuevos, ninguno roto).

- [x] S6-3 — `server/services/recoleccion.ts`: `puedeRevertirRecoleccion({
  revertido, creadoEn, ahora, paquetesNoDisponibles })` (`GuardResultado`,
  orden de chequeos: ya revertido → elegibilidad → ventana vencida, tal
  cual el diseño de `plan.md`, sin desvíos). Tests unitarios nuevos en
  `tests/unit/services/recoleccion.test.ts` (7 casos): ya revertido
  rechazado sin importar tiempo/elegibilidad, paquete no disponible
  rechazado dentro de la ventana, elegibilidad priorizada sobre ventana
  vencida cuando ambos motivos aplican a la vez (confirma el orden real,
  no solo cada rama por separado), caso feliz dentro de la ventana sin
  paquetes no disponibles, borde exacto de 10 minutos (permite en el
  límite exacto, rechaza a 10 min y 1 seg — mismo criterio ya probado
  para `puedeRevertirMortalidad`).

  Verificado `npm run typecheck && npm run lint && npm test` — 203/203 en
  verde (6 tests nuevos sobre los 197 heredados de S6-2).

- [x] S6-4 — `server/services/inventario.ts`: resuelto el signo de
  `REVERSION` (movido a `TIPOS_SALIDA`) y de `AJUSTE_GERENTE` (sacado de
  `TIPOS_ENTRADA`, se suma `movimiento.cantidad` directo con signo, antes
  de entrar a las listas `TIPOS_ENTRADA`/`TIPOS_SALIDA`) en
  `reconstruirSaldo()`, tal cual el diseño de `plan.md`. El comentario del
  código documenta explícitamente que `AJUSTE_GERENTE` es el único tipo
  cuyo `cantidad` no es siempre positivo, para que un reporte futuro
  (Sprint 15) no lo asuma a ciegas.

  `tests/unit/services/inventario.test.ts` actualizado: el test que
  asumía `AJUSTE_GERENTE` como entrada fija (Sprint 5) se dividió en
  `ROTURA_PAQUETE_ENTRADA` (sigue siendo entrada, test propio) y dos
  tests nuevos de `AJUSTE_GERENTE` (positivo suma, negativo resta); el
  test que "ignoraba" `REVERSION` (placeholder de Sprint 5, documentado
  ahí como "sin caso real todavía") se reemplazó por uno que confirma que
  resta y deshace exactamente un `RECOLECCION` anterior; el test de
  secuencia mixta se amplió para incluir una reversión completa más un
  ajuste manual posterior (110 − 110 + 65 + 10 = 75), no solo
  entrada/salida simples.

  Verificado `npm run typecheck && npm run lint && npm test` — 206/206
  en verde sobre los 203 heredados de S6-3.

- [x] S6-5 — `lib/zod/recoleccion.ts`: `revertirRecoleccionSchema` ({
  registroId: idUuid() }), mismo patrón mínimo que
  `revertirMortalidadSchema`. `lib/zod/inventario.ts` (nuevo):
  `ajustarInventarioSueltosSchema` (`id: idUuid()`, `galponId:
  idUuid("Seleccioná un galpón")`, `loteId: idUuid("Seleccioná un
  lote")`, `delta: z.coerce.number().int().refine(v => v !== 0, "El
  ajuste no puede ser 0")`, `motivo: z.string().trim().min(10,
  ...).max(500)`). Implementado tal cual el diseño de `plan.md`, sin
  desvíos.

  Tests: 3 casos nuevos de `revertirRecoleccionSchema` agregados a
  `tests/unit/lib/zod-recoleccion.test.ts` (id válido, id inválido,
  campo faltante). `tests/unit/lib/zod-inventario.test.ts` (nuevo
  archivo, 11 casos): ajuste positivo y negativo válidos, delta = 0
  rechazado (con el mensaje exacto), delta no entero rechazado, `id`/
  `galponId`/`loteId` inválidos (los dos últimos con su mensaje
  personalizado), motivo de 9 caracteres rechazado, motivo de
  exactamente 10 aceptado (borde inferior), motivo vacío o solo espacios
  rechazado (confirma que `.trim()` corre antes que `.min()`), motivo
  que excede 500 caracteres rechazado.

  Verificado `npm run typecheck && npm run lint && npm test` — 220/220
  en verde (14 tests nuevos sobre los 206 heredados de S6-4).

- [x] S6-6 — `server/repositories/recoleccion.ts`: `revertirRecoleccion()`
  (cuarta transacción interactiva del proyecto — guard atómico de "ya
  revertido" vía `updateMany`, guard "todo o nada" sobre `Paquete` vía
  `count` + `updateMany` + comparación, guard de saldo suficiente sobre
  `InventarioSueltos` vía `updateMany` condicional, `MovimientoSueltos`
  `REVERSION` condicional cuando `sueltos > 0`). Errores custom
  exportados: `YaRevertidoError`, `PaquetesNoDisponiblesError`,
  `SaldoInsuficienteError`. Implementado tal cual el pseudocódigo de
  `plan.md`, sin desvíos — `sueltos` sigue recibiéndose como parámetro de
  quien llama (mismo criterio de ADR-000 que `registrarRecoleccion`, este
  repository no importa `server/services/recoleccion.ts`).

  Sin tests nuevos en esta tarea — mismo criterio ya establecido del
  proyecto ("no hay tests de repository", ver
  `memory/convenciones.md`/ADR-000): los tres guards se verifican con
  tests de integración de la action (S6-12) y, el caso de carrera real,
  contra Neon (S6-13).

  Verificado `npm run typecheck && npm run lint && npm test` — 220/220
  en verde, sin roturas.

- [x] S6-7 — `server/repositories/inventario.ts`:
  `ajustarInventarioSueltos()` (quinta transacción interactiva — upsert
  normal si `delta >= 0` (crea o incrementa, un ajuste positivo nunca
  necesita guard), `updateMany` condicional si `delta < 0` (`WHERE
  cantidad >= -delta`, mismo patrón que `avesVivas`/la reversión de
  Recolección — si no hay fila todavía para ese galpón/lote, el
  `updateMany` no afecta nada y cae en el mismo guard), `create` de
  `MovimientoSueltos` `AJUSTE_GERENTE` con `id` de cliente al final de la
  transacción. Error custom `SaldoInsuficienteAjusteError`.
  `buscarMovimientoSueltosPorId(id)` nueva, lectura mínima para la rama
  de idempotencia de la Server Action. Implementado tal cual el diseño de
  `plan.md`, sin desvíos.

  Sin tests nuevos (mismo criterio que S6-6 — sin tests de repository en
  este proyecto).

  Verificado `npm run typecheck && npm run lint && npm test` — 220/220
  en verde, sin roturas.

- [x] S6-8 — `server/actions/recoleccion.ts`: `revertirRecoleccionAction`
  vía `withAuth({ schema: revertirRecoleccionSchema, entidad:
  "RegistroRecoleccion", accion: "REVERTIR" })`, sin `rol`. Orden real:
  busca el registro con sus paquetes (`buscarRecoleccionConPaquetesPorId`)
  → cuenta `paquetesNoDisponibles` (`registro.paquetes.filter(p =>
  p.estado !== "DISPONIBLE").length`) → `puedeRevertirRecoleccion` →
  recalcula `sueltos` vía `calcularEmpaque(registro.cantidadTotal)` →
  llama al repository → traduce `YaRevertidoError`/
  `PaquetesNoDisponiblesError`/`SaldoInsuficienteError` a `AccionError`
  con el mensaje correspondiente. Implementado tal cual el diseño de
  `plan.md`, sin desvíos.

  Tests de integración de esta action quedan en S6-12 (mismo criterio
  flexible que Sprint 5 usó entre S5-6/S5-10 — se agrupan con los del
  ajuste manual de S6-9 en una sola tarea de tests).

  Verificado `npm run typecheck && npm run lint && npm test` — 220/220
  en verde, y `npm run build` limpio (sin fugas de import de servidor a
  cliente).

- [x] S6-9 — `server/actions/inventario.ts` (nuevo):
  `ajustarInventarioSueltosAction` vía `withAuth({ schema:
  ajustarInventarioSueltosSchema, entidad: "MovimientoSueltos", accion:
  "AJUSTAR", rol: "GERENTE" })` — primera Server Action del proyecto
  restringida a un solo rol dentro de un módulo por lo demás abierto a
  ambos. Captura `SaldoInsuficienteAjusteError` → `AccionError`; captura
  `P2002` → compara `cantidad`/`motivo` contra
  `buscarMovimientoSueltosPorId(input.id)` (mismo patrón de idempotencia
  que `crearUsuario`/`registrarRecoleccion`/`registrarMortalidad`: si
  coinciden, responde éxito idempotente con lo ya existente; si no,
  `AccionError` explícito). Implementado tal cual el diseño de `plan.md`,
  sin desvíos.

  Verificado `npm run typecheck && npm run lint && npm test` — 220/220
  en verde, y `npm run build` limpio.

- [x] S6-10 — `components/domain/recoleccion/revertir-recoleccion-boton.tsx`
  (nuevo, clon de `RevertirMortalidadBoton` con `creadoEn` en vez de
  `fecha`, `VENTANA_GRACIA_MIN` ya renombrada desde S6-2, invoca
  `revertirRecoleccionAction`). Único agregado real respecto al clon
  directo: un cuarto campo `paquetesNoDisponibles` en las props — si es
  `> 0` se muestra un texto atenuado "No disponible" en vez del botón
  (distinto de "Revertido" y de "—" por ventana vencida), consistente con
  la guard real del servidor sin necesitar hacer clic para descubrir el
  rechazo.

  Ampliado el `include` de `listarRecolecciones`
  (`server/repositories/recoleccion.ts`) para traer también
  `paquetes.estado` (ya traía `paquetes.id` desde Sprint 5).
  `RecoleccionesTabla` amplía su tipo reconstruido a mano con `revertido`
  y `paquetes[].estado` (`EstadoPaquete`), agrega columna "Acciones",
  calcula `paquetesNoDisponibles` por fila
  (`registro.paquetes.filter(p => p.estado !== "DISPONIBLE").length`) y
  aplica `opacity-60` a la fila completa cuando `revertido`, mismo
  criterio visual que `MortalidadTabla`.

  Verificado `npm run typecheck && npm run lint && npm test` — 220/220
  en verde, y `npm run build` limpio.

- [x] S6-11 — `components/domain/inventario/ajustar-inventario-sueltos-dialog.tsx`
  (nuevo): `<Dialog>` compacto, `<Select>` de lote (`listarLotesActivos`)
  y `<Select>` de galpón (`listarGalponesActivos`) independientes y
  controlados, input `delta` (numérico, admite negativo, sin `min`/`max`
  HTML que choquen con valores negativos válidos), `<Textarea>` `motivo`
  (componente `ui/textarea.tsx` ya existía sin usar en el proyecto) con
  contador de caracteres (`{motivo.trim().length}/{MOTIVO_MIN}`), botón
  "Guardar" deshabilitado hasta que haya lote+galpón+`delta` entero
  distinto de 0+motivo con el mínimo de caracteres, `id` generado una
  sola vez por apertura (`useState(() => crypto.randomUUID())`), `<form
  action={formAction}>` normal — sin el bypass de `startTransition` que
  sí necesitó `RegistrarRecoleccionDialog`, acá no hay campos de longitud
  variable, mismo patrón que `RegistrarMortalidadDialog`.

  Integrado en `app/(app)/recoleccion/page.tsx`: agregado `auth()` y
  `listarGalponesActivos()` al `Promise.all` del fetch inicial, `esGerente
  = session?.user?.rol === "GERENTE"` decide si `AjustarInventarioSueltosDialog`
  se renderiza junto a `RegistrarRecoleccionDialog` dentro de `actions` del
  `PageHeader` — chequeo hecho en el Server Component, no con un hook de
  sesión en cliente (mismo criterio que el resto del proyecto, `auth()`
  solo se llama en servidor). La defensa real sigue siendo `rol:
  "GERENTE"` en `withAuth` (S6-9); esto es solo para no mostrarle el botón
  a un Operario.

  Verificado `npm run typecheck && npm run lint && npm test` — 220/220
  en verde, y `npm run build` limpio.

- [x] S6-12 — `tests/integration/actions/recoleccion.test.ts` (ampliado,
  10 tests nuevos en `describe("revertirRecoleccionAction", ...)`) y
  `tests/integration/actions/inventario.test.ts` (nuevo, 10 tests):
  repositories mockeados, mismo patrón que Mortalidad/Recolección de
  Sprint 4-5 (las tres clases de error de `revertirRecoleccion` y la de
  `ajustarInventarioSueltos` se re-declaran dentro del factory de
  `vi.mock`, mismo criterio que `YaRevertidoError` en
  `mortalidad.test.ts`, para que el `instanceof` de la action siga
  funcionando contra la clase mockeada).

  Reversión: registro inexistente, ya revertido (sin llamar al
  repository), paquete no disponible (bloqueo completo, todo o nada — se
  verifica que `revertirRecoleccionRepoMock` NUNCA se invoca), ventana
  vencida, las tres traducciones de error de carrera
  (`YaRevertidoError`/`PaquetesNoDisponiblesError`/`SaldoInsuficienteError`
  → mensaje claro, `AuditLog` no escrito), caso feliz con sueltos
  (confirma que `sueltos` se recalcula vía `calcularEmpaque` real, no
  mockeado, y se pasa al repository), caso feliz múltiplo exacto de 180
  (`sueltos: 0` pasado explícito), OPERARIO sin restricción de rol.

  Ajuste: OPERARIO rechazado por `withAuth` con `"No autorizado."` antes
  de tocar el repository (primer test del proyecto que ejercita un rol
  restringido dentro de un módulo por lo demás abierto), motivo de menos
  de 10 caracteres rechazado con `"Datos inválidos."` antes de tocar el
  repository, delta positivo y negativo exitosos con `AuditLog`
  (`entidad: "MovimientoSueltos"`, `accion: "AJUSTAR"`),
  `SaldoInsuficienteAjusteError` traducido, y las cuatro ramas de
  idempotencia (mismos datos devuelve lo existente sin re-invocar el
  repository de escritura, delta distinto rechazado explícito, motivo
  distinto rechazado explícito, `P2002` sin lectura inmediata propaga el
  error original, cualquier otro error de Prisma se propaga tal cual).

  Verificado `npm run typecheck && npm run lint && npm test` — 240/240
  en verde (20 tests nuevos sobre los 220 heredados de S6-11), y
  `npm run build` limpio.

- [x] S6-13 — Tests de carrera reales contra Neon, con un script temporal
  (`_tmp_verificacion_s6_13.ts`, ejecutado con `npx tsx` contra la
  conexión pooled `DATABASE_URL` — mismo pooler PgBouncer modo
  *transaction* que ya dio problemas reales en Sprint 0/1 y que Sprint 4
  verificó explícitamente para `avesVivas` —, borrado al terminar) que
  importa y ejercita el código real de los repositories de este sprint
  (`revertirRecoleccion`, `ajustarInventarioSueltos`), no mocks, no
  reimplementación de la lógica, contra un Usuario/2 Galpones/1 Lote
  temporales.

  Los tres casos de H5, todos verificados con `Promise.allSettled` +
  asserts reales releyendo la base después (no solo el resultado
  devuelto):
  1. **Doble reversión concurrente** del mismo `RegistroRecoleccion` (470,
     con sueltos): exactamente una llamada tuvo éxito, la otra rechazó
     con `YaRevertidoError`; `revertido` quedó en `true` una sola vez,
     `InventarioSueltos` se decrementó una sola vez (110 → 0), un solo
     `MovimientoSueltos` `REVERSION`, los 2 `Paquete` quedaron `ANULADO`.
  2. **Reversión vs. "venta" simulada** (registro de 360, múltiplo exacto
     de 180, sin sueltos): un `Paquete` se marcó `VENDIDO` con un
     `UPDATE` directo justo antes de llamar a `revertirRecoleccion()` —
     la transacción rechazó con `PaquetesNoDisponiblesError`, `revertido`
     siguió en `false`, y el otro `Paquete` (que seguía `DISPONIBLE`) NO
     cambió — todo o nada confirmado bajo la carrera real, no solo en el
     caso secuencial ya cubierto por S6-12.
  3. **Doble ajuste manual concurrente** (saldo inicial 10, dos llamadas
     con `delta: -8`): exactamente una tuvo éxito, la otra rechazó con
     `SaldoInsuficienteAjusteError`; el saldo final quedó en 2 (nunca
     negativo), un solo `MovimientoSueltos` `AJUSTE_GERENTE`.

  **Sin bugs de código encontrados** — los tres casos pasaron a la
  primera ejecución del script, sin necesitar ningún ajuste al código de
  S6-6/S6-7. Datos de prueba (usuario, 2 galpones, lote, y todas las
  filas dependientes) borrados al terminar y reconfirmados en 0 con una
  consulta separada antes de borrar el script.

  Verificado `npm run typecheck && npm run lint && npm test` — 240/240
  en verde después de borrar el script (sin cambios de código de
  producción en esta tarea).

- [x] S6-14 — `npx vitest run --coverage`. `server/services/recoleccion.ts`
  quedó en 100%/100% (statements/branches) tal cual — sin sorpresas.

  **Brecha real encontrada y corregida (no anticipada en `plan.md`):**
  `server/services/inventario.ts` cayó a 90.00% statements / 83.33%
  branches — el reporte señaló la rama `if (TIPOS_SALIDA.includes(...))`
  y su `return saldo;` de respaldo (línea 30-31) sin cubrir. Causa real,
  no un test faltante: una vez que S6-4 terminó de clasificar los 6
  valores de `TipoMovimientoSueltos` (`AJUSTE_GERENTE` explícito +
  `TIPOS_ENTRADA` + `TIPOS_SALIDA` cubren los 6), ese `return saldo;`
  final quedó **inalcanzable** para cualquier valor válido del enum — en
  Sprint 5 sí era alcanzable (cubría `REVERSION`/`AJUSTE_GERENTE`,
  todavía sin clasificar). Escribir un test que fuerce esa rama hubiera
  significado castear un `tipo` inválido solo para inflar el número, algo
  que el propio `CLAUDE.md` desalienta ("no validar escenarios que no
  pueden pasar").

  **Corregido de raíz, no maquillado:** `reconstruirSaldo()` se reescribió
  con una clasificación exhaustiva vía
  `Record<TipoMovimientoSueltos, "ENTRADA" | "SALIDA" | "AJUSTE">` en vez
  de la cadena de `if`/arrays — TypeScript exige que las 6 claves del enum
  aparezcan en el `Record`, así que un tipo nuevo agregado al enum sin
  clasificar acá es un error de compilación, no una rama sin cubrir en
  producción. Elimina el `return saldo;` de respaldo por completo (ya no
  hace falta: los tres casos posibles — `SALIDA`, o `ENTRADA`/`AJUSTE`,
  que suman igual — cubren los 6 valores reales). Comportamiento
  idéntico, mismos 240 tests existentes en verde sin tocar ninguno.

  Recobertura tras el fix: `server/services/inventario.ts` 100%/100%
  (5/5 statements, 2/2 branches — el `Record` colapsó la lógica a menos
  ramas totales, no solo cubrió las que faltaban).

  `coverage/` (generado, gitignored) borrado al terminar, mismo criterio
  que S5-11/S5-3.

  Verificado `npm run typecheck && npm run lint && npm test` — 240/240
  en verde, y `npm run build` limpio.

- [x] S6-15 — Verificación en vivo contra Neon real, script temporal
  (`_tmp_verificacion_s6_15.ts`, borrado al terminar, mismo criterio que
  S5-12/S6-13 — llama a los repositories reales directamente, no a las
  Server Actions, que dependen de `auth()`/contexto de request). Cinco
  casos secuenciales (no concurrentes, eso ya quedó cubierto en S6-13),
  todos con asserts releyendo la fila real de Neon después de cada
  operación:

  1. **Reversión completa con sueltos** (470 → 2 `Paquete` + sueltos
     110): `revertido`/`revertidoEn` seteados, los 2 `Paquete` a
     `ANULADO`, `InventarioSueltos` decrementado a 0, `MovimientoSueltos`
     `REVERSION` creado, y `reconstruirSaldo()` sobre el historial
     completo (`RECOLECCION` + `REVERSION`) reproduce exactamente el
     `InventarioSueltos.cantidad` resultante (0).
  2. **Reversión múltiplo exacto de 180** (360, sin sueltos): los 2
     `Paquete` a `ANULADO`, y confirmado que siguen siendo los mismos 2
     `MovimientoSueltos` del caso 1 — sin ruido nuevo en el ledger.
  3. **Reversión solo con sueltos** (45, sin ningún `Paquete`):
     `revertido=true` sin nada que anular, `InventarioSueltos`
     decrementado a 0, 1 `MovimientoSueltos` `REVERSION`.
  4. **Ajuste manual positivo** (delta +20 sobre un galpón/lote sin fila
     previa de `InventarioSueltos`): confirma la rama `upsert`/`create`
     de `ajustarInventarioSueltos`, `InventarioSueltos` queda en 20.
  5. **Ajuste manual negativo** (delta −10 sobre el saldo de 20 que dejó
     el caso 4): `InventarioSueltos` en 10, `reconstruirSaldo()` sobre
     los 2 `MovimientoSueltos` `AJUSTE_GERENTE` (+20, −10) reproduce el
     saldo final.

  **`AuditLog` real, llamado a mano** con los mismos parámetros que
  pondría cada Server Action (mismo criterio que S5-12: las actions
  dependen de `auth()`, que no existe fuera de un request real) — una
  fila `REVERTIR`/`RegistroRecoleccion` y una `AJUSTAR`/`MovimientoSueltos`,
  ambas releídas de Neon para confirmar que la escritura real funciona.

  **Sin bugs de código encontrados** — los cinco casos pasaron a la
  primera ejecución del script. Datos de prueba (usuario, 3 galpones,
  lote, 3 registros, 2 filas de `AuditLog`, y todo lo dependiente)
  borrados al terminar y reconfirmados en 0 con una consulta separada
  antes de borrar el script.

  Verificado `npm run typecheck && npm run lint && npm test` — 240/240
  en verde después de borrar el script.

- [x] S6-16 — Verificación clic a clic en navegador real por el Product
  Owner contra `npm run dev` (camino alternativo ya usado en Sprints
  1-5), con dos usuarios temporales
  (`verif.s6.16.gerente`/`verif.s6.16.operario`, ambos
  `Verificacion123!`, creados con un script y borrados al terminar).

  **Corrección real encontrada y aplicada en vivo** (no un bug de
  código, un problema de diseño de UX que el Product Owner señaló
  probando): el diálogo "Ajustar inventario" pedía elegir **galpón y
  lote** en dos `<Select>` independientes — el Product Owner hizo notar
  que un lote ya tiene un galpón actual resuelto (`buscarUbicacionActual`,
  el mismo patrón que usa Registrar Recolección/Mortalidad desde
  Sprint 4-5), así que pedirlo aparte era fricción sin un caso de uso
  real detrás (el caso "ajustar un galpón histórico" que había motivado
  el diseño original no es el que el Gerente necesita resolver en la
  práctica). Corregido de punta a punta, no solo la UI:
  - `lib/zod/inventario.ts`: `ajustarInventarioSueltosSchema` pierde el
    campo `galponId` — solo `id`, `loteId`, `delta`, `motivo`.
  - `server/actions/inventario.ts`: `ajustarInventarioSueltosAction`
    ahora resuelve `galponId` vía `buscarUbicacionActual(input.loteId)`
    antes de llamar al repository (rechaza con `AccionError` si el lote
    no tiene ubicación abierta — mismo criterio defensivo que
    `registrarRecoleccion`).
  - `components/domain/inventario/ajustar-inventario-sueltos-dialog.tsx`:
    un solo `<Select>` de lote, sin `galponesActivos` como prop.
  - `app/(app)/recoleccion/page.tsx`: se quita `listarGalponesActivos()`
    del `Promise.all` y la prop `galponesActivos` del dialog.
  - Tests actualizados: `tests/unit/lib/zod-inventario.test.ts` (sin el
    caso de `galponId` inválido), `tests/integration/actions/inventario.test.ts`
    (mock nuevo de `buscarUbicacionActual`, caso nuevo "rechaza si el
    lote no tiene ubicación abierta", aserciones de `galponId` ajustadas
    al valor resuelto automático).
  - `spec.md` actualizado con la corrección documentada explícitamente
    en la sección de decisiones de diseño (no se reescribió `plan.md`,
    mismo criterio que el resto del proyecto: el plan original queda
    como registro histórico, los desvíos reales se documentan en
    `tasks.md`/`spec.md`).

  Verificado `npm run typecheck && npm run lint && npm test` — 240/240
  en verde (sin cambio neto de cantidad: un test viejo removido, uno
  nuevo agregado), y `npm run build` limpio.

  **Hallazgo no-bug, sin relación con este sprint:** un warning de
  hidratación de React apareció en `/login` durante la sesión de
  pruebas ("A tree hydrated but some attributes... didn't match").
  Confirmado que no es una regresión de Sprint 6 (`git status` sin
  cambios en `login/page.tsx`, `login-form.tsx` ni `password-input.tsx`
  en esta sesión) — la causa más probable, según el propio mensaje de
  React, es un gestor de contraseñas del navegador autocompletando los
  campos `usuario`/`password` antes de que React termine de hidratar.
  No afecta el login funcional, no bloquea nada de este sprint, no
  requiere fix.

  **Resto del checklist, confirmado por el Product Owner tras la
  corrección de arriba:** botón "Ajustar inventario" visible solo para
  el Gerente de prueba, ausente para el Operario de prueba; botón
  "Deshacer" con countdown real, reversión exitosa, fila atenuada con
  "Revertido", toast de éxito, tabla actualizada sin recargar; diálogo
  de ajuste (ya corregido, solo lote) con "Guardar" habilitándose
  correctamente y guardado exitoso con toast.

  Servidor `npm run dev` y usuarios de prueba siguen activos a
  propósito por si hace falta seguir probando — pendientes de apagar/
  borrar cuando el Product Owner confirme que terminó.

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` en verde (240/240).
- [x] `npx vitest run --coverage` ≥90% en los dos services de este
  módulo (100%/100% ambos, ver S6-14).
- [x] `npx prisma validate` en verde, migración `revertidoEn` aplicada.
- [x] `npm run build` en verde.
- [x] Los tres casos de S6-13 (carrera) confirmados contra Neon real, no
  solo con mocks.
- [x] `memory/estado-proyecto.md` actualizado: registro de cierre de
  Sprint 6, con la deuda explícita de "ajuste manual para Mortalidad"
  documentada como pendiente para un sprint futuro (no resuelta en este
  sprint, ver `spec.md`, R3).
- [ ] `specs/roadmap-completo.md` actualizado: Sprint 6 marcado
  completado, progreso `7 de 16 sprints` — solo si el Product Owner
  confirma el cierre formal (mismo criterio que Sprint 5, que quedó sin
  hacer este paso a propósito hasta confirmación explícita).
