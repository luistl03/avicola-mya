import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que rotura.test.ts/venta.test.ts.
// CreditoSobrepagoError se re-declara acá (no se importa la clase real)
// porque el mock completo del módulo reemplaza también esa exportación —
// la action importa la misma clase mockeada, así que el `instanceof` sigue
// funcionando. server/services/credito.ts NO se mockea — se ejercita real,
// mismo criterio que server/services/venta.ts en venta.test.ts.
const {
  authMock,
  buscarSesionPorJtiMock,
  crearAuditLogMock,
  headersMock,
  buscarCreditoPorIdMock,
  registrarAbonoRepoMock,
  buscarHistorialAbonoPorIdMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarCreditoPorIdMock: vi.fn(),
  registrarAbonoRepoMock: vi.fn(),
  buscarHistorialAbonoPorIdMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: vi.fn(),
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/credito", () => ({
  CreditoSobrepagoError: class CreditoSobrepagoError extends Error {},
  registrarAbono: registrarAbonoRepoMock,
  buscarCreditoPorId: buscarCreditoPorIdMock,
  buscarHistorialAbonoPorId: buscarHistorialAbonoPorIdMock,
}));

import { registrarAbonoAction } from "@/server/actions/credito";
import { CreditoSobrepagoError } from "@/server/repositories/credito";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const CREDITO_1_ID = crypto.randomUUID();
const ABONO_1_ID = crypto.randomUUID();

function sesionValida(usuarioId = GERENTE_1_ID) {
  return {
    id: "sesion-1",
    usuarioId,
    jti: "jti-1",
    creadaEn: AHORA,
    ultimaActividad: AHORA,
    revocada: false,
    revocadaEn: null,
  };
}

function sessionGerente() {
  return {
    sesionId: "jti-1",
    user: { id: GERENTE_1_ID, usuario: "gerente", nombre: "Gerente", rol: "GERENTE" as const },
  };
}

function sessionOperario() {
  return {
    sesionId: "jti-2",
    user: { id: OPERARIO_1_ID, usuario: "operario", nombre: "Operario", rol: "OPERARIO" as const },
  };
}

function erroDeUnicidad() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.3",
  });
}

function creditoPendiente(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CREDITO_1_ID,
    ventaId: crypto.randomUUID(),
    clienteId: crypto.randomUUID(),
    montoTotal: 200,
    montoPagado: 50,
    fechaLimite: new Date("2026-02-01T00:00:00.000Z"),
    estado: "PENDIENTE" as const,
    ...overrides,
  };
}

describe("registrarAbonoAction", () => {
  const inputBase = { id: ABONO_1_ID, creditoId: CREDITO_1_ID, monto: 100, metodoPago: "EFECTIVO" as const };

  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  it("registra un abono parcial y escribe AuditLog REGISTRAR con entidad HistorialAbonos", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarCreditoPorIdMock.mockResolvedValue(creditoPendiente());
    registrarAbonoRepoMock.mockResolvedValue({
      id: ABONO_1_ID,
      creditoId: CREDITO_1_ID,
      monto: 100,
      metodoPago: "EFECTIVO",
    });

    const resultado = await registrarAbonoAction(inputBase);

    expect(resultado).toEqual({
      ok: true,
      data: { id: ABONO_1_ID, creditoId: CREDITO_1_ID, monto: 100 },
    });
    expect(registrarAbonoRepoMock).toHaveBeenCalledWith({
      id: ABONO_1_ID,
      creditoId: CREDITO_1_ID,
      monto: 100,
      metodoPago: "EFECTIVO",
      usuarioId: GERENTE_1_ID,
      montoTotalCredito: 200,
      ahora: AHORA,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "HistorialAbonos", accion: "REGISTRAR", entidadId: ABONO_1_ID }),
    );
  });

  it("un OPERARIO puede registrar un abono (sin restricción de rol)", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));
    buscarCreditoPorIdMock.mockResolvedValue(creditoPendiente());
    registrarAbonoRepoMock.mockResolvedValue({
      id: ABONO_1_ID,
      creditoId: CREDITO_1_ID,
      monto: 100,
      metodoPago: "EFECTIVO",
    });

    const resultado = await registrarAbonoAction(inputBase);

    expect(resultado.ok).toBe(true);
    expect(registrarAbonoRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: OPERARIO_1_ID }),
    );
  });

  it("un abono que deja el saldo en exactamente cero se registra igual (la auto-liquidación vive en el repository)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarCreditoPorIdMock.mockResolvedValue(creditoPendiente({ montoTotal: 200, montoPagado: 150 }));
    registrarAbonoRepoMock.mockResolvedValue({
      id: ABONO_1_ID,
      creditoId: CREDITO_1_ID,
      monto: 50,
      metodoPago: "YAPE",
    });

    const resultado = await registrarAbonoAction({ ...inputBase, monto: 50, metodoPago: "YAPE" });

    expect(resultado.ok).toBe(true);
    expect(registrarAbonoRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ monto: 50, montoTotalCredito: 200 }),
    );
  });

  it("rechaza si el crédito no existe, sin tocar la transacción", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarCreditoPorIdMock.mockResolvedValue(null);

    const resultado = await registrarAbonoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "El crédito no existe." });
    expect(registrarAbonoRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza con un mensaje específico si el crédito ya está LIQUIDADO", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarCreditoPorIdMock.mockResolvedValue(creditoPendiente({ estado: "LIQUIDADO", montoPagado: 200 }));

    const resultado = await registrarAbonoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "Este crédito ya está liquidado." });
    expect(registrarAbonoRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza un monto mayor al saldo pendiente (chequeo previo), con el mensaje de sobrepago", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarCreditoPorIdMock.mockResolvedValue(creditoPendiente({ montoTotal: 200, montoPagado: 50 })); // saldo 150

    const resultado = await registrarAbonoAction({ ...inputBase, monto: 200 });

    expect(resultado).toEqual({
      ok: false,
      error: "El abono (S/ 200.00) supera el saldo pendiente (S/ 150.00).",
    });
    expect(registrarAbonoRepoMock).not.toHaveBeenCalled();
  });

  it("traduce CreditoSobrepagoError (carrera real que pasó el chequeo previo) a un mensaje distinto del de sobrepago simple", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarCreditoPorIdMock.mockResolvedValue(creditoPendiente({ montoTotal: 200, montoPagado: 50 })); // saldo 150, pasa el chequeo previo
    registrarAbonoRepoMock.mockRejectedValue(new CreditoSobrepagoError());

    const resultado = await registrarAbonoAction({ ...inputBase, monto: 100 });

    expect(resultado).toEqual({
      ok: false,
      error: "El saldo cambió justo antes de registrar este abono - revisa el crédito y reintenta.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  describe("idempotencia / carrera real (P2002 sobre HistorialAbonos.id)", () => {
    beforeEach(() => {
      buscarCreditoPorIdMock.mockResolvedValue(creditoPendiente());
    });

    it("reintento con el mismo creditoId/monto/metodoPago responde éxito idempotente, sin duplicar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      registrarAbonoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarHistorialAbonoPorIdMock.mockResolvedValue({
        id: ABONO_1_ID,
        creditoId: CREDITO_1_ID,
        monto: 100,
        metodoPago: "EFECTIVO",
      });

      const resultado = await registrarAbonoAction(inputBase);

      expect(resultado).toEqual({
        ok: true,
        data: { id: ABONO_1_ID, creditoId: CREDITO_1_ID, monto: 100 },
      });
      expect(registrarAbonoRepoMock).toHaveBeenCalledTimes(1);
    });

    it("P2002 con datos distintos (monto) se rechaza explícito, sin sobrescribir", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      registrarAbonoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarHistorialAbonoPorIdMock.mockResolvedValue({
        id: ABONO_1_ID,
        creditoId: CREDITO_1_ID,
        monto: 80, // distinto del pedido (100)
        metodoPago: "EFECTIVO",
      });

      const resultado = await registrarAbonoAction(inputBase);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("P2002 pero el registro ya no existe al releer propaga el error original", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      const error = erroDeUnicidad();
      registrarAbonoRepoMock.mockRejectedValue(error);
      buscarHistorialAbonoPorIdMock.mockResolvedValue(null);

      await expect(registrarAbonoAction(inputBase)).rejects.toThrow("Unique constraint failed");
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("cualquier otro error de Prisma (no P2002) se propaga tal cual, sin pasar por la rama idempotente", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      registrarAbonoRepoMock.mockRejectedValue(new Error("conexión perdida"));

      await expect(registrarAbonoAction(inputBase)).rejects.toThrow("conexión perdida");
      expect(buscarHistorialAbonoPorIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});
