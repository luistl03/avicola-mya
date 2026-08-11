import { describe, expect, it } from "vitest";

import { calcularEmpaque, puedeRegistrarRecoleccion } from "@/server/services/recoleccion";

describe("calcularEmpaque", () => {
  it("no genera ningún paquete cuando el total es menor a 180 — todo queda suelto", () => {
    expect(calcularEmpaque(45)).toEqual({ paquetes: 0, sueltos: 45 });
  });

  it("no genera ningún paquete con un total de 1 (caso extremo)", () => {
    expect(calcularEmpaque(1)).toEqual({ paquetes: 0, sueltos: 1 });
  });

  it("genera exactamente 1 paquete y 0 sueltos con un total de 180 (múltiplo exacto)", () => {
    expect(calcularEmpaque(180)).toEqual({ paquetes: 1, sueltos: 0 });
  });

  it("genera 2 paquetes y 0 sueltos con un total de 360 (múltiplo exacto)", () => {
    expect(calcularEmpaque(360)).toEqual({ paquetes: 2, sueltos: 0 });
  });

  it("reparte en paquetes completos más el resto como sueltos (caso general)", () => {
    expect(calcularEmpaque(470)).toEqual({ paquetes: 2, sueltos: 110 });
  });

  it("genera 0 paquetes y 179 sueltos justo un huevo antes de completar el primer paquete", () => {
    expect(calcularEmpaque(179)).toEqual({ paquetes: 0, sueltos: 179 });
  });
});

describe("puedeRegistrarRecoleccion", () => {
  it("rechaza registrar recolección de un lote INACTIVO (ya finalizado)", () => {
    const resultado = puedeRegistrarRecoleccion({ loteEstado: "INACTIVO" });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "Solo se puede registrar recolección de un lote activo.",
    });
  });

  it("permite registrar recolección de un lote ACTIVO", () => {
    const resultado = puedeRegistrarRecoleccion({ loteEstado: "ACTIVO" });

    expect(resultado).toEqual({ permitido: true });
  });
});
