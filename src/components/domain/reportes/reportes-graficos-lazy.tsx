"use client";

import dynamic from "next/dynamic";
import type { CategoriaEgreso, MetodoPago } from "@prisma/client";
import type { NivelAlertaCredito } from "@/server/services/credito";

// Sprint 15, ajuste de rendimiento a pedido del Product Owner ("con esta
// nueva puesta se han vuelto lentos"): Recharts (+ sus dependencias
// internas de d3) es una librería pesada del lado del cliente. `page.tsx`
// es un Server Component (hace fetch directo a Prisma) y `next/dynamic`
// con `ssr: false` solo puede usarse dentro de un Client Component — de
// ahí este archivo puente: cada gráfico se carga bajo demanda, con un
// esqueleto simple mientras tanto, en vez de venir embebido en el bundle
// inicial de /reportes. El resto de la pantalla (título, filtro de
// fechas, encabezados de cada sección) sigue siendo Server Component puro
// y aparece de inmediato — solo el gráfico en sí espera su JS.
function Esqueleto() {
  return <div className="h-80 w-full animate-pulse rounded-lg bg-muted" />;
}

const ReporteProduccionLazy = dynamic(
  () => import("@/components/domain/reportes/reporte-produccion").then((m) => m.ReporteProduccion),
  { ssr: false, loading: Esqueleto },
);
const ReporteMortalidadLazy = dynamic(
  () => import("@/components/domain/reportes/reporte-mortalidad").then((m) => m.ReporteMortalidad),
  { ssr: false, loading: Esqueleto },
);
const ReporteVentasLazy = dynamic(
  () => import("@/components/domain/reportes/reporte-ventas").then((m) => m.ReporteVentas),
  { ssr: false, loading: Esqueleto },
);
const ReporteGastoCategoriaLazy = dynamic(
  () => import("@/components/domain/reportes/reporte-gasto-categoria").then((m) => m.ReporteGastoCategoria),
  { ssr: false, loading: Esqueleto },
);
const ReporteCreditosLazy = dynamic(
  () => import("@/components/domain/reportes/reporte-creditos").then((m) => m.ReporteCreditos),
  { ssr: false, loading: Esqueleto },
);
const ReporteMortalidadPorLoteLazy = dynamic(
  () => import("@/components/domain/reportes/reporte-mortalidad-lote").then((m) => m.ReporteMortalidadPorLote),
  { ssr: false, loading: Esqueleto },
);
const ReporteBalanceLazy = dynamic(
  () => import("@/components/domain/reportes/reporte-balance").then((m) => m.ReporteBalance),
  { ssr: false, loading: Esqueleto },
);

type Props = {
  desde: string;
  hasta: string;
  produccion: { datos: { fecha: string; total: number }[]; total: number };
  mortalidad: {
    datos: { fecha: string; total: number }[];
    porTipo: { MUERTE: number; DESCARTE: number };
  };
  ventas: { datos: ({ fecha: string } & Record<MetodoPago, number>)[] };
  gastoPorCategoria: { datos: { categoria: CategoriaEgreso; total: number }[] };
  creditos: { datos: { nivel: NivelAlertaCredito; cantidad: number; montoPendiente: number }[] };
  mortalidadPorLote: { datos: { loteCodigo: string; galponNombre: string; total: number }[] };
  balance: { datos: { fecha: string; ingresos: number; egresos: number; neto: number }[] };
};

// Wrapper único para los 7 gráficos (Recharts) del reporte — Ranking de
// clientes queda AFUERA (server/reporte-ranking-clientes.tsx es una tabla
// sin Recharts, no necesita este tratamiento, y sigue rindiendo del lado
// del servidor sin JS extra).
export function ReportesGraficosLazy({
  desde,
  hasta,
  produccion,
  mortalidad,
  ventas,
  gastoPorCategoria,
  creditos,
  mortalidadPorLote,
  balance,
}: Props) {
  return (
    <>
      <ReporteBalanceLazy datos={balance.datos} desde={desde} hasta={hasta} />
      <ReporteProduccionLazy datos={produccion.datos} total={produccion.total} desde={desde} hasta={hasta} />
      <ReporteMortalidadLazy
        datos={mortalidad.datos}
        porTipo={mortalidad.porTipo}
        desde={desde}
        hasta={hasta}
      />
      <ReporteMortalidadPorLoteLazy datos={mortalidadPorLote.datos} desde={desde} hasta={hasta} />
      <ReporteVentasLazy datos={ventas.datos} desde={desde} hasta={hasta} />
      <ReporteCreditosLazy datos={creditos.datos} desde={desde} hasta={hasta} />
      <ReporteGastoCategoriaLazy datos={gastoPorCategoria.datos} desde={desde} hasta={hasta} />
    </>
  );
}
