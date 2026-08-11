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

  it("suma ROTURA_PAQUETE_ENTRADA y AJUSTE_GERENTE como entradas", () => {
    const movimientos = [
      { tipo: "ROTURA_PAQUETE_ENTRADA" as const, cantidad: 12 },
      { tipo: "AJUSTE_GERENTE" as const, cantidad: 8 },
    ];

    expect(reconstruirSaldo(movimientos)).toBe(20);
  });

  it("ignora REVERSION — no tiene signo propio fijo, sin caso real todavía (Sprint 6)", () => {
    const movimientos = [
      { tipo: "RECOLECCION" as const, cantidad: 100 },
      { tipo: "REVERSION" as const, cantidad: 100 },
    ];

    expect(reconstruirSaldo(movimientos)).toBe(100);
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
