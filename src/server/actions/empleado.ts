"use server";

import { Prisma } from "@prisma/client";

import {
  cambiarEstadoEmpleadoSchema,
  crearEmpleadoSchema,
  editarEmpleadoSchema,
} from "@/lib/zod/empleado";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  buscarEmpleadoPorId,
  cambiarEstadoEmpleado,
  crearEmpleado as crearEmpleadoRepo,
  editarEmpleado as editarEmpleadoRepo,
} from "@/server/repositories/empleado";

// Mismo helper que usuario.ts/lote.ts/galpon.ts/mortalidad.ts/credito.ts/
// egreso.ts.
function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Rol GERENTE únicamente (decisión 3, spec.md). Idempotencia por id de
// cliente: Empleado.nombre no tiene @unique (dos empleados con el mismo
// nombre son plausibles en una granja familiar).
export const crearEmpleadoAction = withAuth(
  { schema: crearEmpleadoSchema, rol: "GERENTE", entidad: "Empleado", accion: "CREAR" },
  async (input) => {
    let empleado;
    try {
      empleado = await crearEmpleadoRepo(input);
    } catch (error) {
      if (!esErrorDeUnicidad(error)) {
        throw error;
      }
      const existente = await buscarEmpleadoPorId(input.id);
      if (!existente) {
        throw error;
      }
      const coincide =
        existente.nombre === input.nombre &&
        (existente.celular ?? undefined) === input.celular &&
        (existente.cargo ?? undefined) === input.cargo;
      if (!coincide) {
        throw new AccionError("Ya existe un empleado con este id pero con datos diferentes - no se sobrescribe.");
      }
      empleado = existente;
    }

    return {
      data: { id: empleado.id },
      entidadId: empleado.id,
      estadoDespues: { nombre: empleado.nombre, celular: empleado.celular, cargo: empleado.cargo },
    };
  },
);

export const editarEmpleadoAction = withAuth(
  { schema: editarEmpleadoSchema, rol: "GERENTE", entidad: "Empleado", accion: "EDITAR" },
  async (input) => {
    const existente = await buscarEmpleadoPorId(input.id);
    if (!existente) {
      throw new AccionError("El empleado no existe.");
    }

    const empleado = await editarEmpleadoRepo(input);

    return {
      data: { id: empleado.id },
      entidadId: empleado.id,
      estadoAntes: { nombre: existente.nombre, celular: existente.celular, cargo: existente.cargo },
      estadoDespues: { nombre: empleado.nombre, celular: empleado.celular, cargo: empleado.cargo },
    };
  },
);

// Un solo action para activar y desactivar (el estado viaja en el
// payload) — a diferencia de cambiarEstadoUsuarioAction, acá no hay
// ninguna regla tipo "último Gerente activo" ni SesionActiva que revocar
// (Empleado no está vinculado a Usuario este sprint, decisión 5).
export const cambiarEstadoEmpleadoAction = withAuth(
  { schema: cambiarEstadoEmpleadoSchema, rol: "GERENTE", entidad: "Empleado", accion: "CAMBIAR_ESTADO" },
  async (input) => {
    const existente = await buscarEmpleadoPorId(input.id);
    if (!existente) {
      throw new AccionError("El empleado no existe.");
    }

    if (input.estado === existente.estado) {
      return {
        data: { id: existente.id, estado: existente.estado },
        entidadId: existente.id,
        estadoAntes: { estado: existente.estado },
        estadoDespues: { estado: existente.estado },
      };
    }

    const empleado = await cambiarEstadoEmpleado(input);

    return {
      data: { id: empleado.id, estado: empleado.estado },
      entidadId: empleado.id,
      estadoAntes: { estado: existente.estado },
      estadoDespues: { estado: empleado.estado },
    };
  },
);
