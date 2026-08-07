import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que tests/integration/actions/galpon.test.ts y
// usuario.test.ts. Las guards puras de server/services/galpon.ts y
// server/services/lote.ts NO se mockean — se ejercitan reales.
const {
  authMock,
  buscarSesionPorJtiMock,
  revocarSesionMock,
  crearAuditLogMock,
  headersMock,
  buscarGalponPorIdMock,
  obtenerOcupacionGalponMock,
  buscarLotePorCodigoMock,
  buscarLotePorIdMock,
  buscarUbicacionActualMock,
  crearLoteConUbicacionMock,
  mudarLoteMock,
  finalizarLoteMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  revocarSesionMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarGalponPorIdMock: vi.fn(),
  obtenerOcupacionGalponMock: vi.fn(),
  buscarLotePorCodigoMock: vi.fn(),
  buscarLotePorIdMock: vi.fn(),
  buscarUbicacionActualMock: vi.fn(),
  crearLoteConUbicacionMock: vi.fn(),
  mudarLoteMock: vi.fn(),
  finalizarLoteMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: revocarSesionMock,
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/galpon", () => ({
  buscarGalponPorId: buscarGalponPorIdMock,
  obtenerOcupacionGalpon: obtenerOcupacionGalponMock,
}));

vi.mock("@/server/repositories/lote", () => ({
  buscarLotePorCodigo: buscarLotePorCodigoMock,
  buscarLotePorId: buscarLotePorIdMock,
  buscarUbicacionActual: buscarUbicacionActualMock,
  crearLoteConUbicacion: crearLoteConUbicacionMock,
  mudarLote: mudarLoteMock,
  finalizarLote: finalizarLoteMock,
}));

import { crearLote, finalizarLoteAction, mudarLoteAction } from "@/server/actions/lote";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const LOTE_1_ID = crypto.randomUUID();
const LOTE_INEXISTENTE_ID = crypto.randomUUID();
const GALPON_A_ID = crypto.randomUUID();
const GALPON_B_ID = crypto.randomUUID();
const GALPON_INEXISTENTE_ID = crypto.randomUUID();

function sesionValida() {
  return {
    id: "sesion-1",
    usuarioId: GERENTE_1_ID,
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

function ocupacion(avesPorLote: number[]) {
  return avesPorLote.map((avesVivas) => ({ lote: { avesVivas } }));
}

describe("Server Actions de lote (Sprint 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("crearLote", () => {
    // fechaIngreso fijo en el pasado (no "hoy"): AHORA (arriba) es
    // 2026-01-01T00:00:00.000Z, que en América/Lima (D5, UTC-5) todavía
    // es 2025-12-31 — crearLoteSchema ahora rechaza fechas futuras
    // (ver lib/zod/lote.ts), así que un valor pegado a AHORA correría
    // riesgo de caer justo en ese borde de zona horaria. "2025-06-01"
    // queda cómodamente en el pasado sin importar el huso horario.
    const inputValido = {
      codigo: "LOTE-001",
      fechaIngreso: "2025-06-01",
      avesIniciales: 200,
      edadInicialSemanas: 0,
      galponId: GALPON_A_ID,
    };

    it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

      const resultado = await crearLote(inputValido);

      expect(resultado).toEqual({ ok: false, error: "No autorizado." });
      expect(crearLoteConUbicacionMock).not.toHaveBeenCalled();
    });

    it("rechaza con un mensaje claro si el código ya existe (chequeo previo)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorCodigoMock.mockResolvedValue({ id: "otro" });

      const resultado = await crearLote(inputValido);

      expect(resultado).toEqual({ ok: false, error: "Ya existe un lote con ese código." });
      expect(crearLoteConUbicacionMock).not.toHaveBeenCalled();
    });

    it("rechaza igual si la creación choca con el índice único (carrera entre dos altas simultáneas)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorCodigoMock.mockResolvedValue(null);
      buscarGalponPorIdMock.mockResolvedValue({
        id: GALPON_A_ID,
        estado: "ACTIVO",
        capacidadMaxima: 1000,
      });
      obtenerOcupacionGalponMock.mockResolvedValue([]);
      crearLoteConUbicacionMock.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        }),
      );

      const resultado = await crearLote(inputValido);

      expect(resultado).toEqual({ ok: false, error: "Ya existe un lote con ese código." });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("rechaza si el galpón destino no existe", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorCodigoMock.mockResolvedValue(null);
      buscarGalponPorIdMock.mockResolvedValue(null);

      const resultado = await crearLote({ ...inputValido, galponId: GALPON_INEXISTENTE_ID });

      expect(resultado).toEqual({ ok: false, error: "El galpón no existe." });
      expect(crearLoteConUbicacionMock).not.toHaveBeenCalled();
    });

    it("rechaza si el galpón destino no está activo", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorCodigoMock.mockResolvedValue(null);
      buscarGalponPorIdMock.mockResolvedValue({
        id: GALPON_A_ID,
        estado: "INACTIVO",
        capacidadMaxima: 1000,
      });

      const resultado = await crearLote(inputValido);

      expect(resultado).toEqual({ ok: false, error: "El galpón no está activo." });
      expect(crearLoteConUbicacionMock).not.toHaveBeenCalled();
    });

    it("rechaza si supera la capacidad del galpón destino", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorCodigoMock.mockResolvedValue(null);
      buscarGalponPorIdMock.mockResolvedValue({
        id: GALPON_A_ID,
        estado: "ACTIVO",
        capacidadMaxima: 300,
      });
      obtenerOcupacionGalponMock.mockResolvedValue(ocupacion([250]));

      const resultado = await crearLote(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Supera la capacidad del galpón (450/300 aves).",
      });
      expect(crearLoteConUbicacionMock).not.toHaveBeenCalled();
    });

    it("crea el lote con su ubicación inicial y escribe AuditLog con entidad Lote", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorCodigoMock.mockResolvedValue(null);
      buscarGalponPorIdMock.mockResolvedValue({
        id: GALPON_A_ID,
        estado: "ACTIVO",
        capacidadMaxima: 1000,
      });
      obtenerOcupacionGalponMock.mockResolvedValue([]);
      crearLoteConUbicacionMock.mockResolvedValue([
        {
          id: LOTE_1_ID,
          codigo: "LOTE-001",
          fechaIngreso: new Date("2026-01-01"),
          avesIniciales: 200,
          avesVivas: 200,
          edadInicialSemanas: 0,
          estado: "ACTIVO",
        },
        { id: "historial-1" },
      ]);

      const resultado = await crearLote(inputValido);

      expect(resultado).toEqual({ ok: true, data: { id: LOTE_1_ID } });
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "Lote", accion: "CREAR", entidadId: LOTE_1_ID }),
      );
    });
  });

  describe("mudarLoteAction", () => {
    const inputValido = { loteId: LOTE_1_ID, galponDestinoId: GALPON_B_ID };

    it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

      const resultado = await mudarLoteAction(inputValido);

      expect(resultado).toEqual({ ok: false, error: "No autorizado." });
      expect(mudarLoteMock).not.toHaveBeenCalled();
    });

    it("rechaza si el lote no existe", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue(null);

      const resultado = await mudarLoteAction({ ...inputValido, loteId: LOTE_INEXISTENTE_ID });

      expect(resultado).toEqual({ ok: false, error: "El lote no existe." });
      expect(mudarLoteMock).not.toHaveBeenCalled();
    });

    it("rechaza mudar un lote INACTIVO", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({
        id: LOTE_1_ID,
        estado: "INACTIVO",
        avesVivas: 200,
      });
      buscarUbicacionActualMock.mockResolvedValue(null);

      const resultado = await mudarLoteAction(inputValido);

      expect(resultado).toEqual({ ok: false, error: "Solo se pueden mudar lotes activos." });
      expect(mudarLoteMock).not.toHaveBeenCalled();
    });

    it("rechaza mudar un lote al mismo galpón donde ya está", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 200 });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_B_ID });

      const resultado = await mudarLoteAction(inputValido);

      expect(resultado).toEqual({ ok: false, error: "El lote ya está en ese galpón." });
      expect(buscarGalponPorIdMock).not.toHaveBeenCalled();
      expect(mudarLoteMock).not.toHaveBeenCalled();
    });

    it("rechaza si el galpón destino no existe", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 200 });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      buscarGalponPorIdMock.mockResolvedValue(null);

      const resultado = await mudarLoteAction(inputValido);

      expect(resultado).toEqual({ ok: false, error: "El galpón destino no existe." });
      expect(mudarLoteMock).not.toHaveBeenCalled();
    });

    it("rechaza si el galpón destino no está activo", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 200 });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      buscarGalponPorIdMock.mockResolvedValue({
        id: GALPON_B_ID,
        estado: "INACTIVO",
        capacidadMaxima: 1000,
      });

      const resultado = await mudarLoteAction(inputValido);

      expect(resultado).toEqual({ ok: false, error: "El galpón no está activo." });
      expect(mudarLoteMock).not.toHaveBeenCalled();
    });

    it("rechaza si supera la capacidad del galpón destino", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 200 });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      buscarGalponPorIdMock.mockResolvedValue({
        id: GALPON_B_ID,
        estado: "ACTIVO",
        capacidadMaxima: 300,
      });
      obtenerOcupacionGalponMock.mockResolvedValue(ocupacion([250]));

      const resultado = await mudarLoteAction(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Supera la capacidad del galpón (450/300 aves).",
      });
      expect(mudarLoteMock).not.toHaveBeenCalled();
    });

    it("muda el lote: cierra la ubicación vieja y abre la nueva en la misma transacción", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 200 });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      buscarGalponPorIdMock.mockResolvedValue({
        id: GALPON_B_ID,
        estado: "ACTIVO",
        capacidadMaxima: 1000,
      });
      obtenerOcupacionGalponMock.mockResolvedValue([]);
      mudarLoteMock.mockResolvedValue([{ count: 1 }, { id: "historial-2" }]);

      const resultado = await mudarLoteAction(inputValido);

      expect(resultado).toEqual({ ok: true, data: { id: LOTE_1_ID } });
      expect(mudarLoteMock).toHaveBeenCalledWith(LOTE_1_ID, GALPON_B_ID, AHORA);
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "Lote", accion: "MUDAR", entidadId: LOTE_1_ID }),
      );
    });
  });

  describe("finalizarLoteAction", () => {
    it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

      const resultado = await finalizarLoteAction({ loteId: LOTE_1_ID });

      expect(resultado).toEqual({ ok: false, error: "No autorizado." });
      expect(finalizarLoteMock).not.toHaveBeenCalled();
    });

    it("rechaza si el lote no existe", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue(null);

      const resultado = await finalizarLoteAction({ loteId: LOTE_INEXISTENTE_ID });

      expect(resultado).toEqual({ ok: false, error: "El lote no existe." });
      expect(finalizarLoteMock).not.toHaveBeenCalled();
    });

    it("rechaza re-finalizar un lote ya INACTIVO", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({
        id: LOTE_1_ID,
        estado: "INACTIVO",
        avesVivas: 0,
      });

      const resultado = await finalizarLoteAction({ loteId: LOTE_1_ID });

      expect(resultado).toEqual({ ok: false, error: "El lote ya está finalizado." });
      expect(finalizarLoteMock).not.toHaveBeenCalled();
    });

    it("permite finalizar un lote ACTIVO con avesVivas > 0 (decisión de negocio confirmada en spec.md)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({
        id: LOTE_1_ID,
        estado: "ACTIVO",
        avesVivas: 500,
      });
      finalizarLoteMock.mockResolvedValue([
        { id: LOTE_1_ID, estado: "INACTIVO" },
        { count: 1 },
      ]);

      const resultado = await finalizarLoteAction({ loteId: LOTE_1_ID });

      expect(resultado).toEqual({ ok: true, data: { id: LOTE_1_ID } });
      expect(finalizarLoteMock).toHaveBeenCalledWith(LOTE_1_ID, AHORA);
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "Lote", accion: "FINALIZAR", entidadId: LOTE_1_ID }),
      );
    });
  });
});
