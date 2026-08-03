import type { Rol } from "@prisma/client";

export type GuardResultado = { permitido: true } | { permitido: false; motivo: string };

// Orden importa: el chequeo de "último Gerente" va ANTES que el de
// autodesactivación. Quien invoca esta action ya tiene que ser un Gerente
// ACTIVO (lo exige withAuth + el login rechaza estado != ACTIVO), así que
// cuando objetivo != actual, totalGerentesActivos cuenta a ambos y nunca
// puede ser <= 1 — el único caso real en que "último Gerente" aplica es
// cuando el propio Gerente, siendo el único activo, intenta desactivarse
// a sí mismo. Si el chequeo de autodesactivación fuera primero, ese caso
// mostraría el mensaje genérico en vez de explicar la razón real.
export function puedeDesactivarUsuario(params: {
  usuarioObjetivoId: string;
  usuarioActualId: string;
  usuarioObjetivoRol: Rol;
  totalGerentesActivos: number;
}): GuardResultado {
  if (params.usuarioObjetivoRol === "GERENTE" && params.totalGerentesActivos <= 1) {
    return { permitido: false, motivo: "Debe quedar al menos un Gerente activo." };
  }
  if (params.usuarioObjetivoId === params.usuarioActualId) {
    return { permitido: false, motivo: "No podés desactivar tu propio usuario." };
  }
  return { permitido: true };
}
