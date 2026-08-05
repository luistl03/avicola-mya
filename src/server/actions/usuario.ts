"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import {
  cambiarEstadoUsuarioSchema,
  crearUsuarioSchema,
  editarUsuarioSchema,
} from "@/lib/zod/usuario";
import { AccionError, withAuth } from "@/server/auth/with-auth";
import {
  actualizarUsuario,
  buscarUsuarioPorId,
  buscarUsuarioPorUsuario,
  cambiarEstadoUsuario,
  contarGerentesActivos,
  crearUsuario as crearUsuarioRepo,
  desactivarUsuarioYRevocarSesiones,
} from "@/server/repositories/usuario";
import { puedeDesactivarUsuario } from "@/server/services/usuario";

// Mismo cost factor que ya fija memory/stack-tecnologico.md para el hash
// de login (bcrypt.compare en server/auth/autorizar.ts).
const BCRYPT_COST = 12;

const ERROR_USUARIO_DUPLICADO = "Ya existe un usuario con ese nombre de usuario.";

function esErrorDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const crearUsuario = withAuth(
  { schema: crearUsuarioSchema, rol: "GERENTE", entidad: "Usuario", accion: "CREAR" },
  async (input) => {
    // Chequeo previo: evita el round-trip de un error de Prisma en el caso
    // común. El catch de P2002 de abajo cubre la carrera entre dos
    // creaciones simultáneas con el mismo nombre de usuario (el chequeo
    // previo por sí solo no la evita, el índice único de la base sí).
    const existente = await buscarUsuarioPorUsuario(input.usuario);
    if (existente) {
      throw new AccionError(ERROR_USUARIO_DUPLICADO);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    let usuario;
    try {
      usuario = await crearUsuarioRepo({
        usuario: input.usuario,
        passwordHash,
        nombre: input.nombre,
        rol: input.rol,
        celular: input.celular,
        email: input.email,
      });
    } catch (error) {
      if (esErrorDeUnicidad(error)) {
        throw new AccionError(ERROR_USUARIO_DUPLICADO);
      }
      throw error;
    }

    return {
      data: { id: usuario.id },
      entidadId: usuario.id,
      estadoDespues: { usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol },
    };
  },
);

export const editarUsuario = withAuth(
  { schema: editarUsuarioSchema, rol: "GERENTE", entidad: "Usuario", accion: "EDITAR" },
  async (input) => {
    const existente = await buscarUsuarioPorId(input.usuarioId);
    if (!existente) {
      throw new AccionError("El usuario no existe.");
    }

    const passwordHash = input.password
      ? await bcrypt.hash(input.password, BCRYPT_COST)
      : undefined;

    const usuario = await actualizarUsuario(input.usuarioId, {
      nombre: input.nombre,
      celular: input.celular,
      email: input.email,
      passwordHash,
    });

    return {
      data: { id: usuario.id },
      entidadId: usuario.id,
      estadoAntes: {
        nombre: existente.nombre,
        celular: existente.celular,
        email: existente.email,
      },
      estadoDespues: {
        nombre: usuario.nombre,
        celular: usuario.celular,
        email: usuario.email,
      },
    };
  },
);

export const cambiarEstadoUsuarioAction = withAuth(
  {
    schema: cambiarEstadoUsuarioSchema,
    rol: "GERENTE",
    entidad: "Usuario",
    accion: "CAMBIAR_ESTADO",
  },
  async (input, ctx) => {
    const existente = await buscarUsuarioPorId(input.usuarioId);
    if (!existente) {
      throw new AccionError("El usuario no existe.");
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
      const totalGerentesActivos = await contarGerentesActivos();
      const guard = puedeDesactivarUsuario({
        usuarioObjetivoId: input.usuarioId,
        usuarioActualId: ctx.usuarioId,
        usuarioObjetivoRol: existente.rol,
        totalGerentesActivos,
      });
      if (!guard.permitido) {
        throw new AccionError(guard.motivo);
      }

      const [usuario] = await desactivarUsuarioYRevocarSesiones(input.usuarioId, new Date());
      return {
        data: { id: usuario.id, estado: usuario.estado },
        entidadId: usuario.id,
        estadoAntes: { estado: existente.estado },
        estadoDespues: { estado: usuario.estado },
      };
    }

    const usuario = await cambiarEstadoUsuario(input.usuarioId, "ACTIVO");
    return {
      data: { id: usuario.id, estado: usuario.estado },
      entidadId: usuario.id,
      estadoAntes: { estado: existente.estado },
      estadoDespues: { estado: usuario.estado },
    };
  },
);
