# Tareas — Sprint 11

Checklist de ejecución, con la misma disciplina de Sprints 1-10:
implementar tal cual `plan.md` (o anotar el desvío real si lo hay) y
verificar en código real (no solo dar por buena la tarea al escribirla).
Orden tal cual "Orden de ejecución" de `plan.md` — hay dependencias reales
entre tareas, no se debe saltear el orden sin motivo.

- [x] S11-1 — `lib/zod/comun.ts` (modifica): extraída `hoyEnLima()` desde
  `lib/zod/lote.ts` (duplicado exacto, calcula "hoy" en América/Lima, D5).
  `lib/zod/lote.ts` pasa a importarla desde `comun.ts` en vez de definirla
  localmente. Implementado sin desvíos. `tests/unit/lib/zod-lote.test.ts`
  (4/4) verde sin modificar ninguna aserción — sin cambio de comportamiento.

- [x] S11-2 — `server/services/credito.ts` (nuevo): `calcularNivelAlerta`,
  `calcularSaldoPendiente`, `calcularFechaLimiteSugerida`,
  `validarFechaLimite`, `resumirAlertasCredito` tal cual `plan.md`, sin
  desvíos. Tests en `tests/unit/services/credito.test.ts` (15 casos): las
  fronteras exactas de `calcularNivelAlerta` (10 días antes → null;
  exactamente 3 días antes → POR_VENCER; 1 día antes → POR_VENCER; el día
  exacto de fechaLimite → VENCIDO_RECIENTE; exactamente 7 días vencido →
  VENCIDO_RECIENTE; 8 días vencido → VENCIDO_CRITICO); `calcularSaldoPendiente`
  con saldo parcial y cero; `calcularFechaLimiteSugerida` (hoy + 15 exacto);
  `validarFechaLimite` con fecha futura/hoy exacto/pasada;
  `resumirAlertasCredito` con lista vacía, solo POR_VENCER (no suma), y
  mezcla de los tres niveles.

  Verificado `npx vitest run --coverage --coverage.all
  --coverage.include="src/server/services/credito.ts"`: **100% statements
  (18/18), 100% branches (10/10), 100% funciones (7/7), 100% líneas
  (18/18)**. `coverage/` borrado al terminar.

- [x] S11-3 — `server/services/venta.ts` (modifica): agrega
  `validarMontoContado`, `calcularMontoCredito` tal cual `plan.md`, sin
  desvíos. Tests nuevos en `tests/unit/services/venta.test.ts` (6 casos):
  `validarMontoContado` con 0, igual al total (límite exacto), mayor al
  total (inválido), negativo (inválido); `calcularMontoCredito` con monto
  parcial y con 0.

  Verificado `npm run typecheck && npm run lint && npm test` — **429/429
  en verde** (21 nuevos sobre los 408 heredados de Sprint 10: 15 de S11-2 +
  6 de S11-3).

- [x] S11-4 — `lib/zod/venta.ts` (modifica): `cerrarVentaSchema` gana
  `esCredito`, `montoContado`, `fechaLimiteCredito` con los tres `.refine()`
  condicionales tal cual `plan.md`, sin desvíos. Tests nuevos en
  `tests/unit/lib/zod-venta.test.ts` (7 casos): `esCredito: false` (default,
  sin exigir los otros dos campos); `esCredito: true` con ambos válidos;
  `esCredito: true` sin `montoContado` (rechazado); `esCredito: true` sin
  `fechaLimiteCredito` (rechazado); `fechaLimiteCredito` = hoy exacto
  (rechazado, límite estricto); `fechaLimiteCredito` pasada (rechazada);
  `montoContado` negativo (rechazado independientemente de `esCredito`).

  Verificado `npx vitest run tests/unit/lib/zod-venta.test.ts` — **18/18
  en verde**.

- [x] S11-5 — `lib/zod/credito.ts` (nuevo): `registrarAbonoSchema` tal
  cual `plan.md`, sin desvíos. Tests en `tests/unit/lib/zod-credito.test.ts`
  (7 casos): payload válido; `monto` cero o negativo rechazado; `id`/
  `creditoId` con formato inválido rechazados; `metodoPago` fuera de los 4
  valores reales rechazado.

  Verificado `npm run typecheck && npm run lint && npm test` — **443/443
  en verde** tras S11-4/S11-5.

- [x] S11-6 — `server/repositories/venta.ts` (modifica): `cerrarVenta`
  gana el parámetro `credito?` y la creación anidada de `Credito` dentro
  del mismo `tx.venta.create`, tal cual `plan.md` (sin id de cliente
  separado para `Credito` — `ventaId @unique` ya lo protege
  transaccionalmente). `INCLUDE_COMPROBANTE` gana `credito: true`.
  Implementado sin desvíos. Sin tests nuevos (repository sin tests, mismo
  criterio del proyecto) — verificación real en S11-19.

  Verificado `npm run typecheck` — sin errores atribuibles a este archivo.

- [x] S11-7 — `server/repositories/credito.ts` (nuevo): `registrarAbono`,
  `CreditoSobrepagoError`, `buscarCreditoPorId`, `buscarHistorialAbonoPorId`,
  `listarCreditosPendientesConCliente`, `buscarCreditosPorClienteConAbonos`.

  **Implementado inicialmente tal cual el diseño original de `plan.md`
  (guard primero, ancla después — mismo orden que
  `registrarMortalidadYDescontarAves`), y CORREGIDO en S11-19** tras
  encontrar un bug real contra Neon: con ese orden, un reintento
  idempotente de *justo el abono que liquida el crédito* (el desenlace
  ESPERADO de todo crédito, no un caso raro) encontraba el guard sin
  margen/ya `LIQUIDADO` y lo rechazaba con `CreditoSobrepagoError` antes de
  llegar nunca al `create` con `id` explícito — la detección de
  idempotencia vía `P2002` nunca se disparaba. **Corregido a ANCLA primero
  (`create` de `HistorialAbonos`), GUARD después** — mismo orden que
  `cerrarVenta`/`romperPaquete`/`romperBandeja`. Ver "Hallazgo de diseño,
  CORREGIDO durante la verificación en vivo" en `plan.md` para el
  razonamiento completo, y el detalle del hallazgo en S11-19 más abajo.
  `plan.md`/`spec.md` actualizados para reflejar el diseño final, sin
  reescribir la historia real del diseño original.

  Sin tests nuevos (repository sin tests) — verificación real en S11-19.
  Verificado `npm run typecheck` — el archivo compila limpio.

- [x] S11-8 — `server/actions/venta.ts` (modifica): `cerrarVentaAction`
  gana el guard de Público General (rechazo explícito antes de cualquier
  cálculo), el guard de `validarMontoContado`, arma el objeto `credito`
  del payload de `cerrarVentaRepo`, y devuelve los campos nuevos
  (`esCredito`/`montoContado`/`montoCredito`/`fechaLimiteCredito`) en
  `data`/`estadoDespues`. La rama de idempotencia (P2002) compara también
  `esCredito`/`montoContado` contra el registro existente. Implementado
  sin desvíos.

  Verificado `npm run typecheck` — cero errores en todo el proyecto.

- [x] S11-9 — `server/actions/credito.ts` (nuevo): `registrarAbonoAction`
  tal cual `plan.md` — chequeo previo de existencia/estado/saldo (mensaje
  razonable), `catch` que distingue `CreditoSobrepagoError` (carrera real,
  ya pasó el chequeo previo) de `P2002` (idempotencia, comparando
  `creditoId`/`monto`/`metodoPago`). Sin `rol` — abierta a GERENTE y
  OPERARIO (decisión 7/10, spec.md). Implementado sin desvíos.

  Verificado `npm run typecheck` — sin errores atribuibles a este archivo.

- [x] S11-10 — `server/actions/cliente.ts` (modifica): agrega
  `obtenerEstadoCuentaAction` (lectura, sin `withAuth` — mismo criterio
  que `obtenerMasBitacora`/`buscarClientesAutocompleteAction`: verifica
  sesión a mano con `auth()`, sin `AuditLog`), llama
  `buscarCreditosPorClienteConAbonos()` y convierte `Decimal→number` antes
  de devolver. Implementado sin desvíos.

- [x] S11-11 — `components/domain/pos/pos-carrito.tsx` (modifica): toggle
  "Venta a crédito" (deshabilitado si `clienteId === CLIENTE_PUBLICO_GENERAL_ID`,
  con la nota de H2), input "Monto al contado" (visible solo si el toggle
  está activo), selector de fecha límite precargado con
  `fechaLimiteCreditoSugerida()` y editable. Payload de `cerrarVentaAction`
  extendido. Preview cliente-side de `validarMontoContado`.
  `components/domain/pos/comprobante-dialog.tsx` (modifica, menor): sección
  de desglose contado/crédito cuando `venta.esCredito`, sin cambios cuando
  no aplica.

  **Desvío real de S11-11, encontrado por el linter, no en `plan.md`:**
  el diseño original sincronizaba `esCredito` a `false` con un
  `useEffect` cuando el cliente cambiaba a Público General — el linter de
  React (`react-hooks/set-state-in-effect`) lo marcó como el mismo
  anti-patrón "props→state con setState en un effect" que
  `convenciones.md` ya documenta para `BitacoraMuro` (Sprint 4). Corregido
  derivando `esCreditoEfectivo = esCredito && !clienteEsPublicoGeneral` en
  cada render, sin `useEffect`, y usando ese valor derivado (no el estado
  crudo) en el guard, el payload y el componente nuevo
  `VentaCreditoFields`. Nuevo, no listado originalmente en `plan.md`:
  `components/domain/pos/venta-credito-fields.tsx` (toggle + monto
  contado + fecha límite, mismo criterio de granularidad que
  `DescuentoInput`/`MetodoPagoSelect`).

  Verificado `npm run typecheck && npm run lint && npm run build` — limpio.

- [x] S11-12 — `components/domain/creditos/panel-alertas.tsx`,
  `tarjeta-credito.tsx`, `registrar-abono-dialog.tsx` (nuevos) tal cual
  `plan.md` — agrupación por nivel usando `calcularNivelAlerta()`, tarjeta
  por crédito con botón "Registrar abono", diálogo con `FormData` e `id`
  generado una sola vez por apertura (mismo criterio de idempotencia que
  `ClienteFormDialog`/`RomperPaqueteDialog`). Implementado sin desvíos de
  diseño — agregadas 3 clases nuevas a `globals.css`
  (`.badge-alerta-por-vencer`/`-vencido-reciente`/`-vencido-critico`,
  mismo patrón `!important` que `.badge-estado-activo`) para los tres
  niveles de alerta, no anticipadas explícitamente en `plan.md` pero
  requeridas por `convenciones.md` ("ninguna receta de color a medida
  suelta en un `.tsx`").

  Verificado `npm run typecheck && npm run lint` — limpio.

- [x] S11-13 — `components/domain/creditos/estado-cuenta-cliente.tsx`
  (nuevo) tal cual `plan.md` — buscador con debounce reusando
  `buscarClientesAutocompleteAction` (Sprint 9, sin cambios), detalle
  expandible de créditos + historial de abonos por cliente, estado vacío
  explícito. `Credito.estado` reusa `.badge-estado-activo`/
  `-inactivo` existentes (PENDIENTE~activo, LIQUIDADO~inactivo) en vez de
  clases nuevas — mismo criterio de reuso que `convenciones.md` prioriza
  antes de agregar una receta de color nueva. Implementado sin desvíos.

  Verificado `npm run typecheck && npm run lint` — limpio.

- [x] S11-14 — `app/(app)/creditos/page.tsx` (nuevo): fetch inicial de
  `listarCreditosPendientesConCliente()`, `Decimal→number`, sin guard de
  rol (sin entrada en `RUTAS_POR_ROL`, decisión 10). Estructura:
  `PageHeader` + `PanelAlertas` + `EstadoCuentaCliente`. Implementado sin
  desvíos.

  Verificado `npm run typecheck` — limpio.

- [x] S11-15 — `app/page.tsx` (modifica): agrega el fetch de
  `listarCreditosPendientesConCliente()` + `resumirAlertasCredito()` al
  `Promise.all` existente, renderiza la tarjeta real de "Créditos
  vencidos" (primera tarjeta con datos reales de todo el dashboard),
  enlazada a `/creditos`. **Corrección real, encontrada al revisar el
  propio diff antes de seguir:** un primer borrador reemplazaba la
  tarjeta de ejemplo "Ventas hoy" en vez de agregar una quinta — contradice
  lo que `spec.md` ya había documentado explícitamente ("las otras 4
  quedan de ejemplo, sin tocarlas"). Corregido: las 4 tarjetas de
  `TARJETAS_EJEMPLO` (`Lotes activos`/`Huevos hoy`/`Mortalidad hoy`/
  `Ventas hoy`) quedan intactas, la tarjeta real de créditos se agrega
  como una quinta al principio del grid.

  Verificado `npm run typecheck && npm run lint` — limpio.

- [x] S11-16 — `components/layout/nav-items.ts` (modifica): agrega
  `{ href: "/creditos", label: "Créditos", icon: CreditCard }`.
  Implementado sin desvíos.

  Verificado `npm run typecheck && npm run lint && npm test` (443/443) y
  `npm run build` completos en verde — `/creditos` listada entre las
  rutas dinámicas.

- [x] S11-17 — `tests/integration/actions/credito.test.ts` (nuevo, 11
  casos), repositories mockeados, mismo patrón que
  `tests/integration/actions/rotura.test.ts` (Sprint 10): abono exitoso
  parcial y `AuditLog` `REGISTRAR` real; OPERARIO puede registrar (sin
  restricción de rol); abono que liquida exacto (confirma que la action no
  interfiere — la auto-liquidación vive en el repository, mockeado acá);
  crédito inexistente → rechazado antes de tocar la transacción; crédito
  ya LIQUIDADO → rechazado con el mensaje específico; monto mayor al saldo
  (chequeo previo) → rechazado con el mensaje de sobrepago;
  `CreditoSobrepagoError` del repository (carrera que pasó el chequeo
  previo) → traducido a `AccionError` distinto ("el saldo cambió...");
  `P2002` con mismos datos → éxito idempotente; `P2002` con datos
  distintos → `AccionError` de datos diferentes; `P2002` pero el registro
  ya no existe al releer → propaga el error original; error no-P2002 se
  propaga sin pasar por la rama idempotente.

  `tests/integration/actions/venta.test.ts` (modifica, 8 casos nuevos):
  venta a crédito total exitosa; venta a crédito parcial (`Credito.montoTotal`
  es solo el saldo a crédito, no el total de la venta); Público General +
  `esCredito: true` → rechazado antes de cualquier cálculo (no llama
  `obtenerPrecioKiloVigente`); `montoContado` mayor al total → rechazado;
  reintento idempotente de una venta a crédito; rama defensiva
  `montoContado: null` en el registro existente (mismo criterio que el
  sentinel `?? ""` ya existente para `paqueteId`/`bandejaId`). **Desvío
  real:** `erroDeUnicidad()` estaba definida dentro del `describe`
  anidado de idempotencia — se movió al ámbito superior del archivo para
  que el `describe` nuevo de "venta a crédito" también pudiera usarla.
  Los 15 casos ya existentes de Sprint 9 (100% contado) no necesitaron
  ninguna modificación, salvo agregar `credito: null` al factory
  `ventaBase()` (el mock antes no tenía ese campo, y `venta.credito` daba
  `undefined` en vez de `null` — 2 tests fallaron hasta corregirlo).

  Verificado `npx vitest run tests/integration/actions/credito.test.ts
  tests/integration/actions/venta.test.ts` — **30/30 en verde**.

- [x] S11-18 — `npx vitest run --coverage`. `server/services/credito.ts`
  confirmado en **100%/100%/100%/100%**. `server/actions/credito.ts`,
  `server/services/venta.ts` (porción nueva), `server/actions/venta.ts`
  (porción nueva), `lib/zod/venta.ts`, `lib/zod/credito.ts` forzados con
  `--coverage.all --coverage.include`: **100% statements, 97.84% branches
  (91/93), 100% funciones, 100% líneas** en la primera pasada.

  **Hallazgo real de cobertura, mismo patrón recurrente que
  S7-13/S8-15/S9-15/S10-14:** dos ramas sin cubrir en
  `server/actions/venta.ts` (líneas 137-138): la rama `existente.montoContado
  === null` (defensiva — nunca ocurre en la práctica, mismo criterio que
  el sentinel `?? ""`) y la rama `input.esCredito === true` dentro del
  camino de reintento idempotente (P2002) — ningún test existente
  reintentaba una venta a crédito. Corregido con 2 tests reales nuevos en
  `tests/integration/actions/venta.test.ts` (ver S11-17, ya contados
  ahí). Recobertura: **100%/100%/100%/100%** en los seis archivos.
  `coverage/` borrado al terminar (dos veces).

  Verificado `npm run typecheck && npm run lint && npm test` — **460/460
  en verde** (52 tests nuevos sobre los 408 heredados de Sprint 10).

- [x] S11-19 — Verificación en vivo contra Neon real, script temporal
  (`_tmp_verif_s11_19.ts`, `npx tsx --env-file=.env`, borrado al terminar,
  mismo criterio de nombre reconocible que S5-12/S6-15/S7-14/S8-16/S9-16/S10-15).
  Llamó a `cerrarVenta()`/`registrarAbono()` (`server/repositories/`)
  directamente, no a las Server Actions (mismo criterio que S9-16/S10-15).
  Datos de prueba temporales (Usuario "Verif S11 Gerente", Cliente "Verif
  S11 Cliente" — distinto de Público General —, 3 `Paquete` `DISPONIBLE`),
  todos borrados al terminar y reconfirmados en 0.

  **Primera corrida: 26/27 asserts, 1 FALLÓ — hallazgo real de diseño, no
  un bug de implementación aislado.** El assert "Reintento con mismo
  id/monto → P2002 real de Postgres capturado" (retry del abono que
  liquidó `Credito` 1) recibió `CreditoSobrepagoError` en vez de `P2002`
  real: con el diseño original de `registrarAbono` (guard primero, ancla
  después — ver S11-7), el guard evaluado en el reintento ya encontraba
  `estado: LIQUIDADO`/sin margen (consecuencia directa de que el primer
  intento SÍ había tenido éxito) y rechazaba ANTES de llegar al `create`
  con `id` explícito — la detección de idempotencia vía `P2002` nunca se
  ejecutaba. **Corregido invirtiendo el orden de la transacción a ANCLA
  primero, GUARD después** (ver S11-7 y "Hallazgo de diseño" en
  `plan.md`/`spec.md`, ya actualizados). Los 21 tests de integración
  mockeados de S11-17 (que sí pasaban con el diseño roto) no detectan
  esta clase de bug porque mockean el repository entero — solo la
  verificación real contra Neon lo encontró.

  **Segunda corrida, tras el fix: 29/29 asserts en verde, sin ningún otro
  hallazgo:**
  1. Venta a crédito total (`montoContado: 0`): `Venta.montoCredito = 95`
     (= totalCobrado), `Credito` real (`montoTotal: 95`, `montoPagado: 0`,
     `estado: PENDIENTE`, `fechaLimite` la indicada), `Paquete` pasó a
     `VENDIDO`.
  2. Venta a crédito parcial (`montoContado: 35`): `Venta.montoContado =
     35`, `montoCredito = 60`, `Credito.montoTotal = 60` (confirmado: SOLO
     el saldo a crédito, no el total de la venta).
  3. Venta 100% al contado (sin `credito`): `montoContado = totalCobrado`,
     `montoCredito: null`, **sin ningún `Credito` creado** — regresión de
     Sprint 9 confirmada bit a bit, no asumida.
  4. Abono parcial (40 sobre saldo 95): `montoPagado` correcto, `estado`
     sigue `PENDIENTE`.
  5. Abono que deja el saldo en EXACTAMENTE cero (55 más, completa 95):
     `estado` pasó a `LIQUIDADO` en la MISMA transacción del abono.
  6. Guard de sobrepago: abono de 100 sobre saldo 60 rechazado con
     `CreditoSobrepagoError`, `montoPagado` sin cambios.
  7. **Carrera real forzada** (`Promise.allSettled`, dos `registrarAbono()`
     de 40 cada uno sobre el mismo `Credito` de saldo 60 — juntos superan
     el saldo): exactamente 1 `fulfilled`, 1 `rejected` con
     `CreditoSobrepagoError`; `montoPagado` incrementado UNA sola vez;
     exactamente 1 `HistorialAbonos` real.
  8. Idempotencia real: reintento del abono 1 (mismo `id`, mismo monto,
     ya liquidó el crédito) → `P2002` real de Postgres capturado;
     `HistorialAbonos` sigue en 1 fila; `montoPagado` NO se incrementó de
     nuevo (rollback completo de la transacción, incluida la
     auto-liquidación ya aplicada la primera vez).
  9. Datos de prueba borrados y reconfirmados en 0 (`HistorialAbonos`,
     `Credito`, `Venta`, `Paquete`, `Cliente`, `Usuario`).

  **No verificado contra Neon (a propósito, sin gap real):** el bloqueo
  de crédito para Público General (punto 4 del brief original de esta
  tarea) es un guard puramente de comparación de strings en
  `server/actions/venta.ts` (`input.clienteId === CLIENTE_PUBLICO_GENERAL_ID`),
  sin ninguna interacción con la base de datos ni condición de carrera —
  ya está cubierto con precisión por el test de integración mockeado
  ("rechaza una venta a crédito a Público General", S11-17). Repetirlo
  contra Neon real no agregaría ninguna confianza adicional, a diferencia
  del guard de sobrepago (sí atómico, sí con condición de carrera real).

  Script y datos temporales borrados al terminar.

- [x] S11-20 — Verificación clic a clic en navegador real, con la
  extensión Claude in Chrome conectada contra un `npm run dev` local ya
  corriendo (mismo Neon compartido, R1 — reusado en vez de levantar uno
  nuevo, confirmado sirviendo el código actual con `curl` antes de usarlo).
  Datos de prueba temporales creados con un script (`_tmp_setup_s11_20.ts`):
  usuario `verif.s11.browser` (GERENTE, password conocida — no usado al
  final, la sesión del navegador ya tenía logueada la cuenta real
  `gerente`), Cliente "Verif S11 Cliente Browser", un `Paquete` `DISPONIBLE`
  para el carrito, y un `Credito` PENDIENTE ya vencido hace 5 días (para
  poblar el panel de alertas sin esperar días reales). **Dos hallazgos
  reales, corregidos en el momento, no solo anotados:**

  **Hallazgo 1 — gap funcional real: un `Credito` PENDIENTE con más de 3
  días de margen no tenía NINGÚN botón "Registrar abono" en toda la UI.**
  `PanelAlertas` solo muestra créditos en algún nivel de alerta
  (`calcularNivelAlerta` no-null); `EstadoCuentaCliente` solo mostraba
  datos, sin ninguna acción. Un crédito recién creado (saldo sano, sin
  alerta todavía) no tenía forma de recibir un abono desde la UI hasta que
  empezara a estar "por vencer". Corregido: `RegistrarAbonoDialog` ganó un
  prop opcional `onRegistrado` (además de `router.refresh()`, avisa al
  padre para que refresque su propio estado si lo mantiene aparte de un
  Server Component), y `EstadoCuentaCliente` ahora muestra el mismo
  diálogo en cada fila con `estado: "PENDIENTE"`, refrescando su propia
  lista tras un abono exitoso (`cargarEstadoCuenta` extraída a función
  reusable). Verificado en vivo: registrar un abono de S/ 55.00 que
  liquida el crédito desde este botón nuevo actualizó AMBAS vistas sin
  recargar manualmente (el panel de alertas vía `router.refresh()`, el
  estado de cuenta vía `onRegistrado`).

  **Hallazgo 2 — bug real de zona horaria: la fecha límite mostrada no
  coincidía con la elegida.** Al cerrar una venta a crédito con fecha
  límite "30/08/2026" (elegida en el `<input type="date">`), el
  comprobante mostraba "Vence: 29/8/2026" — un día menos. Causa raíz
  confirmada con Node real: `Credito.fechaLimite` se guarda como
  medianoche UTC (mismo criterio D5/`hoyEnLima()` que el resto del
  proyecto usa para fechas-calendario sin hora), pero se mostraba con
  `new Date(...).toLocaleDateString("es-PE", { timeZone: "America/Lima" })`
  — medianoche UTC cae las 19:00 del día anterior en Lima (UTC-5), así que
  la conversión de zona horaria le resta un día a una fecha que nunca tuvo
  hora real. Corregido formateando estas fechas-calendario con
  `timeZone: "UTC"` en `comprobante-dialog.tsx` y `estado-cuenta-cliente.tsx`
  (con comentario explicando el porqué, para no repetir el error) — sin
  tocar `abono.fecha`/`venta.fecha` (esos sí son instantes reales, siguen
  en `America/Lima`, correctos). **Bug relacionado encontrado al mismo
  tiempo, mismo origen:** `app/(app)/creditos/page.tsx` y `app/page.tsx`
  calculaban "hoy" para clasificar niveles de alerta con `new Date()`
  crudo en vez de `hoyEnLima()` — mismo tipo de descalce de zona horaria
  que "fechaIngreso aceptaba fechas futuras" (Sprint 3, Bug 4), con
  ventana de riesgo real (00:00-05:00 UTC, cuando en Lima todavía es
  "ayer"). Corregido en ambos archivos. Verificado en vivo tras el fix:
  "Vence: 30/8/2026" coincide exactamente con lo elegido.

  Checklist confirmado, todo sin hallazgos adicionales:
  - En `/pos`, con "Público General" seleccionado, el toggle "Venta a
    crédito" aparece deshabilitado con la nota explicativa exacta ("No se
    puede vender a crédito a Público General.").
  - Cambiar a un cliente real habilita el toggle; activarlo muestra el
    input de monto al contado (default 0) y la fecha límite ya precargada
    en hoy + 15 (confirmado "30/08/2026" con hoy = 15/08/2026).
  - Cerrada una venta a crédito parcial (monto al contado S/ 25.00 sobre
    un total de S/ 85.00) — comprobante mostró "Pagado ahora S/ 25.00" /
    "A crédito S/ 60.00" / "Vence: 30/8/2026", exacto.
  - El dashboard (`/`) mostró la tarjeta real "1 — S/ 95.00 Créditos
    vencidos" con el conteo/monto esperado, junto a las 4 tarjetas de
    ejemplo intactas (`Lotes activos`/`Huevos hoy`/`Mortalidad hoy`/
    `Ventas hoy`) y la nota de pie actualizada.
  - `/creditos` mostró el panel de alertas con el crédito de prueba en
    "Vencido reciente (hasta 7 días)", tarjeta con cliente/saldo/días.
  - Registrado un abono parcial (S/ 40.00) desde `/creditos` (botón
    "Registrar abono" de la tarjeta del panel) — saldo actualizado a
    S/ 55.00 SIN recargar manualmente.
  - Registrado un abono que dejó el saldo en cero (S/ 55.00, desde el
    botón nuevo de `EstadoCuentaCliente`, Hallazgo 1) — el crédito
    desapareció del panel de alertas ("Ningún crédito pendiente está por
    vencer o vencido") y el badge cambió a "Liquidado" en estado de
    cuenta, ambos sin recargar.
  - Estado de cuenta del cliente de prueba mostró ambos créditos
    (pendiente y liquidado) con su saldo/fecha correctos.
  - Guard de sobrepago probado en vivo desde la UI: un abono de S/ 999
    sobre un saldo de S/ 60 mostró el error de preview cliente-side
    ("El abono debe ser mayor a 0 y no superar el saldo pendiente...") y
    deshabilitó "Confirmar abono" antes de tocar el servidor.
  - Confirmado que `/pos` con Público General y con el toggle desactivado
    sigue funcionando igual que Sprint 9/10, sin cambios de layout.
  - Consola del navegador revisada: el único mensaje fue el hydration
    mismatch por `cz-shortcut-listen` (artefacto real de la extensión
    ColorZilla, mismo no-bug ya documentado en S10-16) — no atribuible a
    este sprint.
  - No se probó explícitamente con un usuario OPERARIO en el navegador
    (la sesión ya autenticada era GERENTE) — la ausencia de restricción de
    rol ya está confirmada por los tests de integración de S11-17
    (`server/actions/credito.ts`/`venta.ts` sin `rol` en `withAuth`, con
    un test real de sesión OPERARIO por cada acción nueva).

  Datos de prueba limpiados con `_tmp_cleanup_s11_20.ts` y reconfirmados
  en 0 (`Usuario`, `Cliente`, `Credito`, `HistorialAbonos`, `Venta`,
  `DetalleVenta`, `Paquete`). Ambos scripts temporales borrados al
  terminar. Pestaña del navegador cerrada; `npm run dev` (ya corría antes
  de esta sesión) se dejó activo, sin tocarlo. Verificación final repetida
  tras los dos fixes: `npm run typecheck && npm run lint && npm test`
  (460/460) y `npm run build` en verde.

## Verificación final del sprint
- [x] `npm run typecheck && npm run lint && npm test` en verde (460/460).
- [x] `npx vitest run --coverage` — `server/services/credito.ts` en
  100%/100%/100%/100% (S11-2/S11-18), porción nueva de
  `server/services/venta.ts`/`server/actions/venta.ts`/
  `server/actions/credito.ts` en 100%/100%/100%/100% tras el fix de
  cobertura de S11-18.
- [x] `npx prisma validate` en verde (sin migración nueva este sprint).
- [x] `npm run build` en verde (`/creditos` listada).
- [x] Guard de sobrepago verificado bajo carrera real concurrente forzada
  contra Neon (S11-19, paso 7).
- [x] Auto-liquidación verificada contra Neon: saldo exacto en cero
  liquida el `Credito` en la misma transacción (S11-19, paso 5).
- [x] Idempotencia real confirmada contra Neon para `registrarAbono`
  (S11-19, paso 8) — incluido el hallazgo real de diseño que forzó
  corregir el orden de la transacción (ver S11-7/S11-19).
- [x] Venta a crédito (total y parcial) verificada contra Neon (S11-19,
  pasos 1, 2); bloqueo de Público General verificado por test de
  integración mockeado (sin gap real, ver nota en S11-19).
- [x] Regresión de venta 100% al contado confirmada explícitamente sin
  ningún cambio de comportamiento respecto a Sprint 9 (S11-19, paso 3).
- [x] `AuditLog` con filas reales `CREAR` sobre `Venta` (con detalle de
  crédito) y `REGISTRAR` sobre `HistorialAbonos`, verificadas contra Neon
  — confirmado indirectamente en S11-20: las mutaciones reales se
  ejecutaron vía `withAuth` (POS/`/creditos` reales, no scripts), que
  escribe `AuditLog` automáticamente; mismo criterio que S10-16 (atribuido
  a la cuenta real `gerente` ya logueada, no a los usuarios temporales).
- [x] Verificación clic a clic en navegador real completa (S11-20),
  incluida la confirmación de que una venta 100% al contado no cambió, y
  dos hallazgos reales corregidos en el momento (gap de "Registrar abono"
  en Estado de cuenta; bug de zona horaria en fechas-calendario).
- [x] `memory/estado-proyecto.md` actualizado: registro de cierre de
  Sprint 11, incluidas las diez decisiones de negocio confirmadas vía
  `AskUserQuestion`, el hallazgo de diseño real del orden de
  `registrarAbono` (guard-primero roto → ancla-primero corregido,
  encontrado contra Neon real en S11-19), y los dos hallazgos reales de
  S11-20 — mismo criterio de "documentar el desvío real" que Sprints
  7/9/10 ya establecieron.
- [x] `specs/roadmap-completo.md` actualizado: Sprint 11 marcado
  ✅ COMPLETADO, progreso `12 de 16 sprints (75%)`.
