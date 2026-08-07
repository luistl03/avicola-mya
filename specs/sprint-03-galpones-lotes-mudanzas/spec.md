# Sprint 3 — Galpones, Lotes y Mudanzas

## Sprint Goal
El Gerente configura la estructura física de la granja (galpones) y da de
alta lotes de aves, y puede mudar un lote de un galpón a otro sin perder
nunca su historial de ubicación — la mudanza respeta la capacidad de aves
del galpón destino y queda registrada de forma transaccional (nunca un
lote con cero o dos ubicaciones abiertas a la vez).

## Contexto previo (leer antes de ejecutar)

### Estado real del schema (verificado antes de planificar, no asumido)
- `model Galpon` (Sprint 0, `prisma/schema.prisma:94`) hoy tiene
  `id, nombre, capacidadMaxima (Int), creadoEn` — **no tiene campo
  `estado`**. `memory/modelo-datos.md` exige soft-delete por `estado` en
  toda entidad de negocio, Galpón incluido — este sprint cierra ese gap
  (ver H1, confirmado con el Product Owner antes de escribir este spec).
- `model Lote` (`prisma/schema.prisma:112`) ya tiene
  `id, codigo (@unique), fechaIngreso, avesIniciales, avesVivas,
  estado (EstadoLote: ACTIVO/INACTIVO, @default ACTIVO)`. **No tiene
  `galponId` directo** — la ubicación de un lote nunca se guarda como FK
  denormalizada en `Lote`, se deriva siempre de
  `HistorialUbicacionLote` filtrando `fechaSalida IS NULL`. Esto es
  intencional (ver `memory/modelo-datos.md`, el índice
  `HistorialUbicacionLote(loteId, fechaSalida)` existe exactamente para
  esa consulta) — este sprint no agrega un `galponId` a `Lote`, sería una
  fuente de verdad duplicada que podría desincronizarse de la mudanza.
- `model HistorialUbicacionLote` (`prisma/schema.prisma:131`) ya existe:
  `id, loteId, galponId, fechaEntrada (@default now), fechaSalida?`.
  `galpon` usa `onDelete: Restrict`, `lote` usa `onDelete: Cascade`.
  **Restricción SQL manual de Sprint 0 (S0-5, fuera de lo que Prisma puede
  expresar):** un índice único parcial garantiza que un mismo `loteId` no
  tenga dos filas con `fechaSalida IS NULL` a la vez — la mudanza
  transaccional de este sprint depende de que esa restricción siga
  vigente (H7 la re-verifica en vivo, no solo confía en que sigue ahí).
- `tests/factories/galpon.factory.ts` y `lote.factory.ts` **ya existen**
  desde Sprint 0 (`makeGalpon`, `makeLote`) — `makeGalpon` no incluye
  `estado` todavía porque el campo no existe en el schema; se actualiza
  en H1 junto con la migración.
- No existe ningún repository/service/action de `Galpon` ni `Lote` más
  allá de esas factories — este sprint construye las tres capas desde
  cero, reusando el patrón exacto que dejó Sprint 2 para `Usuario`
  (`withAuth`, `AccionError`, `$transaction` en array-form dentro de
  repositories, guards puras en `services`).
- `server/auth/rbac.ts` hoy solo tiene `{ ruta: "/usuarios", roles:
  ["GERENTE"] }`. `components/layout/nav-items.ts` hoy solo tiene
  "Inicio" y "Usuarios". Ambos se amplían en este sprint.
- Componentes de UI ya disponibles y que este sprint reusa tal cual, sin
  reinventarlos (`memory/convenciones.md`): `<PageHeader>` para el
  encabezado de `/galpones` y `/lotes`, `<TableScrollArea>` para ambas
  tablas, `<DataTablePagination>` (10 filas por página, mismo patrón que
  `listarUsuarios`/`contarUsuarios`), `<Dialog>` (no `<Sheet>`, mismo
  criterio que Usuarios: pantallas de gestión de Gerente, no UX de
  campo), sistema de toasts (`toastManager`).
- **Deuda preexistente encontrada al leer el código (no de este sprint,
  documentada para no repetirla):** el `Badge` de estado en
  `usuarios-tabla.tsx` escribe su receta de color inline
  (`border-green-300 bg-green-100 text-green-800`) en vez de una clase de
  `globals.css`, aunque la regla de `convenciones.md` ("ninguna receta de
  color/sombra a medida suelta en un `.tsx`") ya estaba vigente cuando se
  escribió `toast.tsx` en la misma sesión (el propio comentario de
  `.toast-success` en `globals.css` dice que reusa "el mismo verde del
  badge Activo" sin haberlo extraído ahí). Este sprint no toca
  `usuarios-tabla.tsx` (fuera de alcance, no se pidió), pero los badges
  **nuevos** de Galpón/Lote sí siguen la regla desde el vamos — ver plan.md.
- **`memory/definition-of-done.md` sigue sin existir** en el repo (mismo
  hallazgo que ya documentó `specs/sprint-02-rbac-auditoria/spec.md`).
  Este sprint se verifica contra las reglas de `CLAUDE.md` y el mismo
  estándar aplicado en Sprints 1 y 2, igual que Sprint 2 tuvo que hacer.

### Decisiones de negocio confirmadas por el Product Owner antes de esta planificación
Estas cuatro preguntas se hicieron explícitamente porque el roadmap
(`specs/roadmap-completo.md`) no las resolvía y `definition-of-ready.md`
exige no asumir reglas de negocio:

1. **Capacidad del galpón:** `capacidadMaxima` es el máximo de **aves
   vivas** que el galpón puede alojar en total, sumando **todos** los
   lotes que tenga abiertos a la vez (`fechaSalida IS NULL`). Un galpón
   puede alojar más de un lote simultáneo mientras la suma de sus
   `avesVivas` no supere el máximo.
2. **Estado de Galpón:** se agrega el campo (H1) — "eliminar" un galpón
   es pasarlo a INACTIVO, deja de listarse como destino para alta o
   mudanza, conserva su historial.
3. **Mudanza:** solo lotes con `estado = ACTIVO` pueden mudarse; `avesVivas`
   puede ser cualquier valor ≥ 0 (mudar un lote con 0 aves vivas es
   válido).
4. **Finalizar lote:** no depende de `avesVivas` — el Gerente puede
   finalizar un lote en cualquier momento, tenga o no aves vivas (cubre
   venta/retiro total del lote, no solo mortalidad completa).

### Decisiones de diseño adicionales tomadas en esta planificación
Corolarios técnicos de lo confirmado arriba — no son ambigüedades de
negocio nuevas, pero se documentan explícitamente para que el Product
Owner pueda objetarlas antes de ejecutar (mismo criterio que Sprint 2 usó
con sus "Asunción a confirmar"):

- **Finalizar un lote también cierra su ubicación abierta** (`fechaSalida
  = ahora` en la fila vigente de `HistorialUbicacionLote`), en la misma
  transacción que pasa `Lote.estado` a INACTIVO. Motivo: si no se
  cerrara, un lote finalizado seguiría "ocupando" capacidad de su último
  galpón para siempre — inconsistente con la regla de capacidad del
  punto 1.
- **Un galpón no puede desactivarse mientras aloje al menos un lote**
  (fila abierta en `HistorialUbicacionLote`). Motivo: evita el estado
  inconsistente de un lote alojado en un galpón INACTIVO, que además
  rompería la cuenta de ocupación de la "vista de ubicación actual" (H6).
- **La capacidad máxima de un galpón no puede editarse por debajo de su
  ocupación actual.** Motivo: evita crear retroactivamente un galpón
  "sobrecargado" con una simple edición.
- **`Galpon.nombre` no es único a nivel de base de datos** (el schema
  actual solo lo indexa, no lo restringe con `@unique`) — a diferencia de
  `Usuario.usuario` o `Lote.codigo`. No hay ningún requisito en
  `memory/modelo-datos.md` ni en el roadmap que pida unicidad de nombre
  de galpón, y agregar un `@unique` (o un índice único parcial, si se
  quisiera solo entre ACTIVOs) es una migración adicional no pedida. Si
  el Product Owner la quiere, se agrega como ajuste antes de S3-2.
- **`/galpones` y `/lotes` quedan restringidas a GERENTE**, mismo patrón
  que `/usuarios`. El Sprint Goal del roadmap dice literalmente "Gerente
  configura estructura física" — un Operario no necesita navegar a estas
  pantallas; sprints futuros (Mortalidad S4, Recolección S5) que sí
  necesiten que un Operario **elija** un lote/galpón desde un formulario
  operativo lo van a resolver con una consulta de repository para poblar
  un `<Select>`, no dándole acceso a estas pantallas de gestión.

## Historias de usuario

### H1 — Migración: `estado` en Galpón (2 pts)
Como sistema quiero que `Galpon` tenga un campo `estado` igual que
`Usuario`/`Lote`, para poder aplicar soft-delete en vez de un `DELETE`
físico (regla no negociable de `memory/modelo-datos.md`).

```gherkin
Dado el schema actual, donde Galpon no tiene campo estado
Cuando se agrega el enum EstadoGalpon (ACTIVO/INACTIVO) y el campo
  estado EstadoGalpon @default(ACTIVO) a Galpon, y se corre la migración
Entonces cualquier fila de Galpon ya existente en la base queda ACTIVO
  por el valor por defecto
Y npx prisma validate pasa sin errores
```

### H2 — CRUD de Galpón (8 pts)
Como Gerente quiero crear, editar y desactivar galpones para mantener al
día la estructura física real de la granja.

```gherkin
Dado que soy Gerente autenticado
Cuando creo un galpón con nombre y capacidad máxima (aves)
Entonces se crea con estado ACTIVO

Dado que soy Gerente autenticado
Cuando edito la capacidad máxima de un galpón a un valor menor a la
  cantidad de aves que aloja actualmente
Entonces la acción es rechazada, explicando la ocupación actual

Dado un galpón que aloja al menos un lote (tiene una fila abierta en
  HistorialUbicacionLote)
Cuando el Gerente intenta desactivarlo
Entonces la acción es rechazada — un galpón no puede desactivarse
  mientras tenga lotes alojados

Dado un galpón vacío (sin lotes alojados)
Cuando el Gerente lo desactiva
Entonces su estado pasa a INACTIVO y deja de ofrecerse como destino
  posible para alta o mudanza de lotes

Dado un Operario autenticado
Cuando intenta invocar cualquier Server Action de gestión de galpones
Entonces es rechazado por withAuth (rol GERENTE requerido), sin importar
  si llega desde la UI o de forma directa
```

### H3 — Alta de Lote con ubicación inicial (5 pts)
Como Gerente quiero dar de alta un lote nuevo asignándolo de una vez a un
galpón, para que desde el primer momento tenga una ubicación registrada
en el historial, no un lote "flotante" sin ubicación.

```gherkin
Dado que soy Gerente autenticado
Cuando doy de alta un lote con código único, fecha de ingreso, aves
  iniciales y un galpón ACTIVO de destino con capacidad disponible
Entonces se crea el Lote (estado ACTIVO, avesVivas = avesIniciales) y se
  abre su primera fila de HistorialUbicacionLote (fechaEntrada = ahora,
  fechaSalida = null), ambas en la misma transacción

Dado que el código de lote ya existe
Cuando intento darlo de alta
Entonces la acción falla con un error claro, sin crear ninguna fila

Dado un galpón cuya ocupación actual (suma de avesVivas de los lotes ya
  alojados) más las aves iniciales del lote nuevo superan su
  capacidadMaxima
Cuando intento dar de alta el lote en ese galpón
Entonces la acción es rechazada, explicando la ocupación resultante

Dado un galpón con estado INACTIVO
Cuando intento darlo de alta como destino de un lote nuevo
Entonces la acción es rechazada
```

### H4 — Mudanza transaccional de Lote (8 pts)
Como Gerente quiero mudar un lote de un galpón a otro sin perder su
historial de ubicaciones anteriores, para poder reconstruir en cualquier
momento por dónde pasó cada lote.

```gherkin
Dado un lote ACTIVO alojado actualmente en el Galpón A
Cuando el Gerente lo muda al Galpón B (ACTIVO, con capacidad disponible)
Entonces, en la misma transacción, se cierra la fila abierta de
  HistorialUbicacionLote del Galpón A (fechaSalida = ahora) y se abre una
  fila nueva en el Galpón B (fechaEntrada = ahora, fechaSalida = null)

Dado un lote INACTIVO (ya finalizado)
Cuando se intenta mudarlo
Entonces la acción es rechazada — solo se mudan lotes con estado ACTIVO

Dado que el Galpón B ya aloja lotes cuya suma de avesVivas, sumada a las
  avesVivas del lote a mudar, supera su capacidadMaxima
Cuando se intenta la mudanza
Entonces la acción es rechazada explicando la ocupación resultante, y no
  se modifica ninguna fila de HistorialUbicacionLote

Dado que el destino elegido es el mismo galpón donde el lote ya está
  alojado
Cuando se intenta la mudanza
Entonces la acción es rechazada con un mensaje claro ("el lote ya está
  en ese galpón")

Dado un Galpón B con estado INACTIVO
Cuando se intenta mudar un lote hacia él
Entonces la acción es rechazada
```

### H5 — Finalizar lote → INACTIVO (3 pts)
Como Gerente quiero finalizar un lote cuando deja de operarse (venta
total, retiro, o mortalidad completa), para que deje de contar como
ocupación de ningún galpón sin borrar su historial.

```gherkin
Dado un lote ACTIVO
Cuando el Gerente lo finaliza
Entonces su estado pasa a INACTIVO y, en la misma transacción, se cierra
  su fila abierta de HistorialUbicacionLote (fechaSalida = ahora)

Dado un lote ya INACTIVO
Cuando se intenta finalizarlo de nuevo
Entonces la acción es rechazada con un mensaje claro (ya está finalizado)

Dado un lote con avesVivas > 0
Cuando el Gerente lo finaliza
Entonces la acción se permite igual — finalizar no depende de que
  avesVivas sea 0 (decisión de negocio confirmada arriba)
```

### H6 — Vista de ubicación actual (3 pts)
Como Gerente quiero ver de un vistazo dónde está alojado cada lote y qué
aloja cada galpón hoy, sin tener que reconstruir el historial a mano.

```gherkin
Dado que soy Gerente autenticado
Cuando entro a /lotes
Entonces cada fila muestra la ubicación actual del lote (nombre del
  galpón que lo aloja hoy) o un indicador claro de que no tiene ubicación
  abierta (lote finalizado)

Dado que soy Gerente autenticado
Cuando entro a /galpones
Entonces cada fila muestra la ocupación actual del galpón (aves alojadas
  / capacidadMaxima) y los lotes que aloja hoy
```

### H7 — Tests de integridad (3 pts)
Como equipo queremos evidencia automatizada (y, en el caso del índice
único parcial, verificación contra la base real) de que un lote nunca
puede quedar con cero o dos ubicaciones abiertas, y de que las guards de
capacidad/estado rechazan lo que tienen que rechazar.

```gherkin
Dado las guards puras de galpón y lote (capacidad, estado del galpón
  destino, galpón ocupado al desactivar, mudanza al mismo galpón, etc.)
Cuando se ejecutan como tests unitarios
Entonces cada rama (permitido/rechazado) queda cubierta sin necesidad de
  una base de datos real

Dado las Server Actions de galpón y lote invocadas directamente (sin
  pasar por la UI)
Cuando se prueban con sesión OPERARIO, o con inputs que deberían fallar
  (código/capacidad inválida, estado incorrecto)
Entonces son rechazadas por withAuth o por la propia acción, sin llegar a
  ejecutar la mutación (tests de integración con repositories
  mockeados, mismo patrón que tests/integration/actions/usuario.test.ts)

Dado el índice único parcial de HistorialUbicacionLote creado en
  Sprint 0 (S0-5): un mismo loteId no puede tener dos filas con
  fechaSalida IS NULL a la vez
Cuando se verifica en vivo contra la base real (no solo con mocks)
  intentando insertar una segunda fila abierta para el mismo lote
Entonces la base rechaza la operación — confirma que la restricción SQL
  manual sigue vigente y que ni el alta ni la mudanza transaccional
  pueden dejar un lote con cero o dos ubicaciones abiertas
```

## Alcance de este sprint
- Migración de schema: `estado` en `Galpon` (H1).
- CRUD de Galpón: repository, service (guards puras), Zod, Server
  Actions vía `withAuth`, pantalla `/galpones` (tabla + diálogo crear/editar).
- Alta de Lote con ubicación inicial transaccional, validando capacidad y
  estado del galpón destino.
- Mudanza transaccional de Lote entre galpones, validando capacidad y
  estado.
- Finalizar lote → INACTIVO, cerrando su ubicación abierta en la misma
  transacción.
- Pantalla `/lotes` (tabla con ubicación actual, acciones Mudar/Finalizar,
  diálogo de alta).
- `RUTAS_POR_ROL` y `NAV_ITEMS` ampliados con `/galpones` y `/lotes`
  (GERENTE).
- Tests unitarios de las guards puras + tests de integración de las
  Server Actions (mockeadas) + verificación en vivo del índice único
  parcial contra la base real.

## Fuera de alcance
- Editar `codigo`/`fechaIngreso`/`avesIniciales` de un lote ya creado —
  las únicas mutaciones de un Lote existente son Mudar y Finalizar.
  Corregir un dato mal cargado al alta queda fuera (no hay pedido de
  negocio para esto en el roadmap; se puede evaluar en un sprint futuro
  si aparece un caso real).
- Reactivar un lote finalizado (INACTIVO → ACTIVO) — a diferencia de
  Usuario, `estado` de Lote no es un toggle en este sprint.
- Pantalla de detalle separada por Galpón o por Lote (`/galpones/[id]`,
  `/lotes/[id]`) — la "vista de ubicación actual" (H6) se resuelve dentro
  de las mismas tablas de listado, sin navegar a una pantalla aparte.
- Decremento de `avesVivas` por mortalidad — es Sprint 4
  (`RegistroMortalidad`), no este sprint. Acá `avesVivas` solo se setea
  una vez, al dar de alta el lote.
- Registrar quién/cuándo se acercó al límite de capacidad de un galpón
  (alertas, notificaciones) — no está en el roadmap de este sprint.
- Separación de branches dev/main de Neon — riesgo operativo heredado,
  sigue sin resolverse; se reitera porque este sprint crea/edita
  galpones y lotes reales por primera vez desde una UI.

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Igual que en Sprints 1-2: `DATABASE_URL`/`DIRECT_URL` local apunta al
mismo Neon que producción. Probar el CRUD de Galpones/Lotes con cuidado
— no usar nombres/códigos que puedan chocar con estructura real de la
granja si ya hay datos cargados.

### R2 — Capacidad es una validación de aplicación, no un CHECK de base de datos
A diferencia de `InventarioSueltos.cantidad` (que sí tiene un `CHECK
(cantidad >= 0)` a nivel SQL, ver `memory/modelo-datos.md`), la regla de
capacidad de este sprint vive únicamente en `server/services/galpon.ts`.
Es el mismo criterio que ya usa `puedeDesactivarUsuario` (regla de
negocio en la capa de servicio, no en el schema) — aceptable porque la
única vía de escritura es la Server Action (nunca un `INSERT` manual), a
diferencia de `InventarioSueltos`, que si se descuadra no hay forma de
reconstruirlo sin el ledger.

### R3 — AuditLog no atómico con la mutación (heredado del diseño de `withAuth`, Sprint 2)
Mismo trade-off aceptado en Sprint 2: si el proceso muere entre ejecutar
el handler y escribir `AuditLog`, la mutación de negocio (crear galpón,
mudar lote, etc.) queda aplicada sin su fila de auditoría. No es un
riesgo nuevo de este sprint.

### R4 — `Galpon.nombre` sin `@unique`
Ver "Decisiones de diseño adicionales" arriba — si el Product Owner
prefiere unicidad de nombre, es un ajuste de schema a hacer antes de
S3-2, no después.

## Criterio de aceptación general
Dado el repo con Sprint 2 ya desplegado
Cuando el Gerente crea galpones y da de alta lotes asignándolos a un
  galpón inicial
Entonces cada alta respeta la capacidad de aves del galpón y queda
  reflejada en HistorialUbicacionLote
Y cuando el Gerente muda un lote de un galpón a otro, la operación es
  atómica (cierra la ubicación vieja y abre la nueva en la misma
  transacción), respeta la capacidad y el estado del galpón destino, y
  nunca deja al lote sin ubicación abierta o con dos a la vez
Y cuando el Gerente finaliza un lote, su estado pasa a INACTIVO, su
  ubicación se cierra, y deja de contar como ocupación de ningún galpón
Y un Operario no puede ejecutar ninguna de estas acciones ni acceder a
  /galpones ni /lotes (403 en proxy.ts + rechazo en withAuth)
Y las pantallas /galpones y /lotes muestran la ocupación/ubicación actual
  reales, verificadas contra datos reales, no solo contra tests
