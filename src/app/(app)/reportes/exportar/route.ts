import { NextResponse } from "next/server";
import type { CategoriaEgreso } from "@prisma/client";

import { REPORTES_RANKING_CLIENTES_TOP } from "@/lib/constants";
import { hoyEnLima } from "@/lib/zod/comun";
import { auth } from "@/server/auth";
import { listarCreditosPendientesConFechaLimiteEnRango } from "@/server/repositories/credito";
import { listarEgresosEnRango } from "@/server/repositories/egreso";
import { listarMortalidadEnRango, listarMortalidadPorLoteEnRango } from "@/server/repositories/mortalidad";
import { listarProduccionEnRango } from "@/server/repositories/recoleccion";
import { listarVentasEnRango, listarVentasParaRankingEnRango } from "@/server/repositories/venta";
import {
  agruparCreditosPorNivelAlerta,
  agruparGastoPorCategoria,
  agruparMortalidadPorLote,
  agruparSumaPorDia,
  agruparVentasPorDiaYMetodo,
  combinarBalance,
  construirLibroExcel,
  listarDiasDelRango,
  parsearRangoFechas,
  rangoMesActual,
  rankearClientes,
  type ColumnaExcel,
} from "@/server/services/reportes";

const LABEL_CATEGORIA: Record<CategoriaEgreso, string> = {
  ALIMENTOS: "Alimentos",
  INSUMOS_VACUNAS: "Insumos y vacunas",
  SERVICIOS: "Servicios",
  MANTENIMIENTO: "Mantenimiento",
  VARIOS: "Varios",
};

const LABEL_NIVEL_ALERTA: Record<string, string> = {
  POR_VENCER: "Por vencer",
  VENCIDO_RECIENTE: "Vencido reciente",
  VENCIDO_CRITICO: "Vencido crítico",
};

type Reporte = { nombreHoja: string; columnas: ColumnaExcel[]; filas: Record<string, string | number>[] };

// Adaptador de transporte sobre repositories + services ya testeados —
// mismo criterio que api/sync/route.ts (Sprint 14): no duplica ninguna
// regla de negocio, solo arma el libro de Excel con los mismos datos que
// ya muestra cada Reporte*.tsx.
async function construirReporte(tipo: string, desde: Date, hasta: Date): Promise<Reporte | null> {
  switch (tipo) {
    case "produccion": {
      const filas = agruparSumaPorDia(
        await listarProduccionEnRango(desde, hasta),
        (r) => r.creadoEn,
        (r) => r.cantidadTotal,
      );
      return {
        nombreHoja: "Producción",
        columnas: [
          { encabezado: "Fecha", clave: "fecha" },
          { encabezado: "Huevos", clave: "total", formato: "entero" },
        ],
        filas: filas.map((f) => ({ fecha: f.fecha, total: f.total })),
      };
    }
    case "mortalidad": {
      const filas = agruparSumaPorDia(
        await listarMortalidadEnRango(desde, hasta),
        (r) => r.fecha,
        (r) => r.cantidad,
      );
      return {
        nombreHoja: "Mortalidad",
        columnas: [
          { encabezado: "Fecha", clave: "fecha" },
          { encabezado: "Mortalidad", clave: "total", formato: "entero" },
        ],
        filas: filas.map((f) => ({ fecha: f.fecha, total: f.total })),
      };
    }
    case "mortalidad-lote": {
      const registros = await listarMortalidadPorLoteEnRango(desde, hasta);
      const filas = agruparMortalidadPorLote(
        registros.map((r) => ({ cantidad: r.cantidad, loteCodigo: r.lote.codigo, galponNombre: r.galpon.nombre })),
      );
      return {
        nombreHoja: "Mortalidad por lote",
        columnas: [
          { encabezado: "Lote", clave: "loteCodigo" },
          { encabezado: "Galpón", clave: "galponNombre" },
          { encabezado: "Mortalidad", clave: "total", formato: "entero" },
        ],
        filas,
      };
    }
    case "ventas": {
      const dias = listarDiasDelRango(desde, hasta);
      const ventas = await listarVentasEnRango(desde, hasta);
      const filas = agruparVentasPorDiaYMetodo(
        ventas.map((v) => ({ fecha: v.fecha, totalCobrado: Number(v.totalCobrado), metodoPago: v.metodoPago })),
        dias,
      );
      return {
        nombreHoja: "Ventas por método de pago",
        columnas: [
          { encabezado: "Fecha", clave: "fecha" },
          { encabezado: "Efectivo", clave: "EFECTIVO", formato: "moneda" },
          { encabezado: "Yape", clave: "YAPE", formato: "moneda" },
          { encabezado: "Plin", clave: "PLIN", formato: "moneda" },
          { encabezado: "Transferencia", clave: "TRANSFERENCIA", formato: "moneda" },
        ],
        filas,
      };
    }
    case "ranking-clientes": {
      const ventas = await listarVentasParaRankingEnRango(desde, hasta);
      const ranking = rankearClientes(
        ventas.map((v) => ({
          clienteId: v.clienteId,
          nombre: v.cliente.nombre,
          tipo: v.cliente.tipo,
          totalCobrado: Number(v.totalCobrado),
        })),
        REPORTES_RANKING_CLIENTES_TOP,
      );
      return {
        nombreHoja: "Ranking de clientes",
        columnas: [
          { encabezado: "Posición", clave: "posicion", formato: "entero" },
          { encabezado: "Cliente", clave: "nombre" },
          { encabezado: "Tipo", clave: "tipo" },
          { encabezado: "Monto total", clave: "montoTotal", formato: "moneda" },
          { encabezado: "Cantidad de ventas", clave: "cantidadVentas", formato: "entero" },
        ],
        filas: ranking.map((r, indice) => ({
          posicion: indice + 1,
          nombre: r.nombre,
          tipo: r.tipo,
          montoTotal: r.montoTotal,
          cantidadVentas: r.cantidadVentas,
        })),
      };
    }
    case "gastos": {
      const egresos = await listarEgresosEnRango(desde, hasta);
      const filas = agruparGastoPorCategoria(egresos.map((e) => ({ categoria: e.categoria, monto: Number(e.monto) })));
      return {
        nombreHoja: "Gasto por categoría",
        columnas: [
          { encabezado: "Categoría", clave: "categoria" },
          { encabezado: "Monto total", clave: "total", formato: "moneda" },
        ],
        filas: filas.map((f) => ({ categoria: LABEL_CATEGORIA[f.categoria], total: f.total })),
      };
    }
    case "creditos": {
      const creditos = await listarCreditosPendientesConFechaLimiteEnRango(desde, hasta);
      const filas = agruparCreditosPorNivelAlerta(
        creditos.map((c) => ({
          montoTotal: Number(c.montoTotal),
          montoPagado: Number(c.montoPagado),
          fechaLimite: c.fechaLimite,
        })),
        hoyEnLima(),
      );
      return {
        nombreHoja: "Créditos y cobranza",
        columnas: [
          { encabezado: "Nivel de alerta", clave: "nivel" },
          { encabezado: "Cantidad", clave: "cantidad", formato: "entero" },
          { encabezado: "Monto pendiente", clave: "montoPendiente", formato: "moneda" },
        ],
        filas: filas.map((f) => ({
          nivel: LABEL_NIVEL_ALERTA[f.nivel] ?? f.nivel,
          cantidad: f.cantidad,
          montoPendiente: f.montoPendiente,
        })),
      };
    }
    case "balance": {
      const [ventas, egresos] = await Promise.all([
        listarVentasEnRango(desde, hasta),
        listarEgresosEnRango(desde, hasta),
      ]);
      const dias = listarDiasDelRango(desde, hasta);
      const ingresosPorDia = agruparSumaPorDia(ventas, (v) => v.fecha, (v) => Number(v.totalCobrado));
      const egresosPorDia = agruparSumaPorDia(egresos, (e) => e.fecha, (e) => Number(e.monto));
      const filas = combinarBalance(ingresosPorDia, egresosPorDia, dias);
      return {
        nombreHoja: "Balance financiero",
        columnas: [
          { encabezado: "Fecha", clave: "fecha" },
          { encabezado: "Ingresos", clave: "ingresos", formato: "moneda" },
          { encabezado: "Egresos", clave: "egresos", formato: "moneda" },
          { encabezado: "Neto", clave: "neto", formato: "moneda" },
        ],
        filas,
      };
    }
    default:
      return null;
  }
}

// Verificación de sesión/rol explícita acá, aunque server/auth/rbac.ts ya
// bloquea /reportes/* (incluido /reportes/exportar, por startsWith) a
// no-GERENTE — defensa en profundidad, mismo espíritu que "toda Server
// Action... verifica sesión + rol antes de ejecutar nada" (CLAUDE.md).
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.rol !== "GERENTE") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") ?? "";
  const { desde, hasta } = parsearRangoFechas(searchParams.get("desde") ?? undefined, searchParams.get("hasta") ?? undefined) ?? rangoMesActual();

  const reporte = await construirReporte(tipo, desde, hasta);
  if (reporte === null) {
    return NextResponse.json({ error: "Tipo de reporte inválido." }, { status: 400 });
  }

  const buffer = await construirLibroExcel(reporte);
  const desdeStr = desde.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const hastaStr = new Date(hasta.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
    timeZone: "America/Lima",
  });
  const nombreArchivo = `${tipo}_${desdeStr}_a_${hastaStr}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
