"use server";

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

export const crearGalpon = withAuth(
  { schema: crearGalponSchema, rol: "GERENTE", entidad: "Galpon", accion: "CREAR" },
  async (input) => {
    const galpon = await crearGalponRepo(input);
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
