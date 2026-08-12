import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que tests/integration/actions/mortalidad.test.ts.
// Los services puros de server/services/recoleccion.ts (calcularEmpaque,
// puedeRegistrarRecoleccion) NO se mockean — se ejercitan reales, mismo
// criterio que la guard de mortalidad.
const {
  authMock,
  buscarSesionPorJtiMock,
  revocarSesionMock,
  crearAuditLogMock,
  headersMock,
  buscarLotePorIdMock,
  buscarUbicacionActualMock,
  registrarRecoleccionRepoMock,
  buscarRecoleccionConPaquetesPorIdMock,
  revertirRecoleccionRepoMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  revocarSesionMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarLotePorIdMock: vi.fn(),
  buscarUbicacionActualMock: vi.fn(),
  registrarRecoleccionRepoMock: vi.fn(),
  buscarRecoleccionConPaquetesPorIdMock: vi.fn(),
  revertirRecoleccionRepoMock: vi.fn(),
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

// Sprint 6: las tres clases de error se re-declaran acá (no se importa la
// clase real) porque el mock completo del módulo reemplaza también esas
// exportaciones — la action importa la misma clase mockeada, así que el
// `instanceof` de los catch de server/actions/recoleccion.ts sigue
// funcionando. Mismo patrón que YaRevertidoError en mortalidad.test.ts.
vi.mock("@/server/repositories/recoleccion", () => ({
  registrarRecoleccion: registrarRecoleccionRepoMock,
  buscarRecoleccionConPaquetesPorId: buscarRecoleccionConPaquetesPorIdMock,
  revertirRecoleccion: revertirRecoleccionRepoMock,
  YaRevertidoError: class YaRevertidoError extends Error {},
  PaquetesNoDisponiblesError: class PaquetesNoDisponiblesError extends Error {},
  SaldoInsuficienteError: class SaldoInsuficienteError extends Error {},
}));

import { registrarRecoleccion, revertirRecoleccionAction } from "@/server/actions/recoleccion";
import {
  PaquetesNoDisponiblesError,
  SaldoInsuficienteError,
  YaRevertidoError,
} from "@/server/repositories/recoleccion";

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

describe("registrarRecoleccion", () => {
  // 470 -> calcularEmpaque = { paquetes: 2, sueltos: 110 } (2*180=360, resto 110).
  const inputValido = {
    id: REGISTRO_1_ID,
    loteId: LOTE_1_ID,
    cantidadTotal: 470,
    creadoEnCliente: new Date("2025-12-31T23:50:00.000Z"),
    pesos: [12.5, 12.7],
  };

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

    const resultado = await registrarRecoleccion({ ...inputValido, loteId: LOTE_INEXISTENTE_ID });

    expect(resultado).toEqual({ ok: false, error: "El lote no existe." });
    expect(registrarRecoleccionRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza registrar recolección de un lote INACTIVO, sin siquiera resolver la ubicación", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "INACTIVO" });

    const resultado = await registrarRecoleccion(inputValido);

    expect(resultado).toEqual({
      ok: false,
      error: "Solo se puede registrar recolección de un lote activo.",
    });
    expect(buscarUbicacionActualMock).not.toHaveBeenCalled();
    expect(registrarRecoleccionRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza si la cantidad de pesos no coincide con calcularEmpaque(cantidadTotal), sin resolver ubicación", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO" });

    // cantidadTotal 470 espera 2 pesos (paquetes), acá llega solo 1 — un
    // cálculo de cliente desactualizado, o un payload manipulado.
    const resultado = await registrarRecoleccion({ ...inputValido, pesos: [12.5] });

    expect(resultado).toEqual({
      ok: false,
      error: "Se esperaban 2 pesos de paquete, se recibieron 1.",
    });
    expect(buscarUbicacionActualMock).not.toHaveBeenCalled();
    expect(registrarRecoleccionRepoMock).not.toHaveBeenCalled();
  });

  it("acepta un arreglo de pesos vacío cuando cantidadTotal < 180 (cero paquetes esperados)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO" });
    buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
    registrarRecoleccionRepoMock.mockResolvedValue({
      registro: { id: REGISTRO_1_ID, cantidadTotal: 45 },
      paquetes: [],
    });

    const resultado = await registrarRecoleccion({ ...inputValido, cantidadTotal: 45, pesos: [] });

    expect(resultado).toEqual({
      ok: true,
      data: { id: REGISTRO_1_ID, paquetesCreados: 0, sueltos: 45 },
    });
  });

  it("rechaza (defensivo) si el lote ACTIVO no tiene ubicación abierta", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO" });
    buscarUbicacionActualMock.mockResolvedValue(null);

    const resultado = await registrarRecoleccion(inputValido);

    expect(resultado).toEqual({ ok: false, error: "El lote no tiene una ubicación registrada." });
    expect(registrarRecoleccionRepoMock).not.toHaveBeenCalled();
  });

  it("registra la recolección contra el galpón resuelto automáticamente y escribe AuditLog", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO" });
    buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
    registrarRecoleccionRepoMock.mockResolvedValue({
      registro: { id: REGISTRO_1_ID, cantidadTotal: 470 },
      paquetes: [{ id: "p1" }, { id: "p2" }],
    });

    const resultado = await registrarRecoleccion(inputValido);

    expect(resultado).toEqual({
      ok: true,
      data: { id: REGISTRO_1_ID, paquetesCreados: 2, sueltos: 110 },
    });
    expect(registrarRecoleccionRepoMock).toHaveBeenCalledWith({
      id: REGISTRO_1_ID,
      loteId: LOTE_1_ID,
      galponId: GALPON_A_ID,
      usuarioId: GERENTE_1_ID,
      cantidadTotal: 470,
      creadoEnCliente: inputValido.creadoEnCliente,
      pesos: [12.5, 12.7],
      sueltos: 110,
      ahora: AHORA,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "RegistroRecoleccion",
        accion: "CREAR",
        entidadId: REGISTRO_1_ID,
      }),
    );
  });

  // Sin restricción de rol (decisión de negocio en spec.md), mismo
  // criterio que registrarMortalidad (Sprint 4).
  it("permite que un OPERARIO registre recolección, sin restricción de rol", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue({ ...sesionValida(), usuarioId: OPERARIO_1_ID });
    buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO" });
    buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
    registrarRecoleccionRepoMock.mockResolvedValue({
      registro: { id: REGISTRO_1_ID, cantidadTotal: 470 },
      paquetes: [{ id: "p1" }, { id: "p2" }],
    });

    const resultado = await registrarRecoleccion(inputValido);

    expect(resultado).toEqual({
      ok: true,
      data: { id: REGISTRO_1_ID, paquetesCreados: 2, sueltos: 110 },
    });
    expect(registrarRecoleccionRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: OPERARIO_1_ID }),
    );
  });

  describe("idempotencia por id de cliente (Contrato Offline-Ready)", () => {
    function erroDeUnicidad() {
      return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      });
    }

    it("reintento con el mismo id y los mismos datos devuelve el registro ya existente, sin duplicar nada", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO" });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      registrarRecoleccionRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue({
        id: REGISTRO_1_ID,
        cantidadTotal: 470,
        paquetes: [{ id: "p1" }, { id: "p2" }],
      });

      const resultado = await registrarRecoleccion(inputValido);

      expect(resultado).toEqual({
        ok: true,
        data: { id: REGISTRO_1_ID, paquetesCreados: 2, sueltos: 110 },
      });
      // No se re-invoca la escritura real (el mock rechazó la única vez
      // que se llamó) — el resultado sale de la lectura idempotente.
      expect(registrarRecoleccionRepoMock).toHaveBeenCalledTimes(1);
      // Nota aceptada (ver actions/recoleccion.ts): un reintento igual
      // deja una segunda fila CREAR en AuditLog, mismo trade-off que R3.
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "RegistroRecoleccion", entidadId: REGISTRO_1_ID }),
      );
    });

    it("rechaza explícito si el mismo id ya existe pero con cantidadTotal distinto (no es un reintento legítimo)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO" });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      registrarRecoleccionRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue({
        id: REGISTRO_1_ID,
        cantidadTotal: 999, // distinto del cantidadTotal de inputValido (470)
        paquetes: [],
      });

      const resultado = await registrarRecoleccion(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("propaga el error original si P2002 pero el registro no aparece en la lectura inmediata (caso imposible en la práctica)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO" });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      registrarRecoleccionRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(null);

      await expect(registrarRecoleccion(inputValido)).rejects.toThrow("Unique constraint failed");
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("cualquier otro error de Prisma (no P2002) se propaga tal cual, sin pasar por la rama idempotente", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarLotePorIdMock.mockResolvedValue({ id: LOTE_1_ID, estado: "ACTIVO" });
      buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
      registrarRecoleccionRepoMock.mockRejectedValue(new Error("conexión perdida"));

      await expect(registrarRecoleccion(inputValido)).rejects.toThrow("conexión perdida");
      expect(buscarRecoleccionConPaquetesPorIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});

describe("revertirRecoleccionAction", () => {
  const REGISTRO_INEXISTENTE_ID = crypto.randomUUID();

  // 470 -> calcularEmpaque = { paquetes: 2, sueltos: 110 }, mismo
  // cantidadTotal que inputValido de registrarRecoleccion arriba.
  function registroBase(overrides: Partial<{
    revertido: boolean;
    creadoEn: Date;
    cantidadTotal: number;
    paquetes: { id: string; estado: string }[];
  }> = {}) {
    return {
      id: REGISTRO_1_ID,
      galponId: GALPON_A_ID,
      loteId: LOTE_1_ID,
      cantidadTotal: 470,
      creadoEn: AHORA,
      revertido: false,
      paquetes: [
        { id: "p1", estado: "DISPONIBLE" },
        { id: "p2", estado: "DISPONIBLE" },
      ],
      ...overrides,
    };
  }

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
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(null);

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_INEXISTENTE_ID });

    expect(resultado).toEqual({ ok: false, error: "El registro no existe." });
    expect(revertirRecoleccionRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza un registro ya revertido, sin llamar al repository", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(
      registroBase({ revertido: true, creadoEn: new Date(AHORA.getTime() - 60_000) }),
    );

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({ ok: false, error: "Este registro ya fue revertido." });
    expect(revertirRecoleccionRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza por completo si algún paquete ya no está DISPONIBLE, sin llamar al repository (todo o nada)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(
      registroBase({
        paquetes: [
          { id: "p1", estado: "VENDIDO" },
          { id: "p2", estado: "DISPONIBLE" },
        ],
      }),
    );

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({
      ok: false,
      error:
        "Ya se vendió o rompió al menos un paquete de este registro — no se puede corregir automáticamente.",
    });
    expect(revertirRecoleccionRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza revertir pasada la ventana de 10 minutos", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const hace11min = new Date(AHORA.getTime() - 11 * 60_000);
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(registroBase({ creadoEn: hace11min }));

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({
      ok: false,
      error: "La ventana de 10 minutos para deshacer este registro ya pasó.",
    });
    expect(revertirRecoleccionRepoMock).not.toHaveBeenCalled();
  });

  it("traduce YaRevertidoError (carrera detectada por el UPDATE condicional) a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(registroBase());
    revertirRecoleccionRepoMock.mockRejectedValue(new YaRevertidoError());

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({
      ok: false,
      error: "Este registro ya fue revertido — actualizá la pantalla.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  it("traduce PaquetesNoDisponiblesError (carrera: un paquete se vendió justo en el medio) a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(registroBase());
    revertirRecoleccionRepoMock.mockRejectedValue(new PaquetesNoDisponiblesError());

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({
      ok: false,
      error:
        "Ya se vendió o rompió al menos un paquete de este registro — actualizá la pantalla e intentá de nuevo.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  it("traduce SaldoInsuficienteError a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(registroBase());
    revertirRecoleccionRepoMock.mockRejectedValue(new SaldoInsuficienteError());

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({
      ok: false,
      error: "El saldo de sueltos ya no alcanza para deshacer este registro.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  it("revierte dentro de la ventana, recalcula sueltos vía calcularEmpaque y escribe AuditLog", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const hace5min = new Date(AHORA.getTime() - 5 * 60_000);
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(registroBase({ creadoEn: hace5min }));
    revertirRecoleccionRepoMock.mockResolvedValue(undefined);

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({ ok: true, data: { id: REGISTRO_1_ID } });
    expect(revertirRecoleccionRepoMock).toHaveBeenCalledWith({
      id: REGISTRO_1_ID,
      galponId: GALPON_A_ID,
      loteId: LOTE_1_ID,
      sueltos: 110, // calcularEmpaque(470).sueltos — real, no mockeado
      usuarioId: GERENTE_1_ID,
      ahora: AHORA,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "RegistroRecoleccion",
        accion: "REVERTIR",
        entidadId: REGISTRO_1_ID,
      }),
    );
  });

  it("revierte un registro múltiplo exacto de 180 (sueltos = 0) pasando sueltos: 0 al repository", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(registroBase({ cantidadTotal: 360 }));
    revertirRecoleccionRepoMock.mockResolvedValue(undefined);

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({ ok: true, data: { id: REGISTRO_1_ID } });
    expect(revertirRecoleccionRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ sueltos: 0 }),
    );
  });

  // Sin restricción de rol (decisión de negocio en spec.md), mismo
  // criterio que revertirMortalidadAction.
  it("permite que un OPERARIO revierta, sin restricción de rol", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue({ ...sesionValida(), usuarioId: OPERARIO_1_ID });
    buscarRecoleccionConPaquetesPorIdMock.mockResolvedValue(registroBase());
    revertirRecoleccionRepoMock.mockResolvedValue(undefined);

    const resultado = await revertirRecoleccionAction({ registroId: REGISTRO_1_ID });

    expect(resultado).toEqual({ ok: true, data: { id: REGISTRO_1_ID } });
    expect(revertirRecoleccionRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: OPERARIO_1_ID }),
    );
  });
});
