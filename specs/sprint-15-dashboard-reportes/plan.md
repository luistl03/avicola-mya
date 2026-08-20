# Plan técnico — Sprint 15

> **Revisión post-cierre (2026-08-20):** el plan de abajo describe el
> diseño original (H1-H7, 5 reportes, CSV, filtro de mes). Tras el
> despliegue, el Product Owner pidió 4 cambios en vivo — Excel real (D9),
> filtro Desde/Hasta (D10), 3 reportes nuevos (D11) y una corrección de
> rendimiento (índice faltante en `RegistroMortalidad` + lazy-load de
> Recharts). El diseño de abajo NO se reescribe (queda como registro de lo
> planeado originalmente, mismo criterio que los `<details>` de planes
> anteriores) — el diseño real de la revisión está en
> `memory/decisiones-tecnicas.md` (D9/D10/D11) y la ejecución completa en
> `tasks.md`, sección "15F".

## Punto de partida real del código (verificado antes de planificar)
- `src/app/page.tsx`: `TARJETAS_EJEMPLO` (4 tarjetas hardcodeadas) + 1 tarjeta
  real de Créditos (`resumirAlertasCredito` + `listarCreditosPendientesConCliente`).
  Grid `grid-cols-2 lg:grid-cols-4`, cada tarjeta es un `<div>`/`<Link>` con
  ícono + valor + label — se conserva el mismo markup, solo cambia el origen
  del dato.
- `src/server/auth/rbac.ts`: `RUTAS_POR_ROL` es un array `{ ruta, roles }[]`
  matcheado por `pathname.startsWith(ruta)` — agregar una entrada alcanza,
  cubre automáticamente `/reportes/exportar` (Route Handler nuevo) porque
  también empieza con `/reportes`. `src/proxy.ts` corre sobre `/api/*`
  también (matcher no lo excluye), así que no hace falta ninguna regla nueva
  aparte de la de `/reportes`.
- `src/server/services/credito.ts` (`resumirAlertasCredito`) y
  `src/server/services/sueldo-movimiento.ts` (`calcularNetoMensual`,
  `calcularRangoMesCalendario`) son el precedente directo de este sprint:
  repository trae filas ya filtradas por rango, service pura sin Prisma
  agrega/decide. Este sprint replica exactamente ese patrón para 5 reportes
  nuevos en vez de 1.
- `src/server/repositories/egreso.ts` línea 66-70 ya deja escrito el
  criterio: `revertido: true` se filtra en el sitio que agrega el total, no
  en el listado genérico — los 5 repositories nuevos de este sprint filtran
  `revertido: false` (o no tienen ese campo, como `Venta`) en su propio
  `where`, no reutilizan `listarEgresos`/`listarRegistrosMortalidad`/
  `listarRecolecciones` (esos alimentan tablas de gestión paginadas, con
  filtros distintos).
- `src/lib/zod/comun.ts`: `hoyEnLima()` ya existe (D5). Se reutiliza para
  acotar "hoy" en las tarjetas del dashboard.
- Ningún `$queryRaw` en el proyecto todavía — este sprint tampoco lo
  necesita (ver "Corolario de diseño" en `spec.md`): todas las agregaciones
  caben en un mes calendario, volumen bajo, se agrupan en JS dentro de
  `server/services/reportes.ts`.
- `src/components/domain/egresos/egreso-filtros.tsx` (y
  `mortalidad-filtros.tsx`, `venta-filtros.tsx`) es el patrón exacto de
  "filtro dirigido por URL": `useSearchParams` + `router.replace` dentro de
  `startTransition`, sin `page` en la URL cuando el filtro cambia. El
  selector de mes de `/reportes` sigue el mismo patrón, con un único
  `<Select>` combinado (`?mes=2026-08` en vez de `?mes=8&anio=2026`, para no
  arrastrar dos parámetros que puedan quedar inconsistentes entre sí).

## D8 — Librería de gráficos: Recharts
**Decisión:** se agrega `recharts` (MIT, sin dependencias nativas, la
librería de gráficos más usada del ecosistema React/Next — confirmado, no
solo asumido, contra la comparación real de alternativas: Chart.js exige un
wrapper React aparte y manipula un `<canvas>` imperativo, más fricción para
un proyecto 100% declarativo con componentes; Visx es más una caja de
herramientas de bajo nivel que una librería de gráficos lista para usar,
mucho más trabajo para los 5 gráficos simples de este sprint; Recharts
expone componentes declarativos (`<LineChart>`, `<BarChart>`) que se
integran directo con props ya tipadas, sin lógica de canvas a mano).
**Motivo:** ninguna decisión previa (D1-D7) cierra esta elección; el
roadmap pide "tendencia"/gráficos sin especificar librería.
**Impacto:** se agrega a `memory/decisiones-tecnicas.md` como D8 en la
primera tarea del sprint (S15-1), respetando "Historial de revisión" (no se
reescribe D1-D7). `memory/stack-tecnologico.md` gana una sección nueva
"Visualización de datos".

```bash
npm install recharts
```
Sin versión de compatibilidad especial que confirmar (a diferencia de
Serwist/Turbopack en Sprint 13) — Recharts es SVG + React puro, sin
integración con el bundler.

## `lib/constants.ts` (modifica)
```ts
/** Meses hacia atrás que el selector de /reportes permite elegir (Sprint 15,
 * decisión de negocio 6 — D6, riesgo Neon plan gratuito: acota cuántas
 * agregaciones distintas puede pedir un Gerente desde el <select>). */
export const REPORTES_MESES_MAXIMOS = 12;

/** Tamaño del Top de clientes en el ranking de /reportes (Sprint 15) —
 * mismo criterio que UNIDADES_POR_PAQUETE: un solo número, compartido entre
 * server/services/reportes.ts (rankearClientes, autoritativo) y cualquier
 * texto de UI que lo mencione ("Top 10"). */
export const REPORTES_RANKING_CLIENTES_TOP = 10;
```

## `server/services/reportes.ts` (nuevo) — funciones puras, sin Prisma
Recibe listas ya filtradas por los repositories (rango de fecha + exclusión
de revertidos ya aplicados en el `where`) — este archivo solo agrupa/suma/
ordena/serializa, mismo criterio ADR-000 que `credito.ts`/`sueldo-movimiento.ts`.

```ts
import type { CategoriaEgreso, MetodoPago, TipoCliente, TipoMortalidad } from "@prisma/client";

// Agrupa por fecha-calendario en América/Lima (D5) — reutilizable para
// producción y mortalidad (ambas necesitan "total por día del mes").
// No usa hoyEnLima() (eso es solo para "hoy"): acá la fecha de cada
// registro ya viene del servidor, se formatea con el mismo truco de
// toLocaleDateString("en-CA", ...) para quedar en YYYY-MM-DD estable.
export function agruparSumaPorDia<T>(
  registros: T[],
  obtenerFecha: (registro: T) => Date,
  obtenerValor: (registro: T) => number,
): { fecha: string; total: number }[] {
  const mapa = new Map<string, number>();
  for (const registro of registros) {
    const clave = obtenerFecha(registro).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    mapa.set(clave, (mapa.get(clave) ?? 0) + obtenerValor(registro));
  }
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, total]) => ({ fecha, total }));
}

export function sumarTotal(valores: number[]): number {
  return valores.reduce((acumulado, valor) => acumulado + valor, 0);
}

// H3 — desglose de mortalidad por tipo, mes completo (no por día: son solo
// 2 valores, un gráfico de barras diario ya cubre la tendencia general).
export function agruparMortalidadPorTipo(
  registros: { tipo: TipoMortalidad; cantidad: number }[],
): { MUERTE: number; DESCARTE: number } {
  return {
    MUERTE: sumarTotal(registros.filter((r) => r.tipo === "MUERTE").map((r) => r.cantidad)),
    DESCARTE: sumarTotal(registros.filter((r) => r.tipo === "DESCARTE").map((r) => r.cantidad)),
  };
}

const METODOS_PAGO: MetodoPago[] = ["EFECTIVO", "YAPE", "PLIN", "TRANSFERENCIA"];

export type VentaPorDiaYMetodo = { fecha: string } & Record<MetodoPago, number>;

// H4 — un punto por día, una serie por MetodoPago. Días sin ninguna venta
// no aparecen en `ventas` (nunca se generaron filas para ellos) — para que
// el eje X del gráfico no tenga huecos, quien llama arma el rango completo
// de días del mes primero (server/repositories no sabe de calendario) y
// esta función solo llena valores, nunca inventa fechas.
export function agruparVentasPorDiaYMetodo(
  ventas: { fecha: Date; totalCobrado: number; metodoPago: MetodoPago }[],
  diasDelMes: string[],
): VentaPorDiaYMetodo[] {
  const porDia = new Map<string, Record<MetodoPago, number>>(
    diasDelMes.map((dia) => [dia, { EFECTIVO: 0, YAPE: 0, PLIN: 0, TRANSFERENCIA: 0 }]),
  );
  for (const venta of ventas) {
    const clave = venta.fecha.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const fila = porDia.get(clave);
    if (fila) fila[venta.metodoPago] += venta.totalCobrado;
  }
  return diasDelMes.map((fecha) => ({ fecha, ...(porDia.get(fecha) as Record<MetodoPago, number>) }));
}

// Días YYYY-MM-DD del mes [desde, hasta) en América/Lima — soporte de
// agruparVentasPorDiaYMetodo (arriba) para no dejar huecos en el eje X.
export function listarDiasDelRango(desde: Date, hasta: Date): string[] {
  const dias: string[] = [];
  const cursor = new Date(desde);
  while (cursor < hasta) {
    dias.push(cursor.toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

// H5 — ranking de clientes, ya sin Público General (filtrado en el
// repository, corolario de diseño 2 de spec.md). Ordena desc por monto,
// corta al Top N (REPORTES_RANKING_CLIENTES_TOP).
export function rankearClientes(
  ventas: { clienteId: string; nombre: string; tipo: TipoCliente; totalCobrado: number }[],
  limite: number,
): { clienteId: string; nombre: string; tipo: TipoCliente; montoTotal: number; cantidadVentas: number }[] {
  const porCliente = new Map<string, { nombre: string; tipo: TipoCliente; montoTotal: number; cantidadVentas: number }>();
  for (const venta of ventas) {
    const actual = porCliente.get(venta.clienteId) ?? {
      nombre: venta.nombre,
      tipo: venta.tipo,
      montoTotal: 0,
      cantidadVentas: 0,
    };
    actual.montoTotal += venta.totalCobrado;
    actual.cantidadVentas += 1;
    porCliente.set(venta.clienteId, actual);
  }
  return [...porCliente.entries()]
    .map(([clienteId, datos]) => ({ clienteId, ...datos }))
    .sort((a, b) => b.montoTotal - a.montoTotal)
    .slice(0, limite);
}

const CATEGORIAS_EGRESO: CategoriaEgreso[] = [
  "ALIMENTOS",
  "INSUMOS_VACUNAS",
  "SERVICIOS",
  "MANTENIMIENTO",
  "VARIOS",
];

// H6 — incluye las 5 categorías siempre, en 0 si no hubo gasto ese mes
// (H6, spec.md: "incluidas las categorías sin gasto... no omitidas") —
// necesario para que el gráfico tenga siempre las mismas 5 barras/sectores,
// sin que la leyenda cambie de mes a mes.
export function agruparGastoPorCategoria(
  egresos: { categoria: CategoriaEgreso; monto: number }[],
): { categoria: CategoriaEgreso; total: number }[] {
  return CATEGORIAS_EGRESO.map((categoria) => ({
    categoria,
    total: sumarTotal(egresos.filter((e) => e.categoria === categoria).map((e) => e.monto)),
  }));
}

// R3, spec.md — RFC 4180 básico: una celda que contiene coma, comilla o
// salto de línea va entre comillas dobles, con las comillas internas
// duplicadas. Sin esto, "Granja López, S.A.C." partiría en dos columnas.
function escaparCeldaCsv(valor: string | number): string {
  const texto = String(valor);
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function aFilasCsv(encabezados: string[], filas: (string | number)[][]): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(escaparCeldaCsv).join(","));
  return lineas.join("\n");
}
```

## `server/repositories/lote.ts` (agrega)
```ts
// Tarjeta "Lotes activos" del dashboard (H1) — count agregado en el
// servidor, no un findMany completo: no hace falta traer las filas para
// solo contar.
export function contarLotesActivos() {
  return prisma.lote.count({ where: { estado: "ACTIVO" } });
}
```

## `server/repositories/recoleccion.ts` (agrega)
```ts
// Tarjeta "Huevos hoy" del dashboard (H1) — aggregate _sum, un solo
// round-trip, sin traer filas.
export async function sumarProduccionEnRango(desde: Date, hasta: Date) {
  const resultado = await prisma.registroRecoleccion.aggregate({
    _sum: { cantidadTotal: true },
    where: { creadoEn: { gte: desde, lt: hasta }, revertido: false },
  });
  return resultado._sum.cantidadTotal ?? 0;
}

// Reporte "Producción" de /reportes (H2) — filas crudas del mes, mínimo
// select, para que agruparSumaPorDia (services/reportes.ts) arme el
// gráfico diario. No revertidos, mismo criterio que sumarProduccionEnRango.
export function listarProduccionEnRango(desde: Date, hasta: Date) {
  return prisma.registroRecoleccion.findMany({
    where: { creadoEn: { gte: desde, lt: hasta }, revertido: false },
    select: { creadoEn: true, cantidadTotal: true },
  });
}
```

## `server/repositories/mortalidad.ts` (agrega)
```ts
// Tarjeta "Mortalidad hoy" del dashboard (H1).
export async function sumarMortalidadEnRango(desde: Date, hasta: Date) {
  const resultado = await prisma.registroMortalidad.aggregate({
    _sum: { cantidad: true },
    where: { fecha: { gte: desde, lt: hasta }, revertido: false },
  });
  return resultado._sum.cantidad ?? 0;
}

// Reporte "Mortalidad" de /reportes (H3) — filas crudas del mes, con tipo
// para el desglose (agruparMortalidadPorTipo).
export function listarMortalidadEnRango(desde: Date, hasta: Date) {
  return prisma.registroMortalidad.findMany({
    where: { fecha: { gte: desde, lt: hasta }, revertido: false },
    select: { fecha: true, cantidad: true, tipo: true },
  });
}
```

## `server/repositories/venta.ts` (agrega)
```ts
// Tarjeta "Ventas hoy" del dashboard (H1). Venta no tiene campo revertido
// (confirmado en schema.prisma — no hay anulación de ventas en este
// proyecto), así que no hace falta excluir nada.
export async function sumarVentasEnRango(desde: Date, hasta: Date) {
  const resultado = await prisma.venta.aggregate({
    _sum: { totalCobrado: true },
    where: { fecha: { gte: desde, lt: hasta } },
  });
  return resultado._sum.totalCobrado ?? 0;
}

// Reporte "Ventas por método de pago" de /reportes (H4).
export function listarVentasEnRango(desde: Date, hasta: Date) {
  return prisma.venta.findMany({
    where: { fecha: { gte: desde, lt: hasta } },
    select: { fecha: true, totalCobrado: true, metodoPago: true },
  });
}

// Reporte "Ranking de clientes" de /reportes (H5) — excluye Público General
// acá, en el where (corolario de diseño 2, spec.md), no en el service: es
// un filtro de qué datos entran a la query, no una decisión de agregación.
export function listarVentasParaRankingEnRango(desde: Date, hasta: Date) {
  return prisma.venta.findMany({
    where: { fecha: { gte: desde, lt: hasta }, clienteId: { not: CLIENTE_PUBLICO_GENERAL_ID } },
    select: {
      clienteId: true,
      totalCobrado: true,
      cliente: { select: { nombre: true, tipo: true } },
    },
  });
}
```
`CLIENTE_PUBLICO_GENERAL_ID` se importa de `@/lib/constants` (ya existe,
Sprint 0). El resultado de `listarVentasParaRankingEnRango` se aplana en la
Server Component (`{ clienteId, totalCobrado, nombre: cliente.nombre, tipo:
cliente.tipo }`) antes de pasarlo a `rankearClientes` — el repository no
aplana `include`s, eso es responsabilidad de quien arma el shape que espera
el service (mismo criterio que `resumirAlertasCredito` recibiendo
`{ montoTotal, montoPagado, fechaLimite }` ya aplanado desde `page.tsx`).

## `server/repositories/egreso.ts` (agrega)
```ts
// Reporte "Gasto por categoría" de /reportes (H6) — filas crudas del mes,
// revertido: false explícito (ver "Punto de partida real" arriba, criterio
// ya documentado en este mismo archivo desde Sprint 12).
export function listarEgresosEnRango(desde: Date, hasta: Date) {
  return prisma.egreso.findMany({
    where: { fecha: { gte: desde, lt: hasta }, revertido: false },
    select: { categoria: true, monto: true },
  });
}
```

## `src/app/page.tsx` (modifica) — dashboard con datos reales
```tsx
const [session, creditosPendientes, lotesActivos, huevosHoy, mortalidadHoy, ventasHoy] =
  await Promise.all([
    auth(),
    listarCreditosPendientesConCliente(),
    contarLotesActivos(),
    sumarProduccionEnRango(hoy, mañana),
    sumarMortalidadEnRango(hoy, mañana),
    sumarVentasEnRango(hoy, mañana),
  ]);
```
`hoy = hoyEnLima()`, `mañana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000)`
— mismo rango `[hoy, mañana)` que ya usan las 3 funciones `sumarXEnRango`.
`TARJETAS_EJEMPLO` se reemplaza por un array armado en el propio componente
con los 4 valores reales (mismo ícono/color que ya tenía cada una — no
cambia el diseño visual, solo el origen del número). El comentario
`"siguen siendo de ejemplo hasta Sprint 15"` se borra junto con el array
que describía.

## `src/app/(app)/reportes/page.tsx` (nuevo, Server Component)
```tsx
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const { mes, anio } = parsearMesParam(mesParam) ?? mesActualEnLima();
  const { desde, hasta } = calcularRangoMesCalendario(mes, anio);

  const [produccion, mortalidad, ventas, ventasRanking, egresos] = await Promise.all([
    listarProduccionEnRango(desde, hasta),
    listarMortalidadEnRango(desde, hasta),
    listarVentasEnRango(desde, hasta),
    listarVentasParaRankingEnRango(desde, hasta),
    listarEgresosEnRango(desde, hasta),
  ]);

  const dias = listarDiasDelRango(desde, hasta);
  const produccionPorDia = agruparSumaPorDia(produccion, (r) => r.creadoEn, (r) => r.cantidadTotal);
  const mortalidadPorDia = agruparSumaPorDia(mortalidad, (r) => r.fecha, (r) => r.cantidad);
  const mortalidadPorTipo = agruparMortalidadPorTipo(mortalidad);
  const ventasPorDia = agruparVentasPorDiaYMetodo(ventas, dias);
  const ranking = rankearClientes(
    ventasRanking.map((v) => ({ clienteId: v.clienteId, nombre: v.cliente.nombre, tipo: v.cliente.tipo, totalCobrado: v.totalCobrado })),
    REPORTES_RANKING_CLIENTES_TOP,
  );
  const gastoPorCategoria = agruparGastoPorCategoria(egresos);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Reportes" actions={<ReportesFiltroMes mes={mes} anio={anio} />} />
      <ReporteProduccion datos={produccionPorDia} total={sumarTotal(produccion.map((r) => r.cantidadTotal))} mes={mes} anio={anio} />
      <ReporteMortalidad datos={mortalidadPorDia} porTipo={mortalidadPorTipo} mes={mes} anio={anio} />
      <ReporteVentas datos={ventasPorDia} mes={mes} anio={anio} />
      <ReporteRankingClientes datos={ranking} mes={mes} anio={anio} />
      <ReporteGastoPorCategoria datos={gastoPorCategoria} mes={mes} anio={anio} />
    </div>
  );
}
```
`parsearMesParam`/`mesActualEnLima` son helpers chicos de la propia página
(no ameritan `lib/` compartido — un solo consumidor): `mesActualEnLima()`
usa `hoyEnLima()` y devuelve `{ mes: hoy.getUTCMonth() + 1, anio:
hoy.getUTCFullYear() }`; `parsearMesParam("2026-08")` valida contra
`REPORTES_MESES_MAXIMOS` (si el mes pedido es más viejo que el límite, cae
al mes actual — mismo criterio defensivo que el resto del proyecto usa para
querystrings fuera de rango, ej. `page` fuera de rango en
`data-table-pagination`).

Cada `Reporte*` es un Client Component (`"use client"`, Recharts) que
recibe los datos ya agregados por props — no vuelve a tocar Prisma ni
Zod, solo dibuja. Cada uno incluye su propio botón "Exportar CSV" (un
`<a href="/reportes/exportar?tipo=produccion&mes=2026-08">`, no un
`fetch` + Blob a mano — un link con `download` implícito por el header
`Content-Disposition` del Route Handler es más simple y funciona sin JS
adicional).

### `reportes-filtro-mes.tsx` (nuevo, Client Component)
Mismo patrón que `EgresoFiltros`/`MortalidadFiltros` (`useSearchParams` +
`router.replace` en `startTransition`), pero un solo `<Select>` con los
últimos `REPORTES_MESES_MAXIMOS` valores (`"2026-08"`, `"2026-07"`, ...,
generados con `Array.from({ length: REPORTES_MESES_MAXIMOS })` desde
`hoyEnLima()` hacia atrás) en vez de dos inputs de fecha — no hay "Limpiar
filtros" (siempre hay un mes seleccionado, nunca "todos los meses").

## `src/app/(app)/reportes/exportar/route.ts` (nuevo, Route Handler GET)
```ts
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.rol !== "GERENTE") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo");
  const { mes, anio } = parsearMesParam(searchParams.get("mes")) ?? mesActualEnLima();
  const { desde, hasta } = calcularRangoMesCalendario(mes, anio);

  const csv = await construirCsv(tipo, desde, hasta); // switch interno por tipo, arma encabezados+filas y llama aFilasCsv
  if (csv === null) {
    return NextResponse.json({ error: "Tipo de reporte inválido." }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tipo}-${anio}-${String(mes).padStart(2, "0")}.csv"`,
    },
  });
}
```
**Verificación de sesión/rol explícita dentro del handler**, aunque
`server/auth/rbac.ts` (middleware) ya bloquea `/reportes/*` a no-GERENTE —
defensa en profundidad, mismo espíritu que "Toda Server Action... verifica
sesión + rol antes de ejecutar nada" (`CLAUDE.md`), aplicado acá aunque
técnicamente no sea una Server Action. `construirCsv` es una función
privada del propio `route.ts` (no un service — solo despacha por `tipo` y
llama a los repositories + `agruparXxx`/`aFilasCsv` de
`services/reportes.ts`, mismo tipo de "adaptador de transporte" que ya
documentó `api/sync/route.ts` en Sprint 14). Los 5 `tipo` válidos:
`produccion`, `mortalidad`, `ventas`, `ranking-clientes`, `gastos`.

## `server/auth/rbac.ts` (modifica)
```ts
export const RUTAS_POR_ROL: { ruta: string; roles: Rol[] }[] = [
  { ruta: "/usuarios", roles: ["GERENTE"] },
  { ruta: "/galpones", roles: ["GERENTE"] },
  { ruta: "/lotes", roles: ["GERENTE"] },
  { ruta: "/precio-kilo", roles: ["GERENTE"] },
  { ruta: "/egresos", roles: ["GERENTE"] },
  { ruta: "/personal", roles: ["GERENTE"] },
  { ruta: "/reportes", roles: ["GERENTE"] }, // NUEVO Sprint 15 — cubre también /reportes/exportar
];
```

## Nota de rendimiento (D6) — sin caché, límite de rango
`/reportes` dispara 5 queries en paralelo (`Promise.all`), cada una acotada
a un mes calendario (nunca todo el histórico). El selector de mes
(`REPORTES_MESES_MAXIMOS = 12`) evita que el Gerente pida una agregación
sobre un rango arbitrariamente largo. No se agrega caché de request
(Redis/`unstable_cache`) — Upstash Redis ya está en el stack (rate
limiting), pero usarlo acá sería optimización prematura sin un problema de
performance real medido todavía (volumen bajo, confirmado en
`memory/estado-proyecto.md`). Si en producción se detecta lentitud real,
es un ajuste incremental (envolver los `listar*EnRango` en
`unstable_cache` con revalidación corta), no un rediseño.

## Orden de ejecución (hay dependencias entre tareas)
1. `memory/decisiones-tecnicas.md` (D8) + `memory/stack-tecnologico.md` —
   documentar antes de instalar.
2. `npm install recharts`.
3. `lib/constants.ts` (`REPORTES_MESES_MAXIMOS`, `REPORTES_RANKING_CLIENTES_TOP`).
4. `server/services/reportes.ts` + `tests/unit/services/reportes.test.ts`
   (cobertura ≥90%, TDD-friendly: son funciones puras, se pueden testear
   antes de que exista ningún repository real).
5. Repository nuevo por módulo (`lote.ts`, `recoleccion.ts`,
   `mortalidad.ts`, `venta.ts`, `egreso.ts`) — independientes entre sí,
   pueden ir en cualquier orden.
6. `src/app/page.tsx` (dashboard real) — depende de 5 (necesita
   `contarLotesActivos`/`sumarProduccionEnRango`/`sumarMortalidadEnRango`/
   `sumarVentasEnRango`). Verificar en vivo contra Neon dev antes de seguir.
7. `server/auth/rbac.ts` (`/reportes` → GERENTE) — antes de construir la
   pantalla, para no dejar una ventana sin protección.
8. `src/app/(app)/reportes/page.tsx` + `reportes-filtro-mes.tsx` — depende
   de 4, 5, 7.
9. Un componente `Reporte*` por reporte (5, Client Components con
   Recharts) — depende de 8, pueden ir en paralelo entre sí.
10. `src/app/(app)/reportes/exportar/route.ts` — depende de 4, 5, 7.
11. Verificación en vivo completa: los 5 reportes contra datos reales de
    Neon dev, cambio de mes, descarga de los 5 CSV, `curl`/navegador con
    sesión de OPERARIO confirmando `403` en `/reportes` y en
    `/reportes/exportar`.
12. `npm run typecheck && npm run lint && npm test` — cobertura ≥90% en
    `server/services/reportes.ts`.

## Definition of Done aplicable a este sprint
(`memory/definition-of-done.md` sigue sin existir — mismo criterio que
Sprints 3-14: `CLAUDE.md` + esta sección son el DoD efectivo del proyecto.)
- `npm run typecheck && npm run lint` en verde.
- `npm test` en verde, sin regresión sobre los tests heredados de Sprint 14.
- Cobertura ≥90% en `server/services/reportes.ts` (funciones puras, sin
  excusa para quedar por debajo — mismo umbral que el resto del proyecto).
- Ningún componente ni service importa Prisma directamente (ADR-000) —
  confirmado revisando `reportes-filtro-mes.tsx` y los 5 `Reporte*.tsx`.
- Ninguna Server Action nueva sin `withAuth` que debiera tenerlo — este
  sprint no tiene ninguna (todo lectura), confirmado explícitamente.
- `/reportes` y `/reportes/exportar` verificados en vivo devolviendo `403`
  para un usuario OPERARIO autenticado.
- Ningún registro `revertido: true` (Mortalidad, Recolección, Egreso) suma
  en ningún reporte ni tarjeta — verificado en vivo con al menos un
  registro revertido real dentro del mes filtrado.
- Los 5 CSV descargados a mano contra datos reales de Neon dev, confirmando
  que los totales coinciden con lo que muestra la UI (mismo mes).
- Cero `any`, cero `@ts-ignore` (CLAUDE.md).
- Toda mutación... — no aplica, sin mutaciones este sprint.

## Estructura de archivos esperada
```
src/
  app/
    page.tsx                           # modifica: TARJETAS_EJEMPLO → datos reales
    (app)/
      reportes/
        page.tsx                       # nuevo
        exportar/
          route.ts                     # nuevo
  components/domain/reportes/
    reportes-filtro-mes.tsx            # nuevo
    reporte-produccion.tsx             # nuevo
    reporte-mortalidad.tsx             # nuevo
    reporte-ventas.tsx                 # nuevo
    reporte-ranking-clientes.tsx       # nuevo
    reporte-gasto-categoria.tsx        # nuevo
  server/
    repositories/
      lote.ts                          # modifica: + contarLotesActivos
      recoleccion.ts                   # modifica: + sumarProduccionEnRango, listarProduccionEnRango
      mortalidad.ts                    # modifica: + sumarMortalidadEnRango, listarMortalidadEnRango
      venta.ts                         # modifica: + sumarVentasEnRango, listarVentasEnRango, listarVentasParaRankingEnRango
      egreso.ts                        # modifica: + listarEgresosEnRango
    services/
      reportes.ts                      # nuevo
    auth/
      rbac.ts                          # modifica: + /reportes
  lib/
    constants.ts                       # modifica: + REPORTES_MESES_MAXIMOS, REPORTES_RANKING_CLIENTES_TOP
tests/unit/services/
  reportes.test.ts                     # nuevo
memory/
  decisiones-tecnicas.md               # modifica: + D8
  stack-tecnologico.md                 # modifica: + "Visualización de datos"
```
