# Sprint 4 — Mortalidad y Bitácora

## Sprint Goal
El Operario registra bajas de aves y notas de turno desde el celular, en
campo, con pantallas mobile-first reales (no el patrón de diálogo compacto
de escritorio que usaron Usuarios/Galpones/Lotes) — el conteo de aves vivas
de cada lote se descuenta de forma atómica y nunca puede quedar negativo.

## Contexto previo (leer antes de ejecutar)

### Estado real del schema (verificado antes de planificar, no asumido)
- `model RegistroMortalidad` y `model BitacoraGlobal` **ya existen desde
  Sprint 0** (`prisma/schema.prisma:168-204`), igual que `enum
  TipoMortalidad` (MUERTE/DESCARTE) y `enum CategoriaBitacora`
  (ALIMENTACION/VACUNACION/OBSERVACION). **Este sprint no necesita ninguna
  migración de schema** — a diferencia de Sprint 3 (que sí agregó
  `Galpon.estado`), el DoR ("los modelos que toca ya existen y están
  migrados") ya está satisfecho de entrada.
- `RegistroMortalidad`: `id, loteId, galponId, usuarioId, tipo, cantidad,
  fecha (@default now)`. Las tres relaciones (`lote`, `galpon`, `usuario`)
  son `onDelete: Restrict`. Índice `@@index([loteId, fecha])`.
- `BitacoraGlobal`: `id, fecha (@default now), usuarioId, categoria,
  contenido`. **Sin `galponId`** (D2, ya cerrada — ver
  `memory/decisiones-tecnicas.md`). Índices `@@index([fecha])` y
  `@@index([categoria])`.
- `Lote.avesVivas` (Int) ya existe desde Sprint 0 y ya se lee/escribe desde
  Sprint 3 (`avesVivas = avesIniciales` al dar de alta). Este sprint es el
  **primero que lo decrementa** — nadie más lo toca todavía.
- Piezas de `server/repositories/lote.ts` y `server/services/lote.ts` que
  este sprint reusa tal cual, sin reinventarlas:
  - `buscarUbicacionActual(loteId)` — ya resuelve la fila abierta de
    `HistorialUbicacionLote` de un lote (Sprint 3). Este sprint la usa
    para resolver el `galponId` de cada `RegistroMortalidad` sin pedírselo
    al operario (ver decisión de negocio abajo).
  - `buscarLotePorId(id)`.
  - `calcularEdadEnSemanas()` (post-Sprint 3) — no hace falta para este
    sprint (ni Mortalidad ni Bitácora muestran edad de lote), pero se
    señala que existe por si una pantalla futura lo necesita.
  - **No existe todavía** una función simple "lotes ACTIVOS para poblar un
    `<Select>`" (equivalente a `listarGalponesActivos()` de
    `server/repositories/galpon.ts`) — este sprint la agrega
    (`listarLotesActivos()`).
- Componentes de UI ya disponibles: `<PageHeader>`, `<TableScrollArea>`,
  `<DataTablePagination>` (10 filas/página), sistema de toasts
  (`toastManager`), `<Badge>`, `<Select>`. **Novedad de este sprint:**
  `<Sheet>` (`components/ui/sheet.tsx`) ya existe (usado hoy solo para el
  drawer del Sidebar mobile) pero **nunca se usó como formulario de
  registro** — este sprint es el primero en reusarlo con `side="bottom"`
  para las dos acciones rápidas de campo (nueva mortalidad, nueva nota),
  en vez de `<Dialog>` (que sigue siendo el patrón correcto para
  pantallas de gestión de escritorio como Usuarios/Galpones/Lotes, no se
  reemplaza ahí).
- `idUuid()` (`lib/zod/comun.ts`, agregado post-Sprint 3) es obligatorio
  para cualquier id nuevo en un schema Zod de este sprint — nunca
  `z.string().uuid()` directo (Zod v4 rechaza ids sembrados a mano, ver
  Bug 1 de Sprint 3 en `memory/estado-proyecto.md`).
- Cualquier badge de estado nuevo que combine una clase de `globals.css`
  con un `variant` de `<Badge>` necesita `!` en cada utilidad de esa clase
  (ver Bug de "Inactivo se veía amber" en `memory/estado-proyecto.md`) —
  este sprint no agrega badges de estado nuevos (Mortalidad y Bitácora no
  tienen campo `estado`), pero si el badge de `TipoMortalidad` o
  `CategoriaBitacora` termina compartiendo `globals.css` con un `variant`,
  aplica la misma regla.
- **`memory/definition-of-done.md` sigue sin existir** (cuarto sprint
  seguido que lo señala). Este sprint se verifica contra `CLAUDE.md` +
  el mismo estándar aplicado en Sprints 1-3.

### Por qué este sprint es distinto de los anteriores
Sprints 1-3 construyeron pantallas de **gestión de Gerente**: tablas
paginadas, diálogos compactos, casi siempre en escritorio (aunque
responsive). Mortalidad y Bitácora son las primeras pantallas pensadas
**primero para el Operario, en el celular, en el galpón** — con
potencialmente mala señal, luz solar directa (ya cubierto por `html {
font-size: 18px }` y los targets táctiles `h-12`/`h-14` de
`ui/button.tsx`, ver `memory/estado-proyecto.md`) y la necesidad de
registrar rápido, no navegar entre pantallas. Esto empuja dos decisiones
de diseño explícitas en `plan.md`:
1. El formulario de alta (mortalidad o nota) se abre en un `<Sheet
   side="bottom">` de una sola acción, no un `<Dialog>` centrado — más
   parecido a una hoja de acción nativa de celular.
2. **Este sprint NO implementa cola offline.** `memory/convenciones.md`
   ya declara el "Contrato Offline-Ready" como **obligatorio recién desde
   Sprint 5 en adelante** (IndexedDB/Dexie es explícitamente Sprint 14).
   Registrar mortalidad o una nota sin señal en este sprint falla con un
   error claro (mismo comportamiento que cualquier Server Action de
   Sprints 1-3) — no se encola para reintentar sola. **Se señala esto
   explícitamente para que el Product Owner pueda objetarlo**: si "muchas
   veces sin señal" significa que el Operario necesita poder registrar
   *ahora* y que se sincronice después, eso es Sprint 5+ (offline-ready) o
   Sprint 14 (cola real), no este sprint.

### Decisiones de negocio confirmadas por el Product Owner antes de esta planificación
Cuatro preguntas que el roadmap no resolvía (mismo criterio de
`definition-of-ready.md`: no asumir reglas de negocio sin confirmar):

1. **MUERTE y DESCARTE decrementan `avesVivas` de la misma forma.** El
   campo `tipo` es informativo/reportable (para distinguir mortalidad
   natural/enfermedad de descarte sanitario en reportes futuros), no
   cambia la aritmética — un ave que muere o se descarta deja de estar
   viva en el lote de todas formas.
2. **Sobregiro: se rechaza la operación, no se limita a 0.** Mismo
   criterio que las guards de capacidad de Sprint 3
   (`puedeAlojarEnGalpon`): si `cantidad > avesVivas`, la acción falla con
   un mensaje explicando cuántas aves vivas quedan, sin modificar nada.
   El operario corrige y reintenta — no se pierde el intento ni se
   silencia el error.
3. **El galpón de un `RegistroMortalidad` se resuelve automáticamente**
   vía `buscarUbicacionActual(loteId)` — el operario solo elige el lote,
   nunca un galpón a mano. Elimina la posibilidad de registrar mortalidad
   contra un galpón donde el lote ya no está (por ejemplo, después de una
   mudanza que Sprint 3 ya permite).
4. **Solo se puede registrar mortalidad de un lote `ACTIVO`.** Mismo
   criterio que `puedeMudarLote`/`puedeFinalizarLote` de Sprint 3: un lote
   `INACTIVO` ya cerró su ubicación (no tiene `galponId` que resolver) y
   finalizar es una acción terminal — no tiene sentido seguir dándole
   bajas después.

### Decisiones de diseño adicionales tomadas en esta planificación
Corolarios técnicos de lo confirmado arriba, documentados para que el
Product Owner pueda objetarlos antes de ejecutar (mismo criterio que
Sprint 2 y 3 usaron con sus "Asunción a confirmar"):

- **`/mortalidad` y `/bitacora` quedan abiertas a ambos roles** (GERENTE y
  OPERARIO), sin entrada en `RUTAS_POR_ROL` — a diferencia de
  `/usuarios`/`/galpones`/`/lotes` (solo GERENTE). El roadmap dice
  "operario registra", pero no hay motivo de negocio para impedirle al
  Gerente registrar también (por ejemplo, si está presente en el galpón
  ese día) ni para esconderle al Gerente el historial. Es el primer
  módulo del proyecto sin restricción de rol.
- **Decremento atómico con guard anti-carrera a nivel de base de datos**
  (`UPDATE ... WHERE avesVivas >= cantidad`, no un simple `decrement` a
  ciegas) — necesario porque dos registros simultáneos del mismo lote
  (dos operarios, o un doble-tap) podrían, sin este guard, dejar
  `avesVivas` negativo pese a que la guard de aplicación
  (`puedeRegistrarMortalidad`) haya pasado con datos ya desactualizados
  medio segundo antes. **Esto es la primera vez que el proyecto necesita
  una transacción interactiva** (`prisma.$transaction(async (tx) =>
  ...)`) en vez del "array-form" que usaron todas las transacciones de
  Sprint 2-3 — el array-form no puede decidir "si esta primera operación
  afectó 0 filas, no ejecutes la segunda". Ver el detalle completo y el
  porqué en `plan.md`. El roadmap de Sprint 9 (`Update condicional
  anti-doble-venta`) va a necesitar exactamente este mismo patrón después.
- **Bitácora usa paginación por cursor (scroll infinito), no por página
  (`?page=N`)** — a diferencia de toda tabla de gestión del proyecto hasta
  ahora (`memory/convenciones.md`, "Paginación de tablas de datos", que
  fija 10 filas/página vía URL). El roadmap pide explícitamente "muro
  cronológico con scroll infinito" para Bitácora — es un feed, no una
  tabla de gestión, y el patrón de paginación de Usuarios/Galpones/Lotes
  no aplica ahí. **`memory/convenciones.md` se actualiza en este sprint**
  con una sección nueva documentando cuándo usar cada patrón (tabla
  paginada vs. muro con scroll infinito), para no dejar la decisión sin
  registrar.
- **El fetch adicional del scroll infinito de Bitácora no pasa por
  `withAuth`.** `withAuth` está diseñado para mutaciones con auditoría
  (`entidad` + `entidadId` + `AuditLog`) — no calza con una lectura
  paginada sin una única entidad afectada, y pasar cada "cargar más" por
  ahí ensuciaría `AuditLog` con decenas de filas `LISTAR` por sesión de
  scroll, un ruido que ese modelo no está pensado para absorber. En su
  lugar, `server/actions/bitacora.ts` expone `obtenerMasBitacora` como una
  Server Action liviana que verifica sesión a mano (`auth()`) y valida con
  Zod, sin escribir `AuditLog` — mismo criterio que ya aplican los propios
  Server Components de página (`listarLotesConUbicacion`, etc., tampoco
  pasan por `withAuth` ni dejan auditoría, son lecturas). **Esto acota
  la regla de `memory/convenciones.md` ("toda Server Action pasa por
  withAuth") a mutaciones, no a lecturas** — se corrige esa redacción en
  el mismo cambio.
- **Bitácora no implementa búsqueda de texto libre sobre `contenido`.**
  `memory/decisiones-tecnicas.md` (D2) menciona "búsqueda por texto libre
  (`ILIKE`)" como el mecanismo de búsqueda de Bitácora en general, pero el
  roadmap de Sprint 4 solo pide "filtro por categoría/fecha" — la búsqueda
  de texto libre queda fuera de este sprint (ver "Fuera de alcance").
- **No hay edición ni reversión de `RegistroMortalidad` ni
  `BitacoraGlobal` en este sprint.** La "ventana de gracia de 10 minutos"
  para corregir un error de tipeo es explícitamente Sprint 6 del roadmap
  (`RegistroRecoleccion.revertido`, con su propio botón "Corregir último
  registro") — ninguno de los dos modelos de este sprint tiene un campo
  `revertido`. Un registro mal cargado queda así hasta que exista esa
  pieza.

## Historias de usuario

### H1 — Registrar mortalidad con decremento atómico de `avesVivas` (8 pts)
Como Operario (o Gerente) quiero registrar una baja de aves de un lote
activo desde el celular, para que `avesVivas` quede al día de inmediato y
nunca pueda quedar negativo, aunque dos personas registren al mismo tiempo.

```gherkin
Dado un lote ACTIVO con 500 aves vivas, alojado hoy en el Galpón A
Cuando registro una mortalidad de tipo MUERTE por 3 aves
Entonces se crea un RegistroMortalidad (loteId, galponId = Galpón A
  resuelto automáticamente, tipo MUERTE, cantidad 3, usuarioId, fecha =
  ahora) y Lote.avesVivas pasa a 497, ambas en la misma transacción

Dado el mismo lote, ahora con 497 aves vivas
Cuando registro una mortalidad de tipo DESCARTE por 2 aves
Entonces avesVivas pasa a 495 — DESCARTE decrementa exactamente igual que
  MUERTE (decisión de negocio confirmada)

Dado un lote ACTIVO con 5 aves vivas
Cuando intento registrar una mortalidad de 10 aves
Entonces la acción es rechazada explicando que solo quedan 5 aves vivas,
  y no se crea ningún RegistroMortalidad ni se modifica avesVivas

Dado un lote ACTIVO con 5 aves vivas, y una guard de aplicación que ya
  validó que 5 aves es una cantidad permitida
Cuando, entre la validación y la escritura, otro registro simultáneo ya
  descontó esas 5 aves (avesVivas real es ahora 0)
Entonces la escritura condicional a nivel de base de datos (UPDATE ...
  WHERE avesVivas >= cantidad) rechaza la operación igual, sin dejar
  avesVivas en negativo ni crear un RegistroMortalidad huérfano

Dado un lote INACTIVO (ya finalizado)
Cuando intento registrarle una mortalidad
Entonces la acción es rechazada — solo lotes ACTIVOS aceptan mortalidad

Dado un lote ACTIVO que fue mudado del Galpón A al Galpón B esta mañana
Cuando registro una mortalidad esta tarde
Entonces el RegistroMortalidad queda con galponId = Galpón B (la
  ubicación actual real, resuelta por buscarUbicacionActual), sin que el
  operario haya tenido que elegir un galpón
```

### H2 — Listado de Mortalidad (3 pts)
Como Gerente u Operario quiero ver el historial de mortalidad registrada,
para llevar control de las bajas de cada lote.

```gherkin
Dado que soy un usuario autenticado (cualquier rol)
Cuando entro a /mortalidad
Entonces veo una tabla paginada (10 filas) con fecha, código de lote,
  tipo, cantidad y quién lo registró, más el formulario/acceso rápido
  para registrar una nueva baja

Dado un Operario autenticado
Cuando entro a /mortalidad
Entonces no soy rechazado — esta pantalla no está restringida por rol
  (a diferencia de /usuarios, /galpones, /lotes)
```

### H3 — Alta de nota de Bitácora (3 pts)
Como Operario (o Gerente) quiero dejar una nota de turno con una
categoría, para que quede un registro cronológico de lo que pasó en la
granja sin tener que elegir un galpón.

```gherkin
Dado que soy un usuario autenticado (cualquier rol)
Cuando escribo una nota con categoría ALIMENTACION, VACUNACION u
  OBSERVACION y un contenido no vacío
Entonces se crea un BitacoraGlobal (fecha = ahora, usuarioId, categoria,
  contenido) — sin ningún campo de galpón (D2)

Dado un contenido vacío o solo espacios
Cuando intento guardar la nota
Entonces la acción es rechazada por el schema Zod antes de tocar la base
```

### H4 — Muro cronológico de Bitácora con scroll infinito (5 pts)
Como usuario quiero desplazarme por las notas más recientes sin tener que
pedir "página siguiente", para revisar el turno como si fuera un feed.

```gherkin
Dado que existen más de una tanda de notas de Bitácora
Cuando entro a /bitacora
Entonces veo la primera tanda (más recientes primero) y, al llegar al
  final de la lista visible, se carga la tanda siguiente automáticamente
  sin recargar la página

Dado que ya se cargaron todas las notas existentes
Cuando llego al final del muro
Entonces no se dispara ningún fetch adicional (no hay "página infinita"
  de resultados vacíos en bucle)
```

### H5 — Filtro de Bitácora por categoría y fecha (3 pts)
Como usuario quiero filtrar el muro por categoría o por rango de fechas,
para encontrar notas de un tema o un período específico sin desplazarme
por todo el historial.

```gherkin
Dado el muro de Bitácora con notas de varias categorías
Cuando elijo el filtro "VACUNACION"
Entonces el muro (y el scroll infinito que sigue cargando) solo trae
  notas de esa categoría

Dado el muro de Bitácora
Cuando elijo un rango de fechas (desde/hasta)
Entonces el muro solo trae notas dentro de ese rango, combinable con el
  filtro de categoría

Dado un filtro aplicado
Cuando la URL se comparte o se recarga la página
Entonces el filtro persiste (va en la URL, ?categoria=...&desde=...&hasta=...)
```

### H6 — Tests de integridad (3 pts)
Como equipo queremos evidencia automatizada de que el guard de
`avesVivas` nunca deja un valor negativo (ni siquiera en carrera), y de
que las guards de estado/cantidad rechazan lo que tienen que rechazar.

```gherkin
Dado las guards puras de mortalidad (estado del lote, cantidad vs.
  avesVivas)
Cuando se ejecutan como tests unitarios
Entonces cada rama (permitido/rechazado, incluida cantidad == avesVivas
  exacto) queda cubierta sin necesidad de una base de datos real

Dado las Server Actions de mortalidad y bitácora invocadas directamente
Cuando se prueban con inputs inválidos, lote inexistente/INACTIVO, o
  cantidad mayor a avesVivas
Entonces son rechazadas por la propia acción sin llegar a escribir nada
  (tests de integración con repositories mockeados)

Dado la transacción interactiva de registrarMortalidadYDescontarAves
Cuando el UPDATE condicional afecta 0 filas (simulando la carrera)
Entonces la transacción completa aborta — no queda ni el decremento ni el
  RegistroMortalidad — verificado con un test de integración que mockea
  ese resultado, y en vivo contra Neon real forzando el escenario
```

## Alcance de este sprint
- `server/repositories/mortalidad.ts`,
  `server/services/mortalidad.ts` (guard pura +
  `registrarMortalidadYDescontarAves` transaccional), `lib/zod/mortalidad.ts`,
  `server/actions/mortalidad.ts` (`registrarMortalidad`, vía `withAuth`
  sin restricción de rol).
- `listarLotesActivos()` nuevo en `server/repositories/lote.ts` (poblar el
  `<Select>` de lote en el formulario de mortalidad).
- Pantalla `/mortalidad`: tabla paginada (10 filas, `<DataTablePagination>`)
  + `<Sheet side="bottom">` de alta rápida.
- `server/repositories/bitacora.ts` (`crearNotaBitacora`,
  `listarBitacoraPagina` con cursor + filtros), `server/services/bitacora.ts`
  si hace falta alguna guard pura, `lib/zod/bitacora.ts`,
  `server/actions/bitacora.ts` (`crearNotaBitacora` vía `withAuth`;
  `obtenerMasBitacora` como Server Action liviana sin `withAuth`, ver
  decisión de diseño arriba).
- Pantalla `/bitacora`: muro cronológico con scroll infinito (cursor),
  filtros de categoría/fecha en la URL, `<Sheet side="bottom">` de alta
  rápida de nota.
- `NAV_ITEMS` ampliado con "Mortalidad" y "Bitácora" (sin entrada nueva en
  `RUTAS_POR_ROL` — ambas rutas quedan abiertas a los dos roles).
- `memory/convenciones.md` actualizado: sección nueva sobre cuándo usar
  tabla paginada vs. muro con scroll infinito, y la aclaración de que
  `withAuth` es para mutaciones, no para lecturas.
- Tests unitarios de la guard pura de mortalidad + tests de integración de
  ambos módulos de actions (repositories mockeados) + verificación en vivo
  contra Neon real del guard anti-carrera y del flujo completo de ambas
  pantallas.

## Fuera de alcance
- Cola offline / registro sin señal con sincronización posterior — Sprint
  5 (contrato offline-ready) y Sprint 14 (cola real con IndexedDB) del
  roadmap, no este sprint (ver "Por qué este sprint es distinto" arriba).
- Editar o revertir un `RegistroMortalidad` o una nota de `BitacoraGlobal`
  ya creados — la ventana de gracia de 10 minutos es Sprint 6.
- Búsqueda de texto libre sobre `contenido` de Bitácora (D2 la menciona
  como mecanismo posible, pero el roadmap de este sprint solo pide filtro
  de categoría/fecha).
- Chips de selección de galpón en Bitácora — descartado explícitamente
  por D2 (`BitacoraGalpon` no existe).
- Cualquier reporte, gráfico o exportación de mortalidad (tendencias,
  totales por período) — eso es Sprint 15 (Dashboard y reportes).
- Notificaciones o alertas por mortalidad alta — no está en el roadmap de
  este sprint.
- Editar `RUTAS_POR_ROL` para restringir `/mortalidad`/`/bitacora` a un
  rol — decisión de diseño confirmada arriba, quedan abiertas a ambos.

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Igual que Sprints 1-3. Probar con lotes/galpones de prueba, no con
estructura real de la granja si ya hay datos cargados — este sprint es el
primero que **decrementa** un valor real (`avesVivas`), no solo lo crea,
así que un error de prueba contra datos reales sería más difícil de
deshacer a mano que crear una fila de más.

### R2 — Primera transacción interactiva del proyecto
Ver la decisión de diseño arriba y el detalle en `plan.md`. Es una pieza
nueva de arquitectura (no solo una feature) — se documenta explícitamente
para que sprints futuros con la misma necesidad (Sprint 9, anti-doble
venta) la reusen en vez de reinventarla.

### R3 — AuditLog no atómico con la mutación (heredado del diseño de `withAuth`)
Mismo trade-off aceptado desde Sprint 2: si el proceso muere entre el
handler y `AuditLog`, la mutación de negocio queda aplicada sin su fila de
auditoría.

### R4 — Verificación mobile pixel a pixel
`resize_window` de la extensión Claude in Chrome no cambia el viewport
lógico real en este entorno (confirmado en Sprints 1-3). Dado que este
sprint es el primero con pantallas realmente pensadas para el Operario en
campo (no solo "responsive" de una pantalla de Gerente), la verificación
visual real en un celular físico importa más que en sprints anteriores —
ver `tasks.md` para el plan de verificación.

## Criterio de aceptación general
Dado el repo con Sprint 3 ya desplegado
Cuando un Operario o Gerente registra una mortalidad de un lote ACTIVO
Entonces avesVivas se decrementa exactamente en la cantidad indicada, en
  la misma transacción que crea el RegistroMortalidad, contra el galpón
  donde el lote está alojado hoy (resuelto automático, no elegido a mano)
Y un intento de registrar más mortalidad que aves vivas hay es rechazado
  sin modificar nada, incluso bajo una condición de carrera simulada
Y un lote INACTIVO no acepta mortalidad
Y cualquier usuario autenticado (GERENTE u OPERARIO) puede escribir una
  nota de Bitácora con categoría y ver el muro cronológico de notas,
  filtrable por categoría y rango de fechas, cargando más notas
  automáticamente al llegar al final sin recargar la página
Y ambas pantallas (/mortalidad, /bitacora) son verificadas en mobile real
  (celular físico o extensión de navegador), no solo en tests
