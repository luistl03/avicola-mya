import { describe, expect, it } from "vitest";

import { registrarAbonoSchema } from "@/lib/zod/credito";

const inputBase = {
  id: crypto.randomUUID(),
  creditoId: crypto.randomUUID(),
  monto: 100,
  metodoPago: "EFECTIVO",
};

describe("registrarAbonoSchema", () => {
  it("acepta un payload válido", () => {
    expect(registrarAbonoSchema.safeParse(inputBase).success).toBe(true);
  });

  it("rechaza monto cero", () => {
    expect(registrarAbonoSchema.safeParse({ ...inputBase, monto: 0 }).success).toBe(false);
  });

  it("rechaza monto negativo", () => {
    expect(registrarAbonoSchema.safeParse({ ...inputBase, monto: -1 }).success).toBe(false);
  });

  it("rechaza un id sin forma de UUID", () => {
    expect(registrarAbonoSchema.safeParse({ ...inputBase, id: "no-es-un-uuid" }).success).toBe(false);
  });

  it("rechaza un creditoId sin forma de UUID", () => {
    expect(registrarAbonoSchema.safeParse({ ...inputBase, creditoId: "no-es-un-uuid" }).success).toBe(false);
  });

  it("acepta los 4 valores reales de MetodoPago", () => {
    for (const metodoPago of ["EFECTIVO", "YAPE", "PLIN", "TRANSFERENCIA"]) {
      expect(registrarAbonoSchema.safeParse({ ...inputBase, metodoPago }).success).toBe(true);
    }
  });

  it("rechaza un método de pago fuera del enum", () => {
    expect(registrarAbonoSchema.safeParse({ ...inputBase, metodoPago: "CREDITO" }).success).toBe(false);
  });
});
