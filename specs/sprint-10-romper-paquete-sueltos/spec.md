# Sprint 10 — Consolidación: Romper Paquete/Bandeja

## Sprint Goal
Un Gerente o un Operario puede deshacer un Paquete (180u) o una Bandeja
(30u) ya armados cuando el tamaño no es el que hace falta vender — sus
unidades vuelven al ledger de sueltos, repartidas proporcionalmente entre
los galpones/lotes de origen reales, y quedan listas para que los wizards
"Armar Bandeja"/"Armar Paquete Mixto" (Sprint 7) las reensamblen en el
tamaño correcto.

## Corrección de diseño real, en plena ejecución (léase antes que el resto)
El brief original de este sprint (título "POS: Romper paquete y sueltos")
asumía dos cosas que resultaron incorrectas una vez discutidas con el
Product Owner viendo el flujo ya construido — S10-1 a S10-12 se
ejecutaron primero con el diseño original, y esta sección documenta la
corrección real, no la reescribe en silencio (mismo criterio que Sprint 7
documentó su corrección de "techo calculado vs. control manual" en
`tasks.md`, S7-15).

1. **Supuesto original: la granja vende huevo suelto por unidad.**
   Confirmado como **falso** por el Product Owner: "no se vende huevo por
   unidad, como es una granja avícola se vende por bandeja o paquete."
   `DetalleVenta.tipo: SUELTO`, `TipoMovimientoSueltos.VENTA_SUELTO` y el
   guard de saldo asociado no son una historia real — quedan sin código
   encima, exactamente en la misma situación que `BandejaSuelta` estuvo
   entre Sprint 0 y Sprint 7 (un valor anticipado en el schema, sin
   consumidor real todavía). Todo lo que S10-9/S10-11/S10-12 habían
   construido para vender sueltos en `/pos` (ítem `SUELTO` en el carrito,
   tercer guard en `cerrarVenta`, `ItemSueltoDialog`, el comprobante
   mostrando galpón/lote) se **revirtió por completo** — `/pos` vuelve a
   ser exactamente lo que Sprint 9 dejó, sin ningún cambio este sprint.
2. **Supuesto original: Romper Paquete/Bandeja vive en `/pos`, "en vivo"
   durante una venta.** Descartado al debatir el caso real que motivó
   incluir Bandeja en el alcance (romper una Bandeja de 30 para completar
   180 con sueltos existentes y armar un Paquete): ese "armar" **solo
   existe como wizard en `/consolidacion`** (Sprint 7) — no hay, ni va a
   haber este sprint, un botón de "Armar Paquete" dentro de `/pos`. Con
   Romper en `/pos`, ese flujo real igual exigía salir a `/consolidacion`
   a armar y volver a `/pos` a vender (dos navegaciones, romper del lado
   equivocado del viaje). Con Romper en `/consolidacion`, el mismo flujo
   es: romper y armar en la MISMA pantalla (sin navegación entre esos dos
   pasos), después un solo viaje a `/pos` a vender. Con la confirmación del
   punto 1 (nunca se vende suelto directo), el argumento a favor de dejar
   Romper en `/pos` ("evita una navegación para vender el suelto recién
   liberado") deja de aplicar — un suelto liberado por una rotura NUNCA se
   vende directo, siempre se re-arma en Paquete/Bandeja primero. Romper
   Paquete/Bandeja se reubicó a `/consolidacion`, con un listado nuevo de
   Paquete/BandejaSuelta `DISPONIBLE` (`RomperInventarioSection`) junto a
   los wizards ya existentes.

**Lo que NO cambió con esta corrección:** `repartirDevolucion()`
(`server/services/rotura.ts`), las transacciones `romperPaquete`/
`romperBandeja` (`server/repositories/rotura.ts`), las Server Actions
`romperPaqueteAction`/`romperBandejaAction` (`server/actions/rotura.ts`),
y la migración de schema (`RoturaBandeja`, `EstadoBandeja.ROTO`,
`TipoMovimientoSueltos.ROTURA_BANDEJA_ENTRADA`) — toda esa lógica es
UI-agnóstica y sigue siendo exactamente correcta sin importar qué pantalla
la invoque. Solo se movieron/revirtieron las piezas de interfaz y el
código de `server/actions|repositories/venta.ts`/`lib/zod/venta.ts`.

## Contexto previo — qué hereda de Sprint 5/7/9, qué es nuevo acá
- **`Paquete`/`BandejaSuelta` con `estado: DISPONIBLE` reales** (Sprint 5/7)
  — Romper Paquete/Bandeja lee sobre el mismo stock que `/pos` vende
  (Sprint 9), lo saca de circulación (pasa a `ROTO`) y no toca
  `PaqueteOrigen`/`BandejaOrigen` (inmutables, fijados al formarse la
  unidad). `listarPaquetesDisponibles()`/`listarBandejasDisponibles()`
  (`server/repositories/venta.ts`, Sprint 9) se reusan tal cual como
  fuente del listado nuevo de `/consolidacion` — mismo dataset que ya usa
  `/pos` para vender, sin ninguna función de repository nueva.
- **`InventarioSueltos`/`MovimientoSueltos` + `reconstruirSaldo()`**
  (Sprint 5/6/7) — el ledger completo de sueltos por galpón/lote. Este
  sprint acredita unidades por un camino nuevo (`ROTURA_PAQUETE_ENTRADA`/
  `ROTURA_BANDEJA_ENTRADA`), pero nunca las descuenta por una venta directa
  — solo por `CONSOLIDACION_SALIDA` (Sprint 7, sin cambios).
- **`calcularConsolidacion()`** (`server/services/consolidacion.ts`, Sprint 7)
  — referencia conceptual directa para `repartirDevolucion()` (ver
  `plan.md`): mismo problema en sentido inverso, con el matiz de que este
  sprint siempre rompe la unidad completa, así que no hay redondeo — cada
  origen recibe exactamente lo que aportó.
- **El wizard "Armar Paquete Mixto"/"Armar Bandeja" (`/consolidacion`,
  Sprint 7)** — es el consumidor real de lo que este sprint acredita al
  ledger. Sin cambios de código este sprint (`calcularConsolidacion()`/
  `consolidarSueltos()` no se tocan) — Romper solo alimenta el mismo saldo
  que esos wizards ya leen.
- **De Sprint 9:** `/pos` (`PosWorkspace`/`PosSelectorItems`/`PosCarrito`/
  `ComprobanteDialog`, `cerrarVenta()`, `cerrarVentaSchema`) **no cambia en
  absoluto este sprint** — ver "Corrección de diseño" arriba.
  `DetalleVenta.tipo: SUELTO` sigue sin ningún código real encima, ahora
  de forma permanente (no "hasta Sprint 10", como asumía el brief
  original).
- **De Sprint 6:** `ajustarInventarioSueltosAction` (GERENTE-only) sigue
  siendo el camino de resolución para el caso límite de `PaqueteOrigen.loteId`/
  `BandejaOrigen.loteId` null.

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md`, `memory/stack-tecnologico.md`,
`memory/arquitectura.md`, `memory/modelo-datos.md`, `memory/convenciones.md`
(en particular "Idempotencia por id de cliente" y el patrón de transacción
interactiva con guard "todo o nada"), `memory/decisiones-tecnicas.md`
(D1–D6), `memory/definition-of-ready.md`, `memory/estado-proyecto.md`
completo, `specs/roadmap-completo.md` (sección Sprint 10, ya corregida),
`specs/sprint-09-pos-carrito-cierre/` completo, `specs/sprint-07-consolidacion-residuos/`
completo (`calcularConsolidacion()`, la página `/consolidacion` y sus dos
wizards). También se releyó el código real de `prisma/schema.prisma`
(`RoturaPaquete`, `RoturaBandeja`, `Paquete`, `PaqueteOrigen`,
`BandejaSuelta`, `BandejaOrigen`, `InventarioSueltos`, `MovimientoSueltos`,
`DetalleVenta`, `Venta`), `src/server/repositories/venta.ts`,
`src/server/actions/venta.ts`, `src/lib/zod/venta.ts` (confirmados de
vuelta al estado exacto de Sprint 9, sin cambios), `src/server/repositories/rotura.ts`,
`src/server/services/rotura.ts`, `src/server/actions/rotura.ts` (sin
cambios respecto al diseño original — UI-agnósticos), `src/app/(app)/consolidacion/page.tsx`.

## Decisiones de negocio confirmadas por el Product Owner
Nueve preguntas explícitas vía `AskUserQuestion` a lo largo de la
planificación y la ejecución (siete del brief original, más dos que
salieron de debatir el flujo ya construido — ver "Corrección de diseño"):

1. **La granja NO vende huevo por unidad — solo Paquete (180u) o Bandeja
   (30u).** Confirmado explícitamente, revierte el supuesto original del
   roadmap. "Venta de sueltos por unidad" queda fuera de alcance de forma
   permanente, no solo de este sprint.
2. **Romper Paquete/Bandeja vive en `/consolidacion`**, junto a los
   wizards "Armar Bandeja"/"Armar Paquete Mixto" — no en `/pos`. Revierte
   la decisión original ("Integrado en el POS").
3. **Reparto proporcional de la devolución: proporcional a los orígenes
   reales de `PaqueteOrigen`/`BandejaOrigen`** (100% trivial si es
   `PURO`/un solo origen). Si algún origen tiene `loteId` null (fila
   creada antes de Sprint 7), ese origen se excluye del reparto
   automático; la cantidad correspondiente queda registrada en
   `RoturaPaquete.unidadesExtraidas - RoturaPaquete.unidadesDevueltas`
   como un remanente explícito, y un Gerente lo acredita a mano después
   con "Ajustar inventario" (`ajustarInventarioSueltosAction`, Sprint 6,
   ya existe) — nunca se pierde en silencio.
4. **Guard anti-doble-rotura: `RoturaPaquete.paqueteId`/`RoturaBandeja.bandejaId`
   `@unique` sirven de ancla natural** — sin id de cliente separado (ver
   convenciones.md, "ya protegido por unicidad de negocio").
5. **También se puede romper una `BandejaSuelta` (30u), no solo un
   `Paquete` (180u).** Expande el alcance original del roadmap/modelo —
   requirió migración de schema (`RoturaBandeja`, `EstadoBandeja.ROTO`,
   `TipoMovimientoSueltos.ROTURA_BANDEJA_ENTRADA`). El caso de negocio que
   lo motivó (romper una Bandeja de 30 para sumarla a sueltos existentes
   y armar un Paquete completo) es precisamente el que confirmó, al
   debatirlo, que Romper debía vivir en `/consolidacion` (decisión 2).
6. **Rol: abierto a GERENTE y OPERARIO por igual**, mismo criterio que el
   resto de Recolección/Consolidación. Ninguna pieza de este sprint entra
   en `RUTAS_POR_ROL`.
7. **Cantidad extraída al romper: siempre se rompe la unidad completa**
   (180u de un Paquete, 30u de una Bandeja) — no hay control manual de
   "cuánto extraer". Coherente con que `RoturaPaquete.paqueteId`/
   `RoturaBandeja.bandejaId` son `@unique` — una unidad se rompe una sola
   vez, para siempre.
8. **`TipoMovimientoSueltos` gana `ROTURA_BANDEJA_ENTRADA`** como valor
   nuevo del enum, en vez de reusar `ROTURA_PAQUETE_ENTRADA` para ambos
   casos — el ledger queda preciso sobre qué unidad física se rompió.
9. **El nombre del sprint/carpeta se mantiene** (`specs/sprint-10-romper-paquete-sueltos/`)
   pese a que "sueltos" ya no implica venta por unidad — "sueltos" sigue
   siendo el nombre correcto del ledger que Romper alimenta (huevos
   sueltos/loose, no "vendidos sueltos").

## Historias de usuario

### H1 — Romper Paquete desde Consolidación, con reparto proporcional exacto (5 pts)
Como Gerente u Operario, cuando el tamaño de un Paquete ya armado no es el
que necesito, quiero romperlo desde `/consolidacion` y que sus 180
unidades se acrediten al ledger de sueltos según de dónde vinieron
realmente.

```gherkin
Dado un Paquete DISPONIBLE tipo PURO (un solo origen: Galpón 1 / Lote A,
  180 unidades) visible en el listado "Paquetes disponibles" de
  /consolidacion
Cuando hago clic en "Romper" sobre ese Paquete, digito el peso leído en la
  báscula, y confirmo
Entonces se crea RoturaPaquete (paqueteId, pesoExtraido, unidadesExtraidas:
  180, unidadesDevueltas: 180), el Paquete pasa de DISPONIBLE a ROTO en la
  misma transacción, se acredita exactamente 180 a InventarioSueltos(Galpón
  1, Lote A) con un MovimientoSueltos ROTURA_PAQUETE_ENTRADA, y el Paquete
  desaparece del listado (y también del selector de /pos, que lee el mismo
  estado DISPONIBLE)

Dado un Paquete DISPONIBLE tipo MIXTO (dos orígenes reales: Galpón 1/Lote A
  aportó 120, Galpón 2/Lote B aportó 60, según PaqueteOrigen)
Cuando lo rompo con el mismo flujo
Entonces se acreditan exactamente 120 a InventarioSueltos(Galpón 1, Lote A)
  y exactamente 60 a InventarioSueltos(Galpón 2, Lote B) — dos
  MovimientoSueltos ROTURA_PAQUETE_ENTRADA distintos, y unidadesDevueltas:
  180 (sin remanente, todos los orígenes tenían loteId)

Dado un Paquete DISPONIBLE cuyo único origen (PaqueteOrigen) tiene loteId
  null (fila creada antes de Sprint 7)
Cuando lo rompo
Entonces RoturaPaquete se crea con unidadesExtraidas: 180,
  unidadesDevueltas: 0, el Paquete pasa a ROTO igual, y la pantalla
  muestra un aviso explícito: "180 unidades sin lote de origen conocido —
  un Gerente debe acreditarlas manualmente desde Ajustar Inventario"

Dado un Paquete ya en estado VENDIDO o ANULADO
Cuando intento romperlo
Entonces se rechaza explícito ("Este paquete ya no está disponible"), sin
  crear ningún RoturaPaquete ni tocar InventarioSueltos
```

### H2 — `repartirDevolucion()` como función pura, con tests exhaustivos (3 pts)
Como equipo queremos que el cálculo de a quién le vuelve cada unidad rota
sea una función pura, 100% testeable sin Prisma, con la suma cerrando
exacta en todos los casos.

```gherkin
Dado un origen único con loteId conocido, cantidad 180, totalExtraido 180
Cuando se llama repartirDevolucion([...], 180)
Entonces devuelve una sola porción con cantidad 180 (trivial 100%),
  unidadesSinLote: 0, unidadesDevueltas: 180

Dado tres orígenes con loteId conocido (60 + 70 + 50 = 180) y totalExtraido
  180
Cuando se llama repartirDevolucion
Entonces devuelve tres porciones, cada una con la cantidad real de su
  origen, y la suma de porciones.cantidad es exactamente 180

Dado dos orígenes que comparten el MISMO galpón/lote (agregación por clave,
  mismo criterio que consolidarSueltos)
Cuando se llama repartirDevolucion
Entonces devuelve UNA sola porción para esa clave, con la cantidad sumada
  de ambas filas de origen

Dado un origen con loteId null entre varios con loteId conocido
Cuando se llama repartirDevolucion
Entonces ese origen queda excluido de porciones, su cantidad se suma a
  unidadesSinLote, y unidadesDevueltas = totalExtraido - unidadesSinLote

Dado que la suma de cantidades de los orígenes no coincide con
  totalExtraido (invariante violada — nunca debería pasar en producción)
Cuando se llama repartirDevolucion
Entonces lanza un error explícito en vez de devolver un resultado
  silenciosamente incorrecto
```

### H3 — Guard anti-doble-rotura bajo carrera real (3 pts)
Como equipo queremos que dos personas no puedan romper el mismo Paquete o
la misma Bandeja a la vez, aunque hagan clic en "Romper" casi
simultáneamente desde `/consolidacion`.

```gherkin
Dado un Paquete DISPONIBLE
Cuando dos roturas de ese mismo Paquete se ejecutan concurrentemente
  (forzado en un script de verificación, no solo simulado)
Entonces exactamente una tiene éxito (el Paquete pasa a ROTO una sola vez,
  con un único RoturaPaquete creado, y el ledger acreditado una sola vez),
  y la otra recibe un error explícito ("ya fue roto"), sin ningún estado
  intermedio inconsistente

Dado el mismo caso, pero las dos roturas digitaron un pesoExtraido distinto
Cuando la segunda rotura falla
Entonces el mensaje distingue explícitamente que fue una carrera real
  ("ya fue roto por otro operario, o hace un instante") de un reintento
  idempotente propio (mismo peso) — no confunde ambos casos con el mismo
  texto genérico

Dado el mismo Paquete, ya roto
Cuando se reintenta romperlo con EXACTAMENTE el mismo pesoExtraido (doble
  clic, reintento de red)
Entonces la action responde éxito idempotente con la rotura ya existente,
  sin duplicar ningún RoturaPaquete ni volver a tocar InventarioSueltos
```

### H4 — Romper Bandeja, mismo mecanismo que Romper Paquete, y su combinación con Consolidación (3 pts)
Como Gerente u Operario quiero poder romper también una Bandeja disponible
(30u), en la misma pantalla donde después puedo rearmarla en el tamaño que
necesito.

```gherkin
Dado una BandejaSuelta DISPONIBLE con dos orígenes reales (BandejaOrigen:
  Galpón 1/Lote A aportó 18, Galpón 2/Lote B aportó 12)
Cuando la rompo desde /consolidacion
Entonces se crea RoturaBandeja (bandejaId, pesoExtraido,
  unidadesExtraidas: 30, unidadesDevueltas: 30), la Bandeja pasa de
  DISPONIBLE a ROTO, y se acreditan 18 y 12 a sus respectivos
  InventarioSueltos con MovimientoSueltos ROTURA_BANDEJA_ENTRADA

Dado que después de romper esa Bandeja hay 150 sueltos ya existentes en
  Galpón 1/Lote A (sin relación con la rotura) más los recién acreditados
Cuando armo un Paquete Mixto nuevo con "Armar Paquete Mixto" (Sprint 7,
  misma pantalla, sin cambios este sprint)
Entonces el wizard ve el saldo actualizado y puede formar el Paquete —
  todo en /consolidacion, sin salir a /pos en ningún momento de este flujo
```

### H5 — Rol abierto a ambos, sin restricción nueva (1 pt)
Como equipo queremos que "Romper Paquete"/"Romper Bandeja" sigan el mismo
criterio de acceso que el resto de Consolidación.

```gherkin
Dado un usuario con rol OPERARIO autenticado
Cuando accede a /consolidacion y rompe un Paquete y una Bandeja
Entonces ambas acciones se ejecutan sin ningún rechazo de rol — ninguna
  entra en RUTAS_POR_ROL
```

## Alcance de este sprint
- Migración de schema: `RoturaBandeja` (nuevo modelo), `EstadoBandeja` gana
  `ROTO`, `TipoMovimientoSueltos` gana `ROTURA_BANDEJA_ENTRADA`,
  `BandejaSuelta` gana el campo inverso `rotura RoturaBandeja?`.
- `server/services/rotura.ts` (nuevo): `repartirDevolucion()`, función pura.
- `server/services/inventario.ts` (modifica): `reconstruirSaldo()` clasifica
  `ROTURA_BANDEJA_ENTRADA` como `ENTRADA`.
- `lib/zod/rotura.ts` (nuevo): `romperPaqueteSchema`, `romperBandejaSchema`.
- `server/repositories/rotura.ts` (nuevo): `romperPaquete`, `romperBandeja`
  (transacciones interactivas), lecturas de apoyo.
- `server/actions/rotura.ts` (nuevo): `romperPaqueteAction`,
  `romperBandejaAction` — sin `rol`, abiertas a ambos.
- UI, en `/consolidacion` (no en `/pos`):
  `components/domain/consolidacion/romper-paquete-dialog.tsx`,
  `romper-bandeja-dialog.tsx`, `romper-inventario-section.tsx` (nuevos).
  `app/(app)/consolidacion/page.tsx` (modifica): agrega
  `listarPaquetesDisponibles()`/`listarBandejasDisponibles()` (reusadas de
  `server/repositories/venta.ts`, Sprint 9, sin cambios) y el listado
  nuevo con acción "Romper".
- **`lib/zod/venta.ts`, `server/repositories/venta.ts`,
  `server/actions/venta.ts`, y todo `/pos` (`PosWorkspace`,
  `PosSelectorItems`, `PosCarrito`, `ComprobanteDialog`,
  `lib/pdf/comprobante.ts`) quedan SIN CAMBIOS este sprint** — se
  intentó extender para vender sueltos (S10-9/S10-11/S10-12) y se revirtió
  por completo (ver "Corrección de diseño").
- Tests unitarios de `server/services/rotura.ts` (cobertura 100%) y de los
  Zod schemas nuevos, tests de integración de las Server Actions nuevas,
  verificación de la carrera concurrente real (H3) contra Neon, y
  verificación clic a clic en navegador.

## Fuera de alcance
- **Venta de sueltos por unidad, de forma permanente.** No es una
  historia real de este negocio (decisión de negocio 1) — `DetalleVenta.tipo:
  SUELTO`/`TipoMovimientoSueltos.VENTA_SUELTO` quedan sin código para
  siempre, no solo "hasta que otro sprint lo resuelva".
- **Todo lo de Sprint 11 en adelante** — Créditos, Egresos, PWA, cola
  offline real.
- **Deshacer una rotura.** Ni `RoturaPaquete` ni `RoturaBandeja` tienen
  ventana de gracia ni botón "Deshacer" este sprint.
- **Romper parcialmente una unidad.** Siempre se rompe completa —
  `@unique` en `paqueteId`/`bandejaId` lo impide a nivel de base.
- **Un flujo combinado "romper y armar" en una sola transacción.** Son dos
  acciones independientes en la misma pantalla (`/consolidacion`), no una
  transacción nueva que las una.
- **Reasignación automática del remanente sin lote conocido.** Resolución
  manual vía "Ajustar inventario".
- **`DELETE` físico de `RoturaPaquete`/`RoturaBandeja`.** Nunca.
- **Cola offline real.** Sigue siendo Sprint 14.

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Romper un Paquete/Bandeja real es irreversible este sprint — probar la
carrera concurrente y el resto de la verificación con ítems de prueba
nombrados a propósito, nunca contra inventario real de la granja.

### R2 — Migración de schema no anticipada en el brief original
`RoturaBandeja`/`EstadoBandeja.ROTO`/`TipoMovimientoSueltos.ROTURA_BANDEJA_ENTRADA`
— aplicada contra Neon real en S10-1, confirmada con `npx prisma validate`.

### R3 — Remanente sin lote conocido: gap real, no solo teórico
`PaqueteOrigen.loteId`/`BandejaOrigen.loteId` son nullable desde Sprint 7
para filas creadas ANTES de esa migración. La verificación en vivo debe
incluir explícitamente este caso, no solo el camino feliz.

### R4 — Sin reversión para Romper Paquete/Bandeja
Si el Product Owner lo pide en producción, es una historia nueva con su
propia ventana de gracia.

### R5 — El guard "todo o nada" no identifica cada recurso que falló individualmente
Mismo patrón que R5 de `specs/sprint-09-pos-carrito-cierre/spec.md` —
`romperPaquete`/`romperBandeja` hacen un pre-chequeo de existencia/estado
antes de entrar a la transacción para dar un mensaje razonable, y
distinguen explícitamente "reintento idempotente" de "carrera real" al
capturar `P2002` (ver H3).

### R6 — `AuditLog` no atómico con la mutación (heredado)
Mismo trade-off aceptado desde Sprint 2.

### R7 — Trabajo revertido: costo real de la corrección de diseño
S10-9 (extensión de `cerrarVenta` para sueltos), S10-10 (Romper dentro de
`/pos`), S10-11 (`ItemSueltoDialog`, extensión de `PosCarrito`/
`PosWorkspace`) y S10-12 (`/pos/page.tsx` con `saldosSueltos`) se
implementaron, verificaron en verde (`typecheck`/`lint`/`test`/`build`), y
se revirtieron por completo al corregir el alcance. No fue tiempo perdido
en el sentido de "código descartable sin aprendizaje" — confirmó en la
práctica que la arquitectura en capas (services/repositories/actions
UI-agnósticos) permite mover una feature completa de pantalla sin tocar
`server/services/rotura.ts`, `server/repositories/rotura.ts` ni
`server/actions/rotura.ts` — pero si el Product Owner hubiera podido ver
un mockup o una descripción más concreta de "romper en vivo durante una
venta" antes de la implementación, esta vuelta se habría evitado. Vale la
pena tenerlo presente para sprints futuros con ambigüedad similar de
"¿dónde vive esta acción en la UI?".

## Criterio de aceptación general
Dado el repo con Sprint 9 ya desplegado
Cuando un Gerente u Operario rompe un Paquete o una Bandeja `DISPONIBLE`
  desde `/consolidacion`
Entonces sus unidades se acreditan proporcionalmente al ledger de sueltos
  según `PaqueteOrigen`/`BandejaOrigen` reales, con cualquier remanente sin
  lote conocido señalado explícitamente para ajuste manual, y quedan
  disponibles para los wizards "Armar Bandeja"/"Armar Paquete Mixto"
  (Sprint 7) en la misma pantalla
Y cuando dos personas compiten por romper la misma unidad casi al mismo
  tiempo, verificado con una carrera concurrente real forzada contra Neon
Entonces exactamente una tiene éxito y la otra recibe un error explícito,
  sin ningún estado a medias
Y `/pos` sigue funcionando exactamente igual que al cerrar Sprint 9, sin
  ningún cambio de comportamiento
