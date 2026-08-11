import type { TipoMovimientoSueltos } from "@prisma/client";

// Clasificación de cada tipo de MovimientoSueltos para reconstruirSaldo().
// Los tipos que Sprint 5 todavía no escribe (CONSOLIDACION_SALIDA,
// ROTURA_PAQUETE_ENTRADA, VENTA_SUELTO) ya quedan clasificados acá para
// que Sprint 7/9/10 no tengan que tocar esta función — solo empezar a
// generar esos movimientos.
const TIPOS_ENTRADA: readonly TipoMovimientoSueltos[] = ["RECOLECCION", "ROTURA_PAQUETE_ENTRADA", "AJUSTE_GERENTE"];
const TIPOS_SALIDA: readonly TipoMovimientoSueltos[] = ["CONSOLIDACION_SALIDA", "VENTA_SUELTO"];

// AJUSTE_GERENTE (el "ajuste manual pasado el plazo" que el roadmap de
// Sprint 6 le da al Gerente) se clasifica como entrada por ahora. Si en la
// práctica también necesita restar (corregir un exceso, no solo un
// faltante), Sprint 6 tiene que resolver el signo explícito antes de reusar
// esta función tal cual — no asumido de más acá.
//
// REVERSION no suma ni resta directamente: invierte el movimiento que
// referencia vía `referenciaId`, no tiene un signo propio fijo — queda sin
// caso de prueba real en este sprint (ningún RegistroRecoleccion se
// revierte todavía, eso es Sprint 6), así que por ahora no mueve el saldo.
export function reconstruirSaldo(movimientos: { tipo: TipoMovimientoSueltos; cantidad: number }[]): number {
  return movimientos.reduce((saldo, movimiento) => {
    if (TIPOS_ENTRADA.includes(movimiento.tipo)) return saldo + movimiento.cantidad;
    if (TIPOS_SALIDA.includes(movimiento.tipo)) return saldo - movimiento.cantidad;
    return saldo;
  }, 0);
}
