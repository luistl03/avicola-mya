# Tareas — Sprint 5

Checklist de planificación — ninguna tarea está ejecutada todavía. Se
tilda cada una al completarla, con la misma disciplina de Sprints 1-4:
implementar tal cual `plan.md` (o anotar el desvío real si lo hay) y
verificar en código real (no solo dar por buena la tarea al escribirla).

- [x] S5-1 — `server/services/recoleccion.ts`: `calcularEmpaque(cantidadTotal)`
  (paquetes = `Math.floor(total / UNIDADES_POR_PAQUETE)`, sueltos =
  `total % UNIDADES_POR_PAQUETE`) y `puedeRegistrarRecoleccion({
  loteEstado })` (`GuardResultado`, solo `ACTIVO` — mismo tipo y mismo
  criterio que `puedeRegistrarMortalidad` de Sprint 4). **Un desvío real
  respecto al pseudocódigo de `plan.md`:** `calcularEmpaque` no lanza en
  input inválido — `cantidadTotal` ya llega validado como entero
  positivo por `crearRecoleccionSchema` (Zod, límite de entrada real de
  S5-6, todavía no escrito), mismo criterio que
  `puedeRegistrarMortalidad` nunca revalidó el formato de `cantidad`; el
  caso `cantidadTotal <= 0` queda documentado en `spec.md` como
  "rechazado antes, no llega acá". También se agregó `UNIDADES_POR_PAQUETE
  = 180` a `lib/constants.ts` (no estaba en el plan original, que lo
  tenía como literal inline) para poder compartir el mismo valor con el
  helper de preview del cliente en S5-8 sin duplicar el número mágico —
  mismo patrón que `MORTALIDAD_VENTANA_GRACIA_MIN`. Tests unitarios
  (`tests/unit/services/recoleccion.test.ts`, 8 casos): total < 180
  (incluido el extremo total = 1), total = 179 (un huevo antes del
  primer paquete), múltiplos exactos de 180 (180 y 360, sueltos = 0),
  caso general con resto (470 → 2 paquetes + 110 sueltos), lote INACTIVO
  rechazado, lote ACTIVO permitido. Verificado
  `npm run typecheck && npm run lint && npm test` — 169/169 en verde
  (14 tests nuevos sobre los 155 heredados de Sprint 4).

- [x] S5-2 — `server/services/inventario.ts`: `reconstruirSaldo(movimientos)`
  (`TIPOS_ENTRADA`: RECOLECCION/ROTURA_PAQUETE_ENTRADA/AJUSTE_GERENTE;
  `TIPOS_SALIDA`: CONSOLIDACION_SALIDA/VENTA_SUELTO; REVERSION no suma
  ni resta — no tiene signo propio fijo y no tiene caso de uso real
  todavía, ver nota en el código para Sprint 6). Implementado tal cual
  el diseño de `plan.md`. Tests unitarios
  (`tests/unit/services/inventario.test.ts`, 6 casos): lista vacía (0),
  solo RECOLECCION, mezcla de entrada+salida, ROTURA_PAQUETE_ENTRADA +
  AJUSTE_GERENTE como entradas, REVERSION ignorado, y una secuencia
  mixta realista (2 recolecciones + 1 consolidación de salida) cuyo
  resultado se compara contra el saldo que quedaría en
  `InventarioSueltos.cantidad` en ese escenario. Verificado
  `npm run typecheck && npm run lint && npm test` — 169/169 en verde.

- [x] S5-3 — `lib/zod/recoleccion.ts`: `crearRecoleccionSchema` (`id` con
  `idUuid()` sin mensaje personalizado — lo genera el cliente, nunca lo
  elige el usuario a mano —, `loteId` con `idUuid("Seleccioná un
  lote")`, `cantidadTotal` entero positivo, `creadoEnCliente` como
  fecha obligatoria — no opcional, el Contrato Offline-Ready exige el
  timestamp de cliente siempre —, `pesos` como arreglo de números
  positivos, puede venir vacío cuando `cantidadTotal < 180`).
  **Un agregado real no explícito en `plan.md`:** cada elemento de
  `pesos` lleva además `.max(999.999)`, cota defensiva atada a la
  precisión real de `Paquete.peso` en Prisma (`Decimal(6,3)`) — sin
  esto, un valor absurdo rompería con un error crudo de Prisma en vez
  de un mensaje de validación Zod claro; no es una regla de negocio, es
  la primera vez que el proyecto valida un campo `Decimal` de entrada,
  documentado en el propio archivo. La validación cruzada
  "`pesos.length` debe coincidir con `calcularEmpaque(cantidadTotal)`"
  queda fuera de este schema a propósito (ver `plan.md`) — se resuelve
  en la Server Action de S5-6, porque requiere el service, no algo que
  un schema Zod deba conocer.
  Tests (`tests/unit/lib/zod-recoleccion.test.ts`, 11 casos): input
  válido, arreglo de pesos vacío válido, `id`/`loteId` inválidos
  (con el mensaje personalizado del segundo), `cantidadTotal` en 0,
  negativo y no entero, `creadoEnCliente` inválido, peso en 0/negativo,
  peso que excede la precisión de `Decimal(6,3)`, y el borde superior
  exacto permitido (999.999). Verificado
  `npm run typecheck && npm run lint && npm test` — 180/180 en verde
  (11 tests nuevos sobre los 169 de S5-1/S5-2).

- [x] S5-4 — `server/repositories/recoleccion.ts`: `registrarRecoleccion`
  (tercera transacción interactiva del proyecto: `RegistroRecoleccion`
  con `id` de cliente, N `Paquete` con `PaqueteOrigen` **anidado** en el
  mismo `create` — no dos creates separados como sugería el
  pseudocódigo de `plan.md` —, upsert condicional de
  `InventarioSueltos`, `MovimientoSueltos` condicional cuando
  `sueltos > 0`) + `buscarRecoleccionConPaquetesPorId(id)` +
  `listarRecolecciones({ skip, take })` + `contarRecolecciones()`.

  **Tres desvíos reales respecto al pseudocódigo de `plan.md`, los tres
  detectados releyendo el código existente antes de escribir (mismo
  hábito que encontró la violación de ADR-000 en Sprint 2):**

  1. **La captura de `P2002` (idempotencia) NO vive en el repository.**
     `plan.md` la ponía ahí, pero `server/actions/usuario.ts` y
     `server/actions/lote.ts` ya establecen el precedente real del
     proyecto: el `catch` de `P2002` vive en la Server Action (`Prisma`
     como namespace de tipos/errores no es "importar Prisma" en el
     sentido de ADR-000 — la instancia `prisma` del cliente sigue sin
     tocarse fuera de `repositories/`). Decidir "esto es un reintento
     válido, devolvé lo que ya existe" vs. "esto es una colisión real"
     requiere comparar `cantidadTotal` contra lo persistido — una
     decisión de la action (S5-6), no del repository. Este repository
     solo expone `buscarRecoleccionConPaquetesPorId(id)`, la lectura que
     S5-6 va a usar en esa rama.
  2. **Los N `Paquete` se crean en un `for` secuencial con `await` uno
     por uno, no con `Promise.all`.** Prisma no soporta queries
     concurrentes de forma segura dentro de la misma transacción
     interactiva (comparten una sola conexión) — riesgo real dado que
     el proyecto ya tuvo un `P1017` del pooler de Neon en Sprint 0 (ver
     `memory/estado-proyecto.md`). `plan.md` ya sugería el `for`, esto
     es solo la confirmación de por qué, dejada en el código.
  3. **`sueltos` viaja como parámetro de entrada, calculado por quien
     llama (la action), en vez de que el repository importe
     `calcularEmpaque` de `server/services/recoleccion.ts`.** Un
     repository es la capa más baja de ADR-000 — no depende hacia
     arriba de `services/`, ni siquiera para algo puramente aritmético.

  **Un desvío real respecto a `spec.md`/`plan.md` (ya corregido también
  en esos dos archivos):** el nombre `listarRecoleccionesPagina` que
  proponía la planificación original violaba la propia convención de
  `memory/convenciones.md` — el sufijo `Pagina` queda reservado para
  paginación por **cursor** (muro cronológico, ver `listarBitacoraPagina`
  de Sprint 4). Recolección es una tabla de gestión con `skip`/`take` por
  URL, igual que Mortalidad (`listarRegistrosMortalidad`, sin sufijo) —
  renombrado a `listarRecolecciones`.

  Verificado `npm run typecheck && npm run lint && npm test` — 180/180
  en verde (sin tests de integración todavía para este repository, solo
  que nada existente se rompió — llegan en S5-10 vía la action).

- [x] S5-5 — `server/repositories/inventario.ts`:
  `listarMovimientosSueltos({ galponId, loteId })` (lectura simple, sin
  paginar — es para auditoría puntual vía `reconstruirSaldo()`, no una
  pantalla con potencialmente miles de filas; si Sprint 7 termina
  necesitándola para una pantalla real, ahí se le agrega paginación, no
  antes), ordenada por `creadoEn` ascendente. Implementado tal cual el
  diseño de `plan.md`, sin desvíos. Verificado
  `npm run typecheck && npm run lint && npm test` — 180/180 en verde
  (sin tests propios todavía — es una lectura pasante sin lógica, la
  cobertura real de `reconstruirSaldo()` ya quedó en S5-2).

- [x] S5-6 — `server/actions/recoleccion.ts`: `registrarRecoleccion` vía
  `withAuth({ schema: crearRecoleccionSchema, entidad:
  "RegistroRecoleccion", accion: "CREAR" })`, sin `rol`. Orden real:
  resuelve el lote (`buscarLotePorId`) → `puedeRegistrarRecoleccion` →
  recalcula `calcularEmpaque(input.cantidadTotal)` y rechaza si
  `input.pesos.length` no coincide con `paquetesEsperados` (antes de
  cualquier otra consulta a la base, es la validación más barata) →
  resuelve `galponId` vía `buscarUbicacionActual` (rechaza si no hay
  ubicación abierta) → llama al repository. Acá es donde efectivamente
  aterriza el patrón de idempotencia diseñado en `plan.md` y ajustado en
  S5-4: el `catch` de `P2002` vive en esta action (`esErrorDeUnicidad`,
  mismo helper que ya usan `server/actions/usuario.ts`/`lote.ts`), llama
  a `buscarRecoleccionConPaquetesPorId(input.id)`, compara
  `cantidadTotal` contra el payload actual (si difiere → `AccionError`
  explícito, no se sobrescribe en silencio) y si coincide devuelve el
  registro ya existente como resultado, sin volver a invocar el
  repository. Documentado en el propio código: un reintento idempotente
  igual deja una segunda fila `CREAR` en `AuditLog` (mismo trade-off ya
  aceptado desde Sprint 2 con `withAuth`, R3 de `spec.md`) — inofensivo,
  no hay una segunda mutación de negocio detrás.

  **Corrección real al escribir el código (no estaba en `plan.md`):** el
  pseudocódigo original tenía `resultado = existente` en la rama
  idempotente, pero `buscarRecoleccionConPaquetesPorId` devuelve el
  `RegistroRecoleccion` con `paquetes` anidado, no la forma `{ registro,
  paquetes }` que devuelve `registrarRecoleccion` del repository —
  corregido a `resultado = { registro: existente, paquetes:
  existente.paquetes }`, detectado por `tsc` (TS2741), no a simple
  vista.

  Verificado `npm run typecheck && npm run lint && npm test` — 180/180
  en verde, y `npm run build` limpio (sin ruta `/recoleccion` todavía,
  eso es S5-7 — pero confirma que este archivo de action no tiene
  ninguna fuga de import de servidor). Sin tests de integración propios
  todavía (llegan en S5-10).

- [x] S5-7 — Pantalla `app/(app)/recoleccion/page.tsx` (sin guard de rol,
  ni entrada en `RUTAS_POR_ROL`, mismo criterio que `/mortalidad`) +
  `components/domain/recoleccion/recolecciones-tabla.tsx` (Fecha / Lote /
  Galpón / Cantidad total / Paquetes / Sueltos / Registrado por,
  `<TableScrollArea>`, `<DataTablePagination>` 10 filas).

  **Aplicación real del principio "Campos calculados" de
  `memory/modelo-datos.md`, no anticipada explícitamente en `plan.md`:**
  la columna "Sueltos" no viene de ninguna columna persistida — se
  deriva en la propia tabla llamando `calcularEmpaque(registro.
  cantidadTotal).sueltos` (Server Component, mismo criterio que
  `calcularEdadEnSemanas()` invocada directo desde
  `app/(app)/lotes/page.tsx` en Sprint 3), reusando el service de S5-1
  tal cual en vez de guardar o recalcular la fórmula en otro lugar. La
  columna "Paquetes" en cambio SÍ viene de una columna real
  (`registro.paquetes.length`, del `include` de `listarRecolecciones`)
  — no se recalcula, para que la tabla siga reflejando lo que
  efectivamente quedó persistido en cada fila, no lo que la fórmula
  diría hoy si algo cambiara.

  **Desvío real y explícito respecto a `tasks.md`/`plan.md`:** esta
  tarea NO incluye todavía el botón "Registrar recolección" —
  `PageHeader` queda sin `actions` por ahora, con un comentario en el
  código señalando que `RegistrarRecoleccionDialog` llega en S5-8 (ese
  componente y `listarLotesActivos()` todavía no estaban conectados a
  esta pantalla). Mortalidad (Sprint 4) resolvió pantalla+diálogo en una
  sola tarea (S4-4); acá quedaron separadas en dos tareas desde la
  planificación original (S5-7/S5-8) — se respeta esa separación en vez
  de adelantar S5-8 sin que el usuario lo pidiera.

  Verificado `npm run typecheck && npm run lint && npm test` — 180/180
  en verde, y `npm run build` limpio con `/recoleccion` apareciendo como
  ruta real del build (confirma que ningún import de servidor se filtra
  a un componente cliente).

- [x] S5-8 — `components/domain/recoleccion/registrar-recoleccion-dialog.tsx`:
  `<Dialog>` compacto, `<Select>` de lote controlado
  (`listarLotesActivos()`, pasado desde `page.tsx` — S5-7 quedó
  conectado acá), input `cantidadTotal`, helper local
  `calcularEmpaquePreview` (duplicado documentado de `calcularEmpaque`,
  usa `UNIDADES_POR_PAQUETE` de `lib/constants.ts` para no repetir el
  número mágico una segunda vez), arreglo reactivo de campos de peso que
  crece/recorta **en el mismo evento que cambia `cantidadTotal`** (no en
  un `useEffect` separado observando el derivado — evita el
  anti-patrón que el propio linter de React ya marcó una vez en este
  proyecto, `BitacoraMuro` de Sprint 4), texto informativo de sueltos,
  botón "Guardar" deshabilitado hasta que haya lote + `cantidadTotal` >
  0 + todos los pesos > 0, `id`/`creadoEnCliente` generados recién en el
  submit, formulario gateado detrás de `{open ? (...) : null}`.

  **Un hallazgo real de diseño, no anticipado en `plan.md`, encontrado
  antes de escribir código (mismo hábito que la corrección de S5-4):**
  `crearRecoleccionSchema.pesos` es un arreglo de longitud variable —
  `server/auth/with-auth.ts` (`normalizarInput`) convierte `FormData` a
  objeto plano con `Object.fromEntries()`, que **no** arma arreglos a
  partir de claves repetidas (se queda con el último valor). Todos los
  dialogs anteriores (Mortalidad, Lote, Galpón, Usuario) usan
  `<form action={formAction}>` con `useActionState<Estado, FormData>`
  porque ninguno tenía un campo de longitud variable. Acá el formulario
  arma el payload como objeto plano en React state y llama
  `formAction(payload)` directo desde `onSubmit` (con
  `evento.preventDefault()`), sin pasar por `<form action>` ni por
  `FormData` — válido porque `withAuth` acepta cualquier `unknown`
  serializable como `rawInput`, no exclusivamente `FormData`.

  **Verificado:** `npm run typecheck && npm run lint && npm test` —
  180/180 en verde — y `npm run build` limpio con `/recoleccion`
  compilando sin fugas de import de servidor a cliente. Además, un
  smoke test real contra `npm run dev` con un usuario Gerente temporal
  (creado y borrado con un script, mismo criterio que Sprints 3-4 —
  `gerente`/`Cambiar123!` sigue sin servir contra la base compartida) vía
  `curl` + cookie jar: login real (302), `GET /recoleccion` en 200, y el
  HTML servido trae tanto el botón "Registrar recolección" como
  `LOTE-DEMO-01` (confirma que `listarLotesActivos()` llega hasta el
  diálogo). Servidor y usuario temporal dados de baja al terminar.

  **Pendiente real, no resuelto en esta tarea:** la extensión Claude in
  Chrome no está conectada en este entorno (`tabs_context_mcp` devolvió
  "Browser extension is not connected") — la reactividad real en el
  navegador (campos de peso apareciendo/recortándose al escribir,
  habilitación del botón "Guardar") **no se verificó con JS ejecutando
  de verdad**, solo por lectura de código + el smoke test de `curl`
  (que no ejecuta JavaScript). Esto es explícitamente lo que S5-13 tiene
  que cerrar — con la extensión conectada, o con el Product Owner
  probando contra `npm run dev`/producción, mismo camino que Sprints 1-2
  usaron cuando la herramienta no alcanzaba.

- [x] S5-9 — `NAV_ITEMS` (`components/layout/nav-items.ts`): entrada
  "Recolección" → `/recoleccion`, ícono `Egg` (mismo que ya usa el
  título de `RegistrarRecoleccionDialog`, S5-8, por consistencia).
  Agregada al final de la lista, después de "Bitácora" — mismo criterio
  de orden que las entradas anteriores (se van agregando en el orden en
  que cada sprint las construyó, no reordenadas por tema). Sin entrada
  nueva en `RUTAS_POR_ROL` — confirmado leyendo `server/auth/rbac.ts`:
  cualquier ruta que no aparece ahí queda abierta a cualquier rol vía
  `rolPermitidoParaRuta()`, y `/recoleccion` no está listada.

  **Verificación real, con la misma limitación que S5-8:** confirmado
  por código que `components/layout/sidebar.tsx` (el único componente,
  compartido entre desktop y el drawer mobile — no hay una lista
  separada que actualizar) filtra `NAV_ITEMS` con
  `item.href` contra `rolPermitidoParaRuta()`, así que "Recolección"
  va a aparecer para GERENTE y OPERARIO por igual. **No se confirmó
  visualmente en el Sidebar real** (misma limitación de extensión de
  navegador no conectada que S5-8) — queda para S5-13 junto con el
  resto de la verificación clic a clic.

  Verificado `npm run typecheck && npm run lint && npm test` — 180/180
  en verde.

- [x] S5-10 — `tests/integration/actions/recoleccion.test.ts` (11 tests
  nuevos, repositories/sesión/auth/auditLog mockeados, services puros
  reales — mismo patrón que `tests/integration/actions/mortalidad.test.ts`):
  lote inexistente, lote INACTIVO (sin resolver ubicación),
  `pesos.length` no coincide con `calcularEmpaque` (sin resolver
  ubicación), arreglo de pesos vacío aceptado cuando `cantidadTotal` <
  180, ubicación no encontrada (defensivo), registro exitoso con
  `AuditLog` y los argumentos exactos que recibe el repository
  (incluido `sueltos` ya calculado y `ahora` congelado con
  `vi.setSystemTime`), OPERARIO sin restricción de rol, y cuatro casos
  de idempotencia: reintento con mismos datos (devuelve lo existente,
  el repository de escritura se invoca una sola vez, y sí queda una
  segunda fila `CREAR` en `AuditLog` — trade-off documentado en el
  propio código), mismo `id` con `cantidadTotal` distinto (rechazado
  explícito), `P2002` sin que la lectura de reintento encuentre el
  registro (se propaga el error original, caso defensivo), y cualquier
  otro error de Prisma (no `P2002`) propagado tal cual sin entrar a la
  rama idempotente.

  Sin desvíos respecto al diseño de `plan.md`/S5-6 — los cuatro tests de
  idempotencia confirman en código (no solo en la lectura de S5-4/S5-6)
  que el patrón "`create` + capturar `P2002`" se comporta como se
  documentó.

  Verificado `npm run typecheck && npm run lint && npm test` —
  **191/191 en verde** (11 nuevos sobre los 180 heredados).

- [x] S5-11 — `npx vitest run --coverage`, con el módulo completo ya
  implementado (S5-1 a S5-10). Confirmado leyendo
  `coverage/coverage-final.json` directamente (mismo motivo que en
  S5-1/S5-2: el reporte de texto por defecto de Vitest omite los
  archivos con cobertura completa de su tabla resumida, no es que
  falten del análisis):

  | Archivo | Statements | Branches |
  |---|---|---|
  | `server/services/recoleccion.ts` | 100% (4/4) | 100% (2/2) |
  | `server/services/inventario.ts` | 100% (8/8) | 100% (4/4) |
  | `server/actions/recoleccion.ts` | 100% (27/27) | 100% (16/16) |
  | `lib/zod/recoleccion.ts` | 100% (6/6) | — |

  Los dos archivos que exige el roadmap literal
  (`services/recoleccion.ts` e `inventario.ts`) quedan al 100%, sin
  necesidad de ningún test adicional — ninguna rama quedó por debajo
  del umbral.

  **`server/repositories/recoleccion.ts` y `repositories/inventario.ts`
  no aparecen en el reporte** — están mockeados por completo en los
  tests de integración de S5-10 (nunca se ejecuta el código real desde
  Vitest). No es una laguna de este sprint: coincide con lo que
  `memory/estado-proyecto.md` ya documenta como criterio establecido
  del proyecto ("no hay tests de repository en este proyecto, ver
  ADR-000/convenciones.md") — los repositories se verifican en vivo
  contra Neon real (scripts temporales), que es exactamente el alcance
  de S5-12, no de esta tarea.

  Cobertura total del proyecto: 93.19% statements / 87.12% branches
  (191/191 tests) — el promedio general está tirado hacia abajo por
  `proxy.ts`/`rate-limit.ts` (preexistentes, sin relación con este
  sprint), no por nada de Recolección/Inventario.

  `coverage/` (generado, gitignored) borrado al terminar para no
  ensuciar `npm run lint` con el mismo aviso que ya apareció una vez en
  S5-3.

- [x] S5-12 — Verificación en vivo contra Neon real, con un script
  temporal (`_tmp_verificacion_s5_12.ts`, borrado al terminar) que
  importa y ejercita el código real del sprint (`registrarRecoleccion`,
  `buscarRecoleccionConPaquetesPorId`, `calcularEmpaque`,
  `puedeRegistrarRecoleccion`, `mudarLote`, `crearAuditLog`) contra un
  Usuario/2 Galpones/1 Lote temporales — no mocks, no reimplementación
  de la lógica, el mismo código que corre en producción.

  **Nota de alcance real, decidida antes de escribir el script:** el
  script llama a los `repositories`/`services` directamente, no a
  `server/actions/recoleccion.ts` — la action depende de `auth()`
  (contexto de request de Next.js), que no existe fuera de un servidor
  corriendo. La rama de idempotencia de la ACTION (capturar `P2002` +
  comparar `cantidadTotal` + responder con el registro existente) ya
  quedó probada en S5-10 con mocks; lo que este script agrega es la
  pieza que los mocks no pueden probar: que Postgres/Neon de verdad
  rechaza el `id` duplicado con `P2002` y que la transacción aborta
  completa sin dejar nada a medio escribir.

  **Los 7 casos, todos verificados con asserts reales contra datos
  reales (no solo leyendo el resultado devuelto, también releyendo la
  fila de la base después):**
  1. Recolección con sueltos (470 → 2 `Paquete` + 2 `PaqueteOrigen` de
     180 en Galpón A + `InventarioSueltos` creado en 110 + 1
     `MovimientoSueltos` de 110).
  2. Recolección menor a 180 (45 → 0 `Paquete`, `InventarioSueltos`
     incrementado a 155 vía upsert, 2do `MovimientoSueltos`).
  3. Recolección múltiplo exacto de 180 (360 → 2 `Paquete` más, pero
     `InventarioSueltos` **sigue en 155** y sigue habiendo solo 2
     `MovimientoSueltos` — confirma que `sueltos === 0` de verdad no
     deja ruido en el ledger).
  4. **Idempotencia real:** reenviar el `id` del caso 2 lanza `P2002` de
     Postgres de verdad, `InventarioSueltos` se queda en 155 (no 200) y
     siguen siendo 2 `MovimientoSueltos` (no 3) — la transacción abortó
     por completo, no quedó nada a medias. `buscarRecoleccionConPaquetesPorId`
     trae el registro original intacto.
  5. Mudanza + galpón automático: `mudarLote` a Galpón B, y una
     recolección posterior queda con `PaqueteOrigen`/`InventarioSueltos`
     en Galpón B, no en Galpón A — y el `InventarioSueltos` de Galpón A
     (155) y el de Galpón B (20) conviven sin pisarse, gracias a
     `@@unique([galponId, loteId])`.
  6. Guard de lote INACTIVO (aplicación, sin tocar la base).
  7. Fila real de `AuditLog` para `RegistroRecoleccion`/`CREAR`
     confirmada releyéndola de Neon.

  **Sin bugs de código encontrados** — los 7 casos pasaron a la primera
  ejecución del script, sin necesitar ningún ajuste al código de
  S5-1/S5-4/S5-6. Datos de prueba (usuario, 2 galpones, lote, y todas
  las filas dependientes) borrados al terminar y reconfirmados en 0 con
  una consulta separada antes de borrar el script.

- [x] S5-13 — Verificación clic a clic en navegador real. La extensión
  Claude in Chrome no conectó en este entorno (reintentado dos veces,
  `tabs_context_mcp` siguió devolviendo "Browser extension is not
  connected") — se siguió el camino alternativo ya usado en Sprints 1-2
  cuando la herramienta no alcanzaba: `npm run dev` levantado, dos
  usuarios de prueba temporales creados con un script
  (`verif.s5.13.gerente`/`verif.s5.13.operario`, ambos `Verificacion123!`,
  borrados al terminar), y el **Product Owner probando en vivo** contra
  ese servidor con `LOTE-DEMO-01`.

  **Bug real encontrado y corregido en el camino** (detalle completo,
  con la causa raíz leída del log del propio dev server, en
  `memory/estado-proyecto.md`, sección "Bug real encontrado y corregido
  en vivo durante Sprint 5 (S5-13, 2026-08-11)"): un doble clic
  accidental en "Guardar" (la acción demoró en responder) dejó **dos
  `RegistroRecoleccion` reales** en vez de uno — el escenario exacto que
  el Contrato Offline-Ready debía prevenir, fallando en la práctica.
  Causa raíz, dos bugs combinados en
  `registrar-recoleccion-dialog.tsx`:
  1. `formAction(payload)` se llamaba fuera de `startTransition()` (el
     único dialog del proyecto que no usa `<form action={formAction}>`,
     por el campo `pesos` de longitud variable, ver S5-8) — React no
     actualizaba `pending` a tiempo, así que el botón no llegaba a
     deshabilitarse entre el primer y el segundo clic.
  2. El `id` (la pieza que hace idempotente al contrato) se generaba
     `crypto.randomUUID()` **dentro de cada `onSubmit`**, no una vez por
     apertura del diálogo — cada clic generaba un id distinto, así que
     la protección por `P2002` (diseñada y ya probada en
     S5-4/S5-6/S5-10/S5-12) nunca se activaba: para la base eran dos
     registros legítimos, no un reintento.

  **Corregido:** `startTransition()` alrededor de `formAction(...)`, más
  una guarda `if (pending) return` en el `onSubmit`; el `id` pasa a
  generarse una sola vez por apertura del diálogo
  (`useState(() => crypto.randomUUID())`) — seguro porque el formulario
  se desmonta por completo al cerrar el diálogo (éxito o cancelación),
  así que un reintento después de un guardado exitoso siempre parte de
  un id nuevo. **Reverificado por el Product Owner en el mismo
  navegador:** doble clic deliberado sobre otro registro, un solo
  `RegistroRecoleccion` resultante. Los 4 registros duplicados que había
  dejado el bug original (`InventarioSueltos` inflado a 420 en vez de lo
  esperado) se borraron de Neon con un script temporal antes de aplicar
  el fix; verificado en 0 después.

  Resto del checklist, confirmado por el Product Owner: campos de peso
  apareciendo/desapareciendo reactivamente al cambiar `cantidadTotal`,
  botón "Guardar" deshabilitado/habilitado correctamente, guardado
  exitoso con toast y tabla actualizada sin recargar, `/recoleccion`
  accesible sin 403 para el Operario de prueba.

  Verificado `npm run typecheck && npm run lint && npm test` — 191/191
  en verde tras el fix (sin tests unitarios nuevos: el bug era 100% de
  interacción de UI en tiempo real, `useActionState`/`startTransition`
  no son mockeables de forma útil en un test de Vitest — la cobertura
  real de esto es justamente la verificación en navegador que encontró
  el bug).

  **Pendiente explícito para después de cerrar el sprint** (pedido
  expreso del Product Owner, no resuelto en esta sesión): auditar si el
  resto de los dialogs de mutación del proyecto (Usuarios, Galpones,
  Lotes/Mudanza, Bitácora, Mortalidad) puede duplicar un registro ante
  un doble clic o un reintento de red — ninguno tiene protección de
  idempotencia por id de cliente (el Contrato Offline-Ready recién es
  obligatorio desde este sprint), así que no es una regresión de hoy,
  es una laguna preexistente. Ver el detalle en
  `memory/estado-proyecto.md`.

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` en verde (191/191).
- [x] `npx vitest run --coverage` ≥90% en los dos services de este
  módulo (100% ambos, ver S5-11).
- [x] `npx prisma validate` en verde (sin migración nueva).
- [x] `npm run build` en verde, reverificado después del fix de S5-13.
- [x] `memory/estado-proyecto.md` actualizado con el bug real de S5-13 y
  el pendiente de auditoría cross-sprint que abre. **Falta todavía** el
  registro de cierre formal de Sprint 5 propiamente dicho (mismo formato
  que las secciones "Sprint 3 —"/"Sprint 4 —" ya cerradas) — pendiente de
  confirmar con el Product Owner si se escribe ahora o en una sesión
  aparte.
- [ ] `specs/roadmap-completo.md` actualizado: Sprint 5 marcado
  completado, progreso `6 de 16 sprints`. **No hecho todavía** — el
  Product Owner pidió explícitamente no commitear/pushear todavía;
  dejado para cuando se confirme el cierre formal del sprint.
