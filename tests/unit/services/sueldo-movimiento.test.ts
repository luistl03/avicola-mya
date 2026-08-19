import { describe, expect, it } from "vitest";

import {
  calcularNetoMensual,
  calcularRangoMesCalendario,
  puedeRevertirSueldoMovimiento,
} from "@/server/services/sueldo-movimiento";

describe("puedeRevertirSueldoMovimiento", () => {
  const AHORA = new Date("2026-01-01T00:10:00.000Z");

  it("rechaza un movimiento ya revertido, sin importar el tiempo transcurrido", () => {
    const resultado = puedeRevertirSueldoMovimiento({
      revertido: true,
      fecha: new Date("2026-01-01T00:09:00.000Z"),
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: false, motivo: "Este movimiento ya fue revertido." });
  });

  it("permite revertir dentro de la ventana de 10 minutos", () => {
    const resultado = puedeRevertirSueldoMovimiento({
      revertido: false,
      fecha: new Date("2026-01-01T00:05:00.000Z"), // 5 min antes de AHORA
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("permite revertir justo en el límite exacto de 10 minutos", () => {
    const resultado = puedeRevertirSueldoMovimiento({
      revertido: false,
      fecha: new Date("2026-01-01T00:00:00.000Z"), // exactamente 10 min antes
      ahora: AHORA,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("rechaza revertir pasada la ventana de 10 minutos", () => {
    const resultado = puedeRevertirSueldoMovimiento({
      revertido: false,
      fecha: new Date("2025-12-31T23:59:59.000Z"), // 10 min y 1 seg antes de AHORA
      ahora: AHORA,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "La ventana de 10 minutos para deshacer este movimiento ya pasó.",
    });
  });
});

describe("calcularRangoMesCalendario", () => {
  it("calcula el rango de un mes cualquiera dentro del mismo año", () => {
    const resultado = calcularRangoMesCalendario(8, 2026);

    expect(resultado.desde).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(resultado.hasta).toEqual(new Date("2026-09-01T00:00:00.000Z"));
  });

  it("cruza correctamente de diciembre a enero del año siguiente", () => {
    const resultado = calcularRangoMesCalendario(12, 2026);

    expect(resultado.desde).toEqual(new Date("2026-12-01T00:00:00.000Z"));
    expect(resultado.hasta).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  it("calcula el rango de enero (mes 1) sin retroceder al año anterior", () => {
    const resultado = calcularRangoMesCalendario(1, 2026);

    expect(resultado.desde).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(resultado.hasta).toEqual(new Date("2026-02-01T00:00:00.000Z"));
  });
});

describe("calcularNetoMensual", () => {
  it("combina los 4 tipos con el signo correcto", () => {
    const resultado = calcularNetoMensual([
      { tipo: "SUELDO_BASE", monto: 1200 },
      { tipo: "BONO", monto: 100 },
      { tipo: "ADELANTO", monto: 200 },
      { tipo: "DESCUENTO", monto: 50 },
    ]);

    expect(resultado).toEqual({
      sueldoBase: 1200,
      bonos: 100,
      adelantos: 200,
      descuentos: 50,
      neto: 1050, // 1200 + 100 - 200 - 50
    });
  });

  it("devuelve el desglose en cero con una lista vacía, sin dividir por cero ni error", () => {
    const resultado = calcularNetoMensual([]);

    expect(resultado).toEqual({ sueldoBase: 0, bonos: 0, adelantos: 0, descuentos: 0, neto: 0 });
  });

  it("un tipo ausente ese mes no rompe la suma (queda en 0, no undefined)", () => {
    // Sin ningún BONO este mes — sumaPorTipo("BONO") debe dar 0, no NaN.
    const resultado = calcularNetoMensual([
      { tipo: "SUELDO_BASE", monto: 1200 },
      { tipo: "ADELANTO", monto: 100 },
    ]);

    expect(resultado).toEqual({ sueldoBase: 1200, bonos: 0, adelantos: 100, descuentos: 0, neto: 1100 });
  });

  it("suma varios movimientos del mismo tipo en el mismo mes", () => {
    const resultado = calcularNetoMensual([
      { tipo: "ADELANTO", monto: 100 },
      { tipo: "ADELANTO", monto: 50 },
    ]);

    expect(resultado).toEqual({ sueldoBase: 0, bonos: 0, adelantos: 150, descuentos: 0, neto: -150 });
  });
});
