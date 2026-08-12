"use server";

import { Prisma } from "@prisma/client";

import { ajustarInventarioSueltosSchema } from "@/lib/zod/inventario";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  ajustarInventarioSueltos as ajustarInventarioSueltosRepo,
  buscarMovimientoSueltosPorId,
  SaldoInsuficienteAjusteError,
} from "@/server/repositories/inventario";
import { buscarUbicacionActual } from "@/server/repositories/lote";

// Mismo criterio que server/actions/recoleccion.ts/usuario.ts/lote.ts:
// P2002 se atrapa acá, en la capa de action, no en el repository.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Ajuste manual del Gerente pasado el plazo (Sprint 6) — primera Server
// Action del proyecto restringida a un solo rol dentro de un módulo que
// por lo demás queda abierto a ambos (`/recoleccion` sin entrada en
// RUTAS_POR_ROL). `rol: "GERENTE"` es la defensa real (enforced acá, no
// solo escondiendo el botón en la UI) — ver decisión de diseño en
// spec.md/plan.md: no toca Paquete ni cantidadTotal, es una entrada de
// ledger nueva e independiente, por eso sí necesita el patrón completo de
// idempotencia por id de cliente (a diferencia de revertirRecoleccionAction,
// que es un UPDATE sobre algo que ya existe).
//
// El galpón se resuelve automático vía buscarUbicacionActual(loteId),
// mismo patrón que registrarRecoleccion/registrarMortalidad — corrección
// real post-diseño (S6-16, el Product Owner probando en vivo): el Gerente
// nunca elige un galpón a mano, el lote ya sabe su ubicación actual.
export const ajustarInventarioSueltosAction = withAuth(
  {
    schema: ajustarInventarioSueltosSchema,
    entidad: "MovimientoSueltos",
    accion: "AJUSTAR",
    rol: "GERENTE",
  },
  async (input, ctx) => {
    const ubicacion = await buscarUbicacionActual(input.loteId);
    if (!ubicacion) {
      throw new AccionError("El lote no tiene una ubicación registrada.");
    }

    let movimiento;
    try {
      movimiento = await ajustarInventarioSueltosRepo({
        id: input.id,
        galponId: ubicacion.galponId,
        loteId: input.loteId,
        delta: input.delta,
        motivo: input.motivo,
        usuarioId: ctx.usuarioId,
        ahora: new Date(),
      });
    } catch (error) {
      if (error instanceof SaldoInsuficienteAjusteError) {
        throw new AccionError("El saldo no alcanza para este ajuste.");
      }
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }

      // Reintento idempotente (doble clic, reintento de red) — mismo
      // patrón que registrarRecoleccion/registrarMortalidad: el id ya
      // existe, se devuelve lo ya persistido sin volver a tocar
      // InventarioSueltos.
      const existente = await buscarMovimientoSueltosPorId(input.id);
      if (!existente) {
        // P2002 dijo que el id ya existe, pero esta lectura inmediata no
        // lo encuentra — no debería pasar nunca en la práctica, se deja
        // propagar el error original en vez de esconderlo.
        throw error;
      }
      if (existente.cantidad !== input.delta || existente.motivo !== input.motivo) {
        throw new AccionError(
          "Ya existe un ajuste con este id pero con datos diferentes — no se sobrescribe.",
        );
      }
      movimiento = existente;
    }

    return {
      data: { id: movimiento.id },
      entidadId: movimiento.id,
      estadoDespues: {
        galponId: ubicacion.galponId,
        loteId: input.loteId,
        delta: input.delta,
        motivo: input.motivo,
      },
    };
  },
);
