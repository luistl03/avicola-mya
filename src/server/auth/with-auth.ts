import { headers } from "next/headers";
import type { Prisma, Rol } from "@prisma/client";
import type { z } from "zod";

import { crearAuditLog } from "@/server/repositories/auditLog";
import { buscarSesionPorJti, revocarSesion } from "@/server/repositories/sesion";
import { estaExpiradaPorInactividad } from "@/server/services/sesion";
import { auth } from "@/server/auth";

/**
 * Error "esperado" de negocio (p. ej. "usuario ya existe", una guard que
 * rechaza la acción) que un handler puede lanzar para que withAuth lo
 * traduzca a `{ ok: false, error }` en vez de dejarlo propagarse como una
 * excepción sin manejar. Cualquier otro error lanzado por el handler NO se
 * atrapa acá — sigue su curso (mismo criterio que server/actions/auth.ts
 * usa con AuthError vs. cualquier otro error).
 */
export class AccionError extends Error {}

type WithAuthConfig<TInput> = {
  schema: z.ZodType<TInput>;
  /** Rol(es) permitido(s). Si se omite, alcanza con estar autenticado. */
  rol?: Rol | Rol[];
  /** Nombre de la entidad de negocio afectada, para AuditLog. */
  entidad: string;
  /** Acción realizada, para AuditLog (p. ej. "CREAR", "DESACTIVAR"). */
  accion: string;
};

type HandlerCtx = { usuarioId: string; rol: Rol };

type HandlerResult<TOutput> = {
  data: TOutput;
  /** Id de la fila afectada, para AuditLog.entidadId. */
  entidadId: string;
  estadoAntes?: Prisma.InputJsonValue;
  estadoDespues?: Prisma.InputJsonValue;
};

export type ActionResult<TOutput> =
  | { ok: true; data: TOutput }
  | { ok: false; error: string; campos?: Record<string, string[] | undefined> };

function normalizarInput(rawInput: unknown): unknown {
  if (rawInput instanceof FormData) {
    return Object.fromEntries(rawInput.entries());
  }
  return rawInput;
}

async function obtenerIp(): Promise<string | undefined> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim();
  return headerList.get("x-real-ip") ?? undefined;
}

const ERROR_SESION_INVALIDA = "Tu sesión ya no es válida. Inicia sesión de nuevo.";

export function withAuth<TInput, TOutput>(
  config: WithAuthConfig<TInput>,
  handler: (input: TInput, ctx: HandlerCtx) => Promise<HandlerResult<TOutput>>,
) {
  return async (rawInput: unknown): Promise<ActionResult<TOutput>> => {
    const session = await auth();
    if (!session?.user?.id || !session.sesionId) {
      return { ok: false, error: "No autenticado." };
    }

    const sesionActiva = await buscarSesionPorJti(session.sesionId);
    if (!sesionActiva || sesionActiva.revocada) {
      return { ok: false, error: ERROR_SESION_INVALIDA };
    }

    if (estaExpiradaPorInactividad(sesionActiva.ultimaActividad, new Date())) {
      await revocarSesion(session.sesionId, new Date());
      return { ok: false, error: ERROR_SESION_INVALIDA };
    }

    const rolesPermitidos = config.rol
      ? Array.isArray(config.rol)
        ? config.rol
        : [config.rol]
      : undefined;
    if (rolesPermitidos && !rolesPermitidos.includes(session.user.rol)) {
      return { ok: false, error: "No autorizado." };
    }

    const parsed = config.schema.safeParse(normalizarInput(rawInput));
    if (!parsed.success) {
      return {
        ok: false,
        error: "Datos inválidos.",
        campos: parsed.error.flatten().fieldErrors,
      };
    }

    let resultado: HandlerResult<TOutput>;
    try {
      resultado = await handler(parsed.data, {
        usuarioId: session.user.id,
        rol: session.user.rol,
      });
    } catch (error) {
      if (error instanceof AccionError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }

    await crearAuditLog({
      entidad: config.entidad,
      entidadId: resultado.entidadId,
      accion: config.accion,
      usuarioId: session.user.id,
      estadoAntes: resultado.estadoAntes,
      estadoDespues: resultado.estadoDespues,
      ip: await obtenerIp(),
    });

    return { ok: true, data: resultado.data };
  };
}
