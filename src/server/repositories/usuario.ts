import type { EstadoUsuario, Rol } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { revocarSesionesPorUsuario } from "@/server/repositories/sesion";

export function buscarUsuarioPorUsuario(usuario: string) {
  return prisma.usuario.findUnique({ where: { usuario } });
}

export function buscarUsuarioPorId(id: string) {
  return prisma.usuario.findUnique({ where: { id } });
}

export function listarUsuarios() {
  return prisma.usuario.findMany({ orderBy: { nombre: "asc" } });
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
export function actualizarUsuario(id: string, data: ActualizarUsuarioData) {
  return prisma.usuario.update({
    where: { id },
    data: {
      nombre: data.nombre,
      celular: data.celular ?? null,
      email: data.email ?? null,
      ...(data.passwordHash ? { passwordHash: data.passwordHash } : {}),
    },
  });
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
