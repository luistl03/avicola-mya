"use server";

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

    let registro;
    try {
      registro = await registrarMortalidadYDescontarAves({
        loteId: input.loteId,
        galponId: ubicacion.galponId,
        usuarioId: ctx.usuarioId,
        tipo: input.tipo,
        cantidad: input.cantidad,
      });
    } catch (error) {
      if (error instanceof AvesInsuficientesError) {
        throw new AccionError(
          "Ya no quedan suficientes aves vivas para este registro — actualizá la pantalla e intentá de nuevo.",
        );
      }
      throw error;
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
        throw new AccionError("Este registro ya fue revertido — actualizá la pantalla.");
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
