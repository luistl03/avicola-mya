import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// vi.hoisted: las factories de vi.mock se izan por encima de cualquier
// declaración normal del archivo (mismo patrón que
// tests/integration/auth/login-action.test.ts).
const { authMock, buscarSesionPorJtiMock, revocarSesionMock, crearAuditLogMock, headersMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    buscarSesionPorJtiMock: vi.fn(),
    revocarSesionMock: vi.fn(),
    crearAuditLogMock: vi.fn(),
    headersMock: vi.fn(),
  }));

vi.mock("@/server/auth", () => ({
  auth: authMock,
}));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: revocarSesionMock,
}));

vi.mock("@/server/repositories/auditLog", () => ({
  crearAuditLog: crearAuditLogMock,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

import { AccionError, withAuth } from "@/server/auth/with-auth";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

function sesionValida(overrides: Partial<{ revocada: boolean; ultimaActividad: Date }> = {}) {
  return {
    id: "sesion-1",
    usuarioId: "usuario-1",
    jti: "jti-1",
    creadaEn: AHORA,
    ultimaActividad: AHORA,
    revocada: false,
    revocadaEn: null,
    ...overrides,
  };
}

function sessionAutenticada(rol: "GERENTE" | "OPERARIO" = "GERENTE") {
  return {
    sesionId: "jti-1",
    user: { id: "usuario-1", usuario: "gerente", nombre: "Gerente", rol },
  };
}

const schema = z.object({ nombre: z.string().min(1, "El nombre es obligatorio") });

describe("withAuth", () => {
  beforeEach(() => {
    authMock.mockReset();
    buscarSesionPorJtiMock.mockReset();
    revocarSesionMock.mockReset();
    crearAuditLogMock.mockReset();
    headersMock.mockReset();
    headersMock.mockResolvedValue(new Headers({ "x-forwarded-for": "1.2.3.4" }));
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const handlerExitoso = vi.fn(async (input: { nombre: string }) => ({
    data: { id: "fila-1", nombre: input.nombre },
    entidadId: "fila-1",
    estadoDespues: { nombre: input.nombre },
  }));

  it("rechaza sin sesión", async () => {
    authMock.mockResolvedValue(null);
    const accion = withAuth({ schema, entidad: "Usuario", accion: "CREAR" }, handlerExitoso);

    const resultado = await accion({ nombre: "x" });

    expect(resultado).toEqual({ ok: false, error: "No autenticado." });
    expect(buscarSesionPorJtiMock).not.toHaveBeenCalled();
  });

  it("rechaza si la SesionActiva no existe (jti huérfano)", async () => {
    authMock.mockResolvedValue(sessionAutenticada());
    buscarSesionPorJtiMock.mockResolvedValue(null);
    const accion = withAuth({ schema, entidad: "Usuario", accion: "CREAR" }, handlerExitoso);

    const resultado = await accion({ nombre: "x" });

    expect(resultado).toEqual({
      ok: false,
      error: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
    });
  });

  it("rechaza si la SesionActiva está revocada", async () => {
    authMock.mockResolvedValue(sessionAutenticada());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida({ revocada: true }));
    const accion = withAuth({ schema, entidad: "Usuario", accion: "CREAR" }, handlerExitoso);

    const resultado = await accion({ nombre: "x" });

    expect(resultado).toEqual({
      ok: false,
      error: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
    });
  });

  it("rechaza y revoca la sesión si está expirada por inactividad (≥30 min)", async () => {
    authMock.mockResolvedValue(sessionAutenticada());
    const hace31min = new Date(AHORA.getTime() - 31 * 60_000);
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida({ ultimaActividad: hace31min }));
    const accion = withAuth({ schema, entidad: "Usuario", accion: "CREAR" }, handlerExitoso);

    const resultado = await accion({ nombre: "x" });

    expect(resultado).toEqual({
      ok: false,
      error: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
    });
    expect(revocarSesionMock).toHaveBeenCalledWith("jti-1", AHORA);
  });

  it("rechaza por rol si el usuario no tiene el rol requerido", async () => {
    authMock.mockResolvedValue(sessionAutenticada("OPERARIO"));
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const accion = withAuth(
      { schema, rol: "GERENTE", entidad: "Usuario", accion: "CREAR" },
      handlerExitoso,
    );

    const resultado = await accion({ nombre: "x" });

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
  });

  it("acepta rol como array de roles permitidos", async () => {
    authMock.mockResolvedValue(sessionAutenticada("OPERARIO"));
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const accion = withAuth(
      { schema, rol: ["GERENTE", "OPERARIO"], entidad: "Usuario", accion: "CREAR" },
      handlerExitoso,
    );

    const resultado = await accion({ nombre: "x" });

    expect(resultado.ok).toBe(true);
  });

  it("rechaza input inválido según el schema Zod sin ejecutar el handler", async () => {
    authMock.mockResolvedValue(sessionAutenticada());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const handler = vi.fn();
    const accion = withAuth({ schema, entidad: "Usuario", accion: "CREAR" }, handler);

    const resultado = await accion({ nombre: "" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toBe("Datos inválidos.");
      expect(resultado.campos?.nombre).toEqual(["El nombre es obligatorio"]);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("normaliza FormData a objeto antes de validar", async () => {
    authMock.mockResolvedValue(sessionAutenticada());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const accion = withAuth({ schema, entidad: "Usuario", accion: "CREAR" }, handlerExitoso);
    const formData = new FormData();
    formData.set("nombre", "Juan");

    const resultado = await accion(formData);

    expect(resultado).toEqual({ ok: true, data: { id: "fila-1", nombre: "Juan" } });
  });

  it("en éxito, escribe AuditLog con entidad/accion/usuarioId/ip y devuelve ok:true", async () => {
    authMock.mockResolvedValue(sessionAutenticada());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    crearAuditLogMock.mockResolvedValue(undefined);
    const accion = withAuth({ schema, entidad: "Usuario", accion: "CREAR" }, handlerExitoso);

    const resultado = await accion({ nombre: "Juan" });

    expect(resultado).toEqual({ ok: true, data: { id: "fila-1", nombre: "Juan" } });
    expect(crearAuditLogMock).toHaveBeenCalledWith({
      entidad: "Usuario",
      entidadId: "fila-1",
      accion: "CREAR",
      usuarioId: "usuario-1",
      estadoAntes: undefined,
      estadoDespues: { nombre: "Juan" },
      ip: "1.2.3.4",
    });
  });

  it("traduce un AccionError lanzado por el handler a { ok: false } sin escribir AuditLog", async () => {
    authMock.mockResolvedValue(sessionAutenticada());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const handler = vi.fn(async () => {
      throw new AccionError("El usuario ya existe.");
    });
    const accion = withAuth({ schema, entidad: "Usuario", accion: "CREAR" }, handler);

    const resultado = await accion({ nombre: "Juan" });

    expect(resultado).toEqual({ ok: false, error: "El usuario ya existe." });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });

  it("re-lanza cualquier error del handler que no sea AccionError", async () => {
    authMock.mockResolvedValue(sessionAutenticada());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    const handler = vi.fn(async () => {
      throw new Error("fallo inesperado de base de datos");
    });
    const accion = withAuth({ schema, entidad: "Usuario", accion: "CREAR" }, handler);

    await expect(accion({ nombre: "Juan" })).rejects.toThrow("fallo inesperado de base de datos");
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });
});
