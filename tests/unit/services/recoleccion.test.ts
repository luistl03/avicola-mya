import { describe, expect, it } from "vitest";

import {
  calcularEmpaque,
  puedeRegistrarRecoleccion,
  puedeRevertirRecoleccion,
} from "@/server/services/recoleccion";

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

describe("puedeRevertirRecoleccion", () => {
  const AHORA = new Date("2026-01-01T00:10:00.000Z");

  it("rechaza un registro ya revertido, sin importar el tiempo transcurrido ni la elegibilidad", () => {
    const resultado = puedeRevertirRecoleccion({
      revertido: true,
      creadoEn: new Date("2026-01-01T00:09:00.000Z"),
      ahora: AHORA,
      paquetesNoDisponibles: 0,
    });

    expect(resultado).toEqual({ permitido: false, motivo: "Este registro ya fue revertido." });
  });

  it("rechaza si al menos un paquete ya no está DISPONIBLE, dentro de la ventana", () => {
    const resultado = puedeRevertirRecoleccion({
      revertido: false,
      creadoEn: new Date("2026-01-01T00:09:00.000Z"), // 1 min antes, ventana vigente
      ahora: AHORA,
      paquetesNoDisponibles: 1,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo:
        "Ya se vendió o rompió al menos un paquete de este registro - no se puede corregir automáticamente.",
    });
  });

  it("prioriza el motivo de elegibilidad sobre el de ventana vencida cuando ambos aplican", () => {
    const resultado = puedeRevertirRecoleccion({
      revertido: false,
      creadoEn: new Date("2025-12-31T23:59:00.000Z"), // 11 min antes, ventana vencida
      ahora: AHORA,
      paquetesNoDisponibles: 2,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo:
        "Ya se vendió o rompió al menos un paquete de este registro - no se puede corregir automáticamente.",
    });
  });

  it("permite revertir dentro de la ventana de 10 minutos, sin paquetes no disponibles", () => {
    const resultado = puedeRevertirRecoleccion({
      revertido: false,
      creadoEn: new Date("2026-01-01T00:05:00.000Z"), // 5 min antes de AHORA
      ahora: AHORA,
      paquetesNoDisponibles: 0,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("permite revertir justo en el límite exacto de 10 minutos", () => {
    const resultado = puedeRevertirRecoleccion({
      revertido: false,
      creadoEn: new Date("2026-01-01T00:00:00.000Z"), // exactamente 10 min antes
      ahora: AHORA,
      paquetesNoDisponibles: 0,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("rechaza revertir pasada la ventana de 10 minutos, sin paquetes no disponibles", () => {
    const resultado = puedeRevertirRecoleccion({
      revertido: false,
      creadoEn: new Date("2025-12-31T23:59:59.000Z"), // 10 min y 1 seg antes de AHORA
      ahora: AHORA,
      paquetesNoDisponibles: 0,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "La ventana de 10 minutos para deshacer este registro ya pasó.",
    });
  });
});
