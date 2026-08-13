export type OrigenConSaldo = { galponId: string; loteId: string; disponible: number };
export type PorcionOrigen = { galponId: string; loteId: string; cantidad: number };

export type ResultadoConsolidacion = {
  unidades: PorcionOrigen[][]; // cada elemento interno suma EXACTO unidadDestino
  totalConsolidado: number; // unidades.length * unidadDestino
};

// Función pura, sin Prisma — recibe los orígenes YA en el orden en que se
// deben consumir (el orden en que el operario los seleccionó; quien llama
// decide el orden, esta función no lo infiere). Relleno secuencial:
// agota un origen antes de pasar al siguiente, en vez de repartir cada
// unidad proporcionalmente entre todos los orígenes a la vez — más simple
// de razonar y de auditar ("¿de dónde salió este paquete? — de estos dos
// orígenes, en este orden"), y determinista dado el mismo input (requisito
// para 100% de cobertura sin necesidad de mockear nada).
//
// Un mismo origen puede aparecer en más de una unidad de `unidades` si por
// sí solo alcanza para varias (decisión de negocio confirmada, ver
// specs/sprint-07-consolidacion-residuos/spec.md). La unidad que queda a
// medias al terminar de recorrer todos los orígenes se descarta — ese
// sobrante queda como sueltos sin consolidar, sigue viviendo en
// InventarioSueltos, no se toca.
export function calcularConsolidacion(
  origenes: OrigenConSaldo[],
  unidadDestino: number,
): ResultadoConsolidacion {
  const unidades: PorcionOrigen[][] = [];
  let unidadActual: PorcionOrigen[] = [];
  let acumuladoUnidadActual = 0;

  for (const origen of origenes) {
    let restante = origen.disponible;
    while (restante > 0) {
      // Invariante: acumuladoUnidadActual siempre está en [0, unidadDestino)
      // — se resetea a 0 apenas llega exacto a unidadDestino (rama de abajo)
      // — así que, con unidadDestino > 0 (siempre 180 o 30 en este
      // proyecto), `necesario` es siempre > 0 acá: no hace falta una guarda
      // defensiva contra un `tomar` que nunca puede ser <= 0.
      const necesario = unidadDestino - acumuladoUnidadActual;
      const tomar = Math.min(necesario, restante);

      unidadActual.push({ galponId: origen.galponId, loteId: origen.loteId, cantidad: tomar });
      acumuladoUnidadActual += tomar;
      restante -= tomar;

      if (acumuladoUnidadActual === unidadDestino) {
        unidades.push(unidadActual);
        unidadActual = [];
        acumuladoUnidadActual = 0;
      }
    }
  }

  return { unidades, totalConsolidado: unidades.length * unidadDestino };
}
