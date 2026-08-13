# Sprint 8 — Clientes y Precio por Kilo

## Sprint Goal
El catálogo comercial queda listo para que Sprint 9 (POS) pueda apoyarse en
él: un Gerente o un Operario puede dar de alta y mantener clientes reales
(con "Público General" protegido como el cliente de mostrador del sistema),
y un Gerente puede fijar un nuevo precio por kilo sin perder nunca el
histórico — cada cambio de precio es una fila nueva, jamás un `UPDATE`.

## Contexto previo — qué ya existe desde Sprint 0, qué es nuevo acá
Este sprint **no parte de cero a nivel de schema** — a diferencia de Sprint 7,
acá no hace falta ninguna migración (ver "Hallazgo real" más abajo). Lo que sí
es nuevo es toda la capa de aplicación (repository/action/UI) sobre dos
modelos que existen desde Sprint 0 pero que hasta ahora no tenían ningún
código real encima:

- **`model Cliente`** (`id`, `nombre`, `celular?`, `direccion?`, `tipo`
  `TipoCliente`, `estado` `EstadoCliente`) — sin ningún campo `@unique`, a
  diferencia de `Usuario.usuario`/`Lote.codigo`/`Galpon.nombre`... espera,
  `Galpon.nombre` tampoco es único (Sprint 3, "nada lo pedía") — `Cliente` es
  exactamente el mismo caso: cae de lleno en el tercer caso de la regla de
  idempotencia de `memory/convenciones.md`, mismo tratamiento que ya recibió
  `Galpon` en la auditoría post-Sprint 5 (`crearGalpon` es la referencia
  directa a reusar, ver `plan.md`).
- **`CLIENTE_PUBLICO_GENERAL_ID`** (`lib/constants.ts`) — ya sembrado en
  `prisma/seed.ts` (`nombre: "Público General"`, `tipo: "EVENTUAL"`,
  `estado: ACTIVO` por default), confirmado releyendo el seed real, no
  asumido. Es un registro de producción, no un dato de prueba — sigue
  existiendo también después de separar los branches de Neon (ver
  `memory/estado-proyecto.md`, "Pregunta del Product Owner: ¿se puede limpiar
  la base...?").
- **`model PrecioKilo`** (`id`, `precio` `Decimal(10,2)`, `vigenteDesde`
  `@default(now())`, `usuarioId`) — sin campo `vigenteHasta`: el precio
  "vigente" se resuelve siempre leyendo la fila más reciente por
  `vigenteDesde`, nunca hay un `UPDATE` sobre una fila existente (roadmap:
  "nueva fila, nunca UPDATE"). También sin ningún código real encima todavía;
  el seed ya siembra una fila inicial.
- **`<DataTablePagination>`, patrón de filtro colapsable
  (`MortalidadFiltros`/`RecoleccionFiltros`), `idUuid()`, `withAuth`,
  `<Dialog>` centrado + subcomponente de formulario montado solo mientras
  `open` (`GalponFormDialog`/`LoteFormDialog`)** — todos reusables tal cual,
  sin ningún cambio de infraestructura.

**Lo que este sprint SÍ construye** (alcance real):
1. CRUD completo de Cliente (crear, editar, cambiar estado
   ACTIVO/SUSPENDIDO — nunca `DELETE` físico, mismo criterio que toda
   entidad de negocio del proyecto) con idempotencia por id de cliente
   completa, porque no hay ninguna unicidad de negocio gratis que la
   reemplace.
2. Guard "Público General": no editable, no se puede suspender — protegido
   tanto en la Server Action (autoritativo) como en la UI (deshabilitado a
   simple vista).
3. Búsqueda de clientes por nombre/celular, integrada a la tabla paginada.
4. Alta de `PrecioKilo` histórico (solo insertar, nunca actualizar) +
   pantalla que muestra el precio vigente hoy, restringida a GERENTE.

## Hallazgo real durante esta planificación: NO hace falta migración de schema
A diferencia de Sprint 7 (que sí necesitó un modelo nuevo), este sprint
**confirma, releyendo `prisma/schema.prisma` real, que ambos modelos ya
tienen todo lo que este sprint necesita**:
- `Cliente` y `PrecioKilo` no ganan ningún campo nuevo.
- `TipoCliente`/`EstadoCliente` ya tienen los valores exactos que este sprint
  expone en el `<Select>` — no hace falta tocar ningún enum.

**Decisión de diseño tomada en esta planificación (sin migración): `Cliente`
no gana campos de timestamp (`creadoEn`/`creadoEnCliente`).** El Contrato
Offline-Ready completo (`memory/convenciones.md`) exige esos dos campos para
una entidad que un Operario puede crear en campo sin señal — y este sprint
sí confirma que un Operario puede dar de alta un Cliente (ver decisión de
rol más abajo). Pero ese contrato completo solo importa hoy para entidades
con una ventana de tiempo real que dependa de la hora exacta del servidor
(la ventana de gracia de 10 minutos de Mortalidad/Recolección) — Cliente no
tiene ninguna ventana de ese tipo en este sprint. El precedente directo es
`Galpon` (Sprint 3): también sin `@unique`, también protegido con id de
cliente + idempotencia desde la auditoría post-Sprint 5, y **tampoco** tiene
`creadoEn`/`creadoEnCliente` — nadie lo necesitó. Se sigue el mismo criterio
acá: **solo** la mitad obligatoria de la regla ("Idempotencia por id de
cliente: obligatoria en TODA creación", que aplica siempre, esté o no la
entidad pensada para uso offline) se implementa este sprint; si un sprint
futuro necesita saber "cuándo se dio de alta este cliente" con precisión de
reloj de servidor, se agrega entonces — no se anticipa sin un consumidor
real, mismo espíritu que "campos calculados: nunca se guardan valores que no
hace falta guardar" de `memory/modelo-datos.md`. Confirmable en cualquier
momento de forma aproximada vía `AuditLog` (que sí tiene su propio
timestamp), si hiciera falta.

**PrecioKilo tampoco gana campos.** `vigenteDesde @default(now())` ya
resuelve tanto el orden histórico como el sentido de "vigente" (fila con
`vigenteDesde` más reciente) sin ningún campo adicional.

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md`, `memory/stack-tecnologico.md`,
`memory/arquitectura.md`, `memory/modelo-datos.md`, `memory/convenciones.md`
(en particular "Idempotencia por id de cliente: obligatoria en TODA
creación" e "Paginación de tablas de datos"/"Tabla paginada vs. muro con
scroll infinito"), `memory/decisiones-tecnicas.md` (D1–D6),
`memory/definition-of-ready.md`, `memory/estado-proyecto.md` completo
(en particular "Sprint 7 — Consolidación de residuos" y "Cómo continuar
desde acá"), `specs/roadmap-completo.md` (sección Sprint 8), y
`specs/sprint-07-consolidacion-residuos/` completo (spec.md, plan.md,
tasks.md — plantilla de estructura y nivel de detalle de este documento).
También se releyó el código real de `prisma/schema.prisma` (modelos
`Cliente`/`PrecioKilo` y los enums `TipoCliente`/`EstadoCliente`),
`prisma/seed.ts` (confirmando `CLIENTE_PUBLICO_GENERAL_ID` y el
`PrecioKilo` inicial ya sembrados), `src/lib/constants.ts`,
`server/actions/galpon.ts` + `server/repositories/galpon.ts` (referencia
directa del patrón completo de idempotencia sobre una entidad sin
unicidad de negocio), `server/auth/with-auth.ts`, `server/auth/rbac.ts`,
`components/layout/nav-items.ts`, `components/ui/data-table-pagination.tsx`,
`components/domain/mortalidad/mortalidad-filtros.tsx` (referencia de filtro
dirigido por URL) y `components/domain/galpones/galpon-form-dialog.tsx`
(referencia de formulario simple, sin arreglos de longitud variable — a
diferencia de Recolección/Consolidación, este sprint no necesita
`startTransition` a mano, alcanza con `<form action={formAction}>` directo).

## Decisiones de negocio confirmadas por el Product Owner antes de esta planificación
Seis preguntas que el roadmap no resolvía, confirmadas explícitamente antes
de diseñar (mismo criterio de `definition-of-ready.md` ya usado en Sprints
3-7):

1. **Rol de "Clientes" (CRUD): GERENTE y OPERARIO por igual.** Mismo
   criterio que Mortalidad/Recolección/Consolidación — es trabajo operativo,
   no solo administración de catálogo. El Operario ya opera el POS
   (`memory/mision.md`) y en Sprint 9 va a necesitar dar de alta un cliente
   nuevo en el momento de una venta — dejarlo restringido a GERENTE ahora
   solo para tener que abrirlo después no aporta nada. Ninguna pieza de
   Cliente entra en `RUTAS_POR_ROL`.
2. **Rol de "Precio por Kilo" (alta de precio nuevo): solo GERENTE.**
   Cambiar el precio de venta de la granja es una decisión financiera, no
   una tarea operativa de campo — mismo criterio que Usuarios/Galpones/Lotes
   (catálogos de administración restringidos). `/precio-kilo` entra en
   `RUTAS_POR_ROL` con `["GERENTE"]`.
3. **Guard "Público General": se resuelve comparando el id contra
   `CLIENTE_PUBLICO_GENERAL_ID` a mano en la Server Action, sin campo nuevo
   en el modelo.** Mismo espíritu que el guard de "último Gerente" en
   `usuario.ts` — una constante fija comparada explícitamente, no un flag de
   schema. Sin migración. Ver "Riesgos" (R3) para la limitación conocida de
   este enfoque si en el futuro apareciera un segundo "cliente especial".
4. **`TipoCliente` expone los 3 valores desde este sprint —
   `MAYORISTA`/`MINORISTA`/`EVENTUAL`.** Confirmado con el Product Owner el
   sentido real de cada uno, no solo "está en el schema":
   `MAYORISTA`/`MINORISTA` son clientes registrados de verdad (con datos
   propios — nombre, celular, dirección; la distinción entre ambos es
   volumen/frecuencia de compra, no estructura de datos). `EVENTUAL` es el
   tipo para ventas ocasionales/de mostrador sin un registro completo
   detrás — exactamente el rol que "Público General" ya cumple en el seed
   (`tipo: "EVENTUAL"`, confirmado releyendo `prisma/seed.ts`), y también
   aplica a cualquier otro comprador ocasional real que un Operario decida
   registrar igual (sin que tenga que ser, específicamente, el cliente de
   sistema). No hay conflicto entre "Público General es EVENTUAL" y "un
   comprador ocasional cualquiera también puede ser EVENTUAL" — el tipo
   describe la relación comercial, `CLIENTE_PUBLICO_GENERAL_ID` sigue siendo
   el único id especial protegido por el guard de la decisión 3.
5. **Búsqueda de clientes: filtro de texto simple en la tabla de gestión,
   mismo patrón que `MortalidadFiltros`.** Un solo `<input>` contra
   `nombre`/`celular` (`OR` + `contains` insensible a mayúsculas), dirigido
   por URL, sin `page` al cambiar (mismo criterio ya establecido en
   `memory/convenciones.md`). Un endpoint liviano pensando en el autocomplete
   del selector de cliente del POS es trabajo de Sprint 9, cuando exista ese
   consumidor real — construirlo ahora sin saber qué necesita el POS
   arriesga tener que rediseñarlo.
6. **Historial completo de `PrecioKilo`: sin pantalla propia este sprint.**
   Solo importa "cuál es el precio vigente hoy, y quién/cuándo lo fijó" — la
   tabla completa del histórico no tiene ningún consumidor real todavía
   (ni reporte, ni pantalla) hasta que exista el POS que la necesite. La
   fila histórica de todos modos queda persistida desde este sprint (nunca
   se pierde), solo no se expone en una pantalla propia todavía.

## Historias de usuario

### H1 — CRUD Cliente completo (8 pts)
Como Gerente u Operario quiero crear, editar y suspender/reactivar clientes,
para mantener un catálogo real de a quién le vende la granja.

```gherkin
Dado que soy un Gerente u Operario autenticado
Cuando abro "Nuevo cliente", completo nombre "Distribuidora El Sol",
  tipo "MAYORISTA" y celular "987654321", y guardo
Entonces se crea un Cliente con estado ACTIVO, aparece en la tabla de
  /clientes, y queda una fila real en AuditLog (entidad Cliente, acción CREAR)

Dado un Cliente ya creado
Cuando lo edito y le cambio la dirección, dejando el resto igual
Entonces se actualiza solo ese campo, y AuditLog registra estadoAntes/
  estadoDespues con los valores reales

Dado un Cliente en estado ACTIVO
Cuando hago clic en "Suspender"
Entonces su estado pasa a SUSPENDIDO, la tabla lo refleja con el badge de
  estado correspondiente (misma receta visual que "Inactivo" en Usuario/
  Galpon/Lote)

Dado un Cliente en estado SUSPENDIDO
Cuando hago clic en "Activar"
Entonces su estado vuelve a ACTIVO

Dado que el formulario de "Nuevo cliente" se envía dos veces con el mismo id
  generado en el cliente (doble clic o reintento de red)
Cuando la segunda petición llega al servidor
Entonces responde éxito idempotente con el Cliente ya creado, sin duplicar
  la fila

Dado el mismo escenario, pero la segunda petición trae un nombre distinto al
  de la primera (mismo id)
Cuando se ejecuta
Entonces se rechaza explícito ("ya existe un registro con este id pero con
  datos diferentes — no se sobrescribe"), sin tocar lo ya persistido
```

### H2 — Búsqueda de clientes por nombre o celular (2 pts)
Como Gerente u Operario quiero escribir parte de un nombre o número de
celular y encontrar el cliente sin recorrer toda la tabla.

```gherkin
Dado 15 clientes sembrados, 3 de ellos con "Sol" en el nombre
Cuando escribo "Sol" en el campo de búsqueda de /clientes
Entonces la tabla muestra solo esos 3, con la paginación recalculada sobre
  el subconjunto filtrado (no sobre las 15 filas totales)

Dado el mismo escenario
Cuando busco por un fragmento de celular en vez de nombre
Entonces también encuentra coincidencias (la búsqueda combina nombre O
  celular con un solo texto)

Dado que ya hay un texto de búsqueda activo en la URL
Cuando lo borro
Entonces vuelvo a ver la lista completa paginada, sin el filtro
```

### H3 — Guard "Público General": no editable, no suspendible (3 pts)
Como equipo queremos que el cliente de mostrador del sistema
(`CLIENTE_PUBLICO_GENERAL_ID`) nunca pueda quedar editado por error ni
suspendido, porque el POS (Sprint 9) depende de que siga existiendo,
ACTIVO, con sus datos originales.

```gherkin
Dado que entro a /clientes
Cuando veo la fila de "Público General"
Entonces sus acciones de "Editar"/"Suspender" aparecen deshabilitadas
  (con una nota explicando que es un cliente del sistema), no ausentes sin
  explicación

Dado que alguien invoca editarCliente directamente con
  CLIENTE_PUBLICO_GENERAL_ID (sin pasar por la UI — payload manipulado o
  API llamada a mano)
Cuando se ejecuta la Server Action
Entonces rechaza con un error explícito ("Público General no se puede
  editar"), sin modificar el registro

Dado el mismo caso con cambiarEstadoClienteAction intentando SUSPENDIDO
Cuando se ejecuta
Entonces rechaza igual, "Público General" permanece ACTIVO con sus datos
  originales intactos
```

### H4 — PrecioKilo histórico: alta y precio vigente (5 pts)
Como Gerente quiero fijar un precio por kilo nuevo sin perder el anterior,
para que el histórico completo de cuánto cobró la granja en cada momento
quede siempre disponible.

```gherkin
Dado el PrecioKilo sembrado por el seed
Cuando un Gerente entra a /precio-kilo
Entonces ve el precio vigente (la fila con vigenteDesde más reciente) y
  quién/cuándo lo fijó

Dado un precio vigente de S/ 9.50
Cuando el Gerente hace clic en "Actualizar precio", digita S/ 10.00 y guarda
Entonces se crea una FILA NUEVA en PrecioKilo (nunca un UPDATE sobre la
  anterior), la pantalla ahora muestra S/ 10.00 como vigente, y la fila de
  S/ 9.50 sigue existiendo intacta y consultable en la base

Dado que un Operario intenta navegar a /precio-kilo
Cuando la petición llega al servidor
Entonces recibe 403 (GERENTE-only, vía RUTAS_POR_ROL — mismo mecanismo que
  /usuarios, /galpones, /lotes)
```

### H5 — Idempotencia por id de cliente bajo reintento real (1 pt)
Como equipo queremos evidencia real, no solo teórica, de que un reintento
de red o un doble clic nunca duplica ni un Cliente ni una fila de
PrecioKilo.

```gherkin
Dado un id generado para "Nuevo cliente", ya persistido con éxito
Cuando se reenvía exactamente el mismo payload (mismo id, mismos datos)
Entonces la action responde éxito idempotente sin duplicar la fila

Dado un id generado para "Actualizar precio", ya persistido con éxito
Cuando se reenvía exactamente el mismo payload (mismo id, mismo precio)
Entonces la action responde éxito idempotente sin insertar una segunda fila

Dado el mismo id de PrecioKilo, pero un reintento con un precio distinto al
  original
Cuando se envía
Entonces se rechaza explícito ("ya existe un registro con este id pero con
  datos diferentes"), sin sobrescribir ni insertar
```

## Alcance de este sprint
- Sin migración de schema (ver "Hallazgo real" arriba) — `Cliente`/
  `PrecioKilo` se usan tal cual existen desde Sprint 0.
- `server/services/cliente.ts` (nuevo): `esClientePublicoGeneral()`, función
  pura, 100% testeable.
- `lib/zod/cliente.ts` (nuevo): `crearClienteSchema`, `editarClienteSchema`,
  `cambiarEstadoClienteSchema`.
- `lib/zod/precioKilo.ts` (nuevo): `crearPrecioKiloSchema`.
- `server/repositories/cliente.ts` (nuevo): `crearCliente`,
  `buscarClientePorId`, `actualizarCliente`, `cambiarEstadoCliente`,
  `listarClientes({ skip, take, busqueda? })`, `contarClientes({ busqueda? })`.
- `server/repositories/precioKilo.ts` (nuevo): `crearPrecioKilo`,
  `buscarPrecioKiloPorId`, `obtenerPrecioKiloVigente`.
- `server/actions/cliente.ts` (nuevo): `crearCliente`, `editarCliente`,
  `cambiarEstadoClienteAction` (ninguna con `rol` — abiertas a ambos).
- `server/actions/precioKilo.ts` (nuevo): `crearPrecioKilo`
  (`rol: "GERENTE"`).
- UI: `app/(app)/clientes/page.tsx`, `ClientesTabla`, `ClienteFiltros`,
  `ClienteFormDialog` (crear/editar, un solo componente parametrizado por
  `modo`, mismo patrón que `GalponFormDialog`/`LoteFormDialog`).
- UI: `app/(app)/precio-kilo/page.tsx`, `ActualizarPrecioDialog`.
- `NAV_ITEMS`: entradas nuevas "Clientes" → `/clientes`, "Precio por Kilo" →
  `/precio-kilo`. `RUTAS_POR_ROL`: entrada nueva `/precio-kilo` →
  `["GERENTE"]`.
- Tests unitarios de `esClientePublicoGeneral()` y de ambos Zod schemas,
  tests de integración de las cuatro Server Actions, verificación de
  idempotencia real contra Neon (H5), verificación en vivo del resto
  (CRUD completo, guard de Público General, búsqueda, precio vigente),
  verificación clic a clic en navegador.

## Fuera de alcance
- **Todo lo de Sprint 9 en adelante** — POS, carrito, venta real
  (`Venta`/`DetalleVenta`), Créditos (`Credito`/`HistorialAbonos`), Egresos,
  PWA, cola offline real. Este sprint deja el catálogo listo, no lo consume.
- **"Venta a crédito bloqueada para Público General"** — regla de negocio de
  Sprint 11 (Créditos), no de este sprint. `Cliente.creditos` sigue sin
  ningún código real encima.
- **Pantalla de historial completo de `PrecioKilo`.** Decisión de negocio 6
  confirmada arriba — la fila histórica se persiste desde este sprint, pero
  no se expone en una tabla propia todavía.
- **Endpoint de búsqueda/autocomplete liviano para el selector de cliente
  del POS.** Decisión de negocio 5 — el filtro de este sprint es sobre la
  tabla de gestión paginada, no un endpoint sin paginar pensado para
  tipeo en vivo. Sprint 9 lo diseña cuando exista ese consumidor real.
- **`DELETE` físico de `Cliente`.** Nunca — mismo criterio que toda entidad
  de negocio del proyecto (`memory/convenciones.md`), se usa `estado`.
- **Cola offline real (IndexedDB/Dexie).** Sigue siendo Sprint 14. Este
  sprint solo cumple la mitad obligatoria de la regla de idempotencia (id de
  cliente + reintento seguro), no el contrato Offline-Ready completo (ver
  "Hallazgo real" arriba, decisión explícita de no agregar
  `creadoEn`/`creadoEnCliente` a `Cliente` todavía).
- **Un segundo "cliente especial" o generalización del guard de Público
  General.** El guard de este sprint compara contra una única constante fija
  — no se diseña un mecanismo genérico para "N clientes protegidos" sin un
  caso de negocio real que lo pida (ver R3 en "Riesgos").

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Igual que Sprints 1-7. Este sprint crea `Cliente` y `PrecioKilo` reales —
probar con clientes de prueba nombrados de forma reconocible (mismo criterio
que `VERIF-S7-15-*` de Sprint 7), nunca contra el catálogo real de clientes
de la granja si ya hay datos reales cargados. **Especial cuidado con
`PrecioKilo`:** a diferencia de un cliente de prueba (que se puede borrar
después), una fila de `PrecioKilo` de prueba en el histórico real
**no debería insertarse contra la base compartida** salvo que se limpie de
inmediato — un precio de prueba en el histórico real podría confundir un
reporte futuro si no se limpia con la misma disciplina que el resto del
proyecto ya usa.

### R2 — Sin migración este sprint, pero verificado, no asumido (nota de proceso)
El brief inicial de esta planificación ya adelantaba correctamente "sin
migración" (a diferencia del brief de Sprint 7, que se equivocaba en este
punto) — pero igual se confirmó releyendo `prisma/schema.prisma` real antes
de diseñar, no se dio por buena la afirmación del brief sin verificar. Sin
riesgo real distinto a los ya conocidos del proyecto.

### R3 — Guard de "Público General" no escala solo a un segundo cliente especial
La decisión de negocio 3 (comparar por id fijo, sin campo `esPublico` en el
schema) es la más simple posible para el caso real de hoy (un único cliente
protegido). Si en el futuro apareciera la necesidad de un segundo cliente
"del sistema" con el mismo tipo de protección, este enfoque no generaliza
solo — habría que migrar a un campo booleano o una tabla de excepciones.
Aceptado explícitamente como limitación conocida (mismo criterio que D3,
"si en algún momento futuro esto cambiara, sería una migración estructural
mayor, no contemplada en el diseño actual") — no se sobre-diseña para un
caso hipotético sin confirmar.

### R4 — `Cliente` sin `creadoEn`/`creadoEnCliente` (decisión de diseño, no bug)
Documentado en detalle en "Hallazgo real" arriba. Si un sprint futuro
necesita ordenar clientes por fecha de alta o mostrar "cliente desde cuándo"
en una pantalla real, va a hacer falta una migración chica en ese momento
(agregar `creadoEn DateTime @default(now())`) — no es un blocker hoy, pero
se deja anotado para no repetir la sorpresa que "campos calculados" de
`memory/modelo-datos.md` ya previene en otros casos.

### R5 — `AuditLog` no atómico con la mutación (heredado)
Mismo trade-off aceptado desde Sprint 2 — un reintento idempotente de
`crearCliente`/`crearPrecioKilo` (mismo `id`, mismo payload) deja una
segunda fila en `AuditLog`, inofensivo.

## Criterio de aceptación general
Dado el repo con Sprint 7 ya desplegado
Cuando un Gerente u Operario abre "/clientes", crea/edita/suspende/reactiva
  clientes reales, y busca por nombre o celular
Entonces el catálogo de `Cliente` queda actualizado exactamente como se
  pidió, "Público General" permanece intacto y protegido en todo momento
  (UI y Server Action), y ningún doble envío duplica una fila
Y cuando un Gerente abre "/precio-kilo" y fija un precio nuevo, se crea una
  fila adicional en `PrecioKilo` sin tocar ni una sola fila anterior, la
  pantalla muestra el precio vigente correcto, y un Operario recibe 403 al
  intentar acceder a esa misma ruta
Y los tests de idempotencia real (H5) pasan contra Neon real, no solo
  contra mocks
