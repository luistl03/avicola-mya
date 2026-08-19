import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que egreso.test.ts/credito.test.ts.
// SueldoMovimientoYaRevertidoError se re-declara acá (no se importa la
// clase real) porque el mock completo del módulo reemplaza también esa
// exportación. server/services/sueldo-movimiento.ts NO se mockea — se
// ejercita real (puedeRevertirSueldoMovimiento).
const {
  authMock,
  buscarSesionPorJtiMock,
  crearAuditLogMock,
  headersMock,
  buscarEmpleadoPorIdMock,
  buscarSueldoMovimientoPorIdMock,
  crearSueldoMovimientoRepoMock,
  revertirSueldoMovimientoRepoMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarEmpleadoPorIdMock: vi.fn(),
  buscarSueldoMovimientoPorIdMock: vi.fn(),
  crearSueldoMovimientoRepoMock: vi.fn(),
  revertirSueldoMovimientoRepoMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: vi.fn(),
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/empleado", () => ({
  buscarEmpleadoPorId: buscarEmpleadoPorIdMock,
}));

vi.mock("@/server/repositories/sueldo-movimiento", () => ({
  SueldoMovimientoYaRevertidoError: class SueldoMovimientoYaRevertidoError extends Error {},
  crearSueldoMovimiento: crearSueldoMovimientoRepoMock,
  revertirSueldoMovimiento: revertirSueldoMovimientoRepoMock,
  buscarSueldoMovimientoPorId: buscarSueldoMovimientoPorIdMock,
}));

import {
  crearSueldoMovimientoAction,
  revertirSueldoMovimientoAction,
} from "@/server/actions/sueldo-movimiento";
import { SueldoMovimientoYaRevertidoError } from "@/server/repositories/sueldo-movimiento";

const AHORA = new Date("2026-01-01T00:10:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const EMPLEADO_1_ID = crypto.randomUUID();
const MOVIMIENTO_1_ID = crypto.randomUUID();

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

function empleadoActivo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EMPLEADO_1_ID,
    nombre: "Juana Pérez",
    celular: null,
    cargo: null,
    usuarioId: null,
    estado: "ACTIVO" as const,
    ...overrides,
  };
}

function movimientoExistente(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MOVIMIENTO_1_ID,
    empleadoId: EMPLEADO_1_ID,
    tipo: "ADELANTO" as const,
    monto: 100,
    fecha: new Date("2026-01-01T00:05:00.000Z"), // 5 min antes de AHORA
    descripcion: "Adelanto de quincena",
    revertido: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  headersMock.mockResolvedValue(new Headers());
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});

describe("crearSueldoMovimientoAction", () => {
  const inputBase = {
    id: MOVIMIENTO_1_ID,
    empleadoId: EMPLEADO_1_ID,
    tipo: "ADELANTO" as const,
    monto: 100,
    descripcion: "Adelanto de quincena",
  };

  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await crearSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(crearSueldoMovimientoRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza si el empleado no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEmpleadoPorIdMock.mockResolvedValue(null);

    const resultado = await crearSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "El empleado no existe." });
    expect(crearSueldoMovimientoRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza si el empleado está INACTIVO — decisión 6, forzando el payload directo", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEmpleadoPorIdMock.mockResolvedValue(empleadoActivo({ estado: "INACTIVO" }));

    const resultado = await crearSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "No se puede registrar un movimiento para un empleado inactivo.",
    });
    expect(crearSueldoMovimientoRepoMock).not.toHaveBeenCalled();
  });

  it("crea un movimiento contra un empleado ACTIVO y escribe AuditLog CREAR", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEmpleadoPorIdMock.mockResolvedValue(empleadoActivo());
    crearSueldoMovimientoRepoMock.mockResolvedValue(movimientoExistente());

    const resultado = await crearSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({ ok: true, data: { id: MOVIMIENTO_1_ID } });
    expect(crearSueldoMovimientoRepoMock).toHaveBeenCalledWith(inputBase);
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "SueldoMovimiento",
        accion: "CREAR",
        entidadId: MOVIMIENTO_1_ID,
      }),
    );
  });

  describe("idempotencia / carrera real (P2002 sobre SueldoMovimiento.id)", () => {
    beforeEach(() => {
      buscarEmpleadoPorIdMock.mockResolvedValue(empleadoActivo());
    });

    it("reintento con el mismo payload responde éxito idempotente, sin duplicar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearSueldoMovimientoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarSueldoMovimientoPorIdMock.mockResolvedValue(movimientoExistente());

      const resultado = await crearSueldoMovimientoAction(inputBase);

      expect(resultado).toEqual({ ok: true, data: { id: MOVIMIENTO_1_ID } });
      expect(crearSueldoMovimientoRepoMock).toHaveBeenCalledTimes(1);
    });

    it("P2002 con datos distintos (monto) se rechaza explícito, sin sobrescribir", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearSueldoMovimientoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarSueldoMovimientoPorIdMock.mockResolvedValue(movimientoExistente({ monto: 999 }));

      const resultado = await crearSueldoMovimientoAction(inputBase);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un movimiento con este id pero con datos diferentes — no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("P2002 pero el registro ya no existe al releer propaga el error original", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearSueldoMovimientoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarSueldoMovimientoPorIdMock.mockResolvedValue(null);

      await expect(crearSueldoMovimientoAction(inputBase)).rejects.toThrow("Unique constraint failed");
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("cualquier otro error de Prisma (no P2002) se propaga tal cual", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearSueldoMovimientoRepoMock.mockRejectedValue(new Error("conexión perdida"));

      await expect(crearSueldoMovimientoAction(inputBase)).rejects.toThrow("conexión perdida");
      expect(buscarSueldoMovimientoPorIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});

describe("revertirSueldoMovimientoAction", () => {
  const inputBase = { id: MOVIMIENTO_1_ID };

  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await revertirSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(revertirSueldoMovimientoRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza si el movimiento no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarSueldoMovimientoPorIdMock.mockResolvedValue(null);

    const resultado = await revertirSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "El movimiento no existe." });
    expect(revertirSueldoMovimientoRepoMock).not.toHaveBeenCalled();
  });

  it("revierte un movimiento dentro de la ventana de gracia y escribe AuditLog REVERTIR", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarSueldoMovimientoPorIdMock.mockResolvedValue(movimientoExistente()); // fecha 5 min antes de AHORA
    revertirSueldoMovimientoRepoMock.mockResolvedValue(undefined);

    const resultado = await revertirSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({ ok: true, data: { id: MOVIMIENTO_1_ID } });
    expect(revertirSueldoMovimientoRepoMock).toHaveBeenCalledWith({ id: MOVIMIENTO_1_ID, ahora: AHORA });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "SueldoMovimiento",
        accion: "REVERTIR",
        entidadId: MOVIMIENTO_1_ID,
      }),
    );
  });

  it("rechaza (guard real, sin mockear el service) si ya pasó la ventana de 10 minutos", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarSueldoMovimientoPorIdMock.mockResolvedValue(
      movimientoExistente({ fecha: new Date("2025-12-31T23:59:59.000Z") }), // 10 min y 1 seg antes
    );

    const resultado = await revertirSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "La ventana de 10 minutos para deshacer este movimiento ya pasó.",
    });
    expect(revertirSueldoMovimientoRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza (guard real) si el movimiento ya está revertido", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarSueldoMovimientoPorIdMock.mockResolvedValue(movimientoExistente({ revertido: true }));

    const resultado = await revertirSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "Este movimiento ya fue revertido." });
    expect(revertirSueldoMovimientoRepoMock).not.toHaveBeenCalled();
  });

  it("traduce SueldoMovimientoYaRevertidoError (carrera real que pasó el chequeo previo) a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarSueldoMovimientoPorIdMock.mockResolvedValue(movimientoExistente()); // pasa el chequeo previo
    revertirSueldoMovimientoRepoMock.mockRejectedValue(new SueldoMovimientoYaRevertidoError());

    const resultado = await revertirSueldoMovimientoAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "Este movimiento ya fue revertido — actualizá la pantalla.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });
});
