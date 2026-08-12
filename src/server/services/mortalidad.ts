import type { EstadoLote } from "@prisma/client";

import { VENTANA_GRACIA_MIN } from "@/lib/constants";
import type { GuardResultado } from "@/server/services/galpon";

// Guard de aplicación: da el mensaje rápido y preciso ("solo quedan N
// aves") en el caso común. El backstop real contra una carrera (dos
// registros simultáneos que individualmente pasan esta guard pero juntos
// superan avesVivas) vive en el UPDATE condicional de
// server/repositories/mortalidad.ts (registrarMortalidadYDescontarAves),
// no acá — esta función no toca la base de datos.
//
// cantidad == avesVivas (deja el lote en 0) está permitido a propósito:
// Sprint 3 ya decidió que avesVivas puede ser cualquier valor ≥0.
export function puedeRegistrarMortalidad(params: {
  loteEstado: EstadoLote;
  avesVivas: number;
  cantidad: number;
}): GuardResultado {
  if (params.loteEstado !== "ACTIVO") {
    return { permitido: false, motivo: "Solo se puede registrar mortalidad de un lote activo." };
  }
  if (params.cantidad > params.avesVivas) {
    return {
      permitido: false,
      motivo: `Solo quedan ${params.avesVivas} aves vivas en este lote.`,
    };
  }
  return { permitido: true };
}

// Ventana de gracia de 10 minutos (post-Sprint 4, adelanta el patrón que
// el roadmap ya define para Recolección en Sprint 6): pasado ese plazo,
// el registro queda fijo — no hay ajuste manual del Gerente todavía, eso
// queda fuera de este alcance (ver spec de la ronda de correcciones).
// `ahora` la decide quien llama (mismo criterio que calcularEdadEnSemanas
// en server/services/lote.ts) para que la función siga siendo pura.
export function puedeRevertirMortalidad(params: {
  revertido: boolean;
  fecha: Date;
  ahora: Date;
}): GuardResultado {
  if (params.revertido) {
    return { permitido: false, motivo: "Este registro ya fue revertido." };
  }
  const minutosTranscurridos = (params.ahora.getTime() - params.fecha.getTime()) / 60_000;
  if (minutosTranscurridos > VENTANA_GRACIA_MIN) {
    return {
      permitido: false,
      motivo: `La ventana de ${VENTANA_GRACIA_MIN} minutos para deshacer este registro ya pasó.`,
    };
  }
  return { permitido: true };
}
