import bcrypt from "bcryptjs";

import { loginSchema } from "@/lib/zod/auth";
import { buscarUsuarioPorUsuario } from "@/server/repositories/usuario";

export async function autorizarCredenciales(credentials: unknown) {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return null;

  const usuario = await buscarUsuarioPorUsuario(parsed.data.usuario);
  if (!usuario || usuario.estado !== "ACTIVO") return null;

  const passwordValida = await bcrypt.compare(parsed.data.password, usuario.passwordHash);
  if (!passwordValida) return null;

  return {
    id: usuario.id,
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    rol: usuario.rol,
  };
}
