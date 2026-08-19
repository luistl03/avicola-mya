import { VENTANA_GRACIA_MIN } from "@/lib/constants";
import type { GuardResultado } from "@/server/services/galpon";

// Mismo criterio exacto que puedeRevertirMortalidad
// (server/services/mortalidad.ts) — única diferencia real: se ancla a
// `creadoEn` (inmutable), no a `fecha` (editable sin límite de tiempo,
// ver decisión 1 en specs/sprint-12-egresos-personal/spec.md), para que
// editar la fecha de un Egreso nunca reabra ni cierre esta ventana.
// `ahora` la decide quien llama (mismo criterio que calcularEdadEnSemanas)
// para que la función siga siendo pura.
export function puedeRevertirEgreso(params: {
  revertido: boolean;
  creadoEn: Date;
  ahora: Date;
}): GuardResultado {
  if (params.revertido) {
    return { permitido: false, motivo: "Este egreso ya fue anulado." };
  }
  const minutosTranscurridos = (params.ahora.getTime() - params.creadoEn.getTime()) / 60_000;
  if (minutosTranscurridos > VENTANA_GRACIA_MIN) {
    return {
      permitido: false,
      motivo: `La ventana de ${VENTANA_GRACIA_MIN} minutos para anular este egreso ya pasó. Podés corregirlo editándolo.`,
    };
  }
  return { permitido: true };
}
