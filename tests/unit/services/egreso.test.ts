import { describe, expect, it } from "vitest";

import { puedeRevertirEgreso } from "@/server/services/egreso";

describe("puedeRevertirEgreso", () => {
  const AHORA = new Date("2026-01-01T00:10:00.000Z");

  it("rechaza un egreso ya revertido, sin importar el tiempo transcurrido", () => {
    const resultado = puedeRevertirEgreso({
      revertido: true,
      creadoEn: new Date("2026-01-01T00:09:00.000Z"),
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: false, motivo: "Este egreso ya fue anulado." });
  });

  it("permite anular dentro de la ventana de 10 minutos", () => {
    const resultado = puedeRevertirEgreso({
      revertido: false,
      creadoEn: new Date("2026-01-01T00:05:00.000Z"), // 5 min antes de AHORA
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("permite anular justo en el límite exacto de 10 minutos", () => {
    const resultado = puedeRevertirEgreso({
      revertido: false,
      creadoEn: new Date("2026-01-01T00:00:00.000Z"), // exactamente 10 min antes
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("rechaza anular pasada la ventana de 10 minutos", () => {
    const resultado = puedeRevertirEgreso({
      revertido: false,
      creadoEn: new Date("2025-12-31T23:59:59.000Z"), // 10 min y 1 seg antes de AHORA
      ahora: AHORA,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "La ventana de 10 minutos para anular este egreso ya pasó. Puedes corregirlo editándolo.",
    });
  });

  it("ancla la ventana a creadoEn, no a fecha — editar fecha no debe afectar el resultado", () => {
    // Simula un Egreso con `fecha` editada a un valor lejano (pasado o
    // futuro dentro de lo válido), pero `creadoEn` todavía dentro de la
    // ventana: puedeRevertirEgreso ni siquiera recibe `fecha` como
    // parámetro, así que no hay forma de que la afecte — este test deja
    // esa garantía explícita en vez de implícita.
    const resultado = puedeRevertirEgreso({
      revertido: false,
      creadoEn: new Date("2026-01-01T00:08:00.000Z"), // 2 min antes de AHORA
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: true });
  });
});
