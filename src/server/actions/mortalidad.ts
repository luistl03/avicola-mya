"use server";

import { Prisma } from "@prisma/client";

import { crearRegistroMortalidadSchema, revertirMortalidadSchema } from "@/lib/zod/mortalidad";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { buscarLotePorId, buscarUbicacionActual } from "@/server/repositories/lote";
import {
  AvesInsuficientesError,
  buscarRegistroMortalidadPorId,
  registrarMortalidadYDescontarAves,
  revertirMortalidad,
  YaRevertidoError,
} from "@/server/repositories/mortalidad";
import { puedeRegistrarMortalidad, puedeRevertirMortalidad } from "@/server/services/mortalidad";

// Mismo helper que usuario.ts/lote.ts/galpon.ts/bitacora.ts/recoleccion.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Sin `rol`: GERENTE y OPERARIO pueden registrar mortalidad por igual
// (decisión de negocio confirmada en spec.md) — withAuth ya soporta
// omitir `rol` para "alcanza con estar autenticado" (server/auth/with-auth.ts).
export const registrarMortalidad = withAuth(
  { schema: crearRegistroMortalidadSchema, entidad: "RegistroMortalidad", accion: "CREAR" },
  async (input, ctx) => {
    const lote = await buscarLotePorId(input.loteId);
    if (!lote) {
      throw new AccionError("El lote no existe.");
    }

    const guard = puedeRegistrarMortalidad({
      loteEstado: lote.estado,
      avesVivas: lote.avesVivas,
      cantidad: input.cantidad,
    });
    if (!guard.permitido) {
      throw new AccionError(guard.motivo);
    }

    const ubicacion = await buscarUbicacionActual(input.loteId);
    if (!ubicacion) {
      // Defensivo: un lote ACTIVO siempre debería tener una ubicación
      // abierta (índice único parcial de S0-5 + Sprint 3 lo garantizan).
      throw new AccionError("El lote no tiene una ubicación registrada.");
    }

    // Idempotencia por id de cliente (mismo patrón que
    // server/actions/recoleccion.ts, Sprint 5): acá importa más que en
    // ningún otro módulo auditado — un doble envío sin esta protección no
    // solo duplicaba la fila, decrementaba avesVivas dos veces (hallazgo
    // real de la auditoría post-Sprint 5, ver memory/estado-proyecto.md).
    // El `create` con `id` explícito vive dentro de la misma transacción
    // interactiva que el decremento — si lanza P2002, Prisma revierte la
    // transacción COMPLETA, así que un reintento nunca puede dejar
    // avesVivas decrementado sin su RegistroMortalidad correspondiente.
    let registro;
    try {
      registro = await registrarMortalidadYDescontarAves({
        id: input.id,
        loteId: input.loteId,
        galponId: ubicacion.galponId,
        usuarioId: ctx.usuarioId,
        tipo: input.tipo,
        cantidad: input.cantidad,
        creadoEnCliente: input.creadoEnCliente,
      });
    } catch (error) {
      if (error instanceof AvesInsuficientesError) {
        throw new AccionError(
          "Ya no quedan suficientes aves vivas para este registro - actualiza la pantalla e intenta de nuevo.",
        );
      }
      if (esErrorDeUnicidad(error)) {
        const existente = await buscarRegistroMortalidadPorId(input.id);
        if (!existente) {
          throw error;
        }
        if (
          existente.loteId !== input.loteId ||
          existente.tipo !== input.tipo ||
          existente.cantidad !== input.cantidad
        ) {
          throw new AccionError(
            "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
          );
        }
        registro = existente;
      } else {
        throw error;
      }
    }

    return {
      data: { id: registro.id },
      entidadId: registro.id,
      estadoDespues: {
        loteId: input.loteId,
        galponId: ubicacion.galponId,
        tipo: input.tipo,
        cantidad: input.cantidad,
      },
    };
  },
);

// Ventana de gracia de 10 minutos (post-Sprint 4). Sin `rol`, mismo
// criterio que registrarMortalidad: cualquier usuario autenticado puede
// deshacer cualquier registro, no solo el propio.
export const revertirMortalidadAction = withAuth(
  { schema: revertirMortalidadSchema, entidad: "RegistroMortalidad", accion: "REVERTIR" },
  async (input) => {
    const registro = await buscarRegistroMortalidadPorId(input.registroId);
    if (!registro) {
      throw new AccionError("El registro no existe.");
    }

    const guard = puedeRevertirMortalidad({
      revertido: registro.revertido,
      fecha: registro.fecha,
      ahora: new Date(),
    });
    if (!guard.permitido) {
      throw new AccionError(guard.motivo);
    }

    try {
      await revertirMortalidad({
        id: registro.id,
        loteId: registro.loteId,
        cantidad: registro.cantidad,
        ahora: new Date(),
      });
    } catch (error) {
      if (error instanceof YaRevertidoError) {
        throw new AccionError("Este registro ya fue revertido - actualiza la pantalla.");
      }
      throw error;
    }

    return {
      data: { id: registro.id },
      entidadId: registro.id,
      estadoAntes: { revertido: false },
      estadoDespues: { revertido: true, avesVivasRestauradas: registro.cantidad },
    };
  },
);
