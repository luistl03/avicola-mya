import { describe, expect, it } from "vitest";

import { calcularEdadEnSemanas, puedeFinalizarLote, puedeMudarLote } from "@/server/services/lote";

describe("puedeMudarLote", () => {
  it("rechaza mudar un lote INACTIVO (ya finalizado)", () => {
    const resultado = puedeMudarLote({
      loteEstado: "INACTIVO",
      galponOrigenId: "galpon-1",
      galponDestinoId: "galpon-2",
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "Solo se pueden mudar lotes activos.",
    });
  });

  it("rechaza mudar un lote al mismo galpón donde ya está", () => {
    const resultado = puedeMudarLote({
      loteEstado: "ACTIVO",
      galponOrigenId: "galpon-1",
      galponDestinoId: "galpon-1",
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "El lote ya está en ese galpón.",
    });
  });

  it("permite mudar un lote ACTIVO a un galpón distinto del actual", () => {
    const resultado = puedeMudarLote({
      loteEstado: "ACTIVO",
      galponOrigenId: "galpon-1",
      galponDestinoId: "galpon-2",
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("permite mudar un lote sin ubicación abierta (caso teórico, no debería ocurrir en la práctica)", () => {
    const resultado = puedeMudarLote({
      loteEstado: "ACTIVO",
      galponOrigenId: null,
      galponDestinoId: "galpon-2",
    });

    expect(resultado).toEqual({ permitido: true });
  });
});

describe("puedeFinalizarLote", () => {
  it("rechaza finalizar un lote que ya está INACTIVO", () => {
    const resultado = puedeFinalizarLote({ loteEstado: "INACTIVO" });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "El lote ya está finalizado.",
    });
  });

  // No recibe avesVivas como parámetro: por decisión de negocio
  // (spec.md, confirmada por el Product Owner) finalizar un lote nunca
  // depende de esa cantidad — el guard no distingue entre "con aves
  // vivas" y "sin aves vivas", ambos casos son el mismo permitido:true.
  it("permite finalizar cualquier lote ACTIVO, sin importar avesVivas", () => {
    const resultado = puedeFinalizarLote({ loteEstado: "ACTIVO" });

    expect(resultado).toEqual({ permitido: true });
  });
});

describe("calcularEdadEnSemanas", () => {
  it("da la edad inicial tal cual si fechaReferencia es el mismo día de fechaIngreso", () => {
    const fecha = new Date("2026-01-01T00:00:00.000Z");

    const resultado = calcularEdadEnSemanas({
      edadInicialSemanas: 3,
      fechaIngreso: fecha,
      fechaReferencia: fecha,
    });

    expect(resultado).toBe(3);
  });

  it("suma semanas completas transcurridas, redondeando hacia abajo (piso, no redondeo)", () => {
    const fechaIngreso = new Date("2026-01-01T00:00:00.000Z");
    // 13 días = 1 semana completa + 6 días sueltos — no llega a la 2da semana.
    const fechaReferencia = new Date("2026-01-14T00:00:00.000Z");

    const resultado = calcularEdadEnSemanas({
      edadInicialSemanas: 0,
      fechaIngreso,
      fechaReferencia,
    });

    expect(resultado).toBe(1);
  });

  it("suma la edad inicial (lote que ingresó como recría, no pollito de un día) más lo transcurrido", () => {
    const fechaIngreso = new Date("2026-01-01T00:00:00.000Z");
    const fechaReferencia = new Date("2026-01-15T00:00:00.000Z"); // +14 días = +2 semanas

    const resultado = calcularEdadEnSemanas({
      edadInicialSemanas: 16,
      fechaIngreso,
      fechaReferencia,
    });

    expect(resultado).toBe(18);
  });

  it("nunca resta semanas si fechaReferencia cae antes que fechaIngreso (guarda defensiva)", () => {
    const fechaIngreso = new Date("2026-01-15T00:00:00.000Z");
    const fechaReferencia = new Date("2026-01-01T00:00:00.000Z");

    const resultado = calcularEdadEnSemanas({
      edadInicialSemanas: 5,
      fechaIngreso,
      fechaReferencia,
    });

    expect(resultado).toBe(5);
  });

  it("con fechaReferencia = fechaSalida de la última ubicación, la edad de un lote finalizado queda congelada (no depende de 'hoy')", () => {
    const fechaIngreso = new Date("2026-01-01T00:00:00.000Z");
    // Simula que finalizarLote() cerró la ubicación 4 semanas después del alta.
    const fechaFinalizacion = new Date("2026-01-29T00:00:00.000Z");

    const resultado = calcularEdadEnSemanas({
      edadInicialSemanas: 0,
      fechaIngreso,
      fechaReferencia: fechaFinalizacion,
    });

    expect(resultado).toBe(4);
  });
});
