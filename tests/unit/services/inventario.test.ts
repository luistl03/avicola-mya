import { describe, expect, it } from "vitest";

import { reconstruirSaldo } from "@/server/services/inventario";

describe("reconstruirSaldo", () => {
  it("devuelve 0 sin ningún movimiento", () => {
    expect(reconstruirSaldo([])).toBe(0);
  });

  it("suma movimientos de RECOLECCION (entrada)", () => {
    const movimientos = [
      { tipo: "RECOLECCION" as const, cantidad: 110 },
      { tipo: "RECOLECCION" as const, cantidad: 45 },
    ];

    expect(reconstruirSaldo(movimientos)).toBe(155);
  });

  it("resta movimientos de salida (CONSOLIDACION_SALIDA, VENTA_SUELTO) sobre las entradas", () => {
    const movimientos = [
      { tipo: "RECOLECCION" as const, cantidad: 200 },
      { tipo: "CONSOLIDACION_SALIDA" as const, cantidad: 30 },
      { tipo: "VENTA_SUELTO" as const, cantidad: 15 },
    ];

    expect(reconstruirSaldo(movimientos)).toBe(155);
  });

  it("suma ROTURA_PAQUETE_ENTRADA como entrada", () => {
    const movimientos = [{ tipo: "ROTURA_PAQUETE_ENTRADA" as const, cantidad: 12 }];

    expect(reconstruirSaldo(movimientos)).toBe(12);
  });

  it("suma ROTURA_BANDEJA_ENTRADA como entrada (Sprint 10)", () => {
    const movimientos = [{ tipo: "ROTURA_BANDEJA_ENTRADA" as const, cantidad: 18 }];

    expect(reconstruirSaldo(movimientos)).toBe(18);
  });

  it("resta REVERSION — deshace un RECOLECCION anterior (Sprint 6)", () => {
    const movimientos = [
      { tipo: "RECOLECCION" as const, cantidad: 110 },
      { tipo: "REVERSION" as const, cantidad: 110 },
    ];

    expect(reconstruirSaldo(movimientos)).toBe(0);
  });

  it("suma AJUSTE_GERENTE con cantidad positiva (Sprint 6, compensa un faltante)", () => {
    const movimientos = [
      { tipo: "RECOLECCION" as const, cantidad: 100 },
      { tipo: "AJUSTE_GERENTE" as const, cantidad: 15 },
    ];

    expect(reconstruirSaldo(movimientos)).toBe(115);
  });

  it("resta AJUSTE_GERENTE con cantidad negativa (Sprint 6, corrige un excedente) — se suma con signo, sin pasar por TIPOS_ENTRADA/TIPOS_SALIDA", () => {
    const movimientos = [
      { tipo: "RECOLECCION" as const, cantidad: 100 },
      { tipo: "AJUSTE_GERENTE" as const, cantidad: -20 },
    ];

    expect(reconstruirSaldo(movimientos)).toBe(80);
  });

  it("reproduce el saldo real de InventarioSueltos con una recolección revertida por completo más un ajuste manual posterior", () => {
    // Simula: una recolección con sueltos, revertida dentro de la ventana
    // de gracia (RECOLECCION + REVERSION se cancelan exactamente), y un
    // ajuste manual del Gerente después que corrige un faltante detectado
    // en un conteo físico — ninguno de los dos pasos existía antes de
    // Sprint 6.
    const movimientos = [
      { tipo: "RECOLECCION" as const, cantidad: 110 },
      { tipo: "REVERSION" as const, cantidad: 110 },
      { tipo: "RECOLECCION" as const, cantidad: 65 },
      { tipo: "AJUSTE_GERENTE" as const, cantidad: 10 },
    ];

    const saldoEsperadoEnInventarioSueltos = 75; // 110 - 110 + 65 + 10

    expect(reconstruirSaldo(movimientos)).toBe(saldoEsperadoEnInventarioSueltos);
  });

  it("reproduce el saldo real de InventarioSueltos a partir de una secuencia mixta realista", () => {
    // Simula lo que server/repositories/recoleccion.ts dejaría en la base
    // tras dos recolecciones (sin múltiplos exactos de 180, así que ambas
    // dejan movimiento) y una consolidación posterior (Sprint 7) que ya
    // sacó parte de esos sueltos.
    const movimientos = [
      { tipo: "RECOLECCION" as const, cantidad: 110 },
      { tipo: "RECOLECCION" as const, cantidad: 65 },
      { tipo: "CONSOLIDACION_SALIDA" as const, cantidad: 90 },
    ];

    const saldoEsperadoEnInventarioSueltos = 85; // 110 + 65 - 90

    expect(reconstruirSaldo(movimientos)).toBe(saldoEsperadoEnInventarioSueltos);
  });
});
