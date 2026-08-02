"use server";

import { auth } from "@/server/auth";
import { actualizarUltimaActividad } from "@/server/repositories/sesion";

export async function registrarActividad() {
  const session = await auth();
  if (!session?.sesionId) return;

  await actualizarUltimaActividad(session.sesionId, new Date());
}
