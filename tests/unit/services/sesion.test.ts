import { describe, expect, it } from "vitest";

import { debeMostrarAvisoIdle, estaExpiradaPorInactividad } from "@/server/services/sesion";

const BASE = new Date("2026-01-01T00:00:00.000Z");

function minutosDespues(minutos: number): Date {
  return new Date(BASE.getTime() + minutos * 60_000);
}

describe("estaExpiradaPorInactividad", () => {
  it("es false antes de los 30 minutos", () => {
    expect(estaExpiradaPorInactividad(BASE, minutosDespues(29))).toBe(false);
  });

  it("es true exactamente a los 30 minutos (umbral inclusivo)", () => {
    expect(estaExpiradaPorInactividad(BASE, minutosDespues(30))).toBe(true);
  });

  it("es true después de los 30 minutos", () => {
    expect(estaExpiradaPorInactividad(BASE, minutosDespues(31))).toBe(true);
  });

  it("es false sin inactividad", () => {
    expect(estaExpiradaPorInactividad(BASE, BASE)).toBe(false);
  });
});

describe("debeMostrarAvisoIdle", () => {
  it("es false antes de los 28 minutos", () => {
    expect(debeMostrarAvisoIdle(BASE, minutosDespues(27))).toBe(false);
  });

  it("es true exactamente a los 28 minutos (umbral inclusivo)", () => {
    expect(debeMostrarAvisoIdle(BASE, minutosDespues(28))).toBe(true);
  });

  it("es true entre el aviso (28 min) y el límite de expiración (30 min)", () => {
    expect(debeMostrarAvisoIdle(BASE, minutosDespues(29))).toBe(true);
  });
});
