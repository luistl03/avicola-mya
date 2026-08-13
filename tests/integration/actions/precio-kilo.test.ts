import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que tests/integration/actions/galpon.test.ts.
const {
  authMock,
  buscarSesionPorJtiMock,
  crearAuditLogMock,
  headersMock,
  buscarPrecioKiloPorIdMock,
  crearPrecioKiloRepoMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarPrecioKiloPorIdMock: vi.fn(),
  crearPrecioKiloRepoMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: vi.fn(),
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/precioKilo", () => ({
  buscarPrecioKiloPorId: buscarPrecioKiloPorIdMock,
  crearPrecioKilo: crearPrecioKiloRepoMock,
}));

import { crearPrecioKilo } from "@/server/actions/precioKilo";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const PRECIO_1_ID = crypto.randomUUID();

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

describe("Server Action de precio por kilo (Sprint 8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  const inputValido = { id: PRECIO_1_ID, precio: 9.5 };

  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

    const resultado = await crearPrecioKilo(inputValido);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(crearPrecioKiloRepoMock).not.toHaveBeenCalled();
  });

  it("crea la fila de precio, pasando vigenteDesde explícito, y escribe AuditLog", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    crearPrecioKiloRepoMock.mockResolvedValue({
      id: PRECIO_1_ID,
      precio: 9.5,
      usuarioId: GERENTE_1_ID,
      vigenteDesde: AHORA,
    });

    const resultado = await crearPrecioKilo(inputValido);

    expect(resultado).toEqual({ ok: true, data: { id: PRECIO_1_ID, precio: 9.5 } });
    expect(crearPrecioKiloRepoMock).toHaveBeenCalledWith({
      id: PRECIO_1_ID,
      precio: 9.5,
      usuarioId: GERENTE_1_ID,
      vigenteDesde: AHORA,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "PrecioKilo", accion: "CREAR", entidadId: PRECIO_1_ID }),
    );
  });

  // Idempotencia por id de cliente (spec.md — PrecioKilo tampoco tiene
  // ningún campo @unique, y nunca se hace UPDATE, así que un reintento
  // exitoso tiene que devolver la fila ya creada, no insertar una segunda).
  describe("idempotencia por id de cliente", () => {
    function erroDeUnicidad() {
      return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      });
    }

    it("reintento con el mismo id y el mismo precio devuelve la fila ya existente, sin insertar una segunda", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearPrecioKiloRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarPrecioKiloPorIdMock.mockResolvedValue({
        id: PRECIO_1_ID,
        precio: 9.5,
        usuarioId: GERENTE_1_ID,
        vigenteDesde: AHORA,
      });

      const resultado = await crearPrecioKilo(inputValido);

      expect(resultado).toEqual({ ok: true, data: { id: PRECIO_1_ID, precio: 9.5 } });
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "PrecioKilo", entidadId: PRECIO_1_ID }),
      );
    });

    it("rechaza explícito si el mismo id ya existe pero con un precio distinto", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearPrecioKiloRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarPrecioKiloPorIdMock.mockResolvedValue({
        id: PRECIO_1_ID,
        precio: 10.0,
        usuarioId: GERENTE_1_ID,
        vigenteDesde: AHORA,
      });

      const resultado = await crearPrecioKilo(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("propaga un error real que no es de unicidad (P2002), sin tratarlo como idempotencia", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      const errorDeConexion = new Error("Server has closed the connection");
      crearPrecioKiloRepoMock.mockRejectedValue(errorDeConexion);

      await expect(crearPrecioKilo(inputValido)).rejects.toThrow(errorDeConexion);
      expect(buscarPrecioKiloPorIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("si el id colisiona (P2002) pero el registro ya no existe al releer, propaga el error original", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      const error = erroDeUnicidad();
      crearPrecioKiloRepoMock.mockRejectedValue(error);
      buscarPrecioKiloPorIdMock.mockResolvedValue(null);

      await expect(crearPrecioKilo(inputValido)).rejects.toThrow(error);
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});
