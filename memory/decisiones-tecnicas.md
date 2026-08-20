# Decisiones Técnicas (D1–D7) — CERRADAS

Estas decisiones fueron confirmadas por el Product Owner (Gerente) antes de
iniciar la migración del Sprint 0. Cambiar cualquiera de estas después de
tener datos reales en producción tiene un costo alto — si se necesita
revisar alguna, se documenta como decisión nueva, no se sobreescribe esta.

## D1 — Captura de peso en balanza ✅ CERRADO
**Decisión:** digitación manual. El operario lee el peso en la báscula
física y lo escribe en el campo correspondiente de la pantalla. No hay
integración por Bluetooth/USB/API con la balanza.
**Impacto:** confirma el diseño de UI ya definido en los Sprints 5, 7, 9
y 10 — campos de peso como input numérico simple, sin lógica de hardware.

## D2 — Bitácora sin vínculo a galpón ✅ CERRADO
**Decisión:** un registro de `BitacoraGlobal` es siempre una nota general
de toda la granja, sin selección de galpones específicos. La búsqueda se
hace por texto libre (`ILIKE` sobre `contenido`), no por filtro estructurado
de ubicación.
**Impacto:** se elimina la necesidad del modelo `BitacoraGalpon` del schema.
La tarea **S4-4 del Sprint 4 queda descartada** (chips de selección de
galpón). Reduce la fricción del operario al escribir una nota — no tiene
que pensar en qué galpón marcar antes de guardar.

## D3 — Instancia única (no multi-granja) ✅ CERRADO
**Decisión:** el sistema es para una sola granja, para siempre. No hay
tabla `Granja` ni aislamiento de datos por tenant.
**Impacto:** simplifica el schema completo — sin `granjaId` repartido en
cada tabla, sin lógica de aislamiento de datos entre tenants. Si en algún
momento futuro esto cambiara, sería una migración estructural mayor, no
contemplada en el diseño actual.

## D4 — Sin adjuntos/comprobantes ✅ CERRADO
**Decisión:** no se suben fotos ni comprobantes a los registros de Egreso.
**Impacto:** el modelo `Egreso` no incluye campo de archivo adjunto
(`comprobanteUrl` queda descartado). No se necesita Vercel Blob Storage
ni ninguna solución de almacenamiento de archivos como dependencia del
stack — reduce una integración completa del proyecto.

## D5 — Zona horaria ✅ CERRADO
**Decisión:** `America/Lima` fija en toda la aplicación (servidor y
cliente). No se implementa selector de zona horaria — es una instancia
de una sola granja en Perú.
**Impacto:** afecta cualquier cálculo de plazos (ventana de gracia de
10 min, fecha límite de créditos, cron de detección de vencimientos).
Todos los timestamps se muestran y calculan en esta zona horaria.

## D6 — Backups: plan gratuito de Neon (riesgo aceptado) ✅ CERRADO
**Decisión:** se usa el plan gratuito de Neon para backups/PITR
(Point-in-Time Recovery) en la v1, en vez de contratar un plan pago
desde el inicio.
**Riesgo aceptado explícitamente:** el plan gratuito tiene una ventana
de recuperación más corta que los planes pagos. Si ocurre una corrupción
de datos o borrado accidental, hay menos días hacia atrás disponibles
para restaurar. Esto es aceptable para el volumen actual de la granja,
pero **debe re-evaluarse** cuando:
  - el volumen de créditos/dinero gestionado crezca significativamente, o
  - el número de usuarios activos aumente, o
  - haya presupuesto disponible para upgrade.
**Acción de seguimiento:** agregar este ítem a la tabla de riesgos del
plan SCRUM (`memory/` o el documento de riesgos), no dejarlo solo aquí.

---

## D7 — Librería PWA: Serwist vía `@serwist/turbopack` ✅ CERRADO (2026-08-18, Sprint 13)
**Decisión:** se usa **Serwist** (`serwist`, `@serwist/turbopack`,
`esbuild` como dependencia de build) en vez de `next-pwa`.
`stack-tecnologico.md` decía "next-pwa o Serwist" sin cerrar — esta
decisión lo cierra.
**Motivo:** Next 16.2.12 usa Turbopack estable por defecto para `dev` y
`build` (fijado en Sprint 0). `next-pwa` engancha su generación del
Service Worker al hook `webpack()` de `next.config.js` — no tiene ninguna
ruta de integración con Turbopack, porque Turbopack no ejecuta esa config
en absoluto. Usarlo exigiría `next build --webpack` en producción mientras
`next dev` sigue en Turbopack — dos bundlers distintos entre entornos,
reintroduciendo exactamente el riesgo que Sprint 0 evitó al aceptar
Turbopack por defecto. `@serwist/turbopack` (Serwist 9, soporte de
Turbopack backporteado diciembre 2025, confirmado activo y mantenido) no
depende del hook de `webpack()` — genera el Service Worker vía una ruta de
Next (`app/serwist/[path]/route.ts`) compilada con `esbuild`, sin importar
qué bundler compila el resto de la app.
**Impacto:** confirma el diseño de `specs/sprint-13-pwa-instalacion/plan.md`
— `app/sw.ts`, `app/serwist/[path]/route.ts`, `next.config.ts` envuelto
con `withSerwist`. Cierra también un ajuste necesario en `src/proxy.ts`
(su matcher no excluía `.webmanifest` ni rutas sin extensión de archivo —
corregido en la misma sesión, ver `memory/estado-proyecto.md`).

---

## D8 — Librería de gráficos: Recharts ✅ CERRADO (2026-08-19, Sprint 15)
**Decisión:** se usa **Recharts** para los 5 reportes nuevos de
`/reportes` (producción, mortalidad, ventas por método de pago, ranking de
clientes, gasto por categoría). `stack-tecnologico.md` no mencionaba
ninguna librería de gráficos — esta decisión la cierra.
**Motivo:** comparada contra las alternativas reales del ecosistema
React/Next — Chart.js exige un wrapper React aparte y manipula un
`<canvas>` imperativo, más fricción para un proyecto 100% declarativo con
componentes; Visx es una caja de herramientas de bajo nivel, no una
librería de gráficos lista para usar, mucho más trabajo para los 5
gráficos simples de este sprint. Recharts expone componentes declarativos
(`<LineChart>`, `<BarChart>`) que se integran directo con props ya
tipadas, es MIT/gratuita (mantiene el presupuesto $0 del stack) y no tiene
dependencias nativas que puedan chocar con Turbopack (a diferencia del
riesgo real que sí tuvo D7/Serwist con Webpack).
**Impacto:** confirma el diseño de
`specs/sprint-15-dashboard-reportes/plan.md` — `npm install recharts`, sin
versión de compatibilidad especial que confirmar (SVG + React puro, sin
integración con el bundler). `stack-tecnologico.md` gana la sección nueva
"Visualización de datos".

---

## D9 — Exportación de /reportes: Excel real (exceljs), reemplaza CSV ✅ CERRADO (2026-08-20, Sprint 15, revisión post-cierre)
**Decisión:** se usa **ExcelJS** (`exceljs`) para generar los 8 archivos
exportables de `/reportes` como `.xlsx` real, en vez del CSV simple sin
dependencias que había cerrado la decisión de negocio 3 original de este
mismo sprint (`spec.md`).
**Motivo:** el Product Owner probó el CSV en vivo y reportó que "se
mostraba mal" — sin encabezado visualmente distinguible, sin tipos de
columna (todo texto plano), montos sin formato de moneda. ExcelJS es la
librería más madura y usada del ecosistema Node para `.xlsx` real con
estilos (headers en negrita con el naranja de marca, formato de moneda
`"S/" #,##0.00`, ancho de columna automático), sin depender de Excel/
LibreOffice instalado en el servidor (todo se arma en memoria).
**Riesgo aceptado:** ExcelJS depende de `uuid@^8.3.0`, con una
vulnerabilidad moderada conocida (bounds check en un code path que
requiere pasar un buffer explícito — ExcelJS no lo hace, no hay ruta de
explotación real en este uso) sin fix disponible sin un cambio breaking de
major version de ExcelJS. Mismo criterio que el proyecto ya aplica a
otras vulnerabilidades preexistentes sin fix no-breaking (`hono`,
`nanoid`, `postcss` — heredadas de `next`/`prisma`/`shadcn`): riesgo bajo,
aceptado, no bloqueante.
**Hallazgo real de dependencias, corregido en la misma sesión:**
`@fast-csv/format`/`@fast-csv/parse` (dependencias transitivas de
`exceljs`) declaran `@types/node@^14.0.1` como dependencia regular (no
`devDependency`), instalando una copia anidada y ancestral de esos tipos
que rompía la compilación de TypeScript en cadena (`Buffer`/
`Buffer<ArrayBufferLike>` tratados como dos tipos incompatibles al pasar
el resultado de `ExcelJS.Workbook.xlsx.writeBuffer()` a `NextResponse`).
Corregido agregando `"overrides": { "@types/node": "^20" }` a
`package.json` — fuerza una sola versión de `@types/node` en todo el
árbol de dependencias, sin tocar código de negocio.
**Impacto:** `server/services/reportes.ts` gana `construirLibroExcel()`
(reemplaza `aFilasCsv()`, eliminada), `app/(app)/reportes/exportar/route.ts`
responde con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
y extensión `.xlsx` en el nombre de archivo, en vez de `text/csv`.

## D10 — Filtro de /reportes: desde/hasta con calendarios, reemplaza el selector de mes único ✅ CERRADO (2026-08-20, Sprint 15, revisión post-cierre)
**Decisión:** `/reportes` filtra con dos campos de fecha tipo calendario
(Desde/Hasta), mismo patrón ya establecido en
`EgresoFiltros`/`MortalidadFiltros`/`VentaFiltros` (`hasta` no puede ser
futuro, `hasta` no puede ser anterior a `desde`) — reemplaza el `<select>`
de mes calendario único y su límite de 12 meses hacia atrás (decisiones de
negocio 4 y 6 originales de este mismo sprint, `spec.md`).
**Motivo:** pedido explícito del Product Owner tras el cierre inicial —
quería el mismo patrón de filtro que ya usa el resto de la app, no un
selector de mes exclusivo de `/reportes`. El mes calendario actual se
mantiene como **valor por defecto** (no como único valor posible) cuando
la URL no trae `?desde=&hasta=`.
**Impacto:** `REPORTES_MESES_MAXIMOS` (constante, `lib/constants.ts`) se
elimina — sin reemplazo por ahora; el riesgo D6 (Neon plan gratuito) ya no
se mitiga con un tope duro de rango, solo con la restricción "hasta" no
futuro y el volumen actual bajo de la granja (mismo criterio de
"riesgo aceptado, revisar si crece" que D6 ya documenta). `server/services/reportes.ts`
gana `inicioDeDiaEnLima`/`finDeDiaEnLimaExclusivo`/`rangoMesActual`/
`parsearRangoFechas`, reemplazando `mesActualEnLima`/`parsearMesParam`
(eliminadas).

## D11 — 3 reportes nuevos en /reportes (Créditos y cobranza, Mortalidad por lote/galpón, Balance financiero) ✅ CERRADO (2026-08-20, Sprint 15, revisión post-cierre)
**Decisión:** se agregan 3 reportes a los 5 originales del roadmap, sin
modelos nuevos (toda la data ya existía): **Créditos y cobranza**
(créditos PENDIENTES por nivel de alerta, mismo criterio que ya usa el
dashboard desde Sprint 11), **Mortalidad por lote/galpón** (ranking, para
ubicar problemas sanitarios localizados en vez de solo el total de la
granja) y **Balance financiero** (Ventas vs. Egresos operativos por día —
explícitamente SIN planilla/SueldoMovimiento, ver el comentario de
`combinarBalance()` en `server/services/reportes.ts` para el porqué).
**Motivo:** el Product Owner pidió explícitamente "pensar como un
gerente" y elegir 3 reportes reales para evaluar el negocio, delegando la
elección concreta. Se priorizaron créditos (mision.md marca "créditos
vencidos" como necesidad explícita del Gerente) y un balance de
ingresos/egresos (el reporte financiero más básico que falta en el
sistema) sobre otras opciones descartadas (ej. gasto en personal por
separado — quedó fuera de alcance de Balance a propósito, ver D9... D11
arriba).
**Impacto:** `server/repositories/credito.ts` gana
`listarCreditosPendientesConFechaLimiteEnRango`;
`server/repositories/mortalidad.ts` gana `listarMortalidadPorLoteEnRango`
(usa el índice `[fecha, revertido]` nuevo, ver `modelo-datos.md`);
`server/repositories/egreso.ts` (`listarEgresosEnRango`) gana `fecha` en
su `select`, sin query nueva, para que Balance financiero pueda derivarse
de datos ya traídos. Componentes nuevos:
`reporte-creditos.tsx`, `reporte-mortalidad-lote.tsx`, `reporte-balance.tsx`.

---

## Historial de revisión
Si alguna de estas decisiones cambia en el futuro, se agrega una sección
nueva abajo con fecha, motivo del cambio y qué se migró — nunca se
edita el registro original de arriba.