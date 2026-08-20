import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: mismo patrón que credito.test.ts/mortalidad.test.ts.
// EgresoRevertidoError/EgresoYaRevertidoError se re-declaran acá (no se
// importan las clases reales) porque el mock completo del módulo
// reemplaza también esas exportaciones. server/services/egreso.ts NO se
// mockea — se ejercita real (puedeRevertirEgreso), mismo criterio que
// server/services/credito.ts en credito.test.ts.
const {
  authMock,
  buscarSesionPorJtiMock,
  crearAuditLogMock,
  headersMock,
  buscarEgresoPorIdMock,
  crearEgresoRepoMock,
  editarEgresoRepoMock,
  revertirEgresoRepoMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarEgresoPorIdMock: vi.fn(),
  crearEgresoRepoMock: vi.fn(),
  editarEgresoRepoMock: vi.fn(),
  revertirEgresoRepoMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: vi.fn(),
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/egreso", () => ({
  EgresoRevertidoError: class EgresoRevertidoError extends Error {},
  EgresoYaRevertidoError: class EgresoYaRevertidoError extends Error {},
  crearEgreso: crearEgresoRepoMock,
  editarEgreso: editarEgresoRepoMock,
  revertirEgreso: revertirEgresoRepoMock,
  buscarEgresoPorId: buscarEgresoPorIdMock,
}));

import { crearEgresoAction, editarEgresoAction, revertirEgresoAction } from "@/server/actions/egreso";
import { EgresoRevertidoError, EgresoYaRevertidoError } from "@/server/repositories/egreso";

const AHORA = new Date("2026-01-01T00:10:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const EGRESO_1_ID = crypto.randomUUID();

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

function egresoExistente(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EGRESO_1_ID,
    categoria: "ALIMENTOS" as const,
    monto: 150.5,
    descripcion: "Bolsas de alimento",
    // "2025-06-15" a propósito: claramente en el pasado sin importar el
    // borde de huso horario UTC/Lima de AHORA (D5) — coincide con
    // inputBase.fecha de ambos describe() de abajo, para que el chequeo
    // de idempotencia (coincide) compare lo mismo que Zod coerciona.
    fecha: new Date("2025-06-15T00:00:00.000Z"),
    creadoEn: new Date("2026-01-01T00:05:00.000Z"), // 5 min antes de AHORA
    revertido: false,
    usuarioId: GERENTE_1_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  headersMock.mockResolvedValue(new Headers());
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});

describe("crearEgresoAction", () => {
  const inputBase = {
    id: EGRESO_1_ID,
    categoria: "ALIMENTOS" as const,
    monto: 150.5,
    descripcion: "Bolsas de alimento",
    fecha: "2025-06-15",
  };

  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await crearEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(crearEgresoRepoMock).not.toHaveBeenCalled();
  });

  it("crea un egreso y escribe AuditLog CREAR con entidad Egreso", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    crearEgresoRepoMock.mockResolvedValue(egresoExistente());

    const resultado = await crearEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: true, data: { id: EGRESO_1_ID } });
    expect(crearEgresoRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: EGRESO_1_ID, categoria: "ALIMENTOS", monto: 150.5, usuarioId: GERENTE_1_ID }),
    );
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "Egreso", accion: "CREAR", entidadId: EGRESO_1_ID }),
    );
  });

  describe("idempotencia / carrera real (P2002 sobre Egreso.id)", () => {
    it("reintento con el mismo payload responde éxito idempotente, sin duplicar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearEgresoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarEgresoPorIdMock.mockResolvedValue(egresoExistente());

      const resultado = await crearEgresoAction(inputBase);

      expect(resultado).toEqual({ ok: true, data: { id: EGRESO_1_ID } });
      expect(crearEgresoRepoMock).toHaveBeenCalledTimes(1);
    });

    it("P2002 con datos distintos (monto) se rechaza explícito, sin sobrescribir", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearEgresoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarEgresoPorIdMock.mockResolvedValue(egresoExistente({ monto: 999 }));

      const resultado = await crearEgresoAction(inputBase);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un egreso con este id pero con datos diferentes - no se sobrescribe.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("P2002 pero el registro ya no existe al releer propaga el error original", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearEgresoRepoMock.mockRejectedValue(erroDeUnicidad());
      buscarEgresoPorIdMock.mockResolvedValue(null);

      await expect(crearEgresoAction(inputBase)).rejects.toThrow("Unique constraint failed");
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });

    it("cualquier otro error de Prisma (no P2002) se propaga tal cual", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearEgresoRepoMock.mockRejectedValue(new Error("conexión perdida"));

      await expect(crearEgresoAction(inputBase)).rejects.toThrow("conexión perdida");
      expect(buscarEgresoPorIdMock).not.toHaveBeenCalled();
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });
});

describe("editarEgresoAction", () => {
  const inputBase = {
    id: EGRESO_1_ID,
    categoria: "SERVICIOS" as const,
    monto: 200,
    descripcion: "Luz y agua",
    fecha: "2025-06-15",
  };

  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await editarEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(editarEgresoRepoMock).not.toHaveBeenCalled();
  });

  it("edita un egreso existente y escribe AuditLog EDITAR", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEgresoPorIdMock.mockResolvedValue(egresoExistente());
    editarEgresoRepoMock.mockResolvedValue(undefined);

    const resultado = await editarEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: true, data: { id: EGRESO_1_ID } });
    // `fecha` llega coercionada a Date por Zod (z.coerce.date()), no como
    // el string crudo de inputBase — se compara aparte.
    expect(editarEgresoRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: EGRESO_1_ID,
        categoria: "SERVICIOS",
        monto: 200,
        descripcion: "Luz y agua",
        fecha: new Date("2025-06-15T00:00:00.000Z"),
      }),
    );
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "Egreso", accion: "EDITAR", entidadId: EGRESO_1_ID }),
    );
  });

  it("rechaza si el egreso no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEgresoPorIdMock.mockResolvedValue(null);

    const resultado = await editarEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "El egreso no existe." });
    expect(editarEgresoRepoMock).not.toHaveBeenCalled();
  });

  it("traduce EgresoRevertidoError a un mensaje explícito (no se puede editar un anulado)", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEgresoPorIdMock.mockResolvedValue(egresoExistente({ revertido: true }));
    editarEgresoRepoMock.mockRejectedValue(new EgresoRevertidoError());

    const resultado = await editarEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "No se puede editar un egreso ya anulado." });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });
});

describe("revertirEgresoAction", () => {
  const inputBase = { id: EGRESO_1_ID };

  it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
    authMock.mockResolvedValue(sessionOperario());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida(OPERARIO_1_ID));

    const resultado = await revertirEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "No autorizado." });
    expect(revertirEgresoRepoMock).not.toHaveBeenCalled();
  });

  it("anula un egreso dentro de la ventana de gracia y escribe AuditLog ANULAR", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEgresoPorIdMock.mockResolvedValue(egresoExistente()); // creadoEn 5 min antes de AHORA
    revertirEgresoRepoMock.mockResolvedValue(undefined);

    const resultado = await revertirEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: true, data: { id: EGRESO_1_ID } });
    expect(revertirEgresoRepoMock).toHaveBeenCalledWith({ id: EGRESO_1_ID, ahora: AHORA });
    expect(crearAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "Egreso", accion: "ANULAR", entidadId: EGRESO_1_ID }),
    );
  });

  it("rechaza si el egreso no existe", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEgresoPorIdMock.mockResolvedValue(null);

    const resultado = await revertirEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "El egreso no existe." });
    expect(revertirEgresoRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza (guard real, sin mockear el service) si ya pasó la ventana de 10 minutos", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEgresoPorIdMock.mockResolvedValue(
      egresoExistente({ creadoEn: new Date("2025-12-31T23:59:59.000Z") }), // 10 min y 1 seg antes
    );

    const resultado = await revertirEgresoAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "La ventana de 10 minutos para anular este egreso ya pasó. Puedes corregirlo editándolo.",
    });
    expect(revertirEgresoRepoMock).not.toHaveBeenCalled();
  });

  it("rechaza (guard real) si el egreso ya está revertido", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEgresoPorIdMock.mockResolvedValue(egresoExistente({ revertido: true }));

    const resultado = await revertirEgresoAction(inputBase);

    expect(resultado).toEqual({ ok: false, error: "Este egreso ya fue anulado." });
    expect(revertirEgresoRepoMock).not.toHaveBeenCalled();
  });

  it("traduce EgresoYaRevertidoError (carrera real que pasó el chequeo previo) a un mensaje claro", async () => {
    authMock.mockResolvedValue(sessionGerente());
    buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
    buscarEgresoPorIdMock.mockResolvedValue(egresoExistente()); // pasa el chequeo previo
    revertirEgresoRepoMock.mockRejectedValue(new EgresoYaRevertidoError());

    const resultado = await revertirEgresoAction(inputBase);

    expect(resultado).toEqual({
      ok: false,
      error: "Este egreso ya fue anulado - actualiza la pantalla.",
    });
    expect(crearAuditLogMock).not.toHaveBeenCalled();
  });
});
