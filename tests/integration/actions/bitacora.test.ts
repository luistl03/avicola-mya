import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PAGE_SIZE_MURO } from "@/lib/constants";

// vi.hoisted: mismo patrón que tests/integration/actions/mortalidad.test.ts.
const {
  authMock,
  buscarSesionPorJtiMock,
  revocarSesionMock,
  crearAuditLogMock,
  headersMock,
  crearNotaBitacoraMock,
  listarBitacoraPaginaMock,
  buscarNotaBitacoraPorIdMock,
  editarNotaBitacoraMock,
  eliminarNotaBitacoraMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  revocarSesionMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  crearNotaBitacoraMock: vi.fn(),
  listarBitacoraPaginaMock: vi.fn(),
  buscarNotaBitacoraPorIdMock: vi.fn(),
  editarNotaBitacoraMock: vi.fn(),
  eliminarNotaBitacoraMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: revocarSesionMock,
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/bitacora", () => ({
  crearNotaBitacora: crearNotaBitacoraMock,
  listarBitacoraPagina: listarBitacoraPaginaMock,
  buscarNotaBitacoraPorId: buscarNotaBitacoraPorIdMock,
  editarNotaBitacora: editarNotaBitacoraMock,
  eliminarNotaBitacora: eliminarNotaBitacoraMock,
}));

import {
  crearNotaBitacora,
  editarNotaBitacora,
  eliminarNotaBitacora,
  obtenerMasBitacora,
} from "@/server/actions/bitacora";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const NOTA_1_ID = crypto.randomUUID();

function sesionValida(overrides: Partial<{ usuarioId: string }> = {}) {
  return {
    id: "sesion-1",
    usuarioId: GERENTE_1_ID,
    jti: "jti-1",
    creadaEn: AHORA,
    ultimaActividad: AHORA,
    revocada: false,
    revocadaEn: null,
    ...overrides,
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

describe("crearNotaBitacora", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  it("rechaza contenido vacío (solo espacios) según el schema Zod, sin tocar el repository", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

    const resultado = await crearNotaBitacora({
      id: crypto.randomUUID(),
      categoria: "OBSERVACION",
      contenido: "   ",
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toBe("Datos inválidos.");
    }
    expect(crearNotaBitacoraMock).not.toHaveBeenCalled();
  });

  it("crea la nota (sin ningún campo de galpón, D2) y escribe AuditLog con entidad BitacoraGlobal", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    crearNotaBitacoraMock.mockResolvedValue({
      id: NOTA_1_ID,
      categoria: "VACUNACION",
      contenido: "Vacuna Newcastle aplicada",
    });

    const resultado = await crearNotaBitacora({
      id: NOTA_1_ID,
      categoria: "VACUNACION",
      contenido: "Vacuna Newcastle aplicada",
    });

    expect(resultado).toEqual({ ok: true, data: { id: NOTA_1_ID } });
    expect(crearNotaBitacoraMock).toHaveBeenCalledWith({
      id: NOTA_1_ID,
      categoria: "VACUNACION",
      contenido: "Vacuna Newcastle aplicada",
      usuarioId: GERENTE_1_ID,
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "BitacoraGlobal",
        accion: "CREAR",
        entidadId: NOTA_1_ID,
      }),
    );
  });

  // Sin restricción de rol (decisión de negocio en spec.md), mismo
  // criterio que registrarMortalidad.
  it("permite que un OPERARIO cree una nota, sin restricción de rol", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida({ usuarioId: OPERARIO_1_ID }));
    crearNotaBitacoraMock.mockResolvedValue({
      id: NOTA_1_ID,
      categoria: "ALIMENTACION",
      contenido: "Reparto normal",
    });

    const resultado = await crearNotaBitacora({
      id: NOTA_1_ID,
      categoria: "ALIMENTACION",
      contenido: "Reparto normal",
    });

    expect(resultado.ok).toBe(true);
    expect(crearNotaBitacoraMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: OPERARIO_1_ID }),
    );
  });

  // Idempotencia por id de cliente (auditoría post-Sprint 5, ver
  // memory/estado-proyecto.md — sin unicidad de negocio posible sobre
  // `contenido`, este id es la única defensa real contra un doble envío).
  describe("idempotencia por id de cliente", () => {
    function erroDeUnicidad() {
      return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      });
    }

    it("reintento con el mismo id y los mismos datos devuelve la nota ya existente, sin duplicar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearNotaBitacoraMock.mockRejectedValue(erroDeUnicidad());
      buscarNotaBitacoraPorIdMock.mockResolvedValue({
        id: NOTA_1_ID,
        categoria: "OBSERVACION",
        contenido: "Nota original",
      });

      const resultado = await crearNotaBitacora({
        id: NOTA_1_ID,
        categoria: "OBSERVACION",
        contenido: "Nota original",
      });

      expect(resultado).toEqual({ ok: true, data: { id: NOTA_1_ID } });
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "BitacoraGlobal", entidadId: NOTA_1_ID }),
      );
    });

    it("rechaza explícito si el mismo id ya existe pero con datos distintos", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearNotaBitacoraMock.mockRejectedValue(erroDeUnicidad());
      buscarNotaBitacoraPorIdMock.mockResolvedValue({
        id: NOTA_1_ID,
        categoria: "VACUNACION",
        contenido: "Otra nota distinta",
      });

      const resultado = await crearNotaBitacora({
        id: NOTA_1_ID,
        categoria: "OBSERVACION",
        contenido: "Nota original",
      });

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un registro con este id pero con datos diferentes — no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});

describe("obtenerMasBitacora", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza sin sesión, sin tocar el repository", async () => {
    authMock.mockResolvedValue(null);

    const resultado = await obtenerMasBitacora({});

    expect(resultado).toEqual({ ok: false, error: "No autenticado." });
    expect(listarBitacoraPaginaMock).not.toHaveBeenCalled();
  });

  it("rechaza un cursorId con formato inválido, sin tocar el repository", async () => {
    authMock.mockResolvedValue(sessionGerente());

    const resultado = await obtenerMasBitacora({ cursorId: "no-es-un-uuid" });

    expect(resultado).toEqual({ ok: false, error: "Datos inválidos." });
    expect(listarBitacoraPaginaMock).not.toHaveBeenCalled();
  });

  it("devuelve los items del repository, sin escribir AuditLog (es una lectura, no una mutación)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    const items = [
      {
        id: NOTA_1_ID,
        fecha: AHORA,
        categoria: "OBSERVACION",
        contenido: "Nota de prueba",
        usuario: { nombre: "Gerente" },
      },
    ];
    listarBitacoraPaginaMock.mockResolvedValue(items);

    const resultado = await obtenerMasBitacora({ cursorId: NOTA_1_ID, categoria: "OBSERVACION" });

    expect(resultado).toEqual({ ok: true, data: items });
    expect(listarBitacoraPaginaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cursorId: NOTA_1_ID,
        categoria: "OBSERVACION",
        take: PAGE_SIZE_MURO,
      }),
    );
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });
});

describe("editarNotaBitacora", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  it("rechaza si la nota no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarNotaBitacoraPorIdMock.mockResolvedValue(null);

    const resultado = await editarNotaBitacora({
      notaId: NOTA_1_ID,
      categoria: "OBSERVACION",
      contenido: "x",
    });

    expect(resultado).toEqual({ ok: false, error: "La nota no existe." });
    expect(editarNotaBitacoraMock).not.toHaveBeenCalled();
  });

  it("rechaza si la nota ya está eliminada (soft-delete)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarNotaBitacoraPorIdMock.mockResolvedValue({
      id: NOTA_1_ID,
      categoria: "OBSERVACION",
      contenido: "vieja",
      eliminada: true,
    });

    const resultado = await editarNotaBitacora({
      notaId: NOTA_1_ID,
      categoria: "OBSERVACION",
      contenido: "x",
    });

    expect(resultado).toEqual({ ok: false, error: "La nota no existe." });
    expect(editarNotaBitacoraMock).not.toHaveBeenCalled();
  });

  it("edita la nota y escribe AuditLog con estadoAntes/estadoDespues", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarNotaBitacoraPorIdMock.mockResolvedValue({
      id: NOTA_1_ID,
      categoria: "OBSERVACION",
      contenido: "Nota original",
      eliminada: false,
    });
    editarNotaBitacoraMock.mockResolvedValue({
      id: NOTA_1_ID,
      categoria: "VACUNACION",
      contenido: "Nota corregida",
    });

    const resultado = await editarNotaBitacora({
      notaId: NOTA_1_ID,
      categoria: "VACUNACION",
      contenido: "Nota corregida",
    });

    expect(resultado).toEqual({
      ok: true,
      data: { id: NOTA_1_ID, categoria: "VACUNACION", contenido: "Nota corregida" },
    });
    expect(editarNotaBitacoraMock).toHaveBeenCalledWith(NOTA_1_ID, {
      categoria: "VACUNACION",
      contenido: "Nota corregida",
    });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "BitacoraGlobal",
        accion: "EDITAR",
        entidadId: NOTA_1_ID,
        estadoAntes: { categoria: "OBSERVACION", contenido: "Nota original" },
        estadoDespues: { categoria: "VACUNACION", contenido: "Nota corregida" },
      }),
    );
  });

  // Sin restricción de rol ni de autoría (decisión de negocio confirmada).
  it("permite que un OPERARIO edite una nota de otro usuario", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida({ usuarioId: OPERARIO_1_ID }));
    buscarNotaBitacoraPorIdMock.mockResolvedValue({
      id: NOTA_1_ID,
      categoria: "OBSERVACION",
      contenido: "Nota del Gerente",
      eliminada: false,
    });
    editarNotaBitacoraMock.mockResolvedValue({
      id: NOTA_1_ID,
      categoria: "OBSERVACION",
      contenido: "Corregida por el Operario",
    });

    const resultado = await editarNotaBitacora({
      notaId: NOTA_1_ID,
      categoria: "OBSERVACION",
      contenido: "Corregida por el Operario",
    });

    expect(resultado.ok).toBe(true);
  });
});

describe("eliminarNotaBitacora", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  it("rechaza si la nota no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarNotaBitacoraPorIdMock.mockResolvedValue(null);

    const resultado = await eliminarNotaBitacora({ notaId: NOTA_1_ID });

    expect(resultado).toEqual({ ok: false, error: "La nota no existe." });
    expect(eliminarNotaBitacoraMock).not.toHaveBeenCalled();
  });

  it("rechaza si la nota ya está eliminada", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarNotaBitacoraPorIdMock.mockResolvedValue({ id: NOTA_1_ID, eliminada: true });

    const resultado = await eliminarNotaBitacora({ notaId: NOTA_1_ID });

    expect(resultado).toEqual({ ok: false, error: "La nota no existe." });
    expect(eliminarNotaBitacoraMock).not.toHaveBeenCalled();
  });

  it("marca la nota como eliminada (soft-delete) y escribe AuditLog", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarNotaBitacoraPorIdMock.mockResolvedValue({ id: NOTA_1_ID, eliminada: false });
    eliminarNotaBitacoraMock.mockResolvedValue({ id: NOTA_1_ID, eliminada: true });

    const resultado = await eliminarNotaBitacora({ notaId: NOTA_1_ID });

    expect(resultado).toEqual({ ok: true, data: { id: NOTA_1_ID } });
    expect(eliminarNotaBitacoraMock).toHaveBeenCalledWith(NOTA_1_ID);
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entidad: "BitacoraGlobal",
        accion: "ELIMINAR",
        entidadId: NOTA_1_ID,
      }),
    );
  });
});
