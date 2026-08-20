import { ReporteRankingClientes } from "@/components/domain/reportes/reporte-ranking-clientes";
import { ReportesFiltroFechas } from "@/components/domain/reportes/reportes-filtro-fechas";
import { ReportesGraficosLazy } from "@/components/domain/reportes/reportes-graficos-lazy";
import { PageHeader } from "@/components/layout/page-header";
import { REPORTES_RANKING_CLIENTES_TOP } from "@/lib/constants";
import { listarCreditosPendientesConFechaLimiteEnRango } from "@/server/repositories/credito";
import { listarEgresosEnRango } from "@/server/repositories/egreso";
import { listarMortalidadEnRango, listarMortalidadPorLoteEnRango } from "@/server/repositories/mortalidad";
import { listarProduccionEnRango } from "@/server/repositories/recoleccion";
import {
  listarVentasEnRango,
  listarVentasParaRankingEnRango,
} from "@/server/repositories/venta";
import {
  agruparCreditosPorNivelAlerta,
  agruparGastoPorCategoria,
  agruparMortalidadPorLote,
  agruparMortalidadPorTipo,
  agruparSumaPorDia,
  agruparVentasPorDiaYMetodo,
  combinarBalance,
  listarDiasDelRango,
  parsearRangoFechas,
  rangoMesActual,
  rankearClientes,
  sumarTotal,
} from "@/server/services/reportes";
import { hoyEnLima } from "@/lib/zod/comun";

// searchParams es un límite de entrada externo (viene de la URL, no de una
// Server Action validada con Zod) — mismo criterio defensivo que
// app/(app)/egresos/page.tsx: un valor manipulado a mano cae al rango del
// mes actual (parsearRangoFechas devuelve null, ver server/services/reportes.ts).

function formatoInput(fecha: Date): string {
  return fecha.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  // Sin guard de rol acá adentro: server/auth/rbac.ts ya restringe
  // /reportes a GERENTE (S15-16) — el guard real vive en proxy.ts, mismo
  // criterio que /egresos/page.tsx.
  const { desde: desdeParam, hasta: hastaParam } = await searchParams;
  const { desde, hasta } = parsearRangoFechas(desdeParam, hastaParam) ?? rangoMesActual();

  const [produccion, mortalidad, ventas, ventasRanking, egresos, creditos, mortalidadPorLote] = await Promise.all([
    listarProduccionEnRango(desde, hasta),
    listarMortalidadEnRango(desde, hasta),
    listarVentasEnRango(desde, hasta),
    listarVentasParaRankingEnRango(desde, hasta),
    listarEgresosEnRango(desde, hasta),
    listarCreditosPendientesConFechaLimiteEnRango(desde, hasta),
    listarMortalidadPorLoteEnRango(desde, hasta),
  ]);

  const dias = listarDiasDelRango(desde, hasta);
  const produccionPorDia = agruparSumaPorDia(produccion, (r) => r.creadoEn, (r) => r.cantidadTotal);
  const mortalidadPorDia = agruparSumaPorDia(mortalidad, (r) => r.fecha, (r) => r.cantidad);
  const mortalidadPorTipo = agruparMortalidadPorTipo(mortalidad);
  const ventasNumericas = ventas.map((v) => ({
    fecha: v.fecha,
    totalCobrado: Number(v.totalCobrado),
    metodoPago: v.metodoPago,
  }));
  const ventasPorDia = agruparVentasPorDiaYMetodo(ventasNumericas, dias);
  const ranking = rankearClientes(
    ventasRanking.map((v) => ({
      clienteId: v.clienteId,
      nombre: v.cliente.nombre,
      tipo: v.cliente.tipo,
      totalCobrado: Number(v.totalCobrado),
    })),
    REPORTES_RANKING_CLIENTES_TOP,
  );
  const egresosNumericos = egresos.map((e) => ({ categoria: e.categoria, monto: Number(e.monto), fecha: e.fecha }));
  const gastoPorCategoria = agruparGastoPorCategoria(egresosNumericos);
  const creditosNumericos = creditos.map((c) => ({
    montoTotal: Number(c.montoTotal),
    montoPagado: Number(c.montoPagado),
    fechaLimite: c.fechaLimite,
  }));
  const creditosPorNivel = agruparCreditosPorNivelAlerta(creditosNumericos, hoyEnLima());
  const mortalidadPorLoteAgrupada = agruparMortalidadPorLote(
    mortalidadPorLote.map((m) => ({ cantidad: m.cantidad, loteCodigo: m.lote.codigo, galponNombre: m.galpon.nombre })),
  );
  const ingresosPorDia = agruparSumaPorDia(ventasNumericas, (v) => v.fecha, (v) => v.totalCobrado);
  const egresosPorDia = agruparSumaPorDia(egresosNumericos, (e) => e.fecha, (e) => e.monto);
  const balancePorDia = combinarBalance(ingresosPorDia, egresosPorDia, dias);

  const desdeStr = formatoInput(desde);
  // `hasta` es el límite EXCLUSIVO (día siguiente) — el input de fecha
  // necesita el último día INCLUIDO, un día antes.
  const hastaStr = formatoInput(new Date(hasta.getTime() - 24 * 60 * 60 * 1000));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Reportes" actions={<ReportesFiltroFechas desde={desdeStr} hasta={hastaStr} />} />
      <ReportesGraficosLazy
        desde={desdeStr}
        hasta={hastaStr}
        produccion={{ datos: produccionPorDia, total: sumarTotal(produccion.map((r) => r.cantidadTotal)) }}
        mortalidad={{ datos: mortalidadPorDia, porTipo: mortalidadPorTipo }}
        ventas={{ datos: ventasPorDia }}
        gastoPorCategoria={{ datos: gastoPorCategoria }}
        creditos={{ datos: creditosPorNivel }}
        mortalidadPorLote={{ datos: mortalidadPorLoteAgrupada }}
        balance={{ datos: balancePorDia }}
      />
      <ReporteRankingClientes datos={ranking} desde={desdeStr} hasta={hastaStr} />
    </div>
  );
}
