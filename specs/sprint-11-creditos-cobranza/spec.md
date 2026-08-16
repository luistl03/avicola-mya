# Sprint 11 — Créditos y cobranza

## Sprint Goal
Un Gerente ve al entrar quién le debe y hace cuántos días. Un Gerente u
Operario puede vender a crédito (total o parcial) desde el POS, registrar
abonos parciales contra ese crédito con un guard que nunca permite pasarse
del saldo pendiente, ver el crédito liquidarse solo al llegar a cero, y
consultar el estado de cuenta completo de cualquier cliente.

## Contexto previo — qué hereda de Sprint 8/9/10, qué es nuevo acá
- **`model Credito`/`model HistorialAbonos`** — schema completo desde
  Sprint 0, **sin ningún código real encima todavía**. `Credito` (`id`,
  `ventaId @unique`, `clienteId`, `montoTotal Decimal(10,2)`, `montoPagado
  Decimal(10,2) @default(0)`, `fechaLimite DateTime`, `estado EstadoCredito
  @default(PENDIENTE)`), `HistorialAbonos` (`id`, `creditoId`, `fecha`,
  `monto Decimal(10,2)`, `metodoPago MetodoPago`, `usuarioId`). `enum
  EstadoCredito` (`PENDIENTE`/`LIQUIDADO`) ya existe. Este sprint es el
  primero que los puebla.
- **`Venta.montoContado`/`montoCredito`** (`Decimal(10,2)?`) y la relación
  `credito Credito?` — sin usar desde Sprint 0. Sprint 9 confirmó
  explícitamente que toda venta de ese sprint era 100% al contado
  (`montoContado = totalCobrado`, `montoCredito: null` siempre, sin
  `Credito`) — este sprint es el primero que los puebla de verdad, sin
  tocar el comportamiento ya verificado de una venta 100% al contado (sigue
  funcionando exactamente igual cuando el toggle "Venta a crédito" no se
  activa).
- **`enum MetodoPago`** (`EFECTIVO`/`YAPE`/`PLIN`/`TRANSFERENCIA`) — sin
  ningún valor de crédito, confirmado en Sprint 9. Este sprint **no** le
  agrega ningún valor — cómo se marca una venta a crédito se resuelve con
  un campo separado (ver "Decisiones de negocio", punto 1).
- **Índices `Credito(estado, fechaLimite)` y `Credito(clienteId)`** — ya
  documentados en `memory/modelo-datos.md` como la query exacta que
  necesita el panel de alertas del Gerente y el estado de cuenta por
  cliente respectivamente. Este sprint es el primer consumidor real de
  ambos.
- **`CLIENTE_PUBLICO_GENERAL_ID`** (`lib/constants.ts`) — mismo patrón de
  guard por comparación de id ya usado en Sprint 8/9 para reglas
  especiales sobre "Público General". Este sprint lo usa para bloquear el
  crédito.
- **`cerrarVenta()`/`cerrarVentaSchema`** (`server/repositories|actions/venta.ts`,
  `lib/zod/venta.ts`, Sprint 9, confirmados en su estado exacto post
  corrección de diseño de Sprint 10 — sin cambios de Sprint 10 sobre estos
  archivos) — el checkout real que este sprint extiende. El guard
  anti-doble-venta sobre `Paquete`/`BandejaSuelta` (`updateMany` atómico,
  ancla `Venta` primero) **no se toca**. `PosWorkspace`/`PosCarrito`/
  `MetodoPagoSelect` (`components/domain/pos/`) — la base real de UI, sin
  reconstruir el POS.
- **El patrón de transacción interactiva "todo o nada"**
  (`registrarMortalidadYDescontarAves`/`revertirMortalidad`, Sprint 4;
  `cerrarVenta`, Sprint 9; `romperPaquete`/`romperBandeja`, Sprint 10) —
  referencia directa para el guard de sobrepago al registrar un abono (ver
  `plan.md`, que explica por qué el orden de este sprint es el de
  `registrarMortalidadYDescontarAves` — guard primero, ancla después — y
  no el de `cerrarVenta`/`consolidarSueltos`).
- **`<DataTablePagination>`, patrón de filtro colapsable, `idUuid()`,
  `withAuth`, `<Dialog>` centrado, `buscarClientesAutocomplete()`**
  (`server/repositories/cliente.ts`, Sprint 9) — reusables tal cual;
  ninguno se reconstruye.
- **`Cliente` no tiene ningún campo de límite de crédito.** Confirmado con
  el Product Owner: sigue sin tenerlo este sprint (ver decisión 4) — no
  hay migración sobre `Cliente`.
- **Dashboard de inicio (`src/app/page.tsx`)** — hoy muestra 4 tarjetas
  100% de ejemplo (`TARJETAS_EJEMPLO`, sin datos reales: "Lotes activos",
  "Huevos hoy", "Mortalidad hoy", "Ventas hoy"), con el texto explícito
  "Datos de ejemplo — los módulos de producción y ventas llegan en
  próximos sprints". Este sprint agrega la **primera tarjeta con datos
  reales** de todo el dashboard (créditos vencidos) — las otras 4 quedan
  de ejemplo, sin tocarlas (conectarlas es Sprint 15, Dashboard y
  reportes).

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md`, `memory/stack-tecnologico.md`,
`memory/arquitectura.md`, `memory/modelo-datos.md`, `memory/convenciones.md`
(en particular "Idempotencia por id de cliente" y el patrón de transacción
interactiva con guard "todo o nada"), `memory/decisiones-tecnicas.md`
(D1–D6), `memory/definition-of-ready.md`, `memory/estado-proyecto.md`
completo (en particular "Sprint 9", "Sprint 10" incluida la corrección de
diseño real en plena ejecución, y "Cómo continuar desde acá"),
`specs/roadmap-completo.md` (sección Sprint 11), `specs/sprint-10-romper-paquete-sueltos/`
completo (plantilla de estructura y nivel de detalle, y la sección
"Corrección de diseño real, en plena ejecución" de su `spec.md`) y
`specs/sprint-09-pos-carrito-cierre/spec.md`/`plan.md` completos (el POS
que este sprint extiende: `cerrarVenta()`, `cerrarVentaSchema`,
`PosWorkspace`/`PosCarrito`/`MetodoPagoSelect`). También se releyó el
código real de `prisma/schema.prisma` (`Credito`, `HistorialAbonos`,
`Venta`, `Cliente`, `enum EstadoCredito`/`MetodoPago`/`TipoCliente`),
`src/lib/zod/venta.ts`, `src/server/repositories/venta.ts`,
`src/server/actions/venta.ts` (confirmados en su estado exacto post
Sprint 10 — sin `SUELTO`, sin cambios de crédito todavía),
`src/components/domain/pos/pos-carrito.tsx`, `pos-workspace.tsx`,
`metodo-pago-select.tsx`, `src/server/repositories/mortalidad.ts`
(`registrarMortalidadYDescontarAves`, referencia directa del guard "guard
primero, ancla después"), `src/server/auth/with-auth.ts`,
`src/server/auth/rbac.ts`, `src/components/layout/nav-items.ts`,
`src/app/page.tsx` (dashboard real).

## Decisiones de negocio confirmadas por el Product Owner
Diez preguntas explícitas vía `AskUserQuestion` — las nueve del brief
original más una que surgió al diseñar la extensión real de `cerrarVenta()`
durante esta misma planificación (mismo criterio que Sprint 9/10 mostraron
con hallazgos adicionales que el brief no había anticipado):

1. **Cómo se marca una venta a crédito en el checkout: un toggle "Venta a
   crédito" separado del selector de método de pago.** `MetodoPagoSelect`
   sigue representando cómo se paga la parte al contado (o el método
   esperado del abono si no hay contado) — `enum MetodoPago` **no** gana
   ningún valor nuevo.
2. **Se permite pago parcial: `montoContado > 0` y `montoCredito > 0`
   simultáneos en la misma venta.** Ambos campos ya existen en el schema
   desde Sprint 0 para esto — cubre el caso real de un cliente que deja un
   adelanto y el resto queda a crédito.
3. **Bloqueo de crédito: únicamente para `CLIENTE_PUBLICO_GENERAL_ID`**,
   por comparación directa de id — no un criterio más amplio como
   `TipoCliente.EVENTUAL`.
4. **Sin límite de crédito por cliente.** El Gerente/Operario decide caso
   por caso, sin ningún campo nuevo en `Cliente` ni migración — mantiene
   el sprint acotado a los 26 pts del roadmap.
5. **Panel de alertas: en ambos lugares.** Un resumen (cantidad de créditos
   vencidos + monto total vencido) en el dashboard de inicio (`/`, la
   primera tarjeta con datos reales de ese archivo) para que el Gerente lo
   vea al entrar (coincide con el Sprint Goal del roadmap), más el panel
   completo con tarjetas por nivel en una pantalla nueva `/creditos`.
6. **Umbrales de antigüedad: 3 niveles graduados.** "Por vencer" (≤3 días
   antes de `fechaLimite`, ámbar), "Vencido reciente" (1-7 días vencido,
   rojo), "Vencido crítico" (>7 días vencido, rojo oscuro/destacado). Un
   `Credito` con más de 3 días de margen no muestra ninguna alerta.
7. **Abonos: abierto a GERENTE y OPERARIO por igual**, mismo criterio
   histórico del proyecto (`memory/mision.md`) — no el criterio
   restrictivo de "Ajustar inventario" (Sprint 6, GERENTE-only).
8. **Guard de sobrepago: se rechaza explícito.** Mismo criterio "todo o
   nada" que el resto del proyecto — un abono que superaría el saldo
   pendiente nunca se acepta recortado en silencio.
9. **Estado de cuenta por cliente: vive dentro de `/creditos`** (no un
   detalle nuevo dentro de `/clientes`) — un solo lugar nuevo para todo lo
   financiero de créditos.
10. **Rol de acceso general: GERENTE y OPERARIO por igual**, para "Venta a
    crédito" en el POS, "Registrar abono" y toda la pantalla `/creditos`
    (panel de alertas + estado de cuenta) — pese a ser información
    financiera de deuda, se mantiene el criterio histórico del proyecto,
    coherente con la decisión 7. Ninguna pieza de este sprint entra en
    `RUTAS_POR_ROL`.

**Decisión adicional, no listada en el brief original — surgió al diseñar
la extensión real de `cerrarVentaSchema`:** **`Credito.fechaLimite` se
calcula como una fecha sugerida (hoy + 15 días) y editable** — al activar
el toggle "Venta a crédito" el campo aparece precargado con esa fecha, y
el Gerente/Operario puede cambiarla a mano antes de confirmar (mismo
espíritu que D1: dato calculado con posibilidad de ajuste manual real, no
un valor fijo no editable ni un campo vacío sin ayuda).

## Historias de usuario

### H1 — Venta a crédito desde el POS, con pago parcial opcional (8 pts)
Como Gerente u Operario quiero poder marcar una venta como "a crédito" en
el POS, con la opción de dejar un monto al contado y el resto a crédito,
para no tener que cobrar todo de una vez.

```gherkin
Dado un carrito armado en /pos, cliente real (no Público General)
  seleccionado, con el toggle "Venta a crédito" desactivado
Cuando cierro la venta
Entonces se comporta exactamente igual que Sprint 9: Venta con
  montoContado = totalCobrado, montoCredito: null, sin ningún Credito
  creado

Dado el mismo carrito, con el toggle "Venta a crédito" activado, monto al
  contado dejado en 0, fecha límite sugerida (hoy + 15 días) aceptada tal
  cual
Cuando cierro la venta
Entonces se crea la Venta (montoContado: 0, montoCredito: totalCobrado) y
  un Credito (ventaId, clienteId, montoTotal: totalCobrado, montoPagado: 0,
  fechaLimite: hoy + 15, estado: PENDIENTE) en la MISMA transacción que
  Venta + DetalleVenta + el guard anti-doble-venta de Sprint 9

Dado el mismo carrito (totalCobrado S/ 300.00), toggle activado, monto al
  contado S/ 100.00 ingresado, fecha límite editada a una fecha específica
Cuando cierro la venta
Entonces Venta.montoContado = 100.00, Venta.montoCredito = 200.00,
  Credito.montoTotal = 200.00, Credito.fechaLimite = la fecha editada

Dado el mismo carrito, toggle activado, con un monto al contado mayor al
  total cobrado de la venta
Cuando intento cerrar
Entonces se rechaza explícito ("El monto al contado no puede superar el
  total de la venta"), sin crear ninguna Venta ni Credito

Dado el mismo carrito, toggle activado, con la fecha límite editada a una
  fecha pasada o igual a hoy
Cuando intento cerrar
Entonces se rechaza explícito ("La fecha límite debe ser posterior a
  hoy"), sin crear nada
```

### H2 — Venta a crédito bloqueada para Público General (2 pts)
Como equipo queremos que nunca se pueda vender a crédito a un cliente sin
identificar, ni desde la UI ni forzando el payload.

```gherkin
Dado que el cliente seleccionado en el POS es "Público General"
  (CLIENTE_PUBLICO_GENERAL_ID)
Cuando abro el carrito
Entonces el toggle "Venta a crédito" aparece deshabilitado, con una nota
  visible ("No se puede vender a crédito a Público General")

Dado el mismo caso, forzado a nivel de payload directo (sin pasar por la
  UI, ej. herramientas de desarrollador)
Cuando se ejecuta cerrarVentaAction con esCredito: true y
  clienteId: CLIENTE_PUBLICO_GENERAL_ID
Entonces se rechaza explícito del lado del servidor, no solo escondiendo
  el toggle en el cliente — la guard real vive en la Server Action, no en
  la UI
```

### H3 — Panel de alertas por antigüedad, dashboard + `/creditos` (5 pts)
Como Gerente quiero ver, al entrar al sistema, cuánto me deben en total y
hace cuánto, y poder abrir un panel completo agrupado por nivel de
urgencia.

```gherkin
Dado 3 Credito PENDIENTE reales: uno con fechaLimite dentro de 2 días
  (todavía sin alerta según el umbral de 3 días), uno con fechaLimite hace
  3 días (vencido reciente), uno con fechaLimite hace 10 días (vencido
  crítico)
Cuando el Gerente entra al dashboard (/)
Entonces ve una tarjeta real con la cantidad de créditos vencidos (2, sin
  contar el que todavía no vence) y el monto total vencido correspondiente

Dado el mismo escenario
Cuando entra a /creditos
Entonces ve tres tarjetas/secciones agrupadas por nivel (Por vencer ámbar,
  Vencido reciente rojo, Vencido crítico rojo oscuro), cada una con
  cliente, saldo pendiente (montoTotal - montoPagado) y días de antigüedad
  o de margen

Dado un Credito con fechaLimite dentro de 10 días (fuera de cualquier
  umbral)
Cuando se calculan las alertas
Entonces no aparece en ninguna de las tres secciones — sin alerta

Dado un Credito ya LIQUIDADO
Cuando se calculan las alertas (dashboard y /creditos)
Entonces no aparece en ningún nivel — el panel solo considera
  Credito.estado = PENDIENTE
```

### H4 — Registrar abono con guard de sobrepago bajo carrera real (5 pts)
Como Gerente u Operario quiero registrar un abono parcial contra un
crédito pendiente, sin que nunca sea posible pasarme del saldo, ni siquiera
si dos personas registran un abono casi al mismo tiempo.

```gherkin
Dado un Credito PENDIENTE con montoTotal 200.00, montoPagado 50.00 (saldo
  150.00)
Cuando un Gerente u Operario registra un abono de 100.00 con metodoPago
  EFECTIVO
Entonces Credito.montoPagado pasa a 150.00, se crea un HistorialAbonos
  (creditoId, monto: 100.00, metodoPago, usuarioId, fecha) y Credito.estado
  sigue PENDIENTE (saldo 50.00)

Dado el mismo Credito con saldo 150.00
Cuando se intenta registrar un abono de 200.00 (supera el saldo pendiente)
Entonces se rechaza explícito ("El abono supera el saldo pendiente"), sin
  crear ningún HistorialAbonos ni tocar montoPagado

Dado el mismo Credito, saldo 150.00
Cuando dos abonos concurrentes se ejecutan a la vez, cada uno de 100.00
  (juntos superarían el saldo, forzado en un script de verificación, no
  solo simulado)
Entonces exactamente uno tiene éxito (montoPagado pasa a 150.00, un solo
  HistorialAbonos creado) y el otro recibe el error de sobrepago, sin
  ningún estado intermedio inconsistente — guard atómico, no una
  lectura-luego-escritura

Dado un Credito ya LIQUIDADO
Cuando se intenta registrar un abono sobre él
Entonces se rechaza explícito ("Este crédito ya está liquidado")

Dado un abono ya registrado con éxito (mismo id)
Cuando se reenvía exactamente el mismo payload (doble clic, reintento de
  red)
Entonces la action responde éxito idempotente con el abono ya existente,
  sin duplicar la fila ni volver a incrementar montoPagado
```

### H5 — Auto-liquidación al llegar a saldo cero (3 pts)
Como equipo queremos que un Credito pase a LIQUIDADO automáticamente en
cuanto la suma de sus abonos alcanza el total, sin ningún paso manual
aparte.

```gherkin
Dado un Credito PENDIENTE con montoTotal 200.00, montoPagado 150.00 (saldo
  50.00)
Cuando se registra un abono de exactamente 50.00
Entonces Credito.montoPagado pasa a 200.00 Y Credito.estado pasa a
  LIQUIDADO, en la MISMA transacción que crea el HistorialAbonos — nunca
  un paso manual aparte

Dado el mismo Credito ya LIQUIDADO
Cuando se lista en /creditos o se calcula el resumen del dashboard
Entonces no aparece en ningún nivel de antigüedad, aunque su fechaLimite
  original ya haya pasado
```

### H6 — Estado de cuenta por cliente (3 pts)
Como Gerente u Operario quiero buscar un cliente y ver todos sus créditos
(pendientes y liquidados) junto con el historial completo de abonos de
cada uno.

```gherkin
Dado un cliente real con 2 Credito (uno PENDIENTE, uno LIQUIDADO) y 3
  HistorialAbonos en total entre ambos
Cuando busco a ese cliente por nombre en /creditos (mismo
  buscarClientesAutocomplete de Sprint 9)
Entonces veo ambos créditos (estado, montoTotal, montoPagado, saldo,
  fechaLimite) y, al abrir el detalle de cada uno, el historial completo
  de sus abonos (fecha, monto, metodoPago, quién lo registró)

Dado un cliente sin ningún Credito
Cuando lo busco en /creditos
Entonces veo un estado vacío claro ("Este cliente no tiene créditos
  registrados"), sin error
```

## Alcance de este sprint
- **Sin migración de schema.** `Credito`/`HistorialAbonos`/`enum
  EstadoCredito` ya tienen todo lo que este sprint necesita — único
  chequeo: `npx prisma validate` en verde.
- `lib/zod/comun.ts` (modifica): se extrae `hoyEnLima()` desde
  `lib/zod/lote.ts` (duplicado exacto hoy) para reusarla en
  `lib/zod/venta.ts` sin repetir la función una tercera vez.
- `lib/zod/venta.ts` (modifica): `cerrarVentaSchema` gana `esCredito`,
  `montoContado?`, `fechaLimiteCredito?`, con validación condicional.
- `lib/zod/credito.ts` (nuevo): `registrarAbonoSchema`.
- `server/services/venta.ts` (modifica): `validarMontoContado()` (mismo
  patrón que `validarDescuento()`), `calcularMontoCredito()`.
- `server/services/credito.ts` (nuevo): `calcularNivelAlerta()`,
  `calcularSaldoPendiente()`, `calcularFechaLimiteSugerida()`,
  `validarFechaLimite()`, `resumirAlertasCredito()` — funciones puras,
  100% testeables sin Prisma.
- `server/repositories/venta.ts` (modifica): `cerrarVenta` gana la
  creación anidada y condicional de `Credito` dentro del mismo
  `tx.venta.create` (ancla), sin tocar el guard anti-doble-venta existente.
- `server/repositories/credito.ts` (nuevo): `registrarAbono` (transacción
  interactiva, guard primero + ancla después), `buscarCreditoPorId`,
  `buscarHistorialAbonoPorId`, `listarCreditosPendientesConCliente`,
  `buscarCreditosPorClienteConAbonos`.
- `server/actions/venta.ts` (modifica): `cerrarVentaAction` gana el guard
  de Público General, el guard de monto al contado, y arma `Credito` en el
  payload cuando `esCredito`.
- `server/actions/credito.ts` (nuevo): `registrarAbonoAction` (sin `rol` —
  abierta a ambos), con chequeo previo de existencia/estado para un
  mensaje razonable antes de la transacción atómica.
- UI: extensión de `PosCarrito` (toggle, monto al contado, fecha límite),
  extensión menor de `ComprobanteDialog` (muestra el desglose
  contado/crédito cuando aplica). Nuevos:
  `components/domain/creditos/panel-alertas.tsx`,
  `tarjeta-credito.tsx`, `registrar-abono-dialog.tsx`,
  `estado-cuenta-cliente.tsx`. `app/(app)/creditos/page.tsx` (nuevo).
  `app/page.tsx` (modifica): agrega la tarjeta real de créditos vencidos.
- `components/layout/nav-items.ts`: entrada nueva "Créditos" → `/creditos`.
  Sin entrada nueva en `RUTAS_POR_ROL` (abierto a ambos roles).
- Tests unitarios de `server/services/credito.ts` y de las extensiones de
  `server/services/venta.ts`, de los Zod schemas nuevos/modificados, tests
  de integración de `registrarAbonoAction` y de la extensión de
  `cerrarVentaAction`, verificación de la carrera real de sobrepago (H4)
  contra Neon, verificación de idempotencia real de abonos, y verificación
  clic a clic en navegador (incluida la venta a crédito completa desde el
  POS y el registro de un abono desde `/creditos`).

## Fuera de alcance
- **Todo lo de Sprint 12 en adelante** — Egresos, Personal, PWA, cola
  offline real, Push/cron de vencimientos (Sprint 16), reportes/dashboard
  completo (Sprint 15).
- **Límite de crédito por cliente.** Confirmado sin límite sistematizado
  este sprint (decisión 4) — si se pide en producción, es una historia
  nueva con su propia migración.
- **Reversión/anulación de un abono ya registrado.** Ningún camino de
  "Deshacer" para `HistorialAbonos` este sprint — mismo criterio que
  `Venta` (Sprint 9) y `RoturaPaquete`/`RoturaBandeja` (Sprint 10), sin
  ventana de gracia.
- **Reversión de una venta a crédito ya cerrada.** No hay forma de anular
  un `Credito` ni de "deshacer" el paso a crédito de una venta ya cerrada.
- **Notificaciones push de vencimiento.** `PushSubscription`/Web Push
  siguen siendo Sprint 16 — este sprint es 100% visual (dashboard +
  `/creditos`), sin ningún job ni notificación automática.
- **Cron de detección de vencimientos.** Los niveles de alerta se calculan
  al vuelo, en cada request (funciones puras sobre `fechaLimite` + "hoy"),
  no con un job que los precalcule ni los persista — no hace falta,
  `Credito(estado, fechaLimite)` ya está indexado para esta query.
- **Reimpresión o edición del comprobante de una venta a crédito ya
  cerrada.** Mismo alcance de Sprint 9 (R4 de esa spec) — sigue sin existir
  un historial de ventas navegable.
- **`DELETE` físico de `Credito`/`HistorialAbonos`.** Nunca — mismo
  criterio de todo el proyecto.
- **Cola offline real.** Sigue siendo Sprint 14.

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Igual que Sprints 1-10. Una venta a crédito real y sus abonos son
irreversibles este sprint (sin "Deshacer") — probar la carrera de
sobrepago y el resto de la verificación con clientes/ventas de prueba
nombrados a propósito, nunca contra créditos reales de la granja si ya
hay datos cargados para ese momento.

### R2 — El orden del guard de sobrepago, CORREGIDO en plena verificación (S11-19)
El diseño original de este sprint asumió que el guard de sobrepago
(`Credito.montoPagado`, un contador con margen) debía seguir el orden
"guard primero, ancla después" de `registrarMortalidadYDescontarAves`
(Sprint 4) — por analogía con `avesVivas`. **Esa analogía resultó
incompleta y se corrigió durante la verificación en vivo contra Neon
(S11-19), antes de cerrar el sprint:** a diferencia de `avesVivas`
(llegar a 0 es un caso posible pero no el desenlace normal), `Credito.montoPagado`
llegando exactamente a `montoTotal` es el desenlace ESPERADO de todo
crédito (auto-liquidación, H5) — con "guard primero", un reintento
idempotente (doble clic) de **justo el abono que liquida el crédito**
encontraba el guard sin margen/ya `LIQUIDADO` y lo rechazaba ANTES de
llegar nunca al `create` con `id` explícito, así que la detección de
idempotencia vía `P2002` nunca se disparaba — el reintento recibía un
error confuso en vez de la respuesta idempotente que exige H4. **Diseño
final, implementado:** ancla primero (`create` de `HistorialAbonos` con
`id` explícito), guard después — mismo orden que `cerrarVenta`/
`romperPaquete`/`romperBandeja`, no el de `registrarMortalidadYDescontarAves`.
Ver "Hallazgo de diseño" en `plan.md` para el detalle completo — mismo
tipo de decisión de diseño que Sprint 9 ya identificó como "caso por
caso, no copiar el precedente más reciente sin pensar por qué funciona",
con la lección adicional de que ni los tests unitarios ni los de
integración (mockeados) distinguen ambos órdenes — hizo falta la
verificación real contra Neon para encontrar el bug.

### R3 — El guard de sobrepago no identifica la carrera real vs. un simple rechazo por saldo insuficiente
Mismo patrón que R5 de Sprint 9/10: el `updateMany` atómico es la fuente
de verdad, pero por sí solo no distingue "el saldo de verdad no alcanza"
de "alcanzaba hace un instante, pero otro abono concurrente lo consumió
justo antes". `server/actions/credito.ts` hace un chequeo previo
(best-effort) para armar un mensaje razonable, sin que eso reemplace el
guard atómico real.

### R4 — `fechaLimite` sugerida y editable: sin tope máximo hacia el futuro
La decisión de negocio adicional (hoy + 15 días, editable) no fija ningún
tope máximo hacia adelante — un Gerente podría, en teoría, poner una fecha
límite a 5 años. Aceptado como riesgo menor: no hay una regla de negocio
real que lo impida, y agregar un tope inventado sin pedirlo sería asumir
de más (mismo espíritu que evitar el error de Sprint 10). Si en producción
resulta un problema real, es un ajuste chico de validación, no una
historia nueva.

### R5 — `AuditLog` no atómico con la mutación (heredado)
Mismo trade-off aceptado desde Sprint 2 — un reintento idempotente de
`registrarAbonoAction` (mismo `id`, mismo payload) deja una segunda fila en
`AuditLog`, inofensivo.

### R6 — Sin cron ni notificación: el panel depende de que alguien entre a mirar
Fuera de alcance de este sprint (ver "Fuera de alcance") — el Gerente solo
se entera de un vencimiento si entra al dashboard o a `/creditos`. Push
(Sprint 16) resuelve esto más adelante; no es una regresión de este
sprint, es simplemente el alcance acordado.

## Criterio de aceptación general
Dado el repo con Sprint 10 ya desplegado
Cuando un Gerente u Operario activa "Venta a crédito" en el POS (con o sin
  monto al contado), cierra la venta, y más tarde registra uno o más
  abonos contra ese crédito
Entonces la Venta y el Credito quedan creados atómicamente en el cierre,
  cada abono se aplica con un guard que nunca permite superar el saldo
  pendiente (verificado con una carrera real forzada contra Neon), y el
  crédito se liquida solo, en la misma transacción del abono que completa
  el saldo
Y un Gerente que entra al sistema ve, sin buscar nada, cuántos créditos
  tiene vencidos y por cuánto, y puede abrir `/creditos` para ver el
  detalle agrupado por antigüedad y el estado de cuenta completo de
  cualquier cliente
Y "Público General" nunca puede recibir una venta a crédito, ni desde la
  UI ni forzando el payload directo
Y ninguna venta 100% al contado (el comportamiento de Sprint 9) cambia en
  absoluto
