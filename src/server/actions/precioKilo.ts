"use server";

import { Prisma } from "@prisma/client";

import { crearPrecioKiloSchema } from "@/lib/zod/precioKilo";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import { buscarPrecioKiloPorId, crearPrecioKilo as crearPrecioKiloRepo } from "@/server/repositories/precioKilo";

// Mismo helper que usuario.ts/lote.ts/galpon.ts/recoleccion.ts/cliente.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Idempotencia por id de cliente, mismo patrón que crearCliente/crearGalpon
// — PrecioKilo no tiene ningún campo @unique. A diferencia de esas dos,
// esta acción NUNCA hace un UPDATE: cada llamada exitosa (no idempotente)
// inserta una fila nueva, la fila vigente anterior queda intacta (roadmap:
// "nueva fila, nunca UPDATE").
export const crearPrecioKilo = withAuth(
  { schema: crearPrecioKiloSchema, rol: "GERENTE", entidad: "PrecioKilo", accion: "CREAR" },
  async (input, ctx) => {
    const ahora = new Date();
    let precioKilo;
    try {
      precioKilo = await crearPrecioKiloRepo({
        id: input.id,
        precio: input.precio,
        usuarioId: ctx.usuarioId,
        vigenteDesde: ahora,
      });
    } catch (error) {
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarPrecioKiloPorId(input.id);
      if (!existente) {
        throw error;
      }
      if (Number(existente.precio) !== input.precio) {
        throw new AccionError(
          "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
        );
      }
      precioKilo = existente;
    }
    return {
      data: { id: precioKilo.id, precio: Number(precioKilo.precio) },
      entidadId: precioKilo.id,
      estadoDespues: {
        precio: Number(precioKilo.precio),
        vigenteDesde: precioKilo.vigenteDesde.toISOString(),
      },
    };
  },
);
