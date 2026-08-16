import { describe, expect, it } from "vitest";

import { InconsistenciaOrigenesError, repartirDevolucion } from "@/server/services/rotura";

const GALPON_A = "galpon-a";
const GALPON_B = "galpon-b";
const LOTE_1 = "lote-1";
const LOTE_2 = "lote-2";

describe("repartirDevolucion", () => {
  it("origen único con loteId (Paquete PURO) — trivial 100%", () => {
    const resultado = repartirDevolucion(
      [{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 180 }],
      180,
    );

    expect(resultado).toEqual({
      porciones: [{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 180 }],
      unidadesSinLote: 0,
      unidadesDevueltas: 180,
    });
  });

  it("tres orígenes con loteId (Paquete MIXTO) — la suma cierra exacta", () => {
    const resultado = repartirDevolucion(
      [
        { galponId: GALPON_A, loteId: LOTE_1, cantidad: 60 },
        { galponId: GALPON_B, loteId: LOTE_2, cantidad: 70 },
        { galponId: GALPON_A, loteId: LOTE_2, cantidad: 50 },
      ],
      180,
    );

    expect(resultado.porciones).toEqual(
      expect.arrayContaining([
        { galponId: GALPON_A, loteId: LOTE_1, cantidad: 60 },
        { galponId: GALPON_B, loteId: LOTE_2, cantidad: 70 },
        { galponId: GALPON_A, loteId: LOTE_2, cantidad: 50 },
      ]),
    );
    expect(resultado.porciones).toHaveLength(3);
    expect(resultado.porciones.reduce((suma, p) => suma + p.cantidad, 0)).toBe(180);
    expect(resultado.unidadesSinLote).toBe(0);
    expect(resultado.unidadesDevueltas).toBe(180);
  });

  it("mismo algoritmo con totalExtraido=30 (Bandeja) — dos orígenes", () => {
    const resultado = repartirDevolucion(
      [
        { galponId: GALPON_A, loteId: LOTE_1, cantidad: 18 },
        { galponId: GALPON_B, loteId: LOTE_2, cantidad: 12 },
      ],
      30,
    );

    expect(resultado).toEqual({
      porciones: [
        { galponId: GALPON_A, loteId: LOTE_1, cantidad: 18 },
        { galponId: GALPON_B, loteId: LOTE_2, cantidad: 12 },
      ],
      unidadesSinLote: 0,
      unidadesDevueltas: 30,
    });
  });

  it("dos filas de origen con la misma clave galpón/lote se agregan en una sola porción", () => {
    const resultado = repartirDevolucion(
      [
        { galponId: GALPON_A, loteId: LOTE_1, cantidad: 100 },
        { galponId: GALPON_A, loteId: LOTE_1, cantidad: 80 },
      ],
      180,
    );

    expect(resultado).toEqual({
      porciones: [{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 180 }],
      unidadesSinLote: 0,
      unidadesDevueltas: 180,
    });
  });

  it("un origen sin loteId entre varios — queda excluido de porciones y se suma a unidadesSinLote", () => {
    const resultado = repartirDevolucion(
      [
        { galponId: GALPON_A, loteId: LOTE_1, cantidad: 120 },
        { galponId: GALPON_B, loteId: null, cantidad: 60 },
      ],
      180,
    );

    expect(resultado).toEqual({
      porciones: [{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 120 }],
      unidadesSinLote: 60,
      unidadesDevueltas: 120,
    });
  });

  it("todos los orígenes sin loteId — nada se acredita automático", () => {
    const resultado = repartirDevolucion(
      [
        { galponId: GALPON_A, loteId: null, cantidad: 100 },
        { galponId: GALPON_B, loteId: null, cantidad: 80 },
      ],
      180,
    );

    expect(resultado).toEqual({
      porciones: [],
      unidadesSinLote: 180,
      unidadesDevueltas: 0,
    });
  });

  it("lista vacía de orígenes con totalExtraido 0 — caso defensivo, no debería ocurrir en producción", () => {
    expect(repartirDevolucion([], 0)).toEqual({
      porciones: [],
      unidadesSinLote: 0,
      unidadesDevueltas: 0,
    });
  });

  it("invariante violada (la suma de orígenes no coincide con totalExtraido) lanza InconsistenciaOrigenesError", () => {
    expect(() =>
      repartirDevolucion([{ galponId: GALPON_A, loteId: LOTE_1, cantidad: 150 }], 180),
    ).toThrow(InconsistenciaOrigenesError);
  });
});
