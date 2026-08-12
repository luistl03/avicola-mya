import type { TipoMovimientoSueltos } from "@prisma/client";

type ClasificacionMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE";

// Clasificación EXHAUSTIVA de cada tipo de MovimientoSueltos para
// reconstruirSaldo(), vía Record<TipoMovimientoSueltos, ...> en vez de la
// cadena de if/arrays de Sprint 5 — TypeScript exige que las 6 claves del
// enum aparezcan todas acá; agregar un tipo nuevo al enum sin clasificarlo
// es un error de compilación, no una rama silenciosa sin cubrir en
// producción (ni un fallback sin test real, que es lo que tenía la
// versión anterior una vez que Sprint 6 terminó de clasificar los 6
// tipos — ver git history si hace falta el porqué del cambio).
//
// REVERSION (resuelto en Sprint 6): siempre deshace un MovimientoSueltos
// RECOLECCION anterior — server/repositories/recoleccion.ts
// (revertirRecoleccion) lo crea con la misma cantidad que el sueltos
// original (recalculada vía calcularEmpaque, no leída por referenciaId),
// así que acá alcanza con clasificarlo como SALIDA, sin necesidad de
// mirar qué movimiento referencia.
//
// AJUSTE_GERENTE (resuelto en Sprint 6): es el único MovimientoSueltos
// cuyo `cantidad` NO es siempre positivo — server/repositories/inventario.ts
// (ajustarInventarioSueltos) lo guarda con el signo real del delta que
// eligió el Gerente (positivo compensa un faltante, negativo corrige un
// excedente), así que se suma directo al saldo (mismo signo que ENTRADA,
// clasificación separada solo para que el comentario de arriba quede
// explícito). Cualquier código futuro que lea MovimientoSueltos.cantidad
// asumiendo que siempre es positivo tiene que tratar este tipo aparte.
const CLASIFICACION: Record<TipoMovimientoSueltos, ClasificacionMovimiento> = {
  RECOLECCION: "ENTRADA",
  ROTURA_PAQUETE_ENTRADA: "ENTRADA",
  CONSOLIDACION_SALIDA: "SALIDA",
  VENTA_SUELTO: "SALIDA",
  REVERSION: "SALIDA",
  AJUSTE_GERENTE: "AJUSTE",
};

export function reconstruirSaldo(movimientos: { tipo: TipoMovimientoSueltos; cantidad: number }[]): number {
  return movimientos.reduce((saldo, movimiento) => {
    if (CLASIFICACION[movimiento.tipo] === "SALIDA") return saldo - movimiento.cantidad;
    return saldo + movimiento.cantidad; // ENTRADA y AJUSTE: AJUSTE ya trae su signo real
  }, 0);
}
