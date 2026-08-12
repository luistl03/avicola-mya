# Sprint 6 — Ventana de gracia y reversión

## Sprint Goal
Un error de tipeo en una recolección se corrige en 10 minutos sin llamar al
Gerente — igual que ya pasa con Mortalidad desde Sprint 4 — y, si el plazo
ya venció, el Gerente tiene una herramienta auditada para corregir el saldo
de sueltos a mano, con motivo obligatorio, en vez de tener que tocar la
base de datos directamente.

## ⚠️ Aclaración crítica antes de leer nada más: este sprint NO parte de cero
`specs/roadmap-completo.md` describe la ventana de gracia como si no
existiera todavía en el proyecto — **eso ya no es así**. Durante la
ejecución real de Sprint 4, el Product Owner pidió adelantar esta
funcionalidad para `RegistroMortalidad`, saliéndose del plan original (el
`spec.md` de Sprint 4 decía explícitamente en "Fuera de alcance": *"revertir
un RegistroMortalidad... la ventana de gracia de 10 minutos es Sprint 6"* —
eso se descartó en el camino). Confirmado en `memory/modelo-datos.md`
("adelantado a Mortalidad a pedido del Product Owner") y en el cierre real
de Sprint 4 (`memory/estado-proyecto.md`).

**Ya existe y está en producción — no se reconstruye:**
- `RegistroMortalidad.revertido`/`revertidoEn` (schema, desde Sprint 4).
- `puedeRevertirMortalidad()` (`server/services/mortalidad.ts`) — guard
  pura (ya revertido / ventana de 10 min vencida).
- `revertirMortalidad()` (`server/repositories/mortalidad.ts`) — segunda
  transacción interactiva del proyecto, `UPDATE ... WHERE revertido = false`
  como guard anti-carrera, verificada en vivo contra el pooler de Neon con
  llamadas concurrentes reales.
- `revertirMortalidadAction` (`server/actions/mortalidad.ts`).
- `RevertirMortalidadBoton` (`components/domain/mortalidad/revertir-mortalidad-boton.tsx`)
  — countdown real con `setInterval`, plazo autoritativo revalidado en el
  servidor al hacer clic.
- `MORTALIDAD_VENTANA_GRACIA_MIN = 10` (`lib/constants.ts`).

**Lo que este sprint SÍ construye** (el alcance real):
1. El mismo botón "Deshacer" para `RegistroRecoleccion` — más complejo que
   Mortalidad porque una recolección crea varias entidades relacionadas (N
   `Paquete`, `InventarioSueltos`, `MovimientoSueltos`), no una fila + un
   contador.
2. Un guard de elegibilidad que no existe en Mortalidad: bloquear la
   reversión si algún `Paquete` del registro ya se vendió o se rompió.
3. "Ajuste manual del Gerente pasado el plazo" — **no existe en ningún
   módulo todavía, ni siquiera en Mortalidad**. Este sprint lo construye
   completo para el ledger de sueltos de Recolección; Mortalidad queda
   como deuda explícita (ver "Fuera de alcance").

## Hallazgo real durante esta planificación: falta una migración de schema
El roadmap y la nota de `modelo-datos.md` daban por hecho que
`RegistroRecoleccion.revertidoEn` ya existía "desde Sprint 0", igual que
`revertido`. **Verificado releyendo `prisma/schema.prisma` (no asumido):
es falso.** `RegistroRecoleccion` (línea ~329) solo tiene:

```prisma
model RegistroRecoleccion {
  id              String    @id @default(uuid())
  loteId          String
  galponId        String
  usuarioId       String
  cantidadTotal   Int
  creadoEnCliente DateTime?
  creadoEn        DateTime  @default(now())
  revertido       Boolean   @default(false)
  // revertidoEn NO existe todavía
  ...
  @@index([creadoEn, revertido])
  @@index([loteId])
}
```

`revertidoEn` solo existe hoy en `RegistroMortalidad`, agregado por la
migración `20260808024615_mortalidad_revertido_bitacora_eliminada` — nunca
se aplicó el equivalente a Recolección. **Este sprint sí necesita una
migración nueva**, no destructiva (`ADD COLUMN "revertidoEn" TIMESTAMP(3)`),
mismo patrón exacto que la de Mortalidad. Es la primera tarea del plan
(S6-1) — todo lo demás depende de que este campo exista.

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md`, `memory/stack-tecnologico.md`,
`memory/arquitectura.md`, `memory/modelo-datos.md`,
`memory/convenciones.md` (en particular "Contrato Offline-Ready" e
"Idempotencia por id de cliente: obligatoria en TODA creación"),
`memory/decisiones-tecnicas.md` (D1–D6), `memory/definition-of-ready.md`,
`memory/estado-proyecto.md` completo, `specs/roadmap-completo.md`
(sección Sprint 6), y `specs/sprint-05-recoleccion-inventario/` completo
(plantilla de estructura y nivel de detalle de este documento).

## Decisiones de negocio confirmadas por el Product Owner antes de esta planificación
Cinco preguntas que el roadmap no resolvía (mismo criterio de
`definition-of-ready.md` que ya se usó en Sprints 3-5):

1. **Alcance de "Corregir último registro": botón "Deshacer" por fila**,
   disponible en cualquier registro reciente de la tabla dentro de su
   propia ventana de 10 minutos — no literalmente "solo el último". Mismo
   patrón real que ya tiene Mortalidad (`RevertirMortalidadBoton`), no se
   inventa un patrón distinto para Recolección.
2. **Guard de elegibilidad: todo o nada.** Si al menos un `Paquete` del
   registro ya no está `DISPONIBLE` (se vendió o se rompió), se bloquea la
   reversión **completa** con un mensaje explícito — no hay reversión
   parcial. Consistente con "reversión transaccional" del roadmap.
3. **Signo de `REVERSION` en `reconstruirSaldo()`:** el repository
   recalcula `sueltos = calcularEmpaque(cantidadTotal).sueltos` (la misma
   fórmula que generó el `MovimientoSueltos` original, no depende de leer
   ese movimiento vía `referenciaId`) y crea un `MovimientoSueltos` tipo
   `REVERSION` con esa cantidad; `reconstruirSaldo()` lo clasifica como
   **salida** (se agrega a `TIPOS_SALIDA`).
4. **Ajuste manual del Gerente: solo Recolección, acotado al ledger de
   sueltos.** El Gerente ajusta el saldo de `InventarioSueltos` de un
   galpón/lote con un delta (+/-) y un motivo obligatorio, generando un
   `MovimientoSueltos` tipo `AJUSTE_GERENTE` (el enum ya existe en el
   schema, sin usar hasta ahora). **No toca `Paquete` ni
   `cantidadTotal`** — corregir retroactivamente el número de paquetes
   generados queda fuera de alcance (ver "Fuera de alcance"). Mortalidad
   queda como deuda explícita para un sprint futuro: no existe hoy un
   ledger equivalente para `avesVivas`, construirlo requiere diseño nuevo
   que este sprint no cubre.
5. **Ventana de gracia — nombre de la constante:** decisión de nombre, no
   de negocio (tomada en `plan.md`, no se le preguntó al Product Owner):
   `MORTALIDAD_VENTANA_GRACIA_MIN` se renombra a `VENTANA_GRACIA_MIN`
   ahora que dos módulos comparten el mismo plazo — un solo lugar para
   cambiarlo si algún día los dos dejan de compartirlo.

## Decisiones de diseño adicionales tomadas en esta planificación
Corolarios técnicos, documentados para que el Product Owner pueda
objetarlos antes de ejecutar (mismo criterio que Sprints 3-5):

- **El guard anti-carrera de "todo o nada" es un `updateMany` masivo, no
  una lectura previa + decisión en memoria.** `revertirRecoleccion()`
  intenta poner en `ANULADO` **todos** los `Paquete` de ese
  `registroRecoleccionId` que sigan `DISPONIBLE`
  (`WHERE registroRecoleccionId = X AND estado = 'DISPONIBLE'`) dentro de
  la misma transacción interactiva, y compara la cantidad de filas
  afectadas contra el total de paquetes del registro (leído con
  `tx.paquete.count(...)` dentro de la misma transacción, no antes). Si no
  coinciden, se lanza un error que aborta la transacción completa
  (revirtiendo también el `UPDATE` de `revertido` que ya se había
  aplicado) — mismo espíritu que el `UPDATE ... WHERE avesVivas >=
  cantidad` de Mortalidad, extendido a un conjunto de filas en vez de una
  sola. Esto es lo que hace que el caso "un Paquete se vendió justo en el
  medio" (la carrera real que pide el roadmap) quede cubierto de verdad,
  no solo con la guard de aplicación (que lee un instante antes y puede
  quedar desactualizada).
- **El decremento de `InventarioSueltos` durante la reversión usa el mismo
  patrón `UPDATE condicional` que ya se usó para `avesVivas`** (`WHERE
  cantidad >= sueltos`), no un `decrement` a ciegas que dependa de que el
  `CHECK (cantidad >= 0)` de la base (S0-5) lo rechace con un error crudo
  de Postgres. Si el saldo no alcanza (otra operación lo bajó entre
  medio — hoy solo puede pasar por una recolección posterior del mismo
  galpón/lote, ya que Consolidación/Ventas todavía no existen), la
  transacción aborta con un mensaje traducido, no con un error de Prisma
  sin traducir.
- **El "Ajuste manual del Gerente" es una entrada de ledger nueva e
  independiente, no una operación sobre un `RegistroRecoleccion`
  puntual.** Crea un `MovimientoSueltos` con `loteId` elegido por el
  Gerente y `galponId` **resuelto automático** vía
  `buscarUbicacionActual(loteId)`, mismo patrón que
  `registrarRecoleccion`/`registrarMortalidad`. Por eso **sí** aplica el
  patrón completo de idempotencia por id de cliente
  (`memory/convenciones.md`): es una fila nueva sin ninguna unicidad de
  negocio posible sobre sus campos, a diferencia de la reversión (que es
  un `UPDATE` condicional sobre algo que ya existe, sin necesidad de `id`
  de cliente).

  **Corrección real post-diseño (S6-16, probando en vivo):** el diseño
  original de este documento tenía dos `<Select>` independientes
  (galpón + lote), pensados para poder ajustar una combinación
  galpón/lote histórica si el lote ya se había mudado. El Product Owner
  señaló que ese caso no es el real: un lote ya sabe su galpón actual, y
  pedirlo aparte era fricción de UI sin motivo de negocio que lo
  justifique en la práctica (el caso histórico queda como limitación
  conocida, no resuelta — si algún día hace falta corregir el saldo de un
  galpón que el lote ya abandonó, ese caso se resuelve en un sprint
  futuro, no en este). Corregido: un solo `<Select>` de lote, `galponId`
  resuelto en la Server Action antes de llamar al repository.
- **El ajuste no tiene una restricción de tiempo dura en el backend** (no
  exige que la ventana de 10 minutos de ningún registro específico ya haya
  vencido) — es una herramienta de corrección de inventario de propósito
  general, restringida a GERENTE y siempre auditada con motivo obligatorio,
  no un mecanismo de "reabrir" un registro puntual. La UI sí lo enmarca
  para el caso de uso real que pide el roadmap ("pasado el plazo"): en
  `/recoleccion`, el botón "Ajustar inventario" queda disponible solo para
  GERENTE, independiente de si algún registro puntual sigue o no dentro de
  su ventana.
- **`reconstruirSaldo()` deja de clasificar `AJUSTE_GERENTE` como entrada
  fija.** El `cantidad` de un `MovimientoSueltos` tipo `AJUSTE_GERENTE` se
  guarda **con signo** (puede ser negativo, para corregir un excedente) —
  la función lo suma directo al saldo (`saldo + movimiento.cantidad`), sin
  pasar por `TIPOS_ENTRADA`/`TIPOS_SALIDA`. Es el único tipo de
  `MovimientoSueltos` cuyo campo `cantidad` no es siempre positivo — se
  documenta explícitamente en el código para que Sprint 12 (Egresos) o
  cualquier lectura futura de `MovimientoSueltos` no asuma `cantidad > 0`
  a ciegas.
- **`RevertirRecoleccionBoton` es un clon directo de
  `RevertirMortalidadBoton`**, mismo countdown por `setInterval`, mismo
  criterio de "el plazo real lo revalida el servidor al hacer clic, el
  countdown del cliente es solo cosmético" — no se inventa un patrón
  nuevo de UI para esto.

## Historias de usuario

### H1 — Deshacer un registro de Recolección dentro de la ventana de 10 minutos (4 pts)
Como Operario (o Gerente) quiero poder deshacer un registro de recolección
reciente si me equivoqué al tipear, para no tener que llamar al Gerente
por un error simple.

```gherkin
Dado un RegistroRecoleccion creado hace 3 minutos, sin ningún Paquete
  vendido o roto
Cuando hago clic en "Deshacer"
Entonces el registro queda revertido=true, revertidoEn con la hora del
  servidor, y la fila se muestra atenuada como "Revertido" en la tabla —
  nunca desaparece del historial

Dado un RegistroRecoleccion creado hace 11 minutos (ventana ya vencida)
Cuando reviso la fila en la tabla
Entonces no hay botón "Deshacer" disponible (el countdown del cliente ya
  llegó a 0) — y si se fuerza la acción igual (curl directo, cliente
  desactualizado), el servidor la rechaza explícitamente

Dado un RegistroRecoleccion creado hace exactamente 9 minutos 59 segundos
Cuando hago clic en "Deshacer"
Entonces la acción se acepta (el borde de la ventana usa el mismo
  criterio de comparación en minutos que ya se probó en Mortalidad, "> 10
  minutos" rechaza, no "≥ 10")

Dado un RegistroRecoleccion ya revertido antes (revertido=true)
Cuando intento revertirlo de nuevo (doble clic, dos pestañas)
Entonces la segunda solicitud es rechazada — "Este registro ya fue
  revertido"
```

### H2 — Guard de elegibilidad: bloquear si algo ya se vendió o rompió (4 pts)
Como equipo queremos que la reversión nunca deje el inventario
inconsistente con lo que ya salió físicamente de la granja, aunque hoy no
exista todavía una pantalla de ventas real.

```gherkin
Dado un RegistroRecoleccion con 2 Paquete, ambos DISPONIBLE
Cuando reviso si puedo revertirlo
Entonces la reversión es elegible

Dado un RegistroRecoleccion con 2 Paquete, uno de ellos ya en estado
  VENDIDO (simulado directamente en este sprint, sin Venta real todavía —
  Sprint 9/10)
Cuando intento revertirlo
Entonces la acción se rechaza por completo, con un mensaje explícito ("Ya
  se vendió o rompió al menos un paquete de este registro — no se puede
  corregir automáticamente"), y NINGÚN Paquete cambia de estado (ni
  siquiera el que seguía DISPONIBLE) — todo o nada, no reversión parcial

Dado el mismo escenario del caso anterior, pero la venta del paquete
  ocurre en la microventana entre que la UI mostró el botón habilitado y
  que el servidor procesa el clic (carrera real, no solo guard de
  aplicación)
Cuando la transacción de reversión corre en el servidor
Entonces el UPDATE condicional sobre Paquete (WHERE estado = 'DISPONIBLE')
  afecta menos filas que el total de paquetes del registro, y la
  transacción completa aborta — ni revertido pasa a true, ni ningún
  Paquete cambia, ni se toca el ledger de sueltos
```

### H3 — Reversión transaccional completa (8 pts)
Como equipo queremos que revertir una recolección deshaga exactamente lo
que la recolección original generó — paquetes, ledger de sueltos y
contador — todo en una sola transacción, sin `DELETE` físico de nada.

```gherkin
Dado un RegistroRecoleccion con cantidadTotal=470 (2 Paquete DISPONIBLE +
  InventarioSueltos incrementado en 110 vía un MovimientoSueltos
  RECOLECCION)
Cuando lo reviero dentro de la ventana de gracia
Entonces: revertido=true, revertidoEn seteado; los 2 Paquete pasan a
  ANULADO (nunca DELETE); InventarioSueltos de ese galpón/lote se
  decrementa en 110; se crea un nuevo MovimientoSueltos tipo REVERSION,
  cantidad 110, referenciaId = el mismo RegistroRecoleccion.id — todo en
  la misma transacción

Dado un RegistroRecoleccion con cantidadTotal=360 (múltiplo exacto de
  180, sin sueltos, sin MovimientoSueltos original)
Cuando lo reviero
Entonces los 2 Paquete pasan a ANULADO, pero NO se crea ningún
  MovimientoSueltos REVERSION ni se toca InventarioSueltos — mismo
  criterio de "sin ruido en el ledger" que Sprint 5 ya estableció para la
  recolección original

Dado un RegistroRecoleccion con cantidadTotal=45 (sin ningún Paquete,
  todo sueltos)
Cuando lo reviero
Entonces no hay ningún Paquete que anular, InventarioSueltos se decrementa
  en 45 y se crea el MovimientoSueltos REVERSION de 45

Dado que el saldo de InventarioSueltos de ese galpón/lote ya bajó de 110
  (por ejemplo, otra recolección del mismo lote se registró después y una
  operación futura ya lo consumió parcialmente — el único caso posible hoy
  sin Consolidación/Ventas reales es simulado directamente en el test)
Cuando intento revertir el registro original
Entonces la transacción aborta con un mensaje explícito ("El saldo de
  sueltos ya no alcanza para deshacer este registro") — no se aplica un
  decrement a ciegas que deje el contador en negativo, y ni revertido ni
  los Paquete cambian

Dado el mismo caso feliz de arriba
Cuando se ejecuta la reversión
Entonces reconstruirSaldo() sobre el historial completo de
  MovimientoSueltos de ese galpón/lote (incluidos el RECOLECCION original
  y el REVERSION nuevo) reproduce exactamente el InventarioSueltos.cantidad
  resultante (vuelve al valor previo a la recolección revertida)
```

### H4 — Ajuste manual del Gerente pasado el plazo (8 pts)
Como Gerente quiero poder corregir el saldo de sueltos de un galpón/lote
con un motivo explicado, cuando detecto un error después de que la
ventana automática de 10 minutos ya cerró, para no tener que tocar la
base de datos a mano.

```gherkin
Dado que soy un Gerente autenticado
Cuando abro "Ajustar inventario", elijo un lote y un galpón, ingreso
  delta=+15 y motivo="Conteo físico encontró 15 unidades sueltas no
  registradas, turno de la tarde"
Entonces se crea un MovimientoSueltos tipo AJUSTE_GERENTE con cantidad=+15
  y ese motivo, e InventarioSueltos de ese galpón/lote se incrementa en 15
  (o se crea en 15 si no existía fila todavía para esa combinación)

Dado el mismo Gerente
Cuando ingreso delta=-20 sobre un galpón/lote con InventarioSueltos=30 y un
  motivo válido
Entonces se crea el MovimientoSueltos con cantidad=-20 e InventarioSueltos
  queda en 10

Dado un galpón/lote con InventarioSueltos=5
Cuando intento un ajuste con delta=-20
Entonces la acción se rechaza ("El saldo no alcanza para este ajuste") sin
  crear ningún MovimientoSueltos ni tocar InventarioSueltos — mismo
  criterio de UPDATE condicional que la reversión

Dado un intento de ajuste sin motivo, o con un motivo de menos de 10
  caracteres
Cuando se envía el formulario
Entonces la acción es rechazada por el schema Zod antes de tocar la base

Dado un Operario autenticado (no Gerente)
Cuando intenta invocar la acción de ajuste (aunque no vea el botón en la
  UI, se prueba también a nivel de Server Action)
Entonces la acción es rechazada por withAuth antes de ejecutar cualquier
  lógica — solo GERENTE puede ajustar

Dado un ajuste enviado con un id generado en el cliente
Cuando se reenvía el mismo payload exacto (mismo id) una segunda vez
Entonces la primera vez crea el MovimientoSueltos y aplica el delta, la
  segunda vez devuelve el registro ya existente sin duplicar el
  movimiento ni aplicar el delta dos veces

Dado reconstruirSaldo() sobre una lista de movimientos que incluye un
  AJUSTE_GERENTE con cantidad negativa
Cuando se ejecuta
Entonces el resultado resta esa cantidad del saldo (se suma el valor con
  signo directo, sin pasar por la clasificación entrada/salida)
```

### H5 — Tests de carrera (5 pts)
Como equipo queremos evidencia real (no solo teórica) de que los dos
guards anti-carrera de este sprint (reversión doble, reversión vs.
elegibilidad) se sostienen bajo concurrencia real contra Neon, mismo
criterio que ya se aplicó a Mortalidad en Sprint 4.

```gherkin
Dado un RegistroRecoleccion dentro de su ventana de gracia
Cuando se disparan dos llamadas reales y casi simultáneas a
  revertirRecoleccion() (Promise.all, contra el pooler real de Neon, no
  mocks)
Entonces exactamente una tiene éxito (revertido pasa a true una sola vez,
  InventarioSueltos se decrementa una sola vez) y la otra falla con "Este
  registro ya fue revertido"

Dado un RegistroRecoleccion con 2 Paquete DISPONIBLE
Cuando, entre el momento en que se lee el estado de los paquetes para la
  guard de aplicación y el momento en que corre la transacción de
  reversión, uno de los paquetes pasa a VENDIDO (simulado con un UPDATE
  directo a la base, ya que Venta todavía no existe como feature real)
Entonces la transacción de reversión rechaza el intento por completo —
  el UPDATE condicional sobre Paquete detecta que no todas las filas
  esperadas seguían DISPONIBLE, aborta, y ni revertido ni InventarioSueltos
  cambian

Dado un InventarioSueltos con cantidad=10
Cuando se disparan dos ajustes manuales concurrentes, ambos con delta=-8
Entonces exactamente uno tiene éxito (saldo termina en 2) y el otro falla
  con "El saldo no alcanza para este ajuste" — no queda en -6
```

## Alcance de este sprint
- Migración de schema: `RegistroRecoleccion.revertidoEn DateTime?` (no
  destructiva).
- `lib/constants.ts`: renombrar `MORTALIDAD_VENTANA_GRACIA_MIN` →
  `VENTANA_GRACIA_MIN` (compartida entre Mortalidad y Recolección).
- `server/services/recoleccion.ts`: `puedeRevertirRecoleccion()` (guard
  pura: ya revertido, ventana vencida, elegibilidad todo-o-nada).
- `server/services/inventario.ts`: resolver el signo de `REVERSION`
  (salida) y de `AJUSTE_GERENTE` (cantidad firmada, suma directa) en
  `reconstruirSaldo()`.
- `lib/zod/recoleccion.ts`: `revertirRecoleccionSchema`.
- `lib/zod/inventario.ts` (nuevo): `ajustarInventarioSueltosSchema`.
- `server/repositories/recoleccion.ts`: `revertirRecoleccion()`
  (transacción interactiva: guard atómico de "ya revertido", guard
  atómico "todo o nada" sobre `Paquete`, guard atómico de saldo suficiente
  sobre `InventarioSueltos`, `MovimientoSueltos` `REVERSION` condicional).
- `server/repositories/inventario.ts`: `ajustarInventarioSueltos()`
  (transacción interactiva: upsert/decrement condicional de
  `InventarioSueltos`, `create` de `MovimientoSueltos` `AJUSTE_GERENTE`
  con `id` de cliente).
- `server/actions/recoleccion.ts`: `revertirRecoleccionAction` (sin rol).
- `server/actions/inventario.ts` (nuevo): `ajustarInventarioSueltosAction`
  (rol `GERENTE`).
- UI: `RevertirRecoleccionBoton` (clon de `RevertirMortalidadBoton`)
  integrado en la tabla de `/recoleccion`; `AjustarInventarioSueltosDialog`
  (visible solo para GERENTE) en el `PageHeader` de `/recoleccion`.
- Tests unitarios de los guards nuevos y de `reconstruirSaldo()`
  actualizado, tests de integración de las dos Server Actions, tests de
  carrera reales contra Neon (doble reversión, reversión vs. venta
  simulada, doble ajuste concurrente), y verificación en vivo del resto
  de la transacción.

## Fuera de alcance
- **Ajuste manual del Gerente para Mortalidad.** No existe un ledger
  equivalente a `MovimientoSueltos` para `avesVivas` — construirlo
  requiere una decisión de schema nueva (¿una tabla de historial de
  ajustes de `avesVivas`? ¿reusar `RegistroMortalidad` con un tipo nuevo?)
  que este sprint no resuelve. Queda como deuda explícita para un sprint
  futuro, documentada en "Riesgos".
- **Corregir retroactivamente el número de `Paquete` generados por una
  recolección con error.** El "Ajuste manual del Gerente" de este sprint
  solo compensa el saldo de `InventarioSueltos` (sueltos) — si el error
  real estaba en cuántos paquetes se formaron (no en el conteo de
  sueltos), no hay corrección automática: es una operación físicamente
  riesgosa (los paquetes ya pueden estar vendidos) que este sprint no
  intenta resolver. Se documenta como limitación conocida, no como bug.
- **Reversión parcial** (revertir solo los paquetes que siguen
  `DISPONIBLE`, dejando el resto) — decisión confirmada: todo o nada.
- **Pantalla de saldos por galpón/lote** para elegir visualmente qué
  ajustar — sigue siendo Sprint 7 (Consolidación). El diálogo de ajuste de
  este sprint usa selects de lote/galpón, sin una vista previa del saldo
  actual más allá de lo que la propia acción reporta al fallar/tener
  éxito.
- **Venta o rotura de paquetes reales** — Sprint 9/10 (POS). El estado
  `VENDIDO`/`ROTO` de `Paquete` se simula directamente en tests de este
  sprint para poder probar el guard de elegibilidad, no se construye
  ninguna pantalla ni Server Action de venta.
- **Cola offline real ni ningún cambio al Contrato Offline-Ready** — sigue
  siendo Sprint 14. La reversión no necesita `id` de cliente (es un
  `UPDATE`, no un `create`); el ajuste manual sí lo usa, pero como
  Server Action síncrona normal, sin cola.

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Igual que Sprints 1-5. Este sprint además pone `Paquete` en `ANULADO` de
verdad — probar con lotes/galpones/paquetes de prueba, nunca contra
estructura real de la granja si ya hay operación real cargada.

### R2 — Guard "todo o nada" sobre un conjunto de filas, no una sola (pieza nueva de arquitectura)
Los guards anti-carrera anteriores del proyecto (`avesVivas` en
Mortalidad) protegen una sola fila con un `UPDATE ... WHERE`. Este sprint
extiende el patrón a un `updateMany` sobre N filas (`Paquete`) más una
comparación de conteo — es la primera vez que el proyecto necesita esta
variante. Se verifica explícitamente con un test de carrera real (H5), no
solo se asume que "usar `$transaction` alcanza".

### R3 — Deuda explícita: Mortalidad sin ajuste manual
Documentado arriba en "Fuera de alcance". Si el Gerente reporta en
producción que necesita corregir un `RegistroMortalidad` después de que su
ventana de 10 minutos cerró, hoy no va a tener ninguna herramienta para
eso (ni antes ni después de este sprint) — hay que priorizarlo como
historia nueva en un sprint futuro, con su propio diseño de schema.

### R4 — `AJUSTE_GERENTE` es el único `MovimientoSueltos.cantidad` con signo
Cualquier código futuro que lea `MovimientoSueltos` y asuma `cantidad`
siempre positivo (por ejemplo, un reporte de Sprint 15 que sume
"unidades movidas" sin distinguir tipo) va a necesitar tratar este tipo
aparte. Documentado en el código de `reconstruirSaldo()`, pero es un
riesgo real de olvido en sprints lejanos — vale la pena revisarlo
explícitamente quien construya cualquier reporte sobre esta tabla.

### R5 — Simulación de "venta"/"rotura" sin Venta real todavía
El guard de elegibilidad (H2) y su test de carrera (H5) dependen de poner
un `Paquete.estado` en `VENDIDO`/`ROTO` directamente por script/test, no a
través de una Server Action real (no existe hasta Sprint 9/10). El guard
en sí (`WHERE estado = 'DISPONIBLE'`) es agnóstico de cómo llegó ese
estado ahí, así que la simulación prueba el mecanismo real, pero conviene
reconfirmar el comportamiento con datos reales de venta una vez que
Sprint 9/10 exista.

### R6 — `AuditLog` no atómico con la mutación (heredado)
Mismo trade-off aceptado desde Sprint 2 — un reintento idempotente del
ajuste manual (mismo `id`, mismo payload) deja una segunda fila en
`AuditLog`, inofensivo.

## Criterio de aceptación general
Dado el repo con Sprint 5 ya desplegado
Cuando un Operario o Gerente revierte un RegistroRecoleccion dentro de los
  10 minutos posteriores a su creación
Entonces sus Paquete pasan a ANULADO (nunca DELETE), el ledger de sueltos
  se ajusta con un MovimientoSueltos REVERSION cuando corresponde, y
  reconstruirSaldo() sigue reproduciendo exactamente InventarioSueltos.cantidad
Y si al menos un Paquete del registro ya no está DISPONIBLE, la reversión
  se rechaza completa — nunca parcial — incluso bajo una carrera real
Y un Gerente puede ajustar manualmente el saldo de sueltos de cualquier
  galpón/lote con un motivo obligatorio, quedando auditado, sin que un
  Operario pueda hacerlo
Y los tests de carrera (doble reversión, reversión vs. venta simulada,
  doble ajuste) pasan contra Neon real, no solo contra mocks
