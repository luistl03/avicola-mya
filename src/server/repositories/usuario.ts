import type { EstadoUsuario, Rol } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { revocarSesionesPorUsuario } from "@/server/repositories/sesion";

export function buscarUsuarioPorUsuario(usuario: string) {
  return prisma.usuario.findUnique({ where: { usuario } });
}

export function buscarUsuarioPorId(id: string) {
  return prisma.usuario.findUnique({ where: { id } });
}

export function listarUsuarios(params: { skip: number; take: number }) {
  return prisma.usuario.findMany({
    orderBy: { nombre: "asc" },
    skip: params.skip,
    take: params.take,
  });
}

export function contarUsuarios() {
  return prisma.usuario.count();
}

type CrearUsuarioData = {
  usuario: string;
  passwordHash: string;
  nombre: string;
  rol: Rol;
  celular?: string;
  email?: string;
};

export function crearUsuario(data: CrearUsuarioData) {
  return prisma.usuario.create({ data });
}

type ActualizarUsuarioData = {
  usuario: string;
  nombre: string;
  celular?: string;
  email?: string;
  passwordHash?: string;
};

// El formulario de edición reemplaza celular/email por completo en cada
// guardado (no es un PATCH parcial) — `undefined` acá significa "el
// Gerente lo dejó en blanco", así que se persiste como `null` explícito.
// Pasar `undefined` tal cual a Prisma.update() significaría "no tocar
// este campo", que dejaría un valor viejo pegado si el usuario lo borró.
//
// Toca dos tablas (Usuario + SesionActiva) cuando se resetea la
// contraseña — va en prisma.$transaction por convención
// (convenciones.md), mismo patrón que desactivarUsuarioYRevocarSesiones.
// Revocar solo pasa si `passwordHash` viene seteado: no tiene sentido
// desloguear el resto de sesiones por editar el nombre o el celular, pero
// SÍ tiene sentido hacerlo al cambiar la contraseña — si el motivo del
// cambio es que la vieja quedó expuesta (p. ej. aviso de brecha del
// gestor de contraseñas del navegador), dejar sesiones viejas vivas
// anularía el propósito del reseteo. Devuelve un array (no un Usuario
// suelto) porque `$transaction` siempre devuelve un array — el caller
// desestructura el primer elemento.
export function actualizarUsuario(id: string, data: ActualizarUsuarioData, ahora: Date) {
  const actualizacion = prisma.usuario.update({
    where: { id },
    data: {
      usuario: data.usuario,
      nombre: data.nombre,
      celular: data.celular ?? null,
      email: data.email ?? null,
      ...(data.passwordHash ? { passwordHash: data.passwordHash } : {}),
    },
  });

  if (!data.passwordHash) {
    return prisma.$transaction([actualizacion]);
  }

  return prisma.$transaction([actualizacion, revocarSesionesPorUsuario(id, ahora)]);
}

export function cambiarEstadoUsuario(id: string, estado: EstadoUsuario) {
  return prisma.usuario.update({ where: { id }, data: { estado } });
}

// Toca dos tablas (Usuario + SesionActiva) — va en prisma.$transaction por
// convención (convenciones.md). Vive acá y no en server/actions/usuario.ts
// porque solo los repositories importan Prisma (ADR-000); reusa
// revocarSesionesPorUsuario de sesion.ts en vez de reimplementar el
// updateMany.
export function desactivarUsuarioYRevocarSesiones(id: string, ahora: Date) {
  return prisma.$transaction([
    prisma.usuario.update({ where: { id }, data: { estado: "INACTIVO" } }),
    revocarSesionesPorUsuario(id, ahora),
  ]);
}

// Guard de negocio de server/services/usuario.ts (puedeDesactivarUsuario):
// nunca puede quedar el sistema sin ningún Gerente ACTIVO.
export function contarGerentesActivos() {
  return prisma.usuario.count({ where: { rol: "GERENTE", estado: "ACTIVO" } });
}
