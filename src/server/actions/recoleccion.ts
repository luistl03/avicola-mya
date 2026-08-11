"use server";

import { Prisma } from "@prisma/client";

import { crearRecoleccionSchema } from "@/lib/zod/recoleccion";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { buscarLotePorId, buscarUbicacionActual } from "@/server/repositories/lote";
import {
  buscarRecoleccionConPaquetesPorId,
  registrarRecoleccion as registrarRecoleccionRepo,
} from "@/server/repositories/recoleccion";
import { calcularEmpaque, puedeRegistrarRecoleccion } from "@/server/services/recoleccion";

// Mismo criterio que server/actions/usuario.ts y lote.ts: P2002 se atrapa
// acá, en la capa de action, no en el repository (ver la nota completa en
// server/repositories/recoleccion.ts).
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Sin `rol`: GERENTE y OPERARIO pueden registrar recolección por igual
// (decisión de negocio confirmada en spec.md), mismo criterio que
// registrarMortalidad.
export const registrarRecoleccion = withAuth(
  { schema: crearRecoleccionSchema, entidad: "RegistroRecoleccion", accion: "CREAR" },
  async (input, ctx) => {
    const lote = await buscarLotePorId(input.loteId);
    if (!lote) {
      throw new AccionError("El lote no existe.");
    }

    const guard = puedeRegistrarRecoleccion({ loteEstado: lote.estado });
    if (!guard.permitido) {
      throw new AccionError(guard.motivo);
    }

    // Recalculado en el servidor, nunca se confía en un cálculo hecho en
    // el cliente para la UI reactiva (ver decisión de diseño en spec.md,
    // mismo criterio que el tope de fechaIngreso de Sprint 3): si
    // input.pesos no trae exactamente la cantidad de paquetes que
    // calcularEmpaque determina, se rechaza sin tocar la base.
    const { paquetes: paquetesEsperados, sueltos } = calcularEmpaque(input.cantidadTotal);
    if (input.pesos.length !== paquetesEsperados) {
      throw new AccionError(
        `Se esperaban ${paquetesEsperados} pesos de paquete, se recibieron ${input.pesos.length}.`,
      );
    }

    const ubicacion = await buscarUbicacionActual(input.loteId);
    if (!ubicacion) {
      // Defensivo: un lote ACTIVO siempre debería tener una ubicación
      // abierta (índice único parcial de S0-5 + Sprint 3 lo garantizan).
      throw new AccionError("El lote no tiene una ubicación registrada.");
    }

    const ahora = new Date();

    let resultado: { registro: { id: string; cantidadTotal: number }; paquetes: unknown[] };
    try {
      resultado = await registrarRecoleccionRepo({
        id: input.id,
        loteId: input.loteId,
        galponId: ubicacion.galponId,
        usuarioId: ctx.usuarioId,
        cantidadTotal: input.cantidadTotal,
        creadoEnCliente: input.creadoEnCliente,
        pesos: input.pesos,
        sueltos,
        ahora,
      });
    } catch (error) {
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }

      // Reintento idempotente (mala señal, doble tap) — Contrato
      // Offline-Ready: el id ya existe, se devuelve lo ya persistido sin
      // volver a tocar InventarioSueltos/MovimientoSueltos.
      const existente = await buscarRecoleccionConPaquetesPorId(input.id);
      if (!existente) {
        // P2002 dijo que el id ya existe, pero esta lectura inmediata no
        // lo encuentra — no debería pasar nunca en la práctica, se deja
        // propagar el error original de Prisma en vez de esconderlo
        // detrás de un AccionError genérico.
        throw error;
      }
      if (existente.cantidadTotal !== input.cantidadTotal) {
        throw new AccionError(
          "Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.",
        );
      }
      resultado = { registro: existente, paquetes: existente.paquetes };
    }

    // Nota: un reintento idempotente igual deja una segunda fila en
    // AuditLog (mismo entidadId, accion CREAR) — withAuth no distingue
    // "escritura real" de "no-op idempotente" (ver R3 en spec.md, mismo
    // trade-off aceptado desde Sprint 2). Inofensivo: no hay una segunda
    // mutación de negocio detrás, solo un segundo intento auditado.
    return {
      data: { id: resultado.registro.id, paquetesCreados: resultado.paquetes.length, sueltos },
      entidadId: resultado.registro.id,
      estadoDespues: {
        loteId: input.loteId,
        galponId: ubicacion.galponId,
        cantidadTotal: input.cantidadTotal,
        paquetesCreados: resultado.paquetes.length,
        sueltos,
      },
    };
  },
);
