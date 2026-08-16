import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que consolidacion.test.ts/venta.test.ts.
// PaqueteNoDisponibleError/BandejaNoDisponibleError se re-declaran acá (no
// se importa la clase real) porque el mock completo del módulo reemplaza
// también esa exportación — la action importa la misma clase mockeada, así
// que el `instanceof` sigue funcionando. repartirDevolucion() (función
// pura, ya con su propia cobertura 100% en rotura.test.ts de services) NO
// se ejercita acá — romperPaquete/romperBandeja del repository están
// mockeados enteros, mismo criterio que cerrarVenta en venta.test.ts.
const {
  authMock,
  buscarSesionPorJtiMock,
  crearAuditLogMock,
  headersMock,
  buscarPaquetePorIdMock,
  buscarPaqueteOrigenesPorPaqueteIdMock,
  romperPaqueteRepoMock,
  buscarRoturaPaquetePorPaqueteIdMock,
  buscarBandejaPorIdMock,
  buscarBandejaOrigenesPorBandejaIdMock,
  romperBandejaRepoMock,
  buscarRoturaBandejaPorBandejaIdMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarPaquetePorIdMock: vi.fn(),
  buscarPaqueteOrigenesPorPaqueteIdMock: vi.fn(),
  romperPaqueteRepoMock: vi.fn(),
  buscarRoturaPaquetePorPaqueteIdMock: vi.fn(),
  buscarBandejaPorIdMock: vi.fn(),
  buscarBandejaOrigenesPorBandejaIdMock: vi.fn(),
  romperBandejaRepoMock: vi.fn(),
  buscarRoturaBandejaPorBandejaIdMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: vi.fn(),
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/rotura", () => ({
  PaqueteNoDisponibleError: class PaqueteNoDisponibleError extends Error {},
  BandejaNoDisponibleError: class BandejaNoDisponibleError extends Error {},
  romperPaquete: romperPaqueteRepoMock,
  buscarPaquetePorId: buscarPaquetePorIdMock,
  buscarPaqueteOrigenesPorPaqueteId: buscarPaqueteOrigenesPorPaqueteIdMock,
  buscarRoturaPaquetePorPaqueteId: buscarRoturaPaquetePorPaqueteIdMock,
  romperBandeja: romperBandejaRepoMock,
  buscarBandejaPorId: buscarBandejaPorIdMock,
  buscarBandejaOrigenesPorBandejaId: buscarBandejaOrigenesPorBandejaIdMock,
  buscarRoturaBandejaPorBandejaId: buscarRoturaBandejaPorBandejaIdMock,
}));

import { romperBandejaAction, romperPaqueteAction } from "@/server/actions/rotura";
import { BandejaNoDisponibleError, PaqueteNoDisponibleError } from "@/server/repositories/rotura";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const PAQUETE_1_ID = crypto.randomUUID();
const BANDEJA_1_ID = crypto.randomUUID();
const GALPON_A_ID = crypto.randomUUID();
const GALPON_B_ID = crypto.randomUUID();
const LOTE_1_ID = crypto.randomUUID();
const LOTE_2_ID = crypto.randomUUID();
const ROTURA_1_ID = crypto.randomUUID();

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

describe("romperPaqueteAction", () => {
  const inputBase = { paqueteId: PAQUETE_1_ID, pesoExtraido: 11.25 };

  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  it("rompe un Paquete PURO (un solo origen), acredita el reparto real y escribe AuditLog ROMPER", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarPaquetePorIdMock.mockResolvedValue({ id: PAQUETE_1_ID, estado: "DISPONIBLE" });
    buscarPaqueteOrigenesPorPaqueteIdMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 180 },
    ]);
    romperPaqueteRepoMock.mockResolvedValue({
      rotura: { id: ROTURA_1_ID, paqueteId: PAQUETE_1_ID, unidadesDevueltas: 180 },
      unidadesSinLote: 0,
    });

    const resultado = await romperPaqueteAction(inputBase);

    expect(resultado).toEqual({
      ok: true,
      data: { paqueteId: PAQUETE_1_ID, unidadesDevueltas: 180, unidadesSinLote: 0 },
    });
    expect(romperPaqueteRepoMock).toHaveBeenCalledWith({
      paqueteId: PAQUETE_1_ID,
      pesoExtraido: 11.25,
      origenes: [{ galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 180 }],
      usuarioId: GERENTE_1_ID,
      ahora: AHORA,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "RoturaPaquete", accion: "ROMPER", entidadId: ROTURA_1_ID }),
    );
  });

  it("rompe un Paquete MIXTO (dos orígenes reales) y pasa ambos al repository sin alterarlos", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarPaquetePorIdMock.mockResolvedValue({ id: PAQUETE_1_ID, estado: "DISPONIBLE" });
    buscarPaqueteOrigenesPorPaqueteIdMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 120 },
      { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 60 },
    ]);
    romperPaqueteRepoMock.mockResolvedValue({
      rotura: { id: ROTURA_1_ID, paqueteId: PAQUETE_1_ID, unidadesDevueltas: 180 },
      unidadesSinLote: 0,
    });

    const resultado = await romperPaqueteAction(inputBase);

    expect(resultado.ok).toBe(true);
    expect(romperPaqueteRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        origenes: [
          { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 120 },
          { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 60 },
        ],
      }),
    );
  });

  it("rotura con un origen sin loteId conocido devuelve unidadesSinLote en la respuesta", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarPaquetePorIdMock.mockResolvedValue({ id: PAQUETE_1_ID, estado: "DISPONIBLE" });
    buscarPaqueteOrigenesPorPaqueteIdMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: null, cantidad: 180 },
    ]);
    romperPaqueteRepoMock.mockResolvedValue({
      rotura: { id: ROTURA_1_ID, paqueteId: PAQUETE_1_ID, unidadesDevueltas: 0 },
      unidadesSinLote: 180,
    });

    const resultado = await romperPaqueteAction(inputBase);

    expect(resultado).toEqual({
      ok: true,
      data: { paqueteId: PAQUETE_1_ID, unidadesDevueltas: 0, unidadesSinLote: 180 },
    });
  });

  it("un OPERARIO puede romper un Paquete (sin restricción de rol)", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));
    buscarPaquetePorIdMock.mockResolvedValue({ id: PAQUETE_1_ID, estado: "DISPONIBLE" });
    buscarPaqueteOrigenesPorPaqueteIdMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 180 },
    ]);
    romperPaqueteRepoMock.mockResolvedValue({
      rotura: { id: ROTURA_1_ID, paqueteId: PAQUETE_1_ID, unidadesDevueltas: 180 },
      unidadesSinLote: 0,
    });

    const resultado = await romperPaqueteAction(inputBase);

    expect(resultado.ok).toBe(true);
    expect(romperPaqueteRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: OPERARIO_1_ID }),
    );
  });

  it("rechaza si el paquete no existe, sin llegar a leer orígenes ni tocar el repository de escritura", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarPaquetePorIdMock.mockResolvedValue(null);

    const resultado = await romperPaqueteAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "El paquete no existe." });
    expect(buscarPaqueteOrigenesPorPaqueteIdMock).not.toHaveBeenCalled();
    expect(romperPaqueteRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza si el paquete ya no está DISPONIBLE (pre-chequeo)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarPaquetePorIdMock.mockResolvedValue({ id: PAQUETE_1_ID, estado: "VENDIDO" });

    const resultado = await romperPaqueteAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "Este paquete ya no está disponible (fue vendido, roto o anulado).",
    });
    expect(romperPaqueteRepoMock).not.toHaveBeenCalled();
  });

  it("traduce PaqueteNoDisponibleError (carrera real que pasó el pre-chequeo) a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarPaquetePorIdMock.mockResolvedValue({ id: PAQUETE_1_ID, estado: "DISPONIBLE" });
    buscarPaqueteOrigenesPorPaqueteIdMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 180 },
    ]);
    romperPaqueteRepoMock.mockRejectedValue(new PaqueteNoDisponibleError());

    const resultado = await romperPaqueteAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "Este paquete ya no está disponible — puede que ya lo hayan roto o vendido justo ahora.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  describe("idempotencia / carrera real (P2002 sobre paqueteId)", () => {
    beforeEach(() => {
      buscarPaquetePorIdMock.mockResolvedValue({ id: PAQUETE_1_ID, estado: "DISPONIBLE" });
      buscarPaqueteOrigenesPorPaqueteIdMock.mockResolvedValue([
        { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 180 },
      ]);
    });

    it("reintento con el mismo pesoExtraido responde éxito idempotente, sin duplicar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      romperPaqueteRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarRoturaPaquetePorPaqueteIdMock.mockResolvedValue({
        id: ROTURA_1_ID,
        paqueteId: PAQUETE_1_ID,
        pesoExtraido: 11.25,
        unidadesDevueltas: 180,
      });

      const resultado = await romperPaqueteAction(inputBase);

      expect(resultado).toEqual({
        ok: true,
        data: { paqueteId: PAQUETE_1_ID, unidadesDevueltas: 180, unidadesSinLote: 0 },
      });
      expect(romperPaqueteRepoMock).toHaveBeenCalledTimes(1);
    });

    it("carrera real con un pesoExtraido distinto se rechaza explícito, sin sobrescribir", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      romperPaqueteRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarRoturaPaquetePorPaqueteIdMock.mockResolvedValue({
        id: ROTURA_1_ID,
        paqueteId: PAQUETE_1_ID,
        pesoExtraido: 10.9, // distinto del pedido (11.25) — otro operario lo rompió
        unidadesDevueltas: 180,
      });

      const resultado = await romperPaqueteAction(inputBase);

      expect(resultado).toEqual({
        ok: false,
        error:
          "Este paquete ya fue roto (por otro operario, o hace un instante) con un peso distinto al que digitaste — no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("P2002 pero el registro ya no existe al releer propaga el error original", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      const error = erroDeUnicidad();
      romperPaqueteRepoMock.mockRejectedValue(error);
      buscarRoturaPaquetePorPaqueteIdMock.mockResolvedValue(null);

      await expect(romperPaqueteAction(inputBase)).rejects.toThrow("Unique constraint failed");
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("cualquier otro error de Prisma (no P2002) se propaga tal cual, sin pasar por la rama idempotente", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      romperPaqueteRepoMock.mockRejectedValue(new Error("conexión perdida"));

      await expect(romperPaqueteAction(inputBase)).rejects.toThrow("conexión perdida");
      expect(buscarRoturaPaquetePorPaqueteIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});

// No se repite el suite completo de arriba — la lógica es un mirror
// exacto. Acá solo se confirma que romperBandejaAction usa sus propias
// piezas (BandejaNoDisponibleError, romperBandeja, 30 en vez de 180) y su
// propia acción de AuditLog.
describe("romperBandejaAction", () => {
  const inputBase = { bandejaId: BANDEJA_1_ID, pesoExtraido: 1.9 };

  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  it("rompe una Bandeja con dos orígenes reales y escribe AuditLog ROMPER", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarBandejaPorIdMock.mockResolvedValue({ id: BANDEJA_1_ID, estado: "DISPONIBLE" });
    buscarBandejaOrigenesPorBandejaIdMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 18 },
      { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 12 },
    ]);
    romperBandejaRepoMock.mockResolvedValue({
      rotura: { id: ROTURA_1_ID, bandejaId: BANDEJA_1_ID, unidadesDevueltas: 30 },
      unidadesSinLote: 0,
    });

    const resultado = await romperBandejaAction(inputBase);

    expect(resultado).toEqual({
      ok: true,
      data: { bandejaId: BANDEJA_1_ID, unidadesDevueltas: 30, unidadesSinLote: 0 },
    });
    expect(romperBandejaRepoMock).toHaveBeenCalledWith({
      bandejaId: BANDEJA_1_ID,
      pesoExtraido: 1.9,
      origenes: [
        { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 18 },
        { galponId: GALPON_B_ID, loteId: LOTE_2_ID, cantidad: 12 },
      ],
      usuarioId: GERENTE_1_ID,
      ahora: AHORA,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "RoturaBandeja", accion: "ROMPER", entidadId: ROTURA_1_ID }),
    );
  });

  it("rechaza si la bandeja no existe, sin llegar a leer orígenes ni tocar el repository de escritura", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarBandejaPorIdMock.mockResolvedValue(null);

    const resultado = await romperBandejaAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "La bandeja no existe." });
    expect(buscarBandejaOrigenesPorBandejaIdMock).not.toHaveBeenCalled();
    expect(romperBandejaRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza si la bandeja ya no está DISPONIBLE (pre-chequeo)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarBandejaPorIdMock.mockResolvedValue({ id: BANDEJA_1_ID, estado: "VENDIDO" });

    const resultado = await romperBandejaAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "Esta bandeja ya no está disponible (fue vendida, rota o anulada).",
    });
    expect(romperBandejaRepoMock).not.toHaveBeenCalled();
  });

  it("traduce BandejaNoDisponibleError (carrera real) a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarBandejaPorIdMock.mockResolvedValue({ id: BANDEJA_1_ID, estado: "DISPONIBLE" });
    buscarBandejaOrigenesPorBandejaIdMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 30 },
    ]);
    romperBandejaRepoMock.mockRejectedValue(new BandejaNoDisponibleError());

    const resultado = await romperBandejaAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "Esta bandeja ya no está disponible — puede que ya la hayan roto o vendido justo ahora.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  it("reintento con el mismo pesoExtraido responde éxito idempotente, sin duplicar", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarBandejaPorIdMock.mockResolvedValue({ id: BANDEJA_1_ID, estado: "DISPONIBLE" });
    buscarBandejaOrigenesPorBandejaIdMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 30 },
    ]);
    romperBandejaRepoMock.mockRejectedValue(erroDeUnicidad());
    buscarRoturaBandejaPorBandejaIdMock.mockResolvedValue({
      id: ROTURA_1_ID,
      bandejaId: BANDEJA_1_ID,
      pesoExtraido: 1.9,
      unidadesDevueltas: 30,
    });

    const resultado = await romperBandejaAction(inputBase);

    expect(resultado).toEqual({
      ok: true,
      data: { bandejaId: BANDEJA_1_ID, unidadesDevueltas: 30, unidadesSinLote: 0 },
    });
    expect(romperBandejaRepoMock).toHaveBeenCalledTimes(1);
  });

  it("un OPERARIO puede romper una Bandeja (sin restricción de rol)", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));
    buscarBandejaPorIdMock.mockResolvedValue({ id: BANDEJA_1_ID, estado: "DISPONIBLE" });
    buscarBandejaOrigenesPorBandejaIdMock.mockResolvedValue([
      { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 30 },
    ]);
    romperBandejaRepoMock.mockResolvedValue({
      rotura: { id: ROTURA_1_ID, bandejaId: BANDEJA_1_ID, unidadesDevueltas: 30 },
      unidadesSinLote: 0,
    });

    const resultado = await romperBandejaAction(inputBase);

    expect(resultado.ok).toBe(true);
    expect(romperBandejaRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: OPERARIO_1_ID }),
    );
  });

  // Hallazgo de cobertura (S10-14, mismo patrón recurrente de Sprints
  // 7/8/9): las tres ramas de error de la rama idempotencia/carrera real
  // de romperBandejaAction son un mirror exacto de romperPaqueteAction,
  // pero ningún test las ejercitaba para Bandeja específicamente.
  describe("idempotencia / carrera real (P2002 sobre bandejaId)", () => {
    beforeEach(() => {
      buscarBandejaPorIdMock.mockResolvedValue({ id: BANDEJA_1_ID, estado: "DISPONIBLE" });
      buscarBandejaOrigenesPorBandejaIdMock.mockResolvedValue([
        { galponId: GALPON_A_ID, loteId: LOTE_1_ID, cantidad: 30 },
      ]);
    });

    it("carrera real con un pesoExtraido distinto se rechaza explícito, sin sobrescribir", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      romperBandejaRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarRoturaBandejaPorBandejaIdMock.mockResolvedValue({
        id: ROTURA_1_ID,
        bandejaId: BANDEJA_1_ID,
        pesoExtraido: 1.5, // distinto del pedido (1.9) — otro operario la rompió
        unidadesDevueltas: 30,
      });

      const resultado = await romperBandejaAction(inputBase);

      expect(resultado).toEqual({
        ok: false,
        error:
          "Esta bandeja ya fue rota (por otro operario, o hace un instante) con un peso distinto al que digitaste — no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("P2002 pero el registro ya no existe al releer propaga el error original", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      const error = erroDeUnicidad();
      romperBandejaRepoMock.mockRejectedValue(error);
      buscarRoturaBandejaPorBandejaIdMock.mockResolvedValue(null);

      await expect(romperBandejaAction(inputBase)).rejects.toThrow("Unique constraint failed");
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("cualquier otro error de Prisma (no P2002) se propaga tal cual, sin pasar por la rama idempotente", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      romperBandejaRepoMock.mockRejectedValue(new Error("conexión perdida"));

      await expect(romperBandejaAction(inputBase)).rejects.toThrow("conexión perdida");
      expect(buscarRoturaBandejaPorBandejaIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});
