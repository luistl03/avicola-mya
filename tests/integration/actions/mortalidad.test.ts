import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que tests/integration/actions/lote.test.ts. La
// guard pura de server/services/mortalidad.ts NO se mockea — se ejercita
// real. AvesInsuficientesError se re-declara acá (no se importa la clase
// real) porque el mock completo del módulo reemplaza también esa
// exportación — la action importa la misma clase mockeada, así que el
// `instanceof` sigue funcionando.
const {
  authMock,
  buscarSesionPorJtiMock,
  revocarSesionMock,
  crearAuditLogMock,
  headersMock,
  buscarLotePorIdMock,
  buscarUbicacionActualMock,
  registrarMortalidadYDescontarAvesMock,
  buscarRegistroMortalidadPorIdMock,
  revertirMortalidadMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  revocarSesionMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarLotePorIdMock: vi.fn(),
  buscarUbicacionActualMock: vi.fn(),
  registrarMortalidadYDescontarAvesMock: vi.fn(),
  buscarRegistroMortalidadPorIdMock: vi.fn(),
  revertirMortalidadMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: revocarSesionMock,
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/lote", () => ({
  buscarLotePorId: buscarLotePorIdMock,
  buscarUbicacionActual: buscarUbicacionActualMock,
}));

vi.mock("@/server/repositories/mortalidad", () => ({
  AvesInsuficientesError: class AvesInsuficientesError extends Error {},
  YaRevertidoError: class YaRevertidoError extends Error {},
  registrarMortalidadYDescontarAves: registrarMortalidadYDescontarAvesMock,
  buscarRegistroMortalidadPorId: buscarRegistroMortalidadPorIdMock,
  revertirMortalidad: revertirMortalidadMock,
}));

import { registrarMortalidad, revertirMortalidadAction } from "@/server/actions/mortalidad";
import { AvesInsuficientesError, YaRevertidoError } from "@/server/repositories/mortalidad";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const LOTE_1_ID = crypto.randomUUID();
const LOTE_INEXISTENTE_ID = crypto.randomUUID();
const GALPON_A_ID = crypto.randomUUID();
const REGISTRO_1_ID = crypto.randomUUID();

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

describe("registrarMortalidad", () => {
  const inputValido = { id: REGISTRO_1_ID, loteId: LOTE_1_ID, tipo: "MUERTE", cantidad: 3 };

  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rechaza si el lote no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue(null);

    const resultado = await registrarMortalidad({ ...inputValido, loteId: LOTE_INEXISTENTE_ID });

    expect(resultado).toEqual({ ok: false, error: "El lote no existe." });
    expect(registrarMortalidadYDescontarAvesMock).not.toHaveBeenCalled();
  });

  it("rechaza registrar mortalidad de un lote INACTIVO, sin siquiera resolver la ubicación", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "INACTIVO", avesVivas: 100 });

    const resultado = await registrarMortalidad(inputValido);

    expect(resultado).toEqual({
      ok: false,
      error: "Solo se puede registrar mortalidad de un lote activo.",
    });
    expect(buscarUbicacionActualMock).not.toHaveBeenCalled();
    expect(registrarMortalidadYDescontarAvesMock).not.toHaveBeenCalled();
  });

  it("rechaza una cantidad mayor a las aves vivas, con el número real en el mensaje", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 5 });

    const resultado = await registrarMortalidad({ ...inputValido, cantidad: 10 });

    expect(resultado).toEqual({
      ok: false,
      error: "Solo quedan 5 aves vivas en este lote.",
    });
    expect(registrarMortalidadYDescontarAvesMock).not.toHaveBeenCalled();
  });

  it("rechaza (defensivo) si el lote ACTIVO no tiene ubicación abierta", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 100 });
    buscarUbicacionActualMock.mockResolvedValue(null);

    const resultado = await registrarMortalidad(inputValido);

    expect(resultado).toEqual({ ok: false, error: "El lote no tiene una ubicación registrada." });
    expect(registrarMortalidadYDescontarAvesMock).not.toHaveBeenCalled();
  });

  it("traduce AvesInsuficientesError (carrera detectada por el UPDATE condicional) a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 5 });
    buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
    registrarMortalidadYDescontarAvesMock.mockRejectedValue(new AvesInsuficientesError());

    const resultado = await registrarMortalidad({ ...inputValido, cantidad: 5 });

    expect(resultado).toEqual({
      ok: false,
      error:
        "Ya no quedan suficientes aves vivas para este registro — actualizá la pantalla e intentá de nuevo.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  it("registra la mortalidad contra el galpón resuelto automáticamente y escribe AuditLog", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 200 });
    buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
    registrarMortalidadYDescontarAvesMock.mockResolvedValue({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      galponId: GALPON_A_ID,
      usuarioId: GERENTE_1_ID,
      tipo: "MUERTE",
      cantidad: 3,
      fecha: AHORA,
    });

    const resultado = await registrarMortalidad(inputValido);

    expect(resultado).toEqual({ ok: true, data: { id: REGISTRO_1_ID } });
    expect(registrarMortalidadYDescontarAvesMock).toHaveBeenCalledWith({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      galponId: GALPON_A_ID,
      usuarioId: GERENTE_1_ID,
      tipo: "MUERTE",
      cantidad: 3,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "RegistroMortalidad",
        accion: "CREAR",
        entidadId: REGISTRO_1_ID,
      }),
    );
  });

  // Sin restricción de rol (decisión de negocio en spec.md): a diferencia
  // de Galpón/Lote (Sprint 3), un OPERARIO no es rechazado acá.
  it("permite que un OPERARIO registre mortalidad, sin restricción de rol", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue({ ...sesionValida(), usuarioId: OPERARIO_1_ID });
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 200 });
    buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
    registrarMortalidadYDescontarAvesMock.mockResolvedValue({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      galponId: GALPON_A_ID,
      usuarioId: OPERARIO_1_ID,
      tipo: "MUERTE",
      cantidad: 3,
      fecha: AHORA,
    });

    const resultado = await registrarMortalidad(inputValido);

    expect(resultado).toEqual({ ok: true, data: { id: REGISTRO_1_ID } });
    expect(registrarMortalidadYDescontarAvesMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: OPERARIO_1_ID }),
    );
  });

  // Idempotencia por id de cliente (auditoría post-Sprint 5, ver
  // memory/estado-proyecto.md — el hallazgo de mayor severidad de los
  // auditados: sin esto, un doble envío decrementaba avesVivas dos
  // veces, no solo duplicaba la fila).
  describe("idempotencia por id de cliente", () => {
    function erroDeUnicidad() {
      return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      });
    }

    it("reintento con el mismo id y los mismos datos devuelve el registro ya existente, sin volver a decrementar avesVivas", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 200 });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      registrarMortalidadYDescontarAvesMock.mockRejectedValue(erroDeUnicidad());
      buscarRegistroMortalidadPorIdMock.mockResolvedValue({
        id: REGISTRO_1_ID,
        loteId: LOTE_1_ID,
        tipo: "MUERTE",
        cantidad: 3,
      });

      const resultado = await registrarMortalidad(inputValido);

      expect(resultado).toEqual({ ok: true, data: { id: REGISTRO_1_ID } });
      expect(registrarMortalidadYDescontarAvesMock).toHaveBeenCalledTimes(1);
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "RegistroMortalidad", entidadId: REGISTRO_1_ID }),
      );
    });

    it("rechaza explícito si el mismo id ya existe pero con datos distintos", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO", avesVivas: 200 });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      registrarMortalidadYDescontarAvesMock.mockRejectedValue(erroDeUnicidad());
      buscarRegistroMortalidadPorIdMock.mockResolvedValue({
        id: REGISTRO_1_ID,
        loteId: LOTE_1_ID,
        tipo: "DESCARTE", // distinto del "MUERTE" de inputValido
        cantidad: 3,
      });

      const resultado = await registrarMortalidad(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});

describe("revertirMortalidadAction", () => {
  const REGISTRO_INEXISTENTE_ID = crypto.randomUUID();

  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rechaza si el registro no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarRegistroMortalidadPorIdMock.mockResolvedValue(null);

    const resultado = await revertirMortalidadAction({ registroId: REGISTRO_INEXISTENTE_ID });

    expect(resultado).toEqual({ ok: false, error: "El registro no existe." });
    expect(revertirMortalidadMock).not.toHaveBeenCalled();
  });

  it("rechaza un registro ya revertido", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarRegistroMortalidadPorIdMock.mockResolvedValue({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      cantidad: 3,
      fecha: AHORA,
      revertido: true,
    });

    const resultado = await revertirMortalidadAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({ ok: false, error: "Este registro ya fue revertido." });
    expect(revertirMortalidadMock).not.toHaveBeenCalled();
  });

  it("rechaza revertir pasada la ventana de 10 minutos", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const hace11min = new Date(AHORA.getTime() - 11 * 60_000);
    buscarRegistroMortalidadPorIdMock.mockResolvedValue({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      cantidad: 3,
      fecha: hace11min,
      revertido: false,
    });

    const resultado = await revertirMortalidadAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({
      ok: false,
      error: "La ventana de 10 minutos para deshacer este registro ya pasó.",
    });
    expect(revertirMortalidadMock).not.toHaveBeenCalled();
  });

  it("traduce YaRevertidoError (carrera detectada por el UPDATE condicional) a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarRegistroMortalidadPorIdMock.mockResolvedValue({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      cantidad: 3,
      fecha: AHORA,
      revertido: false,
    });
    revertirMortalidadMock.mockRejectedValue(new YaRevertidoError());

    const resultado = await revertirMortalidadAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({
      ok: false,
      error: "Este registro ya fue revertido — actualizá la pantalla.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  it("revierte dentro de la ventana, restaura avesVivas y escribe AuditLog", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const hace5min = new Date(AHORA.getTime() - 5 * 60_000);
    buscarRegistroMortalidadPorIdMock.mockResolvedValue({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      cantidad: 3,
      fecha: hace5min,
      revertido: false,
    });
    revertirMortalidadMock.mockResolvedValue({ id: LOTE_1_ID, avesVivas: 203 });

    const resultado = await revertirMortalidadAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({ ok: true, data: { id: REGISTRO_1_ID } });
    expect(revertirMortalidadMock).toHaveBeenCalledWith({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      cantidad: 3,
      ahora: AHORA,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "RegistroMortalidad",
        accion: "REVERTIR",
        entidadId: REGISTRO_1_ID,
      }),
    );
  });

  // Sin restricción de rol, mismo criterio que registrarMortalidad.
  it("permite que un OPERARIO revierta, sin restricción de rol", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue({ ...sesionValida(), usuarioId: OPERARIO_1_ID });
    buscarRegistroMortalidadPorIdMock.mockResolvedValue({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      cantidad: 3,
      fecha: AHORA,
      revertido: false,
    });
    revertirMortalidadMock.mockResolvedValue({ id: LOTE_1_ID, avesVivas: 203 });

    const resultado = await revertirMortalidadAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({ ok: true, data: { id: REGISTRO_1_ID } });
  });
});
