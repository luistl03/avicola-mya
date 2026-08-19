import { describe, expect, it } from "vitest";

import {
  crearSueldoMovimientoSchema,
  revertirSueldoMovimientoSchema,
} from "@/lib/zod/sueldo-movimiento";

const inputValido = {
  id: crypto.randomUUID(),
  empleadoId: crypto.randomUUID(),
  tipo: "ADELANTO",
  monto: 100,
};

describe("crearSueldoMovimientoSchema", () => {
  it("acepta un payload válido sin descripción", () => {
    const resultado = crearSueldoMovimientoSchema.safeParse(inputValido);

    expect(resultado.success).toBe(true);
  });

  it("acepta un payload válido con descripción", () => {
    const resultado = crearSueldoMovimientoSchema.safeParse({
      ...inputValido,
      descripcion: "Adelanto de quincena",
    });

    expect(resultado.success).toBe(true);
  });

  it("normaliza descripción con string vacío a undefined, sin error", () => {
    const resultado = crearSueldoMovimientoSchema.safeParse({ ...inputValido, descripcion: "" });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.descripcion).toBeUndefined();
    }
  });

  it("rechaza un monto cero", () => {
    const resultado = crearSueldoMovimientoSchema.safeParse({ ...inputValido, monto: 0 });

    expect(resultado.success).toBe(false);
  });

  it("rechaza un monto negativo", () => {
    const resultado = crearSueldoMovimientoSchema.safeParse({ ...inputValido, monto: -10 });

    expect(resultado.success).toBe(false);
  });

  it("rechaza un tipo fuera de los 4 valores reales", () => {
    const resultado = crearSueldoMovimientoSchema.safeParse({ ...inputValido, tipo: "PREMIO" });

    expect(resultado.success).toBe(false);
  });

  it("acepta cada uno de los 4 tipos reales", () => {
    for (const tipo of ["SUELDO_BASE", "ADELANTO", "BONO", "DESCUENTO"]) {
      const resultado = crearSueldoMovimientoSchema.safeParse({ ...inputValido, tipo });
      expect(resultado.success).toBe(true);
    }
  });

  it("rechaza un empleadoId con formato inválido", () => {
    const resultado = crearSueldoMovimientoSchema.safeParse({
      ...inputValido,
      empleadoId: "no-es-un-uuid",
    });

    expect(resultado.success).toBe(false);
  });

  it("rechaza un id con formato inválido", () => {
    const resultado = crearSueldoMovimientoSchema.safeParse({ ...inputValido, id: "no-es-un-uuid" });

    expect(resultado.success).toBe(false);
  });
});

describe("revertirSueldoMovimientoSchema", () => {
  it("acepta un id válido", () => {
    const resultado = revertirSueldoMovimientoSchema.safeParse({ id: crypto.randomUUID() });

    expect(resultado.success).toBe(true);
  });

  it("rechaza un id con formato inválido", () => {
    const resultado = revertirSueldoMovimientoSchema.safeParse({ id: "no-es-un-uuid" });

    expect(resultado.success).toBe(false);
  });
});
