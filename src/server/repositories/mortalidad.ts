import type { TipoMortalidad } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Marcador de "ya no alcanzan las aves vivas", lanzado dentro de la
// transacción interactiva de abajo para forzar el rollback. No es un
// AccionError: este archivo es un repository (ADR-000, no conoce
// server/auth/with-auth.ts) — la action lo atrapa y lo traduce al mensaje
// que ve el usuario.
export class AvesInsuficientesError extends Error {}

// Primera transacción interactiva del proyecto (prisma.$transaction(async
// (tx) => ...)), a diferencia del "array-form" que usan todas las
// transacciones de Sprints 2-3 (crearLoteConUbicacion, mudarLote,
// finalizarLote, etc.). Hace falta acá porque esta es la primera mutación
// que necesita decidir si aborta la segunda operación según el resultado
// de la primera — el array-form ejecuta todas las queries sin importar el
// resultado de las anteriores, no puede expresar "si este UPDATE afectó 0
// filas, no crees el registro".
//
// El UPDATE condicional (WHERE avesVivas >= cantidad) es el guard real
// contra una carrera: dos registros simultáneos del mismo lote pueden
// pasar la guard de aplicación (puedeRegistrarMortalidad,
// server/services/mortalidad.ts) con una lectura de avesVivas ya
// desactualizada un instante después. count === 0 significa "ya no
// alcanza en este momento", sin importar qué decía esa lectura previa.
// Sprint 9 (Update condicional anti-doble-venta) va a necesitar
// exactamente este mismo patrón — reusar esta forma, no reinventarla.
// El `id` viaja desde el cliente (Contrato de idempotencia, ver
// lib/zod/mortalidad.ts) — si ya existe (reintento), el `create` de abajo
// lanza P2002 y aborta la transacción COMPLETA, incluido el decremento de
// avesVivas de arriba (mismas garantías de rollback que ya se verificaron
// en vivo para Recolección, Sprint 5, S5-12) — así un doble envío nunca
// puede dejar avesVivas decrementado dos veces. El catch de P2002 vive en
// la Server Action (server/actions/mortalidad.ts), no acá, mismo
// precedente que crearUsuario/crearGalpon/crearNotaBitacora.
export function registrarMortalidadYDescontarAves(data: {
  id: string;
  loteId: string;
  galponId: string;
  usuarioId: string;
  tipo: TipoMortalidad;
  cantidad: number;
  creadoEnCliente: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.lote.updateMany({
      where: { id: data.loteId, avesVivas: { gte: data.cantidad } },
      data: { avesVivas: { decrement: data.cantidad } },
    });
    if (actualizado.count === 0) {
      throw new AvesInsuficientesError();
    }
    return tx.registroMortalidad.create({
      data: {
        id: data.id,
        loteId: data.loteId,
        galponId: data.galponId,
        usuarioId: data.usuarioId,
        tipo: data.tipo,
        cantidad: data.cantidad,
        creadoEnCliente: data.creadoEnCliente,
      },
    });
  });
}

// Para la tabla de /mortalidad: una sola query con include (no N+1),
// mismo criterio que listarLotesConUbicacion. Filtros (post-Sprint 5,
// mismo criterio que listarBitacoraPagina): quedan undefined en el where
// cuando no se filtra por ellos — Prisma simplemente omite esa condición.
export function listarRegistrosMortalidad(params: {
  skip: number;
  take: number;
  tipo?: TipoMortalidad;
  loteId?: string;
  desde?: Date;
  hasta?: Date;
}) {
  return prisma.registroMortalidad.findMany({
    where: {
      tipo: params.tipo,
      loteId: params.loteId,
      fecha: { gte: params.desde, lte: params.hasta },
    },
    orderBy: { fecha: "desc" },
    skip: params.skip,
    take: params.take,
    include: {
      lote: { select: { codigo: true } },
      galpon: { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
  });
}

export function contarRegistrosMortalidad(
  params: { tipo?: TipoMortalidad; loteId?: string; desde?: Date; hasta?: Date } = {},
) {
  return prisma.registroMortalidad.count({
    where: {
      tipo: params.tipo,
      loteId: params.loteId,
      fecha: { gte: params.desde, lte: params.hasta },
    },
  });
}

export function buscarRegistroMortalidadPorId(id: string) {
  return prisma.registroMortalidad.findUnique({ where: { id } });
}

// Ya se lo revirtió alguien más justo antes (doble clic, o dos pestañas
// abiertas) — mismo criterio de nombre que AvesInsuficientesError.
export class YaRevertidoError extends Error {}

// Segunda transacción interactiva del proyecto (la primera fue
// registrarMortalidadYDescontarAves, arriba) — mismo motivo: hace falta
// decidir si se ejecuta la segunda operación (restaurar avesVivas) según
// el resultado de la primera (marcar el registro como revertido).
//
// El UPDATE condicional (WHERE revertido = false) es el guard real contra
// una carrera: dos clics casi simultáneos en "Deshacer" (o dos pestañas)
// podrían, sin esto, restaurar avesVivas dos veces para el mismo registro.
// count === 0 significa "ya se revirtió en este instante", sin importar
// qué decía la lectura previa de la guard de aplicación
// (puedeRevertirMortalidad, server/services/mortalidad.ts).
export function revertirMortalidad(params: {
  id: string;
  loteId: string;
  cantidad: number;
  ahora: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.registroMortalidad.updateMany({
      where: { id: params.id, revertido: false },
      data: { revertido: true, revertidoEn: params.ahora },
    });
    if (actualizado.count === 0) {
      throw new YaRevertidoError();
    }
    return tx.lote.update({
      where: { id: params.loteId },
      data: { avesVivas: { increment: params.cantidad } },
    });
  });
}
