import { describe, expect, it } from "vitest";

import { crearRecoleccionSchema, revertirRecoleccionSchema } from "@/lib/zod/recoleccion";

const inputBase = {
  id: crypto.randomUUID(),
  loteId: crypto.randomUUID(),
  cantidadTotal: 470,
  creadoEnCliente: "2026-08-11T15:00:00.000Z",
  pesos: [12.5, 12.7],
};

describe("crearRecoleccionSchema", () => {
  it("acepta un input completo válido", () => {
    expect(crearRecoleccionSchema.safeParse(inputBase).success).toBe(true);
  });

  it("acepta un arreglo de pesos vacío (cantidadTotal < 180, cero paquetes)", () => {
    const resultado = crearRecoleccionSchema.safeParse({
      ...inputBase,
      cantidadTotal: 45,
      pesos: [],
    });

    expect(resultado.success).toBe(true);
  });

  it("rechaza un id que no tiene forma de UUID", () => {
    const resultado = crearRecoleccionSchema.safeParse({ ...inputBase, id: "no-es-un-uuid" });

    expect(resultado.success).toBe(false);
  });

  it("rechaza un loteId inválido con el mensaje 'Seleccioná un lote'", () => {
    const resultado = crearRecoleccionSchema.safeParse({ ...inputBase, loteId: "" });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("Seleccioná un lote");
    }
  });

  it("rechaza cantidadTotal = 0", () => {
    expect(crearRecoleccionSchema.safeParse({ ...inputBase, cantidadTotal: 0 }).success).toBe(false);
  });

  it("rechaza cantidadTotal negativo", () => {
    expect(crearRecoleccionSchema.safeParse({ ...inputBase, cantidadTotal: -10 }).success).toBe(false);
  });

  it("rechaza cantidadTotal no entero", () => {
    expect(crearRecoleccionSchema.safeParse({ ...inputBase, cantidadTotal: 12.5 }).success).toBe(false);
  });

  it("rechaza creadoEnCliente inválido", () => {
    const resultado = crearRecoleccionSchema.safeParse({
      ...inputBase,
      creadoEnCliente: "no-es-una-fecha",
    });

    expect(resultado.success).toBe(false);
  });

  it("rechaza un peso en 0 o negativo dentro del arreglo", () => {
    expect(crearRecoleccionSchema.safeParse({ ...inputBase, pesos: [12.5, 0] }).success).toBe(false);
    expect(crearRecoleccionSchema.safeParse({ ...inputBase, pesos: [-1] }).success).toBe(false);
  });

  it("rechaza un peso que excede la precisión de Paquete.peso (Decimal 6,3)", () => {
    const resultado = crearRecoleccionSchema.safeParse({ ...inputBase, pesos: [1000] });

    expect(resultado.success).toBe(false);
  });

  it("acepta un peso justo en el borde superior permitido (999.999)", () => {
    const resultado = crearRecoleccionSchema.safeParse({ ...inputBase, pesos: [999.999] });

    expect(resultado.success).toBe(true);
  });
});

describe("revertirRecoleccionSchema", () => {
  it("acepta un registroId con forma de UUID", () => {
    expect(revertirRecoleccionSchema.safeParse({ registroId: crypto.randomUUID() }).success).toBe(true);
  });

  it("rechaza un registroId sin forma de UUID", () => {
    expect(revertirRecoleccionSchema.safeParse({ registroId: "no-es-un-uuid" }).success).toBe(false);
  });

  it("rechaza si falta registroId", () => {
    expect(revertirRecoleccionSchema.safeParse({}).success).toBe(false);
  });
});
