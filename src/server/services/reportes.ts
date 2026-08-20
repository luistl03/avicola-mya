import ExcelJS from "exceljs";
import type { CategoriaEgreso, MetodoPago, TipoCliente, TipoMortalidad } from "@prisma/client";

import { hoyEnLima } from "@/lib/zod/comun";
import { calcularNivelAlerta, calcularSaldoPendiente, type NivelAlertaCredito } from "@/server/services/credito";

// ============================================
// Rango de fechas (desde/hasta) — Sprint 15, ajustado a pedido del Product
// Owner tras el cierre inicial: reemplaza el selector de mes calendario
// por dos calendarios (desde/hasta), mismo patrón ya establecido en
// EgresoFiltros/MortalidadFiltros/VentaFiltros (app/(app)/egresos/page.tsx:
// inicioDeDiaEnLima/finDeDiaEnLima).
// ============================================

// Instante REAL en América/Lima (offset -05:00 explícito) — a propósito
// DISTINTO del truco de "medianoche UTC representa el día" que sí usan
// hoyEnLima()/calcularRangoMesCalendario (server/services/sueldo-movimiento.ts).
// Ese truco solo es seguro para representar "qué día es hoy" o comparar
// contra otro valor construido igual; usarlo directo como límite gte/lt
// contra un timestamp REAL (Venta.fecha, RegistroMortalidad.fecha, etc.)
// corre el límite 5 horas (el offset de Lima) y se come parte del día
// anterior/siguiente — el mismo tipo de bug que ya apareció una vez en
// listarDiasDelRango (ver tasks.md, S15-17). Acá se sigue el patrón que
// YA usa el resto del proyecto para filtros de rango libre.
export function inicioDeDiaEnLima(valor: string): Date {
  return new Date(`${valor}T00:00:00.000-05:00`);
}

// Límite EXCLUSIVO — el día completo "hasta" queda incluido porque el
// límite real es la medianoche del día SIGUIENTE, no 23:59:59.999 de
// "hasta" (mismo criterio "gte/lt" que ya usan todos los repositories de
// este módulo, en vez de "gte/lte").
export function finDeDiaEnLimaExclusivo(valor: string): Date {
  const inicio = inicioDeDiaEnLima(valor);
  return new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
}

export type RangoFechas = { desde: Date; hasta: Date };

function formatearDia(anio: number, mesIndice0: number, dia: number): string {
  return `${anio}-${String(mesIndice0 + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Rango del mes calendario actual en América/Lima — valor por defecto de
// /reportes cuando la URL no trae `?desde=&hasta=` (decisión de negocio 4
// original, Sprint 15: sigue siendo el default, aunque el filtro visible
// ya no está limitado a un mes completo).
export function rangoMesActual(): RangoFechas {
  const hoy = hoyEnLima();
  const anio = hoy.getUTCFullYear();
  const mesIndice0 = hoy.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(anio, mesIndice0 + 1, 0)).getUTCDate();
  return {
    desde: inicioDeDiaEnLima(formatearDia(anio, mesIndice0, 1)),
    hasta: finDeDiaEnLimaExclusivo(formatearDia(anio, mesIndice0, ultimoDia)),
  };
}

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// searchParams/query params son un límite de entrada externo — mismas
// restricciones que ya aplica EgresoFiltros/MortalidadFiltros/VentaFiltros
// a sus propios desde/hasta: formato válido, desde <= hasta, "hasta" no
// puede ser un día futuro (comparado contra hoyEnLima(), D5). Cualquier
// violación devuelve null, quien llama cae a rangoMesActual().
export function parsearRangoFechas(
  desdeParam: string | undefined,
  hastaParam: string | undefined,
): RangoFechas | null {
  if (!desdeParam || !hastaParam) return null;
  if (!FORMATO_FECHA.test(desdeParam) || !FORMATO_FECHA.test(hastaParam)) return null;

  const desde = inicioDeDiaEnLima(desdeParam);
  const hasta = finDeDiaEnLimaExclusivo(hastaParam);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return null;
  if (desde.getTime() >= hasta.getTime()) return null; // desde debe ser estrictamente anterior a hasta

  // "hasta" no puede caer en el futuro — comparado con la MISMA convención
  // de instante real que ya usa `hasta` (finDeDiaEnLimaExclusivo), nunca
  // mezclada con hoyEnLima()/+1 día crudo: ese truco representa el día
  // calendario a medianoche UTC, 5 horas antes de la medianoche real de
  // Lima — comparado directo corría el límite y rechazaba por error un
  // "hasta" = hoy legítimo (bug real encontrado por los tests de este
  // archivo, mismo tipo de error que ya apareció una vez en
  // listarDiasDelRango).
  const hoyComoString = hoyEnLima().toISOString().slice(0, 10);
  const limiteFuturo = finDeDiaEnLimaExclusivo(hoyComoString);
  if (hasta.getTime() > limiteFuturo.getTime()) return null;

  return { desde, hasta };
}

// ============================================
// Agregación por día / totales — sin cambios de lógica respecto a la
// versión original de Sprint 15, solo de qué construye desde/hasta.
// ============================================

// Agrupa por fecha-calendario en América/Lima (D5) — reutilizable para
// producción, mortalidad y balance financiero (todas necesitan "total por
// día del rango"). Cada registro ya trae su fecha resuelta por el
// servidor; se formatea con el mismo truco de toLocaleDateString("en-CA",
// ...) que hoyEnLima() (lib/zod/comun.ts) para quedar en YYYY-MM-DD
// estable.
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

// Desglose de mortalidad por tipo, rango completo (no por día: son solo 2
// valores, el gráfico diario de agruparSumaPorDia ya cubre la tendencia
// general).
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

function filaVentasEnCero(): Record<MetodoPago, number> {
  return Object.fromEntries(METODOS_PAGO.map((metodo) => [metodo, 0])) as Record<MetodoPago, number>;
}

// Días YYYY-MM-DD del rango [desde, hasta) — soporte de
// agruparVentasPorDiaYMetodo/combinarBalance (abajo), para que el eje X
// del gráfico no tenga huecos en los días sin ningún dato. `desde`/`hasta`
// son instantes reales en América/Lima (inicioDeDiaEnLima/
// finDeDiaEnLimaExclusivo, arriba) — como Lima es UTC-5 fijo (sin horario
// de verano), la medianoche de Lima cae siempre a las 05:00 UTC, dentro
// del MISMO día calendario UTC, así que leer el día con getUTC*/
// toISOString().slice(0,10) da el día de Lima correcto sin necesidad de
// conversión de timezone acá — confirmado con tests explícitos
// (reportes.test.ts).
export function listarDiasDelRango(desde: Date, hasta: Date): string[] {
  const dias: string[] = [];
  const cursor = new Date(desde);
  while (cursor < hasta) {
    dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

// Un punto por día, una serie por MetodoPago. `diasDelRango` (traído por
// quien llama, vía listarDiasDelRango) define el eje X completo — esta
// función solo llena valores sobre esos días, nunca inventa fechas nuevas
// a partir de las ventas (una venta con una fecha fuera de `diasDelRango`
// se ignora, defensivo: no debería pasar si el repository ya filtró por
// el mismo rango).
export function agruparVentasPorDiaYMetodo(
  ventas: { fecha: Date; totalCobrado: number; metodoPago: MetodoPago }[],
  diasDelRango: string[],
): VentaPorDiaYMetodo[] {
  const porDia = new Map<string, Record<MetodoPago, number>>(
    diasDelRango.map((dia) => [dia, filaVentasEnCero()]),
  );
  for (const venta of ventas) {
    const clave = venta.fecha.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const fila = porDia.get(clave);
    if (fila) fila[venta.metodoPago] += venta.totalCobrado;
  }
  return diasDelRango.map((fecha) => ({ fecha, ...(porDia.get(fecha) as Record<MetodoPago, number>) }));
}

// Ranking de clientes. Público General ya viene excluido desde el
// repository (corolario de diseño 2, spec.md) — esta función no conoce esa
// regla, solo agrupa/suma/ordena/corta lo que recibe.
export function rankearClientes(
  ventas: { clienteId: string; nombre: string; tipo: TipoCliente; totalCobrado: number }[],
  limite: number,
): { clienteId: string; nombre: string; tipo: TipoCliente; montoTotal: number; cantidadVentas: number }[] {
  const porCliente = new Map<
    string,
    { nombre: string; tipo: TipoCliente; montoTotal: number; cantidadVentas: number }
  >();
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

// Incluye las 5 categorías siempre, en 0 si no hubo gasto ese rango —
// necesario para que el gráfico tenga siempre las mismas 5 barras, sin
// que la leyenda cambie de una consulta a otra.
export function agruparGastoPorCategoria(
  egresos: { categoria: CategoriaEgreso; monto: number }[],
): { categoria: CategoriaEgreso; total: number }[] {
  return CATEGORIAS_EGRESO.map((categoria) => ({
    categoria,
    total: sumarTotal(egresos.filter((e) => e.categoria === categoria).map((e) => e.monto)),
  }));
}

// ============================================
// 3 reportes nuevos (feedback del Product Owner post-cierre de Sprint 15)
// ============================================

// Reporte "Créditos y cobranza" — créditos PENDIENTES cuya fechaLimite cae
// dentro del rango filtrado (repository), agrupados por el mismo nivel de
// alerta que ya usa el dashboard (calcularNivelAlerta/calcularSaldoPendiente,
// server/services/credito.ts — reutilizados, no reimplementados). Los
// créditos sin alerta todavía (más de 3 días para vencer) no entran al
// reporte de cobranza: no son planificables todavía.
const NIVELES_ALERTA: NivelAlertaCredito[] = ["POR_VENCER", "VENCIDO_RECIENTE", "VENCIDO_CRITICO"];

export function agruparCreditosPorNivelAlerta(
  creditos: { montoTotal: number; montoPagado: number; fechaLimite: Date }[],
  hoy: Date,
): { nivel: NivelAlertaCredito; cantidad: number; montoPendiente: number }[] {
  const acumulado = new Map(NIVELES_ALERTA.map((nivel) => [nivel, { cantidad: 0, montoPendiente: 0 }]));
  for (const credito of creditos) {
    const nivel = calcularNivelAlerta(credito.fechaLimite, hoy);
    if (!nivel) continue;
    const actual = acumulado.get(nivel);
    if (!actual) continue;
    actual.cantidad += 1;
    actual.montoPendiente += calcularSaldoPendiente(credito.montoTotal, credito.montoPagado);
  }
  return NIVELES_ALERTA.map((nivel) => ({ nivel, ...(acumulado.get(nivel) as { cantidad: number; montoPendiente: number }) }));
}

// Reporte "Mortalidad por lote/galpón" — ranking de qué lotes concentran
// más mortalidad en el rango filtrado (revertido ya excluido por el
// repository). Ordenado desc — el lote con más mortalidad primero, mismo
// criterio que rankearClientes.
export function agruparMortalidadPorLote(
  registros: { cantidad: number; loteCodigo: string; galponNombre: string }[],
): { loteCodigo: string; galponNombre: string; total: number }[] {
  const porLote = new Map<string, { loteCodigo: string; galponNombre: string; total: number }>();
  for (const registro of registros) {
    const actual = porLote.get(registro.loteCodigo) ?? {
      loteCodigo: registro.loteCodigo,
      galponNombre: registro.galponNombre,
      total: 0,
    };
    actual.total += registro.cantidad;
    porLote.set(registro.loteCodigo, actual);
  }
  return [...porLote.values()].sort((a, b) => b.total - a.total);
}

// Reporte "Balance financiero" — Ventas (ingresos) vs Egresos operativos
// (gastos) por día, ya agregados por agruparSumaPorDia sobre los mismos
// `ventas`/`egresos` que ya trae /reportes para los otros 2 reportes (sin
// query nueva). Alcance deliberadamente acotado: NO incluye SueldoMovimiento
// (planilla) — ese ledger registra ADELANTO/DESCUENTO como ajustes de lo
// que se le debe al empleado, no como pagos de caja con una fecha de salida
// de efectivo inequívoca; mezclarlo sin ese matiz mostraría un "balance"
// que parece autoritativo pero no lo es. Gasto en personal sigue viviendo
// en /personal, sin cruzar a este reporte.
export function combinarBalance(
  ingresosPorDia: { fecha: string; total: number }[],
  egresosPorDia: { fecha: string; total: number }[],
  diasDelRango: string[],
): { fecha: string; ingresos: number; egresos: number; neto: number }[] {
  const ingresosMapa = new Map(ingresosPorDia.map((d) => [d.fecha, d.total]));
  const egresosMapa = new Map(egresosPorDia.map((d) => [d.fecha, d.total]));
  return diasDelRango.map((fecha) => {
    const ingresos = ingresosMapa.get(fecha) ?? 0;
    const egresos = egresosMapa.get(fecha) ?? 0;
    return { fecha, ingresos, egresos, neto: ingresos - egresos };
  });
}

// ============================================
// Exportación — Excel real (D9), reemplaza el CSV simple original de
// Sprint 15 a pedido del Product Owner: el CSV se veía mal al abrirlo
// (sin tipos de columna, sin encabezado visualmente distinguible). No es
// "pura" en el sentido estricto de ADR-000 (usa la librería exceljs), pero
// no toca Prisma ni hace I/O — arma un Buffer determinístico a partir de
// los mismos datos ya agregados por las funciones de arriba, mismo
// espíritu que aFilasCsv (la función que reemplaza).
// ============================================

export type ColumnaExcel = { encabezado: string; clave: string; formato?: "moneda" | "entero" | "texto" };

const COLOR_ENCABEZADO = "FFF4900F"; // --primary (mismo naranja de marca que ya usa el resto de la app)

// Sin anotar el tipo de retorno a mano: @types/node 20.19.x trae DOS formas
// de "Buffer" nominalmente distintas (la interfaz global clásica que usan
// NextResponse/exceljs en sus firmas, y la clase genérica Buffer<TArrayBuffer>
// que TypeScript infiere en la práctica al encadenar operaciones) — anotar
// "Promise<Buffer>" a mano elegía la forma equivocada y rompía la
// compilación en cadena (route.ts, los tests) sin ningún error de lógica
// real detrás. Dejar que TS infiera el tipo real de writeBuffer() evita
// chocar contra esa inconsistencia del propio paquete de tipos.
export async function construirLibroExcel(params: {
  nombreHoja: string;
  columnas: ColumnaExcel[];
  filas: Record<string, string | number>[];
}) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Avícola M&A";
  libro.created = new Date();

  // Nombre de hoja: Excel prohíbe : \ / ? * [ ] y corta a 31 caracteres.
  const nombreHojaSeguro = params.nombreHoja.replace(/[:\\/?*[\]]/g, "").slice(0, 31);
  const hoja = libro.addWorksheet(nombreHojaSeguro, { views: [{ state: "frozen", ySplit: 1 }] });

  hoja.columns = params.columnas.map((columna) => ({
    header: columna.encabezado,
    key: columna.clave,
    width: Math.max(columna.encabezado.length + 2, 14),
  }));

  const filaEncabezado = hoja.getRow(1);
  filaEncabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  filaEncabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ENCABEZADO } };
  filaEncabezado.alignment = { vertical: "middle" };
  filaEncabezado.height = 20;

  for (const fila of params.filas) {
    hoja.addRow(fila);
  }

  for (const columna of params.columnas) {
    if (columna.formato === "moneda") {
      hoja.getColumn(columna.clave).numFmt = '"S/" #,##0.00';
    } else if (columna.formato === "entero") {
      hoja.getColumn(columna.clave).numFmt = "#,##0";
    }
  }

  // writeBuffer() ya devuelve un Buffer real (tipado así en exceljs) — NO
  // volver a envolverlo con Buffer.from(buffer): en @types/node 20.19.x
  // esa llamada angosta el tipo a Buffer<ArrayBufferLike>, incompatible
  // con el Buffer plano que esperan NextResponse y Workbook.xlsx.load()
  // en otros puntos del código — error real de tipos encontrado al
  // compilar, no una preferencia de estilo.
  return libro.xlsx.writeBuffer();
}
