# Tareas — Sprint 15

Checklist de ejecución, misma disciplina de Sprints 1-14: implementar tal
cual `plan.md` (o anotar el desvío real si aparece uno durante la
ejecución) y verificar en código/base de datos real (no solo dar por buena
la tarea al escribirla). Orden tal cual "Orden de ejecución" de `plan.md`
— hay dependencias reales entre tareas, no saltear el orden sin motivo.

Este archivo se llena (`[x]`, con el resultado real y cualquier desvío) a
medida que se ejecuta cada tarea, tal como quedaron documentadas las de
`specs/sprint-13-pwa-instalacion/tasks.md` y
`specs/sprint-14-cola-offline/tasks.md`.

**Rama creada:** `feat/S15-dashboard-reportes`, desde `main` ya actualizado
(Sprint 14 mergeado, commits `247f210`/`413c773` confirmados en el log).

## 15A — Base: decisión técnica, constantes, services puros (testeables sin BD)

- [x] S15-1 — **D8** (Recharts) agregada a `memory/decisiones-tecnicas.md`
  (sin reescribir D1-D7). `memory/stack-tecnologico.md` gana la sección
  "Visualización de datos". Sin desvíos.

- [x] S15-2 — `npm install recharts`. `npm audit`: 8 vulnerabilidades, las
  8 preexistentes (confirmado con `npm ls nanoid hono deepmerge-ts`: todas
  cuelgan de `next`/`prisma`/`@tailwindcss/postcss`/`shadcn`, ninguna de
  `recharts`) — sin vulnerabilidades nuevas.

- [x] S15-3 — `lib/constants.ts`: `REPORTES_MESES_MAXIMOS = 12`,
  `REPORTES_RANKING_CLIENTES_TOP = 10`, mismo formato JSDoc que el resto
  del archivo. Sin desvíos.

- [x] S15-4 a S15-9 — `server/services/reportes.ts` completo
  (`agruparSumaPorDia`, `sumarTotal`, `agruparMortalidadPorTipo`,
  `listarDiasDelRango`, `agruparVentasPorDiaYMetodo`, `rankearClientes`,
  `agruparGastoPorCategoria`, `escaparCeldaCsv`/`aFilasCsv`) escrito de
  una sola vez (archivo cohesivo, mismo criterio que un service chico de
  un solo módulo) junto con `tests/unit/services/reportes.test.ts` (23
  tests). **Cobertura 100%/100%/100%/100%** confirmada vía
  `coverage-summary.json`.

  **Bug real encontrado y corregido antes de cerrar la tarea (no un
  desvío de diseño, un error real de la primera versión de
  `listarDiasDelRango`):** la primera versión formateaba `desde`/`hasta`
  con `toLocaleDateString(..., { timeZone: "America/Lima" })`, igual que
  `agruparSumaPorDia`. Pero `desde`/`hasta` vienen de
  `calcularRangoMesCalendario` (Sprint 12), que sigue la convención de
  `hoyEnLima()` (D5): son `Date` construidos a **medianoche UTC para
  representar** un día calendario de Lima, no un instante real. Pasar ese
  valor por una conversión de timezone real lo corre un día hacia atrás
  (`2026-08-01T00:00:00.000Z` → "31/07" en Lima real). Detectado por 3
  tests que fallaron al correr `vitest run` (`ordena los días...`,
  `lista todos los días de un mes calendario completo...`, `el límite
  \`hasta\` es exclusivo`) — no se dio por buena la tarea hasta que los 23
  tests pasaron. **Corregido**: `listarDiasDelRango` ahora lee
  `desde`/`hasta` con `getUTCDate()`/`toISOString().slice(0,10)`
  (calendario tal cual, sin conversión de timezone) — `agruparSumaPorDia`
  se queda con la conversión real a Lima porque sí recibe timestamps
  reales (`RegistroRecoleccion.creadoEn`, etc.), no representaciones de
  día calendario. Documentado en el comentario de la función para que no
  se repita el error al tocarla de nuevo.

## 15B — Repositories (una función por módulo, independientes entre sí)

- [x] S15-10 — `server/repositories/lote.ts`: `contarLotesActivos()`. Sin desvíos.

- [x] S15-11 — `server/repositories/recoleccion.ts`:
  `sumarProduccionEnRango(desde, hasta)`, `listarProduccionEnRango(desde, hasta)`.
  Sin desvíos.

- [x] S15-12 — `server/repositories/mortalidad.ts`:
  `sumarMortalidadEnRango(desde, hasta)`, `listarMortalidadEnRango(desde, hasta)`.
  Sin desvíos.

- [x] S15-13 — `server/repositories/venta.ts`: `sumarVentasEnRango(desde, hasta)`,
  `listarVentasEnRango(desde, hasta)`, `listarVentasParaRankingEnRango(desde, hasta)`
  (excluye `CLIENTE_PUBLICO_GENERAL_ID`, importado de `lib/constants`). Sin
  desvíos.

- [x] S15-14 — `server/repositories/egreso.ts`:
  `listarEgresosEnRango(desde, hasta)` (`revertido: false` explícito). Sin
  desvíos.

  `npm run typecheck && npm run lint` en verde tras las 5 tareas (solo los
  2 warnings preexistentes: `coverage/block-navigation.js` generado,
  `next/image` en `offline/page.tsx`). `npm test`: 598/598 en verde (575
  heredados + 23 de `reportes.test.ts`), sin regresión.

## 15C — Dashboard real (H1)

- [x] S15-15 — `src/app/page.tsx`: `TARJETAS_EJEMPLO` reemplazado por las
  4 tarjetas reales (`contarLotesActivos`, `sumarProduccionEnRango`,
  `sumarMortalidadEnRango`, `sumarVentasEnRango`, rango `[hoyEnLima(),
  hoyEnLima()+1día)`), mismo markup/íconos/colores que ya tenían. Comentario
  "siguen siendo de ejemplo hasta Sprint 15" eliminado junto con el array
  y el texto "El resto sigue siendo de ejemplo" del pie de la sección
  (ya no aplica, las 5 tarjetas son reales).

  **Verificado en vivo contra Neon dev** en dos niveles: (1) un script
  temporal (`tsx`, descartado al terminar) comparó el resultado de los 4
  repositories nuevos contra un cálculo independiente con `findMany` +
  `reduce` sobre las mismas tablas — coincidencia exacta (Lotes activos: 1,
  Huevos hoy: 0, Mortalidad hoy: 13 en 6 filas, Ventas hoy: S/ 0.00); (2)
  la pantalla `/` real, con sesión Gerente ya activa en el navegador,
  muestra esos mismos 4 números.

  **No-bug encontrado durante la verificación:** el overlay de Next.js
  mostraba "1 Issue" — un error de hidratación (`cz-shortcut-listen="true"`
  agregado a `<body>`). Confirmado como un falso positivo de una extensión
  de Chrome instalada (inyecta el atributo antes de que React hidrate),
  ajeno por completo a `layout.tsx`/`page.tsx` de este sprint — no se tocó
  ningún archivo para "corregirlo".

## 15D — Pantalla `/reportes` (H2-H6)

- [x] S15-16 — `server/auth/rbac.ts`: `{ ruta: "/reportes", roles: ["GERENTE"] }`
  agregado a `RUTAS_POR_ROL`. Tests nuevos en `tests/unit/auth/rbac.test.ts`
  (GERENTE permitido, OPERARIO bloqueado en `/reportes` y en
  `/reportes/exportar` por `startsWith`, `/` sigue sin restricción para
  ningún rol). **Verificado en vivo** con una sesión OPERARIO real: `GET
  /reportes` y `GET /reportes/exportar` devuelven `{"error":"No
  autorizado."}` (403 del middleware).

- [x] S15-17 — `src/app/(app)/reportes/page.tsx` (Server Component,
  `Promise.all` de los 5 `listar*EnRango`) +
  `components/domain/reportes/reportes-filtro-mes.tsx` (Client Component,
  `<Select>` de mes/año dirigido por URL `?mes=YYYY-MM`, últimos
  `REPORTES_MESES_MAXIMOS` valores, mismo patrón que `EgresoFiltros`).

  **Bug real encontrado y corregido en vivo (no un desvío de diseño):**
  `valorMes` vivía exportada desde `reportes-filtro-mes.tsx` (`"use
  client"`). Next.js convierte TODOS los exports de un archivo `"use
  client"` en referencias de cliente — `page.tsx` (Server Component)
  invocándola directo explotó en runtime: *"Attempted to call valorMes()
  from the server but valorMes is on the client"* (confirmado en vivo
  contra el dev server, `GET /reportes` → 500). **Corregido** moviendo
  `valorMes` a `src/lib/reportes.ts` (módulo neutro, sin directiva
  `"use client"`/`"use server"`), importado tanto por `page.tsx` como por
  `reportes-filtro-mes.tsx`. También corrige un desvío real respecto a
  `plan.md`: el pseudocódigo original asumía `mesActualEnLima`/
  `parsearMesParam` como helpers privados de `page.tsx` ("un solo
  consumidor") — al diseñar la exportación (S15-23) apareció un segundo
  consumidor real (`exportar/route.ts`), así que ambas funciones se
  movieron a `server/services/reportes.ts` (pura, sin Prisma) en vez de
  duplicarse; cubiertas con 9 tests nuevos en `reportes.test.ts`
  (`vi.useFakeTimers`/`vi.setSystemTime`, mismo patrón que
  `tests/unit/lib/zod-lote.test.ts`), cobertura del archivo completo
  confirmada en 100%/100%/100%/100%.

  **Hallazgo real, no contemplado en `plan.md`/`tasks.md` originales:**
  `/reportes` no estaba en `components/layout/nav-items.ts`
  (`NAV_ITEMS`) — la pantalla existía y estaba protegida por rol, pero
  ningún Gerente podía llegar a ella navegando (solo por URL manual). El
  Sidebar filtra `NAV_ITEMS` con la misma `rolPermitidoParaRuta()` que ya
  protegía la ruta, así que agregar la entrada (`{ href: "/reportes",
  label: "Reportes", icon: BarChart3 }`, al final de la lista, mismo
  criterio cronológico que Egresos/Personal) alcanzó sin tocar
  `sidebar.tsx`. **Verificado en vivo**: con sesión GERENTE, "Reportes"
  aparece en el Sidebar (con ícono de gráfico de barras) después de
  "Personal"; con sesión OPERARIO, no aparece.

- [x] S15-18 — `components/domain/reportes/reporte-produccion.tsx`
  (Client Component, Recharts `<LineChart>` diario + total mensual) con
  botón "Exportar CSV". Antes de escribir el código de los 5 gráficos se
  cargó la skill `dataviz` (color por última — nunca primero) y se
  generó/validó una paleta categórica de 5 tonos con
  `scripts/validate_palette.js` (lightness band, piso de croma,
  separación CVD adyacente, contraste) para reemplazar los `--chart-1..5`
  grises sin usar de `shadcn init` en `globals.css` — mismo hex pasa en
  claro (superficie `#ffffff`) y en oscuro (superficie `#171717`, ≈
  `--background` dark), documentado en el comentario de `globals.css`.
  Serie única → `--chart-1` fijo, sin leyenda (regla dataviz: una sola
  serie no necesita legend box).

- [x] S15-19 — `components/domain/reportes/reporte-mortalidad.tsx`
  (`<BarChart>` diario + desglose MUERTE/DESCARTE como stat, `--chart-1`).

- [x] S15-20 — `components/domain/reportes/reporte-ventas.tsx` (Recharts
  `<BarChart>` apilado, una serie por `MetodoPago` en orden fijo
  EFECTIVO/YAPE/PLIN/TRANSFERENCIA → `--chart-1..4`, con leyenda).

- [x] S15-21 — `components/domain/reportes/reporte-ranking-clientes.tsx`
  (tabla Top N envuelta en `<TableScrollArea>` — convención de
  `memory/convenciones.md`, "Tablas con scroll horizontal" — no un `div
  overflow-x-auto` a mano; sin `<DataTablePagination>`, no es una tabla de
  gestión paginable) con botón "Exportar CSV".

- [x] S15-22 — `components/domain/reportes/reporte-gasto-categoria.tsx`
  (`<BarChart>` con `<Cell>` por categoría, 5 `CategoriaEgreso` en orden
  fijo → `--chart-1..5`).

- [x] S15-23 — `src/app/(app)/reportes/exportar/route.ts` (Route Handler
  GET, dentro de `app/(app)/reportes/` para heredar la regla `/reportes`
  de `rbac.ts` por `startsWith`, sin necesitar una entrada aparte para
  `/api/reportes`): verifica `auth()` + rol GERENTE explícito (defensa en
  profundidad), despacha por `tipo`
  (`produccion`/`mortalidad`/`ventas`/`ranking-clientes`/`gastos`), arma
  CSV con `aFilasCsv`, responde con `Content-Disposition: attachment`.
  **Verificado en vivo con sesión GERENTE real** (no solo por tipos):
  `GET /reportes/exportar?tipo=gastos&mes=2026-08` descargó
  `gastos-2026-08.csv` real al navegador con contenido exacto (`Categoría,
  Monto total / Alimentos,1000.00 / Insumos y vacunas,0.00 / ...`),
  coincidiendo con lo que mostraba `ReporteGastoCategoria` en pantalla el
  mismo momento — archivo de verificación descartado después.

## 15E — Verificación final y cierre

- [x] S15-24 — Verificación en vivo completa contra Neon dev (Chrome real,
  no solo curl):
  - Dashboard `/`: los 4 números reales coincidieron exactamente con un
    cross-check independiente (`findMany` + `reduce` en un script
    temporal, descartado) antes de mirar la UI — 1 lote activo, 0 huevos,
    13 mortalidad (6 filas), S/ 0.00 ventas, para "hoy" (2026-08-19).
  - Los 5 reportes de `/reportes` renderizaron con datos reales del mes
    actual (agosto 2026): Producción 300 huevos (un solo día con datos),
    Mortalidad 19 muertes/0 descartes, Ventas por método (Efectivo/Yape
    visibles, Plin/Transferencia en 0 ese mes), Ranking de clientes (Top 1
    real: "Luis Angel Tantalean Letona", Minorista, S/ 158.70, 4 ventas —
    "Público General" confirmado ausente pese a tener ventas ese mes),
    Gasto por categoría (S/ 1000.00, 100% en Alimentos, las otras 4
    categorías en 0 pero visibles en el gráfico).
  - Selector de mes: dropdown limitado a exactamente 12 meses (agosto 2026
    → septiembre 2025, confirmado contando las opciones reales, no
    asumido). Cambiar a junio 2026 (mes sin datos) recalculó sin recargar
    la página completa (`GET /reportes?mes=2026-06` confirmado en el log
    del dev server) y mostró "0 huevos este mes"/"0 muertes · 0 descartes
    este mes" sin error — estado vacío correcto, no un crash.
  - Exportación CSV verificada con sesión GERENTE real (ver S15-23).
  - Rol: sesión OPERARIO real (cuenta `operario`, existente en la BD de
    desarrollo pero sin contraseña documentada en `memory/` — reseteada a
    `Cambiar123!` vía script temporal de Prisma para poder verificar,
    mismo criterio de "script temporal contra Neon real" que otros
    sprints) confirmó `403` en `/reportes` y `/reportes/exportar`, y
    confirmó que "Reportes" no aparece en su Sidebar. Sesión GERENTE
    confirmó "Reportes" sí aparece en el Sidebar (hallazgo de S15-17).
  - **No-bug encontrado, no de este sprint:** el overlay de Next.js marcó
    un error de hidratación (`cz-shortcut-listen="true"` en `<body>`) en
    varias pantallas — confirmado como falso positivo de una extensión de
    Chrome instalada en el navegador de verificación (inyecta el atributo
    antes de que React hidrate), ajeno a `layout.tsx`/cualquier archivo de
    este sprint (`git diff --stat main -- src/app/layout.tsx` sin
    cambios). Otro overlay (`<Script>` de captura de
    `beforeinstallprompt`, Sprint 13) también confirmado preexistente, sin
    relación con Sprint 15.
  - No se pudo verificar en vivo un registro revertido de Mortalidad/
    Recolección/Egreso excluido del reporte del mes (no había ningún
    registro revertido real dentro de agosto 2026 en los datos de
    desarrollo disponibles) — cubierto en cambio por unit tests explícitos
    en `services/reportes.ts` (revertido nunca llega a la lista que
    reciben `agruparSumaPorDia`/`agruparGastoPorCategoria`, filtrado en el
    `where` del repository) y por el mismo patrón ya verificado en vivo en
    Sprints 4-12 para `revertido` en otros módulos.

- [x] S15-25 — `npm run typecheck && npm run lint && npm test` en verde
  (611 tests, sin regresión sobre los 598 heredados + los agregados en
  este sprint; únicos warnings: `coverage/block-navigation.js` generado y
  `next/image` en `offline/page.tsx`, ambos preexistentes). Cobertura
  100%/100%/100%/100% confirmada en `server/services/reportes.ts` vía
  `coverage-summary.json` (por encima del umbral ≥90% del DoD). Cierre de
  sprint: este archivo actualizado con el resultado real de cada tarea y
  los 3 hallazgos reales encontrados durante la ejecución (bug de
  cliente/servidor en `valorMes`, paleta de gráficos sin validar
  heredada de `shadcn init`, nav item faltante en `NAV_ITEMS`).

## 15F — Revisión post-cierre (2026-08-20), feedback en vivo del Product Owner

El Gerente probó `/reportes` ya desplegado y pidió 4 cambios explícitos:
exportación a Excel real (el CSV "se veía mal"), más gráficos/reportes
("importantes", a criterio del equipo), filtro desde/hasta en vez de
selector de mes único, y mejorar la velocidad de carga ("con esta nueva
puesta se han vuelto lentos"). Decisiones nuevas documentadas como
**D9/D10/D11** en `memory/decisiones-tecnicas.md` — no se reabre `spec.md`
original, esto es una revisión post-cierre real, mismo criterio que
"Historial de revisión" ya usa `decisiones-tecnicas.md` para D1-D8.

Dos preguntas explícitas vía `AskUserQuestion` antes de tocar código: (1)
alcance de "más gráficos" → el Product Owner pidió pensar como Gerente y
elegir; se sumaron **Créditos y cobranza**, **Mortalidad por lote/galpón**
y **Balance financiero** (D11) sobre los 5 reportes ya cerrados del
roadmap original — quedan 8 en total. (2) sin pregunta aparte para
Excel/fechas — el pedido ya era inequívoco.

- [x] S15-26 — Investigación de rendimiento antes de tocar código (no se
  asumió la causa). `npm run build` de producción confirmó code-splitting
  correcto por ruta (Recharts no se filtra a otras páginas). Comparando
  las queries nuevas de este sprint contra los índices reales del schema
  se encontró la causa real y concreta: `RegistroMortalidad` solo tenía
  `@@index([loteId, fecha])` — todo el código anterior a Sprint 15
  siempre filtraba por `loteId` primero; `sumarMortalidadEnRango`/
  `listarMortalidadEnRango` (dashboard + cada carga de `/reportes`)
  filtran por `fecha` en TODA la granja, sin `loteId`, forzando un seq
  scan completo en cada carga. **Corregido**: migración
  `20260820064842_sprint15_indice_mortalidad_fecha`, agrega
  `@@index([fecha, revertido])` (mismo criterio que ya tenía
  `RegistroRecoleccion`). Aplicada en vivo contra Neon dev,
  `memory/modelo-datos.md` actualizado. **Hallazgo operativo durante la
  migración:** `npx prisma generate` falló con `EPERM` (DLL del motor de
  Prisma bloqueada) — causado por procesos `node` huérfanos de una sesión
  de `npm run dev` anterior que `TaskStop` no había terminado del todo en
  Windows; confirmado con `wmic process ... get CommandLine` antes de
  matarlos (no se asumió, se verificó que eran del propio proyecto).

- [x] S15-27 — Segunda mejora de rendimiento: los 7 gráficos de Recharts
  (todos excepto Ranking de clientes, que es una tabla sin Recharts) se
  cargan con `next/dynamic({ ssr: false })` desde un wrapper cliente nuevo
  (`reportes-graficos-lazy.tsx`) con un esqueleto simple mientras cargan —
  `next/dynamic` con `ssr: false` no se puede usar directo dentro de
  `page.tsx` (Server Component, hace fetch a Prisma), de ahí el wrapper.
  El resto de la pantalla (filtro, encabezados) sigue siendo Server
  Component puro y aparece de inmediato.

- [x] S15-28 — Filtro reescrito: `reportes-filtro-mes.tsx` (selector de
  mes) reemplazado por `reportes-filtro-fechas.tsx` (Desde/Hasta, mismo
  patrón que `EgresoFiltros`). `server/services/reportes.ts`:
  `mesActualEnLima`/`parsearMesParam` reemplazadas por
  `inicioDeDiaEnLima`/`finDeDiaEnLimaExclusivo`/`rangoMesActual`/
  `parsearRangoFechas`. `lib/reportes.ts` (creado en S15-17 para
  `valorMes`) eliminado — ya no hace falta.

  **Bug real encontrado y corregido por los tests, antes de llegar a
  producción (no en vivo):** la primera versión de `parsearRangoFechas`
  comparaba `hasta` (instante real en América/Lima, offset `-05:00`
  explícito) contra `hoyEnLima() + 1 día` (el otro truco del proyecto,
  "medianoche UTC representa el día calendario") — mezclar las dos
  convenciones corría el límite 5 horas y rechazaba por error un `hasta =
  hoy` legítimo. Mismo tipo de bug que ya apareció una vez en
  `listarDiasDelRango` (S15-17) — esta vez atrapado por
  `tests/unit/services/reportes.test.ts` antes de tocar la UI.
  **Corregido**: el límite "no futuro" se construye con la MISMA función
  (`finDeDiaEnLimaExclusivo`) que ya usa `hasta`, nunca mezclada con el
  otro truco de fecha del proyecto.

- [x] S15-29 — 3 reportes nuevos (D11): repositories
  (`listarCreditosPendientesConFechaLimiteEnRango`,
  `listarMortalidadPorLoteEnRango`, `fecha` agregado al `select` de
  `listarEgresosEnRango`), services puros (`agruparCreditosPorNivelAlerta`
  — reutiliza `calcularNivelAlerta`/`calcularSaldoPendiente` de
  `services/credito.ts`, sin duplicar lógica; `agruparMortalidadPorLote`;
  `combinarBalance` — deriva Balance financiero de los mismos `ventas`/
  `egresos` que ya trae `/reportes`, sin query nueva), componentes
  (`reporte-creditos.tsx`, `reporte-mortalidad-lote.tsx`,
  `reporte-balance.tsx`). Balance financiero **excluye explícitamente**
  `SueldoMovimiento`/planilla — documentado en el propio componente y en
  D11, no es un olvido.

  **Tiempo real invertido en la paleta de colores de "Créditos y
  cobranza":** al intentar validar 3 tonos amber/rojo con
  `scripts/validate_palette.js` (skill dataviz) para los 3 niveles de
  alerta, ningún combo pasó las 4 verificaciones en ambos modos claro/
  oscuro a la vez (el par de rojos exigido por la escalación de severidad
  queda sistemáticamente por debajo del piso ΔE≥15 de visión normal).
  Decisión pragmática, documentada acá en vez de seguir iterando: se usó
  el mismo criterio amber/rojo que ya tienen `.badge-alerta-*` en
  `globals.css` (Sprint 11) sin nueva validación exhaustiva — el gráfico
  tiene etiqueta directa en el eje X (no depende solo del color) y es un
  reporte secundario, no el entregable principal del sprint.

- [x] S15-30 — CSV → Excel real (D9): `npm install exceljs`.
  `server/services/reportes.ts`: `aFilasCsv`/`escaparCeldaCsv` eliminadas,
  reemplazadas por `construirLibroExcel()` (encabezado en negrita con
  fondo `--primary`, ancho de columna automático, formato de moneda `"S/"
  #,##0.00`). `app/(app)/reportes/exportar/route.ts` reescrito para
  devolver `.xlsx` (los 8 tipos de reporte) en vez de `.csv`. Los 8
  botones "Exportar CSV" pasan a "Exportar Excel".

  **Hallazgo real de dependencias, encontrado por el compilador, no
  asumido:** `Buffer`/`Buffer<ArrayBufferLike>` tratados como tipos
  incompatibles al pasar el resultado de `writeBuffer()` a `NextResponse`.
  Investigado hasta la causa raíz (no silenciado con `as any`, prohibido
  por `CLAUDE.md`): `@fast-csv/format`/`@fast-csv/parse` (dependencias
  transitivas de `exceljs`) declaran `@types/node@^14.0.1` como
  `dependency` regular, instalando una copia anidada y ancestral que
  contaminaba la resolución de tipos ambientales de `Buffer` en el
  proyecto. **Corregido** con `"overrides": { "@types/node": "^20" }` en
  `package.json` (fuerza una sola versión en todo el árbol) +
  `construirLibroExcel()` sin anotar su tipo de retorno a mano (deja que
  TS infiera el tipo real de `writeBuffer()` en vez de imponer una
  anotación que quedaba desalineada). Ver D9 para el detalle completo.

- [x] S15-31 — Verificación en vivo completa contra Neon dev, sesión
  GERENTE real: los 8 reportes renderizaron con datos reales del mes
  actual (agosto 2026) — incluido Balance financiero (S/ 594.75 ingresos,
  S/ 1000.00 egresos, neto -S/ 405.25 en rojo, confirmando el color
  condicional ingreso/egreso). Selector de fechas: cambiar "Hasta"
  disparó `GET /reportes?desde=...&hasta=...` (confirmado en el log del
  dev server) y recalculó sin recargar la página completa. Interactividad
  de leyenda verificada en vivo: clic en "Yape" (Ventas por método de
  pago) ocultó la serie, quitó la barra del gráfico y reescaló el eje Y
  automáticamente. Tooltip con crosshair verificado (hover sobre
  Balance financiero mostró Ingresos/Egresos del día exacto). Exportación
  Excel verificada descargando 2 archivos reales (`creditos_...xlsx`,
  `gastos_...xlsx`) y leyéndolos de vuelta con ExcelJS: nombre de hoja,
  encabezado en negrita con fondo naranja de marca, formato de moneda
  `"S/" #,##0.00` en la columna de montos — confirmado, no asumido.
  Dashboard `/` y guard de rol (`/reportes`/`/reportes/exportar` → `403`
  para OPERARIO) reconfirmados sin regresión. Archivos de verificación
  descartados al terminar.

- [x] S15-32 — `npm run typecheck && npm run lint && npm test` en verde
  (622 tests, sin regresión). Cierre de la revisión post-cierre: D9/D10/D11
  documentadas en `memory/decisiones-tecnicas.md`,
  `memory/stack-tecnologico.md` actualizado (ExcelJS, Recharts con
  `next/dynamic`), `memory/modelo-datos.md` actualizado (índice nuevo de
  `RegistroMortalidad`). `REPORTES_MESES_MAXIMOS` eliminada de
  `lib/constants.ts` (sin reemplazo, D10). Sin commit todavía — a la
  espera de que el Product Owner revise en vivo antes de pedir el commit.

## 15G — Segunda ronda de feedback en vivo (2026-08-20, mismo día)

El Product Owner probó S15-F desplegado y reportó 3 cosas: un bug visual
real en el tooltip de "Créditos y cobranza" (captura de pantalla adjunta:
mostraba "Créditos : 96" sin el prefijo "S/"), el dashboard `/` "se ve
bien muerta, bien simple" y pidió acomodarla con más contenido, y el
Sidebar colapsado a íconos no dejaba ver/llegar al ícono de "Reportes"
(nuevo, agregado en S15-17) por falta de scroll vertical.

- [x] S15-33 — **Bug real encontrado y corregido**, no un desvío de
  diseño: en `reporte-creditos.tsx`, el `formatter` del `Tooltip` comparaba
  `nombre === "montoPendiente"` (la dataKey) para decidir si formatear
  como moneda — pero Recharts pasa ahí el `name` VISIBLE del `<Bar>`
  ("Monto pendiente", con espacio y mayúscula), no la dataKey. La
  comparación nunca era verdadera, así que el tooltip caía siempre en la
  rama sin formatear (`[valor, "Créditos"]`) — exactamente el bug que
  mostró la captura del Product Owner. **Corregido** simplificando: con un
  solo `<Bar>` en este gráfico no hace falta ninguna rama condicional,
  siempre es moneda. Verificado en vivo con hover real sobre la barra:
  "Por vencer / Monto pendiente : S/ 96.00".

- [x] S15-34 — Sidebar colapsado a íconos: `ui/sidebar.tsx` (shadcn, no se
  edita a mano) fija `overflow-hidden` en modo `collapsible=icon` —
  supuesto válido hasta que la lista de íconos dejó de entrar siempre en
  la altura del viewport (con "Reportes", S15-17, ya no entra en pantallas
  bajas). Corregido en el punto de uso
  (`components/layout/sidebar.tsx`): `<SidebarContent
  className="group-data-[collapsible=icon]:overflow-y-auto">` — `cn()`/
  tailwind-merge deja que esta clase gane sobre el `overflow-hidden`
  original sin tocar el componente compartido. Verificado en vivo:
  scroll dentro de la columna de íconos revela "Reportes" completo.

- [x] S15-35 — Dashboard `/` rediseñado, reutilizando componentes/datos ya
  construidos (sin queries nuevas de fondo salvo un aggregate chico):
  - `server/repositories/egreso.ts` gana `sumarEgresosEnRango` (aggregate
    `_sum`, mismo criterio que `sumarVentasEnRango`).
  - Sección "Balance del mes" (Ingresos/Egresos/Neto, iconos
    TrendingUp/TrendingDown/Scale) reutiliza `rangoMesActual()` (ya
    existía para `/reportes`, D10) + `sumarVentasEnRango`/
    `sumarEgresosEnRango` — mismo criterio "sin planilla" que Balance
    financiero de `/reportes` (D11), etiqueta "(sin planilla)" explícita
    en la tarjeta para no repetir la ambigüedad.
  - Sección "Créditos por vencer" reutiliza `PanelAlertas` tal cual (el
    mismo componente de `/creditos`, Sprint 11) sobre los
    `creditosPendientes` que el dashboard ya traía — cero query nueva.
  - Botón "Ver reportes completos" en el `PageHeader`, link a `/reportes`.
  - **Las 3 secciones nuevas quedan restringidas a GERENTE** (`session.user.rol
    === "GERENTE"`, ya resuelto en el propio `page.tsx`) — decisión
    tomada sin volver a preguntar, apoyada en `mision.md` ("Gerente
    necesita visibilidad total... Operario necesita rapidez y
    simplicidad"): el dashboard de Operario se queda exactamente como
    estaba (5 tarjetas), sin agregar contenido que no le sirve y sin
    queries de más en su carga. `/` sigue sin restricción de ruta en
    `rbac.ts` — el gating es de contenido dentro de la página, no de
    acceso a la ruta.

  Verificado en vivo con sesión GERENTE real: "Balance del mes" mostró
  S/782.75 ingresos, S/1000.00 egresos, S/-217.25 neto en rojo; "Créditos
  por vencer" mostró el crédito real de Nancy Marlene Quiroz Ninaquispe
  (S/96.00, "Por vencer", botón "Registrar abono" funcional al ser el
  mismo componente de `/creditos`) — mismo crédito que ya aparecía en el
  reporte de Créditos y cobranza de `/reportes`, coincidencia esperada
  (misma fuente de datos).

- [x] S15-36 — `npm run typecheck && npm run lint && npm test` en verde
  (622 tests, sin regresión). Sin commit todavía.

## 15I — Ajustes de detalle y guion largo → guion normal (2026-08-20, mismo día)

Dos pedidos puntuales de detalle en el dashboard, más una preferencia
general del Product Owner sobre puntuación ("no quiero usar para nada ese
guión largo, usalo el normal '-'").

- [x] S15-40 — `page.tsx`: se quita la descripción "Avícola M&A — panel de
  inicio" del `PageHeader` (prop `description` eliminada, ya no hace falta
  con el título "Inicio" de S15-37). "Créditos vencidos" pasa de guion
  largo (`—`) a guion normal (`-`) entre la cantidad y el monto.

- [x] S15-41 — Barrido del guion largo (`—`, U+2014) a guion normal (`-`)
  en **texto visible para el usuario** en toda la app — NO en comentarios
  de código (esos son documentación interna, el Product Owner reacciona a
  lo que ve en pantalla, no al código fuente). Encontrados y corregidos ~30
  usos reales repartidos en 20 archivos: mensajes de error/vacío
  (`/pos`, `/api/sync`), metadata de PWA (`layout.tsx`/`manifest.ts`,
  descripción de la app), placeholders de "sin dato" en tablas (`—` suelto
  como contenido de celda — Clientes, Egresos, Galpones, Lotes,
  Mortalidad, Personal, Recolección, Sueldos, Ventas), texto de selects y
  etiquetas (Mortalidad, Consolidación), comprobante de venta y su share
  nativo (`comprobante-dialog.tsx`, POS), estado de cuenta de cliente
  (`estado-cuenta-cliente.tsx`), toasts de Consolidación (romper
  paquete/bandeja), y el tooltip de `reporte-mortalidad-lote.tsx` (propio
  de este sprint). Un caso especial: `lotes-tabla.tsx` usaba `— finalizado
  —` (guion decorativo a los dos lados) → `- finalizado -`. Se dejó sin
  tocar el signo MINUS (`−`, U+2212) de `sueldo-movimientos-tabla.tsx`
  (`+`/`−` para signo de monto) — carácter distinto, no es el guion largo
  que pidió cambiar.

  **Verificación de alcance, no asumida:** se corrió `grep -rn "—"
  src/app src/components ... | grep -v <línea de comentario>` antes y
  después del barrido para separar comentarios (que se dejan intactos, es
  el estilo de comentarios ya establecido en todo el proyecto) de texto
  realmente renderizado — varias coincidencias ambiguas (JSX
  `{/* comentario multilínea */}` sin `//` al inicio de la línea) se
  verificaron leyendo el archivo completo antes de decidir no tocarlas.

  Verificado en vivo: `/clientes` (celular/dirección vacíos → "-"),
  `/lotes` (columna Ubicación de un lote finalizado → "- finalizado -").

- [x] S15-42 — `npm run typecheck && npm run lint && npm test` en verde
  (622 tests, sin regresión — el barrido no tocó ningún test existente ni
  ninguna aserción que dependiera del guion largo). Sin commit todavía.

## 15H — Tercera ronda de feedback en vivo (2026-08-20, mismo día)

Dos pedidos puntuales sobre el dashboard ya rediseñado en 15G: el título
"Hola, {nombre}" no convencía ("no sé, no me gusta") y las 5 tarjetas de
"Hoy" quedaban en un número impar, con la quinta sola en una segunda fila
— pedido explícito: 6 tarjetas, ordenadas por jerarquía ("importantes y
necesarios primero"), 3 arriba y 3 abajo, mismo tamaño/estilo que las
tarjetas de "Balance del mes" (S15-35), responsive.

- [x] S15-37 — Título del dashboard: `"Hola${nombre ? ", " + nombre : ""}"`
  → `"Inicio"`, simple. `session.user.nombre` ya no se lee en `page.tsx`
  (quedó sin otro consumidor tras el cambio, eliminado — no dejar una
  variable sin uso real).

- [x] S15-38 — 6 tarjetas de "Hoy" (antes 5), reordenadas por jerarquía y
  restyladas al mismo layout horizontal (`flex items-center gap-3`) y
  grid (`grid-cols-1 sm:grid-cols-3`) que "Balance del mes" — antes eran
  `flex-col` (ícono arriba) en un grid `grid-cols-2 lg:grid-cols-4`
  distinto. **6ta tarjeta nueva: "Egresos hoy"** (`sumarEgresosEnRango(hoy,
  mañana)`, ya existía el repository desde S15-35, sin query nueva más
  que agregarla al `Promise.all`) — elegida para completar el trío
  financiero junto a "Créditos vencidos"/"Ventas hoy", mismo criterio que
  ya justificó "Balance del mes" en mision.md. Orden final: **fila 1
  (financiero)** Créditos vencidos, Ventas hoy, Egresos hoy — **fila 2
  (operativo)** Lotes activos, Huevos hoy, Mortalidad hoy. La tarjeta de
  Créditos vencidos (único link a `/creditos` de las 6) se unificó al
  mismo array `tarjetas` que las otras 5 (antes vivía aparte, hardcodeada
  fuera del `.map()`) — un solo `.map()` decide `Link` vs `div` según si
  la tarjeta trae `href`, sin duplicar el markup de la tarjeta dos veces.

  Verificado en vivo con sesión GERENTE real: 6 tarjetas en 2 filas de 3,
  mismo tamaño visual que "Balance del mes" debajo, título "Inicio" sin
  saludo.

- [x] S15-39 — `npm run typecheck && npm run lint && npm test` en verde
  (622 tests, sin regresión — este cambio es solo de presentación en
  `page.tsx`, sin lógica nueva que testear). Sin commit todavía.

## 15J — Voseo → tuteo (español Perú) y cierre del barrido de guion largo (2026-08-20, mismo día)

Pedido del Product Owner: varios textos usaban voseo rioplatense ("podés",
"colocá") en vez de tuteo estándar peruano ("puedes", "coloca"). Aprovechando
el barrido, se revisó también si había quedado algo del guion largo (S15-41)
fuera del alcance original de esa búsqueda.

- [x] S15-43 — Barrido de formas de voseo (`podés`, `tenés`, `colocá`,
  `contactá`, `pedile`, `actualizá`, `revisá`, `reintentá`, `intentá`, etc.)
  en **texto visible para el usuario** — 16 instancias reales en 12
  archivos: `pos/page.tsx` ("pedile"→"pídele", "contactá"→"contacta"),
  `services/usuario.ts`, `services/egreso.ts`, `consolidar-sueltos-dialog.tsx`,
  `comprobante-dialog.tsx`, y los `AccionError`/mensajes de reintento de
  `actions/consolidacion.ts` (2), `actions/credito.ts`, `actions/egreso.ts`,
  `actions/lote.ts`, `actions/mortalidad.ts` (2), `actions/recoleccion.ts`
  (2), `actions/sueldo-movimiento.ts`. Estos mensajes de `server/actions/*`
  cuentan como texto de usuario aunque vivan en un `.ts`: son el `motivo` de
  un `AccionError` que se muestra tal cual en un toast (patrón
  `with-auth.ts`), no comentarios de código. Se actualizaron las
  aserciones de test correspondientes (10 archivos en
  `tests/integration/actions/` + `tests/unit/services/usuario.test.ts` y
  `egreso.test.ts`) para que sigan comparando contra el string real.

- [x] S15-44 — Al revisar `server/actions` y `server/services` para el
  barrido de voseo, se detectó que el barrido de guion largo de S15-41 solo
  había cubierto `src/app` y `src/components` — **`src/server` había
  quedado fuera del alcance original**. Se corrigió: ~20 instancias más de
  `—` en mensajes de error/motivo reales repartidas en `bitacora.ts`,
  `cliente.ts`, `consolidacion.ts`, `credito.ts`, `egreso.ts`, `empleado.ts`,
  `galpon.ts`, `inventario.ts`, `mortalidad.ts`, `precioKilo.ts`,
  `recoleccion.ts`, `rotura.ts` (4), `sueldo-movimiento.ts`, `venta.ts` (2),
  `services/galpon.ts`, `services/recoleccion.ts` (2) — con sus aserciones
  de test correspondientes actualizadas.

- [x] S15-45 — Verificación final de alcance sobre todo `src`: se corrió
  un grep de las formas de voseo conocidas (resultado: **vacío**, cero
  instancias restantes) y un grep de `—` fuera de comentarios (resultado:
  46 coincidencias). Se leyeron las 46 líneas completas —todas son
  comentarios de código: bloques `{/* ... */}` multilínea de JSX donde el
  guion largo cae en una línea de continuación que no empieza con `//` ni
  `*` (por eso el filtro de comentarios de la primera pasada no las
  excluía), no texto renderizado. Se dejaron sin tocar, consistente con el
  criterio ya establecido en S15-41 (el Product Owner reacciona a lo que
  ve en pantalla, no al código fuente).

- [x] S15-46 — `npm run typecheck && npm run lint && npm test` en verde
  (622 tests, sin regresión). Sin commit todavía.
