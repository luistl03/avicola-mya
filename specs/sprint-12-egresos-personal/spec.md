# Sprint 12 — Egresos y Personal

## Sprint Goal
El Gerente registra gastos por categoría y movimientos de planilla (sueldo
base, adelantos, bonos, descuentos) para cada empleado — aislado del
flujo de caja de ventas (POS/Créditos), sin ningún repository/action
compartido entre ambos. (El banner explícito que comunicaba esto en la
UI se implementó y luego se sacó a pedido del Product Owner — ver H2.)

## Contexto previo — qué hereda de Sprint 0, qué es nuevo acá
- **`enum CategoriaEgreso`/`model Egreso`/`enum EstadoEmpleado`/
  `model Empleado`/`enum TipoSueldoMovimiento`/`model SueldoMovimiento`**
  — schema completo desde Sprint 0 (comentario `MÓDULO 9 — Egresos y
  Personal (D4: sin adjuntos)` en `prisma/schema.prisma`), **sin ningún
  código real encima todavía**. Mismo punto de partida que Créditos tuvo
  en Sprint 11.
  - `Egreso`: `id`, `categoria CategoriaEgreso`, `monto Decimal(10,2)`,
    `descripcion String`, `fecha DateTime @default(now())`, `usuarioId`.
    `CategoriaEgreso`: `ALIMENTOS`/`INSUMOS_VACUNAS`/`SERVICIOS`/
    `MANTENIMIENTO`/`VARIOS` — ya cerradas desde Sprint 0, este sprint no
    las revisita.
  - `Empleado`: `id`, `nombre`, `celular?`, `cargo?`, `usuarioId? @unique`
    (vínculo opcional a `Usuario`, sin poblar todavía — ver decisión 5),
    `estado EstadoEmpleado @default(ACTIVO)`.
  - `SueldoMovimiento`: `id`, `empleadoId`, `tipo TipoSueldoMovimiento`,
    `monto Decimal(10,2)`, `fecha DateTime @default(now())`,
    `descripcion?`.
  - `Usuario.egresosRegistrados Egreso[]` y `Usuario.empleadoVinculado
    Empleado?` — relaciones inversas ya presentes y válidas desde
    Sprint 0 (`npx prisma validate` en verde antes de tocar nada).
- **D4 (`decisiones-tecnicas.md`)**: `Egreso` no lleva ni llevará campo de
  adjunto/comprobante — cerrado, este sprint no lo reabre.
- **`VENTANA_GRACIA_MIN`** (`lib/constants.ts`, hoy compartida entre
  Mortalidad y Recolección) — este sprint la extiende a un tercer y
  cuarto consumidor: revertir `Egreso` y revertir `SueldoMovimiento`
  (decisiones 1 y 2). Mismo patrón de countdown real (`RevertirMortalidadBoton`/
  `RevertirRecoleccionBoton`) que este sprint replica para ambos módulos
  nuevos, no reinventa.
- **`idUuid()`, `hoyEnLima()`** (`lib/zod/comun.ts`), `withAuth`,
  `<DataTablePagination>`, patrón de filtro colapsable (`MortalidadFiltros`/
  `RecoleccionFiltros`), patrón de dialog crear+editar en un solo
  componente (`UsuarioFormDialog`) — reusables tal cual, ninguno se
  reconstruye.
- **`RUTAS_POR_ROL`** (`server/auth/rbac.ts`) — gana dos entradas nuevas,
  `/egresos` y `/personal`, ambas `["GERENTE"]` (decisión 3) — primera
  vez desde `/precio-kilo` (Sprint 8) que se restringe una ruta nueva.

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md`, `memory/arquitectura.md`,
`memory/modelo-datos.md`, `memory/convenciones.md` (en particular
"Idempotencia por id de cliente", "Tabla paginada vs. muro con scroll
infinito", "Encabezado de página y Sidebar mobile"), `memory/decisiones-tecnicas.md`
(D1–D6, en particular D4), `memory/definition-of-ready.md`,
`memory/estado-proyecto.md` completo (en particular "Sprint 9", "Sprint 10",
"Sprint 11" y "Cómo continuar desde acá"), `specs/roadmap-completo.md`
(sección Sprint 12), `specs/sprint-11-creditos-cobranza/` completo
(plantilla de estructura y nivel de detalle — mismo punto de partida:
modelos completos desde Sprint 0 sin código encima). También se releyó el
código real de `prisma/schema.prisma` completo (confirmando que
`Egreso`/`Empleado`/`SueldoMovimiento` y sus relaciones inversas en
`Usuario` ya existen y validan), `src/server/services/mortalidad.ts` y
`src/server/repositories/mortalidad.ts` (`puedeRevertirMortalidad`/
`revertirMortalidad`, el patrón de ventana de gracia con `updateMany`
condicional que este sprint replica dos veces), `src/components/domain/mortalidad/revertir-mortalidad-boton.tsx`
(countdown real, referencia directa de UI), `src/server/auth/with-auth.ts`,
`src/server/auth/rbac.ts`, `src/components/layout/nav-items.ts`,
`src/lib/zod/comun.ts`, `src/lib/zod/lote.ts`, `src/lib/zod/credito.ts`
(estilo de schema Zod con `monto` sin tope superior).

## Decisiones de negocio confirmadas por el Product Owner
Seis preguntas explícitas vía `AskUserQuestion` antes de cerrar esta
spec — el schema de Sprint 0 no incluye campo de anulación/reversión ni
en `Egreso` ni en `SueldoMovimiento`, así que "CRUD Egreso" del roadmap
necesitaba una decisión real de diseño, no solo de negocio:

1. **`Egreso` es editable sin ventana de tiempo, y además anulable solo
   dentro de una ventana de gracia corta.** El Product Owner pidió mi
   recomendación explícita para combinar "edición libre" + "anulación con
   ventana de gracia" — la resolución concreta (detalle completo en
   `plan.md`, sección "Diseño de `Egreso`"):
   - **Editar** (`categoria`/`monto`/`descripcion`/`fecha`): permitido
     en cualquier momento por un GERENTE, mientras el `Egreso` no esté
     `revertido`. Sin límite de tiempo — corrige un error de tipeo o de
     categoría sin importar cuánto haya pasado.
   - **Anular** (`revertido`/`revertidoEn`, campos nuevos — ver
     "Migración de schema" en `plan.md`): solo dentro de
     `VENTANA_GRACIA_MIN` (10 min) desde el alta real, mismo criterio que
     Mortalidad/Recolección. Pasada la ventana, un `Egreso` mal cargado
     ya no se puede quitar del ledger — se corrige editando sus campos,
     nunca anulando en retrospectiva (evita que un gasto real desaparezca
     de los reportes mucho después de cargado, sin dejar rastro de qué
     pasó — mismo espíritu conservador que "nunca DELETE físico").
   - La ventana de gracia se ancla a un campo **nuevo e inmutable**,
     `creadoEn` (distinto de `fecha`, que sí es editable) — anclarla a
     `fecha` habría permitido que editar la fecha reabra o cierre la
     ventana de anulación de forma impredecible. Ver "Migración de
     schema" en `plan.md` para el razonamiento completo.
2. **`SueldoMovimiento` es un ledger append-only con ventana de gracia
   corta para revertir** (no editable) — mismo patrón exacto que
   `RegistroMortalidad`/`RegistroRecoleccion`, sin la variante de edición
   libre que sí tiene `Egreso`. Un movimiento mal cargado se corrige
   revirtiéndolo (dentro de los 10 min) o con un movimiento inverso nuevo
   (fuera de la ventana) — nunca editando el original.
3. **Rol de acceso: GERENTE únicamente**, tanto para `/egresos` como para
   `/personal` (formularios, listados y montos de sueldo/adelantos) — a
   diferencia de Créditos/Abonos (Sprint 11, abierto a ambos roles), esta
   es información financiera que el roadmap describe explícitamente como
   "el Gerente registra". Ambas rutas entran a `RUTAS_POR_ROL`.
4. **Neto mensual: mes calendario, con selector de mes/año** (no rango de
   fechas libre) — del día 1 al último día del mes elegido, en
   `America/Lima` (D5), igual criterio de fecha-calendario que
   `Credito.fechaLimite`.
5. **`Empleado.usuarioId` queda 100% fuera de la UI este sprint.** El
   campo ya existe en el schema (opcional, único) pero ningún formulario
   de este sprint lo expone — `Empleado` es una entidad independiente
   (nombre, celular, cargo, estado), sin selector de `Usuario`. Vincularlo
   queda para un sprint futuro que lo necesite de verdad (ej. que un
   Operario vea su propio estado de cuenta de sueldo).
6. **Un `Empleado` `INACTIVO` no puede recibir ningún `SueldoMovimiento`
   nuevo.** El formulario de "Registrar movimiento" solo lista empleados
   `ACTIVO` (`listarEmpleadosActivos()`), y la Server Action rechaza
   explícito si se fuerza el payload contra un empleado inactivo. Si
   falta liquidar algo de un empleado que se está dando de baja, hay que
   registrarlo antes de desactivarlo.

**Decisiones ya cerradas en Sprint 0, no revisitadas por este sprint:**
categorías de `Egreso` (los 5 valores del enum), tipos de
`SueldoMovimiento` (los 4 valores del enum), y D4 (sin adjuntos).

## Historias de usuario

### H1 — CRUD de Egreso: alta, edición libre y anulación con ventana de gracia (6 pts)
Como Gerente quiero registrar un gasto por categoría, poder corregirlo si
me equivoco al cargarlo, y poder anularlo solo si lo hago en los primeros
minutos.

```gherkin
Dado el formulario "Nuevo egreso" con categoria: INSUMOS_VACUNAS,
  monto: 450.00, descripcion: "Vacuna Newcastle", fecha: hoy
Cuando lo guardo
Entonces se crea un Egreso con esos datos, usuarioId del Gerente que lo
  cargó, revertido: false, y aparece en el listado de /egresos

Dado el mismo Egreso ya creado, sin anular, 3 horas después de cargado
Cuando lo edito y cambio monto a 480.00 y descripcion
Cuando guardo
Entonces el Egreso queda actualizado con los nuevos valores — la edición
  no depende de ninguna ventana de tiempo

Dado un Egreso recién creado, hace 4 minutos
Cuando presiono "Anular"
Entonces el Egreso queda revertido: true, revertidoEn seteado, y deja de
  contar en cualquier total/reporte, pero sigue visible en el listado con
  una etiqueta "Anulado"

Dado un Egreso creado hace 15 minutos (fuera de la ventana de 10 min)
Cuando reviso su fila en /egresos
Entonces no hay ningún botón "Anular" visible — la única corrección
  posible a esa altura es editar sus campos

Dado un Egreso ya revertido
Cuando intento editarlo o anularlo de nuevo (incluso forzando el payload)
Entonces ambas acciones se rechazan explícito del lado del servidor

Dado un intento de crear un Egreso con fecha futura
Cuando lo guardo
Entonces se rechaza explícito ("La fecha no puede ser futura"), mismo
  criterio D5 que fechaIngreso de Lote
```

### H2 — Banner "no afecta la caja de ventas" (1 pt) — REMOVIDO en plena ejecución
Se implementó tal cual (banner visible arriba de todo en `/egresos` y
`/personal`) durante S12-14 a S12-17, y se **sacó de las tres pantallas**
a pedido explícito del Product Owner después de verlo en uso — junto con
el recorte de las mismas frases ("— no afecta la caja de Ventas.",
"— sin cuenta de acceso al sistema.") de las descripciones de
`EgresoFormDialog`/`EmpleadoFormDialog`. `components/domain/egresos/banner-caja-separada.tsx`
se borró del proyecto (sin ningún otro consumidor). El aislamiento real
entre Egresos/Personal y la caja de Ventas/Créditos sigue intacto —
ningún repository/action de este sprint toca `Venta`/`Credito` ni
viceversa — lo que cambió es solo la comunicación visual explícita de
ese hecho, que el Product Owner decidió que no hacía falta. Los
Gherkin originales quedan tachados acá como registro histórico, no
como comportamiento vigente:

```gherkin
Dado que un Gerente entra a /egresos o a /personal
Cuando la pantalla carga
Entonces ve, arriba de todo (antes de cualquier tabla o filtro), un banner
  con el texto "Esto es un registro contable interno — no afecta el flujo
  de caja de Ventas ni de Créditos"
```

### H3 — CRUD de Empleado, desacoplado de Usuario (5 pts)
Como Gerente quiero llevar una lista de empleados con nombre, celular y
cargo, y poder darlos de baja sin borrarlos, sin necesidad de que tengan
una cuenta de acceso al sistema.

```gherkin
Dado el formulario "Nuevo empleado" con nombre: "Juana Pérez",
  celular: "987654321", cargo: "Operaria de campo"
Cuando lo guardo
Entonces se crea un Empleado con estado: ACTIVO, sin ningún campo de
  usuarioId visible ni exigido en el formulario

Dado un Empleado ACTIVO existente
Cuando lo edito (nombre/celular/cargo) y guardo
Entonces los cambios quedan reflejados, sin tocar su estado

Dado un Empleado ACTIVO
Cuando presiono "Dar de baja"
Entonces su estado pasa a INACTIVO — sigue visible en el listado y en su
  historial de SueldoMovimiento, pero deja de aparecer en el selector de
  "Registrar movimiento" (H4)

Dado un Empleado INACTIVO
Cuando presiono "Reactivar"
Entonces su estado vuelve a ACTIVO y reaparece en el selector de "Registrar
  movimiento"

Dado el listado /personal
Cuando lo filtro por estado
Entonces puedo ver solo ACTIVO, solo INACTIVO, o todos
```

### H4 — Registrar movimiento de sueldo, con ventana de gracia para revertir (5 pts)
Como Gerente quiero registrar un pago de sueldo, adelanto, bono o
descuento contra un empleado activo, y poder deshacer un movimiento mal
cargado solo en los primeros minutos.

```gherkin
Dado un Empleado ACTIVO
Cuando registro un SueldoMovimiento con tipo: ADELANTO, monto: 100.00,
  descripcion: "Adelanto de quincena"
Cuando lo guardo
Entonces se crea el movimiento con fecha (ahora), revertido: false, y
  aparece en el ledger de ese empleado (/personal/[id])

Dado un Empleado INACTIVO
Cuando intento abrir "Registrar movimiento" para ese empleado (forzando el
  payload directo, sin pasar por el selector que ya lo excluye)
Entonces se rechaza explícito ("No se puede registrar un movimiento para
  un empleado inactivo")

Dado un SueldoMovimiento recién creado, hace 5 minutos
Cuando presiono "Deshacer"
Entonces queda revertido: true, revertidoEn seteado, deja de contar en el
  cálculo de neto mensual (H5), pero sigue visible en el ledger con la
  etiqueta "Revertido"

Dado un SueldoMovimiento creado hace más de 10 minutos
Cuando reviso su fila
Entonces no hay botón "Deshacer" visible — no existe edición para
  SueldoMovimiento, solo alta y reversión dentro de la ventana

Dado un movimiento ya registrado con éxito (mismo id)
Cuando se reenvía exactamente el mismo payload (doble clic, reintento de
  red)
Entonces la action responde éxito idempotente con el movimiento ya
  existente, sin duplicar la fila
```

### H5 — Neto mensual informativo por empleado (2 pts)
Como Gerente quiero ver, para un empleado y un mes elegido, cuánto suma su
sueldo base y bonos, cuánto se le descontó en adelantos/descuentos, y el
neto resultante — solo como referencia, sin que dispare ningún pago real.

```gherkin
Dado un Empleado con estos SueldoMovimiento en agosto 2026: SUELDO_BASE
  1200.00, BONO 100.00, ADELANTO 200.00, DESCUENTO 50.00 (ninguno
  revertido)
Cuando entro a /personal/[id] y selecciono "Agosto 2026"
Entonces veo el desglose (Sueldo base: 1200.00, Bonos: 100.00,
  Adelantos: -200.00, Descuentos: -50.00) y el Neto: 1050.00
  (1200 + 100 − 200 − 50)

Dado el mismo empleado, con un ADELANTO de 50.00 registrado y luego
  revertido dentro de su ventana de gracia
Cuando calculo el neto del mismo mes
Entonces ese movimiento revertido no se cuenta en ningún componente del
  desglose ni en el neto

Dado un empleado sin ningún SueldoMovimiento en el mes elegido
Cuando reviso su neto
Entonces veo el desglose en cero y un texto claro ("Sin movimientos este
  mes"), sin error

Dado que cambio el selector a un mes distinto
Cuando la página recalcula
Entonces el desglose y el neto corresponden únicamente a movimientos con
  fecha dentro de ese mes calendario completo (día 1 a último día,
  América/Lima)
```

## Alcance de este sprint
- **Migración de schema** (única de este sprint, ver `plan.md` para el
  SQL exacto): `Egreso` gana `creadoEn DateTime @default(now())`,
  `revertido Boolean @default(false)`, `revertidoEn DateTime?` + índice
  `@@index([creadoEn, revertido])`. `SueldoMovimiento` gana
  `revertido Boolean @default(false)`, `revertidoEn DateTime?` + índice
  `@@index([empleadoId, fecha, revertido])` (reemplaza el índice simple
  `[empleadoId, fecha]` ya existente, cubre el filtro real de neto
  mensual). Ninguna migración destructiva — todas con `DEFAULT`, no
  rompe filas existentes (hoy no hay ninguna, estos modelos están sin
  poblar).
- `lib/zod/egreso.ts` (nuevo), `lib/zod/empleado.ts` (nuevo),
  `lib/zod/sueldo-movimiento.ts` (nuevo).
- `server/services/egreso.ts` (nuevo): `puedeRevertirEgreso()`.
- `server/services/sueldo-movimiento.ts` (nuevo): `puedeRevertirSueldoMovimiento()`,
  `calcularRangoMesCalendario()`, `calcularNetoMensual()`.
- `server/repositories/egreso.ts`, `server/repositories/empleado.ts`,
  `server/repositories/sueldo-movimiento.ts` (los tres nuevos).
- `server/actions/egreso.ts`, `server/actions/empleado.ts`,
  `server/actions/sueldo-movimiento.ts` (los tres nuevos).
- UI nueva: `components/domain/egresos/` (form dialog, tabla, filtros,
  botón revertir),
  `components/domain/personal/` (form dialog de Empleado, tabla,
  form dialog de SueldoMovimiento, tabla/ledger, botón revertir, tarjeta
  de neto mensual). `app/(app)/egresos/page.tsx`,
  `app/(app)/personal/page.tsx`, `app/(app)/personal/[empleadoId]/page.tsx`
  (los tres nuevos).
- `server/auth/rbac.ts`: `/egresos` y `/personal` → `["GERENTE"]`.
- `components/layout/nav-items.ts`: "Egresos" → `/egresos`, "Personal" →
  `/personal`.
- `globals.css`: recetas de color nuevas para `.badge-categoria-egreso-*`
  (5 valores) y `.badge-tipo-sueldo-*` (4 valores), mismo criterio que
  `.badge-categoria-*`/`.badge-tipo-muerte` de Bitácora/Mortalidad.
- Tests unitarios de los services nuevos (`egreso.ts`,
  `sueldo-movimiento.ts`), de los Zod schemas nuevos, tests de
  integración de las 7 Server Actions nuevas, verificación de la ventana
  de gracia real (Egreso y SueldoMovimiento) contra Neon, verificación de
  idempotencia real de ambas altas, y verificación clic a clic en
  navegador.

## Fuera de alcance
- **Comprobantes/adjuntos en Egreso** — D4, cerrado permanentemente.
- **Vínculo Empleado↔Usuario en la UI** — decisión 5, el campo existe en
  el schema pero ningún formulario de este sprint lo usa.
- **Reportes/gráficos de gasto por categoría o de planilla mensual
  agregada de toda la granja** — eso es Sprint 15 (Dashboard y reportes).
  Este sprint solo calcula el neto mensual de UN empleado a la vez,
  informativo, sin exportar ni graficar.
- **Pago real de sueldo o integración bancaria.** `SueldoMovimiento` es
  puro registro contable interno — no dispara ninguna transferencia ni
  se concilia contra ningún banco.
- **Límite de gasto o presupuesto por categoría.** Sin ninguna alerta de
  "te estás pasando de presupuesto" — eso no está en el roadmap de este
  sprint.
- **Edición de SueldoMovimiento.** Solo alta + reversión dentro de la
  ventana de gracia — a diferencia de `Egreso`, que sí es editable sin
  límite de tiempo (decisión 1/2).
- **Anulación de Egreso fuera de la ventana de gracia.** Pasados los
  10 minutos, un Egreso mal cargado se corrige editando, nunca anulando
  en retrospectiva.
- **Cola offline real.** Sigue siendo Sprint 14 — este sprint asume
  conexión (mismo criterio que todos los módulos de gestión hasta ahora,
  el contrato offline-ready es explícito solo para pantallas operativas
  de campo: Mortalidad, Recolección, Bitácora).
- **`DELETE` físico de `Egreso`/`Empleado`/`SueldoMovimiento`.** Nunca —
  mismo criterio de todo el proyecto.

## Riesgos y notas

### R1 — Neon compartido entre local y producción (heredado)
Igual que Sprints 1-11. Probar la ventana de gracia y la idempotencia con
egresos/empleados/movimientos de prueba nombrados a propósito, nunca
contra datos reales de la granja si ya hay planilla cargada para ese
momento.

### R2 — Guard de "empleado activo" al registrar SueldoMovimiento: best-effort, no atómico
A diferencia del guard de sobrepago de Créditos (Sprint 11, atómico bajo
carrera real forzada) o el de `avesVivas` (Sprint 4), acá el riesgo real
de una carrera es bajo y el impacto no es financiero-crítico: la única
forma de crear un movimiento contra un empleado inactivo sería que dos
Gerentes actúen en el mismo instante exacto (uno desactivando, otro
registrando un movimiento para el mismo empleado) — un evento
extremadamente raro en el uso real de una granja familiar con un único
Gerente activo la mayoría del tiempo. Por eso el guard es un chequeo
previo (`buscarEmpleadoPorId` antes del `create`, mismo espíritu que R3
de Sprint 11), no un `updateMany` condicional atómico. Si en producción
esto resulta un problema real, es un ajuste chico de diseño, no una
historia nueva.

### R3 — `creadoEn` de Egreso es un campo nuevo, `fecha` sigue siendo la fecha de negocio editable
Mismo tipo de distinción que ya existe en el proyecto entre un instante
real (`Venta.fecha`, `HistorialAbonos.fecha`) y una fecha-calendario
editable (`Lote.fechaIngreso`) — acá conviven ambas en el mismo modelo:
`creadoEn` (inmutable, ancla la ventana de gracia de anulación) y `fecha`
(editable, representa cuándo ocurrió el gasto). Cualquier sprint futuro
que lea `Egreso` para un reporte por fecha debe usar `fecha`, no
`creadoEn` — `creadoEn` es un detalle de implementación de la ventana de
gracia, no un dato de negocio.

### R4 — Sin cron ni alerta de "planilla del mes sin cerrar"
El neto mensual es una consulta bajo demanda (H5) — no hay ningún
recordatorio automático de "todavía no cargaste el sueldo de este mes".
Fuera de alcance de este sprint, mismo criterio que R6 de Sprint 11.

### R5 — `AuditLog` no atómico con la mutación (heredado)
Mismo trade-off aceptado desde Sprint 2 — un reintento idempotente de
`crearEgresoAction`/`crearSueldoMovimientoAction` (mismo `id`, mismo
payload) deja una segunda fila en `AuditLog`, inofensivo.

## Criterio de aceptación general
Dado el repo con Sprint 11 ya desplegado
Cuando un Gerente entra a `/egresos` y registra, edita y (dentro de los
  primeros 10 minutos) anula un gasto por categoría
Y entra a `/personal`, da de alta un Empleado, lo edita, lo da de baja y
  lo reactiva
Y entra al detalle de un Empleado ACTIVO, registra un SueldoMovimiento de
  cada tipo, revierte uno dentro de la ventana de gracia, y consulta el
  neto mensual de un mes con y sin movimientos
Entonces ambas rutas están bloqueadas para un Operario (403), y ningún
  movimiento de Egreso/Personal aparece en ningún cálculo de `/pos`,
  `/ventas` o `/creditos` — módulos completamente aislados entre sí, tal
  como pide el Sprint Goal del roadmap
Y un Empleado INACTIVO nunca puede recibir un SueldoMovimiento nuevo, ni
  desde la UI ni forzando el payload directo
