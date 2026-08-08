import { describe, expect, it } from "vitest";

import { puedeRegistrarMortalidad, puedeRevertirMortalidad } from "@/server/services/mortalidad";

describe("puedeRegistrarMortalidad", () => {
  it("rechaza registrar mortalidad de un lote INACTIVO (ya finalizado)", () => {
    const resultado = puedeRegistrarMortalidad({
      loteEstado: "INACTIVO",
      avesVivas: 100,
      cantidad: 5,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "Solo se puede registrar mortalidad de un lote activo.",
    });
  });

  it("rechaza una cantidad mayor a las aves vivas, con el número real en el mensaje", () => {
    const resultado = puedeRegistrarMortalidad({
      loteEstado: "ACTIVO",
      avesVivas: 5,
      cantidad: 10,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "Solo quedan 5 aves vivas en este lote.",
    });
  });

  // Dejar el lote en 0 es válido — Sprint 3 ya decidió que avesVivas
  // puede ser cualquier valor ≥0, incluido 0.
  it("permite una cantidad exactamente igual a las aves vivas (deja el lote en 0)", () => {
    const resultado = puedeRegistrarMortalidad({
      loteEstado: "ACTIVO",
      avesVivas: 5,
      cantidad: 5,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("permite una cantidad con margen respecto a las aves vivas", () => {
    const resultado = puedeRegistrarMortalidad({
      loteEstado: "ACTIVO",
      avesVivas: 500,
      cantidad: 3,
    });

    expect(resultado).toEqual({ permitido: true });
  });
});

describe("puedeRevertirMortalidad", () => {
  const AHORA = new Date("2026-01-01T00:10:00.000Z");

  it("rechaza un registro ya revertido, sin importar el tiempo transcurrido", () => {
    const resultado = puedeRevertirMortalidad({
      revertido: true,
      fecha: new Date("2026-01-01T00:09:00.000Z"),
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: false, motivo: "Este registro ya fue revertido." });
  });

  it("permite revertir dentro de la ventana de 10 minutos", () => {
    const resultado = puedeRevertirMortalidad({
      revertido: false,
      fecha: new Date("2026-01-01T00:05:00.000Z"), // 5 min antes de AHORA
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("permite revertir justo en el límite exacto de 10 minutos", () => {
    const resultado = puedeRevertirMortalidad({
      revertido: false,
      fecha: new Date("2026-01-01T00:00:00.000Z"), // exactamente 10 min antes
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("rechaza revertir pasada la ventana de 10 minutos", () => {
    const resultado = puedeRevertirMortalidad({
      revertido: false,
      fecha: new Date("2025-12-31T23:59:59.000Z"), // 10 min y 1 seg antes de AHORA
      ahora: AHORA,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "La ventana de 10 minutos para deshacer este registro ya pasó.",
    });
  });
});
