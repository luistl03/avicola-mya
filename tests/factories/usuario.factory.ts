import type { Usuario } from "@prisma/client";

export function makeUsuario(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: crypto.randomUUID(),
    usuario: `usuario-${crypto.randomUUID().slice(0, 8)}`,
    passwordHash: "hash-de-prueba",
    nombre: "Usuario de Prueba",
    celular: null,
    email: null,
    rol: "OPERARIO",
    estado: "ACTIVO",
    creadoEn: new Date(),
    ...overrides,
  };
}
