# Sprint 9 — POS: Carrito y Cierre

## Sprint Goal
Un Gerente o un Operario abre el Punto de Venta, arma un carrito con paquetes
y bandejas `DISPONIBLE`, lo cierra contra un cliente real (o "Público
General"), y el sistema descuenta el stock correctamente — sin posibilidad de
vender dos veces el mismo paquete, aunque dos operarios lo intenten a la vez.
Al cerrar, queda un comprobante que se puede ver en pantalla, descargar en PDF
y compartir por WhatsApp.

## Decisión de alcance confirmada por el Product Owner: sprint único, sin dividir
El roadmap marcaba este sprint (31 pts, el más grande del proyecto hasta
ahora) con "⚠️ dividir en 9A/9B". **Confirmado explícitamente con el Product
Owner antes de escribir esta spec: se ejecuta como un solo sprint**, no
dividido en dos carpetas — la partición propuesta en el brief (9A =
transaccional, 9B = UX/salida) no se usa. `specs/roadmap-completo.md`
mantiene una única entrada "Sprint 9".

## Contexto previo — qué hereda de Sprint 5/7/8, qué es nuevo acá
Este es el primer sprint que **consume** en conjunto todo lo que Sprints 5, 7
y 8 dejaron listo sin código real encima todavía:

- **`Paquete`/`BandejaSuelta` con `estado: DISPONIBLE` reales** (Sprint 5
  Recolección, Sprint 7 Consolidación) — el selector de items del POS lee
  sobre esto, no crea nada nuevo en `PaqueteOrigen`/`BandejaOrigen`/
  `InventarioSueltos`. `enum EstadoPaquete` (`DISPONIBLE`/`VENDIDO`/`ROTO`/
  `ANULADO`) y `enum EstadoBandeja` (`DISPONIBLE`/`VENDIDO`) ya existen desde
  Sprint 0, sin ningún código que los mueva a `VENDIDO` todavía — este sprint
  es el primero que lo hace.
- **`Cliente`/`PrecioKilo` completos** (Sprint 8) — `listarClientes()`,
  `esClientePublicoGeneral()`, `CLIENTE_PUBLICO_GENERAL_ID`
  (`lib/constants.ts`), `obtenerPrecioKiloVigente()`
  (`server/repositories/precioKilo.ts`). Sprint 8 dejó pospuesto a propósito
  un endpoint de autocomplete para el selector de cliente del POS — **este
  sprint es ese consumidor real**, y el Product Owner confirmó construirlo
  ahora (ver "Decisiones de negocio", punto 4).
- **`model Venta`/`model DetalleVenta`/`model RoturaPaquete`** — schema
  completo desde Sprint 0, sin ningún campo `@unique`. `Venta` tiene
  `montoContado`/`montoCredito` (`Decimal?`) y una relación `credito
  Credito?` pese a que Créditos es Sprint 11 (ver "Hallazgo real,
  resuelto" abajo). `enum MetodoPago`
  (`EFECTIVO`/`YAPE`/`PLIN`/`TRANSFERENCIA`) sin ningún valor de "crédito".
- **El patrón completo de idempotencia por id de cliente**
  (`crearGalpon`/`crearCliente` como referencia directa) — `Venta` cae en el
  mismo caso: sin unicidad de negocio, entidad nueva independiente. Ver
  "Hallazgo de diseño: el orden del anclaje de idempotencia" en `plan.md`
  para el matiz real que este sprint encuentra (el orden "ancla primero,
  guard después" de `consolidarSueltos`, no el orden "guard primero, ancla
  después" de `registrarMortalidadYDescontarAves` — los dos coexisten en el
  proyecto según el caso, y acá aplica el de `consolidarSueltos`).
- **El `Update` condicional anti-doble-venta es la sexta vuelta del mismo
  patrón de transacción interactiva** ya usado en
  `registrarMortalidadYDescontarAves` (Sprint 4), `revertirMortalidad`
  (Sprint 4), `registrarRecoleccion` (Sprint 5), `revertirRecoleccion`
  (Sprint 6), `consolidarSueltos` (Sprint 7) — no es una pieza de
  arquitectura nueva, ver `memory/estado-proyecto.md` ("Cómo continuar desde
  acá", punto 5).
- **`<DataTablePagination>`, patrón de filtro colapsable, `idUuid()`,
  `withAuth`, `<Dialog>` centrado** — reusables tal cual si hiciera falta,
  aunque este sprint no agrega ninguna tabla de gestión nueva (el POS es una
  pantalla operativa de una sola vista, no un CRUD tabular).

## Hallazgo real, resuelto con el Product Owner antes de diseñar: `Venta` ya tiene campos de crédito
Verificado releyendo `prisma/schema.prisma` real (no asumido): `Venta` ya
tiene `montoContado`/`montoCredito` (ambos `Decimal?`) y una relación
`credito Credito?` desde Sprint 0 — pese a que el roadmap dice explícitamente
que Créditos es Sprint 11, no Sprint 9. **Confirmado con el Product Owner:
toda venta que cierre este sprint es 100% al contado, sin excepción** —
`montoContado = totalCobrado`, `montoCredito = null`, sin ninguna fila de
`Credito`. Esos dos campos y la relación quedan sin usar hasta Sprint 11; no
se adelanta ninguna pieza de Créditos en este sprint. `MetodoPago` tampoco
gana ningún valor de "crédito" acá — si Sprint 11 lo necesita, es una
decisión de ese sprint.

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md`, `memory/stack-tecnologico.md`,
`memory/arquitectura.md`, `memory/modelo-datos.md`, `memory/convenciones.md`
(en particular "Idempotencia por id de cliente" y el patrón de transacción
interactiva con guard "todo o nada"), `memory/decisiones-tecnicas.md`
(D1–D6), `memory/definition-of-ready.md`, `memory/estado-proyecto.md`
completo (en particular "Sprint 8 — Clientes y Precio por Kilo" y "Cómo
continuar desde acá"), `specs/roadmap-completo.md` (sección Sprint 9), y
`specs/sprint-08-clientes-precio-kilo/` completo (spec.md, plan.md, tasks.md
— plantilla de estructura y nivel de detalle de este documento). También se
releyó el código real de `prisma/schema.prisma` (modelos `Paquete`/
`BandejaSuelta`/`Cliente`/`PrecioKilo`/`Venta`/`DetalleVenta`/`RoturaPaquete`/
`Credito` y los enums `EstadoPaquete`/`EstadoBandeja`/`MetodoPago`/
`TipoDetalleVenta`), `server/repositories/mortalidad.ts` y
`server/repositories/consolidacion.ts` (las dos transacciones interactivas de
referencia directa para el diseño del cierre de venta),
`server/repositories/recoleccion.ts` (`revertirRecoleccion`, referencia del
guard "todo o nada" por `updateMany` + comparación de conteo sobre un
conjunto de filas), `server/repositories/cliente.ts` +
`server/actions/cliente.ts` + `server/repositories/precioKilo.ts` +
`server/actions/precioKilo.ts` (piezas reales de Sprint 8 a reusar tal cual),
`server/auth/with-auth.ts`, `server/auth/rbac.ts`,
`components/layout/nav-items.ts`.

## Decisiones de negocio confirmadas por el Product Owner antes de esta planificación
Siete preguntas que el roadmap no resolvía, confirmadas explícitamente antes
de diseñar (mismo criterio de `definition-of-ready.md` ya usado en Sprints
3-8):

1. **Sin dividir 9A/9B — sprint único.** Ver "Decisión de alcance" arriba.
2. **Rol del POS completo (selector, carrito, cierre): GERENTE y OPERARIO por
   igual.** Mismo criterio que Mortalidad/Recolección/Consolidación/Clientes
   — `memory/mision.md` ya dice "cualquier Operario puede operar también el
   Punto de Venta". Ninguna pieza de este sprint entra en `RUTAS_POR_ROL`.
3. **Toda venta de este sprint es 100% al contado.** Ver "Hallazgo real,
   resuelto" arriba.
4. **Selector de cliente del POS: se construye el endpoint de autocomplete
   liviano que Sprint 8 dejó pospuesto explícitamente.** Ahora existe el
   consumidor real. Sin paginación (no es una tabla de gestión), acotado a
   `Cliente.estado === ACTIVO`, con "Público General" siempre disponible
   como opción por defecto (pre-seleccionada al abrir el POS — es el caso más
   común de una venta de mostrador) sin necesidad de escribir nada.
5. **`DetalleVenta.tipo` solo puebla `PAQUETE`/`BANDEJA` este sprint.**
   Confirmado: `SUELTO` queda sin ningún código real hasta Sprint 10 (mismo
   criterio que `BandejaSuelta` quedó sin usar entre Sprint 0 y Sprint 7) — el
   selector de items no muestra ninguna opción de "vender suelto" todavía.
6. **Descuento manual: con guard de aplicación.** No puede ser negativo ni
   superar el total bruto de la venta (evita que `totalCobrado` quede
   negativo) — validado en la capa de servicio/Server Action, porque el
   schema no tiene ningún `CHECK` para esto.
7. **Comprobante: pantalla de detalle + descarga en PDF + compartir (no solo
   un link de texto a WhatsApp).** El Product Owner pidió explícitamente algo
   más completo que el "link `wa.me` con texto plano" que este documento
   había propuesto como opción más simple: **una pantalla de "Ver detalle"
   con todos los datos de la venta, más un PDF descargable generado en el
   navegador, compartible cuando el dispositivo lo permita.** Esto expande el
   alcance original del roadmap y **agrega una dependencia nueva al stack**
   (`memory/stack-tecnologico.md` no incluye ninguna librería de PDF hoy) —
   ver "Decisión de diseño: generación de PDF" en `plan.md` para la
   justificación completa de por qué se elige `jsPDF` (cliente, sin backend
   nuevo, mantiene el presupuesto $0) y las limitaciones reales de
   "compartir" (la Web Share API con archivo adjunto no está garantizada en
   todos los navegadores/dispositivos — hay que probarlo en vivo, con
   fallback a solo descarga si no está disponible).

## Historias de usuario

### H1 — Selector de items DISPONIBLES y carrito (5 pts)
Como Gerente u Operario quiero ver los paquetes y bandejas `DISPONIBLE` y
armar un carrito con los que voy a vender, antes de cerrar la venta.

```gherkin
Dado que abro /pos con 5 Paquete DISPONIBLE y 2 BandejaSuelta DISPONIBLE
  reales en la base
Cuando entro a la pantalla
Entonces veo ambos listados (Paquetes y Bandejas), cada ítem con su peso real
  y sin ningún Paquete/BandejaSuelta en estado distinto de DISPONIBLE (ni
  VENDIDO, ni ROTO, ni ANULADO)

Dado el selector de items visible
Cuando hago clic en "Agregar" sobre un Paquete
Entonces aparece en el carrito con su peso, el subtotal calculado con el
  precio por kilo vigente (obtenerPrecioKiloVigente(), Sprint 8), y el
  Paquete deja de aparecer en el selector (no se puede agregar dos veces el
  mismo ítem al mismo carrito)

Dado un ítem ya en el carrito
Cuando hago clic en "Quitar"
Entonces vuelve a aparecer en el selector, y el subtotal del carrito se
  recalcula sin él

Dado que no hay ningún PrecioKilo sembrado en la base (caso límite)
Cuando entro a /pos
Entonces veo un aviso claro ("No hay ningún precio por kilo configurado —
  pedile a un Gerente que lo fije en /precio-kilo") y el botón "Cerrar venta"
  queda deshabilitado, en vez de calcular subtotales con un precio inválido
```

### H2 — Cierre de venta transaccional (8 pts)
Como Gerente u Operario quiero cerrar una venta con el carrito armado, para
que se registre `Venta`+`DetalleVenta` y el stock de cada ítem vendido quede
descontado, en la misma operación.

```gherkin
Dado un carrito con 2 Paquete y 1 BandejaSuelta, cliente "Distribuidora El
  Sol" seleccionado, método de pago EFECTIVO, sin descuento
Cuando hago clic en "Cerrar venta"
Entonces se crea una Venta (clienteId, usuarioId, fecha, totalCobrado,
  descuento: 0, metodoPago: EFECTIVO, montoContado: totalCobrado,
  montoCredito: null) con 3 DetalleVenta (uno por ítem, cada uno con
  precioKiloAplicado copiado del precio vigente EN ESE MOMENTO — no una
  referencia al PrecioKilo, el valor congelado), y los 3 Paquete/BandejaSuelta
  pasan de DISPONIBLE a VENDIDO en la misma transacción

Dado la misma venta ya cerrada
Cuando el Gerente cambia el precio por kilo en /precio-kilo después
Entonces los DetalleVenta de la venta ya cerrada mantienen el
  precioKiloAplicado original, sin verse afectados por el cambio

Dado el carrito vacío (ningún ítem agregado)
Cuando intento hacer clic en "Cerrar venta"
Entonces el botón está deshabilitado — no se puede cerrar una venta sin
  ningún ítem

Dado un peso o un precio que llegara manipulado desde el cliente (payload
  directo, sin pasar por la UI)
Cuando se ejecuta cerrarVenta
Entonces el peso se relee de la fila real de Paquete/BandejaSuelta y el
  precio se resuelve con obtenerPrecioKiloVigente() del lado del servidor —
  ningún valor de peso o precio que venga del payload del cliente se usa
  para calcular subtotales o totalCobrado
```

### H3 — Guard anti-doble-venta bajo carrera real (3 pts)
Como equipo queremos que dos operarios no puedan vender el mismo Paquete o
BandejaSuelta a la vez, aunque los dos hagan clic en "Cerrar venta" casi
simultáneamente con ese mismo ítem en su carrito.

```gherkin
Dado un Paquete DISPONIBLE
Cuando dos cierres de venta distintos, con ese mismo Paquete en el carrito,
  se ejecutan concurrentemente (forzado en un script de verificación, no solo
  simulado)
Entonces exactamente uno de los dos cierra con éxito (el Paquete pasa a
  VENDIDO una sola vez, con la Venta correspondiente creada), y el otro
  recibe un error explícito indicando qué ítem ya no está disponible, sin
  ninguna Venta a medias ni ningún Paquete en un estado inconsistente

Dado un carrito con 2 ítems, uno de los cuales fue vendido por otro operario
  un instante antes de que este cierre se ejecute
Cuando se intenta cerrar la venta
Entonces la transacción completa se revierte (ningún ítem del carrito queda
  VENDIDO, ninguna Venta ni DetalleVenta se crea) — "todo o nada", mismo
  criterio que el guard de reversión de Recolección (Sprint 6)

Dado el mismo caso anterior
Cuando el operario ve el mensaje de error
Entonces identifica qué ítem específico ya no está disponible, para poder
  quitarlo del carrito y reintentar sin tener que adivinar cuál falló
```

### H4 — Descuento manual y método de pago (5 pts)
Como Gerente u Operario quiero aplicar un descuento manual y elegir el método
de pago al cerrar una venta.

```gherkin
Dado un carrito con subtotal bruto de S/ 500.00
Cuando aplico un descuento de S/ 50.00 y elijo método de pago YAPE
Entonces la Venta se crea con descuento: 50.00, totalCobrado: 450.00,
  metodoPago: YAPE

Dado el mismo carrito (bruto S/ 500.00)
Cuando intento aplicar un descuento de S/ 600.00 (supera el bruto)
Entonces se rechaza explícito ("El descuento no puede superar el total de la
  venta"), sin crear ninguna Venta

Dado el mismo carrito
Cuando intento aplicar un descuento negativo
Entonces se rechaza en la validación de Zod, antes de llegar a la lógica de
  negocio

Dado que no se toca el campo de descuento
Cuando cierro la venta
Entonces se aplica el default de Venta.descuento (0), totalCobrado = bruto

Dado el selector de método de pago
Cuando elijo cada uno de los 4 valores reales de MetodoPago (EFECTIVO/YAPE/
  PLIN/TRANSFERENCIA)
Entonces cada uno se acepta y se persiste tal cual — ninguno de los cuatro
  representa "crédito" (confirmado, ver "Hallazgo real" arriba)
```

### H5 — Selector de cliente con autocomplete (3 pts)
Como Gerente u Operario quiero buscar un cliente registrado escribiendo parte
de su nombre, o dejar "Público General" por defecto para una venta de
mostrador sin cliente identificado.

```gherkin
Dado que abro /pos
Cuando la pantalla carga
Entonces el cliente ya viene preseleccionado como "Público General"
  (CLIENTE_PUBLICO_GENERAL_ID), sin que tenga que buscarlo

Dado 20 clientes ACTIVOS reales, 3 de ellos con "Sol" en el nombre, y 1
  cliente SUSPENDIDO con "Sol" en el nombre
Cuando escribo "Sol" en el buscador de cliente del POS
Entonces aparecen como sugerencia solo los 3 ACTIVOS (el SUSPENDIDO no
  aparece), acotado a un máximo razonable de resultados (no la tabla completa
  sin límite)

Dado una sugerencia de cliente visible
Cuando hago clic en ella
Entonces reemplaza a "Público General" como cliente de la venta en curso,
  y el selector muestra su nombre elegido
```

### H6 — Comprobante en pantalla, descarga en PDF y compartir (5 pts)
Como Gerente u Operario quiero ver el detalle completo de una venta recién
cerrada, descargarlo como PDF, y compartirlo por WhatsApp si el dispositivo
lo permite.

```gherkin
Dado que una venta se cerró con éxito
Cuando aparece la pantalla de comprobante
Entonces muestra: cliente, fecha, cada ítem (tipo, peso, precio por kilo
  aplicado, subtotal), descuento, total cobrado, método de pago, y quién
  hizo la venta — con una nota visible de que NO es una boleta/factura
  electrónica (D-level: sin integración SUNAT en la v1, ver
  memory/decisiones-tecnicas.md)

Dado la pantalla de comprobante abierta
Cuando hago clic en "Descargar PDF"
Entonces se genera y descarga un PDF con exactamente los mismos datos
  mostrados en pantalla, generado en el navegador (sin depender de un
  servicio externo)

Dado un dispositivo/navegador que soporta la Web Share API con archivos
  (confirmado en vivo, no asumido — ver Riesgos)
Cuando hago clic en "Compartir"
Entonces se abre el selector nativo de compartir con el PDF ya adjunto, listo
  para elegir WhatsApp u otra app

Dado un dispositivo/navegador que NO soporta compartir archivos
  (ej. escritorio sin la Web Share API, o sin soporte de archivos en ella)
Cuando hago clic en "Compartir"
Entonces cae al camino alternativo (descarga directa, con una nota de que
  hay que adjuntar el archivo a mano) — nunca un botón que falla en silencio
```

### H7 — Idempotencia por id de venta bajo reintento real (2 pts)
Como equipo queremos evidencia real de que un doble clic en "Cerrar venta" o
un reintento de red nunca duplica una Venta ni vuelve a marcar los mismos
ítems como VENDIDO dos veces.

```gherkin
Dado un id de venta generado al abrir el flujo de cierre, ya persistido con
  éxito (Venta creada, ítems marcados VENDIDO)
Cuando se reenvía exactamente el mismo payload (mismo id, mismos ítems, mismo
  descuento, mismo método de pago)
Entonces la action responde éxito idempotente con la Venta ya existente, sin
  duplicar la fila ni volver a intentar marcar los ítems (ya no están
  DISPONIBLE, y no hace falta — el create de Venta explota primero con P2002
  antes de llegar al guard de ítems)

Dado el mismo id de venta, pero un reintento con un carrito de ítems distinto
  al original
Cuando se envía
Entonces se rechaza explícito ("ya existe un registro con este id pero con
  datos diferentes — no se sobrescribe"), sin tocar lo ya persistido
```

## Alcance de este sprint
- `server/services/venta.ts` (nuevo): funciones puras `calcularBrutoVenta`,
  `validarDescuento`, 100% testeables sin Prisma.
- `lib/zod/venta.ts` (nuevo): `cerrarVentaSchema` (id, clienteId, items:
  `{ tipo: "PAQUETE" | "BANDEJA", id }[]` no vacío, descuento, metodoPago).
- `server/repositories/venta.ts` (nuevo): `cerrarVenta` (transacción
  interactiva: ancla `Venta`+`DetalleVenta`, guard todo-o-nada anti-doble-
  venta sobre `Paquete`/`BandejaSuelta`), `buscarVentaConDetallesPorId`,
  `listarPaquetesDisponibles`, `listarBandejasDisponibles`.
- `server/repositories/cliente.ts` (modifica): `buscarClientesAutocomplete`
  (nuevo, acotado a `ACTIVO`, sin paginación, límite fijo).
- `server/actions/venta.ts` (nuevo): `cerrarVentaAction` (sin `rol` —
  abierta a ambos), `buscarClientesAutocompleteAction` (lectura, sin
  `withAuth`, mismo criterio que `obtenerMasBitacora`).
- `lib/pdf/comprobante.ts` (nuevo, cliente-only): genera el documento PDF con
  `jsPDF` a partir de los datos de una venta cerrada.
- UI: `app/(app)/pos/page.tsx`, `PosSelectorItems`, `PosCarrito`,
  `ClienteAutocomplete`, `DescuentoInput`, `MetodoPagoSelect`,
  `ComprobanteDialog` (ver detalle + descargar PDF + compartir).
- `components/layout/nav-items.ts`: entrada nueva "Punto de Venta" →
  `/pos`. Sin entrada nueva en `RUTAS_POR_ROL` (abierto a ambos roles).
- `memory/stack-tecnologico.md`: se agrega `jsPDF` como dependencia nueva
  (sección "Offline / PWA" o una nueva, ver `plan.md`), con la justificación
  de por qué se eligió sobre otras opciones.
- Tests unitarios de `server/services/venta.ts` y de `lib/zod/venta.ts`,
  tests de integración de `cerrarVentaAction`, verificación de la carrera
  real anti-doble-venta contra Neon (script con dos cierres concurrentes
  forzados, mismo criterio que Sprint 6/7), verificación de idempotencia
  real (H7), y verificación clic a clic en navegador (incluida la descarga
  de PDF y, si el entorno de prueba lo permite, el compartir).

## Fuera de alcance
- **Todo lo de Sprint 10 en adelante** — Romper Paquete (`RoturaPaquete`,
  sigue en el schema sin código encima), venta de sueltos por unidad
  (`DetalleVenta.tipo: SUELTO`), Créditos (`Credito`/`HistorialAbonos`,
  `montoCredito`), Egresos, PWA, cola offline real.
- **Venta a crédito.** Confirmado 100% contado este sprint — ver "Hallazgo
  real, resuelto".
- **Facturación electrónica / boleta SUNAT.** D-level, fuera de alcance de
  toda la v1 (`memory/mision.md`) — el comprobante de este sprint es un
  documento interno, con nota explícita de que no reemplaza una boleta.
- **Pantalla de historial de ventas con tabla paginada.** Este sprint
  entrega la pantalla de comprobante inmediatamente después de cerrar una
  venta (construida a partir de la respuesta de la propia Server Action, sin
  una query aparte) — no una pantalla `/ventas` con listado, filtros y
  paginación para volver a ver ventas pasadas. Si el Product Owner necesita
  reimprimir un comprobante viejo más adelante, es una historia nueva con un
  consumidor real detrás (mismo criterio que Sprint 8 pospuso el historial
  completo de `PrecioKilo`) — ver R4 en "Riesgos".
- **Editar o anular una venta ya cerrada.** No hay ningún camino de
  reversión para `Venta` en este sprint (a diferencia de Mortalidad/
  Recolección, que sí tienen ventana de gracia) — si se necesita, es una
  historia nueva a evaluar, no implícita en este sprint.
- **`DELETE` físico de `Venta`/`DetalleVenta`.** Nunca — mismo criterio de
  todo el proyecto.
- **Cola offline real (IndexedDB/Dexie).** Sigue siendo Sprint 14. El POS de
  este sprint requiere conexión — no hay contrato Offline-Ready completo
  todavía para `Venta`.

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Igual que Sprints 1-8. Este sprint cambia `estado` de `Paquete`/
`BandejaSuelta` reales a `VENDIDO` (irreversible en este sprint, sin botón
"Deshacer" — ver "Fuera de alcance") — probar la carrera concurrente y el
resto de la verificación con ítems de prueba nombrados/creados a propósito
para el script, nunca contra inventario real ya cargado por la granja si
existe para ese momento.

### R2 — Dependencia nueva del stack: `jsPDF` (decisión de diseño, no de negocio)
`memory/stack-tecnologico.md` no incluye ninguna librería de PDF hoy —
confirmado releyendo el documento antes de diseñar. Se agrega `jsPDF`
(generación 100% client-side, sin backend/servicio externo nuevo, mantiene
el presupuesto $0 de `stack-tecnologico.md`) — ver la justificación completa
en `plan.md`. Riesgo aceptado explícitamente: es la primera dependencia de
UI de "salida de documento" del proyecto, sin precedente interno que
comparar — la tarea de verificación en vivo (`tasks.md`) debe confirmar que
el PDF generado se ve bien en al menos un dispositivo móvil real, no solo en
escritorio.

### R3 — "Compartir" con archivo adjunto no está garantizado en todos los dispositivos
La Web Share API con soporte de archivos (`navigator.canShare({ files })`)
tiene soporte real pero no universal (varía por navegador/SO/versión) — y el
protocolo `wa.me` **no soporta adjuntar un archivo**, solo texto
pre-rellenado (limitación real del protocolo, no de esta implementación).
Por eso el diseño de H6 exige que "Compartir" caiga a un camino alternativo
(descarga directa) cuando el navegador no soporta archivos en la Web Share
API, en vez de fallar en silencio o prometer algo que el navegador no puede
cumplir. Confirmar en vivo en al menos un celular real (Android y, si es
posible, iOS) antes de dar la tarea por cerrada — mismo criterio que
`resize_window` de Claude in Chrome no sirve para esto (ver
`memory/estado-proyecto.md`, "Herramientas y configuración del entorno").

### R4 — Sin historial de ventas ni reimpresión de un comprobante viejo
Documentado en "Fuera de alcance". Si el Product Owner lo pide en
producción, es una historia nueva (`/ventas` con `<DataTablePagination>`,
mismo patrón que Clientes) para un sprint futuro — no anticipada acá sin un
consumidor real confirmado.

### R5 — El orden del guard "todo o nada" no identifica cada ítem que falló individualmente
El diseño de `cerrarVenta` (ver `plan.md`) usa `updateMany` por lote de ids
(un `updateMany` para `Paquete`, otro para `BandejaSuelta`) y compara el
conteo total contra lo esperado — mismo patrón que el guard de
`revertirRecoleccion` (Sprint 6). Si el conteo no coincide, la transacción se
revierte completa pero **no identifica, por sí sola, cuál ítem específico ya
no estaba `DISPONIBLE`** — la Server Action hace una lectura de diagnóstico
best-effort DESPUÉS del rollback (fuera de la transacción) para armar el
mensaje de error con el ítem exacto (H3, tercer Gherkin). Aceptado como
diseño: no bloquea el guard real (que sí es atómico y correcto), solo afecta
qué tan específico es el mensaje de error en el caso raro de carrera real.

### R6 — `AuditLog` no atómico con la mutación (heredado)
Mismo trade-off aceptado desde Sprint 2 — un reintento idempotente de
`cerrarVenta` (mismo `id`, mismo payload) deja una segunda fila en
`AuditLog`, inofensivo.

## Criterio de aceptación general
Dado el repo con Sprint 8 ya desplegado
Cuando un Gerente u Operario abre "/pos", arma un carrito con paquetes y
  bandejas reales `DISPONIBLE`, elige un cliente (o deja "Público General"),
  aplica un descuento válido y un método de pago, y cierra la venta
Entonces se crea una `Venta`+N `DetalleVenta` con `precioKiloAplicado`
  congelado, cada ítem vendido pasa a `VENDIDO` en la misma transacción, y
  aparece un comprobante en pantalla descargable en PDF
Y cuando dos cierres de venta con el mismo ítem se ejecutan concurrentemente,
  exactamente uno tiene éxito y el otro recibe un error explícito, sin
  ninguna Venta a medias
Y ningún doble envío duplica una Venta (H7), verificado contra Neon real, no
  solo con mocks
