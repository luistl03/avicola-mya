import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: las factories de vi.mock se izan por encima de cualquier
// declaración normal del archivo (mismo patrón que
// tests/integration/rbac/with-auth.test.ts).
const {
  authMock,
  buscarSesionPorJtiMock,
  revocarSesionMock,
  crearAuditLogMock,
  headersMock,
  buscarUsuarioPorUsuarioMock,
  buscarUsuarioPorIdMock,
  crearUsuarioRepoMock,
  actualizarUsuarioMock,
  cambiarEstadoUsuarioMock,
  contarGerentesActivosMock,
  desactivarUsuarioYRevocarSesionesMock,
  bcryptHashMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  buscarSesionPorJtiMock: vi.fn(),
  revocarSesionMock: vi.fn(),
  crearAuditLogMock: vi.fn(),
  headersMock: vi.fn(),
  buscarUsuarioPorUsuarioMock: vi.fn(),
  buscarUsuarioPorIdMock: vi.fn(),
  crearUsuarioRepoMock: vi.fn(),
  actualizarUsuarioMock: vi.fn(),
  cambiarEstadoUsuarioMock: vi.fn(),
  contarGerentesActivosMock: vi.fn(),
  desactivarUsuarioYRevocarSesionesMock: vi.fn(),
  bcryptHashMock: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: authMock }));

vi.mock("@/server/repositories/sesion", () => ({
  buscarSesionPorJti: buscarSesionPorJtiMock,
  revocarSesion: revocarSesionMock,
}));

vi.mock("@/server/repositories/auditLog", () => ({ crearAuditLog: crearAuditLogMock }));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/server/repositories/usuario", () => ({
  buscarUsuarioPorUsuario: buscarUsuarioPorUsuarioMock,
  buscarUsuarioPorId: buscarUsuarioPorIdMock,
  crearUsuario: crearUsuarioRepoMock,
  actualizarUsuario: actualizarUsuarioMock,
  cambiarEstadoUsuario: cambiarEstadoUsuarioMock,
  contarGerentesActivos: contarGerentesActivosMock,
  desactivarUsuarioYRevocarSesiones: desactivarUsuarioYRevocarSesionesMock,
}));

vi.mock("bcryptjs", () => ({ default: { hash: bcryptHashMock } }));

import { cambiarEstadoUsuarioAction, crearUsuario, editarUsuario } from "@/server/actions/usuario";

const AHORA = new Date("2026-01-01T00:00:00.000Z");

// cambiarEstadoUsuarioSchema/editarUsuarioSchema validan usuarioId con
// z.string().uuid() (lib/zod/usuario.ts) — los ids de prueba tienen que
// ser UUIDs reales (con nibble de variante RFC4122 válido) o Zod los
// rechaza antes de llegar al handler; crypto.randomUUID() lo garantiza
// sin tener que armar el formato a mano.
const GERENTE_1_ID = crypto.randomUUID();
const OPERARIO_1_ID = crypto.randomUUID();
const USUARIO_1_ID = crypto.randomUUID();
const USUARIO_2_ID = crypto.randomUUID();
const USUARIO_3_ID = crypto.randomUUID();
const USUARIO_4_ID = crypto.randomUUID();
const GERENTE_2_ID = crypto.randomUUID();
const USUARIO_INEXISTENTE_ID = crypto.randomUUID();

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

describe("Server Actions de usuario (CRUD, Sprint 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    bcryptHashMock.mockResolvedValue("hash-simulado");
    // withAuth calcula el idle-timeout contra `new Date()` real — sin
    // fijar el reloj, la SesionActiva de prueba (ultimaActividad: AHORA,
    // fecha fija en el pasado) queda "expirada" contra la hora real de
    // ejecución del test (mismo motivo que tests/integration/rbac/with-auth.test.ts).
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("crearUsuario", () => {
    const inputValido = {
      usuario: "operario.nuevo",
      password: "Cambiar123!",
      nombre: "Operario Nuevo",
      rol: "OPERARIO",
      celular: "",
      email: "",
    };

    it("rechaza si quien invoca no es GERENTE, sin llegar a tocar el repository", async () => {
      authMock.mockResolvedValue(sessionOperario());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());

      const resultado = await crearUsuario(inputValido);

      expect(resultado).toEqual({ ok: false, error: "No autorizado." });
      expect(crearUsuarioRepoMock).not.toHaveBeenCalled();
    });

    it("crea el usuario con el rol elegido por el Gerente y hashea la contraseña con cost 12", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorUsuarioMock.mockResolvedValue(null);
      crearUsuarioRepoMock.mockResolvedValue({
        id: "usuario-nuevo",
        usuario: "operario.nuevo",
        nombre: "Operario Nuevo",
        rol: "OPERARIO",
      });

      const resultado = await crearUsuario({ ...inputValido, rol: "GERENTE" });

      expect(resultado).toEqual({ ok: true, data: { id: "usuario-nuevo" } });
      expect(bcryptHashMock).toHaveBeenCalledWith("Cambiar123!", 12);
      expect(crearUsuarioRepoMock).toHaveBeenCalledWith(
        expect.objectContaining({ rol: "GERENTE", passwordHash: "hash-simulado" }),
      );
      expect(crearAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: "Usuario",
          accion: "CREAR",
          entidadId: "usuario-nuevo",
        }),
      );
    });

    it("rechaza con un mensaje claro si el nombre de usuario ya existe (chequeo previo)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorUsuarioMock.mockResolvedValue({ id: "otro" });

      const resultado = await crearUsuario(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un usuario con ese nombre de usuario.",
      });
      expect(crearUsuarioRepoMock).not.toHaveBeenCalled();
    });

    it("rechaza igual si la creación choca con el índice único (carrera entre dos altas simultáneas)", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorUsuarioMock.mockResolvedValue(null);
      crearUsuarioRepoMock.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        }),
      );

      const resultado = await crearUsuario(inputValido);

      expect(resultado).toEqual({
        ok: false,
        error: "Ya existe un usuario con ese nombre de usuario.",
      });
      expect(crearAuditLogMock).not.toHaveBeenCalled();
    });
  });

  describe("editarUsuario", () => {
    it("actualiza nombre/celular/email y captura estadoAntes/estadoDespues en AuditLog", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorIdMock.mockResolvedValue({
        id: USUARIO_1_ID,
        nombre: "Nombre Viejo",
        celular: "999999999",
        email: null,
      });
      actualizarUsuarioMock.mockResolvedValue({
        id: USUARIO_1_ID,
        nombre: "Nombre Nuevo",
        celular: "988888888",
        email: null,
      });

      const resultado = await editarUsuario({
        usuarioId: USUARIO_1_ID,
        nombre: "Nombre Nuevo",
        celular: "988888888",
        email: "",
        password: "",
      });

      expect(resultado).toEqual({ ok: true, data: { id: USUARIO_1_ID } });
      expect(bcryptHashMock).not.toHaveBeenCalled();
      expect(actualizarUsuarioMock).toHaveBeenCalledWith(USUARIO_1_ID, {
        nombre: "Nombre Nuevo",
        celular: "988888888",
        email: undefined,
        passwordHash: undefined,
      });
    });

    it("hashea y pasa passwordHash solo si el Gerente completa un reseteo", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorIdMock.mockResolvedValue({
        id: USUARIO_1_ID,
        nombre: "Nombre",
        celular: null,
        email: null,
      });
      actualizarUsuarioMock.mockResolvedValue({
        id: USUARIO_1_ID,
        nombre: "Nombre",
        celular: null,
        email: null,
      });

      await editarUsuario({
        usuarioId: USUARIO_1_ID,
        nombre: "Nombre",
        celular: "",
        email: "",
        password: "NuevaClave123",
      });

      expect(bcryptHashMock).toHaveBeenCalledWith("NuevaClave123", 12);
      expect(actualizarUsuarioMock).toHaveBeenCalledWith(
        USUARIO_1_ID,
        expect.objectContaining({ passwordHash: "hash-simulado" }),
      );
    });

    it("rechaza si el usuario objetivo no existe", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorIdMock.mockResolvedValue(null);

      const resultado = await editarUsuario({
        usuarioId: USUARIO_INEXISTENTE_ID,
        nombre: "X",
        celular: "",
        email: "",
        password: "",
      });

      expect(resultado).toEqual({ ok: false, error: "El usuario no existe." });
      expect(actualizarUsuarioMock).not.toHaveBeenCalled();
    });
  });

  describe("cambiarEstadoUsuarioAction", () => {
    it("desactiva un usuario y revoca sus sesiones en la misma transacción", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorIdMock.mockResolvedValue({
        id: USUARIO_2_ID,
        rol: "OPERARIO",
        estado: "ACTIVO",
      });
      contarGerentesActivosMock.mockResolvedValue(2);
      desactivarUsuarioYRevocarSesionesMock.mockResolvedValue([
        { id: USUARIO_2_ID, estado: "INACTIVO" },
        { count: 1 },
      ]);

      const resultado = await cambiarEstadoUsuarioAction({
        usuarioId: USUARIO_2_ID,
        estado: "INACTIVO",
      });

      expect(resultado).toEqual({ ok: true, data: { id: USUARIO_2_ID, estado: "INACTIVO" } });
      expect(desactivarUsuarioYRevocarSesionesMock).toHaveBeenCalledWith(
        USUARIO_2_ID,
        expect.any(Date),
      );
    });

    it("bloquea la autodesactivación antes de tocar la base de datos", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorIdMock.mockResolvedValue({
        id: GERENTE_1_ID,
        rol: "GERENTE",
        estado: "ACTIVO",
      });
      contarGerentesActivosMock.mockResolvedValue(3);

      const resultado = await cambiarEstadoUsuarioAction({
        usuarioId: GERENTE_1_ID,
        estado: "INACTIVO",
      });

      expect(resultado).toEqual({
        ok: false,
        error: "No podés desactivar tu propio usuario.",
      });
      expect(desactivarUsuarioYRevocarSesionesMock).not.toHaveBeenCalled();
    });

    it("bloquea desactivar al último Gerente activo", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorIdMock.mockResolvedValue({
        id: GERENTE_2_ID,
        rol: "GERENTE",
        estado: "ACTIVO",
      });
      contarGerentesActivosMock.mockResolvedValue(1);

      const resultado = await cambiarEstadoUsuarioAction({
        usuarioId: GERENTE_2_ID,
        estado: "INACTIVO",
      });

      expect(resultado).toEqual({
        ok: false,
        error: "Debe quedar al menos un Gerente activo.",
      });
      expect(desactivarUsuarioYRevocarSesionesMock).not.toHaveBeenCalled();
    });

    it("reactiva sin pasar por la guard de desactivación ni revocar sesiones", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorIdMock.mockResolvedValue({
        id: USUARIO_3_ID,
        rol: "OPERARIO",
        estado: "INACTIVO",
      });
      cambiarEstadoUsuarioMock.mockResolvedValue({ id: USUARIO_3_ID, estado: "ACTIVO" });

      const resultado = await cambiarEstadoUsuarioAction({
        usuarioId: USUARIO_3_ID,
        estado: "ACTIVO",
      });

      expect(resultado).toEqual({ ok: true, data: { id: USUARIO_3_ID, estado: "ACTIVO" } });
      expect(cambiarEstadoUsuarioMock).toHaveBeenCalledWith(USUARIO_3_ID, "ACTIVO");
      expect(desactivarUsuarioYRevocarSesionesMock).not.toHaveBeenCalled();
    });

    it("es no-op (sin tocar la base) si ya está en el estado pedido", async () => {
      authMock.mockResolvedValue(sessionGerente());
      buscarSesionPorJtiMock.mockResolvedValue(sesionValida());
      buscarUsuarioPorIdMock.mockResolvedValue({
        id: USUARIO_4_ID,
        rol: "OPERARIO",
        estado: "ACTIVO",
      });

      const resultado = await cambiarEstadoUsuarioAction({
        usuarioId: USUARIO_4_ID,
        estado: "ACTIVO",
      });

      expect(resultado).toEqual({ ok: true, data: { id: USUARIO_4_ID, estado: "ACTIVO" } });
      expect(cambiarEstadoUsuarioMock).not.toHaveBeenCalled();
      expect(desactivarUsuarioYRevocarSesionesMock).not.toHaveBeenCalled();
    });
  });
});
