import { prisma } from "@/lib/prisma";

// Lectura simple: trae el historial completo de MovimientoSueltos de un
// galpón+lote para que server/services/inventario.ts (reconstruirSaldo,
// función pura, sin Prisma) lo reduzca a un saldo. Sin paginar — se usa
// para auditoría puntual (script/test), no para una pantalla con
// potencialmente miles de filas; si en algún sprint futuro (7,
// Consolidación) esto alimenta una pantalla real, ahí se agrega
// paginación, no antes de que haga falta.
export function listarMovimientosSueltos(params: { galponId: string; loteId: string }) {
  return prisma.movimientoSueltos.findMany({
    where: { galponId: params.galponId, loteId: params.loteId },
    orderBy: { creadoEn: "asc" },
  });
}
