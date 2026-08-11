# Sprint 5 — Recolección e Inventario

⚠️ NÚCLEO, riesgo alto (roadmap) — primer sprint del proyecto que produce
inventario vendible (paquetes) y el primero que debe cumplir el Contrato
Offline-Ready.

## Sprint Goal
El Operario ingresa el conteo total de huevos recolectados hoy en un
galpón/lote, y el sistema calcula automáticamente cuántos paquetes
cerrados de 180 unidades se forman y cuántas unidades quedan sueltas,
generando ambos (más el movimiento del ledger de sueltos) en una sola
transacción atómica — con el id de la operación generado en el cliente,
listo para cuando exista una cola offline real (Sprint 14).

## Contexto previo (leer antes de ejecutar)

### Estado real del schema (verificado antes de planificar, no asumido)
Los 7 modelos del módulo "Recolección e inventario" **ya existen desde
Sprint 0** (`prisma/schema.prisma`) — este sprint no necesita ninguna
migración de schema, igual que Sprint 4.

- `RegistroRecoleccion`: `id, loteId, galponId, usuarioId, cantidadTotal
  (Int), creadoEnCliente (DateTime?), creadoEn (@default now), revertido
  (Boolean @default false)`. Relaciones `lote`/`galpon`/`usuario`
  (`onDelete: Restrict`), `paquetes: Paquete[]`. Índices `[creadoEn,
  revertido]` y `[loteId]`. **Ya trae `creadoEnCliente` y `revertido`** —
  el contrato offline-ready y el precedente de ventana de gracia (Sprint
  6) ya estaban contemplados en el diseño del schema desde Sprint 0. Este
  sprint llena `creadoEnCliente` de verdad por primera vez; `revertido`
  queda en `false` siempre (el botón de reversión es Sprint 6).
- `Paquete`: `id, peso (Decimal 6,3), tipo (enum TipoPaquete: PURO/MIXTO),
  estado (enum EstadoPaquete: DISPONIBLE/VENDIDO/ROTO/ANULADO, @default
  DISPONIBLE), registroRecoleccionId (String?, SetNull), creadoEn`.
  Relación `origenes: PaqueteOrigen[]`. Este sprint solo crea paquetes
  `tipo: PURO` (un único origen: el galpón de la recolección) —
  `MIXTO` (multi-origen) es Sprint 7.
- `PaqueteOrigen`: `id, paqueteId, galponId, cantidad`. Hijo de `Paquete`
  (`onDelete: Cascade`), referencia a `Galpon` (`Restrict`).
- `InventarioSueltos`: `id, galponId, loteId, cantidad (Int @default 0)`,
  `@@unique([galponId, loteId])` — un único contador vivo por
  galpón+lote, actualizado con upsert atómico, nunca filas duplicadas.
- `MovimientoSueltos`: `id, galponId, loteId, tipo (enum
  TipoMovimientoSueltos: RECOLECCION/CONSOLIDACION_SALIDA/
  ROTURA_PAQUETE_ENTRADA/VENTA_SUELTO/REVERSION/AJUSTE_GERENTE),
  cantidad, referenciaId (String?), motivo (String?), usuarioId,
  creadoEn`. El ledger auditable. Este sprint solo escribe movimientos
  `tipo: RECOLECCION`, con `referenciaId = registroRecoleccion.id` — el
  resto de los tipos los escriben sprints futuros (Sprint 7
  Consolidación, Sprint 9-10 Ventas, Sprint 6 Reversión).
- `BandejaSuelta` / `BandejaOrigen`: existen en el schema pero **no se
  tocan en este sprint** — armar bandejas (30u) es Sprint 7.

Piezas ya construidas que este sprint reusa tal cual: `Lote.avesVivas` no
se toca (la recolección no afecta aves vivas, solo mortalidad lo hace);
`buscarUbicacionActual(loteId)` y `listarLotesActivos()`
(`server/repositories/lote.ts`, Sprint 3-4); el patrón de transacción
interactiva (`prisma.$transaction(async (tx) => {...})`, no el
array-form) inaugurado en `server/repositories/mortalidad.ts` (Sprint 4);
`idUuid()` (`lib/zod/comun.ts`) para todo id nuevo en un schema Zod;
`withAuth(config, handler)` para la mutación; `<PageHeader>`,
`<TableScrollArea>`, `<DataTablePagination>`, `toastManager`, `<Dialog>`
compacto (`INPUT_COMPACTO`/`LABEL_COMPACTO`, botones `size="md"`) como
patrón de formulario de campo.

### Por qué este sprint es distinto de los anteriores
Sprints 1-4 crearon o modificaron una entidad por vez con una Server
Action relativamente simple. Este sprint es el primero que:
1. **Calcula antes de escribir.** El operario no elige cuántos paquetes
   se forman — lo decide un service puro (`calcularEmpaque`) a partir de
   un solo número (`cantidadTotal`), y la UI tiene que reaccionar en vivo
   mostrando N campos de peso según ese cálculo, antes de que exista
   ningún registro en la base.
2. **Escribe en cascada real dentro de una sola transacción**:
   `RegistroRecoleccion` + N `Paquete` + N `PaqueteOrigen` + (si hay
   sueltos) `InventarioSueltos` (upsert) + `MovimientoSueltos` — más
   tablas tocadas de una sola vez que cualquier transacción anterior del
   proyecto.
3. **Es el primer sprint bajo el Contrato Offline-Ready**
   (`memory/convenciones.md`). **Decisión confirmada por el Product
   Owner:** este sprint implementa **solo el contrato de datos** (id
   generado en el cliente, Server Action idempotente por id, doble
   timestamp, payload JSON puro) — sin cola real de IndexedDB/Dexie, que
   sigue siendo Sprint 14. Sin señal, la acción falla con un error claro,
   igual que cualquier Server Action de Sprints 1-4 — no se encola para
   reintentar sola todavía. Lo que sí cambia respecto a Sprints 1-4: el
   `id` de `RegistroRecoleccion` ya no lo genera Prisma
   (`@default(uuid())` se ignora en la escritura) — lo genera el cliente
   (`crypto.randomUUID()`) y viaja en el payload, para que un reintento
   futuro (offline o por un simple doble-tap/mala señal) sea
   idempotente en vez de duplicar el registro completo.

### Decisiones de negocio confirmadas por el Product Owner antes de esta planificación
Cuatro preguntas que el roadmap no resolvía (mismo criterio de
`definition-of-ready.md`):

1. **Offline-ready en este sprint = solo contrato de datos**, sin cola
   real (ver arriba).
2. **El registro se guarda solo cuando todos los pesos están cargados.**
   El operario ingresa `cantidadTotal`, la UI despliega reactivamente un
   campo de peso por cada paquete que `calcularEmpaque` determine, y el
   botón "Guardar" queda deshabilitado hasta que **todos** esos campos
   tengan un peso válido (> 0). No existe un estado "paquete sin pesar
   guardado para completar después" en este sprint — la transacción
   completa se ejecuta una sola vez, con todos los pesos ya presentes.
3. **`reconstruirSaldo()` es una función de servicio puro, con tests,
   sin pantalla propia en este sprint.** Suma los `MovimientoSueltos` de
   un galpón+lote y confirma que coincide con
   `InventarioSueltos.cantidad` — la pantalla visible de "saldos por
   galpón/lote" para el Gerente es Sprint 7 (Consolidación de residuos)
   según el roadmap.
4. **`/recoleccion` sigue el precedente de Mortalidad/Bitácora (Sprint
   4): abierta a GERENTE y OPERARIO por igual**, sin entrada en
   `RUTAS_POR_ROL`.

### Decisiones de diseño adicionales tomadas en esta planificación
Corolarios técnicos de lo confirmado arriba, documentados para que el
Product Owner pueda objetarlos antes de ejecutar (mismo criterio que
Sprints 2-4 usaron con sus "decisiones de diseño adicionales"):

- **Solo lotes `ACTIVO` pueden recolectar** — mismo criterio que
  `puedeRegistrarMortalidad` (Sprint 4): un lote `INACTIVO` ya cerró su
  ubicación, no tiene sentido seguir sumándole producción.
- **El `galponId` se resuelve automáticamente** vía
  `buscarUbicacionActual(loteId)`, igual que Mortalidad — el operario
  solo elige el lote, nunca un galpón a mano.
- **`cantidadTotal` debe ser un entero positivo (`> 0`).** Un registro de
  0 huevos no tiene sentido de negocio y se rechaza por Zod antes de
  tocar la base.
- **Regla de empaque — `calcularEmpaque(total)`:**
  `paquetes = Math.floor(total / 180)`, `sueltos = total % 180`. Si
  `total < 180` (ej. 45), se generan **0 paquetes** y los 45 quedan
  enteros como sueltos — no se fuerza ningún paquete incompleto. Cada
  paquete generado es `tipo: PURO`, con un único `PaqueteOrigen`
  (`galponId` = el galpón resuelto, `cantidad: 180`).
- **Si `sueltos === 0` (el total es múltiplo exacto de 180), no se
  crea ni se toca `InventarioSueltos` ni `MovimientoSueltos`.** Evita
  ruido en el ledger con movimientos de cantidad cero — mismo criterio
  que ya se usó para no ensuciar `AuditLog` con lecturas (Sprint 4,
  `memory/convenciones.md`).
- **Idempotencia por id generado en cliente, no por `upsert` de Prisma
  con children.** `RegistroRecoleccion.id` viaja en el payload
  (`crypto.randomUUID()` del cliente). El repository intenta un `create`;
  si el `id` ya existe (retry, mismo payload reenviado), Prisma devuelve
  `P2002` (violación de unicidad en la PK) — se captura ese error
  puntual y se responde con el registro **ya existente** (más sus
  paquetes), sin volver a tocar `InventarioSueltos`/`MovimientoSueltos`.
  Un `upsert()` de Prisma no alcanza acá porque no puede expresar "crear
  también N filas hijas atómicamente solo si el padre no existía todavía"
  — se detalla el patrón completo en `plan.md`.
- **`server/services/recoleccion.ts` (`calcularEmpaque`) es la única
  fuente de verdad del cálculo.** El cliente puede mostrar el mismo
  cálculo de forma local para la UI reactiva (aritmética trivial, sin
  lógica de negocio secreta), pero la Server Action **siempre
  recalcula** `calcularEmpaque(cantidadTotal)` en el servidor y exige que
  el arreglo de pesos recibido tenga exactamente esa cantidad de
  elementos — si no coincide (manipulación del cliente, o un cálculo
  cliente desactualizado), la acción se rechaza sin escribir nada. Mismo
  patrón que ya usó Sprint 3 para `fechaIngreso` (tope de fecha futura:
  duplicado en cliente por UX, autoritativo en el servidor).
- **La lógica de cálculo de la UI reactiva no importa
  `server/services/recoleccion.ts` directamente** desde el Client
  Component — sería un import de código de servidor cruzando el límite
  de RSC (el propio `npm run build` de Sprint 3 ya vigila esto). Se
  duplica la fórmula trivial (`Math.floor`/`%`) en un helper de cliente
  documentado como "debe coincidir con `calcularEmpaque`", no se
  reexporta el service.

## Historias de usuario

### H1 — Registrar recolección con empaque automático (8 pts)
Como Operario (o Gerente) quiero ingresar el conteo total de huevos
recolectados hoy de un lote activo, para que el sistema genere
automáticamente los paquetes cerrados y registre el resto como sueltos,
todo en una sola operación consistente.

```gherkin
Dado un lote ACTIVO alojado hoy en el Galpón A
Cuando registro una recolección con cantidadTotal = 470 y cargo el peso
  de los 2 paquetes que la UI desplegó (180 c/u)
Entonces se crea 1 RegistroRecoleccion (cantidadTotal 470, galponId =
  Galpón A resuelto automáticamente), 2 Paquete (tipo PURO, estado
  DISPONIBLE, cada uno con su peso y un PaqueteOrigen de 180 en Galpón
  A), InventarioSueltos(Galpón A, lote) incrementado en 110, y un
  MovimientoSueltos (tipo RECOLECCION, cantidad 110, referenciaId = el
  RegistroRecoleccion creado) — todo en la misma transacción

Dado un lote ACTIVO
Cuando registro una recolección con cantidadTotal = 45 (menor a 180)
Entonces no se crea ningún Paquete ni PaqueteOrigen, InventarioSueltos se
  incrementa en 45 y se crea un MovimientoSueltos de 45 con tipo
  RECOLECCION

Dado un lote ACTIVO
Cuando registro una recolección con cantidadTotal = 360 (múltiplo exacto
  de 180)
Entonces se crean 2 Paquete + 2 PaqueteOrigen, y NO se crea ni se toca
  InventarioSueltos ni MovimientoSueltos (sueltos = 0, sin ruido en el
  ledger)

Dado un lote INACTIVO (ya finalizado)
Cuando intento registrarle una recolección
Entonces la acción es rechazada — solo lotes ACTIVOS aceptan recolección

Dado un lote ACTIVO que fue mudado del Galpón A al Galpón B esta mañana
Cuando registro una recolección esta tarde
Entonces el RegistroMortalidad... (RegistroRecoleccion) queda con
  galponId = Galpón B (la ubicación actual real), sin que el operario
  haya elegido un galpón a mano

Dado un intento de registrar cantidadTotal = 0 o un número negativo
Cuando se envía el formulario
Entonces la acción es rechazada por el schema Zod antes de tocar la base
```

### H2 — UI reactiva de despliegue de campos de peso (3 pts)
Como Operario quiero ver aparecer automáticamente un campo de peso por
cada paquete que se va a formar a medida que escribo el conteo total,
para pesar cada paquete en la balanza sin tener que calcular nada a mano.

```gherkin
Dado el formulario de recolección vacío
Cuando escribo cantidadTotal = 470
Entonces aparecen exactamente 2 campos de peso (uno por paquete),
  etiquetados "Paquete 1", "Paquete 2", y un texto informativo "110
  unidades sueltas" (sin campo de peso propio, no se pesan sueltos)

Dado 2 campos de peso desplegados
Cuando cambio cantidadTotal a un valor que genera solo 1 paquete
Entonces el segundo campo de peso desaparece (y su valor cargado se
  descarta, no se arrastra a un paquete que ya no corresponde)

Dado que faltan campos de peso por completar (alguno vacío o en 0)
Cuando reviso el botón "Guardar"
Entonces está deshabilitado

Dado que todos los campos de peso tienen un valor válido (> 0)
Cuando reviso el botón "Guardar"
Entonces está habilitado
```

### H3 — Listado de Recolección (3 pts)
Como Gerente u Operario quiero ver el historial de recolecciones
registradas, para llevar control de la producción diaria de cada lote.

```gherkin
Dado que soy un usuario autenticado (cualquier rol)
Cuando entro a /recoleccion
Entonces veo una tabla paginada (10 filas) con fecha, código de lote,
  galpón, cantidadTotal, cantidad de paquetes generados, sueltos
  resultantes y quién lo registró, más el acceso rápido para registrar
  una nueva recolección

Dado un Operario autenticado
Cuando entro a /recoleccion
Entonces no soy rechazado — esta pantalla no está restringida por rol
  (mismo criterio que /mortalidad y /bitacora)
```

### H4 — Ledger de sueltos y `reconstruirSaldo()` (5 pts)
Como equipo queremos poder reconstruir el saldo de sueltos de cualquier
galpón/lote a partir del historial completo de `MovimientoSueltos`, para
poder auditar y detectar cualquier descuadre de inventario.

```gherkin
Dado una serie de MovimientoSueltos reales para un galpón/lote (varias
  recolecciones, algunas con sueltos = 0 que no dejaron movimiento)
Cuando ejecuto reconstruirSaldo(galponId, loteId) sobre esos movimientos
Entonces el resultado coincide exactamente con
  InventarioSueltos.cantidad para esa combinación

Dado un movimiento de tipo RECOLECCION seguido de otro tipo que todavía
  no existe en este sprint (CONSOLIDACION_SALIDA, VENTA_SUELTO, etc.)
Cuando reconstruirSaldo() los procesa
Entonces suma las entradas y resta las salidas según el tipo, quedando
  preparada para los movimientos que sprints futuros van a agregar (no
  hace falta ningún cambio en esta función para que Sprint 7 la reuse)
```

### H5 — Contrato Offline-Ready: idempotencia por id de cliente (5 pts)
Como Operario en campo con mala señal quiero que reintentar el mismo
registro de recolección (por un timeout o un doble-tap) no duplique
paquetes ni infle el inventario de sueltos, para poder confiar en el
botón "Guardar" incluso con conexión inestable.

```gherkin
Dado un payload de recolección con id generado en el cliente
  (crypto.randomUUID()), cantidadTotal y los pesos ya completos
Cuando se envía dos veces seguidas el mismo payload exacto (mismo id)
Entonces la primera vez crea el registro completo (RegistroRecoleccion +
  paquetes + ledger) y la segunda vez devuelve el mismo registro ya
  existente sin duplicar ningún Paquete, sin incrementar
  InventarioSueltos una segunda vez, y sin crear un segundo
  MovimientoSueltos

Dado el mismo escenario
Cuando se envían dos payloads con cantidadTotal distinto pero el mismo id
  (un caso anómalo, no un reintento legítimo)
Entonces la segunda escritura es rechazada (el id ya existe con datos
  distintos) — no se sobrescribe un registro existente con datos nuevos
```

### H6 — Tests de integridad y cobertura ≥90% (5 pts)
Como equipo queremos evidencia automatizada de que `calcularEmpaque` y
`reconstruirSaldo` cubren todos los casos límite, con la cobertura que
el roadmap exige para código de negocio tan sensible al dinero/stock.

```gherkin
Dado calcularEmpaque(total) como función pura
Cuando se prueba con total = 0 (rechazado antes, no llega acá), total <
  180, total múltiplo exacto de 180, y total con resto (caso general)
Entonces cada rama queda cubierta por un test unitario específico

Dado reconstruirSaldo() como función pura
Cuando se prueba con una lista vacía de movimientos, una lista con solo
  RECOLECCION, y una lista mixta con movimientos de más de un tipo
Entonces el resultado es correcto en cada caso, cubierto por tests
  unitarios

Dado que se corre `npx vitest run --coverage` sobre
  server/services/recoleccion.ts y server/services/inventario.ts
Cuando se revisa el reporte
Entonces ambos archivos superan el 90% de cobertura de líneas/branches
```

## Alcance de este sprint
- `server/services/recoleccion.ts` (`calcularEmpaque`, guard de lote
  ACTIVO), `server/services/inventario.ts` (`reconstruirSaldo`).
- `server/repositories/recoleccion.ts` (transacción interactiva:
  `registrarRecoleccion` con `create` + captura de `P2002` para
  idempotencia, N `Paquete`/`PaqueteOrigen`, upsert condicional de
  `InventarioSueltos`, `MovimientoSueltos` condicional).
- `lib/zod/recoleccion.ts` (`crearRecoleccionSchema` con `idUuid()`,
  `cantidadTotal` entero positivo, array de pesos).
- `server/actions/recoleccion.ts` (`registrarRecoleccion`, vía
  `withAuth`, sin restricción de rol).
- Pantalla `/recoleccion`: tabla paginada (10 filas,
  `<DataTablePagination>`) + `<Dialog>` de alta con campos de peso
  reactivos según `calcularEmpaque` (duplicado en cliente, ver decisión
  de diseño arriba).
- `NAV_ITEMS` ampliado con "Recolección" (sin entrada nueva en
  `RUTAS_POR_ROL`).
- Tests unitarios de `calcularEmpaque` y `reconstruirSaldo` (cobertura
  ≥90% en ambos services), tests de integración de la Server Action
  (repositories mockeados, incluyendo el caso de reintento
  idempotente), y verificación en vivo contra Neon real de la
  transacción completa y de la idempotencia por id de cliente.

## Fuera de alcance
- Cola offline real con IndexedDB/Dexie — Sprint 14 del roadmap. Este
  sprint solo cumple el contrato de datos (ver decisión confirmada
  arriba).
- Ventana de gracia / botón "Corregir último registro" para
  `RegistroRecoleccion` — Sprint 6. El campo `revertido` existe en el
  schema pero este sprint nunca lo pone en `true`.
- Paquetes `MIXTO` (multi-origen) y armado de `BandejaSuelta` — Sprint 7
  (Consolidación de residuos).
- Pantalla visible de "saldos por galpón/lote" para el Gerente —
  `reconstruirSaldo()` queda como función interna con tests, sin UI
  propia (decisión confirmada arriba). La pantalla es Sprint 7.
- Cualquier movimiento de tipo `CONSOLIDACION_SALIDA`,
  `ROTURA_PAQUETE_ENTRADA`, `VENTA_SUELTO` o `AJUSTE_GERENTE` — los
  escriben los sprints que los necesitan (7, 9, 10, 12).
- Venta o consulta de disponibilidad de paquetes — Sprint 8-10 (POS).
- Editar `RUTAS_POR_ROL` para restringir `/recoleccion` — queda abierta
  a ambos roles (decisión confirmada arriba).

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Igual que Sprints 1-4. Este sprint además genera inventario real
(paquetes DISPONIBLES) — probar con lotes/galpones de prueba, no contra
estructura real de la granja si ya hay operación real cargada.

### R2 — Primera transacción con escritura en cascada real (más tablas que cualquier sprint anterior)
`RegistroRecoleccion` + N `Paquete` + N `PaqueteOrigen` + (condicional)
`InventarioSueltos` + `MovimientoSueltos`, todo en una sola transacción
interactiva. Un error a mitad de camino (ej. un peso inválido en el
paquete 2 de 3) debe abortar TODO, incluidos los paquetes 1 y 3 — se
verifica explícitamente en tasks.md, no solo se asume por usar
`$transaction`.

### R3 — Primera idempotencia real por id de cliente (contrato offline-ready)
Es una pieza nueva de arquitectura, no solo una feature — se documenta
en detalle en `plan.md` para que Sprint 6 (reversión) y Sprint 14 (cola
real) la reusen sin reinventarla. El caso "mismo id, datos distintos"
(payload corrupto o manipulado) tiene que fallar explícitamente, no
sobrescribir en silencio.

### R4 — AuditLog no atómico con la mutación (heredado del diseño de `withAuth`)
Mismo trade-off aceptado desde Sprint 2.

### R5 — Verificación mobile pixel a pixel
`resize_window` de la extensión Claude in Chrome sigue sin efecto en
este entorno (confirmado en Sprints 1-4). La UI reactiva de campos de
peso es la pieza de interacción más compleja del proyecto hasta ahora en
una pantalla de campo — priorizar verificación clic a clic real (celular
físico del Product Owner o extensión) antes de dar el sprint por
cerrado.

## Criterio de aceptación general
Dado el repo con Sprint 4 ya desplegado
Cuando un Operario o Gerente registra una recolección de un lote ACTIVO
Entonces el sistema calcula automáticamente cuántos paquetes de 180
  unidades se forman y cuántas quedan sueltas, exige el peso de cada
  paquete antes de permitir guardar, y crea todo (RegistroRecoleccion +
  paquetes + origenes + ledger de sueltos, cuando corresponde) en una
  sola transacción atómica
Y un lote INACTIVO no acepta recolección
Y reenviar el mismo registro (mismo id generado en cliente) no duplica
  nada — cumple el Contrato Offline-Ready de datos, aunque este sprint
  no incluya la cola offline real
Y reconstruirSaldo() reproduce exactamente InventarioSueltos.cantidad a
  partir del historial de MovimientoSueltos, con cobertura de tests
  ≥90% junto a calcularEmpaque()
Y cualquier usuario autenticado (GERENTE u OPERARIO) puede ver el
  listado paginado de recolecciones
