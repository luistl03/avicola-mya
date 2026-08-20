import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que tests/integration/actions/recoleccion.ts.
// SaldoInsuficienteAjusteError se re-declara acá (no se importa la clase
// real) porque el mock completo del módulo reemplaza también esa
// exportación — la action importa la misma clase mockeada, así que el
// `instanceof` del catch de server/actions/inventario.ts sigue
// funcionando.
const {
  authMock,
  buscarSesionPorJtiMock,
  revocarSesionMock,
  crearAuditLogMock,
  headersMock,
  ajustarInventarioSueltosRepoMock,
  buscarMovimientoSueltosPorIdMock,
  buscarUbicacionActualMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  revocarSesionMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  ajustarInventarioSueltosRepoMock: vi.fn(),
  buscarMovimientoSueltosPorIdMock: vi.fn(),
  buscarUbicacionActualMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: revocarSesionMock,
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/inventario", () => ({
  ajustarInventarioSueltos: ajustarInventarioSueltosRepoMock,
  buscarMovimientoSueltosPorId: buscarMovimientoSueltosPorIdMock,
  SaldoInsuficienteAjusteError: class SaldoInsuficienteAjusteError extends Error {},
}));

// El galpón ya no lo elige el Gerente a mano — se resuelve automático vía
// buscarUbicacionActual(loteId), mismo patrón que
// tests/integration/actions/recoleccion.test.ts (corrección real
// post-diseño, S6-16).
vi.mock("@/server/repositories/lote", () => ({
  buscarUbicacionActual: buscarUbicacionActualMock,
}));

import { ajustarInventarioSueltosAction } from "@/server/actions/inventario";
import { SaldoInsuficienteAjusteError } from "@/server/repositories/inventario";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const GALPON_A_ID = crypto.randomUUID();
const LOTE_1_ID = crypto.randomUUID();
const AJUSTE_1_ID = crypto.randomUUID();

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

describe("ajustarInventarioSueltosAction", () => {
  const inputValido = {
    id: AJUSTE_1_ID,
    loteId: LOTE_1_ID,
    delta: 15,
    motivo: "Conteo físico encontró unidades sueltas no registradas",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    buscarUbicacionActualMock.mockResolvedValue({ galponId: GALPON_A_ID });
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Primera Server Action del proyecto restringida a un solo rol dentro
  // de un módulo por lo demás abierto (/recoleccion). El rol se chequea
  // ANTES del schema Zod en withAuth, así que ni siquiera hace falta un
  // input válido para que esta rama corte.
  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue({ ...sesionValida(), usuarioId: OPERARIO_1_ID });

    const resultado = await ajustarInventarioSueltosAction(inputValido);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(ajustarInventarioSueltosRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza un motivo de menos de 10 caracteres, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

    const resultado = await ajustarInventarioSueltosAction({ ...inputValido, motivo: "corto" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toBe("Datos inválidos.");
    }
    expect(ajustarInventarioSueltosRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza (defensivo) si el lote no tiene ubicación abierta, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarUbicacionActualMock.mockResolvedValue(null);

    const resultado = await ajustarInventarioSueltosAction(inputValido);

    expect(resultado).toEqual({ ok: false, error: "El lote no tiene una ubicación registrada." });
    expect(ajustarInventarioSueltosRepoMock).not.toHaveBeenCalled();
  });

  it("ajusta con delta positivo contra el galpón resuelto automáticamente y escribe AuditLog", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    ajustarInventarioSueltosRepoMock.mockResolvedValue({
      id: AJUSTE_1_ID,
      cantidad: 15,
      motivo: inputValido.motivo,
    });

    const resultado = await ajustarInventarioSueltosAction(inputValido);

    expect(resultado).toEqual({ ok: true, data: { id: AJUSTE_1_ID } });
    expect(ajustarInventarioSueltosRepoMock).toHaveBeenCalledWith({
      id: AJUSTE_1_ID,
      galponId: GALPON_A_ID,
      loteId: LOTE_1_ID,
      delta: 15,
      motivo: inputValido.motivo,
      usuarioId: GERENTE_1_ID,
      ahora: AHORA,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "MovimientoSueltos",
        accion: "AJUSTAR",
        entidadId: AJUSTE_1_ID,
      }),
    );
  });

  it("ajusta con delta negativo", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    ajustarInventarioSueltosRepoMock.mockResolvedValue({
      id: AJUSTE_1_ID,
      cantidad: -20,
      motivo: inputValido.motivo,
    });

    const resultado = await ajustarInventarioSueltosAction({ ...inputValido, delta: -20 });

    expect(resultado).toEqual({ ok: true, data: { id: AJUSTE_1_ID } });
    expect(ajustarInventarioSueltosRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -20 }),
    );
  });

  it("traduce SaldoInsuficienteAjusteError a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    ajustarInventarioSueltosRepoMock.mockRejectedValue(new SaldoInsuficienteAjusteError());

    const resultado = await ajustarInventarioSueltosAction({ ...inputValido, delta: -1000 });

    expect(resultado).toEqual({ ok: false, error: "El saldo no alcanza para este ajuste." });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  describe("idempotencia por id de cliente", () => {
    function erroDeUnicidad() {
      return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      });
    }

    it("reintento con el mismo id y los mismos datos devuelve el ajuste ya existente, sin duplicar nada", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      ajustarInventarioSueltosRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarMovimientoSueltosPorIdMock.mockResolvedValue({
        id: AJUSTE_1_ID,
        cantidad: 15,
        motivo: inputValido.motivo,
      });

      const resultado = await ajustarInventarioSueltosAction(inputValido);

      expect(resultado).toEqual({ ok: true, data: { id: AJUSTE_1_ID } });
      expect(ajustarInventarioSueltosRepoMock).toHaveBeenCalledTimes(1);
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "MovimientoSueltos", entidadId: AJUSTE_1_ID }),
      );
    });

    it("rechaza explícito si el mismo id ya existe pero con delta distinto (no es un reintento legítimo)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      ajustarInventarioSueltosRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarMovimientoSueltosPorIdMock.mockResolvedValue({
        id: AJUSTE_1_ID,
        cantidad: 999, // distinto del delta de inputValido (15)
        motivo: inputValido.motivo,
      });

      const resultado = await ajustarInventarioSueltosAction(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un ajuste con este id pero con datos diferentes - no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("rechaza explícito si el mismo id ya existe pero con motivo distinto", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      ajustarInventarioSueltosRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarMovimientoSueltosPorIdMock.mockResolvedValue({
        id: AJUSTE_1_ID,
        cantidad: 15,
        motivo: "Un motivo completamente distinto al reenviado",
      });

      const resultado = await ajustarInventarioSueltosAction(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un ajuste con este id pero con datos diferentes - no se sobrescribe.",
      });
    });

    it("propaga el error original si P2002 pero el ajuste no aparece en la lectura inmediata (caso imposible en la práctica)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      ajustarInventarioSueltosRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarMovimientoSueltosPorIdMock.mockResolvedValue(null);

      await expect(ajustarInventarioSueltosAction(inputValido)).rejects.toThrow(
        "Unique constraint failed",
      );
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("cualquier otro error de Prisma (no P2002) se propaga tal cual, sin pasar por la rama idempotente", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      ajustarInventarioSueltosRepoMock.mockRejectedValue(new Error("conexión perdida"));

      await expect(ajustarInventarioSueltosAction(inputValido)).rejects.toThrow("conexión perdida");
      expect(buscarMovimientoSueltosPorIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});
