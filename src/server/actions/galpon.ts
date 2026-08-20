"use server";

import { Prisma } from "@prisma/client";

import {
  cambiarEstadoGalponSchema,
  crearGalponSchema,
  editarGalponSchema,
} from "@/lib/zod/galpon";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  actualizarGalpon,
  buscarGalponPorId,
  cambiarEstadoGalpon,
  crearGalpon as crearGalponRepo,
  obtenerOcupacionGalpon,
} from "@/server/repositories/galpon";
import { puedeDesactivarGalpon, puedeReducirCapacidad } from "@/server/services/galpon";

function sumarAvesAlojadas(ocupacion: { lote: { avesVivas: number } }[]): number {
  return ocupacion.reduce((suma, fila) => suma + fila.lote.avesVivas, 0);
}

// Mismo helper que usuario.ts/lote.ts/recoleccion.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Idempotencia por id de cliente (mismo patrón que
// server/actions/recoleccion.ts, Sprint 5): Galpon.nombre no tiene
// @unique ("nada lo pedía" en Sprint 3), así que a diferencia de
// Usuario/Lote acá no hay ninguna restricción de negocio que
// incidentalmente proteja contra un doble envío — el id generado en el
// cliente es la única defensa real. Auditoría post-Sprint 5, ver
// memory/estado-proyecto.md.
export const crearGalpon = withAuth(
  { schema: crearGalponSchema, rol: "GERENTE", entidad: "Galpon", accion: "CREAR" },
  async (input) => {
    let galpon;
    try {
      galpon = await crearGalponRepo(input);
    } catch (error) {
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarGalponPorId(input.id);
      if (!existente) {
        throw error;
      }
      if (existente.nombre !== input.nombre || existente.capacidadMaxima !== input.capacidadMaxima) {
        throw new AccionError(
          "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
        );
      }
      galpon = existente;
    }
    return {
      data: { id: galpon.id },
      entidadId: galpon.id,
      estadoDespues: { nombre: galpon.nombre, capacidadMaxima: galpon.capacidadMaxima },
    };
  },
);

export const editarGalpon = withAuth(
  { schema: editarGalponSchema, rol: "GERENTE", entidad: "Galpon", accion: "EDITAR" },
  async (input) => {
    const existente = await buscarGalponPorId(input.galponId);
    if (!existente) {
      throw new AccionError("El galpón no existe.");
    }

    const ocupacion = await obtenerOcupacionGalpon(input.galponId);
    const avesActuales = sumarAvesAlojadas(ocupacion);
    const guard = puedeReducirCapacidad({
      capacidadNueva: input.capacidadMaxima,
      avesActualesAlojadas: avesActuales,
    });
    if (!guard.permitido) {
      throw new AccionError(guard.motivo);
    }

    const galpon = await actualizarGalpon(input.galponId, {
      nombre: input.nombre,
      capacidadMaxima: input.capacidadMaxima,
    });

    return {
      data: { id: galpon.id },
      entidadId: galpon.id,
      estadoAntes: { nombre: existente.nombre, capacidadMaxima: existente.capacidadMaxima },
      estadoDespues: { nombre: galpon.nombre, capacidadMaxima: galpon.capacidadMaxima },
    };
  },
);

export const cambiarEstadoGalponAction = withAuth(
  {
    schema: cambiarEstadoGalponSchema,
    rol: "GERENTE",
    entidad: "Galpon",
    accion: "CAMBIAR_ESTADO",
  },
  async (input) => {
    const existente = await buscarGalponPorId(input.galponId);
    if (!existente) {
      throw new AccionError("El galpón no existe.");
    }

    if (input.estado === existente.estado) {
      return {
        data: { id: existente.id, estado: existente.estado },
        entidadId: existente.id,
        estadoAntes: { estado: existente.estado },
        estadoDespues: { estado: existente.estado },
      };
    }

    if (input.estado === "INACTIVO") {
      const ocupacion = await obtenerOcupacionGalpon(input.galponId);
      const guard = puedeDesactivarGalpon({ lotesAlojados: ocupacion.length });
      if (!guard.permitido) {
        throw new AccionError(guard.motivo);
      }
    }

    const galpon = await cambiarEstadoGalpon(input.galponId, input.estado);

    return {
      data: { id: galpon.id, estado: galpon.estado },
      entidadId: galpon.id,
      estadoAntes: { estado: existente.estado },
      estadoDespues: { estado: galpon.estado },
    };
  },
);
