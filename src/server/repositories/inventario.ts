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

// Lanzado dentro de la transacción de ajustarInventarioSueltos para
// forzar el rollback cuando el saldo no alcanza para un delta negativo —
// no es un AccionError (ADR-000, este archivo no conoce
// server/auth/with-auth.ts), la Server Action lo traduce.
export class SaldoInsuficienteAjusteError extends Error {}

// Quinta transacción interactiva del proyecto (Sprint 6) — a diferencia
// de revertirRecoleccion (un UPDATE sobre algo que ya existe), esta CREA
// una fila nueva e independiente (MovimientoSueltos), así que necesita el
// patrón completo de idempotencia por id de cliente (id explícito en el
// `create`, P2002 atrapado en la Server Action — memory/convenciones.md).
//
// El signo de `delta` decide la rama:
// - delta >= 0: upsert normal (crea la fila de InventarioSueltos en
//   `delta` si no existía todavía para ese galpón/lote, o la incrementa).
//   Un ajuste positivo siempre puede aplicarse, no necesita guard.
// - delta < 0: mismo patrón UPDATE condicional que revertirRecoleccion/
//   avesVivas (WHERE cantidad >= -delta), no un decrement a ciegas que
//   dependa del CHECK (cantidad >= 0) de la base (S0-5). Si no hay fila
//   todavía para ese galpón/lote, el updateMany no afecta nada y cae en
//   el mismo guard (count === 0) — no tiene sentido "restar" de un saldo
//   que nunca existió.
//
// El `create` con `id` explícito va al final, dentro de la misma
// transacción — si lanza P2002 (reintento), Prisma revierte también el
// upsert/updateMany de arriba, mismo criterio ya verificado en vivo para
// Mortalidad (Sprint 5): el create con id puede ir después de la
// escritura sobre el contador sin problema.
export function ajustarInventarioSueltos(params: {
  id: string;
  galponId: string;
  loteId: string;
  delta: number;
  motivo: string;
  usuarioId: string;
  ahora: Date;
}) {
  return prisma.$transaction(async (tx) => {
    if (params.delta >= 0) {
      await tx.inventarioSueltos.upsert({
        where: { galponId_loteId: { galponId: params.galponId, loteId: params.loteId } },
        create: { galponId: params.galponId, loteId: params.loteId, cantidad: params.delta },
        update: { cantidad: { increment: params.delta } },
      });
    } else {
      const actualizado = await tx.inventarioSueltos.updateMany({
        where: {
          galponId: params.galponId,
          loteId: params.loteId,
          cantidad: { gte: -params.delta },
        },
        data: { cantidad: { increment: params.delta } }, // delta negativo: decrementa
      });
      if (actualizado.count === 0) {
        throw new SaldoInsuficienteAjusteError();
      }
    }

    return tx.movimientoSueltos.create({
      data: {
        id: params.id,
        galponId: params.galponId,
        loteId: params.loteId,
        tipo: "AJUSTE_GERENTE",
        cantidad: params.delta,
        motivo: params.motivo,
        usuarioId: params.usuarioId,
        creadoEn: params.ahora,
      },
    });
  });
}

// Usada por la Server Action solo en la rama de P2002 (reintento
// idempotente) para comparar `cantidad`/`motivo` ya persistidos contra el
// payload reenviado — mismo criterio que
// buscarRecoleccionConPaquetesPorId.
export function buscarMovimientoSueltosPorId(id: string) {
  return prisma.movimientoSueltos.findUnique({ where: { id } });
}
