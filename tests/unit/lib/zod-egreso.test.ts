import { afterEach, describe, expect, it, vi } from "vitest";

import { crearEgresoSchema, editarEgresoSchema, revertirEgresoSchema } from "@/lib/zod/egreso";

const inputValido = {
  id: crypto.randomUUID(),
  categoria: "ALIMENTOS",
  monto: 150.5,
  descripcion: "Bolsas de alimento balanceado",
  fecha: "2026-03-10",
};

describe("crearEgresoSchema", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("acepta un payload válido", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));

    const resultado = crearEgresoSchema.safeParse(inputValido);

    expect(resultado.success).toBe(true);
  });

  it("rechaza un monto cero", () => {
    const resultado = crearEgresoSchema.safeParse({ ...inputValido, monto: 0 });

    expect(resultado.success).toBe(false);
  });

  it("rechaza un monto negativo", () => {
    const resultado = crearEgresoSchema.safeParse({ ...inputValido, monto: -50 });

    expect(resultado.success).toBe(false);
  });

  it("rechaza una descripción vacía", () => {
    const resultado = crearEgresoSchema.safeParse({ ...inputValido, descripcion: "  " });

    expect(resultado.success).toBe(false);
  });

  it("rechaza una categoría fuera de los 5 valores reales", () => {
    const resultado = crearEgresoSchema.safeParse({ ...inputValido, categoria: "OTRA" });

    expect(resultado.success).toBe(false);
  });

  it("acepta la fecha de hoy exacto (América/Lima)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z")); // 10:00 en Lima, mismo día

    const resultado = crearEgresoSchema.safeParse({ ...inputValido, fecha: "2026-03-15" });

    expect(resultado.success).toBe(true);
  });

  it("rechaza una fecha futura con el mensaje esperado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));

    const resultado = crearEgresoSchema.safeParse({ ...inputValido, fecha: "2026-03-16" });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("La fecha no puede ser futura.");
    }
  });

  it("rechaza un id con formato inválido", () => {
    const resultado = crearEgresoSchema.safeParse({ ...inputValido, id: "no-es-un-uuid" });

    expect(resultado.success).toBe(false);
  });
});

describe("editarEgresoSchema", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("acepta el mismo payload que crear (mismos campos, decisión 1: sin límite de tiempo)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));

    const resultado = editarEgresoSchema.safeParse(inputValido);

    expect(resultado.success).toBe(true);
  });

  it("rechaza una fecha futura, mismo criterio que crear", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));

    const resultado = editarEgresoSchema.safeParse({ ...inputValido, fecha: "2026-03-16" });

    expect(resultado.success).toBe(false);
  });
});

describe("revertirEgresoSchema", () => {
  it("acepta un id válido", () => {
    const resultado = revertirEgresoSchema.safeParse({ id: crypto.randomUUID() });

    expect(resultado.success).toBe(true);
  });

  it("rechaza un id con formato inválido", () => {
    const resultado = revertirEgresoSchema.safeParse({ id: "no-es-un-uuid" });

    expect(resultado.success).toBe(false);
  });
});
