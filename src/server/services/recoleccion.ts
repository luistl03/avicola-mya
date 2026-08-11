import type { EstadoLote } from "@prisma/client";

import { UNIDADES_POR_PAQUETE } from "@/lib/constants";
import type { GuardResultado } from "@/server/services/galpon";

// Servicio puro: cantidadTotal ya llega validada como entero positivo por
// crearRecoleccionSchema (Zod, el límite de entrada real) — esta función
// no vuelve a defender ese formato, mismo criterio que
// puedeRegistrarMortalidad no revalida el formato de `cantidad`.
//
// Si cantidadTotal < UNIDADES_POR_PAQUETE, paquetes queda en 0 y todo el
// total pasa a sueltos — no se fuerza ningún paquete incompleto
// (decisión de negocio confirmada, ver spec.md).
export function calcularEmpaque(cantidadTotal: number): { paquetes: number; sueltos: number } {
  return {
    paquetes: Math.floor(cantidadTotal / UNIDADES_POR_PAQUETE),
    sueltos: cantidadTotal % UNIDADES_POR_PAQUETE,
  };
}

// Mismo criterio que puedeRegistrarMortalidad (Sprint 4): solo lotes
// ACTIVOS aceptan recolección — uno INACTIVO ya cerró su ubicación, no
// tiene sentido seguir sumándole producción.
export function puedeRegistrarRecoleccion(params: { loteEstado: EstadoLote }): GuardResultado {
  if (params.loteEstado !== "ACTIVO") {
    return { permitido: false, motivo: "Solo se puede registrar recolección de un lote activo." };
  }
  return { permitido: true };
}
