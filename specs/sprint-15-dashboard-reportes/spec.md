# Sprint 15 — Dashboard y reportes

## Sprint Goal
El Gerente entra a `/` y ve datos reales del día (no más tarjetas de ejemplo), y
tiene una pantalla nueva `/reportes` con producción, mortalidad, ventas por
método de pago, ranking de clientes y gasto por categoría — cada una con
gráfico, tabla y exportación CSV, filtrable por mes calendario.

## Contexto previo — no es un dashboard desde cero
Confirmado leyendo el código real antes de planificar, no asumido:

- **`src/app/page.tsx` ya existe y ya tiene el punto de enganche marcado en
  el código.** Hoy muestra 5 tarjetas: la primera ("Créditos vencidos") ya usa
  datos reales desde Sprint 11 (`resumirAlertasCredito` +
  `listarCreditosPendientesConCliente`, `server/services/credito.ts` +
  `server/repositories/credito.ts`); las otras 4 ("Lotes activos", "Huevos
  hoy", "Mortalidad hoy", "Ventas hoy") son `TARJETAS_EJEMPLO`, un array
  hardcodeado con un comentario explícito: *"siguen siendo de ejemplo hasta
  Sprint 15 (Dashboard y reportes)"*. Este sprint reemplaza exactamente esas
  4, sin tocar la primera.
- **Ninguna librería de gráficos ni de exportación instalada** (confirmado en
  `package.json`: sin `recharts`, sin `exceljs`/`xlsx`, sin ninguna
  alternativa — y `memory/stack-tecnologico.md` no menciona ninguna). Ambas
  son decisiones técnicas abiertas de este sprint, confirmadas más abajo.
- **No existe `/reportes` ni ninguna ruta parecida todavía** — este sprint la
  crea de cero, como pantalla nueva bajo `src/app/(app)/`, mismo patrón de
  carpetas que `egresos/`, `creditos/`, `personal/`, etc.
- **Todos los datos ya existen en el schema, sin migración.** Confirmado
  modelo por modelo contra `prisma/schema.prisma`: producción sale de
  `RegistroRecoleccion` (`creadoEn`, `cantidadTotal`, `revertido`),
  mortalidad de `RegistroMortalidad` (`fecha`, `cantidad`, `tipo`,
  `revertido`), ventas por método de pago de `Venta` (`fecha`,
  `totalCobrado`, `metodoPago` — sin campo `revertido`, las ventas no se
  anulan en este proyecto), ranking de clientes de `Venta` + `Cliente`
  (`nombre`, `tipo`), gasto por categoría de `Egreso` (`categoria`, `monto`,
  `revertido`). Sprint de lectura/agregación pura, cero escritura.
- **`/` (dashboard) hoy no tiene restricción de rol** en
  `server/auth/rbac.ts` (`RUTAS_POR_ROL`) — se mantiene así (decisión de
  negocio 5 abajo); `/reportes` sí se agrega restringida a GERENTE.
- **`server/repositories/egreso.ts` ya documenta el criterio a seguir**: *"el
  filtrado de `revertido: true` en cálculos/reportes es responsabilidad de
  quien agregue esos totales, no de este listado"* — este sprint es
  exactamente ese "quien agrega": toda función nueva de agregación excluye
  `revertido: true` explícitamente en su propio `where`, no reutiliza
  `listarEgresos`/`listarRegistrosMortalidad`/`listarRecolecciones`
  existentes (esas son para las tablas de gestión, no filtran por diseño).

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md` (Gerente necesita "visibilidad total:
finanzas, créditos vencidos, reportes" — Operario necesita "rapidez y
simplicidad", este sprint es sobre todo para el Gerente),
`memory/arquitectura.md` (ADR-000: componente/service nunca importan Prisma,
solo `repositories/`), `memory/modelo-datos.md` (sin cambios de schema este
sprint, confirmado), `memory/convenciones.md` (en particular "Server
Actions" — una lectura no pasa por `withAuth`; y "Paginación de tablas de
datos" — el ranking de clientes es una tabla chica de Top 10, no necesita
paginación), `memory/decisiones-tecnicas.md` (D5: América/Lima fija para
todo corte de fecha calendario; D6: riesgo aceptado del plan gratuito de
Neon, relevante para las queries de agregación de este sprint — ver
decisión de negocio 6), `memory/definition-of-ready.md`,
`memory/estado-proyecto.md` (cierre completo de Sprint 14, 2026-08-19;
`memory/definition-of-done.md` sigue sin existir — mismo criterio que
Sprints 3-14: `CLAUDE.md` + la sección "Definition of Done" de `plan.md` son
el DoD efectivo), `specs/roadmap-completo.md` (Sprint 15, 26 pts, y Sprint
11 como precedente real de "tarjeta con datos agregados en el dashboard" ya
resuelto: `resumirAlertasCredito` recibe una lista ya traída por el
repository y calcula, sin tocar Prisma — mismo criterio que este sprint
aplica a producción/mortalidad/ventas/gasto/ranking). También se releyó el
código real de `src/app/page.tsx`, `src/server/auth/rbac.ts`,
`src/proxy.ts`, `src/lib/zod/comun.ts` (`hoyEnLima()`, D5),
`src/server/services/credito.ts` (`resumirAlertasCredito`, precedente
directo de agregación pura), `src/server/services/sueldo-movimiento.ts`
(`calcularRangoMesCalendario`, precedente directo de "mes calendario" —
Sprint 12, "Neto mensual" de Personal), `src/server/repositories/venta.ts`,
`egreso.ts`, `mortalidad.ts`, `lote.ts` completos, `src/lib/constants.ts`, y
`package.json`.

## Decisiones de negocio y técnicas confirmadas por el Product Owner
Seis preguntas explícitas vía `AskUserQuestion` antes de cerrar esta spec —
el roadmap describe el alcance a alto nivel pero no resuelve ningún criterio
concreto:

1. **Ubicación: dashboard simple + `/reportes` nueva.** El dashboard `/`
   reemplaza sus 4 tarjetas de ejemplo por datos reales **del día**, sin
   tendencias ni gráficos — mismo formato visual que la tarjeta de Créditos
   ya real. Los 5 reportes con detalle (tendencias, ranking, gasto por
   categoría) viven en una pantalla nueva `/reportes`, con su propio filtro
   de mes calendario. Separa "resumen del día" (dashboard, todos los roles)
   de "análisis con filtro" (reportes, solo Gerente — ver decisión 5).
2. **Librería de gráficos: Recharts.** Se agrega como dependencia nueva y se
   documenta como **D8** en `memory/decisiones-tecnicas.md` (mismo criterio
   que D7/Serwist en Sprint 13) — ver justificación completa en `plan.md`.
3. **Exportación: CSV simple, sin dependencia nueva.** Texto plano armado a
   mano en el servidor (mismo criterio de presupuesto $0 que ya aplicó a
   jsPDF en Sprint 9 — ahí se evaluó y descartó una dependencia de PDF más
   pesada; acá ni siquiera hace falta una librería, CSV es texto delimitado
   por comas). **Los 5 reportes son exportables** — un único endpoint
   parametrizado por tipo (ver `plan.md`), no cinco endpoints separados.
4. **Rango de fechas por defecto: mes calendario actual, mismo criterio para
   los 5 reportes.** Reutiliza `calcularRangoMesCalendario` (ya existe,
   `server/services/sueldo-movimiento.ts`, Sprint 12) — un selector de
   mes/año, no un selector de rango libre (ver decisión 6, por qué).
5. **Restricción de rol: `/reportes` solo GERENTE, dashboard `/` abierto a
   ambos roles, como hoy.** Mismo criterio que `/egresos`/`/personal`
   (información financiera/de gestión reservada al Gerente) — las 4
   tarjetas del día en `/` (Lotes activos, Huevos hoy, Mortalidad hoy,
   Ventas hoy) siguen abiertas a Operario, le sirven de contexto rápido sin
   exponer el detalle analítico completo.
6. **Rendimiento: selector de mes limitado a los últimos 12 meses, sin caché
   de request.** Dado el riesgo D6 (Neon plan gratuito, `decisiones-tecnicas.md`)
   y que cada reporte hace varias queries de agregación en cada carga, se
   acota el selector de mes a los últimos 12 meses (no se puede pedir
   agregación sobre todo el histórico completo desde un `<select>` sin
   fondo). Sin caché en memoria de request — el volumen actual de la granja
   (un mes de `RegistroRecoleccion`/`Venta`/`Egreso` son unas pocas
   decenas/centenas de filas, no miles) no lo justifica todavía; ver
   `plan.md`, "Nota de rendimiento (D6)".

**Corolario de diseño documentado acá, no preguntado de nuevo** (mismo
criterio que Sprint 3/13 con sus "corolarios de diseño"): "Producción
diaria/mensual" (única línea del roadmap con ese calificativo doble) se
resuelve con **un solo gráfico diario del mes seleccionado + un total
mensual como stat aparte**, no con un segundo gráfico de tendencia de 12
meses. Un segundo gráfico de rango largo habría necesitado agregación por
mes a nivel de base de datos (Prisma no soporta `GROUP BY` por mes
truncado sin SQL crudo, que este proyecto no usa en ningún lado todavía) —
mismo dato, doble complejidad, sin que el roadmap lo pida de forma
explícita para los otros 4 reportes. Si el Product Owner ve el resultado y
quiere de verdad una tendencia de varios meses, es una historia nueva a
evaluar, no una que este sprint deba anticipar.

**Corolario de diseño 2**: el ranking de clientes **excluye** al cliente
sembrado `CLIENTE_PUBLICO_GENERAL_ID` ("Público General", `lib/constants.ts`
— usado para ventas de mostrador sin cliente registrado). No tiene sentido
de negocio que un cliente genérico/anónimo "gane" el ranking por ser el
cajón de sastre de mostrador — mismo criterio que ya bloquea crédito para
Público General en Sprint 11 (una regla de negocio real ya aplicada al
mismo cliente especial, no una nueva).

## Revisión post-cierre (2026-08-20) — feedback en vivo del Product Owner
Tras el cierre inicial y el despliegue de las H1-H7 de arriba, el Gerente
probó `/reportes` en vivo y pidió 4 cambios explícitos, cerrados como
**D9/D10/D11** en `memory/decisiones-tecnicas.md` (no se reescriben las
decisiones de negocio originales de arriba — mismo criterio de "Historial
de revisión" que ya usa `decisiones-tecnicas.md`):
1. **Exportación: Excel real (D9)**, no CSV — "el CSV se veía mal". Los 8
   reportes ahora exportan `.xlsx` con formato (encabezado de marca,
   moneda), vía ExcelJS.
2. **Más reportes/gráficos, "importantes" (D11)** — 3 reportes nuevos,
   elegidos por el equipo a pedido explícito del Product Owner ("pensá
   como un gerente"): Créditos y cobranza, Mortalidad por lote/galpón,
   Balance financiero. 8 reportes en total.
3. **Filtro: Desde/Hasta con calendarios (D10)**, no un selector de mes
   único — mismo patrón que `EgresoFiltros`/`MortalidadFiltros`. El mes
   calendario actual se mantiene como valor por defecto, no como único
   valor posible.
4. **Rendimiento** — encontrado y corregido un índice faltante real en
   `RegistroMortalidad` (causaba un seq scan completo en cada carga del
   dashboard y de `/reportes`) + lazy-load de los gráficos Recharts vía
   `next/dynamic`. Detalle completo de la investigación y la corrección
   en `specs/sprint-15-dashboard-reportes/tasks.md`, sección "15F".

Detalle completo de ejecución, hallazgos reales y verificación en vivo de
esta revisión: `tasks.md`, sección "15F — Revisión post-cierre".

## Historias de usuario

### H1 — Dashboard con datos reales del día (3 pts)
Como Gerente u Operario quiero ver de un vistazo los números reales de hoy al
entrar a la app, para no tener que abrir cada pantalla operativa por separado.

```gherkin
Dado que entro a `/` como Gerente u Operario, con producción/mortalidad/
  ventas ya registradas hoy
Cuando la página carga
Entonces veo 5 tarjetas: "Créditos vencidos" (ya real, sin cambios),
  "Lotes activos" (conteo real de Lote.estado = ACTIVO), "Huevos hoy" (suma
  real de RegistroRecoleccion.cantidadTotal de hoy, no revertidos), "Mortalidad
  hoy" (suma real de RegistroMortalidad.cantidad de hoy, no revertidos),
  "Ventas hoy" (suma real de Venta.totalCobrado de hoy)
Y ninguna dice ya "3", "1,240", "2" o "S/ 0.00" fijos — son los valores reales
  de la base

Dado que hoy todavía no se registró nada de producción/mortalidad/ventas
Cuando entro a `/`
Entonces las tarjetas correspondientes muestran 0 (o "S/ 0.00"), no un error
  ni un valor en blanco

Dado un registro de RegistroMortalidad de hoy que fue revertido dentro de su
  ventana de gracia
Cuando entro a `/`
Entonces "Mortalidad hoy" no lo cuenta — mismo criterio que ya usa
  resumirAlertasCredito con revertido en otros módulos
```

### H2 — Reporte de producción diaria/mensual (5 pts)
Como Gerente quiero ver cuántos huevos se recolectaron cada día del mes y el
total del mes, para detectar caídas de producción sin sumar el cuaderno a mano.

```gherkin
Dado que entro a `/reportes` como Gerente, sin filtro explícito
Cuando la página carga
Entonces veo el reporte "Producción" del mes calendario actual: un gráfico de
  barras/líneas con un punto por día del mes (0 en los días sin recolección),
  y un total mensual arriba ("X huevos este mes")

Dado que cambio el selector de mes a uno de los últimos 12 meses
Cuando confirmo el cambio
Entonces el gráfico y el total se recalculan para ese mes, sin recargar toda
  la página (misma navegación por URL que Mortalidad/Recolección)

Dado un RegistroRecoleccion revertido dentro del mes filtrado
Cuando veo el reporte
Entonces ese registro no suma al total ni aparece en el día correspondiente
```

### H3 — Reporte de mortalidad (4 pts)
Como Gerente quiero ver la tendencia de mortalidad del mes y el desglose por
tipo (muerte natural vs. descarte), para detectar un problema sanitario a
tiempo.

```gherkin
Dado que entro a `/reportes`
Cuando veo el reporte "Mortalidad" del mes filtrado
Entonces veo un gráfico con un punto por día (total de MUERTE + DESCARTE) y,
  aparte, dos números: "N muertes" y "N descartes" del mes completo

Dado un RegistroMortalidad revertido dentro del mes filtrado
Cuando veo el reporte
Entonces ese registro no suma ni al gráfico ni al desglose por tipo
```

### H4 — Tendencia de ventas por método de pago (5 pts)
Como Gerente quiero ver cómo se distribuyen las ventas del mes entre efectivo,
Yape, Plin y transferencia día a día, para saber qué método de cobro predomina
y decidir si conviene ajustar algo (ej. promover Yape).

```gherkin
Dado que entro a `/reportes`
Cuando veo el reporte "Ventas por método de pago" del mes filtrado
Entonces veo un gráfico de barras apiladas, un punto por día, con una serie
  por cada MetodoPago (EFECTIVO, YAPE, PLIN, TRANSFERENCIA), sumando
  Venta.totalCobrado

Dado que un día del mes no tuvo ninguna venta
Cuando veo el gráfico
Entonces ese día aparece con las 4 series en 0, no falta del eje X
```

### H5 — Ranking de clientes (4 pts)
Como Gerente quiero ver qué clientes compraron más este mes, para identificar
a mis mejores clientes y priorizar la atención/cobranza.

```gherkin
Dado que entro a `/reportes`
Cuando veo el reporte "Ranking de clientes" del mes filtrado
Entonces veo una tabla de hasta 10 clientes, ordenada de mayor a menor monto
  total comprado en el mes, con columnas: posición, nombre, tipo de cliente,
  monto total, cantidad de ventas

Dado que "Público General" (cliente de mostrador) tuvo ventas ese mes
Cuando veo el ranking
Entonces "Público General" NO aparece en la tabla — no compite en el ranking
  (corolario de diseño 2, spec.md)

Dado que el mes filtrado tiene menos de 10 clientes distintos con ventas
Cuando veo el ranking
Entonces la tabla muestra solo los que hay, sin filas vacías de relleno
```

### H6 — Gasto por categoría (3 pts)
Como Gerente quiero ver en qué categorías se fue la plata este mes (alimentos,
insumos, servicios, mantenimiento, varios), para controlar el gasto operativo.

```gherkin
Dado que entro a `/reportes`
Cuando veo el reporte "Gasto por categoría" del mes filtrado
Entonces veo un gráfico (barras u otro tipo simple) con las 5
  CategoriaEgreso, cada una con el monto total del mes — incluidas las
  categorías sin gasto ese mes, mostradas en 0, no omitidas

Dado un Egreso anulado (revertido = true) dentro del mes filtrado
Cuando veo el reporte
Entonces ese egreso no suma a su categoría
```

### H7 — Exportación CSV de cualquier reporte (2 pts)
Como Gerente quiero descargar cualquiera de los 5 reportes como CSV, para
llevarlos a Excel o compartirlos fuera de la app.

```gherkin
Dado que estoy viendo cualquiera de los 5 reportes de /reportes, con un mes
  filtrado
Cuando toco "Exportar CSV" en ese reporte
Entonces el navegador descarga un archivo .csv con los mismos datos que
  muestra la tabla/gráfico de ese reporte, para ese mismo mes — nunca datos
  de un mes distinto al que estoy viendo

Dado que intento pedir la descarga directamente por URL (sin pasar por la
  UI) sin ser Gerente, o sin sesión
Cuando la request llega al servidor
Entonces se rechaza (403/redirect a login) — misma protección de rol que el
  resto de /reportes, no una puerta trasera sin verificar
```

## Alcance de este sprint
- **Sin migración de schema** — confirmado, `prisma/schema.prisma` no
  cambia.
- `memory/decisiones-tecnicas.md`: **D8 nueva** (Recharts).
- `memory/stack-tecnologico.md`: nueva sección "Visualización de datos".
- Dependencia nueva: `recharts`. Ninguna dependencia nueva para CSV (texto
  plano armado a mano).
- `src/app/page.tsx`: modifica — `TARJETAS_EJEMPLO` reemplazado por datos
  reales.
- `src/app/(app)/reportes/page.tsx` (nuevo, Server Component) +
  `reportes-filtro-mes.tsx` (nuevo, Client Component, mismo patrón de
  filtros por URL que `MortalidadFiltros`/`BitacoraFiltros`) + un componente
  de gráfico/tabla por reporte (5, todos Client Components porque Recharts
  necesita el navegador) + un botón "Exportar CSV" por reporte.
- `src/app/(app)/reportes/exportar/route.ts` (nuevo, Route Handler GET).
- `server/repositories/lote.ts`, `recoleccion.ts`, `mortalidad.ts`,
  `venta.ts`, `egreso.ts`: cada uno gana 1-3 funciones nuevas de
  agregación/lectura (ver `plan.md`, sección por archivo).
- `server/services/reportes.ts` (nuevo) — funciones puras de
  agregación/agrupación/CSV, 100% testeables sin base de datos, mismo
  criterio que `resumirAlertasCredito`.
- `server/auth/rbac.ts`: agrega `{ ruta: "/reportes", roles: ["GERENTE"] }`.
- `lib/constants.ts`: `REPORTES_MESES_MAXIMOS` (12) y
  `REPORTES_RANKING_CLIENTES_TOP` (10).
- Sin Server Actions nuevas (todo el sprint es lectura — el filtro de mes
  navega por URL, la exportación es un Route Handler GET, ninguno de los dos
  encaja en el propósito de `withAuth`, pensado para mutaciones puntuales).

## Fuera de alcance (explícitamente)
- **Tendencia de varios meses (más allá del total mensual del reporte de
  producción).** Ver "Corolario de diseño" arriba — este sprint no agrega
  `$queryRaw` ni ningún `GROUP BY` truncado por mes.
- **Excel real (.xlsx).** Decisión de negocio 3 — CSV simple, sin librería
  nueva.
- **Comparación mes contra mes anterior (variación %, flechas
  arriba/abajo).** No lo pide el roadmap; agregarlo sería una decisión de
  producto nueva, no asumida acá.
- **Caché de resultados entre requests (Redis/memoria).** Decisión de
  negocio 6 — sin caché este sprint, volumen actual no lo justifica.
- **Filtro de rango libre (desde/hasta arbitrario) en `/reportes`.**
  Decisión de negocio 4/6 — solo selector de mes calendario, acotado a 12
  meses.
- **Cualquier cambio a Egresos/Personal/Créditos/Ventas más allá de leerlos**
  — este sprint no agrega, edita ni anula ningún registro de negocio.
- **Notificaciones/alertas basadas en estos reportes** (ej. "mortalidad alta
  esta semana") — eso es más cercano a Sprint 16 (Push), no a este.

## Riesgos y notas

### R1 — D6, Neon plan gratuito: varias queries de agregación por carga
Cada reporte de `/reportes` dispara al menos una query de lectura filtrada
por mes contra Neon; la carga completa de la pantalla (5 reportes) dispara
~5-8 queries en paralelo (`Promise.all`, mismo patrón que ya usa el
dashboard con créditos). Mitigado por: (a) todas las queries están acotadas
a un solo mes calendario (bounded, nunca "todo el histórico"), (b) el
selector de mes está limitado a los últimos 12 meses (decisión 6), (c) el
volumen real de la granja hoy es bajo (confirmado en
`memory/estado-proyecto.md`). Si el volumen crece significativamente, D6 ya
señala que corresponde re-evaluar el plan de Neon — no es responsabilidad de
este sprint resolverlo con caché prematura.

### R2 — Recharts en Server Components
Next App Router por defecto renderiza Server Components; Recharts usa
`ResizeObserver`/SVG del lado del cliente, así que cada gráfico va en su
propio Client Component (`"use client"`), recibiendo los datos ya agregados
como props desde el Server Component de `page.tsx` — mismo patrón que
cualquier isla interactiva del proyecto (ej. `BitacoraMuro` recibe datos
iniciales del Server Component padre).

### R3 — Exportación CSV: nombres de cliente con comas
`Cliente.nombre` es texto libre — un nombre real podría contener una coma
("Granja López, S.A.C." por ejemplo). El serializador CSV (`aFilasCsv`,
`server/services/reportes.ts`) debe escapar comillas/comas por celda
(RFC 4180 básico), no un `join(",")` ingenuo — cubierto explícitamente en
los tests unitarios de `reportes.test.ts`.

## Criterio de aceptación general
Dado el repo con Sprint 14 ya mergeado a `main`
Cuando un Gerente entra a `/` ve las 5 tarjetas con datos reales del día
  (ninguna hardcodeada), entra a `/reportes` y ve los 5 reportes del mes
  calendario actual (gráfico + tabla según corresponda), cambia el mes con
  el selector (limitado a los últimos 12 meses) y los datos se recalculan,
  y descarga el CSV de cualquiera de los 5 reportes con los mismos datos que
  ve en pantalla
Y un Operario entra a `/` y ve las mismas 5 tarjetas reales, pero al intentar
  entrar a `/reportes` (por URL directa) recibe `403` — mismo criterio que
  `/egresos`/`/personal`
Y ningún registro revertido/anulado (RegistroMortalidad, RegistroRecoleccion,
  Egreso) suma a ningún reporte ni tarjeta
Y `npm run typecheck && npm run lint && npm test` en verde, cobertura ≥90%
  en `server/services/reportes.ts` (y en cualquier Server Action/Route
  Handler nuevo, mismo criterio que sprints anteriores)
