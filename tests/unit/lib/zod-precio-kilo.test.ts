import { describe, expect, it } from "vitest";

import { crearPrecioKiloSchema } from "@/lib/zod/precioKilo";

const inputBase = { id: crypto.randomUUID(), precio: 9.5 };

describe("crearPrecioKiloSchema", () => {
  it("acepta un payload válido", () => {
    expect(crearPrecioKiloSchema.safeParse(inputBase).success).toBe(true);
  });

  it("rechaza precio 0", () => {
    const resultado = crearPrecioKiloSchema.safeParse({ ...inputBase, precio: 0 });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El precio debe ser mayor a 0");
    }
  });

  it("rechaza precio negativo", () => {
    expect(crearPrecioKiloSchema.safeParse({ ...inputBase, precio: -5 }).success).toBe(false);
  });

  it("acepta el máximo real de Decimal(10,2) — 99999999.99", () => {
    expect(crearPrecioKiloSchema.safeParse({ ...inputBase, precio: 99_999_999.99 }).success).toBe(true);
  });

  it("rechaza un precio que excede el rango de Decimal(10,2)", () => {
    const resultado = crearPrecioKiloSchema.safeParse({ ...inputBase, precio: 100_000_000 });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("Precio fuera de rango");
    }
  });

  it("rechaza un id sin forma de UUID", () => {
    expect(crearPrecioKiloSchema.safeParse({ ...inputBase, id: "no-es-un-uuid" }).success).toBe(false);
  });
});
