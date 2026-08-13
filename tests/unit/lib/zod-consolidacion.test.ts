import { describe, expect, it } from "vitest";

import { consolidarSueltosSchema } from "@/lib/zod/consolidacion";

const GALPON_A = crypto.randomUUID();
const GALPON_B = crypto.randomUUID();
const LOTE_1 = crypto.randomUUID();
const LOTE_2 = crypto.randomUUID();

const inputBase = {
  id: crypto.randomUUID(),
  origenes: [{ galponId: GALPON_A, loteId: LOTE_1 }],
  creadoEnCliente: new Date(),
  pesos: [3.5],
};

describe("consolidarSueltosSchema", () => {
  it("acepta un payload válido con un solo origen", () => {
    expect(consolidarSueltosSchema.safeParse(inputBase).success).toBe(true);
  });

  it("acepta un payload válido con múltiples orígenes y múltiples pesos", () => {
    const resultado = consolidarSueltosSchema.safeParse({
      ...inputBase,
      origenes: [
        { galponId: GALPON_A, loteId: LOTE_1 },
        { galponId: GALPON_B, loteId: LOTE_2 },
      ],
      pesos: [3.2, 3.4],
    });

    expect(resultado.success).toBe(true);
  });

  it("rechaza un id que no tiene forma de UUID", () => {
    expect(consolidarSueltosSchema.safeParse({ ...inputBase, id: "no-es-un-uuid" }).success).toBe(false);
  });

  it("rechaza orígenes vacío", () => {
    const resultado = consolidarSueltosSchema.safeParse({ ...inputBase, origenes: [] });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("Seleccioná al menos un origen");
    }
  });

  it("rechaza un galponId inválido dentro de origenes, con el mensaje 'Galpón inválido'", () => {
    const resultado = consolidarSueltosSchema.safeParse({
      ...inputBase,
      origenes: [{ galponId: "no-es-un-uuid", loteId: LOTE_1 }],
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.message === "Galpón inválido")).toBe(true);
    }
  });

  it("rechaza un loteId inválido dentro de origenes, con el mensaje 'Lote inválido'", () => {
    const resultado = consolidarSueltosSchema.safeParse({
      ...inputBase,
      origenes: [{ galponId: GALPON_A, loteId: "" }],
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.message === "Lote inválido")).toBe(true);
    }
  });

  it("rechaza el mismo galpón/lote repetido dos veces como origen", () => {
    const resultado = consolidarSueltosSchema.safeParse({
      ...inputBase,
      origenes: [
        { galponId: GALPON_A, loteId: LOTE_1 },
        { galponId: GALPON_A, loteId: LOTE_1 },
      ],
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("No repitas el mismo galpón/lote como origen");
    }
  });

  it("acepta el mismo galpón con distinto lote como dos orígenes separados (no es un duplicado real)", () => {
    const resultado = consolidarSueltosSchema.safeParse({
      ...inputBase,
      origenes: [
        { galponId: GALPON_A, loteId: LOTE_1 },
        { galponId: GALPON_A, loteId: LOTE_2 },
      ],
      pesos: [3.5, 3.6],
    });

    expect(resultado.success).toBe(true);
  });

  it("rechaza creadoEnCliente inválido", () => {
    expect(
      consolidarSueltosSchema.safeParse({ ...inputBase, creadoEnCliente: "no-es-una-fecha" }).success,
    ).toBe(false);
  });

  it("rechaza pesos vacío", () => {
    const resultado = consolidarSueltosSchema.safeParse({ ...inputBase, pesos: [] });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("Debe formarse al menos una unidad");
    }
  });

  it("rechaza un peso ≤0", () => {
    expect(consolidarSueltosSchema.safeParse({ ...inputBase, pesos: [0] }).success).toBe(false);
    expect(consolidarSueltosSchema.safeParse({ ...inputBase, pesos: [-1] }).success).toBe(false);
  });

  it("rechaza un peso que excede 999.999", () => {
    expect(consolidarSueltosSchema.safeParse({ ...inputBase, pesos: [1000] }).success).toBe(false);
  });
});
