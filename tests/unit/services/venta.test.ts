import { describe, expect, it } from "vitest";

import { calcularBrutoVenta, calcularTotalCobrado, validarDescuento } from "@/server/services/venta";

describe("calcularBrutoVenta", () => {
  it("un solo ítem: peso × precio vigente", () => {
    expect(calcularBrutoVenta([10], 9.5)).toBe(95);
  });

  it("varios ítems: suma cada peso × precio vigente", () => {
    expect(calcularBrutoVenta([10, 5.5, 2.25], 9.5)).toBeCloseTo(10 * 9.5 + 5.5 * 9.5 + 2.25 * 9.5, 2);
  });

  it("lista vacía devuelve 0 (defensivo — Zod ya exige items no vacío antes de llegar acá)", () => {
    expect(calcularBrutoVenta([], 9.5)).toBe(0);
  });

  it("redondea a centavos, sin arrastrar ruido de punto flotante", () => {
    expect(calcularBrutoVenta([0.1, 0.2], 3)).toBe(0.9);
  });
});

describe("validarDescuento", () => {
  it("descuento 0 es válido", () => {
    expect(validarDescuento(500, 0)).toBe(true);
  });

  it("descuento igual al bruto es válido (límite exacto — venta a costo cero)", () => {
    expect(validarDescuento(500, 500)).toBe(true);
  });

  it("descuento mayor al bruto es inválido (dejaría totalCobrado negativo)", () => {
    expect(validarDescuento(500, 500.01)).toBe(false);
  });

  it("descuento negativo es inválido", () => {
    expect(validarDescuento(500, -1)).toBe(false);
  });
});

describe("calcularTotalCobrado", () => {
  it("sin descuento, el total cobrado es igual al bruto", () => {
    expect(calcularTotalCobrado(500, 0)).toBe(500);
  });

  it("con descuento parcial, resta el descuento del bruto", () => {
    expect(calcularTotalCobrado(500, 50)).toBe(450);
  });

  it("redondea a centavos", () => {
    expect(calcularTotalCobrado(33.333, 0)).toBe(33.33);
  });
});
