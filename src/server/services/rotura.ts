export type OrigenUnidad = { galponId: string; loteId: string | null; cantidad: number };
export type PorcionDevolucion = { galponId: string; loteId: string; cantidad: number };
export type ResultadoDevolucion = {
  porciones: PorcionDevolucion[]; // listas para acreditar al ledger — solo orígenes con loteId conocido
  unidadesSinLote: number; // suma de orígenes con loteId null — requiere ajuste manual (Ajustar Inventario)
  unidadesDevueltas: number; // totalExtraido - unidadesSinLote — lo que sí se puede acreditar automático
};

// Invariante interna: la suma de origenes.cantidad SIEMPRE debe coincidir
// con totalExtraido — así se construyen PaqueteOrigen/BandejaOrigen desde
// Sprint 5/7 (su suma siempre es exactamente 180 o 30). Si no coincide, es
// una inconsistencia de datos real (nunca debería pasar en producción), no
// un caso de negocio a tolerar en silencio.
export class InconsistenciaOrigenesError extends Error {}

// Reparto de la devolución al romper un Paquete/Bandeja — problema inverso
// de calcularConsolidacion() (Sprint 7): ahí se arman unidades desde
// sueltos, acá se devuelven sueltos desde una unidad rota. Más simple que
// calcularConsolidacion() porque este sprint siempre rompe la unidad
// COMPLETA (decisión de negocio 7, spec.md) — totalExtraido siempre
// coincide exactamente con la suma de los orígenes, así que no hay reparto
// proporcional con redondeo: cada origen recibe exactamente lo que aportó.
export function repartirDevolucion(
  origenes: OrigenUnidad[],
  totalExtraido: number,
): ResultadoDevolucion {
  const sumaOrigenes = origenes.reduce((suma, origen) => suma + origen.cantidad, 0);
  if (sumaOrigenes !== totalExtraido) {
    throw new InconsistenciaOrigenesError(
      `Los orígenes suman ${sumaOrigenes}, se esperaba ${totalExtraido}`,
    );
  }

  // Agregar por clave ANTES de devolver — mismo criterio que
  // consolidarSueltos (Sprint 7): si dos filas de origen comparten
  // galpón/lote, se acredita la suma en una sola porción, no dos entradas
  // separadas al ledger.
  const porcionesPorClave = new Map<string, PorcionDevolucion>();
  let unidadesSinLote = 0;

  for (const origen of origenes) {
    if (origen.loteId === null) {
      unidadesSinLote += origen.cantidad;
      continue;
    }
    const clave = `${origen.galponId}:${origen.loteId}`;
    const previa = porcionesPorClave.get(clave);
    porcionesPorClave.set(clave, {
      galponId: origen.galponId,
      loteId: origen.loteId,
      cantidad: (previa?.cantidad ?? 0) + origen.cantidad,
    });
  }

  return {
    porciones: [...porcionesPorClave.values()],
    unidadesSinLote,
    unidadesDevueltas: totalExtraido - unidadesSinLote,
  };
}
