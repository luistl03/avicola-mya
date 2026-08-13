# Sprint 7 — Consolidación de residuos

## Sprint Goal
Los huevos sueltos que se acumulan galpón por galpón, lote por lote, dejan de
quedar varados como saldo suelto en `InventarioSueltos` — un Gerente u
Operario puede verlos en una pantalla de saldos y convertirlos en `Paquete`
tipo MIXTO (180u) o `BandejaSuelta` (30u), tomando de varios orígenes a la
vez, sin dejar el inventario descuadrado ni permitir que un origen se
sobregire.

## Contexto previo — qué ya existe de Sprint 5/6, qué es nuevo acá
Este sprint **no parte de cero**: Sprint 5 (Recolección e Inventario) y
Sprint 6 (Ventana de gracia y reversión) dejaron construidas varias piezas
que este sprint reusa tal cual, no reconstruye:

- **`reconstruirSaldo()`** (`server/services/inventario.ts`) ya clasifica los
  6 valores de `TipoMovimientoSueltos` de forma exhaustiva, vía un
  `Record<TipoMovimientoSueltos, "ENTRADA" | "SALIDA" | "AJUSTE">` (resuelto
  en Sprint 6, ver `S6-14`). `CONSOLIDACION_SALIDA` **ya está clasificado
  como salida** en ese `Record` — este sprint solo tiene que empezar a
  **generar** `MovimientoSueltos` de ese tipo, no tocar la clasificación.
- **`InventarioSueltos`** (`@@unique([galponId, loteId])`,
  `CHECK (cantidad >= 0)` a nivel de base, S0-5) y el patrón de guard atómico
  `UPDATE ... WHERE cantidad >= X` ya están probados dos veces (Mortalidad
  `avesVivas`, Recolección `revertirRecoleccion`/`ajustarInventarioSueltos`)
  — el "Guard anti-sobregiro" que pide el roadmap es el mismo patrón,
  extendido a **varios orígenes a la vez dentro de una misma transacción**,
  no uno nuevo.
- **El guard "todo o nada" sobre un CONJUNTO de filas**
  (`server/repositories/recoleccion.ts`, `revertirRecoleccion` — `count` +
  `updateMany` + comparación de conteo, Sprint 6) es el precedente directo
  para consolidar desde múltiples orígenes: si un origen no alcanza, la
  operación completa aborta, no deja una consolidación parcial.
- **El patrón de idempotencia por id de cliente** (`create` + captura de
  `P2002`, `server/repositories/recoleccion.ts`/`inventario.ts`) es el
  precedente a reusar para los dos wizards — ambos crean entidades nuevas
  desde formularios de campo, cae de lleno en la regla de
  `memory/convenciones.md` ("Idempotencia por id de cliente: obligatoria en
  TODA creación").
- **`Paquete.tipo`** (enum `TipoPaquete`: `PURO`/`MIXTO`) y `PaqueteOrigen`
  existen desde Sprint 0 — Sprint 5 solo usó `PURO` con un único origen
  (el galpón de la recolección). Este sprint es el primero que produce
  `Paquete` tipo `MIXTO` con más de un `PaqueteOrigen`.
- **`BandejaSuelta`/`BandejaOrigen`** existen desde Sprint 0, **sin usar
  todavía por ningún código real** — este sprint es el primero que crea una
  fila de `BandejaSuelta`.

**Lo que este sprint SÍ construye** (alcance real):
1. Una pantalla de saldos de `InventarioSueltos` por galpón/lote — no
   existía ninguna vista, `reconstruirSaldo()` solo tenía tests desde
   Sprint 5.
2. Wizard **"Paquete Mixto"**: el operario elige uno o más orígenes
   (galpón+lote con saldo); el sistema calcula el techo de `Paquete` de
   180u que el total combinado permite, y el operario decide cuántos arma
   de verdad (mínimo 1 por defecto, incremental o todos de una vez —
   corrección real post-diseño, ver "Decisiones de negocio confirmadas").
3. Wizard **"Armar Bandeja"**: mismo mecanismo, unidad de destino 30u,
   produce `BandejaSuelta`.
4. Guard anti-sobregiro atómico sobre N filas de `InventarioSueltos` a la
   vez (una por cada origen distinto usado en la corrida).
5. Un modelo nuevo de schema (`RegistroConsolidacion`) que ancla cada
   corrida del wizard — ver "Hallazgo real" más abajo, es lo que permite que
   la idempotencia por id de cliente funcione igual que en Recolección
   aunque una corrida cree N entidades de destino, no una sola.

## Hallazgo real durante esta planificación: sí hace falta migración de schema
El roadmap y el brief de esta planificación daban por sentado que "todos los
modelos/enums necesarios ya existen" para este sprint. **Verificado
releyendo `prisma/schema.prisma` (no asumido) — es parcialmente falso**, dos
hallazgos reales:

### 1 — `PaqueteOrigen`/`BandejaOrigen` no tienen `loteId`
```prisma
model PaqueteOrigen {
  id        String @id @default(uuid())
  paqueteId String
  galponId  String
  cantidad  Int
  // loteId NO existe todavía
  ...
}
```
Mismo caso en `BandejaOrigen`. Pero `InventarioSueltos` (de donde salen los
sueltos a consolidar) vive por la combinación `(galponId, loteId)` — un
galpón puede alojar más de un lote a la vez (permitido desde Sprint 3), así
que el wizard necesita saber de qué **lote** descontar cada porción, no solo
de qué galpón.

**Resuelto con el Product Owner:** se agrega `loteId` a ambos modelos
(migración nueva, no destructiva — ver `plan.md`). El wizard pide galpón+lote
por cada origen (para descontar el `InventarioSueltos` correcto) y ahora
también **guarda ese detalle** en `PaqueteOrigen`/`BandejaOrigen`, en vez de
perderlo al consolidar.

### 2 — No hay ninguna entidad que pueda anclar la idempotencia de una corrida que crea N entidades
El Contrato Offline-Ready y la regla de idempotencia por id de cliente
(`memory/convenciones.md`) dependen de que exista **un** `create` con `id`
explícito que, si se reintenta, colisiona con `P2002` y aborta toda la
transacción — así funciona `registrarRecoleccion` (Sprint 5): un
`RegistroRecoleccion` padre, con N `Paquete` hijos creados dentro de la misma
transacción.

Una corrida del wizard de Consolidación también crea **N entidades nuevas**
(N `Paquete` MIXTO o N `BandejaSuelta`, ver H2/H3 más abajo — "automático,
arma todas las posibles"), pero no hay ningún `Paquete`/`BandejaSuelta`
individual que pueda ser ese ancla: cualquiera de ellos podría colisionar por
separado, y comparar N filas contra un reintento es mucho más frágil que
comparar una sola.

**Resuelto en esta planificación (decisión técnica, no de negocio — ver
"Decisiones de diseño adicionales" más abajo):** se agrega un modelo nuevo,
`RegistroConsolidacion`, que juega exactamente el mismo rol que
`RegistroRecoleccion` — un padre con `id` generado en el cliente, creado
primero dentro de la transacción; si colisiona, nada más se ejecuta.

**Ambos hallazgos implican una migración de schema para este sprint** — a
diferencia de lo que el brief inicial asumía. Detalle completo del schema
nuevo en `plan.md`.

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md`, `memory/stack-tecnologico.md`,
`memory/arquitectura.md`, `memory/modelo-datos.md`,
`memory/convenciones.md` (en particular "Contrato Offline-Ready" e
"Idempotencia por id de cliente: obligatoria en TODA creación"),
`memory/decisiones-tecnicas.md` (D1–D6, en particular D1: peso siempre
digitado a mano), `memory/definition-of-ready.md`,
`memory/estado-proyecto.md` completo (incluida la sección "Sprint 6 —
Ventana de gracia y reversión" y "Cómo continuar desde acá"),
`specs/roadmap-completo.md` (sección Sprint 7), y
`specs/sprint-06-ventana-gracia-reversion/` completo (spec.md, plan.md,
tasks.md — plantilla de estructura y nivel de detalle de este documento, el
sprint más reciente ejecutado). También se releyó el código real de
`server/services/inventario.ts`, `server/services/recoleccion.ts`,
`server/repositories/recoleccion.ts`, `server/repositories/inventario.ts`,
`server/actions/recoleccion.ts`, `server/actions/inventario.ts`, y
`components/domain/recoleccion/registrar-recoleccion-dialog.tsx` (el
precedente real de un formulario con arreglo de longitud variable +
recalculo server-side que no confía en el cliente).

## Decisiones de negocio confirmadas por el Product Owner antes de esta planificación
Cuatro preguntas que el roadmap no resolvía (mismo criterio de
`definition-of-ready.md` ya usado en Sprints 3-6):

1. **Alcance de cada corrida del wizard: automático — con control manual
   agregado tras probar en vivo (ver corrección más abajo).** El operario
   selecciona uno o más orígenes (galpón+lote con saldo), y el sistema
   calcula automáticamente **todas las unidades completas que el total
   combinado permitiría** — más parecido a `calcularEmpaque()` de
   Recolección (que ya calcula todos los paquetes posibles de una vez) que
   a un flujo de "armá una y repetí". El sobrante que no completa una
   unidad más queda en `InventarioSueltos`, sin tocar.

   **Corrección real post-diseño, probando en vivo (S7-15, decisión
   confirmada por el Product Owner):** el diseño original de este punto
   (y de H2/H3 más abajo) hacía que el wizard **aplicara solo** ese
   cálculo automático — al seleccionar los orígenes, aparecían de una vez
   todos los campos de peso de todas las unidades que el saldo permitía,
   sin que el operario pudiera elegir formar menos. El Product Owner
   probó ese flujo y pidió cambiarlo: lo que `calcularConsolidacion()`
   calcula es un **techo** (cuántas unidades completas caben con el saldo
   seleccionado), no una orden. El wizard ahora muestra **como mínimo 1**
   campo de peso apenas hay saldo para al menos una unidad, y el operario
   decide cuántas de esas unidades arma de verdad con tres controles:
   "+ Agregar {paquete/bandeja}" (suma una unidad a la vez), "Agregar
   todas (N)" (salta directo al techo, equivalente al comportamiento
   automático original) y "Quitar" (resta la última agregada, hasta
   volver a 0 si el operario se pasó de clics). La Server Action ya no
   exige que la cantidad de pesos coincida exactamente con el techo —
   solo rechaza si se pide **más** del techo (saldo desactualizado o
   payload manipulado); pedir menos es un caso válido, es justamente el
   punto del cambio. Ver `plan.md` para el detalle técnico completo
   (`server/actions/consolidacion.ts` y
   `components/domain/consolidacion/consolidar-sueltos-dialog.tsx`).
2. **`loteId` en `PaqueteOrigen`/`BandejaOrigen`: se agrega (migración
   nueva).** Trazabilidad completa — un `Paquete` MIXTO o `BandejaSuelta`
   guarda de qué galpón **y** de qué lote salió cada porción, no solo el
   galpón. Ver "Hallazgo real" arriba.
3. **Rol: pantalla de saldos y ambos wizards abiertos a GERENTE y OPERARIO
   por igual.** Mismo criterio que Recolección/Mortalidad — es trabajo
   operativo de campo (convertir residuos en unidades vendibles), no una
   herramienta de corrección de inventario como el ajuste manual del
   Gerente (Sprint 6), que sí queda restringido. Ninguna pieza de este
   sprint entra en `RUTAS_POR_ROL`.
4. **Un mismo origen puede aportar a más de una unidad de destino en la
   misma corrida.** Ya es la consecuencia directa de la decisión 1
   (automático): si un solo galpón/lote tiene 500 sueltos, sus 500 se
   reparten solos entre 2 `Paquete` completos (360) + 140 sueltos restantes,
   sin que el operario tenga que repetir el wizard. También puede volver a
   usarse como origen en una corrida posterior si le queda saldo.

## Decisiones de diseño adicionales tomadas en esta planificación
Corolarios técnicos, documentados para que el Product Owner pueda objetarlos
antes de ejecutar (mismo criterio que Sprints 3-6):

- **`RegistroConsolidacion` es la pieza de arquitectura nueva de este
  sprint** (ver "Hallazgo real" #2). Un solo modelo sirve para los dos
  wizards, distinguido por `tipo: TipoConsolidacion` (`PAQUETE_MIXTO` |
  `BANDEJA`) — no dos modelos separados, porque el rol que cumple (ancla de
  idempotencia + fila de auditoría del evento) es idéntico en ambos casos,
  solo cambia qué relación (`paquetes` o `bandejas`) queda poblada.
- **Algoritmo de reparto determinista, no proporcional.** Dado un arreglo
  ordenado de orígenes seleccionados (el orden en que el operario los
  marcó), `calcularConsolidacion()` llena una unidad de destino a la vez,
  agotando cada origen antes de pasar al siguiente (relleno tipo
  "bin-packing" secuencial) — no reparte cada unidad proporcionalmente
  entre todos los orígenes seleccionados. Es más simple de razonar, más
  fácil de auditar ("¿de dónde salió este paquete? — de estos dos orígenes,
  en este orden"), y es determinista dado el mismo input (requisito para que
  sea 100% testeable como función pura). Ver el pseudocódigo completo en
  `plan.md`.
- **El guard anti-sobregiro es todo o nada sobre TODOS los orígenes de la
  corrida, agregados por origen distinto — mismo criterio que
  `revertirRecoleccion` (H2 de Sprint 6), extendido de `Paquete` a filas de
  `InventarioSueltos`.** Si el saldo real de CUALQUIER origen (releído
  fresco dentro de la misma transacción interactiva, nunca confiando en una
  lectura previa) no alcanza para lo que el plan necesita de él, la
  consolidación completa aborta: no se crea ningún `Paquete`/`BandejaSuelta`,
  no se descuenta ningún `InventarioSueltos`, no se genera ningún
  `MovimientoSueltos`, ni siquiera se confirma el `RegistroConsolidacion`
  (Prisma revierte todo). Si un mismo origen aporta a varias unidades de la
  corrida (decisión 4), su guard se evalúa **una sola vez, agregado**, no una
  vez por unidad — evita hacer N `UPDATE` innecesarios sobre la misma fila.
- **`Paquete.tipo` es siempre `MIXTO` para todo lo que produce este wizard**,
  incluso en el caso límite de que termine usando un solo origen (por
  ejemplo, si el operario seleccionó dos orígenes pero uno se agotó
  completo en la primera unidad y no llegó a aportar a la segunda) — la
  distinción `PURO`/`MIXTO` es de **procedencia** (nace de una Recolección
  directa vs. nace de consolidar residuos), no un conteo de orígenes reales
  usados.
- **`BandejaSuelta.peso` obligatorio, igual que `Paquete.peso`.** El campo ya
  es `Decimal(6,3)` no nulo desde Sprint 0 — no hay margen de schema para
  que sea opcional. El wizard "Armar Bandeja" exige digitar el peso en la
  balanza (D1) para cada bandeja formada, exactamente igual que "Paquete
  Mixto" ya lo exige para cada paquete — sin integración de hardware, sin
  excepción.
- **Los dos wizards comparten un único componente de diálogo
  parametrizado** (`tipo`, `unidadDestino`, copy), no dos componentes
  clonados — a diferencia de `RevertirRecoleccionBoton` (clon deliberado de
  `RevertirMortalidadBoton` en Sprint 6, porque esos dos módulos tienen
  formas de registro genuinamente distintas). Acá la única diferencia real
  entre "Paquete Mixto" y "Armar Bandeja" es una constante (180 vs. 30) y el
  texto — mismo criterio que ya evalúa este proyecto caso por caso, no una
  regla fija de "siempre clonar" ni "siempre generalizar".
- **Sin componente `Checkbox` nuevo.** La selección de orígenes en el wizard
  usa filas clicables con estado `aria-pressed` + estilo de borde/fondo
  (mismo espíritu que un `<Select>` controlado ya usa en el resto del
  proyecto), no un primitivo `Checkbox` de shadcn/ui nuevo — evita agregar
  infraestructura de UI para un único caso de uso en todo el proyecto.
- **La Server Action nunca confía en el saldo que mandó el cliente.**
  Mismo criterio que `registrarRecoleccion` recalculando `calcularEmpaque`
  server-side: el cliente muda de idea sobre qué orígenes usar en base a un
  saldo leído al abrir el wizard, pero la acción vuelve a leer
  `InventarioSueltos` fresco antes de correr `calcularConsolidacion()` de
  verdad, y rechaza si `pesos.length` no coincide con las unidades que el
  cálculo server-side determina — igual que el chequeo real de
  `registrarRecoleccion` contra `calcularEmpaque(cantidadTotal)`.

## Historias de usuario

### H1 — Pantalla de saldos de sueltos por galpón/lote (3 pts)
Como Gerente u Operario quiero ver de un vistazo cuántos huevos sueltos hay
acumulados en cada galpón/lote, para saber si conviene armar un Paquete
Mixto o una Bandeja.

```gherkin
Dado que existen 3 filas de InventarioSueltos con saldo > 0 (dos galpones,
  tres lotes distintos) y 1 fila con saldo = 0
Cuando entro a "/consolidacion"
Entonces veo una tabla con galpón, lote y cantidad de sueltos, para las 4
  combinaciones (incluida la de saldo 0 — no se ocultan filas, es
  información real del sistema)

Dado que no existe ninguna fila de InventarioSueltos todavía (granja recién
  sembrada, ninguna recolección con sueltos registrada)
Cuando entro a "/consolidacion"
Entonces veo un estado vacío explícito ("Todavía no hay sueltos
  registrados"), no una tabla en blanco sin contexto

Dado que soy un Operario autenticado
Cuando entro a "/consolidacion"
Entonces veo la misma pantalla que un Gerente (sin restricción de rol,
  decisión de negocio confirmada)
```

### H2 — Wizard "Paquete Mixto": selección de orígenes y control manual de cuántas unidades armar (5 pts)
Como Operario quiero elegir uno o más orígenes con saldo suelto, ver cuántos
Paquetes de 180 podría formar como máximo, y decidir yo cuántos armo
realmente en esta corrida — no que el sistema los arme todos solo.

**Reescrita tras la corrección real de S7-15** (ver "Decisiones de negocio
confirmadas" arriba): el diseño original de esta historia hacía que
seleccionar los orígenes ya mostrara TODOS los campos de peso del techo de
una vez, sin control manual — el Gherkin de abajo refleja el
comportamiento final, corregido.

```gherkin
Dado que abro el wizard "Armar Paquete Mixto" con saldos de
  Galpón A/Lote 1 = 120 y Galpón B/Lote 2 = 90 disponibles
Cuando selecciono ambos orígenes
Entonces la vista previa muestra "Vas a armar 1 paquete de 180 (podés armar
  hasta 1 con lo seleccionado) — quedan 30 sueltos sin consolidar" (120 + 90
  = 210 → techo de 1 paquete completo + 30 sobrante), aparece exactamente 1
  campo de peso, y los botones "+ Agregar paquete"/"Agregar todas (1)"
  quedan deshabilitados (ya estoy en el techo)

Dado el mismo wizard, con Galpón A/Lote 1 = 400 disponibles como único
  origen seleccionado
Cuando reviso la vista previa apenas selecciono el origen
Entonces muestra "Vas a armar 1 paquete de 180 (podés armar hasta 2 con lo
  seleccionado)" — solo 1 campo de peso visible, aunque el techo (400 = 180
  + 180 + 40) permitiría 2

Dado el escenario anterior (techo de 2, 1 elegido)
Cuando hago clic en "+ Agregar paquete"
Entonces aparece un segundo campo de peso, el texto pasa a "Vas a armar 2
  paquetes de 180", y "+ Agregar paquete"/"Agregar todas" quedan
  deshabilitados (llegué al techo)

Dado el escenario anterior (2 de 2 elegidos, con ambos pesos ya digitados)
Cuando hago clic en "Quitar"
Entonces vuelve a 1 campo de peso (el segundo se descarta), el texto pasa a
  "Vas a armar 1 paquete de 180", y el botón "Guardar" sigue habilitado (1
  campo con peso válido alcanza para guardar)

Dado un wizard recién abierto, sin ningún origen seleccionado todavía
Cuando selecciono un origen con saldo suficiente para al menos 1 unidad
Entonces aparece automáticamente 1 campo de peso (mínimo por defecto) — el
  operario no arranca en 0 teniendo que hacer clic en "+ Agregar" a mano
  para la primera unidad

Dado que los orígenes seleccionados suman menos de 180 en total
Cuando reviso la vista previa
Entonces muestra "No hay saldo suficiente para formar un paquete completo
  (mínimo 180)", sin botones +/Agregar todas/Quitar, y el botón "Guardar"
  queda deshabilitado

Dado que ya elegí orígenes y tengo N paquetes elegidos en la vista previa
Cuando cambio la selección de orígenes y el techo baja por debajo de N
Entonces la cantidad elegida se recorta automáticamente al nuevo techo
  (nunca queda pidiendo más de lo que el saldo seleccionado permite)
```

### H3 — Wizard "Paquete Mixto": consolidación transaccional completa (8 pts)
Como equipo queremos que confirmar el wizard cree exactamente los Paquete
MIXTO calculados, con su PaqueteOrigen detallado por galpón y lote,
descuente el InventarioSueltos real de cada origen, y deje el ledger
auditable — todo en una sola transacción, sin dejar nada a medias.

```gherkin
Dado el caso feliz de H2 (Galpón A/Lote 1 = 120, Galpón B/Lote 2 = 90 → 1
  paquete de 180, 30 sueltos restantes)
Cuando confirmo el wizard con un peso válido para el paquete
Entonces se crea 1 RegistroConsolidacion (tipo PAQUETE_MIXTO), 1 Paquete
  (tipo MIXTO, DISPONIBLE) con 2 PaqueteOrigen (Galpón A/Lote 1: 120,
  Galpón B/Lote 2: 90 — cada uno con su loteId propio), InventarioSueltos
  de Galpón A/Lote 1 queda en 0 y el de Galpón B/Lote 2 queda en 0, se crean
  2 MovimientoSueltos CONSOLIDACION_SALIDA (uno por origen, con la cantidad
  real tomada de cada uno) referenciando el RegistroConsolidacion

Dado un origen que aporta a DOS paquetes distintos en la misma corrida (400
  disponibles → 2 paquetes de 180 + 40 sueltos, todo del mismo Galpón/Lote)
Cuando confirmo el wizard con los 2 pesos
Entonces se crean 2 Paquete (cada uno con 1 PaqueteOrigen propio, 180 cada
  uno), pero se crea un SOLO MovimientoSueltos CONSOLIDACION_SALIDA de 360
  (el guard/ledger agrega por origen distinto, no por unidad de destino),
  InventarioSueltos de ese galpón/lote queda en 40 (400 − 360)

Dado el saldo real de un origen bajó entre que el operario abrió el wizard y
  confirmó (otra recolección posterior del mismo lote lo modificó, o una
  consolidación distinta ya lo consumió), de forma que el nuevo techo real
  es MENOR que la cantidad de pesos que el operario ya había elegido armar
Cuando confirmo el wizard con esos pesos
Entonces la Server Action relee el saldo fresco antes de ejecutar, recalcula
  calcularConsolidacion() con el dato real, y como se está pidiendo MÁS
  unidades que el nuevo techo, rechaza con un mensaje explícito ("Los
  saldos cambiaron — el máximo disponible ahora es N, se recibieron M
  pesos. Actualizá la pantalla e intentá de nuevo") sin tocar la base —
  pedir MENOS que el techo, en cambio, nunca se rechaza por esta guard (es
  el caso normal desde la corrección de S7-15, ver H2)

Dado reconstruirSaldo() sobre el historial completo de MovimientoSueltos de
  un galpón/lote que participó en una consolidación
Cuando se ejecuta
Entonces reproduce exactamente el InventarioSueltos.cantidad resultante
  (incluye el CONSOLIDACION_SALIDA nuevo, ya clasificado como salida desde
  Sprint 6)
```

### H4 — Wizard "Armar Bandeja" (5 pts)
Como Operario quiero el mismo flujo que Paquete Mixto pero para armar
Bandejas de 30, para no perder residuos que nunca llegan a completar un
paquete de 180.

```gherkin
Dado que abro el wizard "Armar Bandeja" con Galpón C/Lote 3 = 75 disponibles
Cuando selecciono ese origen
Entonces la vista previa muestra "Vas a armar 1 bandeja de 30 (podés armar
  hasta 2 con lo seleccionado) — quedan 45 sueltos sin consolidar" (75 = 30
  + 30 + 15, techo de 2), con 1 campo de peso visible — mismo criterio de
  "mínimo 1 por defecto" que Paquete Mixto (H2)

Dado el escenario anterior
Cuando hago clic en "Agregar todas (2)"
Entonces aparece un segundo campo de peso, el texto pasa a "Vas a armar 2
  bandejas de 30 — quedan 15 sueltos sin consolidar", y "+ Agregar
  bandeja"/"Agregar todas" quedan deshabilitados (llegué al techo)

Dado el caso de arriba (2 de 2 elegidas)
Cuando confirmo el wizard con los 2 pesos
Entonces se crea 1 RegistroConsolidacion (tipo BANDEJA), 2 BandejaSuelta
  (DISPONIBLE, con su BandejaOrigen propio con loteId), InventarioSueltos de
  Galpón C/Lote 3 queda en 15, y se crea 1 MovimientoSueltos
  CONSOLIDACION_SALIDA de 60

Dado que intento confirmar el wizard "Armar Bandeja" sin digitar el peso de
  alguna de las bandejas elegidas
Cuando envío el formulario
Entonces el botón "Guardar" está deshabilitado — no se guarda con pesos
  pendientes, mismo criterio que Recolección desde Sprint 5
```

### H5 — Guard anti-sobregiro bajo carrera real + idempotencia (3 pts)
Como equipo queremos evidencia real (no solo teórica) de que dos
consolidaciones que compiten por el mismo origen no pueden dejar
InventarioSueltos negativo, y de que un reintento de red no duplica una
corrida ya exitosa.

```gherkin
Dado un InventarioSueltos con cantidad=200 en un galpón/lote
Cuando se disparan casi simultáneamente dos wizards de Paquete Mixto que
  seleccionan ese mismo origen, cada uno esperando formar 1 paquete de 180
  (Promise.all, contra el pooler real de Neon, no mocks)
Entonces exactamente una consolidación tiene éxito (InventarioSueltos queda
  en 20, 1 Paquete creado, 1 MovimientoSueltos CONSOLIDACION_SALIDA) y la
  otra rechaza con "El saldo ya no alcanza para esta consolidación" — nunca
  queda en negativo, nunca se crean 2 Paquete de un saldo que solo alcanzaba
  para 1

Dado un wizard confirmado con éxito (id de RegistroConsolidacion X ya
  persistido)
Cuando se reenvía el mismo payload exacto (mismo id, mismos orígenes, mismos
  pesos) — doble clic o reintento de red
Entonces la acción responde éxito idempotente con los datos ya creados, sin
  duplicar ningún Paquete/BandejaSuelta ni volver a descontar
  InventarioSueltos

Dado el mismo id de RegistroConsolidacion, pero un reintento con pesos
  distintos a los originales
Cuando se envía
Entonces se rechaza explícito ("Ya existe una consolidación con este id pero
  con datos diferentes — no se sobrescribe"), sin tocar lo ya persistido
```

## Alcance de este sprint
- Migración de schema: `PaqueteOrigen.loteId`/`BandejaOrigen.loteId`
  (nullable, no destructiva), modelo nuevo `RegistroConsolidacion` + enum
  `TipoConsolidacion`, `Paquete.registroConsolidacionId`,
  `BandejaSuelta.registroConsolidacionId`, relaciones inversas en `Lote`.
- `lib/constants.ts`: `UNIDADES_POR_BANDEJA = 30`.
- `server/services/consolidacion.ts` (nuevo): `calcularConsolidacion()`,
  función pura, 100% testeable.
- `lib/zod/consolidacion.ts` (nuevo): `consolidarSueltosSchema` (compartido
  por los dos wizards).
- `server/repositories/inventario.ts` (amplía):
  `listarInventarioSueltosConSaldo()`.
- `server/repositories/consolidacion.ts` (nuevo): `consolidarSueltos()`
  (transacción interactiva con guard todo-o-nada agregado por origen),
  `buscarRegistroConsolidacionConUnidadesPorId()`.
- `server/actions/consolidacion.ts` (nuevo): `consolidarPaqueteMixtoAction`,
  `consolidarBandejaAction` (ambas sin `rol`).
- UI: `app/(app)/consolidacion/page.tsx` (nuevo), `SaldosTabla`,
  `ConsolidarSueltosDialog` (compartido, parametrizado por tipo/unidad).
- `NAV_ITEMS`: entrada nueva "Consolidación" → `/consolidacion`.
- Tests unitarios de `calcularConsolidacion()` (cobertura ≥90%, mismo umbral
  que el resto de `server/services/`), tests de integración de las dos
  Server Actions, tests de carrera reales contra Neon (guard de saldo bajo
  concurrencia real, idempotencia real), verificación en vivo del resto de
  la transacción, verificación clic a clic en navegador.

## Fuera de alcance
- **Todo lo de Sprint 8 en adelante** — Clientes, Precio por Kilo, POS,
  Créditos, Egresos, PWA, cola offline real. Este sprint sigue el Contrato
  Offline-Ready solo en el sentido de datos (id de cliente + idempotencia),
  sin cola de IndexedDB/Dexie real (sigue siendo Sprint 14, mismo criterio
  que Sprint 5/6 ya establecieron).
- **Romper un Paquete o una BandejaSuelta ya consolidados** — es Sprint 10
  ("Romper paquete y sueltos"), un flujo inverso completamente distinto
  (reparte proporcionalmente una devolución), no se toca acá.
- **Deshacer/revertir una consolidación ya confirmada.** A diferencia de
  Recolección (que sí tiene ventana de gracia de 10 minutos desde Sprint 6),
  este sprint no agrega un botón "Deshacer" para `RegistroConsolidacion` —
  no lo pidió el roadmap ni el Product Owner en esta planificación. Si hace
  falta corregir una consolidación con datos equivocados, hoy no hay
  herramienta automática — queda como limitación conocida, no como bug (ver
  "Riesgos").
- **Reparto proporcional entre orígenes.** El algoritmo de este sprint es
  secuencial-determinista (agota un origen antes de pasar al siguiente, ver
  "Decisiones de diseño adicionales"), no reparte cada unidad
  proporcionalmente entre todos los orígenes seleccionados a la vez.
- **Elegir con qué mezcla exacta de orígenes se arma cada unidad.** El
  operario elige QUÉ orígenes participan y CUÁNTAS unidades arma de verdad
  (corrección real post-diseño, S7-15 — ver "Decisiones de negocio
  confirmadas"), pero CÓMO se reparte cada unidad entre los orígenes
  seleccionados (el algoritmo secuencial-determinista de
  `calcularConsolidacion()`) sigue siendo 100% automático — el operario no
  elige, por ejemplo, "que este paquete puntual salga solo del Galpón B".
- **Venta de Paquete MIXTO o BandejaSuelta** — Sprint 9/10 (POS). Este
  sprint solo los deja `DISPONIBLE`, listos para venderse más adelante.

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Igual que Sprints 1-6. Este sprint crea `Paquete`/`BandejaSuelta` reales y
descuenta `InventarioSueltos` real — probar con galpones/lotes de prueba,
nunca contra estructura real de la granja si ya hay operación real cargada.

### R2 — Guard "todo o nada" agregado por origen, no por unidad (pieza nueva de arquitectura)
El guard de Sprint 6 (`revertirRecoleccion`) protege N filas de `Paquete`
con una condición idéntica para todas. Acá el guard protege N filas de
`InventarioSueltos`, pero la cantidad a descontar de CADA origen es distinta
y depende de cuántas unidades de destino lo usaron — el guard tiene que
agregar (sumar) el total necesario por origen ANTES de ejecutar el
`updateMany`, no evaluarlo unidad por unidad. Se verifica explícitamente con
un test de carrera real (H5) y con un caso donde un mismo origen aporta a
más de una unidad (H3), no solo se asume que "usar `$transaction` alcanza".

### R3 — `RegistroConsolidacion` es un modelo nuevo, no anticipado por el roadmap
El roadmap y el brief inicial de esta planificación asumían "sin migración
de schema" — el hallazgo real (ver arriba) obliga a un modelo nuevo. Es
arquitectónicamente simétrico a `RegistroRecoleccion` (mismo rol: ancla de
idempotencia + fila de auditoría de un evento que crea N hijos), pero es una
pieza de diseño más grande de lo que el brief anticipaba — documentado acá
explícitamente para que el Product Owner pueda objetarla antes de ejecutar.

### R4 — Sin reversión para Consolidación (deuda explícita, distinta de la de Mortalidad)
A diferencia de Mortalidad (que no tiene ajuste manual, ver R3 de Sprint 6),
acá la deuda es la ventana de gracia/reversión completa: si un operario se
equivoca de origen o de peso al confirmar el wizard, hoy no hay forma
automática de deshacerlo — solo el ajuste manual del Gerente (Sprint 6,
`ajustarInventarioSueltosAction`) podría compensar el saldo de
`InventarioSueltos` a mano, pero no anula el `Paquete`/`BandejaSuelta` ya
creado. Queda como deuda explícita para un sprint futuro si el Product
Owner lo reporta como necesidad real en producción.

### R5 — `loteId` nullable en `PaqueteOrigen`/`BandejaOrigen` para filas históricas
La migración agrega `loteId` como columna nullable (no se puede backfillear
con certeza el lote real de un `PaqueteOrigen` creado antes de este sprint
sin asumir de más). Código nuevo (este sprint, y `registrarRecoleccion` de
Sprint 5 hacia adelante) siempre lo completa; filas de `PaqueteOrigen`
creadas antes de este sprint quedan con `loteId = null` — limitación
conocida, no un bug, documentada en `plan.md`.

### R6 — `AuditLog` no atómico con la mutación (heredado)
Mismo trade-off aceptado desde Sprint 2 — un reintento idempotente de una
consolidación (mismo `id`, mismo payload) deja una segunda fila en
`AuditLog`, inofensivo.

## Criterio de aceptación general
Dado el repo con Sprint 6 ya desplegado
Cuando un Gerente u Operario abre "/consolidacion", ve los saldos reales de
  InventarioSueltos por galpón/lote, selecciona uno o más orígenes en el
  wizard "Paquete Mixto" o "Armar Bandeja", y confirma con los pesos
  digitados
Entonces se crean exactamente los Paquete MIXTO/BandejaSuelta que el
  operario eligió armar (mínimo 1, hasta el techo que calcularConsolidacion()
  determina, recalculado fresco en el servidor), con
  su PaqueteOrigen/BandejaOrigen detallado por galpón y lote, el
  InventarioSueltos de cada origen se descuenta exactamente lo que le
  correspondió, se genera un MovimientoSueltos CONSOLIDACION_SALIDA por
  origen distinto, y reconstruirSaldo() sigue reproduciendo exactamente
  InventarioSueltos.cantidad
Y si el saldo real de cualquier origen no alcanza al momento de confirmar
  (carrera real o dato desactualizado), la consolidación completa se
  rechaza — nunca parcial, nunca deja InventarioSueltos en negativo
Y un reintento con el mismo id de cliente nunca duplica Paquete/BandejaSuelta
  ni vuelve a descontar InventarioSueltos
Y los tests de carrera (guard de saldo bajo concurrencia real) pasan contra
  Neon real, no solo contra mocks
