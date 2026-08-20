import type { EstadoGalpon } from "@prisma/client";

export type GuardResultado = { permitido: true } | { permitido: false; motivo: string };

// Guard compartida entre alta de lote y mudanza (server/actions/lote.ts) —
// ambas necesitan el mismo cálculo (estado del destino + capacidad
// resultante), así que vive una sola vez acá en vez de duplicarse en
// server/services/lote.ts.
export function puedeAlojarEnGalpon(params: {
  galponEstado: EstadoGalpon;
  capacidadMaxima: number;
  avesActualesAlojadas: number;
  avesEntrantes: number;
}): GuardResultado {
  if (params.galponEstado !== "ACTIVO") {
    return { permitido: false, motivo: "El galpón no está activo." };
  }
  const totalResultante = params.avesActualesAlojadas + params.avesEntrantes;
  if (totalResultante > params.capacidadMaxima) {
    return {
      permitido: false,
      motivo: `Supera la capacidad del galpón (${totalResultante}/${params.capacidadMaxima} aves).`,
    };
  }
  return { permitido: true };
}

export function puedeDesactivarGalpon(params: { lotesAlojados: number }): GuardResultado {
  if (params.lotesAlojados > 0) {
    return { permitido: false, motivo: "No se puede desactivar un galpón con lotes alojados." };
  }
  return { permitido: true };
}

export function puedeReducirCapacidad(params: {
  capacidadNueva: number;
  avesActualesAlojadas: number;
}): GuardResultado {
  if (params.capacidadNueva < params.avesActualesAlojadas) {
    return {
      permitido: false,
      motivo: `El galpón aloja ${params.avesActualesAlojadas} aves - no puede bajar de esa capacidad.`,
    };
  }
  return { permitido: true };
}
