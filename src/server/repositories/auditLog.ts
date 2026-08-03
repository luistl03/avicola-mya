import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type CrearAuditLogInput = {
  entidad: string;
  entidadId: string;
  accion: string;
  usuarioId: string;
  estadoAntes?: Prisma.InputJsonValue;
  estadoDespues?: Prisma.InputJsonValue;
  ip?: string;
};

export function crearAuditLog(input: CrearAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      entidad: input.entidad,
      entidadId: input.entidadId,
      accion: input.accion,
      usuarioId: input.usuarioId,
      estadoAntes: input.estadoAntes,
      estadoDespues: input.estadoDespues,
      ip: input.ip,
    },
  });
}
