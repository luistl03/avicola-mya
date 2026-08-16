import { describe, expect, it } from "vitest";

import { romperBandejaSchema, romperPaqueteSchema } from "@/lib/zod/rotura";

describe("romperPaqueteSchema", () => {
  const inputBase = { paqueteId: crypto.randomUUID(), pesoExtraido: 11.25 };

  it("acepta un payload válido", () => {
    expect(romperPaqueteSchema.safeParse(inputBase).success).toBe(true);
  });

  it("rechaza pesoExtraido cero", () => {
    expect(romperPaqueteSchema.safeParse({ ...inputBase, pesoExtraido: 0 }).success).toBe(false);
  });

  it("rechaza pesoExtraido negativo", () => {
    expect(romperPaqueteSchema.safeParse({ ...inputBase, pesoExtraido: -1 }).success).toBe(false);
  });

  it("rechaza pesoExtraido fuera de rango", () => {
    expect(romperPaqueteSchema.safeParse({ ...inputBase, pesoExtraido: 1000 }).success).toBe(false);
  });

  it("rechaza un paqueteId sin forma de UUID", () => {
    expect(romperPaqueteSchema.safeParse({ ...inputBase, paqueteId: "no-es-un-uuid" }).success).toBe(false);
  });
});

describe("romperBandejaSchema", () => {
  const inputBase = { bandejaId: crypto.randomUUID(), pesoExtraido: 1.9 };

  it("acepta un payload válido", () => {
    expect(romperBandejaSchema.safeParse(inputBase).success).toBe(true);
  });

  it("rechaza pesoExtraido cero", () => {
    expect(romperBandejaSchema.safeParse({ ...inputBase, pesoExtraido: 0 }).success).toBe(false);
  });

  it("rechaza pesoExtraido negativo", () => {
    expect(romperBandejaSchema.safeParse({ ...inputBase, pesoExtraido: -1 }).success).toBe(false);
  });

  it("rechaza pesoExtraido fuera de rango", () => {
    expect(romperBandejaSchema.safeParse({ ...inputBase, pesoExtraido: 1000 }).success).toBe(false);
  });

  it("rechaza un bandejaId sin forma de UUID", () => {
    expect(romperBandejaSchema.safeParse({ ...inputBase, bandejaId: "no-es-un-uuid" }).success).toBe(false);
  });
});
