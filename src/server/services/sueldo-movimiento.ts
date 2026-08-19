import type { TipoSueldoMovimiento } from "@prisma/client";

import { VENTANA_GRACIA_MIN } from "@/lib/constants";
import type { GuardResultado } from "@/server/services/galpon";

// Idéntica a puedeRevertirMortalidad — SueldoMovimiento.fecha es
// inmutable (sin edición, decisión 2 de spec.md), así que sirve de ancla
// directa sin el problema que sí tiene Egreso.creadoEn/fecha (ver
// server/services/egreso.ts).
export function puedeRevertirSueldoMovimiento(params: {
  revertido: boolean;
  fecha: Date;
  ahora: Date;
}): GuardResultado {
  if (params.revertido) {
    return { permitido: false, motivo: "Este movimiento ya fue revertido." };
  }
  const minutosTranscurridos = (params.ahora.getTime() - params.fecha.getTime()) / 60_000;
  if (minutosTranscurridos > VENTANA_GRACIA_MIN) {
    return {
      permitido: false,
      motivo: `La ventana de ${VENTANA_GRACIA_MIN} minutos para deshacer este movimiento ya pasó.`,
    };
  }
  return { permitido: true };
}

// Rango [desde, hasta) de un mes calendario completo en América/Lima
// (D5), mismo criterio de fecha-calendario que Credito.fechaLimite —
// `desde` es el día 1 a medianoche, `hasta` es el primer instante del
// mes siguiente (límite EXCLUSIVO: quien llama filtra con `fecha: {
// gte: desde, lt: hasta }`, nunca `lte`, para no depender de dónde cae
// exactamente el último instante del mes).
export function calcularRangoMesCalendario(mes: number, anio: number): { desde: Date; hasta: Date } {
  const desde = new Date(Date.UTC(anio, mes - 1, 1));
  const hasta = new Date(Date.UTC(mes === 12 ? anio + 1 : anio, mes === 12 ? 0 : mes, 1));
  return { desde, hasta };
}

export type DesgloseNetoMensual = {
  sueldoBase: number;
  bonos: number;
  adelantos: number;
  descuentos: number;
  neto: number;
};

// Signo por tipo: SUELDO_BASE y BONO suman, ADELANTO y DESCUENTO restan
// — "neto" es literalmente lo que le queda por cobrar al empleado ese
// mes. Recibe movimientos YA filtrados (no revertidos, dentro del rango
// del mes) — esta función no conoce Prisma ni decide qué traer, solo
// suma (ADR-000, server/services/ nunca toca la base).
export function calcularNetoMensual(
  movimientos: { tipo: TipoSueldoMovimiento; monto: number }[],
): DesgloseNetoMensual {
  const sumaPorTipo = (tipo: TipoSueldoMovimiento) =>
    movimientos.filter((m) => m.tipo === tipo).reduce((acc, m) => acc + m.monto, 0);

  const sueldoBase = sumaPorTipo("SUELDO_BASE");
  const bonos = sumaPorTipo("BONO");
  const adelantos = sumaPorTipo("ADELANTO");
  const descuentos = sumaPorTipo("DESCUENTO");

  return {
    sueldoBase,
    bonos,
    adelantos,
    descuentos,
    neto: sueldoBase + bonos - adelantos - descuentos,
  };
}
