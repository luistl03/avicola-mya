import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: las factories de vi.mock se izan por encima de cualquier
// declaración normal del archivo (mismo patrón que
// tests/integration/actions/usuario.test.ts). Las guards puras de
// server/services/galpon.ts NO se mockean — se ejercitan reales, igual
// que puedeDesactivarUsuario en usuario.test.ts.
const {
  authMock,
  buscarSesionPorJtiMock,
  revocarSesionMock,
  crearAuditLogMock,
  headersMock,
  buscarGalponPorIdMock,
  crearGalponRepoMock,
  actualizarGalponMock,
  cambiarEstadoGalponMock,
  obtenerOcupacionGalponMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  revocarSesionMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarGalponPorIdMock: vi.fn(),
  crearGalponRepoMock: vi.fn(),
  actualizarGalponMock: vi.fn(),
  cambiarEstadoGalponMock: vi.fn(),
  obtenerOcupacionGalponMock: vi.fn(),
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
  crearGalpon: crearGalponRepoMock,
  actualizarGalpon: actualizarGalponMock,
  cambiarEstadoGalpon: cambiarEstadoGalponMock,
  obtenerOcupacionGalpon: obtenerOcupacionGalponMock,
}));

import { cambiarEstadoGalponAction, crearGalpon, editarGalpon } from "@/server/actions/galpon";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const GALPON_1_ID = crypto.randomUUID();
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

describe("Server Actions de galpón (Sprint 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("crearGalpon", () => {
    const inputValido = { id: GALPON_1_ID, nombre: "Galpón 1", capacidadMaxima: 500 };

    it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

      const resultado = await crearGalpon(inputValido);

      expect(resultado).toEqual({ ok: false, error: "No autorizado." });
      expect(crearGalponRepoMock).not.toHaveBeenCalled();
    });

    it("crea el galpón y escribe AuditLog con entidad Galpon", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      crearGalponRepoMock.mockResolvedValue({
        id: GALPON_1_ID,
        nombre: "Galpón 1",
        capacidadMaxima: 500,
      });

      const resultado = await crearGalpon(inputValido);

      expect(resultado).toEqual({ ok: true, data: { id: GALPON_1_ID } });
      expect(crearGalponRepoMock).toHaveBeenCalledWith(inputValido);
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "Galpon", accion: "CREAR", entidadId: GALPON_1_ID }),
      );
    });

    // Idempotencia por id de cliente (auditoría post-Sprint 5, ver
    // memory/estado-proyecto.md — Galpon.nombre no tiene @unique, así que
    // este id es la única defensa real contra un doble envío).
    describe("idempotencia por id de cliente", () => {
      function erroDeUnicidad() {
        return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        });
      }

      it("reintento con el mismo id y los mismos datos devuelve el galpón ya existente, sin duplicar", async () => {
        authMock.mockResolvedValue(sessionGerente());
        buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
        crearGalponRepoMock.mockRejectedValue(erroDeUnicidad());
        buscarGalponPorIdMock.mockResolvedValue({
          id: GALPON_1_ID,
          nombre: "Galpón 1",
          capacidadMaxima: 500,
        });

        const resultado = await crearGalpon(inputValido);

        expect(resultado).toEqual({ ok: true, data: { id: GALPON_1_ID } });
        expect(crearAuditLogMock).toHaveBeenCalledWith(
          expect.objectContaining({ entidad: "Galpon", entidadId: GALPON_1_ID }),
        );
      });

      it("rechaza explícito si el mismo id ya existe pero con datos distintos", async () => {
        authMock.mockResolvedValue(sessionGerente());
        buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
        crearGalponRepoMock.mockRejectedValue(erroDeUnicidad());
        buscarGalponPorIdMock.mockResolvedValue({
          id: GALPON_1_ID,
          nombre: "Galpón distinto",
          capacidadMaxima: 999,
        });

        const resultado = await crearGalpon(inputValido);

        expect(resultado).toEqual({
          ok: false,
          error: "Ya existe un registro con este id pero con datos diferentes - no se sobrescribe.",
        });
        expect(crearAuditLogMock).not.toHaveBeenCalled();
      });
    });
  });

  describe("editarGalpon", () => {
    it("rechaza si el galpón no existe", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarGalponPorIdMock.mockResolvedValue(null);

      const resultado = await editarGalpon({
        galponId: GALPON_INEXISTENTE_ID,
        nombre: "X",
        capacidadMaxima: 100,
      });

      expect(resultado).toEqual({ ok: false, error: "El galpón no existe." });
      expect(actualizarGalponMock).not.toHaveBeenCalled();
    });

    it("rechaza reducir la capacidad por debajo de la ocupación actual, sin llegar a guardar", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarGalponPorIdMock.mockResolvedValue({
        id: GALPON_1_ID,
        nombre: "Galpón 1",
        capacidadMaxima: 500,
      });
      obtenerOcupacionGalponMock.mockResolvedValue(ocupacion([150, 150]));

      const resultado = await editarGalpon({
        galponId: GALPON_1_ID,
        nombre: "Galpón 1",
        capacidadMaxima: 200,
      });

      expect(resultado).toEqual({
        ok: false,
        error: "El galpón aloja 300 aves - no puede bajar de esa capacidad.",
      });
      expect(actualizarGalponMock).not.toHaveBeenCalled();
    });

    it("guarda cuando la nueva capacidad alcanza para la ocupación actual", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarGalponPorIdMock.mockResolvedValue({
        id: GALPON_1_ID,
        nombre: "Galpón viejo",
        capacidadMaxima: 500,
      });
      obtenerOcupacionGalponMock.mockResolvedValue(ocupacion([300]));
      actualizarGalponMock.mockResolvedValue({
        id: GALPON_1_ID,
        nombre: "Galpón nuevo",
        capacidadMaxima: 400,
      });

      const resultado = await editarGalpon({
        galponId: GALPON_1_ID,
        nombre: "Galpón nuevo",
        capacidadMaxima: 400,
      });

      expect(resultado).toEqual({ ok: true, data: { id: GALPON_1_ID } });
      expect(actualizarGalponMock).toHaveBeenCalledWith(GALPON_1_ID, {
        nombre: "Galpón nuevo",
        capacidadMaxima: 400,
      });
    });
  });

  describe("cambiarEstadoGalponAction", () => {
    it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

      const resultado = await cambiarEstadoGalponAction({ galponId: GALPON_1_ID, estado: "INACTIVO" });

      expect(resultado).toEqual({ ok: false, error: "No autorizado." });
      expect(cambiarEstadoGalponMock).not.toHaveBeenCalled();
    });

    it("bloquea desactivar un galpón que aloja al menos un lote", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarGalponPorIdMock.mockResolvedValue({ id: GALPON_1_ID, estado: "ACTIVO" });
      obtenerOcupacionGalponMock.mockResolvedValue(ocupacion([200]));

      const resultado = await cambiarEstadoGalponAction({ galponId: GALPON_1_ID, estado: "INACTIVO" });

      expect(resultado).toEqual({
        ok: false,
        error: "No se puede desactivar un galpón con lotes alojados.",
      });
      expect(cambiarEstadoGalponMock).not.toHaveBeenCalled();
    });

    it("desactiva un galpón vacío", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarGalponPorIdMock.mockResolvedValue({ id: GALPON_1_ID, estado: "ACTIVO" });
      obtenerOcupacionGalponMock.mockResolvedValue([]);
      cambiarEstadoGalponMock.mockResolvedValue({ id: GALPON_1_ID, estado: "INACTIVO" });

      const resultado = await cambiarEstadoGalponAction({ galponId: GALPON_1_ID, estado: "INACTIVO" });

      expect(resultado).toEqual({ ok: true, data: { id: GALPON_1_ID, estado: "INACTIVO" } });
      expect(cambiarEstadoGalponMock).toHaveBeenCalledWith(GALPON_1_ID, "INACTIVO");
    });

    it("reactiva sin consultar la ocupación (la guard solo aplica al desactivar)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarGalponPorIdMock.mockResolvedValue({ id: GALPON_1_ID, estado: "INACTIVO" });
      cambiarEstadoGalponMock.mockResolvedValue({ id: GALPON_1_ID, estado: "ACTIVO" });

      const resultado = await cambiarEstadoGalponAction({ galponId: GALPON_1_ID, estado: "ACTIVO" });

      expect(resultado).toEqual({ ok: true, data: { id: GALPON_1_ID, estado: "ACTIVO" } });
      expect(obtenerOcupacionGalponMock).not.toHaveBeenCalled();
    });

    it("es no-op (sin tocar la base) si ya está en el estado pedido", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarGalponPorIdMock.mockResolvedValue({ id: GALPON_1_ID, estado: "ACTIVO" });

      const resultado = await cambiarEstadoGalponAction({ galponId: GALPON_1_ID, estado: "ACTIVO" });

      expect(resultado).toEqual({ ok: true, data: { id: GALPON_1_ID, estado: "ACTIVO" } });
      expect(cambiarEstadoGalponMock).not.toHaveBeenCalled();
      expect(obtenerOcupacionGalponMock).not.toHaveBeenCalled();
    });
  });
});
