import type { CategoriaEgreso } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function crearEgreso(data: {
  id: string;
  categoria: CategoriaEgreso;
  monto: number;
  descripcion: string;
  fecha: Date;
  usuarioId: string;
}) {
  return prisma.egreso.create({ data });
}

// Ninguna de las funciones de este archivo necesita $transaction — todas
// tocan una sola tabla, a diferencia de registrarMortalidadYDescontarAves
// (que además decrementa Lote.avesVivas). Egreso no descuenta ningún
// contador al anularse.
export class EgresoRevertidoError extends Error {}

// Guard real: no editar un Egreso ya anulado (decisión 1, spec.md) —
// updateMany condicional, mismo espíritu que el resto del proyecto,
// aunque acá el riesgo de carrera es bajo (dos ediciones del mismo campo
// casi simultáneas no tienen el mismo impacto financiero que un
// sobrepago de crédito).
export async function editarEgreso(data: {
  id: string;
  categoria: CategoriaEgreso;
  monto: number;
  descripcion: string;
  fecha: Date;
}) {
  const actualizado = await prisma.egreso.updateMany({
    where: { id: data.id, revertido: false },
    data: {
      categoria: data.categoria,
      monto: data.monto,
      descripcion: data.descripcion,
      fecha: data.fecha,
    },
  });
  if (actualizado.count === 0) {
    throw new EgresoRevertidoError();
  }
}

export class EgresoYaRevertidoError extends Error {}

// Mismo patrón que revertirMortalidad: updateMany condicional (WHERE
// revertido = false) es el guard real contra una carrera — dos clics
// casi simultáneos en "Anular" (o dos pestañas) no pueden anular el
// mismo Egreso dos veces. count === 0 significa "ya se anuló en este
// instante", sin importar qué decía la lectura previa de
// puedeRevertirEgreso (server/services/egreso.ts).
export async function revertirEgreso(params: { id: string; ahora: Date }) {
  const actualizado = await prisma.egreso.updateMany({
    where: { id: params.id, revertido: false },
    data: { revertido: true, revertidoEn: params.ahora },
  });
  if (actualizado.count === 0) {
    throw new EgresoYaRevertidoError();
  }
}

// Para la tabla de /egresos: una sola query con include (no N+1), mismo
// criterio que listarLotesConUbicacion/listarRegistrosMortalidad. Trae
// también los Egreso revertidos (la UI los muestra con la etiqueta
// "Anulado") — el filtrado de revertido: true en cálculos/reportes es
// responsabilidad de quien agregue esos totales, no de este listado.
export function listarEgresos(params: {
  skip: number;
  take: number;
  categoria?: CategoriaEgreso;
  desde?: Date;
  hasta?: Date;
}) {
  return prisma.egreso.findMany({
    where: {
      categoria: params.categoria,
      fecha: { gte: params.desde, lte: params.hasta },
    },
    orderBy: { fecha: "desc" },
    skip: params.skip,
    take: params.take,
    include: { usuario: { select: { nombre: true } } },
  });
}

export function contarEgresos(params: { categoria?: CategoriaEgreso; desde?: Date; hasta?: Date } = {}) {
  return prisma.egreso.count({
    where: {
      categoria: params.categoria,
      fecha: { gte: params.desde, lte: params.hasta },
    },
  });
}

export function buscarEgresoPorId(id: string) {
  return prisma.egreso.findUnique({ where: { id } });
}

// Reporte "Gasto por categoría" Y "Balance financiero" de /reportes —
// filas crudas del rango filtrado, `revertido: false` explícito (criterio
// ya documentado arriba en este mismo archivo desde Sprint 12: el
// filtrado de revertidos es responsabilidad de quien agrega el total, no
// de listarEgresos). `hasta` es EXCLUSIVO (lt, no lte). `fecha` se agrega
// al select (no estaba en el diseño original de Sprint 15) para que
// Balance financiero pueda agrupar por día sin una segunda query.
export function listarEgresosEnRango(desde: Date, hasta: Date) {
  return prisma.egreso.findMany({
    where: { fecha: { gte: desde, lt: hasta }, revertido: false },
    select: { categoria: true, monto: true, fecha: true },
  });
}

// Tarjeta "Balance del mes" del dashboard — aggregate _sum, un solo
// round-trip, mismo criterio que sumarVentasEnRango/sumarMortalidadEnRango.
export async function sumarEgresosEnRango(desde: Date, hasta: Date) {
  const resultado = await prisma.egreso.aggregate({
    _sum: { monto: true },
    where: { fecha: { gte: desde, lt: hasta }, revertido: false },
  });
  return resultado._sum.monto ?? 0;
}
