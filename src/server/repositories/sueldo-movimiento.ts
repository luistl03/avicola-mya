import type { TipoSueldoMovimiento } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function crearSueldoMovimiento(data: {
  id: string;
  empleadoId: string;
  tipo: TipoSueldoMovimiento;
  monto: number;
  descripcion?: string;
}) {
  return prisma.sueldoMovimiento.create({ data });
}

export class SueldoMovimientoYaRevertidoError extends Error {}

// Mismo patrón que revertirMortalidad/revertirEgreso: updateMany
// condicional (WHERE revertido = false) es el guard real contra una
// carrera de dos clics casi simultáneos en "Deshacer".
export async function revertirSueldoMovimiento(params: { id: string; ahora: Date }) {
  const actualizado = await prisma.sueldoMovimiento.updateMany({
    where: { id: params.id, revertido: false },
    data: { revertido: true, revertidoEn: params.ahora },
  });
  if (actualizado.count === 0) {
    throw new SueldoMovimientoYaRevertidoError();
  }
}

// Ledger completo de un empleado — sin paginar (mismo criterio que
// buscarCreditosPorClienteConAbonos, Sprint 11: el volumen de
// movimientos de un solo empleado es chico). Incluye los revertidos (la
// UI los muestra con la etiqueta "Revertido").
export function listarSueldoMovimientosPorEmpleado(empleadoId: string) {
  return prisma.sueldoMovimiento.findMany({
    where: { empleadoId },
    orderBy: { fecha: "desc" },
  });
}

// Para H5 (neto mensual, calcularNetoMensual en server/services/) — trae
// solo movimientos no revertidos dentro del rango del mes. `hasta` es
// límite EXCLUSIVO (lt, no lte), mismo criterio que
// calcularRangoMesCalendario documenta.
export function listarSueldoMovimientosEnRango(params: { empleadoId: string; desde: Date; hasta: Date }) {
  return prisma.sueldoMovimiento.findMany({
    where: {
      empleadoId: params.empleadoId,
      revertido: false,
      fecha: { gte: params.desde, lt: params.hasta },
    },
  });
}

export function buscarSueldoMovimientoPorId(id: string) {
  return prisma.sueldoMovimiento.findUnique({ where: { id } });
}
