import { afterEach, describe, expect, it, vi } from "vitest";

import { crearLoteSchema } from "@/lib/zod/lote";

const inputBase = {
  codigo: "LOTE-001",
  avesIniciales: 200,
  edadInicialSemanas: 0,
  galponId: crypto.randomUUID(),
};

describe("crearLoteSchema — fechaIngreso no puede ser futura (América/Lima, D5)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("acepta el día de hoy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z")); // 10:00 en Lima, mismo día

    const resultado = crearLoteSchema.safeParse({ ...inputBase, fechaIngreso: "2026-03-15" });

    expect(resultado.success).toBe(true);
  });

  it("acepta una fecha pasada", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));

    const resultado = crearLoteSchema.safeParse({ ...inputBase, fechaIngreso: "2026-01-01" });

    expect(resultado.success).toBe(true);
  });

  it("rechaza una fecha futura con el mensaje esperado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));

    const resultado = crearLoteSchema.safeParse({ ...inputBase, fechaIngreso: "2026-03-16" });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("La fecha de ingreso no puede ser futura.");
    }
  });

  // Caso límite real: el reloj del servidor (UTC) puede haber cruzado la
  // medianoche mientras en Lima (UTC-5) todavía es "ayer". Sin calcular
  // "hoy" en América/Lima, comparar contra `new Date()` crudo rechazaría
  // por error una fecha que en Lima sigue siendo hoy.
  it("no rechaza por error una fecha que en UTC ya es 'mañana' pero en Lima sigue siendo hoy", () => {
    vi.useFakeTimers();
    // 02:00 UTC del día 15 = 21:00 del día 14 en Lima (UTC-5) — "hoy en
    // Lima" es 14, no 15.
    vi.setSystemTime(new Date("2026-03-15T02:00:00.000Z"));

    const hoyEnLima = crearLoteSchema.safeParse({ ...inputBase, fechaIngreso: "2026-03-14" });
    const mananaEnUtcPeroNoEnLima = crearLoteSchema.safeParse({
      ...inputBase,
      fechaIngreso: "2026-03-15",
    });

    expect(hoyEnLima.success).toBe(true);
    expect(mananaEnUtcPeroNoEnLima.success).toBe(false);
  });
});
