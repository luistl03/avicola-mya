"use server";

import { eliminarSuscripcionPushSchema, suscribirPushSchema } from "@/lib/zod/pushSubscription";
import { withAuth } from "@/server/auth/with-auth";
import {
  crearOActualizarSuscripcionPush,
  eliminarSuscripcionPushDeUsuario,
} from "@/server/repositories/pushSubscription";

// H1 — exclusiva GERENTE (decisión de negocio 6, spec.md): aunque
// /creditos sigue abierta a ambos roles, solo un Gerente puede
// suscribirse a los avisos de créditos vencidos. Upsert por endpoint ya
// resuelve el reintento (doble clic en "Activar") sin necesitar id de
// cliente aparte.
export const suscribirPush = withAuth(
  { schema: suscribirPushSchema, rol: "GERENTE", entidad: "PushSubscription", accion: "SUSCRIBIR" },
  async (input, { usuarioId }) => {
    const suscripcion = await crearOActualizarSuscripcionPush(usuarioId, input);
    return { data: { id: suscripcion.id }, entidadId: suscripcion.id };
  },
);

export const eliminarSuscripcionPush = withAuth(
  { schema: eliminarSuscripcionPushSchema, rol: "GERENTE", entidad: "PushSubscription", accion: "ELIMINAR" },
  async (input, { usuarioId }) => {
    await eliminarSuscripcionPushDeUsuario(usuarioId, input.endpoint);
    return { data: null, entidadId: input.endpoint };
  },
);
