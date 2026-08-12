import { describe, expect, it } from "vitest";

import { ajustarInventarioSueltosSchema } from "@/lib/zod/inventario";

const inputBase = {
  id: crypto.randomUUID(),
  loteId: crypto.randomUUID(),
  delta: 15,
  motivo: "Conteo físico encontró unidades sueltas no registradas",
};

describe("ajustarInventarioSueltosSchema", () => {
  it("acepta un ajuste positivo válido", () => {
    expect(ajustarInventarioSueltosSchema.safeParse(inputBase).success).toBe(true);
  });

  it("acepta un ajuste negativo válido", () => {
    const resultado = ajustarInventarioSueltosSchema.safeParse({ ...inputBase, delta: -20 });

    expect(resultado.success).toBe(true);
  });

  it("rechaza delta = 0", () => {
    const resultado = ajustarInventarioSueltosSchema.safeParse({ ...inputBase, delta: 0 });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El ajuste no puede ser 0");
    }
  });

  it("rechaza delta no entero", () => {
    expect(ajustarInventarioSueltosSchema.safeParse({ ...inputBase, delta: 12.5 }).success).toBe(false);
  });

  it("rechaza un id que no tiene forma de UUID", () => {
    expect(ajustarInventarioSueltosSchema.safeParse({ ...inputBase, id: "no-es-un-uuid" }).success).toBe(
      false,
    );
  });

  it("rechaza un loteId inválido con el mensaje 'Seleccioná un lote'", () => {
    const resultado = ajustarInventarioSueltosSchema.safeParse({ ...inputBase, loteId: "" });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("Seleccioná un lote");
    }
  });

  it("rechaza un motivo de 9 caracteres (justo debajo del mínimo)", () => {
    const resultado = ajustarInventarioSueltosSchema.safeParse({ ...inputBase, motivo: "123456789" });

    expect(resultado.success).toBe(false);
  });

  it("acepta un motivo de exactamente 10 caracteres (borde inferior)", () => {
    const resultado = ajustarInventarioSueltosSchema.safeParse({ ...inputBase, motivo: "1234567890" });

    expect(resultado.success).toBe(true);
  });

  it("rechaza un motivo vacío o solo espacios (trim antes de medir)", () => {
    expect(ajustarInventarioSueltosSchema.safeParse({ ...inputBase, motivo: "" }).success).toBe(false);
    expect(
      ajustarInventarioSueltosSchema.safeParse({ ...inputBase, motivo: "          " }).success,
    ).toBe(false);
  });

  it("rechaza un motivo que excede los 500 caracteres", () => {
    const resultado = ajustarInventarioSueltosSchema.safeParse({ ...inputBase, motivo: "a".repeat(501) });

    expect(resultado.success).toBe(false);
  });
});
