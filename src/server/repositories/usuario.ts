import { prisma } from "@/lib/prisma";

export function buscarUsuarioPorUsuario(usuario: string) {
  return prisma.usuario.findUnique({ where: { usuario } });
}
