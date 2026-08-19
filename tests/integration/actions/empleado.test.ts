import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que egreso.test.ts/credito.test.ts.
const {
  authMock,
  buscarSesionPorJtiMock,
  crearAuditLogMock,
  headersMock,
  buscarEmpleadoPorIdMock,
  crearEmpleadoRepoMock,
  editarEmpleadoRepoMock,
  cambiarEstadoEmpleadoRepoMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarEmpleadoPorIdMock: vi.fn(),
  crearEmpleadoRepoMock: vi.fn(),
  editarEmpleadoRepoMock: vi.fn(),
  cambiarEstadoEmpleadoRepoMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: vi.fn(),
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/empleado", () => ({
  crearEmpleado: crearEmpleadoRepoMock,
  editarEmpleado: editarEmpleadoRepoMock,
  cambiarEstadoEmpleado: cambiarEstadoEmpleadoRepoMock,
  buscarEmpleadoPorId: buscarEmpleadoPorIdMock,
}));

import {
  cambiarEstadoEmpleadoAction,
  crearEmpleadoAction,
  editarEmpleadoAction,
} from "@/server/actions/empleado";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const EMPLEADO_1_ID = crypto.randomUUID();

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

function empleadoExistente(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EMPLEADO_1_ID,
    nombre: "Juana Pérez",
    celular: "987654321",
    cargo: "Operaria de campo",
    usuarioId: null,
    estado: "ACTIVO" as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  headersMock.mockResolvedValue(new Headers());
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});

describe("crearEmpleadoAction", () => {
  const inputBase = {
    id: EMPLEADO_1_ID,
    nombre: "Juana Pérez",
    celular: "987654321",
    cargo: "Operaria de campo",
  };

  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await crearEmpleadoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(crearEmpleadoRepoMock).not.toHaveBeenCalled();
  });

  it("crea un empleado y escribe AuditLog CREAR con entidad Empleado", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    crearEmpleadoRepoMock.mockResolvedValue(empleadoExistente());

    const resultado = await crearEmpleadoAction(inputBase);

    expect(resultado).toEqual({ ok: true, data: { id: EMPLEADO_1_ID } });
    expect(crearEmpleadoRepoMock).toHaveBeenCalledWith(inputBase);
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "Empleado", accion: "CREAR", entidadId: EMPLEADO_1_ID }),
    );
  });

  it("acepta un payload sin celular ni cargo (ambos opcionales)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    crearEmpleadoRepoMock.mockResolvedValue(empleadoExistente({ celular: null, cargo: null }));

    const resultado = await crearEmpleadoAction({ id: EMPLEADO_1_ID, nombre: "Juana Pérez" });

    expect(resultado.ok).toBe(true);
    expect(crearEmpleadoRepoMock).toHaveBeenCalledWith({ id: EMPLEADO_1_ID, nombre: "Juana Pérez" });
  });

  describe("idempotencia / carrera real (P2002 sobre Empleado.id)", () => {
    it("reintento con el mismo payload responde éxito idempotente, sin duplicar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearEmpleadoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarEmpleadoPorIdMock.mockResolvedValue(empleadoExistente());

      const resultado = await crearEmpleadoAction(inputBase);

      expect(resultado).toEqual({ ok: true, data: { id: EMPLEADO_1_ID } });
      expect(crearEmpleadoRepoMock).toHaveBeenCalledTimes(1);
    });

    it("P2002 con datos distintos (nombre) se rechaza explícito, sin sobrescribir", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearEmpleadoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarEmpleadoPorIdMock.mockResolvedValue(empleadoExistente({ nombre: "Otro Nombre" }));

      const resultado = await crearEmpleadoAction(inputBase);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un empleado con este id pero con datos diferentes — no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("P2002 pero el registro ya no existe al releer propaga el error original", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearEmpleadoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarEmpleadoPorIdMock.mockResolvedValue(null);

      await expect(crearEmpleadoAction(inputBase)).rejects.toThrow("Unique constraint failed");
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});

describe("editarEmpleadoAction", () => {
  const inputBase = {
    id: EMPLEADO_1_ID,
    nombre: "Juana Pérez Gómez",
    celular: "987654321",
    cargo: "Operaria de campo",
  };

  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await editarEmpleadoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(editarEmpleadoRepoMock).not.toHaveBeenCalled();
  });

  it("edita un empleado existente y escribe AuditLog EDITAR", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEmpleadoPorIdMock.mockResolvedValue(empleadoExistente());
    editarEmpleadoRepoMock.mockResolvedValue(empleadoExistente({ nombre: "Juana Pérez Gómez" }));

    const resultado = await editarEmpleadoAction(inputBase);

    expect(resultado).toEqual({ ok: true, data: { id: EMPLEADO_1_ID } });
    expect(editarEmpleadoRepoMock).toHaveBeenCalledWith(inputBase);
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "Empleado", accion: "EDITAR", entidadId: EMPLEADO_1_ID }),
    );
  });

  it("rechaza si el empleado no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEmpleadoPorIdMock.mockResolvedValue(null);

    const resultado = await editarEmpleadoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "El empleado no existe." });
    expect(editarEmpleadoRepoMock).not.toHaveBeenCalled();
  });
});

describe("cambiarEstadoEmpleadoAction", () => {
  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await cambiarEstadoEmpleadoAction({ id: EMPLEADO_1_ID, estado: "INACTIVO" });

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(cambiarEstadoEmpleadoRepoMock).not.toHaveBeenCalled();
  });

  it("da de baja a un empleado ACTIVO y escribe AuditLog CAMBIAR_ESTADO", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEmpleadoPorIdMock.mockResolvedValue(empleadoExistente({ estado: "ACTIVO" }));
    cambiarEstadoEmpleadoRepoMock.mockResolvedValue(empleadoExistente({ estado: "INACTIVO" }));

    const resultado = await cambiarEstadoEmpleadoAction({ id: EMPLEADO_1_ID, estado: "INACTIVO" });

    expect(resultado).toEqual({ ok: true, data: { id: EMPLEADO_1_ID, estado: "INACTIVO" } });
    expect(cambiarEstadoEmpleadoRepoMock).toHaveBeenCalledWith({ id: EMPLEADO_1_ID, estado: "INACTIVO" });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "Empleado", accion: "CAMBIAR_ESTADO", entidadId: EMPLEADO_1_ID }),
    );
  });

  it("reactiva a un empleado INACTIVO", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEmpleadoPorIdMock.mockResolvedValue(empleadoExistente({ estado: "INACTIVO" }));
    cambiarEstadoEmpleadoRepoMock.mockResolvedValue(empleadoExistente({ estado: "ACTIVO" }));

    const resultado = await cambiarEstadoEmpleadoAction({ id: EMPLEADO_1_ID, estado: "ACTIVO" });

    expect(resultado).toEqual({ ok: true, data: { id: EMPLEADO_1_ID, estado: "ACTIVO" } });
  });

  it("es un no-op idempotente si el estado pedido ya es el actual (no toca la base)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEmpleadoPorIdMock.mockResolvedValue(empleadoExistente({ estado: "ACTIVO" }));

    const resultado = await cambiarEstadoEmpleadoAction({ id: EMPLEADO_1_ID, estado: "ACTIVO" });

    expect(resultado).toEqual({ ok: true, data: { id: EMPLEADO_1_ID, estado: "ACTIVO" } });
    expect(cambiarEstadoEmpleadoRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza si el empleado no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEmpleadoPorIdMock.mockResolvedValue(null);

    const resultado = await cambiarEstadoEmpleadoAction({ id: EMPLEADO_1_ID, estado: "INACTIVO" });

    expect(resultado).toEqual({ ok: false, error: "El empleado no existe." });
    expect(cambiarEstadoEmpleadoRepoMock).not.toHaveBeenCalled();
  });
});
