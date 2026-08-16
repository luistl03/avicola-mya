"use server";

import { Prisma } from "@prisma/client";

import { UNIDADES_POR_BANDEJA, UNIDADES_POR_PAQUETE } from "@/lib/constants";
import { romperBandejaSchema, romperPaqueteSchema } from "@/lib/zod/rotura";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  BandejaNoDisponibleError,
  buscarBandejaOrigenesPorBandejaId,
  buscarBandejaPorId,
  buscarPaqueteOrigenesPorPaqueteId,
  buscarPaquetePorId,
  buscarRoturaBandejaPorBandejaId,
  buscarRoturaPaquetePorPaqueteId,
  PaqueteNoDisponibleError,
  romperBandeja as romperBandejaRepo,
  romperPaquete as romperPaqueteRepo,
} from "@/server/repositories/rotura";

// Mismo helper que usuario.ts/lote.ts/galpon.ts/recoleccion.ts/cliente.ts/
// precioKilo.ts/venta.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Sin id de cliente (paqueteId ya es @unique en RoturaPaquete, ver
// server/repositories/rotura.ts) — sin `rol`, abierta a GERENTE y OPERARIO
// (decisión de negocio 6, spec.md).
export const romperPaqueteAction = withAuth(
  { schema: romperPaqueteSchema, entidad: "RoturaPaquete", accion: "ROMPER" },
  async (input, ctx) => {
    const paquete = await buscarPaquetePorId(input.paqueteId);
    if (!paquete) throw new AccionError("El paquete no existe.");
    if (paquete.estado !== "DISPONIBLE") {
      throw new AccionError("Este paquete ya no está disponible (fue vendido, roto o anulado).");
    }

    const origenesReales = await buscarPaqueteOrigenesPorPaqueteId(input.paqueteId);

    let resultado;
    try {
      resultado = await romperPaqueteRepo({
        paqueteId: input.paqueteId,
        pesoExtraido: input.pesoExtraido,
        origenes: origenesReales.map((origen) => ({
          galponId: origen.galponId,
          loteId: origen.loteId,
          cantidad: origen.cantidad,
        })),
        usuarioId: ctx.usuarioId,
        ahora: new Date(),
      });
    } catch (error) {
      if (error instanceof PaqueteNoDisponibleError) {
        throw new AccionError(
          "Este paquete ya no está disponible — puede que ya lo hayan roto o vendido justo ahora.",
        );
      }
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      // Reintento idempotente propio (mismo pesoExtraido) o carrera real
      // con otro operario (pesoExtraido distinto) — ver "Diseño de
      // idempotencia" en plan.md.
      const existente = await buscarRoturaPaquetePorPaqueteId(input.paqueteId);
      if (!existente) {
        throw error;
      }
      if (Number(existente.pesoExtraido) !== input.pesoExtraido) {
        throw new AccionError(
          "Este paquete ya fue roto (por otro operario, o hace un instante) con un peso distinto al que digitaste — no se sobrescribe.",
        );
      }
      resultado = { rotura: existente, unidadesSinLote: UNIDADES_POR_PAQUETE - existente.unidadesDevueltas };
    }

    return {
      data: {
        paqueteId: input.paqueteId,
        unidadesDevueltas: resultado.rotura.unidadesDevueltas,
        unidadesSinLote: resultado.unidadesSinLote,
      },
      entidadId: resultado.rotura.id,
      estadoDespues: {
        paqueteId: input.paqueteId,
        unidadesExtraidas: UNIDADES_POR_PAQUETE,
        unidadesDevueltas: resultado.rotura.unidadesDevueltas,
      },
    };
  },
);

// romperBandejaAction — mismo patrón, mirror completo para BandejaSuelta.
export const romperBandejaAction = withAuth(
  { schema: romperBandejaSchema, entidad: "RoturaBandeja", accion: "ROMPER" },
  async (input, ctx) => {
    const bandeja = await buscarBandejaPorId(input.bandejaId);
    if (!bandeja) throw new AccionError("La bandeja no existe.");
    if (bandeja.estado !== "DISPONIBLE") {
      throw new AccionError("Esta bandeja ya no está disponible (fue vendida, rota o anulada).");
    }

    const origenesReales = await buscarBandejaOrigenesPorBandejaId(input.bandejaId);

    let resultado;
    try {
      resultado = await romperBandejaRepo({
        bandejaId: input.bandejaId,
        pesoExtraido: input.pesoExtraido,
        origenes: origenesReales.map((origen) => ({
          galponId: origen.galponId,
          loteId: origen.loteId,
          cantidad: origen.cantidad,
        })),
        usuarioId: ctx.usuarioId,
        ahora: new Date(),
      });
    } catch (error) {
      if (error instanceof BandejaNoDisponibleError) {
        throw new AccionError(
          "Esta bandeja ya no está disponible — puede que ya la hayan roto o vendido justo ahora.",
        );
      }
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarRoturaBandejaPorBandejaId(input.bandejaId);
      if (!existente) {
        throw error;
      }
      if (Number(existente.pesoExtraido) !== input.pesoExtraido) {
        throw new AccionError(
          "Esta bandeja ya fue rota (por otro operario, o hace un instante) con un peso distinto al que digitaste — no se sobrescribe.",
        );
      }
      resultado = { rotura: existente, unidadesSinLote: UNIDADES_POR_BANDEJA - existente.unidadesDevueltas };
    }

    return {
      data: {
        bandejaId: input.bandejaId,
        unidadesDevueltas: resultado.rotura.unidadesDevueltas,
        unidadesSinLote: resultado.unidadesSinLote,
      },
      entidadId: resultado.rotura.id,
      estadoDespues: {
        bandejaId: input.bandejaId,
        unidadesExtraidas: UNIDADES_POR_BANDEJA,
        unidadesDevueltas: resultado.rotura.unidadesDevueltas,
      },
    };
  },
);
