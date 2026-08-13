import { describe, expect, it } from "vitest";

import { calcularConsolidacion } from "@/server/services/consolidacion";

const GALPON_A = "galpon-a";
const GALPON_B = "galpon-b";
const LOTE_1 = "lote-1";
const LOTE_2 = "lote-2";

describe("calcularConsolidacion", () => {
  it("devuelve unidades vacías sin ningún origen", () => {
    expect(calcularConsolidacion([], 180)).toEqual({ unidades: [], totalConsolidado: 0 });
  });

  it("un origen único múltiplo exacto de unidadDestino forma unidades completas, sin sobrante", () => {
    const resultado = calcularConsolidacion(
      [{ galponId: GALPON_A, loteId: LOTE_1, disponible: 360 }],
      180,
    );

    expect(resultado).toEqual({
      unidades: [
        [{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 180 }],
        [{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 180 }],
      ],
      totalConsolidado: 360,
    });
  });

  it("un origen único con sobrante forma las unidades completas posibles y descarta el resto (no llega a la siguiente)", () => {
    const resultado = calcularConsolidacion(
      [{ galponId: GALPON_A, loteId: LOTE_1, disponible: 400 }],
      180,
    );

    expect(resultado.unidades).toHaveLength(2);
    expect(resultado.totalConsolidado).toBe(360); // 400 = 180 + 180 + 40 sobrante, descartado
  });

  it("dos orígenes donde el segundo completa la unidad que el primero dejó a medias", () => {
    const resultado = calcularConsolidacion(
      [
        { galponId: GALPON_A, loteId: LOTE_1, disponible: 120 },
        { galponId: GALPON_B, loteId: LOTE_2, disponible: 90 },
      ],
      180,
    );

    expect(resultado).toEqual({
      unidades: [
        [
          { galponId: GALPON_A, loteId: LOTE_1, cantidad: 120 },
          { galponId: GALPON_B, loteId: LOTE_2, cantidad: 60 },
        ],
      ],
      totalConsolidado: 180,
    });
    // 30 del segundo origen quedan sin consolidar (90 - 60), no aparecen
    // en ninguna unidad.
  });

  it("un origen con disponible 0 no aporta nada — se salta sin romper el reparto de los siguientes", () => {
    const resultado = calcularConsolidacion(
      [
        { galponId: GALPON_A, loteId: LOTE_1, disponible: 0 },
        { galponId: GALPON_B, loteId: LOTE_2, disponible: 180 },
      ],
      180,
    );

    expect(resultado).toEqual({
      unidades: [[{ galponId: GALPON_B, loteId: LOTE_2, cantidad: 180 }]],
      totalConsolidado: 180,
    });
  });

  it("orígenes cuyo total combinado no llega a unidadDestino no forman ninguna unidad", () => {
    const resultado = calcularConsolidacion(
      [
        { galponId: GALPON_A, loteId: LOTE_1, disponible: 50 },
        { galponId: GALPON_B, loteId: LOTE_2, disponible: 40 },
      ],
      180,
    );

    expect(resultado).toEqual({ unidades: [], totalConsolidado: 0 });
  });

  it("un origen que por sí solo alcanza para varias unidades aparece repetido en unidades", () => {
    const resultado = calcularConsolidacion(
      [{ galponId: GALPON_A, loteId: LOTE_1, disponible: 500 }],
      180,
    );

    expect(resultado.unidades).toHaveLength(2); // 500 = 180 + 180 + 140 sobrante
    expect(resultado.unidades[0]).toEqual([{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 180 }]);
    expect(resultado.unidades[1]).toEqual([{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 180 }]);
    expect(resultado.totalConsolidado).toBe(360);
  });

  it("distinto lote del mismo galpón se trata como un origen separado — no se mezcla su saldo", () => {
    const resultado = calcularConsolidacion(
      [
        { galponId: GALPON_A, loteId: LOTE_1, disponible: 100 },
        { galponId: GALPON_A, loteId: LOTE_2, disponible: 100 },
      ],
      180,
    );

    expect(resultado).toEqual({
      unidades: [
        [
          { galponId: GALPON_A, loteId: LOTE_1, cantidad: 100 },
          { galponId: GALPON_A, loteId: LOTE_2, cantidad: 80 },
        ],
      ],
      totalConsolidado: 180,
    });
  });

  it("la misma lista de orígenes con unidadDestino=30 (Bandeja) da un resultado distinto al de 180 (Paquete Mixto)", () => {
    const origenes = [{ galponId: GALPON_A, loteId: LOTE_1, disponible: 75 }];

    const resultadoBandeja = calcularConsolidacion(origenes, 30);
    const resultadoPaquete = calcularConsolidacion(origenes, 180);

    expect(resultadoBandeja).toEqual({
      unidades: [
        [{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 30 }],
        [{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 30 }],
      ],
      totalConsolidado: 60, // 75 = 30 + 30 + 15 sobrante
    });
    expect(resultadoPaquete).toEqual({ unidades: [], totalConsolidado: 0 }); // 75 < 180
  });
});
