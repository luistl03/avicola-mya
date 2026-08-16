import { describe, expect, it } from "vitest";

import {
  calcularFechaLimiteSugerida,
  calcularNivelAlerta,
  calcularSaldoPendiente,
  resumirAlertasCredito,
  validarFechaLimite,
} from "@/server/services/credito";

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const HOY = new Date("2026-08-14T00:00:00.000Z");

function fechaADiasDe(hoy: Date, dias: number): Date {
  return new Date(hoy.getTime() + dias * MS_POR_DIA);
}

describe("calcularNivelAlerta", () => {
  it("fechaLimite 10 días en el futuro — sin alerta (null)", () => {
    expect(calcularNivelAlerta(fechaADiasDe(HOY, 10), HOY)).toBeNull();
  });

  it("fechaLimite exactamente 3 días antes (límite) — POR_VENCER", () => {
    expect(calcularNivelAlerta(fechaADiasDe(HOY, 3), HOY)).toBe("POR_VENCER");
  });

  it("fechaLimite 1 día en el futuro — POR_VENCER", () => {
    expect(calcularNivelAlerta(fechaADiasDe(HOY, 1), HOY)).toBe("POR_VENCER");
  });

  it("fechaLimite es hoy mismo (día exacto del vencimiento) — VENCIDO_RECIENTE", () => {
    expect(calcularNivelAlerta(HOY, HOY)).toBe("VENCIDO_RECIENTE");
  });

  it("fechaLimite exactamente 7 días vencida (límite) — VENCIDO_RECIENTE", () => {
    expect(calcularNivelAlerta(fechaADiasDe(HOY, -7), HOY)).toBe("VENCIDO_RECIENTE");
  });

  it("fechaLimite 8 días vencida — VENCIDO_CRITICO", () => {
    expect(calcularNivelAlerta(fechaADiasDe(HOY, -8), HOY)).toBe("VENCIDO_CRITICO");
  });
});

describe("calcularSaldoPendiente", () => {
  it("saldo parcial", () => {
    expect(calcularSaldoPendiente(200, 50)).toBe(150);
  });

  it("saldo cero (ya liquidado)", () => {
    expect(calcularSaldoPendiente(200, 200)).toBe(0);
  });
});

describe("calcularFechaLimiteSugerida", () => {
  it("hoy + 15 días exacto", () => {
    const sugerida = calcularFechaLimiteSugerida(HOY);
    expect(sugerida.getTime()).toBe(fechaADiasDe(HOY, 15).getTime());
  });
});

describe("validarFechaLimite", () => {
  it("fecha futura — válida", () => {
    expect(validarFechaLimite(fechaADiasDe(HOY, 1), HOY)).toBe(true);
  });

  it("fecha igual a hoy — inválida (límite estricto, mínimo mañana)", () => {
    expect(validarFechaLimite(HOY, HOY)).toBe(false);
  });

  it("fecha pasada — inválida", () => {
    expect(validarFechaLimite(fechaADiasDe(HOY, -1), HOY)).toBe(false);
  });
});

describe("resumirAlertasCredito", () => {
  it("lista vacía — sin vencidos", () => {
    expect(resumirAlertasCredito([], HOY)).toEqual({ cantidadVencidos: 0, montoVencido: 0 });
  });

  it("solo créditos POR_VENCER — no cuentan como vencidos", () => {
    const creditos = [
      { montoTotal: 100, montoPagado: 0, fechaLimite: fechaADiasDe(HOY, 2) },
      { montoTotal: 50, montoPagado: 0, fechaLimite: fechaADiasDe(HOY, 3) },
    ];
    expect(resumirAlertasCredito(creditos, HOY)).toEqual({ cantidadVencidos: 0, montoVencido: 0 });
  });

  it("mezcla de los tres niveles — suma solo los dos vencidos", () => {
    const creditos = [
      { montoTotal: 100, montoPagado: 0, fechaLimite: fechaADiasDe(HOY, 2) }, // POR_VENCER, no cuenta
      { montoTotal: 200, montoPagado: 50, fechaLimite: fechaADiasDe(HOY, -1) }, // VENCIDO_RECIENTE, saldo 150
      { montoTotal: 80, montoPagado: 30, fechaLimite: fechaADiasDe(HOY, -10) }, // VENCIDO_CRITICO, saldo 50
    ];
    expect(resumirAlertasCredito(creditos, HOY)).toEqual({ cantidadVencidos: 2, montoVencido: 200 });
  });
});
