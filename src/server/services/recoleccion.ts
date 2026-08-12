import type { EstadoLote } from "@prisma/client";

import { UNIDADES_POR_PAQUETE, VENTANA_GRACIA_MIN } from "@/lib/constants";
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

// Ventana de gracia de 10 minutos (Sprint 6, mismo criterio que
// puedeRevertirMortalidad — VENTANA_GRACIA_MIN ahora compartida entre los
// dos módulos). Guard de aplicación: da el mensaje rápido y preciso en el
// caso común. El backstop real contra una carrera (un Paquete que pasa a
// VENDIDO/ROTO justo entre esta lectura y la transacción, o dos
// reversiones casi simultáneas del mismo registro) vive en el UPDATE/
// updateMany condicional de server/repositories/recoleccion.ts
// (revertirRecoleccion), no acá — esta función no toca la base de datos.
//
// Orden de los tres chequeos, a propósito: "ya revertido" primero (el
// mensaje más específico — no tiene sentido evaluar elegibilidad de un
// registro que de todos modos ya está revertido); elegibilidad antes que
// ventana, porque un paquete ya vendido es un motivo más permanente que
// "se te pasó el tiempo" (que suena a que todavía había margen).
//
// `paquetesNoDisponibles` lo cuenta quien llama (la Server Action, sobre
// los paquetes del registro ya leídos para la respuesta) — este service
// sigue sin importar Prisma.
export function puedeRevertirRecoleccion(params: {
  revertido: boolean;
  creadoEn: Date;
  ahora: Date;
  paquetesNoDisponibles: number;
}): GuardResultado {
  if (params.revertido) {
    return { permitido: false, motivo: "Este registro ya fue revertido." };
  }
  if (params.paquetesNoDisponibles > 0) {
    return {
      permitido: false,
      motivo:
        "Ya se vendió o rompió al menos un paquete de este registro — no se puede corregir automáticamente.",
    };
  }
  const minutosTranscurridos = (params.ahora.getTime() - params.creadoEn.getTime()) / 60_000;
  if (minutosTranscurridos > VENTANA_GRACIA_MIN) {
    return {
      permitido: false,
      motivo: `La ventana de ${VENTANA_GRACIA_MIN} minutos para deshacer este registro ya pasó.`,
    };
  }
  return { permitido: true };
}
