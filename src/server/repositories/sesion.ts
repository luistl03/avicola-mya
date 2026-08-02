import { prisma } from "@/lib/prisma";

export function crearSesion(usuarioId: string, jti: string) {
  return prisma.sesionActiva.create({ data: { usuarioId, jti } });
}

export function buscarSesionPorJti(jti: string) {
  return prisma.sesionActiva.findUnique({ where: { jti } });
}

// updateMany (no update): un jti sin fila correspondiente (cookie de una
// sesión que ya no existe en la BD) debe ser un no-op, no una excepción
// P2025 que tumbe el request completo — el heartbeat y el logout corren
// para cualquier request autenticado, no solo para sesiones "sanas".
export function actualizarUltimaActividad(jti: string, ahora: Date) {
  return prisma.sesionActiva.updateMany({
    where: { jti },
    data: { ultimaActividad: ahora },
  });
}

export function revocarSesion(jti: string, ahora: Date) {
  return prisma.sesionActiva.updateMany({
    where: { jti },
    data: { revocada: true, revocadaEn: ahora },
  });
}
