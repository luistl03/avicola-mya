import type { EstadoLote } from "@prisma/client";

import type { GuardResultado } from "@/server/services/galpon";

// La guard de capacidad/estado del destino (puedeAlojarEnGalpon) vive en
// server/services/galpon.ts, reusada tal cual por la action de mudanza —
// acá solo lo que es específico de un lote mudándose (su propio estado y
// que el destino no sea donde ya está).
export function puedeMudarLote(params: {
  loteEstado: EstadoLote;
  galponOrigenId: string | null;
  galponDestinoId: string;
}): GuardResultado {
  if (params.loteEstado !== "ACTIVO") {
    return { permitido: false, motivo: "Solo se pueden mudar lotes activos." };
  }
  if (params.galponOrigenId === params.galponDestinoId) {
    return { permitido: false, motivo: "El lote ya está en ese galpón." };
  }
  return { permitido: true };
}

export function puedeFinalizarLote(params: { loteEstado: EstadoLote }): GuardResultado {
  if (params.loteEstado !== "ACTIVO") {
    return { permitido: false, motivo: "El lote ya está finalizado." };
  }
  return { permitido: true };
}

const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;

// Edad del lote en semanas completas (piso, no redondeo) — decisión de
// negocio confirmada por el Product Owner. NUNCA se guarda en la base:
// se recalcula siempre a partir de edadInicialSemanas + el tiempo
// transcurrido desde fechaIngreso hasta fechaReferencia, así nunca queda
// desactualizada.
//
// `fechaReferencia` la decide quien llama a esta función (no acá adentro,
// para que siga siendo pura y testeable sin mockear el reloj):
// - Lote ACTIVO: "ahora" (América/Lima, D5).
// - Lote INACTIVO: la fechaSalida de su última fila de
//   HistorialUbicacionLote (el momento exacto en que finalizarLote() la
//   cerró) — la edad mostrada queda "congelada" ahí, no sigue avanzando
//   después de que el lote deja de operarse (decisión confirmada por el
//   Product Owner).
//
// Math.max(0, ...) es una guarda defensiva, no una regla de negocio: si
// fechaReferencia llegara antes que fechaIngreso (no debería pasar en la
// práctica), evita mostrar una edad negativa.
export function calcularEdadEnSemanas(params: {
  edadInicialSemanas: number;
  fechaIngreso: Date;
  fechaReferencia: Date;
}): number {
  const semanasTranscurridas = Math.floor(
    (params.fechaReferencia.getTime() - params.fechaIngreso.getTime()) / MS_POR_SEMANA,
  );
  return params.edadInicialSemanas + Math.max(0, semanasTranscurridas);
}
